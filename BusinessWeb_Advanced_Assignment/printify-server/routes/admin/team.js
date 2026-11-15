const express = require('express');
const { getDb } = require('../../config/db');
const { requireAdmin } = require('../../middlewares/require-admin');
const { handle, ApiError, newId, audit } = require('../../utils/shop-common');
const { hashPassword } = require('../../utils/password');

/*
 * Quản lý đội ngũ quản trị – CHỈ SUPERADMIN.
 *   GET   /api/admin/team                      -> { members }  (kèm số thao tác, lần đăng nhập/thao tác gần nhất)
 *   POST  /api/admin/team { name,email,admin_code,role,password } -> { member }   thêm nhân viên
 *   PATCH /api/admin/team/:id { name?, admin_code?, role?, status? } -> { member }  sửa / đổi vai trò / khóa – mở khóa
 *   POST  /api/admin/team/:id/password { password } -> { message }              đặt lại mật khẩu
 * Luật: không tự hạ quyền / tự khóa chính mình; luôn còn ít nhất 1 SUPERADMIN đang hoạt động.
 */
const router = express.Router();
router.use(requireAdmin('SUPERADMIN'));

const users = () => getDb().collection('users');
const ROLES = ['STAFF', 'SUPERADMIN'];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const pub = (u) => ({
  _id: u._id, name: u.name, email: u.email, role: u.role, admin_code: u.admin_code ?? null,
  status: u.status, lastLoginAt: u.lastLoginAt ?? null, createdAt: u.createdAt ?? null,
});

async function activeSuperadmins(exceptId) {
  return users().countDocuments({ role: 'SUPERADMIN', status: 'ACTIVE', _id: { $ne: exceptId } });
}

router.get('/', handle(async (_req, res) => {
  const list = await users().find({ role: { $in: ROLES } }).sort({ role: -1, name: 1 }).toArray();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const logs = await getDb().collection('auditLogs').find({ actorId: { $in: list.map((u) => u._id) } }).toArray();
  // Đơn đã xử lý (có bước trong timeline do người này làm) trong 30 ngày
  const orders = await getDb().collection('orders').find({ 'timeline.actorId': { $in: list.map((u) => u._id) } }, { projection: { timeline: 1 } }).toArray();
  const members = list.map((u) => {
    const mine = logs.filter((l) => l.actorId === u._id);
    const steps = orders.flatMap((o) => o.timeline.filter((t) => t.actorId === u._id));
    const lastAction = [...mine.map((l) => l.at), ...steps.map((t) => t.occurredAt)].sort().pop() ?? null;
    return {
      ...pub(u),
      actions: mine.length,
      ordersHandled30d: orders.filter((o) => o.timeline.some((t) => t.actorId === u._id && t.occurredAt >= since)).length,
      lastActionAt: lastAction,
    };
  });
  res.json({ members });
}));

router.post('/', handle(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const adminCode = String(req.body?.admin_code || '').trim();
  const role = ROLES.includes(req.body?.role) ? req.body.role : 'STAFF';
  const password = String(req.body?.password || '');
  const errors = {};
  if (name.length < 2 || name.length > 100) errors.name = 'Họ tên 2–100 ký tự.';
  if (!EMAIL.test(email)) errors.email = 'Email chưa hợp lệ.';
  if (password.length < 6) errors.password = 'Mật khẩu ít nhất 6 ký tự.';
  if (Object.keys(errors).length) throw new ApiError(400, 'VALIDATION_ERROR', Object.values(errors)[0], errors);
  if (await users().findOne({ email })) throw new ApiError(409, 'EMAIL_EXISTS', 'Email này đã có tài khoản.');
  const u = {
    _id: newId('usr'), name, email, role, admin_code: adminCode || null, status: 'ACTIVE',
    passwordHash: hashPassword(password), failedLogins: 0, lockedUntil: null, createdAt: new Date().toISOString(),
  };
  await users().insertOne(u);
  await audit(req.admin._id, 'TEAM_ADD', 'user', u._id, `${role} ${email}`);
  res.status(201).json({ member: { ...pub(u), actions: 0, ordersHandled30d: 0, lastActionAt: null }, message: `Đã thêm ${name} vào đội ngũ.` });
}));

