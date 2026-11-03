/* EventosPro · front (SPA sin frameworks, router por hash) */
'use strict';

const API = '/api';
const app = document.getElementById('app');
const nav = document.getElementById('user-nav');
const header = document.querySelector('.top');

// ---------------------------------------------------------------- utilidades
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const money = (n) => '$' + Number(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 });
const MESES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
const toDate = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, m - 1, d); };
const fechaLarga = (s) => toDate(s).toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fechaCorta = (s) => toDate(s).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
function rango(a, b) { return a === b ? fechaLarga(a) : `Del ${fechaCorta(a)} al ${fechaLarga(b)}`; }

function toast(msg, type = 'ok') {
  const t = document.createElement('div');
  t.className = 'toast' + (type === 'error' ? ' toast--error' : '');
  t.textContent = msg;
  document.getElementById('toasts').appendChild(t);
  setTimeout(() => t.remove(), 4200);
}

async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const token = session.token();
  const res = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && token && path !== '/login') { session.clear(); }
  if (!res.ok) throw new Error(data.error || 'No pudimos conectar con el servidor. Revisá tu conexión.');
  return data;
}

// ---------------------------------------------------------------- sesión
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* modo privado */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* */ } },
};
const session = {
  token: () => store.get('ep_token'),
  user() { try { return JSON.parse(store.get('ep_user')); } catch { return null; } },
  save(u) { store.set('ep_token', u.token); store.set('ep_user', JSON.stringify({ id_cliente: u.id_cliente, nombre: u.nombre })); renderNav(); },
  clear() { store.del('ep_token'); store.del('ep_user'); renderNav(); },
};

function renderNav() {
  const u = session.user();
  nav.innerHTML = u
    ? `<span class="hi">Hola, ${esc(u.nombre)}</span>
       <a class="btn btn--ghost btn--sm" href="#/mis-entradas">Mis entradas</a>
       <button class="btn btn--ghost btn--sm" type="button" id="logout">Salir</button>`
    : `<a class="btn btn--ghost btn--sm" href="#/login">Ingresar</a>
       <a class="btn btn--accent btn--sm" href="#/registro">Crear cuenta</a>`;
  const out = document.getElementById('logout');
  if (out) out.onclick = () => { session.clear(); toast('Cerraste sesión.'); location.hash = '#/'; };
}

document.getElementById('menu-btn').addEventListener('click', (e) => {
  const open = header.classList.toggle('open');
  e.currentTarget.setAttribute('aria-expanded', open);
});
nav.addEventListener('click', (e) => { if (e.target.closest('a,button')) header.classList.remove('open'); });

document.getElementById('search-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = document.getElementById('search-input').value.trim();
  location.hash = q ? '#/?q=' + encodeURIComponent(q) : '#/';
});

// ---------------------------------------------------------------- afiches por género
const PALETAS = {
  Rock: ['#E63B2E', '#14161B', '#fff'], Indie: ['#E63B2E', '#14161B', '#fff'],
  Pop: ['#FF6FB5', '#FFD23F', '#14161B'], Tango: ['#14161B', '#D62E3A', '#fff'],
  'Música Clásica': ['#14161B', '#D62E3A', '#fff'], Espectáculo: ['#3D2BFF', '#FFD23F', '#fff'],
  Electrónica: ['#00A99D', '#14161B', '#fff'], Trap: ['#1F2229', '#FFD23F', '#fff'],
  Folklore: ['#D9822B', '#7A1F1F', '#fff'], Jazz: ['#1F4FD1', '#FF9E1B', '#fff'],
  Cumbia: ['#FFC21A', '#E63B2E', '#14161B'],
};
function paleta(generos) {
  const g = String(generos || '').split(',').map((s) => s.trim());
  for (const k of g) if (PALETAS[k]) return PALETAS[k];
  return ['#3D2BFF', '#FFD23F', '#fff'];
}
function poster(ev, { date = true, cls = '' } = {}) {
  const [bg, acc, ink] = paleta(ev.generos);
  const d = toDate(ev.fecha_inicio);
  return `<div class="poster ${cls}" style="--p-bg:${bg};--p-accent:${acc};--p-ink:${ink}" aria-hidden="true">
    ${date ? `<div class="poster__date"><b>${d.getDate()}</b><span>${MESES[d.getMonth()]}</span></div>` : ''}
    <div class="poster__name"><span class="poster__artist">${esc(ev.artista_nombre)}</span>${esc(ev.nombre)}</div>
  </div>`;
}

