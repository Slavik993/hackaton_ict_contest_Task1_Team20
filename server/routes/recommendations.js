const express = require('express');
const router = express.Router();
const { getDb } = require('../db');
const { recommend } = require('../services/ai-recommender');

router.post('/', (req, res) => {
  try {
    const { objectTypeId, params = {}, query = '', limit = 10 } = req.body;

    if (!objectTypeId) {
      return res.status(400).json({ error: 'objectTypeId is required' });
    }

    const recommendations = recommend({
      objectTypeId,
      params,
      query,
      limit: Math.min(Number(limit) || 10, 30),
    });

    try {
      const db = getDb();
      db.prepare(
        `INSERT INTO recommendation_logs 
         (user_id, object_type_id, params, recommendations, created_at)
         VALUES (?, ?, ?, ?, datetime('now'))`
      ).run(
        req.user ? req.user.id : null,
        objectTypeId,
        JSON.stringify(params),
        JSON.stringify(recommendations.map((r) => ({ id: r.id, aiScore: r.aiScore }))),
      );
    } catch (logErr) {
      console.warn('Failed to log recommendation:', logErr.message);
    }

    res.json({
      success: true,
      count: recommendations.length,
      recommendations,
    });
  } catch (err) {
    console.error('Recommendation error:', err);
    res.status(500).json({ error: 'Ошибка при формировании рекомендаций' });
  }
});

router.post('/feedback', (req, res) => {
  try {
    const { objectTypeId, selectedSolutionId } = req.body;

    if (!selectedSolutionId) {
      return res.status(400).json({ error: 'selectedSolutionId is required' });
    }

    const db = getDb();
    db.prepare(
      `UPDATE recommendation_logs 
       SET selected_solution_id = ?
       WHERE id = (
         SELECT id FROM recommendation_logs 
         WHERE object_type_id = ? 
           AND selected_solution_id IS NULL
         ORDER BY created_at DESC
         LIMIT 1
       )`
    ).run(selectedSolutionId, objectTypeId);

    res.json({ success: true });
  } catch (err) {
    console.error('Feedback error:', err);
    res.status(500).json({ error: 'Ошибка сохранения обратной связи' });
  }
});

module.exports = router;
