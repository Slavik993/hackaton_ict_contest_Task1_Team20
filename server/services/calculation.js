const defaults = {
  depreciationYears: 5,
  amortizationMethod: 'linear',
  discountRate: 0.1,
  robotAvailability: 0.95,
  robotUtilization: 0.85,
  implementationMonths: 6,
  infrastructureRatio: 0.15,
  softwareRatio: 0.10,
  integrationRatio: 0.15,
  trainingRatio: 0.05,
  reserveRatio: 0.10,
  serviceRatio: 0.10,
  licenseRatio: 0.05,
  materialRatio: 0.03,
  repairRatio: 0.02,
  managementRatio: 0.05,
  robotReplacementYear: 5,
  loanInterestRate: 0.12,
  loanTermYears: 5,
  loanDownPaymentRatio: 0.20,
  // Медицинские дефолты (Таблица 1: окупаемость 3–7 лет)
  medical: {
    horizon: 7,
    depreciationYears: 7,
    robotUtilization: 0.55,
    robotAvailability: 0.90,
    infrastructureRatio: 0.20,
    integrationRatio: 0.20,
    trainingRatio: 0.08,
    serviceRatio: 0.12,
  },
};

function calcLoanScenario(params, solution, purchaseScenario) {
  const p = { ...defaults, ...params };
  const m = solution.metrics || {};
  const horizon = p.horizon || defaults.depreciationYears;
  const annualSavings = purchaseScenario.annualSavings || 0;
  const capexPerUnit = m.capexPerUnit || 0;

  const robotCount = purchaseScenario.robotCount || 1;
  const equipmentCost = robotCount * capexPerUnit;
  const totalCapex = purchaseScenario.totalCapex || equipmentCost;

  const downPaymentRatio = p.loanDownPaymentRatio !== undefined ? p.loanDownPaymentRatio : defaults.loanDownPaymentRatio;
  const interestRate = p.loanInterestRate !== undefined ? p.loanInterestRate : defaults.loanInterestRate;
  const loanTermYears = p.loanTermYears !== undefined ? p.loanTermYears : defaults.loanTermYears;
  const paymentFrequency = p.loanPaymentFrequency || 'monthly';

  const loanAmount = totalCapex * (1 - downPaymentRatio);
  const periodsPerYear = paymentFrequency === 'quarterly' ? 4 : 12;
  const totalPeriods = loanTermYears * periodsPerYear;
  const periodRate = interestRate / periodsPerYear;

  let periodicPayment = 0;
  if (totalPeriods > 0 && periodRate > 0) {
    periodicPayment = loanAmount * (periodRate * Math.pow(1 + periodRate, totalPeriods)) / (Math.pow(1 + periodRate, totalPeriods) - 1);
  } else {
    periodicPayment = loanAmount / totalPeriods;
  }

  const annualDebtService = periodicPayment * periodsPerYear;

  const annualOpex = purchaseScenario.totalAnnualOpex || 0;
  const annualCapexService = periodicPayment * periodsPerYear;

  const capexComponent = {
    downPayment: totalCapex * downPaymentRatio,
    loanAmount,
    periodicPayment,
    paymentFrequency,
    totalPeriods,
  };

  const totalAnnualCost = annualOpex + annualDebtService;
  const netAnnual = annualSavings - totalAnnualCost;

  let payback = Infinity;
  let cumulative = -capexComponent.downPayment;
  for (let y = 1; y <= horizon; y++) {
    cumulative += netAnnual;
    if (cumulative >= 0 && payback === Infinity) {
      payback = y - 1 + (capexComponent.downPayment / netAnnual);
    }
  }

  let npv = -capexComponent.downPayment;
  const dr = p.discountRate !== undefined ? p.discountRate : defaults.discountRate;
  for (let y = 1; y <= horizon; y++) {
    npv += netAnnual / Math.pow(1 + dr, y);
  }

  const roi = capexComponent.downPayment > 0
    ? ((annualSavings * horizon - capexComponent.downPayment - annualDebtService * horizon) / capexComponent.downPayment) * 100
    : 0;

  let tco = capexComponent.downPayment;
  for (let y = 1; y <= horizon; y++) {
    tco += totalAnnualCost;
  }

  return {
    model: 'loan',
    robotCount: Math.ceil(robotCount),
    totalCapex: capexComponent.downPayment,
    totalAnnualOpex: totalAnnualCost,
    annualSavings,
    annualOpex: annualOpex,
    annualDebtService,
    netAnnualEffect: netAnnual,
    payback: isFinite(payback) ? payback : -1,
    npv,
    roi,
    tco,
    co2Reduction: purchaseScenario.co2Reduction || 0,
    horizon,
    equipmentCost,
    loanDetails: capexComponent,
    assumptions: {
      model: 'loan',
      interestRate,
      loanTermYears,
      downPaymentRatio,
      paymentFrequency,
      discountRate: dr,
      amortization: 'linear',
    },
  };
}

