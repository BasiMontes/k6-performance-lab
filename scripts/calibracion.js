// Medición de calibración: un solo usuario virtual, sin umbrales.
// Sirve para ver la latencia en reposo antes de fijar los umbrales oficiales.
// No certifica nada: sus cifras no se usan como prueba de cumplimiento.
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE = __ENV.API_URL || 'http://localhost:3000';

export const options = {
  vus: 1,
  duration: '60s',
};

export default function () {
  const lista = http.get(`${BASE}/pistas`);
  check(lista, { 'GET /pistas 200': (r) => r.status === 200 });

  const id = '00000000-0000-4000-8000-000000000001';
  const detalle = http.get(`${BASE}/pistas/${id}`);
  check(detalle, { 'GET /pistas/{id} 200': (r) => r.status === 200 });

  sleep(1);
}
