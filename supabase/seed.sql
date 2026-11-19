-- ============================================================================
-- Seed inicial para Truco Cordobés
-- ============================================================================
INSERT INTO public.app_settings (id, bank_alias, bank_cvu, bank_holder, commission_rate)
VALUES (1, 'TRUCO.CBA.POZO', '0000003100084920192837', 'Truco Cordobés S.R.L.', 0.100)
ON CONFLICT (id) DO UPDATE SET
  bank_alias = EXCLUDED.bank_alias,
  bank_cvu = EXCLUDED.bank_cvu,
  bank_holder = EXCLUDED.bank_holder;

-- Para promover un usuario existente a administrador, ejecutá en Supabase SQL Editor:
-- UPDATE public.profiles SET is_admin = true WHERE username = 'tu_usuario';
