# Panduan Dataset ML Terverifikasi dan Integrasi Google Ads

Panduan ini melengkapi pipeline ClickGuard untuk dua tingkat analisis yang berbeda:

1. **Click-level fraud classification** — satu baris mewakili satu klik dan membutuhkan label independen untuk klik tersebut.
2. **Campaign-day risk classification** — satu baris mewakili satu kampanye pada satu tanggal dan menggunakan metrik invalid-click resmi Google Ads sebagai label agregat.

Kedua jenis model tidak boleh dicampur. Metrik Google Ads pada tingkat kampanye-hari tidak mengungkap klik individual, IP individual, atau click ID yang dinyatakan invalid.

## A. Dataset dan batas label

### A.1 Dataset penelitian FDMA 2012 BuzzCity

SMU Research Data mendeskripsikan dataset BuzzCity yang terdiri dari dua tabel: log klik dan profil publisher. Profil publisher memiliki status `Fraud`, `OK`, atau `Observation`; status Fraud diberikan kepada publisher yang dinilai memiliki bukti fraud dan akunnya ditangguhkan. Log klik memiliki `id`, `numericip`, `deviceua`, `publisherid`, `adscampaignid`, `usercountry`, `clicktime`, `publisherchannel`, dan `referredurl`.

Makna label tersebut adalah **publisher-level**, bukan click-level. Karena itu pipeline `ml/train_fdma_publisher_model.py` mengagregasi click logs menjadi fitur publisher dan mengklasifikasikan publisher. Skrip sengaja mengeluarkan status `Observation` dari training, tidak menggunakan publisher ID sebagai fitur, dan tidak mengklaim bahwa setiap click dari publisher Fraud telah diverifikasi sebagai fraud.

Publikasi kompetisi melaporkan 3.173.834 click records (train), 2.689.005 (validation), dan 2.598.815 (test), total 8.461.654 click records. Rentang waktunya adalah tiga hari untuk setiap split pada Februari–Maret 2012. Data ini besar, tetapi sudah lama; gunakan sebagai benchmark penelitian, bukan jaminan bahwa distribusi fraud iklan modern identik.

Halaman SMU saat ini menyediakan metadata dan deskripsi struktur data, tetapi saluran arsip lama yang ditautkan tidak lagi aktif. File mentah tidak disertakan di ZIP dan tidak diunduh otomatis karena akses/lisensi file harus dipastikan melalui SMU Research Data atau pemilik data. Dataset ini berasal dari 2012 sehingga berguna sebagai benchmark besar berlabel independen pada tingkat publisher, tetapi tidak otomatis representatif bagi pola iklan modern. Lakukan validasi eksternal pada data terkini sebelum dipakai untuk keputusan produksi. Lihat `dataset/fdma2012/README.md` untuk daftar file dan format yang diharapkan.

Enam file yang dibutuhkan:

- `dataset/fdma2012/train_clicks.csv` dan `train_publishers.csv`
- `dataset/fdma2012/validation_clicks.csv` dan `validation_publishers.csv`
- `dataset/fdma2012/test_clicks.csv` dan `test_publishers.csv`

Setelah data diperoleh dan izin penggunaannya dipastikan, jalankan dari folder `backend`:

```bash
python -m pip install -r ml/requirements.txt
python ml/train_fdma_publisher_model.py
```

Hasil test disimpan sebagai `ml/results/fdma_publisher_model_metrics.json`, confusion matrix, classification report, dan model `.joblib`. Threshold klasifikasi dipilih dari validation split, lalu hanya sekali dievaluasi pada test split. Hasilnya tetap publisher-level.

### A.2 Dataset click-level independen

File proyek `dataset/click_fraud_dataset.csv` yang berisi 5.000 baris tetap dipertahankan untuk demonstrasi dan evaluasi baseline, tetapi tidak dipakai oleh pipeline verified-click yang baru. Kolom `bot_likelihood_score` tidak boleh menjadi fitur atau sumber penetapan label. Nilai pada dataset lama menunjukkan pemisahan sempurna terhadap `is_fraudulent`, sehingga menggunakannya untuk training berisiko target leakage.

Untuk melatih model klik individual, pemilik proyek harus memperoleh data berlabel dari sumber yang benar-benar mempunyai bukti untuk masing-masing klik, misalnya hasil audit/feedback invalid-traffic dari jaringan iklan atau hasil investigasi yang dapat dikaitkan dengan click ID. Label agregat kampanye-hari Google Ads saja tidak cukup untuk mengisi label satu per satu.

