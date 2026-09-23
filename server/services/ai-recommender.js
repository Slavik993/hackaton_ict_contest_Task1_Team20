const { getDb } = require('../db');
const { calcScenario } = require('./calculation');

function buildSolutionFeatures(solution) {
  const m = solution.metrics || {};
  return {
    throughput: Number(m.throughput) || Number(solution.throughput) || 0,
    payload: Number(m.payload) || Number(solution.payload) || 0,
    accuracy: Number(m.accuracy) || Number(solution.accuracy) || 0,
    reliability: Number(m.reliability) || Number(solution.reliability) || 70,
    power_kw: Number(m.powerKw) || Number(solution.power_kw) || 0,
    price: Number(solution.price) || 0,
    fit: Number(solution.fit) || 50,
  };
}

function buildObjectFeatures(params = {}) {
  return {
    area: Number(params.area) || 0,
    operations: Number(params.operations) || 0,
    staff: Number(params.staff) || 0,
    corridorWidth: Number(params.corridorWidth) || 2.5,
    floorFlatness: Number(params.floorFlatness) || 5,
    powerAvailable: Number(params.powerAvailable) || 50,
    budget: Number(params.budget) || Infinity,
  };
}

function textSimilarity(text = '', query = '') {
  if (!text || !query) return 0;

  const normalize = (str) =>
    str
      .toLowerCase()
      .replace(/[^\wа-яё\s]/gi, ' ')
      .split(/\s+/)
      .filter(Boolean);

  const textTokens = new Set(normalize(text));
  const queryTokens = normalize(query);

  if (queryTokens.length === 0) return 0;

  let matches = 0;
  for (const token of queryTokens) {
    if (textTokens.has(token)) matches++;
  }

  return matches / queryTokens.length;
}

function constraintCheck(params, solution) {
  const obj = buildObjectFeatures(params);
  const sol = buildSolutionFeatures(solution);
  const reasons = [];
  let penalties = 0;

  if (sol.price > obj.budget) {
    reasons.push('Превышает бюджет');
    penalties += 0.4;
  }

  if (sol.power_kw > obj.powerAvailable) {
    reasons.push('Не хватает мощности');
    penalties += 0.3;
  }

  const footprint = Number(solution.footprint) || 1.2;
  if (footprint > obj.corridorWidth) {
    reasons.push('Не проходит по ширине коридора');
    penalties += 0.5;
  }

  const score = Math.max(0, 1 - penalties);
  return {
    ok: score > 0.4,
    score,
    reasons,
  };
}

function economicScore(params, solution) {
  try {
    const result = calcScenario(params, solution);

    const roi = Math.min(Math.max(result.roi || 0, 0), 200) / 200;
    const paybackMonths = result.payback > 0 ? result.payback * 12 : 60;
    const paybackScore = Math.max(0, 1 - paybackMonths / 60);
    const npv = result.npv
      ? Math.min(Math.max(result.npv / 5000000, 0), 1)
      : 0.3;

    return 0.4 * roi + 0.35 * paybackScore + 0.25 * npv;
  } catch (e) {
    return 0.3;
  }
}

function dbRowToSolution(row) {
  if (!row) return null;

  let features = [];
  try {
    features = JSON.parse(row.features || '[]');
  } catch (e) {
    features = [];
  }

  const metrics = {
    throughput: row.throughput,
    payload: row.payload,
    accuracy: row.accuracy,
    operatingHours: row.operating_hours,
    footprint: row.footprint,
    autonomy: row.autonomy,
    reliability: row.reliability,
    laborReduction: row.labor_reduction,
    productivityLift: row.productivity_lift,
    co2Reduction: row.co2_reduction,
    powerKw: row.power_kw,
    implementation: row.implementation_months,
    capexPerUnit: row.price,
    serviceCostPerMonth: 0,
  };

  return {
    id: row.id,
    name: row.name,
    vendor: row.vendor,
    type: row.type || row.solution_type_id,
    solution_type_id: row.solution_type_id,
    category: row.category,
    subtype: row.subtype,
    description: row.description,
    features,
    applicableTo: (row.applicable_to || '').split(',').map(s => s.trim()).filter(Boolean),
    metrics,
    price: row.price,
    source: row.source,
    source_date: row.source_date,
    verified: row.verified,
    rating: row.rating,
    market_potential: row.market_potential,
    region: row.region,
    industry: row.industry,
    status: row.status,
    fit: row.fit,
    throughput: row.throughput,
    payload: row.payload,
    accuracy: row.accuracy,
    operating_hours: row.operating_hours,
    footprint: row.footprint,
    power_kw: row.power_kw,
    reliability: row.reliability,
    labor_reduction: row.labor_reduction,
    productivity_lift: row.productivity_lift,
    co2_reduction: row.co2_reduction,
    implementation_months: row.implementation_months,
  };
}

function rankSolutions(params, solutions, query = '') {
  const ranked = solutions.map((solution) => {
    const constraints = constraintCheck(params, solution);
    if (!constraints.ok) {
      return {
        ...solution,
        aiScore: 0,
        explanation: constraints.reasons.join(', ') || 'Не подходит по ограничениям',
      };
    }

    const solFeatures = buildSolutionFeatures(solution);
    const econ = economicScore(params, solution);
    const textScore = textSimilarity(
      `${solution.description || ''} ${solution.features || ''}`,
      query
    );

    const score =
      0.35 * econ +
      0.30 * constraints.score +
      0.20 * textScore +
      0.15 * (solFeatures.fit / 100);

    const reasons = [];
    if (econ > 0.6) reasons.push('Высокая экономическая эффективность');
    if (constraints.score > 0.8) reasons.push('Хорошо подходит под параметры объекта');
    if (textScore > 0.4) reasons.push('Совпадение с описанием задачи');
    if (solFeatures.fit > 70) reasons.push('Высокий рейтинг решения');

    return {
      ...solution,
      aiScore: Math.round(score * 1000) / 10,
      explanation: reasons.length > 0 ? reasons.join(' • ') : 'Базовое соответствие',
      economicPreview: (() => {
        try {
          return calcScenario(params, solution);
        } catch (e) {
          return null;
        }
      })(),
    };
  });

  return ranked
    .filter((s) => s.aiScore > 0)
    .sort((a, b) => b.aiScore - a.aiScore);
}

function recommend({ objectTypeId, params = {}, query = '', limit = 10 }) {
  const db = getDb();

  let solutions = db
    .prepare(
      `SELECT * FROM solutions 
       WHERE applicable_to LIKE ? OR applicable_to = 'all'
       ORDER BY fit DESC`
    )
    .all(`%${objectTypeId}%`);

  if (!solutions || solutions.length === 0) {
    return [];
  }

  const converted = solutions.map(dbRowToSolution).filter(Boolean);
  const ranked = rankSolutions(params, converted, query);

  return ranked.slice(0, Math.min(limit, 30));
}

module.exports = {
  recommend,
  rankSolutions,
  constraintCheck,
  economicScore,
  buildSolutionFeatures,
  buildObjectFeatures,
  dbRowToSolution,
};
