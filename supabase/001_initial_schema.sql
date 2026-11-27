-- ============================================================================
-- JC PORTAL V.2.0 + JC HELPER — FASE 0 INITIAL DATABASE SCHEMA (SUPABASE)
-- Region: Southeast Asia (Singapore / ap-southeast-1)
-- Jalankan 1x di Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. HELPER TRIGGER: AUTO-UPDATE updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ============================================================================
-- 3. TABEL CORE JC PORTAL (8 TABEL)
-- ============================================================================

-- 3.1 Users & Role Whitelist (terhubung ke Supabase Auth + Identitas WA JC Helper)
CREATE TABLE IF NOT EXISTS public.users_role (
  email               TEXT PRIMARY KEY,
  auth_user_id        UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  name                TEXT NOT NULL,
  role                TEXT NOT NULL DEFAULT 'GUEST' CHECK (
                        role IN (
                          'WEBMASTER', 'WEB_ADMIN', 'HRD',
                          'KAPTEN_TIM', 'KEPALA_MP', 'KEPALA_DM', 'KEPALA_BRANDING', 'KEPALA_DESAIN', 'KEPALA_KONTEN',
                          'DESIGNER', 'ADMIN_MP', 'ADMIN_GUDANG', 'GUEST'
                        )
                      ),
  wa                  TEXT NOT NULL DEFAULT '',
  is_default_password BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_role_wa ON public.users_role (wa) WHERE wa <> '';
CREATE INDEX IF NOT EXISTS idx_users_role_role ON public.users_role (role);

-- 3.2 Job Tracker V.2.0 (Order Desain)
CREATE TABLE IF NOT EXISTS public.design_orders (
  id              TEXT PRIMARY KEY,
  date_iso        DATE NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::DATE,
  date_display    TEXT NOT NULL DEFAULT '',
  creator_name    TEXT NOT NULL DEFAULT '',
  creator_email   TEXT NOT NULL DEFAULT '',
  creator_wa      TEXT NOT NULL DEFAULT '',
  product         TEXT NOT NULL,
  design_type     TEXT NOT NULL DEFAULT '',
  stores          TEXT[] NOT NULL DEFAULT '{}',
  deadline        TEXT NOT NULL DEFAULT '-',
  link_bahan      TEXT NOT NULL DEFAULT '',
  link_hasil      TEXT NOT NULL DEFAULT '',
  notes           TEXT NOT NULL DEFAULT '',
  pic             TEXT NOT NULL DEFAULT 'Belum Ditugaskan',
  status          TEXT NOT NULL DEFAULT 'Antrean' CHECK (
                    status IN ('Antrean', 'Pending', 'Revisi', 'Selesai', 'Cancel')
                  ),
  acc             BOOLEAN NOT NULL DEFAULT FALSE,
  is_urgent       BOOLEAN NOT NULL DEFAULT FALSE,
  revision_count  INTEGER NOT NULL DEFAULT 0,
  revisions       JSONB NOT NULL DEFAULT '[]'::JSONB,
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_design_orders_date ON public.design_orders (date_iso DESC);
CREATE INDEX IF NOT EXISTS idx_design_orders_status ON public.design_orders (status);
CREATE INDEX IF NOT EXISTS idx_design_orders_pic ON public.design_orders (pic);
CREATE INDEX IF NOT EXISTS idx_design_orders_urgent ON public.design_orders (is_urgent) WHERE is_urgent = TRUE;

-- 3.3 Jadwal Studio Foto
CREATE TABLE IF NOT EXISTS public.studio_bookings (
  id              TEXT PRIMARY KEY,
  user_name       TEXT NOT NULL,
  creator_email   TEXT NOT NULL DEFAULT '',
  date_iso        DATE NOT NULL,
  start_time      TEXT NOT NULL,
  end_time        TEXT NOT NULL,
  purpose         TEXT NOT NULL,
  division        TEXT NOT NULL DEFAULT '',
  equipment       TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'Terbooking' CHECK (
                    status IN ('Terbooking', 'Selesai', 'Dibatalkan')
                  ),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_studio_bookings_date ON public.studio_bookings (date_iso DESC, start_time);

-- 3.4 Jadwal Ruang Meeting
CREATE TABLE IF NOT EXISTS public.meeting_bookings (
  id              TEXT PRIMARY KEY,
  user_name       TEXT NOT NULL,
  creator_email   TEXT NOT NULL DEFAULT '',
  room            TEXT NOT NULL,
  date_iso        DATE NOT NULL,
  start_time      TEXT NOT NULL,
  end_time        TEXT NOT NULL,
  agenda          TEXT NOT NULL,
  division        TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'Terjadwal' CHECK (
                    status IN ('Terjadwal', 'Selesai', 'Dibatalkan')
                  ),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meeting_bookings_date ON public.meeting_bookings (date_iso DESC, start_time);

-- 3.5 Papan Pengumuman Kantor
CREATE TABLE IF NOT EXISTS public.announcements (
  id              TEXT PRIMARY KEY,
  date_iso        DATE NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::DATE,
  title           TEXT NOT NULL,
  category        TEXT NOT NULL DEFAULT 'Kebijakan / HRD',
  author          TEXT NOT NULL,
  creator_email   TEXT NOT NULL DEFAULT '',
  creator_role    TEXT NOT NULL DEFAULT '',
  time_label      TEXT NOT NULL DEFAULT '',
  content         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcements_created ON public.announcements (created_at DESC);

-- 3.6 Info Lowongan Pekerjaan
CREATE TABLE IF NOT EXISTS public.job_vacancies (
  id              TEXT PRIMARY KEY,
  date_iso        DATE NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::DATE,
  title           TEXT NOT NULL,
  division        TEXT NOT NULL DEFAULT '',
  job_type        TEXT NOT NULL DEFAULT 'Full-Time',
  location        TEXT NOT NULL DEFAULT '',
  creator_email   TEXT NOT NULL DEFAULT '',
  wa_hrd          TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'Dibuka' CHECK (
                    status IN ('Dibuka', 'Ditutup', 'Draft')
                  ),
  description     TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_job_vacancies_status ON public.job_vacancies (status, created_at DESC);

-- 3.7 Product Knowledge (dengan pgvector untuk pencarian AI JC Helper)
CREATE TABLE IF NOT EXISTS public.product_knowledge (
  id              TEXT PRIMARY KEY,
  date_iso        DATE NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::DATE,
  sku             TEXT NOT NULL DEFAULT '',
  name            TEXT NOT NULL,
  brand           TEXT NOT NULL DEFAULT '',
  creator_email   TEXT NOT NULL DEFAULT '',
  usp             TEXT NOT NULL DEFAULT '',
  specs           TEXT NOT NULL DEFAULT '',
  faq             TEXT NOT NULL DEFAULT '',
  embedding       vector(768),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_knowledge_sku ON public.product_knowledge (sku);
CREATE INDEX IF NOT EXISTS idx_product_knowledge_brand ON public.product_knowledge (brand);

-- 3.8 Peminjaman Produk Gudang
CREATE TABLE IF NOT EXISTS public.product_loans (
  id                TEXT PRIMARY KEY,
  date_iso          DATE NOT NULL DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Jakarta')::DATE,
  borrow_time       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  product_name      TEXT NOT NULL,
  borrower          TEXT NOT NULL,
  creator_email     TEXT NOT NULL DEFAULT '',
  purpose           TEXT NOT NULL DEFAULT '',
  division          TEXT NOT NULL DEFAULT '',
  leader_acc        TEXT NOT NULL DEFAULT 'Menunggu' CHECK (
                      leader_acc IN ('Menunggu', 'Ya', 'Cancel')
                    ),
  leader_acc_by     TEXT NOT NULL DEFAULT '',
  status            TEXT NOT NULL DEFAULT 'Booking' CHECK (
                      status IN ('Booking', 'Disiapkan', 'Sudah Siap', 'Diambil', 'Selesai!')
                    ),
  warehouse_acc     BOOLEAN NOT NULL DEFAULT FALSE,
  warehouse_acc_by  TEXT NOT NULL DEFAULT '',
  returned_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_loans_borrow_time ON public.product_loans (borrow_time DESC);
CREATE INDEX IF NOT EXISTS idx_product_loans_leader_acc ON public.product_loans (leader_acc);
CREATE INDEX IF NOT EXISTS idx_product_loans_status ON public.product_loans (status);

-- ============================================================================
-- 4. TABEL FONDASI JC HELPER (WHATSAPP AI ASSISTANT — FASE 4 & 5)
-- ============================================================================

-- 4.1 Dokumen SOP & FAQ Internal untuk Tanya-Jawab Instan AI
CREATE TABLE IF NOT EXISTS public.jc_helper_docs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title           TEXT NOT NULL,
  doc_type        TEXT NOT NULL DEFAULT 'SOP' CHECK (doc_type IN ('SOP', 'FAQ', 'INFO')),
  division        TEXT NOT NULL DEFAULT 'Umum',
  content         TEXT NOT NULL,
  source_url      TEXT NOT NULL DEFAULT '',
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  embedding       vector(768),
  created_by      TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.2 Pelacak Approval Cepat via WhatsApp (Kapten Tim / Kepala Divisi)
CREATE TABLE IF NOT EXISTS public.wa_pending_approvals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_table       TEXT NOT NULL CHECK (ref_table IN ('product_loans', 'design_orders')),
  ref_id          TEXT NOT NULL,
  approver_email  TEXT NOT NULL,
  approver_wa     TEXT NOT NULL,
  wa_message_id   TEXT NOT NULL DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (
                    status IN ('pending', 'approved', 'cancelled', 'expired')
                  ),
  summary_text    TEXT NOT NULL DEFAULT '',
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_approvals_lookup
  ON public.wa_pending_approvals (approver_wa, status, created_at DESC);

-- 4.3 Audit Log Chat, Chat-to-Action & Morning Briefing JC Helper
CREATE TABLE IF NOT EXISTS public.wa_chat_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wa_phone        TEXT NOT NULL,
  user_email      TEXT NOT NULL DEFAULT '',
  user_role       TEXT NOT NULL DEFAULT '',
  direction       TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  intent          TEXT NOT NULL DEFAULT '',
  message_text    TEXT NOT NULL DEFAULT '',
  action_payload  JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wa_chat_logs_phone ON public.wa_chat_logs (wa_phone, created_at DESC);

-- ============================================================================
-- 5. PASANG TRIGGER updated_at PADA SEMUA TABEL
-- ============================================================================
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'users_role', 'design_orders', 'studio_bookings', 'meeting_bookings',
    'announcements', 'job_vacancies', 'product_knowledge', 'product_loans',
    'jc_helper_docs'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I;', tbl, tbl);
    EXECUTE format(
      'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();',
      tbl, tbl
    );
  END LOOP;
END;
$$;

-- ============================================================================
-- 6. FUNGSI HELPER AUTENTIKASI & ROLE UNTUK ROW-LEVEL SECURITY (RLS)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.current_portal_email()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT LOWER(COALESCE(
    (SELECT email FROM public.users_role WHERE auth_user_id = auth.uid() LIMIT 1),
    auth.jwt() ->> 'email',
    ''
  ));
$$;

CREATE OR REPLACE FUNCTION public.current_portal_role()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT role FROM public.users_role WHERE auth_user_id = auth.uid() LIMIT 1),
    (SELECT role FROM public.users_role WHERE LOWER(email) = LOWER(COALESCE(auth.jwt() ->> 'email', '')) LIMIT 1),
    'GUEST'
  );
$$;

-- ============================================================================
-- 6B. BUSINESS RULE & ROLE GUARD TRIGGERS (DITEGAKKAN DI LEVEL DATABASE)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.handle_product_loan_return()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_role TEXT;
  v_email TEXT;
  v_is_service BOOLEAN;
BEGIN
  v_is_service := (COALESCE(current_setting('request.jwt.claim.role', TRUE), '') = 'service_role')
                  OR (auth.uid() IS NULL AND current_user IN ('postgres', 'supabase_admin'));

  IF TG_OP = 'UPDATE' AND NOT v_is_service THEN
    v_role := public.current_portal_role();
    v_email := public.current_portal_email();

    IF OLD.warehouse_acc = TRUE THEN
      RAISE EXCEPTION 'Peminjaman yang sudah kembali & di-ACC Admin Gudang bersifat Read-Only.';
    END IF;

    IF (NEW.leader_acc IS DISTINCT FROM OLD.leader_acc OR NEW.leader_acc_by IS DISTINCT FROM OLD.leader_acc_by)
       AND v_role NOT IN ('KAPTEN_TIM', 'KEPALA_MP', 'KEPALA_DM', 'KEPALA_BRANDING', 'KEPALA_DESAIN', 'KEPALA_KONTEN', 'WEBMASTER') THEN
      RAISE EXCEPTION 'Akses ditolak: Hanya Kapten Tim / Kepala Divisi yang dapat mengubah ACC.';
    END IF;

    IF (NEW.warehouse_acc IS DISTINCT FROM OLD.warehouse_acc OR NEW.warehouse_acc_by IS DISTINCT FROM OLD.warehouse_acc_by)
       AND v_role NOT IN ('ADMIN_GUDANG', 'WEBMASTER') THEN
      RAISE EXCEPTION 'Akses ditolak: Hanya Admin Gudang yang dapat mencentang ACC kembali ke gudang.';
    END IF;

    IF (NEW.status IS DISTINCT FROM OLD.status) THEN
      IF v_role NOT IN ('ADMIN_GUDANG', 'WEB_ADMIN', 'WEBMASTER')
         AND NOT (LOWER(OLD.creator_email) = v_email AND NEW.status = 'Selesai!') THEN
        RAISE EXCEPTION 'Akses ditolak: Status peminjaman dikelola Admin Gudang.';
      END IF;
    END IF;
  END IF;

  IF NEW.status <> 'Selesai!' THEN
    NEW.warehouse_acc := FALSE;
    NEW.warehouse_acc_by := '';
    NEW.returned_at := NULL;
  ELSIF NEW.status = 'Selesai!' AND NEW.warehouse_acc = TRUE AND NEW.returned_at IS NULL THEN
    NEW.returned_at := NOW();
  ELSIF NEW.warehouse_acc = FALSE THEN
    NEW.returned_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_loan_return ON public.product_loans;
CREATE TRIGGER trg_product_loan_return
BEFORE INSERT OR UPDATE ON public.product_loans
FOR EACH ROW EXECUTE FUNCTION public.handle_product_loan_return();

CREATE OR REPLACE FUNCTION public.guard_users_role_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_service BOOLEAN;
BEGIN
  v_is_service := (COALESCE(current_setting('request.jwt.claim.role', TRUE), '') = 'service_role')
                  OR (auth.uid() IS NULL AND current_user IN ('postgres', 'supabase_admin'));

  IF NOT v_is_service AND public.current_portal_role() <> 'WEBMASTER' THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR LOWER(NEW.email) IS DISTINCT FROM LOWER(OLD.email)
       OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id THEN
      RAISE EXCEPTION 'Akses ditolak: Hanya Webmaster yang dapat mengubah role atau identitas akun.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_users_role_update ON public.users_role;
CREATE TRIGGER trg_guard_users_role_update
BEFORE UPDATE ON public.users_role
FOR EACH ROW EXECUTE FUNCTION public.guard_users_role_update();

CREATE OR REPLACE FUNCTION public.guard_design_order_completed()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_is_service BOOLEAN;
BEGIN
  v_is_service := (COALESCE(current_setting('request.jwt.claim.role', TRUE), '') = 'service_role')
                  OR (auth.uid() IS NULL AND current_user IN ('postgres', 'supabase_admin'));

  IF NOT v_is_service AND OLD.status = 'Selesai' THEN
    IF NEW.product IS DISTINCT FROM OLD.product
       OR NEW.design_type IS DISTINCT FROM OLD.design_type
       OR NEW.stores IS DISTINCT FROM OLD.stores
       OR NEW.deadline IS DISTINCT FROM OLD.deadline
       OR NEW.link_bahan IS DISTINCT FROM OLD.link_bahan
       OR NEW.link_hasil IS DISTINCT FROM OLD.link_hasil
       OR NEW.notes IS DISTINCT FROM OLD.notes
       OR NEW.pic IS DISTINCT FROM OLD.pic
       OR NEW.is_urgent IS DISTINCT FROM OLD.is_urgent
       OR (NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'Revisi') THEN
      RAISE EXCEPTION 'Order yang sudah Selesai bersifat Read-Only (kecuali pengajuan Revisi & ACC).';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_design_order_completed ON public.design_orders;
CREATE TRIGGER trg_guard_design_order_completed
BEFORE UPDATE ON public.design_orders
FOR EACH ROW EXECUTE FUNCTION public.guard_design_order_completed();

-- ============================================================================
-- 7. AKTIFKAN ROW-LEVEL SECURITY (RLS) & POLICIES PER ROLE
-- ============================================================================
ALTER TABLE public.users_role ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.studio_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_vacancies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_loans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jc_helper_docs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_pending_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wa_chat_logs ENABLE ROW LEVEL SECURITY;

-- 7.1 users_role: user login bisa lihat daftar staf internal (tanpa Guest), Webmaster kelola penuh
DROP POLICY IF EXISTS users_role_select ON public.users_role;
CREATE POLICY users_role_select ON public.users_role
  FOR SELECT TO authenticated
  USING (
    public.current_portal_role() = 'WEBMASTER'
    OR LOWER(email) = public.current_portal_email()
    OR public.current_portal_role() <> 'GUEST'
  );

DROP POLICY IF EXISTS users_role_self_pw_flag ON public.users_role;
CREATE POLICY users_role_self_pw_flag ON public.users_role
  FOR UPDATE TO authenticated
  USING (
    public.current_portal_role() = 'WEBMASTER'
    OR LOWER(email) = public.current_portal_email()
  )
  WITH CHECK (
    public.current_portal_role() = 'WEBMASTER'
    OR LOWER(email) = public.current_portal_email()
  );

DROP POLICY IF EXISTS users_role_webmaster_all ON public.users_role;
CREATE POLICY users_role_webmaster_all ON public.users_role
  FOR ALL TO authenticated
  USING (public.current_portal_role() = 'WEBMASTER')
  WITH CHECK (public.current_portal_role() = 'WEBMASTER');

-- 7.2 announcements: Guest (anon) hanya bisa baca pengumuman HRD; karyawan login baca semua
DROP POLICY IF EXISTS announcements_anon_hrd ON public.announcements;
CREATE POLICY announcements_anon_hrd ON public.announcements
  FOR SELECT TO anon
  USING (creator_role = 'HRD' OR LOWER(creator_email) = 'hrd@kantor.id');

DROP POLICY IF EXISTS announcements_auth_select ON public.announcements;
CREATE POLICY announcements_auth_select ON public.announcements
  FOR SELECT TO authenticated
  USING (
    public.current_portal_role() <> 'GUEST'
    OR creator_role = 'HRD'
    OR LOWER(creator_email) = 'hrd@kantor.id'
  );

DROP POLICY IF EXISTS announcements_write ON public.announcements;
CREATE POLICY announcements_write ON public.announcements
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_portal_role() IN (
      'WEBMASTER', 'WEB_ADMIN', 'HRD', 'KAPTEN_TIM',
      'KEPALA_MP', 'KEPALA_DM', 'KEPALA_BRANDING', 'KEPALA_DESAIN', 'KEPALA_KONTEN'
    )
  );

DROP POLICY IF EXISTS announcements_update_delete ON public.announcements;
CREATE POLICY announcements_update_delete ON public.announcements
  FOR ALL TO authenticated
  USING (
    public.current_portal_role() = 'WEBMASTER'
    OR LOWER(creator_email) = public.current_portal_email()
  )
  WITH CHECK (
    public.current_portal_role() = 'WEBMASTER'
    OR LOWER(creator_email) = public.current_portal_email()
  );

-- 7.3 job_vacancies: Guest & semua staf bisa baca; HRD/Webmaster/Web Admin bisa tulis
DROP POLICY IF EXISTS jobs_public_select ON public.job_vacancies;
CREATE POLICY jobs_public_select ON public.job_vacancies
  FOR SELECT TO anon, authenticated
  USING (TRUE);

DROP POLICY IF EXISTS jobs_write ON public.job_vacancies;
CREATE POLICY jobs_write ON public.job_vacancies
  FOR INSERT TO authenticated
  WITH CHECK (public.current_portal_role() IN ('WEBMASTER', 'WEB_ADMIN', 'HRD'));

DROP POLICY IF EXISTS jobs_modify ON public.job_vacancies;
CREATE POLICY jobs_modify ON public.job_vacancies
  FOR ALL TO authenticated
  USING (
    public.current_portal_role() = 'WEBMASTER'
    OR (public.current_portal_role() IN ('HRD', 'WEB_ADMIN') AND LOWER(creator_email) = public.current_portal_email())
  )
  WITH CHECK (
    public.current_portal_role() = 'WEBMASTER'
    OR (public.current_portal_role() IN ('HRD', 'WEB_ADMIN') AND LOWER(creator_email) = public.current_portal_email())
  );

-- 7.4 design_orders: hanya staf non-Guest & non-Admin Gudang
DROP POLICY IF EXISTS design_orders_select ON public.design_orders;
CREATE POLICY design_orders_select ON public.design_orders
  FOR SELECT TO authenticated
  USING (public.current_portal_role() NOT IN ('GUEST', 'ADMIN_GUDANG'));

DROP POLICY IF EXISTS design_orders_insert ON public.design_orders;
CREATE POLICY design_orders_insert ON public.design_orders
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_portal_role() IN (
      'WEBMASTER', 'WEB_ADMIN', 'KAPTEN_TIM',
      'KEPALA_MP', 'KEPALA_DM', 'KEPALA_BRANDING', 'KEPALA_DESAIN', 'KEPALA_KONTEN', 'ADMIN_MP'
    )
  );

DROP POLICY IF EXISTS design_orders_update ON public.design_orders;
CREATE POLICY design_orders_update ON public.design_orders
  FOR UPDATE TO authenticated
  USING (public.current_portal_role() NOT IN ('GUEST', 'ADMIN_GUDANG'))
  WITH CHECK (public.current_portal_role() NOT IN ('GUEST', 'ADMIN_GUDANG'));

DROP POLICY IF EXISTS design_orders_delete ON public.design_orders;
CREATE POLICY design_orders_delete ON public.design_orders
  FOR DELETE TO authenticated
  USING (
    status <> 'Selesai'
    AND (
      public.current_portal_role() = 'WEBMASTER'
      OR LOWER(creator_email) = public.current_portal_email()
    )
  );

-- 7.5 studio_bookings & meeting_bookings & product_knowledge (non-Guest, non-Admin Gudang)
DROP POLICY IF EXISTS studio_select ON public.studio_bookings;
CREATE POLICY studio_select ON public.studio_bookings
  FOR SELECT TO authenticated
  USING (public.current_portal_role() NOT IN ('GUEST', 'ADMIN_GUDANG'));

DROP POLICY IF EXISTS studio_insert ON public.studio_bookings;
CREATE POLICY studio_insert ON public.studio_bookings
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_portal_role() IN (
      'WEBMASTER', 'WEB_ADMIN', 'KAPTEN_TIM',
      'KEPALA_BRANDING', 'KEPALA_DESAIN', 'KEPALA_KONTEN', 'DESIGNER'
    )
  );

DROP POLICY IF EXISTS studio_modify ON public.studio_bookings;
CREATE POLICY studio_modify ON public.studio_bookings
  FOR ALL TO authenticated
  USING (
    public.current_portal_role() = 'WEBMASTER'
    OR LOWER(creator_email) = public.current_portal_email()
  )
  WITH CHECK (
    public.current_portal_role() = 'WEBMASTER'
    OR LOWER(creator_email) = public.current_portal_email()
  );

DROP POLICY IF EXISTS meeting_select ON public.meeting_bookings;
CREATE POLICY meeting_select ON public.meeting_bookings
  FOR SELECT TO authenticated
  USING (public.current_portal_role() NOT IN ('GUEST', 'ADMIN_GUDANG'));

DROP POLICY IF EXISTS meeting_insert ON public.meeting_bookings;
CREATE POLICY meeting_insert ON public.meeting_bookings
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_portal_role() IN (
      'WEBMASTER', 'WEB_ADMIN', 'HRD', 'KAPTEN_TIM',
      'KEPALA_MP', 'KEPALA_DM', 'KEPALA_BRANDING', 'KEPALA_DESAIN', 'KEPALA_KONTEN'
    )
  );

DROP POLICY IF EXISTS meeting_modify ON public.meeting_bookings;
CREATE POLICY meeting_modify ON public.meeting_bookings
  FOR ALL TO authenticated
  USING (
    public.current_portal_role() = 'WEBMASTER'
    OR LOWER(creator_email) = public.current_portal_email()
  )
  WITH CHECK (
    public.current_portal_role() = 'WEBMASTER'
    OR LOWER(creator_email) = public.current_portal_email()
  );

DROP POLICY IF EXISTS pk_select ON public.product_knowledge;
CREATE POLICY pk_select ON public.product_knowledge
  FOR SELECT TO authenticated
  USING (public.current_portal_role() NOT IN ('GUEST', 'ADMIN_GUDANG'));

DROP POLICY IF EXISTS pk_insert ON public.product_knowledge;
CREATE POLICY pk_insert ON public.product_knowledge
  FOR INSERT TO authenticated
  WITH CHECK (
    public.current_portal_role() IN (
      'WEBMASTER', 'WEB_ADMIN', 'KAPTEN_TIM',
      'KEPALA_MP', 'KEPALA_DM', 'KEPALA_BRANDING', 'KEPALA_DESAIN', 'KEPALA_KONTEN'
    )
  );

DROP POLICY IF EXISTS pk_modify ON public.product_knowledge;
CREATE POLICY pk_modify ON public.product_knowledge
  FOR ALL TO authenticated
  USING (
    public.current_portal_role() = 'WEBMASTER'
    OR LOWER(creator_email) = public.current_portal_email()
  )
  WITH CHECK (
    public.current_portal_role() = 'WEBMASTER'
    OR LOWER(creator_email) = public.current_portal_email()
  );

-- 7.6 product_loans: semua staf login (termasuk ADMIN_GUDANG) bisa lihat & ajukan
DROP POLICY IF EXISTS loans_select ON public.product_loans;
CREATE POLICY loans_select ON public.product_loans
  FOR SELECT TO authenticated
  USING (public.current_portal_role() <> 'GUEST');

DROP POLICY IF EXISTS loans_insert ON public.product_loans;
CREATE POLICY loans_insert ON public.product_loans
  FOR INSERT TO authenticated
  WITH CHECK (public.current_portal_role() <> 'GUEST');

DROP POLICY IF EXISTS loans_update ON public.product_loans;
CREATE POLICY loans_update ON public.product_loans
  FOR UPDATE TO authenticated
  USING (
    warehouse_acc = FALSE
    AND (
      public.current_portal_role() IN (
        'WEBMASTER', 'WEB_ADMIN', 'ADMIN_GUDANG',
        'KAPTEN_TIM', 'KEPALA_MP', 'KEPALA_DM', 'KEPALA_BRANDING', 'KEPALA_DESAIN', 'KEPALA_KONTEN'
      )
      OR LOWER(creator_email) = public.current_portal_email()
    )
  )
  WITH CHECK (public.current_portal_role() <> 'GUEST');

DROP POLICY IF EXISTS loans_delete ON public.product_loans;
CREATE POLICY loans_delete ON public.product_loans
  FOR DELETE TO authenticated
  USING (
    warehouse_acc = FALSE
    AND (
      public.current_portal_role() = 'WEBMASTER'
      OR LOWER(creator_email) = public.current_portal_email()
    )
  );

-- 7.7 Tabel JC Helper: hanya Webmaster/Admin di browser (service_role Cloudflare Worker punya akses penuh)
DROP POLICY IF EXISTS helper_docs_read ON public.jc_helper_docs;
CREATE POLICY helper_docs_read ON public.jc_helper_docs
  FOR SELECT TO authenticated
  USING (public.current_portal_role() <> 'GUEST');

DROP POLICY IF EXISTS helper_docs_manage ON public.jc_helper_docs;
CREATE POLICY helper_docs_manage ON public.jc_helper_docs
  FOR ALL TO authenticated
  USING (public.current_portal_role() IN ('WEBMASTER', 'WEB_ADMIN', 'HRD'))
  WITH CHECK (public.current_portal_role() IN ('WEBMASTER', 'WEB_ADMIN', 'HRD'));

DROP POLICY IF EXISTS wa_approvals_webmaster ON public.wa_pending_approvals;
CREATE POLICY wa_approvals_webmaster ON public.wa_pending_approvals
  FOR SELECT TO authenticated
  USING (
    public.current_portal_role() = 'WEBMASTER'
    OR LOWER(approver_email) = public.current_portal_email()
  );

DROP POLICY IF EXISTS wa_logs_webmaster ON public.wa_chat_logs;
CREATE POLICY wa_logs_webmaster ON public.wa_chat_logs
  FOR SELECT TO authenticated
  USING (public.current_portal_role() = 'WEBMASTER');

-- ============================================================================
-- 8. AKTIFKAN SUPABASE REALTIME (< 1 DETIK) UNTUK SEMUA 8 TABEL PORTAL
-- ============================================================================
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'users_role', 'design_orders', 'studio_bookings', 'meeting_bookings',
    'announcements', 'job_vacancies', 'product_knowledge', 'product_loans'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I;', tbl);
    END IF;
  END LOOP;
END;
$$;
