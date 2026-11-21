/**
 * ============================================================================
 * JC PORTAL V.2.0 - GOOGLE APPS SCRIPT BACKEND (Code.gs)
 * Menghubungkan Portal UI (Index.html) secara real-time ke Google Sheets
 * & Google Workspace, termasuk Migrasi Job Tracker Lama.
 * ============================================================================
 */

// ID Database Google Sheets JC PORTAL V.2.0
// (Otomatis menggunakan spreadsheet aktif jika script terikat / container-bound)
const PORTAL_SPREADSHEET_ID = '1SFIn8YvOpMZWXTiIcm1133oFh0zBvs7NXgQSW-Kmkrk';

// ID Spreadsheet Job Tracker lama (sumber migrasi data histori)
const LEGACY_JOB_TRACKER_SPREADSHEET_ID = '1rjeR79SD4jTAEnZvLnFiyabE_7deyjUoawdbKdOPGng';

// Tempelkan URL Webhook Google Chat / Telegram Bot grup Tim Desain untuk notifikasi real-time
const DESIGN_TEAM_WEBHOOK_URL = '';

// Daftar 7 toko resmi JC PORTAL V.2.0
const OFFICIAL_STORES = ['Godwin', 'Sidji', 'Gudang Trail', 'JSH', 'JC', 'JSH Speedshop', 'Maxiclub'];

const SHEET_NAMES = {
  USERS: 'Users_Role',
  DESIGN_ORDERS: 'Order_Desain',
  STUDIO: 'Jadwal_Studio',
  MEETING: 'Jadwal_Meeting',
  ANNOUNCEMENTS: 'Pengumuman',
  JOBS: 'Lowongan_Kerja',
  PRODUCTS: 'Product_Knowledge'
};

/**
 * Helper: Mendapatkan instance Spreadsheet Database (bound atau standalone)
 */
function getPortalSpreadsheet_() {
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  return SpreadsheetApp.openById(PORTAL_SPREADSHEET_ID);
}

/**
 * Helper: Mendapatkan profil user aktif beserta hak aksesnya.
 * Mendukung auto-deteksi Google Workspace maupun login manual via Users_Role
 * (penting saat Web App di-deploy "Anyone" agar bebas bug layar putih multi-akun Gmail).
 */
function getCurrentUserContext_(ss, actingEmail) {
  const sessionEmail = (Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  const fallbackEmail = String(actingEmail || '').trim().toLowerCase();
  const resolvedEmail = sessionEmail || fallbackEmail;

  const userRows = getSheetDataAsObjects(ss.getSheetByName(SHEET_NAMES.USERS));
  const matched = resolvedEmail
    ? userRows.find(u => String(u.Email || '').trim().toLowerCase() === resolvedEmail)
    : null;

  if (matched) {
    return {
      email: String(matched.Email).trim(),
      name: String(matched.Nama || matched.Email).trim(),
      role: String(matched.Role || 'GUEST').trim().toUpperCase(),
      wa: String(matched.No_WhatsApp || '').trim(),
      autoDetected: Boolean(sessionEmail)
    };
  }
  return {
    email: resolvedEmail || 'guest@kantor.id',
    name: resolvedEmail ? resolvedEmail.split('@')[0] : 'Guest (Tamu)',
    role: 'GUEST',
    wa: '',
    autoDetected: false
  };
}

/**
 * 1. RENDER APLIKASI WEB
 * Otomatis mencari file HTML 'Index', 'index', atau 'portal_kantor_terpadu'
 */
function doGet(e) {
  const candidateNames = ['Index', 'index', 'portal_kantor_terpadu', 'portal_kantor'];
  let htmlOutput = null;
  for (let i = 0; i < candidateNames.length; i++) {
    try {
      htmlOutput = HtmlService.createHtmlOutputFromFile(candidateNames[i]);
      break;
    } catch (err) {}
  }
  if (!htmlOutput) {
    htmlOutput = HtmlService.createHtmlOutput(
      '<div style="font-family:sans-serif;padding:24px;"><h2>File HTML "Index" belum ditemukan</h2>' +
      '<p>Di editor Google Apps Script, klik tanda <b>+</b> &rarr; pilih <b>HTML</b> &rarr; beri nama <b>Index</b>, lalu tempel isi file <code>portal_kantor_terpadu.html</code>.</p></div>'
    );
  }
  return htmlOutput
    .setTitle('JC PORTAL - Sistem Operasional, Studio & Job Tracker V.2.0')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0');
}

/**
 * 2. INISIALISASI 7 TAB & HEADER GOOGLE SHEETS OTOMATIS
 * Jalankan fungsi ini 1x dari editor Apps Script jika tab belum dibuat
 */
function setupDatabaseSheets() {
  const ss = getPortalSpreadsheet_();

  const schemas = {
    [SHEET_NAMES.USERS]: ['Email', 'Nama', 'Role', 'No_WhatsApp'],
    [SHEET_NAMES.DESIGN_ORDERS]: [
      'ID', 'Tanggal_ISO', 'Tanggal_Tampil', 'Pembuat_Nama', 'Pembuat_Email', 'Pembuat_WA',
      'Produk', 'Jenis', 'Stores_CSV', 'Deadline', 'Link_Bahan', 'Link_Hasil',
      'Keterangan', 'PIC', 'Status', 'ACC_Admin', 'Is_Urgent', 'Jumlah_Revisi', 'Log_Revisi_JSON'
    ],
    [SHEET_NAMES.STUDIO]: [
      'ID', 'User', 'Pembuat_Email', 'Tanggal', 'Jam_Mulai', 'Jam_Selesai',
      'Keperluan', 'Divisi_Toko', 'Peralatan', 'Status'
    ],
    [SHEET_NAMES.MEETING]: [
      'ID', 'User', 'Pembuat_Email', 'Ruangan', 'Tanggal', 'Jam_Mulai', 'Jam_Selesai',
      'Agenda', 'Divisi', 'Status'
    ],
    [SHEET_NAMES.ANNOUNCEMENTS]: [
      'ID', 'Judul', 'Kategori', 'Penulis', 'Pembuat_Email', 'Role_Penulis', 'Waktu', 'Isi'
    ],
    [SHEET_NAMES.JOBS]: [
      'ID', 'Posisi', 'Divisi', 'Tipe', 'Lokasi', 'Pembuat_Email', 'WA_HRD', 'Status', 'Deskripsi'
    ],
    [SHEET_NAMES.PRODUCTS]: [
      'ID', 'SKU', 'Nama_Produk', 'Brand_Toko', 'Pembuat_Email', 'USP', 'Spesifikasi', 'FAQ'
    ]
  };

  Object.keys(schemas).forEach(sheetName => {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(schemas[sheetName]);
      sheet.getRange(1, 1, 1, schemas[sheetName].length).setFontWeight('bold').setBackground('#eef2ff');
      sheet.setFrozenRows(1);
    }
  });

  const userSheet = ss.getSheetByName(SHEET_NAMES.USERS);
  if (userSheet.getLastRow() === 1) {
    const activeEmail = Session.getActiveUser().getEmail() || 'webmaster@kantor.id';
    userSheet.appendRow([activeEmail, 'Webmaster Utama', 'WEBMASTER', '6281234567800']);
    userSheet.appendRow(['kepala.mp@kantor.id', 'Kepala Marketplace', 'KEPALA_MP', '6281234567810']);
    userSheet.appendRow(['hrd@kantor.id', 'HRD & GA', 'HRD', '6281234567811']);
    userSheet.appendRow(['kepala.dm@kantor.id', 'Kepala Digital Marketing', 'KEPALA_DM', '6281234567812']);
    userSheet.appendRow(['kepala.branding@kantor.id', 'Kepala Tim Branding', 'KEPALA_BRANDING', '6281234567813']);
    userSheet.appendRow(['desain@kantor.id', 'Staff Desain', 'DESIGNER', '6281234567802']);
    userSheet.appendRow(['admin.mp@kantor.id', 'Admin Marketplace', 'ADMIN_MP', '6281234567801']);
  }

  return { success: true, spreadsheetUrl: ss.getUrl() };
}

