'use strict';

const express = require('express');
const requireAuth = require('../requireAuth');
const db = require('../db');
const friendsStore = require('../friends/friends.store');
const friendsService = require('../friends/friends.service');

const router = express.Router();
router.use(express.json());
router.use(requireAuth);

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

function toClientPost(post, meEmail) {
  if (!post) return null;
  const likes = Array.isArray(post.likeEmails) ? post.likeEmails : [];
  const me = String(meEmail || '').toLowerCase();
  return {
    id: post.id,
    ts: post.ts,
    kind: post.kind || 'user',
    author: post.author || '',
    authorEmail: post.authorEmail || '',
    text: post.text || '',
    likeCount: likes.length,
    liked: likes.includes(me),
    mine: String(post.authorEmail || '').toLowerCase() === me,
    replies: Array.isArray(post.replies) ? post.replies : [],
  };
}

async function visibleAuthorEmails(meEmail) {
  const fdb = await friendsStore.readDb();
  friendsService.ensureProfile(fdb, meEmail);
  await friendsStore.writeDb(fdb);
  const friends = friendsService.listFriends(fdb, meEmail).map((f) => f.email);
  return [meEmail, ...friends];
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const authors = await visibleAuthorEmails(req.userEmail);
    const posts = await db.listFeedPostsByAuthors(authors, { limit: 80 });
    res.json({ posts: posts.map((p) => toClientPost(p, req.userEmail)) });
  })
);

router.post(
  '/posts',
  asyncHandler(async (req, res) => {
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: '請輸入內容' });
    if (text.length > 280) return res.status(400).json({ error: '內容太長' });
    const kind = ['user', 'achievement'].includes(req.body?.kind) ? req.body.kind : 'user';
    const author = String(req.body?.author || '').trim().slice(0, 40) || req.userEmail.split('@')[0];
    const post = await db.createFeedPost({
      id: String(Date.now()) + '_' + Math.random().toString(36).slice(2, 7),
      authorEmail: req.userEmail,
      author,
      kind,
      text,
      likeEmails: [],
      replies: [],
      ts: new Date().toISOString(),
    });
    res.status(201).json(toClientPost(post, req.userEmail));
  })
);

router.post(
  '/posts/:id/like',
  asyncHandler(async (req, res) => {
    const post = await db.getFeedPost(req.params.id);
    if (!post) return res.status(404).json({ error: '找不到這則動態' });
    const me = req.userEmail.toLowerCase();
    const likes = new Set((post.likeEmails || []).map((e) => String(e).toLowerCase()));
    if (likes.has(me)) likes.delete(me);
    else likes.add(me);
    post.likeEmails = [...likes];
    await db.saveFeedPost(post);
    res.json(toClientPost(post, req.userEmail));
  })
);

router.post(
  '/posts/:id/replies',
  asyncHandler(async (req, res) => {
    const text = String(req.body?.text || '').trim();
    if (!text) return res.status(400).json({ error: '請輸入回覆' });
    if (text.length > 140) return res.status(400).json({ error: '回覆太長' });
    const post = await db.getFeedPost(req.params.id);
    if (!post) return res.status(404).json({ error: '找不到這則動態' });
    const author = String(req.body?.author || '').trim().slice(0, 40) || req.userEmail.split('@')[0];
    post.replies = Array.isArray(post.replies) ? post.replies : [];
    post.replies.push({
      id: Date.now(),
      ts: new Date().toISOString(),
      author,
      authorEmail: req.userEmail,
      text,
    });
    await db.saveFeedPost(post);
    res.status(201).json(toClientPost(post, req.userEmail));
  })
);

router.delete(
  '/posts/:id',
  asyncHandler(async (req, res) => {
    const ok = await db.deleteFeedPost(req.params.id, req.userEmail);
    if (!ok) return res.status(404).json({ error: '找不到這則動態，或無權刪除' });
    res.json({ ok: true });
  })
);

router.use((err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  if (statusCode === 500) console.error('[feed]', err);
  res.status(statusCode).json({ error: err.message || '伺服器發生錯誤' });
});

module.exports = router;
