# 💻 LAPTORIUM — Toko Online Jual Beli Laptop & PC + CMS + POS Kasir

**Single Page Application (3 file) berbasis Blogspot + Google Apps Script + Google Spreadsheet.**

| File | Fungsi |
|---|---|
| `theme.xml` | Tema Blogspot: landing page toko + CMS Admin + POS Kasir (SPA, tanpa build step) |
| `code.gs` | Backend REST API (Google Apps Script). Data tersimpan di Google Spreadsheet |
| `README.md` | Panduan lengkap ini (instalasi, API, operasional, troubleshooting) |

> **Demo instan tanpa backend:** tema langsung berfungsi dengan *mode demo* (data contoh di memori) sampai Anda menghubungkan Web App URL + API key. Cocok untuk preview & presentasi.

---

## 1. Fitur Lengkap (sesuai PRD)

### 🏬 A. Landing Page / Toko Online (conversion-focused)
- Sticky navbar glassmorphism + menu mobile geser + bottom-nav mobile
- Hero premium: headline, CTA ganda, social-proof stats (animasi counter), foto + kartu melayang + badge berputar
- Strip merek berjalan (marquee), section fitur/keunggulan (6 kartu)
- **Katalog produk**: filter kategori, pencarian real-time, filter kondisi (Baru/Second), 5 mode urutan, pagination "muat lebih banyak", skeleton loading
- Kartu produk: badge, diskon %, rating, terjual, status stok, wishlist ♥, quick-view modal + multi-foto
- Slider banner promo otomatis, showcase layanan (dark cards), section benefit + garansi, form **Tukar Tambah / Jual Device**
- Testimoni + ringkasan rating Google, FAQ akordeon, CTA WhatsApp, footer lengkap
- Keranjang geser (drawer): ubah qty, hapus, hitung ongkir + info progres gratis ongkir
- **Checkout**: data pembeli, 5 metode bayar (Transfer/QRIS/COD/Cicilan/Ambil di toko), invoice otomatis, tombol konfirmasi WA
- **Lacak pesanan** by invoice + timeline status, tombol WA mengambang
- Animasi: scroll-reveal stagger, hover lift, ambient blobs, shine button, toast, dsb. + `prefers-reduced-motion`
- SEO dasar: meta description/keywords, semantic HTML, alt text, aksesibel (skip-link, ARIA, fokus keyboard)

### 🛠️ B. CMS Admin (`#/admin` — login: `admin` / `admin123`)
- **Dashboard**: omzet, order, produk, pelanggan, grafik 7 hari (canvas), produk terlaris, peringatan stok menipis, order terbaru
- **Produk**: CRUD penuh + atur stok (tambah/kurang/set), pencarian, badge unggulan/terlaris, status aktif/draft/arsip
- **Kategori, Layanan, Testimoni, Banner Promo, FAQ**: CRUD penuh, tampil live di toko
- **Pesanan**: filter status/sumber, cari invoice, tandai lunas, majukan status, batalkan (stok kembali otomatis), detail + chat WA pelanggan
- **Trade-In**: estimasi harga, approve/reject/selesai, chat WA 1 klik
- **Pelanggan**: CRUD, riwayat total order & belanja (otomatis dari transaksi)
- **Laporan**: omzet harian, rata-rata transaksi, grafik, rincian metode bayar
- **Pengaturan**: profil toko, hero, pengumuman, ongkir, info bank, kredensial — + panel koneksi backend & tombol isi data demo
- **Log aktivitas** 100 terakhir + badge penghitung order/trade-in pending di sidebar

### 🧾 C. POS Kasir (`#/pos` — PIN demo: `1234`)
- Grid produk + pencarian + filter kategori + shortcut Enter (tambah cepat jika hasil tunggal)
- Keranjang: qty stepper, hapus, pelanggan opsional, diskon nominal
- 4 metode bayar (Tunai/QRIS/Transfer/Debit), input tunai + tombol uang-pas & pecahan, **kembalian otomatis**
- Validasi stok & uang kurang, potong stok atomik (LockService), invoice `POS-…` otomatis
- **Struk cetak** (print-friendly 58mm-friendly), riwayat transaksi + cetak ulang, ringkasan omzet hari ini, jam live

