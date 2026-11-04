# k6 performance lab

Proyecto 4 del portfolio de QA: pruebas de rendimiento con k6 contra la API de reservas de pistas (`api-contract-tests`), ejecutada en local.

**Estado:** v2 medida en 3 ejecuciones, con todos los umbrales cumplidos. No se ha encontrado punto de degradación hasta 200 VUs, así que P1 sigue abierta. La v3 (hasta 400 VUs) está preparada y sus predicciones anotadas; pendiente de ejecutar.

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
- **v2-1 (primera ejecución de v2), inválida.** Lecturas p95 4,15 ms y escrituras p95 5,28 ms con 200 VUs, 20 de 17.950 reservas en 409. Pero **905 `POST /reservas` devolvieron 400 `OUTSIDE_OPENING_HOURS` y el umbral de errores se incumplió (1,25 %)**. Causa: un error del escenario, no de la API. La conversión de hora local a UTC suponía siempre UTC+1, y desde el cambio a horario de verano (28/3/2027) las reservas de las 13:00 caían a las 14:00 de Madrid, que es horario de cierre. La API respondió correctamente. Los fallos afectaban solo a las VU que reservaban a las 13:00 y empezaron en la iteración 16 (29/3/2027). Se corrigió el cálculo del desfase por fecha y se comprobó contra la zona horaria real de Madrid (80.000 casos, 0 errores). `diagnostico-post.js` queda como registro de esa investigación.
- **v2-1, válida (primera repetición oficial, con la corrección de horario).** 17.828 iteraciones y 71.712 peticiones, 0 errores inesperados y 0 de 17.828 reservas en 409. Todos los umbrales cumplidos: lecturas p95 9,35 ms y escrituras p95 9,42 ms, con máximo global de 176 ms (incluye las peticiones de `setup`). Con 200 VUs la latencia de lectura sube cinco veces respecto a 1 VU (1,99 ms), pero no llega al umbral. No se ha encontrado punto de degradación. Limitación: `GET /reservas` devuelve todas las reservas del usuario, que crecen durante la prueba, así que parte del aumento puede venir de ahí. Las repeticiones y la CPU se resuelven en «Resultados v2».
- **v2 (`scripts/rampa-v2.js`), oficial.** Rampa 10-25-50-100-200 VUs, un minuto cada etapa, bajada de 10 s. Cambia la asignación de reservas: cada usuario reserva un día cada 7 días y en una pista y franja asignadas sin colisiones entre usuarios. Los 409 esperados son casi nulos.

El cambio se decidió tras ver `rampa-1`, así que v1 y v2 no son comparables entre sí en la parte de escrituras.

## Resultados v2 (3 ejecuciones)

Condiciones: k6 2.3.0, Node 24.15.0, API reiniciada antes de cada ejecución. Chip, núcleos y RAM del Mac: pendiente de anotar. Salidas completas en `resultados/v2-1.txt`, `v2-2.txt` y `v2-3.txt`.

| Ejecución | Iteraciones | Errores inesperados | Reservas en 409 | p95 lecturas | p95 escrituras |
|---|---|---|---|---|---|
| v2-1 (válida) | 17.828 | 0 | 0 | 9,35 ms | 9,42 ms |
| v2-2 | 17.884 | 0 | 0 | 7,26 ms | 7,89 ms |
| v2-3 | 17.924 | 0 | 0 | 5,28 ms | 6,16 ms |
| **Mínimo** | | | | **5,28 ms** | **6,16 ms** |
| **Mediana** | | | | **7,26 ms** | **7,89 ms** |
| **Máximo** | | | | **9,35 ms** | **9,42 ms** |

Máximos por petición, sin `setup`, disponibles solo para v2-3: lecturas 46,13 ms y escrituras 17,27 ms. El máximo global de cada ejecución (176, 172 y 321 ms) incluye las peticiones de registro y login de `setup`, que no llevan etiqueta de endpoint.

Conclusiones:

- **P2:** los umbrales se cumplen en las tres ejecuciones. El p95 más alto de lecturas (9,35 ms) queda más de 10 veces por debajo de 100 ms, y el de escrituras (9,42 ms) más de 20 veces por debajo de 200 ms. Errores inesperados: 0 en las tres.
- **P1:** no hay punto de degradación hasta 200 VUs. La mediana de lecturas sube de 1,99 ms con 1 VU (calibración) a unos 7 ms con 200 VUs, entre 3 y 5 veces más, sin cruzar el umbral. Para encontrar el punto hace falta más carga.
- **P3:** no concluyente. Las escrituras son algo más lentas que las lecturas en las tres ejecuciones (diferencias de 0,1 a 0,9 ms), pero la etiqueta `lectura` agrupa tres endpoints (`GET /pistas`, `GET /pistas/{id}` y `GET /reservas`). Con esta versión no se puede decir qué endpoint es el más sensible.

Predicciones v2:

- Lecturas p95 < 100 ms hasta 100 VUs: se cumple.
- Lecturas incumplen con 200 VUs: no se cumple; siguen por debajo del umbral.
- Proporción de 409 < 1 %: se cumple (0 %).
- k6 consume mucha CPU con 200 VUs: no se cumple en la muestra de v2-3 (unos 11 %), aunque la medición es parcial (ver limitaciones).

CPU de v2-3 (`top` cada 30 s): no concluyente. Un proceso `node` que probablemente es la API (PID 75969, no confirmado) subió de 2 % a 34 % durante la prueba. Otros procesos `node` efímeros llegaron a 150–196 % en una o dos muestras. No se capturó la CPU total del sistema.

