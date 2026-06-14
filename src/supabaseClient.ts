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

export async function crearMovimientoCobro(mov: {
  cuentaId: string;
  fecha: string;
  debe: number;
  detalle?: string;
  contraparte?: string;
  origenId: string;
  origenReferencia: string;
}): Promise<MovimientoTesoreriaRow | null> {
  const row = {
    cuenta_id: mov.cuentaId,
    fecha: mov.fecha,
    origen_tipo: 'cobro',
    origen_id: mov.origenId,
    origen_referencia: mov.origenReferencia,
    detalle: mov.detalle || null,
    contraparte: mov.contraparte || null,
    debe: mov.debe,
    haber: 0,
    es_manual: false,
    updated_by: SESSION_ID,
    updated_at: nowIso(),
  };
  const { data, error } = await supabase.from('tesoreria_movimientos').insert(row).select().single();
  if (error) {
    console.error('crearMovimientoCobro:', error);
    return null;
  }
  return mapMovimiento(data);
}

export async function anularMovimientosCobroDeVenta(ventaId: string): Promise<boolean> {
  const { error } = await supabase
    .from('tesoreria_movimientos')
    .update({
      anulado: true,
      anulado_motivo: 'Regenerado por edición de venta',
      anulado_at: nowIso(),
      updated_by: SESSION_ID,
      updated_at: nowIso(),
    })
    .eq('origen_tipo', 'cobro')
    .eq('origen_id', ventaId)
    .eq('anulado', false);
  if (error) {
    console.error('anularMovimientosCobroDeVenta:', error);
    return false;
  }
  return true;
}

export async function crearMovimientoPago(mov: {
  cuentaId: string;
  fecha: string;
  haber: number;
  detalle?: string;
  contraparte?: string;
  origenId: string;
  origenReferencia: string;
}): Promise<MovimientoTesoreriaRow | null> {
  const row = {
    cuenta_id: mov.cuentaId,
    fecha: mov.fecha,
    origen_tipo: 'pago',
    origen_id: mov.origenId,
    origen_referencia: mov.origenReferencia,
    detalle: mov.detalle || null,
    contraparte: mov.contraparte || null,
    debe: 0,
    haber: mov.haber,
    es_manual: false,
    updated_by: SESSION_ID,
    updated_at: nowIso(),
  };
  const { data, error } = await supabase.from('tesoreria_movimientos').insert(row).select().single();
  if (error) {
    console.error('crearMovimientoPago:', error);
    return null;
  }
  return mapMovimiento(data);
}