Sediakan file `dataset/click_fraud_verified.csv` dengan kolom minimal seperti pada `dataset/click_fraud_verified.example.csv`. Skrip memakai fitur yang sudah ditentukan dan mengabaikan `bot_likelihood_score`, click/user ID, IP mentah, URL mentah, dan timestamp mentah sebagai prediktor. Persyaratan awal skrip:

- sedikitnya 10.000 baris dan sedikitnya 500 contoh untuk masing-masing kelas;
- `click_id` unik, `timestamp` valid, 30 tanggal unik atau lebih;
- label hanya 0/1 dan kedua label hadir pada train maupun test kronologis;
- manifest sumber dan metode verifikasi lengkap serta menyatakan bahwa label tidak dibuat dari `bot_likelihood_score`.

Salin `dataset/click_fraud_verified.manifest.example.json` menjadi `dataset/click_fraud_verified.manifest.json`, lalu isi dengan fakta yang dapat diaudit. Validasi manifest memeriksa kelengkapan isian dan konsistensi pernyataan; skrip tidak dapat membuktikan sendiri bahwa klaim sumber/label benar.

Jalankan dari folder `backend`:

```bash
python -m pip install -r ml/requirements.txt
python ml/train_verified_click_model.py
```

Skrip mengurutkan tanggal, menggunakan 80% tanggal paling awal untuk train, dan menyisihkan 20% tanggal terbaru sebagai holdout test. Preprocessing dipelajari di train saja. Hasilnya ditulis ke `ml/results/verified_click_*`. Tidak ada janji bahwa hasilnya akan mencapai akurasi 95%; angka aktual, balanced accuracy, precision, recall, F1, ROC-AUC, average precision, baseline mayoritas, tanggal split, dan hash dataset dicatat.

**Aktivasi model runtime dilakukan secara eksplisit setelah hasil test ditinjau.** Jangan menimpa model lama secara otomatis. Jika model verified-click terbukti layak, set path pada terminal yang menjalankan Python API lalu restart layanan:

PowerShell:

```powershell
$env:CLICK_MODEL_PATH = "ml/results/verified_click_random_forest_model.joblib"
python ml/prediction_api.py
```

Linux/macOS:

```bash
CLICK_MODEL_PATH=ml/results/verified_click_random_forest_model.joblib python ml/prediction_api.py
```

Model verified-click memakai 15 input runtime yang sama dengan API saat ini. Bila hasil uji tidak baik, jangan mengaktifkannya; model baseline tetap menjadi default.

### A.3 Dataset besar yang tidak boleh dianggap sebagai label fraud

TalkingData AdTracking memiliki sekitar 184,9 juta record click, tetapi target `is_attributed` menunjukkan apakah klik diikuti app download/attribution, bukan apakah klik itu fraudulent. Dataset itu dapat dipakai untuk riset attribution atau feature representation, tetapi tidak boleh digabung begitu saja sebagai label Fraud/Valid.

## B. Google Ads API — OAuth, akses akun, dan mitigasi

### B.1 Arsitektur dan keamanan

Backend memakai Google Ads REST API v26 dan OAuth 2.0 user authorization dengan scope:

`https://www.googleapis.com/auth/adwords`

OAuth refresh token dan client secret hanya dibaca oleh backend dari `backend/.env`. Tidak ada secret yang dimasukkan ke frontend atau ZIP. Google Ads API access level baru dikelola melalui Google Cloud project; untuk onboarding baru per dokumentasi yang berlaku sejak developer-token sunset September 2026, aktifkan API dan ajukan akses yang sesuai pada Google Ads API Overview di Cloud Console. Test access hanya mencakup test accounts; akses produksi memerlukan tingkat akses produksi yang disetujui.

Pengguna OAuth juga harus mempunyai izin yang memadai pada akun Google Ads target. Jika akun berada di bawah Manager Account (MCC), isi `GOOGLE_ADS_LOGIN_CUSTOMER_ID` dengan Customer ID manager tanpa tanda hubung. Jika tidak memakai MCC, biarkan kosong.

### B.2 Buat kredensial OAuth