router.patch('/:id', handle(async (req, res) => {
  const id = String(req.params.id);
  const u = await users().findOne({ _id: id, role: { $in: ROLES } });
  if (!u) throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy thành viên.');
  const set = {};
  const notes = [];
  if (req.body?.name !== undefined) {
    const name = String(req.body.name).trim();
    if (name.length < 2 || name.length > 100) throw new ApiError(400, 'VALIDATION_ERROR', 'Họ tên 2–100 ký tự.');
    set.name = name;
  }
  if (req.body?.admin_code !== undefined) set.admin_code = String(req.body.admin_code).trim() || null;
  if (req.body?.role !== undefined && req.body.role !== u.role) {
    if (!ROLES.includes(req.body.role)) throw new ApiError(400, 'VALIDATION_ERROR', 'Vai trò không hợp lệ.');
    if (id === req.admin._id) throw new ApiError(409, 'SELF_CHANGE', 'Bạn không thể tự đổi vai trò của chính mình.');
    if (u.role === 'SUPERADMIN' && !(await activeSuperadmins(id))) throw new ApiError(409, 'LAST_SUPERADMIN', 'Phải còn ít nhất 1 SUPERADMIN.');
    set.role = req.body.role;
    notes.push(`role ${u.role}->${req.body.role}`);
  }
  if (req.body?.status !== undefined && req.body.status !== u.status) {
    if (!['ACTIVE', 'LOCKED'].includes(req.body.status)) throw new ApiError(400, 'VALIDATION_ERROR', 'Trạng thái không hợp lệ.');
    if (id === req.admin._id) throw new ApiError(409, 'SELF_CHANGE', 'Bạn không thể tự khóa tài khoản của mình.');
    if (req.body.status === 'LOCKED' && u.role === 'SUPERADMIN' && !(await activeSuperadmins(id))) throw new ApiError(409, 'LAST_SUPERADMIN', 'Phải còn ít nhất 1 SUPERADMIN đang hoạt động.');
    set.status = req.body.status;
    notes.push(`status ${u.status}->${req.body.status}`);
  }
  if (!Object.keys(set).length) return res.json({ member: pub(u), message: 'Không có gì thay đổi.' });
  await users().updateOne({ _id: id }, { $set: set });
  // Bị khóa -> đăng xuất mọi phiên quản trị của người đó
  if (set.status === 'LOCKED') await getDb().collection('adminSessions').deleteMany({ session: { $regex: `"adminId":"${id}"` } }).catch(() => null);
  await audit(req.admin._id, set.status === 'LOCKED' ? 'TEAM_LOCK' : set.status === 'ACTIVE' ? 'TEAM_UNLOCK' : set.role ? 'TEAM_ROLE' : 'TEAM_EDIT', 'user', id, notes.join(', '));
  const msg = set.status === 'LOCKED' ? `Đã khóa tài khoản ${u.name}.` : set.status === 'ACTIVE' ? `Đã mở khóa ${u.name}.` : set.role ? `Đã đổi ${u.name} thành ${set.role}.` : 'Đã lưu thay đổi.';
  res.json({ member: pub({ ...u, ...set }), message: msg });
}));

router.post('/:id/password', handle(async (req, res) => {
  const id = String(req.params.id);
  const password = String(req.body?.password || '');
  if (password.length < 6) throw new ApiError(400, 'VALIDATION_ERROR', 'Mật khẩu ít nhất 6 ký tự.');
  const u = await users().findOne({ _id: id, role: { $in: ROLES } });
  if (!u) throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy thành viên.');
  await users().updateOne({ _id: id }, { $set: { passwordHash: hashPassword(password), failedLogins: 0, lockedUntil: null } });
  await audit(req.admin._id, 'TEAM_RESET_PASSWORD', 'user', id, '');
  res.json({ message: `Đã đặt lại mật khẩu cho ${u.name}.` });
}));

module.exports = router;
