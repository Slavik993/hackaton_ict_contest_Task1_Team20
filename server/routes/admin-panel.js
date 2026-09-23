const express = require('express');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
const uploadDir = path.join(__dirname, '..', '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

router.post('/catalog', authenticate, authorize('admin'), (req, res) => {
  const { source, data } = req.body;
  if (!Array.isArray(data)) return res.status(400).json({ error: 'data должен быть массивом' });
  const db = getDb();
  let imported = 0;

  const insert = db.prepare(`
    INSERT OR REPLACE INTO solutions 
    (id, name, vendor, type, solution_type_id, category, subtype, description, features,
     applicable_to, throughput, payload, accuracy, operating_hours, footprint, autonomy,
     reliability, labor_reduction, productivity_lift, co2_reduction, power_kw, implementation_months,
     price, source, source_date, verified, rating, market_potential, region, industry, status, fit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((solutions) => {
    for (const s of solutions) {
      insert.run(
        s.id || `import_${Date.now()}_${imported}`, s.name, s.vendor || '', s.type || '',
        s.solution_type_id || s.type || 'mobile', s.category || '', s.subtype || '',
        s.description || '', JSON.stringify(s.features || []), s.applicable_to || '',
        s.throughput || null, s.payload || null, s.accuracy || null, s.operating_hours || null,
        s.footprint || null, s.autonomy || null, s.reliability || null, s.labor_reduction || null,
        s.productivity_lift || null, s.co2_reduction || null, s.power_kw || null,
        s.implementation_months || 6, s.price || null, source || s.source || 'Импорт',
        new Date().toISOString().split('T')[0], s.verified || 0, s.rating || null,
        s.market_potential || null, s.region || '', s.industry || '', s.status || '',
        s.fit || 0
      );
      imported++;
    }
  });

  try {
    insertMany(data);
    db.prepare('INSERT INTO catalog_sources (name, type, url, last_updated, status) VALUES (?, ?, ?, ?, ?)')
      .run(source || 'Импорт', 'manual', '', new Date().toISOString().split('T')[0], 'active');
    res.json({ imported, message: `Импортировано ${imported} решений` });
  } catch (e) {
    console.error('Import error:', e);
    res.status(500).json({ error: 'Ошибка импорта', details: e.message });
  }
});

router.get('/', authenticate, authorize('admin'), (req, res) => {
  const db = getDb();
  const projects = db.prepare('SELECT id, name, user_id, created_at, updated_at FROM projects ORDER BY created_at DESC').all();
  const projectList = projects.map(p => {
    const user = db.prepare('SELECT email, name FROM users WHERE id = ?').get(p.user_id);
    return { ...p, userEmail: user?.email, userName: user?.name };
  });
  res.json({ projects: projectList });
});

router.get('/params/:objectTypeId', (req, res) => {
  const db = getDb();
  const params = db.prepare('SELECT * FROM parameters WHERE object_type_id = ? ORDER BY sort_order').all(req.params.objectTypeId);
  res.json(params);
});

router.put('/params/:id', authenticate, authorize('admin'), (req, res) => {
  const db = getDb();
  const p = req.body;
  const fields = [];
  const vals = [];
  ['label', 'unit', 'param_min', 'param_max', 'default_value', 'description', 'source', 'is_required', 'sort_order']
    .forEach(f => { if (p[f] !== undefined) { fields.push(`${f} = ?`); vals.push(p[f]); } });
  if (!fields.length) return res.json({ id: req.params.id });
  vals.push(req.params.id);
  db.prepare(`UPDATE parameters SET ${fields.join(', ')} WHERE id = ?`).run(...vals);
  res.json({ id: req.params.id });
});

module.exports = router;
