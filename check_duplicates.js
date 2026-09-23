const csv = require('csv-parser');
const fs = require('fs');

const CSV_HEADERS = ['id', 'name', 'type', 'status', 'vendor', 'description', 'category', 'subtype', 'scenario', 'cases', 'rating', 'market_potential', 'region', 'industry', 'price'];

const ids = new Map();
fs.createReadStream('C:\\Users\\Machcreator\\Desktop\\Robo Visual\\case-01-robotic-solutions-platform-team-20\\catalog_export_v4.csv')
  .pipe(csv({ separator: ';', headers: CSV_HEADERS }))
  .on('data', (data) => {
    if (data.id) {
      if (!ids.has(data.id)) {
        ids.set(data.id, 1);
      } else {
        ids.set(data.id, ids.get(data.id) + 1);
      }
    }
  })
  .on('end', () => {
    console.log('Duplicate IDs:');
    for (const [id, count] of ids) {
      if (count > 1) {
        console.log(`  ${id}: ${count} times`);
      }
    }
    console.log(`\nTotal unique IDs: ${ids.size}`);
  });