/**
 * KIRIM NOTIFIKASI PUSH KE PERANGKAT TIM DESAIN (GOOGLE CHAT / TELEGRAM WEBHOOK)
 */
function pushDeviceNotificationToDesigners(title, message) {
  if (!DESIGN_TEAM_WEBHOOK_URL) return;
  try {
    UrlFetchApp.fetch(DESIGN_TEAM_WEBHOOK_URL, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({ text: `*${title}*\n${message}` })
    });
  } catch (err) {
    Logger.log('Gagal mengirim webhook notifikasi: ' + err);
  }
}

/**
 * 3. DETEKSI LOGIN GOOGLE WORKSPACE OTOMATIS & AMBIL SEMUA DATA 7 MODUL
 */
function getInitialPortalData(actingEmail) {
  const ss = getPortalSpreadsheet_();
  const userProfile = getCurrentUserContext_(ss, actingEmail);

  // Users directory
  const usersRaw = getSheetDataAsObjects(ss.getSheetByName(SHEET_NAMES.USERS));
  const registeredUsers = usersRaw.map(u => ({
    email: String(u.Email || '').trim(),
    name: String(u.Nama || '').trim(),
    role: String(u.Role || 'GUEST').trim().toUpperCase(),
    wa: String(u.No_WhatsApp || '').trim()
  })).filter(u => u.email);

  // 1. Job Tracker V.2.0 (Order_Desain)
  const ordersRaw = getSheetDataAsObjects(ss.getSheetByName(SHEET_NAMES.DESIGN_ORDERS));
  const designOrders = ordersRaw.map(r => {
    let parsedRevLogs = [];
    if (r.Log_Revisi_JSON) {
      try { parsedRevLogs = JSON.parse(r.Log_Revisi_JSON); } catch (e) { parsedRevLogs = []; }
    }
    const iso = normalizeCellDateISO_(r.Tanggal_ISO);
    const displayDate = r.Tanggal_Tampil instanceof Date
      ? formatDisplayDateID_(normalizeCellDateISO_(r.Tanggal_Tampil))
      : String(r.Tanggal_Tampil || formatDisplayDateID_(iso)).trim();
    return {
      id: String(r.ID || '').trim(),
      dateISO: iso,
      date: displayDate,
      creatorName: String(r.Pembuat_Nama || '').trim(),
      creatorEmail: String(r.Pembuat_Email || '').trim(),
      creatorWa: String(r.Pembuat_WA || '').trim(),
      produk: String(r.Produk || '').trim(),
      jenis: String(r.Jenis || 'Foto Produk + Frame Marketplace').trim(),
      stores: r.Stores_CSV ? String(r.Stores_CSV).split(',').map(s => s.trim()).filter(Boolean) : [],
      deadline: formatShortDeadlineID_(r.Deadline),
      link: String(r.Link_Bahan || '').trim(),
      resultLink: String(r.Link_Hasil || '').trim(),
      keterangan: String(r.Keterangan || '').trim(),
      pic: String(r.PIC || 'Belum Ditugaskan').trim(),
      status: String(r.Status || 'Antrean').trim(),
      accAdmin: String(r.ACC_Admin).toUpperCase() === 'TRUE',
      isUrgent: String(r.Is_Urgent).toUpperCase() === 'TRUE',
      revisionCount: Number(r.Jumlah_Revisi) || 0,
      revisionLogs: Array.isArray(parsedRevLogs) ? parsedRevLogs : []
    };
  }).filter(o => o.id).reverse();

  // 2. Jadwal Studio Foto
  const studioRaw = getSheetDataAsObjects(ss.getSheetByName(SHEET_NAMES.STUDIO));
  const studioBookings = studioRaw.map(r => ({
    id: String(r.ID || '').trim(),
    user: String(r.User || '').trim(),
    creatorEmail: String(r.Pembuat_Email || '').trim(),
    date: normalizeCellDateISO_(r.Tanggal),
    startTime: formatShortTime_(r.Jam_Mulai),
    endTime: formatShortTime_(r.Jam_Selesai),
    keperluan: String(r.Keperluan || '').trim(),
    divisi: String(r.Divisi_Toko || '').trim(),
    peralatan: String(r.Peralatan || '').trim(),
    status: String(r.Status || 'Booked').trim()
  })).filter(b => b.id).reverse();

  // 3. Jadwal Ruang Meeting
  const meetingRaw = getSheetDataAsObjects(ss.getSheetByName(SHEET_NAMES.MEETING));
  const meetingBookings = meetingRaw.map(r => ({
    id: String(r.ID || '').trim(),
    user: String(r.User || '').trim(),
    creatorEmail: String(r.Pembuat_Email || '').trim(),
    room: String(r.Ruangan || '').trim(),
    date: normalizeCellDateISO_(r.Tanggal),
    startTime: formatShortTime_(r.Jam_Mulai),
    endTime: formatShortTime_(r.Jam_Selesai),
    agenda: String(r.Agenda || '').trim(),
    divisi: String(r.Divisi || '').trim(),
    status: String(r.Status || 'Booked').trim()
  })).filter(m => m.id).reverse();

  // 4. Papan Pengumuman Kantor
  const annRaw = getSheetDataAsObjects(ss.getSheetByName(SHEET_NAMES.ANNOUNCEMENTS));
  const announcements = annRaw.map(r => ({
    id: String(r.ID || '').trim(),
    dateISO: normalizeCellDateISO_(r.Waktu) || getTodayISO_(),
    title: String(r.Judul || '').trim(),
    category: String(r.Kategori || 'Pengumuman').trim(),
    author: String(r.Penulis || '').trim(),
    creatorEmail: String(r.Pembuat_Email || '').trim(),
    creatorRole: String(r.Role_Penulis || '').trim().toUpperCase(),
    time: String(r.Waktu || '').trim(),
    content: String(r.Isi || '').trim()
  })).filter(a => a.id).reverse();

  // 5. Info Lowongan Pekerjaan
  const jobsRaw = getSheetDataAsObjects(ss.getSheetByName(SHEET_NAMES.JOBS));
  const jobVacancies = jobsRaw.map(r => ({
    id: String(r.ID || '').trim(),
    dateISO: getTodayISO_(),
    title: String(r.Posisi || '').trim(),
    dept: String(r.Divisi || '').trim(),
    type: String(r.Tipe || 'Full-Time (WFO)').trim(),
    location: String(r.Lokasi || '').trim(),
    author: String(r.Pembuat_Email || 'HRD & GA').trim(),
    creatorEmail: String(r.Pembuat_Email || '').trim(),
    waHrd: String(r.WA_HRD || '6281234567811').trim(),
    status: String(r.Status || 'Aktif').trim(),
    desc: String(r.Deskripsi || '').trim()
  })).filter(j => j.id).reverse();

  // 6. Product Knowledge
  const prodRaw = getSheetDataAsObjects(ss.getSheetByName(SHEET_NAMES.PRODUCTS));
  const products = prodRaw.map(r => ({
    id: String(r.ID || '').trim(),
    dateISO: getTodayISO_(),
    sku: String(r.SKU || '').trim(),
    name: String(r.Nama_Produk || '').trim(),
    category: String(r.Brand_Toko || '').trim(),
    creatorEmail: String(r.Pembuat_Email || '').trim(),
    usp: String(r.USP || '').trim(),
    specs: String(r.Spesifikasi || '').split(/\r?\n|,/).map(s => s.trim()).filter(Boolean),
    faq: String(r.FAQ || '').trim()
  })).filter(p => p.id).reverse();

  return {
    success: true,
    spreadsheetUrl: ss.getUrl(),
    user: userProfile,
    registeredUsers: registeredUsers,
    designOrders: designOrders,
    studioBookings: studioBookings,
    meetingBookings: meetingBookings,
    announcements: announcements,
    jobVacancies: jobVacancies,
    products: products
  };
}

