# MarTech Challenge 10 - tambahan dataset ClickGuard

File yang disertakan: `train.csv` (500.000 sesi berlabel).

Sumber repositori: https://github.com/wxydaydayup/-MarTech-Challenge-10-
Sumber challenge yang dicantumkan upstream: https://aistudio.baidu.com/aistudio/competition/detail/52/0/introduction

## Status dan batasan

- Dataset upstream menyatakan data dibuat secara simulasi, dianonimkan, dan sebagian makna fitur disamarkan.
- `label=0` dipetakan sebagai Normal dan `label=1` sebagai Fraud/cheating sesuai dokumentasi solusi kompetisi.
- `sid` dan kolom index `Unnamed: 0` hanya identifier administratif dan dikecualikan dari fitur.
- `test1.csv` upstream tidak memiliki label ground truth; `Best.csv` hanya berisi output prediksi dan tidak digunakan untuk training/evaluasi.
- Tidak ada berkas LICENSE pada arsip upstream yang diterima. Penggunaan ulang/distribusi harus mengikuti syarat pemilik/sumber asli; jangan menganggap repository publik otomatis memberikan lisensi dataset.
- Fitur MarTech tidak kompatibel dengan schema event CPA ClickGuard. Model MarTech hanya menjadi benchmark terpisah, bukan pengganti model `/predict` produksi.

## Menjalankan training

Dari folder `backend`:

```bash
python -m pip install -r ml/requirements.txt
python ml/train_martech_model.py
```

Output: `ml/results/martech_lightgbm_model.txt`, `martech_model_metrics.json`, `martech_model_metadata.json`, dan `martech_model_status.json`.

Split evaluasi kronologis: 70% train, 15% validation, 15% test. Ambang klasifikasi dipilih menggunakan validation; test tidak digunakan untuk pemilihan fitur/threshold.
