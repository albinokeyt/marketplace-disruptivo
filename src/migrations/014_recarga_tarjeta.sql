-- Recarga de saldo con TARJETA (Stripe Checkout): el cliente paga con su tarjeta y el importe se abona como
-- crédito. Alternativa a la recarga desde el monedero de GHL, que sin reventa la pagaría la agencia.
CREATE TABLE IF NOT EXISTS card_topups (
  id serial PRIMARY KEY,
  location_id text NOT NULL,
  amount numeric(12,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  -- pending (esperando el pago) · paid (cobrada y abonada) · expired (sesión caducada sin pagar) · failed (no cuadra)
  status text NOT NULL DEFAULT 'pending',
  stripe_session_id text UNIQUE,
  stripe_payment_intent text,
  user_id text,
  email text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS card_topups_pending ON card_topups(created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS card_topups_location ON card_topups(location_id, created_at DESC);

-- el abono de cada recarga con tarjeta se registra UNA sola vez (índice único parcial)
ALTER TABLE credit_entries ADD COLUMN IF NOT EXISTS card_topup_id integer REFERENCES card_topups(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS credit_entries_card_topup_uq ON credit_entries(card_topup_id) WHERE card_topup_id IS NOT NULL;
