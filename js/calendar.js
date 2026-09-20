/* =====================================================
   CALENDAR.JS — Main calendar logic
   Handles: month grid, multi-date selection, slot rendering,
            registration modal, real-time Firestore sync
   ===================================================== */
'use strict';

// ════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════
let currentMonth     = new Date();        // Month currently displayed
let availableDates   = {};               // { "YYYY-MM-DD": { slots, activa, id } }
let reservationMap   = {};               // { "YYYY-MM-DD_HH:MM": [ { nombre, id }, ... ] }
let selectedDates    = new Set();        // Set of selected date strings ("YYYY-MM-DD")
let selectedSlots    = new Set();        // Set of selected slot times ("HH:MM")

// ════════════════════════════════════════════
// DOM REFERENCES
// ════════════════════════════════════════════
const calGrid          = document.getElementById('cal-grid');
const monthTitle       = document.getElementById('month-title');
const prevMonthBtn     = document.getElementById('prev-month');
const nextMonthBtn     = document.getElementById('next-month');

const slotsPanel       = document.getElementById('slots-panel');
const slotsPlaceholder = document.getElementById('slots-placeholder');
const slotsContent     = document.getElementById('slots-content');
const slotsGrid        = document.getElementById('slots-grid');
const selectedDateLbl  = document.getElementById('selected-date-label');
const slotsFooter      = document.getElementById('slots-footer');
const selectedCountEl  = document.getElementById('selected-count');
const confirmBtn       = document.getElementById('confirm-btn');
const clearDateBtn     = document.getElementById('clear-date-btn');

const regModal         = document.getElementById('registration-modal');
const modalClose       = document.getElementById('modal-close');
const modalCancel      = document.getElementById('modal-cancel');
const modalSubmit      = document.getElementById('modal-submit');
const nombreInput      = document.getElementById('nombre-input');
const summaryEl        = document.getElementById('reservation-summary');
const modalError       = document.getElementById('modal-error');

// ════════════════════════════════════════════
// CONSTANTS
// ════════════════════════════════════════════
const MONTHS_ES  = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DAYNAMES_ES = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

