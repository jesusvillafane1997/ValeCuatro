import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';
import { createInitialGameState } from '@/lib/truco/engine';
import { sanitizePublicGameState } from '@/lib/truco/server-engine';
import { GameMode, PoolTier } from '@/lib/truco/types';

export async function POST(req: NextRequest) {
  try {
    const { matchId } = (await req.json()) as { matchId: string };
    if (!matchId) {
      return NextResponse.json({ error: 'matchId requerido.' }, { status: 400 });
    }

    const supabase = await createServerSupabase();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json({ error: 'No autenticado.' }, { status: 401 });
    }

    const { data: match } = await supabase
      .from('matches')
      .select('id, mode, pool_tier, buy_in_ars, flor_enabled, pica_pica_enabled, game_state')
      .eq('id', matchId)
      .single();

    if (!match) {
      return NextResponse.json({ error: 'Mesa no encontrada.' }, { status: 404 });
    }

    // Si ya fue inicializada por otro jugador de la mesa, devolver estado actual
    if (match.game_state && Object.keys(match.game_state).length > 0) {
      return NextResponse.json({ ok: true, state: match.game_state });
    }

    const { data: seats } = await supabase
      .from('match_players')
      .select('user_id, seat_index, profiles(display_name)')
      .eq('match_id', matchId)
      .order('seat_index', { ascending: true });

    if (!seats || seats.length < 2) {
      return NextResponse.json({ error: 'Faltan jugadores para repartir.' }, { status: 409 });
    }

    const humanPlayers = seats.map((s: Record<string, unknown>) => ({
      id: s.user_id as string,
      name:
        ((s.profiles as { display_name?: string } | null)?.display_name) ||
        `Jugador ${(s.seat_index as number) + 1}`,
      seatIndex: s.seat_index as number,
    }));

    const fullState = createInitialGameState({
      matchId,
      mode: match.mode as GameMode,
      poolTier: match.pool_tier as PoolTier,
      buyInArs: Number(match.buy_in_ars),
      florEnabled: Boolean(match.flor_enabled),
      picaPicaEnabled: Boolean(match.pica_pica_enabled),
      humanPlayers,
      fillWithBots: false,
    });

    // Guardar manos privadas en match_hands (RLS estricto)
    for (const p of fullState.players) {
      await supabase.from('match_hands').upsert(
        {
          match_id: matchId,
          player_id: p.id,
          seat_index: p.seatIndex,
          cards: p.hand,
          envido_points: p.envidoPoints,
          has_flor: p.hasFlor,
        },
        { onConflict: 'match_id,player_id' }
      );
    }

    const sanitized = sanitizePublicGameState(fullState);
    await supabase
      .from('matches')
      .update({
        game_state: sanitized,
        turn_expires_at: new Date(Date.now() + 25000).toISOString(),
      })
      .eq('id', matchId);

    return NextResponse.json({ ok: true, state: sanitized });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Error inicializando mesa.' },
      { status: 500 }
    );
  }
}
