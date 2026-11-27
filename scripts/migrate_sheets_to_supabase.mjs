#!/usr/bin/env node
/**
 * ============================================================================
 * JC PORTAL V.2.0 — MIGRASI & DELTA SYNC GOOGLE SHEETS -> SUPABASE
 * Zero external dependencies (Node.js 18+ native fetch).
 *
 * Cara pakai:
 *   1. Tempel SUPABASE_SECRET_KEY di file .env.local
 *   2. Jalankan: node scripts/migrate_sheets_to_supabase.mjs
 * ============================================================================
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    const val = line.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(path.join(ROOT_DIR, '.env.local'));
loadEnvFile(path.join(ROOT_DIR, '.env'));

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
const SECRET_KEY = (process.env.SUPABASE_SECRET_KEY || '').trim();
const DEFAULT_PASSWORD = (process.env.DEFAULT_USER_PASSWORD || '12345678').trim();

if (!SUPABASE_URL || !SECRET_KEY || SECRET_KEY.includes('PASTE_SECRET_KEY')) {
  console.error('ERROR: Lengkapi SUPABASE_URL dan SUPABASE_SECRET_KEY di file .env.local terlebih dahulu.');
  process.exit(1);
}

const SNAPSHOT_PATH = path.join(__dirname, 'sheets_snapshot.json');
if (!fs.existsSync(SNAPSHOT_PATH)) {
  console.error('ERROR: scripts/sheets_snapshot.json tidak ditemukan.');
  process.exit(1);
}

const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));

function sheetToObjects(rows) {
  if (!Array.isArray(rows) || rows.length <= 1) return [];
  const headers = rows[0].map(h => String(h || '').trim());
  return rows.slice(1).filter(r => r.some(c => String(c || '').trim() !== '')).map(r => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = r[i] !== undefined ? String(r[i]).trim() : ''; });
    return obj;
  });
}

function toBool(v) {
  return String(v || '').trim().toUpperCase() === 'TRUE';
}

function toJakartaTimestamp(val) {
  const s = String(val || '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/.test(s)) {
    const normalized = s.replace(' ', 'T');
    return normalized.length === 16 ? `${normalized}:00+07:00` : `${normalized}+07:00`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toDateISO(val, fallback = '2026-01-01') {
  const s = String(val || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}[T ]/.test(s)) return s.slice(0, 10);
  return fallback;
}

function safeJsonArray(val) {
  const s = String(val || '').trim();
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function restUpsert(table, rows, conflictCol = 'id') {
  if (!rows.length) {
    console.log(`  [${table}] 0 rows (skip)`);
    return;
  }
  const batchSize = 200;
  let total = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const url = `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${encodeURIComponent(conflictCol)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        apikey: SECRET_KEY,
        Authorization: `Bearer ${SECRET_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal'
      },
      body: JSON.stringify(batch)
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Upsert ${table} batch ${i}-${i + batch.length} gagal (${res.status}): ${errText}`);
    }
    total += batch.length;
  }
  console.log(`  [${table}] OK — ${total} baris tersinkron.`);
}

async function listAllAuthUsers() {
  const map = new Map();
  let page = 1;
  while (true) {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?page=${page}&per_page=200`, {
      headers: {
        apikey: SECRET_KEY,
        Authorization: `Bearer ${SECRET_KEY}`
      }
    });
    if (!res.ok) {
      throw new Error(`Gagal membaca Auth users (${res.status}): ${await res.text()}`);
    }
    const data = await res.json();
    const users = data.users || [];
    for (const u of users) {
      if (u.email) map.set(u.email.toLowerCase(), u.id);
    }
    if (users.length < 200) break;
    page++;
  }
  return map;
}

async function ensureAuthUser(email, name, role, existingAuthMap) {
  const emailLower = email.toLowerCase();
  if (existingAuthMap.has(emailLower)) {
    return existingAuthMap.get(emailLower);
  }
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: 'POST',
    headers: {
      apikey: SECRET_KEY,
      Authorization: `Bearer ${SECRET_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      email: emailLower,
      password: DEFAULT_PASSWORD,
      email_confirm: true,
      user_metadata: { name, role }
    })
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gagal membuat Auth user ${emailLower} (${res.status}): ${errText}`);
  }
  const created = await res.json();
  const uid = created.id || created.user?.id || null;
  if (uid) existingAuthMap.set(emailLower, uid);
  return uid;
}

async function main() {
  console.log('=== JC PORTAL V.2.0: MIGRASI GOOGLE SHEETS -> SUPABASE ===');
  console.log('Target:', SUPABASE_URL);

  // 1. USERS_ROLE + SUPABASE AUTH
  const rawUsers = sheetToObjects(snapshot.Users_Role);
  console.log(`\n1. Memigrasikan ${rawUsers.length} akun Users_Role ke Supabase Auth & public.users_role...`);
  const existingAuthMap = await listAllAuthUsers();
  const userRows = [];
  for (const u of rawUsers) {
    const email = (u.Email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) continue;
    const role = (u.Role || 'GUEST').trim().toUpperCase();
    const name = (u.Nama || email.split('@')[0]).trim();
    const wa = (u.No_WhatsApp || '').replace(/[^\d]/g, '');
    let authUserId = null;
    if (role !== 'GUEST') {
      authUserId = await ensureAuthUser(email, name, role, existingAuthMap);
    }
    userRows.push({
      email,
      auth_user_id: authUserId,
      name,
      role,
      wa,
      is_default_password: role !== 'GUEST'
    });
  }
  await restUpsert('users_role', userRows, 'email');

  // 2. DESIGN_ORDERS
  const rawOrders = sheetToObjects(snapshot.Order_Desain);
  const validOrderStatuses = new Set(['Antrean', 'Pending', 'Revisi', 'Selesai', 'Cancel']);
  const orderRows = rawOrders.filter(o => o.ID).map(o => {
    const stores = (o.Stores_CSV || '').split(',').map(s => s.trim()).filter(Boolean);
    const status = validOrderStatuses.has(o.Status) ? o.Status : 'Antrean';
    return {
      id: o.ID,
      date_iso: toDateISO(o.Tanggal_ISO),
      date_display: o.Tanggal_Tampil || o.Tanggal_ISO || '',
      creator_name: o.Pembuat_Nama || '',
      creator_email: (o.Pembuat_Email || '').toLowerCase(),
      creator_wa: o.Pembuat_WA || '',
      product: o.Produk || '(Tanpa Judul)',
      design_type: o.Jenis || '',
      stores,
      deadline: o.Deadline || '-',
      link_bahan: o.Link_Bahan || '',
      link_hasil: o.Link_Hasil || '',
      notes: o.Keterangan || '',
      pic: o.PIC || 'Belum Ditugaskan',
      status,
      acc: toBool(o.ACC_Admin),
      is_urgent: toBool(o.Is_Urgent),
      revision_count: Number.parseInt(o.Jumlah_Revisi || '0', 10) || 0,
      revisions: safeJsonArray(o.Log_Revisi_JSON),
      started_at: toJakartaTimestamp(o.Waktu_Mulai),
      completed_at: toJakartaTimestamp(o.Waktu_Selesai)
    };
  });
  console.log(`\n2. Memigrasikan ${orderRows.length} order Job Tracker...`);
  await restUpsert('design_orders', orderRows, 'id');

  // 3. STUDIO_BOOKINGS
  const rawStudio = sheetToObjects(snapshot.Jadwal_Studio);
  const studioRows = rawStudio.filter(s => s.ID).map(s => {
    let st = s.Status || 'Terbooking';
    if (st === 'Booked') st = 'Terbooking';
    if (!['Terbooking', 'Selesai', 'Dibatalkan'].includes(st)) st = 'Terbooking';
    return {
      id: s.ID,
      user_name: s.User || '',
      creator_email: (s.Pembuat_Email || '').toLowerCase(),
      date_iso: toDateISO(s.Tanggal),
      start_time: s.Jam_Mulai || '09:00',
      end_time: s.Jam_Selesai || '10:00',
      purpose: s.Keperluan || '',
      division: s.Divisi_Toko || '',
      equipment: s.Peralatan || '',
      status: st
    };
  });
  console.log(`\n3. Memigrasikan ${studioRows.length} Jadwal Studio...`);
  await restUpsert('studio_bookings', studioRows, 'id');

  // 4. MEETING_BOOKINGS
  const rawMeeting = sheetToObjects(snapshot.Jadwal_Meeting);
  const meetingRows = rawMeeting.filter(m => m.ID).map(m => {
    let st = m.Status || 'Terjadwal';
    if (st === 'Booked') st = 'Terjadwal';
    if (!['Terjadwal', 'Selesai', 'Dibatalkan'].includes(st)) st = 'Terjadwal';
    return {
      id: m.ID,
      user_name: m.User || '',
      creator_email: (m.Pembuat_Email || '').toLowerCase(),
      room: m.Ruangan || 'Ruang Meeting Utama',
      date_iso: toDateISO(m.Tanggal),
      start_time: m.Jam_Mulai || '09:00',
      end_time: m.Jam_Selesai || '10:00',
      agenda: m.Agenda || '',
      division: m.Divisi || '',
      status: st
    };
  });
  console.log(`\n4. Memigrasikan ${meetingRows.length} Jadwal Meeting...`);
  await restUpsert('meeting_bookings', meetingRows, 'id');

  // 5. ANNOUNCEMENTS
  const rawAnn = sheetToObjects(snapshot.Pengumuman);
  const annRows = rawAnn.filter(a => a.ID).map(a => ({
    id: a.ID,
    date_iso: toDateISO(a.Waktu, new Date().toISOString().slice(0, 10)),
    title: a.Judul || '',
    category: a.Kategori || 'Kebijakan / HRD',
    author: a.Penulis || '',
    creator_email: (a.Pembuat_Email || '').toLowerCase(),
    creator_role: (a.Role_Penulis || '').toUpperCase(),
    time_label: a.Waktu || '',
    content: a.Isi || ''
  }));
  console.log(`\n5. Memigrasikan ${annRows.length} Pengumuman...`);
  await restUpsert('announcements', annRows, 'id');

  // 6. JOB_VACANCIES
  const rawJobs = sheetToObjects(snapshot.Lowongan_Kerja);
  const jobRows = rawJobs.filter(j => j.ID).map(j => ({
    id: j.ID,
    title: j.Posisi || '',
    division: j.Divisi || '',
    job_type: j.Tipe || 'Full-Time',
    location: j.Lokasi || '',
    creator_email: (j.Pembuat_Email || '').toLowerCase(),
    wa_hrd: j.WA_HRD || '',
    status: ['Dibuka', 'Ditutup', 'Draft'].includes(j.Status) ? j.Status : 'Dibuka',
    description: j.Deskripsi || ''
  }));
  console.log(`\n6. Memigrasikan ${jobRows.length} Lowongan Kerja...`);
  await restUpsert('job_vacancies', jobRows, 'id');

  // 7. PRODUCT_KNOWLEDGE
  const rawPk = sheetToObjects(snapshot.Product_Knowledge);
  const pkRows = rawPk.filter(p => p.ID).map(p => ({
    id: p.ID,
    sku: p.SKU || '',
    name: p.Nama_Produk || '',
    brand: p.Brand_Toko || '',
    creator_email: (p.Pembuat_Email || '').toLowerCase(),
    usp: p.USP || '',
    specs: p.Spesifikasi || '',
    faq: p.FAQ || ''
  }));
  console.log(`\n7. Memigrasikan ${pkRows.length} Product Knowledge...`);
  await restUpsert('product_knowledge', pkRows, 'id');

  // 8. PRODUCT_LOANS
  const rawLoans = sheetToObjects(snapshot.Peminjaman_Produk);
  const validLoanStatuses = new Set(['Booking', 'Disiapkan', 'Sudah Siap', 'Diambil', 'Selesai!']);
  const validLeaderAcc = new Set(['Menunggu', 'Ya', 'Cancel']);
  const loanRows = rawLoans.filter(l => l.ID).map(l => ({
    id: l.ID,
    date_iso: toDateISO(l.Tanggal_ISO),
    borrow_time: toJakartaTimestamp(l.Waktu_Pinjam) || new Date().toISOString(),
    product_name: l.Nama_Produk || '',
    borrower: l.Peminjam || '',
    creator_email: (l.Pembuat_Email || '').toLowerCase(),
    purpose: l.Keperluan || '',
    division: l.Divisi_Toko || '',
    leader_acc: validLeaderAcc.has(l.ACC_Kepala) ? l.ACC_Kepala : 'Menunggu',
    leader_acc_by: l.ACC_Kepala_Oleh || '',
    status: validLoanStatuses.has(l.Status) ? l.Status : 'Booking',
    warehouse_acc: toBool(l.ACC_Gudang),
    warehouse_acc_by: l.ACC_Gudang_Oleh || '',
    returned_at: toJakartaTimestamp(l.Waktu_Kembali)
  }));
  console.log(`\n8. Memigrasikan ${loanRows.length} Peminjaman Produk...`);
  await restUpsert('product_loans', loanRows, 'id');

  console.log('\nSELESAI! Seluruh data Google Sheets berhasil dimigrasikan ke Supabase.');
}

main().catch(err => {
  console.error('\nMIGRASI GAGAL:', err.message);
  process.exit(1);
});
