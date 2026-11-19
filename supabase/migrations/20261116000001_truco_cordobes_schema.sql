-- ============================================================================
-- Truco Cordobés — Esquema completo de Base de Datos, RLS, Storage y Realtime
-- ============================================================================

-- 1. Esquema privado para funciones privilegiadas (no expuesto por Data API)
CREATE SCHEMA IF NOT EXISTS private;

-- 2. Tabla de perfiles de usuario
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username text NOT NULL UNIQUE,
  display_name text NOT NULL,
  avatar_url text,
  city text NOT NULL DEFAULT 'Córdoba',
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Función auxiliar en esquema privado para verificar si el usuario actual es admin
CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = (SELECT auth.uid())
      AND is_admin = true
  );
$$;

REVOKE ALL ON FUNCTION private.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.is_admin() TO authenticated;

-- Políticas RLS para profiles
CREATE POLICY "Perfiles visibles para usuarios autenticados"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuarios pueden crear su propio perfil"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = id AND is_admin = false);

CREATE POLICY "Usuarios pueden editar su propio perfil sin escalar a admin"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK (
    (SELECT auth.uid()) = id
    AND is_admin = (SELECT p.is_admin FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
  );

-- 3. Billeteras ARS (saldo disponible + saldo bloqueado en pozo/escrow)
CREATE TABLE IF NOT EXISTS public.wallets (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  balance_ars numeric(12,2) NOT NULL DEFAULT 0 CHECK (balance_ars >= 0),
  locked_ars numeric(12,2) NOT NULL DEFAULT 0 CHECK (locked_ars >= 0),
  total_won_ars numeric(12,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios ven su propia billetera o admins ven todas"
  ON public.wallets FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id OR private.is_admin());

-- 4. Configuración de la plataforma (CVU/Alias destino y comisión)
CREATE TABLE IF NOT EXISTS public.app_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  bank_alias text NOT NULL DEFAULT 'TRUCO.CBA.POZO',
  bank_cvu text NOT NULL DEFAULT '0000003100084920192837',
  bank_holder text NOT NULL DEFAULT 'Truco Cordobés S.R.L.',
  commission_rate numeric(4,3) NOT NULL DEFAULT 0.100 CHECK (commission_rate >= 0 AND commission_rate <= 0.300),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos los autenticados leen configuración bancaria"
  ON public.app_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Solo admins modifican configuración"
  ON public.app_settings FOR UPDATE
  TO authenticated
  USING (private.is_admin())
  WITH CHECK (private.is_admin());

INSERT INTO public.app_settings (id, bank_alias, bank_cvu, bank_holder, commission_rate)
VALUES (1, 'TRUCO.CBA.POZO', '0000003100084920192837', 'Truco Cordobés S.R.L.', 0.100)
ON CONFLICT (id) DO NOTHING;

-- 5. Partidas y Mesas (matches)
CREATE TABLE IF NOT EXISTS public.matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL CHECK (mode IN ('1v1', '3v3', 'gallo')),
  pool_tier text NOT NULL CHECK (pool_tier IN ('practice', '10000', '20000', '50000', '100000')),
  buy_in_ars numeric(12,2) NOT NULL DEFAULT 0 CHECK (buy_in_ars >= 0),
  escrow_ars numeric(12,2) NOT NULL DEFAULT 0 CHECK (escrow_ars >= 0),
  flor_enabled boolean NOT NULL DEFAULT true,
  pica_pica_enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'playing', 'finished', 'cancelled')),
  game_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  winner_team text,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_matches_status_tier ON public.matches(status, pool_tier, mode);

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Mesas visibles para usuarios autenticados"
  ON public.matches FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuarios autenticados pueden crear mesas"
  ON public.matches FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = created_by);

CREATE POLICY "Participantes o admins pueden actualizar estado público de la mesa"
  ON public.matches FOR UPDATE
  TO authenticated
  USING (
    private.is_admin()
    OR created_by = (SELECT auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.match_players mp
      WHERE mp.match_id = matches.id AND mp.user_id = (SELECT auth.uid())
    )
  );

-- 6. Jugadores sentados en cada mesa (sin cartas privadas)
CREATE TABLE IF NOT EXISTS public.match_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  is_bot boolean NOT NULL DEFAULT false,
  bot_name text,
  seat_index int NOT NULL CHECK (seat_index >= 0 AND seat_index < 6),
  team text NOT NULL CHECK (team IN ('A', 'B', 'SOLO')),
  hand_count int NOT NULL DEFAULT 0 CHECK (hand_count >= 0 AND hand_count <= 3),
  score int NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 30),
  buy_in_locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, seat_index)
);

