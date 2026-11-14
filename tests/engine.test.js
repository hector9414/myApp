'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

for (const f of ['core', 'radio', 'skl', 'net', 'scenarios']) require(path.join(__dirname, '..', 'js', f + '.js'));
const SIM = globalThis.SIM;

/** Reloj y temporizadores falsos y deterministas. */
function fakeClock() {
  let now = Date.UTC(2026, 10, 13, 12, 0, 0);
  let seq = 0;
  const timers = new Map();
  const clock = {
    now: () => now,
    random: () => 0.5,
    setTimeout: (fn, ms) => { const id = ++seq; timers.set(id, { fn, at: now + ms }); return id; },
    clearTimeout: (id) => timers.delete(id),
    advance(ms) {
      const end = now + ms;
      for (;;) {
        let next = null;
        for (const [id, t] of timers) if (t.at <= end && (!next || t.at < next[1].at)) next = [id, t];
        if (!next) break;
        timers.delete(next[0]);
        now = next[1].at;
        next[1].fn();
      }
      now = end;
    },
  };
  return clock;
}

function setup() {
  const clock = fakeClock();
  const conn = { antenna: 'WHIP', handset: true, fillCable: true, cik: true };
  const radio = new SIM.Radio(Object.assign({ getConn: () => conn }, clock));
  const skl = new SIM.SKL(Object.assign({ cik: () => conn.cik, fill: SIM.makeFillBridge(() => conn, radio) }, clock));
  const net = new SIM.Net(radio, Object.assign({ myCall: () => 'Lobo 2' }, clock));
  const logs = [];
  const hints = [];
  net.on('log', (l) => logs.push(l));
  net.on('hint', (h) => hints.push(h));
  return { clock, conn, radio, skl, net, logs, hints };
}

const keys = (radio, seq) => seq.forEach((k) => radio.press(k));
const typeNum = (radio, str) => keys(radio, [...str].map((c) => c));

function powerOn(t, pos = 'ON') {
  t.radio.setKnob(pos);
  t.clock.advance(3000);
  assert.equal(t.radio.booted, true);
}

function talk(t, text = 'prueba de radio') {
  const r = t.radio.pttDown();
  t.clock.advance(1000);
  t.radio.pttUp(text);
  t.clock.advance(4000);
  return r;
}

/** Programa un campo del preset actual vía teclado: PGM > PRESETS > Pn > campo. */
function program(t, presetIdx, edits) {
  const r = t.radio;
  r.press('PGM'); // menú programación, idx 0 = PRESETS
  r.press('ENT');
  while (r.screen.idx !== presetIdx) r.press('DOWN');
  r.press('ENT'); // FIELDS
  for (const [field, value] of edits) {
    const fields = SIM.Radio.fieldsFor(r.presets[presetIdx]);
    const i = fields.indexOf(field);
    assert.ok(i >= 0, `campo ${field} visible`);
    while (r.screen.idx !== i) r.press('DOWN');
    r.press('ENT'); // EDIT
    if (typeof value === 'string' && /^[0-9.]+$/.test(value)) {
      typeNum(r, value);
    } else {
      let guard = 0;
      while (r.screen.val !== value && guard++ < 20) r.press('UP');
      assert.equal(r.screen.val, value);
    }
    r.press('ENT');
    assert.equal(r.screen.id, 'FIELDS', `guardado ${field}: ${r.msg}`);
  }
  r.press('CLR');
  r.press('CLR');
  r.press('CLR');
  assert.equal(r.screen.id, 'MAIN');
}

function loginSkl(t) {
  t.skl.powerButton();
  t.clock.advance(2000);
  assert.equal(t.skl.screen, 'PIN');
  for (const d of SIM.SKL.TRAINING_PIN) t.skl.act('pinDigit', d);
  t.skl.act('pinOk');
  assert.equal(t.skl.loggedIn, true);
}

function fill(t, tag, slot) {
  const r = t.radio;
  if (r.knob !== 'LD') r.setKnob('LD');
  while (r.ldSlot !== slot) r.press('UP');
  t.skl.act('go', 'ISSUE');
  t.skl.act('toggleSelect', tag);
  t.skl.act('issueReview');
  t.skl.act('issueGo');
  t.clock.advance(2000);
  assert.equal(t.skl.screen, 'ISSUE_RESULT');
  return t.skl.issue.results[0];
}

test('arranque, pantalla y apagado', () => {
  const t = setup();
  assert.equal(t.radio.display().lit, false);
  t.radio.setKnob('ON');
  assert.equal(t.radio.screen.id, 'BOOT');
  t.clock.advance(3000);
  assert.equal(t.radio.screen.id, 'MAIN');
  const d = t.radio.display();
  assert.equal(d.lit, true);
  assert.equal(d.lines.length, 4);
  d.lines.forEach((l) => assert.equal(l.length, 22));
  assert.match(d.lines[0], /^P01 MANDO/);
  assert.match(d.lines[1], /LOS FM 40\.0000/);
  t.radio.setKnob('OFF');
  assert.equal(t.radio.display().lit, false);
});

