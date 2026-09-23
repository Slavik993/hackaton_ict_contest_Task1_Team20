const JWT_SECRET = process.env.JWT_SECRET || 'roboplatform-hackathon-2026-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '30d';
const PORT = parseInt(process.env.PORT, 10) || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024;
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'public/uploads';
const DB_PATH = process.env.DB_PATH || undefined;
const CATALOG_CSV = process.env.CATALOG_CSV || 'catalog_export_v4.csv';
const DATASETS_XLSX = process.env.DATASETS_XLSX || 'Датасеты_хакатон.xlsx';
const CATALOG_EXPORT_V5 = process.env.CATALOG_EXPORT_V5 || 'catalog_export_v5.xlsx';

module.exports = {
  JWT_SECRET,
  JWT_EXPIRES_IN,
  PORT,
  NODE_ENV,
  MAX_FILE_SIZE,
  UPLOAD_DIR,
  DB_PATH,
  CATALOG_CSV,
  DATASETS_XLSX,
  CATALOG_EXPORT_V5,
  MAX_UPLOAD_SIZE: MAX_FILE_SIZE,
};
