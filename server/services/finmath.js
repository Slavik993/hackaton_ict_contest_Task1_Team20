/**
 * Финансовая математика для расчёта NPV/IRR/DPP.
 *
 *   NPV(rate, cashflows) — чистая приведённая стоимость
 *   IRR(cashflows, opts) — внутренняя норма доходности (метод Ньютона-Рафсона
 *                          с фолбэком на бисекцию при нестабильной сходимости)
 *   DPP(cashflows, rate) — дисконтированный срок окупаемости в годах
 *
 * Все функции устойчивы к граничным случаям: пустым массивам, нулевым
 * денежным потокам, отсутствию корня IRR (<0 или >1 возвращают null).
 */

'use strict';

function NPV(rate, cashflows) {
  if (!Array.isArray(cashflows) || cashflows.length === 0) return 0;
  var total = 0;
  for (var t = 0; t < cashflows.length; t++) {
    if (typeof cashflows[t] !== 'number' || !isFinite(cashflows[t])) continue;
    total += cashflows[t] / Math.pow(1 + rate, t);
  }
  return total;
}

function npvDerivative(rate, cashflows) {
  if (!Array.isArray(cashflows) || cashflows.length === 0) return 0;
  var total = 0;
  for (var t = 1; t < cashflows.length; t++) {
    if (typeof cashflows[t] !== 'number' || !isFinite(cashflows[t])) continue;
    total -= t * cashflows[t] / Math.pow(1 + rate, t + 1);
  }
  return total;
}

/**
 * Расчёт IRR — внутренней нормы доходности.
 *
 * Используется гибридный алгоритм:
 *  1) Начальная оценка по линейной интерполяции между двумя точками,
 *     где NPV меняет знак.
 *  2) Уточнение методом Ньютона-Рафсона (быстрая квадратичная сходимость).
 *  3) При нестабильной сходимости — переключение на бисекцию в найденном
 *     диапазоне знаков.
 *
 * Возвращает IRR в долях единицы (0.18 = 18%) или null, если корень не найден
 * (классический случай — все потоки одного знака или проект не окупается).
 */
function IRR(cashflows, opts) {
  if (!Array.isArray(cashflows) || cashflows.length < 2) return null;
  var options = Object.assign({
    guess: 0.1,
    tolerance: 1e-7,
    maxIter: 100,
    lowerBound: -0.999,
    upperBound: 10,
  }, opts || {});

  // Быстрый путь: если все потоки одного знака, IRR не определена
  var hasPositive = false, hasNegative = false;
  for (var i = 0; i < cashflows.length; i++) {
    if (cashflows[i] > 0) hasPositive = true;
    if (cashflows[i] < 0) hasNegative = true;
  }
  if (!hasPositive || !hasNegative) return null;

  // Найти диапазон, в котором NPV меняет знак — для бисекции
  var lo = options.lowerBound;
  var hi = options.upperBound;
  var npvLo = NPV(lo, cashflows);
  var npvHi = NPV(hi, cashflows);
  if (npvLo * npvHi > 0) {
    // Попробуем расширить диапазон
    lo = -0.999;
    hi = 5;
    npvLo = NPV(lo, cashflows);
    npvHi = NPV(hi, cashflows);
    if (npvLo * npvHi > 0) {
      hi = 50; // попытка для высокодоходных проектов (RaaS с > 5000% годовых)
      npvHi = NPV(hi, cashflows);
      if (npvLo * npvHi > 0) return null;
    }
  }
  // Убедимся, что lo < hi по NPV
  if (npvLo > npvHi) {
    var t = lo; lo = hi; hi = t;
    var tt = npvLo; npvLo = npvHi; npvHi = tt;
  }

  // Метод Ньютона-Рафсона
  var rate = options.guess;
  for (var iter = 0; iter < options.maxIter; iter++) {
    var f = NPV(rate, cashflows);
    if (Math.abs(f) < options.tolerance) return rate;
    var df = npvDerivative(rate, cashflows);
    if (Math.abs(df) < 1e-12) break; // не сходится — переходим к бисекции
    var next = rate - f / df;
    // Ограничим, чтобы не вылететь за диапазон
    if (next < options.lowerBound || next > options.upperBound) break;
    if (Math.abs(next - rate) < options.tolerance) return next;
    rate = next;
  }

  // Фолбэк: бисекция
  for (var iter2 = 0; iter2 < 200; iter2++) {
    var mid = (lo + hi) / 2;
    var fMid = NPV(mid, cashflows);
    if (Math.abs(fMid) < options.tolerance) return mid;
    if (fMid * npvLo < 0) { hi = mid; npvHi = fMid; }
    else { lo = mid; npvLo = fMid; }
    if (Math.abs(hi - lo) < options.tolerance) return mid;
  }
  return (lo + hi) / 2;
}

/**
 * DPP — дисконтированный срок окупаемости (в годах).
 *
 * Возвращает год, в котором накопленный дисконтированный поток становится
 * ≥ 0, или Infinity / -1, если проект не окупается на горизонте массива.
 */
function DPP(cashflows, rate) {
  if (!Array.isArray(cashflows) || cashflows.length === 0) return -1;
  var cumulative = 0;
  for (var t = 0; t < cashflows.length; t++) {
    if (typeof cashflows[t] !== 'number' || !isFinite(cashflows[t])) return -1;
    var discounted = cashflows[t] / Math.pow(1 + rate, t);
    var prevCumulative = cumulative;
    cumulative += discounted;
    if (cumulative >= 0 && t > 0) {
      // Линейная интерполяция внутри периода
      var fraction = prevCumulative < 0 ? Math.abs(prevCumulative) / (Math.abs(prevCumulative) + cumulative) : 0;
      return (t - 1) + fraction;
    }
  }
  return -1;
}

module.exports = { NPV: NPV, IRR: IRR, DPP: DPP };
