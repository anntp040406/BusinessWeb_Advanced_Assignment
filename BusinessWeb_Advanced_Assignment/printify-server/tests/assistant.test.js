/**
 * NV09 Trợ lý AI/FAQ (/api/assistant): trả lời từ FAQ (không cần khóa Gemini), lọc đầu vào, giới hạn tần suất, ghi chatLogs.
 * Chạy bằng DB giả lập giống api.test.js.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFakeDb } = require('./helpers/fake-db');

const fake = createFakeDb();
require('../config/db').getDb = () => fake;
const { seed } = require('../scripts/seed');
const { buildApp } = require('../app');

let server;
let base;
test.before(async () => {
  delete process.env.GEMINI_API_KEY; // luôn test đường FAQ, không gọi mạng
  await seed({ reset: true, log: () => {} });
  server = buildApp({ secret: 'test-secret-that-is-long-enough-123456' }).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

function client() {
  let cookie = '';
  return async (method, path, body) => {
    const r = await fetch(base + path, { method, headers: { 'content-type': 'application/json', ...(cookie && { cookie }) }, body: body && JSON.stringify(body) });
    const set = r.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    return { status: r.status, body: r.status === 204 ? null : await r.json() };
  };
}

test('trả lời đúng FAQ theo câu hỏi tự nhiên, có số liệu cấu hình thật và link nội bộ', async () => {
  const c = client();
  const cases = [
    ['Thanh toan bang momo duoc khong?', 'faq_1'],
    ['phí ship bao nhiêu vậy shop', 'faq_3'],
    ['mình muốn hủy đơn', 'faq_5'],
    ['làm sao để bán thiết kế của mình', 'faq_12'],
    ['hạng vàng được giảm mấy %', 'faq_15'],
    ['in lại mẫu có mất phí không', 'faq_9'],
    ['size áo chọn sao cho vừa', 'faq_11'],
    ['thanh toan the nao', 'faq_1'],
  ];
  for (const [q, id] of cases) {
    const r = await c('POST', '/api/assistant', { message: q });
    assert.equal(r.status, 200, q);
    assert.equal(r.body.source, 'faq', q);
    const log = (await fake.collection('chatLogs').find({ question: q }).toArray())[0];
    assert.equal(log.matchedFaqIds[0], id, `"${q}" phải khớp ${id}`);
    for (const l of r.body.links) assert.ok(l.url.startsWith('/') && !l.url.startsWith('//'));
  }
  const ship = await c('POST', '/api/assistant', { message: 'phí giao hàng' });
  assert.match(ship.body.answer, /20\.000đ/);
  assert.doesNotMatch(ship.body.answer, /\{shippingFee\}/);
});

test('hỏi tên sản phẩm -> trả giá từ database; hỏi lạc đề -> câu trả lời dự phòng', async () => {
  const c = client();
  const p = await c('POST', '/api/assistant', { message: 'áo hoodie giá nhiêu' });
  assert.equal(p.status, 200);
  assert.ok(p.body.links.some((l) => l.url.startsWith('/products/')), 'có link tới sản phẩm');
  assert.equal(p.body.source, 'product');
  assert.match(p.body.answer, /Hoodie.*350\.000đ/i);
  const off = await c('POST', '/api/assistant', { message: 'thời tiết hôm nay thế nào' });
  assert.equal(off.body.source, 'fallback');
  assert.equal(off.body.handoff, true, 'không trả lời được -> gợi ý gặp tư vấn viên');
  // "có" không được khớp nhầm từ khóa "cỡ" của câu hỏi về size
  const len = await c('POST', '/api/assistant', { message: 'Shop có bán áo len không?' });
  assert.equal(len.body.source, 'fallback');
});

test('lọc đầu vào và giới hạn 10 tin / phút / phiên', async () => {
  const c = client();
  assert.equal((await c('POST', '/api/assistant', { message: '   ' })).status, 400);
  const long = await c('POST', '/api/assistant', { message: 'thanh toán ' + 'x'.repeat(2000) + '\u0000' });
  assert.equal(long.status, 200);
  const saved = (await fake.collection('chatLogs').find({}).toArray()).find((l) => l.question.startsWith('thanh toán x'));
  assert.ok(saved.question.length <= 500 && !saved.question.includes('\u0000'));
  let last;
  for (let i = 0; i < 10; i++) last = await c('POST', '/api/assistant', { message: 'phí ship' });
  assert.equal(last.status, 429);
  assert.equal(last.body.code, 'CHAT_RATE_LIMIT');
});

test('câu hỏi gợi ý lấy từ FAQ đang bật', async () => {
  const r = await client()('GET', '/api/assistant/starters');
  assert.equal(r.status, 200);
  assert.ok(r.body.items.length >= 4);
  assert.equal(r.body.ai, false);
});

test('Chat CSKH (Trân Phạm): khách nhắn -> nhân viên thấy chưa đọc, trả lời -> khách thấy; khách vãng lai phải đăng nhập', async () => {
  const guest = client();
  assert.equal((await guest('GET', '/api/chat')).status, 401);
  // khách vãng lai vẫn dùng được trợ lý AI
  assert.equal((await guest('POST', '/api/assistant', { message: 'phí ship' })).status, 200);

  const kh = client();
  assert.equal((await kh('POST', '/api/auth/login', { email: 'ha.pham@printify.demo', password: 'Printify@123' })).status, 200);
  const first = await kh('GET', '/api/chat');
  assert.equal(first.body.thread.messages.length, 1, 'có lời chào');
  assert.equal((await kh('POST', '/api/chat/messages', { text: '   ' })).status, 400);
  const sent = await kh('POST', '/api/chat/messages', { text: 'Đơn của mình bao giờ giao?' });
  assert.equal(sent.status, 201);

  const nv = client();
  assert.equal((await nv('POST', '/api/admin/auth/login', { email: 'anntpk24411e@st.uel.edu.vn', password: 'Admin@123' })).status, 200);
  const list = await nv('GET', '/api/admin/chat');
  const t = list.body.threads.find((x) => x.userId === 'usr_c4');
  assert.equal(t.unreadByStaff, 1);
  assert.equal((await nv('POST', '/api/admin/chat/usr_c4/messages', { text: 'Đơn đang in, mai giao bạn nhé.' })).status, 201);

  const after = await kh('GET', '/api/chat');
  assert.equal(after.body.thread.unreadByCustomer, 1);
  assert.equal(after.body.thread.messages.at(-1).from, 'STAFF');
  await kh('POST', '/api/chat/read');
  assert.equal((await kh('GET', '/api/chat')).body.thread.unreadByCustomer, 0);
  // khách không gọi được API của nhân viên
  assert.equal((await kh('GET', '/api/admin/chat')).status, 401);
});
