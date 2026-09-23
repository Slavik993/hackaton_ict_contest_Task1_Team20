/**
 * Video Generator for Robotic Solutions Platform
 * Generates 10s 3D robot videos using Puppeteer + Three.js + FFmpeg.
 *
 * Reads the robot catalog (catalog_export_v4.csv), renders a real-time 3D
 * scene per robot in headless Chromium (software WebGL via SwiftShader) and
 * encodes the frame sequence into H.264 MP4 (1280x720 @ 24fps).
 *
 * Usage:
 *   npm run generate-videos -- [limit]
 *   node server/services/video-generator.js [limit]
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

ffmpeg.setFfmpegPath(ffmpegPath);

const ROOT = path.join(__dirname, '..', '..');
const CATALOG_CSV = path.join(ROOT, 'catalog_export_v4.csv');
const VIDEOS_DIR = path.join(ROOT, 'public', 'videos');
const FRAMES_DIR = path.join(ROOT, 'data', 'video-frames');

const WIDTH = 1280;
const HEIGHT = 720;
const FPS = 24;
const DURATION = 10; // seconds
const TOTAL_FRAMES = FPS * DURATION;

// Chromium launch args: software WebGL renderer so generation works without a GPU.
const LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--enable-unsafe-swiftshader',
  '--use-gl=angle',
  '--use-angle=swiftshader-webgl',
  '--enable-features=Vaapi',
];

// Category definitions — single source of truth for colors, 3D shapes and fallback labels.
const CATEGORIES = [
  { id: 'amr', name: 'AMR', color: '#4f7cff', shape: 'box', speed: 2.5 },
  { id: 'fmr', name: 'FMR', color: '#00a8a3', shape: 'box', speed: 1.2 },
  { id: 'forklift', name: 'Погрузчик', color: '#f59e0b', shape: 'forklift', speed: 1.0 },
  { id: 'cleaning', name: 'Уборка', color: '#10b981', shape: 'cleaner', speed: 1.5 },
  { id: 'sorting', name: 'Сортировка', color: '#8b5cf6', shape: 'sorter', speed: 3.0 },
  { id: 'service', name: 'Сервисный', color: '#ec4899', shape: 'service', speed: 1.8 },
  { id: 'medical', name: 'Медицинский', color: '#ef4444', shape: 'medical', speed: 1.3 },
  { id: 'delivery', name: 'Доставка', color: '#06b6d4', shape: 'rover', speed: 2.0 },
  { id: 'inspection', name: 'Инспекция', color: '#84cc16', shape: 'drone', speed: 1.5 },
  { id: 'stationary', name: 'Стационарный', color: '#64748b', shape: 'arm', speed: 0.5 },
];

// Fast lookup: category id -> { color (int), shape, label }
const CATEGORY_STYLES = {};
for (const c of CATEGORIES) {
  CATEGORY_STYLES[c.id] = {
    color: parseInt(c.color.replace('#', ''), 16),
    shape: c.shape,
    label: c.name,
  };
}
CATEGORY_STYLES.default = { color: 0x4f7cff, shape: 'box', label: 'Робот' };

// Mapping of raw catalog "Тип" values to internal category ids (kept for compat).
const CATEGORY_MAP = {
  'Мобильные роботы': 'amr',
  'Автономные наземные транспортные средства': 'fmr',
  'Роботы-манипуляторы': 'stationary',
  'Стационарные роботизированные системы': 'sorting',
  'Робот-уборщик': 'cleaning',
  'Роботы-уборщики': 'cleaning',
  'Роботы-доставщики': 'delivery',
  'Роботы-инспекторы': 'inspection',
  'Программное обеспечение': 'service',
  'Морские роботы': 'inspection',
};

function ensureDirs() {
  [VIDEOS_DIR, FRAMES_DIR].forEach((d) => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });
}

function stripBOM(str) {
  if (!str) return str;
  if (str.charCodeAt(0) === 0xFEFF) return str.slice(1);
  return str;
}

/**
 * Heuristic category detection from free-text fields.
 * Returns a short category id: amr, fmr, forklift, cleaning, sorting,
 * service, medical, delivery, inspection, stationary, default.
 */
