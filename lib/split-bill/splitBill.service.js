'use strict';

/**
 * splitBill.service.js
 * -----------------------------------------------------------
 * 純業務邏輯層：不碰資料庫、不碰 HTTP，只操作傳入的 group 物件。
 * 這樣無論你原本後端用什麼框架（Express / Koa / Fastify / Nest…）
 * 都可以直接 require 這個檔案來用。
 *
 * group 的資料結構：
 * {
 *   id: string,
 *   name: string,
 *   members: [{ id, name }],
 *   expenses: [{
 *     id, description, amount, paidBy, category, date,
 *     splitType: 'equal' | 'custom',
 *     participants: [memberId, ...],
 *     customShares: { [memberId]: number }   // splitType === 'custom' 時使用
 *   }]
 * }
 * -----------------------------------------------------------
 */

const { randomUUID } = require('crypto');

class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
  }
}

class NotFoundError extends Error {
  constructor(message) {
    super(message);
    this.name = 'NotFoundError';
    this.statusCode = 404;
  }
}

function createGroup(name) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new ValidationError('行程名稱不可為空');
  return {
    id: randomUUID(),
    name: trimmed,
    members: [],
    expenses: [],
    createdAt: new Date().toISOString(),
  };
}

function renameGroup(group, name) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new ValidationError('行程名稱不可為空');
  group.name = trimmed;
  return group;
}

function addMember(group, name) {
  const trimmed = (name || '').trim();
  if (!trimmed) throw new ValidationError('成員姓名不可為空');
  if (group.members.some(m => m.name === trimmed)) {
    throw new ValidationError('已經有同名的成員了');
  }
  const member = { id: randomUUID(), name: trimmed };
  group.members.push(member);
  return member;
}

function removeMember(group, memberId) {
  const exists = group.members.some(m => m.id === memberId);
  if (!exists) throw new NotFoundError('找不到這個成員');
  const usedInExpense = group.expenses.some(
    e =>
      e.paidBy === memberId ||
      (e.paidShares && memberId in e.paidShares) ||
      e.participants.includes(memberId)
  );
  if (usedInExpense) {
    throw new ValidationError('這個成員已經有相關的支出紀錄，請先刪除或修改那些支出');
  }
  group.members = group.members.filter(m => m.id !== memberId);
  return group;
}

/**
 * 解析付款人：
 * - 若提供 paidShares（{ memberId: 金額 }）→ 多付款人模式，金額總和須等於 amount。
 * - 否則使用單一 paidBy，視為一人付全額。
 * 回傳 { paidBy, paidShares }（其中一個為 null）。
 */
function _resolvePayers(group, input) {
  const memberIds = new Set(group.members.map(m => m.id));
  const rawShares = input.paidShares;
  const hasShares =
    rawShares && typeof rawShares === 'object' && Object.keys(rawShares).length > 0;

  if (hasShares) {
    let sum = 0;
    const shares = {};
    for (const [pid, v] of Object.entries(rawShares)) {
      if (!memberIds.has(pid)) throw new ValidationError('付款人清單中含有不存在的成員');
      const num = Number(v);
      if (!isFinite(num) || num < 0) throw new ValidationError(`成員 ${pid} 的付款金額無效`);
      if (num > 0) {
        shares[pid] = Math.round(num * 100) / 100;
        sum += num;
      }
    }
    if (Object.keys(shares).length === 0) {
      throw new ValidationError('請至少一位付款人的金額大於 0');
    }
    if (Math.abs(sum - input.amount) > 0.02) {
      throw new ValidationError(
        `付款金額總和 (${sum.toFixed(2)}) 必須等於支出總額 (${Number(input.amount).toFixed(2)})`
      );
    }
    // 只有一位付款人時，退回單一 paidBy 形式，資料較乾淨
    const ids = Object.keys(shares);
    if (ids.length === 1) return { paidBy: ids[0], paidShares: null };
    return { paidBy: null, paidShares: shares };
  }

  if (!memberIds.has(input.paidBy)) {
    throw new ValidationError('付款人不存在於這個群組');
  }
  return { paidBy: input.paidBy, paidShares: null };
}

function _validateExpenseInput(group, input) {
  const { description, amount, splitType, participants, customShares } = input;

  if (!description || !description.trim()) {
    throw new ValidationError('請輸入支出項目名稱');
  }
  if (typeof amount !== 'number' || !isFinite(amount) || amount <= 0) {
    throw new ValidationError('金額必須是大於 0 的數字');
  }
  _resolvePayers(group, input); // 驗證付款人（單一或多人）
  if (!Array.isArray(participants) || participants.length === 0) {
    throw new ValidationError('請至少選擇一位分攤成員');
  }
  const memberIds = new Set(group.members.map(m => m.id));
  for (const pid of participants) {
    if (!memberIds.has(pid)) {
      throw new ValidationError('分攤成員清單中含有不存在的成員');
    }
  }
  if (splitType !== 'equal' && splitType !== 'custom') {
    throw new ValidationError("splitType 必須是 'equal' 或 'custom'");
  }
  if (splitType === 'custom') {
    if (!customShares || typeof customShares !== 'object') {
      throw new ValidationError('自訂分攤金額格式錯誤');
    }
    let sum = 0;
    for (const pid of participants) {
      const v = customShares[pid];
      if (typeof v !== 'number' || !isFinite(v) || v < 0) {
        throw new ValidationError(`成員 ${pid} 的自訂金額無效`);
      }
      sum += v;
    }
    if (Math.abs(sum - amount) > 0.02) {
      throw new ValidationError(
        `自訂分攤金額總和 (${sum.toFixed(2)}) 必須等於支出總額 (${amount.toFixed(2)})`
      );
    }
  }
}

