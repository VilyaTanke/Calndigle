/* =====================================================
   RESERVAS.JS — Public reservations view
   Real-time list of all bookings, grouped by date
   ===================================================== */
'use strict';

// ════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════
let allReservations = [];

// ════════════════════════════════════════════
// DOM REFERENCES
// ════════════════════════════════════════════
const reservasList  = document.getElementById('reservas-list');
const filterNameEl  = document.getElementById('filter-name');
const filterDateEl  = document.getElementById('filter-date');
const clearFilters  = document.getElementById('clear-filters');
const totalCountEl  = document.getElementById('total-count');
const statTotal     = document.getElementById('stat-total');
const statDatesWith = document.getElementById('stat-dates-with');

// ════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════
const MONTHS_ES  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DAYNAMES   = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

function strToDisplayDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${DAYNAMES[dt.getDay()]}, ${d} de ${MONTHS_ES[m - 1]} de ${y}`;
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    .replace(/'/g,'&#039;');
}

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

// ════════════════════════════════════════════
// FIRESTORE LISTENERS
// ════════════════════════════════════════════

// Load settings (for nav title)
db.collection('settings').doc('main').get().then(doc => {
  if (!doc.exists) return;
  const data = doc.data();
  if (data.calendarTitle) {
    document.title = `Reservas — ${data.calendarTitle}`;
    const navTitle = document.getElementById('nav-title');
    if (navTitle) navTitle.textContent = data.calendarTitle;
  }
}).catch(() => {/* ignore */});

// Real-time reservations listener
db.collection('reservas')
  .onSnapshot(snapshot => {
    allReservations = [];
    snapshot.forEach(doc => {
      allReservations.push({ id: doc.id, ...doc.data() });
    });
    allReservations.sort((a, b) => {
      const dateCmp = (a.fecha || '').localeCompare(b.fecha || '');
      if (dateCmp !== 0) return dateCmp;
      return (a.hora || '').localeCompare(b.hora || '');
    });
    updateStats();
    renderReservations();
  }, err => {
    console.error('Error loading reservations:', err);
    if (reservasList) {
      reservasList.innerHTML = `
        <div class="empty-state">
          <div class="es-icon">⚠️</div>
          <div class="es-title">Error al cargar</div>
          <div class="es-body">No se pudieron cargar las reservas. Comprueba la configuración de Firebase.</div>
        </div>
      `;
    }
  });

// ════════════════════════════════════════════
// STATS
// ════════════════════════════════════════════
function updateStats() {
  const total = allReservations.length;
  const uniqueDates = new Set(allReservations.map(r => r.fecha)).size;

  if (statTotal) statTotal.textContent = total;
  if (statDatesWith) statDatesWith.textContent = uniqueDates;
}

// ════════════════════════════════════════════
// CONSECUTIVE SLOT GROUPING
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
// RENDER
// ════════════════════════════════════════════
function renderReservations() {
  const nameFilter = (filterNameEl?.value || '').toLowerCase().trim();
  const dateFilter = filterDateEl?.value || '';

  const filtered = allReservations.filter(r => {
    if (nameFilter && !(r.nombre || '').toLowerCase().includes(nameFilter)) return false;
    if (dateFilter && r.fecha !== dateFilter) return false;
    return true;
  });

  if (!reservasList) return;

  if (allReservations.length === 0) {
    reservasList.innerHTML = `
      <div class="empty-state">
        <div class="es-icon">📭</div>
        <div class="es-title">Aún no hay reservas</div>
        <div class="es-body">Cuando los participantes se inscriban, aparecerán aquí en tiempo real.</div>
      </div>
    `;
    if (totalCountEl) totalCountEl.textContent = '0 reservas';
    return;
  }

  if (filtered.length === 0) {
    reservasList.innerHTML = `
      <div class="empty-state">
        <div class="es-icon">🔍</div>
        <div class="es-title">Sin resultados</div>
        <div class="es-body">No hay reservas que coincidan con los filtros aplicados.</div>
      </div>
    `;
    if (totalCountEl) totalCountEl.textContent = '0 reservas';
    return;
  }

  // Group by date
  const byDate = {};
  filtered.forEach(r => {
    if (!byDate[r.fecha]) byDate[r.fecha] = [];
    byDate[r.fecha].push(r);
  });

  let grandTotalBlocks = 0;

  reservasList.innerHTML = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, items]) => {
      const groupedBlocks = groupReservationsByConsecutive(items);
      grandTotalBlocks += groupedBlocks.length;

      return `
        <div class="date-group">
          <div class="date-group-header">
            <h2 class="date-group-title">${strToDisplayDate(fecha)}</h2>
            <span class="badge badge-accent">${groupedBlocks.length} reserva${groupedBlocks.length !== 1 ? 's' : ''}</span>
          </div>
          <div class="reservations-grid">
            ${groupedBlocks.map(block => `
              <div class="reservation-card">
                <div class="reservation-time">${escHtml(block.horaDisplay)}</div>
                <div class="reservation-name">${escHtml(block.nombre)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');

  // Update count label
  if (totalCountEl) {
    totalCountEl.textContent = `${grandTotalBlocks} reserva${grandTotalBlocks !== 1 ? 's' : ''}`;
  }
}

// ════════════════════════════════════════════
// FILTER EVENTS
// ════════════════════════════════════════════
if (filterNameEl) filterNameEl.addEventListener('input', renderReservations);
if (filterDateEl) filterDateEl.addEventListener('change', renderReservations);

if (clearFilters) {
  clearFilters.addEventListener('click', () => {
    if (filterNameEl) filterNameEl.value = '';
    if (filterDateEl) filterDateEl.value = '';
    renderReservations();
  });
}