export async function anularMovimientosPago(origenId: string): Promise<boolean> {
  const { error } = await supabase
    .from('tesoreria_movimientos')
    .update({
      anulado: true,
      anulado_motivo: 'Regenerado por edición de pago',
      anulado_at: nowIso(),
      updated_by: SESSION_ID,
      updated_at: nowIso(),
    })
    .eq('origen_tipo', 'pago')
    .eq('origen_id', origenId)
    .eq('anulado', false);
  if (error) {
    console.error('anularMovimientosPago:', error);
    return false;
  }
  return true;
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

// --- Cheques (tablas relacionales) ---

export type ChequeRecibidoRow = {
  id: string;
  fechaRecepcion: string;
  fechaCobro: string;
  originario?: string;
  recibidoDe?: string;
  banco: string;
  numero?: string;
  monto: number;
  tipo: 'fisico' | 'echeq';
  estado: 'no_entregado' | 'en_cartera' | 'depositado' | 'acreditado' | 'endosado' | 'rechazado';
  endosadoA?: string;
  fechaEndoso?: string;
  cuentaDestinoId?: string;
  movimientoId?: string;
  origenTipo?: string;
  origenId?: string;
  comentario?: string;
  anulado: boolean;
  createdAt?: string;
};

export type ChequeEmitidoRow = {
  id: string;
  fechaEmision: string;
  fechaPago: string;
  beneficiario?: string;
  cuit?: string;
  banco: string;
  numero?: string;
  monto: number;
  tipo: 'fisico' | 'echeq';
  estado: 'no_entregado' | 'pendiente' | 'debitado' | 'rechazado' | 'anulado';
  cuentaOrigenId?: string;
  movimientoId?: string;
  origenTipo?: string;
  origenId?: string;
  chequeRecibidoId?: string;
  comentario?: string;
  anulado: boolean;
  createdAt?: string;
};

export type ChequesBundle = {
  recibidos: ChequeRecibidoRow[];
  emitidos: ChequeEmitidoRow[];
};

function mapChequeRecibido(r: any): ChequeRecibidoRow {
  return {
    id: r.id,
    fechaRecepcion: r.fecha_recepcion,
    fechaCobro: r.fecha_cobro,
    originario: r.originario ?? undefined,
    recibidoDe: r.recibido_de ?? undefined,
    banco: r.banco,
    numero: r.numero ?? undefined,
    monto: parseNum(r.monto),
    tipo: r.tipo,
    estado: r.estado,
    endosadoA: r.endosado_a ?? undefined,
    fechaEndoso: r.fecha_endoso ?? undefined,
    cuentaDestinoId: r.cuenta_destino_id ?? undefined,
    movimientoId: r.movimiento_id ?? undefined,
    origenTipo: r.origen_tipo ?? undefined,
    origenId: r.origen_id ?? undefined,
    comentario: r.comentario ?? undefined,
    anulado: !!r.anulado,
    createdAt: r.created_at ?? undefined,
  };
}

function mapChequeEmitido(r: any): ChequeEmitidoRow {
  return {
    id: r.id,
    fechaEmision: r.fecha_emision,
    fechaPago: r.fecha_pago,
    beneficiario: r.beneficiario ?? undefined,
    cuit: r.cuit ?? undefined,
    banco: r.banco,
    numero: r.numero ?? undefined,
    monto: parseNum(r.monto),
    tipo: r.tipo,
    estado: r.estado,
    cuentaOrigenId: r.cuenta_origen_id ?? undefined,
    movimientoId: r.movimiento_id ?? undefined,
    origenTipo: r.origen_tipo ?? undefined,
    origenId: r.origen_id ?? undefined,
    chequeRecibidoId: r.cheque_recibido_id ?? undefined,
    comentario: r.comentario ?? undefined,
    anulado: !!r.anulado,
    createdAt: r.created_at ?? undefined,
  };
}

export async function loadCheques(): Promise<ChequesBundle> {
  const empty: ChequesBundle = { recibidos: [], emitidos: [] };
  try {
    const [recRes, emiRes] = await Promise.all([
      supabase.from('cheques_recibidos').select('*').eq('anulado', false).order('fecha_cobro', { ascending: true }),
      supabase.from('cheques_emitidos').select('*').eq('anulado', false).order('fecha_pago', { ascending: true }),
    ]);

    if (recRes.error || emiRes.error) {
      console.error('Error cargando cheques:', recRes.error || emiRes.error);
      return empty;
    }

    return {
      recibidos: (recRes.data || []).map(mapChequeRecibido),
      emitidos: (emiRes.data || []).map(mapChequeEmitido),
    };
  } catch (err) {
    console.error('Error loadCheques:', err);
    return empty;
  }
}

export async function saveChequeRecibido(ch: ChequeRecibidoRow): Promise<ChequeRecibidoRow | null> {
  const row: Record<string, any> = {
    fecha_recepcion: ch.fechaRecepcion,
    fecha_cobro: ch.fechaCobro,
    originario: ch.originario || null,
    recibido_de: ch.recibidoDe || null,
    banco: ch.banco,
    numero: ch.numero || null,
    monto: ch.monto,
    tipo: ch.tipo,
    estado: ch.estado,
    endosado_a: ch.endosadoA || null,
    fecha_endoso: ch.fechaEndoso || null,
    cuenta_destino_id: ch.cuentaDestinoId || null,
    movimiento_id: ch.movimientoId || null,
    origen_tipo: ch.origenTipo || null,
    origen_id: ch.origenId || null,
    comentario: ch.comentario || null,
    anulado: ch.anulado,
    updated_by: SESSION_ID,
    updated_at: nowIso(),
  };
  if (ch.id) row.id = ch.id;
  const { data, error } = await supabase.from('cheques_recibidos').upsert(row).select().single();
  if (error) {
    console.error('saveChequeRecibido:', error);
    return null;
  }
  return mapChequeRecibido(data);
}

export async function saveChequeEmitido(ch: ChequeEmitidoRow): Promise<ChequeEmitidoRow | null> {
  const row: Record<string, any> = {
    fecha_emision: ch.fechaEmision,
    fecha_pago: ch.fechaPago,
    beneficiario: ch.beneficiario || null,
    cuit: ch.cuit || null,
    banco: ch.banco,
    numero: ch.numero || null,
    monto: ch.monto,
    tipo: ch.tipo,
    estado: ch.estado,
    cuenta_origen_id: ch.cuentaOrigenId || null,
    movimiento_id: ch.movimientoId || null,
    origen_tipo: ch.origenTipo || null,
    origen_id: ch.origenId || null,
    cheque_recibido_id: ch.chequeRecibidoId || null,
    comentario: ch.comentario || null,
    anulado: ch.anulado,
    updated_by: SESSION_ID,
    updated_at: nowIso(),
  };
  if (ch.id) row.id = ch.id;
  const { data, error } = await supabase.from('cheques_emitidos').upsert(row).select().single();
  if (error) {
    console.error('saveChequeEmitido:', error);
    return null;
  }
  return mapChequeEmitido(data);
}

export async function cambiarEstadoChequeRecibido(
  id: string,
  nuevoEstado: ChequeRecibidoRow['estado'],
  extra?: { endosadoA?: string; fechaEndoso?: string }
): Promise<boolean> {
  const row: Record<string, any> = {
    estado: nuevoEstado,
    updated_by: SESSION_ID,
    updated_at: nowIso(),
  };
  if (extra?.endosadoA !== undefined) row.endosado_a = extra.endosadoA || null;
  if (extra?.fechaEndoso !== undefined) row.fecha_endoso = extra.fechaEndoso || null;
  const { error } = await supabase.from('cheques_recibidos').update(row).eq('id', id);
  if (error) {
    console.error('cambiarEstadoChequeRecibido:', error);
    return false;
  }
  return true;
}

export async function cambiarEstadoChequeEmitido(
  id: string,
  nuevoEstado: ChequeEmitidoRow['estado']
): Promise<boolean> {
  const { error } = await supabase
    .from('cheques_emitidos')
    .update({ estado: nuevoEstado, updated_by: SESSION_ID, updated_at: nowIso() })
    .eq('id', id);
  if (error) {
    console.error('cambiarEstadoChequeEmitido:', error);
    return false;
  }
  return true;
}

export async function endosarChequeRecibido(params: {
  recibido: ChequeRecibidoRow;
  endosadoA: string;
  fechaEndoso: string;
}): Promise<boolean> {
  const { recibido, endosadoA, fechaEndoso } = params;
  const okEstado = await cambiarEstadoChequeRecibido(recibido.id, 'endosado', { endosadoA, fechaEndoso });
  if (!okEstado) return false;

  const emitido = await saveChequeEmitido({
    id: '',
    fechaEmision: fechaEndoso,
    fechaPago: recibido.fechaCobro,
    beneficiario: endosadoA,
    banco: recibido.banco,
    numero: recibido.numero,
    monto: recibido.monto,
    tipo: recibido.tipo,
    estado: 'pendiente',
    origenTipo: 'endoso',
    chequeRecibidoId: recibido.id,
    anulado: false,
  });
  if (!emitido) {
    // revertir el estado del recibido si no se pudo crear el emitido
    await cambiarEstadoChequeRecibido(recibido.id, recibido.estado, {
      endosadoA: recibido.endosadoA || '',
      fechaEndoso: recibido.fechaEndoso || '',
    });
    return false;
  }
  return true;
}

export async function anularChequeRecibido(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('cheques_recibidos')
    .update({ anulado: true, updated_by: SESSION_ID, updated_at: nowIso() })
    .eq('id', id);
  if (error) {
    console.error('anularChequeRecibido:', error);
    return false;
  }
  return true;
}

export async function anularChequeEmitido(id: string): Promise<boolean> {
  const { error } = await supabase
    .from('cheques_emitidos')
    .update({ anulado: true, updated_by: SESSION_ID, updated_at: nowIso() })
    .eq('id', id);
  if (error) {
    console.error('anularChequeEmitido:', error);
    return false;
  }
  return true;
}
