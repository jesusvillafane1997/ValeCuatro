import { GameMode, PoolTier } from './truco/types';

export interface TransferRequestRecord {
  id: string;
  user_id: string;
  user_name: string;
  amount_ars: number;
  pool_tier: PoolTier;
  game_mode: GameMode;
  reference_code: string;
  receipt_url: string;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string | null;
  match_id?: string | null;
  created_at: string;
}

const STORAGE_KEY = 'truco_cba_demo_transfers';
const CHANNEL_NAME = 'truco_cba_realtime_demo';

export function getDemoTransfers(): TransferRequestRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveDemoTransfer(req: TransferRequestRecord) {
  if (typeof window === 'undefined') return;
  const list = getDemoTransfers();
  const next = [req, ...list.filter((r) => r.id !== req.id)];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  try {
    const ch = new BroadcastChannel(CHANNEL_NAME);
    ch.postMessage({ type: 'transfers_updated', data: next });
    ch.close();
  } catch {
    // ignore
  }
}

export function updateDemoTransferStatus(
  id: string,
  status: 'approved' | 'rejected',
  rejectionReason?: string
) {
  const list = getDemoTransfers();
  const next = list.map((r) =>
    r.id === id
      ? {
          ...r,
          status,
          rejection_reason: rejectionReason ?? null,
          match_id: status === 'approved' ? `match-${id.slice(0, 6)}` : null,
        }
      : r
  );
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  try {
    const ch = new BroadcastChannel(CHANNEL_NAME);
    ch.postMessage({ type: 'transfers_updated', data: next });
    ch.close();
  } catch {
    // ignore
  }
  return next;
}

export function subscribeDemoTransfers(cb: (list: TransferRequestRecord[]) => void) {
  if (typeof window === 'undefined') return () => {};
  const ch = new BroadcastChannel(CHANNEL_NAME);
  ch.onmessage = (ev) => {
    if (ev.data?.type === 'transfers_updated') {
      cb(ev.data.data);
    }
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) {
      cb(getDemoTransfers());
    }
  };
  window.addEventListener('storage', onStorage);
  return () => {
    ch.close();
    window.removeEventListener('storage', onStorage);
  };
}
