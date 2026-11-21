-- ============================================================================
-- Vale Cuatro — RPCs seguras para hidratación y commit en Server Routes
-- ============================================================================

CREATE OR REPLACE FUNCTION public.server_init_match_hands(
  p_match_id uuid,
  p_hands jsonb,
  p_game_state jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_match public.matches%ROWTYPE;
  v_item jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.match_players
    WHERE match_id = p_match_id AND user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'No estás sentado en esta mesa.';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mesa no encontrada.';
  END IF;

  IF v_match.game_state IS NOT NULL AND v_match.game_state <> '{}'::jsonb THEN
    RETURN jsonb_build_object('already_initialized', true, 'game_state', v_match.game_state);
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_hands) LOOP
    INSERT INTO public.match_hands (match_id, player_id, seat_index, cards, envido_points, has_flor)
    VALUES (
      p_match_id,
      (v_item->>'player_id')::uuid,
      (v_item->>'seat_index')::int,
      v_item->'cards',
      (v_item->>'envido_points')::int,
      (v_item->>'has_flor')::boolean
    )
    ON CONFLICT (match_id, player_id) DO UPDATE SET
      cards = EXCLUDED.cards,
      envido_points = EXCLUDED.envido_points,
      has_flor = EXCLUDED.has_flor,
      updated_at = now();
  END LOOP;

  UPDATE public.matches
  SET game_state = p_game_state,
      turn_expires_at = now() + interval '25 seconds'
  WHERE id = p_match_id;

  RETURN jsonb_build_object('already_initialized', false, 'game_state', p_game_state);
END;
$$;

REVOKE ALL ON FUNCTION public.server_init_match_hands(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.server_init_match_hands(uuid, jsonb, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.server_get_match_context(p_match_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_match public.matches%ROWTYPE;
  v_hands jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.match_players
    WHERE match_id = p_match_id AND user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'No estás sentado en esta mesa.';
  END IF;

  SELECT * INTO v_match FROM public.matches WHERE id = p_match_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Mesa no encontrada.';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'player_id', player_id,
        'cards', cards,
        'envido_points', envido_points,
        'has_flor', has_flor
      )
    ),
    '[]'::jsonb
  )
  INTO v_hands
  FROM public.match_hands
  WHERE match_id = p_match_id;

  RETURN jsonb_build_object(
    'status', v_match.status,
    'game_state', v_match.game_state,
    'turn_expires_at', v_match.turn_expires_at,
    'hands', v_hands
  );
END;
$$;

REVOKE ALL ON FUNCTION public.server_get_match_context(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.server_get_match_context(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.server_commit_match_action(
  p_match_id uuid,
  p_game_state jsonb,
  p_hands jsonb,
  p_winner_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_item jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'No autenticado.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.match_players
    WHERE match_id = p_match_id AND user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'No estás sentado en esta mesa.';
  END IF;

  UPDATE public.matches
  SET game_state = p_game_state,
      turn_expires_at = now() + interval '25 seconds'
  WHERE id = p_match_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_hands) LOOP
    UPDATE public.match_hands
    SET cards = v_item->'cards',
        envido_points = (v_item->>'envido_points')::int,
        has_flor = (v_item->>'has_flor')::boolean,
        updated_at = now()
    WHERE match_id = p_match_id
      AND player_id = (v_item->>'player_id')::uuid;
  END LOOP;

  IF p_winner_key IS NOT NULL AND length(trim(p_winner_key)) > 0 THEN
    PERFORM public.settle_match_escrow(p_match_id, p_winner_key);
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.server_commit_match_action(uuid, jsonb, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.server_commit_match_action(uuid, jsonb, jsonb, text) TO authenticated;
