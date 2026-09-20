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
  .orderBy('fecha')
  .orderBy('hora')
  .onSnapshot(snapshot => {
    allReservations = [];
    snapshot.forEach(doc => {
      allReservations.push({ id: doc.id, ...doc.data() });
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

  // Update count label
  if (totalCountEl) {
    totalCountEl.textContent = `${filtered.length} reserva${filtered.length !== 1 ? 's' : ''}`;
  }

  if (!reservasList) return;

  if (allReservations.length === 0) {
    reservasList.innerHTML = `
      <div class="empty-state">
        <div class="es-icon">📭</div>
        <div class="es-title">Aún no hay reservas</div>
        <div class="es-body">Cuando los participantes se inscriban, aparecerán aquí en tiempo real.</div>
      </div>
    `;
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
    return;
  }

  // Group by date
  const byDate = {};
  filtered.forEach(r => {
    if (!byDate[r.fecha]) byDate[r.fecha] = [];
    byDate[r.fecha].push(r);
  });

  reservasList.innerHTML = Object.entries(byDate)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([fecha, items]) => {
      const sorted = items.slice().sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));
      return `
        <div class="date-group">
          <div class="date-group-header">
            <h2 class="date-group-title">${strToDisplayDate(fecha)}</h2>
            <span class="badge badge-accent">${items.length} reserva${items.length !== 1 ? 's' : ''}</span>
          </div>
          <div class="reservations-grid">
            ${sorted.map(r => `
              <div class="reservation-card">
                <div class="reservation-time">${escHtml(r.hora)}</div>
                <div class="reservation-name">${escHtml(r.nombre)}</div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }).join('');
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
