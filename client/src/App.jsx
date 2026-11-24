import { useEffect, useState } from "react";

const vacio = {
  mascota: "",
  especie: "Perro",
  dueno: "",
  telefono: "",
  motivo: "",
  veterinario_id: "",
  fecha_hora: "",
};
const especies = ["Perro", "Gato", "Ave", "Conejo", "Otro"];

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

function minLocal() {
  const d = new Date(Date.now() - new Date().getTimezoneOffset() * 60000);
  return d.toISOString().slice(0, 16);
}

export default function App() {
  const [citas, setCitas] = useState([]);
  const [vets, setVets] = useState([]);
  const [form, setForm] = useState(vacio);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [cargando, setCargando] = useState(true);

  const cargar = async () => {
    try {
      const [c, v] = await Promise.all([
        fetch("/api/citas"),
        fetch("/api/veterinarios"),
      ]);
      if (!c.ok || !v.ok) throw new Error("api");
      setCitas(await c.json());
      setVets(await v.json());
      setError("");
    } catch {
      setError(
        "No se pudo cargar la agenda. Revisa que el servidor y la base de datos estén funcionando.",
      );
    }
    setCargando(false);
  };
  useEffect(() => {
    cargar();
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const agendar = async (e) => {
    e.preventDefault();
    setError("");
    setOk("");
    const res = await fetch("/api/citas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        fecha_hora: new Date(form.fecha_hora).toISOString(),
      }),
    });
    const data = await res.json();
    if (!res.ok) return setError(data.error);
    setOk(`Cita agendada para ${form.mascota}.`);
    setForm(vacio);
    cargar();
  };

  const cancelar = async (c) => {
    if (!confirm(`¿Cancelar la cita de ${c.mascota}?`)) return;
    await fetch(`/api/citas/${c.id}/cancelar`, { method: "PATCH" });
    cargar();
  };

  const porDia = citas.reduce((acc, c) => {
    (acc[dia(c.fecha_hora)] ||= []).push(c);
    return acc;
  }, {});

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
                  <time>{hora(c.fecha_hora)}</time>
                  <div className="info">
                    <strong>
                      {c.mascota} <span className="especie">{c.especie}</span>
                    </strong>
                    <span>{c.motivo}</span>
                    <span className="meta">
                      Dueño: {c.dueno}
                      {c.telefono && `, ${c.telefono}`} · {c.veterinario}
                    </span>
                  </div>
                  <button className="link" onClick={() => cancelar(c)}>
                    Cancelar
                  </button>
                </article>
              ))}
            </div>
          ))}
        </section>

        <aside>
          <form onSubmit={agendar}>
            <h2>Agendar cita</h2>
            <label>
              Mascota
              <input required value={form.mascota} onChange={set("mascota")} />
            </label>
            <label>
              Especie
              <select value={form.especie} onChange={set("especie")}>
                {especies.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Nombre del dueño
              <input required value={form.dueno} onChange={set("dueno")} />
            </label>
            <label>
              Teléfono
              <input
                type="tel"
                value={form.telefono}
                onChange={set("telefono")}
              />
            </label>
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
            <button className="primario" type="submit">
              Agendar cita
            </button>
          </form>
        </aside>
      </main>
    </div>
  );
}
