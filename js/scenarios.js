/*
 * Ejercicios guiados. Cada ejercicio tiene pasos (texto) y comprobaciones
 * que se evalúan en vivo sobre el estado del simulador.
 * ctx = { radio, skl, net, conn }
 */
(function (g) {
  'use strict';
  const SIM = g.SIM;

  const slotWith = (radio, tag) => radio.slots.findIndex((s) => s && s.tag === tag);
  const slotTag = (radio, n) => (radio.slots[n - 1] ? radio.slots[n - 1].tag : null);
  const near = (a, b) => Math.abs(a - b) < 0.0005;
  const powerW = (p) => SIM.Radio.powerOf(p.power).w;

  const SCENARIOS = [
    {
      id: 'bit',
      title: 'Encendido y autoprueba (BIT)',
      level: 'Básico',
      goal: 'Preparar la radio para operar: accesorios conectados, encendido y autoprueba superada.',
      steps: [
        'En «Conexiones», conecte la antena de látigo VHF/UHF y el microteléfono.',
        'Gire la perilla de función a ON y espere a que termine el arranque.',
        'Pulse PGM, baje con ▼ hasta «AUTOPRUEBA BIT» y pulse ENT.',
        'Lea el resultado con ▲▼ y salga con CLR.',
      ],
      checks: [
        { label: 'Antena de látigo conectada', test: (c) => c.conn.antenna === 'WHIP' },
        { label: 'Microteléfono conectado', test: (c) => c.conn.handset },
        { label: 'Radio encendida en ON', test: (c) => c.radio.operating },
        { label: 'BIT superada', test: (c) => !!(c.radio.bitResult && c.radio.bitResult.pass) },
      ],
    },
    {
      id: 'los-pt',
      title: 'Red en claro LOS FM',
      level: 'Básico',
      goal: 'Programar el preset 02 en 45.5000 MHz FM en claro y hacer una prueba de radio con Halcón 6.',
      steps: [
        'PGM > PRESETS > P02 > ENT. Compruebe MODO = LOS y MODULACION = FM.',
        'Seleccione FREC, pulse ENT, teclee 45.5 y confirme con ENT.',
        'Deje CIFRADO = PT. Salga con CLR hasta la pantalla principal.',
        'Pulse PRE+ / PRE− (o teclee 2 y ENT) para seleccionar el preset 02.',
        'Escriba un mensaje («Halcón 6, aquí Lobo 2, prueba de radio, cambio») y mantenga pulsado el PTT al menos un segundo.',
      ],
      checks: [
        { label: 'P02 en LOS FM 45.5000 MHz', test: (c) => { const p = c.radio.presets[1]; return p.mode === 'LOS' && p.mod === 'FM' && near(p.freq, 45.5); } },
        { label: 'P02 en claro (PT)', test: (c) => c.radio.presets[1].crypto === 'PT' },
        { label: 'Preset 02 seleccionado', test: (c) => c.radio.cur === 1 },
        { label: 'Contacto con Halcón 6', test: (c) => (c.net.contacts.HALCON || 0) > 0 },
      ],
    },
    {
      id: 'fill',
      title: 'Carga de una TEK con el SKL',
      level: 'Intermedio',
      goal: 'Usar el SKL AN/PYQ-10 para cargar la clave ALFA-TEK-01 en la radio.',
      steps: [
        'Inserte el CIK (en «Conexiones») y encienda el SKL con su botón de encendido.',
        `Introduzca el PIN de entrenamiento ${SIM.SKL.TRAINING_PIN} y pulse OK.`,
        'En «Conexiones», cablee el conector FILL de la radio al SKL.',
        'Gire la perilla de la radio a LD. Con ▲▼ elija el slot destino (p. ej. S01).',
        'En el SKL: Emitir claves > marque ALFA-TEK-01 > Revisar > Emitir. No emita ALFA-TEK-00: está caducada.',
      ],
      checks: [
        { label: 'Sesión iniciada en el SKL', test: (c) => c.skl.loggedIn },
        { label: 'Conector FILL de la radio cableado al SKL', test: (c) => c.conn.fillDevice === 'SKL' },
        { label: 'ALFA-TEK-01 cargada en un slot de la radio', test: (c) => slotWith(c.radio, 'ALFA-TEK-01') >= 0 },
        { label: 'Emisión registrada en la auditoría del SKL', test: (c) => c.skl.audit.some((a) => a.ok && a.action === 'EMISION (FILL)' && a.detail.startsWith('ALFA-TEK-01')) },
      ],
    },
    {
      id: 'los-ct',
      title: 'Red cifrada LOS (CT)',
      level: 'Intermedio',
      goal: 'Comunicar con Cóndor 3 (12 km) en 62.7500 MHz FM cifrado con ALFA-TEK-01.',
      steps: [
        'Necesita ALFA-TEK-01 cargada (ejercicio anterior). Vuelva a poner la perilla en ON.',
        'Programe P03: LOS, FM, FREC 62.75, CIFRADO CT y SLOT TEK = el slot donde cargó ALFA-TEK-01.',
        'Cóndor 3 está a 12 km: ajuste la POTENCIA a ALTA (10 W) o MAX (20 W).',
        'Seleccione P03 y llame a Cóndor 3 con el PTT. Observe el indicador CT en la pantalla.',
      ],
      checks: [
        { label: 'P03 en LOS FM 62.7500 MHz', test: (c) => { const p = c.radio.presets[2]; return p.mode === 'LOS' && p.mod === 'FM' && near(p.freq, 62.75); } },
        { label: 'P03 en CT con ALFA-TEK-01', test: (c) => { const p = c.radio.presets[2]; return p.crypto === 'CT' && slotTag(c.radio, p.keySlot) === 'ALFA-TEK-01'; } },
        { label: 'Potencia suficiente (≥ 10 W)', test: (c) => powerW(c.radio.presets[2]) >= 10 },
        { label: 'Contacto con Cóndor 3', test: (c) => (c.net.contacts.CONDOR || 0) > 0 },
      ],
    },
    {
      id: 'sincgars',
      title: 'SINCGARS (salto de frecuencia)',
      level: 'Avanzado',
      goal: 'Entrar en la red SINCGARS 345 de Jaguar 1 con TSK SINC-HOP-12 y TEK BRAVO-TEK-02.',
      steps: [
        'Con la radio en LD, cargue desde el SKL SINC-HOP-12 (p. ej. en S03) y BRAVO-TEK-02 (p. ej. en S02). Cambie el slot destino con ▲▼ entre una clave y otra.',
        'Programe P04: MODO SINCGARS, RED SINC 345, SLOT TSK = slot de SINC-HOP-12.',
        'CIFRADO CT y SLOT TEK = slot de BRAVO-TEK-02.',
        'Perilla en ON, seleccione P04 y llame a Jaguar 1.',
      ],
      checks: [
        { label: 'P04 en SINCGARS red 345', test: (c) => { const p = c.radio.presets[3]; return p.mode === 'SINCGARS' && p.netId === 345; } },
        { label: 'P04 con TSK SINC-HOP-12', test: (c) => slotTag(c.radio, c.radio.presets[3].transecSlot) === 'SINC-HOP-12' },
        { label: 'P04 en CT con BRAVO-TEK-02', test: (c) => { const p = c.radio.presets[3]; return p.crypto === 'CT' && slotTag(c.radio, p.keySlot) === 'BRAVO-TEK-02'; } },
        { label: 'Contacto con Jaguar 1', test: (c) => (c.net.contacts.JAGUAR || 0) > 0 },
      ],
    },
    {
      id: 'hq',
      title: 'HAVE QUICK II (tierra-aire)',
      level: 'Avanzado',
      goal: 'Contactar con la aeronave Águila 2 en la red HAVE QUICK 300 con la WOD HQ-WOD-NOV.',
      steps: [
        'Cargue HQ-WOD-NOV desde el SKL en un slot libre (p. ej. S04).',
        'Perilla en ON. PGM > SINCRONIZAR TOD (sin hora TOD no hay salto HAVE QUICK).',
        'Programe P05: MODO HQ, RED HQ 300, SLOT WOD = slot de HQ-WOD-NOV, CIFRADO PT.',
        'Águila 2 vuela a 40 km: el enlace tierra-aire llega más lejos, pero necesita al menos ALTA.',
        'Seleccione P05 y llame a Águila 2.',
      ],
      checks: [
        { label: 'TOD sincronizado', test: (c) => c.radio.todValid },
        { label: 'P05 en HQ red 300', test: (c) => { const p = c.radio.presets[4]; return p.mode === 'HQ' && p.hqNet === 300; } },
        { label: 'P05 con WOD HQ-WOD-NOV', test: (c) => slotTag(c.radio, c.radio.presets[4].transecSlot) === 'HQ-WOD-NOV' },
        { label: 'Contacto con Águila 2', test: (c) => (c.net.contacts.AGUILA || 0) > 0 },
      ],
    },
    {
      id: 'kyk13',
      title: 'Carga COMSEC con KYK-13 (DS-102)',
      level: 'Intermedio',
      goal: 'Cargar en la radio las dos TEK que el custodio dejó en el KYK-13: VIN-TEK-05 (posición 1, VINSON) y ANDVT-TEK-31 (posición 2, ANDVT).',
      steps: [
        'Compruebe el KYK-13: interruptor en OFF/CHECK, selector en 1 y pulse INICIAR. Si la lámpara destella, hay clave (paridad correcta). Repita con la posición 2.',
        'En «Conexiones», cablee el conector FILL de la radio al KYK-13.',
        'Gire la perilla de la radio a LD y elija con ▲▼ el slot destino (p. ej. S06).',
        'Ponga el KYK-13 en ON, selector en 1 y pulse INICIAR. La radio muestra «RECIBIDO» y la lámpara destella.',
        'Cambie el slot destino en la radio (p. ej. S07), selector del KYK-13 en 2 e INICIAR.',
        'Vuelva a poner el KYK-13 en OFF/CHECK y la radio en ON. Revise PGM > CLAVES COMSEC > slot > VER DETALLE: debe indicar el algoritmo y el origen KYK-13.',
      ],
      checks: [
        { label: 'Comprobación de paridad hecha en OFF/CHECK', test: (c) => !!c.kyk.checked },
        { label: 'Conector FILL de la radio cableado al KYK-13', test: (c) => c.conn.fillDevice === 'KYK13' },
        { label: 'VIN-TEK-05 cargada desde el KYK-13', test: (c) => c.radio.slots.some((s) => s && s.tag === 'VIN-TEK-05' && s.src === 'KYK-13') },
        { label: 'ANDVT-TEK-31 cargada desde el KYK-13', test: (c) => c.radio.slots.some((s) => s && s.tag === 'ANDVT-TEK-31' && s.src === 'KYK-13') },
      ],
    },
    {
      id: 'sat-ded',
      title: 'SATCOM dedicado 5 kHz con ANDVT',
      level: 'Avanzado',
      goal: 'Programar una red SATCOM dedicada de banda estrecha y comunicar con Base Centauro usando voz cifrada ANDVT.',
      steps: [
        'Necesita ANDVT-TEK-31 en la radio (ejercicio de KYK-13).',
        'En «Conexiones», cambie a la antena SATCOM.',
        'PGM > PRESETS > P06. MODO = SATCOM, TIPO SAT = DEDICADO.',
        'FREC TX (subida) = 311.15 y FREC RX (bajada) = 254.15. No las invierta.',
        'CANAL = 5K. POTENCIA = ALTA o MAX (mínimo 10 W para el satélite).',
        'CIFRADO = CT, MODO CRIPTO = ANDVT (obligatorio en 5 kHz), SLOT TEK = slot de ANDVT-TEK-31.',
        'Perilla en ON, seleccione P06 y llame a Base Centauro con el PTT.',
      ],
      checks: [
        { label: 'Antena SATCOM conectada', test: (c) => c.conn.antenna === 'SATCOM' },
        { label: 'P06: SATCOM dedicado, TX 311.1500 / RX 254.1500', test: (c) => { const p = c.radio.presets[5]; return p.mode === 'SATCOM' && p.satType === 'DEDICADO' && near(p.satTx, 311.15) && near(p.satRx, 254.15); } },
        { label: 'P06: canal 5K y potencia ≥ 10 W', test: (c) => { const p = c.radio.presets[5]; return p.satBw === 5 && powerW(p) >= 10; } },
        { label: 'P06: CT ANDVT con ANDVT-TEK-31', test: (c) => { const p = c.radio.presets[5]; return p.crypto === 'CT' && p.cryptoMode === 'ANDVT' && slotTag(c.radio, p.keySlot) === 'ANDVT-TEK-31'; } },
        { label: 'Contacto con Base Centauro', test: (c) => (c.net.contacts.CENTAURO || 0) > 0 },
      ],
    },
    {
      id: 'sat-dama',
      title: 'SATCOM DAMA 25 kHz con VINSON',
      level: 'Avanzado',
      goal: 'Programar una red SATCOM DAMA, obtener acceso del controlador y comunicar con Nodo Orión usando VINSON.',
      steps: [
        'Necesita VIN-TEK-05 en la radio (ejercicio de KYK-13) y la antena SATCOM.',
        'PGM > PRESETS > P07. MODO = SATCOM, TIPO SAT = DAMA.',
        'SATELITE = SAT-2, RED DAMA = 07, DIR TERMINAL = 10452 (asignada en la orden de comunicaciones), CANAL = 25K.',
        'POTENCIA = ALTA o MAX. CIFRADO = CT, MODO CRIPTO = VINSON, SLOT TEK = slot de VIN-TEK-05.',
        'Salga a la pantalla principal y seleccione P07.',
        'PGM > ACCESO DAMA > ENT. Espere a «ACCESO CONCEDIDO».',
        'Llame a Nodo Orión con el PTT.',
      ],
      checks: [
        { label: 'P07: SATCOM DAMA SAT-2 red 07', test: (c) => { const p = c.radio.presets[6]; return p.mode === 'SATCOM' && p.satType === 'DAMA' && p.damaSat === 'SAT-2' && p.damaNet === 7; } },
        { label: 'P07: dirección 10452 y canal 25K', test: (c) => { const p = c.radio.presets[6]; return p.damaAddr === 10452 && p.satBw === 25; } },
        { label: 'P07: CT VINSON con VIN-TEK-05', test: (c) => { const p = c.radio.presets[6]; return p.crypto === 'CT' && p.cryptoMode === 'VINSON' && slotTag(c.radio, p.keySlot) === 'VIN-TEK-05'; } },
        { label: 'Acceso DAMA concedido', test: (c) => c.radio.damaOk(c.radio.presets[6]) },
        { label: 'Contacto con Nodo Orión', test: (c) => (c.net.contacts.ORION || 0) > 0 },
      ],
    },
    {
      id: 'kyk-skl',
      title: 'Rellenar un KYK-13 desde el SKL',
      level: 'Intermedio',
      goal: 'Transferir la clave SAT-TEK-07 del SKL a la posición 3 del KYK-13 para llevarla a otro equipo.',
      steps: [
        'Inicie sesión en el SKL.',
        'En «Conexiones», active el cable SKL ↔ KYK-13.',
        'KYK-13: interruptor en ON y selector en la posición 3.',
        'SKL: Emitir claves > marque SAT-TEK-07 > Revisar. Destino = KYK-13 y protocolo = DS-102 (el KYK-13 no admite DS-101). Emitir.',
        'Compruebe con el KYK-13 en OFF/CHECK, posición 3 e INICIAR: la lámpara debe destellar.',
      ],
      checks: [
        { label: 'Cable SKL ↔ KYK-13 conectado', test: (c) => c.conn.sklKyk },
        { label: 'SAT-TEK-07 en la posición 3 del KYK-13', test: (c) => !!c.kyk.positions[2] && c.kyk.positions[2].tag === 'SAT-TEK-07' },
        { label: 'Emisión al KYK-13 registrada en la auditoría', test: (c) => c.skl.audit.some((a) => a.ok && a.action === 'EMISION (FILL)' && a.detail.startsWith('SAT-TEK-07 -> KYK-13')) },
      ],
    },
    {
      id: 'zeroize',
      title: 'Borrado de emergencia (zeroize)',
      level: 'Crítico',
      goal: 'Ante riesgo de captura del equipo, eliminar todas las claves de la radio, del SKL y del KYK-13.',
      steps: [
        'Radio: gire la perilla a Z (borrado inmediato) o pulse ZERO y confirme con ENT.',
        'SKL: inicie sesión, abra «Zeroize» y confirme.',
        'KYK-13: lleve el interruptor de función a Z ALL.',
        'Compruebe en PGM > CLAVES COMSEC que todos los slots están vacíos.',
      ],
      checks: [
        { label: 'Radio sin claves', test: (c) => c.radio.slots.every((s) => !s) },
        { label: 'SKL sin claves', test: (c) => c.skl.keys.length === 0 },
        { label: 'KYK-13 sin claves', test: (c) => c.kyk.positions.every((k) => !k) },
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