/**
 * 4. CRUD JOB TRACKER V.2.0 (ORDER DESAIN)
 */
function saveNewDesignOrderToSheet(orderObj, actingEmail) {
  const ss = getPortalSpreadsheet_();
  const user = getCurrentUserContext_(ss, actingEmail || (orderObj && orderObj.creatorEmail));
  if (!['WEBMASTER', 'WEB_ADMIN', 'ADMIN_MP'].includes(user.role)) {
    return { success: false, message: 'Akses ditolak: Hanya Admin Marketplace / Web Admin / Webmaster yang dapat membuat order.' };
  }

  const sheet = ss.getSheetByName(SHEET_NAMES.DESIGN_ORDERS);
  const nextId = orderObj.id || ('ORD-' + String(sheet.getLastRow() + 1).padStart(4, '0'));
  const storesCsv = Array.isArray(orderObj.stores) ? orderObj.stores.join(', ') : String(orderObj.stores || '');

  sheet.appendRow([
    nextId,
    orderObj.dateISO || getTodayISO_(),
    orderObj.date || formatDisplayDateID_(getTodayISO_()),
    orderObj.creatorName || user.name,
    orderObj.creatorEmail || user.email,
    orderObj.creatorWa || user.wa,
    orderObj.produk || '',
    orderObj.jenis || 'Foto Produk + Frame Marketplace',
    storesCsv,
    formatShortDeadlineID_(orderObj.deadline),
    orderObj.link || '',
    '',
    orderObj.keterangan || '',
    'Belum Ditugaskan',
    'Antrean',
    false,
    Boolean(orderObj.isUrgent),
    0,
    '[]'
  ]);

  const prefix = orderObj.isUrgent ? '🔥 [URGENT] ORDER DESAIN BARU' : '🎨 ORDER DESAIN BARU';
  pushDeviceNotificationToDesigners(
    `${prefix} (${nextId})`,
    `Produk: ${orderObj.produk}\nToko: ${storesCsv}\nDeadline: ${orderObj.deadline || '-'}`
  );

  return { success: true, id: nextId };
}

function updateDesignOrderField(orderId, fieldName, newValue, actingEmail) {
  return updateDesignOrderFields(orderId, { [fieldName]: newValue }, actingEmail);
}

function updateDesignOrderFields(orderId, updatesObj, actingEmail) {
  const ss = getPortalSpreadsheet_();
  const user = getCurrentUserContext_(ss, actingEmail);
  if (!['WEBMASTER', 'WEB_ADMIN', 'DESIGNER', 'ADMIN_MP'].includes(user.role)) {
    return { success: false, message: 'Akses ditolak untuk mengubah Job Tracker.' };
  }

  const sheet = ss.getSheetByName(SHEET_NAMES.DESIGN_ORDERS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(orderId).trim()) {
      Object.keys(updatesObj).forEach(colName => {
        const colIndex = headers.indexOf(colName);
        if (colIndex !== -1) {
          sheet.getRange(i + 1, colIndex + 1).setValue(updatesObj[colName]);
        }
      });
      return { success: true };
    }
  }
  return { success: false, message: 'ID Order tidak ditemukan: ' + orderId };
}

/**
 * 5. CRUD STUDIO FOTO, RUANG MEETING, PENGUMUMAN, LOKER & PRODUCT KNOWLEDGE
 */
