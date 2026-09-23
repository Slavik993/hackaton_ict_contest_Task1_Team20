const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db');
const { JWT_SECRET, JWT_EXPIRES_IN } = require('../../config');

const router = express.Router();
const DEMO_CREDENTIALS = { guest: 'guest', admin: 'admin123', user: 'demo123' };

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(401).json({ error: 'Неверные учетные данные' });
  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Неверные учетные данные' });
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

router.post('/register', (req, res) => {
  const { email, password, name } = req.body;
  if (!email || !password || !name) return res.status(400).json({ error: 'Все поля обязательны' });
  if (password.length < 6) return res.status(400).json({ error: 'Пароль минимум 6 символов' });
  const db = getDb();
  try {
    const hash = bcrypt.hashSync(password, 10);
    const info = db.prepare('INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)')
      .run(email, name, hash, 'user');
    const token = jwt.sign({ id: info.lastInsertRowid, email, role: 'user' }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    res.json({ token, user: { id: info.lastInsertRowid, email, name, role: 'user' } });
  } catch (e) {
    res.status(409).json({ error: 'Пользователь с таким email уже существует' });
  }
});

router.post('/demo-login', (req, res) => {
  const { role } = req.body;
  const db = getDb();
  let email = 'demo@robplatform.local';
  if (role === 'admin') email = 'admin@robplatform.local';
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user) return res.status(404).json({ error: 'Демо-пользователь не найден' });
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

router.post('/guest', (req, res) => {
  const token = jwt.sign({ id: 0, email: 'guest', role: 'guest' }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  res.json({ token, user: { id: 0, email: 'guest', name: 'Гость', role: 'guest' } });
});

module.exports = router;
