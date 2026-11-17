# FDMA 2012 BuzzCity — input data resmi (tidak disertakan)

Pipeline ini disiapkan untuk dataset penelitian **Fraud Detection in Mobile Advertising (FDMA) 2012** yang diterbitkan dengan data BuzzCity. Dataset asli terdiri atas log klik serta file profil publisher. BuzzCity memberikan status publisher `Fraud`, `OK`, dan `Observation`; status `Observation` berarti belum ada kesimpulan dan sengaja tidak digunakan sebagai label Valid. Label berada pada tingkat **publisher**, bukan setiap klik.

Referensi resmi/akademik:
- SMU Research Data: https://ink.library.smu.edu.sg/researchdata/22/
- Publikasi JMLR: https://www.jmlr.org/papers/volume15/oentaryo14a/oentaryo14a.pdf
- Halaman arsip LARC menyatakan pusat penelitian sudah tidak aktif: https://www.smu.edu.sg/sites/default/files/archives/larc/larc.smu.edu.sg/buzzcity-mobile-advertisement-dataset.html

Halaman SMU masih mendeskripsikan metadata dan struktur, tetapi tautan arsip LARC menyatakan pusat penelitian sudah tidak aktif. Karena itu file data mentah tidak disertakan di ZIP. Minta akses melalui SMU Research Data/Living Analytics Research Centre atau penulis publikasi; gunakan hanya setelah lisensi/izin akses dipastikan.

## File yang dibutuhkan

Letakkan enam file CSV di folder ini:

- `train_clicks.csv` + `train_publishers.csv`
- `validation_clicks.csv` + `validation_publishers.csv`
- `test_clicks.csv` + `test_publishers.csv`

Nama kolom sumber dapat mengikuti file aslinya; skrip menormalisasi variasi kapitalisasi dan underscore. Kolom minimum log klik: `publisherid`, `numericip`, `deviceua`, `adscampaignid`, `usercountry`, `clicktime`, `publisherchannel`, `referredurl`. Kolom minimum publisher: `publisherid`, `status`.

## Eksekusi

Dari folder `backend`:

```bash
python -m pip install -r ml/requirements.txt
python ml/train_fdma_publisher_model.py
```

Skrip membentuk fitur agregat publisher dari volume klik, keragaman IP/perangkat/kampanye/negara/channel, konsentrasi IP, persebaran jam/hari, dan kelengkapan referrer. Model dilatih hanya pada split training; threshold dipilih dari validation; hasil akhir dilaporkan pada test resmi. `publisher_id`, `status`, alamat bank/alamat publisher, dan `bot_likelihood_score` tidak digunakan sebagai fitur.

Output berada di `backend/ml/results/fdma_publisher_*`. Hasil ini adalah evaluasi klasifikasi publisher, bukan prediksi label setiap click_id. Jangan menggabungkan label publisher ke click-level lalu mengklaim semua klik dari publisher tersebut telah diverifikasi sebagai fraud.
