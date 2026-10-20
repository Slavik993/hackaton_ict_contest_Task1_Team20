/**
 * Финансовая математика для расчёта NPV/IRR/DPP.
 *
 * Реализация вынесена в общий модуль shared/finmath.js (UMD), чтобы сервер
 * и браузер считали метрики одинаково. Этот файл — тонкая обёртка
 * для обратной совместимости внутри серверного кода.
 *
 *   NPV(rate, cashflows) — чистая приведённая стоимость
 *   IRR(cashflows, opts) — внутренняя норма доходности (метод Ньютона-Рафсона
 *                          с фолбэком на бисекцию при нестабильной сходимости)
 *   DPP(cashflows, rate) — дисконтированный срок окупаемости в годах (пол 1 год)
 */

'use strict';

const finmath = require('../../shared/finmath');

module.exports = {
  NPV: finmath.NPV,
  IRR: finmath.IRR,
  DPP: finmath.DPP,
  projectCashflows: finmath.projectCashflows,
};
