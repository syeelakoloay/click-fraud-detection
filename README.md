# Sistem Deteksi Fraud Klik Iklan Digital Menggunakan Machine Learning

## Gambaran umum proyek

Proyek ini bertujuan membangun sistem untuk membantu mendeteksi **fraudulent clicks** pada periklanan digital. Click fraud adalah klik iklan yang tidak valid atau mencurigakan dan dapat menimbulkan biaya atau statistik iklan yang tidak akurat. Proyek menggunakan pendekatan *supervised machine learning* dengan label yang tersedia pada dataset, kemudian merancang backend untuk menyimpan dan menyajikan data event agar dapat digunakan untuk analisis serta monitoring.

Sistem dirancang sebagai beberapa komponen yang saling mendukung: dataset dan pemrosesan data, feature engineering dan eksperimen machine learning, penyimpanan MongoDB melalui Mongoose, backend HTTP menggunakan Express.js, serta dashboard React yang direncanakan untuk menampilkan metrik traffic dan informasi monitoring. ZIP ini mencakup dataset/artefak data dan machine learning serta backend; tidak terdapat aplikasi frontend React lengkap di dalam folder ini.

## Dataset dan label

- **Dataset:** `dataset/click_fraud_dataset.csv`.
- **Ukuran sumber:** 5.000 event dengan 21 atribut, sesuai dokumen referensi proyek.
- **Target klasifikasi:** `is_fraudulent`; nilai `0` menandai non-fraud dan nilai `1` menandai fraud sesuai label dataset.
- **Kelompok informasi:** perilaku klik, perangkat/browser, konteks jaringan, dan atribut event.

Data dan label adalah masukan/sumber evaluasi. Keberadaan label `is_fraudulent` dalam suatu event tidak berarti backend Express melakukan prediksi baru. Perlu memeriksa kualitas data dan potensi kebocoran label sebelum menggunakan hasil model sebagai dasar keputusan operasional.

## Alur kerja tingkat tinggi

1. **Seleksi dan pemeriksaan data:** dataset sumber dipertahankan sebagai dasar pengolahan.
2. **Feature engineering dan analisis:** script di folder `ml/` mempersiapkan fitur dan menjalankan analisis yang tersedia pada proyek.
3. **Pelatihan/evaluasi model:** terdapat script Random Forest dan artefak hasil evaluasi dari progres sebelumnya. README ini tidak menetapkan angka performa karena hasil harus dibaca langsung dari artefak evaluasi terkait.
4. **Penyimpanan dan layanan data:** MongoDB menyimpan event, data IP yang diblokir, dan catatan model run melalui model Mongoose.
5. **API backend:** Express.js menyediakan health check serta endpoint untuk membuat, membaca, memperbarui, menghapus, dan mengimpor banyak event.
6. **Monitoring:** dashboard React tercantum dalam rancangan keseluruhan sebagai komponen untuk menampilkan informasi seperti traffic, jumlah event/fraud, dan blocked IP. Folder ZIP ini tidak menyertakan implementasi frontend React lengkap.

## Struktur folder

| Path | Fungsi |
|---|---|
| `dataset/` | Dataset sumber `click_fraud_dataset.csv`. |
| `ml/` | Script feature engineering, analisis, training/diagnosis, dan artefak model/evaluasi yang tersedia dari progres sebelumnya. |
| `ml/results/` | File model dan hasil evaluasi seperti metrik, confusion matrix, classification report, dan feature importance. |
| `src/config/` | Konfigurasi koneksi database. |
| `src/models/` | Model Mongoose `Event`, `BlockedIP`, dan `ModelRun`. |
| `src/services/` | Service akses event, blocked IP, model run, utilitas, dan monitoring. |
| `src/app.js`, `src/server.js` | Konfigurasi aplikasi Express dan proses server. |
| `src/routes/`, `src/controllers/`, `src/middleware/` | Route API event, controller request, validasi, dan penanganan error. |
| `src/initDatabase.js`, `src/verifyDatabase.js` | Inisialisasi serta pemeriksaan collection/index MongoDB. |
| `scripts/` | Skrip pemeriksaan sintaks, unit test, dan integration test untuk Aktivitas 8, 10, dan 13. |
| `tests/` | Unit test controller monitoring dan blocked IP Aktivitas 13; integration test aktual tersedia di `scripts/testMonitoringIntegrationActivity13.js`. |
| `docs/` | Catatan desain, deskripsi aktivitas, daftar endpoint, panduan pengujian, dan laporan progres. |
| `.env.example` | Contoh konfigurasi environment; salin ke `.env` untuk penggunaan lokal. Jangan membagikan `.env` yang berisi kredensial. |

## Backend yang tersedia pada Progres 10

Backend memakai Node.js, Express.js, Mongoose, dan MongoDB. Endpoint berikut telah tersedia dari implementasi Aktivitas 10:

| Method | Endpoint | Kegunaan |
|---|---|---|
| `GET` | `/health` | Memeriksa status aplikasi dan koneksi database. |
| `POST` | `/api/events` | Membuat satu event. |
| `GET` | `/api/events` | Mengambil daftar event dengan dukungan pagination/filter sesuai service. |
| `GET` | `/api/events/:clickId` | Membaca event berdasarkan `click_id`. |
| `PATCH` | `/api/events/:clickId` | Memperbarui field event yang diizinkan; `click_id` tidak dapat diubah. |
| `DELETE` | `/api/events/:clickId` | Menghapus event berdasarkan `click_id`. |
| `POST` | `/api/events/ingest` | Menerima batch event JSON dan melaporkan hasil tiap item. |

