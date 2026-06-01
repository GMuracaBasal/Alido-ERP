import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://jwljqdxxbfftiapqfxzo.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_2PJkoRnnjjtMVG-sQofqTw_Hxb27ndH';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Session ID to distinguish our own saves
export const SESSION_ID = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const nowIso = () => new Date().toISOString();

const parseNum = (v: unknown): number => {
  const n = typeof v === 'string' ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
};

// --- Funciones de persistencia (app_data blob) ---

export async function loadFromSupabase(key: string, initial: any): Promise<any> {
  try {
    const { data, error } = await supabase
      .from('app_data')
      .select('value')
      .eq('key', key)
      .single();

    if (error || !data) return initial;
    return data.value ?? initial;
  } catch {
    return initial;
  }
}

export async function saveToSupabase(key: string, value: any): Promise<void> {
  try {
    await supabase
      .from('app_data')
      .upsert({ key, value, updated_by: SESSION_ID }, { onConflict: 'key' });
  } catch (err) {
    console.error(`Error guardando ${key} en Supabase:`, err);
  }
}

export async function loadAllData(keys: string[], initials: Record<string, any>): Promise<Record<string, any>> {
  try {
    const { data, error } = await supabase
      .from('app_data')
      .select('key, value')
      .in('key', keys);

    if (error || !data) {
      return initials;
    }

    const result: Record<string, any> = { ...initials };
    for (const row of data) {
      if (row.value !== null && row.value !== undefined) {
        result[row.key] = row.value;
      }
    }
    return result;
  } catch {
    return initials;
  }
}

// --- Sync: check for changes from other users ---
export async function checkForUpdates(since: string): Promise<{ key: string; value: any }[]> {
  try {
    const { data, error } = await supabase
      .from('app_data')
      .select('key, value, updated_at, updated_by')
      .gt('updated_at', since)
      .neq('updated_by', SESSION_ID);

    if (error || !data) return [];
    return data.map(row => ({ key: row.key, value: row.value }));
  } catch {
    return [];
  }
}

// --- Tesorería (tablas relacionales) ---

export type CuentaTesoreriaRow = {
  id: string;
  nombre: string;
  tipo: 'banco' | 'efectivo' | 'billetera' | 'otra';
  banco?: string;
  numeroCuenta?: string;
  moneda: 'ARS' | 'USD';
  observacion?: string;
  saldoInicial: number;
  fechaApertura: string;
  habilitada: boolean;
};

export type MedioPagoRow = {
  id: string;
  nombre: string;
  tipoBase: 'efectivo' | 'transferencia' | 'cheque' | 'billetera' | 'tarjeta' | 'otro';
  habilitado: boolean;
};

export type MovimientoTesoreriaRow = {
  id: string;
  cuentaId: string;
  fecha: string;
  medioPagoId?: string;
  origenTipo: string;
  origenId?: string;
  origenReferencia?: string;
  detalle?: string;
  contraparte?: string;
  debe: number;
  haber: number;
  transferenciaId?: string;
  esManual: boolean;
  motivo?: string;
  anulado: boolean;
  anuladoMotivo?: string;
  createdAt?: string;
};

export type TesoreriaBundle = {
  cuentas: CuentaTesoreriaRow[];
  medios: MedioPagoRow[];
  movimientos: MovimientoTesoreriaRow[];
  saldos: Record<string, number>;
};

function mapCuenta(r: any): CuentaTesoreriaRow {
  return {
    id: r.id,
    nombre: r.nombre,
    tipo: r.tipo,
    banco: r.banco ?? undefined,
    numeroCuenta: r.numero_cuenta ?? undefined,
    moneda: r.moneda,
    observacion: r.observacion ?? undefined,
    saldoInicial: parseNum(r.saldo_inicial),
    fechaApertura: r.fecha_apertura,
    habilitada: !!r.habilitada,
  };
}

function mapMedio(r: any): MedioPagoRow {
  return {
    id: r.id,
    nombre: r.nombre,
    tipoBase: r.tipo_base,
    habilitado: !!r.habilitado,
  };
}

function mapMovimiento(r: any): MovimientoTesoreriaRow {
  return {
    id: r.id,
    cuentaId: r.cuenta_id,
    fecha: r.fecha,
    medioPagoId: r.medio_pago_id ?? undefined,
    origenTipo: r.origen_tipo,
    origenId: r.origen_id ?? undefined,
    origenReferencia: r.origen_referencia ?? undefined,
    detalle: r.detalle ?? undefined,
    contraparte: r.contraparte ?? undefined,
    debe: parseNum(r.debe),
    haber: parseNum(r.haber),
    transferenciaId: r.transferencia_id ?? undefined,
    esManual: !!r.es_manual,
    motivo: r.motivo ?? undefined,
    anulado: !!r.anulado,
    anuladoMotivo: r.anulado_motivo ?? undefined,
    createdAt: r.created_at ?? undefined,
  };
}