function saveStudioBookingToSheet(bookingObj, actingEmail) {
  const ss = getPortalSpreadsheet_();
  const user = getCurrentUserContext_(ss, actingEmail || (bookingObj && bookingObj.creatorEmail));
  if (!['WEBMASTER', 'WEB_ADMIN', 'KEPALA_BRANDING', 'DESIGNER'].includes(user.role)) {
    return { success: false, message: 'Akses ditolak untuk booking studio foto.' };
  }

  const sheet = ss.getSheetByName(SHEET_NAMES.STUDIO);
  const existing = getSheetDataAsObjects(sheet);
  const conflict = existing.find(b =>
    normalizeCellDateISO_(b.Tanggal) === bookingObj.date &&
    String(b.Status) !== 'Dibatalkan' &&
    (bookingObj.startTime < String(b.Jam_Selesai) && bookingObj.endTime > String(b.Jam_Mulai))
  );
  if (conflict) {
    return {
      success: false,
      message: `Jadwal bentrok dengan ${conflict.User} (${conflict.Jam_Mulai} - ${conflict.Jam_Selesai}).`
    };
  }

  const id = String(bookingObj.id || Date.now());
  sheet.appendRow([
    id,
    bookingObj.user || user.name,
    user.email,
    bookingObj.date,
    bookingObj.startTime,
    bookingObj.endTime,
    bookingObj.keperluan,
    bookingObj.divisi,
    bookingObj.peralatan || '',
    bookingObj.status || 'Booked'
  ]);
  return { success: true, id: id };
}

function saveMeetingBookingToSheet(bookingObj, actingEmail) {
  const ss = getPortalSpreadsheet_();
  const user = getCurrentUserContext_(ss, actingEmail || (bookingObj && bookingObj.creatorEmail));
  if (!['WEBMASTER', 'WEB_ADMIN', 'KEPALA_MP', 'HRD', 'KEPALA_DM', 'KEPALA_BRANDING'].includes(user.role)) {
    return { success: false, message: 'Akses ditolak untuk booking ruang meeting.' };
  }

  const sheet = ss.getSheetByName(SHEET_NAMES.MEETING);
  const existing = getSheetDataAsObjects(sheet);
  const conflict = existing.find(m =>
    String(m.Ruangan) === bookingObj.room &&
    normalizeCellDateISO_(m.Tanggal) === bookingObj.date &&
    String(m.Status) !== 'Dibatalkan' &&
    (bookingObj.startTime < String(m.Jam_Selesai) && bookingObj.endTime > String(m.Jam_Mulai))
  );
  if (conflict) {
    return {
      success: false,
      message: `${bookingObj.room} sudah dibooking oleh ${conflict.User} (${conflict.Jam_Mulai} - ${conflict.Jam_Selesai}).`
    };
  }

  const id = String(bookingObj.id || Date.now());
  sheet.appendRow([
    id,
    bookingObj.user || user.name,
    user.email,
    bookingObj.room,
    bookingObj.date,
    bookingObj.startTime,
    bookingObj.endTime,
    bookingObj.agenda,
    bookingObj.divisi,
    bookingObj.status || 'Booked'
  ]);
  return { success: true, id: id };
}

function saveAnnouncementToSheet(annObj, actingEmail) {
  const ss = getPortalSpreadsheet_();
  const user = getCurrentUserContext_(ss, actingEmail || (annObj && annObj.creatorEmail));
  if (!['WEBMASTER', 'WEB_ADMIN', 'KEPALA_MP', 'HRD', 'KEPALA_DM'].includes(user.role)) {
    return { success: false, message: 'Akses ditolak untuk membuat pengumuman.' };
  }

  const sheet = ss.getSheetByName(SHEET_NAMES.ANNOUNCEMENTS);
  const id = String(annObj.id || Date.now());
  sheet.appendRow([
    id,
    annObj.title,
    annObj.category,
    annObj.author || user.name,
    user.email,
    user.role,
    annObj.time || formatDisplayDateID_(getTodayISO_()),
    annObj.content
  ]);
  return { success: true, id: id };
}

function saveJobVacancyToSheet(jobObj, actingEmail) {
  const ss = getPortalSpreadsheet_();
  const user = getCurrentUserContext_(ss, actingEmail || (jobObj && jobObj.creatorEmail));
  if (!['WEBMASTER', 'WEB_ADMIN', 'HRD'].includes(user.role)) {
    return { success: false, message: 'Akses ditolak: Khusus HRD / Web Admin / Webmaster.' };
  }

  const sheet = ss.getSheetByName(SHEET_NAMES.JOBS);
  const id = String(jobObj.id || Date.now());
  sheet.appendRow([
    id,
    jobObj.title,
    jobObj.dept,
    jobObj.type,
    jobObj.location || 'Kantor Pusat',
    user.email,
    jobObj.waHrd || user.wa || '6281234567811',
    'Aktif',
    jobObj.desc
  ]);
  return { success: true, id: id };
}

function saveProductKnowledgeToSheet(prodObj, actingEmail) {
  const ss = getPortalSpreadsheet_();
  const user = getCurrentUserContext_(ss, actingEmail || (prodObj && prodObj.creatorEmail));
  if (!['WEBMASTER', 'WEB_ADMIN', 'KEPALA_MP', 'KEPALA_DM', 'KEPALA_BRANDING'].includes(user.role)) {
    return { success: false, message: 'Akses ditolak untuk menambah Product Knowledge.' };
  }

  const sheet = ss.getSheetByName(SHEET_NAMES.PRODUCTS);
  const id = String(prodObj.id || Date.now());
  const specsStr = Array.isArray(prodObj.specs) ? prodObj.specs.join(', ') : String(prodObj.specs || '');
  sheet.appendRow([
    id,
    prodObj.sku,
    prodObj.name,
    prodObj.category,
    user.email,
    prodObj.usp,
    specsStr,
    prodObj.faq || ''
  ]);
  return { success: true, id: id };
}

/**
 * 6. HAPUS & EDIT BARIS DATA MILIK SENDIRI (ATAU OLEH WEBMASTER)
 */
function deleteRecordFromSheet(sheetName, recordId, actingEmail) {
  const ss = getPortalSpreadsheet_();
  const user = getCurrentUserContext_(ss, actingEmail);
  const isWebmaster = user.role === 'WEBMASTER';

  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { success: false, message: 'Sheet tidak ditemukan: ' + sheetName };

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const emailColIdx = headers.indexOf('Pembuat_Email');

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(recordId).trim()) {
      const ownerEmail = emailColIdx !== -1 ? String(data[i][emailColIdx]).trim().toLowerCase() : '';
      if (!isWebmaster && ownerEmail !== user.email.toLowerCase()) {
        return { success: false, message: 'Akses ditolak: Anda hanya dapat menghapus item yang Anda buat sendiri.' };
      }
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: false, message: 'Data tidak ditemukan.' };
}

