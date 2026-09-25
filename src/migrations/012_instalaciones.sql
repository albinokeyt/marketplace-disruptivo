-- INSTALACIONES AUTOMÁTICAS
-- GoHighLevel fuerza la «instalación masiva»: cuando un usuario de AGENCIA instala la app en una o varias
-- subcuentas, el callback recibe un token de AGENCIA (userType Company, isBulkInstallation, SIN locationId).
-- Con él se listan las subcuentas donde está instalada la app y se pide el token de cada una
-- (/oauth/locationToken). Se guarda uno por agencia y se refresca solo.
CREATE TABLE agency_tokens (
  company_id text PRIMARY KEY,
  access_token text NOT NULL,
  refresh_token text,
  token_expires_at timestamptz,
  scope text,
  user_id text,
  last_sync_at timestamptz,
  last_sync_result jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Conexiones: estados nuevos 'awaiting' (instalada en GHL, falta el token) y 'uninstalled' (desinstalada en GHL),
-- de dónde vino (panel | install | webhook | sync | sso) y el último error para mostrarlo en el panel.
ALTER TABLE connections
  ADD COLUMN source text,
  ADD COLUMN last_error text,
  ADD COLUMN installed_at timestamptz,
  ADD COLUMN uninstalled_at timestamptz;

UPDATE connections SET installed_at = created_at, source = 'panel' WHERE installed_at IS NULL;
