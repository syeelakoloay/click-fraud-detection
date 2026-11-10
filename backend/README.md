# Sistem Deteksi Fraud Klik Iklan Digital Menggunakan Machine Learning

## Gambaran Proyek

Repository ini menggabungkan pengolahan data dan klasifikasi *click fraud* dengan layanan backend untuk menyimpan event, menyediakan API, dan mendukung monitoring. Bagian data dan machine learning berisi proses *feature engineering*, analisis karakteristik data, pelatihan model klasifikasi, serta evaluasi model. Bagian backend menggunakan Node.js, Express.js, Mongoose, dan MongoDB untuk mengelola data event, hasil model, informasi IP yang diblokir, dan metrik monitoring.

Sumber data utama adalah `dataset/click_fraud_dataset.csv`, yang terdiri atas 5.000 event dengan 21 kolom. Kolom `is_fraudulent` berfungsi sebagai label klasifikasi, dengan nilai `0` untuk non-fraud dan nilai `1` untuk fraud sesuai dataset. Artefak pengolahan data serta hasil pelatihan yang tersedia di repository merupakan hasil proses sebelumnya dan perlu ditinjau kembali sebelum digunakan dalam eksperimen atau keputusan operasional baru.

## Ruang Lingkup Sistem

### Feature Engineering dan ML Classification

Skrip pada folder `ml/` memvalidasi struktur dataset, membentuk fitur waktu dari `timestamp`, memisahkan fitur numerik dan kategorikal, membandingkan karakteristik data, serta melatih model Random Forest. Tahap pelatihan menyimpan artefak model dan ringkasan evaluasi agar hasil eksperimen dapat ditinjau kembali. Skrip diagnosis model menyusun peringkat *feature importance* dari model yang sudah dilatih.

Alur pengolahan data dimulai dari dataset sumber dan menghasilkan `ml/click_fraud_features.csv` sebagai masukan bagi proses analisis serta pelatihan. File dalam `ml/results/` mencakup model tersimpan, metrik klasifikasi, confusion matrix, classification report, perbandingan fitur numerik, tingkat fraud kategori, dan feature importance. Angka performa tidak ditetapkan di README ini karena nilainya harus dibaca dari artefak evaluasi yang ada dan diperiksa sesuai eksperimen yang sedang dijalankan.

### MongoDB dan Express.js

Backend menyediakan lapisan API berbasis Express.js dengan model Mongoose untuk `Event`, `BlockedIP`, dan `ModelRun`. MongoDB digunakan untuk menyimpan event klik, daftar IP yang tercatat sebagai blocked, dan metrik dari proses model yang disimpan. Validasi data berada di model dan service, sedangkan middleware menangani kesalahan request dan respons API.

Endpoint utama yang tersedia meliputi:

| Method | Endpoint | Kegunaan |
|---|---|---|
| `GET` | `/health` | Memeriksa status server dan koneksi database. |
| `POST` | `/api/events` | Membuat satu event. |
| `GET` | `/api/events` | Membaca daftar event. |
| `GET` | `/api/events/:clickId` | Membaca event berdasarkan `click_id`. |
| `PATCH` | `/api/events/:clickId` | Memperbarui field event yang diizinkan. |
| `DELETE` | `/api/events/:clickId` | Menghapus event berdasarkan `click_id`. |
| `POST` | `/api/events/ingest` | Menerima batch event berbentuk JSON. |
| `POST` | `/api/events/import` | Mengimpor dataset CSV dengan body mentah dan `Content-Type: text/csv` atau `application/csv`. |
| `GET` | `/api/monitoring/summary` | Membaca ringkasan monitoring. |
| `GET` | `/api/monitoring/metrics` | Membaca metrik dari model run yang tersimpan. |
| `GET` | `/api/monitoring/traffic` | Membaca agregasi event berdasarkan rentang waktu. |
| `GET` | `/api/blocked-ips` | Membaca daftar IP yang tercatat sebagai blocked. |
| `POST` | `/api/predict` | Meneruskan fitur ke layanan Python ML dan mengembalikan hasil prediksi. |
| `POST` | `/api/realtime/test-history` | Route pengujian prediksi dengan riwayat IP; event uji tidak disimpan ke collection `events`. |

### Real-Time Prediction dan Mitigasi IP

Repository backend pada branch `finkly/task27-integration` sudah memuat dua jalur prediksi yang perlu dibedakan:

1. `POST /api/predict` merupakan endpoint prediksi utama. Backend menyiapkan 15 fitur apabila body berisi event dengan `timestamp`, lalu meneruskan fitur ke layanan Python ML menggunakan `ML_API_URL` (default `http://127.0.0.1:8000`) dan mengembalikan respons layanan Python.
2. `POST /api/realtime/test-history` merupakan route pengujian alur real-time dengan riwayat IP. Service memvalidasi event, memeriksa apakah IP sudah diblokir, mengambil riwayat IP dalam jendela waktu yang dikonfigurasi, dan mengirim 15 fitur ke endpoint Python. Apabila hasil model berlabel fraud (`label = 1`), IP dimasukkan ke collection `blocked_ips`; event berikutnya dari IP yang sama dikenali melalui daftar blokir sebelum model dipanggil.

Route `/api/realtime/test-history` **tidak menyimpan event uji ke collection `events`**. Dengan demikian, route tersebut membuktikan alur pengujian prediksi dan mitigasi, tetapi bukan pipeline ingest produksi yang otomatis memproses serta menyimpan setiap event masuk. `prediction_source` juga dapat bernilai `mock` apabila `PREDICTION_URL` tidak dikonfigurasi; untuk pengujian dengan layanan Python, arahkan variabel tersebut ke endpoint `/predict` yang aktif.

Daftar IP aktual dibaca melalui `GET /api/blocked-ips`. Schema `BlockedIP` saat ini hanya menyimpan `ip_address` (selain `_id` dari MongoDB); alasan, waktu pemblokiran, dan mekanisme pembukaan blokir tidak menjadi bagian dari kontrak saat ini. Pemblokiran pada alur real-time mengikuti hasil label model `1` dan belum menggunakan ambang probabilitas tambahan. Karena laporan evaluasi model baseline mencatat performa deteksi yang masih lemah, hasil prediksi tidak boleh diperlakukan sebagai bukti final fraud atau satu-satunya dasar keputusan operasional.

Detail pemetaan endpoint ke kebutuhan dashboard React, parameter, struktur respons, kode error, dan batas integrasi tercantum pada `docs/API_CONTRACT_AKTIVITAS_28.md`. Catatan implementasi serta bukti pengujian Aktivitas 27 tetap dirujuk untuk riwayat pekerjaan; nilai uji pada laporan tersebut bukan jaminan bahwa data atau status layanan akan sama pada sesi lain.
## Alur Kerja Tingkat Tinggi

1. Dataset sumber diperiksa dan diproses oleh skrip feature engineering.
2. Fitur hasil pengolahan dianalisis untuk membandingkan karakteristik event fraud dan non-fraud.
3. Model Random Forest dilatih dan dievaluasi, lalu artefaknya disimpan untuk diagnosis serta eksperimen lanjutan.
4. Backend menerima event melalui API dan menyimpan data pada MongoDB dengan validasi Mongoose.
5. Endpoint monitoring menyediakan ringkasan, metrik, dan agregasi traffic untuk kebutuhan observasi sistem.
6. Route uji `POST /api/realtime/test-history` menggabungkan pemeriksaan blocked IP, riwayat event, prediksi, dan penambahan IP ketika label model bernilai fraud. Route ini tidak menyimpan event uji ke collection `events` dan tidak boleh disamakan dengan pipeline ingest produksi.

## Struktur Repository

| Path | Fungsi |
|---|---|
| `dataset/` | Dataset sumber klik iklan. |
| `ml/` | Skrip feature engineering, analisis, pelatihan, dan diagnosis model. |
| `ml/results/` | Artefak model serta file hasil analisis dan evaluasi. |
| `src/config/` | Konfigurasi koneksi MongoDB. |
| `src/models/` | Model Mongoose untuk event, blocked IP, dan model run. |
| `src/services/` | Logika akses data untuk event, blocked IP, model run, dan monitoring. |
| `src/routes/` | Pendaftaran endpoint Express. |
| `src/controllers/` | Penanganan request dan pembentukan response API. |
| `src/middleware/` | Middleware penanganan error. |
| `src/utils/` | Utilitas parsing CSV. |
| `scripts/` dan `tests/` | Pemeriksaan kode serta tes unit dan integrasi. |
| `docs/` | Catatan desain, kontrak API, dan panduan pengujian. |
| `.env.example` | Contoh variabel lingkungan untuk konfigurasi lokal. |

## Prasyarat

- Node.js versi 18 atau lebih baru.
- MongoDB lokal atau instance MongoDB yang dapat diakses oleh backend.
- Python 3 untuk menjalankan skrip machine learning.
- Paket Python `pandas`, `scikit-learn`, dan `joblib` untuk proses feature engineering dan pelatihan model.

