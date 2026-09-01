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

/** Movimientos de tesorería vinculados a acreditación/débito/impuestos de un cheque (origen_id = id cheque). */
export async function crearMovimientoCheque(mov: {
  cuentaId: string;
  fecha: string;
  debe: number;
  haber: number;
  origenTipo: 'cheque_acred' | 'cheque_deb' | 'cheque_imp';
  origenId: string;
  detalle?: string;
  contraparte?: string;
  planCuentaId?: string;
}): Promise<MovimientoTesoreriaRow | null> {
  const dbOrigenTipo = mov.origenTipo === 'cheque_acred' ? 'cobro' : 'pago';
  const row: Record<string, any> = {
    cuenta_id: mov.cuentaId,
    fecha: mov.fecha,
    origen_tipo: dbOrigenTipo,
    origen_id: mov.origenId,
    origen_referencia:
      mov.origenTipo === 'cheque_imp' && mov.planCuentaId
        ? mov.planCuentaId
        : mov.origenTipo,
    detalle: mov.detalle || null,
    contraparte: mov.contraparte || null,
    debe: mov.debe,
    haber: mov.haber,
    es_manual: false,
    updated_by: SESSION_ID,
    updated_at: nowIso(),
  };
  const { data, error } = await supabase.from('tesoreria_movimientos').insert(row).select().single();
  if (error) {
    console.error('crearMovimientoCheque:', error);
    return null;
  }
  return mapMovimiento(data);
}

