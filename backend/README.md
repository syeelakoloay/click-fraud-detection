# Sistem Deteksi Fraud Klik Iklan Digital Menggunakan Machine Learning

## Gambaran Proyek

Repository ini menggabungkan pengolahan data dan klasifikasi *click fraud* dengan layanan backend untuk menyimpan event, menyediakan API, dan mendukung monitoring. Bagian data dan machine learning berisi proses *feature engineering*, analisis karakteristik data, pelatihan model klasifikasi, serta evaluasi model. Bagian backend menggunakan Node.js, Express.js, Mongoose, dan MongoDB untuk mengelola data event, hasil model, informasi IP yang diblokir, dan metrik monitoring.

Sumber data utama adalah `dataset/click_fraud_dataset.csv`, yang terdiri atas 5.000 event dengan 22 kolom, termasuk `budget` sebagai nilai anggaran dummy per klik. Kolom `is_fraudulent` berfungsi sebagai label klasifikasi, dengan nilai `0` untuk non-fraud dan nilai `1` untuk fraud sesuai dataset. Artefak pengolahan data serta hasil pelatihan yang tersedia di repository merupakan hasil proses sebelumnya dan perlu ditinjau kembali sebelum digunakan dalam eksperimen atau keputusan operasional baru. Nilai numerik pada kolom `budget` dipertahankan sebagaimana tersimpan. Frontend menampilkan nominal tersebut dengan simbol `$` dan format `$1,250.75` tanpa konversi kurs atau perubahan nilai. Tidak diperlukan migrasi database untuk perubahan format tampilan.

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
| `POST` | `/api/predict` | Meneruskan fitur ke layanan Python ML dan mengembalikan hasil prediksi CPA Valid/Fraud. |
| `POST` | `/api/predict/martech` | Menjalankan benchmark terpisah pada payload MarTech. |
| `POST` | `/api/predict/web-robot` | Mengklasifikasikan fitur agregat sesi web menjadi Human/Robot; bukan label Fraud/Valid klik. |
| `POST` | `/api/realtime/ingest` | Memproses event baru dengan pengecekan blocklist dan prediksi ML, lalu menyimpan event serta hasil prediksi. |
| `POST` | `/api/realtime/test-history` | Route pengujian prediksi dengan riwayat IP; event uji tidak disimpan ke collection `events`. |

### Real-Time Prediction dan Mitigasi IP

Repository backend pada branch `finkly/task27-integration` sudah memuat dua jalur prediksi yang perlu dibedakan:

1. `POST /api/predict` merupakan endpoint prediksi utama. Backend menyiapkan 15 fitur apabila body berisi event dengan `timestamp`, lalu meneruskan fitur ke layanan Python ML menggunakan `ML_API_URL` (default `http://127.0.0.1:8000`) dan mengembalikan respons layanan Python.
2. `POST /api/realtime/test-history` merupakan route pengujian alur real-time dengan riwayat IP. Service memvalidasi event, memeriksa apakah IP sudah diblokir, mengambil riwayat IP dalam jendela waktu yang dikonfigurasi, dan mengirim 15 fitur ke endpoint Python. Apabila hasil model berlabel fraud (`label = 1`), IP dimasukkan ke collection `blocked_ips`; event berikutnya dari IP yang sama dikenali melalui daftar blokir sebelum model dipanggil.

Route `/api/realtime/test-history` **tidak menyimpan event uji ke collection `events`** dan hanya dipertahankan untuk kompatibilitas pengujian. Untuk event baru, `POST /api/events` mempertahankan kontrak respons `{ data }` dan menjalankan deteksi jika payload berisi seluruh 13 fitur runtime; metadata hasilnya ditambahkan sebagai `detection`. `POST /api/realtime/ingest` tetap menjadi endpoint eksplisit untuk ingestion+deteksi. Hasil prediksi ML disimpan terpisah dari label aktual. Model CPA sekarang berada dalam mode `shadow_only` sampai artefak metrik melewati quality gate; prediksi ML tidak memblokir IP ketika gate gagal. Aturan burst perilaku yang konservatif dapat memblokir secara internal dan mencoba pengecualian Google Ads hanya bila konfigurasi mutasi/auto-exclude aktif dan event memiliki `campaign_id` yang sama dengan campaign target.

