// Crea el esquema y carga datos de demostración (todo ficticio).
if (require.main === module) require('../lib/env');
// Uso:  DATABASE_URL=postgres://... node db/seed.js
// Las fechas de los eventos se calculan desde HOY, así la demo nunca queda "vencida":
// volvé a correr este script cuando quieras reiniciar la demo.
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const bcrypt = require('bcryptjs');

const DEMO_EMAIL = 'demo@eventospro.app';
const DEMO_PASSWORD = 'demo1234';

// PRNG determinístico: misma semilla = mismas butacas vendidas en cada reinicio
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function dateFromToday(days) {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const provincias = ['Mendoza', 'Buenos Aires', 'Córdoba', 'Santa Fe', 'Tucumán', 'Catamarca', 'Chaco', 'Chubut',
  'Corrientes', 'Entre Ríos', 'Formosa', 'Jujuy', 'La Pampa', 'La Rioja', 'Misiones', 'Neuquén', 'Río Negro', 'Salta',
  'San Juan', 'San Luis', 'Santa Cruz', 'Santiago del Estero', 'Tierra del Fuego'];

const ciudades = [ // [nombre, provincia(1-based)]
  ['Mendoza', 1], ['Godoy Cruz', 1], ['San Rafael', 1], ['Ciudad de Buenos Aires', 2], ['Villa Carlos Paz', 3],
  ['Córdoba Capital', 3], ['Rosario', 4], ['San Miguel de Tucumán', 5], ['Mar del Plata', 2], ['Salta Capital', 18],
];

// Recintos ficticios. Cada sector: numerado (filas x asientos) o bloque (capacidad sin butaca).
const recintos = [
  { nombre: 'Arena Andina', direccion: 'Av. San Martín Sur 2100', ciudad: 2, sectores: [
    { nombre: 'Platea Preferencial', precio: 45000, filas: 'ABCDEF', asientos: 20 },
    { nombre: 'Platea General', precio: 32000, filas: 'GHIJKLM', asientos: 24 },
    { nombre: 'Campo', precio: 25000, bloque: 300 },
  ] },
  { nombre: 'Teatro del Sol', direccion: 'Calle Chile 1250', ciudad: 1, sectores: [
    { nombre: 'Platea', precio: 28000, filas: 'ABCDEFGHIJK', asientos: 18 },
    { nombre: 'Pullman', precio: 20000, filas: 'LMNO', asientos: 14 },
  ] },
  { nombre: 'Anfiteatro del Lago', direccion: 'Costanera 500', ciudad: 5, sectores: [
    { nombre: 'Tribuna', precio: 22000, filas: 'ABCDE', asientos: 26 },
    { nombre: 'Campo', precio: 18000, bloque: 500 },
  ] },
  { nombre: 'Usina Sur', direccion: 'Av. Belgrano 980', ciudad: 7, sectores: [
    { nombre: 'VIP', precio: 40000, filas: 'ABC', asientos: 12 },
    { nombre: 'Campo', precio: 22000, bloque: 250 },
  ] },
];

const generos = ['Rock', 'Pop', 'Tango', 'Espectáculo', 'Electrónica', 'Trap', 'Folklore', 'Jazz', 'Cumbia', 'Indie', 'Música Clásica'];

const artistas = [ // [nombre, [generos]]
  ['Los Cóndores Eléctricos', ['Rock', 'Indie']],
  ['Valentina Sur', ['Pop']],
  ['Orquesta del Valle', ['Tango', 'Música Clásica']],
  ['Circo Aurora', ['Espectáculo']],
  ['DJ Malbec', ['Electrónica']],
  ['Nexo', ['Trap']],
  ['La Trova del Oeste', ['Folklore']],
  ['Ruta 40', ['Rock']],
  ['Cuarteto Aconcagua', ['Jazz']],
  ['Cumbia del Desierto', ['Cumbia']],
];

// [nombre, descripcion, diasDesdeHoy, duracionDias, recinto(1-based), artista(1-based), proporcionVendida]
const eventos = [
  ['Gira Altura', 'Los Cóndores Eléctricos presentan su nuevo disco con un show de dos horas, visuales en pantalla gigante y los clásicos de siempre.', 9, 0, 1, 1, 0.55],
  ['Luz de Verano Tour', 'Valentina Sur llega con su gira más grande: coreografías, banda en vivo y un setlist pensado para cantar de principio a fin.', 16, 0, 1, 2, 0.35],
  ['Tango y Malbec', 'La Orquesta del Valle recorre cien años de tango en una noche íntima, con bandoneones, cuerdas y dos voces invitadas.', 12, 0, 2, 3, 0.4],
  ['Raíces', 'Circo Aurora presenta un espectáculo de acrobacia aérea y danza inspirado en los paisajes de la cordillera. Funciones diarias.', 24, 6, 2, 4, 0.82],
  ['Vendimia Sessions', 'DJ Malbec en un set de cuatro horas con invitados de la escena electrónica local. Solo mayores de 18.', 20, 0, 4, 5, 0.3],
  ['Nexo en Vivo', 'El fenómeno del trap mendocino en su primer show en Rosario, con banda completa.', 35, 0, 4, 6, 0.2],
  ['Noche de Peña', 'La Trova del Oeste propone una peña a cielo abierto: zambas, cuecas y chacareras junto al lago.', 28, 0, 3, 7, 0.25],
  ['Rock al Lago', 'Dos días de rock nacional frente al lago con Ruta 40 como cabeza de cartel.', 45, 1, 3, 8, 0.15],
  ['Jazz bajo las Estrellas', 'El Cuarteto Aconcagua presenta standards y composiciones propias en formato acústico.', 40, 0, 2, 9, 0.1],
  ['Fiesta de Primavera', 'Cumbia del Desierto despidió la primavera con un baile multitudinario.', -14, 0, 1, 10, 0.7],
];

const metodos = [
  ['Efectivo', 'Pago en efectivo en punto de venta'],
  ['Tarjeta de crédito', 'Pago con tarjeta de crédito'],
  ['Tarjeta de débito', 'Pago con tarjeta de débito'],
  ['Transferencia bancaria', 'Transferencia desde cuenta bancaria'],
  ['Billetera virtual', 'Pago mediante app digital'],
];

const clientes = [ // todos ficticios
  ['Demo', 'EventosPro', '30000000', DEMO_EMAIL, null],
  ['Lucía', 'Fernández', '30000001', 'lucia@ejemplo.com', null],
  ['Martín', 'Quiroga', '30000002', 'martin@ejemplo.com', null],
  ['Sofía', 'Ponce', '30000003', 'sofia@ejemplo.com', null],
  ['Tomás', 'Godoy', '30000004', 'tomas@ejemplo.com', null],
  ['Ana', 'Videla', '30000005', 'ana@ejemplo.com', null],
];

async function insertMany(db, table, cols, rows, returning) {
  const out = [];
  const chunk = 500;
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk);
    const params = [];
    const values = part.map((r) => '(' + r.map((v) => { params.push(v); return '$' + params.length; }).join(',') + ')').join(',');
    const sql = `INSERT INTO ${table} (${cols.join(',')}) VALUES ${values}${returning ? ' RETURNING ' + returning : ''}`;
    const res = await db.query(sql, params);
    out.push(...res.rows);
  }
  return out;
}

