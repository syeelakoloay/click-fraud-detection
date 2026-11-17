# Analisis Dataset dan Strategi Machine Learning ClickGuard

## 1. Profil dataset

Dataset `backend/dataset/click_fraud_dataset.csv` berisi 5.000 baris event klik dan 22 kolom. Setiap baris mempunyai unit observasi yang sama, yaitu satu event klik iklan. Kolom `budget` merupakan nominal biaya dummy per event dalam Rupiah untuk analisis anggaran; kolom ini tidak digunakan sebagai fitur training atau target klasifikasi. Dari sisi atribut, dataset **heterogen (multi-feature)** karena menggabungkan beberapa kelompok informasi: identitas/waktu event, perangkat dan browser, sistem operasi, URL/referrer, perilaku pengguna, posisi iklan, reputasi IP, penggunaan VPN/proxy, skor kemungkinan bot, label fraud, dan estimasi biaya event. Dengan demikian, istilah yang paling tepat adalah *heterogen dari sisi fitur*, bukan kumpulan beberapa jenis objek yang berbeda.

Distribusi label pada file sumber adalah:

| Label | Jumlah | Proporsi |
|---|---:|---:|
| Valid (`is_fraudulent = 0`) | 3.759 | 75,18% |
| Fraud (`is_fraudulent = 1`) | 1.241 | 24,82% |
| **Total** | **5.000** | **100,00%** |

Timestamp berkisar dari 19 Februari 2024 sampai 18 Februari 2025. Dataset mempunyai 3 jenis perangkat, 5 browser, 5 sistem operasi, dan 3 posisi iklan. Kolom perilaku mencatat durasi klik, kedalaman scroll, gerakan mouse, keystroke, frekuensi klik, dan jeda sejak klik sebelumnya.

## 2. Jenis iklan yang dicakup

Data ini adalah dataset **event klik iklan digital generik**, bukan katalog iklan atau data kampanye dari merek tertentu. Tidak ada kolom `brand`, `product`, `advertiser`, `campaign_id`, `ad_id`, `creative`, atau `product_category`. Kolom `ad_position` hanya menyebut posisi tampilan (`Top`, `Side`, `Bottom`); `page_url` dan `referrer_url` mencatat alamat halaman, bukan nama produk/brand. Karena itu, tidak ada dasar dari file ini untuk menyatakan iklan yang diklik adalah Colgate, Sunsilk, atau merek tertentu.

## 3. Peran label dan bot likelihood score

- `is_fraudulent` adalah **target (y)** untuk supervised learning: `0 = Valid`, `1 = Fraud`. Nilai ini hanya dipakai sebagai jawaban benar saat proses training/evaluasi; nilai label tidak dikirim sebagai fitur saat prediksi event baru.
- `bot_likelihood_score` adalah skor 0–1 yang tersedia di dataset dan dapat dibaca sebagai sinyal risiko pendukung. Namun, pada file ini skor tersebut memisahkan label dengan sempurna: nilai Valid berada pada rentang 0,00–0,75 dan Fraud pada 0,76–1,00. Batas pemisahnya berada di antara 0,75 dan 0,76, dan ROC-AUC skor saja adalah 1,00.
- Karena asal-usul `bot_likelihood_score` tidak diterangkan, pola pemisahan sempurna itu menimbulkan risiko **target leakage**: skor mungkin dibentuk dari aturan/label yang sama. Jika skor dimasukkan sebagai fitur model dan label dipakai sebagai target, model dapat sekadar menyalin batas skor, menghasilkan metrik sangat tinggi tanpa membuktikan bahwa ia mengenali pola perilaku klik yang dapat digeneralisasi.

Oleh sebab itu, pipeline model utama mengecualikan `bot_likelihood_score` dari fitur prediktor. Skrip feature engineering tetap mengaudit dan menyimpan rentang skor pada `ml/results/bot_score_leakage_audit.csv`. Skor dapat dipertimbangkan sebagai fitur setelah pemilik data membuktikan bahwa skor dihasilkan secara independen sebelum label fraud ditetapkan dan tersedia pula pada saat prediksi event baru.

