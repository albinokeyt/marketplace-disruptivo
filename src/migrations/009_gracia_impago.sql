-- Impago con periodo de GRACIA y reintentos con event_id estable:
--   · next_charge_at ya NO se mueve al fallar: marca el inicio del periodo a cobrar, así cada reintento usa el
--     mismo event_id (sub-<id>-<fecha>) y un intento ambiguo que GHL acabe confirmando no se cobra dos veces
--   · retry_at = cuándo volver a intentarlo (diario)
--   · al primer fallo de una suscripción activa, ends_at se alarga grace_days (ajuste subscription_billing):
--     el cliente sigue con acceso mientras se reintenta; agotada la gracia se corta y, agotados los
--     reintentos, pasa a past_due
ALTER TABLE subscriptions ADD COLUMN retry_at timestamptz;
