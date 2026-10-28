# Agenda de citas · Veterinaria (React + Express + PostgreSQL, todo local)

Requisitos: Node 18+ y PostgreSQL instalado y corriendo.

## 1. Base de datos
```bash
createdb -U postgres veterinaria
psql -U postgres -d veterinaria -f database/schema.sql
```

## 2. API (puerto 3001)
```bash
cd server
cp .env.example .env     # edita DATABASE_URL con tu usuario y clave
npm install
npm run dev
```

## 3. Página (puerto 5173)
```bash
cd client
npm install
npm run dev
```
Abre http://localhost:5173

## Qué incluye
- Lista de próximas citas agrupadas por día.
- Formulario para agendar más citas (valida fecha futura y evita que un veterinario tenga dos citas a la misma hora).
- Botón para cancelar citas.
- Veterinarios de ejemplo en `database/schema.sql`: edítalos o agrega los reales.