## 4. Fitur yang dipelajari model

Pipeline membentuk 15 fitur:

- Numerik: `click_hour`, `click_duration`, `scroll_depth`, `mouse_movement`, `keystrokes_detected`, `click_frequency`, `time_since_last_click`, `VPN_usage`, dan `proxy_usage`.
- Kategorikal: `click_day_of_week`, `device_type`, `browser`, `operating_system`, `ad_position`, dan `device_ip_reputation`.

`click_hour` dan `click_day_of_week` dibentuk dari `timestamp`. ID klik, user ID, IP mentah, URL mentah, timestamp mentah, serta `bot_likelihood_score` tidak menjadi fitur training. Random Forest dilatih dengan pemisahan train/test terstratifikasi 80:20. Preprocessing numerik/kategorikal berada dalam satu Pipeline sehingga transformasi kategori dipelajari dari data training saja.

Pada prediksi baru, layanan Python menerima 15 fitur yang sama dan menghasilkan kelas `Valid` atau `Fraud` beserta probabilitas dari `predict_proba`. Endpoint prediksi tidak menerima `is_fraudulent` sebagai input karena label aktual tidak diketahui untuk event baru.

## 5. Batas kualitas dan tindak lanjut

Kolom numerik selain `bot_likelihood_score` pada dataset ini menunjukkan hubungan yang sangat lemah terhadap label; korelasi Pearson absolut terbesarnya hanya sekitar 0,0155 (`scroll_depth`). Setelah model Random Forest dilatih ulang dengan pemisahan stratified 80:20 (random_state 42) dan 15 fitur non-score, hasil holdout adalah Accuracy 75,10%, Precision Fraud 0,00%, Recall Fraud 0,00%, F1 Fraud 0,00%, dan ROC-AUC 53,07%. Baseline yang selalu memilih kelas mayoritas memiliki Accuracy 75,20%. Artinya model yang aman dari leakage ini belum berhasil mengenali pola Fraud dan belum layak menjadi satu-satunya dasar blokir otomatis. Karena itu, tidak tepat menjanjikan akurasi di atas 95% hanya berdasarkan dataset ini. Untuk meningkatkan model secara sahih, diperlukan data yang benar-benar merekam pola fraud—misalnya IP/user berulang, campaign/ad ID, sumber traffic, click timing berurutan, user-agent, serta hasil verifikasi fraud yang independen—dan pemisahan data berdasarkan waktu/akun agar pengujian mencerminkan penggunaan nyata.

## 6. Garis threshold pada Traffic overview

Dashboard menggunakan **Upper Control Limit (UCL) 3-sigma dari p-chart** untuk fraud. Baseline fraud rate dihitung dari seluruh event yang sedang dimuat; untuk setiap interval, batas jumlah Fraud disesuaikan dengan total klik pada interval tersebut. Dengan begitu, interval yang berisi lebih banyak klik tidak dibandingkan dengan ambang jumlah tetap yang sama seperti interval kecil.

- Titik Fraud di atas UCL berarti proporsi Fraud pada interval itu berada di atas batas kendali statistik dan perlu diperiksa.
- Titik Fraud pada atau di bawah UCL berarti masih berada dalam variasi historis yang diharapkan; hal itu **bukan bukti bahwa semua klik valid**.
- Titik Valid tidak dibandingkan dengan UCL Fraud. UCL merupakan indikator pemantauan agregat, bukan pengganti prediksi ML atau aturan blokir otomatis.

Pada bucket tanpa klik, UCL tidak dihitung karena tidak ada volume observasi; karena itu garis terputus pada interval kosong. Untuk monitoring produksi jangka panjang, baseline sebaiknya dikalibrasi dari periode historis yang stabil dan ditinjau berkala.

## 7. Kesesuaian dengan bagian Hasil yang Diharapkan pada Konsep.docx

