-- ============================================================================
-- Vale Cuatro — Habilitar Matchmaking PvP gratuito ('practice') en Supabase
-- ============================================================================

ALTER TABLE public.match_queues DROP CONSTRAINT IF EXISTS match_queues_buy_in_tier_check;
ALTER TABLE public.match_queues
  ADD CONSTRAINT match_queues_buy_in_tier_check
  CHECK (buy_in_tier IN ('practice', '10000', '20000', '50000', '100000'));

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

  IF p_buy_in_tier NOT IN ('practice', '10000', '20000', '50000', '100000') THEN
    RAISE EXCEPTION 'Pozo ARS inválido.';
  END IF;

  v_amount := CASE WHEN p_buy_in_tier = 'practice' THEN 0 ELSE p_buy_in_tier::numeric(12,2) END;
  v_required := CASE WHEN p_mode = '1v1' THEN 2 ELSE 6 END;

  IF v_amount > 0 THEN
    SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_uid FOR UPDATE;
    SELECT EXISTS (
      SELECT 1 FROM public.transfer_requests
      WHERE user_id = v_uid AND status = 'approved' AND pool_tier = p_buy_in_tier
    ) INTO v_has_approved;

    IF (COALESCE(v_wallet.balance_ars, 0) + COALESCE(v_wallet.locked_ars, 0)) < v_amount
       AND NOT v_has_approved THEN
      RAISE EXCEPTION 'Saldo insuficiente o transferencia pendiente de aprobación para el pozo de % ARS.', p_buy_in_tier;
    END IF;
  END IF;

  UPDATE public.match_queues
  SET status = 'cancelled'
  WHERE user_id = v_uid AND status = 'waiting';

  INSERT INTO public.match_queues (user_id, mode, buy_in_tier, buy_in_ars, status)
  VALUES (v_uid, p_mode, p_buy_in_tier, v_amount, 'waiting');

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

    IF v_amount > 0 THEN
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
    END IF;

    INSERT INTO public.match_players (match_id, user_id, is_bot, seat_index, team, buy_in_locked)
    VALUES (v_match_id, v_waiting_users[v_i], false, v_i - 1, v_team, v_amount > 0);
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
