const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const config = require('./config');
const { initDb, getDb } = require('./server/db');
const { seed } = require('./server/services/seed');
const { authenticate, authorize } = require('./server/middleware/auth');

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname)));  // serve index.html, app.js, data.js, styles.css from root

if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
  fs.mkdirSync(path.join(__dirname, 'uploads'), { recursive: true });
}

app.use('/api/auth', require('./server/routes/auth'));
app.use('/api/catalog', require('./server/routes/catalog'));
app.use('/api/calculation', require('./server/routes/calculation'));
app.use('/api/projects', authenticate, require('./server/routes/projects'));
app.use('/api/admin', authenticate, authorize('admin'), require('./server/routes/admin'));
app.use('/api/admin-panel', authenticate, authorize('admin'), require('./server/routes/admin-panel'));
app.use('/api/export', require('./server/routes/export'));
app.use('/api/import', require('./server/routes/upload'));
app.use('/api/recommendations', require('./server/routes/recommendations'));
app.use('/api/videos', require('./server/routes/videos'));

app.post('/api/upload', authenticate, (req, res) => {
  res.status(400).json({ error: 'Use /api/import/catalog for file uploads' });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/videos', express.static(path.join(__dirname, 'public', 'videos')));

// SPA fallback — only for non-API, non-static routes
app.get('*', (req, res) => {
  // Skip API routes, static files
  if (req.path.startsWith('/api/') || req.path.startsWith('/videos/') || req.path.includes('.')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

async function start() {
  initDb();
  await seed();
  app.listen(config.PORT, () => {
    console.log(`RoboPlatform server running on http://localhost:${config.PORT}`);
  });
}

start().catch(e => { console.error('Failed to start:', e); process.exit(1); });
