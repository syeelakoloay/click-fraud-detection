# Referensi Endpoint - Aktivitas 13

Dokumen ini mendeskripsikan kontrak HTTP untuk endpoint monitoring yang ditambahkan pada Aktivitas 13. Base URL lokal yang dipakai dalam contoh adalah `http://localhost:5000`. Respons aktual harus diperiksa dari server yang telah berjalan dan database yang benar.

## Daftar endpoint

Tabel 1. Daftar endpoint monitoring Aktivitas 13

| Method | Path | Fungsi | Respons normal |
|---|---|---|---|
| GET | `/api/monitoring/summary` | Ringkasan overview, traffic, blocked IP, dan status catatan model run | `200` |
| GET | `/api/monitoring/metrics` | Metrik evaluasi dari model run terbaru yang tersimpan | `200`; `data` dapat `null` |
| GET | `/api/monitoring/traffic` | Agregasi traffic per jam atau per hari | `200` |
| GET | `/api/blocked-ips` | Daftar IP yang diblokir dengan pagination | `200` |

Tabel 1 memetakan metode, alamat, fungsi, dan bentuk respons normal dari empat endpoint monitoring. Daftar ini merupakan kontrak API yang disiapkan pada kode, bukan bukti bahwa permintaan HTTP sudah berhasil diuji di lingkungan pengguna. Respons aktual tetap bergantung pada data dalam MongoDB dan validasi query yang dilakukan service.

## Query parameter

Bagian ini merangkum parameter query yang dapat dikirim ke endpoint tertentu. Parameter tanggal dan interval digunakan oleh ringkasan serta agregasi traffic, sedangkan pagination digunakan khusus pada daftar blocked IP. Nilai yang diterima perlu mengikuti validasi dan batas yang sudah diterapkan oleh service.

- `startDate`, `endDate`: batas waktu untuk `summary` dan `traffic`; harus berupa tanggal yang valid dan `startDate` tidak boleh lebih besar daripada `endDate`.
- `interval`: untuk `summary` dan `traffic`; nilai yang diterima adalah `hour` atau `day`.
- `blockedIPLimit`: membatasi jumlah blocked IP pada bagian summary.
- `page`, `limit`: pagination untuk `/api/blocked-ips`; nilai harus bilangan bulat positif dan service menerapkan batas maksimum sesuai konfigurasi yang sudah ada.

## Bentuk respons

Bentuk respons dijelaskan per endpoint agar field yang tersedia tidak tercampur antara ringkasan, metrik evaluasi, traffic, dan blocked IP. Contoh nama field mengikuti service dan schema yang ada. Jika suatu data belum tersedia, dokumentasi tidak menyatakan bahwa data itu pasti ada.

### `GET /api/monitoring/summary`

Respons merangkum `overview`, `traffic`, `blockedIPs`, dan `modelStatus` di dalam properti `data`. `overview` memuat `totalEvents`, `fraudCount`, `validCount`, `fraudRate`, dan `latestEventAt`. Agregasi traffic memuat `period`, `totalEvents`, `fraudCount`, dan `validCount`.

### `GET /api/monitoring/metrics`

Jika ada model run, `data` dapat berisi `model_type`, `accuracy`, `precision`, `recall`, `f1_score`, dan `roc_auc` sesuai field yang benar-benar tersimpan. Jika belum ada model run, `data` bernilai `null`, statusnya `NO_MODEL_RUN_RECORDED`, dan endpoint tidak menghasilkan angka metrik buatan. Status tersebut hanya menjelaskan keberadaan catatan, bukan kesiapan layanan prediksi.

### `GET /api/monitoring/traffic`

Respons berisi `data.interval` dan array `data.data`; tiap item memiliki `period`, `totalEvents`, `fraudCount`, dan `validCount`. Pengelompokan waktu yang tersedia pada service memakai timezone UTC. Isi array berasal dari agregasi event yang tersimpan, sehingga data kosong mungkin muncul bila tidak ada event pada rentang yang diminta.

### `GET /api/blocked-ips`

Respons mengikuti bentuk hasil service: `data`, `total`, `page`, `limit`, dan `totalPages`. Schema `BlockedIP` yang tersedia hanya mendefinisikan `ip_address`; endpoint tidak menambahkan alasan atau waktu pemblokiran. Respons mempertahankan metadata pagination yang dikembalikan service.

## Perintah pengujian via PowerShell

Bagian ini menyediakan contoh permintaan HTTP yang dapat dijalankan setelah server Express aktif. Jalankan perintah satu per satu pada terminal PowerShell kedua dan simpan screenshot dari output yang benar-benar muncul. Jangan mengubah respons error menjadi hasil sukses di dokumentasi.

```powershell
Invoke-RestMethod "http://localhost:5000/api/monitoring/summary" | ConvertTo-Json -Depth 8
```

```powershell
Invoke-RestMethod "http://localhost:5000/api/monitoring/metrics" | ConvertTo-Json -Depth 8
```

```powershell
Invoke-RestMethod "http://localhost:5000/api/monitoring/traffic?interval=hour" | ConvertTo-Json -Depth 8
```

```powershell
Invoke-RestMethod "http://localhost:5000/api/blocked-ips?page=1&limit=10" | ConvertTo-Json -Depth 8
```

Perintah di atas adalah prosedur verifikasi yang perlu dijalankan pada lingkungan lokal dengan dependency terpasang dan konfigurasi MongoDB sesuai. Tidak ada klaim bahwa keempat permintaan HTTP tersebut telah dijalankan dalam proses penyusunan paket ini. Catat status respons dan error secara akurat agar hasil integrasi dapat dipertanggungjawabkan.

## Pengujian otomatis

Repository menyediakan unit test dan integration test untuk memeriksa bagian sistem yang berbeda. Unit test dijalankan melalui `npm run test:activity13:unit` dan menggunakan mock service agar perilaku controller dapat diperiksa secara terisolasi, cepat, dan deterministik. Integration test aktual dijalankan melalui `npm run test:api:activity13:mongo` dan menggunakan route Express, service asli, Mongoose, serta MongoDB aktual pada database khusus pengujian.

Kedua tes diperlukan karena unit test tidak membuktikan query agregasi atau persistensi MongoDB, sementara integration test memerlukan dependency dan database aktif serta tidak selalu secepat unit test. Integration test membuat fixture yang unik, memverifikasi keempat endpoint dengan record di database, lalu menghapus hanya record milik pengujian tersebut. Fixture metrik/IP/timestamp dipakai khusus untuk validasi terkontrol dan bukan data live atau respons statis endpoint produksi.