function calcScenario(params, solution, scenarioType) {
  const p = { ...defaults, ...params };
  const m = solution.metrics || {};

  // Domain correction multipliers for labor/productivity effect.
  // Logistics/industrial solutions assume high repeatable throughput; in the
  // social/medical sector clinical workflows are safety-critical and non-repeatable,
  // so the achievable labor reduction is much lower (payback 3-7 years, not 3).
  const objType = String(p.objectType || p.objectTypeName || p.object_type || '').toLowerCase();
  const industry = String(p.industry || p.industryId || p.industryName || '').toLowerCase();

  const isMedicalDomain =
    objType.includes('мед') || objType.includes('medical') || objType.includes('больниц') ||
    objType.includes('реабил') || objType.includes('клиник') || objType.includes('hospital') ||
    industry.includes('социал') || industry.includes('мед') || industry.includes('zdрав') ||
    industry === 'social' || objType === 'medical';
  const isFarmDomain = objType.includes('ферм') || objType.includes('farm') || industry.includes('сельск') || industry === 'agriculture';
  const isConstructionDomain = objType.includes('строитель') || objType.includes('construction') || industry.includes('строитель') || industry === 'construction';
  const isEnergyDomain = objType.includes('энерг') || objType.includes('energy') || industry.includes('тэк') || industry.includes('энерг') || industry === 'energy';
  const isSecurityDomain = objType.includes('охран') || objType.includes('security') || industry.includes('безопасн') || industry === 'security';

  // Медицинские дефолты (Таблица 1: окупаемость 3–7 лет)
  if (isMedicalDomain) {
    const md = defaults.medical;
    if (p.horizon === undefined || p.horizon === defaults.depreciationYears) p.horizon = md.horizon;
    if (p.depreciationYears === undefined || p.depreciationYears === defaults.depreciationYears) p.depreciationYears = md.depreciationYears;
    if (p.infrastructureRatio === undefined || p.infrastructureRatio === defaults.infrastructureRatio) p.infrastructureRatio = md.infrastructureRatio;
    if (p.integrationRatio === undefined || p.integrationRatio === defaults.integrationRatio) p.integrationRatio = md.integrationRatio;
    if (p.trainingRatio === undefined || p.trainingRatio === defaults.trainingRatio) p.trainingRatio = md.trainingRatio;
    if (p.serviceRatio === undefined || p.serviceRatio === defaults.serviceRatio) p.serviceRatio = md.serviceRatio;
    if (p.robotUtilization === undefined || p.robotUtilization === defaults.robotUtilization) p.robotUtilization = md.robotUtilization;
    if (p.robotAvailability === undefined || p.robotAvailability === defaults.robotAvailability) p.robotAvailability = md.robotAvailability;
  }

  let laborReduction = m.laborReduction || 0;
  let productivityLift = m.productivityLift || 0;

  // Медицина / соцсфера: клинические процессы safety-critical, не повторяемые.
  // Целевой диапазон окупаемости 3–7 лет (как в Таблице 1 статьи).
  if (isMedicalDomain) {
    laborReduction *= 0.35;      // было 0.6 — слишком мягко
    productivityLift *= 0.30;    // было 0.5
  } else if (isFarmDomain) {
    laborReduction *= 0.85; productivityLift *= 0.8;
  } else if (isConstructionDomain) {
    laborReduction *= 0.9; productivityLift *= 0.85;
  } else if (isEnergyDomain) {
    laborReduction *= 0.9; productivityLift *= 0.85;
  } else if (isSecurityDomain) {
    laborReduction *= 0.85; productivityLift *= 0.8;
  }

  const operations = p.operations || 0;
  const workingDays = p.workingDays || 250;
  const shifts = p.shifts || 1;
  const staff = p.staff || 0;
  const salary = p.salary || 80000;
  const area = p.area || 0;
  const electricityRate = p.electricity || 10;
  const avgSalaryAnnual = salary * 12;
  const annualLaborCost = staff * avgSalaryAnnual;

  const throughput = m.throughput || 0;
  const capexPerUnit = m.capexPerUnit || 0;
  const serviceCostPerMonth = m.serviceCostPerMonth || 0;
  const powerKw = m.powerKw || 0;
  const payload = m.payload || 0;
  const aut = m.autonomy || 0;
  const floorFlatness = p.floorFlatness || 0;
  const noiseLevelDb = p.noiseLevelDb || 0;
  const chargingPowerKw = p.chargingPowerKw || 0;

  const effectiveHoursPerDay = (throughput > 0 ? Math.min(24, shifts * 8) : 0);
  const totalHoursPerYear = workingDays * effectiveHoursPerDay;

  let robotCount = 1;
  let throughputPerRobot = throughput;
  if (throughput > 0 && totalHoursPerYear > 0) {
    const annualThroughputRobot = throughput * totalHoursPerYear;
    robotCount = Math.max(1, Math.ceil(operations / annualThroughputRobot));
  }

  const availability = p.robotAvailability !== undefined
    ? (typeof p.robotAvailability === 'number' && p.robotAvailability > 1 ? p.robotAvailability / 100 : p.robotAvailability)
    : defaults.robotAvailability;
  let utilization = p.robotUtilization !== undefined
    ? (typeof p.robotUtilization === 'number' && p.robotUtilization > 1 ? p.robotUtilization / 100 : p.robotUtilization)
    : defaults.robotUtilization;

  // Клиническая загрузка заметно ниже складской (подготовка пациентов, слоты, дезинформация)
  if (isMedicalDomain && p.robotUtilization === undefined) {
    utilization = 0.55;
  }
  if (isMedicalDomain && p.robotAvailability === undefined) {
    availability = 0.90;
  }

  let infraAdjustment = 1.0;
  if (floorFlatness > 0 && floorFlatness > 3) infraAdjustment *= 1.05;
  if (noiseLevelDb > 0 && noiseLevelDb < 40) infraAdjustment *= 1.03;

  if (chargingPowerKw > 0 && powerKw > 0) {
    const chargingTimeRatio = Math.min(1, (powerKw * 8 * shifts) / (chargingPowerKw * 12));
    if (chargingTimeRatio < 0.3) infraAdjustment *= 1.15;
    else if (chargingTimeRatio < 0.5) infraAdjustment *= 1.08;
  }

  robotCount = Math.ceil(robotCount / (availability * utilization) * infraAdjustment);

  const equipmentCost = robotCount * capexPerUnit;
  const infrastructureCost = equipmentCost * (p.infrastructureRatio !== undefined ? p.infrastructureRatio : defaults.infrastructureRatio);
  const softwareCost = equipmentCost * (p.softwareRatio !== undefined ? p.softwareRatio : defaults.softwareRatio);
  const integrationCost = equipmentCost * (p.integrationRatio !== undefined ? p.integrationRatio : defaults.integrationRatio);
  const trainingCost = equipmentCost * (p.trainingRatio !== undefined ? p.trainingRatio : defaults.trainingRatio);
  const capexReserve = equipmentCost * (p.reserveRatio !== undefined ? p.reserveRatio : defaults.reserveRatio);
  const totalCapex = equipmentCost + infrastructureCost + softwareCost + integrationCost + trainingCost + capexReserve;

  const infraAdjustmentRatio = infraAdjustment - 1;
  const adjustedEquipmentCost = equipmentCost * infraAdjustment;
  const adjustedCapex = totalCapex * infraAdjustment;
  const annualService = robotCount * serviceCostPerMonth * 12 * (p.serviceRatio !== undefined ? (1 + p.serviceRatio) : 1);
  const annualLicenses = equipmentCost * (p.licenseRatio !== undefined ? p.licenseRatio : defaults.licenseRatio);
  const annualElectricity = area * (electricityRate || 0) * 12 + robotCount * powerKw * 8 * workingDays * 0.05;
  const annualMaterials = equipmentCost * (p.materialRatio !== undefined ? p.materialRatio : defaults.materialRatio);
  const annualRepair = equipmentCost * (p.repairRatio !== undefined ? p.repairRatio : defaults.repairRatio) / p.depreciationYears;
  const annualManagement = equipmentCost * (p.managementRatio !== undefined ? p.managementRatio : defaults.managementRatio);
  const totalAnnualOpex = annualService + annualLicenses + annualElectricity + annualMaterials + annualRepair + annualManagement;

  const depreciationPeriod = p.depreciationYears || defaults.depreciationYears;
  const amortizationMethod = p.amortizationMethod || defaults.amortizationMethod;
  const annualDepreciation = adjustedCapex / depreciationPeriod;

  const horizon = p.horizon || defaults.depreciationYears;

  const depreciationSchedule = [];
  let bookValue = adjustedCapex;
  for (let year = 1; year <= horizon; year++) {
    const dep = amortizationMethod === 'linear'
      ? totalCapex / depreciationPeriod
      : (year <= depreciationPeriod ? (totalCapex / depreciationPeriod) * Math.pow(0.5, 0) : 0);
    bookValue = Math.max(0, bookValue - dep);
    depreciationSchedule.push({
      year,
      depreciation: dep,
      accumulatedDepreciation: totalCapex - bookValue,
      bookValue,
    });
  }

  const laborSavings = annualLaborCost * (laborReduction || 0);
  const productivityGainValue = annualLaborCost * (productivityLift || 0);
  const otherSavings = (p.otherSavings || 0);
  const annualSavings = laborSavings + productivityGainValue + otherSavings;

  const netAnnualEffect = annualSavings - totalAnnualOpex - annualDepreciation;

  const discountRate = p.discountRate !== undefined ? p.discountRate : defaults.discountRate;

  let payback = Infinity;
  let cumulativeCashFlow = -adjustedCapex;
  for (let year = 1; year <= horizon; year++) {
    const annualNet = annualSavings - totalAnnualOpex;
    cumulativeCashFlow += annualNet;
    if (cumulativeCashFlow >= 0 && payback === Infinity) {
      payback = year - 1 + (adjustedCapex - (year > 1 ? (annualSavings - totalAnnualOpex) * (year - 1) : 0)) / annualNet;
      if (payback < 1) payback = 1;
    }
  }

  let npv = -adjustedCapex;
  for (let year = 1; year <= horizon; year++) {
    const freeCashFlow = annualSavings - totalAnnualOpex;
    npv += freeCashFlow / Math.pow(1 + discountRate, year);
  }

  let roi = 0;
  let roi3y = 0;
  if (adjustedCapex > 0) {
    const annualNet = annualSavings - totalAnnualOpex;
    const cumulativeEffect = annualNet * horizon;
    roi = (cumulativeEffect / adjustedCapex) * 100;           // ROI на полном горизонте
    const cumulativeNet3 = annualNet * Math.min(3, horizon);
    roi3y = (cumulativeNet3 / adjustedCapex) * 100;          // ROI за 3 года (для UI)
  }

  // Медицинский потолок: клиническая роботизация редко даёт 300%+
  if (isMedicalDomain) {
    roi = Math.min(roi, 180);
    roi3y = Math.min(roi3y, 80);
  }

  let tco = adjustedCapex;
  for (let year = 1; year <= horizon; year++) {
    const replacementCost = (year % depreciationPeriod === 0 && year <= p.robotReplacementYear * Math.ceil(horizon / p.robotReplacementYear))
      ? equipmentCost * 0.7
      : 0;
    const yearlyOpex = totalAnnualOpex + replacementCost;
    tco += yearlyOpex;
  }

  const co2Reduction = (p.co2ReductionFactor || 0) * robotCount;

  return {
    robotCount: Math.ceil(robotCount),
    equipmentCost,
    infrastructureCost,
    softwareCost,
    integrationCost,
    trainingCost,
    capexReserve,
    totalCapex: adjustedCapex,
    baseCapex: totalCapex,
    infraAdjustment,
    floorFlatness,
    noiseLevelDb,
    chargingPowerKw,
    annualService,
    annualLicenses,
    annualElectricity,
    annualMaterials,
    annualRepair,
    annualManagement,
    totalAnnualOpex,
    annualDepreciation,
    depreciationSchedule,
    laborSavings,
    productivityGainValue,
    otherSavings,
    annualSavings,
    netAnnualEffect,
    payback: isFinite(payback) ? payback : -1,
    npv,
    roi,
    roi3y,
    roiHorizon: roi,
    tco,
    co2Reduction,
    horizon,
    throughputPerRobot: throughput,
    laborCostAnnual: annualLaborCost,
    assumptions: {
      depreciationMethod: amortizationMethod,
      depreciationYears: depreciationPeriod,
      discountRate,
      availability,
      utilization,
      horizon,
      infrastructureAdjustment: infraAdjustment,
      floorFlatness,
      noiseLevelDb,
      chargingPowerKw,
      domain: isMedicalDomain ? 'medical' : (isFarmDomain ? 'farm' : (isConstructionDomain ? 'construction' : (isEnergyDomain ? 'energy' : (isSecurityDomain ? 'security' : 'general')))),
    },
  };
}

