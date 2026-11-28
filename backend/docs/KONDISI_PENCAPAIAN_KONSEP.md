# Kesesuaian ClickGuard terhadap Konsep Proyek

Dokumen ini merupakan status evaluasi teknis terbaru per 23 November 2026. Status hanya dinyatakan tercapai jika bukti teknis tersedia; angka target tidak boleh direkayasa atau ditarik dari dataset yang berbeda domain.

## 1. Dashboard monitoring, deteksi otomatis, dan grafik sebaran traffic

**Status: dashboard dan pipeline event diperkuat; kinerja deteksi fraud click-level masih terbatas oleh kualitas model CPA.** Frontend React/Vite menampilkan grafik sebaran traffic Valid/Fraud dan kini memperbarui 100 event terbaru setiap 10 detik. Daftar IP diperbarui setiap 15 detik ketika halaman Blocked IPs dibuka. Backend menerima event lengkap melalui `POST /api/events` atau `POST /api/realtime/ingest`, menyimpan `received_at` dari server, lalu memeriksa burst berbasis jendela waktu server. Ingestion diserialisasi per IP pada satu proses Express agar request berurutan tidak kehilangan riwayat. Dashboard polling event 10 detik dan blocklist 15 detik. Endpoint penulisan dapat dilindungi `EVENT_INGESTION_API_KEY`; production menolak startup/request ingestion bila key tidak disiapkan. Label aktual `is_fraudulent` tetap terpisah dari prediksi. Untuk deployment multi-instance, lock in-memory per IP harus diganti shared coordination store (misalnya Redis).

Hasil prediksi (`predicted_is_fraudulent`) tetap terpisah dari label aktual (`is_fraudulent`). Header User-Agent ditangkap sebagai metadata event; `campaign_id` opsional ditambahkan untuk pemetaan kampanye. IP dengan sumber `historical_dataset_label` diperlakukan sebagai referensi historis dan tidak memblokir request live. IP dari `behavioral_rule` atau tindakan manual merupakan block internal aktif.

## 2. Model deteksi dengan accuracy >95%

**Status: model >95% tercapai hanya untuk tugas pendamping Human/Robot, belum untuk Fraud/Valid klik iklan.** Model LightGBM Web Robot dilatih dari `simple_features.csv` dan `semantic_features.csv` yang digabung berdasarkan ID; test holdout 13.471 sesi mencatat accuracy 98,08%, precision Robot 95,46%, recall Robot 94,96%, F1 Robot 95,21%, ROC-AUC 99,70%, dan 5-fold CV accuracy rata-rata 97,72%. Labelnya adalah Human/Robot pada sesi web. Model ini tidak sama dengan classifier klik iklan Valid/Fraud, tidak mengganti model CPA, dan `automation_eligible=false`.

Untuk model CPA click-level, dataset asli tetap dipertahankan. Hasil evaluasinya belum memadai: accuracy 75,10%, precision Fraud 0%, recall Fraud 0%, F1 Fraud 0%, ROC-AUC 53,07%. `bot_likelihood_score` tetap dikecualikan karena memisahkan label secara sempurna dan berisiko menjadi target leakage.

Dataset MarTech tambahan tersimpan terpisah di `ml/datasets/martech/train.csv`; jumlahnya 500.000 baris, dengan 257.760 Normal (label 0) dan 242.240 Fraud/cheating (label 1). Data sumber menyatakan bahwa dataset disimulasikan dan beberapa makna fitur disamarkan. Training baru menggunakan pemisahan kronologis 70% train, 15% validation, 15% test; threshold dipilih pada validation; kategori diketahui dari train saja; kolom administratif `Unnamed: 0`, `sid`, dan `label` tidak digunakan sebagai fitur.

Hasil test MarTech terbaru: accuracy 88,136%, precision Fraud 86,967%, recall Fraud 88,923%, F1 Fraud 87,934%, ROC-AUC 94,031%, PR-AUC 93,046% (75.000 test rows). MarTech menjadi benchmark terpisah karena fitur dan skemanya tidak kompatibel dengan event CPA. `test1.csv` tanpa label dan `Best.csv` prediksi submission tidak diperlakukan sebagai ground truth. Model MarTech tidak boleh memblokir event live.

