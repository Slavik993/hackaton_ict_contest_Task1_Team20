/* Временная разведка: экономика по реальным решениям каталога для демо-объектов */
const fs = require('fs');
const path = require('path');
const { calcScenario } = require('../server/services/calculation');

const src = fs.readFileSync(path.join(__dirname, '..', 'data.js'), 'utf8');
const ctx = {};
const fn = new Function('window', 'globalThis', src + '\n;globalThis.__D = HACKATHON_DATA;');
fn(ctx, ctx);
const D = ctx.__D;

const OBJECTS = {
  'Склад (датасет)': { area: 8000, operations: 18000, staff: 60, salary: 82000, shifts: 2, workingDays: 252, electricity: 12.5, horizon: 5, robotAvailability: 0.95, robotUtilization: 0.85, avgWeight: 12, depreciationYears: 5 },
  'Логистический хаб': { area: 25000, operations: 45000, staff: 120, salary: 95000, shifts: 3, workingDays: 365, electricity: 28, horizon: 7, robotAvailability: 0.9, robotUtilization: 0.8, avgWeight: 18, depreciationYears: 5 },
  'Медицинский объект': { area: 45000, operations: 1950, staff: 55, salary: 55000, shifts: 3, workingDays: 365, electricity: 10, avgWeight: 55, horizon: 7, robotAvailability: 0.9, robotUtilization: 0.55, avgWeight: 55, depreciationYears: 7, objectType: 'medical' },
};

const APP = ['warehouse', 'retail', 'airport', 'terminal', 'medical', 'custom'];

for (const [name, params] of Object.entries(OBJECTS)) {
  console.log('\n########## ' + name + ' (ФОТ/год = ' + Math.round(params.staff * params.salary * 12 / 1e6) + ' млн)');
  const rows = [];
  for (const s of D.solutions) {
    const app = s.applicableTo || [];
    const relevant = app.some(a => APP.includes(a));
    if (!relevant) continue;
    const p = calcScenario(params, { metrics: s.metrics });
    rows.push({
      name: s.name,
      capex: s.metrics.capexPerUnit,
      robots: p.robotCount,
      capexM: p.totalCapex / 1e6,
      payback: p.payback,
      irr: p.irr,
      roi: p.roi,
      npvM: p.npv / 1e6,
    });
  }
  rows.sort((a, b) => (b.irr || -99) - (a.irr || -99));
  console.log('  топ-5 по IRR:');
  rows.slice(0, 5).forEach(r => console.log('    ' + r.name.slice(0, 32).padEnd(34) +
    'роб=' + String(r.robots).padStart(3) +
    ' CAPEX=' + r.capexM.toFixed(1).padStart(6) + 'M' +
    ' payback=' + (r.payback > 0 ? r.payback.toFixed(1) : '—').padStart(6) +
    ' IRR=' + (r.irr != null ? (r.irr * 100).toFixed(0) + '%' : '—').padStart(6) +
    ' ROI=' + r.roi.toFixed(0).padStart(6) + '%'));
  rows.sort((a, b) => (a.irr == null ? 999 : a.irr) - (b.irr == null ? 999 : b.irr));
  console.log('  топ-5 по минимуму IRR:');
  rows.slice(0, 5).forEach(r => console.log('    ' + r.name.slice(0, 32).padEnd(34) +
    'роб=' + String(r.robots).padStart(3) +
    ' CAPEX=' + r.capexM.toFixed(1).padStart(6) + 'M' +
    ' payback=' + (r.payback > 0 ? r.payback.toFixed(1) : '—').padStart(6) +
    ' IRR=' + (r.irr != null ? (r.irr * 100).toFixed(0) + '%' : '—').padStart(6) +
    ' ROI=' + r.roi.toFixed(0).padStart(6) + '%'));
  const ok = rows.filter(r => r.irr != null && r.irr > 0.05 && r.irr < 0.6 && r.payback > 0 && r.payback < 8).length;
  console.log('  решений в «здоровом» диапазоне (IRR 5-60%, окупаемость 1-8 лет): ' + ok + ' из ' + rows.length);
}