// ---------------------------------------------------------------- router
const routes = {
  '/': viewHome, '/evento': viewEvent, '/login': viewLogin, '/registro': viewRegister,
  '/mis-entradas': viewMyTickets, '/compra': viewPurchase, '/admin': viewAdmin,
};
function parseHash() {
  const [path, qs] = (location.hash.slice(1) || '/').split('?');
  return { path: path || '/', params: new URLSearchParams(qs || '') };
}
let navToken = 0;
async function router() {
  const { path, params } = parseHash();
  const view = routes[path] || view404;
  const mine = ++navToken;
  header.classList.remove('open');
  closeModal();
  try {
    await view(params, () => mine === navToken);
  } catch (err) {
    if (mine !== navToken) return;
    app.innerHTML = `<div class="panel empty"><h2>No pudimos cargar esta página</h2><p class="muted">${esc(err.message)}</p>
      <p style="margin-top:16px"><a class="btn" href="#/">Volver al inicio</a></p></div>`;
  }
  if (mine === navToken) { window.scrollTo(0, 0); }
}
window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', () => { renderNav(); router(); });

function view404() {
  app.innerHTML = `<div class="panel empty"><h2>Esta página no existe</h2><p><a class="link" href="#/">Ver todos los eventos</a></p></div>`;
}

