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


## 8. Profil Dataset dan Cara Kerja ML

Dataset `backend/dataset/click_fraud_dataset.csv` berisi 5.000 event klik dan 22 kolom (21 atribut dan 1 label). Unit observasinya sama-sama event klik, tetapi atributnya heterogen karena mencakup perangkat, browser, OS, URL/referrer, perilaku klik, posisi iklan, reputasi jaringan, dan label. Distribusi label sumber adalah 3.759 Valid (75,18%) dan 1.241 Fraud (24,82%). Dataset ini tidak memuat brand, produk, advertiser, campaign ID, ad ID, atau kategori produk. `ad_position` hanya menunjukkan posisi iklan Top/Side/Bottom, sehingga merek iklan tidak dapat diidentifikasi dari file ini.

`is_fraudulent` menjadi target supervised learning (0=Valid, 1=Fraud). Pipeline Random Forest menggunakan 15 fitur numerik/kategorikal yang dibentuk dari waktu, perilaku klik, perangkat, browser, OS, posisi iklan, reputasi IP, VPN, dan proxy. Label tidak dikirim sebagai fitur ketika event baru diprediksi. `bot_likelihood_score` tetap dipertahankan dan diaudit terpisah, tetapi **tidak dimasukkan ke fitur model utama**: pada dataset ini seluruh skor Valid berada pada 0,00–0,75, sedangkan Fraud 0,76–1,00 (pemisahan sempurna). Tanpa bukti bahwa skor dibuat secara independen dari label, penggunaannya akan berisiko target leakage dan membuat performa terlihat sempurna secara semu.

Performa model tanpa skor tersebut perlu dinilai secara jujur. Setelah dilatih ulang dengan 15 fitur non-score pada split stratified 80:20 (random_state 42), model menghasilkan Accuracy 75,10%, Precision Fraud 0,00%, Recall Fraud 0,00%, F1 Fraud 0,00%, dan ROC-AUC 53,07%; baseline kelas mayoritas memperoleh Accuracy 75,20%. Dengan demikian model belum memiliki kemampuan deteksi fraud yang memadai, sehingga akurasi di atas 95% belum dapat diklaim dari data yang tersedia. Rincian analisis, cara baca label, risiko leakage, metrik training ulang, dan kebutuhan pengayaan data terdapat pada [`docs/ANALISIS_DATASET_ML_CLICKGUARD.md`](docs/ANALISIS_DATASET_ML_CLICKGUARD.md). Dokumen analisis tersebut juga memetakan kondisi aktual terhadap seluruh butir *Hasil yang Diharapkan* pada `Konsep.docx`, termasuk batas integrasi prediksi otomatis dan mitigasi anggaran melalui platform iklan.

Untuk mengaudit dan melatih ulang model dari dataset yang ada, jalankan dari root workspace:

```bash
npm run audit:dataset
cd backend
python ml/feature_engineering.py
python ml/train_model.py
```

Setelah training selesai, jalankan layanan model pada terminal tersendiri dengan `python ml/prediction_api.py`. Backend Express menggunakan `ML_API_URL=http://127.0.0.1:8000` untuk `/api/predict` dan `PREDICTION_URL=http://127.0.0.1:8000/predict` untuk route uji real-time. Pastikan kedua variabel tersebut tersedia di `backend/.env`. Route ingest real-time tidak menggunakan prediksi mock: jika layanan Python tidak aktif, event disimpan dengan status `unavailable`. Restart layanan Python setelah model dilatih ulang agar artefak terbaru dimuat.

Halaman hero hanya menjelaskan tujuan dan alur kerja sistem; halaman pembuka tidak menampilkan ringkasan angka hasil dashboard. Grafik Traffic overview menghubungkan seluruh titik Valid dengan garis trafik biru dan seluruh titik Fraud dengan garis trafik merah, sehingga perubahan naik/turun terlihat antarbucket. Garis putus-putus amber adalah **UCL 3-sigma p-chart** yang mengikuti baseline fraud rate dan total klik setiap interval. Titik Fraud di atas ambang perlu ditinjau; titik di bawah/tepat pada ambang masih dalam variasi statistik historis, tetapi bukan jaminan bebas fraud. Ikon bantuan pada judul Traffic overview membuka modal yang menjelaskan garis trafik, threshold, dan cara interpretasinya. Threshold merupakan indikator monitoring agregat, bukan pengganti keputusan klasifikasi ML.

## Bootstrap hasil model dan Blocked IPs

Saat backend dijalankan, API otomatis menyinkronkan metrik dari `backend/ml/results/model_metrics.csv` ke collection `model_runs` dan membangun blocklist historis dari event dengan label aktual Fraud ke collection `blocked_ips`. Pada penggunaan pertama, pastikan 5.000 event pada `backend/dataset/click_fraud_dataset.csv` sudah diimpor ke MongoDB melalui `POST /api/events/import`. Dari root workspace, jalankan perintah berikut setelah backend aktif:

```powershell
curl.exe -X POST "http://localhost:5000/api/events/import" -H "Content-Type: text/csv" --data-binary "@backend/dataset/click_fraud_dataset.csv"
```

Jika database masih kosong, respons yang diharapkan adalah `successCount: 5000`. Pada dataset saat ini terdapat 1.241 IP unik dengan label Fraud; sinkronisasi akan membuat entri historis untuk IP tersebut di collection `blocked_ips`. Jika data sudah ada, restart backend agar proses bootstrap menyinkronkan ulang collection tersebut, termasuk ketika import ulang hanya menemukan `click_id` duplikat. Sinkronisasi juga berjalan setelah setiap permintaan import berhasil diproses. Prosesnya idempoten. Entri historis diberi sumber `historical_dataset_label`, sedangkan IP yang diblokir dari prediksi runtime diberi sumber `ml_prediction`.

