/**
 * Общий модуль расчётной логики (UMD): используется И сервером
 * (server/services/calculation.js), И браузером (app.js).
 *
 * Зачем: клиент и сервер раньше дублировали формулы, из-за чего цифры
 * в UI расходились с цифрами в PDF/API до 98%. Единый источник правды
 * устраняет класс расхождений.
 *
 * Содержит:
 *  - detectDomain(params)        — определение отраслевого домена
 *  - applyDomainCorrection(...)  — доменные поправки к трудозатратам
 *  - calibrateSolutionMetrics()  — калибровка метрик решения (снижение погрешности)
 *  - calibrateCapexPerUnit()     — калибровка CAPEX по объёму партии
 *  - getBenchmarkKey(domain)     — отраслевой бенчмарк
 *  - computeLaborEffect(...)     — расчёт эффекта по ФОТ с привязкой к парку роботов
 *  - INDUSTRY_BENCHMARKS         — справочник бенчмарков
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CalcCore = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // -------------------------------------------------------------------------
  // Отраслевые бенчмарки
  // Источники: McKinsey Global Institute (трудозатраты при автоматизации),
  // DHL Logistics Robotics Report 2023 (плотность AMR на складе),
  // IFR World Robotics 2023 (плотность роботов на складах).
  // -------------------------------------------------------------------------
  var INDUSTRY_BENCHMARKS = {
    warehouse: {
      robotsPerSqM: { min: 0.0002, max: 0.005, target: 0.001, unit: 'роботов/м²' },
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

  /**
   * Определяет домен объекта по параметрам.
   * Возвращает объект с флагами isMedical / isFarm / isConstruction /
   * isEnergy / isSecurity и строковым ключом бенчмарка.
   */
  function detectDomain(params) {
    var p = params || {};
    var objType = String(p.objectType || p.objectTypeName || p.object_type || '').toLowerCase();
    var industry = String(p.industry || p.industryId || p.industryName || '').toLowerCase();

    var isMedical =
      objType.indexOf('мед') !== -1 || objType.indexOf('medical') !== -1 ||
      objType.indexOf('больниц') !== -1 || objType.indexOf('реабил') !== -1 ||
      objType.indexOf('клиник') !== -1 || objType.indexOf('hospital') !== -1 ||
      industry.indexOf('социал') !== -1 || industry.indexOf('мед') !== -1 ||
      industry.indexOf('zdрав') !== -1 || industry === 'social' || objType === 'medical';

    var isFarm =
      objType.indexOf('ферм') !== -1 || objType.indexOf('farm') !== -1 ||
      industry.indexOf('сельск') !== -1 || industry === 'agriculture';

    var isConstruction =
      objType.indexOf('строитель') !== -1 || objType.indexOf('construction') !== -1 ||
      industry.indexOf('строитель') !== -1 || industry === 'construction';

    var isEnergy =
      objType.indexOf('энерг') !== -1 || objType.indexOf('energy') !== -1 ||
      industry.indexOf('тэк') !== -1 || industry.indexOf('энерг') !== -1 || industry === 'energy';

    var isSecurity =
      objType.indexOf('охран') !== -1 || objType.indexOf('security') !== -1 ||
      industry.indexOf('безопасн') !== -1 || industry === 'security';

    return {
      isMedical: isMedical,
      isFarm: isFarm,
      isConstruction: isConstruction,
      isEnergy: isEnergy,
      isSecurity: isSecurity,
      benchmarkKey: getBenchmarkKey(objType + ' ' + industry),
    };
  }

  /** Ключ отраслевого бенчмарка по строке домена. */
  function getBenchmarkKey(domain) {
    var d = String(domain || '').toLowerCase();
    if (d.indexOf('warehouse') !== -1 || d.indexOf('склад') !== -1 ||
        d.indexOf('логистич') !== -1 || d.indexOf('торгов') !== -1 ||
        d.indexOf('термин') !== -1) return 'warehouse';
    if (d.indexOf('airport') !== -1 || d.indexOf('аэропорт') !== -1) return 'airport';
    if (d.indexOf('medical') !== -1 || d.indexOf('мед') !== -1 ||
        d.indexOf('клиник') !== -1 || d.indexOf('социал') !== -1) return 'medical';
    if (d.indexOf('farm') !== -1 || d.indexOf('ферм') !== -1 || d.indexOf('сельск') !== -1) return 'farm';
    if (d.indexOf('secur') !== -1 || d.indexOf('охран') !== -1 || d.indexOf('безопасн') !== -1) return 'security';
    return 'general';
  }

  /**
   * Доменные поправки к достижимому снижению трудозатрат и приросту
   * производительности. Клинические, сельскохозяйственные, строительные,
   * энергетические и охранные процессы не повторяемы в полной мере —
   * фактический эффект ниже заявленного в каталоге.
   */
  function applyDomainCorrection(laborReduction, productivityLift, domain) {
    var lr = laborReduction || 0;
    var pl = productivityLift || 0;
    if (domain.isMedical) {
      lr *= 0.25;      // клинические процессы safety-critical и неповторяемые
      pl *= 0.20;
    } else if (domain.isFarm) {
      lr *= 0.85; pl *= 0.8;
    } else if (domain.isConstruction) {
      lr *= 0.9; pl *= 0.85;
    } else if (domain.isEnergy) {
      lr *= 0.9; pl *= 0.85;
    } else if (domain.isSecurity) {
      lr *= 0.85; pl *= 0.8;
    }
    return { laborReduction: lr, productivityLift: pl };
  }

  /**
   * Ориентир стоимости сервисного обслуживания: 2,5% стоимости в год.
   *
   * В OPEX уже выделены отдельные строки «лицензии» (5% CAPEX/год),
   * «ремонт» (2% CAPEX/год), «материалы» (3%) и «управление» (5%), поэтому
   * сервисный контракт (ПО, поддержка, запчасти, АКБ) берётся на уровне
   * 2,5% CAPEX/год — итого эксплуатация ≈ 17,5% CAPEX/год, что совпадает
   * с практикой автоматизации складов (12–18% CAPEX/год).
   *
   * В каталоге ФЦ БАС стоимость обслуживания не указана, поэтому приводим её
   * к этому ориентиру единообразно — иначе сервер и клиент считают OPEX
   * по-разному для одних и тех же решений.
   */
  var SERVICE_COST_YEAR_RATIO = 0.025;

  function estimateServiceCostPerMonth(capexPerUnit) {
    var capex = capexPerUnit || 0;
    if (capex <= 0) return 0;
    return Math.round((capex * SERVICE_COST_YEAR_RATIO) / 12 / 100) * 100;
  }

  /**
   * Калибровка метрик решения для снижения погрешности оценки.
   * - Потолок снижения трудозатрат зависит от домена: в клинике, сельском
   *   хозяйстве, на стройке и в охране автоматизируется лишь часть процессов
   * - Прирост производительности выше 45% — только в идеализированных моделях
   * - Стоимость обслуживания приводится к отраслевому ориентиру, если она
   *   не задана в каталоге
   */
  var LABOR_REDUCTION_CAP = {
    medical: 0.15,
    farm: 0.25,
    construction: 0.30,
    energy: 0.30,
    security: 0.30,
    general: 0.35,
  };

  function calibrateSolutionMetrics(metrics, domain) {
    var m = Object.assign({}, metrics || {});
    var key = domain && domain.benchmarkKey ? domain.benchmarkKey : getBenchmarkKey('');
    var cap = LABOR_REDUCTION_CAP[key];
    if (cap === undefined) cap = LABOR_REDUCTION_CAP.general;

    if (m.laborReduction != null) {
      if (m.laborReduction > cap) m.laborReduction = cap;
      if (m.laborReduction < 0) m.laborReduction = 0;
    }
    if (m.productivityLift != null) {
      if (m.productivityLift > 0.45) m.productivityLift = 0.45;
      if (m.productivityLift < 0) m.productivityLift = 0;
    }
    if (m.capexPerUnit > 0 && !(m.serviceCostPerMonth > 0)) {
      m.serviceCostPerMonth = estimateServiceCostPerMonth(m.capexPerUnit);
    }
    return m;
  }

  /**
   * Связывает заявленное снижение трудозатрат с реальным парком роботов.
   *
   * Один мобильный робот (AMR/FMR) заменяет ~0,9 оператора смены
   * (DHL Logistics Robotics Report: фактическая загрузка 80-95% оператора).
   * Поэтому фактическое снижение ФОТ не может превышать:
   *     robotCount × 0,9 / staff
   *
   * Без этого ограничения 2 робота «экономили» бы 45 млн ₽/год на складе
   * с 60 сотрудниками — абсурд, ломавший правдоподобность расчёта.
   */
  var ROBOTS_PER_OPERATOR = 0.9;

  function limitLaborReductionByFleet(laborReduction, robotCount, staff, robotsPerOperator) {
    var rpo = robotsPerOperator || ROBOTS_PER_OPERATOR;
    var requested = Math.max(0, Math.min(1, laborReduction || 0));
    if (!staff || staff <= 0) return requested;
    var maxByFleet = (Math.max(0, robotCount || 0) * rpo) / staff;
    return Math.max(0, Math.min(requested, maxByFleet));
  }

  /**
   * Размер парка, необходимого для реализации заявленного сокращения труда.
   *
   * Заявление вендора («сокращение трудозатрат на 35%») относится к
   * определённому развёртыванию. Чтобы заявленный эффект был достижим,
   * парк должен покрывать минимум staff × laborReduction операторов,
   * а один робот заменяет ROBOTS_PER_OPERATOR операторов.
   */
  function requiredRobotsForLaborEffect(staff, laborReduction, robotsPerOperator) {
    var rpo = robotsPerOperator || ROBOTS_PER_OPERATOR;
    var s = staff || 0;
    var lr = Math.max(0, Math.min(1, laborReduction || 0));
    if (s <= 0 || lr <= 0) return 0;
    return Math.ceil((s * lr) / rpo);
  }

  /**
   * Единый расчёт эффекта по ФОТ (используется и сервером, и браузером).
   *
   * opts:
   *   laborReduction      — заявленное (после доменной коррекции) сокращение труда, доля
   *   productivityLift    — заявленный прирост производительности, доля
   *   robotCount          — фактический парк роботов
   *   staff               — численность персонала
   *   annualLaborCost     — годовой ФОТ (₽)
   *   robotsPerOperator   — сколько операторов заменяет один робот (по умолчанию 0,9)
   *
   * Логика:
   *   1. Физический предел: effLR ≤ robotCount × 0,9 / staff.
   *   2. Доля развёрнутого парка от необходимого: если роботов меньше, чем
   *      нужно для заявленного эффекта, эффект пропорционально снижается.
   *   3. Остаток ФОТ = ФОТ × (1 − effLR) — та часть штата, которая остаётся.
   */
  function computeLaborEffect(opts) {
    var o = opts || {};
    var rpo = o.robotsPerOperator || ROBOTS_PER_OPERATOR;
    var laborClaim = Math.max(0, Math.min(1, o.laborReduction || 0));
    var productivityClaim = Math.max(0, o.productivityLift || 0);
    var staff = o.staff || 0;
    var robotCount = Math.max(0, o.robotCount || 0);
    var annualLaborCost = o.annualLaborCost || 0;

    var requiredRobots = requiredRobotsForLaborEffect(staff, laborClaim, rpo);
    // Доля развёрнутого парка от необходимого для заявленного эффекта
    var deploymentShare = requiredRobots > 0 ? Math.min(1, robotCount / requiredRobots) : 1;

    var effectiveLaborReduction = Math.min(
      laborClaim,
      limitLaborReductionByFleet(laborClaim, robotCount, staff, rpo)
    );
    // Прирост производительности ограничен тем же фактом — неполным парком
    var effectiveProductivityLift = productivityClaim * deploymentShare;

    var laborSavings = annualLaborCost * effectiveLaborReduction;
    // Остаток ФОТ — та часть штата, которая остаётся после роботизации
    var residualLaborShare = Math.max(0, 1 - effectiveLaborReduction);
    var residualLaborCost = annualLaborCost * residualLaborShare;
    // Прирост производительности реализуется ОСТАВШИМСЯ штатом: роботы
    // высвобождают часть работников, а оставшиеся работают эффективнее.
    var productivityGain = annualLaborCost * residualLaborShare * effectiveProductivityLift;

    return {
      requestedLaborReduction: laborClaim,
      requestedProductivityLift: productivityClaim,
      effectiveLaborReduction: effectiveLaborReduction,
      effectiveProductivityLift: effectiveProductivityLift,
      laborSavings: laborSavings,
      productivityGain: productivityGain,
      residualLaborShare: residualLaborShare,
      residualLaborCost: residualLaborCost,
      requiredRobotCount: requiredRobots,
      deploymentShare: deploymentShare,
      limitedByFleet: effectiveLaborReduction < laborClaim - 1e-9,
    };
  }

  /**
   * Калибровка CAPEX по объёму партии:
   * - крупные партии получают скидку 7–22%
   * - малые (<=2 шт.) — надбавку 15% (мобильные роботы малых партий дороже)
   */
  function calibrateCapexPerUnit(capex, robotCount) {
    if (!capex || capex <= 0 || !robotCount || robotCount <= 0) return capex || 0;
    var multiplier = 1.0;
    if (robotCount >= 50) multiplier = 0.78;
    else if (robotCount >= 20) multiplier = 0.86;
    else if (robotCount >= 10) multiplier = 0.93;
    else if (robotCount <= 2) multiplier = 1.15;
    return capex * multiplier;
  }

  /**
   * Проверка реалистичности результата по отраслевым бенчмаркам.
   * Возвращает { warnings[], confidenceScore }.
   */
  function checkScenarioRealism(scenario, params) {
    var warnings = [];
    if (!scenario || !params) return { warnings: warnings, confidenceScore: 0 };

    var domain = scenario.assumptions && scenario.assumptions.domain
      ? getBenchmarkKey(scenario.assumptions.domain)
      : getBenchmarkKey(detectDomain(params).benchmarkKey);
    var bench = INDUSTRY_BENCHMARKS[domain] || INDUSTRY_BENCHMARKS.general;

    var robots = scenario.robotCount || 0;
    var area = params.area || 0;
    var staff = params.staff || 0;
    var capex = scenario.totalCapex || scenario.adjustedCapex || 0;
    var savings = scenario.annualSavings || 0;
    var confidence = 100;

    if (area > 0 && bench.robotsPerSqM) {
      var rpsm = robots / area;
      var b = bench.robotsPerSqM;
      if (rpsm > b.max * 3) {
        warnings.push({
          level: 'danger', field: 'robotCount', severity: 'high',
          message: 'Получено ' + robots + ' роботов на ' + Math.round(area) +
            ' м² (' + rpsm.toFixed(4) + ' роботов/м²). Отраслевой бенчмарк: 1 робот на ' +
            Math.round(1 / b.target) + ' м². Скорее всего, завышена оценка производительности решения или занижена доступность.',
        });
        confidence -= 30;
      } else if (rpsm > b.max) {
        warnings.push({
          level: 'warning', field: 'robotCount', severity: 'medium',
          message: 'Плотность роботов выше типичной: ' + rpsm.toFixed(4) + ' против ' +
            b.target.toFixed(4) + ' роботов/м². Проверьте метрики решения.',
        });
        confidence -= 10;
      }
    }

    if (staff > 0 && bench.robotsPerStaff) {
      var rps = robots / staff;
      var bs = bench.robotsPerStaff;
      if (rps > bs.max * 2) {
        warnings.push({
          level: 'warning', field: 'robotCount', severity: 'medium',
          message: 'Роботов больше половины штата (' + Math.round(rps * 100) + '% от ' +
            staff + ' сотрудников). Проверьте, что laborReduction не завышен.',
        });
        confidence -= 15;
      }
    }

    if (area > 0 && bench.capexPerSqM && capex > 0) {
      var cpsm = capex / area;
      var bc = bench.capexPerSqM;
      if (cpsm > bc.max * 5) {
        warnings.push({
          level: 'danger', field: 'capex', severity: 'high',
          message: 'CAPEX ' + Math.round(cpsm).toLocaleString('ru-RU') +
            ' ₽/м² многократно превышает бенчмарк (' + bc.target +
            ' ₽/м²). Возможно, выбрано слишком дорогое решение для объекта такого размера.',
        });
        confidence -= 25;
      } else if (cpsm > bc.max) {
        warnings.push({
          level: 'warning', field: 'capex', severity: 'low',
          message: 'CAPEX выше типичного: ' + Math.round(cpsm).toLocaleString('ru-RU') +
            ' против ' + bc.target + ' ₽/м².',
        });
        confidence -= 5;
      }
    }

    if (staff > 0 && bench.annualSavingsPerStaff && savings > 0) {
      var sps = savings / staff;
      var bp = bench.annualSavingsPerStaff;
      if (sps > bp.max * 1.5) {
        warnings.push({
          level: 'warning', field: 'savings', severity: 'medium',
          message: 'Годовая экономия на сотрудника (' + Math.round(sps / 1000).toLocaleString('ru-RU') +
            ' тыс. ₽) значительно выше бенчмарка (' + bp.target / 1000 +
            ' тыс. ₽). Возможно, не учтён остаточный ручной труд.',
        });
        confidence -= 12;
      }
    }

    // Ограничение эффекта парком роботов: физика, а не «хотелка» вендора
    if (scenario.laborLimitedByFleet && scenario.requiredRobotCount) {
      warnings.push({
        level: 'warning', field: 'laborReduction', severity: 'medium',
        message: 'Эффект по ФОТ ограничен парком: ' + robots + ' роботов заменяют не более ' +
          Math.round(robots * ROBOTS_PER_OPERATOR * 10) / 10 + ' операторов из ' + staff +
          '. Для заявленного сокращения (' + Math.round((scenario.requestedLaborReduction || 0) * 100) +
          '%) нужен парк из ' + scenario.requiredRobotCount + ' роботов.',
      });
      confidence -= 15;
    }

    // CAPEX сверх бюджета объекта
    var capexBudget = Number(params.capex_budget || params.capexBudget || 0);
    if (capexBudget > 0 && capex > capexBudget) {
      warnings.push({
        level: 'danger', field: 'capex', severity: 'high',
        message: 'CAPEX ' + Math.round(capex / 1e6).toLocaleString('ru-RU') +
          ' млн ₽ превышает бюджет объекта (' + Math.round(capexBudget / 1e6).toLocaleString('ru-RU') +
          ' млн ₽).',
      });
      confidence -= 20;
    }

    // Подозрительно быстрая окупаемость — чаще всего следствие завышенной
    // заявки вендора по сокращению трудозатрат (в каталоге ФЦ БАС метрики
    // условные и одинаковые для всех позиций).
    if (scenario.payback > 0 && scenario.payback < 1.5) {
      warnings.push({
        level: 'warning', field: 'payback', severity: 'medium',
        message: 'Срок окупаемости менее 1,5 года. Проверьте заявку вендора по сокращению ' +
          'трудозатрат и стоимость решения: столь быстрая окупаемость обычно означает ' +
          'завышенный эффект или заниженную цену.',
      });
      confidence -= 12;
    }

    return { warnings: warnings, confidenceScore: Math.max(0, confidence) };
  }

  return {
    INDUSTRY_BENCHMARKS: INDUSTRY_BENCHMARKS,
    LABOR_REDUCTION_CAP: LABOR_REDUCTION_CAP,
    ROBOTS_PER_OPERATOR: ROBOTS_PER_OPERATOR,
    SERVICE_COST_YEAR_RATIO: SERVICE_COST_YEAR_RATIO,
    estimateServiceCostPerMonth: estimateServiceCostPerMonth,
    detectDomain: detectDomain,
    getBenchmarkKey: getBenchmarkKey,
    applyDomainCorrection: applyDomainCorrection,
    calibrateSolutionMetrics: calibrateSolutionMetrics,
    calibrateCapexPerUnit: calibrateCapexPerUnit,
    limitLaborReductionByFleet: limitLaborReductionByFleet,
    requiredRobotsForLaborEffect: requiredRobotsForLaborEffect,
    computeLaborEffect: computeLaborEffect,
    checkScenarioRealism: checkScenarioRealism,
  };
});