// ================================================================ HOME
let filtrosCache = null;
async function viewHome(params, alive) {
  const q = params.get('q') || '';
  const ciudad = params.get('ciudad') || '';
  const genero = params.get('genero') || '';
  document.getElementById('search-input').value = q;
  if (!app.querySelector('.hero')) app.innerHTML = `<div class="skeleton"><div></div><div></div><div></div></div>`;

  const qs = new URLSearchParams();
  if (q) qs.set('q', q); if (ciudad) qs.set('ciudad', ciudad); if (genero) qs.set('genero', genero);
  const [events, filtros, todos] = await Promise.all([
    api('/events' + (qs.toString() ? '?' + qs : '')),
    filtrosCache || api('/filters'),
    q || ciudad || genero ? api('/events') : null,
  ]);
  filtrosCache = filtros;
  if (!alive()) return;

  const lista = todos || events;
  const proximos = lista.filter((e) => !e.finalizado);
  // Destacado: el próximo evento con menos entradas disponibles en proporción
  const destacado = [...proximos].sort((a, b) => a.disponibles / a.total_entradas - b.disponibles / b.total_entradas)[0];
  const filtrado = q || ciudad || genero;

  const link = (k, v) => {
    const p = new URLSearchParams({ ...(q && { q }), ...(ciudad && { ciudad }), ...(genero && { genero }) });
    v ? p.set(k, v) : p.delete(k);
    return '#/' + (p.toString() ? '?' + p : '');
  };

  app.innerHTML = `
    <section class="hero">
      <div class="hero__copy">
        <p class="label">Entradas para shows en vivo</p>
        <h1>Tu lugar,<br>elegido <em>butaca</em><br>por butaca.</h1>
        <p>Mirá el mapa de la sala, elegí exactamente dónde sentarte y recibí tu entrada con código QR al instante.</p>
        <div class="hero__steps"><span><b>01</b>Elegí el show</span><span><b>02</b>Marcá tus butacas</span><span><b>03</b>Mostrá el QR en la puerta</span></div>
      </div>
      ${destacado ? `<a class="feature" href="#/evento?id=${destacado.id_evento}" aria-label="${esc(destacado.nombre)}, ${esc(destacado.artista_nombre)}">
        ${poster(destacado)}
        <span class="feature__badge">${destacado.disponibles / destacado.total_entradas < 0.25 ? '¡ÚLTIMAS ENTRADAS!' : 'DESTACADO'}</span>
      </a>` : ''}
    </section>

    <div class="section-title">
      <h2>${filtrado ? 'Resultados' : 'Próximos shows'}</h2>
      <div class="filters">
        <label class="sr" for="f-ciudad">Ciudad</label>
        <select class="select" id="f-ciudad">
          <option value="">Todas las ciudades</option>
          ${filtros.ciudades.map((c) => `<option value="${c.id_ciudad}" ${String(c.id_ciudad) === ciudad ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="filters" role="group" aria-label="Filtrar por género" style="margin-bottom:20px">
      <a class="chip" href="${link('genero', '')}" aria-pressed="${!genero}" style="display:inline-flex;align-items:center;text-decoration:none">Todos</a>
      ${filtros.generos.map((g) => `<a class="chip" href="${link('genero', String(g.id_genero))}" aria-pressed="${String(g.id_genero) === genero}" style="display:inline-flex;align-items:center;text-decoration:none">${esc(g.nombre)}</a>`).join('')}
    </div>
    ${q ? `<p class="muted" style="margin-bottom:16px">Buscaste «${esc(q)}» · <a class="link" href="${link('q', '')}">limpiar búsqueda</a></p>` : ''}
    ${events.length ? `<div class="grid">${events.map(cardEvento).join('')}</div>`
      : `<div class="panel empty"><h3>No encontramos shows con esos filtros</h3><p class="muted">Probá con otra ciudad o género.</p><p style="margin-top:14px"><a class="btn" href="#/">Ver todos</a></p></div>`}`;

  document.getElementById('f-ciudad').addEventListener('change', (e) => { location.hash = link('ciudad', e.target.value); });
}

function cardEvento(ev) {
  const prop = ev.total_entradas ? ev.disponibles / ev.total_entradas : 0;
  const low = !ev.finalizado && prop < 0.2;
  return `<a class="card ${ev.finalizado ? 'card--past' : ''}" href="#/evento?id=${ev.id_evento}">
    ${poster(ev)}
    <div class="card__body">
      <div class="card__place">${esc(ev.recinto_nombre)} · ${esc(ev.ciudad_nombre)}</div>
      ${ev.calificacion ? `<div><span class="stars" aria-label="${ev.calificacion} de 5">★</span> ${esc(ev.calificacion)} <span class="muted">(${ev.cantidad_resenas})</span></div>` : ''}
      <div class="card__foot">
        ${ev.finalizado ? '<span class="badge badge--past">Finalizado</span>'
          : ev.disponibles ? `<div class="price"><small>Desde</small><b>${money(ev.precio_desde)}</b></div>` : '<span class="badge">Agotado</span>'}
        ${ev.finalizado ? '' : `<div class="stock ${low ? 'stock--low' : ''}">${low ? `¡QUEDAN ${ev.disponibles}!` : `${ev.disponibles} LIBRES`}
          <div class="meter"><i style="width:${Math.round((1 - prop) * 100)}%"></i></div></div>`}
      </div>
    </div>
  </a>`;
}

// ================================================================ EVENTO
let cart = null; // { id_evento, butacas: Map(id -> {fila, numero, precio, sector}), bloques: {id_sector: n} }
let seatMap = [];
let metodosCache = null;

async function viewEvent(params, alive) {
  const id = params.get('id');
  if (!/^\d+$/.test(id || '')) return view404();
  app.innerHTML = `<div class="skeleton"><div></div><div></div></div>`;
  const [ev, sectores, reviews] = await Promise.all([api(`/events/${id}`), api(`/events/${id}/seats`), api(`/events/${id}/reviews`)]);
  if (!alive()) return;
  seatMap = sectores;
  cart = { id_evento: Number(id), butacas: new Map(), bloques: {} };
  document.title = `${ev.nombre} · ${ev.artista_nombre} · EventosPro`;
  const u = session.user();

  app.innerHTML = `
    <a class="link" href="#/">← Todos los shows</a>
    <section class="ev-head" style="margin-top:14px">
      ${poster(ev)}
      <div class="ev-info">
        <div>${ev.finalizado ? '<span class="badge badge--past">Finalizado</span>' : `<span class="label">${esc(ev.generos || '')}</span>`}</div>
        <h1>${esc(ev.nombre)}</h1>
        <p style="font-size:1.1rem;font-weight:600">${esc(ev.artista_nombre)}</p>
        <div class="facts">
          <div class="fact"><span class="label">Fecha</span><b>${esc(rango(ev.fecha_inicio, ev.fecha_fin))}</b></div>
          <div class="fact"><span class="label">Lugar</span><b>${esc(ev.recinto_nombre)}</b><span class="muted">${esc(ev.recinto_direccion)}, ${esc(ev.ciudad_nombre)}</span></div>
          ${ev.calificacion ? `<div class="fact"><span class="label">Opiniones</span><b><span class="stars">★</span> ${esc(ev.calificacion)} de 5</b><span class="muted">${ev.cantidad_resenas} reseñas</span></div>` : ''}
        </div>
        <p class="muted" style="max-width:640px">${esc(ev.descripcion)}</p>
      </div>
    </section>

    ${ev.finalizado ? '' : `
    <section class="buy">
      <div class="hall">
        <div class="hall__head">
          <h2 style="font-size:1.25rem">Elegí tus entradas</h2>
          <div class="legend">
            <span><i style="background:var(--seat-free)"></i>Libre</span>
            <span><i style="background:var(--spot);box-shadow:0 0 0 2px var(--ink)"></i>Tu elección</span>
            <span><i style="background:var(--seat)"></i>Ocupada</span>
          </div>
        </div>
        <div class="stage">ESCENARIO</div>
        <div class="sectors" id="sectors">${sectores.map(renderSector).join('')}</div>
      </div>
      <aside class="stub" aria-label="Tu selección">
        <div class="stub__head"><span class="label" style="color:#9AA0AD">Tu selección</span><h3>${esc(ev.nombre)}</h3></div>
        <div class="stub__body">
          <div class="lines" id="lines"></div>
          <div class="stub__perf"></div>
          <div class="total"><span>Total</span><span id="total">${money(0)}</span></div>
          <button class="btn btn--accent btn--block" id="go" type="button" disabled>Elegí tus butacas</button>
          <p class="note">Hasta 10 entradas por compra. Los pagos de esta demo son simulados.</p>
        </div>
      </aside>
    </section>`}

    <section class="panel" style="margin-top:28px">
      <h2 style="font-size:1.25rem;margin-bottom:14px">Opiniones del público</h2>
      <div id="review-box"></div>
      <div class="reviews">${reviews.length ? reviews.map((r) => `
        <article class="review">
          <div class="review__head"><b>${esc(r.nombre)} ${esc(r.inicial)}.</b>
            <span class="stars" aria-label="${r.puntuacion} de 5">${'★'.repeat(r.puntuacion)}<span style="color:#C9CEDA">${'★'.repeat(5 - r.puntuacion)}</span></span></div>
          ${r.comentario ? `<p class="muted">${esc(r.comentario)}</p>` : ''}
        </article>`).join('') : `<p class="muted">${ev.finalizado ? 'Todavía no hay opiniones.' : 'Las opiniones se habilitan cuando termina el show.'}</p>`}</div>
    </section>`;

  if (ev.finalizado && u) renderReviewForm(ev);

  if (!ev.finalizado) {
    app.querySelectorAll('.rows').forEach((r) => { r.scrollLeft = (r.scrollWidth - r.clientWidth) / 2; });
    document.getElementById('sectors').addEventListener('click', onSeatClick);
    document.getElementById('lines').addEventListener('click', onLineRemove);
    document.getElementById('go').addEventListener('click', () => openCheckout(ev));
    updateStub();
    restoreCart();
  }
}

function renderSector(sec) {
  const head = `<div class="sector__name"><h3>${esc(sec.nombre_sector)}</h3>
    <span>${money(sec.tipo === 'bloque' ? sec.precio_bloque : sec.precio_base)} · ${sec.disponibles} libres</span></div>`;
  if (sec.tipo === 'bloque') {
    return `<div class="sector">${head}
      <div class="block">
        <div><b>Entrada general de pie</b><div class="muted" style="font-size:.88rem">Sin butaca asignada: entrás por orden de llegada.</div></div>
        <div class="stepper" data-sector="${sec.id_sector}">
          <button type="button" data-act="-" aria-label="Quitar una entrada de ${esc(sec.nombre_sector)}">−</button>
          <output aria-live="polite">0</output>
          <button type="button" data-act="+" aria-label="Agregar una entrada de ${esc(sec.nombre_sector)}" ${sec.disponibles ? '' : 'disabled'}>+</button>
        </div>
      </div></div>`;
  }
  const filas = {};
  for (const b of sec.butacas) (filas[b.fila] ||= []).push(b);
  const rows = Object.keys(filas).sort().map((f) => {
    const seats = filas[f].sort((a, b) => a.numero_asiento - b.numero_asiento);
    const mitad = Math.ceil(seats.length / 2);
    return `<div class="row"><span class="row__label">${esc(f)}</span>
      ${seats.map((b, i) => `${i === mitad ? '<span class="aisle"></span>' : ''}<button type="button" class="seat" data-id="${b.id_entrada}"
        aria-label="${esc(sec.nombre_sector)}, fila ${esc(b.fila)}, asiento ${b.numero_asiento}, ${money(b.precio)}"
        aria-pressed="false" ${b.estado !== 'disponible' ? 'disabled' : ''}>${b.numero_asiento}</button>`).join('')}
      <span class="row__label">${esc(f)}</span></div>`;
  }).join('');
  return `<div class="sector">${head}<div class="rows"><div class="rows__in">${rows}</div></div></div>`;
}

// Recupera la selección guardada antes de ir a iniciar sesión (solo butacas que sigan libres)
function restoreCart() {
  let saved = null;
  try { saved = JSON.parse(sessionStorage.getItem('ep_cart')); sessionStorage.removeItem('ep_cart'); } catch { /* */ }
  if (!saved || saved.id_evento !== cart.id_evento) return;
  for (const id of saved.butacas || []) {
    const el = app.querySelector(`.seat[data-id="${id}"]:not([disabled])`);
    if (el) el.click();
  }
  for (const [id, n] of Object.entries(saved.bloques || {})) {
    const sec = seatMap.find((s) => String(s.id_sector) === id);
    if (sec) cart.bloques[id] = Math.min(n, sec.disponibles);
  }
  updateStub();
}

const cantidad = () => cart.butacas.size + Object.values(cart.bloques).reduce((a, b) => a + b, 0);

function onSeatClick(e) {
  const seat = e.target.closest('.seat');
  if (seat && !seat.disabled) {
    const id = Number(seat.dataset.id);
    if (cart.butacas.has(id)) {
      cart.butacas.delete(id); seat.setAttribute('aria-pressed', 'false');
    } else {
      if (cantidad() >= 10) return toast('Podés comprar hasta 10 entradas por compra.', 'error');
      const sec = seatMap.find((s) => s.butacas.some((b) => b.id_entrada === id));
      const b = sec.butacas.find((x) => x.id_entrada === id);
      cart.butacas.set(id, { fila: b.fila, numero: b.numero_asiento, precio: b.precio, sector: sec.nombre_sector });
      seat.setAttribute('aria-pressed', 'true');
    }
    return updateStub();
  }
  const btn = e.target.closest('.stepper button');
  if (btn) {
    const wrap = btn.closest('.stepper');
    const id = wrap.dataset.sector;
    const sec = seatMap.find((s) => String(s.id_sector) === id);
    let n = cart.bloques[id] || 0;
    if (btn.dataset.act === '+') {
      if (cantidad() >= 10) return toast('Podés comprar hasta 10 entradas por compra.', 'error');
      if (n < sec.disponibles) n++;
    } else if (n > 0) n--;
    cart.bloques[id] = n;
    updateStub();
  }
}

function onLineRemove(e) {
  const b = e.target.closest('button[data-remove]');
  if (!b) return;
  const [tipo, id] = b.dataset.remove.split(':');
  if (tipo === 's') {
    cart.butacas.delete(Number(id));
    const el = app.querySelector(`.seat[data-id="${id}"]`);
    if (el) el.setAttribute('aria-pressed', 'false');
  } else cart.bloques[id] = 0;
  updateStub();
}

function updateStub() {
  const lines = [];
  let total = 0;
  const ordenadas = [...cart.butacas.entries()].sort((a, b) => (a[1].sector + a[1].fila).localeCompare(b[1].sector + b[1].fila) || a[1].numero - b[1].numero);
  for (const [id, s] of ordenadas) {
    total += s.precio;
    lines.push(`<div class="line"><div><b>Fila ${esc(s.fila)} · Asiento ${s.numero}</b><small>${esc(s.sector)}</small></div>
      <span>${money(s.precio)}</span><button type="button" data-remove="s:${id}" aria-label="Quitar fila ${esc(s.fila)} asiento ${s.numero}">✕</button></div>`);
  }
  for (const [id, n] of Object.entries(cart.bloques)) {
    const sec = seatMap.find((s) => String(s.id_sector) === id);
    const out = app.querySelector(`.stepper[data-sector="${id}"]`);
    if (out) {
      out.querySelector('output').textContent = n;
      out.querySelector('[data-act="-"]').disabled = n === 0;
      out.querySelector('[data-act="+"]').disabled = n >= sec.disponibles;
    }
    if (!n) continue;
    total += sec.precio_bloque * n;
    lines.push(`<div class="line"><div><b>${esc(sec.nombre_sector)} × ${n}</b><small>Entrada general</small></div>
      <span>${money(sec.precio_bloque * n)}</span><button type="button" data-remove="b:${id}" aria-label="Quitar entradas de ${esc(sec.nombre_sector)}">✕</button></div>`);
  }
  document.getElementById('lines').innerHTML = lines.length ? lines.join('') : '<p class="muted">Tocá una butaca libre en el mapa o sumá entradas de campo.</p>';
  document.getElementById('total').textContent = money(total);
  const go = document.getElementById('go');
  const n = cantidad();
  go.disabled = !n;
  go.textContent = n ? `Continuar con ${n} entrada${n > 1 ? 's' : ''}` : 'Elegí tus butacas';
  cart.total = total;
}

// ---------------------------------------------------------------- checkout
function closeModal() { document.querySelector('.modal')?.remove(); }

async function openCheckout(ev) {
  if (!session.user()) {
    try { sessionStorage.setItem('ep_cart', JSON.stringify({ id_evento: cart.id_evento, butacas: [...cart.butacas.keys()], bloques: cart.bloques })); } catch { /* */ }
    toast('Ingresá a tu cuenta para terminar la compra. Guardamos tu selección.');
    location.hash = '#/login?next=' + encodeURIComponent('#/evento?id=' + ev.id_evento);
    return;
  }
  metodosCache ||= await api('/metodos-pago');
  const m = document.createElement('div');
  m.className = 'modal';
  m.innerHTML = `<div class="modal__box" role="dialog" aria-modal="true" aria-labelledby="co-title">
    <p class="label">Paso final</p>
    <h2 id="co-title">Confirmá tu compra</h2>
    <p class="muted" style="margin:8px 0 16px">${esc(ev.nombre)} · ${esc(fechaLarga(ev.fecha_inicio))}</p>
    <form class="form" id="co-form">
      <fieldset class="pay"><legend class="label" style="margin-bottom:6px">Medio de pago</legend>
        ${metodosCache.map((mp, i) => `<label><input type="radio" name="metodo" value="${mp.id_metodo_pago}" ${i === 1 ? 'checked' : ''}> ${esc(mp.nombre)}</label>`).join('')}
      </fieldset>
      <div class="total" style="margin-top:4px"><span>${cantidad()} entrada${cantidad() > 1 ? 's' : ''}</span><span>${money(cart.total)}</span></div>
      <p class="note">Esto es una demo: no se cobra nada y no se piden datos de tarjeta.</p>
      <p class="err" id="co-err" hidden></p>
      <div class="two"><button type="button" class="btn btn--ghost" id="co-cancel">Volver</button><button class="btn btn--accent" id="co-ok">Confirmar compra</button></div>
    </form></div>`;
  document.body.appendChild(m);
  m.querySelector('input:checked').focus();
  m.addEventListener('click', (e) => { if (e.target === m) closeModal(); });
  m.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
  m.querySelector('#co-cancel').onclick = closeModal;
  m.querySelector('#co-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const ok = m.querySelector('#co-ok');
    ok.disabled = true; ok.textContent = 'Procesando…';
    try {
      const res = await api('/purchase', { method: 'POST', body: {
        id_evento: cart.id_evento,
        id_metodo_pago: Number(new FormData(e.target).get('metodo')),
        butacas: [...cart.butacas.keys()],
        bloques: Object.fromEntries(Object.entries(cart.bloques).filter(([, n]) => n > 0)),
      } });
      closeModal();
      toast(`¡Listo! Compra #${res.id_compra} confirmada.`);
      location.hash = '#/compra?id=' + res.id_compra + '&nueva=1';
    } catch (err) {
      const box = m.querySelector('#co-err');
      box.textContent = err.message; box.hidden = false;
      ok.disabled = false; ok.textContent = 'Confirmar compra';
      if (/vend|Quedan/.test(err.message)) {
        ok.textContent = 'Actualizar el mapa';
        ok.onclick = (ev2) => { ev2.preventDefault(); closeModal(); router(); };
      }
    }
  });
}

