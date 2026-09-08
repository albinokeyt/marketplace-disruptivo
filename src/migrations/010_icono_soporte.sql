-- Ficha de tienda: icono de la app (cuadrado, se muestra junto al nombre en tarjeta y detalle)
-- y correo de soporte del desarrollador (enlace mailto en el detalle público)
ALTER TABLE apps
  ADD COLUMN icon_url text,
  ADD COLUMN support_email text;
