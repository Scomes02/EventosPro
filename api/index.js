// EventosPro · API (una sola función serverless de Vercel; vercel.json redirige /api/* acá)
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { query, withTransaction, ensureSeeded } = require('../lib/db');

const MAX_ENTRADAS_POR_COMPRA = 10;

// Si no se configuró JWT_SECRET, se deriva una clave de la cadena de conexión
// (que ya es secreta). Así el deploy funciona sin pasos extra; igual conviene definirla.
function jwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const db = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (db) return crypto.createHash('sha256').update('eventospro-jwt:' + db).digest('hex');
  return 'solo-para-desarrollo-local';
}

function httpError(statusCode, message) {
  const e = new Error(message);
  e.statusCode = statusCode;
  return e;
}

function signToken(c) {
  return jwt.sign({ id_cliente: c.id_cliente, nombre: c.nombre }, jwtSecret(), { expiresIn: '7d' });
}

function authFrom(req) {
  const m = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  try { return jwt.verify(m[1], jwtSecret()); } catch { return null; }
}

function requireAuth(req) {
  const c = authFrom(req);
  if (!c) throw httpError(401, 'Iniciá sesión para continuar.');
  return c;
}

function requireAdmin(req) {
  const key = req.headers['x-admin-key'];
  const expected = process.env.ADMIN_KEY || '';
  const ok = expected && key && key.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(key), Buffer.from(expected));
  if (!ok) throw httpError(401, 'Clave de administrador incorrecta.');
}

const isId = (v) => /^\d{1,9}$/.test(String(v));
function asId(v, what = 'id') {
  if (!isId(v)) throw httpError(400, `El ${what} no es válido.`);
  return Number(v);
}

// Código del ticket: HMAC corto, imposible de adivinar sin el secreto del servidor
function ticketCode(id_compra, id_entrada) {
  return crypto.createHmac('sha256', jwtSecret()).update(`${id_compra}-${id_entrada}`).digest('hex').slice(0, 12).toUpperCase();
}

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body) {
    try { return JSON.parse(req.body); } catch { throw httpError(400, 'El cuerpo de la petición no es JSON válido.'); }
  }
  return {};
}

function routeSegments(req) {
  const fromRewrite = req.query && req.query.path;
  const raw = fromRewrite != null ? String(fromRewrite) : new URL(req.url, 'http://x').pathname.replace(/^\/api\/?/, '');
  return raw.split('/').filter(Boolean);
}

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const send = (status, data) => res.status(status).json(data);
  if (req.method === 'OPTIONS') return send(204, {});

  const segs = routeSegments(req);
  const method = req.method;
  const q = req.query || {};

  try {
    await ensureSeeded();
    const [a, b, c] = segs;

    // ---------- catálogo ----------
    if (a === 'events' && !b && method === 'GET') return send(200, await listEvents(q));
    if (a === 'filters' && method === 'GET') return send(200, await filters());
    if (a === 'events' && b && !c && method === 'GET') {
      const ev = await getEvent(asId(b, 'evento'));
      if (!ev) throw httpError(404, 'No encontramos ese evento.');
      return send(200, ev);
    }
    if (a === 'events' && c === 'seats' && method === 'GET') return send(200, await getSeatMap(asId(b, 'evento')));
    if (a === 'events' && c === 'reviews' && method === 'GET') return send(200, await getReviews(asId(b, 'evento')));
    if (a === 'events' && c === 'reviews' && method === 'POST') {
      const cli = requireAuth(req);
      return send(201, await addReview(asId(b, 'evento'), cli.id_cliente, readBody(req)));
    }
    if (a === 'metodos-pago' && method === 'GET') {
      return send(200, await query('SELECT id_metodo_pago, nombre FROM metodo_pago ORDER BY id_metodo_pago'));
    }

    // ---------- cuenta ----------
    if (a === 'register' && method === 'POST') {
      const cli = await register(readBody(req));
      return send(201, { ...cli, token: signToken(cli) });
    }
    if (a === 'login' && method === 'POST') {
      const cli = await login(readBody(req));
      return send(200, { ...cli, token: signToken(cli) });
    }
    if (a === 'me' && method === 'GET') {
      const cli = requireAuth(req);
      const rows = await query('SELECT id_cliente, nombre, apellido, email FROM cliente WHERE id_cliente = $1', [cli.id_cliente]);
      if (!rows.length) throw httpError(401, 'Tu sesión venció. Volvé a ingresar.');
      return send(200, rows[0]);
    }

    // ---------- compras ----------
    if (a === 'purchase' && method === 'POST') {
      const cli = requireAuth(req);
      return send(201, await purchase(cli.id_cliente, readBody(req)));
    }
    if (a === 'mis-compras' && method === 'GET') {
      const cli = requireAuth(req);
      return send(200, await myPurchases(cli.id_cliente));
    }
    if (a === 'compras' && b && method === 'GET') {
      const cli = requireAuth(req);
      return send(200, await purchaseDetail(asId(b, 'número de compra'), cli.id_cliente));
    }

    // ---------- admin ----------
    if (a === 'descuentos' && method === 'GET') { requireAdmin(req); return send(200, await listDiscounts()); }
    if (a === 'descuentos' && method === 'POST') { requireAdmin(req); return send(201, await createDiscount(readBody(req))); }

    throw httpError(404, 'Ruta no encontrada.');
  } catch (err) {
    if (!err.statusCode) console.error(err);
    return send(err.statusCode || 500, { error: err.statusCode ? err.message : 'Algo falló en el servidor. Probá de nuevo en unos segundos.' });
  }
};