## Menyiapkan dan Menjalankan Backend

Jalankan perintah dari folder repository yang berisi `package.json`. Pasang dependensi Node.js dan salin file contoh konfigurasi ke `.env`.

```bash
npm install
cp .env.example .env
```

Pada Windows PowerShell, file konfigurasi dapat disalin dengan perintah berikut.

```powershell
Copy-Item .env.example .env
```

Isi `MONGODB_URI` di `.env` dengan URI database utama yang akan digunakan. `TEST_MONGODB_URI` harus menunjuk ke database khusus untuk pengujian dan tidak boleh menggunakan database yang menyimpan data utama. Setelah memastikan konfigurasi benar dan MongoDB aktif, inisialisasi struktur collection serta index dan jalankan server.

```bash
npm run init:db
npm run verify:db
npm run dev
```

Server pengembangan secara default berjalan pada `http://localhost:5000`. Endpoint `http://localhost:5000/health` menampilkan status aplikasi dan koneksi database. Nilai `CORS_ORIGINS` dapat disesuaikan dengan origin frontend yang diizinkan di lingkungan lokal.

## Menjalankan Alur Machine Learning

Pasang paket Python yang diperlukan pada lingkungan Python yang digunakan.

```bash
python -m pip install pandas scikit-learn joblib
```

Jalankan skrip sesuai urutan berikut untuk membentuk fitur, menghasilkan analisis, melatih model, dan memeriksa feature importance.

```bash
python ml/feature_engineering.py
python ml/analyze_features.py
python ml/train_model.py
python ml/diagnose_model.py
```

Proses feature engineering menghasilkan `ml/click_fraud_features.csv`. Analisis menyimpan perbandingan fitur numerik dan tingkat fraud pada kategori, sedangkan pelatihan menyimpan model dan metrik evaluasi ke `ml/results/`. Skrip diagnosis membaca model tersimpan dan menghasilkan daftar feature importance.

## Pemeriksaan dan Pengujian

Repository menyediakan pemeriksaan sintaks, tes unit, tes API terisolasi, dan tes integrasi yang menggunakan MongoDB aktual. Tes dengan service tiruan mengevaluasi kontrak API tanpa membuktikan persistensi, sedangkan tes integrasi memeriksa interaksi komponen nyata dan database uji. Gunakan database pengujian yang terpisah agar tes tidak mengubah data utama.

Perintah pengujian dikelompokkan menurut fungsi di bawah ini. Daftar nama skrip dan konfigurasi lengkap tetap tersedia di `package.json`.

```bash
npm run check:activity8
npm run test:activity8:unit
npm run test:activity8
npm run check:activity10
npm run test:api:activity10
npm run test:api:activity10:mongo
npm run check:activity13
npm run test:activity13:unit
npm run test:api:activity13:mongo
npm run check:dataset-import
npm run test:csv-parser
npm run test:dataset-import-validation
npm run test:dataset-import-error-handler
npm run test:api:dataset-import
npm run test:api:dataset-import:mongo
```

## Konfigurasi dan Batasan

File `.env` berisi konfigurasi lokal dan tidak seharusnya dibagikan ketika memuat kredensial atau URI privat. Endpoint import CSV menerima body CSV mentah dan membatasi ukuran request serta jumlah record per permintaan sesuai implementasi. Pemeriksaan import mencakup struktur CSV, header, schema, tanggal, IP, URL, dan nilai bilangan bulat; kegagalan penyimpanan dibedakan dari kesalahan data. Respons import tidak mengirim dokumen event lengkap untuk setiap baris sukses. Indeks unik pada `click_id` mencegah identifier event yang sama disimpan berulang kali. Rincian kontrak dan batasan tersedia di `docs/ENDPOINT_IMPORT_DATASET.md`.

Label `is_fraudulent` yang tersedia pada dataset digunakan untuk pelatihan dan evaluasi terawasi. Sebelum menggunakan model untuk keputusan langsung, periksa kembali kualitas data, pemisahan data latih dan uji, serta kemungkinan kebocoran label. Hasil eksperimen offline tidak otomatis berarti model sudah terhubung ke API untuk prediksi real-time.

## Dokumentasi Tambahan

Folder `docs/` berisi catatan desain, kontrak endpoint Aktivitas 28, serta panduan untuk menjalankan dan memverifikasi backend. Baca dokumen yang relevan sebelum mengubah struktur data, endpoint, atau skenario tes. README ini menjelaskan gambaran repository secara keseluruhan dan tidak menggantikan spesifikasi teknis pada dokumen terkait.