function calcBaseScenario(params) {
  const p = params;
  const staff = p.staff || 0;
  const salary = p.salary || 80000;
  const workingDays = p.workingDays || 250;
  const shifts = p.shifts || 1;
  const area = p.area || 0;
  const electricityRate = p.electricity || 10;

  const avgSalaryAnnual = salary * 12;
  const totalLaborCost = staff * avgSalaryAnnual;
  const totalElectricity = area * (electricityRate || 0) * 12;
  const totalOpex = totalLaborCost + totalElectricity;

  return {
    robotCount: 0,
    totalCapex: 0,
    totalAnnualOpex: totalOpex,
    annualSavings: 0,
    netAnnualEffect: 0,
    payback: 0,
    npv: 0,
    roi: 0,
    tco: 0,
    co2Reduction: 0,
    horizon: p.horizon || defaults.depreciationYears,
    laborCostAnnual: totalLaborCost,
    annualLaborCost: totalLaborCost,
    operationalCost: totalOpex,
    throughputPerRobot: 0,
    assumptions: {
      depreciationMethod: 'none',
      depreciationYears: 0,
      discountRate: defaults.discountRate,
      availability: 1,
      utilization: 1,
      horizon: p.horizon || defaults.depreciationYears,
    },
  };
}

function calcRaasScenario(params, solution) {
  const p = params;
  const m = solution.metrics || {};
  const horizon = p.horizon || defaults.depreciationYears;
  const monthlyRate = (p.raasMonthlyRate || 0.02);
  const contractYears = p.raasContractYears || horizon;
  const purchaseOptionPrice = (p.raasPurchaseOption || 0);
  const months = contractYears * 12;

  const robotCount = p.robotCount || 1;
  const equipmentValue = robotCount * (m.capexPerUnit || 0);

  let totalPayments = 0;
  let capexPayments = 0;
  let opexPayments = 0;
  const monthlyPayment = (equipmentValue / months) * (1 + monthlyRate);
  totalPayments = monthlyPayment * months;
  opexPayments = totalPayments;

  const annualOpex = totalPayments / contractYears;
  const annualSavings = params.annualSavings || 0;
  const netAnnual = annualSavings - annualOpex;

  let payback = Infinity;
  let cumulative = 0;
  for (let y = 1; y <= horizon; y++) {
    cumulative += netAnnual;
    if (cumulative >= 0 && payback === Infinity) {
      payback = y - 1 + (Math.abs(cumulative - netAnnual) / netAnnual);
    }
  }

  let npv = 0;
  const dr = defaults.discountRate;
  for (let y = 1; y <= horizon; y++) {
    npv += netAnnual / Math.pow(1 + dr, y);
  }

  const roi = totalPayments > 0 ? ((annualSavings * horizon - totalPayments) / totalPayments) * 100 : 0;

  return {
    robotCount,
    totalCapex: 0,
    totalAnnualOpex: annualOpex,
    annualSavings,
    netAnnualEffect: netAnnual,
    payback: isFinite(payback) ? payback : -1,
    npv,
    roi,
    tco: totalPayments + annualOpex * (horizon - contractYears),
    co2Reduction: (p.co2ReductionFactor || 0) * robotCount,
    horizon,
    equipmentValue,
    monthlyPayment,
    contractYears,
    purchaseOptionPrice,
    assumptions: {
      model: 'rental',
      monthlyRate,
      contractYears,
      hasPurchaseOption: purchaseOptionPrice > 0,
    },
  };
}