// ============================================================
// CATÁLOGO
// ============================================================
const EVENT_SELECT = `
  SELECT e.id_evento, e.nombre, e.descripcion,
         to_char(e.fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio,
         to_char(e.fecha_fin, 'YYYY-MM-DD') AS fecha_fin,
         (e.fecha_fin < CURRENT_DATE) AS finalizado,
         r.nombre AS recinto_nombre, r.direccion AS recinto_direccion,
         ci.nombre AS ciudad_nombre, p.nombre AS provincia_nombre,
         a.nombre AS artista_nombre,
         (SELECT string_agg(g.nombre, ', ' ORDER BY g.nombre) FROM artista_genero ag
            JOIN genero g ON g.id_genero = ag.id_genero WHERE ag.id_artista = a.id_artista) AS generos,
         (SELECT ROUND(AVG(puntuacion)::numeric, 1) FROM resenas re WHERE re.id_evento = e.id_evento) AS calificacion,
         (SELECT COUNT(*) FROM resenas re WHERE re.id_evento = e.id_evento)::int AS cantidad_resenas,
         (SELECT MIN(precio_final) FROM entrada en WHERE en.id_evento = e.id_evento AND en.estado = 'disponible') AS precio_desde,
         (SELECT COUNT(*) FROM entrada en WHERE en.id_evento = e.id_evento AND en.estado = 'disponible')::int AS disponibles,
         (SELECT COUNT(*) FROM entrada en WHERE en.id_evento = e.id_evento)::int AS total_entradas
  FROM evento e
  LEFT JOIN recinto r  ON e.id_recinto = r.id_recinto
  LEFT JOIN ciudad ci  ON r.id_ciudad = ci.id_ciudad
  LEFT JOIN provincia p ON ci.id_provincia = p.id_provincia
  LEFT JOIN artista a  ON e.id_artista = a.id_artista`;

async function listEvents({ q, ciudad, genero }) {
  const where = [];
  const params = [];
  if (q && String(q).trim()) {
    params.push(`%${String(q).trim().slice(0, 60)}%`);
    where.push(`(e.nombre ILIKE $${params.length} OR a.nombre ILIKE $${params.length} OR r.nombre ILIKE $${params.length})`);
  }
  if (ciudad && isId(ciudad)) { params.push(Number(ciudad)); where.push(`ci.id_ciudad = $${params.length}`); }
  if (genero && isId(genero)) {
    params.push(Number(genero));
    where.push(`EXISTS (SELECT 1 FROM artista_genero ag WHERE ag.id_artista = a.id_artista AND ag.id_genero = $${params.length})`);
  }
  const sql = `${EVENT_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY (e.fecha_fin < CURRENT_DATE), e.fecha_inicio`;
  return query(sql, params);
}

