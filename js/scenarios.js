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
        'Conecte el cable de llenado entre el SKL y el conector FILL de la radio.',
        'Gire la perilla de la radio a LD. Con ▲▼ elija el slot destino (p. ej. S01).',
        'En el SKL: Emitir claves > marque ALFA-TEK-01 > Revisar > Emitir. No emita ALFA-TEK-00: está caducada.',
      ],
      checks: [
        { label: 'Sesión iniciada en el SKL', test: (c) => c.skl.loggedIn },
        { label: 'Cable de llenado conectado', test: (c) => c.conn.fillCable },
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
      id: 'satcom',
      title: 'SATCOM táctico',
      level: 'Avanzado',
      goal: 'Establecer enlace satelital con Base Centauro en el canal 25, cifrado con SAT-TEK-07.',
      steps: [
        'Cargue SAT-TEK-07 desde el SKL en un slot libre (p. ej. S05).',
        'En «Conexiones», cambie a la antena SATCOM.',
        'Programe P06: MODO SATCOM, CANAL SAT 25, POTENCIA ALTA o MAX, CIFRADO CT, SLOT TEK = slot de SAT-TEK-07.',
        'Perilla en ON, seleccione P06 y llame a Base Centauro.',
      ],
      checks: [
        { label: 'Antena SATCOM conectada', test: (c) => c.conn.antenna === 'SATCOM' },
        { label: 'P06 en SATCOM canal 25', test: (c) => { const p = c.radio.presets[5]; return p.mode === 'SATCOM' && p.satChannel === 25; } },
        { label: 'P06 en CT con SAT-TEK-07', test: (c) => { const p = c.radio.presets[5]; return p.crypto === 'CT' && slotTag(c.radio, p.keySlot) === 'SAT-TEK-07'; } },
        { label: 'Contacto con Base Centauro', test: (c) => (c.net.contacts.CENTAURO || 0) > 0 },
      ],
    },
    {
      id: 'zeroize',
      title: 'Borrado de emergencia (zeroize)',
      level: 'Crítico',
      goal: 'Ante riesgo de captura del equipo, eliminar todas las claves de la radio y del SKL.',
      steps: [
        'Radio: gire la perilla a Z (borrado inmediato) o pulse ZERO y confirme con ENT.',
        'SKL: inicie sesión, abra «Zeroize» y confirme.',
        'Compruebe en PGM > CLAVES COMSEC que todos los slots están vacíos.',
      ],
      checks: [
        { label: 'Radio sin claves', test: (c) => c.radio.slots.every((s) => !s) },
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
