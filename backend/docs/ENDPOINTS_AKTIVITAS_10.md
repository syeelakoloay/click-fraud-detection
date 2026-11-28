# Referensi Endpoint — Aktivitas 10

Base URL default: `http://localhost:5000`.

| Method | Path | Fungsi | Respons normal |
|---|---|---|---|
| GET | `/health` | Status aplikasi dan koneksi MongoDB | `200` tersambung; `503` jika tidak tersambung |
| POST | `/api/events` | Menyimpan satu event | `201` |
| GET | `/api/events` | Daftar event dengan pagination/filter | `200` |
| GET | `/api/events/:clickId` | Membaca satu event dengan `click_id` | `200` atau `404` |
| PATCH | `/api/events/:clickId` | Memperbarui field event yang diizinkan | `200`, `400`, atau `404` |
| DELETE | `/api/events/:clickId` | Menghapus event menurut `click_id` | `200` atau `404` |
| POST | `/api/events/ingest` | Memproses batch event JSON, maksimal 5.000 item | `200` berisi hasil per item |

## Query untuk daftar event

`GET /api/events` meneruskan opsi ke `eventService.listEvents` yang tersedia pada progres sebelumnya:

- `page`, `limit` — pagination; default service 1 dan 50, batas maksimum 100 per halaman.
- `click_id`, `ip_address`, `device_type`, `is_fraudulent` — filter event.
- `startDate`, `endDate` — batas waktu timestamp.
- `sortBy` — `timestamp`, `click_id`, atau `is_fraudulent`.
- `sortOrder` — `asc` atau `desc`.

## Contoh health check

```http
GET /health
```

Contoh respons jika database tersambung:

```json
{
  "status": "ok",
  "service": "click-fraud-detection-api",
  "database": "connected"
}
```

## Contoh ingestion

```http
POST /api/events/ingest
Content-Type: application/json
```

```json
{
  "events": [
    {
      "click_id": "event-id-from-source",
      "timestamp": "2024-08-18T10:30:00.000Z",
      "user_id": "user-id-from-source",
      "ip_address": "192.0.2.10",
      "device_type": "Desktop",
      "browser": "Chrome",
      "operating_system": "Windows",
      "referrer_url": "https://example.test/referrer",
      "page_url": "https://example.test/landing",
      "click_duration": 2.1,
      "scroll_depth": 40,
      "mouse_movement": 12,
      "keystrokes_detected": 2,
      "ad_position": "Top",
      "click_frequency": 1,
      "time_since_last_click": 10,
      "device_ip_reputation": "Good",
      "VPN_usage": 0,
      "proxy_usage": 0,
      "bot_likelihood_score": 0.2,
      "is_fraudulent": 0
    }
  ]
}
```

Contoh tersebut menjelaskan bentuk payload saja; itu bukan rekaman dataset proyek dan tidak dimasukkan otomatis ke database. Ganti seluruh nilai dengan record yang memang bersumber dari dataset atau sumber yang diizinkan.

Respons batch memuat `receivedCount`, `successCount`, `failureCount`, serta `results`. Untuk setiap item, `status` bernilai `created` atau `rejected`. Item yang ditolak memuat indeks item dan pesan error; `click_id` disertakan bila tersedia.

## Aturan API

- Body create dan update harus berupa object JSON.
- Field yang tidak ada dalam schema `Event` ditolak.
- `click_id` diperlukan ketika membuat event dan tidak dapat diubah ketika memperbarui event.
- `is_fraudulent` tetap label pada data sumber, bukan prediksi dari model.
- CORS hanya mengatur kemampuan browser membaca respons dari origin yang diizinkan; CORS bukan autentikasi atau otorisasi.
