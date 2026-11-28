# Integrasi Dataset Web Robot dan Twitter Bot

## Tujuan dan batas integrasi

Dua file Web Robot Detection (`simple_features.csv` dan `semantic_features.csv`) digabung menjadi model deteksi robot pada tingkat sesi web. CSV Twitter Human Bots Detection dievaluasi sebagai benchmark bot pada tingkat akun. Kedua sumber tidak mempunyai target Fraud/Valid pada unit klik iklan, sehingga tidak digabung ke dataset CPA dan tidak menggantikan model CPA atau benchmark MarTech.

## Hasil dataset Web Robot

- Jumlah baris: 67.352 sesi.
- Label: 53.858 Human/non-robot (ROBOT=0) dan 13.494 Robot (ROBOT=1).
- Penggabungan: `ID` unik di kedua file, dengan validasi pasangan satu-ke-satu dan konsistensi label.
- Kolom yang dikeluarkan: `ID` (identifier), `ROBOT` (target), `PENALTY`, dan `MAX_BARRAGE` (indikator yang tidak dipakai sebagai prediktor).
- Model: LightGBM, 450 estimators, learning rate 0,04, 31 leaves, random state 42.
- Pembagian: 80% training dan 20% holdout, stratified, random state 42. Lima-fold CV hanya dilakukan pada bagian training.

### Evaluasi holdout Web Robot

| Metrik | Hasil |
|---|---:|
| Accuracy | **98,08%** |
| Baseline kelas mayoritas | 79,96% |
| Balanced accuracy | 96,91% |
| Precision Robot | 95,46% |
| Recall Robot | 94,96% |
| F1 Robot | 95,21% |
| ROC-AUC | 99,70% |
| Average precision Robot | 98,92% |

Confusion matrix (baris = label aktual; kolom = prediksi):

| | Prediksi Human | Prediksi Robot |
|---|---:|---:|
| Aktual Human | 10.650 | 122 |
| Aktual Robot | 136 | 2.563 |

### Cross-validation pada data training

| Metrik | Rata-rata 5 fold | Simpangan baku |
|---|---:|---:|
| Accuracy | 97,72% | 0,13 poin persentase |
| Balanced accuracy | 96,53% | 0,23 poin persentase |
| Precision | 94,12% | 0,45 poin persentase |
| Recall | 94,54% | 0,43 poin persentase |
| F1 | 94,33% | 0,33 poin persentase |
| ROC-AUC | 99,60% | 0,06 poin persentase |

Angka tersebut memenuhi quality gate model robot yang terpisah. Namun, kualitas ini hanya berlaku untuk label Human/Robot pada sumber ini. Ia tidak membuktikan bahwa model CPA mencapai accuracy di atas 95%.

## Hasil benchmark Twitter

- Jumlah baris: 37.438 akun.
- Label: `human` dan `bot`.
- Identifier, nama akun, teks deskripsi, lokasi, URL gambar profil, dan timestamp mentah dikeluarkan.
- Split stratified 80/20.

| Metrik | Hasil |
|---|---:|
| Accuracy | 87,99% |
| Balanced accuracy | 85,24% |
| Precision Bot | 85,34% |
| Recall Bot | 77,06% |
| F1 Bot | 80,99% |
| ROC-AUC | 93,82% |

Benchmark Twitter tidak mencapai 95% dan tetap dipisahkan karena unit analisisnya akun media sosial.

## Endpoint baru

Layanan Python ML menyediakan `POST /predict/web-robot`; Express meneruskannya melalui `POST /api/predict/web-robot`. `GET /api/monitoring/metrics` juga menyertakan `web_robot_detection` agar Dashboard dapat menampilkan metrik holdout tanpa mencampurkannya dengan metrik CPA. Semua kolom fitur model harus ada di body sebagai angka atau `null`. Nilai `null` menjadi missing value. Endpoint menghasilkan `Human` atau `Robot` beserta probabilitas.

`GET /health` menampilkan bagian `web_robot_detection` dengan scope `web_session_robot_detection`, metrik holdout, dan `automation_eligible: false`. Fitur sesi tidak dibentuk otomatis dari satu event oleh alur `/api/events`; sistem pengumpulan log sesi perlu menghasilkan agregat tersebut sebelum endpoint pendamping dapat dipakai. Endpoint CPA `POST /predict`, `/api/predict`, `/api/events`, serta pemeriksaan blocklist tidak diganti atau diperluas oleh model ini.

## Perintah training

Dari root workspace:

```powershell
backend\.venv\Scripts\python.exe backend\ml\train_web_robot_model.py
backend\.venv\Scripts\python.exe backend\ml\train_twitter_bot_benchmark.py

# Jalankan setelah ML API aktif di port 8000
backend\.venv\Scripts\python.exe backend\ml\test_web_robot_api.py
```

Atau dari folder `backend`, jalankan `npm run train:web-robot` dan `npm run train:twitter-bot` setelah interpreter Python pada PATH menunjuk ke environment yang sudah memasang `ml/requirements.txt`.

## Keputusan untuk model utama ClickGuard

Model CPA utama tetap memakai `is_fraudulent` sebagai target dan 15 fitur CPA runtime. Hasil training terakhir tetap Accuracy 75,10%, Precision/Recall/F1 Fraud 0%, dan ROC-AUC 53,07%. Benchmark MarTech tetap terpisah dengan Accuracy 88,14%. Karena kedua dataset tambahan tidak menyediakan label Fraud/Valid pada tingkat klik iklan yang sama, hasil Web Robot 98,08% tidak boleh disalin sebagai metrik model click-fraud, tidak boleh digabung ke confusion matrix CPA, dan tidak dapat menjadi dasar auto-block.
