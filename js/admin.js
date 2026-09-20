/* =====================================================
   ADMIN.JS — Admin panel logic
   Handles: Firebase Auth login/logout,
            date & slot management, reservation management,
            settings, real-time Firestore sync
   ===================================================== */
'use strict';

// ════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════
let managedDates        = [];   // All fecha docs from Firestore
let allAdminReservations = [];  // All reservation docs

// ════════════════════════════════════════════
// DOM REFERENCES
// ════════════════════════════════════════════
const loginSection    = document.getElementById('login-section');
const dashboardSection= document.getElementById('dashboard-section');

// Login
const loginEmail      = document.getElementById('login-email');
const loginPassword   = document.getElementById('login-password');
const loginBtn        = document.getElementById('login-btn');
const loginError      = document.getElementById('login-error');

// Dashboard
const logoutBtn       = document.getElementById('logout-btn');
const adminEmailEl    = document.getElementById('admin-email-display');
const navTitleAdmin   = document.getElementById('nav-title-admin');

// Stats
const statDates       = document.getElementById('stat-dates');
const statTotalSlots  = document.getElementById('stat-total-slots');
const statReservations= document.getElementById('stat-reservations');
const statAvailable   = document.getElementById('stat-available');

// Tabs
const tabBtns         = document.querySelectorAll('.tab-btn');
const tabPanels       = document.querySelectorAll('.tab-panel');

// Dates tab
const addDateForm     = document.getElementById('add-date-form');
const dateInput       = document.getElementById('date-input');
const slotsInput      = document.getElementById('slots-input');
const addDateBtn      = document.getElementById('add-date-btn');
const formError       = document.getElementById('form-error');
const datesTableBody  = document.getElementById('dates-table-body');
const datesCountEl    = document.getElementById('dates-count');

// Reservas tab
const adminReservasList   = document.getElementById('admin-reservas-list');
const adminReservasCount  = document.getElementById('admin-reservas-count');

// Settings tab
const settingsForm        = document.getElementById('settings-form');
const settingTitle        = document.getElementById('setting-title');
const settingDescription  = document.getElementById('setting-description');
const settingsError       = document.getElementById('settings-error');
const settingsSubmitBtn   = document.getElementById('settings-submit-btn');

// ════════════════════════════════════════════
// TOAST
// ════════════════════════════════════════════
function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('toast-exit');
    setTimeout(() => el.remove(), 500);
  }, 3500);
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');
}

// ════════════════════════════════════════════
// AUTH
// ════════════════════════════════════════════
auth.onAuthStateChanged(user => {
  if (user) {
    loginSection.classList.add('hidden');
    dashboardSection.classList.remove('hidden');
    if (adminEmailEl) adminEmailEl.textContent = user.email;
    initDashboard();
  } else {
    loginSection.classList.remove('hidden');
    dashboardSection.classList.add('hidden');
  }
});

// Login
if (loginBtn) {
  loginBtn.addEventListener('click', async () => {
    const email = (loginEmail?.value || '').trim();
    const pwd   = loginPassword?.value || '';

    if (!email || !pwd) {
      showError(loginError, 'Rellena el correo y la contraseña');
      return;
    }

    setLoading(loginBtn, true, 'Accediendo...');
    hideError(loginError);

    try {
      await auth.signInWithEmailAndPassword(email, pwd);
    } catch (err) {
      showError(loginError, authErrMsg(err.code));
      setLoading(loginBtn, false, 'Acceder al panel');
    }
  });

  // Allow Enter key in password field
  if (loginPassword) {
    loginPassword.addEventListener('keydown', e => {
      if (e.key === 'Enter') loginBtn.click();
    });
  }
}

// Logout
if (logoutBtn) {
  logoutBtn.addEventListener('click', () => auth.signOut());
}

function authErrMsg(code) {
  const map = {
    'auth/invalid-email':      'El correo electrónico no es válido.',
    'auth/user-not-found':     'No existe cuenta con este correo.',
    'auth/wrong-password':     'Contraseña incorrecta.',
    'auth/too-many-requests':  'Demasiados intentos. Espera unos minutos.',
    'auth/invalid-credential': 'Credenciales incorrectas. Verifica email y contraseña.',
    'auth/user-disabled':      'Esta cuenta ha sido desactivada.',
  };
  return map[code] || 'Error al iniciar sesión. Verifica tus credenciales.';
}

