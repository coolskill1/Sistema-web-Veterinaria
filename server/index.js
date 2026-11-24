import "dotenv/config";
import express from "express";
import cors from "cors";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const app = express();
app.use(cors());
app.use(express.json());

const ESTADOS_ACTIVOS = ["programada", "confirmada", "en_curso"];

// Envuelve los handlers async para que cualquier error llegue a la respuesta 500.
const h = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    console.error(e);
    res.status(500).json({ error: "Error del servidor" });
  });

// -------------------------------------------------------------------
// Validaciones (mismas reglas que el frontend y que la base de datos)
// ---------------------------------------------------------------------
const opcional = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
const obligatorio = (v) => typeof v === "string" && v.trim().length > 0;
const idValido = (v) => /^\d+$/.test(String(v)) && Number(v) > 0;

const limpiarTelefono = (t) => t.replace(/[\s()-]/g, "");
const telefonoValido = (t) => /^\+\d{11}$|^\d{9}$/.test(limpiarTelefono(t));
const correoValido = (c) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c);

// ---------------------------------------------------------------------
// Veterinarios
// ---------------------------------------------------------------------
app.get(
  "/api/veterinarios",
  h(async (_req, res) => {
    const { rows } = await pool.query(
      "SELECT id, nombre, especialidad FROM veterinarios ORDER BY nombre",
    );
    res.json(rows);
  }),
);

// ---------------------------------------------------------------------
// Dueños
// ---------------------------------------------------------------------
app.get(
  "/api/duenos",
  h(async (_req, res) => {
    const { rows } = await pool.query(
      "SELECT id, nombre, telefono, correo FROM duenos ORDER BY nombre",
    );
    res.json(rows);
  }),
);

app.post(
  "/api/duenos",
  h(async (req, res) => {
    const nombre = opcional(req.body.nombre);
    const telefono = opcional(req.body.telefono);
    const correo = opcional(req.body.correo);

    if (!nombre)
      return res.status(400).json({ error: "El nombre es obligatorio." });
    if (telefono && !telefonoValido(telefono))
      return res.status(400).json({
        error: "Teléfono inválido. Usa +56912345678 o 912345678.",
      });
    if (correo && !correoValido(correo))
      return res.status(400).json({ error: "Correo inválido." });

    try {
      const { rows } = await pool.query(
        `INSERT INTO duenos (nombre, telefono, correo)
         VALUES ($1, $2, $3)
         RETURNING id, nombre`,
        [nombre, telefono ? limpiarTelefono(telefono) : null, correo],
      );
      res.status(201).json(rows[0]);
    } catch (e) {
      if (e.code === "23505")
        return res
          .status(409)
          .json({ error: "Ya existe un dueño con ese correo." });
      if (e.code === "23514")
        return res.status(400).json({ error: "Datos del dueño no válidos." });
      throw e;
    }
  }),
);

