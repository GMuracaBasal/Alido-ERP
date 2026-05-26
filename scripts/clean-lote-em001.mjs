/**
 * Limpia duplicado de código de barras en lote EM-001-20260526-001.
 * Uso: node scripts/clean-lote-em001.mjs [--dry-run]
 */
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://jwljqdxxbfftiapqfxzo.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2PJkoRnnjjtMVG-sQofqTw_Hxb27ndH';

const LOTE_NUM = 'EM-001-20260526-001';
const DUP_CODIGO = 'em-001-20260526-001-020';
const dryRun = process.argv.includes('--dry-run');

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
    .upsert({ key, value, updated_by: 'clean-lote-em001' }, { onConflict: 'key' });
  if (error) throw new Error(`save ${key}: ${error.message}`);
}

function findLoteEntry(lotesEtiquetados) {
  return lotesEtiquetados.find(
    (le) =>
      norm(le.loteId) === norm(LOTE_NUM) ||
      norm(le.loteNumero) === norm(LOTE_NUM) ||
      le.loteId === lotesEtiquetados.find((x) =>
        (x.envases || []).some((e) => norm(e.codigoBarras) === norm(DUP_CODIGO))
      )?.loteId
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
  const dupes = envases.filter((e) => norm(e.codigoBarras) === norm(DUP_CODIGO));

  console.log(`Lote: ${le.loteId} | envases: ${envases.length} | duplicados ${DUP_CODIGO}: ${dupes.length}`);

  if (dupes.length < 2) {
    console.log('No hay duplicado de', DUP_CODIGO, '- nada que corregir.');
    // Still scan all barcodes in lot
    const byCode = new Map();
    for (const e of envases) {
      const c = norm(e.codigoBarras);
      if (!c) continue;
      if (!byCode.has(c)) byCode.set(c, []);
      byCode.get(c).push(e);
    }
    const allDupes = [...byCode.entries()].filter(([, list]) => list.length > 1);
    if (allDupes.length === 0) {
      process.exit(0);
    }
    console.log('Otros duplicados en el lote:', allDupes.map(([c, l]) => `${c} (${l.length})`));
    process.exit(0);
  }

  // Mantener el más antiguo en BAJA; renumerar el(s) restante(s) EN STOCK
  const sorted = [...dupes].sort(
    (a, b) => new Date(a.fechaHora || 0).getTime() - new Date(b.fechaHora || 0).getTime()
  );
  const keep = sorted.find((e) => !isEnStock(e)) || sorted[0];
  const toFix = sorted.filter((e) => e !== keep);

  let nextSeq = maxSecuencial(envases);
  const changes = [];

  for (const env of toFix) {
    nextSeq += 1;
    const newCodigo = `${LOTE_NUM}-${String(nextSeq).padStart(3, '0')}`;
    const oldCodigo = env.codigoBarras;
    env.codigoBarras = newCodigo;
    env.numero = nextSeq;
    changes.push({ oldCodigo, newCodigo, numero: nextSeq, estado: env.estado, fechaHora: env.fechaHora });
  }

  const active = envases.filter(isEnStock);
  le.pesoTotalEtiquetado = active.reduce((s, e) => s + (parseFloat(e.pesoNeto) || 0), 0);

  console.log('Cambios propuestos:');
  console.log('  Conservar:', keep.codigoBarras, keep.estado, keep.fechaHora);
  changes.forEach((c) => console.log('  Renumerar:', c.oldCodigo, '->', c.newCodigo, `(${c.estado})`));

  // Actualizar movimientos que referencian el código nuevo incorrecto
  let movimientos = await loadKey('alido_movimientos');
  let movsUpdated = 0;
  if (Array.isArray(movimientos)) {
    for (const ch of changes) {
      movimientos = movimientos.map((m) => {
        const obs = m.observaciones || '';
        const ref = m.referencia || '';
        let touched = false;
        let next = m;
        if (norm(obs).includes(norm(ch.oldCodigo)) || obs.includes(ch.oldCodigo)) {
          next = {
            ...next,
            observaciones: obs.replace(new RegExp(ch.oldCodigo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ch.newCodigo),
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
