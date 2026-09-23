const csv = require('csv-parser');
const fs = require('fs');

const CSV_HEADERS = ['id', 'name', 'type', 'status', 'vendor', 'description', 'category', 'subtype', 'scenario', 'cases', 'rating', 'market_potential', 'region', 'industry', 'price'];

const testIds = [
  'db02c054-a08a-4ddf-a957-6137eeef93ba',  // Yandex rover
  '3f2aaa1b-2237-4d7b-b215-1ac5ec789ed5',  // Ronavi SR
  '6f3da854-41da-4363-8496-5487f37c845a',  // Ronavi H2000
  '0ece582a-084c-4a8b-99f4-576f0e01b7c8',  // SmartCube
  '5a36611d-033e-4893-bd49-5d4f776f57dd',  // AK-2000-2
  'cebbdfa8-500a-425f-bcbc-ad2dcc106539',  // AS-RS P
];

fs.createReadStream('C:\\Users\\Machcreator\\Desktop\\Robo Visual\\case-01-robotic-solutions-platform-team-20\\catalog_export_v4.csv')
  .pipe(csv({ separator: ';', headers: CSV_HEADERS }))
  .on('data', (data) => {
    if (testIds.includes(data.id)) {
      console.log(`\n=== ${data.name} ===`);
      console.log('Cases:', data.cases?.substring(0, 200));
      
      // Test patterns
      const cases = data.cases;
      
      // Pattern 1: shift
      const shiftMatch = cases.match(/(\d+\s*(?:тыс|тысяч|т\.?\s*ы\.?\s*с)?)\s*(?:отгрузок?|посыл|заказ|короб|ед|пallet|паллет|операци|посад|груз)\s*(?:за|v)\s*смен/i);
      console.log('Pattern 1 (shift):', shiftMatch ? shiftMatch[1] : 'null');
      
      // Pattern 2: explicit per hour
      const phMatch = cases.match(/(\d[\d\s\u00A0]*)\s*(?:шт|ед|короб|посыл|паллет|заказ)\/?ч/i);
      console.log('Pattern 2 (per hour):', phMatch ? phMatch[1] : 'null');
      
      // Pattern 3: capacity
      const capMatch = cases.match(/(?:пропускн|производительност)\s*\D*(\d[\d\s\u00A0]*)\s*(?:шт|ед|короб|посыл|паллет|заказ|тонн)\/?ч/i);
      console.log('Pattern 3 (capacity):', capMatch ? capMatch[1] : 'null');
      
      // Pattern 4: robots + orders per year
      const robotMatch = cases.match(/(\d+)\s*роботов?/i);
      const yearMatch = cases.match(/(\d[\d\s\u00A0]*(?:тыс|млн)?)\s*заказ.*?(?:год|в год|за год)/i);
      console.log('Pattern 4a (robots):', robotMatch ? robotMatch[1] : 'null');
      console.log('Pattern 4b (orders/year):', yearMatch ? yearMatch[1] : 'null');
      
      // Pattern 4 alternative: robots + orders (without year)
      const yearMatch2 = cases.match(/(\d[\d\s\u00A0]*(?:тыс|млн)?)\s*заказ/i);
      console.log('Pattern 4c (orders):', yearMatch2 ? yearMatch2[1] : 'null');
      
      // Pattern 5: robots + operations per year
      const opsMatch = cases.match(/(\d[\d\s\u00A0]*(?:тыс|млн)?)\s*(?:операци|отгруз|груз|посыл).*?(?:год|в год|за год)/i);
      console.log('Pattern 5 (ops/year):', opsMatch ? opsMatch[1] : 'null');
    }
  })
  .on('end', () => console.log('\nDone'));