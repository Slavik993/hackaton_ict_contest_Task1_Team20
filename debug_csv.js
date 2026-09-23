const csv = require('csv-parser');
const fs = require('fs');

const CSV_HEADERS = ['id', 'name', 'type', 'status', 'vendor', 'description', 'category', 'subtype', 'scenario', 'cases', 'rating', 'market_potential', 'region', 'industry', 'price'];

fs.createReadStream('C:\\Users\\Machcreator\\Desktop\\Robo Visual\\case-01-robotic-solutions-platform-team-20\\catalog_export_v4.csv')
  .pipe(csv({ separator: ';', headers: CSV_HEADERS }))
  .on('data', (data) => {
    if (data.id === '5760e938-9a43-45a7-b8e8-f4f2e6383930') {
      console.log('Cases field:');
      console.log(JSON.stringify(data.cases, null, 2));
      console.log('\nChars:');
      for (let i = 0; i < data.cases.length; i++) {
        const c = data.cases[i];
        if (c.charCodeAt(0) > 127 || c === ' ' || c === '\t' || c === '\n') {
          console.log(`${i}: '${c}' (${c.charCodeAt(0)})`);
        }
      }
    }
  })
  .on('end', () => console.log('Done'));