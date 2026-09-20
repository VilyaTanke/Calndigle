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
// ADD DATE FORM
// ════════════════════════════════════════════
if (addDateForm) {
  addDateForm.addEventListener('submit', async e => {
    e.preventDefault();
    hideError(formError);

    const fecha    = dateInput?.value || '';
    const rawSlots = slotsInput?.value.trim() || '';

    if (!fecha)    { showError(formError, 'Selecciona una fecha'); return; }
    if (!rawSlots) { showError(formError, 'Introduce al menos un horario'); return; }

    const slots = parseSlots(rawSlots);
    if (slots.length === 0) {
      showError(formError, 'No se pudieron interpretar los horarios. Ejemplo: "09:00, 10:00" o "09:00-12:00"');
      return;
    }

    setLoading(addDateBtn, true, 'Guardando...');

    try {
      const existing = managedDates.find(d => d.fecha === fecha);

      if (existing) {
        // Merge slots (union)
        const merged = [...new Set([...(existing.slots || []), ...slots])].sort();
        await db.collection('fechas').doc(existing.id).update({
          slots:  merged,
          activa: true
        });
        showToast(`Horarios añadidos a ${fecha}`, 'success');
      } else {
        await db.collection('fechas').add({
          fecha,
          slots,
          activa:    true,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        showToast(`Fecha ${fecha} añadida con ${slots.length} horario(s)`, 'success');
      }

      addDateForm.reset();

    } catch (err) {
      console.error(err);
      showError(formError, 'Error al guardar: ' + (err.message || err.code));
    } finally {
      setLoading(addDateBtn, false, 'Añadir fecha');
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
// ADMIN RESERVATIONS VIEW
// ════════════════════════════════════════════
function renderAdminReservations() {
  if (!adminReservasList) return;
  if (adminReservasCount) {
    adminReservasCount.textContent = `${allAdminReservations.length} reserva${allAdminReservations.length !== 1 ? 's' : ''}`;
  }

  if (allAdminReservations.length === 0) {
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

  adminReservasList.innerHTML = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, items]) => {
      const sorted = items.slice().sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));
      return `
        <div class="admin-date-group">
          <div class="admin-date-group-header">
            <h3 class="font-mono" style="font-size:0.95rem">${escHtml(fecha)}</h3>
            <span class="badge badge-accent">${items.length} reserva${items.length !== 1 ? 's' : ''}</span>
          </div>
          ${sorted.map(r => `
            <div class="admin-slot-row">
              <span class="admin-slot-time">${escHtml(r.hora)}</span>
              <span class="admin-slot-name">${escHtml(r.nombre)}</span>
              <button class="btn btn-danger btn-sm"
                onclick="adminDeleteReservation('${r.id}','${escHtml(r.nombre)}','${escHtml(r.fecha)}','${escHtml(r.hora)}')"
                title="Eliminar reserva">✕</button>
            </div>
          `).join('')}
        </div>
      `;
    }).join('');
}

window.adminDeleteReservation = async function(id, nombre, fecha, hora) {
  if (!confirm(`¿Eliminar la reserva de ${nombre} (${fecha} — ${hora})?`)) return;
  try {
    await db.collection('reservas').doc(id).delete();
    showToast(`Reserva de ${nombre} eliminada`, 'success');
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