test('BIT falla sin antena y pasa con antena', () => {
  const t = setup();
  t.conn.antenna = 'NONE';
  powerOn(t);
  t.radio.startBit();
  t.clock.advance(3500);
  assert.equal(t.radio.bitResult.pass, false);
  t.conn.antenna = 'WHIP';
  t.radio.startBit();
  t.clock.advance(3500);
  assert.equal(t.radio.bitResult.pass, true);
});

test('validación de frecuencia por teclado', () => {
  const t = setup();
  powerOn(t);
  const r = t.radio;
  r.press('PGM'); r.press('ENT'); r.press('ENT'); // P01 > FIELDS
  r.press('DOWN'); r.press('DOWN'); // FREC
  r.press('ENT');
  typeNum(r, '600');
  r.press('ENT');
  assert.equal(r.screen.id, 'EDIT');
  assert.match(r.msg, /RANGO FM/);
  typeNum(r, '45.5');
  r.press('ENT');
  assert.equal(r.screen.id, 'FIELDS');
  assert.equal(r.presets[0].freq, 45.5);
});

test('AM no permitida por debajo de 90 MHz', () => {
  const t = setup();
  const p = t.radio.presets[0];
  assert.equal(t.radio.applyField(p, 'mod', 'AM'), 'FREC NO VALIDA EN AM');
  assert.equal(p.mod, 'FM');
});

test('contacto en claro con Halcón 6', () => {
  const t = setup();
  powerOn(t);
  program(t, 1, [['freq', '45.5']]);
  t.radio.press('PRE+');
  assert.equal(t.radio.cur, 1);
  const r = talk(t, 'Halcón 6, aquí Lobo 2, prueba de radio, cambio');
  assert.equal(r.ok, true);
  assert.equal(t.net.contacts.HALCON, 1);
  const rx = t.logs.find((l) => l.dir === 'RX');
  assert.match(rx.text, /Lobo 2, aquí Halcón 6/);
  assert.ok(SIM.evaluateScenario(SIM.SCENARIOS.find((s) => s.id === 'los-pt'), t).every((c) => c.ok));
});

test('sin microteléfono no se puede transmitir', () => {
  const t = setup();
  t.conn.handset = false;
  powerOn(t);
  const r = t.radio.pttDown();
  assert.equal(r.ok, false);
  assert.match(r.reason, /microteléfono/);
});

test('CT sin TEK cargada bloquea el PTT', () => {
  const t = setup();
  powerOn(t);
  t.radio.preset.crypto = 'CT';
  assert.equal(t.radio.pttDown().ok, false);
});

test('carga con SKL: requiere cable y posición LD; bloquea claves caducadas', () => {
  const t = setup();
  loginSkl(t);
  powerOn(t);
  // radio en ON -> falla
  t.skl.act('go', 'ISSUE');
  t.skl.act('toggleSelect', 'ALFA-TEK-01');
  t.skl.act('issueReview');
  t.skl.act('issueGo');
  t.clock.advance(2000);
  assert.equal(t.skl.issue.results[0].ok, false);
  assert.match(t.skl.issue.results[0].reason, /LD/);
  // sin cable -> falla
  t.conn.fillCable = false;
  t.radio.setKnob('LD');
  t.skl.act('go', 'ISSUE');
  t.skl.act('toggleSelect', 'ALFA-TEK-01');
  t.skl.act('issueReview');
  t.skl.act('issueGo');
  t.clock.advance(2000);
  assert.match(t.skl.issue.results[0].reason, /cable/);
  // caducada -> bloqueada
  t.conn.fillCable = true;
  const exp = fill(t, 'ALFA-TEK-00', 1);
  assert.equal(exp.ok, false);
  assert.match(exp.reason, /CADUCADA/);
  // correcta
  const ok = fill(t, 'ALFA-TEK-01', 1);
  assert.equal(ok.ok, true);
  assert.equal(t.radio.slots[0].tag, 'ALFA-TEK-01');
  assert.ok(SIM.evaluateScenario(SIM.SCENARIOS.find((s) => s.id === 'fill'), t).every((c) => c.ok));
});