### ⚙️ D. Backend (`code.gs`)
- REST API `GET`/`POST` (JSON, `Content-Type: text/plain` agar bebas preflight CORS)
- API key + token sesi (12 jam) + role `admin`/`kasir`; harga & stok divalidasi di server (anti-manipulasi)
- Invoice unik, kembalikan stok saat order dibatalkan, upsert pelanggan otomatis
- 12 sheet otomatis + `setup()` 1-klik + `seedDemo()` data contoh Indonesia

---

## 2. Arsitektur

```
Blogspot (theme.xml: HTML+CSS+JS SPA)
   │  GET ?action=…&key=…   POST {"action":…} (text/plain)
   ▼
Google Apps Script Web App (code.gs) — Execute as: Me, Access: Anyone
   ▼
Google Spreadsheet (12 sheet = database)
```

**Sheet & kolom kunci:** `Settings(key,value)` • `Categories` • `Products(id,sku,name,brand,category,price,promo_price,stock,condition,specs,…,status)` •
`Orders(invoice,customer_*,items_json,subtotal,discount,shipping,total,payment_*,order_status,source,cashier)` • `Customers` • `Services` • `Testimonials` • `Banners` • `Faqs` • `TradeIns` • `Logs`. Sheet dibuat otomatis oleh `setup()`.

---

## 3. Instalasi Backend (10 menit)

1. Buat **Spreadsheet baru** (mis. "DB Laptorium") di Google Drive.
2. Menu **Extensions → Apps Script**, hapus isi editor, **paste seluruh `code.gs`** → 💾 Save.
3. Di editor, pilih fungsi **`setup`** → ▶ Run → beri izin (Advance → Go to project → Allow).
4. Lihat **Execution log**: catat **API KEY** (24 karakter). *API key juga bisa dilihat ulang: Project Settings → Script Properties → `LAPTORIUM_API_KEY`.*
5. (Opsional, disarankan) Jalankan fungsi **`seedDemo`** → spreadsheet terisi data contoh.
6. **Deploy → New deployment** → tipe **Web app**:
   - *Execute as*: **Me** • *Who has access*: **Anyone** → Deploy → salin **Web App URL** (`…/exec`).
7. Setiap ubah `code.gs` kemudian: **Deploy → Manage deployments → ✏️ → New version → Deploy.**

---

## 4. Instalasi Tema Blogspot (5 menit)

1. Blogger → **Tema → ⋮ → Pulihkan** → upload `theme.xml` (atau **Edit HTML**, hapus semua, paste isi `theme.xml`, Simpan).
   > Tema valid XML Blogspot (sudah termasuk `b:section`/`Blog1` tersembunyi) — tidak merusak struktur blog.
2. Buka blog → appended route:
   - Toko: `/` • Lacak: `#/lacak` • Admin: `#/admin` • POS: `#/pos`
3. Masuk **Admin** (`#/admin`, demo: `admin` / `admin123`) → **Pengaturan** → isi **Web App URL + API Key** → **Simpan & Sambungkan**.
   - Alternatif permanen: edit konstanta `CONFIG` di awal `<script>` pada `theme.xml`.
4. Login ulang dengan kredensial server (default: `admin` / `admin123`, PIN kasir `1234`) → ganti di Pengaturan!

> Mode demo (sebelum koneksi): semua fitur bisa diklik & dicoba; data hanya di memori browser.

---

## 5. Referensi REST API

Basis: `GET {URL}?action=NAMA&key=APIKEY` • Tulis: `POST {URL}` body JSON `text/plain`.

**Publik (baca):** `health` • `getSettingsPublic` • `getProducts?search=&category=&brand=&condition=&sort=newest|popular|price_asc|price_desc|name&page=&limit=` • `getProduct?id=` • `getCategories` • `getServices` • `getTestimonials` • `getBanners` • `getFaqs` • `trackOrder?code=INV-…`

**Butuh `key` (baca admin):** `getSettings` • `getOrders?source=&status=&search=&page=` • `getOrder?id=` • `getCustomers` • `getTradeIns` • `getDashboard` • `getReport?period=daily|monthly` • `getLogs`

**Publik (tulis, wajib `key`):** `createOrder{customer_name,customer_wa,customer_address,items:[{id,qty}],shipping,payment_method,notes}` • `submitTradeIn{data:{name,wa,device_brand,…}}` • `login{username,password}` / `login{mode:'pos',pin,cashier}` → `{token,role,name}`

