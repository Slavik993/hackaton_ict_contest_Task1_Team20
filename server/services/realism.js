/**
 * Серверная обёртка над общим модулем расчётной логики.
 *
 * Вся математика вынесена в shared/calc-core.js, чтобы сервер и браузер
 * использовали ОДНИ И ТЕ ЖЕ формулы (иначе цифры в UI расходились с PDF).
 */

'use strict';

const core = require('../../shared/calc-core');

module.exports = {
  INDUSTRY_BENCHMARKS: core.INDUSTRY_BENCHMARKS,
  LABOR_REDUCTION_CAP: core.LABOR_REDUCTION_CAP,
  ROBOTS_PER_OPERATOR: core.ROBOTS_PER_OPERATOR,
  checkScenarioRealism: core.checkScenarioRealism,
  calibrateSolutionMetrics: core.calibrateSolutionMetrics,
  calibrateCapexPerUnit: core.calibrateCapexPerUnit,
  getBenchmarkKey: core.getBenchmarkKey,
  detectDomain: core.detectDomain,
  applyDomainCorrection: core.applyDomainCorrection,
  limitLaborReductionByFleet: core.limitLaborReductionByFleet,
  requiredRobotsForLaborEffect: core.requiredRobotsForLaborEffect,
  computeLaborEffect: core.computeLaborEffect,
};
