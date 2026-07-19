'use strict';

/**
 * 寵物記帳 API（Zod 安檢 + PostgreSQL）
 *
 *   POST /api/pet-ledger          新增（Zod 驗證 req.body → 寫入 PG）
 *   GET  /api/pet-ledger          列表（?limit=1..100）
 *   GET  /api/pet-ledger/:id      單筆
 */

const express = require('express');
const requireAuth = require('../requireAuth');
const store = require('./petLedger.store');
const {
  createPetLedgerSchema,
  listPetLedgerQuerySchema,
  petLedgerIdParamSchema,
  validate,
} = require('./petLedger.schema');

const router = express.Router();
router.use(express.json({ limit: '32kb' }));
router.use(requireAuth);

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/** POST / — Zod 嚴格檢查 body，通過後寫入 PostgreSQL */
router.post(
  '/',
  validate(createPetLedgerSchema, 'body'),
  asyncHandler(async (req, res) => {
    const { item, amount, petName } = req.validated;
    const entry = await store.createEntry({
      email: req.userEmail,
      item,
      amount,
      petName,
    });
    res.status(201).json({ ok: true, entry });
  })
);

/** GET / — 列表 */
router.get(
  '/',
  validate(listPetLedgerQuerySchema, 'query'),
  asyncHandler(async (req, res) => {
    const { limit } = req.validatedQuery;
    const entries = await store.listEntries(req.userEmail, { limit });
    res.json({ ok: true, entries, count: entries.length });
  })
);

/** GET /:id — 單筆 */
router.get(
  '/:id',
  validate(petLedgerIdParamSchema, 'params'),
  asyncHandler(async (req, res) => {
    const { id } = req.validatedParams;
    const entry = await store.getEntry(req.userEmail, id);
    if (!entry) {
      return res.status(404).json({ error: '找不到這筆記帳' });
    }
    res.json({ ok: true, entry });
  })
);

router.use((err, _req, res, _next) => {
  console.error('[pet-ledger]', err && err.stack ? err.stack : err);
  res.status(500).json({ error: '記帳服務暫時無法使用' });
});

module.exports = router;
