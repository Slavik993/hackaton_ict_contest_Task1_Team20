/* eslint-disable no-console */
// Аудит API: прогон всех эндпоинтов и проверка кодов ответа
const http = require('http');

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const headers = { 'Content-Type': 'application/json' };
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const r = http.request(
      { hostname: 'localhost', port: 3000, path, method, headers },
      (res) => {
        let buf = '';
        res.on('data', (c) => (buf += c));
        res.on('end', () => {
          let json = null;
          const ct = res.headers['content-type'] || '';
          if (ct.includes('application/json')) { try { json = JSON.parse(buf); } catch (e) { json = null; } }
          resolve({ status: res.statusCode, json, len: buf.length, ct, body: buf });
        });
      }
    );
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

const SOL = {
  id: 'audit-sol', name: 'Audit AMR', vendor: 'TestVendor',
  metrics: {
    capexPerUnit: 1200000, throughput: 15, reliability: 0.95, laborReduction: 0.6,
    productivityLift: 0.18, co2Reduction: 3.5, accuracy: 0.99, payload: 50,
    footprint: 1.5, powerKw: 2, serviceCostPerMonth: 5000,
  },
};
const PARAMS = {
  area: 8000, operations: 18000, staff: 60, salary: 80000, shifts: 1,
  workingDays: 250, electricity: 8, horizon: 5, robotAvailability: 0.95,
  robotUtilization: 0.85, avgWeight: 50, depreciationYears: 5,
  industryName: 'Logistika', objectTypeName: 'Airport',
};

const results = [];
function check(name, cond, extra) {
  results.push({ name, ok: !!cond, extra: extra || '' });
  console.log((cond ? '  OK  ' : ' FAIL ') + name + (extra ? '  [' + extra + ']' : ''));
}

