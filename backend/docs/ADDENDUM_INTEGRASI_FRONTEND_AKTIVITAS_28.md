# Addendum Aktivitas 28 - Integrasi lintas repository

## Perubahan setelah laporan acuan

Pada paket awal Aktivitas 28, ZIP yang menjadi dasar laporan hanya memuat backend sehingga source frontend belum dapat diperiksa ulang. Pada penyusunan workspace final ini, ZIP `advertising.zip` juga tersedia dan ditempatkan bersama backend pada satu root folder `ClickGuard_Aktivitas28`.

## Perubahan integrasi yang diterapkan

1. Frontend mempertahankan konsumsi `GET /api/events`, `GET /api/monitoring/traffic`, `GET /api/monitoring/metrics`, serta `GET /health` yang sudah ada. Health check sekarang mengikuti `VITE_API_URL` bila URL API eksplisit digunakan.
2. Halaman Blocked IPs sekarang membaca `GET /api/blocked-ips` dan mengikuti metadata pagination (`total`, `limit`, `totalPages`) untuk mengambil seluruh halaman.
3. Tampilan Blocked IPs memisahkan daftar aktual pada collection `blocked_ips` dari Risk signals berupa event dengan `VPN_usage=1` atau `proxy_usage=1`.
4. UI tidak menambahkan metadata yang tidak disediakan schema, misalnya alasan blokir, waktu blokir, probabilitas, atau tombol unblock.
5. Pemeriksaan health check frontend juga mengikuti `VITE_API_URL` bila API URL eksplisit dikonfigurasi.
6. Konfigurasi proxy Vite memakai `VITE_API_PROXY_TARGET` dari `.env`, bukan hanya target hard-coded.
7. Ditambahkan `frontend/src/api.js` dan `frontend/tests/activity28Api.test.js` untuk menguji pagination, respons kosong, error HTTP, validasi field, serta batas page size.
8. Ditambahkan root `package.json` dan README workspace agar instalasi, start, tes, dan build dua aplikasi memiliki perintah terpusat.

## Batas verifikasi

Tes helper API menggunakan mock fetch dan tidak membuktikan request ke MongoDB. `npm run check:activity28` adalah pemeriksaan statis. `npm run build:frontend` hanya membuktikan proses bundling. Status integrasi runtime perlu ditentukan dari output tes setelah dependency tersedia, backend aktif dengan MongoDB, dan pemeriksaan Network tab pada dashboard.

## Hasil tes yang dapat dijalankan pada workspace

- `npm run check:backend`: 20/20 pemeriksaan API contract dan 53/53 file JavaScript backend lulus pemeriksaan sintaks.
- `npm run test:frontend`: 10/10 tes traffic Aktivitas 16 dan 7/7 tes kontrak/integrasi Blocked IP Aktivitas 28 lulus.
- Build Vite belum terverifikasi karena instalasi dependency melalui `npm ci` tidak selesai pada lingkungan penyusunan. Tes HTTP/MongoDB/Python/browser end-to-end juga belum dilakukan.
