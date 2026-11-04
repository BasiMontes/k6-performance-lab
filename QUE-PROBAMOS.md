# Qué probamos exactamente

Este documento delimita lo que mide este proyecto y lo que no. Las cifras están en `resultados/resultados.json` y en la página de `docs/`.

## Sistema bajo prueba

- API `api-contract-tests` (reservas de pistas), en local, en `http://localhost:3000`.
- Almacenamiento en memoria: se mide el código de la API, no una base de datos.
- Autenticación con JWT de 60 minutos.
- Se reinicia antes de cada ejecución. Las reservas no persisten entre ejecuciones.

## Entorno

- Un único MacBook Air para k6 y la API, en la misma máquina: Apple M3, 8 núcleos (4 de rendimiento y 4 de eficiencia), 16 GB de RAM.
- k6 2.3.0, Node 24.15.0.
- Red: localhost. No hay latencia de red real.
- Sin servicios de terceros ni ejecuciones desde la nube.

## Escenarios

| Escenario | Rampa | Peticiones por iteración | Usuarios creados en setup |
|---|---|---|---|
| v1 (descartada) | 5, 10, 20, 50 VUs | 4 | — |
| v2 (oficial) | 10, 25, 50, 100, 200 VUs | 4 | 200 |
| v3 (oficial) | 50, 100, 200, 300, 400 VUs | 5 (incluye cancelación) | 400 |

Cada etapa dura un minuto. La bajada dura 10 s y empieza con la carga máxima de la etapa anterior; no es una medición de descenso.

## Qué medimos

- **Latencia** (p95) de lecturas (`GET /pistas`, `GET /pistas/{id}`, `GET /reservas`) y escrituras (`POST /reservas`, `DELETE /reservas/{id}`).
- **Errores inesperados**: fallos que no son respuestas de negocio esperadas.
- **Respuestas 409 de negocio** (solape, límite diario, semanal o de cadena), contadas aparte. Un 409 es la API cumpliendo sus reglas.
- **Latencia por endpoint** en métricas propias, para P3.

## Umbrales

- Lecturas p95 < 100 ms.
- Escrituras p95 < 200 ms.
- Errores inesperados < 1 %.

Los umbrales se fijaron antes de la primera prueba oficial. Las cifras 100 y 200 ms vienen de la literatura de usabilidad y no se han medido en este sistema. Se usan como criterio de paso o fallo, no como límite demostrado.

## Cómo leer las cifras

- **Peticiones.** Las totales de cada ejecución incluyen las de `setup()` (400 en v2, 800 en v3). Para el límite de Wilson solo se usan las de la prueba.
- **Cero fallos.** Donde no hay ningún error, no se dice «0 %». Se da el límite superior de Wilson al 95 %. Con 0 eventos en n peticiones, vale z²/(n+z²), con z = 1,959964. Para v3 agregado, 787.300 peticiones de la prueba dan un límite de 0,00049 %.
- **Repeticiones.** Cada escenario oficial tiene 3 ejecuciones. Se reportan mínimo, mediana y máximo.
- **Estado de la API.** Antes de cada ejecución se reinicia, así que cada repetición parte del mismo estado.

## Limitaciones

1. **Un solo equipo.** k6 y la API comparten CPU y memoria. En 400 VUs, la carga de k6 puede influir en la latencia medida. No se ha separado.
2. **Atribución de CPU no confirmada.** El muestreo con `top` cada 30 s no identifica con certeza el proceso de la API. El PID se confirma con `lsof -nP -iTCP:3000 -sTCP:LISTEN`, pero no está confirmado en todas las ejecuciones.
3. **Un solo endpoint de lectura agrupado.** Las peticiones de lectura se agrupan en la etiqueta `lectura`. Para P3 se usan las métricas `lat_*` por endpoint.
4. **`GET /reservas` crece durante la prueba.** Devuelve también las reservas canceladas, así que su respuesta aumenta con el tiempo. Parte de su latencia puede venir de eso.
5. **Coste de `POST /reservas` creciente.** La API guarda todas las reservas en una lista y algunas comprobaciones la recorren. Su coste puede subir a medida que la lista crece.
6. **Aviso de series temporales en k6.** En v3, k6 avisa de más de 400.000 series incluso tras corregir `systemTags`. La causa no está identificada. No afecta a los umbrales, pero aumenta la carga de k6.
7. **Punto de rotura no encontrado.** La prueba más alta llega a 400 VUs sin errores. No se ha probado si hay degradación de errores por encima de esa carga. Decisión de cierre: no se hace v4 (500–600 VUs); el punto de rotura queda como limitación.
8. **Variabilidad entre repeticiones.** En v3 la latencia de lecturas a 400 VUs va de 10 a 19 ms según la ejecución. La causa de esa diferencia no está confirmada.
9. **CSV crudos fuera del repo.** Los ficheros de resumen están en `resultados/`, pero los CSV crudos no. Las cifras por etapa de v3 no se pueden reproducir desde el repo.

## Qué no afirmamos

- No afirmamos el comportamiento con base de datos real, con red real ni con varios equipos.
- No afirmamos un punto de rotura. Afirmamos que no se encontró hasta 400 VUs.
- No afirmamos un orden de sensibilidad entre endpoints hasta que el análisis por endpoint de las tres repeticiones esté verificado.