async function filters() {
  const [ciudades, generos] = await Promise.all([
    query(`SELECT DISTINCT ci.id_ciudad, ci.nombre FROM evento e JOIN recinto r ON r.id_recinto = e.id_recinto
           JOIN ciudad ci ON ci.id_ciudad = r.id_ciudad ORDER BY ci.nombre`),
    query(`SELECT DISTINCT g.id_genero, g.nombre FROM evento e JOIN artista_genero ag ON ag.id_artista = e.id_artista
           JOIN genero g ON g.id_genero = ag.id_genero ORDER BY g.nombre`),
  ]);
  return { ciudades, generos };
}

async function getEvent(id) {
  const rows = await query(`${EVENT_SELECT} WHERE e.id_evento = $1`, [id]);
  return rows[0] || null;
}

// Mapa mixto: butacas numeradas (fila + asiento) y sectores tipo campo (sin butaca)
async function getSeatMap(id_evento) {
  const rows = await query(`
    SELECT en.id_entrada, en.id_sector, en.fila, en.numero_asiento, en.precio_final, en.estado,
           s.nombre_sector, s.precio_base, s.capacidad_sector
    FROM entrada en JOIN sector s ON en.id_sector = s.id_sector
    WHERE en.id_evento = $1
    ORDER BY s.precio_base DESC, s.id_sector, en.fila, en.numero_asiento`, [id_evento]);

  const sectores = new Map();
  for (const r of rows) {
    if (!sectores.has(r.id_sector)) {
      sectores.set(r.id_sector, {
        id_sector: r.id_sector, nombre_sector: r.nombre_sector,
        precio_base: Number(r.precio_base), capacidad_sector: r.capacidad_sector,
        tipo: 'numerado', butacas: [], disponibles: 0, total: 0, precio_bloque: null,
      });
    }
    const sec = sectores.get(r.id_sector);
    sec.total++;
    if (r.estado === 'disponible') sec.disponibles++;
    if (r.fila && Number(r.numero_asiento) > 0) {
      sec.butacas.push({ id_entrada: r.id_entrada, fila: r.fila, numero_asiento: r.numero_asiento,
        precio: Number(r.precio_final), estado: r.estado });
    } else {
      sec.tipo = 'bloque';
      sec.precio_bloque = Number(r.precio_final);
    }
  }
  // Los ids de campo no se mandan al cliente: el servidor elige los libres al comprar
  return [...sectores.values()].map((s) => (s.tipo === 'bloque' ? { ...s, butacas: [] } : s));
}

async function getReviews(id_evento) {
  return query(`
    SELECT r.id_resena, r.puntuacion, r.comentario, to_char(r.fecha_resena, 'YYYY-MM-DD') AS fecha_resena,
           c.nombre, LEFT(COALESCE(c.apellido, ''), 1) AS inicial
    FROM resenas r JOIN cliente c ON r.id_cliente = c.id_cliente
    WHERE r.id_evento = $1 ORDER BY r.fecha_resena DESC, r.id_resena DESC`, [id_evento]);
}

