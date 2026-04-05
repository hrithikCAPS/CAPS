/* ═══════════════════════════════════════════════════════════
   CAPS UPDATE DASHBOARD — Common JavaScript
   ConsultAdd Public Services

   Provides:
     1. Header rendering (logo, nav, data-fetch timestamp)
     2. Excel data loader (reads CAPS_RFP_Dashboard_Dataset.xlsx)
     3. Utility helpers (formatting, badges, charts)

   Usage: Include in every dashboard page after SheetJS CDN.
   ═══════════════════════════════════════════════════════════ */

const CAPS = (() => {

  /* ── Configuration ── */
  const CONFIG = {
    dataFile: 'data/CAPS_RFP_Dashboard_Dataset.xlsx',
    dataSheet: 'RFP Data',
    logoPath: 'assets/logo.png',
    siteName: 'CAPS Update Dashboard',
    navItems: [
      { label: 'RFP Overview',    href: 'rfp-overview.html' },
      { label: 'Awards',          href: 'awards.html' },
      { label: 'Predictions',     href: 'predictions.html' },
      { label: 'Interviews',      href: 'interviews.html' },
      { label: 'State Analysis',  href: 'state-analysis.html' },
    ]
  };

  /* ── Stage mappings ── */
  const STAGE_BADGE_CLASS = {
    'Submitted':       'submitted',
    'Interview':       'interview',
    'Intent to Award': 'intent',
    'Closed Won':      'won',
    'Closed Lost':     'lost',
    'Terminated':      'terminated',
    'RFx Cancelled':   'cancelled',
  };

  const STAGE_ORDER = ['Submitted', 'Interview', 'Intent to Award', 'Closed Won', 'Closed Lost', 'Terminated', 'RFx Cancelled'];
  const BAR_COLORS = ['navy', 'blue', 'crimson', 'green', 'yellow', 'orange', 'purple', 'teal'];


  /* ═══════════════════════════════════════════════
     HEADER
     ═══════════════════════════════════════════════ */
  function renderHeader(activeLabel) {
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';

    const navHTML = CONFIG.navItems.map(item => {
      const isActive = (item.label === activeLabel) || (item.href === currentPage);
      return `<a class="ca-header__nav-item${isActive ? ' active' : ''}" href="${item.href}">${item.label}</a>`;
    }).join('');

    const header = document.createElement('header');
    header.className = 'ca-header';
    header.innerHTML = `
      <div class="ca-header__left">
        <a href="index.html"><img src="${CONFIG.logoPath}" alt="ConsultAdd" class="ca-header__logo"></a>
        <div class="ca-header__divider"></div>
        <span class="ca-header__title"></span>
        <nav class="ca-header__nav">${navHTML}</nav>
      </div>
      <div class="ca-header__right">
        <div class="ca-header__data-status" id="ca-data-status">
          <span class="dot"></span>
          <span class="label">Last data fetch:</span>
          <span class="value" id="ca-last-fetch">Loading...</span>
        </div>
      </div>
    `;
    document.body.prepend(header);
  }


  /* ═══════════════════════════════════════════════
     DATA LOADER
     ═══════════════════════════════════════════════ */
  let _cachedData = null;
  let _lastUpdated = null;

  function normalizeRow(r) {
    return {
      sno:                    r['S.No.'] || '',
      hubspotId:              r['HubSpot ID'] || '',
      rfpNumber:              r['RFP Number'] || '',
      dealName:               r['Deal Name'] || '',
      agency:                 r['Agency'] || '',
      agencyState:            r['Agency State'] || '',
      stage:                  r['Stage'] || '',
      interviewFlag:          r['Interview Flag'] || '',
      interviewSubcategory:   r['Interview Subcategory'] || '',
      bidClosingDate:         parseDate(r['Bid Closing Date']),
      submissionDate:         parseDate(r['Submission Date']),
      amount:                 parseNum(r['Amount ($)']),
      serviceCategory:        r['Service Category'] || '',
      submissionMode:         r['Submission Mode'] || '',
      owner:                  r['Owner'] || '',
      interviewType:          r['Interview Type'] || '',
      interviewDate:          parseDate(r['Interview Date']),
      bafoDate:               parseDate(r['BAFO Date']),
      intentToAwardDate:      parseDate(r['Intent to Award Date']),
      tentativelyAwardedDate: parseDate(r['Tentatively Awarded Date']),
      awardedDate:            parseDate(r['Awarded Date']),
      awardStatus:            r['Award Status'] || '',
      wonReason:              r['Won Reason'] || '',
      lostReason:             r['Lost Reason'] || '',
      createdDate:            parseDate(r['Created Date']),
      hubspotLink:            r['HubSpot Link'] || '',
    };
  }

  function parseWorkbook(workbook) {
    const readmeSheet = workbook.Sheets['README'];
    if (readmeSheet) {
      const readmeData = XLSX.utils.sheet_to_json(readmeSheet, { header: 1 });
      for (const row of readmeData) {
        if (row[0] && typeof row[0] === 'string' && row[0].startsWith('Last Updated:')) {
          _lastUpdated = row[0].replace('Last Updated:', '').trim();
          break;
        }
      }
    }
    const sheet = workbook.Sheets[CONFIG.dataSheet];
    const rawData = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    _cachedData = rawData.map(row => {
      const r = {};
      for (const [key, value] of Object.entries(row)) { r[key.trim()] = value; }
      return normalizeRow(r);
    });
    _updateDateEl();
    return _cachedData;
  }

  function _updateDateEl() {
    const el = document.getElementById('ca-last-fetch');
    if (el) el.textContent = _lastUpdated || 'Unknown';
  }

  async function loadData() {
    if (_cachedData) {
      _updateDateEl();   // always keep the element in sync even on cache hits
      return _cachedData;
    }

    /* Load from data.js (works locally and on GitHub Pages) */
    if (window.CAPS_EMBEDDED_DATA) {
      _lastUpdated = window.CAPS_EMBEDDED_DATA.lastUpdated || '';
      _cachedData = window.CAPS_EMBEDDED_DATA.records.map(row => {
        const r = {};
        for (const [key, value] of Object.entries(row)) { r[key.trim()] = value; }
        return normalizeRow(r);
      });
      _updateDateEl();
      return _cachedData;
    }

    throw new Error('No data found. Run refresh-data.py to generate js/data.js from the Excel file.');
  }

  function getLastUpdated() {
    return _lastUpdated;
  }


  /* ═══════════════════════════════════════════════
     PARSING HELPERS
     ═══════════════════════════════════════════════ */
  function parseDate(val) {
    if (!val) return null;
    if (val instanceof Date) return val;
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }

  function parseNum(val) {
    if (val === '' || val === null || val === undefined) return null;
    const n = typeof val === 'number' ? val : parseFloat(String(val).replace(/[,$]/g, ''));
    return isNaN(n) ? null : n;
  }


  /* ═══════════════════════════════════════════════
     FORMATTING HELPERS
     ═══════════════════════════════════════════════ */
  function formatCurrency(num) {
    if (num === null || num === undefined) return '—';
    if (num >= 1e6) return '$' + (num / 1e6).toFixed(1) + 'M';
    if (num >= 1e3) return '$' + (num / 1e3).toFixed(0) + 'K';
    return '$' + num.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  function formatCurrencyFull(num) {
    if (num === null || num === undefined) return '—';
    return '$' + num.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  function formatDate(d) {
    if (!d) return '—';
    if (!(d instanceof Date)) d = new Date(d);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function formatDateShort(d) {
    if (!d) return '—';
    if (!(d instanceof Date)) d = new Date(d);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function formatPercent(val, decimals = 1) {
    if (val === null || val === undefined) return '—';
    return (val * 100).toFixed(decimals) + '%';
  }

  function formatNumber(num) {
    if (num === null || num === undefined) return '—';
    return num.toLocaleString('en-US');
  }


  /* ═══════════════════════════════════════════════
     UI COMPONENT HELPERS
     ═══════════════════════════════════════════════ */
  function stageBadge(stage) {
    const cls = STAGE_BADGE_CLASS[stage] || 'submitted';
    return `<span class="ca-badge ca-badge--${cls}">${stage}</span>`;
  }

  function interviewBadge(flag, subcat) {
    if (flag === 'Yes') {
      if (subcat === 'BAFO') return `<span class="ca-badge ca-badge--bafo">BAFO</span>`;
      return `<span class="ca-badge ca-badge--yes">Interview</span>`;
    }
    return `<span class="ca-badge ca-badge--no">No</span>`;
  }

  function metricCard(label, value, detail, colorClass, infoText) {
    const safeInfo = infoText ? infoText.replace(/</g,'&lt;').replace(/>/g,'&gt;') : '';
    return `
      <div class="ca-metric-card">
        ${infoText ? `<div class="kpi-info-wrap">
          <button class="kpi-info-btn" onclick="window._capsToggleTip(this)" aria-label="More info">i</button>
          <div class="kpi-info-tip">${safeInfo}</div>
        </div>` : ''}
        <div class="ca-metric-card__label">${label}</div>
        <div class="ca-metric-card__value ${colorClass || ''}">${value}</div>
        ${detail ? `<div class="ca-metric-card__detail">${detail}</div>` : ''}
      </div>
    `;
  }

  function horizontalBar(label, value, maxValue, color, displayValue) {
    const pct = maxValue > 0 ? Math.max((value / maxValue) * 100, 0.5) : 0;
    return `
      <div class="ca-bar-row">
        <div class="ca-bar-row__label" title="${label}">${label}</div>
        <div class="ca-bar-row__track">
          <div class="ca-bar-row__fill ${color}" style="width:${pct}%"></div>
        </div>
        <div class="ca-bar-row__value">${displayValue !== undefined ? displayValue : value}</div>
      </div>
    `;
  }

  function showLoading(container, message) {
    container.innerHTML = `
      <div class="ca-loading">
        <div class="ca-loading__spinner"></div>
        <div class="ca-loading__text">${message || 'Loading dashboard data...'}</div>
      </div>
    `;
  }


  /* ═══════════════════════════════════════════════
     DATA ANALYSIS HELPERS
     ═══════════════════════════════════════════════ */
  function countBy(data, field) {
    const counts = {};
    data.forEach(row => {
      const val = row[field] || '(empty)';
      counts[val] = (counts[val] || 0) + 1;
    });
    return counts;
  }

  function sumBy(data, groupField, sumField) {
    const sums = {};
    data.forEach(row => {
      const group = row[groupField] || '(empty)';
      const val = row[sumField];
      if (val !== null) {
        sums[group] = (sums[group] || 0) + val;
      }
    });
    return sums;
  }

  function sortedEntries(obj, direction = 'desc') {
    const entries = Object.entries(obj);
    if (direction === 'desc') {
      entries.sort((a, b) => b[1] - a[1]);
    } else {
      entries.sort((a, b) => a[1] - b[1]);
    }
    return entries;
  }

  function filter(data, conditions) {
    return data.filter(row => {
      for (const [field, value] of Object.entries(conditions)) {
        if (Array.isArray(value)) {
          if (!value.includes(row[field])) return false;
        } else if (row[field] !== value) {
          return false;
        }
      }
      return true;
    });
  }


  /* ═══════════════════════════════════════════════
     PUBLIC API
     ═══════════════════════════════════════════════ */
  return {
    CONFIG,
    STAGE_ORDER,
    STAGE_BADGE_CLASS,
    BAR_COLORS,
    renderHeader,
    loadData,
    getLastUpdated,
    formatCurrency,
    formatCurrencyFull,
    formatDate,
    formatDateShort,
    formatPercent,
    formatNumber,
    stageBadge,
    interviewBadge,
    metricCard,
    horizontalBar,
    showLoading,
    countBy,
    sumBy,
    sortedEntries,
    filter,
  };

})();

/* ── Global info-tip toggle (used by kpi-info-btn onclick handlers) ── */
window._capsToggleTip = function(btn) {
  const tip = btn.nextElementSibling;
  const isOpen = tip.classList.contains('open');
  document.querySelectorAll('.kpi-info-tip.open').forEach(t => t.classList.remove('open'));
  if (!isOpen) tip.classList.add('open');
};
document.addEventListener('click', function(e) {
  if (!e.target.closest('.kpi-info-wrap')) {
    document.querySelectorAll('.kpi-info-tip.open').forEach(t => t.classList.remove('open'));
  }
});