// ════════════════════════════════════════════
// DASHBOARD INIT
// ════════════════════════════════════════════
let datesUnsubscribe      = null;
let reservasUnsubscribe   = null;

function initDashboard() {
  // Load calendar title for nav
  db.collection('settings').doc('main').get().then(doc => {
    if (doc.exists) {
      const d = doc.data();
      if (d.calendarTitle && navTitleAdmin) navTitleAdmin.textContent = d.calendarTitle;
      if (settingTitle) settingTitle.value = d.calendarTitle || '';
      if (settingDescription) settingDescription.value = d.description || '';
    }
  });

  // Real-time dates listener
  if (datesUnsubscribe) datesUnsubscribe();
  datesUnsubscribe = db.collection('fechas').orderBy('fecha').onSnapshot(snap => {
    managedDates = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    updateStats();
    renderDatesTable();
  }, err => console.error('Dates error:', err));

  // Real-time reservations listener
  if (reservasUnsubscribe) reservasUnsubscribe();
  reservasUnsubscribe = db.collection('reservas')
    .onSnapshot(snap => {
      allAdminReservations = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      allAdminReservations.sort((a, b) => {
        const dateCmp = (a.fecha || '').localeCompare(b.fecha || '');
        if (dateCmp !== 0) return dateCmp;
        return (a.hora || '').localeCompare(b.hora || '');
      });
      updateStats();
      renderAdminReservations();
    }, err => console.error('Reservations error:', err));
}

// ════════════════════════════════════════════
// STATS
// ════════════════════════════════════════════
function updateStats() {
  const activeDates   = managedDates.filter(d => d.activa !== false).length;
  const totalSlots    = managedDates.reduce((sum, d) => sum + (d.slots || []).length, 0);
  const totalRes      = allAdminReservations.length;
  const freeSlots     = Math.max(0, totalSlots - totalRes);

  if (statDates)        statDates.textContent        = activeDates;
  if (statTotalSlots)   statTotalSlots.textContent   = totalSlots;
  if (statReservations) statReservations.textContent = totalRes;
  if (statAvailable)    statAvailable.textContent    = freeSlots;
}

// ════════════════════════════════════════════
// TABS
// ════════════════════════════════════════════
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    tabBtns.forEach(b => b.classList.remove('active'));
    tabPanels.forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const panel = document.getElementById(`tab-${tab}`);
    if (panel) panel.classList.add('active');
  });
});

// ════════════════════════════════════════════
// SLOT PARSING
// Supports:
//   "09:00, 10:00, 11:00"
//   "09:00-12:00"  (generates 09:00, 10:00, 11:00, 12:00)
//   "9, 10, 11"    (assumes :00 minutes)
// ════════════════════════════════════════════
function parseSlots(raw) {
  const parts = raw.split(/[\s,;]+/).filter(Boolean);
  const result = new Set();

  parts.forEach(part => {
    part = part.trim();

    if (part.includes('-')) {
      // Range: "09:00-12:00"
      const [startStr, endStr] = part.split('-');
      const start = parseTime(startStr);
      const end   = parseTime(endStr);
      if (start !== null && end !== null) {
        let mins = start;
        while (mins <= end) {
          result.add(minsToTime(mins));
          mins += 60; // 1-hour intervals
        }
      }
    } else {
      const t = parseTime(part);
      if (t !== null) result.add(minsToTime(t));
    }
  });

  return [...result].sort();
}

function parseTime(str) {
  if (!str) return null;
  str = str.trim();
  if (/^\d{1,2}$/.test(str)) {
    const h = parseInt(str);
    if (h >= 0 && h <= 23) return h * 60;
    return null;
  }
  const m = str.match(/^(\d{1,2}):(\d{2})$/);
  if (m) {
    const h = parseInt(m[1]), min = parseInt(m[2]);
    if (h >= 0 && h <= 23 && min >= 0 && min <= 59) return h * 60 + min;
  }
  return null;
}

function minsToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ════════════════════════════════════════════
// PRESETS
// ════════════════════════════════════════════
document.querySelectorAll('.preset-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (slotsInput) {
      slotsInput.value = btn.dataset.preset;
      slotsInput.focus();
    }
  });
});

// ════════════════════════════════════════════
// MODE TOGGLE & ADD DATE FORM
// ════════════════════════════════════════════
let isBulkMode = false;
const modeSingleBtn    = document.getElementById('mode-single-btn');
const modeBulkBtn      = document.getElementById('mode-bulk-btn');
const singleDateFields = document.getElementById('single-date-fields');
const bulkDateFields   = document.getElementById('bulk-date-fields');
const addDateBtnLabel  = document.getElementById('add-date-btn-label');
const dateStartInput   = document.getElementById('date-start-input');
const dateEndInput     = document.getElementById('date-end-input');

if (modeSingleBtn && modeBulkBtn) {
  modeSingleBtn.addEventListener('click', () => setDateMode(false));
  modeBulkBtn.addEventListener('click', () => setDateMode(true));
}

function setDateMode(bulk) {
  isBulkMode = bulk;
  if (bulk) {
    modeSingleBtn.classList.remove('active');
    modeBulkBtn.classList.add('active');
    singleDateFields.classList.add('hidden');
    bulkDateFields.classList.remove('hidden');
    if (addDateBtnLabel) addDateBtnLabel.textContent = '⚡ Añadir fechas masivamente';
    if (dateInput) dateInput.removeAttribute('required');
  } else {
    modeSingleBtn.classList.add('active');
    modeBulkBtn.classList.remove('active');
    singleDateFields.classList.remove('hidden');
    bulkDateFields.classList.add('hidden');
    if (addDateBtnLabel) addDateBtnLabel.textContent = 'Añadir fecha';
    if (dateInput) dateInput.setAttribute('required', 'true');
  }
}

