# Web Robot Detection – Server Logs

Sumber publik yang dicatat untuk dataset: https://zenodo.org/records/3477932. Dataset ini terdiri dari dua file yang saling berpasangan pada unit observasi sesi/log web:

- `simple_features.csv`
- `semantic_features.csv`

Keduanya memiliki 67.352 baris dan kolom `ID` yang unik. Pipeline memeriksa bahwa daftar ID sama persis dan label `ROBOT` konsisten sebelum menggabungkan fitur. Target `ROBOT=0` berarti sesi Human/non-robot dan `ROBOT=1` berarti sesi Robot.

## Penggunaan pada ClickGuard

Dataset ini dilatih sebagai **model pendamping deteksi robot pada tingkat sesi web**, bukan model fraud klik iklan. Fitur dari dua CSV digabung berdasarkan `ID`; kolom `ID` tidak dipakai sebagai prediktor. Kolom `ROBOT` menjadi target dan tidak boleh menjadi input. Kolom `PENALTY` serta `MAX_BARRAGE` juga dikeluarkan dari training agar model tidak bergantung pada sinyal penalti/indikator yang berpotensi dekat dengan aturan pelabelan. Nilai kosong dipertahankan sebagai missing value yang ditangani LightGBM.

Hasilnya disimpan pada `backend/ml/results/web_robot_*`. Jalankan dari folder `backend`:

```powershell
.\.venv\Scripts\python.exe ml\train_web_robot_model.py
```

API pendamping (setelah model tersedia) adalah `POST /api/predict/web-robot`. API meminta seluruh fitur numerik model; nilai boleh berupa angka atau `null` bila memang tidak diketahui. Endpoint tersebut hanya mengembalikan klasifikasi Human/Robot. Ia tidak mengubah label Valid/Fraud, tidak ikut dalam endpoint CPA `/api/predict`, tidak dipakai oleh alur auto-block, dan tidak mengeksekusi perubahan Google Ads.

## Batasan interpretasi

Akurasi di atas 95% pada dataset ini hanya menggambarkan kemampuan membedakan sesi Human/Robot dalam dataset Web Robot. Angka ini **bukan** akurasi deteksi fraud klik iklan. Untuk mengukur model click-fraud, diperlukan label Fraud/Valid pada unit klik iklan dengan definisi yang tervalidasi.