function addExpense(group, input) {
  _validateExpenseInput(group, input);
  const payers = _resolvePayers(group, input);
  const expense = {
    id: randomUUID(),
    description: input.description.trim(),
    amount: Math.round(input.amount * 100) / 100,
    paidBy: payers.paidBy,
    paidShares: payers.paidShares || undefined,
    category: input.category || 'other',
    date: input.date || new Date().toISOString().slice(0, 10),
    splitType: input.splitType,
    participants: [...input.participants],
    customShares: input.splitType === 'custom' ? { ...input.customShares } : undefined,
    createdAt: new Date().toISOString(),
  };
  group.expenses.push(expense);
  return expense;
}

function updateExpense(group, expenseId, input) {
  const idx = group.expenses.findIndex(e => e.id === expenseId);
  if (idx === -1) throw new NotFoundError('找不到這筆支出');
  _validateExpenseInput(group, input);
  const payers = _resolvePayers(group, input);
  const prev = group.expenses[idx];
  const updated = {
    ...prev,
    description: input.description.trim(),
    amount: Math.round(input.amount * 100) / 100,
    paidBy: payers.paidBy,
    paidShares: payers.paidShares || undefined,
    category: input.category || 'other',
    date: input.date || prev.date,
    splitType: input.splitType,
    participants: [...input.participants],
    customShares: input.splitType === 'custom' ? { ...input.customShares } : undefined,
    updatedAt: new Date().toISOString(),
  };
  group.expenses[idx] = updated;
  return updated;
}

function deleteExpense(group, expenseId) {
  const exists = group.expenses.some(e => e.id === expenseId);
  if (!exists) throw new NotFoundError('找不到這筆支出');
  group.expenses = group.expenses.filter(e => e.id !== expenseId);
  return group;
}

/**
 * 計算每個成員的淨餘額。
 * 正數 = 別人欠他錢；負數 = 他欠別人錢。
 */
function computeBalances(group) {
  const balances = {};
  group.members.forEach(m => (balances[m.id] = 0));

  group.expenses.forEach(e => {
    // 記入付款：多付款人用 paidShares，否則單一 paidBy 付全額
    if (e.paidShares && typeof e.paidShares === 'object') {
      Object.entries(e.paidShares).forEach(([pid, amt]) => {
        if (pid in balances) balances[pid] += Number(amt) || 0;
      });
    } else if (e.paidBy in balances) {
      balances[e.paidBy] += e.amount;
    }

    const participants = e.participants.filter(pid => pid in balances);
    if (participants.length === 0) return;

    if (e.splitType === 'custom') {
      participants.forEach(pid => {
        balances[pid] -= e.customShares?.[pid] || 0;
      });
    } else {
      const share = e.amount / participants.length;
      participants.forEach(pid => {
        balances[pid] -= share;
      });
    }
  });

  Object.keys(balances).forEach(id => {
    balances[id] = Math.round(balances[id] * 100) / 100;
  });
  return balances;
}

/**
 * 把淨餘額簡化成最少的轉帳筆數（貪婪演算法：最大債主配最大債權人）。
 */
function simplifyDebts(balances) {
  const creditors = [];
  const debtors = [];
  Object.entries(balances).forEach(([id, bal]) => {
    if (bal > 0.005) creditors.push({ id, amt: bal });
    else if (bal < -0.005) debtors.push({ id, amt: -bal });
  });
  creditors.sort((a, b) => b.amt - a.amt);
  debtors.sort((a, b) => b.amt - a.amt);

  const transactions = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amt, creditors[j].amt);
    if (pay > 0.005) {
      transactions.push({
        from: debtors[i].id,
        to: creditors[j].id,
        amount: Math.round(pay * 100) / 100,
      });
    }
    debtors[i].amt -= pay;
    creditors[j].amt -= pay;
    if (debtors[i].amt < 0.005) i++;
    if (creditors[j].amt < 0.005) j++;
  }
  return transactions;
}

function getSettlement(group) {
  return simplifyDebts(computeBalances(group));
}

module.exports = {
  ValidationError,
  NotFoundError,
  createGroup,
  renameGroup,
  addMember,
  removeMember,
  addExpense,
  updateExpense,
  deleteExpense,
  computeBalances,
  simplifyDebts,
  getSettlement,
};