1. Buat/pilih Google Cloud project yang akan memiliki OAuth client dan mengakses Google Ads API.
2. Aktifkan Google Ads API pada project tersebut. Buka halaman Google Ads API Overview di Cloud Console dan ajukan akses produksi jika ingin membaca/mengubah akun produksi. Untuk pengembangan awal, gunakan test account dan access level yang sesuai.
3. Konfigurasikan OAuth consent screen dan tambahkan akun Google yang digunakan sebagai test user bila consent screen masih berstatus Testing. Perhatian: untuk aplikasi OAuth eksternal berstatus Testing yang meminta scope Google Ads, otorisasi dan refresh token dapat kedaluwarsa setelah 7 hari. Untuk pemakaian berkelanjutan, siapkan status publikasi/produksi dan penuhi proses verifikasi Google yang berlaku; jangan mengandalkan token Testing sebagai koneksi permanen.
4. Buat OAuth Client ID jenis Web Application. Untuk menggunakan Google OAuth Playground sebagai alat memperoleh refresh token, tambahkan Authorized redirect URI `https://developers.google.com/oauthplayground`.
5. Buka Google OAuth Playground. Pada pengaturan (ikon roda gigi), aktifkan penggunaan OAuth credentials milik sendiri, lalu masukkan Client ID dan Client Secret dari project di atas.
6. Pada Step 1, minta scope `https://www.googleapis.com/auth/adwords`; pastikan alur meminta offline access/refresh token. Otorisasi menggunakan akun Google yang mempunyai akses ke Customer ID iklan.
7. Tukarkan authorization code pada Step 2 dan salin `refresh_token`. Simpan secara rahasia; jangan mengirimkannya ke percakapan, commit, screenshot publik, atau frontend.

Dokumentasi OAuth Google Ads dan Cloud project access dapat berubah; selalu ikuti halaman resmi yang ditautkan pada bagian Referensi.

### B.3 Isi konfigurasi server

Salin `backend/.env.example` menjadi `backend/.env`, lalu isi:

```dotenv
GOOGLE_ADS_CLIENT_ID=client-id-dari-google-cloud
GOOGLE_ADS_CLIENT_SECRET=client-secret-dari-google-cloud
GOOGLE_ADS_REFRESH_TOKEN=refresh-token-dari-oauth
GOOGLE_ADS_CUSTOMER_ID=1234567890
GOOGLE_ADS_LOGIN_CUSTOMER_ID=
GOOGLE_ADS_API_VERSION=v26
GOOGLE_ADS_MUTATIONS_ENABLED=false
GOOGLE_ADS_ACTION_KEY=buat-kunci-random-panjang
```

Buat action key acak dengan Node.js:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Simpan nilai tersebut hanya pada `backend/.env` dan berikan kepada administrator yang berwenang. File `.env` diabaikan oleh Git. Jangan mengaktifkan `GOOGLE_ADS_MUTATIONS_ENABLED` sebelum koneksi read-only selesai diperiksa.

Restart backend setelah mengubah `.env`:

```bash
cd backend
npm install
npm run dev
```

### B.4 Uji koneksi read-only

Buka dashboard → **Google Ads**. Masukkan `GOOGLE_ADS_ACTION_KEY` pada kolom kunci admin, lalu pilih **Hubungkan / Muat akun**. Pilih Customer ID yang benar dan **Tampilkan kampanye**. Pembacaan daftar akun, kampanye, pengecualian IP, dan status training dilindungi action key; route status dasar hanya mengembalikan status konfigurasi tanpa token.

API yang digunakan:

- `GET /api/google-ads/status`
- `GET /api/google-ads/customers`
- `GET /api/google-ads/campaigns?customerId=...`
- `GET /api/google-ads/campaigns/:campaignId/ip-exclusions?customerId=...`
- `POST /api/google-ads/training-data/sync`

Jika daftar akun kosong atau terjadi authorization error, pastikan akun OAuth mempunyai akses ke Customer ID, API access level project sesuai (test/production), dan `GOOGLE_ADS_LOGIN_CUSTOMER_ID` benar jika memakai MCC.

### B.5 Label independen Google Ads dan model campaign-day

API mengambil metrik `metrics.invalid_clicks` per kampanye dan tanggal. Label training dibuat sebagai:

`has_invalid_clicks = 1` jika `metrics.invalid_clicks > 0`; selain itu `0`.

Metrik ini adalah data hasil filtrasi Google Ads, bukan label `bot_likelihood_score`. Namun, level label adalah **campaign-day** (agregat kampanye per hari), bukan klik individual. Kolom `invalid_clicks`, `invalid_click_rate`, dan `has_invalid_clicks` dikecualikan dari fitur agar sumber label tidak bocor ke prediktor.

