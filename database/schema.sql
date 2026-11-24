-- =====================================================================
-- schema.sql
-- Clínica veterinaria - instalación desde cero (greenfield)
-- Requisito: PostgreSQL 13+
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- Extensiones
-- ---------------------------------------------------------------------
-- btree_gist permite combinar igualdad (veterinario_id = ...) con
-- solapamiento de rangos (periodo && ...) dentro de una misma
-- restricción EXCLUDE USING GIST.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ---------------------------------------------------------------------
-- Tabla: duenos
-- ---------------------------------------------------------------------
CREATE TABLE duenos (
    id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre      TEXT        NOT NULL
                            CHECK (char_length(btrim(nombre)) > 0),
    telefono    TEXT,
    correo      TEXT
                            CONSTRAINT duenos_correo_formato
                            CHECK (correo IS NULL
                                   OR correo ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un correo no puede repetirse, sin distinguir mayúsculas.
CREATE UNIQUE INDEX duenos_correo_unico
    ON duenos (lower(correo))
    WHERE correo IS NOT NULL;

-- ---------------------------------------------------------------------
-- Tabla: veterinarios
-- ---------------------------------------------------------------------
CREATE TABLE veterinarios (
    id            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre        TEXT NOT NULL
                       CHECK (char_length(btrim(nombre)) > 0),
    especialidad  TEXT NOT NULL
                       CHECK (char_length(btrim(especialidad)) > 0)
);

-- ---------------------------------------------------------------------
-- Tabla: mascotas
-- Cada mascota pertenece a un único dueño.
-- ---------------------------------------------------------------------
CREATE TABLE mascotas (
    id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    dueno_id          INTEGER NOT NULL
                              REFERENCES duenos (id)
                              ON DELETE RESTRICT
                              ON UPDATE CASCADE,
    nombre            TEXT    NOT NULL
                              CHECK (char_length(btrim(nombre)) > 0),
    especie           TEXT    NOT NULL DEFAULT 'Perro'
                              CHECK (char_length(btrim(especie)) > 0),
    raza              TEXT,
    fecha_nacimiento  DATE,
    creado_en         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------
-- Tabla: citas
-- ---------------------------------------------------------------------
CREATE TABLE citas (
    id                INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    mascota_id        INTEGER NOT NULL
                              REFERENCES mascotas (id)
                              ON DELETE RESTRICT
                              ON UPDATE CASCADE,
    veterinario_id    INTEGER NOT NULL
                              REFERENCES veterinarios (id)
                              ON DELETE RESTRICT
                              ON UPDATE CASCADE,
    fecha_hora        TIMESTAMPTZ NOT NULL,
    duracion_minutos  INTEGER NOT NULL DEFAULT 30
                              CHECK (duracion_minutos > 0),
    -- Intervalo [inicio, fin) de la cita. Lo mantiene el trigger
    -- citas_calcular_periodo_trg; no se debe escribir manualmente.
    periodo           TSTZRANGE NOT NULL,
    motivo            TEXT NOT NULL
                           CHECK (char_length(btrim(motivo)) > 0),
    estado            TEXT NOT NULL DEFAULT 'programada'
                           CHECK (estado IN (
                               'programada',
                               'confirmada',
                               'en_curso',
                               'completada',
                               'cancelada',
                               'no_asistio'
                           )),
    creada_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
    actualizada_en    TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Un veterinario no puede tener dos citas activas que se solapen.
    -- Solo participan los estados que bloquean horario.
    -- El rango [) permite que una cita empiece justo cuando termina otra.
    CONSTRAINT citas_sin_solapamiento_veterinario
        EXCLUDE USING gist (
            veterinario_id WITH =,
            periodo        WITH &&
        )
        WHERE (estado IN ('programada', 'confirmada', 'en_curso'))
);

-- ---------------------------------------------------------------------
-- Función y trigger: calcular el periodo de cada cita
-- ---------------------------------------------------------------------
-- Se usa un trigger porque PostgreSQL exige expresiones IMMUTABLE en
-- columnas generadas y en restricciones EXCLUDE. La suma
-- timestamptz + interval es STABLE (depende de la zona horaria), por lo
-- que no puede usarse directamente en esas expresiones.
CREATE OR REPLACE FUNCTION citas_calcular_periodo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.periodo := tstzrange(
        NEW.fecha_hora,
        NEW.fecha_hora + make_interval(mins => NEW.duracion_minutos),
        '[)'
    );
    NEW.actualizada_en := now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER citas_calcular_periodo_trg
    BEFORE INSERT OR UPDATE OF fecha_hora, duracion_minutos, estado
    ON citas
    FOR EACH ROW
    EXECUTE FUNCTION citas_calcular_periodo();

-- ---------------------------------------------------------------------
-- Índices
-- ---------------------------------------------------------------------
-- Mascotas de un dueño. Cubre la FK dueno_id.
CREATE INDEX mascotas_dueno_idx
    ON mascotas (dueno_id);

-- Citas en un rango de fechas/horas (agenda global del día, semana, etc.).
CREATE INDEX citas_fecha_hora_idx
    ON citas (fecha_hora);

-- Agenda de un veterinario ordenada por hora. Cubre la FK veterinario_id.
CREATE INDEX citas_agenda_veterinario_idx
    ON citas (veterinario_id, fecha_hora);

-- Historial de citas de una mascota. Cubre la FK mascota_id.
CREATE INDEX citas_mascota_fecha_idx
    ON citas (mascota_id, fecha_hora);

-- Filtrar por estado y, dentro de cada estado, ordenar por fecha.
CREATE INDEX citas_estado_fecha_idx
    ON citas (estado, fecha_hora);

COMMIT;