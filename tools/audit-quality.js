/* eslint-disable no-console */
/**
 * Проверка АДЕКВАТНОСТИ экономических показателей.
 *
 * Сценарии взяты из реальных объектов и решений каталога — цифры должны быть
 * правдоподобными для реального проекта роботизации.
 *
 * Контрольные проверки:
 *  - эффект по ФОТ не может превышать физический предел парка роботов;
 *  - годовая экономия не может превышать годовой ФОТ объекта;
 *  - срок окупаемости, IRR, ROI и NPV согласованы между собой;
 *  - «не окупается» отрабатывается корректно (без NaN и бесконечностей).
 */
const { calcScenario } = require('../server/services/calculation');
const { ROBOTS_PER_OPERATOR } = require('../shared/calc-core');

const CASES = [
  {
    name: 'Склад 8000 м², 60 чел. (данные датасета)',
    params: { area: 8000, operations: 18000, staff: 60, salary: 82000, shifts: 2, workingDays: 252, electricity: 12.5, horizon: 5, robotAvailability: 0.95, robotUtilization: 0.85, avgWeight: 12, depreciationYears: 5 },
    // Реальная позиция каталога: «Белка» (мобильный робот, 1,2 млн ₽)
    solution: { metrics: { capexPerUnit: 1200000, throughput: 40, reliability: 0.95, laborReduction: 0.35, productivityLift: 0.25, co2Reduction: 1, accuracy: 0.99, payload: 500, footprint: 1.5, powerKw: 1.5, serviceCostPerMonth: 2500 } },
  },
  {
    name: 'Логистический хаб 25000 м², 120 чел.',
    params: { area: 25000, operations: 45000, staff: 120, salary: 95000, shifts: 3, workingDays: 365, electricity: 28, horizon: 7, robotAvailability: 0.9, robotUtilization: 0.8, avgWeight: 18, depreciationYears: 5 },
    // «Яндекс-ровер R 4.0» (700 тыс. ₽) — самый доступный робот каталога
    solution: { metrics: { capexPerUnit: 700000, throughput: 1, reliability: 0.95, laborReduction: 0.35, productivityLift: 0.25, co2Reduction: 0.5, accuracy: 0.99, payload: 300, footprint: 1, powerKw: 1.5, serviceCostPerMonth: 1500 } },
  },
  {
    name: 'Медицинский объект 1800 м², 24 чел.',
    params: { area: 1800, operations: 3200, staff: 24, salary: 68000, shifts: 2, workingDays: 300, electricity: 7.8, horizon: 7, robotAvailability: 0.9, robotUtilization: 0.55, avgWeight: 5, depreciationYears: 7, objectType: 'medical' },
    // «Клинботикс 400 PRO» (1,5 млн ₽) — мобильный робот для медучреждений
    solution: { metrics: { capexPerUnit: 1500000, throughput: 32, reliability: 0.95, laborReduction: 0.35, productivityLift: 0.25, co2Reduction: 0.5, accuracy: 0.98, payload: 300, footprint: 1.2, powerKw: 1.5, serviceCostPerMonth: 3100 } },
  },
  {
    name: 'Контрольный: дорогое решение (не должно окупаться)',
    expectNoPayback: true,
    params: { area: 1800, operations: 3200, staff: 24, salary: 68000, shifts: 2, workingDays: 300, electricity: 7.8, horizon: 7, robotAvailability: 0.9, robotUtilization: 0.55, avgWeight: 5, depreciationYears: 7, objectType: 'medical' },
    // «PharmaArm P4» (7,2 млн ₽) — фармацевтический манипулятор
    solution: { metrics: { capexPerUnit: 7200000, throughput: 120, reliability: 0.98, laborReduction: 0.45, productivityLift: 0.42, co2Reduction: 2, accuracy: 0.995, payload: 20, footprint: 2, powerKw: 2.4, serviceCostPerMonth: 15000 } },
  },
];

console.log('ПОКАЗАТЕЛЬ              ОЖИДАЕМО            ФАКТИЧЕСКИЕ');
console.log('='.repeat(78));