function sensitivityAnalysis(params, solution, baseMetric) {
  const paramKeys = ['capexPerUnit', 'operations', 'salary'];
  const variations = [-20, -10, 0, 10, 20];
  const results = {};

  paramKeys.forEach(key => {
    results[key] = variations.map(v => {
      const modifiedParams = { ...params };
      const modifiedSolution = { ...solution, metrics: { ...solution.metrics } };

      const factor = 1 + v / 100;
      if (key === 'capexPerUnit') {
        modifiedSolution.metrics.capexPerUnit = (solution.metrics.capexPerUnit || 0) * factor;
      } else if (key === 'operations') {
        modifiedParams.operations = (params.operations || 0) * factor;
      } else if (key === 'salary') {
        modifiedParams.salary = (params.salary || 0) * factor;
      }

      const purchase = calcScenario(modifiedParams, modifiedSolution);
      const raas = calcRaasScenario({
        ...modifiedParams,
        robotCount: purchase.robotCount,
        annualSavings: purchase.annualSavings,
      }, modifiedSolution);
      const loan = calcLoanScenario(modifiedParams, modifiedSolution, purchase);

      return {
        variation: v,
        purchase: { roi: purchase.roi, payback: purchase.payback, netAnnual: purchase.netAnnualEffect, capex: purchase.totalCapex, opex: purchase.totalAnnualOpex },
        raas: { roi: raas.roi, payback: raas.payback, netAnnual: raas.netAnnualEffect, capex: raas.totalCapex, opex: raas.totalAnnualOpex },
        loan: { roi: loan.roi, payback: loan.payback, netAnnual: loan.netAnnualEffect, capex: loan.totalCapex, opex: loan.totalAnnualOpex },
      };
    });
  });

  return results;
}

