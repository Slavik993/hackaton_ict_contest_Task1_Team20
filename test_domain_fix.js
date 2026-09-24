const { calcAll } = require('./server/services/calculation');

const solution = {
  metrics: {
    throughput: 30,
    capexPerUnit: 2200000,
    powerKw: 0.9,
    payload: 25,
    laborReduction: 0.38,
    productivityLift: 0.27,
    serviceCostPerMonth: 0,
  },
};

// Реальные параметры медучреждения из data.js
const medicalParams = {
  area: 45000,
  operations: 1950,
  staff: 55,
  salary: 55000,
  shifts: 3,
  workingDays: 365,
  electricity: 10,
  corridorWidth: 2.4,
  floorFlatness: 2,
  noiseLevelDb: 30,
  chargingPowerKw: 80,
};

console.log('=== МЕДУЧРЕЖДЕНИЕ (social) — ПОСЛЕ всех исправлений ===');
const r = calcAll({ ...medicalParams, industry: 'social', objectType: 'medical' }, solution);
const p = r.purchaseScenario;
console.log('laborReduction used:', p.assumptions.laborReduction || 'n/a');
console.log('utilization used:', p.assumptions.utilization);
console.log('horizon:', p.assumptions.horizon);
console.log('Роботов:', p.robotCount);
console.log('CAPEX:', Math.round(p.totalCapex).toLocaleString('ru-RU'), '₽');
console.log('Экономия/год:', Math.round(p.annualSavings).toLocaleString('ru-RU'), '₽');
console.log('Окупаемость:', p.payback.toFixed(2), 'лет');
console.log('ROI за 3 года:', p.roi.toFixed(1), '%');
console.log('ROI на горизонте:', p.roiHorizon.toFixed(1), '%');
console.log('');
console.log('=== СКЛАД (trade) — без корректировки ===');
const warehouse = calcAll({ ...medicalParams, industry: 'trade', objectType: 'warehouse' }, solution);
const wp = warehouse.purchaseScenario;
console.log('Окупаемость:', wp.payback.toFixed(2), 'лет');
console.log('ROI за 3 года:', wp.roi.toFixed(1), '%');
console.log('ROI на горизонте:', wp.roiHorizon.toFixed(1), '%');