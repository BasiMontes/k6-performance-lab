// Diagnóstico de los fallos de POST /reservas observados en rampa-v2 (1,25 % con 200 VUs).
// Solo lanza reservas con la misma asignación que v2 y registra el primer fallo de cada VU:
// código HTTP, código de error de la API y motivo de k6 (si lo hay).
// No es una prueba de rendimiento: sus umbrales no se usan para nada.
import http from 'k6/http';
import { sleep } from 'k6';

const BASE = __ENV.API_URL || 'http://localhost:3000';
const USUARIOS = 200;
const PISTAS = Array.from(
  { length: 15 },
  (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`,
);
const HORAS_MADRID = [9, 10, 11, 12, 13, 16, 17, 18, 19, 20];
const BASE_UTC = Date.parse('2026-12-07T00:00:00Z');
const HORA = 60 * 60 * 1000;
const DIA = 24 * HORA;

export const options = {
  stages: [
    { duration: '1m', target: 10 },
    { duration: '1m', target: 25 },
    { duration: '1m', target: 50 },
    { duration: '1m', target: 100 },
    { duration: '1m', target: 200 },
    { duration: '10s', target: 0 },
  ],
};

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export function setup() {
  const usuarios = [];
  const marca = Date.now();
  for (let i = 0; i < USUARIOS; i++) {
    const email = `k6diag-${marca}-${i}@example.com`;
    const password = 'contraseña-k6-123';
    http.post(`${BASE}/auth/registro`, JSON.stringify({ email, password, nombre: `diag ${i}` }), { headers: JSON_HEADERS });
    const login = http.post(`${BASE}/auth/login`, JSON.stringify({ email, password }), { headers: JSON_HEADERS });
    usuarios.push({ token: login.json('token') });
  }
  return { usuarios };
}

export default function (data) {
  const u0 = (__VU - 1) % USUARIOS;
  const auth = { Authorization: `Bearer ${data.usuarios[u0].token}` };

  const pistaReserva = PISTAS[u0 % 15];
  const hora = HORAS_MADRID[Math.floor(u0 / 7) % 10];
  const dia = __ITER * 7 + (u0 % 7);
  const inicioMs = BASE_UTC + dia * DIA + (hora - 1) * HORA;

  const r = http.post(
    `${BASE}/reservas`,
    JSON.stringify({
      pistaId: pistaReserva,
      inicio: new Date(inicioMs).toISOString(),
      fin: new Date(inicioMs + HORA).toISOString(),
    }),
    { headers: { ...JSON_HEADERS, ...auth }, responseCallback: http.expectedStatuses(201, 409) },
  );

  if (r.status !== 201 && r.status !== 409) {
    console.error(
      `FALLO VU=${__VU} ITER=${__ITER} status=${r.status} error=${r.error || '-'} cuerpo=${String(r.body).slice(0, 200)}`,
    );
  }

  sleep(1);
}
