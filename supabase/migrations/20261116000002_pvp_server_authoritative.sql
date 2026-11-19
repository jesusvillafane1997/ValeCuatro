-- ============================================================================
-- Vale Cuatro — Motor PvP Autoritativo, Matchmaking, Escrow y Anti-Cheat
-- ============================================================================

-- 1. Tabla privada para el mazo barajado (en esquema 'private', inaccesible vía Data API)
CREATE TABLE IF NOT EXISTS private.match_decks (
  match_id uuid PRIMARY KEY REFERENCES public.matches(id) ON DELETE CASCADE,
  remaining_deck jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Manos privadas de jugadores (RLS estricto: solo auth.uid() lee sus 3 cartas)
CREATE TABLE IF NOT EXISTS public.match_hands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id uuid NOT NULL REFERENCES public.matches(id) ON DELETE CASCADE,
  player_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  seat_index int NOT NULL CHECK (seat_index >= 0 AND seat_index < 6),
  cards jsonb NOT NULL DEFAULT '[]'::jsonb,
  envido_points int NOT NULL DEFAULT 0,
  has_flor boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (match_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_match_hands_lookup ON public.match_hands(match_id, player_id);

ALTER TABLE public.match_hands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anti-cheat: jugador solo lee sus propias 3 cartas"
  ON public.match_hands FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = player_id);

-- 3. Colas de Matchmaking por (mode, buy_in_tier)
CREATE TABLE IF NOT EXISTS public.match_queues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK (mode IN ('1v1', '3v3', 'gallo')),
  buy_in_tier text NOT NULL CHECK (buy_in_tier IN ('10000', '20000', '50000', '100000')),
  buy_in_ars numeric(12,2) NOT NULL,
  status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'matched', 'cancelled')),
  match_id uuid REFERENCES public.matches(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_match_queues_one_waiting_per_user
  ON public.match_queues(user_id) WHERE status = 'waiting';

CREATE INDEX IF NOT EXISTS idx_match_queues_group
  ON public.match_queues(mode, buy_in_tier, status, created_at);

ALTER TABLE public.match_queues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios ven su propia cola"
  ON public.match_queues FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id OR private.is_admin());

CREATE POLICY "Usuarios pueden cancelar su espera"
  ON public.match_queues FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id AND status = 'waiting')
  WITH CHECK ((SELECT auth.uid()) = user_id AND status IN ('waiting', 'cancelled'));

-- 4. Libro mayor inmutable de transacciones ARS (Escrow, Premios, Comisiones)
CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  match_id uuid REFERENCES public.matches(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('deposit', 'escrow_lock', 'payout', 'platform_fee', 'withdrawal', 'refund')),
  amount_ars numeric(12,2) NOT NULL,
  description text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_user ON public.wallet_transactions(user_id, created_at DESC);

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios ven sus propios movimientos y admins todos"
  ON public.wallet_transactions FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id OR private.is_admin());

-- 5. Columnas de reloj de turno, escrow y reconexión en matches & match_players
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS turn_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS escrow_pool_ars numeric(12,2) NOT NULL DEFAULT 0;

ALTER TABLE public.matches DROP CONSTRAINT IF EXISTS matches_status_check;
ALTER TABLE public.matches
  ADD CONSTRAINT matches_status_check
  CHECK (status IN ('waiting', 'playing', 'finished', 'completed', 'cancelled'));

ALTER TABLE public.match_players
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS disconnected_at timestamptz;