// ---------------------------------------------------------------------
// Mascotas
// ---------------------------------------------------------------------
app.get(
  "/api/mascotas",
  h(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT id, dueno_id, nombre, especie, raza, fecha_nacimiento
         FROM mascotas
        ORDER BY nombre`,
    );
    res.json(rows);
  }),
);

app.post(
  "/api/mascotas",
  h(async (req, res) => {
    const dueno_id = req.body.dueno_id;
    const nombre = opcional(req.body.nombre);
    const especie = opcional(req.body.especie) || "Perro";
    const raza = opcional(req.body.raza);
    const fecha = opcional(req.body.fecha_nacimiento);

    if (!idValido(dueno_id) || !nombre)
      return res
        .status(400)
        .json({ error: "Dueño y nombre son obligatorios." });
    if (fecha && isNaN(Date.parse(fecha)))
      return res.status(400).json({ error: "Fecha de nacimiento no válida." });

    try {
      const { rows } = await pool.query(
        `INSERT INTO mascotas (dueno_id, nombre, especie, raza, fecha_nacimiento)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, nombre`,
        [Number(dueno_id), nombre, especie, raza, fecha],
      );
      res.status(201).json(rows[0]);
    } catch (e) {
      if (e.code === "23503")
        return res.status(400).json({ error: "El dueño indicado no existe." });
      throw e;
    }
  }),
);

// ---------------------------------------------------------------------
// Citas
// ---------------------------------------------------------------------
// Devuelve todas las citas desde la fecha indicada (por defecto, ahora),
// con los datos de la mascota, el dueño y el veterinario ya unidos.
app.get(
  "/api/citas",
  h(async (req, res) => {
    const desde = req.query.desde ? new Date(req.query.desde) : new Date();
    if (isNaN(desde))
      return res.status(400).json({ error: "Parámetro 'desde' no válido." });

    const { rows } = await pool.query(
      `SELECT c.id,
              c.fecha_hora,
              c.duracion_minutos,
              c.motivo,
              c.estado,
              m.id       AS mascota_id,
              m.nombre   AS mascota,
              m.especie,
              d.nombre   AS dueno,
              d.telefono,
              v.id       AS veterinario_id,
              v.nombre   AS veterinario
         FROM citas c
         JOIN mascotas      m ON m.id = c.mascota_id
         JOIN duenos        d ON d.id = m.dueno_id
         JOIN veterinarios  v ON v.id = c.veterinario_id
        WHERE c.fecha_hora >= $1
        ORDER BY c.fecha_hora`,
      [desde.toISOString()],
    );
    res.json(rows);
  }),
);

app.post(
  "/api/citas",
  h(async (req, res) => {
    const { mascota_id, veterinario_id, fecha_hora, motivo } = req.body;
    const duracion = req.body.duracion_minutos ?? 30;

    if (!idValido(mascota_id) || !idValido(veterinario_id))
      return res
        .status(400)
        .json({ error: "Mascota y veterinario son obligatorios." });
    if (!obligatorio(motivo))
      return res.status(400).json({ error: "El motivo es obligatorio." });

    const inicio = new Date(fecha_hora);
    if (isNaN(inicio))
      return res.status(400).json({ error: "Fecha no válida." });
    if (inicio < new Date())
      return res.status(400).json({ error: "La fecha debe ser futura." });

    const minutos = Number(duracion);
    if (!Number.isInteger(minutos) || minutos <= 0)
      return res
        .status(400)
        .json({ error: "La duración debe ser un número entero positivo." });

    try {
      const { rows } = await pool.query(
        `INSERT INTO citas (mascota_id, veterinario_id, fecha_hora, duracion_minutos, motivo)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          Number(mascota_id),
          Number(veterinario_id),
          inicio.toISOString(),
          minutos,
          motivo.trim(),
        ],
      );
      res.status(201).json({ id: rows[0].id });
    } catch (e) {
      // 23P01: la restricción EXCLUDE detectó un solapamiento.
      if (e.code === "23P01")
        return res.status(409).json({
          error:
            "Ese veterinario ya tiene una cita que se cruza con ese horario.",
        });
      if (e.code === "23503")
        return res
          .status(400)
          .json({ error: "La mascota o el veterinario no existen." });
      if (e.code === "23514")
        return res.status(400).json({ error: "Datos de la cita no válidos." });
      throw e;
    }
  }),
);

// Marca asistencia: completada (asistió) o no_asistio.
app.patch(
  "/api/citas/:id/estado",
  h(async (req, res) => {
    const { estado } = req.body;
    if (!idValido(req.params.id))
      return res.status(400).json({ error: "Id no válido." });
    if (!["completada", "no_asistio"].includes(estado))
      return res.status(400).json({ error: "Estado no válido." });

    const { rowCount } = await pool.query(
      `UPDATE citas
          SET estado = $1
        WHERE id = $2 AND estado <> 'cancelada'`,
      [estado, Number(req.params.id)],
    );
    if (!rowCount)
      return res.status(404).json({ error: "Cita no encontrada o cancelada." });
    res.json({ ok: true });
  }),
);

// Cancela solo citas que todavía están activas.
app.patch(
  "/api/citas/:id/cancelar",
  h(async (req, res) => {
    if (!idValido(req.params.id))
      return res.status(400).json({ error: "Id no válido." });

    const { rowCount } = await pool.query(
      `UPDATE citas
          SET estado = 'cancelada'
        WHERE id = $1 AND estado = ANY($2)`,
      [Number(req.params.id), ESTADOS_ACTIVOS],
    );
    if (!rowCount)
      return res
        .status(404)
        .json({ error: "Cita no encontrada o ya no está activa." });
    res.json({ ok: true });
  }),
);

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`API en http://localhost:${port}`));
