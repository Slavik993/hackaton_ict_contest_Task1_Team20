/* eslint-disable no-console */
/**
 * Parity check: клиентский расчёт (app.js calcScenarioLocal) vs серверный
 * (server/services/calculation.js calcScenario).
 *
 * Клиентские функции живут в app.js (браузерный global scope), поэтому
 * извлекаем их через vm-контекст без DOM.
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

function loadClientCalc() {
  const appSrc = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  // Вырезаем только нужные функции + их зависимости
  const ctx = {
    console,
    HACKATHON_DATA: {},
    state: { customParams: {} },
    localStorage: { getItem: () => null, setItem: () => {} },
    window: {},
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] },
    setTimeout: () => {},
    clearInterval: () => {},
    setInterval: () => {},
    // Общие модули расчётов (как в браузере)
    CalcCore: require('../shared/calc-core'),
    FinMath: require('../shared/finmath'),
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  // Выполняем только участок с функциями расчёта: ищем их и добавляем в контекст
  const start = appSrc.indexOf('function calcScenarioLocal(');
  const end = appSrc.indexOf('function calculateEconomics(');
  if (start === -1 || end === -1) throw new Error('calc functions not found');
  // Также нужны хелперы
  const helpers = ['function clamp(', 'function safeFloat(', 'function formatNum(', 'function formatCurrency('];
  let code = '';
  for (const h of helpers) {
    const i = appSrc.indexOf(h);
    if (i === -1) continue;
    // найдём конец функции по балансировке скобок
    let depth = 0, j = appSrc.indexOf('{', i);
    let k = j;
    for (; k < appSrc.length; k++) {
      if (appSrc[k] === '{') depth++;
      else if (appSrc[k] === '}') { depth--; if (depth === 0) break; }
    }
    code += appSrc.substring(i, k + 1) + '\n';
  }
  code += appSrc.substring(start, end);
  vm.runInContext(code + '\nthis.__calc = calcScenarioLocal; this.__loan = calcLoanScenarioLocal; this.__raas = calcRaasScenarioLocal;', ctx);
  return { calc: ctx.__calc, loan: ctx.__loan, raas: ctx.__raas };
}

const { calcScenario, calcLoanScenario, calcRaasScenario } = require('../server/services/calculation');

const CASES = [
  {
    name: 'Базовый склад (airport)',
    params: { area: 8000, operations: 18000, staff: 60, salary: 80000, shifts: 1, workingDays: 250, electricity: 8, horizon: 5, robotAvailability: 0.95, robotUtilization: 0.85, avgWeight: 50, depreciationYears: 5 },
    solution: { metrics: { capexPerUnit: 1200000, throughput: 15, reliability: 0.95, laborReduction: 0.6, productivityLift: 0.18, co2Reduction: 3.5, accuracy: 0.99, payload: 50, footprint: 1.5, powerKw: 2, serviceCostPerMonth: 5000 } },
  },
  {
    name: 'Крупный логистический хаб',
    params: { area: 25000, operations: 45000, staff: 120, salary: 95000, shifts: 3, workingDays: 365, electricity: 28, horizon: 7, robotAvailability: 0.9, robotUtilization: 0.8, avgWeight: 18, depreciationYears: 5, floorFlatness: 5, noiseLevelDb: 30, chargingPowerKw: 50, corridorWidth: 2.0 },
    solution: { metrics: { capexPerUnit: 2500000, throughput: 30, reliability: 0.97, laborReduction: 0.55, productivityLift: 0.22, co2Reduction: 8, accuracy: 0.995, payload: 500, footprint: 3, powerKw: 4, serviceCostPerMonth: 12000 } },
  },
  {
    name: 'Медицинский объект (domain-коррекция)',
    params: { area: 1800, operations: 3200, staff: 24, salary: 68000, shifts: 2, workingDays: 300, electricity: 7.8, horizon: 7, robotAvailability: 0.9, robotUtilization: 0.55, avgWeight: 5, depreciationYears: 7, objectType: 'medical' },
    solution: { metrics: { capexPerUnit: 5000000, throughput: 8, reliability: 0.98, laborReduction: 0.6, productivityLift: 0.3, co2Reduction: 2, accuracy: 0.995, payload: 20, footprint: 2, powerKw: 1, serviceCostPerMonth: 20000 } },
  },
  {
    name: 'Микро-объект (edge case)',
    params: { area: 200, operations: 300, staff: 3, salary: 50000, shifts: 1, workingDays: 250, electricity: 5, horizon: 3, robotAvailability: 0.95, robotUtilization: 0.85, avgWeight: 3, depreciationYears: 5 },
    solution: { metrics: { capexPerUnit: 800000, throughput: 12, reliability: 0.93, laborReduction: 0.4, productivityLift: 0.15, co2Reduction: 1, accuracy: 0.98, payload: 10, footprint: 1, powerKw: 1.5, serviceCostPerMonth: 3000 } },
  },
  {
    name: 'Нулевые параметры (не должно падать)',
    params: { area: 0, operations: 0, staff: 0, salary: 0, shifts: 1, workingDays: 250, electricity: 0, horizon: 5, robotAvailability: 0.95, robotUtilization: 0.85, avgWeight: 0, depreciationYears: 5 },
    solution: { metrics: { capexPerUnit: 1000000, throughput: 10, reliability: 0.9, laborReduction: 0.3, productivityLift: 0.1, co2Reduction: 1, accuracy: 0.95, payload: 10, footprint: 1, powerKw: 1, serviceCostPerMonth: 2000 } },
  },
];

// Разные имена полей на сервере и клиенте
// server.roi = ROI на полном горизонте, server.roi3y = ROI за 3 года
// client.roi = ROI за 3 года (для UI), client.roiHorizon = полный горизонт
const FIELD_MAP = {
  robotCount: { server: 'robotCount', client: 'robotCount' },
  capex: { server: 'totalCapex', client: 'capex' },
  opex: { server: 'totalAnnualOpex', client: 'opex' },
  savings: { server: 'annualSavings', client: 'savings' },
  netAnnual: { server: 'netAnnualEffect', client: 'netAnnual' },
  payback: { server: 'payback', client: 'payback' },
  roiHorizon: { server: 'roi', client: 'roiHorizon' },
  roi3y: { server: 'roi3y', client: 'roi3y' },
  npv: { server: 'npv', client: 'npv' },
  tco: { server: 'tco', client: 'tco' },
};
const FIELDS = Object.keys(FIELD_MAP);

let clientCalc;
try {
  clientCalc = loadClientCalc();
} catch (e) {
  console.error('Не удалось загрузить клиентские функции:', e.message);
  process.exit(2);
}

let totalChecks = 0, totalFails = 0;
const TOL = { capex: 0.02, opex: 0.02, savings: 0.02, netAnnual: 0.02, npv: 0.02, tco: 0.02, roiHorizon: 0.02, roi3y: 0.02, payback: 0.05, robotCount: 0 };

for (const c of CASES) {
  console.log('\n=== ' + c.name + ' ===');
  const s = calcScenario(c.params, c.solution);
  const cl = clientCalc.calc(c.params, c.solution);
  for (const f of FIELDS) {
    totalChecks++;
    const map = FIELD_MAP[f];
    const sv = s[map.server];
    const cv = cl[map.client];
    if (typeof sv !== 'number' || typeof cv !== 'number' || !isFinite(sv) || !isFinite(cv)) {
      console.log('  SKIP ' + f + ' (non-finite: server=' + sv + ' client=' + cv + ')');
      totalChecks--; totalFails++;
      continue;
    }
    const denom = Math.max(1, Math.abs(sv));
    const diff = Math.abs(sv - cv) / denom;
    const tol = TOL[f] || 0.01;
    const ok = diff <= tol;
    if (!ok) totalFails++;
    console.log(
      (ok ? '  OK  ' : ' FAIL ') + f.padEnd(12) +
      ' server=' + sv.toFixed(2).padStart(16) +
      ' client=' + cv.toFixed(2).padStart(16) +
      ' diff=' + (diff * 100).toFixed(2) + '% (tol ' + (tol * 100) + '%)'
    );
  }

  // Сценарии «Кредит» и «RaaS» — тоже должны совпадать (UI vs PDF/API)
  for (const [label, serverFn, clientFn] of [
    ['Кредит', (p) => calcLoanScenario(p, c.solution, s), (p) => clientCalc.loan(p, c.solution, cl)],
    ['RaaS', (p) => calcRaasScenario({ ...p, robotCount: s.robotCount, annualSavings: s.annualSavings, raasBaseCapex: s.totalCapex }, c.solution),
      (p) => clientCalc.raas(p, c.solution, cl)],
  ]) {
    const sv = serverFn(c.params);
    const cv = clientFn(c.params);
    for (const [f, tol] of [['payback', 0.05], ['roi', 0.02], ['npv', 0.02], ['tco', 0.02], ['netAnnualEffect', 0.02]]) {
      totalChecks++;
      const a = sv[f], b = f === 'netAnnualEffect' ? cv.netAnnual : cv[f];
      if (typeof a !== 'number' || typeof b !== 'number' || !isFinite(a) || !isFinite(b)) {
        console.log('  SKIP ' + label + '.' + f + ' (non-finite)');
        totalChecks--; totalFails++;
        continue;
      }
      const diff = Math.abs(a - b) / Math.max(1, Math.abs(a));
      const ok = diff <= tol;
      if (!ok) totalFails++;
      console.log(
        (ok ? '  OK  ' : ' FAIL ') + (label + '.' + f).padEnd(16) +
        ' server=' + a.toFixed(2).padStart(16) +
        ' client=' + (f === 'netAnnualEffect' ? cv.netAnnual : cv[f]).toFixed(2).padStart(16) +
        ' diff=' + (diff * 100).toFixed(2) + '% (tol ' + (tol * 100) + '%)'
      );
    }
  }
}

console.log('\n================================');
console.log('PARITY: ' + (totalChecks - totalFails) + '/' + totalChecks + ' полей совпали');
if (totalFails) { console.log('Расхождения найдены — нужно править.'); process.exit(1); }
else { console.log('Клиент и сервер считают одинаково.'); }