export async function loadTesoreria(): Promise<TesoreriaBundle> {
  const empty: TesoreriaBundle = { cuentas: [], medios: [], movimientos: [], saldos: {} };
  try {
    const [cuentasRes, mediosRes, movsRes, saldosRes] = await Promise.all([
      supabase.from('tesoreria_cuentas').select('*').order('nombre'),
      supabase.from('tesoreria_medios_pago').select('*').order('nombre'),
      supabase.from('tesoreria_movimientos').select('*'),
      supabase.from('tesoreria_saldos').select('*'),
    ]);

    if (cuentasRes.error || mediosRes.error || movsRes.error || saldosRes.error) {
      console.error('Error cargando tesorería:', cuentasRes.error || mediosRes.error || movsRes.error || saldosRes.error);
      return empty;
    }

    const saldos: Record<string, number> = {};
    for (const row of saldosRes.data || []) {
      saldos[row.cuenta_id] = Math.round(parseNum(row.saldo) * 100) / 100;
    }

    return {
      cuentas: (cuentasRes.data || []).map(mapCuenta),
      medios: (mediosRes.data || []).map(mapMedio),
      movimientos: (movsRes.data || []).map(mapMovimiento),
      saldos,
    };
  } catch (err) {
    console.error('Error loadTesoreria:', err);
    return empty;
  }
}

export async function saveCuenta(cuenta: CuentaTesoreriaRow): Promise<CuentaTesoreriaRow | null> {
  const id = cuenta.id || crypto.randomUUID();
  const row = {
    id,
    nombre: cuenta.nombre,
    tipo: cuenta.tipo,
    banco: cuenta.banco || null,
    numero_cuenta: cuenta.numeroCuenta || null,
    moneda: cuenta.moneda,
    observacion: cuenta.observacion || null,
    saldo_inicial: cuenta.saldoInicial,
    fecha_apertura: cuenta.fechaApertura,
    habilitada: cuenta.habilitada,
    updated_by: SESSION_ID,
    updated_at: nowIso(),
  };
  const { data, error } = await supabase.from('tesoreria_cuentas').upsert(row).select().single();
  if (error) {
    console.error('saveCuenta:', error);
    return null;
  }
  return mapCuenta(data);
}

export async function saveMedioPago(medio: MedioPagoRow): Promise<MedioPagoRow | null> {
  const id = medio.id || crypto.randomUUID();
  const row = {
    id,
    nombre: medio.nombre,
    tipo_base: medio.tipoBase,
    habilitado: medio.habilitado,
    updated_by: SESSION_ID,
    updated_at: nowIso(),
  };
  const { data, error } = await supabase.from('tesoreria_medios_pago').upsert(row).select().single();
  if (error) {
    console.error('saveMedioPago:', error);
    return null;
  }
  return mapMedio(data);
}

export async function crearMovimientoManual(mov: {
  cuentaId: string;
  fecha: string;
  medioPagoId?: string;
  origenTipo: 'ajuste' | 'manual';
  detalle?: string;
  contraparte?: string;
  debe: number;
  haber: number;
  motivo: string;
}): Promise<MovimientoTesoreriaRow | null> {
  const row = {
    cuenta_id: mov.cuentaId,
    fecha: mov.fecha,
    medio_pago_id: mov.medioPagoId || null,
    origen_tipo: mov.origenTipo,
    detalle: mov.detalle || null,
    contraparte: mov.contraparte || null,
    debe: mov.debe,
    haber: mov.haber,
    es_manual: true,
    motivo: mov.motivo,
    updated_by: SESSION_ID,
    updated_at: nowIso(),
  };
  const { data, error } = await supabase.from('tesoreria_movimientos').insert(row).select().single();
  if (error) {
    console.error('crearMovimientoManual:', error);
    return null;
  }
  return mapMovimiento(data);
}

export async function anularMovimiento(id: string, motivo: string): Promise<boolean> {
  const { error } = await supabase
    .from('tesoreria_movimientos')
    .update({
      anulado: true,
      anulado_motivo: motivo,
      anulado_at: nowIso(),
      updated_by: SESSION_ID,
      updated_at: nowIso(),
    })
    .eq('id', id);
  if (error) {
    console.error('anularMovimiento:', error);
    return false;
  }
  return true;
}

export async function crearTransferencia(params: {
  fecha: string;
  origen: string;
  destino: string;
  monto: number;
  medio?: string;
  detalle?: string;
}): Promise<string | null> {
  const { data, error } = await supabase.rpc('tesoreria_crear_transferencia', {
    p_fecha: params.fecha,
    p_origen: params.origen,
    p_destino: params.destino,
    p_monto: params.monto,
    p_medio: params.medio || null,
    p_detalle: params.detalle || null,
    p_updated_by: SESSION_ID,
  });
  if (error) {
    console.error('crearTransferencia:', error);
    return null;
  }
  return data as string;
}

export async function anularTransferencia(id: string, motivo: string): Promise<boolean> {
  const { error } = await supabase.rpc('tesoreria_anular_transferencia', {
    p_id: id,
    p_motivo: motivo,
    p_updated_by: SESSION_ID,
  });
  if (error) {
    console.error('anularTransferencia:', error);
    return false;
  }
  return true;
}
