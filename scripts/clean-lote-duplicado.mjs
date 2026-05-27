/**
 * Limpia duplicado de código de barras en un lote de etiquetado.
 * Uso: node scripts/clean-lote-duplicado.mjs <LOTE_NUM> [SUFFIX] [--dry-run]
 * Ej:  node scripts/clean-lote-duplicado.mjs EM-001-20260527-001 007 --dry-run
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://jwljqdxxbfftiapqfxzo.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2PJkoRnnjjtMVG-sQofqTw_Hxb27ndH';

const args = process.argv.slice(2).filter((a) => a !== '--dry-run');
const dryRun = process.argv.includes('--dry-run');
const LOTE_NUM = args[0];
const SUFFIX = args[1] || null;

if (!LOTE_NUM) {
  console.error('Uso: node scripts/clean-lote-duplicado.mjs <LOTE_NUM> [SUFFIX] [--dry-run]');
  process.exit(1);
}

const DUP_CODIGO = SUFFIX ? `${LOTE_NUM}-${String(SUFFIX).padStart(3, '0')}` : null;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const norm = (s) => (s || '').trim().toLowerCase();

const extraerSecuencial = (codigo) => {
  const parts = (codigo || '').split('-');
  const n = parseInt(parts[parts.length - 1], 10);
  return Number.isNaN(n) ? 0 : n;
};

const isEnStock = (e) => {
  if (e.anulado === true || e.anulado === 'true') return false;
  if (e.estado === 'baja' || e.estado === 'Baja' || e.estado === 'Vendido') return false;
  return e.estado === 'en_stock' || e.estado === 'EN STOCK' || !e.estado;
};

async function loadKey(key) {
  const { data, error } = await supabase.from('app_data').select('value').eq('key', key).single();
  if (error) throw new Error(`load ${key}: ${error.message}`);
  return data?.value ?? null;
}

async function saveKey(key, value) {
  const { error } = await supabase
    .from('app_data')
    .upsert({ key, value, updated_by: 'clean-lote-duplicado' }, { onConflict: 'key' });
  if (error) throw new Error(`save ${key}: ${error.message}`);
}

function findLoteEntry(lotesEtiquetados) {
  return lotesEtiquetados.find(
    (le) =>
      norm(le.loteId) === norm(LOTE_NUM) ||
      norm(le.loteNumero) === norm(LOTE_NUM) ||
      (le.envases || []).some((e) => DUP_CODIGO && norm(e.codigoBarras) === norm(DUP_CODIGO))
  );
}

function maxSecuencial(envases) {
  let max = 0;
  (envases || []).forEach((e) => {
    const s = extraerSecuencial(e.codigoBarras || e.codigo);
    if (s > max) max = s;
    const n = typeof e.numero === 'number' ? e.numero : parseInt(String(e.numero || ''), 10);
    if (!Number.isNaN(n) && n > max) max = n;
  });
  return max;
}

async function main() {
  const lotesEtiquetados = await loadKey('alido_lotes_etiquetados');
  if (!Array.isArray(lotesEtiquetados)) {
    console.error('alido_lotes_etiquetados vacío o inválido');
    process.exit(1);
  }

  const le = findLoteEntry(lotesEtiquetados);
  if (!le) {
    console.error('No se encontró entrada de etiquetado para', LOTE_NUM);
    process.exit(1);
  }

  const envases = le.envases || [];

  const byCode = new Map();
  for (const e of envases) {
    const c = norm(e.codigoBarras);
    if (!c) continue;
    if (!byCode.has(c)) byCode.set(c, []);
    byCode.get(c).push(e);
  }

  const duplicateGroups = DUP_CODIGO
    ? [[DUP_CODIGO, byCode.get(norm(DUP_CODIGO)) || []]]
    : [...byCode.entries()].filter(([, list]) => list.length > 1);

  console.log(`Lote: ${le.loteId} | envases: ${envases.length}`);

  if (duplicateGroups.length === 0 || duplicateGroups.every(([, l]) => l.length < 2)) {
    console.log('No hay duplicados que corregir.');
    process.exit(0);
  }

  let nextSeq = maxSecuencial(envases);
  const changes = [];

  for (const [codigo, dupes] of duplicateGroups) {
    if (dupes.length < 2) continue;
    console.log(`Duplicado ${codigo}: ${dupes.length} registros`);

    const sorted = [...dupes].sort(
      (a, b) => new Date(a.fechaHora || 0).getTime() - new Date(b.fechaHora || 0).getTime()
    );
    const keep = sorted.find((e) => !isEnStock(e)) || sorted[0];
    const toFix = sorted.filter((e) => e !== keep);

    for (const env of toFix) {
      nextSeq += 1;
      const newCodigo = `${LOTE_NUM}-${String(nextSeq).padStart(3, '0')}`;
      const oldCodigo = env.codigoBarras;
      env.codigoBarras = newCodigo;
      env.numero = nextSeq;
      changes.push({ oldCodigo, newCodigo, numero: nextSeq, estado: env.estado, fechaHora: env.fechaHora, keep: keep.codigoBarras });
    }
  }

  const active = envases.filter(isEnStock);
  le.pesoTotalEtiquetado = active.reduce((s, e) => s + (parseFloat(e.pesoNeto) || 0), 0);

  console.log('Cambios propuestos:');
  changes.forEach((c) =>
    console.log(`  Conservar ${c.keep} | Renumerar ${c.oldCodigo} -> ${c.newCodigo} (${c.estado})`)
  );

  let movimientos = await loadKey('alido_movimientos');
  let movsUpdated = 0;
  if (Array.isArray(movimientos)) {
    for (const ch of changes) {
      movimientos = movimientos.map((m) => {
        const obs = m.observaciones || '';
        let touched = false;
        let next = m;
        if (norm(obs).includes(norm(ch.oldCodigo)) || obs.includes(ch.oldCodigo)) {
          next = {
            ...next,
            observaciones: obs.replace(
              new RegExp(ch.oldCodigo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'),
              ch.newCodigo
            ),
          };
          touched = true;
        }
        if (touched) movsUpdated++;
        return next;
      });
    }
  }
  console.log('  Movimientos actualizados:', movsUpdated);

  if (dryRun) {
    console.log('\n--dry-run: no se guardó nada.');
    return;
  }

  await saveKey('alido_lotes_etiquetados', lotesEtiquetados);
  if (movsUpdated) await saveKey('alido_movimientos', movimientos);
  console.log('\nGuardado en Supabase. Recargá la app.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