// ---------------------------------------------------------------- reseñas
function renderReviewForm(ev) {
  const box = document.getElementById('review-box');
  box.innerHTML = `<form class="form" id="rv-form" style="margin-bottom:22px;max-width:560px">
    <fieldset><legend class="label">¿Fuiste? Contanos qué tal estuvo</legend>
      <div class="rate">${[5, 4, 3, 2, 1].map((n) => `<input type="radio" id="st${n}" name="puntuacion" value="${n}"><label for="st${n}" aria-label="${n} estrellas">★</label>`).join('')}</div>
    </fieldset>
    <div class="field"><label for="rv-c">Comentario (opcional)</label><textarea id="rv-c" name="comentario" rows="3" maxlength="255"></textarea></div>
    <p class="err" id="rv-err" hidden></p>
    <div><button class="btn">Publicar opinión</button></div></form>`;
  box.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const err = box.querySelector('#rv-err');
    if (!fd.get('puntuacion')) { err.textContent = 'Elegí de 1 a 5 estrellas.'; err.hidden = false; return; }
    try {
      await api(`/events/${ev.id_evento}/reviews`, { method: 'POST', body: { puntuacion: Number(fd.get('puntuacion')), comentario: fd.get('comentario') } });
      toast('¡Gracias por tu opinión!');
      router();
    } catch (x) { err.textContent = x.message; err.hidden = false; }
  });
}