function calcAll(params, solution) {
  const base = calcBaseParams(params, solution);
  const baseScenario = calcBaseScenario(params);
  // Domain-aware params: carry object type / industry so the labor/productivity
  // correction (social/medical payback 3-7 years, not 3) is applied consistently.
  const domainParams = {
    ...params,
    objectType: params.objectType || params.objectTypeName || params.object_type,
    industry: params.industry || params.industryId || params.industryName,
  };
  const purchaseScenario = calcScenario({ ...domainParams, model: 'purchase' }, solution);
  const raasScenario = calcRaasScenario({
    ...domainParams,
    robotCount: purchaseScenario.robotCount,
    annualSavings: purchaseScenario.annualSavings,
  }, solution);
  const loanScenario = calcLoanScenario(domainParams, solution, purchaseScenario);

  const sensitivity = sensitivityAnalysis(domainParams, solution);

  return {
    base: base,
    baseScenario,
    purchaseScenario,
    raasScenario,
    loanScenario,
    sensitivity,
    allParams: params,
    domain: String(domainParams.objectType || domainParams.industry || ''),
    assumptions: {
      ...defaults,
      ...params,
      depreciationMethod: params.amortizationMethod || defaults.amortizationMethod,
      depreciationYears: params.depreciationYears || defaults.depreciationYears,
      discountRate: params.discountRate !== undefined ? params.discountRate : defaults.discountRate,
    },
  };
}

