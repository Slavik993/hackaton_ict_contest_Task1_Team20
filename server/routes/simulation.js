/**
 * REST API routes for the economic simulator.
 *
 *   POST   /api/simulation        — start a new simulation, returns id + first snapshot
 *   POST   /api/simulation/step   — advance an existing simulation by N steps
 *   GET    /api/simulation        — list all running simulations
 *   GET    /api/simulation/:id    — fetch the current snapshot
 *   DELETE /api/simulation/:id    — remove from the store
 *   POST   /api/simulation/run    — convenience: run to completion in one shot
 */

'use strict';

const express = require('express');
const router = express.Router();

const simulation = require('../services/simulation');

function handleError(res, e) {
  console.error('[simulation]', e);
  if (e && /требуются|не найден/i.test(String(e.message || ''))) {
    return res.status(400).json({ error: e.message });
  }
  res.status(500).json({ error: 'Ошибка симуляции', details: e && e.message });
}

// ---------------------------------------------------------------------------
// CRUD-ish endpoints
// ---------------------------------------------------------------------------

router.post('/', (req, res) => {
  try {
    const { params, solution, model = 'purchase', overrides } = req.body || {};
    if (!params || !solution) {
      return res.status(400).json({ error: 'Требуются params и solution' });
    }
    const sim = simulation.createSimulation({ params, solution, model, overrides });
    res.status(201).json({
      ok: true,
      simulation: simulation.getSnapshot(sim.id),
    });
  } catch (e) {
    handleError(res, e);
  }
});

router.post('/run', (req, res) => {
  try {
    const { params, solution, model = 'purchase', overrides } = req.body || {};
    if (!params || !solution) {
      return res.status(400).json({ error: 'Требуются params и solution' });
    }
    const sim = simulation.runSimulation({ params, solution, model, overrides });
    res.json({
      ok: true,
      simulation: simulation.getSnapshot(sim.id),
    });
  } catch (e) {
    handleError(res, e);
  }
});

router.post('/step', (req, res) => {
  try {
    const { id, steps = 1 } = req.body || {};
    if (!id) return res.status(400).json({ error: 'Требуется id симуляции' });
    if (!simulation.getSimulation(id)) {
      return res.status(404).json({ error: 'Симуляция не найдена' });
    }
    const sim = simulation.stepSimulation(id, Number(steps) || 1);
    res.json({
      ok: true,
      simulation: simulation.getSnapshot(sim.id),
    });
  } catch (e) {
    handleError(res, e);
  }
});

router.get('/', (req, res) => {
  res.json({ ok: true, simulations: simulation.listSimulations() });
});

router.get('/:id', (req, res) => {
  const snap = simulation.getSnapshot(req.params.id);
  if (!snap) return res.status(404).json({ error: 'Симуляция не найдена' });
  res.json({ ok: true, simulation: snap });
});

router.delete('/:id', (req, res) => {
  const ok = simulation.deleteSimulation(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Симуляция не найдена' });
  res.json({ ok: true });
});

router.post('/:id/reset', (req, res) => {
  try {
    if (!simulation.getSimulation(req.params.id)) {
      return res.status(404).json({ error: 'Симуляция не найдена' });
    }
    const sim = simulation.resetSimulation(req.params.id);
    if (!sim) return res.status(500).json({ error: 'Не удалось сбросить симуляцию' });
    res.json({ ok: true, simulation: simulation.getSnapshot(sim.id) });
  } catch (e) {
    handleError(res, e);
  }
});

module.exports = router;