async function addReview(id_evento, id_cliente, { puntuacion, comentario }) {
  const p = Number(puntuacion);
  if (!Number.isInteger(p) || p < 1 || p > 5) throw httpError(400, 'Elegí una puntuación de 1 a 5 estrellas.');
  const texto = String(comentario || '').trim().slice(0, 255);
  const ev = await getEvent(id_evento);
  if (!ev) throw httpError(404, 'No encontramos ese evento.');
  if (!ev.finalizado) throw httpError(400, 'Vas a poder opinar cuando el evento haya terminado.');
  const asistio = await query(`
    SELECT 1 FROM compra c JOIN detalle_compra d ON d.id_compra = c.id_compra
    JOIN entrada en ON en.id_entrada = d.id_entrada
    WHERE c.id_cliente = $1 AND en.id_evento = $2 LIMIT 1`, [id_cliente, id_evento]);
  if (!asistio.length) throw httpError(403, 'Solo pueden opinar quienes compraron entradas para este evento.');
  const ya = await query('SELECT 1 FROM resenas WHERE id_cliente = $1 AND id_evento = $2', [id_cliente, id_evento]);
  if (ya.length) throw httpError(409, 'Ya dejaste tu reseña para este evento.');
  await query('INSERT INTO resenas (id_evento, id_cliente, puntuacion, comentario, fecha_resena) VALUES ($1,$2,$3,$4,CURRENT_DATE)',
    [id_evento, id_cliente, p, texto || null]);
  return { ok: true };
}

// ============================================================
// CUENTA
// ============================================================
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function register(body) {
  const nombre = String(body.nombre || '').trim().slice(0, 100);
  const apellido = String(body.apellido || '').trim().slice(0, 100);
  const dni = String(body.dni || '').replace(/\D/g, '');
  const email = String(body.email || '').trim().toLowerCase().slice(0, 100);
  const telefono = String(body.telefono || '').trim().slice(0, 20) || null;
  const password = String(body.password || '');

  if (!nombre || !apellido) throw httpError(400, 'Completá tu nombre y apellido.');
  if (dni.length < 7 || dni.length > 9) throw httpError(400, 'El DNI tiene que tener entre 7 y 9 números.');
  if (!EMAIL_RE.test(email)) throw httpError(400, 'Revisá el email: no parece válido.');
  if (password.length < 8) throw httpError(400, 'La contraseña tiene que tener al menos 8 caracteres.');

  const existentes = await query('SELECT 1 FROM cliente WHERE dni = $1 OR LOWER(email) = $2', [dni, email]);
  if (existentes.length) throw httpError(409, 'Ya hay una cuenta con ese DNI o email. Probá ingresar.');

  const hash = await bcrypt.hash(password, 10);
  const rows = await query(
    'INSERT INTO cliente (nombre, apellido, dni, email, telefono, password_hash) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id_cliente, nombre',
    [nombre, apellido, dni, email, telefono, hash]);
  return rows[0];
}

async function login(body) {
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!email || !password) throw httpError(400, 'Ingresá tu email y tu contraseña.');
  const rows = await query('SELECT id_cliente, nombre, password_hash FROM cliente WHERE LOWER(email) = $1', [email]);
  const cli = rows[0];
  const ok = cli && cli.password_hash && await bcrypt.compare(password, cli.password_hash);
  if (!ok) throw httpError(401, 'El email o la contraseña no coinciden.');
  return { id_cliente: cli.id_cliente, nombre: cli.nombre };
}

