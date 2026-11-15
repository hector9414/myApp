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
- **Panel frontal del RT-1796** como en la figura del manual:
  - Izquierda: J1 AUDIO/DATA/FILL, J2 GPS y J3 DATA.
  - Centro: el KDU.
  - Derecha: J5 VHF ANTENNA con el interruptor de función debajo, y J8 VHF HI/UHF y J6 ACCESSORY.
  - Los conectores J1, J5 y J8 se pueden pulsar para conectar el microteléfono o el SKL y las antenas.
- **KDU con la distribución real**:
  - Fila superior: 0 ⟳ · 1 ABC CALL · 2 DEF LT · 3 GHI MODE · ◀ · ▶.
  - Filas inferiores: 4 JKL SQ · 5 MNO ZERO · 6 PQR ▲ · CLR / 7 STU OPT · 8 VWX PGM · 9 YZ? ▼ · ENT.
  - Balancines VOL ± y PRE ± a los lados.
- **Pantalla gráfica que ocupa todo el LCD**, como en las figuras del curso:
  - Línea de estado pequeña: `R BAT ▭ NORM VINSON TEK01 … CT`.
  - Dos líneas en letra grande: `01-ARTY ⟳ ▭` / `LOS VOC VOC FM TONE`.
  - Etiquetas pequeñas: `TYPE ADF DATA MODE SQL`.
  - Pantallas alternativas con ⟳ (`R:046.57500 LOS` / `T:… 16.0` / `FREQUENCY RATE`).
  - Menús con «USE < > TO SELECT ITEM» y el nombre de la red abajo a la izquierda.
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

### SKL AN/PYQ-10 (interfaz Windows CE del curso)
- **Equipo**:
  - Luz KOV, fill port, botón de zeroize, botón de encendido y acceso al CIK.
  - Botones 1 (menú Inicio), 2 (abrir la UAS), 3 (visión nocturna) y 4.
  - Cruceta de 5 direcciones (se mueve por el árbol) y brillo.
- **Barra de tareas**: inicio, programa activo (CoreLib / SKL), batería con color y porcentaje, fecha, panel de entrada y conmutador de programas. El menú Inicio tiene Programs > calibrate / CoreLib / SKL Settings.
- **Core Library**: menús Session (Login, Logout, Protocol, Reset Card), Tools (User ▸, SSO ▸ Set Card Time/Date, User Management, Audit Functions…), Launch (Launch UAS) y Help.
- **Inicialización de la tarjeta INFOSEC** («Initial SSO Login»):
  1. Default SSO Login con `SSO` / `DEFAULTPIN`.
  2. Emparejado del KOV-21 0020705.
  3. «Use External CIK?».
  4. Change Password (8+ caracteres con letras y números).
  5. «Please wait, encrypting and saving database…».
  6. Startup Information.
- **Inicio de sesión** después de la inicialización: SSO (con la contraseña elegida) u **OPERADOR** / `Operador1`. Tres fallos bloquean la cuenta.
- **La UAS se abre automáticamente** tras iniciar sesión, igual que con Launch > Launch UAS:
  - Menús **File / View / Settings** con los iconos **RECV** y **LOAD**.
  - Subpestañas **Plats / Eqs / Keys / SOI** en árbol (+/−).
- **Menú File** (cambia según la pestaña): Delete Key Tag / Platform / Equipment, Delete Database…, **Transmit ▸** (Load…, Load Selected Keys…, …), Receive ▸, OTAD ▸, Create Key Tags…, Assign ▸, Save Database… y Exit (pregunta si guardar los cambios).
- **Menú View**: Current Selection, **Keys ▸ Expired Keys…**, **Summary Status…**, Refresh, Expand Tree y Tree ▸.
- **Keys**: Short Title (`ETD 01 5AT900`) → Edition (`A`) → segmento (`1-T000-1-LOS TEK`).
  - Iconos YELLOW KEY, RED KEY (caducada), KEY TAG (falta la variable) y EXPIRED TAG.
  - Con doble toque se abre el diálogo **Segment** (Short Title, Edition, Key Use, Effective Date…).
