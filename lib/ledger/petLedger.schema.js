'use strict';

const { z } = require('zod');

/**
 * 寵物記帳（yarikujima）Zod 安檢門
 * - 品名 item：必須是文字
 * - 金額 amount：必須是正數字
 * - 驗證失敗由路由回傳 400；通過後才寫入 PostgreSQL
 */

/** 拒絕控制字元與標記符號，降低 XSS／髒資料進庫風險 */
function safeLedgerText(label, maxLen) {
  return z
    .string({
      required_error: `${label} 為必填`,
      invalid_type_error: `${label} 必須是文字`,
    })
    .trim()
    .min(1, `${label} 不可為空`)
    .max(maxLen, `${label} 最多 ${maxLen} 個字元`)
    .refine((v) => !/[\u0000-\u001F\u007F<>`]/.test(v), {
      message: `${label} 含有非法字元`,
    });
}

/**
 * POST /api/pet-ledger body
 * 相容舊欄位 price → 正規化為 amount
 */
const createPetLedgerSchema = z.preprocess((raw) => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const body = { ...raw };
  if (body.amount == null && body.price != null) {
    body.amount = body.price;
  }
  delete body.price;
  return body;
}, z
  .object({
    item: safeLedgerText('品名', 50),
    amount: z
      .number({
        required_error: '金額為必填',
        invalid_type_error: '金額必須是數字',
      })
      .finite('金額必須是有效數字')
      .positive('金額必須是正數字')
      .max(1_000_000_000, '金額超出允許範圍'),
    petName: z
      .string({ invalid_type_error: 'petName 必須是文字' })
      .trim()
      .max(40, 'petName 最多 40 個字元')
      .refine((v) => !/[\u0000-\u001F\u007F<>`]/.test(v), {
        message: 'petName 含有非法字元',
      })
      .optional()
      .default(''),
  })
  .strict());

/** GET /api/pet-ledger — 列表查詢參數 */
const listPetLedgerQuerySchema = z
  .object({
    limit: z.coerce
      .number({ invalid_type_error: 'limit 必須是數字' })
      .int('limit 必須是整數')
      .min(1, 'limit 至少為 1')
      .max(100, 'limit 最多 100')
      .optional()
      .default(20),
  })
  .strict();

/** GET /api/pet-ledger/:id — 路徑參數 */
const petLedgerIdParamSchema = z
  .object({
    id: z
      .string({
        required_error: 'id 為必填',
        invalid_type_error: 'id 必須是字串',
      })
      .trim()
      .min(1, 'id 不可為空')
      .max(128, 'id 過長')
      .regex(/^[A-Za-z0-9_-]+$/, 'id 格式無效'),
  })
  .strict();

function formatZodError(err) {
  return err.issues.map((issue) => ({
    path: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

/** Express 中介層：驗證 body / query / params，失敗直接 400 */
function validate(schema, source = 'body') {
  return function zodGate(req, res, next) {
    const raw =
      source === 'query' ? req.query : source === 'params' ? req.params : req.body;
    const result = schema.safeParse(raw);
    if (!result.success) {
      return res.status(400).json({
        error: '請求資料不符合規範',
        details: formatZodError(result.error),
      });
    }
    if (source === 'query') req.validatedQuery = result.data;
    else if (source === 'params') req.validatedParams = result.data;
    else req.validated = result.data;
    next();
  };
}

module.exports = {
  createPetLedgerSchema,
  listPetLedgerQuerySchema,
  petLedgerIdParamSchema,
  formatZodError,
  validate,
};