// ============================================================
// COMPRAS (respeta el esquema normalizado: compra → detalle_compra → entrada,
// y el pago en compra_metodo_pago). El pago es SIMULADO: es una demo.
// ============================================================
async function purchase(id_cliente, body) {
  const id_evento = asId(body.id_evento, 'evento');
  const id_metodo_pago = asId(body.id_metodo_pago, 'método de pago');
  const butacas = Array.isArray(body.butacas) ? [...new Set(body.butacas.map(Number))] : [];
  const bloques = body.bloques && typeof body.bloques === 'object' ? body.bloques : {};
  if (butacas.some((x) => !Number.isInteger(x) || x <= 0)) throw httpError(400, 'Hay butacas inválidas en tu selección.');

  const pedidosBloque = Object.entries(bloques)
    .map(([sec, cant]) => [asId(sec, 'sector'), Number(cant)])
    .filter(([, cant]) => cant > 0);
  if (pedidosBloque.some(([, c]) => !Number.isInteger(c))) throw httpError(400, 'Cantidad inválida.');
  const cantidad = butacas.length + pedidosBloque.reduce((a, [, c]) => a + c, 0);
  if (!cantidad) throw httpError(400, 'Elegí al menos una entrada.');
  if (cantidad > MAX_ENTRADAS_POR_COMPRA) throw httpError(400, `Podés comprar hasta ${MAX_ENTRADAS_POR_COMPRA} entradas por compra.`);

  return withTransaction(async (db) => {
    const ev = (await db.query('SELECT id_evento, fecha_fin < CURRENT_DATE AS finalizado FROM evento WHERE id_evento = $1', [id_evento])).rows[0];
    if (!ev) throw httpError(404, 'No encontramos ese evento.');
    if (ev.finalizado) throw httpError(400, 'Este evento ya terminó.');
    const metodo = (await db.query('SELECT 1 FROM metodo_pago WHERE id_metodo_pago = $1', [id_metodo_pago])).rows[0];
    if (!metodo) throw httpError(400, 'Elegí un método de pago.');

    const elegidas = [];
    if (butacas.length) {
      const { rows } = await db.query(
        `SELECT id_entrada, precio_final, estado, fila, numero_asiento FROM entrada
         WHERE id_entrada = ANY($1::int[]) AND id_evento = $2 FOR UPDATE`, [butacas, id_evento]);
      if (rows.length !== butacas.length) throw httpError(400, 'Alguna butaca no pertenece a este evento.');
      const ocupada = rows.find((r) => r.estado !== 'disponible');
      if (ocupada) throw httpError(409, `La butaca ${ocupada.fila}${ocupada.numero_asiento} se acaba de vender. Elegí otra.`);
      elegidas.push(...rows);
    }
    for (const [id_sector, cant] of pedidosBloque) {
      // SKIP LOCKED: dos personas comprando campo al mismo tiempo no se bloquean entre sí
      const { rows } = await db.query(
        `SELECT id_entrada, precio_final FROM entrada
         WHERE id_evento = $1 AND id_sector = $2 AND estado = 'disponible' AND fila IS NULL
         ORDER BY id_entrada LIMIT $3 FOR UPDATE SKIP LOCKED`, [id_evento, id_sector, cant]);
      if (rows.length < cant) throw httpError(409, `Quedan ${rows.length} entradas en ese sector.`);
      elegidas.push(...rows);
    }

    const total = elegidas.reduce((acc, r) => acc + Number(r.precio_final), 0);
    const { rows: [compra] } = await db.query(
      "INSERT INTO compra (id_cliente, fecha_compra, monto_total, estado) VALUES ($1, CURRENT_DATE, $2, 'pagada') RETURNING id_compra",
      [id_cliente, total]);
    await db.query('INSERT INTO compra_metodo_pago (id_compra, id_metodo_pago, monto_pagado) VALUES ($1,$2,$3)',
      [compra.id_compra, id_metodo_pago, total]);
    for (const r of elegidas) {
      const { rows: [det] } = await db.query(
        'INSERT INTO detalle_compra (id_compra, id_entrada, precio_unitario) VALUES ($1,$2,$3) RETURNING id_detalle',
        [compra.id_compra, r.id_entrada, r.precio_final]);
      await db.query("UPDATE entrada SET estado = 'vendida', id_detalle = $1 WHERE id_entrada = $2", [det.id_detalle, r.id_entrada]);
    }
    return { id_compra: compra.id_compra, total, cantidad: elegidas.length };
  });
}

