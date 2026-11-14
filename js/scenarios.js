/*
 * Ejercicios guiados, alineados con los procedimientos del curso de operador
 * de la AN/PRC-117F y del SKL AN/PYQ-10. Cada ejercicio tiene pasos y
 * comprobaciones que se evalúan en vivo. ctx = { radio, skl, net, conn }
 */
(function (g) {
  'use strict';
  const SIM = g.SIM;
  const near = (a, b) => Math.abs(a - b) < 0.000005;
  const tek = (r, bank, num) => (r.keys[bank].TEK[num - 1] ? r.keys[bank].TEK[num - 1].tag : null);
  const sat = () => SIM.Net.SATELLITE;
  const dama = () => SIM.Net.DAMA;
  const utcDay = () => new Date().getUTCDate();

  const SCENARIOS = [
    {
      id: 'bit',
      title: 'Preparación y autoprueba (BIT)',
      level: 'Básico',
      goal: 'Montar el equipo como indica el curso y comprobar la radio con el Built-In Test.',
      steps: [
        'Conexiones: microteléfono H-250 en J1 (AUDIO/DATA/FILL) y antena de pala VHF en J5 (30-89,99999 MHz).',
        'Gire el interruptor de función a PT y espere a que termine la autoprueba de encendido.',
        'Pulse 3/MODE, elija TEST con 6▲ / 9▼ y ENT. En el menú TEST seleccione TEST (◄ ►) y ENT.',
        'Lea «BIT PASSED» y salga con CLR. Revise también BATTERY y VERSIONS.',
      ],
      checks: [
        { label: 'H-250 en J1 y antena de pala en J5', test: (c) => c.conn.j1 === 'HANDSET' && c.conn.j5 },
        { label: 'Radio encendida en PT', test: (c) => c.radio.booted && c.radio.sw === 'PT' },
        { label: 'BIT PASSED', test: (c) => !!(c.radio.bitResult && c.radio.bitResult.pass) },
      ],
    },
    {
      id: 'los-pt',
      title: 'Red LOS en claro (PT)',
      level: 'Básico',
      goal: 'Programar el preset 01 en 45,50000 MHz FM y hacer una prueba de radio con Halcón 6.',
      steps: [
        '8/PGM > NORM > NET. Teclee 01 y ENT. ACTIVATE IN LIST? YES. NET TYPE: LOS FIX FREQUENCY.',
        'En el menú de la red: FREQ > RECEIVE FREQUENCY 045.50000 ENT, TRANSMIT FREQUENCY 045.50000 ENT, RECEIVE ONLY? NO.',
        'Deje COMSEC en NONE y SQ en TONE (por debajo de 90 MHz se usa squelch por tono). PWR: 5 W basta para 3 km.',
        'Pulse PRE + / PRE − para salir a la operación y seleccionar el preset 01.',
        'Escriba un mensaje y mantenga pulsado el PTT al menos un segundo.',
      ],
      checks: [
        { label: 'Preset 01: LOS 45,50000 MHz (RX y TX), FM', test: (c) => { const n = c.radio.nets[1]; return n.type === 'LOS' && near(n.rx, 45.5) && near(n.tx, 45.5) && n.mod === 'FM'; } },
        { label: 'Preset 01 con squelch TONE', test: (c) => c.radio.nets[1].sq === 'TONE' },
        { label: 'Preset 01 seleccionado', test: (c) => c.radio.cur === 1 && c.radio.mode === 'NORMAL' },
        { label: 'Contacto con Halcón 6', test: (c) => (c.net.contacts.HALCON || 0) > 0 },
      ],
    },
    {
      id: 'fill-kyk',
      title: 'Carga de una TEK con el SKL (DS-102, KYK-13)',
      level: 'Intermedio',
      goal: 'Cargar la TEK VINSON ETD-VIN-0001 en VINSON TEK 01 de la radio con el SKL en modo KYK-13.',
      steps: [
        'Con el SKL APAGADO inserte el CIK. Encienda el SKL e inicie sesión (usuario operador / contraseña Operador1).',
        'Abra la UAS (doble toque en el icono), acepte la información de inicio y vaya a la pestaña Keys.',
        'Radio: gire el interruptor a LD. SOLO ENTONCES conecte el SKL a J1 (retire antes el microteléfono).',
        'Radio: FILL DEVICE = KYK-13, CRYPTO TYPE = VINSON, SELECT KEY TYPE = TEK, KEY NUMBER = 01. Verá «PRESS ENTER TO INITIATE».',
        'SKL: marque ETD-VIN-0001 > LOAD > Protocol DS-102, Activation Mode KYK-13 > OK > OK en «Ready to send key».',
        'Cuando el SKL muestre «Press INITIATE button…», pulse ENT en la radio. Espere «FILL DONE», pulse una tecla y responda NO a «MORE FILL DATA?».',
        '«CHANGE SW FROM LD»: desconecte primero el SKL de J1 y después gire el interruptor a CT.',
      ],
      checks: [
        { label: 'Sesión iniciada en el SKL', test: (c) => c.skl.loggedIn },
        { label: 'ETD-VIN-0001 en VINSON TEK 01', test: (c) => tek(c.radio, 'VINSON', 1) === 'ETD-VIN-0001' },
        { label: 'Cargada por DS-102', test: (c) => { const k = c.radio.keys.VINSON.TEK[0]; return !!k && k.proto === 'DS-102'; } },
        { label: 'Nunca conectó el SKL fuera de LD', test: (c) => c.radio.hazards === 0 },
        { label: 'SKL desconectado y radio de nuevo en CT', test: (c) => c.conn.j1 !== 'SKL' && c.radio.sw === 'CT' },
      ],
    },
    {
      id: 'los-ct',
      title: 'Red LOS cifrada (VINSON, CT)',
      level: 'Intermedio',
      goal: 'Comunicar con Cóndor 3 (15 km) en 62,75000 MHz cifrado VINSON con ETD-VIN-0001.',
      steps: [
        'Necesita ETD-VIN-0001 en VINSON TEK 01 (ejercicio anterior).',
        'PGM > NORM > NET 02 > LOS FIX FREQUENCY. FREQ: 062.75000 en RX y TX.',
        'COMSEC: CRYPTO MODE VINSON, ENCRYPTION KEY TEK 01, ANALOG DATA NO.',
        'PWR: Cóndor está a 15 km. Con la pala VHF el máximo por debajo de 90 MHz es 10 W: elija 8 o 10 W.',
        'Interruptor en CT. La línea 2 de la pantalla debe mostrar «VINSON TEK01 CT». Seleccione el preset 02 y llame.',
      ],
      checks: [
        { label: 'Preset 02: LOS 62,75000 MHz', test: (c) => { const n = c.radio.nets[2]; return n.type === 'LOS' && near(n.rx, 62.75) && near(n.tx, 62.75); } },
        { label: 'Preset 02: VINSON TEK 01 con ETD-VIN-0001', test: (c) => { const n = c.radio.nets[2]; return n.crypto === 'VINSON' && n.key === 1 && tek(c.radio, 'VINSON', 1) === 'ETD-VIN-0001'; } },
        { label: 'Potencia ≥ 8 W', test: (c) => c.radio.nets[2].power >= 8 },
        { label: 'Contacto con Cóndor 3', test: (c) => (c.net.contacts.CONDOR || 0) > 0 },
      ],
    },
    {
      id: 'sincgars',
      title: 'SINCGARS: loadset por ICOM y red F345',
      level: 'Avanzado',
      goal: 'Cargar el loadset LS-MANIOBRA con hora desde el SKL y entrar en la red SINCGARS de Jaguar 1.',
      steps: [
        'Radio en LD; conecte el SKL a J1. FILL DEVICE = CYZ10-RDS > ENT. La radio muestra «FILL IN PROGRESS».',
        'SKL (UAS): pestaña Plats > LS-MANIOBRA > LOAD. SINCGARS mode: ICOM y marque «Include time». OK > Next > Next.',
        'Compruebe que la radio está en «FILL IN PROGRESS» y pulse Send. Espere «KEY STORE IN PROGRESS» y «FILL DONE».',
        'Las TEK del loadset quedan en VINSON TEK 21-25 y los hopsets en los compartimentos 20-25.',
        'Desconecte el SKL, vuelva a conectar el H-250 y gire a CT.',
        'PGM > NORM > NET 03 > FREQUENCY HOPPING > SINCGARS. HOPSET: el compartimento que muestra [F345] (el 20). COMSEC: VINSON TEK 21.',
        'Seleccione el preset 03 y llame a Jaguar 1.',
      ],
      checks: [
        { label: 'Loadset cargado (hopset F345 en la radio)', test: (c) => c.radio.keys.SINCGARS.TSK.some((t) => t && t.netId === 345) },
        { label: 'Hora SINCGARS en la radio', test: (c) => !!c.radio.todSinc },
        { label: 'Preset 03: SINCGARS con el hopset F345', test: (c) => { const n = c.radio.nets[3]; const t = c.radio.keys.SINCGARS.TSK[n.hopset - 1]; return n.type === 'HOP' && n.hop === 'SINCGARS' && !!t && t.netId === 345; } },
        { label: 'Preset 03: VINSON con la TEK #1 del loadset', test: (c) => { const n = c.radio.nets[3]; return n.crypto === 'VINSON' && tek(c.radio, 'VINSON', n.key) === 'ETD-VIN-0101'; } },
        { label: 'Contacto con Jaguar 1', test: (c) => (c.net.contacts.JAGUAR || 0) > 0 },
      ],
    },
    {
      id: 'hq',
      title: 'HAVEQUICK II (tierra-aire)',
      level: 'Avanzado',
      goal: 'Contactar con la aeronave Águila 2 en la red HAVEQUICK 00.300.',
      steps: [
        `Cargue con el SKL (DS-102, KYK-13) la MWOD ETD-MWOD: en la radio CRYPTO TYPE = HAVEQUICK, KEY TYPE = WOD, KEY NUMBER = día UTC de hoy (${String(utcDay()).padStart(2, '0')}).`,
        'Conecte la antena flexible VHF/UHF en J8 (225-399,975 MHz).',
        'PGM > NORM > NET 04 > FREQUENCY HOPPING > HAVEQUICK. NET: NET NUMBER 00.300.',
        'Interruptor en PT. Seleccione el preset 04 y obtenga el TOD: 1/CALL > TOD SYNC RECEIVE (o 7/OPT > TIME > HAVE_QUICK).',
        'Cuando la línea de estado muestre OK (no ERR), llame a Águila 2.',
      ],
      checks: [
        { label: 'MWOD ETD-MWOD en la posición del día UTC', test: (c) => { const w = c.radio.keys.HAVEQUICK.WOD[utcDay() - 1]; return !!w && w.tag === 'ETD-MWOD'; } },
        { label: 'TOD HAVEQUICK establecido', test: (c) => !!c.radio.todHQ },
        { label: 'Preset 04: HAVEQUICK red 00.300', test: (c) => { const n = c.radio.nets[4]; return n.type === 'HOP' && n.hop === 'HAVEQUICK' && n.hqNet === '00.300'; } },
        { label: 'Contacto con Águila 2', test: (c) => (c.net.contacts.AGUILA || 0) > 0 },
      ],
    },
    {
      id: 'sat-ded',
      title: 'SATCOM dedicado 5 kHz con ANDVT',
      level: 'Avanzado',
      goal: 'Programar el canal SATCOM de banda estrecha (código 150), apuntar la antena y comunicar con Base Centauro en ANDVT.',
      steps: [
        'Cargue ETD-AND-0031 en ANDVT TEK 01 (LD, KYK-13, CRYPTO TYPE ANDVT, TEK, 01).',
        `Conecte la antena SATCOM en J8 y oriéntela con la SOI: azimut ${sat().az}°, elevación ${sat().el}°.`,
        'PGM > NORM > NET 05 > SATCOM. FREQ: FREQ CODE 150 (5 kHz; con 999 se teclean RX y TX a mano). RECEIVE ONLY? NO.',
        'COMSEC: ANDVT (en 5 kHz solo se permiten ANDVT o KG-84), TEK 01, TRAINING FRAMES 20, PREAMBLE STANDARD, VOICE AUTOSWITCH ENABLE.',
        'DATA/VOC: VOICE MODE MELP, OPTION CODE 010. SQ: DIGITAL SQUELCH ON.',
        'Interruptor en CT (el SATCOM en claro no está permitido). Seleccione el preset 05.',
        'Pulse 1/CALL > ENT para la prueba RSSI. Con 80 o más, la antena está bien apuntada. Después llame a Base Centauro.',
      ],
      checks: [
        { label: 'Preset 05: SATCOM código 150', test: (c) => { const n = c.radio.nets[5]; return n.type === 'SAT' && n.code === 150; } },
        { label: 'Preset 05: ANDVT TEK 01 con ETD-AND-0031', test: (c) => { const n = c.radio.nets[5]; return n.crypto === 'ANDVT' && tek(c.radio, 'ANDVT', n.key) === 'ETD-AND-0031'; } },
        { label: 'Prueba RSSI ≥ 80', test: (c) => !!c.radio.lastRssi && c.radio.lastRssi.score >= 80 },
        { label: 'Contacto con Base Centauro', test: (c) => (c.net.contacts.CENTAURO || 0) > 0 },
      ],
    },
    {
      id: 'sat-dama',
      title: 'SATCOM DAMA (25 kHz AC)',
      level: 'Experto',
      goal: 'Programar la red DAMA, conectarse al controlador, establecer la llamada y hablar con Nodo Orión.',
      steps: [
        'Cargue con el SKL ETD-SAT-0007 en SATELLITE TSK 01 y ETD-AND-0044 en ANDVT TEK 02.',
        `PGM > DAMA > PRESETS > NETS > 0. CHANNEL: CHANNEL NUMBER ${String(dama().channel).padStart(3, '0')}, TRANSMIT CAPABILITY FULL, CONSTANT KEY PORT NO, DEFAULT CONFIG 0.`,
        `RANGING: ACTIVE. ADDR > BASE_ADDRESS ${dama().knownTBA[0]}. ADDR > GUARD_LIST > ADD ${dama().networkAddr}.`,
        'TRANSEC: ORDERWIRE ENCRYPTION ON, KEY LOCATION 0-3 = TSK 01.',
        'PORT_CONFIGS > 0: COMSEC ANDVT TEK 02, TRAINING FRAMES 20. DATA/VOICE: MELP. CONFIG_CODE: 060 y 060.',
        `DESTINATIONS > 00 > 25K_AC > ADD ${dama().networkAddr}.`,
        'Antena SATCOM apuntada; interruptor en CT. 3/MODE > DAMA. Espere ACQUIRING > RANGING > LOGGING IN > CONNECTED.',
        '1/CALL > PLACE A CALL > DESTINATION 00 > PRECEDENCE ROUTINE > DURATION 0000. Con el servicio en ACTIVE, llame a Nodo Orión.',
      ],
      checks: [
        { label: 'Red DAMA 0: canal y TBA correctos', test: (c) => { const d = c.radio.damaNets[0]; return d.channel === dama().channel && d.tba === dama().knownTBA[0]; } },
        { label: 'Guard list y TSK de orderwire', test: (c) => { const d = c.radio.damaNets[0]; return d.guard.includes(dama().networkAddr) && d.ow === 'ON' && !!c.radio.keys.SATELLITE.TSK[d.tskLoc - 1]; } },
        { label: 'Configuración de puerto ANDVT y código 060', test: (c) => { const k = c.radio.damaCfgs[c.radio.damaNets[0].cfg]; return k.crypto === 'ANDVT' && k.code25 === '060'; } },
        { label: 'DAMA CONNECTED', test: (c) => !!c.radio.dama && ['CONNECTED'].includes(c.radio.dama.status) },
        { label: 'Contacto con Nodo Orión', test: (c) => (c.net.contacts.ORION || 0) > 0 },
      ],
    },
    {
      id: 'zeroize',
      title: 'Borrado de emergencia',
      level: 'Crítico',
      goal: 'Ante riesgo de captura, borrar el material criptográfico de la radio y del SKL.',
      steps: [
        'Radio: gire el interruptor a Z-ALL y espere «ZEROIZE PASSED / RESET RADIO». Así se borran los datos rojos (COMSEC y TRANSEC) y se conserva la programación.',
        '(Con CLR se borra también la programación; con la tecla 5/ZERO solo la programación.)',
        'SKL: pulse el botón físico de ZEROIZE y confírmelo.',
        'Apague los equipos. Para almacenarlos, deje la radio en CLR.',
      ],
      checks: [
        { label: 'Radio sin claves', test: (c) => c.radio.keyCount() === 0 },
        { label: 'SKL sin claves', test: (c) => c.skl.keys.length === 0 },
      ],
    },
  ];

  SIM.SCENARIOS = SCENARIOS;
  SIM.evaluateScenario = (sc, ctx) => sc.checks.map((ch) => {
    let ok = false;
    try { ok = !!ch.test(ctx); } catch (e) { ok = false; }
    return { label: ch.label, ok };
  });
})(typeof window !== 'undefined' ? window : globalThis);