export async function anularMovimientosCheque(chequeId: string, motivo: string): Promise<boolean> {
  const { error } = await supabase
    .from('tesoreria_movimientos')
    .update({
      anulado: true,
      anulado_motivo: motivo,
      anulado_at: nowIso(),
      updated_by: SESSION_ID,
      updated_at: nowIso(),
    })
    .eq('origen_id', chequeId)
    .eq('anulado', false);
  if (error) {
    console.error('anularMovimientosCheque:', error);
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
  origenId?: string;
}): Promise<boolean> {
  const { recibido, endosadoA, fechaEndoso, origenId } = params;
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
    origenId: origenId,
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

// Anula (sin borrar) todos los cheques generados por un origen (cobro/pago de cuenta corriente),
// para evitar duplicados al editar o anular el movimiento. Si un emitido es un endoso, revierte
// el cheque recibido vinculado de nuevo a 'en_cartera'.
export async function anularChequesPorOrigen(origenId: string): Promise<boolean> {
  if (!origenId) return false;
  try {
    const { data: emitidos } = await supabase
      .from('cheques_emitidos')
      .select('id, cheque_recibido_id')
      .eq('origen_id', origenId)
      .eq('anulado', false);

    await supabase
      .from('cheques_emitidos')
      .update({ anulado: true, estado: 'anulado', updated_by: SESSION_ID, updated_at: nowIso() })
      .eq('origen_id', origenId)
      .eq('anulado', false);

    for (const em of emitidos || []) {
      if (em.cheque_recibido_id) {
        await supabase
          .from('cheques_recibidos')
          .update({ estado: 'en_cartera', endosado_a: null, fecha_endoso: null, updated_by: SESSION_ID, updated_at: nowIso() })
          .eq('id', em.cheque_recibido_id)
          .eq('estado', 'endosado');
      }
    }

    await supabase
      .from('cheques_recibidos')
      .update({ anulado: true, updated_by: SESSION_ID, updated_at: nowIso() })
      .eq('origen_id', origenId)
      .eq('anulado', false);

    return true;
  } catch (err) {
    console.error('anularChequesPorOrigen:', err);
    return false;
  }
}

// ============================================================
// EGRESOS — tablas relacionales
// ============================================================

// --- Tipos ---

export type EgresoItemRow = {
  id: string;
  productoId?: string;
  cantidad?: number;
  precioUnitario?: number;
  loteProveedor?: string;
  numeroLoteGenerado?: string;
  fechaVencimiento?: string;
  almacenDestinoId?: string;
  concepto?: string;
  monto?: number;
  subtotal: number;
  orden: number;
};

export type EgresoRow = {
  id: string;
  comprobante: string;
  fecha: string;
  fechaCreacion: string;
  fechaVencimientoPago?: string;
  proveedorId?: string;
  tipoEgresoId: string;
  cuentaContableId: string;
  nroFacturaProveedor?: string;
  neto: number;
  tipoIva: string;
  iva: number;
  total: number;
  estado: 'Borrador' | 'Confirmado' | 'Anulado';
  estadoPago: 'Pendiente' | 'Parcial' | 'Pagado';
  usuario: string;
  observaciones?: string;
  editHistory?: { fecha: string; usuario: string; detalle: string }[];
  items: EgresoItemRow[];
};

export type PagoProveedorRow = {
  id: string;
  comprobante: string;
  proveedorId: string;
  egresoId?: string;
  fecha: string;
  monto: number;
  metodo: string;
  tipoMovimiento: 'Pago' | 'Ajuste';
  referencia?: string;
  observaciones?: string;
  cuentaTesoreriaId?: string;
  valores?: any[];
  anulado: boolean;
  anuladoAt?: string;
};

// --- Mappers: fila SQL → objeto TypeScript ---

function mapEgresoItem(r: any, idx: number): EgresoItemRow {
  return {
    id: r.id,
    productoId: r.producto_id ?? undefined,
    cantidad: r.cantidad != null ? Number(r.cantidad) : undefined,
    precioUnitario: r.precio_unitario != null ? Number(r.precio_unitario) : undefined,
    loteProveedor: r.lote_proveedor ?? undefined,
    numeroLoteGenerado: r.numero_lote_generado ?? undefined,
    fechaVencimiento: r.fecha_vencimiento ?? undefined,
    almacenDestinoId: r.almacen_destino_id ?? undefined,
    concepto: r.concepto ?? undefined,
    monto: r.monto != null ? Number(r.monto) : undefined,
    subtotal: Number(r.subtotal ?? 0),
    orden: r.orden ?? idx,
  };
}

function mapEgreso(r: any, items: EgresoItemRow[]): EgresoRow {
  return {
    id: r.id,
    comprobante: r.comprobante,
    fecha: r.fecha,
    fechaCreacion: r.fecha_creacion,
    fechaVencimientoPago: r.fecha_vencimiento_pago ?? undefined,
    proveedorId: r.proveedor_id ?? undefined,
    tipoEgresoId: r.tipo_egreso_id,
    cuentaContableId: r.cuenta_contable_id,
    nroFacturaProveedor: r.nro_factura_proveedor ?? undefined,
    neto: Number(r.neto ?? 0),
    tipoIva: r.tipo_iva ?? 'Exento / No aplica',
    iva: Number(r.iva ?? 0),
    total: Number(r.total ?? 0),
    estado: r.estado ?? 'Borrador',
    estadoPago: r.estado_pago ?? 'Pendiente',
    usuario: r.usuario ?? '',
    observaciones: r.observaciones ?? undefined,
    editHistory: r.edit_history ?? undefined,
    items,
  };
}

function mapPagoProveedor(r: any): PagoProveedorRow {
  return {
    id: r.id,
    comprobante: r.comprobante,
    proveedorId: r.proveedor_id,
    egresoId: r.egreso_id ?? undefined,
    fecha: r.fecha,
    monto: Number(r.monto ?? 0),
    metodo: r.metodo ?? 'Efectivo',
    tipoMovimiento: r.tipo_movimiento ?? 'Pago',
    referencia: r.referencia ?? undefined,
    observaciones: r.observaciones ?? undefined,
    cuentaTesoreriaId: r.cuenta_tesoreria_id ?? undefined,
    valores: Array.isArray(r.valores) ? r.valores : undefined,
    anulado: !!r.anulado,
    anuladoAt: r.anulado_at ?? undefined,
  };
}

// --- Carga completa ---

export async function loadEgresos(): Promise<EgresoRow[]> {
  try {
    const [egresosRes, itemsRes] = await Promise.all([
      supabase
        .from('egresos')
        .select('*')
        .order('fecha', { ascending: false }),
      supabase
        .from('egreso_items')
        .select('*')
        .order('orden', { ascending: true }),
    ]);

    if (egresosRes.error || itemsRes.error) {
      console.error('loadEgresos error:', egresosRes.error || itemsRes.error);
      return [];
    }

    const itemsByEgreso: Record<string, EgresoItemRow[]> = {};
    for (const [idx, item] of (itemsRes.data || []).entries()) {
      const eId = item.egreso_id;
      if (!itemsByEgreso[eId]) itemsByEgreso[eId] = [];
      itemsByEgreso[eId].push(mapEgresoItem(item, idx));
    }

    return (egresosRes.data || []).map((r) =>
      mapEgreso(r, itemsByEgreso[r.id] || [])
    );
  } catch (err) {
    console.error('loadEgresos exception:', err);
    return [];
  }
}

export async function loadPagosProveedores(): Promise<PagoProveedorRow[]> {
  try {
    const { data, error } = await supabase
      .from('pagos_proveedores')
      .select('*')
      .order('fecha', { ascending: false });

    if (error) {
      console.error('loadPagosProveedores error:', error);
      return [];
    }
    return (data || []).map(mapPagoProveedor);
  } catch (err) {
    console.error('loadPagosProveedores exception:', err);
    return [];
  }
}

// --- Guardar egreso (upsert egreso + sus items) ---

export async function saveEgresoRelacional(egreso: EgresoRow): Promise<boolean> {
  try {
    const now = new Date().toISOString();

    // 1. Upsert del egreso principal
    const { error: eErr } = await supabase
      .from('egresos')
      .upsert({
        id: egreso.id,
        comprobante: egreso.comprobante,
        fecha: egreso.fecha,
        fecha_creacion: egreso.fechaCreacion || now,
        fecha_vencimiento_pago: egreso.fechaVencimientoPago || null,
        proveedor_id: egreso.proveedorId || null,
        tipo_egreso_id: egreso.tipoEgresoId,
        cuenta_contable_id: egreso.cuentaContableId,
        nro_factura_proveedor: egreso.nroFacturaProveedor || null,
        neto: egreso.neto,
        tipo_iva: egreso.tipoIva,
        iva: egreso.iva,
        total: egreso.total,
        estado: egreso.estado,
        estado_pago: egreso.estadoPago,
        usuario: egreso.usuario,
        observaciones: egreso.observaciones || null,
        edit_history: egreso.editHistory || null,
        anulado: egreso.estado === 'Anulado',
        updated_by: SESSION_ID,
        updated_at: now,
      }, { onConflict: 'id' });

    if (eErr) {
      console.error('saveEgresoRelacional - egreso error:', eErr);
      return false;
    }

    // 2. Eliminar items viejos y reinsertar los actuales
    // (estrategia simple: delete + insert, segura para colecciones pequeñas)
    await supabase.from('egreso_items').delete().eq('egreso_id', egreso.id);

    if (egreso.items && egreso.items.length > 0) {
      const rows = egreso.items.map((item, idx) => ({
        id: item.id,
        egreso_id: egreso.id,
        producto_id: item.productoId || null,
        cantidad: item.cantidad ?? null,
        precio_unitario: item.precioUnitario ?? null,
        subtotal: item.subtotal,
        lote_proveedor: item.loteProveedor || null,
        numero_lote_generado: item.numeroLoteGenerado || null,
        fecha_vencimiento: item.fechaVencimiento || null,
        almacen_destino_id: item.almacenDestinoId || null,
        concepto: item.concepto || null,
        monto: item.monto ?? null,
        orden: item.orden ?? idx,
      }));

      const { error: iErr } = await supabase
        .from('egreso_items')
        .insert(rows);

      if (iErr) {
        console.error('saveEgresoRelacional - items error:', iErr);
        return false;
      }
    }

    return true;
  } catch (err) {
    console.error('saveEgresoRelacional exception:', err);
    return false;
  }
}

// --- Guardar pago a proveedor ---

export async function savePagoProveedorRelacional(
  pago: PagoProveedorRow
): Promise<boolean> {
  try {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('pagos_proveedores')
      .upsert({
        id: pago.id,
        comprobante: pago.comprobante,
        proveedor_id: pago.proveedorId,
        egreso_id: pago.egresoId || null,
        fecha: pago.fecha,
        monto: pago.monto,
        metodo: pago.metodo,
        tipo_movimiento: pago.tipoMovimiento,
        referencia: pago.referencia || null,
        observaciones: pago.observaciones || null,
        cuenta_tesoreria_id: pago.cuentaTesoreriaId || null,
        valores: pago.valores || null,
        anulado: pago.anulado,
        anulado_at: pago.anuladoAt || null,
        updated_by: SESSION_ID,
        updated_at: now,
      }, { onConflict: 'id' });

    if (error) {
      console.error('savePagoProveedorRelacional error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('savePagoProveedorRelacional exception:', err);
    return false;
  }
}

// --- Anular egreso ---

export async function anularEgresoRelacional(
  id: string,
  usuarioNombre: string
): Promise<boolean> {
  try {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('egresos')
      .update({
        estado: 'Anulado',
        anulado: true,
        anulado_at: now,
        anulado_por: usuarioNombre,
        updated_by: SESSION_ID,
        updated_at: now,
      })
      .eq('id', id);

    if (error) {
      console.error('anularEgresoRelacional error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('anularEgresoRelacional exception:', err);
    return false;
  }
}

// --- Anular pago a proveedor ---

export async function anularPagoProveedorRelacional(
  id: string
): Promise<boolean> {
  try {
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('pagos_proveedores')
      .update({
        anulado: true,
        anulado_at: now,
        updated_by: SESSION_ID,
        updated_at: now,
      })
      .eq('id', id);

    if (error) {
      console.error('anularPagoProveedorRelacional error:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('anularPagoProveedorRelacional exception:', err);
    return false;
  }
}

// ============================================================
// RRHH — tablas relacionales
// ============================================================

export type RhEmpleadoRow = {
  id: string;
  nombre: string;
  dni?: string;
  cuil?: string;
  fechaIngreso: string;
  puesto?: string;
  area?: string;
  tipoContrato: string;
  horarioEntrada?: string;
  horarioSalida?: string;
  sueldoBasico: number;
  cbu?: string;
  telefono?: string;
  direccion?: string;
  estado: 'activo' | 'inactivo';
  fechaBaja?: string;
  observaciones?: string;
  createdAt?: string;
};

export type RhAdelantoRow = {
  id: string;
  empleadoId: string;
  fecha: string;
  monto: number;
  motivo?: string;
  estado: 'pendiente' | 'descontado';
  liquidacionId?: string;
  createdAt?: string;
};

export type RhAusenciaRow = {
  id: string;
  empleadoId: string;
  fecha: string;
  tipo: 'injustificada' | 'enfermedad' | 'vacaciones' | 'licencia' | 'tardanza';
  justificada: boolean;
  impactaSueldo: boolean;
  observaciones?: string;
  createdAt?: string;
};

export type RhLiquidacionRow = {
  id: string;
  empleadoId: string;
  periodo: string;
  sueldoBasico: number;
  horasExtraQty: number;
  horasExtraValor: number;
  adelantosDescontados: number;
  adelantosIds: string[];
  otrosDescuentos: number;
  totalBruto: number;
  totalDescuentos: number;
  netoAPagar: number;
  observaciones?: string;
  estado: 'borrador' | 'liquidado' | 'pagado';
  fechaPago?: string;
  formaPago?: string;
  egresoId?: string;
  createdAt?: string;
};

function mapRhEmpleado(r: any): RhEmpleadoRow {
  return {
    id: r.id,
    nombre: r.nombre,
    dni: r.dni ?? undefined,
    cuil: r.cuil ?? undefined,
    fechaIngreso: r.fecha_ingreso,
    puesto: r.puesto ?? undefined,
    area: r.area ?? undefined,
    tipoContrato: r.tipo_contrato ?? 'dependencia',
    horarioEntrada: r.horario_entrada ?? undefined,
    horarioSalida: r.horario_salida ?? undefined,
    sueldoBasico: parseNum(r.sueldo_basico),
    cbu: r.cbu ?? undefined,
    telefono: r.telefono ?? undefined,
    direccion: r.direccion ?? undefined,
    estado: r.estado ?? 'activo',
    fechaBaja: r.fecha_baja ?? undefined,
    observaciones: r.observaciones ?? undefined,
    createdAt: r.created_at ?? undefined,
  };
}

function mapRhAdelanto(r: any): RhAdelantoRow {
  return {
    id: r.id,
    empleadoId: r.empleado_id,
    fecha: r.fecha,
    monto: parseNum(r.monto),
    motivo: r.motivo ?? undefined,
    estado: r.estado ?? 'pendiente',
    liquidacionId: r.liquidacion_id ?? undefined,
    createdAt: r.created_at ?? undefined,
  };
}

function mapRhAusencia(r: any): RhAusenciaRow {
  return {
    id: r.id,
    empleadoId: r.empleado_id,
    fecha: r.fecha,
    tipo: r.tipo,
    justificada: !!r.justificada,
    impactaSueldo: !!r.impacta_sueldo,
    observaciones: r.observaciones ?? undefined,
    createdAt: r.created_at ?? undefined,
  };
}

function mapRhLiquidacion(r: any): RhLiquidacionRow {
  return {
    id: r.id,
    empleadoId: r.empleado_id,
    periodo: r.periodo,
    sueldoBasico: parseNum(r.sueldo_basico),
    horasExtraQty: parseNum(r.horas_extra_qty),
    horasExtraValor: parseNum(r.horas_extra_valor),
    adelantosDescontados: parseNum(r.adelantos_descontados),
    adelantosIds: Array.isArray(r.adelantos_ids) ? r.adelantos_ids : [],
    otrosDescuentos: parseNum(r.otros_descuentos),
    totalBruto: parseNum(r.total_bruto),
    totalDescuentos: parseNum(r.total_descuentos),
    netoAPagar: parseNum(r.neto_a_pagar),
    observaciones: r.observaciones ?? undefined,
    estado: r.estado ?? 'borrador',
    fechaPago: r.fecha_pago ?? undefined,
    formaPago: r.forma_pago ?? undefined,
    egresoId: r.egreso_id ?? undefined,
    createdAt: r.created_at ?? undefined,
  };
}

export async function loadRhEmpleados(): Promise<RhEmpleadoRow[]> {
  try {
    const { data, error } = await supabase
      .from('rh_empleados')
      .select('*')
      .order('nombre');
    if (error) { console.error('loadRhEmpleados:', error); return []; }
    return (data || []).map(mapRhEmpleado);
  } catch (err) { console.error('loadRhEmpleados exception:', err); return []; }
}

export async function loadRhAdelantos(): Promise<RhAdelantoRow[]> {
  try {
    const { data, error } = await supabase
      .from('rh_adelantos')
      .select('*')
      .order('fecha', { ascending: false });
    if (error) { console.error('loadRhAdelantos:', error); return []; }
    return (data || []).map(mapRhAdelanto);
  } catch (err) { console.error('loadRhAdelantos exception:', err); return []; }
}

export async function loadRhAusencias(): Promise<RhAusenciaRow[]> {
  try {
    const { data, error } = await supabase
      .from('rh_ausencias')
      .select('*')
      .order('fecha', { ascending: false });
    if (error) { console.error('loadRhAusencias:', error); return []; }
    return (data || []).map(mapRhAusencia);
  } catch (err) { console.error('loadRhAusencias exception:', err); return []; }
}

export async function loadRhLiquidaciones(): Promise<RhLiquidacionRow[]> {
  try {
    const { data, error } = await supabase
      .from('rh_liquidaciones')
      .select('*')
      .order('periodo', { ascending: false });
    if (error) { console.error('loadRhLiquidaciones:', error); return []; }
    return (data || []).map(mapRhLiquidacion);
  } catch (err) { console.error('loadRhLiquidaciones exception:', err); return []; }
}

export async function saveRhEmpleado(emp: RhEmpleadoRow): Promise<RhEmpleadoRow | null> {
  const row: Record<string, any> = {
    nombre: emp.nombre,
    dni: emp.dni || null,
    cuil: emp.cuil || null,
    fecha_ingreso: emp.fechaIngreso,
    puesto: emp.puesto || null,
    area: emp.area || null,
    tipo_contrato: emp.tipoContrato,
    horario_entrada: emp.horarioEntrada || null,
    horario_salida: emp.horarioSalida || null,
    sueldo_basico: emp.sueldoBasico,
    cbu: emp.cbu || null,
    telefono: emp.telefono || null,
    direccion: emp.direccion || null,
    estado: emp.estado,
    fecha_baja: emp.fechaBaja || null,
    observaciones: emp.observaciones || null,
    updated_by: SESSION_ID,
    updated_at: nowIso(),
  };
  if (emp.id) row.id = emp.id;
  const { data, error } = await supabase
    .from('rh_empleados')
    .upsert(row)
    .select()
    .single();
  if (error) { console.error('saveRhEmpleado:', error); return null; }
  return mapRhEmpleado(data);
}

export async function saveRhAdelanto(ad: RhAdelantoRow): Promise<RhAdelantoRow | null> {
  const row: Record<string, any> = {
    empleado_id: ad.empleadoId,
    fecha: ad.fecha,
    monto: ad.monto,
    motivo: ad.motivo || null,
    estado: ad.estado,
    liquidacion_id: ad.liquidacionId || null,
    updated_by: SESSION_ID,
    updated_at: nowIso(),
  };
  if (ad.id) row.id = ad.id;
  const { data, error } = await supabase
    .from('rh_adelantos')
    .upsert(row)
    .select()
    .single();
  if (error) { console.error('saveRhAdelanto:', error); return null; }
  return mapRhAdelanto(data);
}

export async function saveRhAusencia(aus: RhAusenciaRow): Promise<RhAusenciaRow | null> {
  const row: Record<string, any> = {
    empleado_id: aus.empleadoId,
    fecha: aus.fecha,
    tipo: aus.tipo,
    justificada: aus.justificada,
    impacta_sueldo: aus.impactaSueldo,
    observaciones: aus.observaciones || null,
    updated_by: SESSION_ID,
    updated_at: nowIso(),
  };
  if (aus.id) row.id = aus.id;
  const { data, error } = await supabase
    .from('rh_ausencias')
    .upsert(row)
    .select()
    .single();
  if (error) { console.error('saveRhAusencia:', error); return null; }
  return mapRhAusencia(data);
}

export async function saveRhLiquidacion(liq: RhLiquidacionRow): Promise<RhLiquidacionRow | null> {
  const row: Record<string, any> = {
    empleado_id: liq.empleadoId,
    periodo: liq.periodo,
    sueldo_basico: liq.sueldoBasico,
    horas_extra_qty: liq.horasExtraQty,
    horas_extra_valor: liq.horasExtraValor,
    adelantos_descontados: liq.adelantosDescontados,
    adelantos_ids: liq.adelantosIds,
    otros_descuentos: liq.otrosDescuentos,
    total_bruto: liq.totalBruto,
    total_descuentos: liq.totalDescuentos,
    neto_a_pagar: liq.netoAPagar,
    observaciones: liq.observaciones || null,
    estado: liq.estado,
    fecha_pago: liq.fechaPago || null,
    forma_pago: liq.formaPago || null,
    egreso_id: liq.egresoId || null,
    updated_by: SESSION_ID,
    updated_at: nowIso(),
  };
  if (liq.id) row.id = liq.id;
  const { data, error } = await supabase
    .from('rh_liquidaciones')
    .upsert(row)
    .select()
    .single();
  if (error) { console.error('saveRhLiquidacion:', error); return null; }
  return mapRhLiquidacion(data);
}

export async function deleteRhRegistro(
  tabla: 'rh_adelantos' | 'rh_ausencias',
  id: string
): Promise<boolean> {
  const { error } = await supabase.from(tabla).delete().eq('id', id);
  if (error) { console.error('deleteRhRegistro:', error); return false; }
  return true;
}