Pada halaman Google Ads pilih tanggal dan konfirmasi persis `SYNC GOOGLE ADS DATA`, lalu klik sinkronisasi. Rentang per permintaan dibatasi 365 hari. Untuk prediksi hari berikutnya, skrip hanya memakai fitur dari hari kalender sebelumnya untuk kampanye yang sama; baris tanpa data hari sebelumnya yang berurutan tidak dipakai. Model membagi tanggal secara kronologis menjadi train 60%, validation 20%, dan test 20%. Threshold dipilih pada validation saja, lalu hasil akhir dihitung pada test. Kumpulkan setidaknya 90–180 hari dan beberapa kampanye aktif; kebutuhan riil dapat lebih tinggi bila banyak tanggal kosong. Setelah dataset cukup, jalankan dari folder `backend`:

```bash
python ml/train_google_ads_campaign_model.py
```

Persyaratan awal skrip setelah pembuatan fitur lag ialah sedikitnya 150 campaign-day berurutan, 25 kelas positif, 25 kelas negatif, dan 30 tanggal unik. Train memakai 60% tanggal paling awal, validation 20% berikutnya, dan test 20% terbaru. Threshold dipilih pada validation; test hanya digunakan untuk evaluasi akhir. Jika data belum cukup atau salah satu label tidak muncul pada split, skrip tidak membuat model dan menulis status `insufficient_data`. Status dan metrik model bisa dimuat kembali dari halaman Google Ads dengan tombol **Muat hasil pelatihan**.

Model ini memperkirakan risiko invalid clicks untuk satu kampanye pada hari berikutnya dari metrik hari sebelumnya. Ini lebih cocok untuk peringatan dini dibanding memakai metrik hari yang sama, tetapi tetap **bukan** klasifikasi klik per klik. Metrik Google Ads yang diambil adalah data pelaporan agregat berdasarkan tanggal, bukan aliran event klik real-time; sinkronisasi dilakukan ketika admin memintanya. Google mendefinisikan `metrics.invalid_clicks` sebagai klik yang dianggap tidak sah dan tidak ditagihkan. Jadi metrik ini adalah sinyal kualitas traffic independen, bukan bukti nominal biaya fraud yang sudah dibayar pengiklan. Untuk mengukur kebocoran anggaran yang benar-benar tertagih, proyek masih memerlukan sumber investigasi/penagihan dan log klik yang menunjukkan traffic invalid yang lolos penyaringan. Karena itu integrasi ini belum menjamin pencegahan kebocoran anggaran secara otomatis dan seketika. Hasil model dapat membantu admin memutuskan pause atau pengecualian, tetapi tidak menjadi pemicu otomatis.

### B.6 Tindakan mitigasi pada kampanye

Mutasi eksternal tetap `OFF` secara default. Setelah izin, akun, Customer ID, kampanye, dan data read-only telah diverifikasi:

1. Untuk menonaktifkan penayangan, ubah `GOOGLE_ADS_MUTATIONS_ENABLED=true`, restart backend, pilih **Jeda** pada kampanye yang benar, kemudian ketik konfirmasi persis `PAUSE <campaignId>`. Aksi ini mengubah status kampanye menjadi `PAUSED`.
2. Untuk membatasi sumber tertentu, isi IP/CIDR yang sudah diverifikasi pada bagian pengecualian IP, pilih kampanye, dan ketik `EXCLUDE <campaignId>`. Backend menolak IP/CIDR tidak valid, menghindari duplikasi, dan memeriksa batas Google Ads hingga 500 pengecualian IP per kampanye. Ketersediaan IP exclusion bergantung pada jenis kampanye.
3. Setiap mutasi memerlukan action key admin, flag mutasi yang diaktifkan di server, dan konfirmasi persis. Tidak ada jeda otomatis dari hasil prediksi model. Tombol pause menghentikan seluruh kampanye yang dipilih; IP exclusion membatasi alamat IP tertentu bila tipe kampanye mendukungnya. Jangan gunakan invalid-click aggregate untuk menebak IP. Sistem belum mengubah anggaran harian secara otomatis dan belum menjalankan pemantauan streaming per klik.

Metrik `invalid_clicks` tidak menyertakan IP dari klik invalid. Karena itu, jangan menganggap angka invalid clicks bisa langsung dikonversi menjadi daftar IP; alamat IP yang akan dikecualikan harus berasal dari log sumber yang sah dan diperiksa secara terpisah. Uji pause dan exclusion terlebih dahulu pada akun/kampanye uji sebelum mengambil tindakan di akun produksi. Kampanye yang dijeda tidak akan menayangkan iklan sampai diaktifkan kembali; lakukan tindakan hanya setelah otorisasi pemilik akun.