function updateOwnedRecordInSheet(sheetName, recordId, updatesObj, actingEmail) {
  const ss = getPortalSpreadsheet_();
  const user = getCurrentUserContext_(ss, actingEmail);
  const isWebmaster = user.role === 'WEBMASTER';

  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return { success: false, message: 'Sheet tidak ditemukan: ' + sheetName };

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  const emailColIdx = headers.indexOf('Pembuat_Email');

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim() === String(recordId).trim()) {
      const ownerEmail = emailColIdx !== -1 ? String(data[i][emailColIdx]).trim().toLowerCase() : '';
      if (!isWebmaster && ownerEmail !== user.email.toLowerCase()) {
        return { success: false, message: 'Akses ditolak: Anda hanya dapat mengedit item yang diinput oleh Anda sendiri.' };
      }

      Object.keys(updatesObj).forEach(colName => {
        const colIdx = headers.indexOf(colName);
        if (colIdx !== -1) {
          sheet.getRange(i + 1, colIdx + 1).setValue(updatesObj[colName]);
        }
      });
      return { success: true };
    }
  }
  return { success: false, message: 'Data tidak ditemukan.' };
}

/**
 * 7. MANAJEMEN USER KHUSUS WEBMASTER
 */
function addUserByWebmaster(userObj, actingEmail) {
  const ss = getPortalSpreadsheet_();
  const user = getCurrentUserContext_(ss, actingEmail);
  if (user.role !== 'WEBMASTER') return { success: false, message: 'Khusus Webmaster.' };

  const sheet = ss.getSheetByName(SHEET_NAMES.USERS);
  const existing = getSheetDataAsObjects(sheet);
  const emailLower = String(userObj.email || '').trim().toLowerCase();
  if (existing.some(u => String(u.Email || '').trim().toLowerCase() === emailLower)) {
    return { success: false, message: 'Email sudah terdaftar.' };
  }

  sheet.appendRow([emailLower, userObj.name, userObj.role, userObj.wa || '']);
  return { success: true };
}

function updateUserRoleInSheet(email, newRole, actingEmail) {
  return updateUserProfileInSheet(email, { role: newRole }, actingEmail);
}

function updateUserProfileInSheet(email, updatesObj, actingEmail) {
  const ss = getPortalSpreadsheet_();
  const user = getCurrentUserContext_(ss, actingEmail);
  if (user.role !== 'WEBMASTER') return { success: false, message: 'Khusus Webmaster.' };

  const sheet = ss.getSheetByName(SHEET_NAMES.USERS);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toLowerCase() === String(email).trim().toLowerCase()) {
      if (updatesObj && updatesObj.name !== undefined) {
        sheet.getRange(i + 1, 2).setValue(String(updatesObj.name).trim());
      }
      if (updatesObj && updatesObj.role !== undefined) {
        sheet.getRange(i + 1, 3).setValue(String(updatesObj.role).trim().toUpperCase());
      }
      if (updatesObj && updatesObj.wa !== undefined) {
        sheet.getRange(i + 1, 4).setValue(String(updatesObj.wa).trim());
      }
      return { success: true };
    }
  }
  return { success: false, message: 'User tidak ditemukan.' };
}

function deleteUserInSheet(email, actingEmail) {
  const ss = getPortalSpreadsheet_();
  const user = getCurrentUserContext_(ss, actingEmail);
  if (user.role !== 'WEBMASTER') return { success: false, message: 'Khusus Webmaster.' };
  if (String(email).trim().toLowerCase() === user.email.toLowerCase()) {
    return { success: false, message: 'Tidak dapat menghapus akun Webmaster yang sedang aktif.' };
  }

  const sheet = ss.getSheetByName(SHEET_NAMES.USERS);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim().toLowerCase() === String(email).trim().toLowerCase()) {
      sheet.deleteRow(i + 1);
      return { success: true };
    }
  }
  return { success: false, message: 'User tidak ditemukan.' };
}

/**
 * 8. AMBIL HISTORI GABUNGAN SEMUA MODUL KHUSUS WEBMASTER (UNTUK LAPORAN CETAK)
 */
function getAllModulesHistoryForWebmaster(actingEmail) {
  const ss = getPortalSpreadsheet_();
  const user = getCurrentUserContext_(ss, actingEmail);
  if (user.role !== 'WEBMASTER') {
    return { success: false, message: 'Akses ditolak: Khusus Webmaster.' };
  }

  return {
    success: true,
    generatedAt: new Date().toISOString(),
    data: {
      designOrders: getSheetDataAsObjects(ss.getSheetByName(SHEET_NAMES.DESIGN_ORDERS)),
      studioBookings: getSheetDataAsObjects(ss.getSheetByName(SHEET_NAMES.STUDIO)),
      meetingBookings: getSheetDataAsObjects(ss.getSheetByName(SHEET_NAMES.MEETING)),
      announcements: getSheetDataAsObjects(ss.getSheetByName(SHEET_NAMES.ANNOUNCEMENTS)),
      jobVacancies: getSheetDataAsObjects(ss.getSheetByName(SHEET_NAMES.JOBS)),
      products: getSheetDataAsObjects(ss.getSheetByName(SHEET_NAMES.PRODUCTS))
    }
  };
}

/**
 * ============================================================================
 * 9. MIGRASI DATA JOB TRACKER LAMA (GOOGLE SHEETS) KE TAB Order_Desain V.2.0
 * ============================================================================
 */

function importLegacyJobTracker_2026Januari() {
  return importLegacyJobTracker(['(2026) JANUARI']);
}

function importLegacyJobTracker_All2026() {
  const legacySs = SpreadsheetApp.openById(LEGACY_JOB_TRACKER_SPREADSHEET_ID);
  const tabs2026 = legacySs.getSheets()
    .map(s => s.getName())
    .filter(name => /2026/.test(name));
  return importLegacyJobTracker(tabs2026);
}

/**
 * Shortcut 1-klik: Impor seluruh email Owner, Editor & Viewer dari Job Tracker lama
 * ke tab Users_Role (anti-duplikat, otomatis tebak role awal DESIGNER / ADMIN_MP / GUEST).
 * Jalankan fungsi ini 1x dari editor Apps Script (akan meminta izin baca Google Drive).
 */
