export function formatARS(amount: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(amount);
}

export function generateReferenceCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return `#TRC-${code}`;
}

export const POOL_TIERS = [
  {
    id: '10000' as const,
    amount: 10000,
    label: '$10.000 ARS',
    badge: 'Para calentar motores',
    description: 'Ideal para entrar en ritmo y tantear la mesa.',
  },
  {
    id: '20000' as const,
    amount: 20000,
    label: '$20.000 ARS',
    badge: 'Clásico de barrio',
    description: 'Pozo parejo, lindo para un mano a mano o 3v3.',
  },
  {
    id: '50000' as const,
    amount: 50000,
    label: '$50.000 ARS',
    badge: 'Mesa picante',
    description: 'Acá ya se juega en serio y nadie regala nada.',
  },
  {
    id: '100000' as const,
    amount: 100000,
    label: '$100.000 ARS',
    badge: 'Para los que no arrugan',
    description: 'Pozo mayor — pura sangre fría en cada envido.',
  },
];