Daftar IP dibaca melalui `GET /api/blocked-ips`. Schema `BlockedIP` menyimpan sumber (`historical_dataset_label`, `ml_prediction`, `behavioral_rule`, atau `manual`), waktu, alasan deteksi, serta status sinkronisasi Google Ads. Auto-block berbasis ML mensyaratkan model readiness yang lulus ambang accuracy >95%, precision/recall/F1 Fraud ≥90%, dan ROC-AUC ≥90%; model saat ini belum lulus. Aturan burst juga bukan bukti identitas Fraud dan perlu dikalibrasi pada traffic produksi sebelum mutasi eksternal diaktifkan.

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

### Windows PowerShell: gunakan virtual environment tanpa aktivasi

Pada Windows, aktivasi `backend\.venv\Scripts\Activate.ps1` dapat ditolak oleh PowerShell Execution Policy. **Aktivasi tidak wajib.** Jalankan interpreter virtual environment secara langsung; cara ini tidak memerlukan perubahan Execution Policy dan tidak mengubah konfigurasi keamanan Windows. Jalankan perintah berikut dari root workspace (`click-fraud-detection`):

```powershell
py -3 -m venv backend\.venv
backend\.venv\Scripts\python.exe -m pip install --upgrade pip
backend\.venv\Scripts\python.exe -m pip install -r backend\ml\requirements.txt
backend\.venv\Scripts\python.exe backend\ml\prediction_api.py
```

Jika `backend\.venv\Scripts\python.exe` sudah ada, lewati baris pertama. Untuk mempermudah, Anda juga dapat menjalankan `scripts\setup-ml-env.cmd` satu kali, kemudian `scripts\start-ml-api.cmd` setiap kali ingin memulai layanan Python. Kedua file `.cmd` tersebut tidak menjalankan `Activate.ps1`.

Alternatif (opsional) jika Anda memang ingin mengaktifkan venv di sesi PowerShell saat ini, jalankan `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass` lalu aktivasi. Perubahan scope `Process` hanya berlaku untuk sesi PowerShell tersebut dan hilang setelah sesi ditutup. Gunakan pilihan ini hanya bila kebijakan organisasi tidak mengunci eksekusi skrip.

### Linux/macOS

```bash
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install --upgrade pip
backend/.venv/bin/python -m pip install -r backend/ml/requirements.txt
backend/.venv/bin/python backend/ml/prediction_api.py
```

Untuk menjalankan skrip analisis/training, gunakan interpreter virtual environment yang sama. Pada Windows, gunakan `backend\.venv\Scripts\python.exe`; pada Linux/macOS, gunakan `backend/.venv/bin/python`. Jangan bergantung pada `python` global karena paket dapat terpasang di interpreter yang berbeda.

Jalankan skrip sesuai urutan berikut untuk membentuk fitur, menghasilkan analisis, melatih model, dan memeriksa feature importance.

```powershell
# Jalankan dari root workspace Windows
backend\.venv\Scripts\python.exe backend\ml\feature_engineering.py
backend\.venv\Scripts\python.exe backend\ml\analyze_features.py
backend\.venv\Scripts\python.exe backend\ml\train_model.py
backend\.venv\Scripts\python.exe backend\ml\diagnose_model.py

# Model pendamping sesi Web Robot (label Human/Robot, bukan click-fraud)
backend\.venv\Scripts\python.exe backend\ml\train_web_robot_model.py

# Benchmark akun Twitter (label human/bot, tidak terhubung ke API live)
backend\.venv\Scripts\python.exe backend\ml\train_twitter_bot_benchmark.py

# Smoke test endpoint Web Robot (prediction_api.py harus sedang berjalan)
backend\.venv\Scripts\python.exe backend\ml\test_web_robot_api.py
```

Proses feature engineering menghasilkan `ml/click_fraud_features.csv` serta audit rentang skor bot di `ml/results/bot_score_leakage_audit.csv`. Analisis menyimpan perbandingan fitur numerik dan tingkat fraud pada kategori, sedangkan pelatihan menyimpan model dan metrik evaluasi ke `ml/results/`. Skrip diagnosis membaca model tersimpan dan menghasilkan daftar feature importance.

Setelah model berhasil dilatih, jalankan layanan prediksi pada terminal terpisah dari folder `backend`:

