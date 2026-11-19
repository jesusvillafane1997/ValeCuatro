'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient, isSupabaseConfigured } from '@/lib/supabase/client';
import { ServerMatchAction } from './server-engine';
import { Card, SenaType, TrucoGameState } from './types';

export function usePvpMatch(params: {
  matchId: string | null;
  userId: string;
  team?: 'A' | 'B' | 'SOLO';
}) {
  const { matchId, userId, team } = params;
  const [publicState, setPublicState] = useState<TrucoGameState | null>(null);
  const [myCards, setMyCards] = useState<Card[]>([]);
  const [myEnvido, setMyEnvido] = useState(0);
  const [myFlor, setMyFlor] = useState(false);
  const [turnExpiresAt, setTurnExpiresAt] = useState<string | null>(null);
  const [teamSenas, setTeamSenas] = useState<Record<number, SenaType>>({});
  const [actionError, setActionError] = useState<string | null>(null);

  const supabaseReady = isSupabaseConfigured();

  useEffect(() => {
    if (!matchId || !supabaseReady) return;
    const supabase = createClient();

    // Carga inicial de estado público y mano privada
    supabase
      .from('matches')
      .select('game_state, turn_expires_at')
      .eq('id', matchId)
      .single()
      .then(({ data }) => {
        if (data?.game_state) setPublicState(data.game_state as TrucoGameState);
        if (data?.turn_expires_at) setTurnExpiresAt(data.turn_expires_at);
      });

    supabase
      .from('match_hands')
      .select('cards, envido_points, has_flor')
      .eq('match_id', matchId)
      .eq('player_id', userId)
      .single()
      .then(({ data }) => {
        if (data) {
          setMyCards((data.cards as Card[]) || []);
          setMyEnvido(data.envido_points || 0);
          setMyFlor(Boolean(data.has_flor));
        }
      });

    // Suscripción Realtime: estado público de la mesa
    const matchChannel = supabase
      .channel(`pvp-match-${matchId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'matches',
          filter: `id=eq.${matchId}`,
        },
        (payload) => {
          const row = payload.new as {
            game_state?: TrucoGameState;
            turn_expires_at?: string;
          };
          if (row.game_state) setPublicState(row.game_state);
          if (row.turn_expires_at) setTurnExpiresAt(row.turn_expires_at);
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'match_hands',
          filter: `player_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as {
            match_id?: string;
            cards?: Card[];
            envido_points?: number;
            has_flor?: boolean;
          };
          if (row.match_id === matchId) {
            setMyCards(row.cards || []);
            setMyEnvido(row.envido_points || 0);
            setMyFlor(Boolean(row.has_flor));
          }
        }
      )
      .subscribe();

    // Heartbeat cada 15s (ventana de reconexión de 45s)
    const hbInterval = setInterval(() => {
      supabase.rpc('player_heartbeat', { p_match_id: matchId }).then(() => {});
    }, 15000);

    return () => {
      clearInterval(hbInterval);
      supabase.removeChannel(matchChannel);
    };
  }, [matchId, userId, supabaseReady]);

  // Canal privado de Señas por equipo (3v3)
  useEffect(() => {
    if (!matchId || !team || team === 'SOLO' || !supabaseReady) return;
    const supabase = createClient();
    const senaChannel = supabase
      .channel(`match:${matchId}:team:${team}`)
      .on('broadcast', { event: 'sena' }, (payload) => {
        const { seatIndex, sena } = payload.payload as {
          seatIndex: number;
          sena: SenaType;
        };
        setTeamSenas((prev) => ({ ...prev, [seatIndex]: sena }));
        setTimeout(() => {
          setTeamSenas((prev) => {
            const copy = { ...prev };
            delete copy[seatIndex];
            return copy;
          });
        }, 3500);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(senaChannel);
    };
  }, [matchId, team, supabaseReady]);

  const sendAction = useCallback(
    async (action: ServerMatchAction) => {
      if (!matchId) return;
      setActionError(null);
      const res = await fetch('/api/match/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchId, action }),
      });
      const json = await res.json();
      if (!res.ok) {
        setActionError(json.error || 'Jugada rechazada por el servidor.');
      }
    },
    [matchId]
  );

  const broadcastTeamSena = useCallback(
    async (seatIndex: number, sena: SenaType) => {
      if (!matchId || !team || team === 'SOLO' || !supabaseReady) return;
      const supabase = createClient();
      await supabase.channel(`match:${matchId}:team:${team}`).send({
        type: 'broadcast',
        event: 'sena',
        payload: { seatIndex, sena },
      });
    },
    [matchId, team, supabaseReady]
  );

  return {
    publicState,
    myCards,
    myEnvido,
    myFlor,
    turnExpiresAt,
    teamSenas,
    actionError,
    sendAction,
    broadcastTeamSena,
  };
}
