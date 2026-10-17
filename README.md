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
| `scripts/` | Skrip pemeriksaan sintaks, tes kontrak API dengan fake service, dan tes integrasi MongoDB aktual untuk Aktivitas 8/10. |
| `docs/` | Catatan desain, deskripsi aktivitas, daftar endpoint, panduan pengujian, dan laporan progres. |
| `.env.example` | Contoh konfigurasi environment; salin ke `.env` untuk penggunaan lokal. Jangan membagikan `.env` yang berisi kredensial. |

## Backend yang tersedia pada Progres 10

Backend memakai Node.js, Express.js, Mongoose, dan MongoDB. Endpoint berikut tersedia pada implementasi Aktivitas 10:

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

## Pemeriksaan dan pengujian

Perintah pemeriksaan Aktivitas 10:

```bash
npm run check:activity10
npm run test:api:activity10
npm run test:api:activity10:mongo
```

Kedua perintah tes dipertahankan karena menguji lapisan berbeda dan saling melengkapi. `test:api:activity10` memakai *fake service* untuk menguji kontrak HTTP secara terisolasi, termasuk CORS, preflight, penanganan database yang disimulasikan terputus, validasi, JSON tidak valid, serta respons CRUD dan batch tanpa mengubah database. `test:api:activity10:mongo` menguji integrasi Express, service event, Mongoose, dan MongoDB aktual: tes melakukan POST, GET, PATCH, batch ingestion, dan DELETE lalu memverifikasi persistensi langsung di database uji. Tes fake service lebih deterministik dan dapat menguji jalur error yang mudah disimulasikan; tes integrasi membuktikan persistensi nyata. Keduanya tidak duplikat, dan lulusnya satu suite tidak menggantikan bukti dari suite lainnya.

Output terminal terbaru yang diberikan pengguna menunjukkan pemeriksaan sintaks lulus untuk 8 file, 8 tes kontrak API lulus, dan 7 tes integrasi MongoDB aktual lulus pada database `click_fraud_detection_test`. Output startup juga melaporkan MongoDB berhasil terhubung. Hasil ini adalah bukti yang diberikan pengguna dari lingkungannya; laporan dan dokumentasi ini tidak mengklaim menjalankan ulang pengujian tersebut secara independen. Skrip tes mengharuskan database uji memiliki nama berakhiran `_test` atau `_testing`, menolak nama yang sama dengan database utama, dan hanya membersihkan record milik tes.

## Batasan dan hal yang tidak boleh diasumsikan

- Progres 10 tidak menjalankan training atau prediksi Random Forest melalui endpoint API.
- `is_fraudulent` diperlakukan sebagai label/input event, bukan prediksi yang dibuat oleh Express.
- Tidak ada kebijakan pemblokiran otomatis IP yang ditambahkan pada Aktivitas 10.
- Endpoint `blocked_ips` dan `model_runs` tidak termasuk dalam API Aktivitas 10 meskipun model/service terkait tersedia dari progres sebelumnya.
- Dataset tidak dimuat otomatis ke MongoDB saat server dimulai.
- Artefak model dan evaluasi yang tersedia berasal dari progres sebelumnya; README ini tidak menyatakan bahwa model tersebut telah divalidasi ulang sebagai bagian dari Aktivitas 10.
- Dashboard React merupakan bagian dari rancangan sistem keseluruhan, tetapi aplikasi frontend lengkap tidak termasuk dalam ZIP ini.

## Dokumentasi lanjutan

- `docs/AKTIVITAS_10_EXPRESS_EVENT_API.md` — ringkasan implementasi Aktivitas 10.
- `docs/ENDPOINTS_AKTIVITAS_10.md` — daftar route, request, dan response.
- `docs/PANDUAN_PENGUJIAN_AKTIVITAS_10.md` — langkah pengujian API.
- `docs/INTEGRATION_TEST_MONGODB.md` — panduan tes integrasi MongoDB aktual dan keselamatan database uji.
- `docs/AKTIVITAS_8_SERVICE_DATABASE.md` — dokumentasi service database dari Aktivitas 8.
- `docs/DESIGN_NOTES.md` — catatan desain yang menyertai proyek.
- `docs/VERIFICATION_RESULT.md` — bukti historis inisialisasi dan pemeriksaan database tahap sebelumnya.
- `docs/Laporan_Progres_10_Express_Event_API.docx` — laporan Progres 10 dan ruang untuk screenshot output terminal.