function importLegacyCollaboratorsToUsersRole() {
  const destSs = getPortalSpreadsheet_();
  let userSheet = destSs.getSheetByName(SHEET_NAMES.USERS);
  if (!userSheet) {
    setupDatabaseSheets();
    userSheet = destSs.getSheetByName(SHEET_NAMES.USERS);
  }

  const existing = getSheetDataAsObjects(userSheet);
  const existingEmails = new Set(existing.map(u => String(u.Email || '').trim().toLowerCase()).filter(Boolean));

  const legacyFile = DriveApp.getFileById(LEGACY_JOB_TRACKER_SPREADSHEET_ID);
  const candidates = [];

  try {
    const owner = legacyFile.getOwner();
    if (owner && owner.getEmail()) {
      candidates.push({ email: owner.getEmail(), name: owner.getName() || owner.getEmail().split('@')[0], access: 'OWNER' });
    }
  } catch (e) {}

  try {
    legacyFile.getEditors().forEach(u => {
      if (u && u.getEmail()) {
        candidates.push({ email: u.getEmail(), name: u.getName() || u.getEmail().split('@')[0], access: 'EDITOR' });
      }
    });
  } catch (e) {}

  try {
    legacyFile.getViewers().forEach(u => {
      if (u && u.getEmail()) {
        candidates.push({ email: u.getEmail(), name: u.getName() || u.getEmail().split('@')[0], access: 'VIEWER' });
      }
    });
  } catch (e) {}

  const rowsToAppend = [];
  const summary = { inserted: 0, skippedDuplicate: 0, emailsAdded: [] };

  candidates.forEach(c => {
    const emailLower = String(c.email).trim().toLowerCase();
    if (!emailLower || existingEmails.has(emailLower)) {
      summary.skippedDuplicate++;
      return;
    }

    let defaultRole = 'GUEST';
    if (c.access === 'OWNER') {
      defaultRole = 'WEB_ADMIN';
    } else if (c.access === 'EDITOR') {
      const text = (emailLower + ' ' + c.name.toLowerCase());
      defaultRole = /fauzi|putra|juan|riko|desain|design|grafis|kreatif/.test(text) ? 'DESIGNER' : 'ADMIN_MP';
    }

    rowsToAppend.push([emailLower, c.name || emailLower.split('@')[0], defaultRole, '']);
    existingEmails.add(emailLower);
    summary.emailsAdded.push({ email: emailLower, role: defaultRole });
  });

  if (rowsToAppend.length > 0) {
    userSheet
      .getRange(userSheet.getLastRow() + 1, 1, rowsToAppend.length, 4)
      .setValues(rowsToAppend);
    summary.inserted = rowsToAppend.length;
  }

  Logger.log('Hasil Impor Collaborators ke Users_Role: ' + JSON.stringify(summary));
  return summary;
}

/**
 * Engine utama migrasi data Job Tracker lama -> Order_Desain V.2.0
 * Aman dijalankan berulang (anti-duplikat berdasarkan ID baris asal).
 */
function importLegacyJobTracker(targetSheetNames) {
  const destSs = getPortalSpreadsheet_();
  let destSheet = destSs.getSheetByName(SHEET_NAMES.DESIGN_ORDERS);
  if (!destSheet) {
    setupDatabaseSheets();
    destSheet = destSs.getSheetByName(SHEET_NAMES.DESIGN_ORDERS);
  }

  const existingIds = new Set();
  const lastDestRow = destSheet.getLastRow();
  if (lastDestRow > 1) {
    const idValues = destSheet.getRange(2, 1, lastDestRow - 1, 1).getValues();
    idValues.forEach(r => {
      if (r[0]) existingIds.add(String(r[0]).trim());
    });
  }

  const legacySs = SpreadsheetApp.openById(LEGACY_JOB_TRACKER_SPREADSHEET_ID);
  const sheetList = Array.isArray(targetSheetNames) && targetSheetNames.length > 0
    ? targetSheetNames
    : ['(2026) JANUARI'];

  const rowsToInsert = [];
  const summary = { tabsProcessed: [], inserted: 0, skippedDuplicate: 0, skippedEmpty: 0 };

  sheetList.forEach(tabName => {
    const srcSheet = legacySs.getSheetByName(tabName);
    if (!srcSheet) {
      Logger.log('Tab tidak ditemukan di spreadsheet lama: ' + tabName);
      return;
    }

    const displayValues = srcSheet.getDataRange().getDisplayValues();
    const rawValues = srcSheet.getDataRange().getValues();
    const headerRowIdx = findLegacyHeaderRowIndex_(displayValues);
    if (headerRowIdx === -1) {
      Logger.log('Header tidak dikenali pada tab: ' + tabName);
      return;
    }

    const headers = displayValues[headerRowIdx].map(h => String(h).trim().toUpperCase());
    const colIdx = {
      acc: headers.indexOf('✓'),
      tanggal: headers.indexOf('TANGGAL'),
      marketplace: headers.indexOf('MARKETPLACE'),
      order: headers.indexOf('ORDER'),
      jc: headers.indexOf('JC'),
      gw: headers.indexOf('GW'),
      gt: headers.indexOf('GT'),
      jsh: headers.indexOf('JSH'),
      sj: headers.indexOf('SJ'),
      spd: headers.indexOf('SPD'),
      maxi: headers.indexOf('MAXI') !== -1 ? headers.indexOf('MAXI') : headers.indexOf('MX'),
      tim: headers.indexOf('TIM'),
      status: headers.indexOf('STATUS'),
      noteMp: headers.indexOf('NOTE MP'),
      noteDesain: headers.indexOf('NOTE TIM DESAIN')
    };

    const tabMeta = parseTabYearMonth_(tabName);
    const idPrefix = 'IMP-' + tabMeta.year + tabMeta.month;
    let lastValidDate = {
      iso: tabMeta.year + '-' + tabMeta.month + '-01',
      display: formatDisplayDateID_(tabMeta.year + '-' + tabMeta.month + '-01')
    };

    for (let r = headerRowIdx + 1; r < displayValues.length; r++) {
      const disp = displayValues[r];
      const raw = rawValues[r];
      const orderText = colIdx.order !== -1 ? String(disp[colIdx.order] || '').trim() : '';
      const tglText = colIdx.tanggal !== -1 ? String(disp[colIdx.tanggal] || '').trim() : '';

      if (!orderText) {
        summary.skippedEmpty++;
        continue;
      }

      const sheetRowNumber = r + 1;
      const recordId = idPrefix + '-R' + String(sheetRowNumber).padStart(3, '0');
      if (existingIds.has(recordId)) {
        summary.skippedDuplicate++;
        continue;
      }

      const parsedDate = parseLegacyDate_(raw[colIdx.tanggal], tglText, tabMeta.year) || lastValidDate;
      lastValidDate = parsedDate;

      const marketplaceRaw = colIdx.marketplace !== -1 ? String(disp[colIdx.marketplace] || '').trim() : '';
      const isUrgent = /priority/i.test(marketplaceRaw);
      const stores = extractLegacyStores_(disp, colIdx, marketplaceRaw);

      const picRaw = colIdx.tim !== -1 ? String(disp[colIdx.tim] || '').trim() : '';
      const pic = (!picRaw || picRaw === '-') ? 'Belum Ditugaskan' : picRaw;

      const statusRaw = colIdx.status !== -1 ? String(disp[colIdx.status] || '').trim() : '';
      const status = normalizeLegacyStatus_(statusRaw);

      const accAdmin = colIdx.acc !== -1 && String(disp[colIdx.acc]).toUpperCase() === 'TRUE';

      const noteMp = colIdx.noteMp !== -1 ? String(disp[colIdx.noteMp] || '').trim() : '';
      const noteDesain = colIdx.noteDesain !== -1 ? String(disp[colIdx.noteDesain] || '').trim() : '';
      const urlMatch = (noteMp + ' ' + noteDesain).match(/https?:\/\/[^\s]+/i);
      const linkBahan = urlMatch ? urlMatch[0] : '';

      const notesParts = [];
      if (noteMp) notesParts.push(noteMp);
      if (noteDesain) notesParts.push('[Tim Desain] ' + noteDesain);
      const keterangan = notesParts.join('\n');

      const jenis = inferLegacyDesignType_(orderText, noteMp);

      rowsToInsert.push([
        recordId,
        parsedDate.iso,
        parsedDate.display,
        marketplaceRaw || 'Admin Marketplace (Impor)',
        '',
        '',
        orderText,
        jenis,
        stores.join(', '),
        '',
        linkBahan,
        '',
        keterangan,
        pic,
        status,
        accAdmin,
        isUrgent,
        0,
        '[]'
      ]);
      existingIds.add(recordId);
    }

    summary.tabsProcessed.push(tabName);
  });

  if (rowsToInsert.length > 0) {
    destSheet
      .getRange(destSheet.getLastRow() + 1, 1, rowsToInsert.length, rowsToInsert[0].length)
      .setValues(rowsToInsert);
    summary.inserted = rowsToInsert.length;
  }

  Logger.log('Hasil Migrasi Job Tracker Lama: ' + JSON.stringify(summary));
  return summary;
}

