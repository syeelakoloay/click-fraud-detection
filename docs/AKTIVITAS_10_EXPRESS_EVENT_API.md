# Aktivitas 10 — Express.js dan API Event

## 1. Konteks

Proyek Sistem Deteksi Fraud Klik Iklan Digital Menggunakan Machine Learning menggunakan dataset `click_fraud_dataset.csv` yang terdiri dari 5.000 event dan 21 field. Hasil progres sebelumnya telah menyediakan model Mongoose `Event`, koneksi database, serta service database Aktivitas 8. Referensi utama menetapkan bahwa MongoDB digunakan untuk menyimpan data event, hasil model run, dan daftar IP yang diblokir melalui backend Express.js.

Aktivitas 10 meneruskan fondasi tersebut dengan menyediakan aplikasi Express.js, middleware CORS, health check, endpoint CRUD event, dan batch ingestion. Implementasi tidak mengubah schema event dan tidak melakukan training atau prediksi model.

## 2. Validasi scope

| Kriteria | Hasil | Dasar |
|---|---|---|
| Sesuai kebutuhan proyek | Sesuai | Referensi memerlukan penyimpanan event melalui backend Express.js. |
| Konsisten dengan progres sebelumnya | Sesuai | Model `Event` dan service database yang ada digunakan kembali. |
| CRUD event | Ditambahkan | Service lama menyediakan create/read; operasi update dan delete ditambahkan berdasarkan `click_id`. |
| Ingestion | Ditambahkan | Endpoint batch menerima array event berbentuk JSON dan melaporkan tiap hasil. |
| Prediksi/auto-block | Tidak termasuk | Aktivitas ini tidak melatih model dan tidak menetapkan kebijakan pemblokiran otomatis. |

## 3. Endpoint

Lihat [`ENDPOINTS_AKTIVITAS_10.md`](ENDPOINTS_AKTIVITAS_10.md) untuk metode, parameter, kode respons, dan contoh request.

## 4. Implementasi

- `src/app.js`: konfigurasi Express, CORS, JSON parser, health check, event router, dan fallback 404.
- `src/server.js`: memuat environment, menghubungkan MongoDB sebelum server menerima request, memulai listener, dan menutup koneksi secara graceful saat menerima SIGINT/SIGTERM.
- `src/routes/eventRoutes.js`: pemetaan method dan path API event.
- `src/controllers/eventController.js`: validasi body, operasi CRUD, dan batch ingestion.
- `src/middleware/errorHandler.js`: respons error konsisten untuk validasi, JSON invalid, payload terlalu besar, origin CORS tidak diizinkan, duplikasi `click_id`, dan kesalahan server.
- `src/services/eventService.js`: operasi update dan delete ditambahkan, sedangkan fungsi sebelumnya dipertahankan.
- `scripts/testMongoIntegrationActivity10.js`: tes integrasi Express API dengan MongoDB aktual melalui database uji khusus; operasi dan persistensi diverifikasi melalui Mongoose.

## 5. Keputusan desain yang dinyatakan terbuka

1. Default CORS mengizinkan origin pengembangan `http://localhost:5173` dan `http://localhost:5174`. Nilai ini dapat diganti melalui `CORS_ORIGINS` sebagai daftar origin dipisahkan koma; origin untuk deployment perlu diatur sesuai lingkungan sebenarnya.
2. Batas body JSON adalah 10 MB. Satu batch ingestion menerima maksimal 5.000 event, sesuai jumlah observasi dataset sumber pada referensi saat ini.
3. Ingestion memproses setiap event dan mengembalikan `successCount`, `failureCount`, serta detail hasil per indeks. Satu event gagal tidak menghentikan seluruh batch.
4. `click_id` digunakan sebagai identifier bisnis dan tidak dapat diubah melalui PATCH. Field di luar 21 field schema event ditolak.
5. `is_fraudulent` diperlakukan sebagai label yang dikirim pada event, bukan hasil prediksi yang dibuat oleh API.
6. Endpoint ini tidak menyediakan operasi blocked IP, model run, training, atau prediction. Komponen tersebut tidak ditambahkan karena scope Aktivitas 10 berfokus pada Express dan API event.

## 6. Cara menjalankan

1. Gunakan Node.js versi 18 atau lebih baru.
2. Salin `.env.example` ke `.env`, lalu pastikan `MONGODB_URI`, `PORT`, dan `CORS_ORIGINS` sesuai lingkungan lokal.
3. Dari direktori root yang memiliki `package.json`, jalankan `npm install`.
4. Untuk pertama kali atau setelah memastikan konfigurasi database benar, jalankan `npm run init:db` bila collection/index belum diinisialisasi.
5. Jalankan `npm start` atau `npm run dev`.
6. Periksa `http://localhost:5000/health` dan uji endpoint event sesuai panduan Aktivitas 10.

Jangan memasukkan URI berkredensial ke dokumentasi atau membagikan file `.env`.

## 7. Verifikasi

Jalankan:

```bash
npm run check:activity10
npm run test:api:activity10
npm run test:api:activity10:mongo
npm run check:activity8
npm run test:activity8:unit
```

Pengujian API Aktivitas 10 (`npm run test:api:activity10`) menggunakan fake service untuk memverifikasi kontrak HTTP, CORS, preflight, health status termasuk kondisi database terputus yang disimulasikan, CRUD pada lapisan API, validasi, JSON tidak valid, dan ringkasan batch tanpa mengubah database. Tes integrasi MongoDB aktual dijalankan terpisah melalui `npm run test:api:activity10:mongo` dan menggunakan `TEST_MONGODB_URI` dengan nama database berakhiran `_test` atau `_testing`. Tes integrasi memverifikasi koneksi, POST, GET, PATCH, batch ingestion, DELETE, dan dokumen langsung di MongoDB.

## 8. Batasan hasil

Berdasarkan output terminal terbaru yang diberikan pengguna, `npm install` berhasil memasang 85 paket, mengaudit 86 paket, dan melaporkan 0 vulnerabilities pada saat pemeriksaan; `npm run dev` melaporkan MongoDB berhasil terhubung dan API berjalan pada `http://localhost:5000`; pemeriksaan sintaks 8 file lulus; 8 tes API berbasis fake service lulus; dan 7 tes integrasi MongoDB aktual lulus pada database `click_fraud_detection_test`. Kedua suite tes tetap dipisahkan karena suite fake service memeriksa kontrak HTTP yang terisolasi termasuk jalur error, sedangkan suite integrasi memverifikasi persistensi data pada MongoDB aktual. Hasil ini mencatat output yang diberikan pengguna dan bukan klaim bahwa penyusun laporan menjalankan ulang tes tersebut secara independen.
