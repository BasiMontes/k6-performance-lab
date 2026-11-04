// Prueba oficial de rampa de carga, versión 2, contra api-contract-tests (localhost:3000).
//
// Cambios respecto a rampa.js (v1, descartada, ver README):
//   - Cada usuario virtual reserva en días espaciados 7 días, con pista y franja
//     distintas entre usuarios. Así no se activan los límites diario, semanal ni
//     de cadena, ni hay solapes, y los 409 esperados son casi nulos.
//   - Carga máxima de 200 usuarios virtuales, para buscar el punto de degradación.
//
// Umbrales (sin cambios respecto a v1):
//   lecturas   p95 < 100 ms
//   escrituras p95 < 200 ms
//   errores inesperados < 1 %
import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import { Rate } from 'k6/metrics';

const BASE = __ENV.API_URL || 'http://localhost:3000';
const USUARIOS = 200;
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

export const options = {
  stages: [
    { duration: '1m', target: 10 },
    { duration: '1m', target: 25 },
    { duration: '1m', target: 50 },
    { duration: '1m', target: 100 },
    { duration: '1m', target: 200 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    'http_req_duration{endpoint:lectura}': ['p(95)<100'],
    'http_req_duration{endpoint:escritura}': ['p(95)<200'],
    http_req_failed: ['rate<0.01'],
  },
};

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function setup() {
  const usuarios = [];
  const marca = Date.now();
  for (let i = 0; i < USUARIOS; i++) {
    const email = `k6v2-${marca}-${i}@example.com`;
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

  const lista = http.get(`${BASE}/pistas`, { tags: { endpoint: 'lectura' } });
  check(lista, { 'GET /pistas 200': (r) => r.status === 200 });

  const pista = PISTAS[(__VU + __ITER) % PISTAS.length];
  const detalle = http.get(`${BASE}/pistas/${pista}`, {
    tags: { endpoint: 'lectura' },
  });
  check(detalle, { 'GET /pistas/{id} 200': (r) => r.status === 200 });

  // Asignación sin colisiones entre usuarios (u0 de 0 a 199):
  // pista = u0 % 15, día = 7 * iteración + u0 % 7, franja = floor(u0 / 7) % 10.
  const pistaReserva = PISTAS[u0 % 15];
  const hora = HORAS_MADRID[Math.floor(u0 / 7) % 10];
  const dia = __ITER * 7 + (u0 % 7);
  const inicioMs = inicioEnMadrid(BASE_UTC + dia * DIA, hora);
  const inicio = new Date(inicioMs).toISOString();
  const fin = new Date(inicioMs + HORA).toISOString();

  const reserva = http.post(
    `${BASE}/reservas`,
    JSON.stringify({ pistaId: pistaReserva, inicio, fin }),
    {
      headers: { ...JSON_HEADERS, ...auth },
      tags: { endpoint: 'escritura' },
      responseCallback: http.expectedStatuses(201, 409),
    },
  );
  check(reserva, {
    'POST /reservas 201 o 409 de negocio': (r) => r.status === 201 || r.status === 409,
  });
  conflictoNegocio.add(reserva.status === 409);

  const mis = http.get(`${BASE}/reservas`, {
    headers: auth,
    tags: { endpoint: 'lectura' },
  });
  check(mis, { 'GET /reservas 200': (r) => r.status === 200 });

  sleep(1);
}
