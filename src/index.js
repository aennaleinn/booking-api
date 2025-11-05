const express = require("express");
const path = require("path");
const { PrismaClient } = require("@prisma/client");

const app = express();
const prisma = new PrismaClient();

const CWD = process.cwd();
const PUBLIC_DIR = path.resolve(CWD, "public");

console.log("Server booting from:", __filename);
console.log("process.cwd():      ", CWD);
console.log("PUBLIC_DIR:         ", PUBLIC_DIR);

app.use(express.json());

// Debug-Logger
app.use((req, _res, next) => {
  console.log("REQ:", req.method, req.path);
  next();
});

// Statische Dateien
app.use(express.static(PUBLIC_DIR));

// Health
app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, db: "up" });
  } catch {
    res.status(500).json({ ok: false, db: "down" });
  }
});

// ---------------- RESSOURCEN ----------------
app.get("/api/resources", async (_req, res) => {
  try {
    const list = await prisma.resource.findMany({ orderBy: { name: "asc" } });
    res.json(list);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "internal_error" });
  }
});

app.post("/api/resources", async (req, res) => {
  const { name, location, capacity, active = true } = req.body || {};
  if (!name) return res.status(400).json({ error: "name required" });

  const created = await prisma.resource.create({
    data: { name, location, capacity, active }
  });
  res.status(201).json(created);
});

// ---------------- BUCHUNGEN ----------------
async function hasConflict(resourceId, startAt, endAt, excludeId) {
  const conflict = await prisma.booking.findFirst({
    where: {
      resourceId,
      status: "confirmed",
      ...(excludeId ? { id: { not: excludeId } } : {}),
      NOT: [
        { endAt: { lte: startAt } },
        { startAt: { gte: endAt } }
      ]
    },
    select: { id: true }
  });
  return Boolean(conflict);
}

app.get("/api/bookings", async (req, res) => {
  const { rid, from, to } = req.query;
  const where = {};
  if (rid) where.resourceId = Number(rid);
  if (from || to) {
    where.AND = [];
    if (from) where.AND.push({ endAt: { gte: new Date(String(from)) } });
    if (to) where.AND.push({ startAt: { lte: new Date(String(to)) } });
  }
  const list = await prisma.booking.findMany({ where, orderBy: { startAt: "asc" } });
  res.json(list);
});

app.post("/api/bookings", async (req, res) => {
  const { resourceId, title, startAt, endAt, createdBy } = req.body || {};
  if (!resourceId || !title || !startAt || !endAt || !createdBy)
    return res.status(400).json({ error: "missing fields" });

  const start = new Date(startAt);
  const end = new Date(endAt);
  if (end <= start) return res.status(400).json({ error: "invalid time range" });

  const resource = await prisma.resource.findUnique({ where: { id: Number(resourceId) } });
  if (!resource || resource.active === false)
    return res.status(400).json({ error: "resource not found or inactive" });

  if (await hasConflict(Number(resourceId), start, end))
    return res.status(409).json({ error: "time conflict" });

  const created = await prisma.booking.create({
    data: { resourceId: Number(resourceId), title, startAt: start, endAt: end, createdBy }
  });
  res.status(201).json(created);
});

app.delete("/api/bookings/:id", async (req, res) => {
  const id = Number(req.params.id);
  try {
    const updated = await prisma.booking.update({
      where: { id },
      data: { status: "cancelled" }
    });
    res.json(updated);
  } catch {
    res.status(404).json({ error: "not found" });
  }
});

// Start
const PORT = 8080;
const HOST = "127.0.0.1";
app.listen(PORT, HOST, () => console.log(`API läuft auf http://${HOST}:${PORT}`));
