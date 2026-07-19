'use strict';

const { z } = require('zod');

/**
 * 寵物記帳「新增」請求 Schema
 * - price：正整數（> 0）
 * - item：1～50 字元字串
 * - petName：字串
 */
const createPetLedgerSchema = z.object({
  price: z
    .number({
      required_error: 'price 為必填',
      invalid_type_error: 'price 必須是數字',
    })
    .int('price 必須是整數')
    .positive('price 必須是正整數'),
  item: z
    .string({
      required_error: 'item 為必填',
      invalid_type_error: 'item 必須是字串',
    })
    .min(1, 'item 至少 1 個字元')
    .max(50, 'item 最多 50 個字元'),
  petName: z.string({
    required_error: 'petName 為必填',
    invalid_type_error: 'petName 必須是字串',
  }),
});

module.exports = { createPetLedgerSchema };
