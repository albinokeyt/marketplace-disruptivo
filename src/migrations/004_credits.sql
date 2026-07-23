-- Crédito interno por subcuenta: el admin regala/prepaga saldo y los cobros lo consumen
-- ANTES de tocar el wallet de GHL. 'credits' guarda el saldo (descuento atómico) y
-- 'credit_entries' el ledger auditable de cada movimiento.

CREATE TABLE credits (
  location_id text PRIMARY KEY,
  balance numeric(14,6) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE credit_entries (
  id serial PRIMARY KEY,
  location_id text NOT NULL,
  amount numeric(14,6) NOT NULL,          -- + concesión del admin / - consumo de un cobro
  reason text,
  charge_id integer REFERENCES charges(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX credit_entries_location ON credit_entries(location_id, created_at DESC);

-- con qué se pagó el cargo
ALTER TABLE charges ADD COLUMN paid_with text NOT NULL DEFAULT 'wallet'; -- 'wallet' | 'credit'
