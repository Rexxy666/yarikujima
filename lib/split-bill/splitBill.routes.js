'use strict';

/**
 * splitBill.routes.js — 分帳 API
 *   app.use('/api/split-bill', require('./lib/split-bill/splitBill.routes'));
 *
 * 存取模型（向後相容 + 好友共享）：
 * - 「軟性登入」：有帶有效 JWT 就記下 req.userEmail，沒有也放行（訪客仍可用單機分帳）。
 * - group 若沒有 sharedWith（舊群組/訪客建立）→ 開放存取。
 * - group 有 sharedWith → 只有名單內的帳號能讀寫，其他人 403。
 * - 邀好友（/share）只接受「已是好友」的對象。
 */

const express = require('express');
const service = require('./splitBill.service');
const store = require('./splitBill.store');
const { verifyAppJwt, bearerFromReq } = require('../auth');
const friendsStore = require('../friends/friends.store');
const friendsService = require('../friends/friends.service');

const router = express.Router();
router.use(express.json());

// 軟性登入
router.use((req, _res, next) => {
  const t = bearerFromReq(req);
  if (t) {
    try {
      const p = verifyAppJwt(t);
      if (p && p.email) req.userEmail = String(p.email).trim().toLowerCase();
    } catch { /* 無效 token 當訪客 */ }
  }
  next();
});

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}
function badRequest(msg) { return new service.ValidationError(msg); }
function forbidden(msg) { const e = new Error(msg || '沒有存取權'); e.statusCode = 403; return e; }

function canAccess(group, email) {
  if (!group || !Array.isArray(group.sharedWith) || group.sharedWith.length === 0) return true;
  return !!email && group.sharedWith.includes(email);
}
async function loadGroupOr404(groupId) {
  const group = await store.getGroup(groupId);
  if (!group) throw new service.NotFoundError('找不到這個行程群組');
  return group;
}
async function loadAccessible(req) {
  const group = await loadGroupOr404(req.params.groupId);
  if (!canAccess(group, req.userEmail)) throw forbidden('你沒有這個分帳群組的存取權');
  return group;
}

/* ---------------- Groups ---------------- */
router.post('/groups', asyncHandler(async (req, res) => {
  const group = service.createGroup(req.body.name);
  if (req.userEmail) {
    group.ownerEmail = req.userEmail;
    group.sharedWith = [req.userEmail];
  }
  await store.saveGroup(group);
  res.status(201).json(group);
}));

// 只列出「我有權存取」的群組（無擁有者的舊群組也算）
router.get('/groups', asyncHandler(async (req, res) => {
  const all = await store.listGroups();
  const email = req.userEmail;
  res.json(all.filter(g => !g.sharedWith || g.sharedWith.length === 0 || (email && g.sharedWith.includes(email))));
}));

router.get('/groups/:groupId', asyncHandler(async (req, res) => {
  res.json(await loadAccessible(req));
}));

router.patch('/groups/:groupId', asyncHandler(async (req, res) => {
  const group = await loadAccessible(req);
  service.renameGroup(group, req.body.name);
  await store.saveGroup(group);
  res.json(group);
}));

router.delete('/groups/:groupId', asyncHandler(async (req, res) => {
  const group = await loadAccessible(req);
  if (group.ownerEmail && req.userEmail !== group.ownerEmail) {
    throw forbidden('只有建立者能刪除這個分帳主題');
  }
  await store.deleteGroup(req.params.groupId);
  res.status(204).end();
}));

// 邀好友共用（{ friendCode } 或 { email }，須為好友）
router.post('/groups/:groupId/share', asyncHandler(async (req, res) => {
  if (!req.userEmail) return res.status(401).json({ error: '請先登入才能邀好友共用' });
  const group = await loadAccessible(req);
  const fdb = await friendsStore.readDb();
  let target = null;
  if (req.body.friendCode) {
    const u = friendsService.findByCode(fdb, req.body.friendCode);
    target = u ? u.email : null;
  } else if (req.body.email) {
    target = String(req.body.email).trim().toLowerCase();
  }
  if (!target) throw badRequest('找不到該好友');
  if (target === req.userEmail) throw badRequest('不用邀請自己');
  const myFriends = friendsService.listFriends(fdb, req.userEmail).map(f => f.email);
  if (!myFriends.includes(target)) throw badRequest('對方還不是你的好友，請先到好友頁互加');
  if (!group.ownerEmail) group.ownerEmail = req.userEmail;
  if (!Array.isArray(group.sharedWith) || group.sharedWith.length === 0) group.sharedWith = [group.ownerEmail];
  if (!group.sharedWith.includes(target)) group.sharedWith.push(target);
  await store.saveGroup(group);
  res.json({ ok: true, sharedWith: group.sharedWith });
}));

/* ---------------- Members ---------------- */
router.post('/groups/:groupId/members', asyncHandler(async (req, res) => {
  const group = await loadAccessible(req);
  const member = service.addMember(group, req.body.name);
  await store.saveGroup(group);
  res.status(201).json(member);
}));

router.delete('/groups/:groupId/members/:memberId', asyncHandler(async (req, res) => {
  const group = await loadAccessible(req);
  service.removeMember(group, req.params.memberId);
  if (group.memberLinks) delete group.memberLinks[req.params.memberId];
  await store.saveGroup(group);
  res.status(204).end();
}));

// 把成員綁到某帳號（{ email } 或 null 解除），email 須在共用名單內
router.post('/groups/:groupId/members/:memberId/link', asyncHandler(async (req, res) => {
  if (!req.userEmail) return res.status(401).json({ error: '請先登入' });
  const group = await loadAccessible(req);
  if (!group.members.some(m => m.id === req.params.memberId)) throw new service.NotFoundError('找不到成員');
  const email = req.body.email ? String(req.body.email).trim().toLowerCase() : null;
  if (email && (!Array.isArray(group.sharedWith) || !group.sharedWith.includes(email))) {
    throw badRequest('只能綁定已共用此群組的好友');
  }
  if (!group.memberLinks) group.memberLinks = {};
  if (email) group.memberLinks[req.params.memberId] = email;
  else delete group.memberLinks[req.params.memberId];
  await store.saveGroup(group);
  res.json({ ok: true, memberLinks: group.memberLinks });
}));

/* ---------------- Expenses ---------------- */
router.post('/groups/:groupId/expenses', asyncHandler(async (req, res) => {
  const group = await loadAccessible(req);
  const expense = service.addExpense(group, req.body);
  await store.saveGroup(group);
  res.status(201).json(expense);
}));

router.patch('/groups/:groupId/expenses/:expenseId', asyncHandler(async (req, res) => {
  const group = await loadAccessible(req);
  const expense = service.updateExpense(group, req.params.expenseId, req.body);
  await store.saveGroup(group);
  res.json(expense);
}));

router.delete('/groups/:groupId/expenses/:expenseId', asyncHandler(async (req, res) => {
  const group = await loadAccessible(req);
  service.deleteExpense(group, req.params.expenseId);
  await store.saveGroup(group);
  res.status(204).end();
}));

/* ---------------- Computed ---------------- */
router.get('/groups/:groupId/balances', asyncHandler(async (req, res) => {
  res.json(service.computeBalances(await loadAccessible(req)));
}));
router.get('/groups/:groupId/settlement', asyncHandler(async (req, res) => {
  res.json(service.getSettlement(await loadAccessible(req)));
}));

/* ---------------- Error handler ---------------- */
router.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  if (statusCode === 500) console.error('[split-bill]', err);
  res.status(statusCode).json({ error: err.message || '伺服器發生錯誤' });
});

module.exports = router;
