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

## Limitaciones

- k6 y la API comparten CPU.
- El almacenamiento de la API es en memoria: se mide el código, no una base de datos.
- Sin red real: la latencia es la de localhost.
- 3 ejecuciones por escenario; se reportan mínimo, mediana y máximo.

## Documentación

Ver `resultados/` (cifras con su condición y el comando que las produjo).
