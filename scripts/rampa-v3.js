// Prueba de rampa de carga, versión 3, contra api-contract-tests (localhost:3000).
//
// Cambios respecto a rampa-v2.js (ver README, sección "Escenario v3"):
//   - Rampa hasta 400 usuarios virtuales (50, 100, 200, 300, 400), para buscar el punto de degradación.
//   - Asignación de reservas sin colisiones hasta 1.050 usuarios (v2 solo llegaba a 210).
//   - Cada iteración cancela la reserva creada (DELETE /reservas/{id}), para ejercitar la cancelación.
//   - Latencia por endpoint (métricas propias), para responder P3.
//
// Umbrales (sin cambios respecto a v2):
//   lecturas   p95 < 100 ms
//   escrituras p95 < 200 ms
//   errores inesperados < 1 %
import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE = __ENV.API_URL || 'http://localhost:3000';
const USUARIOS = 400;
const PISTAS = Array.from(
  { length: 15 },
  (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
);
// Franjas de inicio en hora local de Madrid. El desfase respecto a UTC cambia con el
// horario de verano (UTC+1 en invierno, UTC+2 en verano), así que se calcula por fecha.
const HORAS_MADRID = [9, 10, 11, 12, 13, 16, 17, 18, 19, 20];
const BASE_UTC = Date.parse('2026-12-07T00:00:00Z');
const MINUTO = 60 * 1000;
const HORA = 60 * MINUTO;
const DIA = 24 * HORA;

// Último domingo de un mes (0-based) a las 01:00 UTC, que es el instante del cambio de horario en la UE.
function ultimoDomingo(anio, mes) {
  const d = new Date(Date.UTC(anio, mes + 1, 0, 1));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.getTime();
}

function enHorarioVerano(t) {
  const anio = new Date(t).getUTCFullYear();
  return t >= ultimoDomingo(anio, 2) && t < ultimoDomingo(anio, 9);
}

// Instante UTC en que Madrid marca la hora indicada, para el día que empieza en inicioDiaUtc.
function inicioEnMadrid(inicioDiaUtc, horaLocal) {
  let t = inicioDiaUtc + (horaLocal - 1) * HORA; // supuesto: invierno (UTC+1)
  if (enHorarioVerano(t)) t -= HORA; // verano (UTC+2)
  return t;
}

const conflictoNegocio = new Rate('reservas_409');
const latencia = {
  pistas: new Trend('lat_pistas', true),
  pista_detalle: new Trend('lat_pista_detalle', true),
  reserva_crear: new Trend('lat_reserva_crear', true),
  reservas_listar: new Trend('lat_reservas_listar', true),
  reserva_cancelar: new Trend('lat_reserva_cancelar', true),
};

export const options = {
  // El registro y el login de 400 usuarios tardan más de los 60 s por defecto (~100 ms por petición).
  setupTimeout: '5m',
  stages: [
    { duration: '1m', target: 50 },
    { duration: '1m', target: 100 },
    { duration: '1m', target: 200 },
    { duration: '1m', target: 300 },
    { duration: '1m', target: 400 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    'http_req_duration{grupo:lectura}': ['p(95)<100'],
    'http_req_duration{grupo:escritura}': ['p(95)<200'],
    http_req_failed: ['rate<0.01'],
  },
};

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function setup() {
  const usuarios = [];
  const marca = Date.now();
  for (let i = 0; i < USUARIOS; i++) {
    const email = `k6v3-${marca}-${i}@example.com`;
    const password = 'contraseña-k6-123';
    const registro = http.post(
      `${BASE}/auth/registro`,
      JSON.stringify({ email, password, nombre: `k6 ${i}` }),
      { headers: JSON_HEADERS },
    );
    if (registro.status !== 201) {
      fail(`registro falló (${registro.status}): ${registro.body}`);
    }
    const login = http.post(
      `${BASE}/auth/login`,
      JSON.stringify({ email, password }),
      { headers: JSON_HEADERS },
    );
    if (login.status !== 200) {
      fail(`login falló (${login.status}): ${login.body}`);
    }
    usuarios.push({ token: login.json('token') });
  }
  return { usuarios };
}

export default function (data) {
  const u0 = (__VU - 1) % USUARIOS;
  const usuario = data.usuarios[u0];
  const auth = { Authorization: `Bearer ${usuario.token}` };

  const lista = http.get(`${BASE}/pistas`, {
    tags: { grupo: 'lectura', endpoint: 'pistas' },
  });
  check(lista, { 'GET /pistas 200': (r) => r.status === 200 });
  latencia.pistas.add(lista.timings.duration);

  const pista = PISTAS[(__VU + __ITER) % PISTAS.length];
  const detalle = http.get(`${BASE}/pistas/${pista}`, {
    tags: { grupo: 'lectura', endpoint: 'pista_detalle' },
  });
  check(detalle, { 'GET /pistas/{id} 200': (r) => r.status === 200 });
  latencia.pista_detalle.add(detalle.timings.duration);

  // Asignación sin colisiones entre usuarios (u0 de 0 a 399).
  // r = u0 % 7 (día de la semana de reserva), h = floor(u0 / 7) % 10 (franja),
  // p = floor(u0 / 70) % 15 (pista). Combinación (r, h, p) única para u0 < 1.050.
  // Así dos usuarios nunca reservan la misma pista, franja y día.
  const r = u0 % 7;
  const h = Math.floor(u0 / 7) % 10;
  const p = Math.floor(u0 / 70) % 15;
  const dia = __ITER * 7 + r;
  const inicioMs = inicioEnMadrid(BASE_UTC + dia * DIA, HORAS_MADRID[h]);
  const inicio = new Date(inicioMs).toISOString();
  const fin = new Date(inicioMs + HORA).toISOString();

  const reserva = http.post(
    `${BASE}/reservas`,
    JSON.stringify({ pistaId: PISTAS[p], inicio, fin }),
    {
      headers: { ...JSON_HEADERS, ...auth },
      tags: { grupo: 'escritura', endpoint: 'reserva_crear' },
      responseCallback: http.expectedStatuses(201, 409),
    },
  );
  check(reserva, {
    'POST /reservas 201 o 409 de negocio': (r) => r.status === 201 || r.status === 409,
  });
  conflictoNegocio.add(reserva.status === 409);
  latencia.reserva_crear.add(reserva.timings.duration);

  const mis = http.get(`${BASE}/reservas`, {
    headers: auth,
    tags: { grupo: 'lectura', endpoint: 'reservas_listar' },
  });
  check(mis, { 'GET /reservas 200': (r) => r.status === 200 });
  latencia.reservas_listar.add(mis.timings.duration);

  if (reserva.status === 201) {
    const id = reserva.json('id');
    const cancelacion = http.del(`${BASE}/reservas/${id}`, null, {
      headers: auth,
      tags: { grupo: 'escritura', endpoint: 'reserva_cancelar' },
      responseCallback: http.expectedStatuses(204),
    });
    check(cancelacion, { 'DELETE /reservas/{id} 204': (r) => r.status === 204 });
    latencia.reserva_cancelar.add(cancelacion.timings.duration);
  }

  sleep(1);
}