// ════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════
function dateToStr(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function strToDisplayDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${DAYNAMES_ES[dt.getDay()]}, ${d} de ${MONTHS_ES[m - 1]} de ${y}`;
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
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => {
    el.classList.add('toast-exit');
    el.addEventListener('animationend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 500);
  }, 3500);
}

// ════════════════════════════════════════════
// FIRESTORE LISTENERS
// ════════════════════════════════════════════

// Settings
db.collection('settings').doc('main').onSnapshot(doc => {
  if (!doc.exists) return;
  const data = doc.data();

  if (data.calendarTitle) {
    document.title = data.calendarTitle + ' — Reservar';
    const navTitle = document.getElementById('nav-title');
    if (navTitle) navTitle.textContent = data.calendarTitle;
    const h1 = document.getElementById('page-title');
    if (h1) {
      const words = data.calendarTitle.split(' ');
      // Last word gets accent color
      if (words.length > 1) {
        const last = words.pop();
        h1.innerHTML = words.join(' ') + ' <span class="hl">' + escHtml(last) + '</span>';
      } else {
        h1.textContent = data.calendarTitle;
      }
    }
  }

  if (data.description) {
    const desc = document.getElementById('page-description');
    if (desc) desc.textContent = data.description;
  }
});

// Available dates
db.collection('fechas').onSnapshot(snapshot => {
  availableDates = {};
  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.fecha && data.activa !== false) {
      availableDates[data.fecha] = {
        ...data,
        id: doc.id,
        slots: (data.slots || []).slice().sort()
      };
    }
  });

  // Remove selected dates that are no longer available
  selectedDates.forEach(d => {
    if (!availableDates[d]) selectedDates.delete(d);
  });

  renderCalendar();
  if (selectedDates.size > 0) {
    renderSlots();
  } else {
    clearDateSelection();
  }
});

// Reservations
db.collection('reservas').onSnapshot(snapshot => {
  reservationMap = {};
  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.fecha && data.hora) {
      const key = `${data.fecha}_${data.hora}`;
      if (!reservationMap[key]) reservationMap[key] = [];
      reservationMap[key].push({ nombre: data.nombre, id: doc.id });
    }
  });
  renderCalendar();
  if (selectedDates.size > 0) {
    renderSlots();
  }
});

// ════════════════════════════════════════════
// CALENDAR RENDERING
// ════════════════════════════════════════════
function renderCalendar() {
  const year  = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  monthTitle.textContent = `${MONTHS_ES[month]} ${year}`;
  calGrid.innerHTML = '';

  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  const today    = new Date(); today.setHours(0, 0, 0, 0);

  // Monday-first: getDay() returns 0=Sun, shift so Mon=0
  let startOffset = firstDay.getDay() - 1;
  if (startOffset < 0) startOffset = 6;

  // Empty cells before month starts
  for (let i = 0; i < startOffset; i++) {
    const empty = document.createElement('div');
    empty.className = 'cal-cell empty';
    calGrid.appendChild(empty);
  }

  for (let day = 1; day <= lastDay.getDate(); day++) {
    const date    = new Date(year, month, day);
    const dateStr = dateToStr(date);
    const isToday = date.getTime() === today.getTime();
    const isPast  = date < today;
    const fechaData = availableDates[dateStr];

    const cell = document.createElement('div');
    cell.className = 'cal-cell';
    if (isToday) cell.classList.add('today');
    if (isPast)  cell.classList.add('past');
    if (selectedDates.has(dateStr)) cell.classList.add('selected');

    let slotInfoHtml = '';

    if (fechaData) {
      const slots    = fechaData.slots || [];
      const totalRes = slots.reduce((sum, s) => sum + (reservationMap[`${dateStr}_${s}`]?.length || 0), 0);

      cell.classList.add('available');
      if (totalRes > 0) {
        cell.classList.add('partial');
        slotInfoHtml = `<span class="cal-slot-info">${totalRes} reserva${totalRes !== 1 ? 's' : ''}</span>`;
      } else {
        slotInfoHtml = `<span class="cal-slot-info">${slots.length} slot${slots.length !== 1 ? 's' : ''}</span>`;
      }

      if (!isPast && slots.length > 0) {
        cell.addEventListener('click', () => handleDateClick(dateStr, fechaData));
      }
    }

    cell.innerHTML = `<span class="cal-day-num">${day}</span>${slotInfoHtml}`;
    calGrid.appendChild(cell);
  }
}

// ════════════════════════════════════════════
// DATE SELECTION
// ════════════════════════════════════════════
function handleDateClick(dateStr, fechaData) {
  if (selectedDates.has(dateStr)) {
    selectedDates.delete(dateStr);
  } else {
    selectedDates.add(dateStr);
  }

  renderCalendar();

  if (selectedDates.size > 0) {
    renderSlots();
  } else {
    clearDateSelection();
  }

  // Scroll to slots on mobile
  if (window.innerWidth < 900 && selectedDates.size > 0) {
    document.getElementById('slots-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function clearDateSelection() {
  selectedDates.clear();
  selectedSlots.clear();
  slotsPlaceholder.classList.remove('hidden');
  slotsContent.classList.add('hidden');
  renderCalendar();
}

window.removeSelectedDate = function(dStr) {
  selectedDates.delete(dStr);
  renderCalendar();
  if (selectedDates.size > 0) {
    renderSlots();
  } else {
    clearDateSelection();
  }
};

clearDateBtn.addEventListener('click', clearDateSelection);

// ════════════════════════════════════════════
// SLOTS RENDERING
// ════════════════════════════════════════════
function renderSlots() {
  if (selectedDates.size === 0) {
    clearDateSelection();
    return;
  }

  slotsPlaceholder.classList.add('hidden');
  slotsContent.classList.remove('hidden');

  const sortedDates = [...selectedDates].sort();

  if (sortedDates.length === 1) {
    selectedDateLbl.textContent = strToDisplayDate(sortedDates[0]);
  } else {
    selectedDateLbl.innerHTML = `
      <div class="selected-dates-header-title">${sortedDates.length} fechas seleccionadas</div>
      <div class="selected-date-chips">
        ${sortedDates.map(d => `<span class="date-chip">${d.split('-').slice(1).join('/')} <button type="button" class="chip-remove" onclick="event.stopPropagation(); removeSelectedDate('${d}')" title="Quitar fecha">✕</button></span>`).join('')}
      </div>
    `;
  }

  // Find all unique slots available across all selected dates
  const allSlotsSet = new Set();
  sortedDates.forEach(dStr => {
    const fData = availableDates[dStr];
    if (fData && fData.slots) {
      fData.slots.forEach(s => allSlotsSet.add(s));
    }
  });

  const slots = [...allSlotsSet].sort();
  slotsGrid.innerHTML = '';

  if (slots.length === 0) {
    slotsGrid.innerHTML = '<div class="empty-state" style="padding:24px"><div class="es-icon">🕐</div><div class="es-body">Sin horarios configurados en las fechas seleccionadas</div></div>';
    updateFooter();
    return;
  }

  slots.forEach(hora => {
    const isSelected = selectedSlots.has(hora);

    // Count how many selected dates have this slot configured
    const datesWithSlot = sortedDates.filter(dStr => (availableDates[dStr]?.slots || []).includes(hora));

    // Gather existing reservations across selected dates for this slot
    const registeredNames = new Set();
    sortedDates.forEach(dStr => {
      const res = reservationMap[`${dStr}_${hora}`] || [];
      res.forEach(r => registeredNames.add(r.nombre));
    });

    const card = document.createElement('div');
    card.className = `slot-card ${isSelected ? 'slot-selected' : 'slot-available'}`;
    card.dataset.hora = hora;

    const namesArray = [...registeredNames];
    const namesText = namesArray.join(', ');
    const namesHtml = namesArray.length > 0
      ? `<span class="slot-registered-names" title="${escHtml(namesText)}">👥 ${escHtml(namesText)}</span>`
      : '';

    const datesCountBadge = sortedDates.length > 1
      ? `<span class="slot-dates-badge" title="Disponible en ${datesWithSlot.length} de ${sortedDates.length} fechas seleccionadas">${datesWithSlot.length}/${sortedDates.length} días</span>`
      : '';

    card.innerHTML = `
      <span class="slot-time">${hora}</span>
      <div class="slot-right">
        ${datesCountBadge}
        ${namesHtml}
        <span class="slot-free-label">${isSelected ? 'Seleccionado' : 'Disponible'}</span>
        ${isSelected ? '<span class="slot-check">✓</span>' : ''}
      </div>
    `;
    card.addEventListener('click', () => toggleSlot(hora));

    slotsGrid.appendChild(card);
  });

  updateFooter();
}

function toggleSlot(hora) {
  if (selectedSlots.has(hora)) {
    selectedSlots.delete(hora);
  } else {
    selectedSlots.add(hora);
  }
  renderSlots();
}

function calculateTotalReservationsCount() {
  let count = 0;
  selectedDates.forEach(dStr => {
    const slots = availableDates[dStr]?.slots || [];
    slots.forEach(h => {
      if (selectedSlots.has(h)) count++;
    });
  });
  return count;
}

function updateFooter() {
  const slotCount = selectedSlots.size;
  const dateCount = selectedDates.size;
  const totalRes = calculateTotalReservationsCount();

  if (slotCount > 0 && dateCount > 0) {
    slotsFooter.classList.remove('hidden');
    if (selectedCountEl) {
      if (dateCount === 1) {
        selectedCountEl.textContent = `${slotCount} horario${slotCount > 1 ? 's' : ''}`;
      } else {
        selectedCountEl.textContent = `${totalRes} reserva${totalRes > 1 ? 's' : ''} (${dateCount} días × ${slotCount} horario${slotCount > 1 ? 's' : ''})`;
      }
    }
  } else {
    slotsFooter.classList.add('hidden');
  }
}

// ════════════════════════════════════════════
// MONTH NAVIGATION
// ════════════════════════════════════════════
prevMonthBtn.addEventListener('click', () => {
  currentMonth.setMonth(currentMonth.getMonth() - 1);
  renderCalendar();
});

nextMonthBtn.addEventListener('click', () => {
  currentMonth.setMonth(currentMonth.getMonth() + 1);
  renderCalendar();
});

// ════════════════════════════════════════════
// REGISTRATION MODAL
// ════════════════════════════════════════════
confirmBtn.addEventListener('click', openModal);

function openModal() {
  if (selectedSlots.size === 0 || selectedDates.size === 0) return;

  const sortedDates = [...selectedDates].sort();
  const sortedSlots = [...selectedSlots].sort();
  const totalRes = calculateTotalReservationsCount();

  const datesFormatted = sortedDates.map(dStr => `<span class="badge badge-accent" style="margin-bottom:2px">${strToDisplayDate(dStr)}</span>`).join(' ');

  summaryEl.innerHTML = `
    <div class="summary-card">
      <div class="summary-row" style="flex-direction:column;align-items:flex-start;gap:6px">
        <span class="summary-label">📅 Fechas seleccionadas (${sortedDates.length})</span>
        <div class="summary-dates" style="display:flex;flex-wrap:wrap;gap:4px">
          ${datesFormatted}
        </div>
      </div>
      <div class="summary-row" style="margin-top:6px">
        <span class="summary-label">⏰ Horarios (${sortedSlots.length})</span>
        <div class="summary-slots">
          ${sortedSlots.map(s => `<span class="badge badge-accent">${s}</span>`).join('')}
        </div>
      </div>
      <div class="summary-row" style="margin-top:6px;border-top:1px dashed var(--border-light);padding-top:8px">
        <span class="summary-label">🔢 Total de reservas</span>
        <span class="summary-value" style="color:var(--accent);font-weight:700;font-size:1.05rem">${totalRes} reserva${totalRes !== 1 ? 's' : ''}</span>
      </div>
    </div>
  `;

  nombreInput.value = '';
  modalError.classList.add('hidden');
  modalError.textContent = '';
  regModal.classList.add('open');
  setTimeout(() => nombreInput.focus(), 280);
}

function closeModal() {
  regModal.classList.remove('open');
}

modalClose.addEventListener('click', closeModal);
modalCancel.addEventListener('click', closeModal);
regModal.addEventListener('click', e => { if (e.target === regModal) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
nombreInput.addEventListener('keydown', e => { if (e.key === 'Enter') modalSubmit.click(); });

modalSubmit.addEventListener('click', async () => {
  const nombre = nombreInput.value.trim();
  if (!nombre) {
    showModalError('Por favor, introduce tu nombre');
    nombreInput.focus();
    return;
  }
  if (nombre.length < 2) {
    showModalError('El nombre es demasiado corto');
    return;
  }

  const sortedDates = [...selectedDates].sort();
  const sortedSlots = [...selectedSlots].sort();
  setModalLoading(true);
  modalError.classList.add('hidden');

  try {
    const batch = db.batch();
    let totalCreated = 0;

    sortedDates.forEach(dateStr => {
      const dateSlots = availableDates[dateStr]?.slots || [];
      sortedSlots.forEach(hora => {
        if (dateSlots.includes(hora)) {
          const ref = db.collection('reservas').doc();
          batch.set(ref, {
            fecha:     dateStr,
            hora:      hora,
            nombre:    nombre,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
          });
          totalCreated++;
        }
      });
    });

    if (totalCreated === 0) {
      throw new Error('No hay horarios coincidentes en las fechas seleccionadas.');
    }

    await batch.commit();

    closeModal();
    selectedSlots.clear();
    selectedDates.clear();
    clearDateSelection();
    showToast(`✓ Reservas de ${nombre} confirmadas (${totalCreated} reserva${totalCreated !== 1 ? 's' : ''} en ${sortedDates.length} fecha${sortedDates.length > 1 ? 's' : ''})`, 'success');

  } catch (err) {
    console.error('Reservation error:', err);
    showModalError(err.message || 'Error al guardar. Por favor, inténtalo de nuevo.');
  } finally {
    setModalLoading(false);
  }
});

function showModalError(msg) {
  modalError.textContent = msg;
  modalError.classList.remove('hidden');
}

function setModalLoading(loading) {
  modalSubmit.disabled = loading;
  if (loading) {
    modalSubmit.innerHTML = '<span class="spin"></span> Reservando...';
  } else {
    modalSubmit.innerHTML = '<span class="btn-label">Reservar ahora</span>';
  }
}

// ════════════════════════════════════════════
// INITIAL RENDER
// ════════════════════════════════════════════
renderCalendar();

