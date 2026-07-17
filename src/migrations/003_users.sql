-- Usuarios del marketplace (clientes con login propio, no necesariamente en GHL) + badges de apps

CREATE TABLE users (
  id serial PRIMARY KEY,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  name text,
  role text NOT NULL DEFAULT 'user',            -- 'admin' | 'user'
  location_ids jsonb NOT NULL DEFAULT '[]'::jsonb, -- subcuentas que este usuario puede ver
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- badge de escaparate: NULL | 'new' | 'coming_soon'
ALTER TABLE apps ADD COLUMN badge text;
