/**
 * Разовый нормализатор: приводит стоимость сервисного обслуживания в data.js
 * к единому правилу (2,5% CAPEX/год) — как в 187 позициях каталога ФЦ БАС.
 * Запускается вручную: node tools/normalize-service-costs.js
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data.js');
const RATIO = 0.025;

let src = fs.readFileSync(FILE, 'utf8');
let changed = 0;
let total = 0;

const re = /capexPerUnit:\s*(\d+(?:\.\d+)?)\s*,\s*serviceCostPerMonth:\s*(\d+(?:\.\d+)?)/g;

src = src.replace(re, (match, capexRaw, svcRaw) => {
  total++;
  const capex = Number(capexRaw);
  const expected = Math.round((capex * RATIO) / 12 / 100) * 100;
  if (Number(svcRaw) === expected) return match;
  changed++;
  return `capexPerUnit: ${capexRaw}, serviceCostPerMonth: ${expected}`;
});

fs.writeFileSync(FILE, src, 'utf8');
console.log(`Обработано записей: ${total}, изменено: ${changed}`);
