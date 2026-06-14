# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Alido ERP — internal management system for a food factory (Alido S.A.), built for Basal. React 19 + TypeScript + Vite + Tailwind v4. Persistence is Supabase. UI text and domain terms are in Spanish; keep them in Spanish.

## Commands

- `npm run dev` — start the dev server (Vite) on port 3000, host 0.0.0.0
- `npm run build` — production build to `dist/`
- `npm run preview` — serve the built app
- `npm run lint` — `tsc --noEmit`, the only check available. **Always run this after changes** before considering them done. There is no test suite.
- `npm run clean` — remove `dist/`

There is no linter/formatter beyond `tsc`. Match the surrounding code style.

## Architecture

This is a single-file application by design. Nearly all code lives in **`src/App.tsx` (~23,000 lines)**: every React component, every TypeScript `interface`/`type`, all `INITIAL_*` seed data, and all business logic. The big-picture structure:

- **`src/App.tsx`** — the entire app. Interfaces are defined around lines 1340–1940; the `App` component, data loading, sync, and per-key save effects live near the bottom (~line 21900+).
- **`src/supabaseClient.ts`** — the Supabase client and *all* persistence helpers. Two distinct persistence models live here (see below). The URL and anon key are hardcoded here.
- **`src/index.css`** — Tailwind plus custom `sleek-*` theme classes.
- **`src/main.tsx`** — React entry point only.
- **`scripts/*.mjs`** — one-off Supabase data-repair scripts (e.g. cleaning duplicate barcodes in a specific lote). Run with `node scripts/<file>.mjs [--dry-run]`. They hardcode the same Supabase credentials.
- **`patch-resumen.cjs`** — a one-off text-surgery patch against `App.tsx`; not part of the build.

### Persistence — two models

1. **Blob (key-value JSONB).** Most domain state is stored in a single Supabase table `app_data` (columns: `key`, `value` JSONB, `updated_by`, `updated_at`). Each top-level array of entities is one row keyed by an `alido_*` string (e.g. `alido_productos`, `alido_movimientos`, `alido_ventas`). The full key list is the `DATA_KEYS` array in `App.tsx` (~line 21940), paired with `INITIALS` (the `INITIAL_*` seeds). On startup `loadAllData` fetches all keys at once; a debounced (~800ms) effect saves changed keys with `saveToSupabase` and also mirrors them to `localStorage` as an offline cache.
2. **Relational (Tesorería only).** The treasury module uses real Supabase tables (`tesoreria_cuentas`, `tesoreria_medios_pago`, `tesoreria_movimientos`, `tesoreria_saldos`) and RPCs (`tesoreria_crear_transferencia`, `tesoreria_anular_transferencia`). These have dedicated typed helpers in `supabaseClient.ts`. Schema lives in `supabase_tesoreria_migration.sql`.

### Multi-user sync & data-loss protection

Multiple users share one Supabase instance. A `setInterval` polls `checkForUpdates(since)` (rows changed by a different `SESSION_ID`) and applies remote changes to local state. There is deliberate **data-loss protection** on both save and sync: for "critical" keys (`alido_lotes_etiquetados`, `alido_lotes_produccion`, `alido_lotes_despiece`, `alido_movimientos`, `alido_ventas`) and the `MAESTROS_KEYS`, an empty array is **never** written over or synced when a non-empty value was last known (tracked via `lastKnown*Ref`s). `alido_lotes_etiquetados` additionally uses a custom merge (`mergeLotesEtiquetados`) instead of overwrite. **Do not weaken or remove this protection**, and do not change the sync logic in `supabaseClient.ts` casually.

## Business rules (critical — from .cursorrules)

1. The destination warehouse (`almacén`) is set **only** from the Lotes section, **never** from Etiquetas.
2. Lote finalization happens **only** from Lotes (Producción and Despiece), **never** from Etiquetas.
3. Changing the warehouse of a finalized lote must generate transfer movements (exit from old + entry to new).
4. Lote states: `'Planificado' | 'En Proceso' | 'Finalizado' | 'Cerrado'`. Do **not** change a `Finalizado` lote back to another state when merely saving edits.
5. `Movimiento.origen` is one of: `'manual' | 'produccion' | 'despiece' | 'transferencia'`.
6. Insumos in production lotes are editable; the `fromReceta` field distinguishes recipe-derived insumos from manually added ones.
7. Stock is discounted **FEFO** (First Expired, First Out).
8. The home screen (INICIO) must **never** show monetary amounts — only operational quantities.

## Conventions

- **Modules** (tabs): INICIO, INVENTARIO, PRODUCCIÓN, VENTAS, EGRESOS, TESORERÍA, USUARIOS. Access is gated by `User.permisos`; roles are `'Administrador' | 'Operario'`.
- **Styling**: reuse existing Tailwind classes — `sleek-dark`, `sleek-accent`, `sleek-success`, `sleek-danger`, `sleek-warning`. Labels: `text-[10px] font-bold text-slate-400 uppercase tracking-widest`. Cards: `bg-white rounded shadow-sm border border-slate-100`.
- **Shared components**: use the existing `Modal`, `Badge` (variants success/warning/danger/info/default), and `SearchableSelect` rather than rolling new ones.
- **Number formatting**: use the existing `formatNum()` / `displayNum()` / `formatNumber()` helpers, not raw `toLocaleString`.
- **Dates**: use `safeFormat()` (wraps `date-fns`).
- Reuse existing TypeScript interfaces; don't introduce parallel shapes.

## Common pitfalls (from .cursorrules)

- Don't rename existing functions (a past bug replaced `handleFinalize` with `filteredLotes`).
- Don't leave JSX tags unclosed — easy to do in such a large file; `tsc --noEmit` will catch most of these.
- Don't change a `Finalizado` lote's state when saving.
- Don't modify the Supabase sync logic in `supabaseClient.ts`.

## Notes

- `vite.config.ts` injects `process.env.GEMINI_API_KEY` from the environment and aliases `@` to the repo root. HMR can be disabled via `DISABLE_HMR=true`. The `@google/genai` dependency is present but not currently wired into `App.tsx`.
- This project originated from an AI Studio app (see README).
