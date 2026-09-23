const express = require('express');
const { getDb } = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const db = getDb();
  const industries = db.prepare('SELECT * FROM industries ORDER BY name').all();
  const objectTypes = db.prepare('SELECT * FROM object_types ORDER BY industry_id, name').all();
  const solutionTypes = db.prepare('SELECT * FROM solution_types ORDER BY name').all();

  const result = industries.map(ind => ({
    ...ind,
    objectTypes: objectTypes.filter(ot => ot.industry_id === ind.id).map(ot => {
      try { ot.defaults = JSON.parse(ot.defaults || '{}'); } catch(e) { ot.defaults = {}; }
      return ot;
    }),
  }));

  res.json({ industries: result, solutionTypes });
});

router.get('/solutions', (req, res) => {
  const { object_type, type, search, min_fit, limit = 50, offset = 0 } = req.query;
  const db = getDb();
  let query = 'SELECT * FROM solutions WHERE 1=1';
  const params = [];

  if (object_type) {
    query += ' AND (applicable_to LIKE ? OR applicable_to = ?)';
    params.push(`%${object_type}%`, object_type);
  }
  if (type) {
    query += ' AND (type = ? OR solution_type_id = ?)';
    params.push(type, type);
  }
  if (search) {
    query += ' AND (name LIKE ? OR vendor LIKE ? OR description LIKE ?)';
    const like = `%${search}%`;
    params.push(like, like, like);
  }
  if (min_fit) {
    query += ' AND fit >= ?';
    params.push(parseFloat(min_fit));
  }

  const count = db.prepare(`SELECT COUNT(*) as cnt FROM (${query})`).get(...params).cnt;
  const solutions = db.prepare(`${query} ORDER BY fit DESC, price ASC LIMIT ? OFFSET ?`).all(...params, parseInt(limit), parseInt(offset));

  solutions.forEach(s => {
    try { s.features = JSON.parse(s.features || '[]'); } catch(e) { s.features = []; }
    if (s.throughput !== null) s.throughput = Number(s.throughput);
    if (s.payload !== null) s.payload = Number(s.payload);
    if (s.price !== null) s.price = Number(s.price);
  });

  res.json({ solutions, total: count, limit: parseInt(limit), offset: parseInt(offset) });
});

router.get('/solutions/:id', (req, res) => {
  const db = getDb();
  const sol = db.prepare('SELECT * FROM solutions WHERE id = ?').get(req.params.id);
  if (!sol) return res.status(404).json({ error: 'Решение не найдено' });
  try { sol.features = JSON.parse(sol.features || '[]'); } catch(e) { sol.features = []; }
  res.json(sol);
});

router.get('/solution-types', (req, res) => {
  const db = getDb();
  const types = db.prepare('SELECT * FROM solution_types ORDER BY name').all();
  const solTypes = db.prepare(`
    SELECT solution_type_id, COUNT(*) as count FROM solutions 
    WHERE solution_type_id IS NOT NULL GROUP BY solution_type_id
  `).all();
  const solTypeMap = {};
  solTypes.forEach(t => { solTypeMap[t.solution_type_id] = t.count; });
  types.forEach(t => { t.solution_count = solTypeMap[t.id] || 0; });
  res.json(types);
});

module.exports = router;
