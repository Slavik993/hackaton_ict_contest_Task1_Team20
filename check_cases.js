const csv = require('csv-parser');
const fs = require('fs');

const CSV_HEADERS = ['id', 'name', 'type', 'status', 'vendor', 'description', 'category', 'subtype', 'scenario', 'cases', 'rating', 'market_potential', 'region', 'industry', 'price'];

const seenIds = new Set();
fs.createReadStream('C:\\Users\\Machcreator\\Desktop\\Robo Visual\\case-01-robotic-solutions-platform-team-20\\catalog_export_v4.csv')
  .pipe(csv({ separator: ';', headers: CSV_HEADERS }))
  .on('data', (data) => {
    if (data.id && !seenIds.has(data.id)) {
      seenIds.add(data.id);
      
      if (data.cases && data.cases.length > 20) {
        console.log(`\n=== ${data.name} ===`);
        console.log(data.cases.substring(0, 300));
      }
    }
  })
  .on('end', () => console.log('\nDone'));