test('red cifrada: clave correcta, potencia y alcance', () => {
  const t = setup();
  loginSkl(t);
  powerOn(t, 'LD');
  fill(t, 'BRAVO-TEK-02', 2);
  fill(t, 'ALFA-TEK-01', 1);
  t.radio.setKnob('ON');
  program(t, 2, [['freq', '62.75'], ['crypto', 'CT'], ['keySlot', 2], ['power', 'BAJA']]);
  t.radio.cur = 2;
  talk(t);
  assert.equal(t.net.contacts.CONDOR, undefined);
  assert.match(t.hints.at(-1), /TEK/);
  program(t, 2, [['keySlot', 1]]);
  talk(t);
  assert.match(t.hints.at(-1), /alcance/);
  program(t, 2, [['power', 'ALTA']]);
  talk(t);
  assert.equal(t.net.contacts.CONDOR, 1);
});

test('SINCGARS, HAVE QUICK y SATCOM', () => {
  const t = setup();
  loginSkl(t);
  powerOn(t, 'LD');
  fill(t, 'BRAVO-TEK-02', 2);
  fill(t, 'SINC-HOP-12', 3);
  fill(t, 'HQ-WOD-NOV', 4);
  fill(t, 'SAT-TEK-07', 5);
  t.radio.setKnob('ON');

  program(t, 3, [['mode', 'SINCGARS'], ['netId', '345'], ['transecSlot', 3], ['crypto', 'CT'], ['keySlot', 2]]);
  t.radio.cur = 3;
  talk(t);
  assert.equal(t.net.contacts.JAGUAR, 1);

  program(t, 4, [['mode', 'HQ'], ['hqNet', '300'], ['transecSlot', 4]]);
  t.radio.cur = 4;
  assert.equal(t.radio.pttDown().ok, false, 'sin TOD no transmite en HQ');
  t.radio.press('PGM'); t.radio.press('DOWN'); t.radio.press('DOWN'); t.radio.press('ENT');
  t.clock.advance(2500);
  assert.equal(t.radio.todValid, true);
  t.radio.press('CLR'); t.radio.press('CLR');
  talk(t);
  assert.equal(t.net.contacts.AGUILA, 1);

  program(t, 5, [['mode', 'SATCOM'], ['satChannel', '25'], ['crypto', 'CT'], ['keySlot', 5]]);
  t.radio.cur = 5;
  talk(t);
  assert.match(t.hints.at(-1), /antena SATCOM/);
  t.conn.antenna = 'SATCOM';
  talk(t);
  assert.equal(t.net.contacts.CENTAURO, 1);
  for (const id of ['sincgars', 'hq', 'satcom']) {
    const res = SIM.evaluateScenario(SIM.SCENARIOS.find((s) => s.id === id), t);
    assert.ok(res.every((c) => c.ok), id + ': ' + JSON.stringify(res));
  }
});

test('zeroize por perilla Z con retorno por resorte, y zeroize del SKL', () => {
  const t = setup();
  loginSkl(t);
  powerOn(t, 'LD');
  fill(t, 'ALFA-TEK-01', 1);
  t.radio.setKnob('ON');
  t.radio.setKnob('Z');
  assert.ok(t.radio.slots.every((s) => !s));
  t.clock.advance(1500);
  assert.equal(t.radio.knob, 'ON');
  t.skl.act('zeroize');
  assert.equal(t.skl.keys.length, 0);
  assert.ok(SIM.evaluateScenario(SIM.SCENARIOS.find((s) => s.id === 'zeroize'), t).every((c) => c.ok));
});

test('SKL: tres PIN erróneos bloquean y retirar el CIK cierra la sesión', () => {
  const t = setup();
  t.skl.powerButton();
  t.clock.advance(2000);
  for (let i = 0; i < 3; i++) { t.skl.act('pinDigit', 9); t.skl.act('pinOk'); }
  assert.equal(t.skl.screen, 'LOCKED');
  t.skl.act('adminUnlock');
  for (const d of SIM.SKL.TRAINING_PIN) t.skl.act('pinDigit', d);
  t.skl.act('pinOk');
  assert.equal(t.skl.loggedIn, true);
  t.conn.cik = false;
  t.skl.cikChanged();
  assert.equal(t.skl.loggedIn, false);
  assert.equal(t.skl.screen, 'CIK');
});

test('serialización de la radio y del SKL', () => {
  const t = setup();
  t.radio.presets[3].freq = 77.125;
  t.radio.slots[0] = { tag: 'X', type: 'TEK', chk: '0000', loadedAt: 0 };
  const t2 = setup();
  t2.radio.load(JSON.parse(JSON.stringify(t.radio.serialize())));
  assert.equal(t2.radio.presets[3].freq, 77.125);
  assert.equal(t2.radio.slots[0].tag, 'X');
  t.skl.keys = t.skl.keys.slice(0, 2);
  t2.skl.load(JSON.parse(JSON.stringify(t.skl.serialize())));
  assert.equal(t2.skl.keys.length, 2);
});
