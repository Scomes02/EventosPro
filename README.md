# EventosPro

Plataforma de venta de entradas para shows en vivo, con **elección de butacas estilo cine**.
Proyecto de portfolio de **Santiago Comes · Cumbre Estudio**. Todos los eventos, artistas y recintos son ficticios, y los pagos son simulados.

**Cuenta demo:** `demo@eventospro.app` / `demo1234`

## Qué hace

- Cartelera con búsqueda y filtros por ciudad y género.
- Mapa de sala mixto: **butacas numeradas** (fila y asiento) y **sectores de campo** (entrada general por cantidad).
- Compra segura: transacción con `SELECT … FOR UPDATE`, así dos personas no pueden comprar la misma butaca. El campo usa `SKIP LOCKED` para que las compras simultáneas no se bloqueen entre sí.
- Entradas con **código QR** (firmado con HMAC en el servidor).
- Cuentas con contraseña (bcrypt) y sesión con JWT.
- Opiniones: solo quienes compraron pueden opinar, y solo cuando el evento ya terminó.
- Panel `/#/admin` de descuentos, protegido con clave.

## Stack

| Capa | Tecnología |
|---|---|
| Front | HTML, CSS y JavaScript sin frameworks (SPA con router por hash) |
| API | Función serverless de Vercel (Node.js) en `api/index.js` |
| Base de datos | PostgreSQL (Neon), esquema normalizado en `db/schema.sql` |

## Estructura

```
api/index.js      todas las rutas de la API (/api/*)
lib/db.js         pool de PostgreSQL y transacciones
db/schema.sql     esquema (migración 1:1 del MySQL original + password_hash)
db/seed.js        crea el esquema y carga la demo (fechas relativas a hoy)
public/           front: index.html, css/app.css, js/app.js
dev.js            servidor local que imita a Vercel
vercel.json       redirige /api/* a la función
```

## Correr en tu PC

1. Instalá dependencias: `npm install`
2. Copiá `.env.example` como `.env.local` y completá `DATABASE_URL`.
3. Cargá la demo: `npm run seed` (lee `.env.local` solo).
4. Levantá el sitio: `npm run dev` → http://localhost:3000

## Publicar en Vercel

1. Importá el repositorio en Vercel (framework *Other*; `vercel.json` ya define todo).
2. En el proyecto: **Storage → Create Database → Neon (Postgres)** y conectala. Vercel crea `DATABASE_URL` sola.
3. Opcional: en **Settings → Environment Variables** agregá `JWT_SECRET` (si no está, se deriva de la conexión) y `ADMIN_KEY` (sin ella, el panel admin queda desactivado).
4. **Redeploy**. La primera visita crea las tablas y carga la demo sola.

La demo se reinicia sola cuando quedan menos de 4 eventos por venir. Para reiniciarla a mano: `npm run seed` con la `DATABASE_URL` en `.env.local`.

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/events?q=&ciudad=&genero=` | Cartelera con precio desde y disponibilidad |
| GET | `/api/filters` | Ciudades y géneros con eventos |
| GET | `/api/events/:id` | Detalle del evento |
| GET | `/api/events/:id/seats` | Mapa de butacas por sector |
| GET / POST | `/api/events/:id/reviews` | Opiniones (POST requiere sesión y haber comprado) |
| POST | `/api/register`, `/api/login` | Devuelven `{ token, id_cliente, nombre }` |
| GET | `/api/metodos-pago` | Medios de pago |
| POST | `/api/purchase` | `{ id_evento, id_metodo_pago, butacas:[ids], bloques:{id_sector: cantidad} }` |
| GET | `/api/mis-compras`, `/api/compras/:id` | Compras y entradas con QR del usuario |
| GET / POST | `/api/descuentos` | Panel admin (header `X-Admin-Key`) |

## Historia del proyecto

Nació como trabajo de la facultad en PHP + MySQL. Pasó a Node.js con Netlify Functions y, en esta versión, a Vercel con PostgreSQL, con contraseñas reales, escape de todo el contenido del usuario y un rediseño completo del front.