// Recibe un cliente de pg ya conectado. La API la usa para cargar la demo sola.
async function seed(db) {
  const rand = rng(2026);

  await db.query(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
  await db.query('BEGIN');

  await insertMany(db, 'provincia', ['nombre'], provincias.map((p) => [p]));
  await insertMany(db, 'ciudad', ['nombre', 'id_provincia', 'pais'], ciudades.map(([n, p]) => [n, p, 'Argentina']));
  await insertMany(db, 'genero', ['nombre'], generos.map((g) => [g]));
  await insertMany(db, 'artista', ['nombre'], artistas.map(([n]) => [n]));
  const ag = [];
  artistas.forEach(([, gs], i) => gs.forEach((g) => ag.push([i + 1, generos.indexOf(g) + 1])));
  await insertMany(db, 'artista_genero', ['id_artista', 'id_genero'], ag);
  await insertMany(db, 'metodo_pago', ['nombre', 'descripcion'], metodos);

  // Recintos y sectores
  const sectoresPorRecinto = {};
  for (let r = 0; r < recintos.length; r++) {
    const rec = recintos[r];
    await db.query('INSERT INTO recinto (nombre, direccion, id_ciudad) VALUES ($1,$2,$3)', [rec.nombre, rec.direccion, rec.ciudad]);
    sectoresPorRecinto[r + 1] = [];
    for (const s of rec.sectores) {
      const cap = s.bloque || s.filas.length * s.asientos;
      const { rows } = await db.query(
        'INSERT INTO sector (id_recinto, nombre_sector, capacidad_sector, precio_base) VALUES ($1,$2,$3,$4) RETURNING id_sector',
        [r + 1, s.nombre, cap, s.precio]
      );
      sectoresPorRecinto[r + 1].push({ ...s, id: rows[0].id_sector });
    }
  }

  // Eventos y entradas
  const entradasPorEvento = {};
  for (let e = 0; e < eventos.length; e++) {
    const [nombre, desc, dias, dur, idRec, idArt, vendida] = eventos[e];
    const { rows } = await db.query(
      'INSERT INTO evento (nombre, descripcion, fecha_inicio, fecha_fin, id_recinto, id_artista) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id_evento',
      [nombre, desc, dateFromToday(dias), dateFromToday(dias + dur), idRec, idArt]
    );
    const idEv = rows[0].id_evento;
    const filas = [];
    for (const s of sectoresPorRecinto[idRec]) {
      if (s.bloque) {
        for (let i = 0; i < s.bloque; i++) {
          filas.push([idEv, s.id, null, null, s.precio, rand() < vendida ? 'vendida' : 'disponible']);
        }
      } else {
        for (const f of s.filas) {
          // las filas de adelante se venden primero: más probabilidad de vendida
          const peso = 1.35 - (s.filas.indexOf(f) / s.filas.length) * 0.7;
          for (let n = 1; n <= s.asientos; n++) {
            filas.push([idEv, s.id, f, n, s.precio, rand() < vendida * peso ? 'vendida' : 'disponible']);
          }
        }
      }
    }
    entradasPorEvento[idEv] = await insertMany(db, 'entrada',
      ['id_evento', 'id_sector', 'fila', 'numero_asiento', 'precio_final', 'estado'], filas, 'id_entrada, fila, numero_asiento, precio_final, estado');
  }

  // Clientes (la cuenta demo tiene contraseña conocida; el resto, una aleatoria)
  const hashDemo = await bcrypt.hash(DEMO_PASSWORD, 10);
  const hashOtro = await bcrypt.hash('cliente-ficticio-' + Date.now(), 10);
  await insertMany(db, 'cliente', ['nombre', 'apellido', 'dni', 'email', 'telefono', 'password_hash'],
    clientes.map((c, i) => [...c, i === 0 ? hashDemo : hashOtro]));

  // Compras de la cuenta demo: dos entradas para el evento pasado y dos para el próximo
  async function comprar(idCliente, idEvento, cantidad, metodo, diasAtras) {
    const libres = entradasPorEvento[idEvento].filter((x) => x.estado === 'disponible' && x.fila).slice(0, cantidad);
    const total = libres.reduce((a, x) => a + Number(x.precio_final), 0);
    const { rows } = await db.query(
      "INSERT INTO compra (id_cliente, fecha_compra, monto_total, estado) VALUES ($1,$2,$3,'pagada') RETURNING id_compra",
      [idCliente, dateFromToday(-diasAtras), total]
    );
    const idCompra = rows[0].id_compra;
    await db.query('INSERT INTO compra_metodo_pago (id_compra, id_metodo_pago, monto_pagado) VALUES ($1,$2,$3)', [idCompra, metodo, total]);
    for (const x of libres) {
      const d = await db.query('INSERT INTO detalle_compra (id_compra, id_entrada, precio_unitario) VALUES ($1,$2,$3) RETURNING id_detalle',
        [idCompra, x.id_entrada, x.precio_final]);
      await db.query("UPDATE entrada SET estado='vendida', id_detalle=$1 WHERE id_entrada=$2", [d.rows[0].id_detalle, x.id_entrada]);
      x.estado = 'vendida';
    }
  }
  await comprar(1, 10, 2, 2, 30);
  await comprar(1, 1, 2, 5, 3);

  // Reseñas del evento que ya pasó
  await insertMany(db, 'resenas', ['id_evento', 'id_cliente', 'puntuacion', 'comentario', 'fecha_resena'], [
    [10, 2, 5, 'Una fiesta de principio a fin. El sonido impecable y la entrada por sectores muy ordenada.', dateFromToday(-13)],
    [10, 3, 4, 'Muy buen show. Elegir la butaca antes de pagar es un golazo.', dateFromToday(-12)],
    [10, 5, 5, 'La mejor noche de la primavera. Ya quiero la próxima.', dateFromToday(-11)],
  ]);

  await db.query("INSERT INTO descuentos (porcentaje, id_detalle, fecha_inicio, fecha_fin) VALUES (15, NULL, $1, $2)",
    [dateFromToday(-5), dateFromToday(25)]);

  await db.query('COMMIT');
  const { rows: [c] } = await db.query('SELECT COUNT(*)::int AS n FROM entrada');
  return { eventos: eventos.length, entradas: c.n };
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('Falta la variable DATABASE_URL');
  const ssl = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? false : { rejectUnauthorized: false };
  const db = new Client({ connectionString: process.env.DATABASE_URL, ssl });
  await db.connect();
  const r = await seed(db);
  console.log(`Listo: ${r.eventos} eventos, ${r.entradas} entradas. Cuenta demo: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  await db.end();
}

module.exports = { seed };
if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