function detectCategory(name, type, subtype, scenario) {
  const text = `${name} ${type} ${subtype} ${scenario}`.toLowerCase();
  if (text.includes('убор') || text.includes('clean') || text.includes('клин')) return 'cleaning';
  if (text.includes('погруз') || text.includes('штабел') || text.includes('fork') || text.includes('fmr')) return 'forklift';
  if (text.includes('сортир') || text.includes('sorter') || text.includes('shuttle')) return 'sorting';
  if (text.includes('манипулятор') || text.includes('arm') || text.includes('cobot')) return 'stationary';
  if (text.includes('дрон') || text.includes('bas') || text.includes('бпла') || text.includes('инспек')) return 'inspection';
  if (text.includes('достав') || text.includes('курьер') || text.includes('rover') || text.includes('ровер')) return 'delivery';
  if (text.includes('мед') || text.includes('фарм') || text.includes('аптек')) return 'medical';
  if (text.includes('сервис') || text.includes('консульт') || text.includes('промо')) return 'service';
  if (text.includes('amr') || text.includes('мобильн') || text.includes('agv')) return 'amr';
  return 'default';
}

function getCategoryColor(category) {
  const cat = CATEGORIES.find((c) => c.id === category);
  return cat ? cat.color : '#4f7cff';
}

function getCategoryName(category) {
  const cat = CATEGORIES.find((c) => c.id === category);
  return cat ? cat.name : 'Робот';
}

function truncateText(text, maxLen) {
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return text.substring(0, maxLen - 1) + '…';
}

function escapeXml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Legacy SVG builder (kept for compatibility / fallback tooling).
function buildRobotSVG(robot) {
  const W = 1280, H = 720;
  const color = getCategoryColor(robot.category || '');
  const catName = getCategoryName(robot.category || '');
  const name = escapeXml(robot.name || 'Робот');
  const vendor = escapeXml(robot.vendor || '');
  const desc = escapeXml(truncateText(robot.description || '', 120));
  const price = robot.price ? Number(robot.price).toLocaleString('ru-RU') : '—';
  const type = escapeXml(robot.subtype || robot.type || '');
  const robotId = escapeXml(String(robot.id || '').substring(0, 12));

  return `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
<rect width="${W}" height="${H}" fill="#0b1220"/>
<rect x="40" y="40" width="${W-80}" height="${H-80}" rx="12" fill="none" stroke="${color}" stroke-opacity="0.3" stroke-width="2"/>
<rect x="60" y="60" width="${W-120}" height="100" rx="8" fill="${color}" fill-opacity="0.12"/>
<text x="${W/2}" y="110" text-anchor="middle" font-size="26" fill="${color}" font-weight="700">${name}</text>
<text x="${W/2}" y="142" text-anchor="middle" font-size="15" fill="${color}" opacity="0.7">${catName}${type ? ' · ' + type : ''}</text>
<text x="80" y="205" font-size="13" fill="#94a3b8" font-weight="600">Вендор:</text>
<text x="195" y="205" font-size="13" fill="#cbd5e1">${vendor}</text>
<text x="640" y="680" text-anchor="middle" font-size="11" fill="#64748b">hackathon.robo-platform.local</text>
</svg>`;
}

/**
 * Build the Three.js scene page for a robot.
 * Robot data is injected as a JSON object (window.__ROBOT__) to avoid
 * string-escaping issues with names/vendors from the catalog.
 */
