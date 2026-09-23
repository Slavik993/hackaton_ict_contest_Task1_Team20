const express = require('express');
const { calcAll, calcScenario, calcBaseScenario, calcRaasScenario, calcLoanScenario, classifyPayback, defaults: calcDefaults } = require('../services/calculation');
const { getDb } = require('../db');
const { JWT_SECRET } = require('../../config');
const jwt = require('jsonwebtoken');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const router = express.Router();

router.post('/', (req, res) => {
  const { params, solution, model } = req.body;
  if (!params || !solution) {
    return res.status(400).json({ error: 'Требуются параметры объекта и решение' });
  }

  try {
    const result = calcAll(params, solution);
    const paybackClass = classifyPayback(result.purchaseScenario.payback);
    res.json({
      ...result,
      paybackClass,
      sourceDataVersion: 'demo-dataset-v1',
      calculationDate: new Date().toISOString(),
    });
  } catch (e) {
    console.error('Calculation error:', e);
    res.status(500).json({ error: 'Ошибка расчёта', details: e.message });
  }
});

router.post('/scenarios', (req, res) => {
  const { params, solutions } = req.body;
  if (!params || !solutions || !Array.isArray(solutions)) {
    return res.status(400).json({ error: 'Требуются параметры и список решений' });
  }

  try {
    const baseScenario = calcBaseScenario(params);
    const scenarios = solutions.map((sol) => {
      const purchase = calcScenario({ ...params, model: 'purchase' }, sol);
      const raas = calcRaasScenario({
        ...params,
        robotCount: purchase.robotCount,
        annualSavings: purchase.annualSavings,
      }, sol);
      const loan = calcLoanScenario({
        ...params,
        loanInterestRate: params.loanInterestRate || 0.12,
        loanTermYears: params.loanTermYears || 5,
        loanDownPaymentRatio: params.loanDownPaymentRatio || 0.20,
      }, sol, purchase);

      return {
        id: sol.id,
        name: sol.name,
        vendor: sol.vendor,
        type: 'robotization',
        purchase: { ...purchase, classification: classifyPayback(purchase.payback) },
        raas: { ...raas, classification: classifyPayback(raas.payback) },
        loan: { ...loan, classification: classifyPayback(loan.payback) },
      };
    });

    const comparison = scenarios.map((s) => ({
      name: s.name,
      capex: s.purchase.totalCapex,
      opex: s.purchase.totalAnnualOpex,
      annualSavings: s.purchase.annualSavings,
      netAnnual: s.purchase.netAnnualEffect,
      payback: s.purchase.payback,
      roi: s.purchase.roi,
      npv: s.purchase.npv,
      tco: s.purchase.tco,
      robotCount: s.purchase.robotCount,
      raasCapex: s.raas.totalCapex,
      raasOpex: s.raas.totalAnnualOpex,
      raasPayback: s.raas.payback,
      raasRoi: s.raas.roi,
      loanCapex: s.loan.totalCapex,
      loanOpex: s.loan.totalAnnualOpex,
      loanPayback: s.loan.payback,
      loanRoi: s.loan.roi,
      loanDebtService: s.loan.annualDebtService,
    }));

    res.json({
      baseScenario: { ...baseScenario, classification: classifyPayback(0) },
      scenarios,
      comparison,
    });
  } catch (e) {
    console.error('Scenario calculation error:', e);
    res.status(500).json({ error: 'Ошибка расчёта сценариев', details: e.message });
  }
});

router.get('/solutions/:id', (req, res) => {
  const db = getDb();
  const sol = db.prepare('SELECT * FROM solutions WHERE id = ?').get(req.params.id);
  if (!sol) return res.status(404).json({ error: 'Решение не найдено' });
  try { sol.features = JSON.parse(sol.features || '[]'); } catch (e) { sol.features = []; }
  res.json(sol);
});