if (addDateForm) {
  addDateForm.addEventListener('submit', async e => {
    e.preventDefault();
    hideError(formError);

    const rawSlots = slotsInput?.value.trim() || '';
    if (!rawSlots) { showError(formError, 'Introduce al menos un horario'); return; }

    const slots = parseSlots(rawSlots);
    if (slots.length === 0) {
      showError(formError, 'No se pudieron interpretar los horarios. Ejemplo: "09:00, 10:00" o "09:00-12:00"');
      return;
    }

    let targetDates = [];

    if (!isBulkMode) {
      const fecha = dateInput?.value || '';
      if (!fecha) { showError(formError, 'Selecciona una fecha'); return; }
      targetDates = [fecha];
    } else {
      const startStr = dateStartInput?.value || '';
      const endStr   = dateEndInput?.value || '';
      if (!startStr || !endStr) {
        showError(formError, 'Selecciona la fecha de inicio y la fecha de fin');
        return;
      }
      if (startStr > endStr) {
        showError(formError, 'La fecha de inicio debe ser anterior o igual a la fecha de fin');
        return;
      }

      const checkedDays = Array.from(document.querySelectorAll('.day-cb:checked')).map(cb => parseInt(cb.value));
      if (checkedDays.length === 0) {
        showError(formError, 'Selecciona al menos un día de la semana');
        return;
      }

      targetDates = [];
      const cur = new Date(startStr + 'T00:00:00');
      const end = new Date(endStr + 'T00:00:00');

      while (cur <= end) {
        const dayOfWeek = cur.getDay(); // 0=Sun, 1=Mon...
        if (checkedDays.includes(dayOfWeek)) {
          const yyyy = cur.getFullYear();
          const mm = String(cur.getMonth() + 1).padStart(2, '0');
          const dd = String(cur.getDate()).padStart(2, '0');
          targetDates.push(`${yyyy}-${mm}-${dd}`);
        }
        cur.setDate(cur.getDate() + 1);
      }

      if (targetDates.length === 0) {
        showError(formError, 'No hay fechas que coincidan con los días seleccionados en ese rango');
        return;
      }
    }

    setLoading(addDateBtn, true, isBulkMode ? 'Guardando masivamente...' : 'Guardando...');

    try {
      const batch = db.batch();
      let updatedCount = 0;
      let createdCount = 0;

      targetDates.forEach(fecha => {
        const existing = managedDates.find(d => d.fecha === fecha);
        if (existing) {
          const merged = [...new Set([...(existing.slots || []), ...slots])].sort();
          const ref = db.collection('fechas').doc(existing.id);
          batch.update(ref, { slots: merged, activa: true });
          updatedCount++;
        } else {
          const ref = db.collection('fechas').doc();
          batch.set(ref, {
            fecha: fecha,
            slots: slots,
            activa: true,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          createdCount++;
        }
      });

      await batch.commit();

      if (isBulkMode) {
        showToast(`✓ Operación masiva: ${targetDates.length} fecha(s) procesada(s) (${createdCount} creadas, ${updatedCount} actualizadas)`, 'success');
      } else {
        showToast(`Fecha ${targetDates[0]} guardada con éxito`, 'success');
      }

      if (dateInput) dateInput.value = '';
      if (dateStartInput) dateStartInput.value = '';
      if (dateEndInput) dateEndInput.value = '';
      if (slotsInput) slotsInput.value = '';

    } catch (err) {
      console.error(err);
      showError(formError, 'Error al guardar: ' + (err.message || err.code));
    } finally {
      setLoading(addDateBtn, false, isBulkMode ? '⚡ Añadir fechas masivamente' : 'Añadir fecha');
    }
  });
}

// ════════════════════════════════════════════
// DATES TABLE RENDERING
// ════════════════════════════════════════════
function renderDatesTable() {
  if (!datesTableBody) return;

  const sorted = managedDates.slice().sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''));

  if (datesCountEl) datesCountEl.textContent = `${sorted.length} fechas`;

  if (sorted.length === 0) {
    datesTableBody.innerHTML = '<tr><td colspan="4" class="empty-row">No hay fechas configuradas</td></tr>';
    return;
  }

  datesTableBody.innerHTML = sorted.map(d => {
    const reservaCount = allAdminReservations.filter(r => r.fecha === d.fecha).length;
    const totalSlots   = (d.slots || []).length;
    const badgeClass   = reservaCount === totalSlots ? 'badge-danger'
                       : reservaCount > 0            ? 'badge-amber'
                       :                              'badge-success';

    const slotBadges = (d.slots || []).slice(0, 6)
      .map(s => `<span class="badge badge-accent">${escHtml(s)}</span>`)
      .join('');
    const more = (d.slots || []).length > 6
      ? `<span class="badge badge-neutral">+${(d.slots || []).length - 6}</span>`
      : '';

    const activeToggleLabel = d.activa !== false ? 'Desactivar' : 'Activar';
    const activeToggleClass = d.activa !== false ? 'btn-ghost' : 'btn-amber';

    return `
      <tr class="${d.activa === false ? 'inactive-row' : ''}">
        <td class="font-mono" style="font-size:0.875rem">${escHtml(d.fecha)}</td>
        <td>
          <div class="slots-preview">
            ${slotBadges}${more}
          </div>
        </td>
        <td>
          <span class="badge ${badgeClass}">${reservaCount}/${totalSlots}</span>
        </td>
        <td>
          <div class="table-actions">
            <button class="btn btn-secondary btn-sm"
              onclick="adminEditDate('${d.id}','${escHtml(d.fecha)}')">Editar</button>
            <button class="btn ${activeToggleClass} btn-sm"
              onclick="adminToggleDate('${d.id}', ${d.activa !== false})">${activeToggleLabel}</button>
            <button class="btn btn-danger btn-sm"
              onclick="adminDeleteDate('${d.id}','${escHtml(d.fecha)}')">Eliminar</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Edit date slots
window.adminEditDate = async function(id, fecha) {
  const d = managedDates.find(x => x.id === id);
  if (!d) return;

  const currentSlots = (d.slots || []).join(', ');
  const input = prompt(
    `Editar horarios de ${fecha}\n\nActuales: ${currentSlots}\n\nNuevos horarios (ej: 09:00, 10:00 o rango 09:00-12:00):`,
    currentSlots
  );
  if (input === null) return;  // Cancelled

  const newSlots = parseSlots(input);
  if (newSlots.length === 0) {
    showToast('No se pudieron interpretar los horarios', 'error');
    return;
  }

  try {
    await db.collection('fechas').doc(id).update({ slots: newSlots });
    showToast(`Horarios de ${fecha} actualizados`, 'success');
  } catch (err) {
    showToast('Error al actualizar: ' + err.message, 'error');
  }
};

// Toggle active state
window.adminToggleDate = async function(id, currentlyActive) {
  try {
    await db.collection('fechas').doc(id).update({ activa: !currentlyActive });
    showToast(currentlyActive ? 'Fecha desactivada' : 'Fecha activada', 'info');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
};

// Delete date
window.adminDeleteDate = async function(id, fecha) {
  const resCount = allAdminReservations.filter(r => r.fecha === fecha).length;
  let msg = `¿Eliminar la fecha ${fecha}?`;
  if (resCount > 0) {
    msg += `\n\n⚠️  Esta fecha tiene ${resCount} reserva(s) activa(s).\nLas reservas NO se eliminarán automáticamente.`;
  }
  if (!confirm(msg)) return;

  try {
    await db.collection('fechas').doc(id).delete();
    showToast(`Fecha ${fecha} eliminada`, 'success');
  } catch (err) {
    showToast('Error al eliminar: ' + err.message, 'error');
  }
};

// ════════════════════════════════════════════
// CONSECUTIVE SLOT GROUPING (ADMIN)
// ════════════════════════════════════════════
function parseTimeMins(str) {
  if (!str) return 0;
  const m = str.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (m) return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
  const hOnly = str.trim().match(/^(\d{1,2})$/);
  if (hOnly) return parseInt(hOnly[1], 10) * 60;
  return 0;
}

function minsToTimeStr(mins) {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function parseSlotRange(horaStr) {
  if (!horaStr) return { startMins: 0, endMins: 60 };
  if (horaStr.includes('-')) {
    const parts = horaStr.split('-');
    const startMins = parseTimeMins(parts[0]);
    const endMins   = parseTimeMins(parts[1]);
    return { startMins, endMins: endMins > startMins ? endMins : startMins + 60 };
  }
  const startMins = parseTimeMins(horaStr);
  return { startMins, endMins: startMins + 60 };
}

function groupReservationsByConsecutive(items) {
  const byName = {};
  items.forEach(r => {
    const name = r.nombre || 'Sin nombre';
    if (!byName[name]) byName[name] = [];
    const times = parseSlotRange(r.hora);
    byName[name].push({
      ...r,
      startMins: times.startMins,
      endMins:   times.endMins
    });
  });

  const mergedBlocks = [];

  Object.values(byName).forEach(userItems => {
    userItems.sort((a, b) => a.startMins - b.startMins);

    let currentBlock = null;

    userItems.forEach(item => {
      if (!currentBlock) {
        currentBlock = {
          nombre:    item.nombre,
          fecha:     item.fecha,
          startMins: item.startMins,
          endMins:   item.endMins,
          slots:     [item.hora],
          ids:       [item.id]
        };
      } else {
        if (item.startMins <= currentBlock.endMins) {
          currentBlock.endMins = Math.max(currentBlock.endMins, item.endMins);
          currentBlock.slots.push(item.hora);
          currentBlock.ids.push(item.id);
        } else {
          mergedBlocks.push(currentBlock);
          currentBlock = {
            nombre:    item.nombre,
            fecha:     item.fecha,
            startMins: item.startMins,
            endMins:   item.endMins,
            slots:     [item.hora],
            ids:       [item.id]
          };
        }
      }
    });

    if (currentBlock) {
      mergedBlocks.push(currentBlock);
    }
  });

  const result = mergedBlocks.map(block => {
    let timeLabel = '';
    if (block.slots.length === 1) {
      timeLabel = block.slots[0];
    } else {
      const startStr = minsToTimeStr(block.startMins);
      const endStr   = minsToTimeStr(block.endMins);
      timeLabel = `${startStr} - ${endStr}`;
    }
    return {
      ...block,
      horaDisplay: timeLabel
    };
  });

  result.sort((a, b) => a.startMins - b.startMins);
  return result;
}

// ════════════════════════════════════════════
// ADMIN RESERVATIONS VIEW
// ════════════════════════════════════════════
function renderAdminReservations() {
  if (!adminReservasList) return;

  if (allAdminReservations.length === 0) {
    if (adminReservasCount) adminReservasCount.textContent = '0 reservas';
    adminReservasList.innerHTML = `
      <div class="empty-state">
        <div class="es-icon">📭</div>
        <div class="es-title">Sin reservas</div>
        <div class="es-body">Cuando los participantes se inscriban, aparecerán aquí.</div>
      </div>
    `;
    return;
  }

  // Group by date
  const byDate = {};
  allAdminReservations.forEach(r => {
    if (!byDate[r.fecha]) byDate[r.fecha] = [];
    byDate[r.fecha].push(r);
  });

  let grandTotalBlocks = 0;

  adminReservasList.innerHTML = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, items]) => {
      const grouped = groupReservationsByConsecutive(items);
      grandTotalBlocks += grouped.length;

      return `
        <div class="admin-date-group">
          <div class="admin-date-group-header">
            <h3 class="font-mono" style="font-size:0.95rem">${escHtml(fecha)}</h3>
            <span class="badge badge-accent">${grouped.length} reserva${grouped.length !== 1 ? 's' : ''}</span>
          </div>
          ${grouped.map(block => `
            <div class="admin-slot-row">
              <span class="admin-slot-time">${escHtml(block.horaDisplay)}</span>
              <span class="admin-slot-name">${escHtml(block.nombre)}</span>
              <button class="btn btn-danger btn-sm"
                onclick="adminDeleteReservationGroup('${block.ids.join(',')}', '${escHtml(block.nombre)}', '${escHtml(fecha)}', '${escHtml(block.horaDisplay)}')"
                title="Eliminar reserva">✕</button>
            </div>
          `).join('')}
        </div>
      `;
    }).join('');

  if (adminReservasCount) {
    adminReservasCount.textContent = `${grandTotalBlocks} reserva${grandTotalBlocks !== 1 ? 's' : ''}`;
  }
}

window.adminDeleteReservationGroup = async function(idsStr, nombre, fecha, horaDisplay) {
  const ids = idsStr.split(',').filter(Boolean);
  if (!confirm(`¿Eliminar la reserva de ${nombre} (${fecha} — ${horaDisplay})?`)) return;

  try {
    const batch = db.batch();
    ids.forEach(id => {
      batch.delete(db.collection('reservas').doc(id));
    });
    await batch.commit();
    showToast(`Reserva de ${nombre} (${horaDisplay}) eliminada`, 'success');
  } catch (err) {
    showToast('Error al eliminar: ' + err.message, 'error');
  }
};

// ════════════════════════════════════════════
// SETTINGS
// ════════════════════════════════════════════
if (settingsForm) {
  settingsForm.addEventListener('submit', async e => {
    e.preventDefault();
    hideError(settingsError);

    const title = (settingTitle?.value || '').trim();
    const desc  = (settingDescription?.value || '').trim();

    if (!title) {
      showError(settingsError, 'El título es obligatorio');
      return;
    }

    setLoading(settingsSubmitBtn, true, 'Guardando...');

    try {
      await db.collection('settings').doc('main').set({
        calendarTitle: title,
        description:   desc,
        updatedAt:     firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      if (navTitleAdmin) navTitleAdmin.textContent = title;
      showToast('Configuración guardada correctamente', 'success');
    } catch (err) {
      showError(settingsError, 'Error al guardar: ' + err.message);
    } finally {
      setLoading(settingsSubmitBtn, false, 'Guardar configuración');
    }
  });
}

// ════════════════════════════════════════════
// UI HELPERS
// ════════════════════════════════════════════
function setLoading(btn, loading, label) {
  if (!btn) return;
  btn.disabled = loading;
  const labelEl = btn.querySelector('.btn-label');
  if (loading) {
    if (labelEl) labelEl.textContent = label;
    else btn.textContent = label;
    if (!btn.querySelector('.spin')) {
      const spin = document.createElement('span');
      spin.className = 'spin';
      btn.prepend(spin);
    }
  } else {
    const spin = btn.querySelector('.spin');
    if (spin) spin.remove();
    if (labelEl) labelEl.textContent = label;
    else btn.textContent = label;
  }
}

function showError(el, msg) {
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}

function hideError(el) {
  if (!el) return;
  el.classList.add('hidden');
  el.textContent = '';
}
