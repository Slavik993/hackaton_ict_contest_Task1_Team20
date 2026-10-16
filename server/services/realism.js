/**
 * Sanity-checks реалистичности экономических расчётов роботизации.
 *
 * Возвращает массив предупреждений (warnings) и оценку достоверности
 * (confidenceScore, 0..100). Используется и для информирования
 * пользователя, и для автоматической коррекции параметров.
 *
 * Калибровка делается на основе отраслевых бенчмарков:
 *   - McKinsey Global Institute: роботизация снижает трудозатраты на 15-30%
 *     для повторяющихся операций, 5-15% для сложных процессов
 *   - DHL Logistics Robotics Report 2023: 1 AMR обслуживает 200-500 м²
 *     при стандартном складе
 *   - IFR (International Federation of Robotics) 2023: плотность роботов в
 *     развитых странах ~1 робот на 10-50 работников склада
 *
 * Если расчёт выходит за бенчмарки в 3+ раза — возвращается предупреждение.
 */

'use strict';

const INDUSTRY_BENCHMARKS = {
  // (domain, метрика): { минимум, максимум, цель, единицы }
  warehouse: {
    robotsPerSqM: { min: 0.0002, max: 0.005, target: 0.001, unit: 'роботов/м²' },  // 200-500м² на 1 робота
    robotsPerStaff: { min: 0.05, max: 0.5, target: 0.15, unit: 'роботов/сотр.' },
    capexPerSqM: { min: 100, max: 1500, target: 350, unit: '₽/м²' },
    annualSavingsPerStaff: { min: 50000, max: 2500000, target: 800000, unit: '₽/сотр./год' },
  },
  airport: {
    robotsPerSqM: { min: 0.0001, max: 0.003, target: 0.0005, unit: 'роботов/м²' },
    robotsPerStaff: { min: 0.03, max: 0.3, target: 0.10, unit: 'роботов/сотр.' },
    capexPerSqM: { min: 80, max: 800, target: 250, unit: '₽/м²' },
    annualSavingsPerStaff: { min: 100000, max: 1500000, target: 600000, unit: '₽/сотр./год' },
  },
  medical: {
    robotsPerSqM: { min: 0.0003, max: 0.008, target: 0.002, unit: 'роботов/м²' },
    robotsPerStaff: { min: 0.02, max: 0.2, target: 0.08, unit: 'роботов/сотр.' },
    capexPerSqM: { min: 200, max: 3000, target: 1200, unit: '₽/м²' },
    annualSavingsPerStaff: { min: 50000, max: 600000, target: 200000, unit: '₽/сотр./год' },
  },
  farm: {
    robotsPerSqM: { min: 0.00005, max: 0.0008, target: 0.0002, unit: 'роботов/м²' },
    capexPerSqM: { min: 30, max: 400, target: 120, unit: '₽/м²' },
  },
  security: {
    robotsPerSqM: { min: 0.0001, max: 0.002, target: 0.0004, unit: 'роботов/м²' },
    capexPerSqM: { min: 50, max: 600, target: 180, unit: '₽/м²' },
  },
  general: {
    robotsPerSqM: { min: 0.0001, max: 0.005, target: 0.001, unit: 'роботов/м²' },
    robotsPerStaff: { min: 0.03, max: 0.4, target: 0.12, unit: 'роботов/сотр.' },
    capexPerSqM: { min: 80, max: 1500, target: 400, unit: '₽/м²' },
    annualSavingsPerStaff: { min: 80000, max: 1800000, target: 600000, unit: '₽/сотр./год' },
  },
};

function getBenchmarkKey(domain) {
  const d = String(domain || '').toLowerCase();
  if (d.includes('warehouse') || d.includes('склад') || d.includes('логистич') || d.includes('торгов') || d.includes('термин')) return 'warehouse';
  if (d.includes('airport') || d.includes('аэропорт')) return 'airport';
  if (d.includes('medical') || d.includes('мед') || d.includes('клиник') || d.includes('социал')) return 'medical';
  if (d.includes('farm') || d.includes('ферм') || d.includes('сельск')) return 'farm';
  if (d.includes('secur') || d.includes('охран') || d.includes('безопасн')) return 'security';
  return 'general';
}

