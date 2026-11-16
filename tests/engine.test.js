'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

for (const f of ['core', 'radio', 'skl', 'net', 'scenarios']) require(path.join(__dirname, '..', 'js', f + '.js'));
const SIM = globalThis.SIM;

/** Reloj y temporizadores falsos y deterministas. */
function fakeClock() {
  let now = Date.UTC(2026, 10, 14, 12, 0, 0);
  let seq = 0;
  const timers = new Map();
  return {
    now: () => now,
    random: () => 0.5,
    setTimeout: (fn, ms) => { const id = ++seq; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimeout: (id) => timers.delete(id),
    advance(ms) {
      const end = now + ms;
      for (;;) {
        let next = null;
        for (const [id, t] of timers) if (t.at <= end && (!next || t.at < next[1].at || (t.at === next[1].at && id < next[0]))) next = [id, t];
        if (!next) break;
        timers.delete(next[0]);
        now = next[1].at;
        next[1].fn();
      }
      now = end;
    },
  };
}

function setup() {
  const clock = fakeClock();
  const conn = { j1: 'HANDSET', j5: true, j8: 'NONE', az: 0, el: 0, cik: true };
  const radio = new SIM.Radio(Object.assign({ getConn: () => conn }, clock));
  const skl = new SIM.SKL(Object.assign({ cik: () => conn.cik }, clock));
  SIM.connectFill(() => conn, radio, skl);
  const net = new SIM.Net(radio, Object.assign({ myCall: () => 'Lobo 2' }, clock));
  radio.env.net = net;
  const logs = [];
  const hints = [];
  net.on('log', (l) => logs.push(l));
  net.on('hint', (h) => hints.push(h));
  const t = { clock, conn, radio, skl, net, logs, hints };
  t.tick = (ms = 50) => clock.advance(ms);
  return t;
}

// ------------------------------------------------------------------ ayudas de teclado
const press = (t, ...keys) => keys.forEach((k) => { t.radio.press(k); t.tick(1); });
function on(t, sw = 'PT') {
  t.radio.setSwitch(sw);
  t.tick(2500);
  assert.equal(t.radio.booted, true);
}
/** En un menú «USE < > TO SELECT ITEM», va al elemento y pulsa ENT. */
function menu(t, label) {
  const s = t.radio.screen;
  assert.equal(s.id, 'MENU', `esperaba un menú para ${label}, hay ${s.id}`);
  const items = typeof s.items === 'function' ? s.items() : s.items;
  const i = items.findIndex((x) => x.label === label);
  assert.ok(i >= 0, `elemento ${label}`);
  let guard = 0;
  while (s.idx !== i && guard++ < 20) t.radio.press('RIGHT');
  press(t, 'ENT');
}
/** En un campo de selección, elige el valor y pulsa ENT. */
function choose(t, value) {
  const s = t.radio.screen;
  assert.equal(s.id, 'WIZ', `esperaba un campo para ${value}, hay ${s.id}`);
  let guard = 0;
  while (s.ed.val !== value && guard++ < 30) t.radio.press('9');
  assert.equal(s.ed.val, value, `${s.fields[s.i].label}`);
  press(t, 'ENT');
}
/** En un campo numérico, teclea los dígitos y pulsa ENT. */
function num(t, digits) {
  const s = t.radio.screen;
  assert.equal(s.id, 'WIZ');
  assert.equal(s.fields[s.i].kind, 'num', `${s.fields[s.i].label} no es numérico`);
  press(t, ...digits.split(''), 'ENT');
}
const back = (t, n = 1) => { for (let i = 0; i < n; i++) press(t, 'CLR'); };

/** PGM > NORM > NET > nn > ACTIVATE YES > NET TYPE [> HOPPING TYPE] -> menú de la red */
function pgmNet(t, i, type, hop) {
  press(t, '8');
  menu(t, 'NORM');
  menu(t, 'NET');
  num(t, String(i).padStart(2, '0'));
  choose(t, 'YES');
  choose(t, type);
  if (hop) choose(t, hop);
  assert.equal(t.radio.screen.id, 'MENU');
}

const dlg = (t, btn, fields = {}) => t.skl.act('dlg', { btn, fields });
const SAT = (t) => `ABD 02 5AT900|A|${new Date(t.clock.now()).getMonth() + 1}`; // segmento SATCOM del mes
const SATTAG = (t) => SIM.satcomTag(t.clock.now());

/** Encendido y logon en Core Library (CIK insertado, sin cambio de contraseña); la UAS se abre sola. */
function sklLogin(t, user = 'OPERADOR', pass = 'Operador1') {
  t.skl.powerButton();
  t.tick(2500);
  assert.equal(t.skl.dlg.type, 'LOGON');
  assert.equal(t.skl.sip, true, 'Input Panel abierto');
  dlg(t, 'OK', { user, pass });
  t.tick(2000);
  assert.equal(t.skl.dlg.type, 'STARTUP');
  dlg(t, 'OK');
  assert.equal(t.skl.uasOpen, true, 'la UAS se abre por defecto');
  assert.equal(t.skl.win, 'UAS');
  assert.equal(t.skl.kov, 'GREEN');
}

/** Carga completa de una clave: File > Transmit > Load Selected Keys > Key Load Settings > Ready to Send Key > Status. */
function fillKey(t, keyId, crypto, keyType, number, opts = {}) {
  const r = t.radio;
  if (r.sw !== 'LD') r.setSwitch('LD');
  t.tick(10);
  t.conn.j1 = 'SKL';
  assert.equal(r.screen.id, 'WIZ');
  choose(t, opts.device || 'KYK-13');
  choose(t, crypto);
  choose(t, keyType);
  if (number) num(t, String(number).padStart(2, '0'));
  assert.equal(r.screen.id, 'FILL');
  assert.equal(r.screen.stage, 'READY');
  t.skl.dialogs = [];
  t.skl.send = null;
  t.skl.act('tab', 'KEYS');
  t.skl.act('cmd', 'loadSelectedKeys');
  assert.equal(t.skl.dlg.type, 'KEY_SELECT');
  dlg(t, 'OK', { keys: [keyId] });
  assert.equal(t.skl.dlg.type, 'KEY_SETTINGS', t.skl.dlg && t.skl.dlg.text);
  dlg(t, 'OK', { protocol: opts.protocol || 'DS-102', activate: opts.activate || (opts.protocol === 'DS-101' ? 'DS-101' : 'KYK-13') });
  assert.equal(t.skl.dlg.type, 'READY');
  dlg(t, 'OK', { every: true });
  assert.equal(t.skl.dlg.type, 'STATUS');
  assert.ok(/Press INITIATE Button|Attempting to Connect/.test(t.skl.send.lines[0]));
  press(t, 'ENT');
  t.tick(3000);
  const stage = r.screen.stage;
  if (t.skl.dlg && t.skl.dlg.type === 'MSG') dlg(t, 'OK');
  if (t.skl.dlg && t.skl.dlg.type === 'STATUS') dlg(t, t.skl.dlg.done ? 'Close' : 'Cancel');
  press(t, 'ENT'); // FILL DONE / BAD FILL -> MORE FILL DATA? YES
  press(t, '9', 'ENT'); // NO
  return stage;
}
function fillEnd(t, sw = 'CT') {
  t.conn.j1 = 'HANDSET';
  t.radio.setSwitch(sw);
  t.tick(10);
}

function talk(t, text = 'prueba de radio') {
  const r = t.radio.pttDown();
  t.tick(1000);
  t.radio.pttUp(text);
  t.tick(4000);
  return r;
}

// ------------------------------------------------------------------ pruebas
test('arranque en PT, pantalla operacional y apagado', () => {
  const t = setup();
  assert.equal(t.radio.display().lit, false);
  on(t);
  const d = t.radio.display();
  assert.match(d.text[0], /^R BAT NORM +PT$/);
  assert.equal(d.text[1], '00-NET0');
  assert.equal(d.text[2], 'LOS VOC VOC FM TONE');
  assert.equal(d.text[3], 'TYPE ADF DATA MODE SQL');
  press(t, '0');
  assert.equal(t.radio.display().text[1], 'R:030.00000 LOS');
  assert.equal(t.radio.display().text[3], 'FREQUENCY RATE');
  t.radio.setSwitch('OFF');
  assert.equal(t.radio.display().lit, false);
});

test('BIT desde MODE > TEST', () => {
  const t = setup();
  on(t);
  press(t, '3');
  choose(t, 'TEST');
  t.tick(10);
  menu(t, 'TEST');
  t.tick(3500);
  assert.equal(t.radio.bitResult.pass, true);
  assert.match(SIM.plain(t.radio.display().lines[1]), /BIT PASSED/);
  assert.ok(SIM.evaluateScenario(SIM.SCENARIOS[0], t).every((c) => c.ok));
});

test('programación LOS por menús y contacto con Halcón 6', () => {
  const t = setup();
  on(t);
  pgmNet(t, 1, 'LOS FIX FREQUENCY');
  menu(t, 'FREQ');
  num(t, '04550000');
  num(t, '04550000');
  choose(t, 'NO');
  menu(t, 'PWR');
  choose(t, 5);
  // frecuencia fuera de rango
  menu(t, 'FREQ');
  num(t, '6');
  assert.match(t.radio.msg, /FUERA DE RANGO/);
  back(t);
  press(t, 'PRE+'); // sale de programación
  assert.equal(t.radio.screen.id, 'MAIN');
  press(t, 'PRE+'); // siguiente preset de la lista
  assert.equal(t.radio.cur, 1);
  assert.equal(t.radio.display().text[1], '01-NET1');
  const r = talk(t, 'Halcón 6, aquí Lobo 2, prueba de radio, cambio');
  assert.equal(r.ok, true);
  assert.equal(t.net.contacts.HALCON, 1, t.hints.join(' | '));
  assert.ok(SIM.evaluateScenario(SIM.SCENARIOS.find((s) => s.id === 'los-pt'), t).every((c) => c.ok));
});

test('squelch por tono y antena: motivos de fallo', () => {
  const t = setup();
  on(t);
  Object.assign(t.radio.nets[1], { rx: 45.5, tx: 45.5, sq: 'NOISE' });
  t.radio.cur = 1;
  talk(t);
  assert.match(t.hints.at(-1), /tono/);
  t.radio.nets[1].sq = 'TONE';
  t.conn.j5 = false;
  talk(t);
  assert.match(t.hints.at(-1), /J5/);
  t.conn.j1 = 'NONE';
  assert.match(t.radio.pttDown().reason, /H-250/);
});

test('carga KYK-13 (DS-102) desde el SKL; DS-101 comprueba el tipo; peligro de conectar fuera de LD', () => {
  const t = setup();
  sklLogin(t);
  on(t);
  // conectar el SKL con la radio en PT -> transmisión automática
  t.conn.j1 = 'SKL';
  t.radio.fillHazard();
  assert.equal(t.radio.hazards, 1);
  t.conn.j1 = 'HANDSET';
  t.radio.hazards = 0;
  // carga correcta del segmento SATCOM del mes en ANDVT TEK 01
  assert.equal(fillKey(t, SAT(t), 'ANDVT', 'TEK', 1), 'DONE');
  assert.equal(t.radio.keys.ANDVT.TEK[0].tag, SATTAG(t));
  assert.equal(t.radio.keys.ANDVT.TEK[0].proto, 'DS-102');
  assert.equal(SIM.plain(t.radio.display().lines[1]).trim(), 'CHANGE SW FROM LD');
  // Activate Mode DS-102 (valor por defecto) también es compatible con FILL DEVICE KYK-13
  t.radio.setSwitch('PT');
  t.tick(10);
  assert.equal(fillKey(t, SAT(t), 'VINSON', 'TEK', 5, { activate: 'DS-102' }), 'DONE');
  assert.equal(t.radio.keys.VINSON.TEK[4].tag, SATTAG(t));
  // Activate Mode de otro equipo (KYX-15) -> BAD FILL
  t.radio.setSwitch('PT');
  t.tick(10);
  assert.equal(fillKey(t, SAT(t), 'ANDVT', 'TEK', 2, { activate: 'KYX-15' }), 'BAD');
  // DS-101 con un tipo distinto (BD ampliada: TEK VINSON en el banco ANDVT) -> BAD FILL
  t.skl.loadExtendedDb();
  t.radio.setSwitch('PT');
  t.tick(10);
  assert.equal(fillKey(t, 'ABD 05 5AT900|A|1', 'ANDVT', 'TEK', 2, { device: 'CYZ-10 DS-101', protocol: 'DS-101' }), 'BAD');
  assert.equal(t.radio.keys.ANDVT.TEK[1], null);
  // protocolo distinto entre radio y SKL -> BAD FILL
  t.radio.setSwitch('PT');
  t.tick(10);
  assert.equal(fillKey(t, SAT(t), 'ANDVT', 'TEK', 3, { protocol: 'DS-101' }), 'BAD');
  // segmento caducado (ABD 01, enero, RED KEY): el SKL no lo carga
  t.skl.dialogs = [];
  t.skl.send = null;
  t.skl.act('select', 'seg:ABD 01 5AT900|A|1');
  t.skl.act('cmd', 'load');
  assert.match(t.skl.dlg.text, /expired/);
  dlg(t, 'OK');
  // solo etiqueta, sin variable (KEY TAG)
  t.skl.act('select', 'seg:ABD 60 5AT900|A|1');
  t.skl.act('cmd', 'load');
  assert.match(t.skl.dlg.text, /KEY TAG/);
  dlg(t, 'OK');
  // View > Keys > Expired Keys > Delete All
  t.skl.act('cmd', 'expired');
  dlg(t, 'Delete All');
  dlg(t, 'Yes');
  assert.match(t.skl.dlg.text, /deleted/);
  dlg(t, 'OK');
  assert.equal(t.skl.keys.filter((k) => k.st === 'ABD 01 5AT900').length, 0); // ABD 01 entero caducado
  assert.equal(t.skl.keys.filter((k) => k.st === 'ABD 02 5AT900').length, 12); // ABD 02 intacto
  assert.ok(SIM.evaluateScenario(SIM.SCENARIOS.find((s) => s.id === 'expired'), t).every((c) => c.ok));
  fillEnd(t);
  assert.ok(SIM.evaluateScenario(SIM.SCENARIOS.find((s) => s.id === 'fill-kyk'), t).every((c) => c.ok));
});

test('red LOS cifrada VINSON: CT obligatorio, clave y alcance', () => {
  const t = setup();
  sklLogin(t);
  on(t);
  t.skl.loadExtendedDb();
  fillKey(t, 'ABD 05 5AT900|A|1', 'VINSON', 'TEK', 1);
  fillEnd(t, 'PT');
  pgmNet(t, 2, 'LOS FIX FREQUENCY');
  menu(t, 'FREQ');
  num(t, '06275000');
  num(t, '06275000');
  choose(t, 'NO');
  menu(t, 'COMSEC');
  choose(t, 'VINSON');
  num(t, '01');
  choose(t, 'NO');
  menu(t, 'PWR');
  choose(t, 2);
  press(t, 'PRE+');
  t.radio.cur = 2;
  talk(t);
  assert.match(t.hints.at(-1), /en claro/);
  t.radio.setSwitch('CT');
  t.tick(10);
  assert.match(t.radio.display().text[0], /^R BAT NORM VINSON TEK01 +CT$/);
  talk(t);
  assert.match(t.hints.at(-1), /alcance/);
  t.radio.nets[2].power = 10;
  talk(t);
  assert.equal(t.net.contacts.CONDOR, 1, t.hints.join(' | '));
});

test('SINCGARS: loadset por ICOM desde la pestaña Plats y contacto', () => {
  const t = setup();
  sklLogin(t);
  on(t, 'LD');
  t.conn.j1 = 'SKL';
  choose(t, 'CYZ10-RDS');
  assert.equal(t.radio.screen.id, 'FILL');
  t.skl.loadExtendedDb();
  // Plats > CDR HMMV > RT1 PRC117F > File > Transmit > Load...
  const icom = () => {
    t.skl.act('tab', 'PLATS');
    t.skl.act('select', 'pe:eq');
    t.skl.act('cmd', 'load');
    t.tick(1000);
    assert.equal(t.skl.dlg.type, 'SINC_MODE');
    dlg(t, 'OK', { transfer: 'ICOM', includeTime: true });
    assert.equal(t.skl.dlg.type, 'ECU_WIZ');
    dlg(t, 'Next');
    dlg(t, 'Send');
  };
  // Send antes de que la radio espere -> «No response», Re-load equipment? > No
  icom();
  t.tick(2000);
  assert.ok(t.skl.icom.lines.some((l) => /No response/.test(l)));
  assert.equal(t.skl.dlg.type, 'RELOAD');
  dlg(t, 'No');
  // ahora con la radio en FILL IN PROGRESS
  press(t, 'ENT');
  assert.equal(t.radio.screen.stage, 'PROGRESS');
  icom();
  t.tick(6000);
  assert.equal(t.skl.dlg.type, 'RELOAD');
  dlg(t, 'No');
  assert.match(t.skl.dlg.text, /Operation Successful/);
  dlg(t, 'OK');
  dlg(t, 'Close');
  assert.equal(t.radio.screen.stage, 'DONE');
  assert.equal(t.radio.keys.SINCGARS.TSK[19].netId, 345);
  assert.equal(t.radio.keys.VINSON.TEK[20].tag, 'ABD 11 5AT900 A-1');
  assert.ok(t.radio.todSinc);
  press(t, 'ENT');
  press(t, '9', 'ENT');
  fillEnd(t);
  pgmNet(t, 3, 'FREQUENCY HOPPING', 'SINCGARS');
  menu(t, 'HOPSET');
  num(t, '20');
  choose(t, 'OFF');
  choose(t, 'NO');
  menu(t, 'COMSEC');
  choose(t, 'VINSON');
  num(t, '21');
  choose(t, 'NO');
  press(t, 'PRE+');
  t.radio.cur = 3;
  talk(t);
  assert.equal(t.net.contacts.JAGUAR, 1, t.hints.join(' | '));
  assert.ok(SIM.evaluateScenario(SIM.SCENARIOS.find((s) => s.id === 'sincgars'), t).every((c) => c.ok));
});

test('HAVEQUICK: MWOD del día UTC, TOD por CALL y contacto', () => {
  const t = setup();
  sklLogin(t);
  on(t);
  const day = new Date(t.clock.now()).getUTCDate();
  t.skl.loadExtendedDb();
  fillKey(t, 'ABD 50 5AT900|A|1', 'HAVEQUICK', 'WOD', day);
  fillEnd(t, 'PT');
  t.conn.j8 = 'FLEX';
  pgmNet(t, 4, 'FREQUENCY HOPPING', 'HAVEQUICK');
  menu(t, 'NET');
  num(t, '00300');
  assert.equal(t.radio.nets[4].hqNet, '00.300');
  press(t, 'PRE+');
  t.radio.cur = 4;
  assert.match(t.radio.pttDown().reason, /TOD/);
  press(t, '1');
  choose(t, 'RECEIVE');
  t.tick(4000);
  assert.ok(t.radio.todHQ);
  back(t);
  talk(t);
  assert.equal(t.net.contacts.AGUILA, 1, t.hints.join(' | '));
});

test('SATCOM dedicado: código de 5 kHz limita COMSEC a ANDVT/KG-84, RSSI y contacto', () => {
  const t = setup();
  sklLogin(t);
  on(t);
  fillKey(t, SAT(t), 'ANDVT', 'TEK', 1);
  fillEnd(t, 'PT');
  t.conn.j8 = 'SATCOM';
  pgmNet(t, 5, 'SATCOM');
  menu(t, 'FREQ');
  num(t, '005');
  assert.match(t.radio.msg, /CODIGO NO VALIDO/);
  num(t, '150');
  choose(t, 'NO');
  assert.deepEqual(SIM.Radio.cryptoOptions(t.radio.nets[5]), ['NONE', 'ANDVT', 'KG-84']);
  menu(t, 'COMSEC');
  choose(t, 'ANDVT');
  num(t, '01');
  choose(t, '20');
  choose(t, 'STANDARD');
  choose(t, 'ENABLE');
  press(t, 'PRE+');
  t.radio.cur = 5;
  t.radio.setSwitch('CT');
  t.tick(10);
  // RSSI con la antena mal apuntada
  press(t, '1', 'ENT');
  t.tick(3000);
  assert.ok(t.radio.lastRssi.score < 80);
  back(t);
  talk(t);
  assert.match(t.hints.at(-1), /mal apuntada/);
  t.conn.az = SIM.Net.SATELLITE.az;
  t.conn.el = SIM.Net.SATELLITE.el;
  press(t, '1', 'ENT');
  t.tick(3000);
  assert.ok(t.radio.lastRssi.score >= 80);
  back(t);
  talk(t);
  assert.equal(t.net.contacts.CENTAURO, 1, t.hints.join(' | '));
  // frecuencias invertidas con el código 999
  const s = t.radio.linkSnapshot();
  s.net = Object.assign({}, s.net, { code: 999 });
  s.sat = { bw: 5, rx: s.sat.tx, tx: s.sat.rx };
  assert.match(t.net.evaluate(s).reason, /invertidas/);
  assert.ok(SIM.evaluateScenario(SIM.SCENARIOS.find((x) => x.id === 'sat-ded'), t).every((c) => c.ok));
});

test('DAMA: programación, conexión, llamada y errores 77/82', () => {
  const t = setup();
  sklLogin(t);
  on(t);
  t.skl.loadExtendedDb();
  fillKey(t, 'ABD 07 5AT900|A|1', 'SATELLITE', 'TSK', 1);
  t.radio.setSwitch('PT');
  t.tick(10);
  fillKey(t, SAT(t), 'ANDVT', 'TEK', 2);
  fillEnd(t);
  t.conn.j8 = 'SATCOM';
  t.conn.az = SIM.Net.SATELLITE.az;
  t.conn.el = SIM.Net.SATELLITE.el;
  const D = SIM.Net.DAMA;
  press(t, '8');
  menu(t, 'DAMA');
  menu(t, 'PRESETS');
  menu(t, 'NETS');
  num(t, '0');
  menu(t, 'CHANNEL');
  num(t, String(D.channel).padStart(3, '0'));
  choose(t, 'FULL');
  choose(t, 'NO');
  num(t, '0');
  menu(t, 'ADDR');
  menu(t, 'BASE_ADDRESS');
  num(t, '10453'); // TBA equivocada a propósito
  menu(t, 'GUARD_LIST');
  menu(t, 'ADD');
  num(t, String(D.networkAddr));
  back(t, 2);
  menu(t, 'TRANSEC');
  choose(t, 'ON');
  num(t, '01');
  choose(t, 'NONE');
  back(t, 1);
  menu(t, 'PORT_CONFIGS');
  num(t, '0');
  menu(t, 'COMSEC');
  choose(t, 'ANDVT');
  num(t, '02');
  choose(t, '20');
  back(t, 1);
  menu(t, 'DESTINATIONS');
  num(t, '00');
  menu(t, '25K_AC');
  menu(t, 'ADD');
  num(t, '51230'); // destino equivocado a propósito
  t.radio.home();
  // modo DAMA
  press(t, '3');
  choose(t, 'DAMA');
  t.tick(15000);
  assert.equal(t.radio.dama.status, 'ERROR');
  assert.equal(t.radio.dama.err, 77);
  t.radio.damaNets[0].tba = 10452;
  t.radio.startDama();
  t.tick(15000);
  assert.equal(t.radio.dama.status, 'CONNECTED');
  assert.match(t.radio.pttDown().reason, /PLACE A CALL/);
  const call = () => {
    press(t, '1');
    choose(t, 'PLACE A CALL');
    num(t, '00');
    choose(t, 'ROUTINE');
    num(t, '0000');
    t.tick(2500);
  };
  call();
  assert.equal(t.radio.dama.service, 'IDLE');
  assert.match(t.radio.msg, /ERROR 82/);
  t.radio.damaDests[0].ac25 = [D.networkAddr];
  call();
  assert.equal(t.radio.dama.service, 'ACTIVE');
  talk(t);
  assert.equal(t.net.contacts.ORION, 1, t.hints.join(' | '));
  assert.ok(SIM.evaluateScenario(SIM.SCENARIOS.find((x) => x.id === 'sat-dama'), t).every((c) => c.ok));
});

test('DAMA sin TSK de orderwire: NO ORDERWIRE KEYS', () => {
  const t = setup();
  on(t, 'CT');
  press(t, '3');
  choose(t, 'DAMA');
  t.tick(2000);
  assert.equal(t.radio.dama.err, 'NO ORDERWIRE KEYS');
  assert.match(t.radio.display().text.join(' | '), /NO ORDERWIRE KEYS/);
});

test('borrados: Z-ALL (rojos), tecla ZERO (programación) y CLR (todo)', () => {
  const t = setup();
  sklLogin(t);
  on(t);
  fillKey(t, SAT(t), 'VINSON', 'TEK', 1);
  fillEnd(t, 'PT');
  t.radio.nets[1].name = 'MANDO';
  t.radio.setSwitch('ZALL');
  t.tick(10);
  assert.equal(t.radio.keyCount(), 0);
  assert.equal(t.radio.nets[1].name, 'MANDO');
  assert.equal(t.radio.display().text[1], 'ZEROIZE PASSED');
  t.radio.setSwitch('PT');
  t.tick(2500);
  press(t, '5');
  choose(t, 'YES');
  assert.equal(t.radio.nets[1].name, 'NET1');
  t.radio.nets[1].name = 'OTRO';
  t.radio.setSwitch('CLR');
  t.radio.setSwitch('PT');
  t.tick(2500);
  assert.match(t.radio.display().text.join(' | '), /BLACK DATA RESET/);
  press(t, 'ENT');
  assert.equal(t.radio.nets[1].name, 'NET1');
  t.skl.zeroize();
  assert.equal(t.skl.keys.length, 0);
  assert.equal(t.skl.card, 'UNINIT');
  assert.ok(SIM.evaluateScenario(SIM.SCENARIOS.find((x) => x.id === 'zeroize'), t).every((c) => c.ok));
});

test('SKL: logon, orden de salida, Reset Card, fallos de logon, auditoría solo SSO y apagado', () => {
  const t = setup();
  sklLogin(t);
  // árbol Keys: ABD 01 (12 meses anteriores, caducados) y ABD 02 (mes en curso y 11 siguientes)
  t.skl.act('tab', 'KEYS');
  const sts = t.skl.visibleNodes().filter((n) => n.id.startsWith('st:')).map((n) => n.label);
  assert.deepEqual(sts, ['ABD 01 5AT900', 'ABD 02 5AT900']);
  t.skl.act('toggle', 'st:ABD 01 5AT900');
  t.skl.act('toggle', 'ed:ABD 01 5AT900|A');
  const old = t.skl.visibleNodes().filter((n) => n.id.startsWith('seg:ABD 01'));
  assert.equal(old.length, 12);
  assert.ok(old.every((n) => n.icon === 'RED'));
  assert.equal(old[0].label, '11-T000-11-NOV TEK'); // noviembre del año pasado
  t.skl.act('toggle', 'st:ABD 02 5AT900');
  t.skl.act('toggle', 'ed:ABD 02 5AT900|A');
  const segs = t.skl.visibleNodes().filter((n) => n.id.startsWith('seg:ABD 02'));
  assert.equal(segs.length, 12);
  assert.equal(segs[0].label, '11-T000-11-NOV TEK');
  assert.equal(segs[0].icon, 'YELLOW');
  assert.ok(segs.slice(1).every((n) => n.icon === 'PENDING'));
  t.skl.act('open', 'seg:' + SAT(t));
  assert.equal(t.skl.dlg.type, 'SEGMENT');
  dlg(t, 'Close');
  // Key Load Settings: Activate Mode depende del Protocol
  t.skl.act('select', 'seg:' + SAT(t));
  t.skl.act('cmd', 'load');
  assert.equal(t.skl.dlg.type, 'KEY_SETTINGS');
  t.skl.act('dlgField', { fields: { protocol: 'RS-232' } });
  assert.equal(t.skl.dlg.v.activate, 'RS-232');
  dlg(t, 'Cancel');
  // no se puede cerrar sesión con la UAS abierta
  t.skl.act('cmd', 'logout');
  assert.match(t.skl.dlg.text, /exit the SKL UAS/);
  dlg(t, 'OK');
  t.skl.act('cmd', 'exit');
  assert.equal(t.skl.win, 'CORELIB');
  // Reset Card: cierra la sesión pero no borra las claves
  t.skl.act('cmd', 'resetCard');
  dlg(t, 'Yes');
  t.tick(2000);
  assert.match(t.skl.dlg.text, /Card was reset/);
  dlg(t, 'OK');
  assert.equal(t.skl.loggedIn, false);
  assert.equal(t.skl.keys.length, 24);
  // 10 fallos de logon seguidos borran la cuenta del usuario
  t.skl.act('cmd', 'login');
  for (let i = 0; i < 10; i++) {
    dlg(t, 'OK', { user: 'OPERADOR', pass: 'x' });
    dlg(t, 'OK');
    if (i < 9) assert.equal(t.skl.dlg.type, 'LOGON');
  }
  assert.equal(t.skl.accounts.OPERADOR, undefined);
  // la auditoría requiere SSO
  t.skl.act('cmd', 'login');
  dlg(t, 'OK', { user: 'SSO', pass: 'Sso12345' });
  t.tick(2000);
  dlg(t, 'OK');
  assert.equal(t.skl.win, 'UAS');
  t.skl.act('cmd', 'exit');
  t.skl.act('cmd', 'viewAudit');
  assert.equal(t.skl.dlg.type, 'AUDIT');
  assert.ok(t.skl.audit.some((a) => /deleted \(10 consecutive/.test(a.text)));
  dlg(t, 'OK');
  t.skl.act('cmd', 'logout');
  t.tick(2000);
  assert.equal(t.skl.kov, 'OFF');
  assert.ok(SIM.evaluateScenario(SIM.SCENARIOS.find((x) => x.id === 'skl-init'), t).every((c) => c.ok));
  // el apagado se puede abortar pulsando de nuevo el botón
  t.skl.powerButton();
  t.tick(3000);
  t.skl.powerButton();
  t.tick(10000);
  assert.equal(t.skl.power, true);
  t.skl.powerButton();
  t.tick(11000);
  assert.equal(t.skl.power, false);
});

test('serialización de la radio y del SKL', () => {
  const t = setup();
  t.radio.nets[7].rx = 77.125;
  t.radio.keys.ANDVT.TEK[3] = { tag: 'X', src: 'SKL', proto: 'DS-102', at: 0 };
  t.radio.damaNets[2].guard = [51234];
  const t2 = setup();
  t2.radio.load(JSON.parse(JSON.stringify(t.radio.serialize())));
  assert.equal(t2.radio.nets[7].rx, 77.125);
  assert.equal(t2.radio.keys.ANDVT.TEK[3].tag, 'X');
  assert.deepEqual(t2.radio.damaNets[2].guard, [51234]);
  t.skl.keys = t.skl.keys.slice(0, 2);
  t.skl.card = 'READY';
  t.skl.loadExtendedDb();
  t.skl.keys = t.skl.keys.slice(0, 2);
  t2.skl.load(JSON.parse(JSON.stringify(t.skl.serialize())));
  assert.equal(t2.skl.keys.length, 2);
  assert.equal(t2.skl.card, 'READY');
});

test('nombre de red con entrada alfanumérica (multitecla)', () => {
  const t = setup();
  on(t);
  pgmNet(t, 6, 'LOS FIX FREQUENCY');
  menu(t, 'NAME');
  // R = 6 x4, E = 2 x3, ► , D = 2 x2  (ejemplo del manual)
  press(t, '6', '6', '6', '6', '2', '2', '2', 'RIGHT', '2', '2', 'ENT');
  assert.equal(t.radio.nets[6].name, 'RED');
});

test('PGM NET: ACTIVATE IN LIST? sale en pantalla en cuanto se elige la red; CLR en LD nunca sale del menú FILL', () => {
  const t = setup();
  on(t, 'CT');
  press(t, '8');
  menu(t, 'NORM');
  menu(t, 'NET');
  num(t, '03');
  assert.equal(t.radio.screen.id, 'WIZ');
  assert.equal(SIM.plain(t.radio.display().text[1]).trim(), 'ACTIVATE IN LIST?');
  back(t);
  assert.equal(t.radio.screen.title, 'NORM'); // CLR vuelve al menú NORM
  // menú de la red: indica con ▼ que hay más opciones (NAME)
  menu(t, 'NET');
  num(t, '03');
  choose(t, 'YES');
  choose(t, 'LOS FIX FREQUENCY');
  assert.equal(t.radio.display().rows[1].r, '▼');
  menu(t, 'NAME');
  assert.equal(t.radio.screen.id, 'WIZ');
  // LD: muchos CLR siguen en el menú FILL
  press(t, 'PRE+');
  t.radio.setSwitch('LD');
  t.tick(10);
  press(t, 'ENT'); // FILL DEVICE -> CRYPTO TYPE
  back(t, 8);
  assert.equal(t.radio.screen.id, 'WIZ');
  assert.equal(t.radio.screen.title, 'FILL MENU');
  assert.equal(SIM.plain(t.radio.display().text[1]).trim(), 'FILL DEVICE');
});

test('varias llaves sin «Display for Every Key»: Status registra cada llave; la radio recuerda la selección', () => {
  const t = setup();
  on(t, 'PT');
  sklLogin(t);
  t.radio.setSwitch('LD');
  t.tick(10);
  t.conn.j1 = 'SKL';
  choose(t, 'KYK-13');
  choose(t, 'ANDVT');
  choose(t, 'TEK');
  num(t, '03');
  assert.equal(t.radio.screen.stage, 'READY');
  const now = new Date(t.clock.now());
  const k1 = `ABD 02 5AT900|A|${now.getMonth() + 1}`;
  const k2 = `ABD 02 5AT900|A|${((now.getMonth() + 1) % 12) + 1}`;
  t.skl.act('tab', 'KEYS');
  t.skl.act('cmd', 'loadSelectedKeys');
  dlg(t, 'OK', { keys: [k1, k2] });
  dlg(t, 'OK', { protocol: 'DS-102', activate: 'DS-102' });
  dlg(t, 'OK', { every: false }); // Ready to Send Key solo una vez
  press(t, 'ENT');
  t.tick(3000);
  assert.equal(t.radio.screen.stage, 'DONE');
  assert.equal(t.radio.keys.ANDVT.TEK[2].tag, 'ABD 02 5AT900 A-' + (now.getMonth() + 1));
  // MORE FILL DATA? YES -> el menú FILL conserva KYK-13 / ANDVT / TEK / 03
  press(t, 'ENT');
  press(t, 'ENT');
  assert.equal(SIM.plain(t.radio.display().text[2]).trim(), 'KYK-13');
  press(t, 'ENT');
  assert.equal(SIM.plain(t.radio.display().text[2]).trim(), 'ANDVT');
  press(t, 'ENT');
  assert.equal(SIM.plain(t.radio.display().text[2]).trim(), 'TEK');
  press(t, 'ENT');
  assert.match(SIM.plain(t.radio.display().text[2]), /03/);
  press(t, '0', '4', 'ENT');
  // el SKL sigue en la misma ventana Status, sin volver a preguntar
  assert.equal(t.skl.dlg.type, 'STATUS');
  press(t, 'ENT');
  t.tick(3000);
  assert.equal(t.radio.keys.ANDVT.TEK[3].tag, 'ABD 02 5AT900 A-' + (((now.getMonth() + 1) % 12) + 1));
  const st = t.skl.dialogs.find((d) => d.type === 'STATUS');
  assert.deepEqual(st.lines.map((l) => l.replace(/ABD 02 5AT900 A-\d+/, 'K')), [
    'Press INITIATE Button....', 'Transmit In Progress ....', 'Key K loaded successfully.',
    'Press INITIATE Button....', 'Transmit In Progress ....', 'Key K loaded successfully.',
    'Operation Successful.',
  ]);
});
