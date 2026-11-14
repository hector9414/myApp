# Simulador AN/PRC-117F + SKL AN/PYQ-10

Simulador de entrenamiento para practicar la operación de la radio táctica **AN/PRC-117F**
y la carga de material COMSEC con el **Simple Key Loader (SKL) AN/PYQ-10**, incluido el
modo de activación **KYK-13** (DS-102). Se distribuye como **aplicación de escritorio**
(ejecutable de Windows, AppImage de Linux) y también funciona como página web sin conexión.

Los menús, mensajes de pantalla y procedimientos siguen los manuales de la carpeta `Manuals/`
(manual de operación de la AN/PRC-117F, curso de operador y curso del SKL).

> **Uso exclusivamente educativo.** No está afiliado a ningún fabricante ni organismo y no
> sustituye a los manuales oficiales. Todas las claves, frecuencias, estaciones, direcciones
> DAMA e indicativos son **ficticios** y el simulador no contiene algoritmos ni material
> criptográfico real.

## Descarga y ejecución

| Plataforma | Archivo | Cómo usarlo |
|---|---|---|
| Windows (sin instalar) | `SimuladorPRC117F-SKL-<versión>-portable.exe` | Doble clic. No necesita permisos de administrador. |
| Windows (instalador) | `SimuladorPRC117F-SKL-<versión>-instalador.exe` | Instala con accesos directos en el escritorio y en el menú Inicio. |
| Linux | `SimuladorPRC117F-SKL-<versión>.AppImage` | `chmod +x` y ejecutar. |
| Navegador | `index.html` | Doble clic; no necesita servidor ni internet. |

Los ejecutables se generan automáticamente con GitHub Actions (ver «Compilar los ejecutables»).
El progreso, la programación de la radio y la base de datos del SKL se guardan en el propio
equipo; el botón «Reiniciar todo» vuelve al estado inicial.

## Qué simula

### Radio AN/PRC-117F
- **Interruptor de función**: `OFF`, `PT`, `CT`, `TD`, `RV`, `LD`, `Z-ALL` y `CLR`, con sus efectos:
  - Z-ALL borra los datos rojos (COMSEC y TRANSEC) y muestra «ZEROIZE PASSED / RESET RADIO».
  - CLR borra también la programación; al encender aparece «WARNING BLACK DATA RESET».
  - La tecla 5/ZERO borra solo la programación.
- **KDU con teclas de doble función**: 1 CALL, 2 LT, 3 MODE, 4 SQ, 5 ZERO, 6 ▲, 7 OPT, 8 PGM, 9 ▼, 0 ⟳, CLR, ENT, ◄ ►, VOL ±, PRE ±.
- **Pantallas operacionales** (`00*NET0 … NORM`, `VINSON TEK01 CT`, `TYPE ADF DATA MODE SQL`) y pantallas alternativas con ⟳.
- **Programación** con la estructura real de menús: `PGM > NORM > NET > ACTIVATE IN LIST? > NET TYPE`.
  - **Menú de red**: FREQ, COMSEC, DATA/VOC, SQ, PWR, NAME.
  - **Campos numéricos** con cursor, como en la radio.
  - **Nombres** con entrada multitecla (1=ABC, 2=DEF…).
  - **Límites** de frecuencia y de potencia por banda y modulación (1-20 W en pasos de 1 dB).
- **Tipos de red**:
  - LOS fija de 30 a 511,99999 MHz, en FM/AM, con squelch TONE/NOISE.
  - SATCOM dedicado con códigos de frecuencia: 9-128 son canales de 25 kHz, 129-239 de 5 kHz y 999 es entrada manual.
  - SINCGARS: compartimentos de hopset y red F###.
  - HAVEQUICK II: número de red, MWOD por día UTC y TOD.
  - DAMA: 10 redes, configuraciones de puerto y destinos.
- **COMSEC**:
  - **Bancos**: VINSON, ANDVT y KG-84 (TEK 01-25, KEK, TrKEK); TSK de satélite y de SINCGARS (01-25); MWOD HAVEQUICK (01-31).
  - **Modos por tipo de red**: en 5 kHz solo ANDVT o KG-84; con VINSON solo FM.
