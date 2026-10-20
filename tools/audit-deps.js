const fs = require('fs');
const files = [
  './server/services/ai-recommender.js',
  './server/services/simulation.js',
  './server/services/finmath.js',
  './server/services/realism.js',
  './server/services/calculation.js',
  './server/routes/calculation.js',
  './server/routes/simulation.js',
];
const urlRe = new RegExp('https?://[^\\s\'"\\)]+', 'g');
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const urls = src.match(urlRe) || [];
  const hasNet = /require\(['"](http|https|net|axios|dgram|tls)['"]\)/.test(src);
  console.log(f.padEnd(38), '| net require:', hasNet ? 'YES' : 'no ', '| urls:', urls.length ? urls.join(' ') : 'none');
}