### B.7 Batas kemampuan real-time dan anggaran

Integrasi ini sudah menyiapkan OAuth, pembacaan akun/kampanye, metrik invalid clicks, pause campaign, dan IP exclusion. Namun, dua kemampuan tidak boleh disamakan:

- **Tindakan kampanye melalui API:** admin dapat mengirim perintah pause setelah verifikasi. Eksekusi memerlukan akses produksi, izin pengguna, konfigurasi mutasi, dan konfirmasi manual.
- **Sumber sinyal invalid clicks:** `metrics.invalid_clicks` diambil sebagai metrik pelaporan per kampanye/tanggal. Itu bukan webhook atau stream setiap klik, dan API tidak mengembalikan IP individual dari klik invalid. Pengambilan data dan training dilakukan secara batch sesuai permintaan admin.

Dengan demikian, saat ini proyek menyediakan fondasi mitigasi melalui kontrol kampanye, tetapi belum menjadi sistem autonomous real-time yang secara otomatis menghentikan pengeluaran pada klik berikutnya. Untuk mendekati kebutuhan operasional, jadwalkan sinkronisasi setelah data Google Ads tersedia, buat alert ketika risiko hari berikutnya melewati ambang yang disetujui, lalu minta persetujuan admin untuk pause. Otomatisasi pause produksi hanya boleh ditambahkan setelah validasi metrik pada akun uji, kebijakan false-positive, pemulihan campaign, audit log, dan persetujuan pemilik akun.

## C. Urutan pekerjaan yang harus dilakukan pemilik proyek

1. **Dapatkan dataset FDMA** dari SMU/penulis dan pastikan lisensi/izin. Letakkan enam CSV sesuai `dataset/fdma2012/README.md`, kemudian jalankan `python ml/train_fdma_publisher_model.py`. Ini memberi hasil publisher-level dan benchmark historis.
2. **Kumpulkan label klik independen** untuk data terbaru. Jangan menggunakan TalkingData `is_attributed` sebagai Fraud label, dan jangan menggunakan `bot_likelihood_score`. Setelah `click_fraud_verified.csv` dan manifest benar-benar tersedia, jalankan `python ml/train_verified_click_model.py`.
3. Tinjau test metrics, confusion matrix, class counts, dan baseline. Target akurasi >95% hanya dapat dicentang apabila hasil pada test yang independen benar-benar melampaui target tanpa mengorbankan recall/precision Fraud dan tanpa leakage.
4. Siapkan Google Cloud project, OAuth, izin Google Ads, `backend/.env`, dan action key. Hubungkan secara read-only dulu.
5. Sinkronkan setidaknya 90–180 hari data kampanye bila tersedia. Jalankan `python ml/train_google_ads_campaign_model.py`, lalu tinjau metrik campaign-day di halaman Google Ads.
6. Aktifkan mutasi hanya setelah uji read-only dan pengujian akun uji sukses. Keputusan pause/exclusion di produksi harus disetujui admin. Jika Google OAuth consent screen masih berstatus Testing, ingat refresh token scope Google Ads dapat habis dalam 7 hari; publikasikan dan selesaikan verifikasi yang diperlukan untuk pemakaian jangka panjang.

## Referensi resmi/akademik

- SMU Research Data — BuzzCity mobile advertisement dataset: https://ink.library.smu.edu.sg/researchdata/22/
- Oentaryo et al. (2014), *Detecting Click Fraud in Online Advertising: A Data Mining Approach*, JMLR: https://www.jmlr.org/papers/volume15/oentaryo14a/oentaryo14a.pdf
- Google Ads API — developer-token sunset and access migration: https://developers.google.com/google-ads/api/docs/api-policy/developer-token
- Google Ads API — OAuth 2.0 internals and scope: https://developers.google.com/google-ads/api/docs/oauth/internals
- Google Ads API — campaign status: https://developers.google.com/google-ads/api/fields/v26/campaign
- Google Ads API — `metrics.invalid_clicks` / `metrics.invalid_click_rate`: https://developers.google.com/google-ads/api/fields/v26/metrics
- Google Ads API — campaign criterion IP exclusions: https://developers.google.com/google-ads/api/reference/rpc/v26/CampaignCriterion
- TalkingData AdTracking competition (target `is_attributed`): https://www.kaggle.com/c/talkingdata-adtracking-fraud-detection/data