function buildThreeJsPage(robot, totalFrames) {
  totalFrames = totalFrames || TOTAL_FRAMES;
  const style = CATEGORY_STYLES[robot.category] || CATEGORY_STYLES.default;
  const colorHex = '#' + style.color.toString(16).padStart(6, '0');
  const robotData = JSON.stringify({
    id: robot.id || '',
    name: robot.name || 'Робот',
    vendor: robot.vendor || '',
    shape: style.shape,
    color: colorHex,
  });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>body{margin:0;overflow:hidden;background:#0b1220}canvas{display:block}</style>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>
</head>
<body>
<script>
const ROBOT = ${robotData};
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1220);
scene.fog = new THREE.Fog(0x0b1220, 20, 80);

const camera = new THREE.PerspectiveCamera(50, ${WIDTH}/${HEIGHT}, 0.1, 1000);
camera.position.set(0, 8, 18);
camera.lookAt(0, 2, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setSize(${WIDTH}, ${HEIGHT});
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);

const ambient = new THREE.AmbientLight(0xffffff, 0.45);
scene.add(ambient);
const dir = new THREE.DirectionalLight(0xffffff, 0.9);
dir.position.set(10, 20, 10);
dir.castShadow = true;
scene.add(dir);
const point = new THREE.PointLight(0x${style.color.toString(16).padStart(6, '0')}, 0.6, 40);
point.position.set(-8, 10, 5);
scene.add(point);

const floorGeo = new THREE.PlaneGeometry(60, 40);
const floorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.8 });
const floor = new THREE.Mesh(floorGeo, floorMat);
floor.rotation.x = -Math.PI/2;
floor.receiveShadow = true;
scene.add(floor);
const grid = new THREE.GridHelper(60, 30, 0x334155, 0x1e293b);
grid.position.y = 0.01;
scene.add(grid);

const robotGroup = new THREE.Group();
scene.add(robotGroup);

const mainColor = new THREE.Color(ROBOT.color);
const darkColor = mainColor.clone().multiplyScalar(0.6);

function createRobot(shape) {
  if (shape === 'forklift') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.4, 2.2), new THREE.MeshStandardMaterial({ color: mainColor, metalness: 0.3, roughness: 0.4 }));
    body.position.y = 1.2; body.castShadow = true; robotGroup.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.6, 1.8), new THREE.MeshStandardMaterial({ color: darkColor }));
    cabin.position.set(-0.6, 2.4, 0); robotGroup.add(cabin);
    const mast = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.5, 0.4), new THREE.MeshStandardMaterial({ color: 0x94a3b8 }));
    mast.position.set(1.4, 2.5, 0); robotGroup.add(mast);
    const mk = (z) => { const f = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.25), new THREE.MeshStandardMaterial({ color: 0xfbbf24 })); f.position.set(2.5, 0.9, z); robotGroup.add(f); };
    mk(0.5); mk(-0.5);
  } else if (shape === 'cleaner') {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.6, 1.2, 16), new THREE.MeshStandardMaterial({ color: mainColor }));
    body.position.y = 0.8; body.castShadow = true; robotGroup.add(body);
    const top = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 12), new THREE.MeshStandardMaterial({ color: darkColor }));
    top.position.y = 1.6; robotGroup.add(top);
    for (let i = 0; i < 3; i++) {
      const brush = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.15, 12), new THREE.MeshStandardMaterial({ color: 0x64748b }));
      brush.position.set(Math.cos(i*2.1)*1.1, 0.2, Math.sin(i*2.1)*1.1); robotGroup.add(brush);
    }
  } else if (shape === 'drone') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.4, 1.2), new THREE.MeshStandardMaterial({ color: mainColor }));
    body.position.y = 3; robotGroup.add(body);
    const armLen = 1.8;
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI/2 + Math.PI/4;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(armLen, 0.08, 0.08), new THREE.MeshStandardMaterial({ color: 0x94a3b8 }));
      arm.position.set(Math.cos(a)*armLen/2, 3, Math.sin(a)*armLen/2); arm.rotation.y = -a; robotGroup.add(arm);
      const prop = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.05, 16), new THREE.MeshStandardMaterial({ color: 0xe2e8f0, transparent: true, opacity: 0.7 }));
      prop.position.set(Math.cos(a)*armLen, 3.1, Math.sin(a)*armLen); prop.userData = { isProp: true, speed: 0.4 + i*0.1 }; robotGroup.add(prop);
    }
  } else if (shape === 'arm') {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 0.6, 16), new THREE.MeshStandardMaterial({ color: darkColor }));
    base.position.y = 0.3; robotGroup.add(base);
    const l1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 2.2, 0.5), new THREE.MeshStandardMaterial({ color: mainColor }));
    l1.position.set(0, 1.6, 0); robotGroup.add(l1);
    const l2 = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.8, 0.4), new THREE.MeshStandardMaterial({ color: mainColor }));
    l2.position.set(0.9, 3.2, 0); l2.rotation.z = -0.6; robotGroup.add(l2);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.8), new THREE.MeshStandardMaterial({ color: 0xfbbf24 }));
    grip.position.set(1.8, 3.8, 0); robotGroup.add(grip);
  } else if (shape === 'rover') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.0, 1.6), new THREE.MeshStandardMaterial({ color: mainColor }));
    body.position.y = 0.9; body.castShadow = true; robotGroup.add(body);
    for (let x of [-0.9, 0.9]) for (let z of [-0.7, 0.7]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.25, 16), new THREE.MeshStandardMaterial({ color: 0x1e293b }));
      wheel.rotation.z = Math.PI/2; wheel.position.set(x, 0.4, z); robotGroup.add(wheel);
    }
    const lid = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.15, 1.3), new THREE.MeshStandardMaterial({ color: darkColor }));
    lid.position.y = 1.45; robotGroup.add(lid);
  } else {
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.9, 1.8), new THREE.MeshStandardMaterial({ color: mainColor, metalness: 0.25, roughness: 0.45 }));
    body.position.y = 0.7; body.castShadow = true; robotGroup.add(body);
    const sensor = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.3, 16), new THREE.MeshStandardMaterial({ color: 0x94a3b8 }));
    sensor.position.y = 1.3; robotGroup.add(sensor);
    for (let x of [-0.9, 0.9]) for (let z of [-0.7, 0.7]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.2, 12), new THREE.MeshStandardMaterial({ color: 0x0f172a }));
      wheel.rotation.z = Math.PI/2; wheel.position.set(x, 0.35, z); robotGroup.add(wheel);
    }
  }
}

