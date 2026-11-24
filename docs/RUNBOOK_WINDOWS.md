# Runbook ClickGuard — Windows PowerShell

Dokumen ini berisi perintah berurutan untuk menyiapkan environment, menjalankan dashboard, menguji model Web Robot, dan membuktikan rule mitigasi real-time internal. Jalankan command dari folder root hasil ekstraksi ZIP (folder yang memuat `package.json`, `frontend`, dan `backend`).

## 1. Prasyarat

- Windows 10/11.
- Node.js 18 atau lebih baru dan npm.
- Python 3.10/3.11/3.12 64-bit (gunakan versi yang kompatibel dengan wheel LightGBM di perangkat Anda).
- MongoDB Community Server aktif.
- PowerShell. Gunakan `npm.cmd`, bukan `npm`, agar tidak terhalang kebijakan eksekusi `npm.ps1`.

Periksa instalasi:

```powershell
node --version
npm.cmd --version
py -3 --version
mongosh --version
```

Jika perintah `mongosh` tidak dikenali, MongoDB Server masih dapat berjalan sebagai Windows Service; shell hanya diperlukan bila Anda ingin memeriksa database secara manual.

## 2. Siapkan file environment

```powershell
if (-not (Test-Path .\backend\.env)) { Copy-Item .\backend\.env.example .\backend\.env }
if (-not (Test-Path .\frontend\.env)) { Copy-Item .\frontend\.env.example .\frontend\.env }
```

Periksa `backend/.env`. Untuk local development, contoh minimalnya:

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017/click_fraud_activity15_manual
PORT=5000
CORS_ORIGINS=http://localhost:5173,http://localhost:5174
ML_API_URL=http://127.0.0.1:8000
PREDICTION_URL=http://127.0.0.1:8000/predict
HISTORY_WINDOW_MINUTES=10
REALTIME_IP_BURST_WINDOW_SECONDS=5
REALTIME_IP_BURST_LIMIT_IDENTIFIED=10
REALTIME_IP_BURST_LIMIT_ANONYMOUS=20
REALTIME_ML_AUTOBLOCK_ENABLED=false
GOOGLE_ADS_MUTATIONS_ENABLED=false
GOOGLE_ADS_AUTO_EXCLUDE_ENABLED=false
```

Untuk local development, `EVENT_INGESTION_API_KEY` boleh dikosongkan. Pada production, isi dengan kunci acak panjang dan simpan hanya pada `backend/.env` serta server-side collector; endpoint penulisan event/import/update/delete akan menolak request tanpa header `X-Event-Ingestion-Key`. Jangan menaruh kunci ini di browser/frontend. IP pada payload harus dihitung/diperoleh oleh collector tepercaya dari koneksi pengunjung, bukan diterima dari field yang bebas diubah pengguna. Jangan percaya `X-Forwarded-For` kecuali ditulis oleh reverse proxy tepercaya yang dikonfigurasi dengan benar.

Jangan menaruh secret OAuth di frontend, source code, atau percakapan. Google Ads API versi kebijakan sejak 9 September 2026 tidak lagi mensyaratkan Developer Token pada request baru; backend memakai OAuth Client ID, Client Secret, dan Refresh Token. Akses tetap bergantung pada Google Cloud project access level dan izin akun Google Ads.

## 3. Buat virtual environment Python dan instal dependency

Dari root folder:

```powershell
if (-not (Test-Path .\backend\.venv\Scripts\python.exe)) {
  py -3 -m venv .\backend\.venv
}
& ".\backend\.venv\Scripts\python.exe" -m pip install --upgrade pip
& ".\backend\.venv\Scripts\python.exe" -m pip install -r ".\backend\ml\requirements.txt"
```

Tidak perlu menjalankan `Activate.ps1`; pemanggilan interpreter langsung menghindari PowerShell Execution Policy.

## 4. Instal dependency Node.js

Dari root folder:

```powershell
npm.cmd run install:all
```

Jika `npm.cmd run install:all` gagal karena koneksi internet atau registry, jalankan terpisah:

```powershell
npm.cmd --prefix backend ci
npm.cmd --prefix frontend ci
```

## 5. Jalankan MongoDB

Periksa apakah service MongoDB tersedia:

```powershell
Get-Service MongoDB -ErrorAction SilentlyContinue
```

Jika terdaftar dan belum berjalan:

```powershell
Start-Service MongoDB
```

Jika tidak menggunakan Windows Service, jalankan MongoDB Server sesuai lokasi instalasi dan `dbPath` yang sudah dikonfigurasi pada komputer Anda. Jangan jalankan dua instance MongoDB pada port yang sama.

## 6. Jalankan empat terminal

Buka empat jendela PowerShell pada root folder proyek.

**Terminal 1 — MongoDB**

Pastikan service MongoDB tetap berjalan. Bila Anda menjalankan `mongod` secara manual, biarkan terminal tersebut tetap terbuka.

**Terminal 2 — Python ML API**

```powershell
& ".\backend\.venv\Scripts\python.exe" ".\backend\ml\prediction_api.py"
```

Layanan Python menggunakan `http://127.0.0.1:8000`.

**Terminal 3 — Express backend**

```powershell
npm.cmd run dev:backend
```

Express menghubungkan MongoDB, menyinkronkan artefak metrik, menyimpan referensi Fraud historis, lalu listen pada `http://localhost:5000`.

**Terminal 4 — React/Vite frontend**

```powershell
npm.cmd run dev:frontend
```

Buka `http://localhost:5173`.

## 7. Periksa koneksi dan model

