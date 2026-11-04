# k6 performance lab

Proyecto 4 del portfolio de QA: pruebas de rendimiento con k6 contra la API de reservas de pistas (`api-contract-tests`), ejecutada en local.

**Estado:** alcance confirmado, sin mediciones todavía. Los umbrales p95 se fijarán y anotarán antes de la primera ejecución.

## Objetivo

Medir cómo se comporta la API bajo carga creciente y convertir los umbrales de latencia y error en pruebas que fallan si no se cumplen.

## Preguntas

- **P1:** ¿a partir de qué carga sube la latencia de cada endpoint y cuándo aparecen errores?
- **P2:** ¿cumplen los endpoints críticos un p95 y una tasa de error fijados antes de medir?
- **P3:** ¿qué endpoints son más sensibles a la carga, y por qué?

## Entorno

- Mac de desarrollo, mismo equipo para k6 y la API. Cada cifra declara chip, núcleos, RAM, versión de k6 y de Node.
- Node 24 (`nvm use` o `fnm use`).
- Aplicación: https://github.com/BasiMontes/api-contract-tests, arrancada en local.

## Preparar el entorno

Pasos previos a cualquier medición. Cada uno se comprueba antes de seguir con el siguiente.

1. **Instalar k6** en el Mac: `brew install k6`. Comprobar con `k6 version`. Versión usada en las primeras mediciones: 2.3.0.
2. **Node 24** en la carpeta de la API: `nvm use` (o `fnm use`) y `node -v`, que debe mostrar `v24.x`.
3. **Clonar la API** y arrancarla en una terminal aparte:
   - `git clone https://github.com/BasiMontes/api-contract-tests`
   - `cd api-contract-tests`, `npm install`, `npm run server`
   - Escucha en `http://localhost:3000`. Para otro puerto, `PORT=<puerto>`.
4. **Comprobar que responde** en otra terminal: `curl http://localhost:3000/pistas`. Debe devolver JSON.

Antes de cada ejecución completa: parar el servidor (Ctrl+C) y volver a arrancarlo. Las reservas están en memoria, así que sin reinicio la siguiente medición parte de un estado distinto.

## Umbrales (fijados antes de la primera prueba oficial)

| Grupo | Umbral | Motivo |
|---|---|---|
| Lecturas (`GET /pistas`, `GET /pistas/{id}`, `GET /reservas`) | p95 < 100 ms | Referencia clásica de respuesta que el usuario percibe como inmediata. |
| Escrituras (`POST /reservas`) | p95 < 200 ms | Hace más comprobaciones (solapes, límites). Provisional: no tenemos calibración de escrituras. |
| Errores inesperados | < 1 % | Convención habitual de k6. Los 409 de negocio no cuentan (ver abajo). |

Las cifras 100 y 200 ms vienen de la literatura de usabilidad, no se han medido en este sistema. La calibración en reposo (1 VU, solo lecturas) dio p95 de 1,99 ms.

## Historial de versiones

- **v1 (`scripts/rampa.js`), descartada.** Rampa 5-10-20-50 VUs. Primera ejecución: lecturas p95 1,77 ms, escrituras p95 2,66 ms, 0 errores inesperados, **88,3 % de 409**. No se encontró punto de degradación. Se descarta porque (a) el 88 % de las escrituras eran rechazos por límites o solapes, así que la latencia de escritura no era la de crear reservas, y (b) 50 VUs no llegan al punto de degradación. Solo se hizo una repetición; no se usa como resultado final.
- **v2 (`scripts/rampa-v2.js`), oficial.** Rampa 10-25-50-100-200 VUs, un minuto cada etapa, bajada de 10 s. Cambia la asignación de reservas: cada usuario reserva un día cada 7 días y en una pista y franja asignadas sin colisiones entre usuarios. Los 409 esperados son casi nulos.

El cambio se decidió tras ver `rampa-1`, así que v1 y v2 no son comparables entre sí en la parte de escrituras.

## Escenario oficial v2 (`scripts/rampa-v2.js`)

- Rampa: 10, 25, 50, 100 y 200 usuarios virtuales, un minuto por etapa, y bajada de 10 s.
- Cada usuario virtual tiene su propio usuario de la API, creado en `setup`: 200 en total.
- Por iteración: `GET /pistas`, `GET /pistas/{id}`, `POST /reservas`, `GET /reservas`.
- Los 409 siguen contándose aparte en `reservas_409`. Con v2 deberían ser casi nulos; si no lo son, es un problema del escenario, no de la API.

## Predicciones v2 (anotadas antes de la primera ejecución)

Sin cifras. Hipótesis cualitativas:

- Las escrituras de v2 medirán sobre todo creación real, así que su p95 será algo mayor que en v1.
- Las lecturas cumplirán p95 < 100 ms hasta 100 VUs. Puede que se incumpla en la etapa de 200 VUs.
- La proporción de 409 será casi nula (menos del 1 %).
- En la etapa de 200 VUs, el propio k6 puede consumir mucha CPU del Mac. Si pasa, los resultados de esa etapa mezclan el coste de k6 con el de la API, y se declara.
- Si alguna predicción no se cumple, se anota aquí con la explicación.

## Predicciones v1 (históricas)

Ver el historial arriba: se cumplieron lecturas < 100 ms, escrituras más lentas que lecturas y 409 altos.

## Escenario v1 (`scripts/rampa.js`, histórico)

- Rampa: 5, 10, 20 y 50 usuarios virtuales, un minuto cada etapa, y bajada de 10 s. k6 interpola entre etapas.
- Cada usuario virtual tiene su propio usuario de la API, creado en `setup`.
- Por iteración: `GET /pistas`, `GET /pistas/{id}`, `POST /reservas`, `GET /reservas`.
- **Los 409 de negocio no son fallos**: solape, límite diario, semanal o de cadena. Se cuentan aparte en `reservas_409`. Un 409 es la API cumpliendo sus reglas; lo que medimos es si responde a tiempo.
- No se incluye la cancelación (`DELETE`) en esta primera versión.

## Predicciones (anotadas antes de la primera ejecución oficial)

Sin cifras. Hipótesis cualitativas:

- Las lecturas cumplen p95 < 100 ms durante toda la rampa, o empiezan a incumplirlo solo en la etapa de 50 usuarios.
- Las escrituras son más lentas que las lecturas, con p95 más alto.
- La proporción de 409 será alta, porque los usuarios virtuales compiten por las mismas pistas y franjas. No es un fallo de la API.
- Si alguna predicción no se cumple, se anota aquí con la explicación.

## Limitaciones

- k6 y la API comparten CPU.
- El almacenamiento de la API es en memoria: se mide el código, no una base de datos.
- Sin red real: la latencia es la de localhost.
- 3 ejecuciones por escenario; se reportan mínimo, mediana y máximo.

## Documentación

Ver `resultados/` (cifras con su condición y el comando que las produjo).
