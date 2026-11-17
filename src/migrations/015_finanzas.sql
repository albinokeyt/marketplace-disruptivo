-- FINANZAS para apps: permiso por app para leer, por subcuenta, cuánto saldo es CORTESÍA (añadido a mano por el
-- administrador) y cuánto es DINERO REAL (recargas con tarjeta o desde el monedero de GHL), con la regla
-- «cortesía primero» (GET /api/v1/finanzas). Por defecto ninguna app puede: lo activa el administrador.
ALTER TABLE apps ADD COLUMN IF NOT EXISTS can_read_finances boolean NOT NULL DEFAULT false;
