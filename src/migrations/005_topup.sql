-- Recargas de saldo: el cliente paga desde su wallet de GHL (meter "recarga-saldo", 1.00 USD/unidad)
-- y recibe crédito interno equivalente. Los cargos de recarga los firma una app interna oculta.

ALTER TABLE apps ADD COLUMN system boolean NOT NULL DEFAULT false;
ALTER TABLE charges ADD COLUMN kind text NOT NULL DEFAULT 'usage'; -- 'usage' | 'topup'
CREATE INDEX charges_kind ON charges(kind);

-- una recarga abona crédito UNA sola vez, y su reversión (al reembolsar) también (idempotencia por charge_id)
CREATE UNIQUE INDEX credit_entries_topup_uq ON credit_entries(charge_id) WHERE reason = 'recarga';
CREATE UNIQUE INDEX credit_entries_reversion_uq ON credit_entries(charge_id) WHERE reason = 'reversion_recarga';

-- una sola app interna de recargas aunque dos peticiones la creen a la vez
CREATE UNIQUE INDEX apps_system_uq ON apps ((system)) WHERE system;

-- como mucho UNA recarga sin confirmar por subcuenta: repetirla sería cobrar dos veces del wallet
CREATE UNIQUE INDEX charges_topup_inflight_uq ON charges(location_id) WHERE kind = 'topup' AND status IN ('pending','unknown');
