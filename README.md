# Qure Mock API - Sandbox Environment

## 1. Mục đích dự án
Đây là môi trường **Sandbox / Giả lập** chạy trên Vercel.
**Mục tiêu chính**: Mô phỏng quy trình và logic xử lý dữ liệu (Drilldown, Ads Filtering...) giống hệt như môi trường Live (Production), nhưng **tách biệt hoàn toàn**, không can thiệp vào Source Code hệ thống thật.

Dự án này giúp team:
- Phát triển và kiểm thử logic mới (VD: chuyển đổi nguồn dữ liệu từ mock sang API thật).
- Đảm bảo luồng dữ liệu đúng trước khi đội Dev implement vào hệ thống chính.

---

## 2. Kiến trúc & File quan trọng
Dự án được cấu hình để hoạt động như một "Backend-mini" phục vụ cho việc testing.

### `package.json`
- **Vai trò**: Định nghĩa môi trường Node.js hỗ trợ **ES Modules** (`"type": "module"`).
- **Lý do**: Để code trong `api/` có thể viết bằng cú pháp `import/export` hiện đại, dễ dàng copy-paste sang các dự án React/Next.js/Node.js mới mà không cần sửa đổi nhiều.

### `vercel.json`
- **Vai trò**: Giả lập cấu hình Server (Routing & CORS).
- **Ý nghĩa cho Live Version**: File này chứng minh rằng để Frontend gọi được API, phía Server (Backend thật) cần cấu hình **CORS** tương tự.
    - Cần cho phép `Access-Control-Allow-Origin: *` (hoặc domain cụ thể).
    - Cần cho phép các method `GET, OPTIONS`.

### `api/helpers/core.js` & `api/ads.js`
Đây là lõi xử lý logic cần chuyển giao:
- **Upstream Connection**: Kết nối tới `https://api.foresightiq.ai/`.
- **SSL Bypass**: Sử dụng `https.Agent({ rejectUnauthorized: false })`.
    - *Lưu ý*: Môi trường Live có thể đã handle việc này ở tầng hạ tầng, hoặc Dev cần lưu ý rằng server upstream đang dùng chứng chỉ không chuẩn.
- **Data Standardization**: Code đã xử lý việc chuẩn hoá dữ liệu trả về client.

---

## 3. Ghi chú chuyển giao (For Developers)
Khi tích hợp logic này vào hệ thống Live (Production):

1.  **Logic Logic (Business Logic)**:
    - Có thể tái sử dụng phần lớn code xử lý trong thư mục `api/`.
    - Đặc biệt chú ý logic call API tại `api/helpers/core.js`:
        ```javascript
        // Upstream API Endpoint
        const baseUrl = "https://api.foresightiq.ai/";
        const member = "mem_cmizn6pdk0dmx0ssvf5bc05hw"; // Hardcoded Auth
        ```

2.  **Cấu hình Server**:
    - Không được gọi trực tiếp `api.foresightiq.ai` từ Client (Browser) vì sẽ bị chặn CORS và SSL Error.
    - **Bắt buộc** phải gọi thông qua phía Backend (như cách Mock API này đang làm).

3.  **Tính tương thích**:
    - Dự án này dùng Vercel Serverless Functions. Nếu hệ thống thật dùng Express/NestJS/Go..., Dev chỉ cần bê logic xử lý (`fetchAds`, `processAds`) sang, còn phần routing thì tuân theo framework đó.