```powershell
# Jalankan dari root workspace Windows
backend\.venv\Scripts\python.exe backend\ml\prediction_api.py
```

Layanan Python memuat model CPA utama dan, bila artefaknya tersedia, benchmark LightGBM MarTech serta model Web Robot. Endpoint `GET /health` menampilkan readiness ketiganya. `POST /predict` tetap menerima skema 15 fitur CPA; `POST /predict/martech` memakai skema MarTech; dan `POST /predict/web-robot` menerima 33 fitur numerik yang diagregasi pada tingkat sesi web. Backend Express meneruskan ketiganya melalui `/api/predict`, `/api/predict/martech`, dan `/api/predict/web-robot`. Model Web Robot menghasilkan label Human/Robot, bukan Valid/Fraud, dan selalu `automation_eligible: false`. Fitur sesi tidak dibentuk otomatis dari satu event oleh alur `/api/events`, sehingga endpoint ini hanya digunakan ketika sistem pengumpul log menyediakan agregat sesi. Model Web Robot tidak dihubungkan ke auto-block atau tindakan Google Ads. Restart layanan Python setelah model dilatih ulang. Jika layanan tidak aktif, event tetap disimpan dengan status `unavailable`, bukan diberi hasil prediksi mock.

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

Folder `docs/` berisi catatan desain, kontrak endpoint Aktivitas 28, serta panduan untuk menjalankan dan memverifikasi backend. Penjelasan dataset Web Robot dan Twitter, metrik terpisah, serta batas integrasinya tersedia di `docs/INTEGRASI_DATASET_WEB_ROBOT_TWITTER.md`. Baca dokumen yang relevan sebelum mengubah struktur data, endpoint, atau skenario tes. README ini menjelaskan gambaran repository secara keseluruhan dan tidak menggantikan spesifikasi teknis pada dokumen terkait.


## Catatan dataset dan pencegahan target leakage

Dataset acuan terdiri dari 5.000 event klik, dengan 3.759 label Valid dan 1.241 label Fraud. `is_fraudulent` merupakan target supervised learning, bukan fitur input prediksi. `bot_likelihood_score` pada dataset yang tersedia memisahkan kedua label secara sempurna (Valid 0,00–0,75; Fraud 0,76–1,00). Karena asal-usul skor tidak terdokumentasi, pipeline training mengecualikannya dari fitur utama untuk menghindari target leakage. Skrip `ml/feature_engineering.py` menghasilkan audit rentang skor pada `ml/results/bot_score_leakage_audit.csv`.

Model utama menggunakan 15 fitur dari waktu, perilaku klik, perangkat, browser, OS, posisi iklan, reputasi IP, VPN, dan proxy. Fitur tersebut konsisten dengan kontrak runtime pada `predictionFeatureService.js` dan `ml/prediction_api.py`. Training ulang terbaru menghasilkan Accuracy 75,10%, Precision Fraud 0,00%, Recall Fraud 0,00%, F1 Fraud 0,00%, dan ROC-AUC 53,07%; baseline kelas mayoritas memperoleh Accuracy 75,20%. Artinya, model non-leakage belum dapat mengenali kelas Fraud dengan memadai. Kualitas prediksi tetap harus dinilai melalui recall, precision, F1, ROC-AUC, confusion matrix, serta data uji yang independen; model ini belum layak menjadi satu-satunya dasar pemblokiran otomatis. Dataset ini tidak memiliki nama brand/produk/advertiser/campaign, sehingga jenis produk iklan tidak dapat diidentifikasi. Analisis lengkap berada di `docs/ANALISIS_DATASET_ML_CLICKGUARD.md`.

### Bootstrap hasil evaluasi dan blocklist historis

`npm start` menyinkronkan `ml/results/model_metrics.csv` ke MongoDB collection `model_runs`, serta menyinkronkan IP dari event dengan label aktual Fraud ke collection `blocked_ips`. Proses sinkronisasi dijalankan kembali setelah import CSV atau batch ingestion dan bersifat idempoten. Sumber tiap IP disimpan sebagai `historical_dataset_label` atau `ml_prediction`.

Untuk event baru yang belum memiliki label aktual, gunakan `POST /api/events` (jika seluruh fitur runtime lengkap) atau `POST /api/realtime/ingest`. Sertakan `campaign_id: "3426120099"` hanya bila klik tersebut memang berasal dari campaign `advertising`. Header User-Agent diterima backend dan disimpan terpisah. Event tetap disimpan saat layanan ML tidak tersedia; tidak ada prediksi mock yang dikembalikan.


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


