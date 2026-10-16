/**
 * Economic simulation engine
 *
 * Drives a year-by-year (or month-by-month) economic simulation that combines
 * the deterministic CAPEX/OPEX model with stochastic shocks (utilization drift,
 * tariff escalation, inflation, robot reliability events).  Each run yields a
 * time series of economic indicators that are consumed both by the UI chart
 * and the REST API for cross-validation.
 *
 * The simulator is stateful but stored in-process — a single simulation instance
 * represents one async economic experiment that runs for a configurable horizon.
 */

'use strict';

const crypto = require('crypto');
const { calcScenario, defaults: calcDefaults } = require('./calculation');

// ---------------------------------------------------------------------------
// Tunables (sane defaults; can be overridden via run params)
// ---------------------------------------------------------------------------

const DEFAULTS = {
  horizonYears: 5,                  // simulation horizon in years
  stepMonths: 1,                    // simulation step granularity
  randomSeed: null,                 // for reproducible runs; auto-generated if null
  inflationRate: 0.06,              // annual OPEX escalation
  energyTariffGrowth: 0.08,         // annual electricity tariff growth
  salaryEscalation: 0.05,           // annual labour price increase
  utilizationDrift: 0.02,           // random monthly utilization drift (std-dev)
  reliabilityShockProb: 0.04,       // monthly probability of a reliability shock
  shockCapexImpact: 0.08,           // unexpected CAPEX when shock happens
  shockOpexImpact: 0.15,            // OPEX spike when shock happens
  adoptionRampMonths: 6,            // ramp-up period before full productivity
  discountRate: calcDefaults.discountRate,
  // Stochastic multipliers (kept deterministic by default via seed)
  jitterUtilization: 0.03,          // month-to-month utilization noise
  jitterEnergy: 0.04,               // month-to-month energy noise
  jitterMarket: 0.02,               // month-to-month productivity noise
};

