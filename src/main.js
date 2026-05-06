import { bitable } from '@lark-base-open/js-sdk';

// ─── Config ───────────────────────────────────────────────────────────────────

const FIELD_NAMES = {
  item:      'Item',
  component: 'Component',
  status:    'Status',
  owner:     'Owner',
  startDate: 'Start date',
  endDate:   'End date',
};

const COMPONENT_COLORS = {
  'Operation':      '#3B82F6',
  'Infrastructure': '#A855F7',
  'Quality':        '#10B981',
  'Security':       '#EF4444',
};

const STATUS_CONFIG = {
  'Done':        { opacity: 0.4,  glow: false, dashed: false, stripe: false },
  'In Progress': { opacity: 1.0,  glow: true,  dashed: false, stripe: false },
  'Pending':     { opacity: 0.7,  glow: false, dashed: true,  stripe: true  },
  'Archived':    { opacity: 0.3,  glow: false, dashed: false, stripe: false },
  'Not Started': { opacity: 0.25, glow: false, dashed: true,  stripe: false },
};

const STATUS_BADGE = {
  'Done':        { bg: 'rgba(16,185,129,0.15)',  color: '#10B981' },
  'In Progress': { bg: 'rgba(59,130,246,0.15)',  color: '#60A5FA' },
  'Pending':     { bg: 'rgba(234,179,8,0.15)',   color: '#EAB308' },
  'Archived':    { bg: 'rgba(100,116,139,0.15)', color: '#64748B' },
  'Not Started': { bg: 'rgba(107,114,128,0.15)', color: '#9CA3AF' },
};

const COMPONENT_ORDER = ['Operation', 'Infrastructure', 'Quality', 'Security'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCellText(value, optionMap) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    if (!value.length) return '';
    const first = value[0];
    if (typeof first === 'string') {
      // Check if it's an option ID and we have a map
      if (optionMap && optionMap[first]) {
        return optionMap[first];
      }
      return first;
    }
    return first?.text || first?.name || first?.en_us || '';
  }
  if (typeof value === 'object') {
    // Handle formula fields that wrap values
    if (value.value !== undefined) {
      return getCellText(value.value, optionMap);
    }
    return value.text || value.name || value.en_us || '';
  }
  return String(value);
}

function getCellDate(value) {
  if (!value) return null;
  if (typeof value === 'number') return new Date(value);
  return null;
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r},${g},${b}`;
}

function fmtDate(d) {
  if (!d) return 'N/A';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' });
}

function escHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function getColor(component) {
  return COMPONENT_COLORS[component] || '#6B7280';
}

// ─── Data Loading ─────────────────────────────────────────────────────────────

async function loadItems() {
  const table = await bitable.base.getActiveTable();
  const fieldMetaList = await table.getFieldMetaList();

  // Build name → id map
  const fieldMap = {};
  fieldMetaList.forEach(f => { fieldMap[f.name] = f.id; });

  const fItem      = fieldMap[FIELD_NAMES.item];
  const fComponent = fieldMap[FIELD_NAMES.component];
  const fStatus    = fieldMap[FIELD_NAMES.status];
  const fOwner     = fieldMap[FIELD_NAMES.owner];
  const fStart     = fieldMap[FIELD_NAMES.startDate];
  const fEnd       = fieldMap[FIELD_NAMES.endDate];

  // Build global option ID → name map from ALL fields with options
  // (For non-formula single select fields)
  const globalOptions = {};
  fieldMetaList.forEach(f => {
    if (f.property?.options) {
      f.property.options.forEach(opt => {
        globalOptions[opt.id] = opt.name;
      });
    }
  });

  // Fetch all records (paginated)
  const allRecords = [];
  let pageToken;
  do {
    const res = await table.getRecordsByPage({ pageSize: 200, pageToken });
    allRecords.push(...res.records);
    pageToken = res.pageToken;
  } while (pageToken);

  // Process records - use SDK getCellString for formula fields
  const items = [];
  for (const r of allRecords) {
    const name = getCellText(r.fields[fItem]);
    const startDate = getCellDate(r.fields[fStart]);
    const endDate = getCellDate(r.fields[fEnd]);

    if (!name || !startDate || !endDate) continue;

    // Use SDK to resolve formula field values
    const statusValue = await table.getCellString(fStatus, r.recordId);
    const componentValue = await table.getCellString(fComponent, r.recordId);

    items.push({
      id: r.recordId,
      name,
      component: componentValue || getCellText(r.fields[fComponent], globalOptions),
      status: statusValue || 'Unknown',
      owner: getCellText(r.fields[fOwner]),
      startDate,
      endDate,
    });
  }

  table.onRecordModify(() => refresh());
  table.onRecordAdd(() => refresh());
  table.onRecordDelete(() => refresh());

  return items;
}

// ─── Filters ──────────────────────────────────────────────────────────────────

let _allItems = [];
let _selectedYear = String(new Date().getFullYear());
let _selectedStatus = 'all';

function getYears(items) {
  const years = new Set();
  items.forEach(item => {
    years.add(item.startDate.getFullYear());
    years.add(item.endDate.getFullYear());
  });
  return Array.from(years).sort((a, b) => a - b);
}

function getStatuses(items) {
  const statuses = new Set();
  items.forEach(item => {
    if (item.status) statuses.add(item.status);
  });
  return Array.from(statuses).sort();
}

function applyFilters(items) {
  let filtered = items;

  // Year filter
  if (_selectedYear !== 'all') {
    const y = parseInt(_selectedYear);
    filtered = filtered.filter(item => {
      const startYear = item.startDate.getFullYear();
      const endYear = item.endDate.getFullYear();
      return startYear === y || endYear === y;
    });
  }

  // Status filter
  if (_selectedStatus !== 'all') {
    filtered = filtered.filter(item => item.status === _selectedStatus);
  }

  return filtered;
}

function setYear(year) {
  _selectedYear = year;
  renderGantt(applyFilters(_allItems));
}

function setStatus(status) {
  _selectedStatus = status;
  renderGantt(applyFilters(_allItems));
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function getMonths(minDate, maxDate) {
  const months = [];
  const d = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  const endMonth = maxDate.getMonth();
  const endYear = maxDate.getFullYear();

  while (d.getFullYear() < endYear || (d.getFullYear() === endYear && d.getMonth() <= endMonth)) {
    months.push(new Date(d));
    d.setMonth(d.getMonth() + 1);
  }
  return months;
}

function getQuarterLabel(d) {
  return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`;
}

