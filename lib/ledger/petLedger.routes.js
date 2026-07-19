'use strict';

/**
 * 寵物記帳新增端點
 * POST /api/pet-ledger
 * Body: { price: number, item: string, petName: string }
 */

const express = require('express');
const requireAuth = require('../requireAuth');
const { createPetLedgerSchema } = require('./petLedger.schema');

const router = express.Router();
router.use(express.json());
router.use(requireAuth);

function formatZodError(err) {
  return err.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

/** 以 Zod Schema 驗證 body；失敗直接 400 */
function validateCreatePetLedger(req, res, next) {
  const result = createPetLedgerSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({
      error: '請求資料不符合規範',
      details: formatZodError(result.error),
    });
  }
  req.validated = result.data;
  next();
}

router.post('/', validateCreatePetLedger, (req, res) => {
  const { price, item, petName } = req.validated;
  // 驗證通過後回傳結構化結果（實際入帳仍由前端 gameState sync；此端點負責把關輸入）
  res.status(201).json({
    ok: true,
    entry: {
      price,
      item,
      petName,
      email: req.userEmail,
      createdAt: new Date().toISOString(),
    },
  });
});

module.exports = router;