function findLegacyHeaderRowIndex_(displayValues) {
  for (let i = 0; i < Math.min(10, displayValues.length); i++) {
    const rowUpper = displayValues[i].map(c => String(c).trim().toUpperCase());
    if (rowUpper.indexOf('TANGGAL') !== -1 && rowUpper.indexOf('ORDER') !== -1) {
      return i;
    }
  }
  return -1;
}

function parseTabYearMonth_(tabName) {
  const yearMatch = String(tabName).match(/(20\d{2})/);
  const year = yearMatch ? yearMatch[1] : String(new Date().getFullYear());
  const monthMap = {
    JAN: '01', FEB: '02', MAR: '03', APR: '04', MEI: '05', MAY: '05',
    JUN: '06', JUL: '07', AGU: '08', AGS: '08', AUG: '08', SEP: '09',
    OKT: '10', OCT: '10', NOV: '11', DES: '12', DEC: '12'
  };
  const upper = String(tabName).toUpperCase();
  let month = '01';
  Object.keys(monthMap).forEach(k => {
    if (upper.indexOf(k) !== -1) month = monthMap[k];
  });
  return { year: year, month: month };
}

function parseLegacyDate_(rawVal, displayText, fallbackYear) {
  if (rawVal instanceof Date && !isNaN(rawVal.getTime())) {
    const iso = Utilities.formatDate(rawVal, Session.getScriptTimeZone() || 'Asia/Jakarta', 'yyyy-MM-dd');
    return { iso: iso, display: formatDisplayDateID_(iso) };
  }
  const text = String(displayText || '').trim();
  if (!text) return null;

  const slashMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slashMatch) {
    const dd = slashMatch[1].padStart(2, '0');
    const mm = slashMatch[2].padStart(2, '0');
    const yyyy = slashMatch[3].length === 2 ? '20' + slashMatch[3] : slashMatch[3];
    const iso = yyyy + '-' + mm + '-' + dd;
    return { iso: iso, display: formatDisplayDateID_(iso) };
  }

  const monthMap = {
    jan: '01', januari: '01', january: '01',
    feb: '02', februari: '02', february: '02',
    mar: '03', maret: '03', march: '03',
    apr: '04', april: '04',
    mei: '05', may: '05',
    jun: '06', juni: '06', june: '06',
    jul: '07', juli: '07', july: '07',
    agu: '08', ags: '08', agustus: '08', aug: '08', august: '08',
    sep: '09', sept: '09', september: '09',
    okt: '10', oktober: '10', oct: '10', october: '10',
    nov: '11', november: '11',
    des: '12', desember: '12', dec: '12', december: '12'
  };
  const m = text.toLowerCase().match(/(\d{1,2})\s+([a-z]+)[\s']*(\d{2,4})?/);
  if (m && monthMap[m[2]]) {
    const dd = m[1].padStart(2, '0');
    const mm = monthMap[m[2]];
    let yyyy = fallbackYear || '2026';
    if (m[3]) yyyy = m[3].length === 2 ? '20' + m[3] : m[3];
    const iso = yyyy + '-' + mm + '-' + dd;
    return { iso: iso, display: formatDisplayDateID_(iso) };
  }
  return null;
}

function formatDisplayDateID_(isoStr) {
  const parts = String(isoStr || '').split('-');
  if (parts.length !== 3) return isoStr || '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const mIdx = Math.max(0, Math.min(11, Number(parts[1]) - 1));
  return parts[2] + ' ' + months[mIdx] + ' ' + parts[0];
}

function formatShortTime_(val) {
  if (!val) return '';
  if (val instanceof Date && !isNaN(val.getTime())) {
    return Utilities.formatDate(val, Session.getScriptTimeZone() || 'Asia/Jakarta', 'HH:mm');
  }
  const str = String(val).trim();
  const m = str.match(/(\d{1,2}):(\d{2})/);
  return m ? (m[1].padStart(2, '0') + ':' + m[2]) : str;
}

function formatShortDeadlineID_(val) {
  if (!val) return '-';
  const tz = Session.getScriptTimeZone() || 'Asia/Jakarta';
  const daysID = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  const monthsID = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  if (val instanceof Date && !isNaN(val.getTime())) {
    const ymd = Utilities.formatDate(val, tz, 'yyyy-MM-dd').split('-');
    const hhmm = Utilities.formatDate(val, tz, 'HH:mm');
    const localDate = new Date(Number(ymd[0]), Number(ymd[1]) - 1, Number(ymd[2]));
    const shortDate = daysID[localDate.getDay()] + ', ' + ymd[2] + ' ' + monthsID[Number(ymd[1]) - 1] + ' ' + ymd[0].slice(-2);
    return hhmm !== '00:00' ? (shortDate + ' ' + hhmm) : shortDate;
  }

  const str = String(val).trim();
  if (!str || str === '-') return '-';

  const timeMatch = str.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\b/);
  const hhmm = timeMatch ? (timeMatch[1].padStart(2, '0') + ':' + timeMatch[2]) : '';
  const cleaned = str.replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b.*$/i, '').trim();

  // Jika string sudah berupa Date.toString() (mis. "Sat Nov 21 2026 15:30:00 GMT+0700...")
  if (/GMT[+-]\d{4}/i.test(str)) {
    const parsedJs = new Date(str);
    if (!isNaN(parsedJs.getTime())) {
      return formatShortDeadlineID_(parsedJs);
    }
  }

  // ISO YYYY-MM-DD
  const isoMatch = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const d = new Date(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]));
    const shortDate = daysID[d.getDay()] + ', ' + isoMatch[3] + ' ' + monthsID[Number(isoMatch[2]) - 1] + ' ' + isoMatch[1].slice(-2);
    return (hhmm && hhmm !== '00:00') ? (shortDate + ' ' + hhmm) : shortDate;
  }

  // Format teks Indonesia (mis. "21 Nov 2026", "Sab, 21 Nov 26")
  const parsed = parseLegacyDate_(null, cleaned, String(new Date().getFullYear()));
  if (parsed && parsed.iso) {
    const p = parsed.iso.split('-');
    const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    const shortDate = daysID[d.getDay()] + ', ' + p[2] + ' ' + monthsID[Number(p[1]) - 1] + ' ' + p[0].slice(-2);
    return (hhmm && hhmm !== '00:00') ? (shortDate + ' ' + hhmm) : shortDate;
  }

  return str.replace(/\s*GMT[+-]\d{4}.*$/i, '').trim();
}

