# Kesesuaian ClickGuard terhadap Konsep.docx

Dokumen ini memisahkan hasil yang sudah berjalan, hasil evaluasi yang benar-benar terukur, dan dependensi yang masih dibutuhkan. Angka metrik tidak boleh dinaikkan secara artifisial.

## 1. Dashboard dan visualisasi traffic

**Status: tersedia.** Frontend menampilkan ringkasan event, pemisahan Valid/Fraud, fraud rate, daftar event, grafik sebaran traffic dan UCL khusus Fraud. Untuk event real-time, `predicted_is_fraudulent` disimpan terpisah dari `is_fraudulent` (label aktual). Dashboard mengutamakan prediksi ML apabila tersedia; event historis tetap menggunakan label dataset.

## 2. Modul deteksi fraud otomatis

**Status: jalur ingest real-time tersedia, kualitas model masih perlu ditingkatkan.** Kirim event baru ke `POST /api/realtime/ingest`. Endpoint menjalankan pemeriksaan IP internal, mengirim 15 fitur ke layanan Python `/predict`, menyimpan event dan hasil prediksi terpisah, dan menambahkan IP ke blocklist internal ketika hasil prediksi adalah Fraud. Apabila Python ML tidak tersedia, event tetap disimpan dengan `prediction_status: unavailable`; sistem tidak mengarang hasil Valid.

`POST /api/realtime/test-history` tetap tersedia untuk kompatibilitas tes Aktivitas 17/23/25/27.

### Blocked IPs

Saat server mulai, dan setelah dataset CSV atau ingestion batch berhasil disimpan, backend menyinkronkan IP dari event berlabel aktual Fraud ke `blocked_ips`. Entri tersebut diberi sumber `historical_dataset_label`. IP yang ditambahkan oleh prediksi runtime diberi sumber `ml_prediction`. Kedua sumber ditampilkan terpisah pada dashboard. Sinkronisasi startup membaca collection `events`; jika belum ada event historis di MongoDB, import dataset 5.000 baris melalui `POST /api/events/import` terlebih dahulu. Importer memvalidasi bahwa semua kolom dataset tersedia dalam schema, sambil tetap mengizinkan field runtime tambahan untuk prediksi.

Entri historical label adalah daftar IP yang diketahui Fraud berdasarkan label dataset, bukan prediksi ML. Blocklist ini merupakan mitigasi internal. Ia tidak otomatis mengubah konfigurasi Google Ads, Meta Ads, atau platform iklan lain.

## 3. Akurasi model >95%

**Status: belum tercapai dan tidak dapat dibuktikan dengan dataset yang tersedia tanpa kebocoran target.** Model aktif dievaluasi dari `backend/ml/results/model_metrics.csv`:

- Accuracy: 75,10%
- Precision Fraud: 0,00%
- Recall Fraud: 0,00%
- F1-score Fraud: 0,00%
- ROC-AUC: 53,07%

Audit dataset menunjukkan `bot_likelihood_score` memisahkan label secara sempurna (`Valid` 0,00–0,75 dan `Fraud` 0,76–1,00). Memasukkan kolom tersebut ke supervised model akan membocorkan target/menyalin aturan label dataset; angka tinggi dari pendekatan itu tidak boleh diklaim sebagai kemampuan ML independen. Tanpa kolom tersebut, fitur perilaku yang tersedia hampir tidak memiliki korelasi dengan label. Model saat ini bahkan tidak mengungguli baseline kelas mayoritas secara bermakna.

### Agar target >95% dapat diuji secara sah

1. Sediakan dataset baru yang lebih besar dan representatif, dengan label Fraud/Valid yang diverifikasi independen dari `bot_likelihood_score`.
2. Pastikan fitur input tersedia sebelum prediksi dilakukan, tidak berasal dari label atau hasil akhir klasifikasi.
3. Pisahkan train, validation, dan test berdasarkan waktu atau entitas agar event terkait tidak bocor antarbagian.
4. Evaluasi accuracy bersama precision, recall, F1-score, ROC-AUC, confusion matrix, serta baseline kelas mayoritas. Target akurasi saja tidak cukup bila seluruh Fraud terlewat.
5. Simpan artefak model dan metrik untuk split test yang sama; gunakan artefak model yang sama pada layanan Python.

## 4. Mitigasi kebocoran anggaran secara real-time

**Status: mitigasi internal disiapkan; pencegahan biaya pada platform iklan eksternal belum terhubung.** Sistem dapat menerima event real-time, mendeteksi IP yang sudah diblokir, dan menambahkan IP yang diprediksi Fraud ke blocklist internal untuk pengambilan keputusan pada event berikutnya.

Untuk menghentikan pembelian klik/biaya pada Google Ads, Meta Ads, atau penyedia iklan, masih diperlukan integrasi API resmi provider, OAuth/developer credentials, izin akun/kampanye, pemetaan campaign, serta mekanisme sinkronisasi/konfirmasi perubahan. Tanpa akses tersebut, proyek tidak boleh menyatakan bahwa pengeluaran iklan eksternal telah dihentikan atau anggaran benar-benar dihemat.

## 5. Pengisian hasil Model deteksi

Saat Express dimulai, `modelRunService.syncModelMetricsFromArtifact()` membaca `ml/results/model_metrics.csv` dan melakukan upsert ke MongoDB `model_runs`. Dengan demikian panel Model deteksi menampilkan hasil evaluasi yang benar-benar tersimpan di artefak proyek tanpa memerlukan input manual setiap kali database baru digunakan. Panel ini menampilkan hasil evaluasi offline; untuk mendapatkan prediksi event, layanan Python harus dijalankan dan event baru harus masuk melalui `POST /api/realtime/ingest`.
