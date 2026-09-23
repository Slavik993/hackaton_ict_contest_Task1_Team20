const csv = require('csv-parser');
const fs = require('fs');

const CSV_HEADERS = ['id', 'name', 'type', 'status', 'vendor', 'description', 'category', 'subtype', 'scenario', 'cases', 'rating', 'market_potential', 'region', 'industry', 'price'];

let count = 0;
fs.createReadStream('C:\\Users\\Machcreator\\Desktop\\Robo Visual\\case-01-robotic-solutions-platform-team-20\\catalog_export_v4.csv')
  .pipe(csv({ separator: ';', headers: CSV_HEADERS }))
  .on('data', (data) => {
    if (data.id === '5760e938-9a43-45a7-b8e8-f4f2e6383930') {
      count++;
      console.log(`\n=== Entry ${count} ===`);
      console.log('Industry:', data.industry);
      console.log('Cases:', data.cases?.substring(0, 100));
      
      // Test regex
      const cases = data.cases;
      const shiftMatch = cases.match(/(\d+\s*(?:тыс|тысяч|т\.?\s*ы\.?\s*с)?)\s*(?:отгрузок?|посыл|заказ|короб|ед|пallet|паллет|операци|посад|груз)\s*(?:за|v)\s*смен/i);
      console.log('Regex match:', shiftMatch);
      if (shiftMatch) {
        let n = shiftMatch[1].replace(/\s/g, '').replace(/\u00A0/g, '');
        n = n.replace(/тыс/g, '000').replace(/тысяч/g, '000').replace(/т\.?\s*ы\.?\s*с/g, '000');
        console.log('Parsed throughput:', parseFloat(n));
      }
    }
  })
  .on('end', () => console.log(`\nTotal entries with this ID: ${count}`));