- **Carga (LD)**: `FILL DEVICE` (CYZ-10 DS-101, KYK-13, CYZ10-RDS) > `CRYPTO TYPE` > `SELECT KEY TYPE` > `KEY NUMBER`.
  - Mensajes: «PRESS ENTER TO INITIATE», «FILL IN PROGRESS», «FILL DONE / BAD FILL», «MORE FILL DATA?» y «CHANGE SW FROM LD».
- **Seguridad del conector J1**:
  - El microteléfono y el dispositivo de llenado comparten J1.
  - Si se conecta el SKL fuera de LD/RV, la radio transmite sola, como advierte el curso.
- **SATCOM**:
  - Apuntamiento de la antena (azimut y elevación).
  - Prueba **RSSI** con 1/CALL; hace falta 80 o más.
  - El SATCOM en claro no está permitido.
- **DAMA**:
  - Secuencia ACQUIRING > RANGING > LOGGING IN > CONNECTED.
  - Llamada con CALL > PLACE A CALL (destino, precedencia y duración).
  - Errores 71, 77, 81 y 82, como en el manual.
- **MODE > TEST**: BIT, BATTERY, VERSIONS y ETI.
- **OPT**: cambios de COMSEC y potencia sin salir de la operación, y TIME (TOD de SINCGARS y HAVEQUICK).

### SKL AN/PYQ-10
- **Equipo físico**: botón de encendido, botón de **ZEROIZE**, **luz KOV**, CIK y batería con los colores del manual (verde > 40 %, ámbar, rojo ≤ 10 %; a 1 % se apaga).
- **CIK**: solo se inserta o retira **con el equipo apagado**; si se hace encendido, queda registrado como alarma.
- **Inicio de sesión** con usuario y contraseña. Cuentas de entrenamiento:
  - **operador** / `Operador1`
  - **sso** / `Sso12345`
  - Tres fallos bloquean la cuenta.
- **Escritorio Core Library** > **UAS** con las pestañas **Plats, Eqs, Keys y SOI**.
- **Keys**: clave almacenada, clave caducada (RED KEY) y etiqueta sin variable (KEY TAG). Permite ver la información de cada clave y destruir las caducadas (View > Expired).
- **Carga de claves**: `LOAD` > Protocol **DS-101 / DS-102** > Activation Mode **KYK-13** > «Ready to send key» > «Press INITIATE button…». En ese momento se pulsa ENT en la radio.
  - Con DS-101 la radio comprueba el tipo de clave.
  - Con DS-102 (KYK-13) guarda la clave en el banco que se elija en la radio.
- **Loadset SINCGARS por ICOM** desde Plats, con hora opcional.
  - Asistente: Load ECU > Connect > Profiles > Send.
  - Destino en la radio: las TEK van a VINSON TEK 21-25 y los hopsets a los compartimentos 20-25, como en el curso.
- **Auditoría**: solo con cuenta SSO (Tools > SSO > Audit Functions).
- **Orden de apagado**: salir de la UAS, cerrar sesión (Log Off) y apagar.

### Red simulada (SOI de entrenamiento)
Las estaciones responden solo si la radio está configurada como su red: canal, modulación,
squelch, COMSEC y TEK, hopset, MWOD, TOD, antena, apuntamiento y alcance según la potencia.
Con «Ayudas del instructor», el registro explica por qué no hubo respuesta.

| Estación | Red |
|---|---|
| Halcón 6 | LOS 45,50000 MHz FM, PT, squelch TONE, 3 km |
| Cóndor 3 | LOS 62,75000 MHz FM, CT VINSON (ETD-VIN-0001), 15 km |
| Jaguar 1 | SINCGARS F345 (loadset LS-MANIOBRA), VINSON TEK #1, 8 km |
| Águila 2 | HAVEQUICK II red 00.300, MWOD ETD-MWOD, TOD, 40 km en vuelo |
| Base Centauro | SATCOM dedicado código 150 (5 kHz), CT ANDVT (ETD-AND-0031) |
| Nodo Orión | DAMA canal 054 (25 kHz AC), red 51234, TBA 10452, TSK ETD-SAT-0007, ANDVT (ETD-AND-0044), código 060 |