function renderGantt(items, updateYearFilter = false) {
  const container = document.getElementById('gantt');
  container.innerHTML = '';

  if (!items.length) {
    container.innerHTML = `<div class="empty">No items with start/end dates found.<br>Make sure your table has <b>Item</b>, <b>Start date</b>, and <b>End date</b> fields.</div>`;
    return;
  }

  // Compute date range
  const allDates = items.flatMap(i => [i.startDate, i.endDate]);
  const minDate = new Date(Math.min(...allDates));
  const maxDate = new Date(Math.max(...allDates));

  // Set minDate to start of its month
  minDate.setDate(1);
  minDate.setHours(0, 0, 0, 0);

  // Set maxDate to end of its month
  const endOfMonth = new Date(maxDate.getFullYear(), maxDate.getMonth() + 1, 0, 23, 59, 59, 999);
  maxDate.setTime(endOfMonth.getTime());

  const totalMs = maxDate - minDate;
  const months = getMonths(minDate, maxDate);

  function pct(date) {
    return Math.max(0, Math.min(100, ((date - minDate) / totalMs) * 100));
  }

  // Quarter groups for header
  const quarters = [];
  months.forEach(m => {
    const ql = getQuarterLabel(m);
    const daysInMonth = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    const last = quarters[quarters.length - 1];
    if (last && last.label === ql) last.days += daysInMonth;
    else quarters.push({ label: ql, days: daysInMonth });
  });

  // Group items by component
  const groups = {};
  items.forEach(item => {
    const c = item.component || 'Other';
    if (!groups[c]) groups[c] = [];
    groups[c].push(item);
  });

  const sortedGroups = Object.entries(groups).sort(([a], [b]) => {
    const ai = COMPONENT_ORDER.indexOf(a), bi = COMPONENT_ORDER.indexOf(b);
    if (ai < 0 && bi < 0) return a.localeCompare(b);
    if (ai < 0) return 1; if (bi < 0) return -1;
    return ai - bi;
  });

  // Update filters
  if (updateYearFilter && _allItems.length > 0) {
    const years = getYears(_allItems);
    const statuses = getStatuses(_allItems);
    const filtersContainer = document.getElementById('filters');
    if (filtersContainer) {
      filtersContainer.innerHTML = `
        <select class="filter-select" onchange="setYear(this.value)">
          <option value="all" ${_selectedYear === 'all' ? 'selected' : ''}>All Years</option>
          ${years.map(y =>
            `<option value="${y}" ${_selectedYear === String(y) ? 'selected' : ''}>${y}</option>`
          ).join('')}
        </select>
        <select class="filter-select" onchange="setStatus(this.value)">
          <option value="all" ${_selectedStatus === 'all' ? 'selected' : ''}>All Statuses</option>
          ${statuses.map(s =>
            `<option value="${s}" ${_selectedStatus === s ? 'selected' : ''}>${escHtml(s)}</option>`
          ).join('')}
        </select>
      `;
    }
  }

  // Today position (normalized to start of day)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayPct = pct(today);

  // Build HTML
  // Today line offset: label column + percentage of timeline area
  // Formula: labelWidth + (todayPct% - labelWidth * todayPct/100)

  let html = `<div class="gantt-wrap" style="--today-pct:${todayPct}">
    <div class="today-line" style="left:calc(var(--label-width) + var(--today-pct) * 1% - var(--label-width) * var(--today-pct) / 100)"></div>`;

  // ── Timeline Header ──
  html += `<div class="tl-header">
    <div class="row-lbl-hd">ITEM</div>
    <div class="tl-cols">
      <div class="tl-quarters">
        ${quarters.map(q => `<div class="tl-q" style="flex:${q.days}">${escHtml(q.label)}</div>`).join('')}
      </div>
      <div class="tl-months">
        ${months.map(m => {
          const isNow = m.getMonth() === new Date().getMonth() && m.getFullYear() === new Date().getFullYear();
          const daysInMonth = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
          return `<div class="tl-m ${isNow ? 'tl-m-now' : ''}" style="flex:${daysInMonth}">${m.toLocaleString('en-US', { month: 'short' })}</div>`;
        }).join('')}
      </div>
    </div>
  </div>`;

  // ── Groups + Rows ──
  sortedGroups.forEach(([comp, compItems]) => {
    const color = getColor(comp);
    const rgb = hexToRgb(color);

    html += `<div class="group-hd">
      <div class="group-lbl">
        <span class="group-dot" style="background:${color}"></span>
        <span class="group-name" style="color:${color}">${escHtml(comp)}</span>
        <span class="group-ct">${compItems.length}</span>
      </div>
      <div class="group-bar-area">
        ${months.map(m => {
          const isQstart = m.getMonth() % 3 === 0;
          const daysInMonth = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
          return `<div class="grid-col ${isQstart ? 'grid-col-q' : ''}" style="flex:${daysInMonth}"></div>`;
        }).join('')}
      </div>
    </div>`;

    compItems.forEach(item => {
      const sp = pct(item.startDate);
      // End date: extend to end of day (next day at 00:00)
      const endPlusOneDay = new Date(item.endDate);
      endPlusOneDay.setDate(endPlusOneDay.getDate() + 1);
      const ep = pct(endPlusOneDay);
      const w = Math.max(ep - sp, 0.5);
      const sc = STATUS_CONFIG[item.status] || STATUS_CONFIG['Not Started'];
      const badge = STATUS_BADGE[item.status] || STATUS_BADGE['Not Started'];
      const ownerFirst = (item.owner || '').split(' ')[0];

      let barStyle;
      if (sc.dashed && sc.stripe) {
        // Pending: diagonal stripes
        barStyle = `left:${sp}%;width:${w}%;border:1.5px dashed ${color};background:repeating-linear-gradient(45deg,rgba(${rgb},0.15),rgba(${rgb},0.15) 4px,transparent 4px,transparent 8px);opacity:${sc.opacity}`;
      } else if (sc.dashed) {
        // Not Started: solid light fill
        barStyle = `left:${sp}%;width:${w}%;border:1.5px dashed ${color};background:rgba(${rgb},0.15);opacity:${sc.opacity}`;
      } else {
        // Done, In Progress: solid bar
        barStyle = `left:${sp}%;width:${w}%;background:${color};opacity:${sc.opacity}${sc.glow ? `;box-shadow:0 0 10px rgba(${rgb},0.5)` : ''}`;
      }

      html += `<div class="g-row"
        data-name="${escHtml(item.name)}"
        data-comp="${escHtml(comp)}"
        data-status="${escHtml(item.status)}"
        data-owner="${escHtml(item.owner)}"
        data-start="${item.startDate.toISOString()}"
        data-end="${item.endDate.toISOString()}"
        data-color="${color}"
        data-badge-bg="${badge.bg}"
        data-badge-color="${badge.color}">
        <div class="row-lbl">
          <span class="row-name" title="${escHtml(item.name)}">${escHtml(item.name)}</span>
          <span class="row-owner">${escHtml(ownerFirst)}</span>
        </div>
        <div class="bar-area">
          ${months.map(m => {
            const isQstart = m.getMonth() % 3 === 0;
            const daysInMonth = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
            return `<div class="grid-col ${isQstart ? 'grid-col-q' : ''}" style="flex:${daysInMonth}"></div>`;
          }).join('')}
          <div class="bar" style="${barStyle}">
            ${w > 8 ? `<span class="bar-label">${escHtml(item.name)}</span>` : ''}
          </div>
        </div>
      </div>`;
    });
  });

  html += `</div>`;
  container.innerHTML = html;

  // Tooltip
  container.querySelectorAll('.g-row').forEach(row => {
    row.addEventListener('mouseenter', e => showTooltip(e, row));
    row.addEventListener('mouseleave', hideTooltip);
  });
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

const tooltip = document.getElementById('tooltip');

function showTooltip(e, row) {
  const { name, comp, status, owner, start, end, color } = row.dataset;
  const badgeBg = row.dataset.badgeBg;
  const badgeColor = row.dataset.badgeColor;
  const startDate = new Date(start), endDate = new Date(end);
  const days = Math.round((endDate - startDate) / 86400000);

  tooltip.innerHTML = `
    <div class="tt-title" style="color:${color}">${escHtml(name)}</div>
    <div class="tt-row"><span class="tt-lbl">Component</span><span>${escHtml(comp)}</span></div>
    <div class="tt-row"><span class="tt-lbl">Status</span>
      <span class="tt-badge" style="background:${badgeBg};color:${badgeColor}">${escHtml(status)}</span>
    </div>
    <div class="tt-row"><span class="tt-lbl">Owner</span><span>${escHtml(owner) || '—'}</span></div>
    <div class="tt-row"><span class="tt-lbl">Start</span><span>${fmtDate(startDate)}</span></div>
    <div class="tt-row"><span class="tt-lbl">End</span><span>${fmtDate(endDate)}</span></div>
    <div class="tt-row"><span class="tt-lbl">Duration</span><span>${days}d</span></div>
  `;
  tooltip.style.display = 'block';
  const x = Math.min(e.clientX + 14, window.innerWidth - 240);
  const y = Math.min(e.clientY - 10, window.innerHeight - 200);
  tooltip.style.left = x + 'px';
  tooltip.style.top = y + 'px';
}

function hideTooltip() {
  tooltip.style.display = 'none';
}

// ─── App ──────────────────────────────────────────────────────────────────────

function showState(state, msg = '') {
  document.getElementById('loading').style.display = state === 'loading' ? 'flex' : 'none';
  document.getElementById('error').style.display   = state === 'error'   ? 'flex' : 'none';
  document.getElementById('gantt').style.display   = state === 'gantt'   ? 'block' : 'none';
  if (msg) document.getElementById('error-msg').textContent = msg;
}

let _refreshing = false;
async function refresh() {
  if (_refreshing) return;
  _refreshing = true;
  try {
    showState('loading');
    _allItems = await loadItems();
    const filtered = applyFilters(_allItems);
    renderGantt(filtered, true);
    showState('gantt');
  } catch (err) {
    console.error(err);
    const msg = (err?.message || String(err)) + (err?.stack ? '\n' + err.stack : '');
    showState('error', msg);
  } finally {
    _refreshing = false;
  }
}

// ─── Theme Toggle ─────────────────────────────────────────────────────────────

function toggleTheme() {
  const body = document.body;
  const isDark = body.classList.contains('dark-mode');

  if (isDark) {
    body.classList.remove('dark-mode');
    body.classList.add('light-mode');
    localStorage.setItem('theme', 'light');
  } else {
    body.classList.add('dark-mode');
    body.classList.remove('light-mode');
    localStorage.setItem('theme', 'dark');
  }
}

function initTheme() {
  const saved = localStorage.getItem('theme') || 'dark';
  if (saved === 'light') {
    document.body.classList.add('light-mode');
  } else {
    document.body.classList.add('dark-mode');
  }
}

// ─── Fullscreen ───────────────────────────────────────────────────────────────

function toggleFullscreen() {
  const el = document.documentElement;

  if (!document.fullscreenElement) {
    // Try to enter fullscreen
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(err => {
        console.warn('Fullscreen request failed:', err);
        // Fallback: maximize via CSS
        document.body.classList.add('fullscreen-fallback');
      });
    } else {
      // Fallback for browsers/webviews that don't support Fullscreen API
      document.body.classList.add('fullscreen-fallback');
    }
  } else {
    // Exit fullscreen
    if (document.exitFullscreen) {
      document.exitFullscreen();
    }
    document.body.classList.remove('fullscreen-fallback');
  }
}

window.refresh = refresh;
window.setYear = setYear;
window.setStatus = setStatus;
window.toggleTheme = toggleTheme;
window.toggleFullscreen = toggleFullscreen;
initTheme();
window.addEventListener('load', refresh);