Quality gate model CPA untuk auto-block ML mewajibkan accuracy >95%, precision Fraud ≥90%, recall Fraud ≥90%, F1 Fraud ≥90%, dan ROC-AUC ≥90%. Sampai seluruh pemeriksaan lulus pada test set independen yang representatif, model tetap `shadow_only`.

## 3. Mitigasi kebocoran anggaran kampanye secara real-time

**Status: mitigasi internal berbasis rule tersedia; Google Ads external action dapat diaktifkan setelah konfigurasi dan verifikasi.** Rule burst default memeriksa jendela lima detik: 10 klik untuk user teridentifikasi yang memakai User-Agent sama, atau 20 klik anonim dengan User-Agent sama serta indikator jaringan berisiko (VPN/proxy/reputasi IP Bad). Pengukuran burst memakai waktu penerimaan server dan per IP diproses secara berurutan dalam proses Express. Aturan ini adalah sinyal risiko, bukan ground truth dan harus dikalibrasi menggunakan traffic nyata sebelum produksi. Alamat IP harus berasal dari server-side collector/proxy tepercaya, bukan field yang dapat diatur langsung dari browser; API key ingestion harus dirahasiakan dan tidak boleh ditempatkan di frontend. Auto-block ML tetap terkunci oleh quality gate.

IP yang diblokir secara internal dapat dikirim ke Google Ads hanya jika `GOOGLE_ADS_MUTATIONS_ENABLED=true`, `GOOGLE_ADS_AUTO_EXCLUDE_ENABLED=true`, OAuth valid, Customer ID dan Campaign ID cocok, nama campaign terverifikasi, event menyertakan `campaign_id` target, dan IP merupakan IPv4 publik. Default kedua flag tetap `false`. Configured IDs: Customer `3425120099`, Campaign `3426120099`, name `advertising`; nilai tersebut masih perlu dibaca dan diverifikasi melalui API.

Google Ads Test Account tidak menayangkan iklan dan tidak mencatat biaya sungguhan. Test account dapat membuktikan API mutation diterima, tetapi tidak membuktikan nominal penghematan. Klaim pengurangan anggaran harus menunggu uji campaign produksi terkontrol dengan data biaya aktual dan persetujuan pemilik akun. Google Ads `metrics.invalid_clicks` adalah laporan agregat campaign-day, bukan stream click-level dan bukan sumber IP individual.

## 4. Ringkasan status hasil yang diharapkan

| Hasil | Status | Bukti / pekerjaan tersisa |
|---|---|---|
| Dashboard, deteksi otomatis, grafik traffic | Fitur dashboard tersedia; deteksi ML click-level terbatas | Grafik Valid/Fraud, polling event 10 detik, polling blocklist 15 detik saat halaman dibuka, dan rule burst internal. Perlu uji browser dan validasi event IP dari sumber tepercaya. |
| Accuracy model >95% | Tercapai untuk Human/Robot, belum untuk Fraud/Valid klik | Web Robot holdout 98,08%; CPA click-level 75,10%. Tidak boleh menyamakan kedua label. |
| Mitigasi anggaran real-time | Mitigasi internal tersedia; Google Ads bersyarat | Internal burst block otomatis; external IP exclusion membutuhkan OAuth, project access, campaign terverifikasi, public IPv4 dan kedua flag mutasi. Penghematan produksi belum terbukti. |

## 5. Perintah training dan pemeriksaan

Dari folder `backend`:

```bash
pip install -r ml/requirements.txt
python ml/train_martech_model.py
python ml/prediction_api.py
```

Layanan Python menyediakan `GET /health`, `POST /predict` untuk CPA, dan `POST /predict/martech` untuk benchmark MarTech. Restart layanan setelah training agar artefak baru dimuat.
