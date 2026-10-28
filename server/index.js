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

app.get('/api/veterinarios', h(async (_req, res) => {
  const { rows } = await pool.query('SELECT * FROM veterinarios ORDER BY nombre');
  res.json(rows);
}));

app.get('/api/citas', h(async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT c.*, v.nombre AS veterinario
    FROM citas c JOIN veterinarios v ON v.id = c.veterinario_id
    WHERE c.estado = 'programada' AND c.fecha_hora >= now()
    ORDER BY c.fecha_hora`);
  res.json(rows);
}));

app.post('/api/citas', h(async (req, res) => {
  const { mascota, especie, dueno, telefono, motivo, veterinario_id, fecha_hora } = req.body;
  if (!mascota || !dueno || !motivo || !veterinario_id || !fecha_hora)
    return res.status(400).json({ error: 'Completa todos los campos obligatorios.' });
  if (new Date(fecha_hora) < new Date())
    return res.status(400).json({ error: 'La fecha debe ser futura.' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO citas (mascota, especie, dueno, telefono, motivo, veterinario_id, fecha_hora)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
      [mascota, especie || 'Perro', dueno, telefono || null, motivo, veterinario_id, fecha_hora]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    if (e.code === '23505')
      return res.status(409).json({ error: 'Ese veterinario ya tiene una cita a esa hora.' });
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
