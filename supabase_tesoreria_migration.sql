-- ============ TABLAS ============
CREATE TABLE tesoreria_cuentas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre          text NOT NULL,
  tipo            text NOT NULL CHECK (tipo IN ('banco','efectivo','billetera','otra')),
  banco           text,
  numero_cuenta   text,
  moneda          text NOT NULL DEFAULT 'ARS' CHECK (moneda IN ('ARS','USD')),
  observacion     text,
  saldo_inicial   numeric(18,2) NOT NULL DEFAULT 0,
  fecha_apertura  date NOT NULL DEFAULT CURRENT_DATE,
  habilitada      boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      text
);

CREATE TABLE tesoreria_medios_pago (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      text NOT NULL,
  tipo_base   text NOT NULL CHECK (tipo_base IN ('efectivo','transferencia','cheque','billetera','tarjeta','otro')),
  habilitado  boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text
);

CREATE TABLE tesoreria_transferencias (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha              date NOT NULL,
  cuenta_origen_id   uuid NOT NULL REFERENCES tesoreria_cuentas(id) ON DELETE RESTRICT,
  cuenta_destino_id  uuid NOT NULL REFERENCES tesoreria_cuentas(id) ON DELETE RESTRICT,
  monto              numeric(18,2) NOT NULL CHECK (monto > 0),
  medio_pago_id      uuid REFERENCES tesoreria_medios_pago(id),
  detalle            text,
  anulado            boolean NOT NULL DEFAULT false,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  updated_by         text,
  CHECK (cuenta_origen_id <> cuenta_destino_id)
);

CREATE TABLE tesoreria_movimientos (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cuenta_id          uuid NOT NULL REFERENCES tesoreria_cuentas(id) ON DELETE RESTRICT,
  fecha              date NOT NULL,
  medio_pago_id      uuid REFERENCES tesoreria_medios_pago(id),
  origen_tipo        text NOT NULL CHECK (origen_tipo IN ('venta','cobro','egreso','pago','sueldo','transferencia','ajuste','manual')),
  origen_id          text,
  origen_referencia  text,
  detalle            text,
  contraparte        text,
  debe               numeric(18,2) NOT NULL DEFAULT 0 CHECK (debe >= 0),
  haber              numeric(18,2) NOT NULL DEFAULT 0 CHECK (haber >= 0),
  transferencia_id   uuid REFERENCES tesoreria_transferencias(id),
  es_manual          boolean NOT NULL DEFAULT false,
  motivo             text,
  anulado            boolean NOT NULL DEFAULT false,
  anulado_motivo     text,
  anulado_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  updated_by         text,
  CHECK ((debe > 0 AND haber = 0) OR (haber > 0 AND debe = 0)),
  CHECK (es_manual = false OR motivo IS NOT NULL)
);

CREATE INDEX idx_tes_mov_cuenta_fecha ON tesoreria_movimientos(cuenta_id, fecha);
CREATE INDEX idx_tes_mov_transfer ON tesoreria_movimientos(transferencia_id);

-- ============ VISTA DE SALDOS (para la lista de cuentas) ============
CREATE OR REPLACE VIEW tesoreria_saldos AS
SELECT c.id AS cuenta_id,
       c.saldo_inicial
       + COALESCE(SUM(CASE WHEN m.anulado THEN 0 ELSE m.debe  END), 0)
       - COALESCE(SUM(CASE WHEN m.anulado THEN 0 ELSE m.haber END), 0) AS saldo
FROM tesoreria_cuentas c
LEFT JOIN tesoreria_movimientos m ON m.cuenta_id = c.id
GROUP BY c.id, c.saldo_inicial;

-- ============ RPC: TRANSFERENCIA ATÓMICA (las dos patas juntas) ============
CREATE OR REPLACE FUNCTION tesoreria_crear_transferencia(
  p_fecha date, p_origen uuid, p_destino uuid, p_monto numeric,
  p_medio uuid, p_detalle text, p_updated_by text
) RETURNS uuid AS $$
DECLARE v_id uuid; v_mo text; v_md text;
BEGIN
  IF p_origen = p_destino THEN RAISE EXCEPTION 'Origen y destino no pueden ser la misma cuenta'; END IF;
  IF p_monto <= 0 THEN RAISE EXCEPTION 'El monto debe ser mayor a cero'; END IF;
  SELECT moneda INTO v_mo FROM tesoreria_cuentas WHERE id = p_origen;
  SELECT moneda INTO v_md FROM tesoreria_cuentas WHERE id = p_destino;
  IF v_mo <> v_md THEN RAISE EXCEPTION 'Las cuentas deben ser de la misma moneda'; END IF;
  INSERT INTO tesoreria_transferencias(fecha,cuenta_origen_id,cuenta_destino_id,monto,medio_pago_id,detalle,updated_by)
    VALUES(p_fecha,p_origen,p_destino,p_monto,p_medio,p_detalle,p_updated_by) RETURNING id INTO v_id;
  INSERT INTO tesoreria_movimientos(cuenta_id,fecha,medio_pago_id,origen_tipo,detalle,debe,haber,transferencia_id,updated_by)
    VALUES(p_origen,p_fecha,p_medio,'transferencia',COALESCE(p_detalle,'Transferencia a otra cuenta'),0,p_monto,v_id,p_updated_by);
  INSERT INTO tesoreria_movimientos(cuenta_id,fecha,medio_pago_id,origen_tipo,detalle,debe,haber,transferencia_id,updated_by)
    VALUES(p_destino,p_fecha,p_medio,'transferencia',COALESCE(p_detalle,'Transferencia desde otra cuenta'),p_monto,0,v_id,p_updated_by);
  RETURN v_id;
END; $$ LANGUAGE plpgsql;

-- ============ RPC: ANULAR TRANSFERENCIA (anula transferencia + las dos patas) ============
CREATE OR REPLACE FUNCTION tesoreria_anular_transferencia(p_id uuid, p_motivo text, p_updated_by text)
RETURNS void AS $$
BEGIN
  UPDATE tesoreria_transferencias SET anulado=true, updated_at=now(), updated_by=p_updated_by WHERE id=p_id;
  UPDATE tesoreria_movimientos
     SET anulado=true, anulado_motivo=p_motivo, anulado_at=now(), updated_at=now(), updated_by=p_updated_by
   WHERE transferencia_id=p_id;
END; $$ LANGUAGE plpgsql;

-- ============ RLS (mismo criterio que app_data: acceso vía publishable key) ============
ALTER TABLE tesoreria_cuentas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE tesoreria_medios_pago    ENABLE ROW LEVEL SECURITY;
ALTER TABLE tesoreria_movimientos    ENABLE ROW LEVEL SECURITY;
ALTER TABLE tesoreria_transferencias ENABLE ROW LEVEL SECURITY;
CREATE POLICY p_all ON tesoreria_cuentas        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY p_all ON tesoreria_medios_pago    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY p_all ON tesoreria_movimientos    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY p_all ON tesoreria_transferencias FOR ALL USING (true) WITH CHECK (true);