CREATE INDEX IF NOT EXISTS idx_match_players_match ON public.match_players(match_id);
CREATE INDEX IF NOT EXISTS idx_match_players_user ON public.match_players(user_id);

ALTER TABLE public.match_players ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Asientos visibles para jugadores autenticados"
  ON public.match_players FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Jugadores pueden sentarse en mesas"
  ON public.match_players FOR INSERT
  TO authenticated
  WITH CHECK (
    (is_bot = false AND (SELECT auth.uid()) = user_id)
    OR (is_bot = true AND user_id IS NULL)
  );

CREATE POLICY "Participantes de la mesa pueden actualizar asientos"
  ON public.match_players FOR UPDATE
  TO authenticated
  USING (
    private.is_admin()
    OR (SELECT auth.uid()) = user_id
    OR EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = match_players.match_id AND m.created_by = (SELECT auth.uid())
    )
  );

-- 7. Cartas privadas repartidas (RLS estricto: cada jugador SOLO lee su propia mano)
CREATE TABLE IF NOT EXISTS public.player_hands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  match_player_id uuid NOT NULL REFERENCES public.match_players(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  cards jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_player_id)
);

CREATE INDEX IF NOT EXISTS idx_player_hands_user ON public.player_hands(user_id, match_id);

ALTER TABLE public.player_hands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Cada jugador solo puede leer su propia mano repartida"
  ON public.player_hands FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Creador de mesa o sistema puede repartir cartas"
  ON public.player_hands FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    OR EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = player_hands.match_id AND m.created_by = (SELECT auth.uid())
    )
  );

CREATE POLICY "Solo el dueño o creador de la mesa actualiza la mano"
  ON public.player_hands FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    OR EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = player_hands.match_id AND m.created_by = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    OR EXISTS (
      SELECT 1 FROM public.matches m
      WHERE m.id = player_hands.match_id AND m.created_by = (SELECT auth.uid())
    )
  );

-- 8. Solicitudes de transferencia bancaria (Transferencia Bancaria + Greenlight Admin)
CREATE TABLE IF NOT EXISTS public.transfer_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_ars numeric(12,2) NOT NULL CHECK (amount_ars IN (10000, 20000, 50000, 100000)),
  pool_tier text NOT NULL CHECK (pool_tier IN ('10000', '20000', '50000', '100000')),
  game_mode text NOT NULL DEFAULT '1v1' CHECK (game_mode IN ('1v1', '3v3', 'gallo')),
  reference_code text NOT NULL UNIQUE,
  receipt_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason text,
  match_id uuid REFERENCES public.matches(id) ON DELETE SET NULL,
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transfer_requests_user ON public.transfer_requests(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transfer_requests_status ON public.transfer_requests(status, created_at DESC);

ALTER TABLE public.transfer_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios ven sus transferencias y admins ven todas"
  ON public.transfer_requests FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id OR private.is_admin());

CREATE POLICY "Usuarios pueden crear su propia solicitud en estado pending"
  ON public.transfer_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
  );

CREATE POLICY "Solo admins pueden aprobar o rechazar transferencias"
  ON public.transfer_requests FOR UPDATE
  TO authenticated
  USING (private.is_admin())
  WITH CHECK (private.is_admin());

-- 9. Solicitudes de retiro CBU/CVU
CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_ars numeric(12,2) NOT NULL CHECK (amount_ars > 0),
  destination_cbu_cvu text NOT NULL,
  destination_alias text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'rejected')),
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_user ON public.withdrawal_requests(user_id, created_at DESC);

ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios ven sus retiros y admins ven todos"
  ON public.withdrawal_requests FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id OR private.is_admin());

CREATE POLICY "Usuarios pueden solicitar retiro en estado pending"
  ON public.withdrawal_requests FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND status = 'pending'
    AND reviewed_by IS NULL
  );

CREATE POLICY "Solo admins actualizan retiros"
  ON public.withdrawal_requests FOR UPDATE
  TO authenticated
  USING (private.is_admin())
  WITH CHECK (private.is_admin());

