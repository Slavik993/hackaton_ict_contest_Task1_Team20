const csv = require('csv-parser');
const fs = require('fs');

const CSV_HEADERS = ['id', 'name', 'type', 'status', 'vendor', 'description', 'category', 'subtype', 'scenario', 'cases', 'rating', 'market_potential', 'region', 'industry', 'price'];

const seenIds = new Set();
fs.createReadStream('C:\\Users\\Machcreator\\Desktop\\Robo Visual\\case-01-robotic-solutions-platform-team-20\\catalog_export_v4.csv')
  .pipe(csv({ separator: ';', headers: CSV_HEADERS }))
  .on('data', (data) => {
    if (data.id && !seenIds.has(data.id)) {
      seenIds.add(data.id);
      
      // Test throughput extraction
      let throughput = null;
      if (data.cases) {
        // Pattern 1
        const shiftMatch = data.cases.match(/(\d+\s*(?:тыс|тысяч|т\.?\s*ы\.?\s*с)?)\s*(?:отгрузок?|посыл|заказ|короб|ед|пallet|паллет|операци|посад|груз)\s*(?:за|v)\s*смен/i);
        if (shiftMatch) {
          let n = shiftMatch[1].replace(/\s/g, '').replace(/\u00A0/g, '');
          n = n.replace(/тыс/g, '000').replace(/тысяч/g, '000').replace(/т\.?\s*ы\.?\s*с/g, '000');
          throughput = parseFloat(n);
        }
        // Pattern 4b
        if (!throughput) {
          const robotMatch = data.cases.match(/(\d+)\s*роботов?/i);
          const ordersMatch = data.cases.match(/(\d[\d\s\u00A0]*(?:тыс|млн)?)\s*заказ/i);
          if (robotMatch && ordersMatch) {
            const robots = parseInt(robotMatch[1]);
            let orders = ordersMatch[1].replace(/\s/g, '').replace(/\u00A0/g, '');
            orders = orders.replace(/тыс/g, '000').replace(/млн/g, '000000');
            const totalOrders = parseFloat(orders);
            if (!isNaN(totalOrders) && robots > 0) {
              throughput = Math.round(totalOrders / robots / 365 / 16);
            }
          }
        }
        // Pattern 5b
        if (!throughput) {
          const robotMatch = data.cases.match(/(\d+)\s*роботов?/i);
          const opsMatch = data.cases.match(/(\d[\d\s\u00A0]*(?:тыс|млн)?)\s*(?:операци|отгруз|груз|посыл)/i);
          if (robotMatch && opsMatch) {
            const robots = parseInt(robotMatch[1]);
            let ops = opsMatch[1].replace(/\s/g, '').replace(/\u00A0/g, '');
            ops = ops.replace(/тыс/g, '000').replace(/млн/g, '000000');
            const totalOps = parseFloat(ops);
            if (!isNaN(totalOps) && robots > 0) {
              throughput = Math.round(totalOps / robots / 365 / 16);
            }
          }
        }
        // Pattern 7 daily
        if (!throughput) {
          const dailyMatch = data.cases.match(/(\d[\d\s\u00A0]*(?:тыс|тысяч)?)\s*(?:паллет|поддон|посыл|груз|короб)\s*(?:\/сут|в\s*сутк|за\s*сутк)/i);
          if (dailyMatch) {
            let n = dailyMatch[1].replace(/\s/g, '').replace(/\u00A0/g, '');
            n = n.replace(/тыс/g, '000').replace(/тысяч/g, '000');
            const daily = parseFloat(n);
            if (!isNaN(daily)) throughput = Math.round(daily / 16);
          }
        }
      }
      
      if (throughput && throughput > 0) {
        console.log(`${data.name}: throughput = ${throughput}`);
      }
    }
  })
  .on('end', () => console.log('\nDone'));