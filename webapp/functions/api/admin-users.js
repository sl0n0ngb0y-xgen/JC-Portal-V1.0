/**
 * ============================================================================
 * CLOUDFLARE PAGES FUNCTION — /api/admin-users
 * Endpoint khusus WEBMASTER untuk tambah user, reset password (12345678),
 * dan hapus user di Supabase Auth + public.users_role.
 *
 * Environment Variables di Cloudflare Pages:
 *   - SUPABASE_URL        (https://ljeweadrbhlpuupjksbj.supabase.co)
 *   - SUPABASE_SECRET_KEY (sb_secret_... / service_role key — RAHASIA)
 * ============================================================================
 */

const DEFAULT_PASSWORD = '12345678';

function jsonRes(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store'
    }
  });
}

async function verifyWebmaster(supabaseUrl, secretKey, authHeader) {
  const token = (authHeader || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${token}`
    }
  });
  if (!userRes.ok) return null;
  const authUser = await userRes.json();
  const emailLower = String(authUser.email || '').trim().toLowerCase();
  if (!emailLower) return null;

  const roleRes = await fetch(
    `${supabaseUrl}/rest/v1/users_role?email=eq.${encodeURIComponent(emailLower)}&select=email,role`,
    {
      headers: {
        apikey: secretKey,
        Authorization: `Bearer ${secretKey}`
      }
    }
  );
  if (!roleRes.ok) return null;
  const rows = await roleRes.json();
  const me = Array.isArray(rows) ? rows[0] : null;
  if (!me || String(me.role).toUpperCase() !== 'WEBMASTER') return null;
  return me;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const supabaseUrl = String(env.SUPABASE_URL || '').replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
  const secretKey = String(env.SUPABASE_SECRET_KEY || '').trim();

  if (!supabaseUrl || !secretKey) {
    return jsonRes({ success: false, message: 'Server Cloudflare belum dikonfigurasi (SUPABASE_URL / SUPABASE_SECRET_KEY).' }, 500);
  }

  const webmaster = await verifyWebmaster(supabaseUrl, secretKey, request.headers.get('Authorization'));
  if (!webmaster) {
    return jsonRes({ success: false, message: 'Akses ditolak: Khusus Webmaster.' }, 403);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonRes({ success: false, message: 'Format JSON tidak valid.' }, 400);
  }

  const action = String(body.action || '').trim();
  const adminHeaders = {
    apikey: secretKey,
    Authorization: `Bearer ${secretKey}`,
    'Content-Type': 'application/json'
  };

  // 1. CREATE USER (Auth + users_role)
  if (action === 'create') {
    const u = body.user || {};
    const email = String(u.email || '').trim().toLowerCase();
    const name = String(u.name || '').trim();
    const role = String(u.role || 'GUEST').trim().toUpperCase();
    const wa = String(u.wa || '').replace(/[^\d]/g, '');

    if (!email || !email.includes('@') || !name) {
      return jsonRes({ success: false, message: 'Email dan nama wajib diisi.' }, 400);
    }

    let authUserId = null;
    if (role !== 'GUEST') {
      const createAuth = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          email,
          password: DEFAULT_PASSWORD,
          email_confirm: true,
          user_metadata: { name, role }
        })
      });
      if (!createAuth.ok) {
        const errData = await createAuth.json().catch(() => ({}));
        return jsonRes({ success: false, message: errData.msg || errData.message || 'Gagal membuat akun Auth.' }, 400);
      }
      const created = await createAuth.json();
      authUserId = created.id || created.user?.id || null;
    }

    const upsertRes = await fetch(`${supabaseUrl}/rest/v1/users_role?on_conflict=email`, {
      method: 'POST',
      headers: { ...adminHeaders, Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        email,
        auth_user_id: authUserId,
        name,
        role,
        wa,
        is_default_password: role !== 'GUEST'
      })
    });
    if (!upsertRes.ok) {
      return jsonRes({ success: false, message: 'Gagal menyimpan ke users_role: ' + (await upsertRes.text()) }, 500);
    }
    return jsonRes({ success: true, email, authUserId });
  }

  // 2. RESET PASSWORD KE 12345678
  if (action === 'reset_password') {
    const email = String(body.email || '').trim().toLowerCase();
    if (!email) return jsonRes({ success: false, message: 'Email wajib diisi.' }, 400);

    const lookupRes = await fetch(
      `${supabaseUrl}/rest/v1/users_role?email=eq.${encodeURIComponent(email)}&select=email,auth_user_id,name,role`,
      { headers: adminHeaders }
    );
    const rows = lookupRes.ok ? await lookupRes.json() : [];
    const target = Array.isArray(rows) ? rows[0] : null;
    if (!target) return jsonRes({ success: false, message: 'User tidak ditemukan.' }, 404);
    if (target.role === 'GUEST') return jsonRes({ success: false, message: 'Akun Guest tidak menggunakan password.' }, 400);

    let authId = target.auth_user_id;
    if (!authId) {
      const createAuth = await fetch(`${supabaseUrl}/auth/v1/admin/users`, {
        method: 'POST',
        headers: adminHeaders,
        body: JSON.stringify({
          email,
          password: DEFAULT_PASSWORD,
          email_confirm: true,
          user_metadata: { name: target.name, role: target.role }
        })
      });
      if (createAuth.ok) {
        const created = await createAuth.json();
        authId = created.id || created.user?.id || null;
      }
    } else {
      const updAuth = await fetch(`${supabaseUrl}/auth/v1/admin/users/${authId}`, {
        method: 'PUT',
        headers: adminHeaders,
        body: JSON.stringify({ password: DEFAULT_PASSWORD })
      });
      if (!updAuth.ok) {
        return jsonRes({ success: false, message: 'Gagal mereset password di Auth.' }, 500);
      }
    }

    await fetch(`${supabaseUrl}/rest/v1/users_role?email=eq.${encodeURIComponent(email)}`, {
      method: 'PATCH',
      headers: adminHeaders,
      body: JSON.stringify({ auth_user_id: authId, is_default_password: true })
    });

    return jsonRes({ success: true, message: `Password ${email} berhasil direset ke 12345678.` });
  }

  // 3. DELETE USER
  if (action === 'delete') {
    const email = String(body.email || '').trim().toLowerCase();
    if (!email) return jsonRes({ success: false, message: 'Email wajib diisi.' }, 400);
    if (email === webmaster.email.toLowerCase()) {
      return jsonRes({ success: false, message: 'Tidak dapat menghapus akun Webmaster yang sedang aktif.' }, 400);
    }

    const lookupRes = await fetch(
      `${supabaseUrl}/rest/v1/users_role?email=eq.${encodeURIComponent(email)}&select=email,auth_user_id`,
      { headers: adminHeaders }
    );
    const rows = lookupRes.ok ? await lookupRes.json() : [];
    const target = Array.isArray(rows) ? rows[0] : null;

    if (target?.auth_user_id) {
      await fetch(`${supabaseUrl}/auth/v1/admin/users/${target.auth_user_id}`, {
        method: 'DELETE',
        headers: adminHeaders
      });
    }

    await fetch(`${supabaseUrl}/rest/v1/users_role?email=eq.${encodeURIComponent(email)}`, {
      method: 'DELETE',
      headers: adminHeaders
    });

    return jsonRes({ success: true });
  }

  return jsonRes({ success: false, message: 'Aksi tidak dikenal: ' + action }, 400);
}
