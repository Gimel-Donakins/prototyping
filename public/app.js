// ═══════════════════════════════════════════════════════════════════
//  Frith Lab Dashboard — app.js
//  All styling applied dynamically via JavaScript (no external CSS).
// ═══════════════════════════════════════════════════════════════════

// ─── Design tokens — light, 2-color status, minimal ─────────────────────────
const C = {
  bg:          '#f9fafb',
  surface:     '#ffffff',
  surfaceAlt:  '#f3f4f6',
  border:      '#e5e7eb',
  borderStrong:'#d1d5db',
  accent:      '#2563eb',
  accentLight: '#eff6ff',
  text:        '#111827',
  textMuted:   '#6b7280',
  textLight:   '#9ca3af',
  // Status — only 2 dot states to keep visual noise minimal
  dotOk:       '#9ca3af',   // muted gray filled dot = present
  dotIssue:    '#dc2626',   // red hollow dot = any problem
  success:     '#16a34a',
  danger:      '#dc2626',
};

const FONT = '"Open Sans", sans-serif';

// ─── Global style injection ───────────────────────────────────────────────────
function injectGlobalStyles() {
  const style = document.createElement('style');
  style.textContent = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; background: ${C.bg}; color: ${C.text};
                 font-family: ${FONT}; font-size: 14px; }
    ::-webkit-scrollbar { width: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 3px; }
    button { cursor: pointer; font-family: ${FONT}; border: none; outline: none; }
    input, select { font-family: ${FONT}; }
    @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
    .ribbon-tab-short { display: none; }
    .ribbon-tab-sub   { display: block; }
    .ribbon-bench-label { display: inline; }
    .ribbon-refresh-text { display: inline; }
    .ribbon-refresh-icon { display: none; }
    @media (max-width: 768px) {
      .ribbon { padding: 0 8px !important; gap: 0 !important; height: 44px !important; }
      .ribbon-tab-full  { display: none !important; }
      .ribbon-tab-short { display: inline !important; }
      .ribbon-tab-sub   { display: none !important; }
      .ribbon-bench-label { display: none !important; }
      .ribbon-refresh-text { display: none !important; }
      .ribbon-refresh-icon { display: inline !important; }
      .ribbon button, .ribbon select { height: 32px !important; min-width: 0 !important; }
      .ribbon .ribbon-tab { flex: 1 1 0 !important; padding: 0 6px !important; align-items: center !important; text-align: center !important; }
      .ribbon .ribbon-ws-select { padding: 3px 6px !important; font-size: 11px !important; }
      .ribbon .ribbon-log-btn { width: 32px !important; height: 32px !important; margin-left: 4px !important; flex-shrink: 0 !important; }
      .ribbon .ribbon-refresh-btn { padding: 4px 8px !important; flex-shrink: 0 !important; }
      .ribbon .ribbon-spacer { display: none !important; }
      .log-col-from, .log-col-to { display: none !important; }
      .log-row { grid-template-columns: 120px 1fr 50px 70px !important; }
    }
  `;
  document.head.appendChild(style);
}

// ─── Style / element helpers ──────────────────────────────────────────────────
function s(el, styles) { Object.assign(el.style, styles); return el; }
function el(tag, styles = {}, attrs = {}) {
  const e = document.createElement(tag);
  s(e, styles);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'text') e.textContent = v; else e.setAttribute(k, v);
  });
  return e;
}

// ─── App state ────────────────────────────────────────────────────────────────
let workbenches = [];
let currentView = localStorage.getItem('frith_currentView') || 'dashboard';
let previousView = null; // for toggling Movement Log back
let searchState  = { step: 0, query: '', results: [], chosen: null };
let cleanupState = { step: 0, moves: [], checkedMoves: new Set() };
let expandedBenches = new Set();
let myWorkstation = null; // selected bench ID the user is sitting at
let movementLog = [];
let lastMove = null; // { tool, from, to, count, time } for undo

// ─── API helpers ──────────────────────────────────────────────────────────────
async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(path, opts);
  return r.json();
}
const GET   = (p)    => api('GET', p);
const PATCH = (p, b) => api('PATCH', p, b);
const POST  = (p, b) => api('POST', p, b);

async function loadWorkbenches() {
  workbenches = await GET('/api/workbenches');
}

async function loadLog() {
  movementLog = await GET('/api/log');
}

// ─── Root render ──────────────────────────────────────────────────────────────
function render() {
  const app = document.getElementById('app');
  // Issue 1: Preserve scroll position across re-renders
  const oldMain = app.querySelector('main');
  const savedScroll = oldMain ? oldMain.scrollTop : 0;
  app.innerHTML = '';
  s(app, { display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' });

  app.appendChild(buildToolbar());
  app.appendChild(buildRibbon());

  const content = el('main', {
    flex: '1', overflowY: 'auto', padding: '28px 36px',
    background: C.bg, animation: 'fadeIn 0.2s ease',
  });
  app.appendChild(content);

  if (currentView === 'dashboard') renderDashboard(content);
  else if (currentView === 'search')  renderSearch(content);
  else if (currentView === 'cleanup') renderCleanup(content);
  else if (currentView === 'log')     renderLog(content);

  // Issue 1: Restore scroll position
  requestAnimationFrame(() => { content.scrollTop = savedScroll; });
}

// ─── Toolbar — minimal one-line bar ───────────────────────────────────────────
function buildToolbar() {
  const bar = el('header', {
    display: 'flex', alignItems: 'center', gap: '14px',
    background: C.surface,
    borderBottom: '1px solid ' + C.border,
    padding: '0 28px', height: '48px',
  });

  bar.appendChild(el('span', {
    fontSize: '15px', fontWeight: '700', color: C.text, letterSpacing: '0.2px',
  }, { text: 'Frith Lab' }));

  bar.appendChild(el('span', { color: C.border, fontSize: '18px' }, { text: '|' }));

  bar.appendChild(el('span', {
    fontSize: '13px', color: C.textMuted,
  }, { text: 'ULA Dashboard' }));

  const spacer = el('div', { flex: '1' });
  bar.appendChild(spacer);

  const inUseCount = workbenches.filter(w => w.inUse).length;
  bar.appendChild(el('span', { fontSize: '12px', color: C.textMuted },
    { text: inUseCount > 0 ? inUseCount + ' bench' + (inUseCount > 1 ? 'es' : '') + ' in use' : 'No benches in use' }));

  return bar;
}

// ─── Ribbon — comprehensive, labeled ─────────────────────────────────────────
function buildRibbon() {
  const ribbon = el('nav', {
    display: 'flex', alignItems: 'stretch',
    background: C.surface,
    borderBottom: '2px solid ' + C.border,
    padding: '0 20px', height: '56px',
    gap: '2px', overflow: 'hidden',
  });
  ribbon.className = 'ribbon';

  const tabs = [
    { id: 'dashboard', label: 'Workbench Overview',  short: 'Workbenches', sub: 'View tool status for all benches' },
    { id: 'search',    label: 'Find a Tool',          short: 'Locate',      sub: 'Locate a tool across the lab'    },
    { id: 'cleanup',   label: 'Cleanup Routine',       short: 'Cleanup',    sub: 'Step-by-step lab organization'  },
  ];

  tabs.forEach(tab => {
    const active = currentView === tab.id;
    const btn = el('button', {
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      alignItems: 'flex-start', gap: '1px',
      background: 'transparent', border: 'none',
      borderBottom: active ? '2px solid ' + C.accent : '2px solid transparent',
      padding: '0 20px',
      marginBottom: '-2px',
      transition: 'border-color 0.15s',
    });
    btn.className = 'ribbon-tab';

    const fullLabel = el('span', {
      fontSize: '13px', fontWeight: '700',
      color: active ? C.accent : C.text,
    }, { text: tab.label });
    fullLabel.className = 'ribbon-tab-full';
    btn.appendChild(fullLabel);

    const shortLabel = el('span', {
      fontSize: '13px', fontWeight: '700',
      color: active ? C.accent : C.text,
    }, { text: tab.short });
    shortLabel.className = 'ribbon-tab-short';
    btn.appendChild(shortLabel);

    const subLabel = el('span', {
      fontSize: '11px', color: C.textMuted,
    }, { text: tab.sub });
    subLabel.className = 'ribbon-tab-sub';
    btn.appendChild(subLabel);

    btn.addEventListener('mouseenter', () => {
      if (!active) s(btn, { borderBottomColor: C.borderStrong });
    });
    btn.addEventListener('mouseleave', () => {
      if (!active) s(btn, { borderBottomColor: 'transparent' });
    });

    btn.addEventListener('click', () => {
      if (currentView !== tab.id) {
        previousView = currentView;
        currentView = tab.id;
        localStorage.setItem('frith_currentView', currentView);
        if (tab.id === 'search')  searchState = { step: 0, query: '', results: [], chosen: null };
        if (tab.id === 'cleanup') cleanupState = { step: 0, moves: [], checkedMoves: new Set() };
        if (tab.id === 'log')     loadLog().then(render);
        render();
      }
    });

    ribbon.appendChild(btn);
  });

  const spacer = el('div', { flex: '1' });
  spacer.className = 'ribbon-spacer';
  ribbon.appendChild(spacer);

  // Workstation selector
  const wsWrap = el('div', { display: 'flex', alignItems: 'center', gap: '8px', alignSelf: 'center', marginRight: '14px', flexShrink: '0' });
  const benchLabel = el('span', { fontSize: '11px', fontWeight: '600', color: C.textMuted }, { text: 'My Bench:' });
  benchLabel.className = 'ribbon-bench-label';
  wsWrap.appendChild(benchLabel);
  const wsSelect = el('select', {
    padding: '5px 10px', borderRadius: '6px', fontSize: '12px', fontWeight: '600',
    border: '1px solid ' + C.border, background: C.surface, color: C.text,
  });
  wsSelect.className = 'ribbon-ws-select';
  const noneOpt = el('option', {}, { text: 'None' });
  noneOpt.value = '';
  wsSelect.appendChild(noneOpt);
  workbenches.forEach(wb => {
    const opt = el('option', {}, { text: 'Bench ' + wb.id });
    opt.value = String(wb.id);
    if (myWorkstation === wb.id) opt.selected = true;
    wsSelect.appendChild(opt);
  });
  wsSelect.addEventListener('change', () => {
    myWorkstation = wsSelect.value ? parseInt(wsSelect.value, 10) : null;
    render();
  });
  wsWrap.appendChild(wsSelect);
  ribbon.appendChild(wsWrap);

  const refreshBtn = el('button', {
    alignSelf: 'center',
    padding: '6px 14px', borderRadius: '6px',
    border: '1px solid ' + C.border,
    background: C.surface, color: C.text,
    fontSize: '12px', fontWeight: '600',
  });
  refreshBtn.className = 'ribbon-refresh-btn';
  const refreshText = el('span', {}, { text: '\u21bb  Refresh' });
  refreshText.className = 'ribbon-refresh-text';
  refreshBtn.appendChild(refreshText);
  // Mobile: show only the icon when text is hidden
  const refreshIcon = el('span', { display: 'none' }, { text: '\u21bb' });
  refreshIcon.className = 'ribbon-refresh-icon';
  refreshBtn.appendChild(refreshIcon);
  refreshBtn.addEventListener('click', async () => {
    s(refreshBtn, { opacity: '0.5', pointerEvents: 'none' });
    await loadWorkbenches();
    render();
  });
  ribbon.appendChild(refreshBtn);

  // Issue 5: Movement Log as small icon button instead of a tab
  const logBtn = el('button', {
    alignSelf: 'center',
    width: '32.5px', height: '32.5px', borderRadius: '6px',
    border: currentView === 'log' ? '2px solid ' + C.accent : '1px solid ' + C.border,
    background: currentView === 'log' ? C.accentLight : C.surface,
    padding: '4px',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    marginLeft: '8px',
    cursor: 'pointer',
  });
  logBtn.className = 'ribbon-log-btn';
  logBtn.setAttribute('title', 'Movement Log');
  const logImg = el('img', {
    width: '22px', height: '22px', objectFit: 'contain',
  });
  logImg.setAttribute('src', 'movement-log.png');
  logImg.setAttribute('alt', 'Movement Log');
  logBtn.appendChild(logImg);
  logBtn.addEventListener('click', () => {
    if (currentView === 'log') {
      // Toggle back to the previous tab
      currentView = previousView || 'dashboard';
      previousView = null;
      localStorage.setItem('frith_currentView', currentView);
      render();
    } else {
      previousView = currentView;
      currentView = 'log';
      localStorage.setItem('frith_currentView', currentView);
      loadLog().then(render);
      render();
    }
  });
  logBtn.addEventListener('mouseenter', () => s(logBtn, { opacity: '0.82' }));
  logBtn.addEventListener('mouseleave', () => s(logBtn, { opacity: '1' }));
  ribbon.appendChild(logBtn);

  return ribbon;
}

// =============================================================================
//  VIEW 1 — Dashboard  (Gestalt-compliant bench rows)
//
//  Gestalt principles applied:
//  • Proximity    — tool dots clustered tightly together per bench
//  • Similarity   — every row has identical column structure
//  • Common Region — each row is a contained horizontal band
//  • Figure/Ground — alternating very-subtle row tinting
//  • Continuity   — left-to-right reading: Bench# → dots → issue count → toggle
//  • Closure      — bordered table container completes the grid visually
// =============================================================================
function renderDashboard(root) {
  // Header row with Expand All toggle
  const hdrRow = el('div', {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    marginBottom: '16px', gap: '16px',
  });
  const hdrText = el('div', {});
  hdrText.appendChild(el('h2', { fontSize: '18px', fontWeight: '700', color: C.text, marginBottom: '4px' },
    { text: 'Workbench Overview' }));
  hdrText.appendChild(el('p', { fontSize: '13px', color: C.textMuted },
    { text: 'Each row shows one workbench. Hover dots for tool name. Expand a bench to see full details.' }));
  hdrRow.appendChild(hdrText);

  const allExpanded = workbenches.length > 0 && workbenches.every(wb => expandedBenches.has(wb.id));
  const expandAllBtn = mkBtn(allExpanded ? 'Collapse All' : 'Expand All', 'outline', C.text, () => {
    if (allExpanded) expandedBenches.clear();
    else workbenches.forEach(wb => expandedBenches.add(wb.id));
    render();
  });
  hdrRow.appendChild(expandAllBtn);
  root.appendChild(hdrRow);

  root.appendChild(buildDotLegend());

  const table = el('div', {
    background: C.surface,
    border: '1px solid ' + C.border,
    borderRadius: '10px',
    overflow: 'hidden',
    marginTop: '16px',
  });

  const COLS = '72px 1fr 90px 130px 36px';
  const colHdr = el('div', {
    display: 'grid', gridTemplateColumns: COLS,
    alignItems: 'center', padding: '10px 20px',
    background: C.surfaceAlt, borderBottom: '1px solid ' + C.border,
  });
  ['BENCH', 'TOOL INVENTORY', 'ISSUES', 'STATUS', ''].forEach(label => {
    colHdr.appendChild(el('span', {
      fontSize: '10px', fontWeight: '700', color: C.textMuted, letterSpacing: '0.8px',
    }, { text: label }));
  });
  table.appendChild(colHdr);

  workbenches.forEach((wb, i) => table.appendChild(buildBenchRow(wb, i)));

  root.appendChild(table);
}

function buildDotLegend() {
  const wrap = el('div', { display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'center' });
  [
    { color: C.dotOk,    label: 'Present',                       filled: true  },
    { color: C.dotIssue, label: 'Issue — missing or duplicate',  filled: false },
  ].forEach(({ color, label, filled }) => {
    const item = el('div', { display: 'flex', alignItems: 'center', gap: '7px', fontSize: '12px', color: C.textMuted });
    item.appendChild(makeDot(color, filled));
    item.appendChild(el('span', {}, { text: label }));
    wrap.appendChild(item);
  });
  return wrap;
}

function makeDot(color, filled) {
  return el('div', {
    width: '9px', height: '9px', borderRadius: '50%', flexShrink: '0',
    background: filled ? color : 'transparent',
    border: '2px solid ' + color,
  });
}

function buildBenchRow(wb, index) {
  const isExpanded = expandedBenches.has(wb.id);
  const even = index % 2 === 0;
  const COLS = '72px 1fr 90px 130px 36px';

  const wrapper = el('div', { borderBottom: '1px solid ' + C.border });

  const row = el('div', {
    display: 'grid', gridTemplateColumns: COLS,
    alignItems: 'center', padding: '12px 20px',
    background: wb.inUse ? C.accentLight : (even ? C.surface : C.surfaceAlt),
    transition: 'background 0.15s', minHeight: '52px',
  });

  // Col 1: Bench number
  const numWrap = el('div', { display: 'flex', flexDirection: 'column', gap: '2px' });
  numWrap.appendChild(el('span', {
    fontSize: '14px', fontWeight: '700', color: C.text,
  }, { text: 'B' + wb.id }));
  if (wb.inUse) {
    numWrap.appendChild(el('span', {
      fontSize: '9px', fontWeight: '700', color: C.accent, letterSpacing: '0.6px',
    }, { text: 'IN USE' }));
  }
  row.appendChild(numWrap);

  // Col 2: Tool dots
  const dotsWrap = el('div', { display: 'flex', flexWrap: 'wrap', gap: '5px', alignItems: 'center' });
  Object.entries(wb.inventory).forEach(([tool, info]) => {
    const hasIssue = info.count === 0 || info.count > 1;
    const dot = makeDot(hasIssue ? C.dotIssue : C.dotOk, !hasIssue);
    dot.setAttribute('title', tool + ': ' + (
      info.count === 0 ? 'Missing' :
      info.count > 1   ? '\u00d7' + info.count + ' (duplicate)' : 'Present'
    ));
    s(dot, { cursor: 'default' });
    dotsWrap.appendChild(dot);
  });
  row.appendChild(dotsWrap);

  // Col 3: Issue count
  const issues = Object.values(wb.inventory)
    .filter(i => i.count === 0 || i.count > 1).length;
  const issueCell = el('div');
  issueCell.appendChild(el('span', {
    fontSize: '12px', fontWeight: issues > 0 ? '700' : '400',
    color: issues > 0 ? C.danger : C.textLight,
  }, { text: issues > 0 ? issues + ' issue' + (issues > 1 ? 's' : '') : 'OK' }));
  row.appendChild(issueCell);

  // Col 4: In-use toggle
  const toggleBtn = el('button', {
    padding: '5px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: '700',
    background: wb.inUse ? C.accentLight : C.surface,
    color: wb.inUse ? C.accent : C.textMuted,
    border: '1px solid ' + (wb.inUse ? C.accent : C.border),
    transition: 'all 0.15s', whiteSpace: 'nowrap',
  }, { text: wb.inUse ? 'Mark Free' : 'Mark In Use' });
  toggleBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    s(toggleBtn, { opacity: '0.5', pointerEvents: 'none' });
    await PATCH('/api/workbenches/' + wb.id + '/inuse', { inUse: !wb.inUse });
    await loadWorkbenches();
    render();
  });
  row.appendChild(toggleBtn);

  // Col 5: Expand toggle
  const expandBtn = el('button', {
    width: '28px', height: '28px', borderRadius: '5px',
    background: isExpanded ? C.accentLight : 'transparent',
    border: '1px solid ' + (isExpanded ? C.accent : C.border),
    color: isExpanded ? C.accent : C.textLight,
    fontSize: '11px', display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.15s',
  }, { text: isExpanded ? '\u25b2' : '\u25bc' });
  expandBtn.addEventListener('click', () => {
    if (expandedBenches.has(wb.id)) expandedBenches.delete(wb.id);
    else expandedBenches.add(wb.id);
    render();
  });
  row.appendChild(expandBtn);

  wrapper.appendChild(row);
  if (isExpanded) wrapper.appendChild(buildExpandedPanel(wb));
  return wrapper;
}

// ─── Per-bench expanded detail panel ─────────────────────────────────────────
//   Col 1: tool name — normal text if present, bold red if any issue
//   Col 2: bench IDs with a duplicate copy of this tool
//   Col 3: MOVE TOOL — dropdown to pick destination bench, then move
function buildExpandedPanel(wb) {
  const panel = el('div', {
    padding: '14px 24px 18px',
    background: C.surfaceAlt,
    borderTop: '1px solid ' + C.border,
    display: 'grid',
    gridTemplateColumns: '200px 180px auto',
    columnGap: '12px',
  });

  // Column headers
  panel.appendChild(el('span', {
    fontSize: '10px', fontWeight: '700', color: C.textMuted, letterSpacing: '0.7px',
    paddingBottom: '8px', display: 'block',
  }, { text: 'TOOL' }));
  panel.appendChild(el('span', {
    fontSize: '10px', fontWeight: '700', color: C.textMuted, letterSpacing: '0.7px',
    paddingBottom: '8px', display: 'block',
  }, { text: 'DUPLICATES AT BENCH' }));
  panel.appendChild(el('span', {
    fontSize: '10px', fontWeight: '700', color: C.textMuted, letterSpacing: '0.7px',
    paddingBottom: '8px', display: 'block',
  }, { text: "MOVE TOOL FROM:" }));

  // One row per tool
  Object.entries(wb.inventory).forEach(([tool, info]) => {
    const isMissing = info.count === 0;
    const hasIssue  = isMissing || info.count > 1;
    const suffix    = isMissing ? ' \u2014 missing' : info.count > 1 ? ' \u00d7' + info.count : '';

    // Col 1: tool name (Issue 4: keep name + status on one line for clarity)
    const toolNameCell = el('div', {
      padding: '3px 0', display: 'flex', alignItems: 'center', gap: '6px',
      whiteSpace: 'nowrap', overflow: 'hidden',
    });
    toolNameCell.appendChild(el('span', {
      fontSize: '13px', fontWeight: hasIssue ? '700' : '400',
      color: hasIssue ? C.danger : C.text,
    }, { text: tool }));
    if (suffix) {
      toolNameCell.appendChild(el('span', {
        fontSize: '11px', fontWeight: '700',
        color: C.danger,
        padding: '1px 6px', borderRadius: '4px',
        background: C.danger + '14',
        flexShrink: '0',
      }, { text: suffix.replace(' \u2014 ', '').replace(' ', '') }));
    }
    panel.appendChild(toolNameCell);

    // Col 2: if this bench is missing the tool, show benches that have duplicates (count > 1)
    let dupText = '';
    if (isMissing) {
      dupText = workbenches
        .filter(w => w.id !== wb.id && w.inventory[tool] && w.inventory[tool].count > 1)
        .map(w => 'B' + w.id)
        .join(', ');
    }
    panel.appendChild(el('span', {
      fontSize: '13px', color: dupText ? C.accent : C.textLight,
      padding: '3px 0', display: 'block',
    }, { text: dupText || '\u2014' }));

    // Col 3: Move controls — FROM dropdown + qty selector → TO this bench
    //   Move button only appears when a source bench is selected.
    //   Re-selecting the blank "—" option hides qty + button again.
    const moveCell = el('div', { padding: '1px 0', display: 'flex', alignItems: 'center', gap: '6px' });

    const fromSelect = el('select', {
      padding: '3px 6px', borderRadius: '5px', fontSize: '11px',
      border: '1px solid ' + C.border, background: C.surface, color: C.text,
    });
    const blankOpt = el('option', {}, { text: '\u2014' });
    blankOpt.value = '';
    fromSelect.appendChild(blankOpt);
    workbenches.forEach(w => {
      if (w.id === wb.id) return;
      if (!w.inventory[tool] || w.inventory[tool].count === 0) return;
      const opt = el('option', {}, { text: 'B' + w.id + ' (\u00d7' + w.inventory[tool].count + ')' });
      opt.value = String(w.id);
      fromSelect.appendChild(opt);
    });
    moveCell.appendChild(fromSelect);

    // Arrow label (always visible, low contrast)
    moveCell.appendChild(el('span', { fontSize: '11px', color: C.textLight }, { text: '\u2192 B' + wb.id }));

    // Qty + Move button placeholder — shown only when a source is selected
    const moveDetailsSlot = el('div', { display: 'flex', alignItems: 'center', gap: '6px' });
    moveCell.appendChild(moveDetailsSlot);

    // Undo slot — shows undo button after a successful move
    const undoSlot = el('div', {});
    moveCell.appendChild(undoSlot);
    if (lastMove && lastMove.tool === tool && lastMove.to === wb.id) {
      const elapsed = Date.now() - lastMove.time;
      const alreadyFaded = elapsed >= 5000;
      const undoBtn = mkBtn('Undo (\u00d7' + lastMove.count + ')', 'outline',
        alreadyFaded ? C.textLight : C.danger, async () => {
        s(undoBtn, { opacity: '0.4', pointerEvents: 'none' });
        await POST('/api/move', { tool: lastMove.tool, from: lastMove.to, to: lastMove.from, count: lastMove.count });
        lastMove = null;
        await loadWorkbenches();
        render();
      }, {
        padding: '4px 10px', fontSize: '11px',
        transition: 'color 3s, border-color 3s, opacity 3s',
        opacity: alreadyFaded ? '0.5' : '1',
        borderColor: alreadyFaded ? C.border : undefined,
      });
      undoSlot.appendChild(undoBtn);
      if (!alreadyFaded) {
        const remaining = 1500 - elapsed;
        setTimeout(() => {
          s(undoBtn, { color: C.textLight, borderColor: C.border, opacity: '0.5' });
        }, remaining);
      }
    }

    fromSelect.addEventListener('change', () => {
      moveDetailsSlot.innerHTML = '';
      if (!fromSelect.value) return;
      const srcId = parseInt(fromSelect.value, 10);
      const srcWb = workbenches.find(w => w.id === srcId);
      const srcCount = srcWb ? srcWb.inventory[tool].count : 0;

      // Qty selector
      const qtySelect = el('select', {
        padding: '3px 6px', borderRadius: '5px', fontSize: '11px',
        border: '1px solid ' + C.border, background: C.surface, color: C.text,
      });
      for (let n = 1; n <= srcCount; n++) {
        const opt = el('option', {}, { text: String(n) });
        opt.value = String(n);
        qtySelect.appendChild(opt);
      }
      moveDetailsSlot.appendChild(qtySelect);

      const moveBtn = mkBtn('Move', C.accent, '#fff', async () => {
        const qty = parseInt(qtySelect.value, 10);
        s(moveBtn, { opacity: '0.4', pointerEvents: 'none' });
        await POST('/api/move', { tool, from: srcId, to: wb.id, count: qty });
        lastMove = { tool, from: srcId, to: wb.id, count: qty, time: Date.now() };
        await loadWorkbenches();
        render();
      }, { padding: '4px 10px', fontSize: '11px' });
      moveDetailsSlot.appendChild(moveBtn);
    });

    panel.appendChild(moveCell);
  });

  return panel;
}

// =============================================================================
//  VIEW 2 — HTA 1: Find a Tool
// =============================================================================
function renderSearch(root) {
  root.appendChild(buildStepBar(
    ['Initial Search', 'Dashboard Verification', 'Acquisition'],
    searchState.step
  ));
  const panel = el('div', { maxWidth: '640px', margin: '28px auto 0' });
  root.appendChild(panel);

  if (searchState.step === 0)      renderSearchStep0(panel);
  else if (searchState.step === 1) renderSearchStep1(panel);
  else if (searchState.step === 2) renderSearchStep2(panel);
  else                             renderSearchDone(panel);
}

function buildStepBar(steps, current) {
  const wrap = el('div', {
    display: 'flex', alignItems: 'stretch',
    background: C.surface, borderRadius: '8px',
    border: '1px solid ' + C.border, overflow: 'hidden',
  });
  steps.forEach((label, i) => {
    const active = i === current;
    const done   = i < current;
    const step = el('div', {
      flex: '1', display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '12px 8px', gap: '4px',
      background: active ? C.accentLight : C.surface,
      borderRight: i < steps.length - 1 ? '1px solid ' + C.border : 'none',
    });
    const num = el('div', {
      width: '22px', height: '22px', borderRadius: '50%',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '11px', fontWeight: '700',
      background: active ? C.accent : done ? C.success : C.border,
      color: '#fff',
    }, { text: done ? '\u2713' : String(i + 1) });
    step.appendChild(num);
    step.appendChild(el('span', {
      fontSize: '11px', fontWeight: '600',
      color: active ? C.accent : done ? C.success : C.textMuted,
    }, { text: label }));
    wrap.appendChild(step);
  });
  return wrap;
}

function renderSearchStep0(panel) {
  sectionTitle(panel, 'Enter Tool Name');
  sectionDesc(panel, '(or select from list below)');

  const row = el('div', { display: 'flex', gap: '10px', marginTop: '18px' });
  const input = el('input', {
    flex: '1', padding: '10px 14px', borderRadius: '7px',
    background: C.surface, border: '1px solid ' + C.border,
    color: C.text, fontSize: '14px',
  });
  input.setAttribute('placeholder', 'e.g. AA Battery-Controlled Telescopic Knife');
  input.setAttribute('type', 'text');
  input.setAttribute('spellcheck', 'true');
  input.value = searchState.query;

  const goNext = () => {
    if (!searchState.query) { s(input, { borderColor: C.danger }); return; }
    searchState.step = 1;
    buildSearchResults();
    render();
  };

  input.addEventListener('input', e => {
    searchState.query = e.target.value.trim();
    renderToolList(toolListWrap, searchState.query);
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') goNext(); });
  input.addEventListener('focus', () => s(input, { borderColor: C.accent }));
  input.addEventListener('blur',  () => s(input, { borderColor: C.border }));

  row.appendChild(input);
  row.appendChild(mkBtn('Checked — go to Dashboard \u2192', C.accent, '#fff', goNext));
  panel.appendChild(row);
  panel.appendChild(el('p', { fontSize: '12px', color: C.textMuted, marginTop: '10px' },
    { text: 'If your drawer is missing the tool you seek, please proceed.' }));

  // Tool list below search — alphabetically sorted, filters as user types
  const toolListWrap = el('div', { marginTop: '20px' });
  panel.appendChild(toolListWrap);
  renderToolList(toolListWrap, searchState.query);

  // Focus input after render
  requestAnimationFrame(() => input.focus());
}

function renderToolList(container, query) {
  container.innerHTML = '';

  // Aggregate QTY across all benches per tool
  const toolMap = {};
  workbenches.forEach(wb => {
    Object.entries(wb.inventory).forEach(([tool, info]) => {
      if (!toolMap[tool]) toolMap[tool] = 0;
      toolMap[tool] += info.count;
    });
  });

  // Sort alphabetically, then filter by query
  let tools = Object.entries(toolMap).sort((a, b) => a[0].localeCompare(b[0]));
  if (query) {
    const q = query.toLowerCase();
    tools = tools.filter(([name]) => name.toLowerCase().includes(q));
  }

  if (tools.length === 0) return;

  // Table header
  const hdr = el('div', {
    display: 'grid', gridTemplateColumns: '1fr 90px',
    padding: '8px 14px', borderBottom: '1px solid ' + C.border,
  });
  hdr.appendChild(el('span', { fontSize: '10px', fontWeight: '700', color: C.textMuted, letterSpacing: '0.7px' }, { text: 'TOOL NAME' }));
  hdr.appendChild(el('span', { fontSize: '10px', fontWeight: '700', color: C.textMuted, letterSpacing: '0.7px', textAlign: 'right' }, { text: 'QTY IN INVENTORY' }));
  container.appendChild(hdr);

  tools.forEach(([name, qty], i) => {
    const row = el('div', {
      display: 'grid', gridTemplateColumns: '1fr 90px',
      padding: '7px 14px',
      background: i % 2 === 0 ? C.surface : C.surfaceAlt,
      borderBottom: '1px solid ' + C.border,
      cursor: 'pointer',
    });
    row.appendChild(el('span', { fontSize: '13px', color: C.text }, { text: name }));
    row.appendChild(el('span', { fontSize: '13px', color: qty > 0 ? C.text : C.danger, fontWeight: qty === 0 ? '700' : '400', textAlign: 'right' }, { text: String(qty) }));
    // Issue 3: Double-click to autofill/select the tool
    row.addEventListener('dblclick', () => {
      searchState.query = name;
      searchState.step = 1;
      buildSearchResults();
      render();
    });
    row.addEventListener('mouseenter', () => s(row, { background: C.accentLight }));
    row.addEventListener('mouseleave', () => s(row, { background: i % 2 === 0 ? C.surface : C.surfaceAlt }));
    container.appendChild(row);
  });
}

function buildSearchResults() {
  const q = searchState.query.toLowerCase();
  searchState.results = workbenches.map(wb => {
    const match = Object.entries(wb.inventory).find(([tool]) => tool.toLowerCase().includes(q));
    if (!match) return null;
    return { wb, tool: match[0], info: match[1] };
  }).filter(Boolean);
}

function renderSearchStep1(panel) {
  sectionTitle(panel, 'Results for "' + searchState.query + '"');
  sectionDesc(panel, 'Showing all benches that contain "' + searchState.query + '."');

  if (searchState.results.length === 0) {
    panel.appendChild(infoBox('No benches have "' + searchState.query + '" in their inventory.', C.danger));
    panel.appendChild(mkBtn('\u2190 Start over', 'outline', C.text, () => {
      searchState = { step: 0, query: '', results: [], chosen: null };
      render();
    }, { marginTop: '14px' }));
    return;
  }

  const available   = searchState.results.filter(r => r.info.count > 0 && !r.wb.inUse);
  const unavailable = searchState.results.filter(r => r.info.count === 0 || r.wb.inUse);

  if (available.length === 0) {
    panel.appendChild(infoBox('All instances of this tool are missing or on in-use benches.', C.textMuted));
  }

  const listWrap = el('div', { marginTop: '14px', display: 'flex', flexDirection: 'column', gap: '6px' });
  [...available, ...unavailable].forEach(r => {
    const avail = r.info.count > 0 && !r.wb.inUse;
    const row = el('div', {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 16px', borderRadius: '8px',
      background: C.surface, border: '1px solid ' + C.border,
      opacity: avail ? '1' : '0.55', gap: '12px',
    });
    const info = el('div', { display: 'flex', flexDirection: 'column', gap: '4px' });
    info.appendChild(el('span', { fontSize: '14px', fontWeight: '700', color: C.text },
      { text: 'Bench ' + r.wb.id }));
    const tagRow = el('div', { display: 'flex', gap: '6px', flexWrap: 'wrap' });
    if (r.wb.inUse)       tagRow.appendChild(statusTag('In Use',   C.accent));
    if (r.info.count === 0) tagRow.appendChild(statusTag('Missing', C.danger));
    if (r.info.count > 1) tagRow.appendChild(statusTag('\u00d7' + r.info.count, C.accent));
    if (avail)            tagRow.appendChild(statusTag('Available', C.success));
    info.appendChild(tagRow);
    row.appendChild(info);
    if (avail) {
      if (!myWorkstation) {
        row.appendChild(el('span', { fontSize: '11px', color: C.textMuted, fontStyle: 'italic' }, { text: 'Select My Bench first' }));
      } else if (r.wb.id === myWorkstation) {
        row.appendChild(el('span', { fontSize: '11px', color: C.textMuted, fontStyle: 'italic' }, { text: 'This is your bench' }));
      } else {
        row.appendChild(mkBtn('Move to Bench ' + myWorkstation, C.accent, '#fff', async () => {
          searchState.chosen = r;
          await POST('/api/move', { tool: r.tool, from: r.wb.id, to: myWorkstation, count: 1 });
          await loadWorkbenches();
          searchState.step = 2;
          render();
        }));
      }
    } else {
      row.appendChild(el('span', { fontSize: '12px', color: C.textMuted }, { text: 'Unavailable' }));
    }
    listWrap.appendChild(row);
  });
  panel.appendChild(listWrap);
}

function renderSearchStep2(panel) {
  const r = searchState.chosen;
  sectionTitle(panel, 'Step 3 — Acquire the Tool');
  const card = el('div', {
    marginTop: '16px', padding: '24px', borderRadius: '10px',
    background: C.surface, border: '2px solid ' + C.accent,
    display: 'flex', flexDirection: 'column', gap: '12px',
  });
  card.appendChild(el('p', { fontSize: '20px', fontWeight: '700', color: C.text }, { text: r.tool }));
  card.appendChild(el('p', { fontSize: '14px', color: C.textMuted }, { text: 'From Bench ' + r.wb.id + ' \u2192 Bench ' + myWorkstation }));
  card.appendChild(infoBox(
    'Verify that you are taking "' + r.tool + '" from Bench ' + r.wb.id + ' to your bench (Bench ' + myWorkstation + '). The move has been recorded in the system.',
    C.accent
  ));
  panel.appendChild(card);
  const btnRow = el('div', { display: 'flex', gap: '10px', marginTop: '18px' });
  btnRow.appendChild(mkBtn('\u2713 Confirmed \u2014 Tool Retrieved', C.success, '#fff', () => {
    searchState.step = 3; render();
  }));
  btnRow.appendChild(mkBtn('\u2717 Wrong Tool \u2014 Undo', 'outline', C.danger, async () => {
    await POST('/api/move', { tool: r.tool, from: myWorkstation, to: r.wb.id, count: 1 });
    await loadWorkbenches();
    searchState.step = 1; searchState.chosen = null;
    buildSearchResults(); render();
  }));
  panel.appendChild(btnRow);
}

function renderSearchDone(panel) {
  const r = searchState.chosen;
  const card = el('div', {
    marginTop: '20px', padding: '32px', borderRadius: '10px',
    background: C.surface, border: '1px solid ' + C.border,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', textAlign: 'center',
  });
  card.appendChild(el('span', { fontSize: '36px', color: C.success }, { text: '\u2713' }));
  card.appendChild(el('p', { fontSize: '18px', fontWeight: '700', color: C.success }, { text: 'Tool Retrieved' }));
  card.appendChild(el('p', { fontSize: '13px', color: C.textMuted },
    { text: r.tool + ' moved from Bench ' + r.wb.id + (myWorkstation ? ' to Bench ' + myWorkstation : '') + ' \u2014 recorded in system.' }));
  card.appendChild(mkBtn('Search for another tool', C.accent, '#fff', () => {
    searchState = { step: 0, query: '', results: [], chosen: null }; render();
  }));
  panel.appendChild(card);
}

// =============================================================================
//  VIEW 3 — Cleanup Routine (HTA 2 — step-by-step with checksheet squares)
// =============================================================================
function renderCleanup(root) {
  const STEPS = ['Mark In-Use Benches', 'Need Assessment', 'Cleanup Checksheet', 'Confirm'];
  root.appendChild(buildStepBar(STEPS, cleanupState.step));
  const panel = el('div', { maxWidth: '900px', margin: '24px auto 0' });
  root.appendChild(panel);
  if      (cleanupState.step === 0) renderCleanupStep0(panel);
  else if (cleanupState.step === 1) renderCleanupStep1(panel);
  else if (cleanupState.step === 2) renderCleanupStep2(panel);
  else                              renderCleanupStep3(panel);
}

// Step 0 — Mark which benches are currently in use (grid of bench squares)
function renderCleanupStep0(panel) {
  sectionTitle(panel, 'Step 1 \u2014 Mark Benches In Use');
  sectionDesc(panel, 'Tap each bench currently occupied by a student group. These will be excluded from the cleanup plan.');

  const grid = el('div', {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))',
    gap: '10px', marginTop: '18px',
  });

  workbenches.forEach(wb => {
    const card = el('button', {
      padding: '16px 8px', borderRadius: '8px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px',
      background: wb.inUse ? C.accent : C.surface,
      border: '1px solid ' + (wb.inUse ? C.accent : C.border),
      color: wb.inUse ? '#fff' : C.textMuted,
      transition: 'all 0.15s',
    });
    card.appendChild(el('span', { fontSize: '20px', fontWeight: '700', color: 'inherit' }, { text: String(wb.id) }));
    card.appendChild(el('span', { fontSize: '10px', fontWeight: '700', letterSpacing: '0.5px', color: 'inherit' },
      { text: wb.inUse ? 'IN USE' : 'FREE' }));
    card.addEventListener('click', async () => {
      await PATCH('/api/workbenches/' + wb.id + '/inuse', { inUse: !wb.inUse });
      await loadWorkbenches();
      render();
    });
    grid.appendChild(card);
  });
  panel.appendChild(grid);

  const footer = el('div', { display: 'flex', justifyContent: 'flex-end', marginTop: '24px' });
  footer.appendChild(mkBtn('Next \u2192', C.accent, '#fff', async () => {
    const result = await GET('/api/cleanup');
    cleanupState.moves = result.moves;
    cleanupState.checkedMoves = new Set();
    cleanupState.step = 1;
    render();
  }));
  panel.appendChild(footer);
}

// Step 1 — Need assessment
function renderCleanupStep1(panel) {
  sectionTitle(panel, 'Step 2 \u2014 Need Assessment');
  const inUseCnt  = workbenches.filter(w => w.inUse).length;
  const activeCnt = workbenches.length - inUseCnt;
  sectionDesc(panel, activeCnt + ' bench' + (activeCnt !== 1 ? 'es' : '') + ' active — ' + inUseCnt + ' in use.');

  if (cleanupState.moves.length === 0) {
    panel.appendChild(infoBox('All active benches have correct inventory. No cleanup needed.', C.success));
    const row = el('div', { display: 'flex', gap: '10px', marginTop: '18px' });
    row.appendChild(mkBtn('\u2190 Back', 'outline', C.text, () => { cleanupState.step = 0; render(); }));
    row.appendChild(mkBtn('Done', C.success, '#fff', () => {
      cleanupState = { step: 0, moves: [], checkedMoves: new Set() }; render();
    }));
    panel.appendChild(row);
    return;
  }

  const moveCount = cleanupState.moves.length;
  panel.appendChild(infoBox(
    moveCount + ' tool move' + (moveCount > 1 ? 's' : '') + ' required to balance available benches.',
    C.accent
  ));

  const row = el('div', { display: 'flex', gap: '10px', marginTop: '20px' });
  row.appendChild(mkBtn('\u2190 Back', 'outline', C.text, () => { cleanupState.step = 0; render(); }));
  row.appendChild(mkBtn('Begin Cleanup \u2192', C.accent, '#fff', () => { cleanupState.step = 2; render(); }));
  panel.appendChild(row);
}

// Step 2 — Checksheet of move squares (tap to check off in any order)
function renderCleanupStep2(panel) {
  sectionTitle(panel, 'Step 3 \u2014 Cleanup Checksheet');
  const total   = cleanupState.moves.length;
  const checked = cleanupState.checkedMoves.size;
  sectionDesc(panel, checked + ' of ' + total + ' tasks marked complete. Tap any square to check it off.');

  // Thin progress bar
  const track = el('div', {
    height: '4px', background: C.border, borderRadius: '2px', overflow: 'hidden',
    margin: '12px 0 20px',
  });
  const fill = el('div', {
    height: '100%', borderRadius: '2px',
    background: checked === total ? C.success : C.accent,
    width: (total > 0 ? Math.round((checked / total) * 100) : 0) + '%',
    transition: 'width 0.3s',
  });
  track.appendChild(fill);
  panel.appendChild(track);

  // Grid of task squares
  const grid = el('div', {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(172px, 1fr))',
    gap: '12px',
  });

  cleanupState.moves.forEach((move, idx) => {
    const done = cleanupState.checkedMoves.has(idx);

    const square = el('button', {
      padding: '16px', borderRadius: '8px',
      display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '10px',
      background: done ? C.accentLight : C.surface,
      border: '1px solid ' + (done ? C.accent : C.border),
      textAlign: 'left', transition: 'all 0.15s', width: '100%',
    });

    // Top row: check circle (right-aligned)
    const topRow = el('div', {
      display: 'flex', justifyContent: 'flex-end', width: '100%',
    });
    const circle = el('div', {
      width: '22px', height: '22px', borderRadius: '50%', flexShrink: '0',
      background: done ? C.accent : 'transparent',
      border: '2px solid ' + (done ? C.accent : C.border),
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: '12px', color: '#fff', fontWeight: '700',
    }, { text: done ? '\u2713' : '' });
    topRow.appendChild(circle);
    square.appendChild(topRow);

    // Tool name
    square.appendChild(el('span', {
      fontSize: '13px', fontWeight: '700',
      color: done ? C.textMuted : C.text,
      textDecoration: done ? 'line-through' : 'none',
    }, { text: move.tool }));

    // From → To bench indicators
    const arrowRow = el('div', { display: 'flex', alignItems: 'center', gap: '6px' });
    arrowRow.appendChild(el('span', {
      fontSize: '12px', fontWeight: '700',
      color: done ? C.textLight : C.text,
    }, { text: 'B' + move.from }));
    arrowRow.appendChild(el('span', { fontSize: '12px', color: C.textLight }, { text: '\u2192' }));
    arrowRow.appendChild(el('span', {
      fontSize: '12px', fontWeight: '700',
      color: done ? C.textLight : C.accent,
    }, { text: 'B' + move.to }));
    square.appendChild(arrowRow);

    if (move.count > 1) {
      square.appendChild(el('span', { fontSize: '11px', color: C.textMuted },
        { text: '\u00d7' + move.count + ' units' }));
    }

    square.addEventListener('click', () => {
      if (cleanupState.checkedMoves.has(idx)) cleanupState.checkedMoves.delete(idx);
      else cleanupState.checkedMoves.add(idx);
      render();
    });
    grid.appendChild(square);
  });
  panel.appendChild(grid);

  const footer = el('div', { display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '24px' });
  footer.appendChild(mkBtn('\u2190 Back', 'outline', C.text, () => { cleanupState.step = 1; render(); }));
  footer.appendChild(mkBtn(
    checked === total ? 'Confirm \u2192' : 'Skip to Confirm \u2192',
    checked === total ? C.success : C.accent,
    '#fff',
    () => { cleanupState.step = 3; render(); }
  ));
  panel.appendChild(footer);
}

// Step 3 — Confirm
function renderCleanupStep3(panel) {
  sectionTitle(panel, 'Step 4 \u2014 Confirm');
  const total    = cleanupState.moves.length;
  const checked  = cleanupState.checkedMoves.size;
  const complete = checked === total;

  panel.appendChild(infoBox(
    complete
      ? 'All ' + total + ' moves confirmed. Verify each bench drawer matches the dashboard.'
      : checked + ' of ' + total + ' moves were marked done.',
    complete ? C.success : C.accent
  ));

  const footer = el('div', { display: 'flex', gap: '10px', marginTop: '22px' });
  footer.appendChild(mkBtn('\u2190 Back to Checksheet', 'outline', C.text, () => { cleanupState.step = 2; render(); }));

  // Apply moves to persistent inventory
  footer.appendChild(mkBtn('\u2713 Apply & Finish', C.success, '#fff', async () => {
    await POST('/api/cleanup/apply', { moves: cleanupState.moves });
    await loadWorkbenches();
    cleanupState = { step: 0, moves: [], checkedMoves: new Set() };
    currentView = 'dashboard';
    render();
  }));

  footer.appendChild(mkBtn('Discard & Start Over', 'outline', C.text, () => {
    cleanupState = { step: 0, moves: [], checkedMoves: new Set() }; render();
  }));
  panel.appendChild(footer);
}

// =============================================================================
//  VIEW 4 — Movement Log
// =============================================================================
function renderLog(root) {
  const hdr = el('div', { marginBottom: '20px' });
  hdr.appendChild(el('h2', { fontSize: '18px', fontWeight: '700', color: C.text, marginBottom: '4px' },
    { text: 'Movement Log' }));
  hdr.appendChild(el('p', { fontSize: '13px', color: C.textMuted },
    { text: 'Chronological record of all tool movements. Most recent first.' }));
  root.appendChild(hdr);

  if (movementLog.length === 0) {
    root.appendChild(infoBox('No movements recorded yet.', C.textMuted));
    return;
  }

  const table = el('div', {
    background: C.surface, border: '1px solid ' + C.border,
    borderRadius: '10px', overflow: 'hidden',
  });

  const COLS = '160px 1fr 80px 80px 60px 80px';
  const colHdr = el('div', {
    display: 'grid', gridTemplateColumns: COLS,
    alignItems: 'center', padding: '10px 16px',
    background: C.surfaceAlt, borderBottom: '1px solid ' + C.border,
  });
  colHdr.className = 'log-row';
  const colLabels = [
    { text: 'TIME',  cls: '' },
    { text: 'TOOL',  cls: '' },
    { text: 'FROM',  cls: 'log-col-from' },
    { text: 'TO',    cls: 'log-col-to' },
    { text: 'QTY',   cls: '' },
    { text: 'TYPE',  cls: '' },
  ];
  colLabels.forEach(col => {
    const span = el('span', {
      fontSize: '10px', fontWeight: '700', color: C.textMuted, letterSpacing: '0.8px',
    }, { text: col.text });
    if (col.cls) span.className = col.cls;
    colHdr.appendChild(span);
  });
  table.appendChild(colHdr);

  // Reverse for most-recent-first
  const entries = [...movementLog].reverse();
  entries.forEach((entry, i) => {
    const row = el('div', {
      display: 'grid', gridTemplateColumns: COLS,
      alignItems: 'center', padding: '9px 16px',
      background: i % 2 === 0 ? C.surface : C.surfaceAlt,
      borderBottom: '1px solid ' + C.border,
    });
    row.className = 'log-row';
    const dt = entry.time ? new Date(entry.time) : null;
    const timeStr = dt ? dt.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '\u2014';
    row.appendChild(el('span', { fontSize: '12px', color: C.textMuted }, { text: timeStr }));
    row.appendChild(el('span', { fontSize: '13px', color: C.text }, { text: entry.tool }));
    const fromSpan = el('span', { fontSize: '13px', fontWeight: '600', color: C.text }, { text: 'B' + entry.from });
    fromSpan.className = 'log-col-from';
    row.appendChild(fromSpan);
    const toSpan = el('span', { fontSize: '13px', fontWeight: '600', color: C.accent }, { text: 'B' + entry.to });
    toSpan.className = 'log-col-to';
    row.appendChild(toSpan);
    row.appendChild(el('span', { fontSize: '13px', color: C.text }, { text: String(entry.count) }));
    const typeColor = entry.type === 'cleanup' ? C.success : C.accent;
    row.appendChild(statusTag(entry.type || 'move', typeColor));
    table.appendChild(row);
  });

  root.appendChild(table);
}

// =============================================================================
//  Shared UI utilities
// =============================================================================
function sectionHeading(parent, title, desc) {
  const hdr = el('div', { marginBottom: '20px' });
  hdr.appendChild(el('h2', { fontSize: '18px', fontWeight: '700', color: C.text, marginBottom: '4px' }, { text: title }));
  if (desc) hdr.appendChild(el('p', { fontSize: '13px', color: C.textMuted }, { text: desc }));
  parent.appendChild(hdr);
}
function sectionTitle(parent, text) {
  parent.appendChild(el('h2', { fontSize: '17px', fontWeight: '700', color: C.text, marginBottom: '6px' }, { text }));
}
function sectionDesc(parent, text) {
  parent.appendChild(el('p', { fontSize: '13px', color: C.textMuted, marginBottom: '4px' }, { text }));
}
function infoBox(text, color) {
  return el('div', {
    padding: '12px 16px', borderRadius: '7px', marginTop: '12px',
    background: color + '14', border: '1px solid ' + color + '55',
    fontSize: '13px', color,
  }, { text });
}
function statusTag(label, color) {
  return el('span', {
    fontSize: '10px', fontWeight: '700', padding: '2px 8px',
    borderRadius: '99px', background: color + '14',
    color, border: '1px solid ' + color + '33',
    whiteSpace: 'nowrap',
  }, { text: label });
}
function mkBtn(label, bg, color, onClick, extraStyles = {}) {
  const b = el('button', {
    padding: '8px 16px', borderRadius: '7px', fontSize: '13px', fontWeight: '700',
    background: bg === 'outline' ? C.surface : bg,
    color,
    border: bg === 'outline' ? '1px solid ' + color : '1px solid transparent',
    transition: 'opacity 0.15s', whiteSpace: 'nowrap',
    ...extraStyles,
  }, { text: label });
  b.addEventListener('click', onClick);
  b.addEventListener('mouseenter', () => s(b, { opacity: '0.82' }));
  b.addEventListener('mouseleave', () => s(b, { opacity: '1' }));
  return b;
}

// =============================================================================
//  Bootstrap
// =============================================================================
async function init() {
  injectGlobalStyles();
  await loadWorkbenches();
  await loadLog();
  render();
}

init();
