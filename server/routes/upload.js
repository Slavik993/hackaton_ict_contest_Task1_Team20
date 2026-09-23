const express = require('express');
const multer = require('multer');
const path = require('path');
const { getDb } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();
const upload = multer({
  dest: path.join(__dirname, '..', '..', 'uploads'),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.csv', '.xlsx', '.xls', '.json', '.pdf'].includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Неподдерживаемый формат файла'));
    }
  },
});

router.post('/catalog', authenticate, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
  res.json({
    filename: req.file.filename,
    originalname: req.file.originalname,
    size: req.file.size,
    path: req.file.path,
  });
});

router.post('/projects', authenticate, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Файл не загружен' });
  res.json({
    filename: req.file.filename,
    originalname: req.file.originalname,
    size: req.file.size,
  });
});

module.exports = router;
