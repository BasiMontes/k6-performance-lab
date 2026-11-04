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

## Escenario oficial (`scripts/rampa.js`)

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
