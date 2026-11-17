# Sistem Deteksi Fraud Klik Iklan Digital Menggunakan Machine Learning

## Gambaran Proyek

Repository ini menggabungkan pengolahan data dan klasifikasi *click fraud* dengan layanan backend untuk menyimpan event, menyediakan API, dan mendukung monitoring. Bagian data dan machine learning berisi proses *feature engineering*, analisis karakteristik data, pelatihan model klasifikasi, serta evaluasi model. Bagian backend menggunakan Node.js, Express.js, Mongoose, dan MongoDB untuk mengelola data event, hasil model, informasi IP yang diblokir, dan metrik monitoring.

Sumber data utama adalah `dataset/click_fraud_dataset.csv`, yang terdiri atas 5.000 event dengan 22 kolom, termasuk `budget` sebagai estimasi biaya per klik dalam Rupiah (data dummy). Kolom `is_fraudulent` berfungsi sebagai label klasifikasi, dengan nilai `0` untuk non-fraud dan nilai `1` untuk fraud sesuai dataset. Artefak pengolahan data serta hasil pelatihan yang tersedia di repository merupakan hasil proses sebelumnya dan perlu ditinjau kembali sebelum digunakan dalam eksperimen atau keputusan operasional baru.

## Ruang Lingkup Sistem

### Feature Engineering dan ML Classification

Skrip pada folder `ml/` memvalidasi struktur dataset, membentuk fitur waktu dari `timestamp`, memisahkan fitur numerik dan kategorikal, membandingkan karakteristik data, serta melatih model Random Forest. Tahap pelatihan menyimpan artefak model dan ringkasan evaluasi agar hasil eksperimen dapat ditinjau kembali. Skrip diagnosis model menyusun peringkat *feature importance* dari model yang sudah dilatih.

Alur pengolahan data dimulai dari dataset sumber dan menghasilkan `ml/click_fraud_features.csv` sebagai masukan bagi proses analisis serta pelatihan. File dalam `ml/results/` mencakup model tersimpan, metrik klasifikasi, confusion matrix, classification report, perbandingan fitur numerik, tingkat fraud kategori, audit `bot_likelihood_score`, dan feature importance. Nilai performa terbaru harus dibaca bersama konteks fitur yang dipakai dan risiko target leakage; ringkasan hasil training ulang tersedia pada bagian catatan dataset di bawah.

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
| `POST` | `/api/realtime/ingest` | Memproses event baru dengan pengecekan blocklist dan prediksi ML, lalu menyimpan event serta hasil prediksi. |
| `POST` | `/api/realtime/test-history` | Route pengujian prediksi dengan riwayat IP; event uji tidak disimpan ke collection `events`. |

### Real-Time Prediction dan Mitigasi IP

Repository backend pada branch `finkly/task27-integration` sudah memuat dua jalur prediksi yang perlu dibedakan:

1. `POST /api/predict` merupakan endpoint prediksi utama. Backend menyiapkan 15 fitur apabila body berisi event dengan `timestamp`, lalu meneruskan fitur ke layanan Python ML menggunakan `ML_API_URL` (default `http://127.0.0.1:8000`) dan mengembalikan respons layanan Python.
2. `POST /api/realtime/test-history` merupakan route pengujian alur real-time dengan riwayat IP. Service memvalidasi event, memeriksa apakah IP sudah diblokir, mengambil riwayat IP dalam jendela waktu yang dikonfigurasi, dan mengirim 15 fitur ke endpoint Python. Apabila hasil model berlabel fraud (`label = 1`), IP dimasukkan ke collection `blocked_ips`; event berikutnya dari IP yang sama dikenali melalui daftar blokir sebelum model dipanggil.

