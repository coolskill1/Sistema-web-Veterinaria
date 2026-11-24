import { useEffect, useMemo, useState } from "react";

const NUEVO = "__nuevo__";
const especies = ["Perro", "Gato", "Ave", "Conejo", "Otro"];
const duraciones = [15, 30, 45, 60];
const ESTADOS_ACTIVOS = ["programada", "confirmada", "en_curso"];
const etiquetaEstado = {
  programada: "Programada",
  confirmada: "Confirmada",
  en_curso: "En curso",
  completada: "Completada",
  cancelada: "Cancelada",
  no_asistio: "No asistió",
};

const formVacio = {
  duenoId: "",
  dueno: { nombre: "", telefono: "", correo: "" },
  mascotaId: "",
  mascota: { nombre: "", especie: "Perro", raza: "", fecha_nacimiento: "" },
  veterinario_id: "",
  fecha_hora: "",
  duracion_minutos: 30,
  motivo: "",
};

const dia = (iso) =>
  new Date(iso).toLocaleDateString("es-CL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

const hora = (iso) =>
  new Date(iso).toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  });

const rangoHoras = (c) => {
  const inicio = new Date(c.fecha_hora);
  const fin = new Date(inicio.getTime() + c.duracion_minutos * 60000);
  return `${hora(inicio)} – ${hora(fin)}`;
};

// Valor mínimo para <input type="datetime-local"> en la hora local del navegador.
function minLocal() {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    // Respuesta sin cuerpo JSON (por ejemplo, 204).
  }
  if (!res.ok) {
    const err = new Error(data?.error || "Error en el servidor.");
    err.status = res.status;
    throw err;
  }
  return data;
}