// ================================================================ CUENTA
function viewLogin(params) {
  if (session.user()) { location.hash = '#/mis-entradas'; return; }
  const next = params.get('next') || '#/';
  app.innerHTML = `<div class="auth"><div class="panel">
    <p class="label">Bienvenido de nuevo</p><h1>Ingresar</h1>
    <div class="demo-hint" style="margin:16px 0"><span>¿Solo querés probar? Usá la cuenta demo.</span><button type="button" class="btn btn--sm btn--accent" id="fill-demo">Completar</button></div>
    <form class="form" id="login-form" novalidate>
      <div class="field"><label for="l-email">Email</label><input id="l-email" name="email" type="email" autocomplete="email" required></div>
      <div class="field"><label for="l-pass">Contraseña</label><input id="l-pass" name="password" type="password" autocomplete="current-password" required></div>
      <p class="err" id="l-err" hidden></p>
      <button class="btn btn--block">Ingresar</button>
    </form>
    <p class="muted" style="margin-top:16px">¿No tenés cuenta? <a class="link" href="#/registro">Creala en un minuto</a></p>
  </div></div>`;
  const f = document.getElementById('login-form');
  const fill = () => { f.email.value = 'demo@eventospro.app'; f.password.value = 'demo1234'; };
  document.getElementById('fill-demo').onclick = fill;
  if (params.get('demo')) fill();
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('l-err');
    try {
      const u = await api('/login', { method: 'POST', body: { email: f.email.value, password: f.password.value } });
      session.save(u); toast(`¡Hola, ${u.nombre}!`);
      location.hash = next.startsWith('#/') ? next : '#/';
    } catch (x) { err.textContent = x.message; err.hidden = false; }
  });
}

