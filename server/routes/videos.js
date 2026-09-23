const express = require('express');
const path = require('path');
const fs = require('fs');
const {
  generateAllRobotVideos,
  generateAllCategoryVideos,
  readCatalogRobots,
  getVideoList,
  getRobotVideoList,
  getVideoMeta,
  CATEGORIES,
  VIDEOS_DIR,
} = require('../services/video-generator');

const router = express.Router();

// Глобальное состояние генерации (для SSE /progress)
let generationState = {
  running: false,
  current: 0,
  total: 0,
  currentName: '',
  success: 0,
  failed: 0,
  startedAt: null,
  finishedAt: null,
  error: null,
};

/**
 * GET /api/videos/list
 * Полный список сгенерированных видео (роботов + категорий).
 */
router.get('/list', (req, res) => {
  try {
    const { robotVideos, categoryVideos } = getVideoList();
    res.json({
      videos: [...robotVideos, ...categoryVideos],
      robotVideos,
      categoryVideos,
      categories: CATEGORIES,
      total: robotVideos.length + categoryVideos.length,
    });
  } catch (err) {
    console.error('videos/list error:', err);
    res.status(500).json({ error: 'Не удалось получить список видео' });
  }
});

/**
 * GET /api/videos/robots
 * Список роботов из каталога + информация о наличии видео
 * (exact /videos/{id}.mp4 или fallback по категории /videos/{category}.mp4).
 */
router.get('/robots', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 300;
    const robots = readCatalogRobots(limit);

    const result = robots.map((r) => {
      const videoPath = path.join(VIDEOS_DIR, `${r.id}.mp4`);
      const hasVideo = fs.existsSync(videoPath) && fs.statSync(videoPath).size > 10000;
      const categoryVideoPath = path.join(VIDEOS_DIR, `${r.category}.mp4`);
      const hasCategory = fs.existsSync(categoryVideoPath) && fs.statSync(categoryVideoPath).size > 10000;

      return {
        id: r.id,
        name: r.name,
        vendor: r.vendor,
        category: r.category,
        rawCategory: r.rawCategory,
        hasExactVideo: hasVideo,
        hasCategoryVideo: hasCategory,
        videoUrl: hasVideo
          ? `/videos/${r.id}.mp4`
          : (hasCategory ? `/videos/${r.category}.mp4` : null),
      };
    });

    res.json({
      robots: result,
      total: result.length,
      withVideo: result.filter((r) => r.videoUrl).length,
    });
  } catch (err) {
    console.error('videos/robots error:', err);
    res.status(500).json({ error: 'Не удалось получить список роботов' });
  }
});

/**
 * GET /api/videos/meta/:id
 * Метаданные конкретного видео (из JSON-файла, если есть, иначе из fs).
 */
router.get('/meta/:id', (req, res) => {
  const id = req.params.id;
  const meta = getVideoMeta(id);
  const videoPath = path.join(VIDEOS_DIR, `${id}.mp4`);
  const exists = fs.existsSync(videoPath) && fs.statSync(videoPath).size > 10000;

  if (!meta && !exists) {
    return res.status(404).json({ error: 'Видео не найдено', id });
  }

  const stat = fs.statSync(videoPath);
  res.json({
    id,
    name: meta?.name || id,
    vendor: meta?.vendor || '',
    category: meta?.category || '',
    color: meta?.color || '',
    shape: meta?.shape || '',
    url: `/videos/${id}.mp4`,
    duration: meta?.duration || 10,
    frameRate: meta?.frameRate || 24,
    size: stat.size,
    sizeKB: Math.round(stat.size / 1024),
    modified: stat.mtime,
    generatedAt: meta?.generatedAt || null,
    exists: true,
  });
});

/**
 * GET /api/videos/status
 * Общий статус генерации и наличия файлов.
 */
router.get('/status', (req, res) => {
  let exists = fs.existsSync(VIDEOS_DIR);
  let count = 0;
  let totalSize = 0;
  let robotCount = 0;
  let categoryCount = 0;

  if (exists) {
    const catIds = new Set(CATEGORIES.map((c) => c.id));
    const files = fs.readdirSync(VIDEOS_DIR).filter((f) => f.endsWith('.mp4'));
    count = files.length;
    files.forEach((f) => {
      totalSize += fs.statSync(path.join(VIDEOS_DIR, f)).size;
      if (catIds.has(f.replace('.mp4', ''))) categoryCount++;
      else robotCount++;
    });
  }

  res.json({
    videosDir: VIDEOS_DIR,
    exists,
    count,
    robotCount,
    categoryCount,
    totalSizeMB: Math.round((totalSize / 1024 / 1024) * 10) / 10,
    categories: CATEGORIES.map((c) => c.id),
    generating: generationState.running,
  });
});

/**
 * GET /api/videos/progress
 * Server-Sent Events — прогресс генерации в реальном времени.
 */
router.get('/progress', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = () => {
    res.write(`data: ${JSON.stringify(generationState)}\n\n`);
  };

  send(); // сразу отправляем текущее состояние
  const interval = setInterval(send, 800);
  req.on('close', () => clearInterval(interval));
});

/**
 * POST /api/videos/generate
 * Запустить генерацию видео (в фоне). Ответ — сразу, прогресс — через /progress.
 * Body: { limit?: number, force?: boolean, type?: 'robot'|'category'|'all', skipCategories?: boolean }
 */
router.post('/generate', (req, res) => {
  try {
    if (req.user && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Только администратор может запускать генерацию' });
    }

    if (generationState.running) {
      return res.status(409).json({ error: 'Генерация уже запущена', state: generationState });
    }

    const limit = parseInt(req.body && req.body.limit) || Infinity;
    const force = !!(req.body && req.body.force);
    const type = (req.body && req.body.type) || 'all';
    const skipCategories = !!(req.body && req.body.skipCategories);

    generationState = {
      running: true,
      current: 0,
      total: 0,
      currentName: 'Подготовка...',
      success: 0,
      failed: 0,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      error: null,
    };

    res.json({
      status: 'started',
      type,
      message: `Генерация запущена (limit=${limit === Infinity ? 'все' : limit}, force=${force}, skipCategories=${skipCategories})`,
      limit: limit === Infinity ? null : limit,
      force,
      skipCategories,
    });

    setImmediate(async () => {
      try {
        if (type === 'category') {
          await generateAllCategoryVideos({ force });
        } else {
          // 'robot' и 'all' — generateAllRobotVideos также генерирует категорийные fallback.
          await generateAllRobotVideos(limit, {
            force,
            skipCategories,
            onProgress: (current, total, name, success, failed) => {
              generationState.current = current;
              generationState.total = total;
              generationState.currentName = name || '';
              generationState.success = success;
              generationState.failed = failed;
            },
          });
        }
        generationState.running = false;
        generationState.finishedAt = new Date().toISOString();
        console.log('[videos] Генерация завершена');
      } catch (err) {
        generationState.running = false;
        generationState.error = err.message || String(err);
        generationState.finishedAt = new Date().toISOString();
        console.error('[videos] Ошибка генерации:', err);
      }
    });
  } catch (err) {
    console.error('videos/generate error:', err);
    res.status(500).json({ error: 'Не удалось запустить генерацию' });
  }
});

module.exports = router;
