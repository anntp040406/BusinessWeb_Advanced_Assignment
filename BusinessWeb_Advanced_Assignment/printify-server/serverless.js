const MongoStoreExport = require('connect-mongo');
const MongoStore = MongoStoreExport.default ?? MongoStoreExport;
const { connectDb } = require('./config/db');
const { buildApp } = require('./app');

/*
 * Chạy backend trên Vercel (serverless function) – dùng chung app.js với `npm run dev`.
 * printify-customer/api/index.js và printify-admin/api/index.js gọi hàm này.
 * Biến môi trường đặt trong Vercel > Project > Settings > Environment Variables (KHÔNG ghi vào code):
 *   MONGO_URI (chuỗi MongoDB Atlas), DB_NAME, SESSION_SECRET, NODE_ENV=production, CUSTOMER_ORIGIN, DEMO_MODE, GEMINI_API_KEY (tùy chọn)
 * Kết nối MongoDB và app được giữ lại giữa các lần gọi (Vercel dùng lại instance còn "ấm").
 */
let ready;

function init() {
  if (!process.env.MONGO_URI) throw new Error('Thiếu biến môi trường MONGO_URI trên Vercel');
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 24) throw new Error('Thiếu SESSION_SECRET (ít nhất 24 ký tự) trên Vercel');
  return connectDb().then(() =>
    buildApp({
      secret: process.env.SESSION_SECRET,
      secureCookie: process.env.NODE_ENV === 'production',
      makeStore: (collectionName) => MongoStore.create({ mongoUrl: process.env.MONGO_URI, dbName: process.env.DB_NAME || 'printify', collectionName }),
    }),
  );
}

module.exports = async function handler(req, res) {
  try {
    ready ||= init();
    const app = await ready;
    return app(req, res);
  } catch (error) {
    ready = undefined; // lần sau thử kết nối lại
    console.error('[PrintiFy API] không khởi động được:', error.message);
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ code: 'SERVER_NOT_READY', message: 'Máy chủ chưa sẵn sàng, vui lòng thử lại sau ít phút.' }));
  }
};