## Update integrasi MarTech dan Google Ads (23 November 2026)

### Dataset tambahan MarTech

- Dataset CPA asli `dataset/click_fraud_dataset.csv` tetap dipertahankan dan tidak ditimpa.
- Dataset tambahan tersimpan di `ml/datasets/martech/train.csv` (500.000 baris berlabel). Sumber mendeskripsikannya sebagai data simulasi/anonymized dari challenge advertising click fraud; makna beberapa fitur disamarkan.
- Label MarTech: `0 = Normal`, `1 = Fraud/cheating`. `test1.csv` tidak disertakan karena tidak diperlukan untuk training dan tidak memiliki label; `Best.csv` adalah prediksi submission, bukan ground truth.
- Model MarTech LightGBM berada pada namespace terpisah, artefak `ml/results/martech_lightgbm_model.txt`, dan hanya tersedia sebagai benchmark. Jangan menggunakannya untuk memblokir event CPA.
- Jalankan `npm run train:martech` dari root atau `npm run train:martech` dari `backend`. Training menggunakan split kronologis 70/15/15; feature selection dan kategori dipelajari dari train saja; `sid`, indeks, dan label tidak menjadi fitur.
- Hasil test terbaru tersimpan di `ml/results/martech_model_metrics.json`. Nilai yang dapat direproduksi pada ZIP ini: accuracy 88,136%, precision Fraud 86,967%, recall Fraud 88,923%, F1 Fraud 87,934%, ROC-AUC 94,031%, PR-AUC 93,046% (75.000 test rows; threshold dipilih pada validation). Angka ini belum memenuhi target accuracy >95%.
- Repository sumber tidak menyertakan dokumen lisensi dataset. Simpan arsip dan dokumentasi sumber; verifikasi izin sebelum redistribusi/publikasi.

### Google Ads test account dan campaign target

Konfigurasi default proyek sudah memuat Customer ID `3425120099`, Campaign ID `3426120099`, dan nama campaign `advertising` pada `backend/.env.example`. ID ini adalah konfigurasi yang diberikan pemilik proyek dan tetap harus diverifikasi lewat read-only API setelah OAuth disiapkan. Jangan memasukkan OAuth Client Secret atau refresh token ke chat atau repository.

Google Ads auto-exclusion memiliki dua sakelar SAFE-OFF: `GOOGLE_ADS_MUTATIONS_ENABLED=false` dan `GOOGLE_ADS_AUTO_EXCLUDE_ENABLED=false`. Setelah autentikasi read-only berhasil, campaign ID dan nama campaign cocok, serta pengujian test-account disetujui, administrator dapat mengaktifkannya pada `backend/.env`. Event yang ingin memicu pengecualian wajib menyertakan `campaign_id` yang sama persis dengan `3426120099`; event tanpa campaign mapping hanya dapat menghasilkan mitigasi internal. Alamat yang dikirim otomatis dibatasi ke IPv4 publik tunggal. Campaign channel tertentu mungkin tidak mendukung IP exclusion pada level campaign; service memeriksa tipe campaign sebelum melakukan mutasi.

Contoh tambahan pada event baru:

```json
{
  "click_id": "click-unique-001",
  "campaign_id": "3426120099",
  "ip_address": "8.8.8.8",
  "timestamp": "2026-11-23T10:00:00.000Z"
}
```

Contoh tersebut hanya potongan field; seluruh field event dan 13 fitur runtime yang diwajibkan tetap harus dikirim. `user_agent` dapat diambil backend dari HTTP request header.

Test account dapat membuktikan autentikasi dan penerimaan perubahan konfigurasi, tetapi tidak menayangkan iklan dan tidak mempunyai biaya aktual. Karena itu, test account tidak dapat membuktikan jumlah biaya aktual yang dihemat. Untuk bukti pengurangan belanja aktual diperlukan pengujian terkontrol pada campaign produksi dengan persetujuan pemilik akun dan data biaya/klik yang sah. Metrik `metrics.invalid_clicks` Google Ads merupakan agregat pelaporan, bukan stream per klik atau daftar IP individu.