Untuk memproses klik baru secara real-time, kirim event lengkap ke `POST /api/realtime/ingest`. Pastikan layanan Python ML berjalan dan `PREDICTION_URL` mengarah ke `/predict`. Bila layanan ML tidak tersedia, event tetap dicatat dengan status `unavailable`; API tidak menggunakan prediksi tiruan.

Catatan target: metrik model yang tersedia masih di bawah target akurasi >95%. Jangan memasukkan `bot_likelihood_score` ke fitur training utama karena kolom tersebut memisahkan label dataset secara sempurna dan menimbulkan target leakage. Lihat `backend/docs/KONDISI_PENCAPAIAN_KONSEP.md` untuk rincian dan rekomendasi. Blocklist internal juga belum sama dengan pemblokiran otomatis pada platform iklan eksternal; hal tersebut memerlukan akses API resmi provider.


## 9. Dataset terverifikasi dan pelatihan model tambahan

Pipeline training dibedakan berdasarkan unit label; hasil model antar-pipeline tidak boleh diperlakukan sebagai metrik yang sama:

| Pipeline | Unit prediksi | Sumber label | Dataset yang diperlukan |
|---|---|---|---|
| `backend/ml/train_fdma_publisher_model.py` | Publisher | Status `Fraud`/`OK` dari BuzzCity; `Observation` dikecualikan | Enam CSV FDMA 2012 yang diperoleh dan diizinkan pemilik data |
| `backend/ml/train_verified_click_model.py` | Click individual | Label klik independen yang dapat ditelusuri | `backend/dataset/click_fraud_verified.csv` + manifest |
| `backend/ml/train_google_ads_campaign_model.py` | Campaign-day | Google Ads `metrics.invalid_clicks > 0` | Hasil sinkronisasi akun Google Ads |

Perintah dari root:

```bash
npm run train:fdma-publisher
npm run train:verified-click
npm run train:google-ads
```

FDMA memiliki sekitar 8,46 juta click records pada tiga split, tetapi labelnya tingkat publisher dan berasal dari data 2012. Pipeline tidak mengubah label itu menjadi label klik. Dataset mentah tidak disertakan; ikuti `backend/dataset/fdma2012/README.md` dan pastikan akses/lisensi.

Untuk model click-level, file `click_fraud_verified.csv` tidak disediakan karena ZIP belum memiliki sumber label klik yang independen dan dapat diverifikasi. Isi file dan manifest hanya setelah pemilik data memperoleh hasil invalid-traffic/audit yang terhubung ke setiap click ID. Skrip membutuhkan minimal 10.000 baris, 500 contoh per kelas, 30 tanggal unik, dan split kronologis 80/20. `bot_likelihood_score` dikecualikan dari fitur dan tidak boleh menjadi dasar label.

Untuk model risiko campaign-day, sambungkan Google Ads, sinkronkan minimal 90–180 hari jika tersedia, lalu latih ulang. Model membentuk fitur hanya dari metrik hari sebelumnya dan menguji hasil secara kronologis 60/20/20 (train/validation/test); hari yang tidak memiliki record tepat sehari sebelumnya tidak dipakai. Threshold dipilih pada validation dan hasil akhir dilaporkan pada test. Data Google Ads berlabel `metrics.invalid_clicks` bersifat agregat kampanye-hari, bukan data click-level atau stream real-time. TalkingData `is_attributed` juga bukan label fraud.

## 10. Google Ads API OAuth dan mitigasi eksternal

Integrasi resmi Google Ads REST API v26 telah ditambahkan. Konfigurasi OAuth refresh token, Customer ID, Manager Customer ID opsional, API access level, action key, dan langkah pengujian dijelaskan di [`backend/docs/GOOGLE_ADS_ML_SETUP.md`](backend/docs/GOOGLE_ADS_ML_SETUP.md).

Ringkasan kemampuan:

- OAuth scope Google Ads disimpan server-side; `backend/.env` tidak disertakan/di-commit.
- Daftar akun, kampanye, metrics invalid clicks, dan IP exclusions dibaca melalui API.
- Data `metrics.invalid_clicks` dapat disinkronkan ke dataset campaign-day dan dipakai melatih model risiko agregat.
- Admin dapat meminta status kampanye menjadi `PAUSED` atau menambahkan pengecualian IP/CIDR setelah memasukkan action key dan konfirmasi persis.
- Mutasi dinonaktifkan secara default. Sistem tidak melakukan pause otomatis berdasarkan model. Data invalid clicks merupakan laporan agregat tanggal; sinkronisasi dilakukan manual/batch, jadi integrasi ini belum menjamin mitigasi otomatis seketika atau perubahan anggaran harian otomatis.
- Google Ads invalid-click metrics tidak menyertakan IP individual; jangan mengubah angka agregat itu menjadi daftar IP.

Untuk akses baru per November 2026, akses API Google Ads dikelola melalui Google Cloud project; ikuti halaman API Overview dan persyaratan akses Test/produksi terkini. Jangan menambahkan developer token lama ke kode atau ZIP. Akses produksi, OAuth user, Customer ID, dan tindakan iklan memerlukan konfigurasi/persetujuan langsung dari pemilik akun. Untuk OAuth external app berstatus Testing dengan scope Google Ads, refresh token dapat kedaluwarsa setelah 7 hari; gunakan status publikasi/produksi dan penuhi verifikasi Google untuk koneksi jangka panjang.