router.post('/export/pdf', (req, res) => {
  const { params, solution, reportData } = req.body;
  try {
    const result = calcAll(params, solution);
    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    const indName = (params.industryName || 'Отрасль');
    const objTypeName = (params.objectTypeName || 'Объект');

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="расчёт_роботизации_${new Date().toISOString().slice(0, 10)}.pdf"`);

    doc.pipe(res);

    doc.fontSize(20).font('Helvetica-Bold').fillColor('#1e293b');
    doc.text('Результаты расчёта роботизации', { align: 'center' });
    doc.moveDown();
    doc.fontSize(11).font('Helvetica').fillColor('#64748b');
    doc.text(`Отрасль: ${indName}  |  Объект: ${objTypeName}`, { align: 'center' });
    doc.text(`Дата расчёта: ${new Date().toLocaleString('ru-RU')}`, { align: 'center' });
    doc.moveDown();
    doc.text('Данный результат является предварительной оценкой и требует верификации при обследовании объекта.', { align: 'center', fontSize: 9, fillColor: '#ef4444' });
    doc.moveDown(2);

    doc.fontSize(14).font('Helvetica-Bold').fillColor('#0f172a');
    doc.text('1. Параметры объекта');
    doc.moveDown();
    doc.fontSize(10).font('Helvetica').fillColor('#334155');
    if (params) {
      Object.keys(params).forEach((k) => {
        if (['token','password','password_hash','secret'].includes(k.toLowerCase())) return;
        doc.text(`${k}: ${params[k]}`);
      });
    }
    doc.moveDown(2);

    doc.fontSize(14).font('Helvetica-Bold').fillColor('#0f172a');
    doc.text('2. Сценарии сравнения');
    doc.moveDown();

    const scenarios = [
      ['Без роботизации (база)', 0, result.baseScenario.totalAnnualOpex, 0, 0, result.baseScenario.payback > 0 ? `${result.baseScenario.payback.toFixed(1)} лет` : '—', '0.0%', 0],
      ['Покупка оборудования', Math.round(result.purchaseScenario.totalCapex), Math.round(result.purchaseScenario.totalAnnualOpex), Math.round(result.purchaseScenario.annualSavings), Math.round(result.purchaseScenario.netAnnualEffect), result.purchaseScenario.payback > 0 ? `${result.purchaseScenario.payback.toFixed(1)} лет` : '—', `${result.purchaseScenario.roi.toFixed(1)}%`, result.purchaseScenario.robotCount],
      ['Роботы как услуга (RaaS)', Math.round(result.raasScenario.totalCapex), Math.round(result.raasScenario.totalAnnualOpex), Math.round(result.raasScenario.annualSavings), Math.round(result.raasScenario.netAnnualEffect), result.raasScenario.payback > 0 ? `${result.raasScenario.payback.toFixed(1)} лет` : '—', `${result.raasScenario.roi.toFixed(1)}%`, result.raasScenario.robotCount],
      ['Заёмные средства (кредит)', Math.round(result.loanScenario.totalCapex), Math.round(result.loanScenario.totalAnnualOpex), Math.round(result.loanScenario.annualSavings), Math.round(result.loanScenario.netAnnualEffect), result.loanScenario.payback > 0 ? `${result.loanScenario.payback.toFixed(1)} лет` : '—', `${result.loanScenario.roi.toFixed(1)}%`, result.loanScenario.robotCount],
    ];

    const headers = ['Сценарий', 'CAPEX', 'OPEX/год', 'Экономия/год', 'Чистый эффект', 'Окупаемость', 'ROI', 'Роботы'];
    const xStart = 60;
    const colWidths = [30, 180, 150, 150, 150, 110, 90, 70];
    let yPos = doc.y;

    headers.forEach((h, i) => {
      doc.font('Helvetica-Bold').fillColor('#475569');
      doc.text(h, xStart + colWidths.slice(0, i).reduce((a, b) => a + b, 0), yPos, { width: colWidths[i], align: 'right' });
    });
    yPos += 18;

    scenarios.forEach((row, idx) => {
      doc.font('Helvetica').fillColor(idx === 0 ? '#94a3b8' : '#0f172a');
      row.forEach((cell, i) => {
        doc.text(String(cell), xStart + colWidths.slice(0, i).reduce((a, b) => a + b, 0), yPos, { width: colWidths[i], align: 'right' });
      });
      yPos += 18;
      if (yPos > 700) { doc.addPage(); yPos = 50; }
    });

    doc.moveDown(2);
    doc.fontSize(14).font('Helvetica-Bold').fillColor('#0f172a');
    doc.text('3. Детализация CAPEX (сценарий покупки)');
    doc.moveDown();
    doc.fontSize(10).font('Helvetica').fillColor('#334155');
    const capexRows = [
      ['Оборудование', Math.round(result.purchaseScenario.equipmentCost)],
      ['Инфраструктура', Math.round(result.purchaseScenario.infrastructureCost)],
      ['ПО', Math.round(result.purchaseScenario.softwareCost)],
      ['Интеграция', Math.round(result.purchaseScenario.integrationCost)],
      ['Обучение', Math.round(result.purchaseScenario.trainingCost)],
      ['Резерв', Math.round(result.purchaseScenario.capexReserve)],
      ['Итого CAPEX', Math.round(result.purchaseScenario.totalCapex)],
    ];
    capexRows.forEach((row, idx) => {
      doc.text(row[0], xStart, yPos);
      doc.text(`${row[1].toLocaleString('ru-RU')} ₽`, xStart + 200, yPos, { align: 'right' });
      yPos += 18;
      if (yPos > 700) { doc.addPage(); yPos = 50; }
    });

    doc.moveDown();
    doc.text('4. Амортизация (линейный метод, ' + result.purchaseScenario.assumptions.depreciationYears + ' лет)', yPos);
    yPos += 16;
    const depHeaders = ['Год', 'Амортизация', 'Накопленная', 'Бал. стоимость'];
    depHeaders.forEach((h, i) => {
      doc.font('Helvetica-Bold').fillColor('#475569');
      doc.text(h, xStart + i * 100, yPos, { width: 100, align: 'right' });
    });
    yPos += 16;
    result.purchaseScenario.depreciationSchedule.forEach((d) => {
      doc.font('Helvetica').fillColor('#0f172a');
      doc.text(d.year, xStart, yPos, { width: 100, align: 'right' });
      doc.text(`${Math.round(d.depreciation).toLocaleString('ru-RU')} ₽`, xStart + 100, yPos, { width: 100, align: 'right' });
      doc.text(`${Math.round(d.accumulatedDepreciation).toLocaleString('ru-RU')} ₽`, xStart + 200, yPos, { width: 100, align: 'right' });
      doc.text(`${Math.round(d.bookValue).toLocaleString('ru-RU')} ₽`, xStart + 300, yPos, { width: 100, align: 'right' });
      yPos += 16;
      if (yPos > 700) { doc.addPage(); yPos = 50; }
    });

    doc.end();
  } catch (e) {
    console.error('PDF export error:', e);
    res.status(500).json({ error: 'Ошибка генерации PDF', details: e.message });
  }
});

router.post('/export/excel', async (req, res) => {
  const { params, solution } = req.body;
  try {
    const result = calcAll(params, solution);
    const wb = new ExcelJS.Workbook();

    const ws1 = wb.addWorksheet('Экономика');
    ws1.columns = [
      { header: 'Показатель', width: 30 },
      { header: 'Значение', width: 25 },
      { header: 'Единица', width: 15 },
    ];

    const rows = [
      ['CAPEX', Math.round(result.purchaseScenario.totalCapex), '₽'],
      ['Годовой OPEX', Math.round(result.purchaseScenario.totalAnnualOpex), '₽'],
      ['Годовая экономия', Math.round(result.purchaseScenario.annualSavings), '₽'],
      ['Чистый годовой эффект', Math.round(result.purchaseScenario.netAnnualEffect), '₽'],
      ['Срок окупаемости', result.purchaseScenario.payback > 0 ? result.purchaseScenario.payback.toFixed(1) : '—', 'лет'],
      ['ROI', result.purchaseScenario.roi.toFixed(1), '%'],
      ['NPV за 3 года', Math.round(result.purchaseScenario.npv), '₽'],
      ['TCO за 5 лет', Math.round(result.purchaseScenario.tco), '₽'],
      ['Потребность в роботах', result.purchaseScenario.robotCount, 'шт.'],
      ['Снижение CO₂', result.purchaseScenario.co2Reduction.toFixed(2), 'т/год'],
      ['', '', ''],
      ['CAPEX (по статьям)', '', ''],
      ['  Оборудование', Math.round(result.purchaseScenario.equipmentCost), '₽'],
      ['  Инфраструктура', Math.round(result.purchaseScenario.infrastructureCost), '₽'],
      ['  ПО', Math.round(result.purchaseScenario.softwareCost), '₽'],
      ['  Интеграция', Math.round(result.purchaseScenario.integrationCost), '₽'],
      ['  Обучение', Math.round(result.purchaseScenario.trainingCost), '₽'],
      ['  Резерв', Math.round(result.purchaseScenario.capexReserve), '₽'],
      ['', '', ''],
      ['OPEX (по статьям)', '', ''],
      ['  Сервис', Math.round(result.purchaseScenario.annualService), '₽'],
      ['  Лицензии', Math.round(result.purchaseScenario.annualLicenses), '₽'],
      ['  Электроэнергия', Math.round(result.purchaseScenario.annualElectricity), '₽'],
      ['  Материалы', Math.round(result.purchaseScenario.annualMaterials), '₽'],
      ['  Ремонт', Math.round(result.purchaseScenario.annualRepair), '₽'],
      ['  Управление', Math.round(result.purchaseScenario.annualManagement), '₽'],
    ];

    ws1.addRows(rows);

    const ws2 = wb.addWorksheet('Сценарии');
    ws2.columns = [
      { header: 'Сценарий', width: 25 },
      { header: 'CAPEX', width: 20 },
      { header: 'OPEX', width: 20 },
      { header: 'Экономия/год', width: 20 },
      { header: 'Чистый эффект', width: 20 },
      { header: 'Окупаемость', width: 15 },
      { header: 'ROI', width: 12 },
      { header: 'Роботы', width: 10 },
    ];

    ws2.addRow(['Без роботизации', 0, Math.round(result.baseScenario.totalAnnualOpex), 0, 0, '—', 0, 0]);
    if (result.purchaseScenario) {
      ws2.addRow([
        'Покупка',
        Math.round(result.purchaseScenario.totalCapex),
        Math.round(result.purchaseScenario.totalAnnualOpex),
        Math.round(result.purchaseScenario.annualSavings),
        Math.round(result.purchaseScenario.netAnnualEffect),
        result.purchaseScenario.payback > 0 ? result.purchaseScenario.payback.toFixed(1) + ' лет' : '—',
        result.purchaseScenario.roi.toFixed(1) + '%',
        result.purchaseScenario.robotCount,
      ]);
    }
    if (result.raasScenario) {
      ws2.addRow([
        'РaaS',
        0,
        Math.round(result.raasScenario.totalAnnualOpex),
        Math.round(result.raasScenario.annualSavings),
        Math.round(result.raasScenario.netAnnualEffect),
        result.raasScenario.payback > 0 ? result.raasScenario.payback.toFixed(1) + ' лет' : '—',
        result.raasScenario.roi.toFixed(1) + '%',
        result.raasScenario.robotCount,
      ]);
    }

    const ws3 = wb.addWorksheet('Параметры');
    ws3.columns = [{ header: 'Параметр', width: 35 }, { header: 'Значение', width: 25 }];
    if (params) {
      Object.keys(params).forEach((k) => {
        if (['token','password','password_hash','secret'].includes(k.toLowerCase())) return;
        ws3.addRow([k, params[k]]);
      });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="расчёт_роботизации_${new Date().toISOString().slice(0, 10)}.xlsx"`);

    await wb.write(res);
  } catch (e) {
    console.error('Excel export error:', e);
    res.status(500).json({ error: 'Ошибка генерации Excel', details: e.message });
  }
});

module.exports = router;