function viewRegister() {
  if (session.user()) { location.hash = '#/'; return; }
  app.innerHTML = `<div class="auth"><div class="panel">
    <p class="label">Nueva cuenta</p><h1>Crear cuenta</h1>
    <form class="form" id="reg-form" novalidate style="margin-top:16px">
      <div class="two">
        <div class="field"><label for="r-n">Nombre</label><input id="r-n" name="nombre" autocomplete="given-name" required></div>
        <div class="field"><label for="r-a">Apellido</label><input id="r-a" name="apellido" autocomplete="family-name" required></div>
      </div>
      <div class="field"><label for="r-d">DNI</label><input id="r-d" name="dni" inputmode="numeric" required><small>Solo números. Lo pedimos para nominar tus entradas.</small></div>
      <div class="field"><label for="r-e">Email</label><input id="r-e" name="email" type="email" autocomplete="email" required></div>
      <div class="field"><label for="r-t">Teléfono (opcional)</label><input id="r-t" name="telefono" type="tel" autocomplete="tel"></div>
      <div class="field"><label for="r-p">Contraseña</label><input id="r-p" name="password" type="password" autocomplete="new-password" minlength="8" required><small>Mínimo 8 caracteres.</small></div>
      <p class="err" id="r-err" hidden></p>
      <button class="btn btn--accent btn--block">Crear mi cuenta</button>
    </form>
    <p class="muted" style="margin-top:16px">¿Ya tenés cuenta? <a class="link" href="#/login">Ingresá</a></p>
  </div></div>`;
  document.getElementById('reg-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('r-err');
    try {
      const u = await api('/register', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
      session.save(u); toast('¡Cuenta creada! Ya podés comprar.'); location.hash = '#/';
    } catch (x) { err.textContent = x.message; err.hidden = false; }
  });
}