- **Carga de claves**: seleccionar la clave → **LOAD** → Protocol **DS-101 / DS-102** y Activation Mode **KYK-13** → «Ready to Send Key» → ventana **Status** con «Press INITIATE Button…» → ENT en la radio. Con Load Selected Keys se cargan varias claves seguidas.
- **Loadset SINCGARS**: Plats > VEH MANDO > SINCGARS → LOAD → «Gathering data» → SINCGARS Mode (ICOM, Send Time) → Load ECU Wizard (Next, Next, Send) → Status («Sending TEK #1…»).
- **AUDIT TRAIL** solo para SSO (Tools > SSO > Audit Functions > View Audit Trail…).
- **Apagado**: aviso «Shutdown in 10 seconds!», que se cancela pulsando otra vez el botón de encendido. Orden correcto: File > Exit, Session > Logout (esperar a que se apague la luz KOV) y botón de encendido.
- **CIK**: solo se cambia con el equipo apagado; si se cambia encendido, queda registrado como alarma.
- **Batería**: «Main Batteries Very Low» al 2 % y apagado automático al 1 %.

### Red simulada (SOI de entrenamiento)
Las estaciones responden solo si la radio está configurada como su red: canal, modulación,
squelch, COMSEC y TEK, hopset, MWOD, TOD, antena, apuntamiento y alcance según la potencia.
Con «Ayudas del instructor», el registro explica por qué no hubo respuesta.

| Estación | Red |
|---|---|
| Halcón 6 | LOS 45,50000 MHz FM, PT, squelch TONE, 3 km |
| Cóndor 3 | LOS 62,75000 MHz FM, CT VINSON (ETD 01 5AT900), 15 km |
| Jaguar 1 | SINCGARS F345 (loadset SINCGARS, hopset H1), VINSON C1 (ETD 11 5AT900), 8 km |
| Águila 2 | HAVEQUICK II red 00.300, MWOD ETD 50 5AT900, TOD, 40 km en vuelo |
| Base Centauro | SATCOM dedicado código 150 (5 kHz), CT ANDVT (ETD 31 5AT900) |
| Nodo Orión | DAMA canal 054 (25 kHz AC), red 51234, TBA 10452, TSK ETD 07 5AT900, ANDVT (ETD 44 5AT900), código 060 |

Satélite de entrenamiento: azimut 135°, elevación 40°.

### Ejercicios guiados
1. Preparación y autoprueba (BIT)
2. Red LOS en claro (PT)
3. SKL: inicialización, sesión y apagado
4. Carga de una TEK con el SKL (DS-102, KYK-13)
5. Red LOS cifrada (VINSON, CT)
6. SINCGARS: loadset por ICOM y red F345
7. HAVEQUICK II (tierra-aire)
8. SATCOM dedicado 5 kHz con ANDVT
9. SATCOM DAMA (25 kHz AC)
10. Borrado de emergencia

Cada ejercicio muestra sus pasos y comprueba los objetivos en vivo.

## Procedimiento rápido: cargar una TEK con el SKL en modo KYK-13

1. **SKL apagado**: insertar el CIK. Encender e iniciar sesión en Core Library. La UAS se abre sola.
2. **Radio**: interruptor en **LD**. Solo entonces conectar el SKL a **J1** (antes, retirar el H-250).
3. **Radio**: `FILL DEVICE` KYK-13 > `CRYPTO TYPE` (p. ej. VINSON o ANDVT) > `SELECT KEY TYPE` TEK > `KEY NUMBER` 01 > «PRESS ENTER TO INITIATE».
4. **SKL**: pestaña Keys > `ETD 01 5AT900` > `A` > `1-T000-1-LOS TEK` > icono **LOAD** > DS-102 + KYK-13 > OK > OK en «Ready to Send Key».
5. Con la ventana Status en «Press INITIATE Button…», pulsar **ENT** en la radio. Esperar «FILL DONE» y pulsar una tecla.
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

- No se simulan:
  - **En la radio**: SCAN, BEACON, CLONE, REMOTE CONTROL, RETRANS, GPS, HPW, OTAR/OTAT (posición RV), 25K_DC, ni los dispositivos KOI-18 y MX-18290.
  - **En el SKL**: Receive, OTAD, Assign, Create Key Tags, gestión de usuarios y transferencia SKL a SKL. Esas opciones aparecen deshabilitadas o lo indican al pulsarlas.
- El menú Settings de la UAS no aparece en el curso; aquí solo contiene la opción de protocolo de llenado.
- La tabla de códigos de frecuencia SATCOM es ficticia.
- La pantalla de la radio es una aproximación de 4 × 22 caracteres.
