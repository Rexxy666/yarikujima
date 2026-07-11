'use strict';

/**
 * friends.routes.js — 好友系統 API（全部需登入）
 *   app.use('/api/friends', require('./lib/friends/friends.routes'));
 */

const express = require('express');
const requireAuth = require('../requireAuth');
const service = require('./friends.service');
const store = require('./friends.store');

const router = express.Router();
router.use(express.json());
router.use(requireAuth); // 以下全部需要有效 JWT

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// 取得（或建立）我的公開檔 + 好友碼
router.get(
  '/me',
  asyncHandler(async (req, res) => {
    const db = await store.readDb();
    const me = service.ensureProfile(db, req.userEmail);
    await store.writeDb(db);
    res.json(service.publicProfile(me));
  })
);

// 更新我的暱稱／生肖（前端登入後帶寵物名同步）
router.patch(
  '/me',
  asyncHandler(async (req, res) => {
    const db = await store.readDb();
    const me = service.ensureProfile(db, req.userEmail, {
      displayName: req.body.displayName,
      petAnimal: req.body.petAnimal,
    });
    await store.writeDb(db);
    res.json(service.publicProfile(me));
  })
);

// 好友清單
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const db = await store.readDb();
    service.ensureProfile(db, req.userEmail);
    await store.writeDb(db);
    res.json(service.listFriends(db, req.userEmail));
  })
);

// 待回應（收到的）＋ 我送出的邀請
router.get(
  '/requests',
  asyncHandler(async (req, res) => {
    const db = await store.readDb();
    res.json({
      incoming: service.incomingRequests(db, req.userEmail),
      outgoing: service.outgoingRequests(db, req.userEmail),
    });
  })
);

// 送出邀請（{ friendCode } 或 { email }）
router.post(
  '/requests',
  asyncHandler(async (req, res) => {
    const db = await store.readDb();
    const result = service.sendRequest(db, req.userEmail, {
      friendCode: req.body.friendCode,
      email: req.body.email,
    });
    await store.writeDb(db);
    res.status(201).json({ autoAccepted: result.autoAccepted });
  })
);

router.post(
  '/requests/:id/accept',
  asyncHandler(async (req, res) => {
    const db = await store.readDb();
    service.respondRequest(db, req.userEmail, req.params.id, true);
    await store.writeDb(db);
    res.json({ ok: true });
  })
);

router.post(
  '/requests/:id/decline',
  asyncHandler(async (req, res) => {
    const db = await store.readDb();
    service.respondRequest(db, req.userEmail, req.params.id, false);
    await store.writeDb(db);
    res.json({ ok: true });
  })
);

// 移除好友
router.delete(
  '/:email',
  asyncHandler(async (req, res) => {
    const db = await store.readDb();
    service.removeFriend(db, req.userEmail, req.params.email);
    await store.writeDb(db);
    res.status(204).end();
  })
);

router.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  if (statusCode === 500) console.error('[friends]', err);
  res.status(statusCode).json({ error: err.message || '伺服器發生錯誤' });
});

module.exports = router;
