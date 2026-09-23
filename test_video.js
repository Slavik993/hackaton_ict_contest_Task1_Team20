const { execSync } = require('child_process');
const ffmpeg = require('ffmpeg-static');
const fs = require('fs');

const testFile = 'public/videos/5760e938-9a43-45a7-b8e8-f4f2e6383930.mp4';
console.log('File exists:', fs.existsSync(testFile));
console.log('File size:', fs.statSync(testFile).size);

const ffmpegPath = ffmpeg;
console.log('FFmpeg path:', ffmpegPath);

const cmd = `"${ffmpegPath}" -i "${testFile}" 2>&1`;
console.log('Command:', cmd.substring(0, 100));

try {
  const result = execSync(cmd, { encoding: 'utf8', timeout: 10000, shell: true });
  console.log('FFmpeg output:', result);
} catch (e) {
  console.log('FFmpeg stdout:', e.stdout || '');
  console.log('FFmpeg stderr:', e.stderr || '');
  console.log('FFmpeg message:', e.message || '');
}

// Also check MP4 header
const buf = fs.readFileSync(testFile);
console.log('File starts with:', buf.slice(0,16).toString('hex'));
console.log('Contains ftyp:', buf.toString().includes('ftyp'));
