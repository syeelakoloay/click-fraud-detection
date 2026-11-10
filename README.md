# ClickGuard - Workspace Aktivitas 28

Workspace ini menyatukan source frontend React/Vite dan backend Express/MongoDB yang sebelumnya berada pada dua ZIP terpisah. Struktur folder dibuat tetap agar kedua proyek dapat dikerjakan dan dijalankan dari satu direktori.

## Struktur

```text
ClickGuard_Aktivitas28/
├── frontend/                 # React + Vite dashboard
├── backend/                  # Express API + MongoDB + bridge layanan Python
├── docs/
│   ├── API_CONTRACT_AKTIVITAS_28.md
│   └── Laporan_Aktivitas_28_Acuan.docx
├── package.json              # Perintah workspace
└── README.md
```

Folder frontend dan backend tetap dipisahkan supaya dependency, konfigurasi, dan tanggung jawab masing-masing aplikasi tidak tercampur. Keduanya berada pada satu root workspace dan saling terhubung melalui HTTP API. Folder `.git` dari snapshot frontend dihapus agar workspace gabungan tidak membawa metadata repository yang hanya mewakili salah satu proyek.

## Persyaratan

- Node.js 18 atau lebih baru dan npm.
- MongoDB aktif dan dapat diakses melalui `MONGODB_URI`.
- Python ML API hanya diperlukan untuk endpoint prediksi; endpoint monitoring/dashboard tidak menggunakan Python untuk membaca event.

## 1. Konfigurasi backend

Salin `backend/.env.example` menjadi `backend/.env`, lalu sesuaikan `MONGODB_URI`, `PORT`, `CORS_ORIGINS`, dan URL layanan Python jika fitur prediksi akan diuji. Jangan mengunggah `.env` atau credential ke repository.

Contoh konfigurasi lokal yang disertakan:

```env
MONGODB_URI=mongodb://127.0.0.1:27017/click_fraud_activity15_manual
PORT=5000
CORS_ORIGINS=http://localhost:5173,http://localhost:5174
PREDICTION_URL=http://127.0.0.1:8000/predict
HISTORY_WINDOW_MINUTES=10
```

Nama database pada contoh mengikuti file `.env.example` dari backend yang disediakan; ganti sesuai database proyek yang benar-benar digunakan.

## 2. Konfigurasi frontend

Salin `frontend/.env.example` menjadi `frontend/.env`. Untuk development lokal dengan proxy Vite, biarkan `VITE_API_URL` kosong dan pastikan `VITE_API_PROXY_TARGET=http://127.0.0.1:5000` sesuai alamat backend.

## 3. Instalasi dependency

Dari root workspace:

```bash
npm run install:all
```

Perintah tersebut menginstal dependency secara terpisah di `backend` dan `frontend`.

## 4. Menjalankan aplikasi

Buka **dua terminal** pada root workspace.

Terminal 1 - backend:

```bash
npm run dev:backend
```

Backend akan mencoba menghubungkan MongoDB sebelum membuka Express pada `http://localhost:5000`. Jika MongoDB tidak aktif atau URI salah, server tidak akan berjalan.

Terminal 2 - frontend:

```bash
npm run dev:frontend
```

Vite berjalan pada `http://localhost:5173` dan meneruskan `/api/*` serta `/health` ke backend.

## 5. Verifikasi Aktivitas 28

Dari root workspace:

```bash
npm run check:backend
npm run test:frontend
npm run build:frontend
```

Atau jalankan semuanya secara berurutan:

```bash
npm run verify:activity28
```

Tes statis backend memeriksa konsistensi source route/service dan dokumen API contract. Tes frontend mencakup tes traffic Aktivitas 16 dan tes helper API Aktivitas 28. Build frontend memvalidasi proses bundling React. Tidak satu pun dari perintah ini dengan sendirinya membuktikan bahwa MongoDB/Python hidup atau bahwa seluruh halaman lulus pengujian browser end-to-end.

Untuk tes runtime, jalankan backend dengan MongoDB aktif, lalu uji endpoint berikut melalui PowerShell atau Network tab browser:

```powershell
Invoke-RestMethod "http://localhost:5000/health" | ConvertTo-Json -Depth 8
Invoke-RestMethod "http://localhost:5000/api/events?page=1&limit=50" | ConvertTo-Json -Depth 8
Invoke-RestMethod "http://localhost:5000/api/monitoring/traffic?interval=hour" | ConvertTo-Json -Depth 8
Invoke-RestMethod "http://localhost:5000/api/monitoring/metrics" | ConvertTo-Json -Depth 8
Invoke-RestMethod "http://localhost:5000/api/monitoring/summary" | ConvertTo-Json -Depth 8
Invoke-RestMethod "http://localhost:5000/api/blocked-ips?page=1&limit=50" | ConvertTo-Json -Depth 8
```

Periksa Network tab dashboard. Khusus halaman **Blocked IPs**, pastikan UI mengirim request `GET /api/blocked-ips`; mengakses URL secara manual saja belum membuktikan integrasi halaman.

## 6. Batas kontrak yang harus dipertahankan

1. `is_fraudulent` pada `GET /api/events` adalah label dataset (`0 = Valid`, `1 = Fraud`), bukan hasil prediksi ML yang baru dijalankan.
2. `/api/monitoring/metrics` mengembalikan catatan model run tersimpan. `NO_MODEL_RUN_RECORDED` tidak identik dengan Python service down.
3. `/api/blocked-ips` hanya mengembalikan daftar dari collection `blocked_ips`; schema saat ini menyediakan `_id` dan `ip_address`.
4. Event VPN/proxy adalah risk signals, bukan bukti IP telah masuk daftar blocked IP. Frontend memisahkan dua sumber itu.
5. `/api/monitoring/summary` adalah snapshot opsional dan tidak otomatis menggantikan logika KPI/filter React yang dihitung dari event yang dimuat.
6. `/api/realtime/test-history` adalah route pengujian dan tidak menyimpan event uji ke collection `events`.
7. `npm run check:activity28`, tes unit, atau build tidak boleh dilaporkan sebagai tes HTTP/MongoDB/Python atau browser end-to-end.

## 7. Dokumen acuan

- `docs/API_CONTRACT_AKTIVITAS_28.md` - kontrak endpoint final dan pemetaan komponen dashboard.
- `docs/Laporan_Aktivitas_28_Final.docx` - laporan Aktivitas 28 dengan addendum integrasi frontend-backend dan hasil verifikasi snapshot workspace.
- `backend/docs/` - dokumentasi teknis backend, termasuk salinan kontrak dan laporan Markdown.
