# Truco Cordobés — Online Multiplayer ARS

Aplicación web full-stack de **Truco Argentino** (Córdoba, Argentina) construida con **Next.js (App Router)**, **TypeScript**, **Tailwind CSS** y **Supabase** (Auth, PostgreSQL, Realtime, Storage).

## Características Principales

- **Motor de Truco Argentino (40 cartas)**: Jerarquía oficial (Ancho de Espadas, Ancho de Bastos, 7 de Espadas, 7 de Oro, Tres, Doses, Anchos falsos, Figuras, Sietes falsos, 6, 5, 4), Envido / Real Envido / Falta Envido, Truco / Retruco / Vale Cuatro, Flor / Contraflor / Contraflor al Resto, Parda oficial y tablero visual de **fósforos** (15 malas + 15 buenas).
- **Modos de Juego**:
  - **1v1 (Mano a Mano)**
  - **3v3 (Equipo / Pica-Pica)** con sub-duelos entre 5 y 25 puntos y **menú interactivo de Señas** visibles solo para compañeros.
  - **Gallo (6 Jugadores Todos contra Todos)** con tabla individual hasta 30 puntos.
  - **Bots IA de práctica** para probar cualquier modalidad al instante.
- **Pozos ARS y Greenlight Admin (`/admin`)**:
  - Tiers de entrada: `$10.000`, `$20.000`, `$50.000` y `$100.000 ARS`.
  - Modal de **Transferencia Bancaria** con Alias/CVU copiable, código `#TRC-XXXX` y subida de comprobante a Supabase Storage (`comprobantes`).
  - Sala de espera en tiempo real (`pending`) que desbloquea **"Jugar Ahora"** automáticamente vía Supabase Realtime cuando el operador presiona **Aprobar / Greenlight** en `/admin`.

## Configuración con Supabase

1. Copiá `.env.example` a `.env.local` y completá `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
2. Ejecutá la migración `supabase/migrations/20261116000001_truco_cordobes_schema.sql` en tu proyecto Supabase.
3. Ejecutá `supabase/seed.sql` y promovete como operador admin:
   ```sql
   UPDATE public.profiles SET is_admin = true WHERE username = 'tu_usuario';
   ```
4. Iniciá la app:
   ```bash
   npm run dev
   ```
