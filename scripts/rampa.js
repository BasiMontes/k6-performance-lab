// Prueba oficial de rampa de carga contra api-contract-tests (localhost:3000).
//
// Umbrales (fijados antes de la primera ejecución; motivos en README.md):
//   lecturas  p95 < 100 ms
//   escrituras p95 < 200 ms
//   errores inesperados < 1 %
//
// Decisiones de diseño:
//   - Cada usuario virtual usa su propio usuario de la API (creado en setup).
//   - 409 de negocio (solape, límites) son respuestas correctas: no cuentan como
//     error de http_req_failed, y su proporción se reporta aparte.
//   - La rampa (5, 10, 20, 50 VUs, un minuto cada etapa) es decisión de diseño.
import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import { Rate } from 'k6/metrics';

const BASE = __ENV.API_URL || 'http://localhost:3000';
const USUARIOS = 50;
const PISTAS = Array.from(
  { length: 15 },
  (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
);
// Inicio de referencia: 10:00 de Madrid el 7/12/2026 (CET, UTC+1), es decir 09:00Z.
const INICIO_BASE = Date.parse('2026-12-07T09:00:00Z');
const MINUTO = 60 * 1000;
const DIA = 24 * 60 * MINUTO;

const conflictoNegocio = new Rate('reservas_409');

export const options = {
  stages: [
    { duration: '1m', target: 5 },
    { duration: '1m', target: 10 },
    { duration: '1m', target: 20 },
    { duration: '1m', target: 50 },
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
    const email = `k6-${marca}-${i}@example.com`;
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
  const usuario = data.usuarios[(__VU - 1) % data.usuarios.length];
  const auth = { Authorization: `Bearer ${usuario.token}` };

  const lista = http.get(`${BASE}/pistas`, { tags: { endpoint: 'lectura' } });
  check(lista, { 'GET /pistas 200': (r) => r.status === 200 });

  const pista = PISTAS[(__VU + __ITER) % PISTAS.length];
  const detalle = http.get(`${BASE}/pistas/${pista}`, {
    tags: { endpoint: 'lectura' },
  });
  check(detalle, { 'GET /pistas/{id} 200': (r) => r.status === 200 });

  const dia = (__VU * 13 + __ITER) % 90;
  const inicio = new Date(INICIO_BASE + dia * DIA).toISOString();
  const fin = new Date(INICIO_BASE + dia * DIA + 60 * MINUTO).toISOString();
  const reserva = http.post(
    `${BASE}/reservas`,
    JSON.stringify({ pistaId: pista, inicio, fin }),
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
