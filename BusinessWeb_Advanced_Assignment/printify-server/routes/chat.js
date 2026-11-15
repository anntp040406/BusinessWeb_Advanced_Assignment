const express = require('express');
const { getDb } = require('../config/db');
const { requireCustomer } = require('../middlewares/require-customer');
const { requireAdmin } = require('../middlewares/require-admin');
const { handle, ApiError, newId } = require('../utils/shop-common');

/*
 * Chat chăm sóc khách hàng (CSKH) – mỗi khách 1 cuộc trò chuyện (chatThreads._id = userId).
 *
 * Khách (phiên pf.sid):
 *   GET  /api/chat                -> { thread }        cuộc trò chuyện của mình (tạo lời chào nếu chưa có)
 *   POST /api/chat/messages {text}-> { thread }        gửi tin
 *   POST /api/chat/read           -> { ok }            đã đọc tin của nhân viên
 * Nhân viên (phiên pf.admin.sid, STAFF/SUPERADMIN):
 *   GET  /api/admin/chat                    -> { threads }   danh sách, mới nhất trước (không kèm tin nhắn)
 *   GET  /api/admin/chat/:userId            -> { thread }
 *   POST /api/admin/chat/:userId/messages   -> { thread }
 *   POST /api/admin/chat/:userId/read       -> { ok }
 */
const col = () => getDb().collection('chatThreads');
const MAX_LEN = 1000;
const GREETING = 'Xin chào! PrintiFy có thể giúp gì cho bạn? Bạn có thể hỏi về sản phẩm, thiết kế, đơn hàng hay thanh toán nhé.';

function cleanText(raw) {
  const text = String(raw ?? '').replace(/\s+\n/g, '\n').trim();
  if (!text) throw new ApiError(400, 'EMPTY_MESSAGE', 'Tin nhắn không được để trống.');
  if (text.length > MAX_LEN) throw new ApiError(400, 'MESSAGE_TOO_LONG', `Tin nhắn tối đa ${MAX_LEN} ký tự.`);
  return text;
}

function msg(from, text, author) {
  return { _id: newId('msg'), from, text, author: author || null, at: new Date().toISOString() };
}

/** Bản tóm tắt cho danh sách (không gửi toàn bộ tin nhắn) */
function summary(t) {
  const last = t.messages[t.messages.length - 1];
  return {
    _id: t._id,
    userId: t.userId,
    userName: t.userName,
    userEmail: t.userEmail,
    unreadByStaff: t.unreadByStaff || 0,
    unreadByCustomer: t.unreadByCustomer || 0,
    lastMessage: last ? { from: last.from, text: last.text.slice(0, 140), at: last.at } : null,
    updatedAt: t.updatedAt,
  };
}

async function ensureThread(userId) {
  let t = await col().findOne({ _id: userId });
  if (t) return t;
  const user = await getDb().collection('users').findOne({ _id: userId }, { projection: { name: 1, email: 1 } });
  const now = new Date().toISOString();
  t = {
    _id: userId,
    userId,
    userName: user?.name || 'Khách hàng',
    userEmail: user?.email || '',
    messages: [msg('STAFF', GREETING, 'PrintiFy')],
    unreadByStaff: 0,
    unreadByCustomer: 0,
    createdAt: now,
    updatedAt: now,
  };
  await col().insertOne(t);
  return t;
}

// ---------------- Khách ----------------
const customer = express.Router();
customer.use(requireCustomer);

customer.get('/', handle(async (req, res) => {
  res.json({ thread: await ensureThread(req.userId) });
}));

customer.post('/messages', handle(async (req, res) => {
  const text = cleanText(req.body?.text);
  await ensureThread(req.userId);
  const m = msg('CUSTOMER', text);
  await col().updateOne({ _id: req.userId }, { $push: { messages: { $each: [m], $slice: -300 } }, $inc: { unreadByStaff: 1 }, $set: { updatedAt: m.at } });
  res.status(201).json({ thread: await col().findOne({ _id: req.userId }) });
}));

customer.post('/read', handle(async (req, res) => {
  await col().updateOne({ _id: req.userId }, { $set: { unreadByCustomer: 0 } });
  res.json({ ok: true });
}));

// ---------------- Nhân viên ----------------
const admin = express.Router();
admin.use(requireAdmin());

admin.get('/', handle(async (_req, res) => {
  const list = await col().find({}).sort({ updatedAt: -1 }).limit(200).toArray();
  res.json({ threads: list.map(summary) });
}));

admin.get('/:userId', handle(async (req, res) => {
  const t = await col().findOne({ _id: String(req.params.userId) });
  if (!t) throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy cuộc trò chuyện.');
  res.json({ thread: t });
}));

admin.post('/:userId/messages', handle(async (req, res) => {
  const id = String(req.params.userId);
  const text = cleanText(req.body?.text);
  const t = await col().findOne({ _id: id }, { projection: { _id: 1 } });
  if (!t) throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy cuộc trò chuyện.');
  const m = msg('STAFF', text, req.admin.name);
  await col().updateOne({ _id: id }, { $push: { messages: { $each: [m], $slice: -300 } }, $inc: { unreadByCustomer: 1 }, $set: { updatedAt: m.at, unreadByStaff: 0 } });
  res.status(201).json({ thread: await col().findOne({ _id: id }) });
}));

admin.post('/:userId/read', handle(async (req, res) => {
  await col().updateOne({ _id: String(req.params.userId) }, { $set: { unreadByStaff: 0 } });
  res.json({ ok: true });
}));

module.exports = { customerChat: customer, adminChat: admin };