**Butuh `token`:** `saveSettings{data}` • `upsertProduct|upsertCategory|upsertService|upsertTestimonial|upsertBanner|upsertFaq|upsertCustomer{data}` • `deleteProduct|deleteCategory|deleteService|deleteTestimonial|deleteBanner|deleteFaq|deleteCustomer|deleteOrder{id}` • `adjustStock{id,qty,mode:add|set}` • `posCheckout{cashier,customer_name,discount,payment_method,pay,items}` • `updateOrder{id,payment_status,order_status,…}` • `updateTradeIn{id,status,est_price,notes}` • `seedDemo`

Semua respons: `{ok:true,data:…}` atau `{ok:false,error,code}`.

---

## 6. Operasional Harian

| Tugas | Cara |
|---|---|
| Tambah produk | Admin → Produk → Tambah (foto via URL; gunakan Blogger/Drive publik/Unsplash) |
| Proses order online | Admin → Pesanan → detail → Tandai lunas → majukan status → kirim |
| Transaksi toko | POS → ketuk produk → diskon →Tunai→ Bayar → Cetak struk |
| Tutup hari | POS → "Hari Ini" cocokkan laci; Admin → Laporan arsip omzet |
| Restock | Admin → Produk → Atur (atau edit stok langsung di Spreadsheet) |
| Ganti password/PIN | Admin → Pengaturan (password di-hash SHA-256; PIN kasir terpisah) |
| Backup | Spreadsheet → File → Download / Version history (otomatis tersimpan) |

---

## 7. Kustomisasi Cepat

- **Warna/brand**: variabel CSS `:root` (`--brand`, `--grad`, …) di `<b:skin>`; nama toko di Pengaturan.
- **Font**: link Google Fonts di `<head>` (default Plus Jakarta Sans).
- **Foto produk**: URL langsung (akhiri `.jpg/.png`) — untuk Google Drive gunakan format `https://drive.google/thumbnail?id=FILE_ID&sz=w800`.
- **Ongkir & gratis ongkir**: Pengaturan → `shipping_flat`, `free_shipping_min`.
- **WhatsApp**: nomor di Pengaturan (`store_wa`, format 62…).
- **Tambah metode bayar**: opsi di `Checkout.pay-opts` (tema) + enum di frontend (backend menerima string bebas).

---

## 8. Troubleshooting

| Gejala | Solusi |
|---|---|
| "API key tidak valid" | Samakan key di Pengaturan tema dengan Script Properties; pastikan deploy **New version** |
| Fetch gagal / CORS | Deploy harus **Anyone** (bukan hanya Google); URL `/exec` bukan `/dev`; POST memakai `text/plain` (sudah benar di tema) |
| Data tidak berubah | Tunggu 2–5 dtk (kuota Sheets) → refresh; cek **Executions** di Apps Script untuk error |
| Login admin gagal live | Default server `admin`/`admin123` (Settings sheet); kosongkan → jalankan `setup()` lagi |
| Tema ditolak Blogger | Pastikan upload file utuh; error umum: tag tak seimbang — file ini sudah lolos validasi XML |
| Gambar tidak tampil | URL harus publik (Drive: share Anyone + format thumbnail di atas) |
| Struk terpotong | Cetak via Chrome, margin Minimum, matikan header/footer |

**Batasan wajar Apps Script gratis:** ±20.000 URL-fetch/hari & 6 mnt/eksekusi — cukup untuk toko kecil-menengah. Butuh skala besar? Migrasi 1:1 ke Cloudflare Workers + Supabase (struktur API sudah RESTful).

---

## 9. Peta PRD → Implementasi

PRD umum toko online + POS: katalog & pencarian ✅ • keranjang & checkout ✅ • invoice & pelacakan ✅ • trade-in ✅ • CMS konten (produk/kategori/layanan/testimoni/banner/FAQ) ✅ • manajemen order & pelanggan ✅ • laporan ✅ • POS (cepat, tunai, kembalian, struk) ✅ • multi-user (admin/kasir) ✅ • responsif desktop/mobile ✅ • data terpusat Spreadsheet ✅ • panduan & API docs ✅.

## 10. Roadmap (opsional)

Notifikasi WA otomatis (fonnte/dll) • barcode scanner USB di POS • retur/refund • multi-cabang & shift kasir • loyalty poin • integrasi RajaOngkir & payment gateway (Midtrans/Xendit) • PWA installable + mode offline antre.

---

**© 2026 Laptorium.** Dibuat dengan ♥ untuk UMKM Indonesia — bebas dipakai & dimodifikasi untuk tokomu.
