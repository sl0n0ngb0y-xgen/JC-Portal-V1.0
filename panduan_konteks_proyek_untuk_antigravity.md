# Panduan Melanjutkan Proyek JC PORTAL di Google Antigravity

Dokumen ini berisi langkah pemindahan proyek serta ringkasan spesifikasi lengkap **JC PORTAL** agar Agent di Google Antigravity langsung memahami seluruh aturan bisnis, struktur kode, dan tahapan terakhir pengembangan.

---

## Cara Pindah & Lanjut di Google Antigravity

1. **Siapkan Folder Proyek di Komputer Anda**
   Buat satu folder baru (misalnya `jc-portal`), lalu simpan 3 file berikut di dalamnya:
   - `portal_kantor.html` (Frontend UI & logika interaktif)
   - `Code.gs` (Backend Google Apps Script & Google Sheets)
   - `HANDOFF_ANTIGRAVITY.md` (File ini sebagai acuan konteks Agent)

2. **Buka di Google Antigravity**
   - **Antigravity App / IDE (Desktop):** Klik **Add Workspace / Open Folder**, lalu pilih folder `jc-portal`.
   - **Antigravity Web / Remote Agents:** Klik **Create Project** → pilih **Upload Files** (atau hubungkan via GitHub / Google Drive) dan masukkan ketiga file di atas.

3. **Kirim Prompt Awal ke Agent Antigravity**
   Salin dan tempel *prompt* berikut pada chat baru di Antigravity agar Agent langsung menyinkronkan konteksnya:

   > Halo, kita akan melanjutkan pengembangan proyek **JC PORTAL** di workspace ini. Tolong baca dan pahami terlebih dahulu `@HANDOFF_ANTIGRAVITY.md`, `@portal_kantor.html`, dan `@Code.gs`. Setelah paham strukturnya, konfirmasi siap dan tunggu instruksi fitur berikutnya dari saya.

---

## Ringkasan Konteks & Spesifikasi Proyek (JC PORTAL)

### 1. Tujuan & Arsitektur Sistem
- **Nama Aplikasi:** JC PORTAL (Sistem Operasional, Studio & Job Tracker).
- **Stack Frontend:** Single-file HTML (`portal_kantor.html`) menggunakan Tailwind CSS (CDN), Font Awesome, Google Fonts (Inter), dan Tone.js (nada notifikasi perangkat). Sudah 100% *responsive* (Desktop, Tablet, Mobile).
- **Stack Backend:** Google Apps Script (`Code.gs`) yang terhubung ke **Google Sheets** sebagai database dan mendukung integrasi **Google Workspace** (login email kantor, Google Drive link, dan Webhook notifikasi ke Google Chat/HP).

### 2. Daftar Toko Resmi Marketplace
Seluruh pilihan multi-toko, filter, dan katalog menggunakan 4 toko resmi:
1. **Godwin**
2. **Sidji**
3. **Gudang Trail**
4. **JSH**

### 3. Modul-Modul yang Sudah Dibangun
1. **Dashboard Utama:**
   - Kartu akses cepat ke 4 sub-menu utama.
   - *Banner* peringatan order **URGENT** (disembunyikan pada mode Guest).
   - **Papan Pengumuman Kantor** & **Info Lowongan Pekerjaan** (dengan tombol referral ke WA HRD).
2. **Job Tracker V.2.0 (sebelumnya Order Desain):**
   - Form pembuatan order dengan pemilihan multi-toko, deadline, link bahan, dan penanda **🔥 URGENT** (baris *highlight* merah & naik ke paling atas antrean).
   - Identitas pembuat order otomatis tercatat (Nama, Email, WA).
   - 5 kartu rekapitulasi bulanan (*Total, Antrean, Pending, Revisi, Selesai*).
   - Filter histori lintas **Tahun & Bulan**, Toko, Status, dan tombol **Hanya Urgent**.
   - Tombol **WhatsApp 1-klik** ke Admin pembuat order maupun PIC Desainer.
   - Mekanisme **Revisi Terstruktur** (`Rev 1x, 2x` + log catatan revisi dalam modal).
   - Ceklis **ACC Admin** (aktif saat status Selesai).
   - Notifikasi perangkat (*Web Notification API* + suara `Tone.js` + dukungan *webhook* di `Code.gs`).