-- 10. Trigger automático al registrar un usuario en auth.users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_username text;
BEGIN
  v_username := COALESCE(
    NEW.raw_user_meta_data->>'username',
    split_part(NEW.email, '@', 1) || '_' || substr(NEW.id::text, 1, 4)
  );

  INSERT INTO public.profiles (id, username, display_name, city)
  VALUES (
    NEW.id,
    v_username,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'city', 'Córdoba')
  )
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.wallets (user_id, balance_ars, locked_ars)
  VALUES (NEW.id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 11. RPCs seguras para Greenlight Admin y Liquidación de Pozo (Escrow)
CREATE OR REPLACE FUNCTION public.approve_transfer_request(p_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_req public.transfer_requests%ROWTYPE;
  v_match_id uuid;
  v_seat_count int;
  v_max_seats int;
  v_team text;
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Acceso denegado: solo operadores administradores pueden aprobar transferencias.';
  END IF;

  SELECT * INTO v_req
  FROM public.transfer_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitud no encontrada.';
  END IF;

  IF v_req.status <> 'pending' THEN
    RAISE EXCEPTION 'La solicitud ya fue procesada (estado actual: %).', v_req.status;
  END IF;

  -- Acreditar saldo bloqueado para la mesa en la billetera del usuario
  UPDATE public.wallets
  SET locked_ars = locked_ars + v_req.amount_ars,
      updated_at = now()
  WHERE user_id = v_req.user_id;

  -- Buscar mesa abierta del mismo tier y modo, o crear una nueva
  v_max_seats := CASE WHEN v_req.game_mode = '1v1' THEN 2 ELSE 6 END;

  SELECT m.id INTO v_match_id
  FROM public.matches m
  WHERE m.status = 'waiting'
    AND m.pool_tier = v_req.pool_tier
    AND m.mode = v_req.game_mode
    AND (SELECT count(*) FROM public.match_players mp WHERE mp.match_id = m.id) < v_max_seats
  ORDER BY m.created_at ASC
  LIMIT 1;

  IF v_match_id IS NULL THEN
    INSERT INTO public.matches (mode, pool_tier, buy_in_ars, escrow_ars, status, created_by)
    VALUES (v_req.game_mode, v_req.pool_tier, v_req.amount_ars, v_req.amount_ars, 'waiting', v_req.user_id)
    RETURNING id INTO v_match_id;
    v_seat_count := 0;
  ELSE
    SELECT count(*) INTO v_seat_count FROM public.match_players WHERE match_id = v_match_id;
    UPDATE public.matches
    SET escrow_ars = escrow_ars + v_req.amount_ars
    WHERE id = v_match_id;
  END IF;

  v_team := CASE
    WHEN v_req.game_mode = 'gallo' THEN 'SOLO'
    WHEN (v_seat_count % 2) = 0 THEN 'A'
    ELSE 'B'
  END;

  INSERT INTO public.match_players (match_id, user_id, is_bot, seat_index, team, buy_in_locked)
  VALUES (v_match_id, v_req.user_id, false, v_seat_count, v_team, true)
  ON CONFLICT DO NOTHING;

  UPDATE public.transfer_requests
  SET status = 'approved',
      match_id = v_match_id,
      reviewed_by = (SELECT auth.uid()),
      reviewed_at = now()
  WHERE id = p_request_id;

  RETURN jsonb_build_object(
    'status', 'approved',
    'match_id', v_match_id,
    'amount_ars', v_req.amount_ars
  );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_transfer_request(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_transfer_request(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reject_transfer_request(p_request_id uuid, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT private.is_admin() THEN
    RAISE EXCEPTION 'Acceso denegado: solo operadores administradores pueden rechazar transferencias.';
  END IF;

  UPDATE public.transfer_requests
  SET status = 'rejected',
      rejection_reason = COALESCE(NULLIF(trim(p_reason), ''), 'Comprobante inválido o no acreditado'),
      reviewed_by = (SELECT auth.uid()),
      reviewed_at = now()
  WHERE id = p_request_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitud pendiente no encontrada.';
  END IF;

  RETURN jsonb_build_object('status', 'rejected');
END;
$$;

REVOKE ALL ON FUNCTION public.reject_transfer_request(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_transfer_request(uuid, text) TO authenticated;

-- 12. Storage Bucket para comprobantes de transferencia (JPG/PNG/PDF)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'comprobantes',
  'comprobantes',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Usuarios suben comprobantes en su carpeta"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'comprobantes'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

CREATE POLICY "Usuarios ven sus comprobantes y admins ven todos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'comprobantes'
    AND (
      (storage.foldername(name))[1] = (SELECT auth.uid())::text
      OR private.is_admin()
    )
  );

CREATE POLICY "Usuarios actualizan sus propios comprobantes"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'comprobantes'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  )
  WITH CHECK (
    bucket_id = 'comprobantes'
    AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  );

-- 13. Publicación Supabase Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE
  public.transfer_requests,
  public.matches,
  public.match_players,
  public.wallets,
  public.withdrawal_requests;
