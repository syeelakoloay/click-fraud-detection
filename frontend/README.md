# ClickGuard Frontend (Aktivitas 28)

Frontend React/Vite untuk dashboard ClickGuard. Source ini terhubung ke backend Express pada folder `../backend`.

## Menjalankan frontend

Dari folder workspace utama:

```bash
npm run dev:frontend
```

Atau dari folder `frontend`:

```bash
npm install
npm run dev
```

Vite berjalan pada `http://localhost:5173`. Secara default, request `/api/*` dan `/health` diproxy ke `http://127.0.0.1:5000`. Target proxy dapat diubah melalui `VITE_API_PROXY_TARGET` pada `frontend/.env`. Untuk deployment yang memiliki API URL eksplisit, isi `VITE_API_URL`; nilai ini digunakan oleh endpoint API dan health check.

## Endpoint yang dikonsumsi

| Endpoint | Kegunaan frontend |
|---|---|
| `GET /health` | Status Express dan koneksi MongoDB |
| `GET /api/events?page=1&limit=50` | Event, KPI, filter, tabel, dan event bertanggal pada grafik; semua halaman dimuat mengikuti metadata pagination |
| `GET /api/monitoring/traffic?interval=hour\|day` | Agregasi traffic; event API bertimestamp tetap menjadi sumber penghitungan grafik jika tersedia |
| `GET /api/monitoring/metrics` | Catatan metrik model run yang tersimpan |
| `GET /api/blocked-ips?page=1&limit=50` | Daftar IP aktual pada collection `blocked_ips`; semua halaman dimuat mengikuti metadata pagination |

`Blocked IPs` sekarang memiliki dua bagian yang berbeda: **Blocked IPs aktual** mengambil record dari `/api/blocked-ips`, sedangkan **Risk signals (VPN / Proxy)** menampilkan event dengan `VPN_usage=1` atau `proxy_usage=1`. Risk signals tidak disajikan sebagai daftar IP yang telah diblokir. Schema blocked IP saat ini hanya mendukung `_id` dan `ip_address`, sehingga UI tidak membuat alasan, waktu blokir, skor, atau aksi unblock.

Label `is_fraudulent` pada event adalah label dataset (`0 = Valid`, `1 = Fraud`), bukan prediksi real-time dari ML. Status `NO_MODEL_RUN_RECORDED` juga bukan health check layanan Python.

Halaman hero menjelaskan fungsi dan alur kerja sistem tanpa menampilkan angka ringkasan dashboard. Pada Traffic overview, titik Valid disambungkan oleh garis biru dan titik Fraud oleh garis merah untuk memperlihatkan perubahan jumlah event antarinterval. Garis putus-putus amber menunjukkan UCL Fraud 3-sigma. Ikon bantuan di panel membuka modal yang menjelaskan arti garis dan interpretasi titik di atas atau di bawah threshold.

## Pengujian frontend

```bash
npm run test:activity16
npm run test:activity28
npm run build
```

`test:activity28` menguji pembacaan pagination daftar blocked IP, respons kosong, error HTTP, validasi field, dan batas `limit`. Tes ini menggunakan mock fetch dan tidak memerlukan MongoDB. Build hanya memvalidasi bundling frontend; bukan bukti tes HTTP atau browser end-to-end.
