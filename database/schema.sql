CREATE TABLE IF NOT EXISTS veterinarios (
  id SERIAL PRIMARY KEY,
  nombre TEXT NOT NULL,
  especialidad TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS citas (
  id SERIAL PRIMARY KEY,
  mascota TEXT NOT NULL,
  especie TEXT NOT NULL DEFAULT 'Perro',
  dueno TEXT NOT NULL,
  telefono TEXT,
  motivo TEXT NOT NULL,
  veterinario_id INT NOT NULL REFERENCES veterinarios(id),
  fecha_hora TIMESTAMPTZ NOT NULL,
  estado TEXT NOT NULL DEFAULT 'programada' CHECK (estado IN ('programada','cancelada')),
  creada_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un veterinario no puede tener dos citas activas a la misma hora
CREATE UNIQUE INDEX IF NOT EXISTS citas_vet_hora_unica
  ON citas (veterinario_id, fecha_hora) WHERE estado = 'programada';

INSERT INTO veterinarios (nombre, especialidad)
SELECT * FROM (VALUES
  ('Dra. Camila Rojas', 'Medicina general'),
  ('Dr. Matías Soto', 'Cirugía'),
  ('Dra. Valentina Pérez', 'Dermatología')
) AS v(nombre, especialidad)
WHERE NOT EXISTS (SELECT 1 FROM veterinarios);