// Deterministic PRNG (mulberry32) for reproducible runs
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng) {
  // Box-Muller transform
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function generateId() {
  return crypto.randomBytes(8).toString('hex');
}

// In-memory store of running simulations
const simulations = new Map();

function getSimulation(id) {
  return simulations.get(id) || null;
}

function listSimulations() {
  return Array.from(simulations.values()).map((s) => ({
    id: s.id,
    status: s.status,
    horizonYears: s.config.horizonYears,
    startedAt: s.startedAt,
    completedAt: s.completedAt,
    currentStepIndex: s.history.length,
    totalSteps: s.totalSteps,
  }));
}

function deleteSimulation(id) {
  return simulations.delete(id);
}

// ---------------------------------------------------------------------------
// Simulation lifecycle
// ---------------------------------------------------------------------------

/**
 * Create a new simulation.  Accepts the same params the calculation service
 * accepts, plus optional overrides for the stochastic tunables.
 */
function createSimulation({ params, solution, overrides, model = 'purchase' } = {}) {
  if (!params || !solution) {
    throw new Error('Для запуска симуляции нужны params и solution');
  }

  const config = Object.assign({}, DEFAULTS, overrides || {});
  const seed = config.randomSeed != null
    ? Number(config.randomSeed)
    : Math.floor(Math.random() * 0xffffffff);

  // Baseline scenario from the deterministic calculator
  const baseline = calcScenario({ ...params, model }, solution);

  const id = generateId();
  const totalSteps = Math.max(1, Math.ceil((config.horizonYears * 12) / config.stepMonths));

  const state = {
    id,
    status: 'running',
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    completedAt: null,
    config,
    model,
    seed,
    rng: mulberry32(seed),
    totalSteps,
    currentStepIndex: 0,
    history: [],
    // Persistent economic state derived from baseline:
    economy: {
      capexPaid: 0,
      opexPaid: 0,
      savingsEarned: 0,
      cumulativeCashFlow: -baseline.totalCapex,
      netPresentValue: -baseline.totalCapex,
      accumulatedCO2: 0,
      remainingCapexLiability: baseline.totalCapex,
      isOperational: false,
    },
    baseline,
    shocks: [],
    summary: null,
  };

  simulations.set(id, state);
  return state;
}

/**
 * Advance a simulation by exactly `deltaSteps` steps (defaults to 1).
 * Returns the updated state snapshot.
 */
function stepSimulation(id, deltaSteps = 1) {
  const sim = simulations.get(id);
  if (!sim) throw new Error(`Симуляция ${id} не найдена`);
  if (sim.status === 'completed') return sim;

  for (let i = 0; i < deltaSteps; i++) {
    if (sim.status === 'completed') break;
    advanceOneStep(sim);
  }

  if (sim.history.length >= sim.totalSteps) {
    finalizeSimulation(sim);
  }

  return sim;
}

/**
 * Run the simulation to completion in a single pass.  Returns final state.
 */
function runSimulation({ params, solution, overrides, model } = {}) {
  const sim = createSimulation({ params, solution, overrides, model });
  const totalSteps = sim.totalSteps;
  for (let i = 0; i < totalSteps; i++) {
    advanceOneStep(sim);
  }
  finalizeSimulation(sim);
  return sim;
}

function advanceOneStep(sim) {
  const cfg = sim.config;
  const base = sim.baseline;
  const stepIndex = sim.currentStepIndex;
  const stepIndexHuman = stepIndex + 1;
  const monthIndex = stepIndex * cfg.stepMonths;
  const yearIndex = Math.floor(monthIndex / 12);
  const monthInYear = (monthIndex % 12) + 1;

  // Adoption ramp: robots deliver fractional productivity until fully ramped
  const rampFraction = clamp01(
    (monthIndex - cfg.adoptionRampMonths) / Math.max(1, cfg.adoptionRampMonths)
  );

  // Stochastic noise components
  const noiseUtil = clamp01(
    cfg.jitterUtilization * gaussian(sim.rng) / Math.sqrt(cfg.stepMonths)
  );
  const noiseEnergy = 1 + cfg.jitterEnergy * gaussian(sim.rng) / Math.sqrt(cfg.stepMonths);
  const noiseMarket = 1 + cfg.jitterMarket * gaussian(sim.rng) / Math.sqrt(cfg.stepMonths);

  // Reliability shocks – probabilistic, monthly
  let shock = false;
  let shockDeltaCapex = 0;
  let shockDeltaOpex = 0;
  if (sim.rng() < cfg.reliabilityShockProb * (cfg.stepMonths / 12) * 12 / 12) {
    // Compare with monthly probability
    if (sim.rng() < cfg.reliabilityShockProb * cfg.stepMonths) {
      shock = true;
      shockDeltaCapex = base.totalCapex * cfg.shockCapexImpact * (0.5 + sim.rng());
      shockDeltaOpex = base.totalAnnualOpex * cfg.shockOpexImpact * (0.4 + sim.rng());
      sim.shocks.push({ stepIndex: stepIndexHuman, capex: shockDeltaCapex, opex: shockDeltaOpex });
    }
  }

  // Time-varying escalators applied fractionally per step
  const monthlyInflation = Math.pow(1 + cfg.inflationRate, cfg.stepMonths / 12) - 1;
  const monthlyTariffGrowth = Math.pow(1 + cfg.energyTariffGrowth, cfg.stepMonths / 12) - 1;
  const monthlySalaryGrowth = Math.pow(1 + cfg.salaryEscalation, cfg.stepMonths / 12) - 1;

  const inflationMultiplier = Math.pow(1 + monthlyInflation, stepIndex);
  const tariffMultiplier = Math.pow(1 + monthlyTariffGrowth, stepIndex);
  const salaryMultiplier = Math.pow(1 + monthlySalaryGrowth, stepIndex);

  // Effective utilization = ramp + drift + noise
  const baseUtil = clamp01(base.assumptions && base.assumptions.utilization
    ? base.assumptions.utilization : 0.85);
  const effectiveUtil = clamp01(baseUtil * rampFraction + baseUtil * 0.05 * Math.sin(monthIndex / 6) + noiseUtil);

  // Effective energy multiplier
  const energyMultiplier = Math.max(0.4, noiseEnergy) * tariffMultiplier;

  // Effective savings multiplier (market demand + productivity drift)
  const savingsMultiplier = Math.max(0.5, noiseMarket * (1 + 0.02 * Math.sin(monthIndex / 4))) * salaryMultiplier;

  // Step-level CAPEX spend pattern (linear over implementation window, defaults to first year)
  const implementationMonths = (base.assumptions && base.assumptions.implementationMonths)
    || cfg.adoptionRampMonths;
  const capexStepPortion = monthIndex < implementationMonths
    ? 1 / Math.max(1, implementationMonths / cfg.stepMonths)
    : 0;

  const stepCapex = base.totalCapex * capexStepPortion * cfg.stepMonths + shockDeltaCapex;
  const stepOpex = (base.totalAnnualOpex * (cfg.stepMonths / 12)) * inflationMultiplier
    + ((base.annualElectricity || 0) * (cfg.stepMonths / 12)) * (energyMultiplier - 1)
    + shockDeltaOpex;
  const stepSavings = (base.annualSavings * (cfg.stepMonths / 12)) * savingsMultiplier
    * effectiveUtil;

  // Update cumulative economy
  sim.economy.capexPaid += stepCapex;
  sim.economy.opexPaid += stepOpex;
  sim.economy.savingsEarned += stepSavings;
  sim.economy.remainingCapexLiability = Math.max(0, base.totalCapex - sim.economy.capexPaid);
  sim.economy.accumulatedCO2 += base.co2Reduction * (cfg.stepMonths / 12) * effectiveUtil;

  const stepNetCashFlow = stepSavings - stepOpex - stepCapex;
  sim.economy.cumulativeCashFlow += stepNetCashFlow;

  // Discount the step contribution to NPV
  const discountPeriod = monthIndex + cfg.stepMonths;
  const discountFactor = Math.pow(1 + cfg.discountRate, discountPeriod / 12);
  sim.economy.netPresentValue += stepNetCashFlow / discountFactor;

  sim.history.push({
    stepIndex: stepIndexHuman,
    month: monthInYear,
    year: yearIndex + 1,
    capex: stepCapex,
    opex: stepOpex,
    savings: stepSavings,
    netCashFlow: stepNetCashFlow,
    cumulativeCashFlow: sim.economy.cumulativeCashFlow,
    netPresentValue: sim.economy.netPresentValue,
    utilization: effectiveUtil * 100,
    energyMultiplier,
    savingsMultiplier,
    shockOccurred: shock,
    shockDeltaCapex,
    shockDeltaOpex,
    rampFraction,
  });

  sim.currentStepIndex += 1;
}

function finalizeSimulation(sim) {
  sim.status = 'completed';
  sim.completedAt = new Date().toISOString();

  const horizonCash = sim.history.reduce((acc, h) => acc + (h.netCashFlow || 0), 0);
  const totalCapex = sim.baseline.totalCapex;
  const totalOpex = sim.economy.opexPaid;
  const totalSavings = sim.economy.savingsEarned;

  let paybackStep = null;
  let running = -totalCapex;
  for (const h of sim.history) {
    running += h.netCashFlow;
    if (running >= 0 && paybackStep === null) {
      paybackStep = h.stepIndex;
    }
  }

  const npv = sim.economy.netPresentValue;
  const roi = totalCapex > 0 ? ((horizonCash - totalCapex) / totalCapex) * 100 : 0;
  const roi3 = totalCapex > 0
    ? ((sim.history.slice(0, Math.min(36, sim.history.length)).reduce((acc, h) => acc + h.netCashFlow, 0))
       / totalCapex) * 100
    : 0;

  sim.summary = {
    horizonYears: sim.config.horizonYears,
    totalSteps: sim.history.length,
    totalCapex,
    totalOpex,
    totalSavings,
    netCashFlow: horizonCash,
    netPresentValue: npv,
    paybackStep,
    paybackYears: paybackStep != null ? (paybackStep * sim.config.stepMonths) / 12 : null,
    roi,
    roi3Years: roi3,
    accumulatedCO2: sim.economy.accumulatedCO2,
    shocks: sim.shocks.length,
    completedAt: sim.completedAt,
  };
}

function clamp01(v) {
  return Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));
}

