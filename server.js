const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Persistence ──────────────────────────────────────────────────────────────
const DATA_DIR  = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'inventory.json');
const LOG_FILE  = path.join(DATA_DIR, 'movement-log.json');

// ─── Initial mock data ───────────────────────────────────────────────────────
const STANDARD_TOOLS = [
  'Multimeter',
  'Wire Stripper',
  'Needle-Nose Pliers',
  'Diagonal Cutters',
  'Screwdriver (Flathead)',
  'Screwdriver (Phillips)',
  'Breadboard',
  'Jumper Wires',
  'Soldering Iron',
  'Helping Hands',
];

function makeWorkbench(id) {
  const inventory = {};
  STANDARD_TOOLS.forEach((tool) => {
    const r = Math.random();
    if (r < 0.15) {
      inventory[tool] = { count: 0 };
    } else if (r < 0.25) {
      inventory[tool] = { count: 2 };
    } else {
      inventory[tool] = { count: 1 };
    }
  });
  return { id, inUse: false, inventory };
}

function loadState() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (_) { /* fall through to generate fresh data */ }
  return { workbenches: Array.from({ length: 12 }, (_, i) => makeWorkbench(i + 1)) };
}

function saveState() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(state, null, 2));
}

function loadLog() {
  try {
    if (fs.existsSync(LOG_FILE)) {
      return JSON.parse(fs.readFileSync(LOG_FILE, 'utf-8'));
    }
  } catch (_) {}
  return [];
}

function appendLog(entries) {
  const log = loadLog();
  log.push(...entries);
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(LOG_FILE, JSON.stringify(log, null, 2));
}

const state = loadState();
// Strip any leftover 'borrowed' fields from old data
state.workbenches.forEach((wb) => {
  Object.values(wb.inventory).forEach((info) => { delete info.borrowed; });
});
saveState();

// ─── API routes ───────────────────────────────────────────────────────────────

// GET all workbenches
app.get('/api/workbenches', (_req, res) => {
  res.json(state.workbenches);
});

// PATCH toggle in-use status
app.patch('/api/workbenches/:id/inuse', (req, res) => {
  const wb = state.workbenches.find((w) => w.id === parseInt(req.params.id, 10));
  if (!wb) return res.status(404).json({ error: 'Not found' });
  wb.inUse = req.body.inUse;
  saveState();
  res.json(wb);
});

// PATCH update tool count
app.patch('/api/workbenches/:id/tools/:tool/count', (req, res) => {
  const wb = state.workbenches.find((w) => w.id === parseInt(req.params.id, 10));
  if (!wb) return res.status(404).json({ error: 'Workbench not found' });
  const toolName = decodeURIComponent(req.params.tool);
  if (!wb.inventory[toolName]) return res.status(404).json({ error: 'Tool not found' });
  wb.inventory[toolName].count = Math.max(0, parseInt(req.body.count, 10));
  saveState();
  res.json(wb);
});

// GET cleanup routine — returns moves to balance tools across non-in-use workbenches
app.get('/api/cleanup', (_req, res) => {
  const active = state.workbenches.filter((wb) => !wb.inUse);
  const moves = [];

  STANDARD_TOOLS.forEach((tool) => {
    const surplus = active
      .filter((wb) => wb.inventory[tool].count > 1)
      .map((wb) => ({ wb, extra: wb.inventory[tool].count - 1 }));
    const deficit = active
      .filter((wb) => wb.inventory[tool].count === 0)
      .map((wb) => ({ wb, need: 1 }));

    let si = 0;
    let di = 0;
    while (si < surplus.length && di < deficit.length) {
      const give = Math.min(surplus[si].extra, deficit[di].need);
      moves.push({
        tool,
        from: surplus[si].wb.id,
        to: deficit[di].wb.id,
        count: give,
      });
      surplus[si].extra -= give;
      deficit[di].need -= give;
      if (surplus[si].extra === 0) si++;
      if (deficit[di].need === 0) di++;
    }
  });

  res.json({ moves, complete: moves.length === 0 });
});

// POST move a tool from one bench to another
app.post('/api/move', (req, res) => {
  const { tool, from, to, count } = req.body;
  if (!tool || !from || !to || !count) return res.status(400).json({ error: 'Missing fields' });
  const srcWb = state.workbenches.find((w) => w.id === from);
  const dstWb = state.workbenches.find((w) => w.id === to);
  if (!srcWb || !dstWb) return res.status(404).json({ error: 'Workbench not found' });
  const srcTool = srcWb.inventory[tool];
  const dstTool = dstWb.inventory[tool];
  if (!srcTool || !dstTool) return res.status(404).json({ error: 'Tool not found in inventory' });
  const moveQty = Math.min(count, srcTool.count);
  if (moveQty <= 0) return res.status(400).json({ error: 'No units to move' });
  srcTool.count -= moveQty;
  dstTool.count += moveQty;
  saveState();
  appendLog([{ tool, from, to, count: moveQty, type: 'move', time: new Date().toISOString() }]);
  res.json({ ok: true, moved: moveQty });
});

// POST apply all cleanup moves at once
app.post('/api/cleanup/apply', (req, res) => {
  const { moves } = req.body;
  if (!Array.isArray(moves)) return res.status(400).json({ error: 'moves must be an array' });
  const applied = [];
  moves.forEach((m) => {
    const srcWb = state.workbenches.find((w) => w.id === m.from);
    const dstWb = state.workbenches.find((w) => w.id === m.to);
    if (!srcWb || !dstWb) return;
    const srcTool = srcWb.inventory[m.tool];
    const dstTool = dstWb.inventory[m.tool];
    if (!srcTool || !dstTool) return;
    const qty = Math.min(m.count, srcTool.count);
    if (qty <= 0) return;
    srcTool.count -= qty;
    dstTool.count += qty;
    applied.push({ ...m, moved: qty });
  });
  saveState();
  if (applied.length > 0) {
    const ts = new Date().toISOString();
    appendLog(applied.map((a) => ({ tool: a.tool, from: a.from, to: a.to, count: a.moved, type: 'cleanup', time: ts })));
  }
  res.json({ ok: true, applied });
});

// GET movement log
app.get('/api/log', (_req, res) => {
  res.json(loadLog());
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = 3000;
app.listen(PORT, () => console.log(`Frith Lab Dashboard running at http://localhost:${PORT}`));
