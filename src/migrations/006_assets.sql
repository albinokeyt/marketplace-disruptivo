-- Archivos de la vitrina (fotos/vídeos de las apps) guardados en la BD: sobreviven a cada redeploy
-- del contenedor sin necesitar volúmenes, y se sirven en /uploads/<id>.<ext> con caché inmutable.
CREATE TABLE assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mime text NOT NULL,
  size integer NOT NULL,
  data bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
