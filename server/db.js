const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const isProduction = process.env.NODE_ENV === 'production';
const dbPath = isProduction
  ? path.join(process.cwd(), 'platform.db')
  : path.join(__dirname, '..', 'data', 'platform.db');

function initDb() {
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user' CHECK (role IN ('guest', 'user', 'admin')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS projects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS industries (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      short_name TEXT,
      description TEXT,
      accent TEXT
    );

    CREATE TABLE IF NOT EXISTS object_types (
      id TEXT PRIMARY KEY,
      industry_id TEXT NOT NULL,
      name TEXT NOT NULL,
      short_name TEXT,
      description TEXT,
      icon TEXT,
      defaults TEXT,
      FOREIGN KEY (industry_id) REFERENCES industries(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS solution_types (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS solutions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      vendor TEXT,
      type TEXT,
      solution_type_id TEXT,
      category TEXT,
      subtype TEXT,
      description TEXT,
      features TEXT,
      applicable_to TEXT,
      throughput REAL,
      payload REAL,
      accuracy REAL,
      operating_hours REAL,
      footprint REAL,
      autonomy REAL,
      reliability REAL,
      labor_reduction REAL,
      productivity_lift REAL,
      co2_reduction REAL,
      power_kw REAL,
      implementation_months REAL,
      price REAL,
      source TEXT,
      source_date TEXT,
      verified INTEGER DEFAULT 0,
      rating REAL,
      market_potential REAL,
      region TEXT,
      industry TEXT,
      status TEXT,
      fit REAL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (solution_type_id) REFERENCES solution_types(id)
    );

    CREATE TABLE IF NOT EXISTS parameters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      object_type_id TEXT NOT NULL,
      key TEXT NOT NULL,
      label TEXT NOT NULL,
      unit TEXT,
      param_min REAL,
      param_max REAL,
      default_value REAL,
      description TEXT,
      source TEXT,
      is_required INTEGER DEFAULT 1,
      sort_order INTEGER DEFAULT 0,
      FOREIGN KEY (object_type_id) REFERENCES object_types(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS catalog_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT,
      url TEXT,
      last_updated TEXT,
      status TEXT DEFAULT 'active'
    );

    CREATE TABLE IF NOT EXISTS recommendation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      object_type_id TEXT,
      params TEXT,
      recommendations TEXT,
      selected_solution_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_solutions_type ON solutions(type);
    CREATE INDEX IF NOT EXISTS idx_solutions_applicable ON solutions(applicable_to);
    CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);
    CREATE INDEX IF NOT EXISTS idx_parameters_object ON parameters(object_type_id);
    CREATE INDEX IF NOT EXISTS idx_solutions_industry ON solutions(industry);
  `);

  return db;
}

function getDb() {
  if (!global.db) {
    global.db = initDb();
  }
  return global.db;
}

module.exports = { initDb, getDb, dbPath };