async function myPurchases(id_cliente) {
  return query(`
    SELECT c.id_compra, to_char(c.fecha_compra, 'YYYY-MM-DD') AS fecha_compra, c.monto_total, c.estado,
           ev.id_evento, ev.nombre AS evento_nombre, to_char(ev.fecha_inicio, 'YYYY-MM-DD') AS fecha_evento,
           (ev.fecha_fin < CURRENT_DATE) AS finalizado, a.nombre AS artista_nombre, r.nombre AS recinto_nombre,
           (SELECT string_agg(g.nombre, ', ') FROM artista_genero ag JOIN genero g ON g.id_genero = ag.id_genero
              WHERE ag.id_artista = ev.id_artista) AS generos,
           COUNT(d.id_detalle)::int AS cantidad
    FROM compra c
    JOIN detalle_compra d ON d.id_compra = c.id_compra
    JOIN entrada en ON en.id_entrada = d.id_entrada
    JOIN evento ev ON ev.id_evento = en.id_evento
    LEFT JOIN artista a ON a.id_artista = ev.id_artista
    LEFT JOIN recinto r ON r.id_recinto = ev.id_recinto
    WHERE c.id_cliente = $1
    GROUP BY c.id_compra, ev.id_evento, a.nombre, r.nombre
    ORDER BY (ev.fecha_fin < CURRENT_DATE), ev.fecha_inicio, c.id_compra DESC`, [id_cliente]);
}

async function purchaseDetail(id_compra, id_cliente) {
  const compra = (await query(`
    SELECT c.id_compra, c.id_cliente, to_char(c.fecha_compra, 'YYYY-MM-DD') AS fecha_compra, c.monto_total, c.estado,
           mp.nombre AS metodo_pago, cl.nombre AS cliente_nombre, cl.apellido AS cliente_apellido
    FROM compra c
    JOIN cliente cl ON cl.id_cliente = c.id_cliente
    LEFT JOIN compra_metodo_pago cmp ON cmp.id_compra = c.id_compra
    LEFT JOIN metodo_pago mp ON mp.id_metodo_pago = cmp.id_metodo_pago
    WHERE c.id_compra = $1`, [id_compra]))[0];
  if (!compra || compra.id_cliente !== id_cliente) throw httpError(404, 'No encontramos esa compra en tu cuenta.');
  const entradas = await query(`
    SELECT d.id_entrada, d.precio_unitario, en.fila, en.numero_asiento, s.nombre_sector, en.id_evento
    FROM detalle_compra d
    JOIN entrada en ON d.id_entrada = en.id_entrada
    JOIN sector s ON en.id_sector = s.id_sector
    WHERE d.id_compra = $1 ORDER BY s.nombre_sector, en.fila, en.numero_asiento, d.id_entrada`, [id_compra]);
  const evento = entradas.length ? await getEvent(entradas[0].id_evento) : null;
  delete compra.id_cliente;
  return {
    ...compra, evento,
    entradas: entradas.map((e) => ({ ...e, codigo: ticketCode(id_compra, e.id_entrada) })),
  };
}

// ============================================================
// ADMIN · descuentos
// ============================================================
async function listDiscounts() {
  return query(`
    SELECT ds.id_descuento, ds.porcentaje, to_char(ds.fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio,
           to_char(ds.fecha_fin, 'YYYY-MM-DD') AS fecha_fin, ds.id_detalle, dc.id_compra,
           (CURRENT_DATE BETWEEN ds.fecha_inicio AND ds.fecha_fin) AS vigente
    FROM descuentos ds LEFT JOIN detalle_compra dc ON ds.id_detalle = dc.id_detalle
    ORDER BY ds.fecha_inicio DESC`);
}

async function createDiscount({ porcentaje, fecha_inicio, fecha_fin, id_detalle }) {
  const p = Number(porcentaje);
  if (!(p > 0 && p <= 100)) throw httpError(400, 'El porcentaje tiene que estar entre 1 y 100.');
  const fecha = /^\d{4}-\d{2}-\d{2}$/;
  if (!fecha.test(fecha_inicio || '') || !fecha.test(fecha_fin || '')) throw httpError(400, 'Completá las dos fechas.');
  if (fecha_fin < fecha_inicio) throw httpError(400, 'La fecha de fin no puede ser anterior a la de inicio.');
  const det = id_detalle ? asId(id_detalle, 'detalle') : null;
  await query('INSERT INTO descuentos (porcentaje, id_detalle, fecha_inicio, fecha_fin) VALUES ($1,$2,$3,$4)', [p, det, fecha_inicio, fecha_fin]);
  return { ok: true };
}