Route `/api/realtime/test-history` **tidak menyimpan event uji ke collection `events`** dan hanya dipertahankan untuk kompatibilitas pengujian. Untuk pipeline event baru, gunakan `POST /api/realtime/ingest`: event disimpan ke collection `events`, hasil prediksi ML disimpan terpisah dari label aktual, dan IP dengan prediksi Fraud ditambahkan ke blocklist internal. Jika `PREDICTION_URL` tidak dikonfigurasi atau layanan Python tidak tersedia, event tetap disimpan dengan `prediction_status: "unavailable"`; sistem tidak membuat hasil mock.

Daftar IP dibaca melalui `GET /api/blocked-ips`. Schema `BlockedIP` menyimpan `ip_address`, sumber pencatatan (`historical_dataset_label`, `ml_prediction`, atau `manual`), waktu pemblokiran, waktu terakhir terlihat, serta jumlah event historis sumber bila tersedia. Pemblokiran pada alur real-time mengikuti hasil label model `1` dan belum menggunakan ambang probabilitas tambahan. Karena laporan evaluasi model baseline mencatat performa deteksi yang masih lemah, hasil prediksi tidak boleh diperlakukan sebagai bukti final fraud atau satu-satunya dasar keputusan operasional.

Detail pemetaan endpoint ke kebutuhan dashboard React, parameter, struktur respons, kode error, dan batas integrasi tercantum pada `docs/API_CONTRACT_AKTIVITAS_28.md`. Catatan implementasi serta bukti pengujian Aktivitas 27 tetap dirujuk untuk riwayat pekerjaan; nilai uji pada laporan tersebut bukan jaminan bahwa data atau status layanan akan sama pada sesi lain.
## Alur Kerja Tingkat Tinggi

1. Dataset sumber diperiksa dan diproses oleh skrip feature engineering.
2. Fitur hasil pengolahan dianalisis untuk membandingkan karakteristik event fraud dan non-fraud.
3. Model Random Forest dilatih dan dievaluasi, lalu artefaknya disimpan untuk diagnosis serta eksperimen lanjutan.
4. Backend menerima event melalui API dan menyimpan data pada MongoDB dengan validasi Mongoose.
5. Endpoint monitoring menyediakan ringkasan, metrik, dan agregasi traffic untuk kebutuhan observasi sistem.
6. Route `POST /api/realtime/ingest` menjalankan pemeriksaan blocklist, riwayat IP, prediksi Python, penyimpanan event, dan penambahan IP ke blocklist internal ketika prediksi Fraud. Route `POST /api/realtime/test-history` tetap tersedia untuk pengujian lama dan tidak menyimpan event.

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

Proses feature engineering menghasilkan `ml/click_fraud_features.csv` serta audit rentang skor bot di `ml/results/bot_score_leakage_audit.csv`. Analisis menyimpan perbandingan fitur numerik dan tingkat fraud pada kategori, sedangkan pelatihan menyimpan model dan metrik evaluasi ke `ml/results/`. Skrip diagnosis membaca model tersimpan dan menghasilkan daftar feature importance.

Setelah model berhasil dilatih, jalankan layanan prediksi pada terminal terpisah dari folder `backend`:

```bash
python ml/prediction_api.py
```

Layanan Python memuat `ml/results/random_forest_model.joblib` saat proses dimulai dan melayani `GET /health` serta `POST /predict` pada `http://127.0.0.1:8000`. Backend Express meneruskan 15 fitur yang sama melalui `ML_API_URL`; ingestion real-time memakai `PREDICTION_URL`. Restart layanan Python setiap kali model dilatih ulang. Jika layanan tidak aktif atau URL tidak dikonfigurasi, event baru tetap disimpan dengan status `unavailable`, bukan diberi hasil prediksi mock.

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


## Catatan dataset dan pencegahan target leakage

Dataset acuan terdiri dari 5.000 event klik, dengan 3.759 label Valid dan 1.241 label Fraud. `is_fraudulent` merupakan target supervised learning, bukan fitur input prediksi. `bot_likelihood_score` pada dataset yang tersedia memisahkan kedua label secara sempurna (Valid 0,00–0,75; Fraud 0,76–1,00). Karena asal-usul skor tidak terdokumentasi, pipeline training mengecualikannya dari fitur utama untuk menghindari target leakage. Skrip `ml/feature_engineering.py` menghasilkan audit rentang skor pada `ml/results/bot_score_leakage_audit.csv`.