| Hasil yang diharapkan | Kondisi pada snapshot proyek | Status |
|---|---|---|
| Dashboard monitoring periklanan dengan visualisasi sebaran traffic | Dashboard React menampilkan KPI, event, grafik jumlah Valid/Fraud per interval, fraud rate, dan satu UCL 3-sigma yang khusus digunakan untuk jumlah Fraud. Data dashboard dibaca dari Express API dan label event mengikuti `is_fraudulent` yang tersimpan pada dataset. | **Sebagian besar tersedia** untuk monitoring dataset; belum membuktikan pemantauan traffic langsung dari platform iklan. |
| Modul deteksi Fraud otomatis | Layanan Python `/predict` dan route ingestion real-time tersedia; output prediksi disimpan terpisah dari label aktual. Pipeline click-level baru yang bebas `bot_likelihood_score` memerlukan file label independen `click_fraud_verified.csv` dan manifest yang dapat diaudit. Google Ads juga dapat menyediakan label agregat campaign-day untuk model risiko terpisah. | **Fondasi teknis tersedia; model click-level terverifikasi dan kualitas prediksinya masih membutuhkan dataset label independen.** |
| Akurasi model deteksi >95% | Model baseline pada dataset 5.000 baris mencatat Accuracy 75,10%, Precision Fraud 0,00%, Recall Fraud 0,00%, F1 Fraud 0,00%, dan ROC-AUC 53,07%; baseline mayoritas 75,20%. Pipeline baru memakai chronological holdout, tetapi tidak bisa menghasilkan hasil baru tanpa dataset berlabel independen. | **Belum tercapai.** Target hanya dapat dinyatakan tercapai setelah hasil test independen benar-benar >95% dan metrik Fraud memadai. |
| Mitigasi kebocoran anggaran kampanye secara real-time | Integrasi Google Ads REST API v26 disiapkan untuk OAuth, pembacaan kampanye/metrik invalid clicks, sinkronisasi data campaign-day, pause kampanye, dan pengecualian IP/CIDR dengan konfirmasi admin. API Google Ads memberikan invalid-click metrics pada tingkat agregat campaign-day, bukan IP/click ID individual. Koneksi akun dan tindakan produksi membutuhkan OAuth, izin, Customer ID, dan persetujuan administrator. | **Integrasi teknis tersedia, tetapi belum aktif pada akun pengguna.** Pencegahan anggaran aktual belum dapat diklaim sampai akun terhubung dan tindakan diuji. |

### Rekomendasi agar target dapat dicapai

1. **Selesaikan integrasi deteksi otomatis.** Hubungkan event baru dari sumber traffic ke pipeline ingestion yang memanggil layanan Python `/predict`. Simpan hasil prediksi secara terpisah dari label aktual `is_fraudulent`, agar hasil prediksi tidak menimpa ground truth. Pastikan dashboard membedakan label dataset, hasil prediksi ML, dan status verifikasi.
2. **Tingkatkan kualitas data dan evaluasi model.** Kumpulkan event Fraud yang telah diverifikasi secara independen, tambahkan konteks perilaku berurutan/IP/kampanye yang benar-benar tersedia saat prediksi, lalu evaluasi dengan pemisahan data berbasis waktu atau kelompok. Laporkan confusion matrix, precision, recall, F1, ROC-AUC, dan baseline; jangan mengejar Accuracy >95% dengan memasukkan `bot_likelihood_score` sebelum independensi skor terhadap label terbukti.
3. **Bangun integrasi platform iklan untuk mitigasi anggaran.** Setelah platform dan izin akses ditentukan, integrasikan API resmi (misalnya Google Ads API atau Meta Marketing API) untuk mengirim sinyal, mengecualikan sumber/IP jika didukung, atau menjalankan tindakan kampanye yang diizinkan. Catat permintaan, respons, waktu, campaign/ad identifier, dan hasil tindakan. Uji pada lingkungan sandbox/akun uji sebelum mengaktifkan tindakan otomatis.
4. **Gunakan data biaya aktual.** Ganti nilai dummy/fallback CPC dengan data biaya atau klik yang berasal dari akun kampanye dan periode yang sama. Sampai integrasi biaya dan platform tersedia, tampilkan angka sebagai estimasi potensi pemborosan, bukan kerugian aktual atau penghematan yang sudah berhasil dicegah.

