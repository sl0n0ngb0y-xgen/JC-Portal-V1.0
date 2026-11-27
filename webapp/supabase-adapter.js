/**
 * ============================================================================
 * JC PORTAL V.2.0 — SUPABASE REAL-TIME ADAPTER (Web App Engine)
 * Menggantikan google.script.run dengan Supabase Auth + PostgreSQL + Realtime (<1 dtk)
 * ============================================================================
 */
(function () {
  const cfg = window.JC_PORTAL_CONFIG || {};
  if (!window.supabase || !cfg.SUPABASE_URL || !cfg.SUPABASE_PUBLISHABLE_KEY) {
    console.error('JC PORTAL: Supabase SDK atau supabase-config.js belum dimuat.');
    return;
  }

  const sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false
    }
  });

  window.JC_SUPABASE = sb;
  let realtimeChannel = null;
  let realtimeRenderTimer = null;

  // --- FORMATTER WAKTU ASIA/JAKARTA (WIB / UTC+7) ---
  function toJakartaIsoLocal(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return String(ts);
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Jakarta',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).formatToParts(d);
    const get = t => (parts.find(p => p.type === t) || {}).value || '00';
    const hh = get('hour') === '24' ? '00' : get('hour');
    return `${get('year')}-${get('month')}-${get('day')}T${hh}:${get('minute')}:${get('second')}`;
  }

  function toJakartaDateISO(val) {
    if (!val) {
      return toJakartaIsoLocal(new Date()).slice(0, 10);
    }
    const s = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    return toJakartaIsoLocal(s).slice(0, 10);
  }

  function formatDisplayDateID(iso) {
    if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || '';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const [y, m, d] = iso.split('-');
    return `${d} ${months[Number(m) - 1] || m} ${y}`;
  }

  // --- MAPPERS: POSTGRESQL -> FRONTEND STATE ---
  function mapUserFromDb(r) {
    const roleUpper = String(r.role || 'GUEST').trim().toUpperCase();
    return {
      email: String(r.email || '').trim().toLowerCase(),
      name: String(r.name || '').trim(),
      role: roleUpper,
      wa: String(r.wa || '').trim(),
      isDefaultPassword: roleUpper !== 'GUEST' && Boolean(r.is_default_password)
    };
  }

  function mapOrderFromDb(r) {
    const iso = toJakartaDateISO(r.date_iso);
    return {
      id: String(r.id || '').trim(),
      dateISO: iso,
      date: String(r.date_display || formatDisplayDateID(iso)).trim(),
      creatorName: String(r.creator_name || '').trim(),
      creatorEmail: String(r.creator_email || '').trim().toLowerCase(),
      creatorWa: String(r.creator_wa || '').trim(),
      produk: String(r.product || '').trim(),
      jenis: String(r.design_type || 'Foto Produk + Frame Marketplace').trim(),
      stores: Array.isArray(r.stores) ? r.stores : [],
      deadline: String(r.deadline || '-').trim(),
      link: String(r.link_bahan || '').trim(),
      resultLink: String(r.link_hasil || '').trim(),
      keterangan: String(r.notes || '').trim(),
      pic: String(r.pic || 'Belum Ditugaskan').trim(),
      status: String(r.status || 'Antrean').trim(),
      accAdmin: Boolean(r.acc),
      isUrgent: Boolean(r.is_urgent),
      revisionCount: Number(r.revision_count) || 0,
      revisionLogs: Array.isArray(r.revisions) ? r.revisions : [],
      startedAt: toJakartaIsoLocal(r.started_at),
      completedAt: toJakartaIsoLocal(r.completed_at)
    };
  }

  function mapStudioFromDb(r) {
    return {
      id: String(r.id || '').trim(),
      user: String(r.user_name || '').trim(),
      creatorEmail: String(r.creator_email || '').trim().toLowerCase(),
      date: toJakartaDateISO(r.date_iso),
      startTime: String(r.start_time || '').slice(0, 5),
      endTime: String(r.end_time || '').slice(0, 5),
      keperluan: String(r.purpose || '').trim(),
      divisi: String(r.division || '').trim(),
      peralatan: String(r.equipment || '').trim(),
      status: String(r.status || 'Terbooking').trim()
    };
  }

  function mapMeetingFromDb(r) {
    return {
      id: String(r.id || '').trim(),
      user: String(r.user_name || '').trim(),
      creatorEmail: String(r.creator_email || '').trim().toLowerCase(),
      room: String(r.room || '').trim(),
      date: toJakartaDateISO(r.date_iso),
      startTime: String(r.start_time || '').slice(0, 5),
      endTime: String(r.end_time || '').slice(0, 5),
      agenda: String(r.agenda || '').trim(),
      divisi: String(r.division || '').trim(),
      status: String(r.status || 'Terjadwal').trim()
    };
  }

  function mapAnnouncementFromDb(r) {
    return {
      id: String(r.id || '').trim(),
      dateISO: toJakartaDateISO(r.date_iso),
      title: String(r.title || '').trim(),
      category: String(r.category || 'Kebijakan / HRD').trim(),
      author: String(r.author || '').trim(),
      creatorEmail: String(r.creator_email || '').trim().toLowerCase(),
      creatorRole: String(r.creator_role || '').trim().toUpperCase(),
      time: String(r.time_label || formatDisplayDateID(toJakartaDateISO(r.date_iso))).trim(),
      content: String(r.content || '').trim()
    };
  }

  function mapJobFromDb(r) {
    return {
      id: String(r.id || '').trim(),
      dateISO: toJakartaDateISO(r.date_iso),
      title: String(r.title || '').trim(),
      dept: String(r.division || '').trim(),
      type: String(r.job_type || 'Full-Time (WFO)').trim(),
      location: String(r.location || '').trim(),
      author: String(r.creator_email || 'HRD & GA').trim(),
      creatorEmail: String(r.creator_email || '').trim().toLowerCase(),
      waHrd: String(r.wa_hrd || '').trim(),
      status: String(r.status || 'Dibuka').trim(),
      desc: String(r.description || '').trim()
    };
  }

  function mapProductFromDb(r) {
    return {
      id: String(r.id || '').trim(),
      dateISO: toJakartaDateISO(r.date_iso),
      sku: String(r.sku || '').trim(),
      name: String(r.name || '').trim(),
      category: String(r.brand || '').trim(),
      creatorEmail: String(r.creator_email || '').trim().toLowerCase(),
      usp: String(r.usp || '').trim(),
      specs: String(r.specs || '').split(/\r?\n|,/).map(s => s.trim()).filter(Boolean),
      faq: String(r.faq || '').trim()
    };
  }

  function mapLoanFromDb(r) {
    return {
      id: String(r.id || '').trim(),
      dateISO: toJakartaDateISO(r.date_iso),
      borrowTime: toJakartaIsoLocal(r.borrow_time),
      productName: String(r.product_name || '').trim(),
      borrower: String(r.borrower || '').trim(),
      creatorEmail: String(r.creator_email || '').trim().toLowerCase(),
      purpose: String(r.purpose || '').trim(),
      division: String(r.division || '').trim(),
      leaderAcc: String(r.leader_acc || 'Menunggu').trim(),
      leaderAccBy: String(r.leader_acc_by || '').trim(),
      status: String(r.status || 'Booking').trim(),
      warehouseAcc: Boolean(r.warehouse_acc),
      warehouseAccBy: String(r.warehouse_acc_by || '').trim(),
      returnedAt: toJakartaIsoLocal(r.returned_at)
    };
  }

  // Paginated fetch for >1,000 design_orders rows
  async function fetchAllDesignOrders() {
    const all = [];
    const pageSize = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await sb
        .from('design_orders')
        .select('*')
        .order('date_iso', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) {
        if (error.code === '42501') return [];
        throw error;
      }
      if (!data || data.length === 0) break;
      all.push(...data.map(mapOrderFromDb));
      if (data.length < pageSize) break;
      from += pageSize;
    }
    return all;
  }

  async function safeSelect(table, orderCol, mapper) {
    let q = sb.from(table).select('*');
    if (orderCol) q = q.order(orderCol, { ascending: false });
    const { data, error } = await q;
    if (error) {
      if (error.code === '42501') return [];
      console.warn(`[Supabase] select ${table}:`, error.message);
      return [];
    }
    return (data || []).map(mapper);
  }

  // --- REAL-TIME WEBSOCKET SUBSCRIPTION (< 1 DETIK) ---
  function scheduleRealtimeRender() {
    if (realtimeRenderTimer) clearTimeout(realtimeRenderTimer);
    realtimeRenderTimer = setTimeout(() => {
      if (typeof window.jcOnRealtimeRefresh === 'function') {
        window.jcOnRealtimeRefresh();
      }
    }, 60);
  }

  function startRealtimeSubscriptions() {
    stopRealtimeSubscriptions();
    const tableConfig = {
      users_role: { mapper: mapUserFromDb, key: 'email', target: 'registeredUsers' },
      design_orders: { mapper: mapOrderFromDb, key: 'id', target: 'designOrders' },
      studio_bookings: { mapper: mapStudioFromDb, key: 'id', target: 'studioBookings' },
      meeting_bookings: { mapper: mapMeetingFromDb, key: 'id', target: 'meetingBookings' },
      announcements: { mapper: mapAnnouncementFromDb, key: 'id', target: 'announcements' },
      job_vacancies: { mapper: mapJobFromDb, key: 'id', target: 'jobVacancies' },
      product_knowledge: { mapper: mapProductFromDb, key: 'id', target: 'products' },
      product_loans: { mapper: mapLoanFromDb, key: 'id', target: 'productLoans' }
    };

    const ch = sb.channel('jc-portal-realtime-v2');
    Object.keys(tableConfig).forEach(tbl => {
      ch.on('postgres_changes', { event: '*', schema: 'public', table: tbl }, payload => {
        const info = tableConfig[tbl];
        const eventType = payload.eventType;
        const mappedNew = payload.new && Object.keys(payload.new).length ? info.mapper(payload.new) : null;
        const oldKeyVal = payload.old ? String(payload.old[info.key] || '').trim() : '';

        if (typeof window.jcApplyRealtimeChange === 'function') {
          window.jcApplyRealtimeChange(info.target, eventType, info.key, mappedNew, oldKeyVal);
        }
        scheduleRealtimeRender();
      });
    });

    ch.subscribe(status => {
      if (typeof window.jcOnRealtimeStatus === 'function') {
        window.jcOnRealtimeStatus(status);
      }
    });
    realtimeChannel = ch;
  }

  function stopRealtimeSubscriptions() {
    if (realtimeChannel) {
      sb.removeChannel(realtimeChannel);
      realtimeChannel = null;
    }
  }

  // --- CALL CLOUDFLARE WORKER ADMIN API (KHUSUS WEBMASTER) ---
  async function callAdminUsersApi(action, payload) {
    const { data: sessionData } = await sb.auth.getSession();
    const token = sessionData?.session?.access_token;
    if (!token) return { success: false, message: 'Sesi Webmaster tidak ditemukan. Silakan login ulang.' };

    try {
      const res = await fetch(cfg.ADMIN_API_ENDPOINT || '/api/admin-users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ action, ...payload })
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { success: false, message: json.message || `Gagal menjalankan aksi admin (${res.status}).` };
      }
      return json;
    } catch (err) {
      return {
        success: false,
        message: 'Endpoint Admin Worker (/api/admin-users) belum aktif di environment ini. Deploy ke Cloudflare Pages untuk manajemen auth penuh.'
      };
    }
  }

  // --- SHEET NAME -> SUPABASE TABLE ---
  const SHEET_TO_TABLE = {
    Order_Desain: 'design_orders',
    Jadwal_Studio: 'studio_bookings',
    Jadwal_Meeting: 'meeting_bookings',
    Pengumuman: 'announcements',
    Lowongan_Kerja: 'job_vacancies',
    Product_Knowledge: 'product_knowledge',
    Peminjaman_Produk: 'product_loans'
  };

  function mapUpdateFields(sheetName, updatesObj) {
    const out = {};
    if (sheetName === 'Order_Desain') {
      if ('Status' in updatesObj) out.status = updatesObj.Status;
      if ('PIC' in updatesObj) out.pic = updatesObj.PIC;
      if ('ACC_Admin' in updatesObj) out.acc = Boolean(updatesObj.ACC_Admin);
      if ('Is_Urgent' in updatesObj) out.is_urgent = Boolean(updatesObj.Is_Urgent);
      if ('Link_Hasil' in updatesObj) out.link_hasil = updatesObj.Link_Hasil || '';
      if ('Jumlah_Revisi' in updatesObj) out.revision_count = Number(updatesObj.Jumlah_Revisi) || 0;
      if ('Log_Revisi_JSON' in updatesObj) {
        try {
          out.revisions = typeof updatesObj.Log_Revisi_JSON === 'string'
            ? JSON.parse(updatesObj.Log_Revisi_JSON)
            : updatesObj.Log_Revisi_JSON;
        } catch {
          out.revisions = [];
        }
      }
      if ('Waktu_Selesai' in updatesObj) {
        out.completed_at = updatesObj.Waktu_Selesai
          ? `${String(updatesObj.Waktu_Selesai).replace(' ', 'T')}+07:00`
          : null;
      }
      if ('Waktu_Mulai' in updatesObj && updatesObj.Waktu_Mulai) {
        out.started_at = `${String(updatesObj.Waktu_Mulai).replace(' ', 'T')}+07:00`;
      }
    } else if (sheetName === 'Jadwal_Studio') {
      if ('Status' in updatesObj) {
        out.status = updatesObj.Status === 'Booked' ? 'Terbooking' : updatesObj.Status;
      }
    } else if (sheetName === 'Jadwal_Meeting') {
      if ('Status' in updatesObj) {
        out.status = updatesObj.Status === 'Booked' ? 'Terjadwal' : updatesObj.Status;
      }
    } else if (sheetName === 'Pengumuman') {
      if ('Judul' in updatesObj) out.title = updatesObj.Judul;
      if ('Kategori' in updatesObj) out.category = updatesObj.Kategori;
      if ('Isi' in updatesObj) out.content = updatesObj.Isi;
    } else if (sheetName === 'Lowongan_Kerja') {
      if ('Posisi' in updatesObj) out.title = updatesObj.Posisi;
      if ('Divisi' in updatesObj) out.division = updatesObj.Divisi;
      if ('Deskripsi' in updatesObj) out.description = updatesObj.Deskripsi;
    } else if (sheetName === 'Product_Knowledge') {
      if ('Nama_Produk' in updatesObj) out.name = updatesObj.Nama_Produk;
      if ('Brand_Toko' in updatesObj) out.brand = updatesObj.Brand_Toko;
      if ('USP' in updatesObj) out.usp = updatesObj.USP;
      if ('Spesifikasi' in updatesObj) out.specs = updatesObj.Spesifikasi;
      if ('FAQ' in updatesObj) out.faq = updatesObj.FAQ;
    }
    return out;
  }

  async function getActiveUserProfile() {
    const { data: sess } = await sb.auth.getSession();
    const authUser = sess?.session?.user;
    if (!authUser || !authUser.email) return null;
    const emailLower = authUser.email.toLowerCase();
    const { data, error } = await sb
      .from('users_role')
      .select('*')
      .eq('email', emailLower)
      .maybeSingle();
    if (error || !data) return null;
    return mapUserFromDb(data);
  }

  // --- SEMUA 21 HANDLER RPC (KOMPATIBEL PENUH DENGAN UI JC PORTAL V.2.0) ---
  const handlers = {
    async getInitialPortalData() {
      const profile = await getActiveUserProfile();
      const isLoggedIn = Boolean(profile && profile.role !== 'GUEST');
      const isAdminGudang = profile?.role === 'ADMIN_GUDANG';

      const [
        announcements,
        jobVacancies,
        registeredUsers,
        productLoans,
        designOrders,
        studioBookings,
        meetingBookings,
        products
      ] = await Promise.all([
        safeSelect('announcements', 'created_at', mapAnnouncementFromDb),
        safeSelect('job_vacancies', 'created_at', mapJobFromDb),
        isLoggedIn ? safeSelect('users_role', 'name', mapUserFromDb) : Promise.resolve([]),
        isLoggedIn ? safeSelect('product_loans', 'borrow_time', mapLoanFromDb) : Promise.resolve([]),
        (isLoggedIn && !isAdminGudang) ? fetchAllDesignOrders() : Promise.resolve([]),
        (isLoggedIn && !isAdminGudang) ? safeSelect('studio_bookings', 'date_iso', mapStudioFromDb) : Promise.resolve([]),
        (isLoggedIn && !isAdminGudang) ? safeSelect('meeting_bookings', 'date_iso', mapMeetingFromDb) : Promise.resolve([]),
        (isLoggedIn && !isAdminGudang) ? safeSelect('product_knowledge', 'created_at', mapProductFromDb) : Promise.resolve([])
      ]);

      startRealtimeSubscriptions();

      return {
        success: true,
        user: profile,
        hasActiveSession: isLoggedIn,
        registeredUsers,
        designOrders,
        studioBookings,
        meetingBookings,
        announcements,
        jobVacancies,
        products,
        productLoans
      };
    },

    async authenticateUser(email, password) {
      const emailLower = String(email || '').trim().toLowerCase();
      if (!emailLower) return { success: false, message: 'Masukkan email akun yang terdaftar.' };
      if (!password) return { success: false, message: 'Password wajib diisi untuk akun non-Guest.' };

      const { data: authData, error: authErr } = await sb.auth.signInWithPassword({
        email: emailLower,
        password: String(password)
      });
      if (authErr || !authData?.user) {
        return { success: false, message: 'Email atau password salah. Periksa kembali (default awal: 12345678).' };
      }

      const { data: profileRow, error: profErr } = await sb
        .from('users_role')
        .select('*')
        .eq('email', emailLower)
        .maybeSingle();

      if (profErr || !profileRow) {
        await sb.auth.signOut();
        return { success: false, message: 'Akun tidak terdaftar di whitelist kantor. Hubungi Webmaster.' };
      }

      return { success: true, user: mapUserFromDb(profileRow) };
    },

    async changeUserPassword(email, currentPassword, newPassword) {
      const emailLower = String(email || '').trim().toLowerCase();
      if (!/^(?=.*[A-Za-z])(?=.*\d)[A-Za-z0-9]{8}$/.test(String(newPassword || ''))) {
        return { success: false, message: 'Password baru harus tepat 8 karakter kombinasi huruf dan angka.' };
      }
      if (String(newPassword) === '12345678') {
        return { success: false, message: 'Password baru tidak boleh sama dengan password default (12345678).' };
      }

      // Verifikasi password saat ini terlebih dahulu
      const { error: verifyErr } = await sb.auth.signInWithPassword({
        email: emailLower,
        password: String(currentPassword || '')
      });
      if (verifyErr) {
        return { success: false, message: 'Password saat ini salah.' };
      }

      const { error: updAuthErr } = await sb.auth.updateUser({ password: String(newPassword) });
      if (updAuthErr) {
        return { success: false, message: 'Gagal memperbarui password: ' + updAuthErr.message };
      }

      const { error: updFlagErr } = await sb
        .from('users_role')
        .update({ is_default_password: false })
        .eq('email', emailLower);
      if (updFlagErr) {
        console.warn('Update flag default password:', updFlagErr.message);
      }

      return { success: true, message: 'Password berhasil diperbarui!' };
    },

    async saveNewDesignOrderToSheet(orderObj) {
      const profile = await getActiveUserProfile();
      if (!profile) return { success: false, message: 'Sesi login berakhir.' };

      const id = String(orderObj.id || ('ORD-' + Date.now())).trim();
      const startedIso = orderObj.startedAt
        ? `${String(orderObj.startedAt).replace(' ', 'T')}+07:00`
        : new Date().toISOString();

      const row = {
        id,
        date_iso: toJakartaDateISO(orderObj.dateISO),
        date_display: orderObj.date || formatDisplayDateID(toJakartaDateISO(orderObj.dateISO)),
        creator_name: orderObj.creatorName || profile.name,
        creator_email: profile.email,
        creator_wa: orderObj.creatorWa || profile.wa || '',
        product: orderObj.produk || '',
        design_type: orderObj.jenis || 'Foto Produk + Frame Marketplace',
        stores: Array.isArray(orderObj.stores) ? orderObj.stores : [],
        deadline: orderObj.deadline || '-',
        link_bahan: orderObj.link || '',
        link_hasil: orderObj.resultLink || '',
        notes: orderObj.keterangan || '',
        pic: orderObj.pic || 'Belum Ditugaskan',
        status: orderObj.status || 'Antrean',
        acc: Boolean(orderObj.accAdmin),
        is_urgent: Boolean(orderObj.isUrgent),
        revision_count: Number(orderObj.revisionCount) || 0,
        revisions: Array.isArray(orderObj.revisionLogs) ? orderObj.revisionLogs : [],
        started_at: startedIso,
        completed_at: null
      };

      const { error } = await sb.from('design_orders').insert(row);
      if (error) return { success: false, message: error.message };
      return { success: true, id, startedAt: toJakartaIsoLocal(startedIso) };
    },

    async updateDesignOrderFields(orderId, updatesObj) {
      const mapped = mapUpdateFields('Order_Desain', updatesObj || {});
      if (Object.keys(mapped).length === 0) return { success: true };
      const { error } = await sb.from('design_orders').update(mapped).eq('id', String(orderId));
      if (error) return { success: false, message: error.message };
      return { success: true };
    },

    async saveStudioBookingToSheet(bookingObj) {
      const profile = await getActiveUserProfile();
      if (!profile) return { success: false, message: 'Sesi login berakhir.' };

      const id = String(bookingObj.id || Date.now());
      const dateIso = toJakartaDateISO(bookingObj.date);

      // Cek bentrok jadwal studio di tanggal yang sama
      const { data: existing } = await sb
        .from('studio_bookings')
        .select('id, start_time, end_time, status, user_name')
        .eq('date_iso', dateIso)
        .neq('status', 'Dibatalkan');

      const conflict = (existing || []).find(b =>
        bookingObj.startTime < b.end_time && bookingObj.endTime > b.start_time
      );
      if (conflict) {
        return {
          success: false,
          message: `Jadwal bentrok dengan booking ${conflict.user_name} (${conflict.start_time}-${conflict.end_time}).`
        };
      }

      const { error } = await sb.from('studio_bookings').insert({
        id,
        user_name: bookingObj.user || profile.name,
        creator_email: profile.email,
        date_iso: dateIso,
        start_time: bookingObj.startTime,
        end_time: bookingObj.endTime,
        purpose: bookingObj.keperluan || '',
        division: bookingObj.divisi || '',
        equipment: bookingObj.peralatan || '',
        status: 'Terbooking'
      });
      if (error) return { success: false, message: error.message };
      return { success: true, id };
    },

    async saveMeetingBookingToSheet(meetingObj) {
      const profile = await getActiveUserProfile();
      if (!profile) return { success: false, message: 'Sesi login berakhir.' };

      const id = String(meetingObj.id || Date.now());
      const dateIso = toJakartaDateISO(meetingObj.date);
      const room = meetingObj.room || 'Ruang Meeting Utama';

      const { data: existing } = await sb
        .from('meeting_bookings')
        .select('id, start_time, end_time, status, user_name')
        .eq('date_iso', dateIso)
        .eq('room', room)
        .neq('status', 'Dibatalkan');

      const conflict = (existing || []).find(m =>
        meetingObj.startTime < m.end_time && meetingObj.endTime > m.start_time
      );
      if (conflict) {
        return {
          success: false,
          message: `${room} bentrok dengan jadwal ${conflict.user_name} (${conflict.start_time}-${conflict.end_time}).`
        };
      }

      const { error } = await sb.from('meeting_bookings').insert({
        id,
        user_name: meetingObj.user || profile.name,
        creator_email: profile.email,
        room,
        date_iso: dateIso,
        start_time: meetingObj.startTime,
        end_time: meetingObj.endTime,
        agenda: meetingObj.agenda || '',
        division: meetingObj.divisi || '',
        status: 'Terjadwal'
      });
      if (error) return { success: false, message: error.message };
      return { success: true, id };
    },

    async saveAnnouncementToSheet(annObj) {
      const profile = await getActiveUserProfile();
      if (!profile) return { success: false, message: 'Sesi login berakhir.' };
      const id = String(annObj.id || Date.now());
      const { error } = await sb.from('announcements').insert({
        id,
        date_iso: toJakartaDateISO(annObj.dateISO),
        title: annObj.title || '',
        category: annObj.category || 'Kebijakan / HRD',
        author: annObj.author || profile.name,
        creator_email: profile.email,
        creator_role: profile.role,
        time_label: annObj.time || formatDisplayDateID(toJakartaDateISO()),
        content: annObj.content || ''
      });
      if (error) return { success: false, message: error.message };
      return { success: true, id };
    },

    async saveJobVacancyToSheet(jobObj) {
      const profile = await getActiveUserProfile();
      if (!profile) return { success: false, message: 'Sesi login berakhir.' };
      const id = String(jobObj.id || Date.now());
      const status = ['Dibuka', 'Ditutup', 'Draft'].includes(jobObj.status) ? jobObj.status : 'Dibuka';
      const { error } = await sb.from('job_vacancies').insert({
        id,
        date_iso: toJakartaDateISO(jobObj.dateISO),
        title: jobObj.title || '',
        division: jobObj.dept || '',
        job_type: jobObj.type || 'Full-Time (WFO)',
        location: jobObj.location || '',
        creator_email: profile.email,
        wa_hrd: jobObj.waHrd || profile.wa || '',
        status,
        description: jobObj.desc || ''
      });
      if (error) return { success: false, message: error.message };
      return { success: true, id };
    },

    async saveProductKnowledgeToSheet(prodObj) {
      const profile = await getActiveUserProfile();
      if (!profile) return { success: false, message: 'Sesi login berakhir.' };
      const id = String(prodObj.id || Date.now());
      const specsText = Array.isArray(prodObj.specs) ? prodObj.specs.join('\n') : String(prodObj.specs || '');
      const { error } = await sb.from('product_knowledge').insert({
        id,
        date_iso: toJakartaDateISO(prodObj.dateISO),
        sku: prodObj.sku || '',
        name: prodObj.name || '',
        brand: prodObj.category || '',
        creator_email: profile.email,
        usp: prodObj.usp || '',
        specs: specsText,
        faq: prodObj.faq || ''
      });
      if (error) return { success: false, message: error.message };
      return { success: true, id };
    },

    async saveProductLoanToSheet(loanObj) {
      const profile = await getActiveUserProfile();
      if (!profile) return { success: false, message: 'Sesi login berakhir.' };

      const id = String(loanObj.id || ('PJM-' + String(Date.now()).slice(-6)));
      const borrowIso = loanObj.borrowTime
        ? `${String(loanObj.borrowTime).replace(' ', 'T')}+07:00`
        : new Date().toISOString();

      const { error } = await sb.from('product_loans').insert({
        id,
        date_iso: toJakartaDateISO(loanObj.dateISO),
        borrow_time: borrowIso,
        product_name: loanObj.productName || '',
        borrower: loanObj.borrower || profile.name,
        creator_email: profile.email,
        purpose: loanObj.purpose || '',
        division: loanObj.division || '',
        leader_acc: 'Menunggu',
        leader_acc_by: '',
        status: 'Booking',
        warehouse_acc: false,
        warehouse_acc_by: '',
        returned_at: null
      });
      if (error) return { success: false, message: error.message };
      return { success: true, id, borrowTime: toJakartaIsoLocal(borrowIso) };
    },

    async updateProductLoanLeaderAcc(loanId, decision) {
      const profile = await getActiveUserProfile();
      if (!profile) return { success: false, message: 'Sesi login berakhir.' };
      const clean = ['Menunggu', 'Ya', 'Cancel'].includes(decision) ? decision : 'Menunggu';
      const accBy = clean === 'Menunggu' ? '' : profile.name;
      const { error } = await sb
        .from('product_loans')
        .update({ leader_acc: clean, leader_acc_by: accBy })
        .eq('id', String(loanId));
      if (error) return { success: false, message: error.message };
      return { success: true, leaderAcc: clean, leaderAccBy: accBy };
    },

    async updateProductLoanStatus(loanId, newStatus) {
      const { error } = await sb
        .from('product_loans')
        .update({ status: newStatus })
        .eq('id', String(loanId));
      if (error) return { success: false, message: error.message };
      return { success: true, status: newStatus };
    },

    async updateProductLoanWarehouseAcc(loanId, isChecked) {
      const profile = await getActiveUserProfile();
      if (!profile) return { success: false, message: 'Sesi login berakhir.' };
      const checked = Boolean(isChecked);
      const { data, error } = await sb
        .from('product_loans')
        .update({
          warehouse_acc: checked,
          warehouse_acc_by: checked ? profile.name : ''
        })
        .eq('id', String(loanId))
        .select('warehouse_acc, warehouse_acc_by, returned_at')
        .single();
      if (error) return { success: false, message: error.message };
      return {
        success: true,
        warehouseAcc: Boolean(data.warehouse_acc),
        warehouseAccBy: data.warehouse_acc_by || '',
        returnedAt: toJakartaIsoLocal(data.returned_at)
      };
    },

    async updateOwnedRecordInSheet(sheetName, recordId, updatesObj) {
      const table = SHEET_TO_TABLE[sheetName];
      if (!table) return { success: false, message: 'Tabel tidak dikenal: ' + sheetName };
      const mapped = mapUpdateFields(sheetName, updatesObj || {});
      const { error } = await sb.from(table).update(mapped).eq('id', String(recordId));
      if (error) return { success: false, message: error.message };
      return { success: true };
    },

    async deleteRecordFromSheet(sheetName, recordId) {
      const table = SHEET_TO_TABLE[sheetName];
      if (!table) return { success: false, message: 'Tabel tidak dikenal: ' + sheetName };
      const { error } = await sb.from(table).delete().eq('id', String(recordId));
      if (error) return { success: false, message: error.message };
      return { success: true };
    },

    async updateUserRoleInSheet(targetEmail, newRole) {
      const { error } = await sb
        .from('users_role')
        .update({ role: String(newRole || 'GUEST').toUpperCase() })
        .eq('email', String(targetEmail || '').toLowerCase());
      if (error) return { success: false, message: error.message };
      return { success: true };
    },

    async updateUserProfileInSheet(targetEmail, profileUpdates) {
      const emailLower = String(targetEmail || '').toLowerCase();
      const upd = {};
      if (profileUpdates?.name !== undefined) upd.name = String(profileUpdates.name).trim();
      if (profileUpdates?.wa !== undefined) upd.wa = String(profileUpdates.wa).replace(/[^\d]/g, '');
      if (profileUpdates?.role !== undefined) upd.role = String(profileUpdates.role).toUpperCase();
      const { error } = await sb.from('users_role').update(upd).eq('email', emailLower);
      if (error) return { success: false, message: error.message };
      return { success: true };
    },

    async addUserByWebmaster(userObj) {
      return callAdminUsersApi('create', { user: userObj });
    },

    async resetUserPasswordByWebmaster(targetEmail) {
      return callAdminUsersApi('reset_password', { email: targetEmail });
    },

    async deleteUserInSheet(targetEmail) {
      return callAdminUsersApi('delete', { email: targetEmail });
    }
  };

  // Expose unified bridge & lifecycle helpers
  window.JC_CLOUD_ADAPTER = {
    isReady: true,
    async invoke(fnName, args = [], onSuccess, onFailure) {
      const fn = handlers[fnName];
      if (!fn) {
        const msg = `Handler Supabase tidak ditemukan untuk: ${fnName}`;
        console.error(msg);
        if (onFailure) onFailure(new Error(msg));
        return;
      }
      try {
        const res = await fn(...(Array.isArray(args) ? args : []));
        if (onSuccess) onSuccess(res);
      } catch (err) {
        console.error(`[Supabase Adapter] ${fnName}:`, err);
        if (onFailure) onFailure(err);
      }
    },
    async signOut() {
      stopRealtimeSubscriptions();
      try { await sb.auth.signOut(); } catch {}
    },
    startRealtime: startRealtimeSubscriptions,
    stopRealtime: stopRealtimeSubscriptions
  };
})();