// ================================================================ MIS ENTRADAS
async function viewMyTickets(params, alive) {
  if (!session.user()) { location.hash = '#/login?next=' + encodeURIComponent('#/mis-entradas'); return; }
  app.innerHTML = `<div class="skeleton"><div></div></div>`;
  const compras = await api('/mis-compras');
  if (!alive()) return;
  const prox = compras.filter((c) => !c.finalizado);
  const pas = compras.filter((c) => c.finalizado);
  const item = (c) => `<a class="purchase" href="#/compra?id=${c.id_compra}">
      ${poster({ ...c, nombre: c.evento_nombre, fecha_inicio: c.fecha_evento }, { date: false })}
      <div class="purchase__info"><span class="label">${esc(fechaLarga(c.fecha_evento))}</span>
        <b style="font-size:1.1rem">${esc(c.evento_nombre)}</b>
        <span class="muted">${esc(c.recinto_nombre)} · ${c.cantidad} entrada${c.cantidad > 1 ? 's' : ''} · ${money(c.monto_total)}</span></div>
      <span class="purchase__go"><span class="btn btn--sm">${c.finalizado ? 'Ver compra' : 'Ver entradas'}</span></span>
    </a>`;
  app.innerHTML = `
    <p class="label">Tu cuenta</p>
    <h1 class="display" style="font-size:3rem">Mis entradas</h1>
    <div class="section-title"><h2>Próximos</h2></div>
    ${prox.length ? `<div class="list">${prox.map(item).join('')}</div>` : `<div class="panel empty"><p>No tenés entradas para próximos shows.</p><p style="margin-top:12px"><a class="btn" href="#/">Ver cartelera</a></p></div>`}
    ${pas.length ? `<div class="section-title"><h2>Ya fuiste</h2></div><div class="list">${pas.map(item).join('')}</div>` : ''}`;
}