3. **Jadwal Studio Foto:** Booking jadwal dengan deteksi otomatis bentrok waktu, keperluan, divisi/toko, peralatan tambahan, dan status.
4. **Jadwal Ruang Meeting:** Booking ruangan (*Ruang Meeting Utama Lt. 2* & *Ruang Diskusi Kreatif Lt. 1*) dengan deteksi otomatis bentrok per ruangan & tanggal.
5. **Product Knowledge:** Katalog SKU, keunggulan (USP), spesifikasi teknis, panduan jawaban chat (FAQ), pencarian cepat, dan tombol *Copy Copywriting*.
6. **Dashboard Webmaster:**
   - Manajemen User (tambah user, nomor WA, ubah role, uji login, hapus user).
   - **Pusat Histori Semua Modul** (gabungan 6 modul dengan filter Modul, Tahun, Bulan, dan Pencarian).
   - **Cetak Laporan Resmi / PDF** (`window.print()` dengan kop laporan resmi JC PORTAL via `@media print`).

### 4. Matriks Hak Akses (RBAC) & Kepemilikan Data
- **Webmaster (`WEBMASTER`):** Akses penuh ke semua modul, manajemen user/role, histori gabungan + cetak laporan, serta dapat mengedit/menghapus item milik siapa saja.
- **Kepala Marketplace (`KEPALA_MP`):** Buat Pengumuman, tambah Product Knowledge, booking Ruang Meeting (*Read-Only* modul lain).
- **HRD (`HRD`):** Buat Pengumuman, isi Info Lowongan Pekerjaan, booking Ruang Meeting (*Read-Only* modul lain).
- **Kepala Digital Marketing (`KEPALA_DM`):** Buat Pengumuman, booking Ruang Meeting, tambah Product Knowledge (*Read-Only* modul lain).
- **Kepala Tim Branding (`KEPALA_BRANDING`):** Booking Ruang Meeting, booking Studio Foto, tambah Product Knowledge (*Read-Only* modul lain).
- **Staff Desain (`DESIGNER`):** Edit Job Tracker (PIC, Status, Link Hasil), booking Studio Foto (*Read-Only* modul lain).
- **Admin Marketplace (`ADMIN_MP`):** Edit Job Tracker (buat order, tandai Urgent, ajukan Revisi, centang ACC) (*Read-Only* modul lain).
- **Guest (`GUEST`):** *Read-Only*, seluruh menu modul lain & banner Urgent disembunyikan; hanya menampilkan **Papan Pengumuman Kantor khusus buatan HRD** dan **Info Lowongan Pekerjaan**.
- **Aturan Kepemilikan:** Setiap Admin/Staff hanya dapat mengedit dan menghapus item yang dibuat oleh akunnya sendiri (`creatorEmail`), kecuali **Webmaster** yang memiliki wewenang penuh.

---

## Status Terakhir & Rencana Lanjutan (Opsional)
- Seluruh UI & logika prototipe di `portal_kantor.html` sudah stabil dan berjalan mandiri dengan data simulasi.
- **Tahap berikutnya yang cocok dikerjakan di Antigravity:**
  1. Menghubungkan langsung fungsi-fungsi di `portal_kantor.html` ke `Code.gs` menggunakan `google.script.run` (mengganti array lokal dengan data *real-time* dari Google Sheets).
  2. Menambahkan skema sheet lengkap untuk tab `Jadwal_Meeting` dan `Lowongan_Kerja` di `setupDatabaseSheets()` pada `Code.gs`.
  3. Menghubungkan URL Webhook Google Chat / Telegram pada `DESIGN_TEAM_WEBHOOK_URL` di `Code.gs`.