# ClickGuard - Workspace Aktivitas 28

Workspace ini menyatukan source frontend React/Vite dan backend Express/MongoDB yang sebelumnya berada pada dua ZIP terpisah. Struktur folder dibuat tetap agar kedua proyek dapat dikerjakan dan dijalankan dari satu direktori.

## Struktur

```text
click-fraud-detection/
├── frontend/
│   ├── src/                  # React + Vite dashboard
│   ├── tests/
│   └── scripts/
├── backend/
│   ├── src/                  # Express API + MongoDB
│   ├── ml/                   # Pipeline, model, dan evaluasi ML
│   ├── dataset/
│   ├── tests/
│   ├── scripts/
│   └── docs/
├── docs/                     # Runbook dan laporan verifikasi
├── scripts/                  # Shortcut setup dan start layanan ML
├── package.json              # Perintah workspace
└── README.md
```

Folder frontend dan backend tetap dipisahkan supaya dependency, konfigurasi, dan tanggung jawab masing-masing aplikasi tidak tercampur. Keduanya berada pada satu root workspace dan saling terhubung melalui HTTP API.

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
- `docs/RUNBOOK_WINDOWS.md` - langkah command Windows PowerShell.
- `docs/VERIFICATION_REPORT.md` - ringkasan tes yang sudah lulus dan batas verifikasi.


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

## 9. Bootstrap hasil model dan Blocked IPs

Saat backend dijalankan, API otomatis menyinkronkan metrik dari `backend/ml/results/model_metrics.csv` ke collection `model_runs` dan membangun blocklist historis dari event dengan label aktual Fraud ke collection `blocked_ips`. Pada penggunaan pertama, pastikan 5.000 event pada `backend/dataset/click_fraud_dataset.csv` sudah diimpor ke MongoDB melalui `POST /api/events/import`. Dari root workspace, jalankan perintah berikut setelah backend aktif:

```powershell
curl.exe -X POST "http://localhost:5000/api/events/import" -H "Content-Type: text/csv" --data-binary "@backend/dataset/click_fraud_dataset.csv"
```

Jika database masih kosong, respons yang diharapkan adalah `successCount: 5000`. Pada dataset saat ini terdapat 1.241 IP unik dengan label Fraud; sinkronisasi akan membuat entri historis untuk IP tersebut di collection `blocked_ips`. Jika data sudah ada, restart backend agar proses bootstrap menyinkronkan ulang collection tersebut, termasuk ketika import ulang hanya menemukan `click_id` duplikat. Sinkronisasi juga berjalan setelah setiap permintaan import berhasil diproses. Prosesnya idempoten. Entri historis diberi sumber `historical_dataset_label`, sedangkan IP yang terpicu oleh rule burst runtime diberi sumber `behavioral_rule`. Sumber `ml_prediction` hanya digunakan jika model kelak memenuhi quality gate dan izin auto-block diaktifkan.

Untuk memproses klik baru secara real-time, kirim event lengkap ke `POST /api/events` atau `POST /api/realtime/ingest`. Pastikan layanan Python ML berjalan dan `PREDICTION_URL` mengarah ke `/predict`. Rule burst server tetap berjalan sebelum request ML; bila layanan ML tidak tersedia dan rule tidak terpicu, event tetap dicatat dengan status `unavailable`. API tidak menggunakan prediksi tiruan.

Catatan target: metrik model yang tersedia masih di bawah target akurasi >95%. Jangan memasukkan `bot_likelihood_score` ke fitur training utama karena kolom tersebut memisahkan label dataset secara sempurna dan menimbulkan target leakage. Lihat `backend/docs/KONDISI_PENCAPAIAN_KONSEP.md` untuk rincian dan rekomendasi. Blocklist internal juga belum sama dengan pemblokiran otomatis pada platform iklan eksternal; hal tersebut memerlukan akses API resmi provider.


## 10. Dataset terverifikasi dan pelatihan model tambahan

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

## 11. Google Ads API OAuth dan mitigasi eksternal

Integrasi resmi Google Ads REST API v26 telah ditambahkan. Konfigurasi OAuth refresh token, Customer ID, Manager Customer ID opsional, API access level, action key, dan langkah pengujian dijelaskan di [`backend/docs/GOOGLE_ADS_ML_SETUP.md`](backend/docs/GOOGLE_ADS_ML_SETUP.md).

Ringkasan kemampuan:

- OAuth scope Google Ads disimpan server-side; `backend/.env` tidak disertakan/di-commit.
- Daftar akun, kampanye, metrics invalid clicks, dan IP exclusions dibaca melalui API.
- Data `metrics.invalid_clicks` dapat disinkronkan ke dataset campaign-day dan dipakai melatih model risiko agregat.
- Admin dapat meminta status kampanye menjadi `PAUSED` atau menambahkan pengecualian IP/CIDR setelah memasukkan action key dan konfirmasi persis.
- Mutasi dinonaktifkan secara default. Sistem tidak melakukan pause otomatis berdasarkan model. Data invalid clicks merupakan laporan agregat tanggal; sinkronisasi dilakukan manual/batch, jadi integrasi ini belum menjamin mitigasi otomatis seketika atau perubahan anggaran harian otomatis.
- Google Ads invalid-click metrics tidak menyertakan IP individual; jangan mengubah angka agregat itu menjadi daftar IP.

Google Ads API pada versi kebijakan yang berlaku sejak 9 September 2026 tidak lagi memerlukan Developer Token pada request baru. Akses ditautkan pada project Google Cloud/OAuth dan access level yang diberikan Google. Simpan OAuth client secret dan refresh token hanya di `backend/.env`, jangan di kode atau ZIP. Akses produksi dan tindakan iklan tetap memerlukan konfigurasi serta izin langsung dari pemilik akun. Refresh token OAuth external app berstatus Testing dapat kedaluwarsa; ikuti kebijakan publikasi/verifikasi Google untuk koneksi jangka panjang. Rujuk [Developer Token policy](https://developers.google.com/google-ads/api/docs/api-policy/developer-token) dan [API access levels](https://developers.google.com/google-ads/api/docs/access-levels).


## 12. Dataset MarTech tambahan dan Google Ads campaign target

Dataset CPA asli tidak diubah. Salinan MarTech 500.000 baris berlabel disimpan terpisah pada `backend/ml/datasets/martech/train.csv`. Dataset ini dinyatakan simulated/anonymized oleh dokumentasi sumber dan belum memiliki file lisensi di arsip yang diterima; periksa izin sebelum redistribusi. Training benchmark dapat dijalankan dengan `npm run train:martech`. Hasil model MarTech disimpan terpisah dan tidak dipromosikan ke prediksi CPA runtime.

Google Ads `.env.example` sudah diisi dengan Customer ID `3425120099`, Campaign ID `3426120099`, dan nama campaign `advertising` sesuai informasi pemilik proyek. OAuth credentials tetap kosong dan tidak boleh dikirimkan melalui chat. Mutasi dan auto-exclusion tetap OFF secara default. Event yang akan dikecualikan harus memiliki `campaign_id` yang sama dengan campaign target; tanpa campaign mapping sistem tidak mengubah campaign eksternal.


## 13. Windows PowerShell: Python ML tanpa Activate.ps1

Jika PowerShell menampilkan `running scripts is disabled` saat menjalankan `backend\.venv\Scripts\Activate.ps1`, itu adalah Execution Policy Windows, bukan error pada Python atau proyek. Virtual environment tetap dapat digunakan tanpa aktivasi. Dari root folder proyek, jalankan:

```powershell
py -3 -m venv backend\.venv
backend\.venv\Scripts\python.exe -m pip install --upgrade pip
backend\.venv\Scripts\python.exe -m pip install -r backend\ml\requirements.txt
backend\.venv\Scripts\python.exe backend\ml\prediction_api.py
```

Jika venv sudah dibuat, lewati perintah `py -3 -m venv ...`. Untuk shortcut, jalankan `scripts\setup-ml-env.cmd` satu kali dan gunakan `scripts\start-ml-api.cmd` untuk memulai Python ML API. File `.cmd` tersebut tidak memanggil `Activate.ps1`.

Jangan mengubah Execution Policy `LocalMachine` hanya untuk menjalankan proyek ini. Jika tetap ingin aktivasi di sesi saat ini, opsi sementara adalah `Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass`; scope ini berlaku sampai sesi PowerShell ditutup.



## 14. Model Web Robot, live refresh, dan status target

Proyek memakai model pendamping **Web Robot Detection** dari gabungan `simple_features.csv` dan `semantic_features.csv`. Artefak evaluasi mencatat accuracy **98,08%** pada 13.471 sesi holdout, precision Robot 95,46%, recall Robot 94,96%, F1 Robot 95,21%, dan ROC-AUC 99,70%. Model ini memprediksi label **Human/Robot pada sesi web**, bukan label **Valid/Fraud pada klik iklan**. Dataset Twitter tidak digunakan dalam model ini. Dashboard menampilkan kedua cakupan model secara terpisah melalui `GET /api/monitoring/metrics`.

Model utama CPA tetap dievaluasi untuk label Valid/Fraud. Evaluasi terakhir yang tersimpan mencatat accuracy 75,10% dan precision/recall/F1 Fraud 0%; karena itu model CPA tetap `shadow_only` dan tidak boleh mengaktifkan auto-block ML. Angka 98,08% Web Robot tidak boleh dipakai untuk menyatakan target akurasi fraud klik iklan telah tercapai.

Dashboard memperbarui 100 event terbaru setiap 10 detik dan memperbarui daftar IP ketika halaman Blocked IPs sedang dibuka. Penilaian burst memakai `received_at` yang ditetapkan server, bukan hanya timestamp klien. Event diserialisasi per alamat IP di proses Express yang sama agar burst berurutan tidak saling melewatkan. Baris `historical_dataset_label` adalah referensi label Fraud historis, **bukan block aktif**. Block aktif berasal dari rule perilaku, tindakan manual, atau model yang telah memenuhi quality gate.

Rule mitigasi internal default: 10 klik dari user teridentifikasi dengan User-Agent sama dalam 5 detik, atau 20 klik anonim dengan User-Agent sama dan indikator jaringan berisiko dalam 5 detik. Ketika rule terpenuhi, IP dicatat ke blocklist internal. Google Ads IP exclusion hanya dicoba bila OAuth dan campaign mapping benar, nama/channel campaign lolos verifikasi, serta kedua flag `GOOGLE_ADS_MUTATIONS_ENABLED` dan `GOOGLE_ADS_AUTO_EXCLUDE_ENABLED` diaktifkan secara eksplisit. Kedua flag tetap `false` secara default. IP harus merupakan IPv4 publik; Google Ads membatasi sampai 500 IP/CIDR per campaign.

**Batas hasil yang diharapkan:** dashboard dan polling real-time serta rule mitigation internal dapat diuji secara lokal. Model sesi Web Robot melampaui 95%, tetapi ini bukan click-fraud classifier. Google Ads exclusion adalah aksi produksi yang memerlukan OAuth/access level dan campaign yang benar; akun test tidak mengukur uang yang benar-benar dihemat. Dengan bukti dan dataset yang tersedia saat ini, ketiga hasil tidak boleh dinyatakan sepenuhnya terpenuhi untuk deteksi Fraud klik iklan dan penghematan anggaran produksi.

## 15. Command dan runbook Windows

Lihat [`docs/RUNBOOK_WINDOWS.md`](docs/RUNBOOK_WINDOWS.md) untuk urutan command setup, training, menjalankan empat service, tes burst real-time, dan verifikasi endpoint.


## 16. Keamanan endpoint ingestion dan mitigasi real-time

Endpoint penulisan event pada `/api/events` dan `/api/realtime/ingest` dapat dikunci dengan `EVENT_INGESTION_API_KEY`. Di production, kunci wajib diisi; middleware menolak konfigurasi production yang kosong (503) dan request tanpa header `X-Event-Ingestion-Key` yang benar (401). Jangan pernah menaruh kunci tersebut di React/browser. Simpan pada server-side collector. Collector harus memperoleh alamat IP pengunjung dari koneksi/proxy tepercaya; jangan mempercayai alamat IP atau `X-Forwarded-For` yang dapat ditulis langsung oleh klien. CORS bukan mekanisme autentikasi.

Rule burst memakai waktu `received_at` dari server dan serialisasi per IP dalam satu proses Express. Ini memberi mitigasi near-real-time pada instance backend tersebut; untuk banyak instance/server diperlukan shared lock/rate-limit store seperti Redis agar seluruh instance melihat urutan event yang sama. Dashboard polling 10 detik (events) dan 15 detik (blocklist), bukan WebSocket.

## Tampilan Anggaran

Kolom `budget` merupakan nilai anggaran dummy per klik. Nilai numerik pada dataset dan database dipertahankan persis seperti data yang tersedia; tidak dilakukan konversi kurs maupun perubahan nominal. Perubahan hanya mengatur format tampilannya sebagai dollar. Simbol `$` ditempatkan langsung di depan angka, koma digunakan sebagai pemisah ribuan, dan titik sebagai pemisah desimal/sen (contoh: `$1,250.75`). Format ini diterapkan pada dashboard dan tampilan nominal biaya Google Ads. Nilai budget bukan tagihan aktual platform iklan.