Jalankan dari PowerShell baru:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/health | ConvertTo-Json -Depth 8
Invoke-RestMethod http://127.0.0.1:5000/health | ConvertTo-Json -Depth 8
Invoke-RestMethod http://127.0.0.1:5000/api/monitoring/metrics | ConvertTo-Json -Depth 8
Invoke-RestMethod "http://127.0.0.1:5000/api/events?page=1&limit=20" | ConvertTo-Json -Depth 8
Invoke-RestMethod "http://127.0.0.1:5000/api/monitoring/traffic?interval=hour" | ConvertTo-Json -Depth 8
Invoke-RestMethod "http://127.0.0.1:5000/api/blocked-ips?page=1&limit=20" | ConvertTo-Json -Depth 8
```

Pada `/api/monitoring/metrics`, periksa dua kelompok hasil: `data` adalah evaluasi model CPA click-level; `web_robot_detection.test_metrics` adalah evaluasi sesi Human/Robot. Nilai Web Robot sekitar 98,08% **bukan** akurasi model Valid/Fraud klik iklan.

## 8. Jalankan ulang training Web Robot (opsional)

Dataset telah disertakan pada `backend/ml/datasets/web_robot_detection/`. Untuk mereproduksi model:

```powershell
& ".\backend\.venv\Scripts\python.exe" ".\backend\ml\train_web_robot_model.py"
```

Periksa file `backend/ml/results/web_robot_model_metrics.json`. Restart Python ML API setelah training agar model baru dimuat.

## 9. Uji burst rule dan blocklist internal

Pastikan MongoDB dan Express berjalan. Python API disarankan tetap aktif karena request event juga mencoba prediksi CPA dalam shadow mode. Dari root folder:

```powershell
node .\backend\scripts\testRealtimeMitigation.js
```

Skrip mengirim 10 event bersamaan dengan user dan User-Agent yang sama dalam waktu penerimaan server. Skrip otomatis membaca `backend/.env` dan mengirim header tersebut jika kunci diatur. Skrip memakai IP dokumentasi `203.0.113.0/24`, tidak mengirim campaign ID, dan tidak dapat memicu mutasi Google Ads. Hasil yang diharapkan:

```text
LULUS: burst rule real-time terpicu dan IP masuk blocklist internal.
```

Event dan IP uji akan tersimpan di MongoDB. Bersihkan data uji melalui tool administrasi MongoDB bila tidak ingin menyimpannya. Jangan gunakan skrip ini untuk alamat IP pelanggan atau akun produksi.

## 10. Google Ads — aktifkan hanya setelah verifikasi

Default mutasi tetap `false`. Pertama, isi credential OAuth pada `backend/.env`, pastikan Google Ads API aktif pada Google Cloud project yang sama, access level project sesuai kebutuhan, dan user OAuth memiliki izin pada customer/campaign yang dituju. Jalankan Express ulang, lalu uji koneksi read-only melalui halaman Google Ads atau endpoint status.

Untuk mengaktifkan pengecualian IP otomatis pada campaign yang sudah diverifikasi, kedua opsi berikut harus diubah secara eksplisit:

```dotenv
GOOGLE_ADS_MUTATIONS_ENABLED=true
GOOGLE_ADS_AUTO_EXCLUDE_ENABLED=true
```

Setelah perubahan, restart Express. Event real-time harus mempunyai `campaign_id` yang sama dengan campaign target. Backend memeriksa customer ID, campaign ID, nama campaign, jenis campaign, IP IPv4 publik, dan batas 500 IP/CIDR per campaign. IP lokal/dokumentasi/private tidak akan dikirim. Tindakan Google Ads memerlukan izin pemilik akun dan harus diuji hati-hati; Google Ads Test Account tidak mengeluarkan iklan atau biaya sungguhan, sehingga tidak dapat membuktikan nominal penghematan.

## 11. Jalankan test dan build

Dari root folder:

```powershell
npm.cmd run check:backend
npm.cmd run test:frontend
npm.cmd run test:backend
npm.cmd run test:google-ads
npm.cmd run test:realtime
npm.cmd run test:ingestion-auth
npm.cmd run test:prediction-api
npm.cmd run test:web-robot-api
npm.cmd run build:frontend
```

Atau jalankan paket verifikasi yang tidak memerlukan MongoDB aktif:

```powershell
npm.cmd run verify:activity28
```

Perintah unit/static/build bukan pengganti pengujian browser end-to-end atau uji mutasi Google Ads. Catat output aktual; jangan menyimpulkan penghematan biaya sebelum ada eksperimen produksi dengan data biaya nyata.

## 12. Mematikan layanan

Tekan `Ctrl+C` pada Terminal 4, 3, dan 2. Jika MongoDB dijalankan sebagai Windows Service dan tidak dibutuhkan lagi:

```powershell
Stop-Service MongoDB
```

Jangan menghentikan service database apabila masih digunakan aplikasi lain.

## Format tampilan anggaran

Nilai numerik `budget` pada dataset dan MongoDB dipertahankan apa adanya. Dashboard menampilkan nilai tersebut dengan simbol `$` langsung di depan angka, koma sebagai pemisah ribuan, dan titik sebagai pemisah desimal/sen. Perubahan ini hanya format tampilan, tidak mengonversi nilai dengan kurs dan tidak memerlukan migrasi database.

Fallback CPC dashboard kini menggunakan USD. Nilai default adalah `$0.11` per event dan dapat diubah melalui `VITE_DEFAULT_CPC_USD` pada `frontend/.env`.