-- 6. RPC: Ingresar a cola verificada y armar partida atómicamente cuando se llena
CREATE OR REPLACE FUNCTION public.join_match_queue(
  p_mode text,
  p_buy_in_tier text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_amount numeric(12,2);
  v_wallet public.wallets%ROWTYPE;
  v_has_approved boolean;
  v_required int;
  v_waiting_ids uuid[];
  v_waiting_users uuid[];
  v_match_id uuid;
  v_i int;
  v_team text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Debés iniciar sesión para entrar a una mesa.';
  END IF;

  IF p_mode NOT IN ('1v1', '3v3', 'gallo') THEN
    RAISE EXCEPTION 'Modo de juego inválido.';
  END IF;

  IF p_buy_in_tier NOT IN ('10000', '20000', '50000', '100000') THEN
    RAISE EXCEPTION 'Pozo ARS inválido.';
  END IF;

  v_amount := p_buy_in_tier::numeric(12,2);
  v_required := CASE WHEN p_mode = '1v1' THEN 2 ELSE 6 END;

  SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_uid FOR UPDATE;
  SELECT EXISTS (
    SELECT 1 FROM public.transfer_requests
    WHERE user_id = v_uid AND status = 'approved' AND pool_tier = p_buy_in_tier
  ) INTO v_has_approved;

  IF (COALESCE(v_wallet.balance_ars, 0) + COALESCE(v_wallet.locked_ars, 0)) < v_amount
     AND NOT v_has_approved THEN
    RAISE EXCEPTION 'Saldo insuficiente o transferencia pendiente de aprobación para el pozo de % ARS.', p_buy_in_tier;
  END IF;

  -- Cancelar cola previa si existiera
  UPDATE public.match_queues
  SET status = 'cancelled'
  WHERE user_id = v_uid AND status = 'waiting';

  INSERT INTO public.match_queues (user_id, mode, buy_in_tier, buy_in_ars, status)
  VALUES (v_uid, p_mode, p_buy_in_tier, v_amount, 'waiting');

  -- Bloquear fila de espera del grupo (mode, buy_in_tier)
  SELECT array_agg(id ORDER BY created_at ASC), array_agg(user_id ORDER BY created_at ASC)
  INTO v_waiting_ids, v_waiting_users
  FROM (
    SELECT id, user_id, created_at
    FROM public.match_queues
    WHERE mode = p_mode AND buy_in_tier = p_buy_in_tier AND status = 'waiting'
    ORDER BY created_at ASC
    LIMIT v_required
    FOR UPDATE SKIP LOCKED
  ) q;

  IF COALESCE(array_length(v_waiting_ids, 1), 0) < v_required THEN
    RETURN jsonb_build_object(
      'status', 'waiting',
      'queued_count', COALESCE(array_length(v_waiting_ids, 1), 1),
      'required_count', v_required
    );
  END IF;

  -- Hay suficientes jugadores: crear partida y bloquear escrow atómicamente
  INSERT INTO public.matches (
    mode, pool_tier, buy_in_ars, escrow_ars, escrow_pool_ars,
    status, turn_expires_at, created_by
  )
  VALUES (
    p_mode, p_buy_in_tier, v_amount, v_amount * v_required, v_amount * v_required,
    'playing', now() + interval '25 seconds', v_waiting_users[1]
  )
  RETURNING id INTO v_match_id;

  FOR v_i IN 1..v_required LOOP
    v_team := CASE
      WHEN p_mode = 'gallo' THEN 'SOLO'
      WHEN ((v_i - 1) % 2) = 0 THEN 'A'
      ELSE 'B'
    END;

    -- Mover de balance_ars a locked_ars si hace falta
    UPDATE public.wallets
    SET balance_ars = GREATEST(0, balance_ars - GREATEST(0, v_amount - locked_ars)),
        locked_ars = GREATEST(locked_ars, v_amount),
        updated_at = now()
    WHERE user_id = v_waiting_users[v_i];

    INSERT INTO public.wallet_transactions (user_id, match_id, type, amount_ars, description)
    VALUES (
      v_waiting_users[v_i],
      v_match_id,
      'escrow_lock',
      -v_amount,
      'Buy-in bloqueado en escrow para mesa ' || p_mode
    );

    INSERT INTO public.match_players (match_id, user_id, is_bot, seat_index, team, buy_in_locked)
    VALUES (v_match_id, v_waiting_users[v_i], false, v_i - 1, v_team, true);
  END LOOP;

  UPDATE public.match_queues
  SET status = 'matched', match_id = v_match_id
  WHERE id = ANY(v_waiting_ids);

  RETURN jsonb_build_object(
    'status', 'matched',
    'match_id', v_match_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.join_match_queue(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.join_match_queue(text, text) TO authenticated;

-- 7. RPC: Heartbeat y búsqueda de partida activa para reconexión (ventana de 45s)
CREATE OR REPLACE FUNCTION public.player_heartbeat(p_match_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.match_players
  SET last_seen_at = now(),
      disconnected_at = NULL
  WHERE match_id = p_match_id
    AND user_id = (SELECT auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.player_heartbeat(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.player_heartbeat(uuid) TO authenticated;

-- 8. RPC: Liquidación automática del pozo al llegar a 30 puntos
CREATE OR REPLACE FUNCTION public.settle_match_escrow(
  p_match_id uuid,
  p_winner_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_match public.matches%ROWTYPE;
  v_commission numeric(4,3);
  v_net_pool numeric(12,2);
  v_fee numeric(12,2);
  v_winners uuid[];
  v_share numeric(12,2);
  v_uid uuid;
BEGIN
  SELECT * INTO v_match
  FROM public.matches
  WHERE id = p_match_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Partida no encontrada.';
  END IF;

  IF v_match.status IN ('finished', 'completed') THEN
    RETURN jsonb_build_object('status', 'already_settled');
  END IF;

  SELECT commission_rate INTO v_commission FROM public.app_settings WHERE id = 1;
  v_commission := COALESCE(v_commission, 0.100);
  v_fee := round(v_match.escrow_pool_ars * v_commission, 2);
  v_net_pool := v_match.escrow_pool_ars - v_fee;

  IF v_match.mode = 'gallo' THEN
    v_winners := ARRAY[p_winner_key::uuid];
  ELSE
    SELECT array_agg(user_id)
    INTO v_winners
    FROM public.match_players
    WHERE match_id = p_match_id AND team = p_winner_key AND user_id IS NOT NULL;
  END IF;

  IF COALESCE(array_length(v_winners, 1), 0) > 0 AND v_net_pool > 0 THEN
    v_share := round(v_net_pool / array_length(v_winners, 1), 2);
    FOREACH v_uid IN ARRAY v_winners LOOP
      UPDATE public.wallets
      SET balance_ars = balance_ars + v_share,
          total_won_ars = total_won_ars + v_share,
          updated_at = now()
      WHERE user_id = v_uid;

      INSERT INTO public.wallet_transactions (user_id, match_id, type, amount_ars, description)
      VALUES (v_uid, p_match_id, 'payout', v_share, 'Premio neto acreditado (30 puntos)');
    END LOOP;
  END IF;

  -- Liberar locked_ars de todos los jugadores de la partida
  UPDATE public.wallets w
  SET locked_ars = GREATEST(0, w.locked_ars - v_match.buy_in_ars),
      updated_at = now()
  FROM public.match_players mp
  WHERE mp.match_id = p_match_id AND mp.user_id = w.user_id;

  UPDATE public.matches
  SET status = 'completed',
      winner_team = p_winner_key,
      finished_at = now()
  WHERE id = p_match_id;

  RETURN jsonb_build_object(
    'status', 'completed',
    'net_pool_ars', v_net_pool,
    'platform_fee_ars', v_fee
  );
END;
$$;

REVOKE ALL ON FUNCTION public.settle_match_escrow(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_match_escrow(uuid, text) TO authenticated;

-- 9. Habilitar Realtime para colas de matchmaking y movimientos
ALTER PUBLICATION supabase_realtime ADD TABLE
  public.match_queues,
  public.wallet_transactions;
