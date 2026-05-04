-- ============================================
-- ALIDO ERP - Supabase Migration
-- Tabla key-value para almacenar datos del ERP
-- ============================================

-- Crear tabla principal de datos
CREATE TABLE IF NOT EXISTS app_data (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER app_data_updated_at
  BEFORE UPDATE ON app_data
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Habilitar RLS
ALTER TABLE app_data ENABLE ROW LEVEL SECURITY;

-- Política: permitir lectura pública (la app usa la anon key)
CREATE POLICY "Allow public read" ON app_data
  FOR SELECT USING (true);

-- Política: permitir escritura pública (la app usa la anon key)
CREATE POLICY "Allow public insert" ON app_data
  FOR INSERT WITH CHECK (true);

-- Política: permitir actualización pública
CREATE POLICY "Allow public update" ON app_data
  FOR UPDATE USING (true) WITH CHECK (true);

-- Índice para búsquedas rápidas por key
CREATE INDEX IF NOT EXISTS idx_app_data_key ON app_data (key);