function snapshot(sim) {
  return {
    id: sim.id,
    status: sim.status,
    config: sim.config,
    model: sim.model,
    seed: sim.seed,
    startedAt: sim.startedAt,
    completedAt: sim.completedAt,
    currentStepIndex: sim.currentStepIndex,
    totalSteps: sim.totalSteps,
    history: sim.history,
    summary: sim.summary,
    baseline: extractBaselineSummary(sim.baseline),
    shocks: sim.shocks,
  };
}

function extractBaselineSummary(baseline) {
  if (!baseline) return null;
  return {
    totalCapex: baseline.totalCapex,
    irr: baseline.irr,
    dpp: baseline.dpp,
    totalAnnualOpex: baseline.totalAnnualOpex,
    annualSavings: baseline.annualSavings,
    netAnnualEffect: baseline.netAnnualEffect,
    robotCount: baseline.robotCount,
    payback: baseline.payback,
    roi: baseline.roi,
    roi3y: baseline.roi3y,
    npv: baseline.npv,
    tco: baseline.tco,
    co2Reduction: baseline.co2Reduction,
  };
}

function getSnapshot(id) {
  const sim = simulations.get(id);
  if (!sim) return null;
  return snapshot(sim);
}

function getSummary(id) {
  const sim = simulations.get(id);
  return sim ? sim.summary : null;
}

function resetSimulation(id) {
  const sim = simulations.get(id);
  if (!sim) return null;
  // Recreate from scratch using existing params/solution/overrides
  return runSimulation({
    params: sim.baseline && sim.baseline.inputParams ? sim.baseline.inputParams : sim.lastParams,
    solution: sim.lastSolution,
    overrides: sim.config,
    model: sim.model,
  });
}

module.exports = {
  DEFAULTS,
  createSimulation,
  stepSimulation,
  runSimulation,
  getSimulation,
  getSnapshot,
  getSummary,
  listSimulations,
  deleteSimulation,
  resetSimulation,
};
