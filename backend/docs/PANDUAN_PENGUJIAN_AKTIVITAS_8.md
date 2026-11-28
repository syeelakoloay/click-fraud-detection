# Panduan Pengujian Aktivitas 8 - Service Database

Panduan ini memverifikasi service database yang ditambahkan di atas fondasi Aktivitas 6. Ikuti urutan pengujian dari PowerShell Windows; jalankan tiap perintah satu per satu di direktori proyek yang berisi `package.json`.

## 1. Pastikan berada pada root proyek

```powershell
Get-Location
Get-ChildItem
```

Daftar folder harus berisi `package.json`, `src`, `dataset`, dan `ml`. Jika folder `click-fraud-detection` berada di dalam folder dengan nama yang sama, masuk ke folder bagian dalam.

## 2. Siapkan koneksi MongoDB

Jika `.env` belum ada:

```powershell
Copy-Item .env.example .env
notepad .env
```

Isi variabel `MONGODB_URI` dengan URI yang benar. Contoh pada `.env.example` hanya cocok apabila MongoDB berjalan lokal di komputer yang sama. Untuk MongoDB Atlas, pastikan user database, password (URL-encoded bila berisi karakter khusus), IP allowlist, dan nama database sesuai.

**Gunakan database uji.** Skrip integration test membuat event, blocked IP, dan catatan model run sementara. Skrip berusaha menghapus hanya record uji unik tersebut setelah pemeriksaan. Jangan mengirim isi `.env` atau URI berkredensial ke chat/laporan.

## 3. Pasang dependensi

```powershell
npm install
```

Kriteria lulus: npm menyelesaikan instalasi tanpa `npm ERR!`. Simpan output aktual apabila terjadi error.

## 4. Periksa sintaks JavaScript

```powershell
npm run check:activity8
```

Kriteria lulus: delapan file ditandai `OK - ...` dan baris akhir adalah:

```text
Pemeriksaan sintaks lulus (8 file).
```

## 5. Jalankan unit test utilitas

```powershell
npm run test:activity8:unit
```

Kriteria lulus:

```text
PENGUJIAN UNIT UTILITAS AKTIVITAS 8 LULUS (13 assertion checks).
```

Unit test ini tidak membutuhkan koneksi MongoDB.

## 6. Inisialisasi database Aktivitas 6

```powershell
npm run init:db
```

Kriteria lulus:

```text
MongoDB berhasil terhubung.
Collection dan index berhasil diinisialisasi oleh Mongoose.
```

Jika gagal, jangan lanjut ke integration test. Perbaiki dulu path proyek, `MONGODB_URI`, jaringan, service MongoDB, atau izin database sesuai pesan error.

## 7. Verifikasi collection dan index

```powershell
npm run verify:db
```

Kriteria lulus: collection `events`, `blocked_ips`, `model_runs` masing-masing menunjukkan `ADA`, tanpa error, dan index cocok dengan baseline Aktivitas 6:

- `events`: `_id_`, unique `click_id_1`, `ip_address_1`, dan descending `timestamp_-1`.
- `blocked_ips`: `_id_` dan unique `ip_address_1`.
- `model_runs`: `_id_` bawaan; tidak ada index tambahan yang diwajibkan dalam baseline.

## 8. Jalankan integration test service Aktivitas 8

```powershell
npm run test:activity8
```

Kriteria lulus: semua langkah `PASS 1/8` sampai `PASS 8/8`, lalu pesan akhir berikut:

```text
Data uji sementara dibersihkan; data proyek lainnya tidak dihapus.
SEMUA PENGUJIAN SERVICE AKTIVITAS 8 LULUS (8/8).
```

Delapan bagian pengujian adalah: (1) simpan event, (2) ambil event menurut `click_id`, (3) daftar event dan pagination, (4) metrik overview serta traffic per jam, (5) tambah/baca/periksa/hapus blocked IP, (6) simpan dan baca catatan model run, (7) status keberadaan catatan model run, dan (8) snapshot monitoring gabungan.

Nilai metrik model dalam integrasi adalah data dummy khusus pengujian, bukan hasil model proyek. Data event, IP, dan model run yang dibuat tes semestinya dibersihkan di akhir.

## 9. Output untuk diperiksa

Kirim output terminal lengkap kelima perintah ini:

1. `npm run check:activity8`
2. `npm run test:activity8:unit`
3. `npm run init:db`
4. `npm run verify:db`
5. `npm run test:activity8`

Sensor hostname atau informasi yang sensitif bila tampil dalam output. Jangan kirim password, token, atau isi `.env`.

## Troubleshooting ringkas

- `Cannot find module`: pastikan berada di root proyek yang benar dan file skrip ada.
- `MONGODB_URI belum didefinisikan`: periksa `.env` di root dan nama key `MONGODB_URI`.
- `ECONNREFUSED`: service MongoDB mungkin belum berjalan atau URI/port salah.
- `Authentication failed`: periksa user/password database tanpa membagikannya.
- `Server selection timed out`: periksa jaringan, allowlist, host dan apakah layanan tersedia.
- `E11000 duplicate key`: periksa duplicate `click_id` pada data yang sudah ada; jangan menghapus dokumen yang tidak dikenali.
- Cleanup gagal: periksa hak `delete` di database uji. Jangan menganggap tes lulus bila cleanup dinyatakan gagal.

## Aturan kesimpulan

Skrip sintaks dan unit test hanya membuktikan pemeriksaan lokal. Aktivitas 8 dapat dilaporkan selesai seluruhnya setelah koneksi, collection/index, serta tes integrasi menunjukkan hasil lulus sesuai kriteria di atas. Jangan merekayasa atau mengubah output pengujian.