function getTodayISO_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Asia/Jakarta', 'yyyy-MM-dd');
}

function normalizeCellDateISO_(val) {
  if (!val) return '';
  if (val instanceof Date && !isNaN(val.getTime())) {
    return Utilities.formatDate(val, Session.getScriptTimeZone() || 'Asia/Jakarta', 'yyyy-MM-dd');
  }
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const parsed = parseLegacyDate_(null, str, String(new Date().getFullYear()));
  return parsed ? parsed.iso : str;
}

function extractLegacyStores_(dispRow, colIdx, marketplaceRaw) {
  const stores = [];
  const checkMap = [
    { idx: colIdx.gw, name: 'Godwin' },
    { idx: colIdx.sj, name: 'Sidji' },
    { idx: colIdx.gt, name: 'Gudang Trail' },
    { idx: colIdx.jsh, name: 'JSH' },
    { idx: colIdx.jc, name: 'JC' },
    { idx: colIdx.spd, name: 'JSH Speedshop' },
    { idx: colIdx.maxi, name: 'Maxiclub' }
  ];
  checkMap.forEach(item => {
    if (item.idx !== -1 && String(dispRow[item.idx]).toUpperCase() === 'TRUE') {
      stores.push(item.name);
    }
  });

  if (stores.length > 0) return stores;

  const mp = String(marketplaceRaw || '').trim().toLowerCase();
  if (!mp || mp === 'priority!') return ['Umum'];
  if (mp.indexOf('godwin') !== -1) return ['Godwin'];
  if (mp.indexOf('sidji') !== -1) return ['Sidji'];
  if (mp.indexOf('gudang') !== -1 || mp.indexOf('trail') !== -1) return ['Gudang Trail'];
  if (mp.indexOf('speedshop') !== -1 || mp === 'spd') return ['JSH Speedshop'];
  if (mp.indexOf('jsh') !== -1) return ['JSH'];
  if (mp.indexOf('maxi') !== -1) return ['Maxiclub'];
  if (mp === 'jc') return ['JC'];
  return [marketplaceRaw];
}

function normalizeLegacyStatus_(statusRaw) {
  const s = String(statusRaw || '').trim().toLowerCase();
  if (!s || s === 'status' || s === '-') return 'Antrean';
  if (s.indexOf('selesai') !== -1 || s === 'ok' || s === 'done') return 'Selesai';
  if (s.indexOf('revisi') !== -1) return 'Revisi';
  if (s.indexOf('cancel') !== -1 || s.indexOf('batal') !== -1) return 'Cancel';
  if (s.indexOf('dikerjakan') !== -1 || s.indexOf('proses') !== -1 || s.indexOf('pending') !== -1) return 'Pending';
  return 'Antrean';
}

function inferLegacyDesignType_(orderText, noteMp) {
  const combined = (orderText + ' ' + noteMp).toLowerCase();
  if (/poster|banner|promo|diskon|11\.11|12\.12|flash sale/.test(combined)) {
    return 'Poster Promo / Banner Utama';
  }
  if (/stiker|plakat|rundown|cetak|art paper/.test(combined)) {
    return 'Cetak / Kebutuhan Internal & Live';
  }
  if (/story|feed|tiktok|instagram|reels/.test(combined)) {
    return 'Feed / Story Instagram & TikTok';
  }
  return 'Foto Produk + Frame Marketplace';
}

/**
 * HELPER: Konversi baris sheet menjadi array objek
 */
function getSheetDataAsObjects(sheet) {
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];
  return data.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx];
    });
    return obj;
  });
}
