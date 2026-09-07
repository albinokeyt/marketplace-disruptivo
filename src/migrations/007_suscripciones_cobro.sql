-- Modelo de cobro HÍBRIDO:
--   · por uso      → la app llama a /api/v1/charges cada vez que consume (Hermes)
--   · por suscripción → el marketplace cobra solo, cada N meses, el precio pactado (VSL Boost, Emails)
-- Ambos salen del mismo saldo del cliente: primero su crédito interno, y si no llega, su wallet de GHL.

-- Interruptor por app: el admin habilita o corta la capacidad de COBRAR sin revocarle la API key
-- (la app sigue pudiendo consultar accesos, tarifas y su historial, así puede avisar al usuario).
ALTER TABLE apps ADD COLUMN can_charge boolean NOT NULL DEFAULT true;

-- Precio real del plan (price_text sigue siendo el texto de escaparate)
ALTER TABLE plans
  ADD COLUMN price numeric(12,2),
  ADD COLUMN period_months integer NOT NULL DEFAULT 1;

-- La suscripción guarda SU precio (copiado del plan al crearla, editable después: descuentos, precios heredados)
ALTER TABLE subscriptions
  ADD COLUMN price numeric(12,2),
  ADD COLUMN period_months integer NOT NULL DEFAULT 1,
  ADD COLUMN auto_renew boolean NOT NULL DEFAULT false,
  ADD COLUMN next_charge_at timestamptz,
  ADD COLUMN failed_charges integer NOT NULL DEFAULT 0,
  ADD COLUMN last_error text;

-- 'past_due' = se le acabó el periodo pagado y el cobro falló: checkAccess ya no lo da por válido
CREATE INDEX subscriptions_due ON subscriptions(next_charge_at) WHERE auto_renew;

-- Un cargo puede venir de una suscripción (kind='subscription'); la idempotencia sigue siendo
-- (app_id, event_id) con un event_id determinista por periodo: sub-<id>-<fecha de inicio del periodo>
ALTER TABLE charges ADD COLUMN subscription_id integer REFERENCES subscriptions(id);
CREATE INDEX charges_subscription ON charges(subscription_id) WHERE subscription_id IS NOT NULL;

-- La app interna ya no firma solo recargas: también los cobros de PLANES (que agrupan varias apps)
UPDATE apps SET name = 'Sistema · Marketplace' WHERE system = true;