createRobot(ROBOT.shape);

// Floating label texture
const canvas = document.createElement('canvas');
canvas.width = 512; canvas.height = 128;
const ctx = canvas.getContext('2d');
ctx.fillStyle = 'rgba(15,23,42,0.88)';
ctx.fillRect(0, 0, 512, 128);
ctx.font = 'bold 36px Arial';
ctx.fillStyle = '#ffffff';
ctx.textAlign = 'center';
ctx.fillText(ROBOT.name, 256, 55);
ctx.font = '24px Arial';
ctx.fillStyle = ROBOT.color;
ctx.fillText(ROBOT.vendor, 256, 95);
const texture = new THREE.CanvasTexture(canvas);
const labelMat = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
const label = new THREE.Mesh(new THREE.PlaneGeometry(8, 2), labelMat);
label.position.set(0, 6.5, 0);
scene.add(label);

let frame = 0;
const totalFrames = ${totalFrames};
window.renderFrame = function() {
  frame++;
  const t = frame / totalFrames;
  const a = t * Math.PI * 2 * 0.7;
  camera.position.x = Math.sin(a) * 16;
  camera.position.z = Math.cos(a) * 16;
  camera.position.y = 7 + Math.sin(t * Math.PI * 2) * 1.5;
  camera.lookAt(0, 2, 0);
  robotGroup.rotation.y = Math.sin(t * Math.PI * 2) * 0.15;
  robotGroup.position.y = Math.sin(t * Math.PI * 4) * 0.08;
  robotGroup.traverse((obj) => {
    if (obj.userData && obj.userData.isProp) obj.rotation.y += obj.userData.speed;
  });
  label.lookAt(camera.position);
  renderer.render(scene, camera);
};
window.isSceneReady = true;
</script>
</body>
</html>`;
}

/**
 * Render one robot's 3D video.
 * @param {object} robot              { id, name, vendor, category, ... }
 * @param {object} [browser]          Reused Puppeteer browser (launched/closed here if omitted)
 * @param {object} [options]          { force: bool, frames: int }
 * @returns {Promise<string|false>}   output path on success, false on failure
 */
async function generateRobotVideo(robot, browser, options = {}) {
  const robotId = stripBOM(String(robot.id || ''));
  if (!robotId) return false;

  const outPath = path.join(VIDEOS_DIR, `${robotId}.mp4`);
  const metaPath = path.join(VIDEOS_DIR, `${robotId}.json`);

  if (!options.force && fs.existsSync(outPath) && fs.statSync(outPath).size > 10000 && fs.existsSync(metaPath)) {
    return outPath;
  }

  const totalFrames = options.frames || TOTAL_FRAMES;
  const framesDir = path.join(FRAMES_DIR, robotId);
  fs.mkdirSync(framesDir, { recursive: true });

  const ownBrowser = !browser;
  const b = browser || await puppeteer.launch({ headless: 'new', args: LAUNCH_ARGS });

  try {
    const page = await b.newPage();
    await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: 1 });
    const html = buildThreeJsPage(robot, totalFrames);
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForFunction(() => typeof window.renderFrame === 'function' && window.isSceneReady === true, { timeout: 15000 });

    process.stdout.write(`  → ${String(robot.name || '').substring(0, 40)}... (${totalFrames} frames)`);
    for (let i = 0; i < totalFrames; i++) {
      await page.evaluate(() => window.renderFrame());
      const buf = await page.screenshot({ type: 'png' });
      fs.writeFileSync(path.join(framesDir, `frame_${String(i).padStart(5, '0')}.png`), buf);
      if ((i + 1) % 60 === 0) process.stdout.write('.');
    }
    process.stdout.write('\n');
    await page.close();

    const stat = await encodePngSequence(framesDir, outPath, totalFrames);
    fs.rmSync(framesDir, { recursive: true, force: true });

    fs.writeFileSync(metaPath, JSON.stringify({
      id: robotId,
      name: robot.name || robotId,
      vendor: robot.vendor || '',
      category: robot.category || '',
      color: getCategoryColor(robot.category || ''),
      shape: (CATEGORY_STYLES[robot.category] || CATEGORY_STYLES.default).shape,
      path: `/videos/${robotId}.mp4`,
      duration: DURATION,
      frameRate: FPS,
      size: stat.size,
      generatedAt: new Date().toISOString(),
    }, null, 2));

    return outPath;
  } finally {
    if (ownBrowser) await b.close();
  }
}

function encodePngSequence(framesDir, outPath, totalFrames) {
  return new Promise((resolve, reject) => {
    ffmpeg(path.join(framesDir, 'frame_%05d.png'))
      .inputFPS(FPS)
      .outputOptions([
        '-c:v libx264',
        '-pix_fmt yuv420p',
        '-preset fast',
        '-crf 23',
        '-movflags +faststart',
      ])
      .output(outPath)
      .on('end', () => {
        const stat = fs.statSync(outPath);
        resolve(stat);
      })
      .on('error', (err) => reject(err))
      .run();
  });
}

// ---------- Catalog parsing ----------

function parseCsvLine(line) {
  const cells = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (char === ';' && !inQuotes) {
      cells.push(current);
      current = '';
    } else current += char;
  }
  cells.push(current);
  return cells.map((c) => c.trim());
}

const CSV_HEADERS = [
  'id', 'name', 'type', 'status', 'vendor', 'description',
  'category', 'subtype', 'scenario', 'cases', 'rating',
  'market_potential', 'region', 'industry', 'price',
];

/**
 * Synchronously read robots from the catalog CSV.
 * Falls back to an in-memory demo list if the file is missing.
 */
function readCatalogRobots(count) {
  const limit = count || 223;
  if (!fs.existsSync(CATALOG_CSV)) {
    return getDemoRobots().slice(0, limit);
  }

  const raw = fs.readFileSync(CATALOG_CSV, 'utf8');
  const lines = raw.replace(/^\uFEFF/, '').split(/\r?\n/).filter((l) => l.trim());
  const robots = [];
  const seen = new Set();

  for (let i = 1; i < lines.length && robots.length < limit; i++) {
    const cells = parseCsvLine(lines[i]);
    if (cells.length < 5) continue;
    const id = stripBOM(cells[0]);
    if (!id || seen.has(id)) continue;
    seen.add(id);

    const name = cells[1] || 'Робот';
    const vendor = cells[4] || 'Unknown';
    const typeVal = (cells[6] || '').toLowerCase();
    const subtype = (cells[7] || '').toLowerCase();
    const scenario = (cells[8] || '').toLowerCase();

    robots.push({
      id,
      name,
      vendor,
      type: typeVal,
      subtype,
      scenario,
      category: detectCategory(name, cells[6], cells[7], cells[8]),
      rawCategory: cells[6] || '',
      description: cells[5] || '',
    });
  }
  return robots;
}

function getDemoRobots() {
  return [
    { id: 'amr', name: 'AMR Demo', vendor: 'Demo', category: 'amr' },
    { id: 'fmr', name: 'FMR Demo', vendor: 'Demo', category: 'fmr' },
    { id: 'forklift', name: 'Forklift Demo', vendor: 'Demo', category: 'forklift' },
    { id: 'cleaning', name: 'Cleaning Demo', vendor: 'Demo', category: 'cleaning' },
    { id: 'sorting', name: 'Sorting Demo', vendor: 'Demo', category: 'sorting' },
    { id: 'service', name: 'Service Demo', vendor: 'Demo', category: 'service' },
    { id: 'medical', name: 'Medical Demo', vendor: 'Demo', category: 'medical' },
    { id: 'delivery', name: 'Delivery Demo', vendor: 'Demo', category: 'delivery' },
    { id: 'inspection', name: 'Inspection Demo', vendor: 'Demo', category: 'inspection' },
    { id: 'stationary', name: 'Stationary Demo', vendor: 'Demo', category: 'stationary' },
  ];
}

// ---------- Orchestration ----------

async function generateAllRobotVideos(count, options = {}) {
  ensureDirs();
  const robots = readCatalogRobots(count);
  const includeCategories = !options.skipCategories;
  const total = robots.length + (includeCategories ? CATEGORIES.length : 0);
  let done = 0;
  console.log(`\nGenerating videos for ${robots.length} robots...` + (includeCategories ? ` (+ ${CATEGORIES.length} categories)` : '') + `\n`);

  const browser = await puppeteer.launch({ headless: 'new', args: LAUNCH_ARGS });
  let success = 0;
  let failed = 0;
  const report = (name) => {
    if (typeof options.onProgress === 'function') {
      options.onProgress(done, total, name || '', success, failed);
    }
  };

  try {
    for (const robot of robots) {
      try {
        await generateRobotVideo(robot, browser, options);
        success++;
      } catch (e) {
        console.error(`  ✗ Failed ${robot.id}:`, e.message);
        failed++;
      }
      done++;
      report(robot.name);
    }

    // Category fallback videos (3D, one per category) — skipped for quick test runs.
    if (includeCategories) {
      console.log('\nGenerating category fallback videos...');
      for (const category of CATEGORIES) {
        const demo = {
          id: category.id,
          name: category.name,
          vendor: 'Категория',
          category: category.id,
        };
        try {
          await generateRobotVideo(demo, browser, options);
          success++;
        } catch (e) {
          console.error(`  ✗ Category ${category.id} failed:`, e.message);
          failed++;
        }
        done++;
        report('Категория: ' + category.name);
      }
    }

    report(null);
  } finally {
    await browser.close();
  }

  console.log(`\nDone! Success: ${success}, Failed: ${failed}`);
  console.log(`Videos stored in: ${VIDEOS_DIR}`);
  return { success, failed, total: robots.length };
}

/**
 * Generate a single category fallback video (3D).
 */
async function generateCategoryVideo(category, options = {}) {
  const demo = {
    id: category.id,
    name: category.name,
    vendor: 'Категория',
    category: category.id,
  };
  return generateRobotVideo(demo, undefined, options);
}

async function generateAllCategoryVideos(options = {}) {
  console.log('Starting category video generation...');
  let ok = 0;
  for (const category of CATEGORIES) {
    try {
      await generateCategoryVideo(category, options);
      ok++;
    } catch (e) {
      console.error(`  ✗ Failed category ${category.id}:`, e.message);
    }
  }
  console.log('Category video generation complete.');
  return { success: ok, total: CATEGORIES.length };
}

// ---------- Catalog queries ----------

function getRobotVideoList() {
  const videos = [];
  if (!fs.existsSync(VIDEOS_DIR)) return videos;
  const catIds = new Set(CATEGORIES.map((c) => c.id));
  const files = fs.readdirSync(VIDEOS_DIR).filter((f) => f.endsWith('.mp4') && !catIds.has(f.replace('.mp4', '')));
  for (const mp4File of files) {
    const id = mp4File.replace('.mp4', '');
    const metaPath = path.join(VIDEOS_DIR, `${id}.json`);
    let meta = null;
    if (fs.existsSync(metaPath)) {
      try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch (e) { /* ignore */ }
    }
    const stat = fs.statSync(path.join(VIDEOS_DIR, mp4File));
    videos.push({
      id,
      name: meta?.name || id,
      category: meta?.category || '',
      vendor: meta?.vendor || '',
      color: meta?.color || getCategoryColor(meta?.category || ''),
      path: `/videos/${id}.mp4`,
      duration: meta?.duration || DURATION,
      size: stat.size,
      ready: true,
      ...(meta || {}),
    });
  }
  return videos.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

function getVideoList() {
  const robotVideos = getRobotVideoList();
  const categoryVideos = [];
  for (const category of CATEGORIES) {
    const videoPath = path.join(VIDEOS_DIR, `${category.id}.mp4`);
    const metaPath = path.join(VIDEOS_DIR, `${category.id}.json`);
    if (fs.existsSync(videoPath) && fs.statSync(videoPath).size > 10000) {
      let meta = null;
      if (fs.existsSync(metaPath)) {
        try { meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch (e) { /* ignore */ }
      }
      categoryVideos.push({
        id: category.id,
        name: category.name,
        color: category.color,
        type: 'category',
        path: `/videos/${category.id}.mp4`,
        duration: meta?.duration || DURATION,
        ready: true,
        ...(meta || {}),
      });
    } else {
      categoryVideos.push({
        id: category.id,
        name: category.name,
        color: category.color,
        type: 'category',
        path: null,
        duration: 0,
        ready: false,
      });
    }
  }
  return { robotVideos, categoryVideos };
}

function getVideoMeta(videoId) {
  const metaPath = path.join(VIDEOS_DIR, `${videoId}.json`);
  if (fs.existsSync(metaPath)) {
    try { return JSON.parse(fs.readFileSync(metaPath, 'utf8')); } catch (e) { return null; }
  }
  return null;
}

function getVideoCategoryForSolution(solution) {
  if (!solution) return 'amr';
  const name = (solution.name || '').toLowerCase();
  const vendor = (solution.vendor || '').toLowerCase();
  const desc = (solution.description || '').toLowerCase();
  const category = (solution.category || '').toLowerCase();
  const videoMap = {
    'amr': 'amr', 'shuttle': 'amr', 'sorter': 'sorting', 'мобильный': 'amr',
    'fmr': 'fmr', 'carrier': 'fmr', 'тягач': 'fmr', 'погрузчик': 'forklift',
    'штабелер': 'forklift', 'уборщик': 'cleaning', 'cleanbot': 'cleaning',
    'сортиров': 'sorting', 'манипулятор': 'stationary', 'дрон': 'inspection',
    'инвентар': 'inspection', 'мед': 'medical', 'фарм': 'medical',
    'доставка': 'delivery', 'курьер': 'delivery', 'склад': 'amr', 'логистик': 'amr',
  };
  for (const [key, catId] of Object.entries(videoMap)) {
    if (name.includes(key) || vendor.includes(key) || desc.includes(key) || category.includes(key)) {
      return catId;
    }
  }
  return 'amr';
}

module.exports = {
  generateAllRobotVideos,
  generateRobotVideo,
  generateAllCategoryVideos,
  generateCategoryVideo,
  getRobotVideoList,
  getVideoList,
  getVideoMeta,
  getVideoCategoryForSolution,
  readCatalogRobots,
  detectCategory,
  stripBOM,
  buildThreeJsPage,
  buildRobotSVG,
  CATEGORIES,
  CATEGORY_STYLES,
  CATEGORY_MAP,
  VIDEOS_DIR,
  WIDTH,
  HEIGHT,
  FPS,
  DURATION,
  TOTAL_FRAMES,
};

if (require.main === module) {
  let count = 223;
  let force = false;
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (['force', '--force', '-f', 'true'].includes(arg)) force = true;
    else { const n = parseInt(arg, 10); if (!isNaN(n)) count = n; }
  }
  generateAllRobotVideos(count, { force })
    .then(() => process.exit(0))
    .catch((e) => { console.error(e); process.exit(1); });
}
