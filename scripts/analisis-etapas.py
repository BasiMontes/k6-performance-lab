#!/usr/bin/env python3
# p95 por etapa de la rampa v3, a partir del CSV de salida de k6.
#
# Uso (en el Mac, desde la carpeta del repo):
#   python3 scripts/analisis-etapas.py resultados/v3-1-raw.csv
#
# Cada minuto de la rampa es una etapa. Solo cuentan las peticiones de la prueba
# (con etiqueta `grupo`); las de setup() no se incluyen. La latencia por endpoint
# sale de las métricas lat_* del script.
import csv
import math
import re
import sys

VUS_FIN_ETAPA = ['50', '100', '200', '300', '400', 'bajada']
NOMBRES_LAT = {
    'lat_pistas': 'GET /pistas',
    'lat_pista_detalle': 'GET /pistas/{id}',
    'lat_reservas_listar': 'GET /reservas',
    'lat_reserva_crear': 'POST /reservas',
    'lat_reserva_cancelar': 'DELETE /reservas/{id}',
}
RE_GRUPO = re.compile(r'grupo[=:](lectura|escritura)')


def p95(valores):
    if not valores:
        return float('nan')
    ordenados = sorted(valores)
    return ordenados[max(math.ceil(0.95 * len(ordenados)) - 1, 0)]


def main(ruta):
    with open(ruta, newline='') as f:
        lector = csv.reader(f)
        cabecera = next(lector)
        idx = {nombre: i for i, nombre in enumerate(cabecera)}
        for necesaria in ('metric_name', 'timestamp', 'metric_value'):
            if necesaria not in idx:
                sys.exit(f'Falta la columna {necesaria}. Cabecera: {cabecera}')

        peticiones = []  # (grupo, instante, ms)
        latencias = []   # (endpoint, instante, ms)
        for fila in lector:
            if len(fila) < len(cabecera):
                continue
            nombre = fila[idx['metric_name']]
            instante = float(fila[idx['timestamp']])
            ms = float(fila[idx['metric_value']])
            if nombre == 'http_req_duration':
                grupo = RE_GRUPO.search(' '.join(fila))
                if grupo:  # solo peticiones de la prueba, no de setup()
                    peticiones.append((grupo.group(1), instante, ms))
            elif nombre in NOMBRES_LAT:
                latencias.append((NOMBRES_LAT[nombre], instante, ms))

    if not peticiones:
        sys.exit('No hay peticiones etiquetadas con grupo. Revisa el CSV.')

    inicio = min(t for _, t, _ in peticiones)

    def etapa(t):
        return min(int((t - inicio) // 60), len(VUS_FIN_ETAPA) - 1)

    por_grupo = {}
    for grupo, t, ms in peticiones:
        por_grupo.setdefault((etapa(t), grupo), []).append(ms)

    por_endpoint = {}
    for endpoint, t, ms in latencias:
        por_endpoint.setdefault((etapa(t), endpoint), []).append(ms)

    print('Etapa  VUs al final  Lecturas p95  Escrituras p95  Peticiones')
    for e, vus in enumerate(VUS_FIN_ETAPA):
        lect = por_grupo.get((e, 'lectura'), [])
        escr = por_grupo.get((e, 'escritura'), [])
        if not lect and not escr:
            continue
        print(f'{e + 1:>5}  {vus:>12}  {p95(lect):>10.2f} ms  {p95(escr):>12.2f} ms  {len(lect) + len(escr):>10}')

    print()
    endpoints = list(NOMBRES_LAT.values())
    print('p95 por endpoint (ms):')
    print('Etapa  ' + '  '.join(f'{nombre:>18}' for nombre in endpoints))
    for e, vus in enumerate(VUS_FIN_ETAPA):
        valores = [p95(por_endpoint.get((e, nombre), [])) for nombre in endpoints]
        if all(math.isnan(v) for v in valores):
            continue
        print(f'{e + 1:>5}  ' + '  '.join(f'{v:>18.2f}' for v in valores))


if __name__ == '__main__':
    if len(sys.argv) != 2:
        sys.exit('Uso: python3 scripts/analisis-etapas.py <fichero.csv>')
    main(sys.argv[1])
