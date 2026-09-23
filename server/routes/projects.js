const express = require('express');
const { getDb } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, (req, res) => {
  const db = getDb();
  const projects = db.prepare('SELECT id, name, data, created_at, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC').all(req.user.id);
  res.json({ projects: projects.map(p => ({
    id: p.id,
    name: p.name,
    data: JSON.parse(p.data || '{}'),
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  })) });
});

router.post('/', authenticate, (req, res) => {
  const { name, data } = req.body;
  if (!name) return res.status(400).json({ error: 'Имя проекта обязательно' });
  const db = getDb();
  const info = db.prepare('INSERT INTO projects (user_id, name, data) VALUES (?, ?, ?)').run(
    req.user.id, name, JSON.stringify(data || {})
  );
  res.json({ id: info.lastInsertRowid, name, data: data || {} });
});

router.get('/:id', authenticate, (req, res) => {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!project) return res.status(404).json({ error: 'Проект не найден' });
  try { project.data = JSON.parse(project.data || '{}'); } catch(e) { project.data = {}; }
  res.json(project);
});

router.put('/:id', authenticate, (req, res) => {
  const { name, data } = req.body;
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!project) return res.status(404).json({ error: 'Проект не найден' });
  db.prepare('UPDATE projects SET name = ?, data = ?, updated_at = datetime(\'now\') WHERE id = ?').run(
    name || project.name, JSON.stringify(data || {}), req.params.id
  );
  res.json({ id: req.params.id, name: name || project.name, data: data || {} });
});

router.delete('/:id', authenticate, (req, res) => {
  const db = getDb();
  const info = db.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (info.changes === 0) return res.status(404).json({ error: 'Проект не найден' });
  res.json({ success: true });
});

router.post('/:id/duplicate', authenticate, (req, res) => {
  const db = getDb();
  const project = db.prepare('SELECT * FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!project) return res.status(404).json({ error: 'Проект не найден' });
  const info = db.prepare('INSERT INTO projects (user_id, name, data) VALUES (?, ?, ?)').run(
    req.user.id, `${project.name} (копия)`, project.data
  );
  res.json({ id: info.lastInsertRowid, name: `${project.name} (копия)`, data: JSON.parse(project.data || '{}') });
});

module.exports = router;