CORS membaca allowlist dari `CORS_ORIGINS`. API menolak field event yang tidak dikenal dan mengembalikan respons error terstruktur. Batas ukuran body JSON dan jumlah maksimum item batch merupakan batas teknis implementasi yang didokumentasikan, bukan tambahan kebutuhan yang dinyatakan dalam dokumen referensi.

## Endpoint monitoring Aktivitas 13

Aktivitas 13 menambahkan endpoint untuk kebutuhan monitoring dashboard dengan menggunakan service yang sudah tersedia. Endpoint baru tidak mengubah schema event, tidak menjalankan prediksi Random Forest, dan tidak menerapkan pemblokiran IP otomatis.

| Method | Endpoint | Kegunaan |
|---|---|---|
| `GET` | `/api/monitoring/summary` | Mengambil ringkasan overview, traffic, daftar blocked IP terbatas, dan status catatan model run. |
| `GET` | `/api/monitoring/metrics` | Mengambil metrik evaluasi dari model run terbaru yang tersimpan; `data` bernilai `null` bila belum ada record. |
| `GET` | `/api/monitoring/traffic` | Mengambil agregasi jumlah event, fraud, dan valid per jam atau hari. |
| `GET` | `/api/blocked-ips` | Mengambil daftar blocked IP dengan pagination. |

Query `startDate` dan `endDate` dapat digunakan pada summary dan traffic. Query `interval` hanya menerima `hour` atau `day`. Daftar blocked IP menerima `page` dan `limit`. Lihat `docs/ENDPOINTS_AKTIVITAS_13.md` untuk kontrak respons dan contoh perintah pengujian.

Perintah pemeriksaan Aktivitas 13: 

```bash
npm run check:activity13
npm run test:activity13:unit
npm run test:api:activity13:mongo
```

Unit test menggunakan service tiruan (*mock*) untuk memeriksa controller secara terisolasi dan deterministik, termasuk pemetaan parameter, bentuk respons, serta penerusan error. Mock mengurangi ketergantungan pada jaringan/database dan memudahkan pengujian cabang error yang sulit dibuat secara konsisten pada database aktual; namun, mock tidak membuktikan query Mongoose, agregasi MongoDB, atau pendaftaran route benar-benar bekerja bersama. Karena itu, integration test Aktivitas 13 menggunakan Express, service asli, Mongoose, dan MongoDB yang benar-benar berjalan untuk memverifikasi respons empat endpoint serta data yang tersimpan. Kedua pendekatan saling melengkapi: unit test cepat mengisolasi regresi logika, sedangkan integration test menguji sambungan komponen dan persistensi nyata.

Integration test harus dijalankan menggunakan `TEST_MONGODB_URI` yang menunjuk ke database khusus dengan nama berakhiran `_test` atau `_testing`. Skrip menolak nama database uji yang sama dengan `MONGODB_URI`, membuat record dengan identifier unik, dan hanya menghapus record yang dibuat oleh proses pengujian tersebut. Skrip tidak melakukan `dropDatabase`, tidak menghapus collection, dan tidak membersihkan seluruh database. Fixture angka metrik, IP dokumentasi, serta timestamp masa depan hanya dibuat selama tes di database pengujian; fixture tersebut bukan data produksi atau angka yang dipakai oleh controller sebagai respons tetap.

## Menyiapkan dan menjalankan backend

**Prasyarat:** Node.js versi 18 atau lebih baru serta instance MongoDB yang dapat diakses.

Dari direktori proyek yang berisi `package.json`:

```bash
cp .env.example .env
```

Pada Windows PowerShell, alternatifnya:

```powershell
Copy-Item .env.example .env
```

Isi `MONGODB_URI` dalam `.env` dengan URI database utama yang sesuai. `TEST_MONGODB_URI` harus menunjuk ke database terpisah dengan nama berakhiran `_test` atau `_testing` (contoh default: `click_fraud_detection_test`); jangan samakan dengan nama database utama. Sesuaikan `PORT` dan `CORS_ORIGINS` dengan lingkungan yang digunakan. Jika collection/index belum diinisialisasi, jalankan:

```bash
npm run init:db
npm run verify:db
```

Jangan menjalankan inisialisasi pada database yang tidak dimaksudkan untuk pengujian tanpa memastikan dampaknya. Setelah konfigurasi benar, jalankan:

```bash
npm install
npm run dev
```

Server development secara default tersedia di `http://localhost:5000`. Periksa `http://localhost:5000/health` untuk health check.

## Batasan dan hal yang tidak boleh diasumsikan

- `is_fraudulent` diperlakukan sebagai label/input event, bukan prediksi yang dibuat oleh Express.
- Dataset tidak dimuat otomatis ke MongoDB saat server dimulai.
- Dashboard React merupakan bagian dari rancangan sistem keseluruhan, tetapi aplikasi frontend lengkap tidak termasuk dalam ZIP ini.
