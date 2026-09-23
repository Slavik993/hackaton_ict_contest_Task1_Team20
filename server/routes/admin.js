const express = require('express');
const { getDb } = require('../db');
const { authenticate } = require('../middleware/auth');
const { authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', (req, res) => {
  const db = getDb();
  const solutions = db.prepare('SELECT id, name, vendor, type, category, subtype, status, fit, price, source, verified FROM solutions ORDER BY fit DESC').all();
  solutions.forEach(s => {
    if (s.price !== null) s.price = Number(s.price);
  });
  res.json(solutions);
});

router.get('/:id', (req, res) => {
  const db = getDb();
  const sol = db.prepare('SELECT * FROM solutions WHERE id = ?').get(req.params.id);
  if (!sol) return res.status(404).json({ error: 'Решение не найдено' });
  try { sol.features = JSON.parse(sol.features || '[]'); } catch(e) { sol.features = []; }
  res.json(sol);
});

router.post('/', authenticate, authorize('admin'), (req, res) => {
  const s = req.body;
  if (!s.id || !s.name) return res.status(400).json({ error: 'id и name обязательны' });
  const db = getDb();
  try {
    db.prepare(`
      INSERT INTO solutions (id, name, vendor, type, solution_type_id, category, subtype, description,
        features, applicable_to, throughput, payload, accuracy, operating_hours, footprint, autonomy,
        reliability, labor_reduction, productivity_lift, co2_reduction, power_kw, implementation_months,
        price, source, source_date, verified, rating, market_potential, region, industry, status, fit)
      VALUES (@id, @name, @vendor, @type, @solution_type_id, @category, @subtype, @description,
        @features, @applicable_to, @throughput, @payload, @accuracy, @operating_hours, @footprint,
        @autonomy, @reliability, @labor_reduction, @productivity_lift, @co2_reduction, @power_kw,
        @implementation_months, @price, @source, @source_date, @verified, @rating, @market_potential,
        @region, @industry, @status, @fit)
    `).run({
      ...s,
      features: Array.isArray(s.features) ? JSON.stringify(s.features) : (s.features || '[]'),
      source_date: s.source_date || new Date().toISOString().split('T')[0],
      verified: s.verified || 0,
      fit: s.fit || 0,
    });
    res.json({ id: s.id });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT') return res.status(409).json({ error: 'Решение с таким ID уже существует' });
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

router.put('/:id', authenticate, authorize('admin'), (req, res) => {
  const db = getDb();
  const s = req.body;
  const existing = db.prepare('SELECT id FROM solutions WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Решение не найдено' });

  const fields = [];
  const params = [req.params.id];
  const allowedFields = ['name', 'vendor', 'type', 'solution_type_id', 'category', 'subtype', 'description',
    'features', 'applicable_to', 'throughput', 'payload', 'accuracy', 'operating_hours', 'footprint',
    'autonomy', 'reliability', 'labor_reduction', 'productivity_lift', 'co2_reduction', 'power_kw',
    'implementation_months', 'price', 'source', 'source_date', 'verified', 'rating', 'market_potential',
    'region', 'industry', 'status', 'fit'];
  allowedFields.forEach(f => {
    if (s[f] !== undefined) {
      fields.push(`${f} = ?`);
      if (f === 'features' && Array.isArray(s[f])) params.push(JSON.stringify(s[f]));
      else params.push(s[f]);
    }
  });

  if (fields.length === 0) return res.json({ id: req.params.id });
  params.push(req.params.id);
  db.prepare(`UPDATE solutions SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...params);
  res.json({ id: req.params.id });
});

router.delete('/:id', authenticate, authorize('admin'), (req, res) => {
  const db = getDb();
  const info = db.prepare('DELETE FROM solutions WHERE id = ?').run(req.params.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Решение не найдено' });
  res.json({ success: true });
});

router.get('/sources/all', (req, res) => {
  const db = getDb();
  const sources = db.prepare('SELECT DISTINCT source, source_date, COUNT(*) as count, SUM(verified) as verified FROM solutions GROUP BY source ORDER BY count DESC').all();
  res.json(sources);
});

module.exports = router;
