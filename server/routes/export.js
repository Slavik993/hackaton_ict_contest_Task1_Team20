const express = require('express');
const { getDb } = require('../db');
const { calcAll, calcBaseScenario, classifyPayback } = require('../services/calculation');
const jwt = require('jsonwebtoken');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');
const router = express.Router();

router.post('/pdf', (req, res) => {
  const { params, solution } = req.body;
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
    doc.text('Данный результат является предварительной оценкой и требует верификации.', { align: 'center', fontSize: 9, fillColor: '#ef4444' });
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
    doc.text('2. Экономические показатели');
    doc.moveDown();

    const rows = [
      ['Показатель', 'Значение'],
      ['CAPEX', `${Math.round(result.purchaseScenario.totalCapex).toLocaleString('ru-RU')} ₽`],
      ['Годовой OPEX', `${Math.round(result.purchaseScenario.totalAnnualOpex).toLocaleString('ru-RU')} ₽`],
      ['Годовая экономия', `${Math.round(result.purchaseScenario.annualSavings).toLocaleString('ru-RU')} ₽`],
      ['Чистый годовой эффект', `${Math.round(result.purchaseScenario.netAnnualEffect).toLocaleString('ru-RU')} ₽`],
      ['Срок окупаемости', result.purchaseScenario.payback > 0 ? `${result.purchaseScenario.payback.toFixed(1)} лет` : '—'],
      ['ROI', `${result.purchaseScenario.roi.toFixed(1)} %`],
      ['NPV за 3 года', `${Math.round(result.purchaseScenario.npv).toLocaleString('ru-RU')} ₽`],
      ['TCO за 5 лет', `${Math.round(result.purchaseScenario.tco).toLocaleString('ru-RU')} ₽`],
      ['Потребность в роботах', `${result.purchaseScenario.robotCount} шт.`],
    ];

    const xStart = 60;
    let yPos = doc.y;
    rows.forEach((row, idx) => {
      if (idx === 0) doc.font('Helvetica-Bold').fillColor('#475569');
      else doc.font('Helvetica').fillColor('#0f172a');
      doc.text(row[0], xStart, yPos);
      doc.text(row[1], xStart + 200, yPos);
      yPos += 20;
      if (yPos > 700) { doc.addPage(); yPos = 50; }
    });

    doc.end();
  } catch (e) {
    console.error('PDF export error:', e);
    res.status(500).json({ error: 'Ошибка генерации PDF', details: e.message });
  }
});

router.post('/excel', async (req, res) => {
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
    ];
    ws1.addRows(rows);

    const ws2 = wb.addWorksheet('Сценарии');
    ws2.columns = [
      { header: 'Сценарий', width: 30 },
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
        'RaaS (аренда)',
        0,
        Math.round(result.raasScenario.totalAnnualOpex),
        Math.round(result.raasScenario.annualSavings),
        Math.round(result.raasScenario.netAnnualEffect),
        result.raasScenario.payback > 0 ? result.raasScenario.payback.toFixed(1) + ' лет' : '—',
        result.raasScenario.roi.toFixed(1) + '%',
        result.raasScenario.robotCount,
      ]);
    }
    if (result.loanScenario) {
      ws2.addRow([
        'Кредит (заёмные средства)',
        Math.round(result.loanScenario.totalCapex),
        Math.round(result.loanScenario.totalAnnualOpex),
        Math.round(result.loanScenario.annualSavings),
        Math.round(result.loanScenario.netAnnualEffect),
        result.loanScenario.payback > 0 ? result.loanScenario.payback.toFixed(1) + ' лет' : '—',
        result.loanScenario.roi.toFixed(1) + '%',
        result.loanScenario.robotCount,
      ]);
    }

    const ws3 = wb.addWorksheet('Амортизация');
    ws3.columns = [
      { header: 'Год', width: 10 },
      { header: 'Амортизация', width: 20 },
      { header: 'Накопленная', width: 20 },
      { header: 'Бал. стоимость', width: 20 },
    ];
    if (result.purchaseScenario && result.purchaseScenario.depreciationSchedule) {
      result.purchaseScenario.depreciationSchedule.forEach((d) => {
        ws3.addRow([d.year, Math.round(d.depreciation), Math.round(d.accumulatedDepreciation), Math.round(d.bookValue)]);
      });
    }

    const ws4 = wb.addWorksheet('CAPEX детали');
    ws4.columns = [{ header: 'Статья', width: 35 }, { header: 'Сумма', width: 25 }, { header: 'Ед.', width: 15 }];
    if (result.purchaseScenario) {
      ws4.addRow(['Оборудование', Math.round(result.purchaseScenario.equipmentCost), '₽']);
      ws4.addRow(['Инфраструктура', Math.round(result.purchaseScenario.infrastructureCost), '₽']);
      ws4.addRow(['ПО', Math.round(result.purchaseScenario.softwareCost), '₽']);
      ws4.addRow(['Интеграция', Math.round(result.purchaseScenario.integrationCost), '₽']);
      ws4.addRow(['Обучение', Math.round(result.purchaseScenario.trainingCost), '₽']);
      ws4.addRow(['Резерв', Math.round(result.purchaseScenario.capexReserve), '₽']);
      ws4.addRow(['Итого CAPEX', Math.round(result.purchaseScenario.totalCapex), '₽']);
      ws4.addRow([]);
      ws4.addRow(['OPEX:', '', '']);
      ws4.addRow(['Сервис', Math.round(result.purchaseScenario.annualService), '₽/год']);
      ws4.addRow(['Лицензии', Math.round(result.purchaseScenario.annualLicenses), '₽/год']);
      ws4.addRow(['Электроэнергия', Math.round(result.purchaseScenario.annualElectricity), '₽/год']);
      ws4.addRow(['Материалы', Math.round(result.purchaseScenario.annualMaterials), '₽/год']);
      ws4.addRow(['Ремонт', Math.round(result.purchaseScenario.annualRepair), '₽/год']);
      ws4.addRow(['Управление', Math.round(result.purchaseScenario.annualManagement), '₽/год']);
      if (result.loanScenario && result.loanScenario.loanDetails) {
        ws4.addRow([]);
        ws4.addRow(['Кредит (RaaS/заём):', '', '']);
        ws4.addRow(['  Первоначальный взнос', Math.round(result.loanScenario.loanDetails.downPayment), '₽']);
        ws4.addRow(['  Сумма кредита', Math.round(result.loanScenario.loanDetails.loanAmount), '₽']);
        ws4.addRow(['  Платёж в месяц', Math.round(result.loanScenario.loanDetails.periodicPayment), '₽']);
      }
    }

    const wsParams = wb.addWorksheet('Параметры');
    wsParams.columns = [{ header: 'Параметр', width: 35 }, { header: 'Значение', width: 25 }];
    if (params) {
      Object.keys(params).forEach((k) => {
        if (['token','password','password_hash','secret'].includes(k.toLowerCase())) return;
        wsParams.addRow([k, params[k]]);
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
