# Simulador AN/PRC-117F + SKL AN/PYQ-10

Simulador web de entrenamiento para practicar la operación de la radio táctica
**AN/PRC-117F** y la carga de claves con el **Simple Key Loader (SKL) AN/PYQ-10**.

Es una página estática: no necesita servidor, compilación ni conexión a internet.

> Uso exclusivamente educativo. No está afiliado a ningún fabricante ni organismo.
> Las claves, frecuencias, estaciones e indicativos son ficticios y el simulador
> no contiene algoritmos ni material criptográfico real. Los menús son una
> aproximación didáctica y no sustituyen al manual del equipo.

## Cómo abrirlo

- Doble clic en `index.html`, o bien
- `npm start` (sirve la carpeta en http://localhost:8080 con Python).

También se puede publicar tal cual en GitHub Pages.

## Qué simula

### Radio AN/PRC-117F
- **Perilla de función**: `OFF`, `ON`, `LD` (carga de claves), `RMT` (remoto, panel bloqueado)
  y `Z` (zeroize de emergencia con retorno por resorte).
- **Pantalla de 4 líneas** con indicadores TX / RX / CT / LD / BAT y modo.
- **Teclado**: `PGM`, `OPT`, `MODE`, `CT/PT`, `PRE+`/`PRE−`, `LUZ`, `ZERO`, `CLR`, `ENT`, flechas y numérico.
- **10 presets** programables: modo (LOS, SINCGARS, HAVE QUICK II, SATCOM), modulación FM/AM,
  frecuencia con validación de banda, ancho de canal, potencia (1/5/10/20 W), tráfico voz/datos,
  cifrado PT/CT y slots de clave.
- **12 slots** de claves (TEK, TSK, WOD, KEK), con detalle y borrado individual.
- **Autoprueba BIT**, **sincronización TOD** (necesaria para HAVE QUICK) y batería que se descarga.
- **Microteléfono con PTT** (mantener pulsado o barra espaciadora).

### SKL AN/PYQ-10
- Arranque, **CIK** obligatorio y **PIN** (entrenamiento: `1234`; 3 fallos bloquean el equipo).
- Base de datos de claves de entrenamiento con vigencia (incluye una clave **caducada** que el SKL se niega a emitir).
- **Emisión (fill)** a la radio por el cable de llenado con protocolo DS-101 / DS-102.
- **Auditoría**, generación de claves de entrenamiento, borrado y **zeroize**.

### Red simulada
Cinco estaciones responden cuando la configuración coincide con su red (canal, modulación,
ancho de banda, TEK, TSK/WOD, TOD, tipo de antena y alcance según la potencia).
Con las **ayudas del instructor** activadas, el registro explica por qué no hubo respuesta.

| Estación | Red |
|---|---|
| Halcón 6 | LOS FM 45.5000 MHz, PT, 3 km |
| Cóndor 3 | LOS FM 62.7500 MHz, CT ALFA-TEK-01, 12 km |
| Jaguar 1 | SINCGARS red 345, TSK SINC-HOP-12, CT BRAVO-TEK-02, 8 km |
| Águila 2 | HAVE QUICK II red 300, WOD HQ-WOD-NOV, TOD, 40 km (en vuelo) |
| Base Centauro | SATCOM canal 25, CT SAT-TEK-07, antena SATCOM, ≥ 10 W |

### Ejercicios guiados
1. Encendido y autoprueba (BIT)
2. Red en claro LOS FM
3. Carga de una TEK con el SKL
4. Red cifrada LOS (CT)
5. SINCGARS (salto de frecuencia)
6. HAVE QUICK II (tierra-aire)
7. SATCOM táctico
8. Borrado de emergencia (zeroize)

Cada ejercicio comprueba en vivo sus objetivos. El progreso, los presets y las claves se
guardan en el navegador (`localStorage`); «Reiniciar todo» vuelve al estado inicial.

## Atajos de teclado

Dígitos y `.` · `Intro` = ENT · `Retroceso`/`Esc` = CLR · flechas · `P` = PGM · `O` = OPT ·
`M` = MODE · `C` = CT/PT · `L` = LUZ · `+`/`−` = preset · `barra espaciadora` = PTT.

## Estructura

```
index.html         página
css/styles.css     estilos
js/core.js         utilidades comunes
js/radio.js        modelo de la AN/PRC-117F (sin DOM)
js/skl.js          modelo del SKL AN/PYQ-10 (sin DOM)
js/net.js          estaciones y red simulada (sin DOM)
js/scenarios.js    ejercicios guiados
js/audio.js        pitidos, ruido de squelch y voz sintetizada
js/ui-skl.js       pantalla táctil del SKL
js/app.js          interfaz y eventos
tests/             pruebas de los modelos (node --test)
```

## Pruebas

```
npm test
```

Requiere Node 18 o superior; no hay dependencias que instalar.