Model utama menggunakan 15 fitur dari waktu, perilaku klik, perangkat, browser, OS, posisi iklan, reputasi IP, VPN, dan proxy. Fitur tersebut konsisten dengan kontrak runtime pada `predictionFeatureService.js` dan `ml/prediction_api.py`. Training ulang terbaru menghasilkan Accuracy 75,10%, Precision Fraud 0,00%, Recall Fraud 0,00%, F1 Fraud 0,00%, dan ROC-AUC 53,07%; baseline kelas mayoritas memperoleh Accuracy 75,20%. Artinya, model non-leakage belum dapat mengenali kelas Fraud dengan memadai. Kualitas prediksi tetap harus dinilai melalui recall, precision, F1, ROC-AUC, confusion matrix, serta data uji yang independen; model ini belum layak menjadi satu-satunya dasar pemblokiran otomatis. Dataset ini tidak memiliki nama brand/produk/advertiser/campaign, sehingga jenis produk iklan tidak dapat diidentifikasi. Analisis lengkap berada di `docs/ANALISIS_DATASET_ML_CLICKGUARD.md`.

### Bootstrap hasil evaluasi dan blocklist historis

`npm start` menyinkronkan `ml/results/model_metrics.csv` ke MongoDB collection `model_runs`, serta menyinkronkan IP dari event dengan label aktual Fraud ke collection `blocked_ips`. Proses sinkronisasi dijalankan kembali setelah import CSV atau batch ingestion dan bersifat idempoten. Sumber tiap IP disimpan sebagai `historical_dataset_label` atau `ml_prediction`.

Untuk event baru yang belum memiliki label aktual, gunakan `POST /api/realtime/ingest`. Layanan Python pada `PREDICTION_URL` harus aktif. Event tetap tersimpan jika ML tidak tersedia, tetapi statusnya `unavailable`; tidak ada prediksi mock yang dikembalikan.


## Dataset terverifikasi dan Google Ads API

Panduan lengkap dan batasan setiap dataset/model berada di `docs/GOOGLE_ADS_ML_SETUP.md`.

- `python ml/train_fdma_publisher_model.py` melatih model publisher-level dari dataset FDMA 2012 BuzzCity setelah enam CSV sumber yang sah ditempatkan di `dataset/fdma2012/`. Labelnya adalah status publisher `Fraud`/`OK`, bukan label setiap klik.
- `python ml/train_verified_click_model.py` melatih model click-level hanya jika `dataset/click_fraud_verified.csv` dan manifest label independen tersedia. Pipeline menolak dataset demo yang belum diverifikasi dan mengecualikan `bot_likelihood_score`.
- `python ml/train_google_ads_campaign_model.py` melatih model risiko campaign-day hari berikutnya setelah OAuth Google Ads dan sinkronisasi metrik tersedia. Fitur hanya memakai metrik hari sebelumnya; split kronologis adalah 60% train, 20% validation, 20% test.

Integrasi Google Ads v26 menggunakan OAuth 2.0 refresh token server-side. Isi `backend/.env` berdasarkan `.env.example`, uji read-only dahulu, lalu aktifkan mutasi hanya dengan persetujuan admin. Tindakan pause dan IP exclusion membutuhkan action key serta konfirmasi eksplisit. Metrik invalid clicks merupakan laporan agregat kampanye-hari; integrasi ini tidak menyediakan IP per klik, streaming event, atau pause otomatis. Jangan menganggapnya sebagai mitigasi biaya seketika.

Perintah terkait dari folder `backend`:

```bash
npm run test:google-ads
npm run train:fdma-publisher
npm run train:verified-click
npm run train:google-ads
```
