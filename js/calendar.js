/* =====================================================
   CALENDAR.JS — Main calendar logic
   Handles: month grid, date selection, slot rendering,
            registration modal, real-time Firestore sync
   ===================================================== */
'use strict';

// ════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════
let currentMonth     = new Date();        // Month currently displayed
let availableDates   = {};               // { "YYYY-MM-DD": { slots, activa, id } }
let reservationMap   = {};               // { "YYYY-MM-DD_HH:MM": { nombre, id } }
let selectedDate     = null;             // Currently selected date string
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
  renderCalendar();
  if (selectedDate && availableDates[selectedDate]) {
    renderSlots(selectedDate, availableDates[selectedDate]);
  } else if (selectedDate && !availableDates[selectedDate]) {
    // Date was removed by admin
    clearDateSelection();
  }
});

// Reservations
db.collection('reservas').onSnapshot(snapshot => {
  reservationMap = {};
  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.fecha && data.hora) {
      reservationMap[`${data.fecha}_${data.hora}`] = { nombre: data.nombre, id: doc.id };
    }
  });
  renderCalendar();
  if (selectedDate && availableDates[selectedDate]) {
    renderSlots(selectedDate, availableDates[selectedDate]);
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
    if (dateStr === selectedDate) cell.classList.add('selected');

    let slotInfoHtml = '';

    if (fechaData) {
      const slots      = fechaData.slots || [];
      const takenCount = slots.filter(s => reservationMap[`${dateStr}_${s}`]).length;
      const freeCount  = slots.length - takenCount;

      if (freeCount === 0) {
        cell.classList.add('full');
        slotInfoHtml = '<span class="cal-slot-info">Completo</span>';
      } else if (takenCount > 0) {
        cell.classList.add('partial');
        slotInfoHtml = `<span class="cal-slot-info">${freeCount} libre${freeCount !== 1 ? 's' : ''}</span>`;
      } else {
        cell.classList.add('available');
        slotInfoHtml = `<span class="cal-slot-info">${slots.length} slot${slots.length !== 1 ? 's' : ''}</span>`;
      }

      if (!isPast && freeCount > 0) {
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
  if (selectedDate !== dateStr) {
    selectedSlots.clear();
  }
  selectedDate = dateStr;
  renderCalendar();
  renderSlots(dateStr, fechaData);
  // Scroll to slots on mobile
  if (window.innerWidth < 900) {
    document.getElementById('slots-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function clearDateSelection() {
  selectedDate = null;
  selectedSlots.clear();
  slotsPlaceholder.classList.remove('hidden');
  slotsContent.classList.add('hidden');
  renderCalendar();
}

clearDateBtn.addEventListener('click', clearDateSelection);

// ════════════════════════════════════════════
// SLOTS RENDERING
// ════════════════════════════════════════════
function renderSlots(dateStr, fechaData) {
  slotsPlaceholder.classList.add('hidden');
  slotsContent.classList.remove('hidden');

  selectedDateLbl.textContent = strToDisplayDate(dateStr);

  const slots = (fechaData.slots || []).slice().sort();
  slotsGrid.innerHTML = '';

  if (slots.length === 0) {
    slotsGrid.innerHTML = '<div class="empty-state" style="padding:24px"><div class="es-icon">🕐</div><div class="es-body">Sin horarios configurados</div></div>';
    updateFooter();
    return;
  }

  slots.forEach(hora => {
    const key         = `${dateStr}_${hora}`;
    const reservation = reservationMap[key];
    const isTaken     = !!reservation;
    const isSelected  = selectedSlots.has(hora);

    const card = document.createElement('div');
    card.className = `slot-card ${isTaken ? 'slot-taken' : (isSelected ? 'slot-selected' : 'slot-available')}`;
    card.dataset.hora = hora;

    if (isTaken) {
      card.innerHTML = `
        <span class="slot-time">${hora}</span>
        <div class="slot-right">
          <span class="slot-name">${escHtml(reservation.nombre)}</span>
          <span class="badge badge-danger">Ocupado</span>
        </div>
      `;
    } else {
      card.innerHTML = `
        <span class="slot-time">${hora}</span>
        <div class="slot-right">
          <span class="slot-free-label">${isSelected ? 'Seleccionado' : 'Disponible'}</span>
          ${isSelected ? '<span class="slot-check">✓</span>' : ''}
        </div>
      `;
      card.addEventListener('click', () => toggleSlot(hora));
    }

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
  // Re-render slots to reflect selection visually
  if (selectedDate && availableDates[selectedDate]) {
    renderSlots(selectedDate, availableDates[selectedDate]);
  }
}

function updateFooter() {
  const count = selectedSlots.size;
  if (count > 0) {
    slotsFooter.classList.remove('hidden');
    selectedCountEl.textContent = count;
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
  if (selectedSlots.size === 0) return;

  const sorted = [...selectedSlots].sort();
  summaryEl.innerHTML = `
    <div class="summary-card">
      <div class="summary-row">
        <span class="summary-label">📅 Fecha</span>
        <span class="summary-value">${strToDisplayDate(selectedDate)}</span>
      </div>
      <div class="summary-row">
        <span class="summary-label">⏰ Horarios</span>
        <div class="summary-slots">
          ${sorted.map(s => `<span class="badge badge-accent">${s}</span>`).join('')}
        </div>
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

  const slots = [...selectedSlots].sort();
  setModalLoading(true);
  modalError.classList.add('hidden');

  try {
    // Race condition check: verify all slots are still free
    const nowTaken = slots.filter(h => reservationMap[`${selectedDate}_${h}`]);
    if (nowTaken.length > 0) {
      throw new Error(`Los horarios ${nowTaken.join(', ')} ya no están disponibles. Por favor, actualiza tu selección.`);
    }

    // Batch write one document per slot
    const batch = db.batch();
    slots.forEach(hora => {
      const ref = db.collection('reservas').doc();
      batch.set(ref, {
        fecha:     selectedDate,
        hora:      hora,
        nombre:    nombre,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      });
    });

    await batch.commit();

    closeModal();
    selectedSlots.clear();
    updateFooter();
    showToast(`✓ Reserva de ${nombre} confirmada (${slots.length} horario${slots.length > 1 ? 's' : ''})`, 'success');

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