Estado de P1: abierta. Una rampa v3 con más de 200 VUs está propuesta, sin ejecutar.

## Escenario v3 (`scripts/rampa-v3.js`)

Objetivo: encontrar el punto de degradación (P1) y separar la sensibilidad por endpoint (P3). Pendiente de ejecutar.

- Rampa: 50, 100, 200, 300 y 400 usuarios virtuales, un minuto por etapa, y bajada de 10 s.
- 400 usuarios de la API creados en `setup`, uno por usuario virtual.
- `setupTimeout` de 5 minutos. Primera ejecución (v3-1, sin medir): `setup` superó el límite de 60 s por defecto. En ese minuto se completaron 598 peticiones, unas 10 por segundo, con `node` al 86–99,8 % de un núcleo. El registro y el login, de ~100 ms cada uno, son caros en CPU; con 200 usuarios en v2 cabía justo en el límite.
- Por iteración: `GET /pistas`, `GET /pistas/{id}`, `POST /reservas`, `GET /reservas` y `DELETE /reservas/{id}` (cancelación de la reserva recién creada).
- Asignación de reservas: `r = u0 % 7` (día), `h = floor(u0 / 7) % 10` (franja), `p = floor(u0 / 70) % 15` (pista). Cada usuario tiene una combinación única, así que no hay solapes hasta 1.050 usuarios. Cambio respecto a v2: con 400 usuarios, la pista solo varía entre 6 de las 15 (`p` de 0 a 5).
- Latencia por endpoint en métricas propias (`lat_*`) para P3. Las peticiones con ID en la URL llevan un `name` fijo, para no crear una serie por cada ID.
- Cada ejecución guarda datos crudos con `--out csv=resultados/v3-N-raw.csv`, para calcular el p95 por etapa (P1). Los umbrales son los mismos que en v2 y se aplican por grupo (`grupo:lectura` y `grupo:escritura`).
- Los 409 siguen contándose aparte en `reservas_409`. Con esta asignación deben ser cero; cualquier 409 es un problema del escenario.

Limitaciones que afectan a esta versión:

- `GET /reservas` devuelve también las reservas canceladas. Cada usuario acumula una por iteración, así que su respuesta crece durante la prueba.
- La API guarda todas las reservas de todos los usuarios en una sola lista, y algunas comprobaciones recorren esa lista. El coste de `POST /reservas` puede crecer durante la prueba, a medida que la lista se alarga.

### Predicciones v3 (anotadas antes de la primera ejecución)

Hipótesis cualitativas, sin cifras:

- Lecturas: la latencia sube de forma no lineal con la carga. El p95 de lecturas seguirá por debajo de 100 ms hasta 400 VUs. Si lo supera, será en las etapas de 300 o 400 VUs.
- Escrituras: `POST /reservas` será más lento que `DELETE /reservas/{id}` en todas las etapas, porque valida solapes y límites. Es la hipótesis de P3 del alcance.
- `GET /reservas` tendrá una latencia que crece a lo largo de la prueba por el tamaño de la respuesta. Es un efecto del escenario, no de la carga de concurrencia.
- Errores inesperados: cero hasta 400 VUs. Si aparecen, serán tiempos de espera o errores 5xx en las etapas más altas.
- Node ejecuta el código de la API en un solo hilo. Si la latencia se dispara en 300 o 400 VUs, el proceso `node` debería acercarse al 100 % de un núcleo en ese tramo. Si no se acerca, la causa no es la CPU de la API.
- Si alguna predicción no se cumple, se anota aquí con la explicación. Si la prueba falla, primero se decide si el fallo es de la prueba o del producto.

### Historial de v3

- **v3-1, primera medición (descartada para la curva).** Umbrales cumplidos: lecturas p95 6,14 ms, escrituras p95 4,66 ms, 0 errores inesperados y 0 reservas en 409 (52.554 iteraciones). Por endpoint, p95 de `GET /pistas` 6,35 ms, `GET /pistas/{id}` 6,94 ms, `GET /reservas` 4,70 ms, `POST /reservas` 5,35 ms y `DELETE` 3,69 ms. Pero el resumen es de toda la prueba y no tiene datos por etapa, así que P1 no se responde con ella. Además, k6 avisó de más de 400.000 series temporales por las URL con ID. Se corrige en el script (nombres fijos) y se guardan datos crudos. Las tres repeticiones oficiales se harán con el script corregido.
- **v3-1, segunda medición (con CSV, descartada).** Umbrales cumplidos: lecturas p95 4,01 ms, escrituras p95 3,22 ms, 0 errores y 0 en 409 (52.700 iteraciones). Por endpoint, p95 de 4,17 / 4,25 / 3,58 / 3,60 / 2,73 ms (pistas, detalle, listar, crear, cancelar). Sigue el aviso de más de 400.000 series: el nombre fijo no bastaba, porque k6 también etiqueta cada petición con `url` (con el ID). Se corrige con `systemTags` sin `url`. Las cifras de la primera medición y de esta difieren en torno a un 30 %, lo que ya indica la variabilidad entre ejecuciones.
- Captura de CPU durante v3-1: el proceso `node` (probablemente la API) subió hasta unos 50 % de un núcleo, y k6 hasta un 32 %, con el sistema al 80 % inactivo. Sin saturación del núcleo, con la alineación temporal aproximada.

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
- La CPU se muestrea con `top` cada 30 s: la atribución por proceso no está confirmada.
- Las etiquetas agrupan endpoints: `lectura` incluye tres endpoints, así que P3 no se responde por endpoint con esta versión.

## Documentación

Ver `resultados/` (cifras con su condición y el comando que las produjo).