export default function App() {
  const [citas, setCitas] = useState([]);
  const [vets, setVets] = useState([]);
  const [duenos, setDuenos] = useState([]);
  const [mascotas, setMascotas] = useState([]);
  const [form, setForm] = useState(formVacio);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [cargando, setCargando] = useState(true);
  const [enviando, setEnviando] = useState(false);

  const cargar = async () => {
    try {
      const [c, v, d, m] = await Promise.all([
        api(`/api/citas?desde=${encodeURIComponent(new Date().toISOString())}`),
        api("/api/veterinarios"),
        api("/api/duenos"),
        api("/api/mascotas"),
      ]);
      setCitas(c);
      setVets(v);
      setDuenos(d);
      setMascotas(m);
      setError("");
    } catch {
      setError(
        "No se pudo cargar la agenda. Revisa que el servidor y la base de datos estén funcionando.",
      );
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  const mascotasDelDueno = useMemo(
    () => mascotas.filter((m) => String(m.dueno_id) === String(form.duenoId)),
    [mascotas, form.duenoId],
  );

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const setDueno = (k) => (e) =>
    setForm((f) => ({ ...f, dueno: { ...f.dueno, [k]: e.target.value } }));

  const setMascota = (k) => (e) =>
    setForm((f) => ({ ...f, mascota: { ...f.mascota, [k]: e.target.value } }));

  // Al cambiar de dueño, la mascota seleccionada deja de ser válida.
  const cambiarDueno = (e) =>
    setForm((f) => ({ ...f, duenoId: e.target.value, mascotaId: "" }));

  const agendar = async (e) => {
    e.preventDefault();
    setError("");
    setOk("");
    setEnviando(true);

    try {
      // 1. Dueño nuevo: se crea y el formulario pasa a usar su id real,
      //    para que un reintento no vuelva a crearlo.
      if (form.duenoId === NUEVO) {
        const creado = await api("/api/duenos", {
          method: "POST",
          body: {
            nombre: form.dueno.nombre.trim(),
            telefono: form.dueno.telefono.trim() || null,
            correo: form.dueno.correo.trim() || null,
          },
        });
        setForm((f) => ({ ...f, duenoId: String(creado.id) }));
        form.duenoId = String(creado.id);
      }

      // 2. Mascota nueva: se crea asociada al dueño.
      let nombreMascota = "";
      if (form.mascotaId === NUEVO) {
        const m = form.mascota;
        const creada = await api("/api/mascotas", {
          method: "POST",
          body: {
            dueno_id: Number(form.duenoId),
            nombre: m.nombre.trim(),
            especie: m.especie,
            raza: m.raza.trim() || null,
            fecha_nacimiento: m.fecha_nacimiento || null,
          },
        });
        setForm((f) => ({ ...f, mascotaId: String(creada.id) }));
        form.mascotaId = String(creada.id);
        nombreMascota = creada.nombre;
      } else {
        nombreMascota =
          mascotas.find((m) => String(m.id) === String(form.mascotaId))
            ?.nombre ?? "";
      }

      // 3. La cita. PostgreSQL valida el solapamiento y el backend
      //    responde 409 si el horario ya está ocupado.
      await api("/api/citas", {
        method: "POST",
        body: {
          mascota_id: Number(form.mascotaId),
          veterinario_id: Number(form.veterinario_id),
          fecha_hora: new Date(form.fecha_hora).toISOString(),
          duracion_minutos: Number(form.duracion_minutos),
          motivo: form.motivo.trim(),
        },
      });

      setOk(`Cita agendada para ${nombreMascota}.`);
      setForm(formVacio);
      await cargar();
    } catch (err) {
      setError(
        err.status === 409
          ? "Ese veterinario ya tiene una cita que se cruza con ese horario. Elige otra hora."
          : err.message,
      );
      // Si ya se creó un dueño o una mascota, recarga las listas para
      // que aparezcan en los selectores.
      await cargar();
    } finally {
      setEnviando(false);
    }
  };

  const cancelar = async (c) => {
    if (!confirm(`¿Cancelar la cita de ${c.mascota}?`)) return;
    try {
      await api(`/api/citas/${c.id}/cancelar`, { method: "PATCH" });
      cargar();
    } catch (err) {
      setError(err.message);
    }
  };

  const porDia = citas.reduce((acc, c) => {
    (acc[dia(c.fecha_hora)] ||= []).push(c);
    return acc;
  }, {});

  const nuevoDueno = form.duenoId === NUEVO;
  const nuevaMascota = form.mascotaId === NUEVO;

  return (
    <div className="page">
      <header>
        <h1>Agenda de la clínica</h1>
        <p>
          {citas.length}{" "}
          {citas.length === 1 ? "cita próxima" : "citas próximas"}
        </p>
      </header>

      <main>
        <section aria-label="Próximas citas">
          {cargando && <p className="vacio">Cargando citas…</p>}
          {!cargando && citas.length === 0 && (
            <p className="vacio">
              No hay citas próximas. Agenda la primera con el formulario.
            </p>
          )}
          {Object.entries(porDia).map(([d, lista]) => (
            <div className="dia" key={d}>
              <h2>{d}</h2>
              {lista.map((c) => (
                <article className="cita" key={c.id}>
                  <time>{rangoHoras(c)}</time>
                  <div className="info">
                    <strong>
                      {c.mascota} <span className="especie">{c.especie}</span>
                    </strong>
                    <span>{c.motivo}</span>
                    <span className="meta">
                      Dueño: {c.dueno}
                      {c.telefono && `, ${c.telefono}`} · {c.veterinario} ·{" "}
                      {etiquetaEstado[c.estado] ?? c.estado}
                    </span>
                  </div>
                  {ESTADOS_ACTIVOS.includes(c.estado) && (
                    <button className="link" onClick={() => cancelar(c)}>
                      Cancelar
                    </button>
                  )}
                </article>
              ))}
            </div>
          ))}
        </section>

        <aside>
          <form onSubmit={agendar}>
            <h2>Agendar cita</h2>

            <label>
              Dueño
              <select required value={form.duenoId} onChange={cambiarDueno}>
                <option value="">Elige un dueño</option>
                {duenos.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.nombre}
                  </option>
                ))}
                <option value={NUEVO}>+ Nuevo dueño</option>
              </select>
            </label>

            {nuevoDueno && (
              <fieldset>
                <legend>Datos del nuevo dueño</legend>
                <label>
                  Nombre
                  <input
                    required
                    value={form.dueno.nombre}
                    onChange={setDueno("nombre")}
                  />
                </label>
                <label>
                  Teléfono
                  <input
                    type="tel"
                    value={form.dueno.telefono}
                    onChange={setDueno("telefono")}
                  />
                </label>
                <label>
                  Correo
                  <input
                    type="email"
                    value={form.dueno.correo}
                    onChange={setDueno("correo")}
                  />
                </label>
              </fieldset>
            )}

            {form.duenoId && (
              <label>
                Mascota
                <select
                  required
                  value={form.mascotaId}
                  onChange={set("mascotaId")}
                >
                  <option value="">Elige una mascota</option>
                  {mascotasDelDueno.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nombre} · {m.especie}
                    </option>
                  ))}
                  <option value={NUEVO}>+ Nueva mascota</option>
                </select>
              </label>
            )}

            {nuevaMascota && (
              <fieldset>
                <legend>Datos de la nueva mascota</legend>
                <label>
                  Nombre
                  <input
                    required
                    value={form.mascota.nombre}
                    onChange={setMascota("nombre")}
                  />
                </label>
                <label>
                  Especie
                  <select
                    value={form.mascota.especie}
                    onChange={setMascota("especie")}
                  >
                    {especies.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Raza
                  <input
                    value={form.mascota.raza}
                    onChange={setMascota("raza")}
                  />
                </label>
                <label>
                  Fecha de nacimiento
                  <input
                    type="date"
                    value={form.mascota.fecha_nacimiento}
                    onChange={setMascota("fecha_nacimiento")}
                  />
                </label>
              </fieldset>
            )}

            <label>
              Motivo de la consulta
              <input
                required
                value={form.motivo}
                onChange={set("motivo")}
                placeholder="Vacuna, control, herida…"
              />
            </label>

            <label>
              Veterinario
              <select
                required
                value={form.veterinario_id}
                onChange={set("veterinario_id")}
              >
                <option value="">Elige uno</option>
                {vets.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nombre} · {v.especialidad}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Fecha y hora
              <input
                type="datetime-local"
                required
                min={minLocal()}
                value={form.fecha_hora}
                onChange={set("fecha_hora")}
              />
            </label>

            <label>
              Duración
              <select
                value={form.duracion_minutos}
                onChange={set("duracion_minutos")}
              >
                {duraciones.map((d) => (
                  <option key={d} value={d}>
                    {d} minutos
                  </option>
                ))}
              </select>
            </label>

            {error && (
              <p className="msg error" role="alert">
                {error}
              </p>
            )}
            {ok && (
              <p className="msg ok" role="status">
                {ok}
              </p>
            )}

            <button className="primario" type="submit" disabled={enviando}>
              {enviando ? "Agendando…" : "Agendar cita"}
            </button>
          </form>
        </aside>
      </main>
    </div>
  );
}