Dengan kondisi snapshot ini, ClickGuard sudah menyediakan fondasi dashboard, visualisasi traffic, pipeline model, endpoint prediksi, dan pencatatan IP internal. Namun, tiga klaim yang lebih kuat—deteksi ML otomatis untuk setiap event produksi, akurasi di atas 95%, dan pencegahan pengeluaran iklan aktual secara real-time—belum boleh dinyatakan tercapai.


## 8. Dataset berlabel independen dan pipeline training tambahan

Proyek sekarang menyiapkan tiga pipeline yang terpisah sesuai unit label:

1. `ml/train_fdma_publisher_model.py`: benchmark FDMA 2012 BuzzCity. Data mencakup sekitar 8,46 juta click records dari train/validation/test, tetapi label `Fraud`, `OK`, `Observation` tersedia pada tingkat publisher. Hasilnya model publisher-level; bukan label per klik. Dataset mentah tidak disertakan karena perlu diperoleh melalui pemilik data dan izin penggunaan dipastikan.
2. `ml/train_verified_click_model.py`: model click-level untuk file `dataset/click_fraud_verified.csv` yang disiapkan pemilik proyek. Skrip mengecualikan `bot_likelihood_score`, ID, IP mentah, URL mentah, dan timestamp mentah. Manifest sumber/label wajib dilengkapi. Data tersebut belum tersedia dalam ZIP, jadi skrip akan berhenti tanpa training jika file dan manifest belum ada.
3. `ml/train_google_ads_campaign_model.py`: model risiko campaign-day hari berikutnya dari `metrics.invalid_clicks` Google Ads. Label adalah agregat kampanye per tanggal, bukan per klik. Fitur hanya berasal dari metrik hari kalender sebelumnya pada kampanye yang sama; baris tanpa record hari sebelumnya yang berurutan dibuang. Data target hari yang sama (`invalid_clicks`, `invalid_click_rate`, dan label) tidak digunakan sebagai fitur. Evaluasi memakai split kronologis 60% train, 20% validation, dan 20% test; threshold ditentukan dari validation saja.

Semua pipeline menggunakan split kronologis/holdout sesuai level data dan menyimpan metrik test aktual. Tidak ada pipeline yang menjamin atau memaksakan accuracy >95%. TalkingData AdTracking (184,9 juta clicks) tidak diperlakukan sebagai fraud dataset karena target `is_attributed` menunjukkan attribution/app download, bukan fraud.

Dokumen instruksi dan format input ada di `backend/docs/GOOGLE_ADS_ML_SETUP.md`, `backend/dataset/fdma2012/README.md`, dan `backend/dataset/click_fraud_verified.manifest.example.json`.

## 9. Integrasi Google Ads API

Backend telah menyiapkan integrasi REST Google Ads API v26 dengan OAuth refresh-token server-side. Halaman React **Google Ads** dapat membaca akun/kampanye dan metrik invalid clicks, menyinkronkan data campaign-day, memperlihatkan status hasil training, meminta jeda kampanye (`PAUSED`), serta menambahkan pengecualian IP/CIDR. Pembacaan akun/kampanye dan semua mutasi dilindungi `GOOGLE_ADS_ACTION_KEY`. Mutasi eksternal default OFF (`GOOGLE_ADS_MUTATIONS_ENABLED=false`) dan memerlukan konfirmasi teks yang persis.

Akun belum terhubung dalam snapshot proyek ini; tidak ada token, customer ID, atau rahasia Google yang disimpan di ZIP. IP dari metrik `invalid_clicks` tidak tersedia secara individual, sehingga pengecualian IP harus didasarkan pada log lain yang diverifikasi. Integrasi siap diuji setelah konfigurasi akun dan akses dilakukan pemilik proyek. Sinyal invalid clicks adalah metrik pelaporan agregat per kampanye/tanggal, bukan webhook/stream per klik dan tidak mengungkap IP individual. Karena itu sinkronisasi dan training dilakukan secara batch; kontrol pause/IP exclusion saat ini diminta manual dan belum otomatis dipicu model. Proyek belum menjamin mitigasi biaya seketika atau perubahan budget otomatis.
