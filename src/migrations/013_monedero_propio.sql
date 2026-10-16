-- Monedero propio verificado: GHL cobra los cargos de la app al monedero de la AGENCIA salvo que la subcuenta
-- tenga la refacturación (reventa por uso) activa y tarjeta. Mientras el administrador no lo verifique, el
-- marketplace no cobra NADA del monedero de GHL de esa subcuenta (recargas, planes, renovaciones ni cobros
-- de apps): solo del crédito ya recargado. Así la agencia nunca paga por un cliente.
ALTER TABLE connections ADD COLUMN IF NOT EXISTS wallet_ok boolean NOT NULL DEFAULT false;
ALTER TABLE connections ADD COLUMN IF NOT EXISTS wallet_ok_at timestamptz;
