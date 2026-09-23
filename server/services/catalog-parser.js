const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
const { Transform } = require('stream');

function stripBOM(str) {
  if (!str) return str;
  if (str.charCodeAt(0) === 0xFEFF) return str.slice(1);
  return str;
}

function stripBOMStream() {
  let first = true;
  return new Transform({
    transform(chunk, encoding, callback) {
      if (first) {
        first = false;
        if (chunk.length >= 3 && chunk[0] === 0xEF && chunk[1] === 0xBB && chunk[2] === 0xBF) {
          chunk = chunk.slice(3);
        }
      }
      callback(null, chunk);
    },
  });
}

function skipFirstLine() {
  let first = true;
  return new Transform({
    transform(chunk, encoding, callback) {
      if (first) {
        first = false;
        const idx = chunk.indexOf(10);
        if (idx !== -1) {
          callback(null, chunk.slice(idx + 1));
        } else {
          callback();
        }
      } else {
        callback(null, chunk);
      }
    },
  });
}

const CSV_HEADERS = ['id', 'name', 'type', 'status', 'vendor', 'description', 'category', 'subtype', 'scenario', 'cases', 'rating', 'market_potential', 'region', 'industry', 'price'];

function parseCatalogCsv(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    const seenIds = new Set();
    fs.createReadStream(filePath)
      .pipe(stripBOMStream())
      .pipe(skipFirstLine())
      .pipe(csv({ separator: ';', headers: CSV_HEADERS }))
      .on('data', (data) => {
        if (!data.id || !data.name) return;
        data.id = stripBOM(data.id);
        
        // Skip duplicate IDs (keep first occurrence)
        if (seenIds.has(data.id)) {
          return;
        }
        seenIds.add(data.id);
        
        const priceStr = (data.price || '').replace(/\s/g, '').replace(',', '.');
        const price = parseFloat(priceStr) || null;
        const rating = data.rating ? parseFloat(data.rating) : null;
        const marketPotential = data.market_potential ? parseFloat(data.market_potential) : null;

        let applicableTo = [];
        const industry = (data.industry || '').trim().toLowerCase();
        const scenario = (data.scenario || '').trim().toLowerCase();
        const category = (data.category || '').trim();
        const subtype = (data.subtype || '').trim();
        const description = (data.description || '').trim().toLowerCase();
        const cases = (data.cases || '').trim().toLowerCase();

        // Map industry to applicable_to
        if (industry.includes('торгов')) {
          applicableTo.push('warehouse', 'retail');
        }
        if (industry.includes('промышл')) {
          applicableTo.push('warehouse', 'terminal', 'manufacturing');
        }
        if (industry.includes('сельск')) {
          applicableTo.push('custom', 'farm');
        }
        if (industry.includes('логистик') || industry.includes('транспорт')) {
          applicableTo.push('terminal', 'warehouse');
        }
        if (industry.includes('авиа') || industry.includes('аэропорт')) {
          applicableTo.push('airport');
        }
        if (industry.includes('медицин') || industry.includes('здравоохран')) {
          applicableTo.push('medical');
        }
        if (industry.includes('безопасн') || industry.includes('охран')) {
          applicableTo.push('airport', 'terminal', 'warehouse', 'campus', 'security_site');
        }
        if (industry.includes('жкх') || industry.includes('коммунал')) {
          applicableTo.push('campus', 'terminal', 'municipal');
        }
        if (industry.includes('строитель')) {
          applicableTo.push('warehouse', 'terminal', 'construction_site');
        }
        if (industry.includes('энерг') || industry.includes('топлив') || industry.includes('тэк')) {
          applicableTo.push('warehouse', 'terminal', 'energy_facility');
        }
        if (industry.includes('лесн') || industry.includes('лесхоз')) {
          applicableTo.push('warehouse', 'terminal', 'forest');
        }
        if (industry.includes('сельское')) {
          applicableTo.push('custom', 'farm');
        }

        // Map scenario to applicable_to
        if (scenario.includes('склад') || scenario.includes('логистик') || scenario.includes('внутрисклад')) {
          if (!applicableTo.includes('warehouse')) applicableTo.push('warehouse');
        }
        if (scenario.includes('производствен') || scenario.includes('внутрипроизвод')) {
          applicableTo.push('warehouse', 'terminal', 'manufacturing');
        }
        if (scenario.includes('перевозк') || scenario.includes('транспорт')) {
          applicableTo.push('terminal', 'warehouse');
        }
        if (scenario.includes('багаж') || scenario.includes('аэропорт')) {
          applicableTo.push('airport');
        }
        if (scenario.includes('уборк') || scenario.includes('клининг') || scenario.includes('улиц')) {
          applicableTo.push('campus', 'retail', 'medical', 'airport', 'municipal');
        }
        if (scenario.includes('питание') || scenario.includes('доставк') || scenario.includes('еда')) {
          applicableTo.push('medical', 'campus');
        }
        if (scenario.includes('инвентар') || scenario.includes('склад')) {
          applicableTo.push('warehouse', 'terminal');
        }
        if (scenario.includes('мониторинг') || scenario.includes('патрул') || scenario.includes('охран')) {
          applicableTo.push('airport', 'terminal', 'warehouse', 'campus', 'security_site');
        }
        if (scenario.includes('вспашк') || scenario.includes('урожай') || scenario.includes('сбор') || scenario.includes('поле')) {
          applicableTo.push('custom', 'farm');
        }
        if (scenario.includes('птицевод') || scenario.includes('вакцин')) {
          applicableTo.push('custom', 'farm');
        }
        if (scenario.includes('водн') || scenario.includes('труб') || scenario.includes('диагност')) {
          applicableTo.push('terminal', 'campus', 'municipal', 'energy_facility');
        }
        if (scenario.includes('зарядк')) {
          applicableTo.push('terminal', 'airport', 'campus');
        }
        if (scenario.includes('торг') || scenario.includes('вендинг') || scenario.includes('магазин')) {
          applicableTo.push('retail', 'warehouse');
        }
        if (scenario.includes('производство') || scenario.includes('сборк') || scenario.includes('погрузк') || scenario.includes('укладк') || scenario.includes('сварк')) {
          applicableTo.push('warehouse', 'terminal', 'manufacturing');
        }
        if (scenario.includes('сельск') || scenario.includes('агро') || scenario.includes('ферм') || scenario.includes('посев')) {
          applicableTo.push('custom', 'farm');
        }
        if (scenario.includes('лесн') || scenario.includes('лесхоз') || scenario.includes('лесозаготов')) {
          applicableTo.push('warehouse', 'terminal', 'forest');
        }
        if (scenario.includes('строит') || scenario.includes('дорожн') || scenario.includes('асфальт') || scenario.includes('бульдозер') || scenario.includes('катк')) {
          applicableTo.push('warehouse', 'terminal', 'construction_site');
        }
        if (scenario.includes('энерг') || scenario.includes('трубопровод') || scenario.includes('лэн') || scenario.includes('электро')) {
          applicableTo.push('warehouse', 'terminal', 'energy_facility');
        }

        // Also check description and cases for airport/terminal keywords
        const combinedText = scenario + ' ' + description + ' ' + cases;
        if (combinedText.includes('аэропорт') || combinedText.includes('багаж') || combinedText.includes('перевозк грузов на закрытых площадк')) {
          applicableTo.push('airport');
        }
        if (combinedText.includes('терминал') || combinedText.includes('кросс-док') || combinedText.includes('cross-dock')) {
          applicableTo.push('terminal');
        }
        if (combinedText.includes('медучрежд') || combinedText.includes('больниц') || combinedText.includes('поликлиник') || combinedText.includes('лекарств') || combinedText.includes('биоматериал') || combinedText.includes('анализ') || combinedText.includes('медицинск')) {
          applicableTo.push('medical');
        }
        if (combinedText.includes('университет') || combinedText.includes('кампус') || combinedText.includes('мфц') || combinedText.includes('бизнес-центр') || combinedText.includes('офисн')) {
          applicableTo.push('campus');
        }
        if (combinedText.includes('магазин') || combinedText.includes('торгов') || combinedText.includes('ритейл') || combinedText.includes('супермаркет') || combinedText.includes('маркетплейс') || combinedText.includes('e-commerce') || combinedText.includes('интернет-магазин') || combinedText.includes('маркетплейс')) {
          applicableTo.push('retail');
        }

        // Deduplicate
        applicableTo = [...new Set(applicableTo)];

        if (applicableTo.length === 0) applicableTo = ['warehouse'];

        // Map category to solution_type_id
        const categoryMap = {
          'Мобильные роботы': 'mobile',
          'Автономные наземные транспортные средства': 'agv',
          'Роботы-манипуляторы': 'manipulator',
          'Стационарные роботизированные системы': 'stationary',
          'Робот-уборщик': 'cleaning',
          'Роботы-уборщики': 'cleaning',
          'Роботы-доставщики': 'delivery',
          'Роботы-инспекторы': 'inspection',
          'Программное обеспечение': 'software',
          'ПО': 'software',
          'ПО БРС': 'software',
          'БАС': 'inspection',
          'Антропоморфные роботы': 'custom',
          'Мобильные манипуляторы': 'manipulator',
          'Морские роботы': 'custom',
          'Другое': 'custom',
        };

        const typeId = categoryMap[category] || 'custom';

        const name = data.name || '';

        // Extract payload (грузоподъёмность) from name or description
        let payload = null;
        const payloadMatch = name.match(/грузоподъ[её]мност[ьи].*?(\d[\d\s\u00A0]*)\s*(кг|т|тонн)/i) ||
                            description.match(/грузоподъ[её]мност[ьи].*?(\d[\d\s\u00A0]*)\s*(кг|т|тонн)/i);
        if (payloadMatch) {
          const val = parseFloat(payloadMatch[1].replace(/\s/g, '').replace(/\u00A0/g, ''));
          if (!isNaN(val)) {
            payload = payloadMatch[2].toLowerCase().startsWith('т') ? val * 1000 : val;
          }
        }

        // Extract autonomy (автономность) from name or description
        let autonomy = null;
        const autMatch = name.match(/автономн[а-я]*\s*(\d[\d\s\u00A0]*)\s*ч/i) ||
                         description.match(/автономн[а-я]*\s*(\d[\d\s\u00A0]*)\s*ч/i);
        if (autMatch) {
          const val = parseFloat(autMatch[1].replace(/\s/g, '').replace(/\u00A0/g, ''));
          if (!isNaN(val)) autonomy = val;
        }

        // Extract footprint (площадь/габариты) from description or cases
        let footprint = null;
        const footprintMatch = description.match(/габарит[а-я]*\s*[\d×x\s\u00A0]*(\d[\d\s\u00A0]*)\s*[мм]/i) ||
                               description.match(/площад[ьи].*?(\d[\d\s\u00A0]*)\s*м[²2]/i) ||
                               cases.match(/площад[ьи].*?(\d[\d\s\u00A0]*)\s*м[²2]/i);
        if (footprintMatch) {
          const val = parseFloat(footprintMatch[1].replace(/\s/g, '').replace(/\u00A0/g, ''));
          if (!isNaN(val)) footprint = val;
        }

// Extract throughput from cases
        let throughput = null;
        if (data.cases) {
          // Pattern 1: "производительность ... с 4 до 8 тысяч отгрузок за смену" -> use the "за смену" value (Y)
          // Also matches "X тысяч отгрузок за сменu"
          // IMPORTANT: alternation order matters - put longer/more specific patterns FIRST
          // "груз" matches in "транспортировки" so put "отгруз", "отгрузок", "посыл", "заказ" before "груз"
          const shiftMatch = data.cases.match(/(\d+\s*(?:тыс|тысяч|т\.?\s*ы\.?\s*с)?)\s*(?:отгрузок?|посыл|заказ|короб|ед|пallet|паллет|операци|посад|груз)\s*(?:за|v)\s*смен/i);
          if (shiftMatch) {
            let n = shiftMatch[1].replace(/\s/g, '').replace(/\u00A0/g, '');
            n = n.replace(/тыс/g, '000').replace(/тысяч/g, '000').replace(/т\.?\s*ы\.?\s*с/g, '000');
            const val = parseFloat(n);
            if (!isNaN(val)) throughput = val;
          }
          // Pattern 2: "X шт/ч", "X ед/ч", "X короб/ч" - explicit hourly rate
          if (!throughput) {
            const thMatch2 = data.cases.match(/(\d[\d\s\u00A0]*)\s*(?:шт|ед|короб|посыл|паллет|заказ)\/?ч/i);
            if (thMatch2) {
              const val = parseFloat(thMatch2[1].replace(/\s/g, '').replace(/\u00A0/g, ''));
              if (!isNaN(val)) throughput = val;
            }
          }
          // Pattern 3: "пропускная способность X" or "производительность X" with explicit units per hour
          if (!throughput) {
            const thMatch3 = data.cases.match(/(?:пропускн|производительност)\s*\D*(\d[\d\s\u00A0]*)\s*(?:шт|ед|короб|посыл|паллет|заказ|тонн)\/?ч/i);
            if (thMatch3) {
              const val = parseFloat(thMatch3[1].replace(/\s/g, '').replace(/\u00A0/g, ''));
              if (!isNaN(val)) throughput = val;
            }
          }
          // Pattern 4: "X роботов ... Y заказов в год" - estimate per robot per hour
          if (!throughput) {
            const robotMatch = data.cases.match(/(\d+)\s*роботов?/i);
            const yearMatch = data.cases.match(/(\d[\d\s\u00A0]*(?:тыс|млн)?)\s*заказ.*?(?:год|в год|за год)/i);
            if (robotMatch && yearMatch) {
              const robots = parseInt(robotMatch[1]);
              let orders = yearMatch[1].replace(/\s/g, '').replace(/\u00A0/g, '');
              orders = orders.replace(/тыс/g, '000').replace(/млн/g, '000000');
              const totalOrders = parseFloat(orders);
              if (!isNaN(totalOrders) && robots > 0) {
                throughput = Math.round(totalOrders / robots / 365 / 16);
              }
            }
          }
          // Pattern 4b: "X роботов ... Y млн заказов" without "год" - assume annual
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
          // Pattern 5: "X роботов ... Y операций в год" - estimate per robot per hour
          if (!throughput) {
            const robotMatch = data.cases.match(/(\d+)\s*роботов?/i);
            const opsMatch = data.cases.match(/(\d[\d\s\u00A0]*(?:тыс|млн)?)\s*(?:операци|отгруз|груз|посыл).*?(?:год|в год|за год)/i);
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
          // Pattern 5b: "X роботов ... Y операций" without "год" - assume annual
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
          // Pattern 6: "производительность повышена в X раз" - can't extract absolute, skip
          // Pattern 7: "X тыс. паллет/сутки" or similar daily volume
          if (!throughput) {
            const dailyMatch = data.cases.match(/(\d[\d\s\u00A0]*(?:тыс|тысяч)?)\s*(?:паллет|поддон|посыл|груз|короб)\s*(?:\/сут|в\s*сутк|за\s*сутк)/i);
            if (dailyMatch) {
              let n = dailyMatch[1].replace(/\s/g, '').replace(/\u00A0/g, '');
              n = n.replace(/тыс/g, '000').replace(/тысяч/g, '000');
              const daily = parseFloat(n);
              if (!isNaN(daily)) {
                // Convert daily to hourly (assume 16h shifts)
                throughput = Math.round(daily / 16);
              }
            }
          }
          // Pattern 8: "X роботов ... Y человеко-часов" - estimate throughput from labor savings
          if (!throughput) {
            const robotMatch = data.cases.match(/(\d+)\s*роботов?/i);
            const laborMatch = data.cases.match(/(\d[\d\s\u00A0]*)\s*человеко-час/i);
            if (robotMatch && laborMatch) {
              const robots = parseInt(robotMatch[1]);
              let labor = laborMatch[1].replace(/\s/g, '').replace(/\u00A0/g, '');
              const laborHours = parseFloat(labor);
              if (!isNaN(laborHours) && robots > 0) {
                // Rough estimate: 1 human-hour saved ≈ 10-20 operations per hour per robot
                // This is very approximate
                throughput = Math.round(laborHours / robots / 365 / 16 * 15);
              }
            }
          }
          // Pattern 9: "X единиц в месяц" production rate
          if (!throughput) {
            const monthlyMatch = data.cases.match(/(\d+)\s*(?:единиц?|шт|роботов?)\s*в\s*месяц/i);
            if (monthlyMatch) {
              const monthly = parseInt(monthlyMatch[1]);
              if (!isNaN(monthly)) {
                // Convert monthly production to hourly throughput
                // Assume 30 days * 16 hours
                throughput = Math.round(monthly / 30 / 16);
              }
            }
          }
          // Pattern 10: "X кг/смену" or "X тонн/смену" - payload per shift
          if (!throughput) {
            const shiftPayloadMatch = data.cases.match(/(\d[\d\s\u00A0]*(?:тыс|тысяч)?)\s*(?:кг|тонн)\s*(?:\/смен|за\s*смен|в\s*смен)/i);
            if (shiftPayloadMatch) {
              let n = shiftPayloadMatch[1].replace(/\s/g, '').replace(/\u00A0/g, '');
              n = n.replace(/тыс/g, '000').replace(/тысяч/g, '000');
              const payloadPerShift = parseFloat(n);
              if (!isNaN(payloadPerShift)) {
                // Estimate operations per hour from payload per shift
                // Assume avg payload per operation
                const avgPayload = payload || 100;
                throughput = Math.round(payloadPerShift / avgPayload / 16);
              }
            }
          }
          // Pattern 11: "время... Y секунд" for pick/place cycle time
          if (!throughput) {
            const cycleMatch = data.cases.match(/(?:время|цикл|сбор|сборк).*?(\d[\d\s\u00A0]*)\s*сек/i);
            if (cycleMatch) {
              const cycleSec = parseFloat(cycleMatch[1].replace(/\s/g, ''));
              if (!isNaN(cycleSec) && cycleSec > 0) {
                // Operations per hour = 3600 / cycle_time
                throughput = Math.round(3600 / cycleSec);
              }
            }
          }
          // Pattern 12: "один оператор контролирует до X машин" - for multi-robot supervision
          if (!throughput) {
            const multiMatch = data.cases.match(/один оператор контролирует до (\d+) машин/i);
            if (multiMatch) {
              const robotsPerOp = parseInt(multiMatch[1]);
              if (!isNaN(robotsPerOp)) {
                // This doesn't give throughput directly, but indicates high autonomy
                // Could estimate if we have per-robot rate
              }
            }
          }
        }

        // Extract operating hours from description
        let operatingHours = 16;
        const ohMatch = description.match(/(\d+)\s*ч\/сут/i) || description.match(/работ[аы]\s*(\d+)\s*ч/i);
        if (ohMatch) {
          const val = parseInt(ohMatch[1]);
          if (!isNaN(val) && val > 0 && val <= 24) operatingHours = val;
        }

        // Extract reliability from description or rating
        let reliability = 97.0;
        if (rating && rating > 0) {
          reliability = Math.min(99, 90 + rating);
        }

        // Extract accuracy from rating
        let accuracy = 98.5;
        if (rating && rating > 0) {
          accuracy = Math.min(99.9, 95 + rating * 0.5);
        }

        // Estimate power_kw based on payload and type
        let powerKw = null;
        if (payload) {
          if (typeId === 'agv' || category.includes('грузов') || category.includes('тягач') || category.includes('погрузчик')) {
            powerKw = Math.max(2, payload / 500);
          } else if (typeId === 'mobile') {
            powerKw = Math.max(0.5, payload / 1000);
          } else if (typeId === 'stationary') {
            powerKw = Math.max(5, payload / 100);
          } else if (typeId === 'cleaning') {
            powerKw = 1.5;
          }
        }

        // Estimate implementation months based on type and status
        let implMonths = 6;
        if (data.status === 'rnd') implMonths = 18;
        else if (data.status === 'piloting') implMonths = 12;
        else if (typeId === 'stationary') implMonths = 12;
        else if (typeId === 'manipulator') implMonths = 8;

        // Estimate labor_reduction and productivity_lift based on type
        let laborReduction = null;
        let productivityLift = null;
        if (typeId === 'mobile' || typeId === 'agv') {
          laborReduction = 0.35;
          productivityLift = 0.25;
        } else if (typeId === 'stationary') {
          laborReduction = 0.5;
          productivityLift = 0.6;
        } else if (typeId === 'cleaning') {
          laborReduction = 0.3;
          productivityLift = 0.2;
        } else if (typeId === 'manipulator') {
          laborReduction = 0.4;
          productivityLift = 0.35;
        } else if (typeId === 'delivery') {
          laborReduction = 0.25;
          productivityLift = 0.2;
        } else if (typeId === 'inspection') {
          laborReduction = 0.2;
          productivityLift = 0.15;
        } else if (typeId === 'software') {
          laborReduction = 0.15;
          productivityLift = 0.4;
        }

        results.push({
          id: data.id,
          name: name,
          vendor: data.vendor || '',
          type: data.type || '',
          solution_type_id: typeId,
          category: category || '',
          subtype: data.subtype || '',
          description: data.description || '',
          features: [],
          applicable_to: applicableTo.join(','),
          throughput: throughput,
          payload: payload,
          accuracy: accuracy,
          operating_hours: operatingHours,
          footprint: footprint,
          autonomy: autonomy,
          reliability: reliability,
          labor_reduction: laborReduction,
          productivity_lift: productivityLift,
          co2_reduction: 0.1,
          power_kw: powerKw,
          implementation_months: implMonths,
          price: price,
          source: 'ФЦ БАС каталог 2008',
          source_date: new Date().toISOString().split('T')[0],
          verified: data.type === 'brs' ? 1 : 0,
          rating: rating,
          market_potential: marketPotential,
          region: data.region || '',
          industry: data.industry || '',
          status: data.status || '',
          fit: rating ? (rating / 9 * 100) : 80,
        });
      })
      .on('end', () => {
        console.log(`Parsed ${results.length} solutions from catalog CSV`);
        // Log applicable_to distribution
        const dist = {};
        results.forEach(r => {
          r.applicable_to.split(',').forEach(a => {
            dist[a] = (dist[a] || 0) + 1;
          });
        });
        console.log('Applicable_to distribution:', dist);
        resolve(results);
      })
      .on('error', reject);
  });
}