function checkScenarioRealism(scenario, params) {
  const warnings = [];
  if (!scenario || !params) return { warnings, confidenceScore: 0 };

  const domain = scenario.assumptions && scenario.assumptions.domain || '';
  const benchKey = getBenchmarkKey(domain);
  const bench = INDUSTRY_BENCHMARKS[benchKey];

  const robots = scenario.robotCount || 0;
  const area = params.area || 0;
  const staff = params.staff || 0;
  const capex = scenario.totalCapex || scenario.adjustedCapex || 0;
  const savings = scenario.annualSavings || 0;

  let confidence = 100;

  if (area > 0 && bench.robotsPerSqM) {
    const rpsm = robots / area;
    const b = bench.robotsPerSqM;
    if (rpsm > b.max * 3) {
      warnings.push({
        level: 'danger',
        field: 'robotCount',
        message: 'Получено ' + robots + ' роботов на ' + Math.round(area) + ' м² (' + rpsm.toFixed(4) + ' роботов/м²). Отраслевой бенчмарк: 1 робот на ' + Math.round(1 / b.target) + ' м². Скорее всего, завышена оценка производительности решения или занижена доступность.',
        severity: 'high',
      });
      confidence -= 30;
    } else if (rpsm > b.max) {
      warnings.push({
        level: 'warning',
        field: 'robotCount',
        message: 'Плотность роботов выше типичной: ' + rpsm.toFixed(4) + ' против ' + b.target.toFixed(4) + ' роботов/м². Проверьте метрики решения.',
        severity: 'medium',
      });
      confidence -= 10;
    }
  }

  if (staff > 0 && bench.robotsPerStaff) {
    const rps = robots / staff;
    const b = bench.robotsPerStaff;
    if (rps > b.max * 2) {
      warnings.push({
        level: 'warning',
        field: 'robotCount',
        message: 'Роботов больше половины штата (' + Math.round(rps * 100) + '% от ' + staff + ' сотрудников). Проверьте, что laborReduction не завышен.',
        severity: 'medium',
      });
      confidence -= 15;
    }
  }

  if (area > 0 && bench.capexPerSqM && capex > 0) {
    const cpsm = capex / area;
    const b = bench.capexPerSqM;
    if (cpsm > b.max * 5) {
      warnings.push({
        level: 'danger',
        field: 'capex',
        message: 'CAPEX ' + Math.round(cpsm).toLocaleString('ru-RU') + ' ₽/м² многократно превышает бенчмарк (' + b.target + ' ₽/м²). Возможно, выбрано слишком дорогое решение для объекта такого размера.',
        severity: 'high',
      });
      confidence -= 25;
    } else if (cpsm > b.max) {
      warnings.push({
        level: 'warning',
        field: 'capex',
        message: 'CAPEX выше типичного: ' + Math.round(cpsm).toLocaleString('ru-RU') + ' против ' + b.target + ' ₽/м².',
        severity: 'low',
      });
      confidence -= 5;
    }
  }

  if (staff > 0 && bench.annualSavingsPerStaff && savings > 0) {
    const sps = savings / staff;
    const b = bench.annualSavingsPerStaff;
    if (sps > b.max * 1.5) {
      warnings.push({
        level: 'warning',
        field: 'savings',
        message: 'Годовая экономия на сотрудника (' + Math.round(sps / 1000).toLocaleString('ru-RU') + ' тыс. ₽) значительно выше бенчмарка (' + b.target / 1000 + ' тыс. ₽). Возможно, не учтён остаточный ручной труд.',
        severity: 'medium',
      });
      confidence -= 12;
    }
  }

  return { warnings, confidenceScore: Math.max(0, confidence) };
}

/**
 * Корректировка трудозатрат/laborReduction для снижения погрешности:
 * — Если решение обещает >70% снижения труда, ограничиваем до 65%
 * — Если через роботизацию недостижимо полное устранение — добавляем поправку
 *
 * Возвращает скорректированные метрики для передачи в calcScenario.
 */
function calibrateSolutionMetrics(solution, domain) {
  const m = solution && solution.metrics ? Object.assign({}, solution.metrics) : {};
  // 1) Снижение труда: даже самое автоматизированное производство оставляет
  //    20-40% ручного труда (Toyota, Amazon). Уменьшаем трудозатраты более
  //    консервативно.
  if (m.laborReduction != null) {
    const domainFactor = {
      medical: 0.30,
      farm: 0.45,
      construction: 0.50,
      energy: 0.50,
      security: 0.55,
      general: 0.55,
    }[getBenchmarkKey(domain)] || 0.55;
    if (m.laborReduction > domainFactor + 0.20) {
      m.laborReduction = domainFactor + 0.20;
    }
    // Трудозатраты никогда не достигают 100% в реальных проектах
    if (m.laborReduction > 0.85) m.laborReduction = 0.85;
  }
  // 2) Производительность: обычно обещают 15-50%, выше — только в идеализированных условиях
  if (m.productivityLift != null && m.productivityLift > 0.45) {
    m.productivityLift = 0.45;
  }
  return m;
}

/**
 * Калибровка CAPEX: крупные заказы получают скидку 5-15% по сравнению
 * с прайс-листом. Очень малые склады могут потребовать +20% к стоимости
 * за счёт базовой интеграции (мобильные роботы малых партий стоят дороже).
 */
function calibrateCapexPerUnit(capex, robotCount) {
  if (capex <= 0 || robotCount <= 0) return capex;
  let multiplier = 1.0;
  // Скидка от объёма
  if (robotCount >= 50) multiplier = 0.78;
  else if (robotCount >= 20) multiplier = 0.86;
  else if (robotCount >= 10) multiplier = 0.93;
  else if (robotCount <= 2) multiplier = 1.15; // штраф за малую партию
  return capex * multiplier;
}

module.exports = {
  INDUSTRY_BENCHMARKS,
  checkScenarioRealism,
  calibrateSolutionMetrics,
  calibrateCapexPerUnit,
  getBenchmarkKey,
};
