import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import pg from 'pg';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const app = express();
app.use(cors());
app.use(express.json());

const h = (fn) => (req, res) =>
  fn(req, res).catch((e) => {
    console.error(e);
    res.status(500).json({ error: 'Error del servidor' });
  });

// --- VETERINARIOS ---
app.get('/api/veterinarios', h(async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM veterinarios ORDER BY nombre');
  res.json(rows);
}));

// --- DUEÑOS ---
app.get('/api/duenos', h(async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM duenos ORDER BY nombre');
  res.json(rows);
}));

app.post('/api/duenos', h(async (req, res) => {
  const { nombre, telefono, correo } = req.body;
  if (!nombre || !nombre.trim())
    return res.status(400).json({ error: 'El nombre del dueño es obligatorio.' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO duenos (nombre, telefono, correo)
       VALUES ($1, $2, $3) RETURNING *`,
      [nombre.trim(), telefono || null, correo || null]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505')
      return res.status(409).json({ error: 'Ya existe un dueño registrado con ese correo.' });
    throw e;
  }
}));

// --- MASCOTAS ---
app.get('/api/mascotas', h(async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM mascotas ORDER BY nombre');
  res.json(rows);
}));

app.post('/api/mascotas', h(async (req, res) => {
  const { dueno_id, nombre, especie, raza, fecha_nacimiento } = req.body;
  if (!dueno_id || !nombre || !nombre.trim())
    return res.status(400).json({ error: 'El dueño y el nombre de la mascota son obligatorios.' });
  const { rows } = await pool.query(
    `INSERT INTO mascotas (dueno_id, nombre, especie, raza, fecha_nacimiento)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [dueno_id, nombre.trim(), especie || 'Perro', raza || null, fecha_nacimiento || null]
  );
  res.status(201).json(rows[0]);
}));

// --- CITAS ---
app.get('/api/citas', h(async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT c.*,
           v.nombre AS veterinario,
           m.nombre AS mascota,
           m.especie,
           d.nombre AS dueno,
           d.telefono
    FROM citas c
    JOIN veterinarios v ON v.id = c.veterinario_id
    JOIN mascotas m ON m.id = c.mascota_id
    JOIN duenos d ON d.id = m.dueno_id
    WHERE c.estado IN ('programada', 'confirmada', 'en_curso')
      AND c.fecha_hora >= now()
    ORDER BY c.fecha_hora
  `);
  res.json(rows);
}));

app.post('/api/citas', h(async (req, res) => {
  const { mascota_id, veterinario_id, fecha_hora, duracion_minutos, motivo } = req.body;
  if (!mascota_id || !veterinario_id || !fecha_hora || !motivo)
    return res.status(400).json({ error: 'Completa todos los campos obligatorios.' });
  if (new Date(fecha_hora) < new Date())
    return res.status(400).json({ error: 'La fecha debe ser futura.' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO citas (mascota_id, veterinario_id, fecha_hora, duracion_minutos, motivo)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [mascota_id, veterinario_id, fecha_hora, duracion_minutos || 30, motivo]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23P01' || e.code === '23505')
      return res.status(409).json({ error: 'Ese veterinario ya tiene una cita que se solapa en ese horario.' });
    throw e;
  }
}));

app.patch('/api/citas/:id/cancelar', h(async (req, res) => {
  const { rowCount } = await pool.query(
    "UPDATE citas SET estado = 'cancelada' WHERE id = $1", [req.params.id]);
  if (!rowCount) return res.status(404).json({ error: 'Cita no encontrada.' });
  res.json({ ok: true });
}));

const port = process.env.PORT || 3001;
app.listen(port, () => console.log(`API en http://localhost:${port}`));