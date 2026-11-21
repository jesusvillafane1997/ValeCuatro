import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import {
  sanitizePublicGameState,
  ServerMatchAction,
  validateAndApplyServerAction,
} from '@/lib/truco/server-engine';
import { Card, TrucoGameState } from '@/lib/truco/types';

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

    const { data: ctx, error: ctxErr } = await supabase.rpc('server_get_match_context', {
      p_match_id: body.matchId,
    });

    if (ctxErr || !ctx) {
      return NextResponse.json(
        { error: ctxErr?.message || 'Mesa no encontrada.' },
        { status: 404 }
      );
    }

    const context = ctx as {
      status: string;
      game_state: TrucoGameState;
      turn_expires_at: string | null;
      hands: {
        player_id: string;
        cards: Card[];
        envido_points: number;
        has_flor: boolean;
      }[];
    };

    if (context.status === 'completed' || context.status === 'finished') {
      return NextResponse.json({ error: 'La partida ya finalizó.' }, { status: 409 });
    }

    const hydratedPlayers = context.game_state.players.map((p) => {
      const h = context.hands.find((row) => row.player_id === p.id);
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
      ...context.game_state,
      players: hydratedPlayers,
    };

    const result = validateAndApplyServerAction({
      state: fullState,
      actorUserId: user.id,
      action: body.action,
      turnExpiresAt: context.turn_expires_at,
    });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const nextState = result.nextState;
    const sanitized = sanitizePublicGameState(nextState);

    const updatedHands = nextState.players.map((p) => ({
      player_id: p.id,
      cards: p.hand,
      envido_points: p.envidoPoints,
      has_flor: p.hasFlor,
    }));

    const { error: commitErr } = await supabase.rpc('server_commit_match_action', {
      p_match_id: body.matchId,
      p_game_state: sanitized,
      p_hands: updatedHands,
      p_winner_key: nextState.matchWinner ?? null,
    });

    if (commitErr) {
      return NextResponse.json({ error: commitErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, state: sanitized });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error interno del servidor.' },
      { status: 500 }
    );
  }
}