async function parseDatasets(filePath) {
  const xlsx = require('xlsx');
  const wb = xlsx.readFile(filePath, { codepage: 65001 });
  const datasets = {};

  const sheetMap = {
    'Склад': 'warehouse',
    'Аэропорт': 'airport',
    'Медучреждение': 'medical',
  };

  for (const [sheetName, objTypeId] of Object.entries(sheetMap)) {
    if (!wb.Sheets[sheetName]) continue;
    const ws = wb.Sheets[sheetName];
    const rows = xlsx.utils.sheet_to_json(ws, { header: 1, raw: true });

    const params = [];
    let currentSection = '';
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row[0]) continue;
      const cellValue = String(row[0]).trim();
      
      if (cellValue.startsWith('▌')) {
        currentSection = cellValue.replace(/[▌]/g, '').trim();
        continue;
      }
      if (cellValue === 'Параметр' || cellValue.includes('ДЕМО-ДАТАСЕТ') || cellValue === 'ЛЕГЕНДА') continue;
      
      if (row[1] !== undefined && row[2] !== undefined && row.length > 2) {
        params.push({
          param: cellValue,
          unit: row[1] || '',
          defaultValue: row[2] !== undefined ? (typeof row[2] === 'number' ? row[2] : row[2]) : null,
          min: row[3] !== undefined ? (typeof row[3] === 'number' ? row[3] : row[3]) : null,
          max: row[4] !== undefined ? (typeof row[4] === 'number' ? row[4] : row[4]) : null,
          note: row[5] || '',
          section: currentSection || 'Общие',
        });
      }
    }
    datasets[objTypeId] = params;
  }
  return datasets;
}

module.exports = { parseCatalogCsv, parseDatasets };