Satélite de entrenamiento: azimut 135°, elevación 40°.

### Ejercicios guiados
1. Preparación y autoprueba (BIT)
2. Red LOS en claro (PT)
3. Carga de una TEK con el SKL (DS-102, KYK-13)
4. Red LOS cifrada (VINSON, CT)
5. SINCGARS: loadset por ICOM y red F345
6. HAVEQUICK II (tierra-aire)
7. SATCOM dedicado 5 kHz con ANDVT
8. SATCOM DAMA (25 kHz AC)
9. Borrado de emergencia

Cada ejercicio muestra sus pasos y comprueba los objetivos en vivo.

## Procedimiento rápido: cargar una TEK con el SKL en modo KYK-13

1. **SKL apagado**: insertar el CIK. Encender, iniciar sesión y abrir la UAS.
2. **Radio**: interruptor en **LD**. Solo entonces conectar el SKL a **J1** (antes, retirar el H-250).
3. **Radio**: `FILL DEVICE` KYK-13 > `CRYPTO TYPE` (p. ej. VINSON o ANDVT) > `KEY TYPE` TEK > `KEY NUMBER` 01 > «PRESS ENTER TO INITIATE».
4. **SKL**: pestaña Keys > marcar la clave > **LOAD** > DS-102 + KYK-13 > OK > OK.
5. Con el SKL en «Press INITIATE button…», pulsar **ENT** en la radio. Esperar «FILL DONE» y pulsar una tecla.
6. «MORE FILL DATA?»: YES para cargar otra clave o NO para terminar.
7. «CHANGE SW FROM LD»: **desconectar primero el SKL**, luego girar a CT o TD.

## Teclado del ordenador

Dígitos · `Intro` = ENT · `Esc`/`Retroceso` = CLR · flechas · `AvPág`/`RePág` = PRE ± ·
`barra espaciadora` = PTT.

## Compilar los ejecutables

Requisitos: Node.js 20 o superior.

```bash
npm ci            # instala Electron y electron-builder
npm test          # pruebas de los modelos
npm start         # abre la aplicación de escritorio en modo desarrollo
npm run dist:win  # dist/*-portable.exe y dist/*-instalador.exe (en Windows, o en Linux con wine)
npm run dist:linux
```

**GitHub Actions** (`.github/workflows/build-desktop.yml`):
- **Manual**: Actions > «Ejecutables de escritorio» > *Run workflow*. Los ejecutables quedan como artefactos de la ejecución.
- **Versión publicada**: al subir una etiqueta `vX.Y.Z` se crea una *Release* con el `.exe` portable, el instalador y la AppImage.

Los ejecutables no están firmados digitalmente: Windows SmartScreen puede pedir confirmación
(«Más información» > «Ejecutar de todas formas»).

La carpeta `Manuals/` **no se incluye** en los ejecutables.

## Estructura

```
index.html            página del simulador
css/styles.css        estilos
js/core.js            utilidades comunes
js/radio.js           modelo de la AN/PRC-117F (sin DOM)
js/skl.js             modelo del SKL AN/PYQ-10 y conexión de llenado (sin DOM)
js/net.js             SOI de entrenamiento, satélite y controlador DAMA (sin DOM)
js/scenarios.js       ejercicios guiados
js/audio.js           pitidos, ruido de squelch y voz sintetizada
js/ui-skl.js          pantalla táctil del SKL
js/app.js             interfaz y eventos
desktop/main.js       aplicación de escritorio (Electron)
build/icon.png        icono de la aplicación
tests/                pruebas de los modelos (node --test)
Manuals/              documentación de referencia (no se distribuye)
```

## Simplificaciones conocidas

- No se simulan: SCAN, BEACON, CLONE, REMOTE CONTROL, RETRANS, GPS, HPW, OTAR/OTAT (posición RV), 25K_DC, ni los dispositivos KOI-18 y MX-18290.
- La tabla de códigos de frecuencia SATCOM es ficticia.
- La pantalla de la radio es una aproximación de 4 × 22 caracteres.
