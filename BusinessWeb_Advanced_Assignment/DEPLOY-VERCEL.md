# Đưa PrintiFy lên mạng (Vercel + MongoDB Atlas)

Kết quả: 2 link chạy 24/7, không cần mở máy:

| Web | Link (ví dụ, tên tự chọn) | Root Directory trên Vercel |
|---|---|---|
| Khách hàng | `https://printify.vercel.app` | `BusinessWeb_Advanced_Assignment/printify-customer` |
| Admin | `https://printify-admin.vercel.app` | `BusinessWeb_Advanced_Assignment/printify-admin` |

Mỗi web tự chạy backend Express (`printify-server`) dưới dạng serverless function ở đường dẫn `/api` (file `api/index.js` + `vercel.json` trong từng thư mục). Cả 2 dùng chung 1 database MongoDB Atlas.

> Không bao giờ ghi mật khẩu Atlas / SESSION_SECRET / khóa Gemini vào code hay file `.env` trên GitHub. Chỉ nhập trong trang Settings của Vercel.

---

## Bước 1 – Tạo database MongoDB Atlas (miễn phí)

1. Vào https://www.mongodb.com/cloud/atlas/register, đăng ký (có thể dùng Google).
2. **Create a cluster** → chọn gói **M0 Free**, vùng gần Việt Nam (Singapore / Hong Kong) → Create.
3. **Database Access** → Add New Database User → đặt username + mật khẩu (bấm Autogenerate, chép lại, không có ký tự đặc biệt càng đỡ lỗi) → quyền **Read and write to any database**.
4. **Network Access** → Add IP Address → **Allow access from anywhere** (`0.0.0.0/0`). Vercel không có IP cố định nên phải mở như vậy; bảo vệ bằng mật khẩu user ở bước 3.
5. **Database** → Connect → Drivers → chép chuỗi dạng
   `mongodb+srv://<user>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`
   thay `<password>` bằng mật khẩu thật. Đây là **MONGO_URI** (giữ kín).

## Bước 2 – Nạp dữ liệu mẫu lên Atlas (chạy trên máy mình, 1 lần)

Trong PowerShell, thư mục `printify-server`:

```powershell
$env:MONGO_URI="mongodb+srv://...chuỗi ở bước 1..."
npm run seed
```

Thấy `Database "printify": 13 tài khoản, 42 sản phẩm...` là xong. Đóng terminal đó (biến `$env:MONGO_URI` mất theo, `npm run dev` vẫn dùng MongoDB trên máy như cũ).

## Bước 3 – Tạo web Khách hàng trên Vercel

Repo thuộc tài khoản GitHub của nhóm trưởng, nên **nhóm trưởng** làm bước này (hoặc thêm Vercel cho repo), hoặc mình **Fork** repo về tài khoản của mình rồi làm trên bản fork.

1. Vào https://vercel.com → Sign up bằng GitHub.
2. **Add New → Project** → chọn repo `BusinessWeb_Advanced_Assignment` → Import.
3. **Project Name**: `printify` (tên này thành link `printify.vercel.app`; nếu bị trùng thì đổi `printify-shop`, `printify-uel`...).
4. **Root Directory**: bấm Edit → chọn `BusinessWeb_Advanced_Assignment/printify-customer`.
5. Framework: Angular (tự nhận). Build/Output để mặc định – đã khai báo trong `vercel.json`.
6. Mở **Environment Variables**, thêm:

   | Name | Value |
   |---|---|
   | `MONGO_URI` | chuỗi Atlas ở bước 1 |
   | `DB_NAME` | `printify` |
   | `SESSION_SECRET` | chuỗi ngẫu nhiên dài ≥ 32 ký tự (gõ bừa chữ + số, ví dụ 2 câu dài nối nhau) |
   | `NODE_ENV` | `production` |
   | `CUSTOMER_ORIGIN` | `https://printify.vercel.app` (đúng link web khách) |
   | `DEMO_MODE` | `true` khi demo cho thầy cô (hiện mã OTP trên màn hình, có trang đăng nhập nhanh). Để `false` khi đã có gửi email thật |
   | `GEMINI_API_KEY` | (không bắt buộc) khóa Google AI Studio cho trợ lý AI |

7. **Deploy**. Xong vào link → thử đăng nhập `ha.pham@printify.demo` / `Printify@123`.

8. **Settings → Git → Production Branch**: đặt nhánh muốn chạy (vd `main` sau khi nhóm gộp, hoặc `phuongan`). Mỗi lần push lên nhánh đó Vercel tự cập nhật.

## Bước 4 – Tạo web Admin

Làm lại bước 3 với:
- Project Name: `printify-admin`
- Root Directory: `BusinessWeb_Advanced_Assignment/printify-admin`
- Environment Variables: **giống hệt** bước 3 (cùng `MONGO_URI`, `SESSION_SECRET`...).

Đăng nhập admin: `trannnbk24411e@st.uel.edu.vn` / `Admin@123`.

## Lỗi thường gặp

| Hiện tượng | Cách sửa |
|---|---|
| Mọi thao tác báo "Máy chủ chưa sẵn sàng" | Thiếu / sai `MONGO_URI` hoặc `SESSION_SECRET` (≥ 24 ký tự); Atlas chưa mở `0.0.0.0/0`. Xem Vercel → Project → Logs |
| Đăng nhập xong vẫn như chưa đăng nhập | Thiếu `NODE_ENV=production` hoặc đang mở bằng `http://` thay vì `https://` |
| Gửi khảo sát báo lỗi 403 | `CUSTOMER_ORIGIN` phải đúng link web khách (có `https://`, không có `/` cuối) |
| Build lỗi "could not determine executable to run" (ng) | `NODE_ENV=production` làm npm bỏ công cụ build – installCommand trong `vercel.json` phải có `--include=dev` |
| Lưu thiết kế có ảnh rất lớn bị lỗi | Vercel giới hạn mỗi request ~4,5MB – dùng ảnh nhỏ hơn |
| Đổi biến môi trường mà không ăn | Vercel → Deployments → ... → **Redeploy** |
