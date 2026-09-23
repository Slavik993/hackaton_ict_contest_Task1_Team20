module.exports = {
  JWT_SECRET: process.env.JWT_SECRET || 'roboplatform-hackathon-2026-secret-key',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '30d',
  PORT: parseInt(process.env.PORT, 10) || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  DB_PATH: process.env.DB_PATH || undefined,
  UPLOAD_DIR: process.env.UPLOAD_DIR || 'public/uploads',
  MAX_UPLOAD_SIZE: 10 * 1024 * 1024,
  CATALOG_CSV: process.env.CATALOG_CSV || 'catalog_export_v4.csv',
  DATASETS_XLSX: process.env.DATASETS_XLSX || 'Датасеты_хакатон.xlsx',
  CATALOG_EXPORT_V5: process.env.CATALOG_EXPORT_V5 || 'catalog_export_v5.xlsx',
};