function calcBaseParams(params, solution) {
  const p = { ...defaults, ...params };
  const m = solution.metrics || {};
  const operations = p.operations || 0;
  const workingDays = p.workingDays || 250;
  const shifts = p.shifts || 1;
  const throughput = m.throughput || 0;

  const effectiveHoursPerDay = throughput > 0 ? Math.min(24, shifts * 8) : 0;
  const totalHoursPerYear = workingDays * effectiveHoursPerDay;
  let robotCount = 1;
  if (throughput > 0 && totalHoursPerYear > 0) {
    robotCount = Math.max(1, Math.ceil(operations / (throughput * totalHoursPerYear)));
  }
  const availability = p.robotAvailability !== undefined ? p.robotAvailability : defaults.robotAvailability;
  const utilization = p.robotUtilization !== undefined ? p.robotUtilization : defaults.robotUtilization;
  robotCount = Math.ceil(robotCount / (availability * utilization));

  return {
    robotCount,
    throughput: m.throughput || 0,
    throughputPerRobot: throughput,
    operatingHours: effectiveHoursPerDay,
    totalHoursPerYear,
    availability,
    utilization,
  };
}

function classifyPayback(payback) {
  if (payback < 0) return { label: 'Не окупается', color: 'danger' };
  if (payback <= 1) return { label: 'Менее 1 года', color: 'success' };
  if (payback <= 3) return { label: '1-3 года', color: 'success' };
  if (payback <= 5) return { label: '3-5 лет', color: 'warning' };
  if (payback <= 10) return { label: '5-10 лет', color: 'warning' };
  return { label: 'Более 10 лет', color: 'danger' };
}

module.exports = {
  calcScenario,
  calcBaseScenario,
  calcRaasScenario,
  calcLoanScenario,
  calcAll,
  sensitivityAnalysis,
  classifyPayback,
  defaults,
  calcBaseParams,
};