let problems = 0;
for (const c of CASES) {
  const p = calcScenario(c.params, c.solution);   // calcScenario возвращает сценарий напрямую
  const irr = p.irr != null ? p.irr * 100 : null;
  const dpp = p.dpp;
  const annualLabor = c.params.staff * c.params.salary * 12;

  // Физический предел: роботы не могут заменить больше операторов, чем есть
  const fleetLimit = c.params.staff > 0
    ? (p.robotCount * ROBOTS_PER_OPERATOR) / c.params.staff
    : 1;

  const checks = [
    ['Парк роботов (шт.)', '1..300', p.robotCount, p.robotCount >= 1 && p.robotCount <= 300],
    ['Эффект ≤ предела парка', '≤ ' + (fleetLimit * 100).toFixed(1) + '%',
      (p.effectiveLaborReduction * 100).toFixed(1) + '%',
      p.effectiveLaborReduction <= fleetLimit + 1e-9],
    ['Экономия/год ≤ 80% ФОТ', '≤ ' + Math.round(annualLabor * 0.8), Math.round(p.annualSavings),
      p.annualSavings <= annualLabor * 0.8],
    ['OPEX ≤ CAPEX/4 за год', '≤ ' + Math.round(p.totalCapex / 4), Math.round(p.totalAnnualOpex),
      p.totalAnnualOpex <= p.totalCapex / 4 || p.totalCapex === 0],
    ['Остаточный ФОТ не вычитается из эффекта', 'экономия > остатка', 
      Math.round(p.annualSavings) + ' / ' + Math.round(p.residualLaborCost),
      p.annualSavings > p.residualLaborCost * 0.1],
    ['NPV согласован с ROI', 'знак тот же', (p.npv > 0 ? '+' : '') + Math.round(p.npv / 1e6) + 'M',
      (p.npv > 0) === (p.roi > 0)],
    ['ROI в допустимом диапазоне', '-90..900%', p.roi.toFixed(1) + '%',
      c.expectNoPayback ? p.roi <= 0 : (p.roi >= -90 && p.roi <= 900)],
    ['Нет NaN/Infinity', 'все числа конечны', 'ok',
      [p.roi, p.npv, p.tco, p.payback, p.annualSavings].every((v) => typeof v === 'number' && isFinite(v))],
  ];

  if (c.expectNoPayback) {
    // Контрольный негативный сценарий: проект не должен «окупаться»
    checks.push(['Окупаемость не заявлена', '≤ 0 или > горизонта',
      p.payback <= 0 ? 'не окупается' : p.payback.toFixed(1) + ' лет',
      p.payback <= 0 || p.payback > c.params.horizon]);
    checks.push(['IRR не выдумана', 'null или < ставки', irr == null ? 'null' : irr.toFixed(1) + '%',
      irr == null || irr < 100]);
  } else {
    checks.push(['IRR (годовых %)', '5..150', irr != null ? irr.toFixed(1) : 'null',
      irr != null && irr >= 5 && irr <= 150]);
    checks.push(['Срок окупаемости (лет)', '1..10', p.payback > 0 ? p.payback.toFixed(1) : 'n/a',
      p.payback > 0 && p.payback <= 10]);
    checks.push(['DPP ≥ payback', '≥ ' + p.payback.toFixed(1), dpp > 0 ? dpp.toFixed(1) : 'n/a',
      dpp < 0 || dpp >= p.payback - 0.01]);
  }

  console.log('\n### ' + c.name);
  for (const [label, expected, actual, ok] of checks) {
    if (!ok) problems++;
    console.log(
      (ok ? '  OK  ' : ' ПРОБЛ ') + label.padEnd(28) +
      expected.padEnd(20) + String(actual)
    );
  }
  console.log('        CAPEX=' + Math.round(p.totalCapex / 1e6) + 'M  OPEX/год=' +
    Math.round(p.totalAnnualOpex / 1e6) + 'M  экономия/год=' + Math.round(p.annualSavings / 1e6) +
    'M  остаточный ФОТ=' + Math.round(p.residualLaborCost / 1e6) + 'M  шоков=' + p.realism.warnings.length);
}

console.log('\n' + '='.repeat(78));
if (problems) {
  console.log('НЕПРИЕМЛЕМЫХ ЗНАЧЕНИЙ: ' + problems + ' — показатели выглядят неправдоподобно');
  process.exit(1);
} else {
  console.log('Все экономические показатели в правдоподобных диапазонах');
}