async function viewPurchase(params, alive) {
  if (!session.user()) { location.hash = '#/login'; return; }
  const id = params.get('id');
  if (!/^\d+$/.test(id || '')) return view404();
  const c = await api(`/compras/${id}`);
  if (!alive()) return;
  const ev = c.evento;
  app.innerHTML = `
    <a class="link" href="#/mis-entradas">← Mis entradas</a>
    ${params.get('nueva') ? `<div class="panel" style="margin-top:14px;border-color:var(--ok);background:#EAF7F1"><b>¡Compra confirmada!</b> Mostrá estos códigos QR en la entrada. También los encontrás en «Mis entradas».</div>` : ''}
    <div class="section-title" style="margin-top:20px">
      <h2>Compra #${esc(c.id_compra)}</h2>
      <span class="muted">${esc(c.fecha_compra)} · ${esc(c.metodo_pago || '')} · <b style="color:var(--ink)">${money(c.monto_total)}</b></span>
    </div>
    <div class="tickets">${c.entradas.map((t) => `
      <article class="ticket">
        <div class="ticket__main">
          <span class="label">${esc(ev.artista_nombre)} · ${ev.finalizado ? 'Finalizado' : esc(fechaLarga(ev.fecha_inicio))}</span>
          <h3>${esc(ev.nombre)}</h3>
          <span class="muted">${esc(ev.recinto_nombre)} · ${esc(ev.recinto_direccion)}, ${esc(ev.ciudad_nombre)}</span>
          <div class="ticket__seat">
            <div><span class="label">Sector</span><b>${esc(t.nombre_sector)}</b></div>
            ${t.fila ? `<div><span class="label">Fila</span><b>${esc(t.fila)}</b></div><div><span class="label">Asiento</span><b>${esc(t.numero_asiento)}</b></div>` : `<div><span class="label">Acceso</span><b>General</b></div>`}
            <div><span class="label">Precio</span><b>${money(t.precio_unitario)}</b></div>
          </div>
          <span class="muted" style="font-size:.85rem">A nombre de ${esc(c.cliente_nombre)} ${esc(c.cliente_apellido || '')}</span>
        </div>
        <div class="ticket__qr"><div data-qr="${esc(t.codigo)}" role="img" aria-label="Código QR de la entrada ${esc(t.codigo)}"></div><code>${esc(t.codigo)}</code></div>
      </article>`).join('')}</div>
    ${ev.finalizado ? `<p style="margin-top:20px"><a class="btn" href="#/evento?id=${ev.id_evento}">Dejar mi opinión del show</a></p>` : ''}`;
  drawQRs();
}

function drawQRs(tries = 0) {
  if (typeof window.qrcode !== 'function') { if (tries < 40) setTimeout(() => drawQRs(tries + 1), 100); return; }
  app.querySelectorAll('[data-qr]').forEach((el) => {
    const q = window.qrcode(0, 'M');
    q.addData('EVENTOSPRO:' + el.dataset.qr);
    q.make();
    el.innerHTML = q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  });
}

// ================================================================ ADMIN
async function viewAdmin() {
  let key = '';
  try { key = sessionStorage.getItem('ep_admin') || ''; } catch { /* */ }
  app.innerHTML = `<div class="panel" style="max-width:760px;margin:0 auto">
    <p class="label">Panel de administración</p><h1 class="display" style="font-size:2.6rem">Descuentos</h1>
    <form class="form" id="ad-key" style="margin-top:16px;grid-template-columns:1fr auto;align-items:end">
      <div class="field"><label for="ak">Clave de administrador</label><input id="ak" type="password" value="${esc(key)}" autocomplete="off"></div>
      <button class="btn">Entrar</button>
    </form>
    <div id="ad-body" style="margin-top:22px"></div></div>`;
  const body = document.getElementById('ad-body');
  async function load() {
    key = document.getElementById('ak').value;
    try { sessionStorage.setItem('ep_admin', key); } catch { /* */ }
    try {
      const list = await api('/descuentos', { headers: { 'X-Admin-Key': key } });
      body.innerHTML = `<form class="form" id="ad-form" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));align-items:end">
          <div class="field"><label for="d-p">Porcentaje</label><input id="d-p" name="porcentaje" type="number" min="1" max="100" step="0.5" value="10" required></div>
          <div class="field"><label for="d-i">Desde</label><input id="d-i" name="fecha_inicio" type="date" required></div>
          <div class="field"><label for="d-f">Hasta</label><input id="d-f" name="fecha_fin" type="date" required></div>
          <div class="field"><label for="d-d">Detalle (opcional)</label><input id="d-d" name="id_detalle" type="number" min="1"></div>
          <button class="btn btn--accent">Crear</button></form>
        <div class="list" style="margin-top:18px">${list.length ? list.map((d) => `<div class="line" style="grid-template-columns:1fr auto"><div><b>${esc(d.porcentaje)}% OFF</b>
          <small>${esc(d.fecha_inicio)} → ${esc(d.fecha_fin)}${d.id_detalle ? ' · detalle #' + esc(d.id_detalle) : ' · general'}</small></div>
          <span class="badge ${d.vigente ? '' : 'badge--past'}">${d.vigente ? 'Vigente' : 'Inactivo'}</span></div>`).join('') : '<p class="muted">No hay descuentos cargados.</p>'}</div>`;
      body.querySelector('#ad-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          await api('/descuentos', { method: 'POST', headers: { 'X-Admin-Key': key }, body: Object.fromEntries(new FormData(e.target)) });
          toast('Descuento creado.'); load();
        } catch (x) { toast(x.message, 'error'); }
      });
    } catch (x) { body.innerHTML = `<p class="err">${esc(x.message)}</p>`; }
  }
  document.getElementById('ad-key').addEventListener('submit', (e) => { e.preventDefault(); load(); });
  if (key) load();
}