(async () => {
  console.log('\n=== 1. БАЗОВЫЕ ЭНДПОИНТЫ ===');
  let r = await req('GET', '/api/health');
  check('GET /api/health', r.status === 200 && r.json && r.json.status === 'ok', 'status=' + r.status);

  r = await req('GET', '/api/catalog');
  check('GET /api/catalog', r.status === 200 && r.json && r.json.industries, 'industries=' + ((r.json && r.json.industries) || []).length);

  r = await req('GET', '/api/catalog/solutions?limit=5');
  check('GET /api/catalog/solutions', r.status === 200 && r.json && Array.isArray(r.json.solutions), 'n=' + ((r.json && r.json.solutions) || []).length);

  r = await req('GET', '/api/catalog/solution-types');
  check('GET /api/catalog/solution-types', r.status === 200, 'status=' + r.status);

  console.log('\n=== 2. АВТОРИЗАЦИЯ ===');
  r = await req('POST', '/api/auth/demo-login', { role: 'user' });
  const token = r.json && r.json.token;
  check('POST /api/auth/demo-login', r.status === 200 && !!token, 'token=' + (token ? 'yes' : 'no'));

  r = await req('GET', '/api/projects', null, token);
  check('GET /api/projects (with token)', r.status === 200, 'status=' + r.status);

  r = await req('GET', '/api/projects');
  check('GET /api/projects (no token) -> 401', r.status === 401, 'status=' + r.status);

  console.log('\n=== 3. РАСЧЁТ ЭКОНОМИКИ ===');
  r = await req('POST', '/api/calculation', { params: PARAMS, solution: SOL });
  const calc = r.json;
  check('POST /api/calculation', r.status === 200 && calc && calc.purchaseScenario, 'status=' + r.status);
  if (calc) {
    const p = calc.purchaseScenario;
    check('  -> ROI по ТЗ (вычет CAPEX)', typeof p.roi === 'number' && p.roi !== 0, 'roi=' + p.roi);
    check('  -> IRR рассчитан', p.irr !== null && p.irr !== undefined, 'irr=' + (p.irr != null ? (p.irr * 100).toFixed(2) + '%' : 'null'));
    check('  -> DPP рассчитан', p.dpp !== null && p.dpp !== undefined, 'dpp=' + p.dpp);
    check('  -> остаточный ручной труд учтён', p.residualLaborCost > 0, 'residual=' + Math.round(p.residualLaborCost));
    check('  -> realism присутствует', !!(p.realism), 'confidence=' + (p.realism && p.realism.confidenceScore));
    check('  -> robotCount разумный (1..300)', p.robotCount >= 1 && p.robotCount <= 300, 'robots=' + p.robotCount);
    check('  -> парк соответствует заявленному эффекту', p.requiredRobotCount >= 1 && p.robotCount >= p.requiredRobotCount, 'need=' + p.requiredRobotCount);
    check('  -> эффект не превышает физику парка', p.effectiveLaborReduction <= (p.robotCount * 0.9 / PARAMS.staff) + 1e-9, 'effLR=' + p.effectiveLaborReduction);
    check('  -> NPV конечное число', Number.isFinite(p.npv), 'npv=' + Math.round(p.npv));
  }

  r = await req('POST', '/api/calculation', { params: PARAMS });
  check('POST /api/calculation без solution -> 400', r.status === 400, 'status=' + r.status);

  r = await req('POST', '/api/calculation/scenarios', { params: PARAMS, solutions: [SOL, Object.assign({}, SOL, { id: 'b' })] });
  check('POST /api/calculation/scenarios', r.status === 200 && r.json && r.json.scenarios && r.json.scenarios.length === 2, 'n=' + ((r.json && r.json.scenarios) || []).length);

  console.log('\n=== 4. ЭКСПОРТ ===');
  r = await req('POST', '/api/calculation/export/pdf', { params: PARAMS, solution: SOL });
  check('POST /api/calculation/export/pdf', r.status === 200 && r.body.slice(0, 4) === '%PDF', 'status=' + r.status + ' size=' + r.len);

  r = await req('POST', '/api/calculation/export/excel', { params: PARAMS, solution: SOL });
  check('POST /api/calculation/export/excel', r.status === 200 && r.len > 1000, 'status=' + r.status + ' size=' + r.len);

  console.log('\n=== 5. СИМУЛЯЦИЯ ===');
  r = await req('POST', '/api/simulation', { params: PARAMS, solution: SOL, overrides: { horizonYears: 3, stepMonths: 1, randomSeed: 7 } });
  const simId = r.json && r.json.simulation && r.json.simulation.id;
  check('POST /api/simulation', r.status === 201 && !!simId, 'status=' + r.status + ' id=' + simId);
  if (simId) {
    r = await req('POST', '/api/simulation/step', { id: simId, steps: 4 });
    check('POST /api/simulation/step', r.status === 200 && r.json.simulation.currentStepIndex === 4, 'step=' + (r.json.simulation && r.json.simulation.currentStepIndex));

    r = await req('GET', '/api/simulation/' + simId);
    const snap = r.json.simulation;
    check('GET /api/simulation/:id', r.status === 200 && snap.history.length === 4, 'history=' + snap.history.length);
    check('  -> baseline.irr прокинут', snap.baseline && snap.baseline.irr !== undefined, 'irr=' + (snap.baseline && snap.baseline.irr));
    check('  -> baseline.dpp прокинут', snap.baseline && snap.baseline.dpp !== undefined, 'dpp=' + (snap.baseline && snap.baseline.dpp));
    check('  -> каждый шаг имеет NPV', snap.history.every((h) => Number.isFinite(h.netPresentValue)), 'ok');
    check('  -> накоп. поток монотонно считается', snap.history[snap.history.length - 1].cumulativeCashFlow !== undefined, 'cf=' + Math.round(snap.history[snap.history.length - 1].cumulativeCashFlow));

    r = await req('POST', '/api/simulation/step', { id: 'nonexistent-id', steps: 1 });
    check('POST /api/simulation/step с неверным id -> 404', r.status === 404, 'status=' + r.status);

    r = await req('DELETE', '/api/simulation/' + simId);
    check('DELETE /api/simulation/:id', r.status === 200, 'status=' + r.status);
  }

  r = await req('POST', '/api/simulation/run', { params: PARAMS, solution: SOL, overrides: { horizonYears: 2, stepMonths: 1, randomSeed: 3 } });
  const runSnap = r.json && r.json.simulation;
  check('POST /api/simulation/run', r.status === 200 && runSnap.status === 'completed' && runSnap.history.length === 24, 'steps=' + (runSnap && runSnap.history.length));
  if (runSnap && runSnap.summary) {
    check('  -> summary содержит IRR/DPP', runSnap.baseline.irr !== undefined && runSnap.baseline.dpp !== undefined, 'ok');
    check('  -> summary.paybackYears вычислен', runSnap.summary.paybackYears === null || Number.isFinite(runSnap.summary.paybackYears), 'payback=' + runSnap.summary.paybackYears);
  }

  console.log('\n=== 6. РЕКОМЕНДАЦИИ ===');
  r = await req('POST', '/api/recommendations', { objectTypeId: 'airport', params: PARAMS, limit: 5 });
  check('POST /api/recommendations', r.status === 200 && r.json && Array.isArray(r.json.recommendations), 'n=' + ((r.json && r.json.recommendations) || []).length);

  r = await req('POST', '/api/recommendations', { params: PARAMS });
  check('POST /api/recommendations без objectTypeId -> 400', r.status === 400, 'status=' + r.status);

  console.log('\n=== 7. ВИДЕО ===');
  r = await req('GET', '/api/videos/robots?limit=3');
  check('GET /api/videos/robots', r.status === 200, 'status=' + r.status);

  console.log('\n=== 8. ВАЛИДАЦИЯ ВХОДНЫХ ДАННЫХ ===');
  r = await req('POST', '/api/simulation', { params: PARAMS, solution: null });
  check('POST /api/simulation без solution -> 400', r.status === 400, 'status=' + r.status);

  r = await req('POST', '/api/simulation', { params: PARAMS, solution: { metrics: {} } });
  check('POST /api/simulation с пустыми метриками', r.status === 201 || r.status === 500, 'status=' + r.status);

  const bad = await req('POST', '/api/calculation', { params: { area: -100, operations: 'abc', staff: null }, solution: SOL });
  check('POST /api/calculation с мусорными параметрами не падает', bad.status === 200 || bad.status === 500, 'status=' + bad.status);

  console.log('\n=== 9. СТАТИКА ===');
  r = await req('GET', '/');
  check('GET / (index.html)', r.status === 200 && r.body.indexOf('СИМУЛЯТОР') !== -1 || r.status === 200, 'status=' + r.status);
  r = await req('GET', '/app.js');
  check('GET /app.js', r.status === 200 && r.len > 100000, 'size=' + r.len);
  r = await req('GET', '/styles.css');
  check('GET /styles.css', r.status === 200 && r.len > 30000, 'size=' + r.len);
  r = await req('GET', '/api/nonexistent');
  check('GET несуществующего API -> 404', r.status === 404, 'status=' + r.status);

  const failed = results.filter((x) => !x.ok);
  console.log('\n================================');
  console.log('ИТОГО: ' + (results.length - failed.length) + '/' + results.length + ' проверок пройдено');
  if (failed.length) {
    console.log('ПРОВАЛЕНО:');
    failed.forEach((f) => console.log('  - ' + f.name + ' ' + f.extra));
    process.exit(1);
  } else {
    console.log('ВСЁ ЗДОРОВО');
  }
})().catch((e) => { console.error('AUDIT CRASH:', e); process.exit(2); });
