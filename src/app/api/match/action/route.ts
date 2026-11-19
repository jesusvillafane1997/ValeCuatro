import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import {
  sanitizePublicGameState,
  ServerMatchAction,
  validateAndApplyServerAction,
} from '@/lib/truco/server-engine';
import { TrucoGameState } from '@/lib/truco/types';

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      matchId: string;
      action: ServerMatchAction;
    };

    if (!body.matchId || !body.action) {
      return NextResponse.json({ error: 'Solicitud inválida.' }, { status: 400 });
    }

    const supabase = await createServerSupabase();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
    }

    // Leer estado público + manos privadas del servidor
    const { data: match, error: matchErr } = await supabase
      .from('matches')
      .select('id, game_state, turn_expires_at, status')
      .eq('id', body.matchId)
      .single();

    if (matchErr || !match) {
      return NextResponse.json({ error: 'Mesa no encontrada.' }, { status: 404 });
    }

    if (match.status === 'completed' || match.status === 'finished') {
      return NextResponse.json({ error: 'La partida ya finalizó.' }, { status: 409 });
    }

    const publicState = match.game_state as TrucoGameState;

    // Reconstruir manos privadas desde match_hands solo en el servidor
    const { data: hands } = await supabase
      .from('match_hands')
      .select('player_id, cards, envido_points, has_flor')
      .eq('match_id', body.matchId);

    const hydratedPlayers = publicState.players.map((p) => {
      const h = hands?.find((row) => row.player_id === p.id);
      return h
        ? {
            ...p,
            hand: h.cards,
            envidoPoints: h.envido_points,
            hasFlor: h.has_flor,
          }
        : p;
    });

    const fullState: TrucoGameState = {
      ...publicState,
      players: hydratedPlayers,
    };

    const result = validateAndApplyServerAction({
      state: fullState,
      actorUserId: user.id,
      action: body.action,
      turnExpiresAt: match.turn_expires_at,
    });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const nextState = result.nextState;
    const sanitized = sanitizePublicGameState(nextState);
    const nextExpiry = new Date(Date.now() + 25000).toISOString();

    await supabase
      .from('matches')
      .update({
        game_state: sanitized,
        turn_expires_at: nextExpiry,
      })
      .eq('id', body.matchId);

    // Actualizar mano privada del jugador si cambió
    const actorSeat = nextState.players.find((p) => p.id === user.id);
    if (actorSeat) {
      await supabase
        .from('match_hands')
        .update({ cards: actorSeat.hand, updated_at: new Date().toISOString() })
        .eq('match_id', body.matchId)
        .eq('player_id', user.id);
    }

    // Liquidación automática de escrow al llegar a 30 puntos
    if (nextState.matchWinner) {
      await supabase.rpc('settle_match_escrow', {
        p_match_id: body.matchId,
        p_winner_key: nextState.matchWinner,
      });
    }

    return NextResponse.json({ ok: true, state: sanitized });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno del servidor.' },
      { status: 500 }
    );
  }
}
