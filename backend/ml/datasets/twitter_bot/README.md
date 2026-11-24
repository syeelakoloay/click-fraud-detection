# Twitter Human Bots Detection

Sumber dataset Hugging Face: https://huggingface.co/datasets/nahiar/twitter_bot_detection. File sumber: `twitter_human_bots_dataset.csv` (37.438 baris). Target `account_type` memiliki dua label: `human` dan `bot`. Unit observasinya adalah akun Twitter, bukan klik atau sesi iklan.

Dataset digunakan hanya sebagai benchmark eksplorasi klasifikasi bot akun. Skrip mengecualikan identifier akun, nama akun, teks deskripsi, lokasi, URL gambar profil, dan timestamp mentah agar model tidak menghafal identitas/profil tertentu. Fitur perilaku/profil yang tersisa dipakai pada split stratified 80/20.

Jalankan dari folder `backend`:

```powershell
.\.venv\Scripts\python.exe ml\train_twitter_bot_benchmark.py
```

Hasil berada di `backend/ml/results/twitter_bot_benchmark_*`. Model ini tidak dimuat di layanan API ClickGuard, tidak digunakan dalam klasifikasi klik, dan tidak boleh dianggap sebagai model fraud iklan.
