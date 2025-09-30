const express = require("express");
const app = express();
app.use(express.json());

// --- In-Memory-Daten (persistieren nicht, reichen für Demo/Tests) ---
let resources = [];   // { id, name, location, capacity, active }
let bookings  = [];   // { id, resourceId, title, startAt, endAt, createdBy, status }
let nextResId = 1;
let nextBkId  = 1;

// Health
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// ---------------- Ressourcen ----------------
app.get("/api/resources", (_req, res) => {
  res.json(resources);
});

app.post("/api/resources", (req, res) => {
  const { name, location, capacity, active = true } = req.body || {};
  if (!name) return res.status(400).json({ error: "name required" });
  const item = { id: nextResId++, name, location, capacity, active };
  resources.push(item);
  res.status(201).json(item);
});

app.patch("/api/resources/:id", (req, res) => {
  const id = Number(req.params.id);
  const r = resources.find(x => x.id === id);
  if (!r) return res.status(404).json({ error: "not found" });
  const patch = req.body || {};
  Object.assign(r, patch);
  res.json(r);
});

// ---------------- Buchungen ----------------
// Hilfsfunktion: prüfen, ob sich Zeiträume überschneiden
function hasConflict(resourceId, startAt, endAt, excludeId) {
  const start = new Date(startAt).getTime();
  const end   = new Date(endAt).getTime();
  return bookings.some(b =>
    b.resourceId === resourceId &&
    b.status === "confirmed" &&
    b.id !== excludeId &&
    !(new Date(b.endAt).getTime() <= start || new Date(b.startAt).getTime() >= end)
  );
}

// Liste + Filter (rid, from, to)
app.get("/api/bookings", (req, res) => {
  const { rid, from, to } = req.query;
  let list = bookings;
  if (rid) list = list.filter(b => b.resourceId === Number(rid));
  if (from) list = list.filter(b => new Date(b.endAt) >= new Date(from));
  if (to)   list = list.filter(b => new Date(b.startAt) <= new Date(to));
  list = list.sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
  res.json(list);
});

app.post("/api/bookings", (req, res) => {
  const { resourceId, title, startAt, endAt, createdBy } = req.body || {};
  if (!resourceId || !title || !startAt || !endAt || !createdBy)
    return res.status(400).json({ error: "missing fields" });
  if (new Date(endAt) <= new Date(startAt))
    return res.status(400).json({ error: "invalid time range" });

  const r = resources.find(r => r.id === Number(resourceId) && r.active !== false);
  if (!r) return res.status(400).json({ error: "resource not found or inactive" });

  if (hasConflict(Number(resourceId), startAt, endAt))
    return res.status(409).json({ error: "time conflict" });

  const item = {
    id: nextBkId++,
    resourceId: Number(resourceId),
    title,
    startAt: new Date(startAt).toISOString(),
    endAt: new Date(endAt).toISOString(),
    createdBy,
    status: "confirmed"
  };
  bookings.push(item);
  res.status(201).json(item);
});

app.patch("/api/bookings/:id", (req, res) => {
  const id = Number(req.params.id);
  const b = bookings.find(x => x.id === id);
  if (!b) return res.status(404).json({ error: "not found" });

  const patch = req.body || {};
  const start = patch.startAt ? new Date(patch.startAt) : new Date(b.startAt);
  const end   = patch.endAt   ? new Date(patch.endAt)   : new Date(b.endAt);
  if (end <= start) return res.status(400).json({ error: "invalid time range" });

  // Konflikt prüfen, wenn Zeiten geändert werden oder wieder bestätigt wird
  if (patch.startAt || patch.endAt || patch.status === "confirmed") {
    if (hasConflict(b.resourceId, start.toISOString(), end.toISOString(), id))
      return res.status(409).json({ error: "time conflict" });
  }

  Object.assign(b, patch, { startAt: start.toISOString(), endAt: end.toISOString() });
  res.json(b);
});

// Storno (soft delete)
app.delete("/api/bookings/:id", (req, res) => {
  const id = Number(req.params.id);
  const b = bookings.find(x => x.id === id);
  if (!b) return res.status(404).json({ error: "not found" });
  b.status = "cancelled";
  res.json(b);
});

const PORT = 8080;
app.listen(PORT, () => console.log(`API läuft auf http://localhost:${PORT}`));
