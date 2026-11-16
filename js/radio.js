/*
 * Modelo de la radio AN/PRC-117F (simulación de entrenamiento).
 *
 * Basado en los procedimientos del manual de operación y del curso de
 * operador (carpeta Manuals/):
 *   - Interruptor de función: OFF, PT, CT, TD, RV, LD, Z-ALL, CLR.
 *   - KDU: teclas numéricas con doble función (1 CALL, 2 LT, 3 MODE, 4 SQ,
 *     5 ZERO, 6 ▲, 7 OPT, 8 PGM, 9 ▼, 0 ⟳), CLR, ENT, ◄ ►, VOL ±, PRE ±.
 *   - 100 presets de red (00-99) LOS / SATCOM / salto de frecuencia
 *     (SINCGARS, HAVEQUICK) y 10 redes DAMA.
 *   - Bancos COMSEC: VINSON, ANDVT y KG-84 (TEK 01-25, KEK, TrKEK),
 *     TSK de satélite y SINCGARS (01-25) y MWOD HAVEQUICK (01-31).
 *   - Menú FILL en LD: FILL DEVICE / CRYPTO TYPE / KEY TYPE / KEY NUMBER.
 *
 * No contiene algoritmos ni material criptográfico real: las claves son
 * etiquetas de entrenamiento.
 */
(function (g) {
  'use strict';
  const SIM = g.SIM;
  const { pad, blink } = SIM;

  const W = 22;
  const SW = ['CLR', 'ZALL', 'OFF', 'PT', 'CT', 'TD', 'RV', 'LD'];
  const SW_LABEL = { CLR: 'CLR', ZALL: 'Z-ALL', OFF: 'OFF', PT: 'PT', CT: 'CT', TD: 'TD', RV: 'RV', LD: 'LD' };
  const POWERS = [1, 1.3, 1.6, 2, 2.5, 3, 4, 5, 6.3, 8, 10, 13, 16, 20];
  const NUM_NETS = 100;
  const NUM_DAMA = 10;
  const NUM_DEST = 50;
  const FILL_DEVICES = ['CYZ-10 DS-101', 'KYK-13', 'CYZ10-RDS', 'KOI-18', 'MX-18290'];
  const CRYPTO_TYPES = ['VINSON', 'ANDVT', 'KG-84', 'SATELLITE', 'HAVEQUICK', 'SINCGARS'];
  const KEY_TYPES = {
    VINSON: ['TEK', 'KEK', 'TRKEK'],
    ANDVT: ['TEK', 'KEK', 'TRKEK'],
    'KG-84': ['TEK', 'KEK', 'TRKEK'],
    SATELLITE: ['TSK', 'TRKEK'],
    HAVEQUICK: ['WOD', 'TRKEK'],
    SINCGARS: ['TSK', 'TRKEK'],
  };
  /** Banco de claves que usa cada modo cripto del preset. */
  const BANK_OF = { VINSON: 'VINSON', 'KYV-5': 'VINSON', FASCINATOR: 'VINSON', ANDVT: 'ANDVT', 'KG-84': 'KG-84' };
  const NET_TYPES = ['LOS FIX FREQUENCY', 'SATCOM', 'FREQUENCY HOPPING'];
  const OP_MODES = ['NORMAL', 'DAMA', 'TEST', 'SCAN', 'BEACON', 'REMOTE CONTROL', 'CLONE'];
  const PRECEDENCE = ['ROUTINE', 'PRIORITY', 'IMMEDIATE', 'FLASH', 'FLASH OVERRIDE', 'EMERGENCY ACTION'];

  const r5 = (v) => Math.round(v * 1e5) / 1e5;
  const f5 = (v) => r5(v).toFixed(5).padStart(9, '0'); // 035.10000

  /**
   * Tabla de códigos de frecuencia SATCOM de ENTRENAMIENTO (ficticia).
   * Como en la radio real: 1-8 y 240-248 no se usan, 9-128 son canales de
   * 25 kHz, 129-239 de 5 kHz y 999 es entrada manual de frecuencias.
   */
  function satCode(c) {
    if (c === 999) return { manual: true };
    if (!Number.isInteger(c) || c < 9 || c > 239) return null;
    const bw = c <= 128 ? 25 : 5;
    const rx = bw === 25 ? 243.5 + (c - 9) * 0.2 : 243.505 + (c - 129) * 0.2;
    return { bw, rx: r5(rx), tx: r5(rx + 48.5) };
  }

  function emptyBanks() {
    const arr = (n) => new Array(n).fill(null);
    return {
      VINSON: { TEK: arr(25), KEK: null, TRKEK: null },
      ANDVT: { TEK: arr(25), KEK: null, TRKEK: null },
      'KG-84': { TEK: arr(25), KEK: null, TRKEK: null },
      SATELLITE: { TSK: arr(25), TRKEK: null },
      SINCGARS: { TSK: arr(25), TRKEK: null },
      HAVEQUICK: { WOD: arr(31), TRKEK: null },
    };
  }

  function defNet(i) {
    return {
      name: 'NET' + i,
      active: i < 10,
      type: 'LOS',
      hop: 'SINCGARS',
      rx: 30,
      tx: 30,
      rxOnly: false,
      code: 999,
      crypto: 'NONE',
      key: 1,
      analog: false,
      frames: 20,
      preamble: 'STANDARD',
      autosw: 'ENABLE',
      mod: 'FM',
      dev: '8.0 KHZ',
      voice: 'MELP',
      opt: '010',
      sq: 'TONE',
      dsq: 'OFF',
      power: 10,
      hopset: 1,
      lne: 'OFF',
      hqNet: '00.000',
    };
  }
  function defDama(i) {
    return { name: 'DAMANET' + i, channel: 1, txCap: 'FULL', ckp: 'NO', cfg: i, ranging: 'ACTIVE', tba: 1, guard: [], ow: 'ON', tskLoc: 1, power: 20 };
  }
  function defCfg(i) {
    return { name: 'DAMACFG' + i, crypto: 'ANDVT', key: 1, frames: 20, voice: 'MELP', code25: '060', code5: '060' };
  }
  function defDest(i) {
    return { name: 'DAMADEST' + i, ac25: [], nb5: 0 };
  }

  /** Potencia máxima/mínima según banda, modulación y tipo de red (curso, LOS (5) y SATCOM (8)). */
  function powerRange(n) {
    if (n.type === 'SAT') return [2, 20];
    if (n.type === 'HOP') return [1, 10];
    const f = n.tx;
    if (f < 90) return [1, 10];
    if (n.mod === 'AM') return [1, f < 400 ? 10 : 4];
    return [1, f < 400 ? 20 : 10];
  }
  function powerOptions(n) {
    const [lo, hi] = powerRange(n);
    return POWERS.filter((p) => p >= lo && p <= hi);
  }
  function cryptoOptions(n) {
    if (n.type === 'LOS') return ['NONE', 'VINSON', 'KG-84', n.rx <= 87.975 ? 'KYV-5' : 'FASCINATOR'];
    if (n.type === 'SAT') {
      const sc = satCode(n.code);
      const bw = sc && !sc.manual ? sc.bw : 25;
      return bw === 5 ? ['NONE', 'ANDVT', 'KG-84'] : ['NONE', 'VINSON', 'ANDVT', 'KG-84', 'FASCINATOR'];
    }
    if (n.hop === 'SINCGARS') return ['NONE', 'VINSON', 'KYV-5'];
    return ['NONE', 'VINSON'];
  }
  /** Ancho de canal SATCOM del preset (5 o 25 kHz). */
  function satBw(n) {
    const sc = satCode(n.code);
    return sc && !sc.manual ? sc.bw : 25;
  }
  function satFreqs(n) {
    const sc = satCode(n.code);
    if (sc && !sc.manual) return { rx: sc.rx, tx: sc.tx };
    return { rx: n.rx, tx: n.tx };
  }
  /** Banda de antena necesaria: J5 (VHF baja) o J8 (VHF alta/UHF). */
  function antennaPort(n) {
    if (n.type === 'SAT') return 'J8';
    if (n.type === 'HOP') return n.hop === 'SINCGARS' ? 'J5' : 'J8';
    return n.rx < 90 ? 'J5' : 'J8';
  }
  /** Distancia útil aproximada (km) en tierra según la potencia en vatios. */
  const rangeKm = (w) => Math.round(5.6 * Math.sqrt(w) * 10) / 10;

  class Radio extends SIM.Device {
    /**
     * env.getConn() -> { j1: 'NONE'|'HANDSET'|'SKL', j5: bool, j8: 'NONE'|'FLEX'|'SATCOM', az, el }
     * env.fillPull(req) -> { ok, key?, reason?, wait? }      (petición de clave al equipo de llenado)
     * env.net -> red simulada (para RSSI, DAMA y TOD por CALL); opcional
     */
    constructor(env) {
      super(env);
      if (!this.env.getConn) this.env.getConn = () => ({ j1: 'HANDSET', j5: true, j8: 'FLEX', az: 0, el: 0 });
      if (!this.env.fillPull) this.env.fillPull = () => ({ ok: false, reason: 'Sin dispositivo de llenado' });
      this.hardReset();
    }

    hardReset() {
      this.clearTimers();
      this.sw = 'OFF';
      this.booted = false;
      this.blackReset = false;
      this.resetBlack();
      this.keys = emptyBanks();
      this.volume = 4;
      this.light = 0;
      this.battery = 100;
      this.todHQ = null;
      this.todSinc = null;
      this.bitResult = null;
      this.lastRssi = null;
      this.mode = 'NORMAL';
      this.dama = null;
      this.screen = { id: 'OFF' };
      this.stack = [];
      this.msg = null;
      this.tx = false;
      this.rx = null;
      this.page = 0;
      this.hazards = 0;
      this.etiMin = 0;
      this.changed();
    }

    /** Datos «negros» (programación) a valores de fábrica. */
    resetBlack() {
      this.nets = Array.from({ length: NUM_NETS }, (_, i) => defNet(i));
      this.damaNets = Array.from({ length: NUM_DAMA }, (_, i) => defDama(i));
      this.damaCfgs = Array.from({ length: NUM_DAMA }, (_, i) => defCfg(i));
      this.damaDests = Array.from({ length: NUM_DEST }, (_, i) => defDest(i));
      this.cur = 0;
      this.damaCur = 0;
    }

    get net() {
      return this.nets[this.cur];
    }
    /** Encendida en PT, CT o TD (operación normal). */
    get operating() {
      return this.booted && ['PT', 'CT', 'TD'].includes(this.sw);
    }
    get secure() {
      return this.sw === 'CT' || this.sw === 'TD';
    }

    flash(text, ms = 2200) {
      const token = {};
      this._msgToken = token;
      this.msg = text;
      this.after(ms, () => {
        if (this._msgToken === token) {
          this.msg = null;
          this.changed();
        }
      });
      this.changed();
    }
    go(screen) {
      if (screen.ctx === undefined && this.screen && this.screen.ctx) screen.ctx = this.screen.ctx;
      this.stack.push(this.screen);
      this.screen = screen;
      if (screen.id === 'WIZ') this.initEdit();
    }
    back() {
      // sin pantallas anteriores se vuelve a la pantalla base de la posición del
      // interruptor: en LD el menú FILL (nunca la pantalla principal), en RV la de RV
      if (!this.stack.length) return this.home();
      this.screen = this.stack.pop();
      if (this.screen.id === 'WIZ') this.initEdit();
    }
    home() {
      this.stack = [];
      this.screen = this.sw === 'LD' ? this.fillMenu() : this.sw === 'RV' ? { id: 'RV' } : { id: 'MAIN' };
      if (this.screen.id === 'WIZ') this.initEdit();
    }

    // ================================================================ interruptor
    setSwitch(pos) {
      if (!SW.includes(pos) || pos === this.sw) return;
      const prev = this.sw;
      this.sw = pos;
      if (pos === 'OFF') return this.powerOff();
      if (pos === 'CLR') {
        // desconecta la HUB: borra programación y COMSEC y apaga
        this.powerOff();
        this.resetBlack();
        this.keys = emptyBanks();
        this.blackReset = true;
        this.emit('zeroize', { all: true, black: true, source: 'CLR' });
        return this.changed();
      }
      if (pos === 'ZALL') {
        this.zeroizeRed('Z-ALL');
        this.stack = [];
        this.screen = { id: 'ZALL' };
        if (!this.booted) this.boot(true);
        return this.changed();
      }
      if (this.battery <= 0) return this.changed();
      if (prev === 'OFF' || prev === 'CLR' || !this.booted) this.boot();
      else {
        if (pos === 'LD' || pos === 'RV') this.mode = 'NORMAL';
        this.dama = null;
        this.home();
        if (this.mode === 'DAMA' && this.operating) this.startDama();
      }
      this.changed();
    }

    powerOff() {
      this.clearTimers();
      this.booted = false;
      this.tx = false;
      this.rx = null;
      this.todHQ = null; // el TOD no se mantiene entre encendidos
      this.todSinc = null;
      this.dama = null;
      this.mode = this.mode === 'DAMA' ? 'DAMA' : 'NORMAL';
      this.screen = { id: 'OFF' };
      this.stack = [];
      this.msg = null;
      this.changed();
    }

    boot(quiet) {
      this.booted = false;
      if (!quiet) {
        this.stack = [];
        this.screen = { id: 'BOOT', step: 0 };
      }
      for (let i = 1; i <= 4; i++) {
        this.after(500 * i, () => {
          if (quiet) {
            if (i === 4) {
              this.booted = true;
              this.changed();
            }
            return;
          }
          if (this.screen.id !== 'BOOT') return;
          this.screen.step = i;
          if (i === 4) {
            this.booted = true;
            if (this.blackReset) {
              this.screen = { id: 'NOTICE', lines: ['WARNING', 'BLACK DATA RESET', '', 'PRESS ANY KEY'], next: () => this.afterBoot() };
            } else this.afterBoot();
          }
          this.changed();
        });
      }
    }
    afterBoot() {
      this.blackReset = false;
      if (this.sw === 'LD' || this.sw === 'RV') this.mode = 'NORMAL';
      this.home();
      if (this.mode === 'DAMA' && this.operating) this.startDama();
    }

    // ================================================================ teclado
    press(key) {
      if (!this.booted || this.sw === 'OFF' || this.sw === 'CLR') return;
      this.emit('beep');
      if (key === 'VOL+' || key === 'VOL-') {
        this.volume = Math.max(0, Math.min(8, this.volume + (key === 'VOL+' ? 1 : -1)));
        return this.flash('VOLUMEN ' + '#'.repeat(this.volume).padEnd(8, '.'), 1500);
      }
      if (this.screen.id === 'ZALL') return this.changed();
      if (this.screen.id === 'NOTICE') {
        const next = this.screen.next;
        this.back();
        if (next) next();
        return this.changed();
      }
      const h = this['key_' + this.screen.id];
      if (h) h.call(this, key);
      this.changed();
    }

    /** Teclas de flecha: el 6 y el 9 hacen de ▲ ▼ fuera de los campos numéricos. */
    static nav(key) {
      if (key === '6') return 'UP';
      if (key === '9') return 'DOWN';
      return key;
    }

    key_MAIN(k) {
      if (k === 'PRE+' || k === 'PRE-') return this.stepPreset(k === 'PRE+' ? 1 : -1);
      switch (k) {
        case '0':
          this.page++;
          return;
        case '1':
          return this.callKey();
        case '2':
          this.light = (this.light + 1) % 4;
          return this.flash('LUZ ' + ['OFF', 'BAJA', 'MEDIA', 'ALTA'][this.light], 1200);
        case '3':
          return this.go(this.wizard('OPERATIONAL MODE', [this.f.choice('OPERATIONAL MODE', () => this.mode, (v) => this.setMode(v), () => OP_MODES)]));
        case '4':
          return this.go(this.wizard('SQ', this.sqFields(this.mode === 'DAMA' ? null : this.net)));
        case '5':
          return this.go(this.wizard('ZEROIZE', [
            this.f.choice('ZEROIZE PROGRAMMING?', () => 'NO', (v) => {
              if (v === 'YES') {
                this.resetBlack();
                this.emit('zeroize', { black: true, source: 'ZERO' });
                this.flash('PROGRAMACION BORRADA');
              }
            }, () => ['NO', 'YES']),
          ]));
        case '7':
          return this.go(this.menuOPT());
        case '8':
          return this.go(this.menuPGM());
        default:
      }
    }

    stepPreset(dir) {
      if (this.mode === 'DAMA') {
        this.damaCur = (this.damaCur + dir + NUM_DAMA) % NUM_DAMA;
        this.startDama();
        return;
      }
      const act = this.nets.map((n, i) => (n.active ? i : -1)).filter((i) => i >= 0);
      if (!act.length) return this.flash('NO HAY PRESETS ACTIVOS');
      let pos = act.indexOf(this.cur);
      if (pos < 0) pos = 0;
      else pos = Math.max(0, Math.min(act.length - 1, pos + dir)); // se detiene en los extremos
      this.cur = act[pos];
      this.page = 0;
      this.rx = null;
    }

    setMode(v) {
      if (v === 'NORMAL') {
        this.mode = 'NORMAL';
        this.dama = null;
      } else if (v === 'DAMA') {
        this.mode = 'DAMA';
        this.after(0, () => this.startDama());
      } else if (v === 'TEST') {
        this.after(0, () => {
          this.go(this.menuTEST());
          this.changed();
        });
      } else {
        this.flash('MODO NO SIMULADO');
      }
      this.page = 0;
    }

    // ================================================================ campos (asistente)
    get f() {
      return {
        choice: (label, get, set, options, fmt) => ({ kind: 'choice', label, get, set, options, fmt }),
        num: (label, tmpl, get, set, validate, extra) => Object.assign({ kind: 'num', label, tmpl, get, set, validate }, extra || {}),
        text: (label, get, set) => ({ kind: 'text', label, get, set }),
        info: (label, lines) => ({ kind: 'info', label, lines }),
      };
    }

    wizard(title, fields, done) {
      return { id: 'WIZ', title, fields, i: 0, ed: null, done };
    }

    curField() {
      const s = this.screen;
      return s.fields[s.i];
    }

    initEdit() {
      const s = this.screen;
      while (s.i < s.fields.length && s.fields[s.i].skip && s.fields[s.i].skip()) s.i++;
      if (s.i >= s.fields.length) return;
      const fd = s.fields[s.i];
      if (fd.kind === 'choice') {
        const opts = fd.options();
        let val = fd.get();
        if (!opts.includes(val)) val = opts[0];
        s.ed = { val, opts };
      } else if (fd.kind === 'num') {
        const str = this.numStr(fd, fd.get());
        s.ed = { chars: str.split(''), orig: str, cur: this.nextDigit(str, -1) };
      } else if (fd.kind === 'text') {
        s.ed = { chars: fd.get().split(''), cur: 0, lastKey: null, taps: 0, started: false };
      } else s.ed = {};
    }

    numStr(fd, v) {
      if (fd.fmt) return fd.fmt(v);
      const digits = fd.tmpl.replace(/[^#]/g, '').length;
      if (fd.tmpl.includes('.')) {
        const dec = fd.tmpl.length - fd.tmpl.indexOf('.') - 1;
        return Number(v).toFixed(dec).padStart(fd.tmpl.length, '0');
      }
      return String(v).padStart(digits, '0');
    }
    nextDigit(str, from) {
      for (let i = from + 1; i < str.length; i++) if (/[0-9]/.test(str[i])) return i;
      return -1;
    }
    prevDigit(str, from) {
      for (let i = from - 1; i >= 0; i--) if (/[0-9]/.test(str[i])) return i;
      return -1;
    }

    key_WIZ(k) {
      const s = this.screen;
      const fd = this.curField();
      if (!fd) return this.back();
      if (k === 'PRE+' || k === 'PRE-') {
        // PRE± sale de la programación y vuelve a la operación
        this.home();
        return;
      }
      const ed = s.ed;
      if (fd.kind === 'choice') {
        const n = Radio.nav(k);
        const i = ed.opts.indexOf(ed.val);
        if (n === 'UP') ed.val = ed.opts[(i + ed.opts.length - 1) % ed.opts.length];
        else if (n === 'DOWN') ed.val = ed.opts[(i + 1) % ed.opts.length];
        else if (k === 'ENT') return this.commit(ed.val);
        else if (k === 'CLR') return this.back();
        return;
      }
      if (fd.kind === 'info') {
        if (k === 'ENT') return this.commit(null);
        if (k === 'CLR') return this.back();
        return;
      }
      if (fd.kind === 'num') {
        const str = ed.chars.join('');
        if (/^[0-9]$/.test(k)) {
          if (ed.cur < 0) return;
          ed.chars[ed.cur] = k;
          const nx = this.nextDigit(ed.chars.join(''), ed.cur);
          if (nx >= 0) ed.cur = nx;
        } else if (k === 'RIGHT') {
          const nx = this.nextDigit(str, ed.cur);
          if (nx >= 0) ed.cur = nx;
        } else if (k === 'LEFT') {
          const pv = this.prevDigit(str, ed.cur);
          if (pv >= 0) ed.cur = pv;
        } else if (k === 'CLR') {
          const first = this.nextDigit(str, -1);
          if (str === ed.orig) return this.back();
          if (ed.cur === first) {
            ed.chars = ed.orig.split('');
          } else {
            ed.chars[ed.cur] = '0';
            ed.cur = this.prevDigit(str, ed.cur);
          }
        } else if (k === 'ENT') {
          const raw = ed.chars.join('');
          const v = fd.parse ? fd.parse(raw) : Number(raw);
          const err = fd.validate ? fd.validate(v) : null;
          if (err) {
            ed.chars = ed.orig.split('');
            ed.cur = this.nextDigit(ed.orig, -1);
            return this.flash(err, 2500);
          }
          return this.commit(v);
        }
        return;
      }
      if (fd.kind === 'text') {
        const MAP = { 1: '1ABC', 2: '2DEF', 3: '3GHI', 4: '4JKL', 5: '5MNO', 6: '6PQR', 7: '7STU', 8: '8VWX', 9: '9YZ', 0: '0' };
        if (/^[0-9]$/.test(k)) {
          if (!ed.started) {
            ed.chars = [];
            ed.started = true;
          }
          if (ed.lastKey === k && ed.chars.length) {
            ed.taps = (ed.taps + 1) % MAP[k].length;
            ed.chars[ed.cur] = MAP[k][ed.taps];
          } else {
            if (ed.lastKey !== null && ed.chars.length) ed.cur = Math.min(ed.cur + 1, 11);
            ed.taps = 0;
            ed.chars[ed.cur] = MAP[k][0];
          }
          ed.lastKey = k;
        } else if (k === 'RIGHT') {
          if (ed.chars.length) ed.cur = Math.min(ed.cur + 1, 11);
          ed.lastKey = null;
        } else if (k === 'LEFT') {
          ed.cur = Math.max(0, ed.cur - 1);
          ed.lastKey = null;
        } else if (k === 'CLR') {
          if (!ed.started) return this.back();
          ed.chars = ed.chars.slice(0, Math.max(0, ed.cur));
          ed.cur = Math.max(0, ed.cur - 1);
          ed.lastKey = null;
        } else if (k === 'ENT') {
          const name = ed.chars.join('').replace(/\s+/g, '').slice(0, 12);
          if (!name) return this.flash('NOMBRE VACIO');
          if (fd.validate) {
            const err = fd.validate(name);
            if (err) return this.flash(err, 2500);
          }
          return this.commit(name);
        }
      }
    }

    commit(v) {
      const s = this.screen;
      const fd = this.curField();
      if (fd.set) {
        const err = fd.set(v);
        if (typeof err === 'string') return this.flash(err, 2500);
      }
      if (this.screen !== s) return; // set() cambió de pantalla
      s.i++;
      while (s.i < s.fields.length && s.fields[s.i].skip && s.fields[s.i].skip()) s.i++;
      if (s.i >= s.fields.length) {
        this.back();
        if (s.done) s.done();
        return;
      }
      this.initEdit();
    }

    // ================================================================ menús «USE < > TO SELECT ITEM»
    menu(title, items, extra) {
      const m = Object.assign({ id: 'MENU', title, items, idx: 0 }, extra || {});
      const named = /^\d+-(.+)$/.exec(title); // «0-DAMANET0»: el nombre se ve abajo a la izquierda
      if (m.ctx === undefined && named) m.ctx = named[1];
      return m;
    }
    key_MENU(k) {
      const s = this.screen;
      const items = typeof s.items === 'function' ? s.items() : s.items;
      if (k === 'RIGHT' || Radio.nav(k) === 'DOWN') s.idx = (s.idx + 1) % items.length;
      else if (k === 'LEFT' || Radio.nav(k) === 'UP') s.idx = (s.idx + items.length - 1) % items.length;
      else if (k === 'CLR') this.back();
      else if (k === 'PRE+' || k === 'PRE-') this.home();
      else if (k === 'ENT') {
        const it = items[s.idx];
        if (it.run) it.run();
        else this.flash('NO SIMULADO');
      }
    }
    notSim() {
      return { label: '', run: () => this.flash('NO SIMULADO') };
    }

    menuPGM() {
      return this.menu('PGM', [
        { label: 'NORM', run: () => this.go(this.menu('NORM', [
          { label: 'NET', run: () => this.go(this.wizard('NET', [this.selectNetField()])) },
          { label: 'GENERAL' },
          { label: 'EXCLBAND' },
        ])) },
        { label: 'DAMA', run: () => this.go(this.menuDAMA()) },
        { label: 'SCAN' },
        { label: 'PORTS' },
        { label: 'SECUR' },
        { label: 'CFIG' },
      ]);
    }

    selectNetField() {
      let sel = this.cur;
      return this.f.num('SELECT NET TO MODIFY', '##', () => sel, (v) => {
        sel = v;
        this.back(); // quita «SELECT NET TO MODIFY»: CLR vuelve al menú NORM
        this.programNet(v); // abre ACTIVATE IN LIST? en el acto
      }, (v) => (v >= 0 && v < NUM_NETS ? null : 'NET 00-99'), { suffix: (v) => `[${this.nets[v] ? this.nets[v].name : ''}]` });
    }

    programNet(i) {
      const n = this.nets[i];
      this.go(Object.assign(this.wizard(`NET ${pad(i)}`, [
        this.f.choice('ACTIVATE IN LIST?', () => (n.active ? 'YES' : 'NO'), (v) => { n.active = v === 'YES'; }, () => ['YES', 'NO']),
        this.f.choice('NET TYPE', () => ({ LOS: 'LOS FIX FREQUENCY', SAT: 'SATCOM', HOP: 'FREQUENCY HOPPING' }[n.type]), (v) => {
          const t = { 'LOS FIX FREQUENCY': 'LOS', SATCOM: 'SAT', 'FREQUENCY HOPPING': 'HOP' }[v];
          if (t !== n.type) this.changeNetType(n, t);
        }, () => NET_TYPES),
        Object.assign(this.f.choice('HOPPING TYPE', () => n.hop, (v) => {
          n.hop = v;
          if (v === 'HAVEQUICK' && n.crypto === 'KYV-5') n.crypto = 'NONE';
          n.power = Math.min(n.power, 10);
        }, () => ['SINCGARS', 'HAVEQUICK']), { skip: () => n.type !== 'HOP' }),
      ], () => this.go(this.menuNet(i))), { ctx: n.name }));
    }

    changeNetType(n, t) {
      n.type = t;
      n.crypto = 'NONE';
      if (t === 'SAT') {
        n.code = 999;
        n.rx = 250;
        n.tx = 300;
        n.dsq = 'OFF';
        n.power = Math.max(2, Math.min(20, n.power));
      } else if (t === 'LOS') {
        n.rx = 30;
        n.tx = 30;
        n.mod = 'FM';
        n.sq = 'TONE';
      }
      const opts = powerOptions(n);
      if (!opts.includes(n.power)) n.power = opts[opts.length - 1];
    }

    menuNet(i) {
      const n = this.nets[i];
      const items = () => {
        if (n.type === 'HOP' && n.hop === 'SINCGARS') {
          return [
            { label: 'HOPSET', run: () => this.go(this.wizard('HOPSET', this.hopsetFields(n))) },
            { label: 'COMSEC', run: () => this.go(this.wizard('COMSEC', this.comsecFields(n))) },
            { label: 'DAT/VOC' },
            { label: 'PWR', run: () => this.go(this.wizard('PWR', this.pwrFields(n))) },
            { label: 'NAME', run: () => this.go(this.wizard('NAME', [this.nameField(n, this.nets)])) },
          ];
        }
        if (n.type === 'HOP') {
          return [
            { label: 'NET', run: () => this.go(this.wizard('NET', this.hqFields(n))) },
            { label: 'COMSEC', run: () => this.go(this.wizard('COMSEC', this.comsecFields(n))) },
            { label: 'PWR', run: () => this.go(this.wizard('PWR', this.pwrFields(n))) },
            { label: 'NAME', run: () => this.go(this.wizard('NAME', [this.nameField(n, this.nets)])) },
          ];
        }
        return [
          { label: 'FREQ', run: () => this.go(this.wizard('FREQ', n.type === 'SAT' ? this.satFreqFields(n) : this.losFreqFields(n))) },
          { label: 'COMSEC', run: () => this.go(this.wizard('COMSEC', this.comsecFields(n))) },
          { label: 'DATA/VOC', run: () => this.go(this.wizard('DATA/VOC', this.dataVocFields(n))) },
          { label: 'SQ', run: () => this.go(this.wizard('SQ', this.sqFields(n))) },
          { label: 'PWR', run: () => this.go(this.wizard('PWR', this.pwrFields(n))) },
          { label: 'NAME', run: () => this.go(this.wizard('NAME', [this.nameField(n, this.nets)])) },
        ];
      };
      return this.menu(`NET ${pad(i)} ${n.name}`, items, { ctx: n.name });
    }

    freqField(label, get, set, lo, hi) {
      return this.f.num(label, '###.#####', get, set, (v) => (v >= lo && v <= hi ? null : 'FREC FUERA DE RANGO'), { unit: 'MHZ' });
    }

    losFreqFields(n) {
      return [
        this.freqField('RECEIVE FREQUENCY', () => n.rx, (v) => {
          n.rx = r5(v);
          if (n.rx < 90) n.mod = 'FM';
          if (n.crypto === 'KYV-5' && n.rx > 87.975) n.crypto = 'NONE';
          if (n.crypto === 'FASCINATOR' && n.rx < 90) n.crypto = 'NONE';
        }, 30, 511.99999),
        this.freqField('TRANSMIT FREQUENCY', () => n.tx, (v) => {
          n.tx = r5(v);
          const opts = powerOptions(n);
          if (!opts.includes(n.power)) n.power = opts[opts.length - 1];
        }, 30, 511.99999),
        this.f.choice('RECEIVE ONLY?', () => (n.rxOnly ? 'YES' : 'NO'), (v) => { n.rxOnly = v === 'YES'; }, () => ['NO', 'YES']),
      ];
    }

    satFreqFields(n) {
      return [
        this.f.num('FREQ CODE', '###', () => n.code, (v) => {
          n.code = v;
          const sc = satCode(v);
          if (!sc.manual) {
            n.rx = sc.rx;
            n.tx = sc.tx;
          }
          if (!cryptoOptions(n).includes(n.crypto)) n.crypto = 'NONE';
        }, (v) => (satCode(v) ? null : 'CODIGO NO VALIDO'), {
          suffix: (v) => {
            const sc = satCode(v);
            return !sc ? '' : sc.manual ? 'MANUAL' : `${sc.bw}KHZ`;
          },
        }),
        Object.assign(this.freqField('RECEIVE FREQUENCY', () => n.rx, (v) => { n.rx = r5(v); }, 225, 511.99999), { skip: () => n.code !== 999 }),
        Object.assign(this.freqField('TRANSMIT FREQUENCY', () => n.tx, (v) => { n.tx = r5(v); }, 225, 511.99999), { skip: () => n.code !== 999 }),
        this.f.choice('RECEIVE ONLY?', () => (n.rxOnly ? 'YES' : 'NO'), (v) => { n.rxOnly = v === 'YES'; }, () => ['NO', 'YES']),
      ];
    }

    comsecFields(n) {
      const isA = () => n.crypto === 'ANDVT';
      const none = () => n.crypto === 'NONE';
      return [
        this.f.choice('CRYPTO MODE', () => n.crypto, (v) => {
          n.crypto = v;
          if (v === 'VINSON' || v === 'KYV-5' || v === 'FASCINATOR') n.mod = 'FM';
          if (n.type === 'SAT') n.opt = v === 'VINSON' ? '132' : v === 'ANDVT' ? '010' : n.opt;
        }, () => cryptoOptions(n)),
        Object.assign(this.f.num('ENCRYPTION KEY', '##', () => n.key, (v) => { n.key = v; }, (v) => (v >= 1 && v <= 25 ? null : 'TEK 01-25'), {
          prefix: 'TEK ',
          suffix: (v) => {
            const k = this.keys[BANK_OF[n.crypto]] && this.keys[BANK_OF[n.crypto]].TEK[v - 1];
            return k ? 'CARGADA' : 'VACIA';
          },
        }), { skip: none }),
        Object.assign(this.f.choice('ANALOG DATA', () => (n.analog ? 'YES' : 'NO'), (v) => { n.analog = v === 'YES'; }, () => ['NO', 'YES']), { skip: () => !['VINSON', 'KYV-5', 'FASCINATOR'].includes(n.crypto) }),
        Object.assign(this.f.choice('TRAINING FRAMES', () => String(n.frames), (v) => { n.frames = Number(v); }, () => ['6', '9', '12', '15', '20', '30', '60']), { skip: () => !isA() }),
        Object.assign(this.f.choice('ANDVT PREAMBLE', () => n.preamble, (v) => { n.preamble = v; }, () => ['STANDARD', 'ENHANCED']), { skip: () => !isA() }),
        Object.assign(this.f.choice('VOICE AUTOSWITCH', () => n.autosw, (v) => { n.autosw = v; }, () => ['ENABLE', 'DISABLE']), { skip: () => !isA() }),
      ];
    }

    dataVocFields(n) {
      if (n.type === 'SAT') {
        return [
          Object.assign(this.f.choice('VOICE MODE', () => n.voice, (v) => { n.voice = v; }, () => ['MELP', 'LPC']), { skip: () => n.crypto !== 'ANDVT' }),
          Object.assign(this.f.choice('OPTION CODE', () => n.opt, (v) => { n.opt = v; }, () => ['010', 'A10', 'B10', 'C10']), { skip: () => n.crypto !== 'ANDVT' }),
          Object.assign(this.f.info('OPTION CODE', ['132 (FIJO VINSON)']), { skip: () => n.crypto !== 'VINSON' }),
          this.f.choice('DATA/VOICE', () => 'AUTO ON ADF PORT', () => null, () => ['AUTO ON ADF PORT', 'AUTO ON DATA PORT']),
        ];
      }
      return [
        this.f.choice('DATA/VOICE', () => 'AUTO ON ADF PORT', () => null, () => ['AUTO ON ADF PORT', 'AUTO ON DATA PORT']),
        this.f.choice('MODULATION', () => n.mod, (v) => {
          n.mod = v;
          if (v === 'AM') n.sq = 'NOISE';
          const opts = powerOptions(n);
          if (!opts.includes(n.power)) n.power = opts[opts.length - 1];
        }, () => (n.rx < 90 || ['VINSON', 'KYV-5', 'FASCINATOR'].includes(n.crypto) ? ['FM'] : ['FM', 'AM'])),
        Object.assign(this.f.choice('FM DEVIATION', () => n.dev, (v) => { n.dev = v; }, () => ['8.0 KHZ', '6.5 KHZ', '5.0 KHZ']), { skip: () => n.mod !== 'FM' }),
      ];
    }

    sqFields(n) {
      if (!n) return [this.f.info('SQUELCH', ['DAMA: SQUELCH DIGITAL'])];
      if (n.type === 'SAT') {
        return [this.f.choice('DIGITAL SQUELCH (CT)', () => n.dsq, (v) => { n.dsq = v; }, () => ['OFF', 'ON'])];
      }
      return [this.f.choice('ANALOG SQUELCH', () => n.sq, (v) => { n.sq = v; }, () => (n.mod === 'AM' ? ['NOISE', 'OFF'] : ['TONE', 'NOISE', 'OFF']))];
    }

    pwrFields(n) {
      return [this.f.choice('TX POWER LEVEL', () => n.power, (v) => { n.power = v; }, () => powerOptions(n), (v) => `${v} WATTS`)];
    }

    nameField(obj, list) {
      return this.f.text('CHANGE NAME', () => obj.name, (v) => {
        if (list.some((o) => o !== obj && o.name === v)) return 'NOMBRE REPETIDO';
        obj.name = v;
        return null;
      });
    }

    hopsetFields(n) {
      return [
        this.f.num('HOPSET COMPARTMENT', '##', () => n.hopset, (v) => { n.hopset = v; }, (v) => (v >= 1 && v <= 25 ? null : 'COMPARTIMENTO 01-25'), {
          suffix: (v) => {
            const t = this.keys.SINCGARS.TSK[v - 1];
            return t ? `[F${pad(t.netId, 3)}]` : '[EMPTY]';
          },
        }),
        this.f.choice('LATE NET ENTRY', () => n.lne, (v) => { n.lne = v; }, () => ['OFF', 'ON']),
        this.f.choice('RECEIVE ONLY', () => (n.rxOnly ? 'YES' : 'NO'), (v) => { n.rxOnly = v === 'YES'; }, () => ['NO', 'YES']),
      ];
    }

    hqFields(n) {
      return [
        this.f.num('NET NUMBER', '##.###', () => n.hqNet, (v) => { n.hqNet = v; }, (v) => {
          const x = Number(v);
          return Number.isFinite(x) && Math.abs(x * 1000 - Math.round(x * 1000)) < 1e-6 && Math.round(x * 1000) % 25 === 0 ? null : 'NET NUMBER: PASOS .025';
        }, { fmt: (v) => String(v), parse: (raw) => raw }),
      ];
    }

    menuOPT() {
      const n = this.net;
      // Orden de la pantalla del manual: COMSEC POWER RETRANS / TIME GPS SAVE
      return this.menu('OPT', [
        { label: 'COMSEC', run: () => (this.mode === 'DAMA' ? this.flash('USE PGM DAMA') : this.go(this.wizard('COMSEC', this.comsecFields(n)))) },
        { label: 'POWER', run: () => (this.mode === 'DAMA' ? this.flash('USE PGM DAMA') : this.go(this.wizard('POWER', this.pwrFields(n)))) },
        { label: 'RETRANS' },
        { label: 'TIME', run: () => this.go(this.menu('TIME', [
          { label: 'SINCGARS', run: () => this.go(this.todWizard('SINCGARS')) },
          { label: 'HAVE_QUICK', run: () => this.go(this.todWizard('HAVE_QUICK')) },
          { label: 'HPW' },
        ])) },
        { label: 'GPS' },
        { label: 'SAVE' },
      ], { ctx: this.mode === 'DAMA' ? '' : n.name });
    }

    todWizard(kind) {
      return this.wizard(kind, [
        this.f.choice('SOURCE', () => 'USER ENTRY', (v) => {
          if (v === 'GPS_SYNC') return 'SIN GPS EN J2';
          return null;
        }, () => ['USER ENTRY', 'GPS_SYNC']),
        this.f.info('TIME OF DAY (UTC)', [SIM.utcStamp(this.env.now()), 'ENT = ACEPTAR']),
      ], () => {
        if (kind === 'SINCGARS') this.todSinc = this.env.now();
        else this.todHQ = this.env.now();
        this.emit('tod', { kind });
        this.flash(`TOD ${kind === 'SINCGARS' ? 'SINC' : 'HQ'} ESTABLECIDO`);
      });
    }

    menuTEST() {
      return this.menu('TEST', [
        { label: 'TEST', run: () => this.startBit() },
        { label: 'BATTERY', run: () => this.go({ id: 'INFO', lines: ['BATTERY', `VOLT: ${(24 + this.battery * 0.08).toFixed(1)}V NOMINAL`, 'LI-ION (BB-2590)', 'HUB: 3.6V OK'] }) },
        { label: 'VERSIONS', run: () => this.go({ id: 'INFO', lines: ['VERSIONS', 'FIRMWARE SIM 1.0', 'OVM ENTRENAMIENTO', 'SERIAL SIM-0117'] }) },
        { label: 'ETI', run: () => this.go({ id: 'INFO', lines: ['ETI', `POWER ON ${pad(Math.floor(this.etiMin / 60), 4)}:${pad(this.etiMin % 60)}`, '', ''] }) },
      ]);
    }

    startBit() {
      this.go({ id: 'BIT', done: false });
      const screen = this.screen;
      this.after(3000, () => {
        const pass = this.battery > 10;
        this.bitResult = { pass, at: this.env.now() };
        screen.done = true;
        this.emit('bit', this.bitResult);
        this.changed();
      });
    }
    key_BIT(k) {
      if (this.screen.done && (k === 'CLR' || k === 'ENT')) this.back();
    }
    key_INFO(k) {
      if (k === 'CLR' || k === 'ENT') this.back();
    }
    key_RV(k) {
      return k;
    }

    // ================================================================ DAMA
    menuDAMA() {
      return this.menu('DAMA', [
        { label: 'PRESETS', run: () => this.go(this.menu('PRESETS', [
          { label: 'NETS', run: () => this.go(this.wizard('NETS', [this.selectIdxField('SELECT NET TO MODIFY', '#', NUM_DAMA, this.damaNets, (i) => this.go(this.menuDamaNet(i)))])) },
          { label: 'PORT_CONFIGS', run: () => this.go(this.wizard('PORT_CONFIGS', [this.selectIdxField('SELECT PORT CONFIG', '#', NUM_DAMA, this.damaCfgs, (i) => this.go(this.menuDamaCfg(i)))])) },
          { label: 'DESTINATIONS', run: () => this.go(this.wizard('DESTINATIONS', [this.selectIdxField('SELECT DESTINATION', '##', NUM_DEST, this.damaDests, (i) => this.go(this.menuDamaDest(i)))])) },
        ])) },
        { label: 'DEFAULT' },
      ]);
    }

    selectIdxField(label, tmpl, max, list, open) {
      return this.f.num(label, tmpl, () => 0, (v) => {
        this.back();
        open(v);
      }, (v) => (v >= 0 && v < max ? null : 'FUERA DE RANGO'), { suffix: (v) => (list[v] ? `[${list[v].name}]` : '') });
    }

    menuDamaNet(i) {
      const d = this.damaNets[i];
      return this.menu(`${i}-${d.name}`, [
        { label: 'CHANNEL', run: () => this.go(this.wizard('CHANNEL', [
          this.f.num('CHANNEL NUMBER', '###', () => d.channel, (v) => { d.channel = v; }, (v) => (v >= 1 && v <= 249 ? null : 'CANAL 1-249'), {
            suffix: (v) => {
              const sc = satCode(v);
              return sc && !sc.manual ? `${sc.bw}KHZ` : '';
            },
          }),
          this.f.choice('TRANSMIT CAPABILITY', () => d.txCap, (v) => { d.txCap = v; }, () => ['FULL', 'EMCON']),
          this.f.choice('CONSTANT KEY PORT?', () => d.ckp, (v) => { d.ckp = v; }, () => ['NO', 'YES']),
          this.f.num('DEFAULT CONFIG', '#', () => d.cfg, (v) => { d.cfg = v; }, (v) => (v >= 0 && v <= 9 ? null : 'CONFIG 0-9'), { suffix: (v) => `[${this.damaCfgs[v].name}]` }),
        ])) },
        { label: 'RANGING', run: () => this.go(this.wizard('RANGING', [this.f.choice('RANGING METHOD', () => d.ranging, (v) => { d.ranging = v; }, () => ['ACTIVE', 'FIXED'])])) },
        { label: 'ADDR', run: () => this.go(this.menu('ADDR', [
          { label: 'BASE_ADDRESS', run: () => this.go(this.wizard('BASE_ADDRESS', [this.f.num('BASE ADDRESS', '#####', () => d.tba, (v) => { d.tba = v; }, (v) => (v >= 1 && v <= 49999 ? null : 'TBA 00001-49999'))])) },
          { label: 'GUARD_LIST', run: () => this.go(this.menu('GUARD LIST', [
            { label: 'ADD', run: () => this.go(this.wizard('GUARD LIST', [this.f.num('ADDRESS TO ADD', '#####', () => 50000, (v) => {
              if (d.guard.includes(v)) return 'YA EN LA LISTA';
              if (d.guard.length >= 15) return 'LISTA LLENA (15)';
              d.guard.push(v);
              return null;
            }, (v) => (v >= 50000 && v <= 65535 ? null : 'RED 50000-65535'))])) },
            { label: 'REVIEW', run: () => this.go({ id: 'INFO', lines: ['GUARD LIST', ...(d.guard.length ? d.guard.slice(0, 3).map((a) => pad(a, 5)) : ['(VACIA)'])] }) },
            { label: 'DELETE', run: () => {
              if (!d.guard.length) return this.flash('LISTA VACIA');
              const a = d.guard.pop();
              this.flash(`BORRADA ${pad(a, 5)}`);
            } },
          ])) },
        ])) },
        { label: 'TRANSEC', run: () => this.go(this.wizard('TRANSEC', [
          this.f.choice('ORDERWIRE ENCRYPTION', () => d.ow, (v) => { d.ow = v; }, () => ['ON', 'OFF']),
          Object.assign(this.f.num('KEY LOCATION 0-3', '##', () => d.tskLoc, (v) => { d.tskLoc = v; }, (v) => (v >= 1 && v <= 25 ? null : 'TSK 01-25'), {
            prefix: 'TSK ',
            suffix: (v) => (this.keys.SATELLITE.TSK[v - 1] ? 'CARGADA' : 'VACIA'),
          }), { skip: () => d.ow !== 'ON' }),
          Object.assign(this.f.choice('KEY LOCATION 4-7', () => 'NONE', () => null, () => ['NONE']), { skip: () => d.ow !== 'ON' }),
        ])) },
        { label: 'POWER', run: () => this.go(this.wizard('POWER', [this.f.choice('TX POWER LEVEL', () => d.power, (v) => { d.power = v; }, () => POWERS, (v) => `${v} WATTS`)])) },
        { label: 'NAME', run: () => this.go(this.wizard('NAME', [this.nameField(d, this.damaNets)])) },
      ]);
    }

    menuDamaCfg(i) {
      const c = this.damaCfgs[i];
      return this.menu(`${i}-${c.name}`, [
        { label: 'COMSEC', run: () => this.go(this.wizard('COMSEC', [
          this.f.choice('CRYPTO MODE', () => c.crypto, (v) => { c.crypto = v; }, () => ['NONE', 'VINSON', 'ANDVT', 'KG-84']),
          Object.assign(this.f.num('ENCRYPTION KEY', '##', () => c.key, (v) => { c.key = v; }, (v) => (v >= 1 && v <= 25 ? null : 'TEK 01-25'), {
            prefix: 'TEK ',
            suffix: (v) => (this.keys[BANK_OF[c.crypto]] && this.keys[BANK_OF[c.crypto]].TEK[v - 1] ? 'CARGADA' : 'VACIA'),
          }), { skip: () => c.crypto === 'NONE' }),
          Object.assign(this.f.choice('TRAINING FRAMES', () => String(c.frames), (v) => { c.frames = Number(v); }, () => ['6', '9', '12', '15', '20', '30', '60']), { skip: () => c.crypto !== 'ANDVT' }),
        ])) },
        { label: 'DATA/VOICE', run: () => this.go(this.wizard('DATA/VOICE', [this.f.choice('VOICE MODE', () => c.voice, (v) => { c.voice = v; }, () => ['MELP', 'LPC'])])) },
        { label: 'CONFIG_CODE', run: () => this.go(this.wizard('CONFIG_CODE', [
          this.f.num('25KHZ PORT CFG CODE', '###', () => c.code25, (v) => { c.code25 = v; }, null, { fmt: (v) => String(v).padStart(3, '0'), parse: (r) => r }),
          this.f.num('5KHZ PORT CFG CODE', '###', () => c.code5, (v) => { c.code5 = v; }, null, { fmt: (v) => String(v).padStart(3, '0'), parse: (r) => r }),
        ])) },
        { label: 'NAME', run: () => this.go(this.wizard('NAME', [this.nameField(c, this.damaCfgs)])) },
      ]);
    }

    menuDamaDest(i) {
      const d = this.damaDests[i];
      return this.menu(`${pad(i)}-${d.name}`, [
        { label: '5KHZ', run: () => this.go(this.wizard('5KHZ', [this.f.num('DESTINATION', '#####', () => d.nb5, (v) => { d.nb5 = v; }, (v) => (v >= 0 && v <= 65535 ? null : '00000-65535'))])) },
        { label: '25K_AC', run: () => this.go(this.menu('25K_AC', [
          { label: 'ADD', run: () => this.go(this.wizard('25K_AC', [this.f.num('DESTINATION TO ADD', '#####', () => 0, (v) => {
            if (d.ac25.length >= 5) return 'MAX 5 DESTINOS';
            if (!d.ac25.includes(v)) d.ac25.push(v);
            return null;
          }, (v) => (v >= 1 && v <= 65535 ? null : '00001-65535'))])) },
          { label: 'REVIEW', run: () => this.go({ id: 'INFO', lines: ['25K_AC', ...(d.ac25.length ? d.ac25.slice(0, 3).map((a) => pad(a, 5)) : ['(VACIA)'])] }) },
          { label: 'DELETE', run: () => (d.ac25.length ? this.flash(`BORRADA ${pad(d.ac25.pop(), 5)}`) : this.flash('LISTA VACIA')) },
        ])) },
        { label: '25K_DC' },
        { label: 'SEARCH' },
        { label: 'NAME', run: () => this.go(this.wizard('NAME', [this.nameField(d, this.damaDests)])) },
        { label: 'CLEAR', run: () => this.go(this.wizard('CLEAR', [this.f.choice('ARE YOU SURE?', () => 'NO', (v) => {
          if (v === 'YES') Object.assign(d, defDest(i));
        }, () => ['NO', 'YES'])])) },
      ]);
    }

    /** Entra en modo DAMA con la red DAMA actual y arranca la secuencia de conexión. */
    startDama() {
      if (!this.operating) return;
      const d = this.damaNets[this.damaCur];
      const token = {};
      this.dama = { token, status: 'CONFIG', service: 'IDLE', err: null, call: null };
      this.home();
      const step = (ms, fn) => this.after(ms, () => {
        if (!this.dama || this.dama.token !== token || this.mode !== 'DAMA') return;
        fn();
        this.changed();
      });
      step(1200, () => {
        if (d.ow === 'ON' && !this.keys.SATELLITE.TSK[d.tskLoc - 1]) {
          this.dama.status = 'ERROR';
          this.dama.err = 'NO ORDERWIRE KEYS';
          this.go({ id: 'NOTICE', lines: ['CONFIGURING DAMA', 'NO ORDERWIRE KEYS', 'LOADED', 'PRESS ANY KEY'] });
          return;
        }
        this.dama.status = 'ACQUIRING';
        const tryAcq = () => {
          const net = this.env.net;
          const r = net ? net.damaAcquire(this.damaSnapshot()) : { ok: false };
          if (!r.ok) {
            this.dama.why = r.reason;
            step(2000, tryAcq);
            return;
          }
          this.dama.why = null;
          if (d.ranging === 'ACTIVE') this.dama.status = 'RANGING';
          step(d.ranging === 'ACTIVE' ? 2500 : 200, () => {
            this.dama.status = 'LOGGING IN';
            step(1500, () => {
              const lg = net.damaLogin(this.damaSnapshot());
              if (!lg.ok) {
                this.dama.status = 'ERROR';
                this.dama.err = lg.code;
                this.emit('dama', { ok: false, code: lg.code, reason: lg.reason });
                return;
              }
              this.dama.status = 'CONNECTED';
              this.dama.service = 'IDLE';
              this.emit('dama', { ok: true, status: 'CONNECTED' });
            });
          });
        };
        tryAcq();
      });
    }

    damaSnapshot() {
      const d = this.damaNets[this.damaCur];
      const c = this.damaCfgs[d.cfg];
      const tek = c.crypto !== 'NONE' && BANK_OF[c.crypto] ? this.keys[BANK_OF[c.crypto]].TEK[c.key - 1] : null;
      const tsk = this.keys.SATELLITE.TSK[d.tskLoc - 1];
      return {
        net: Object.assign({}, d, { guard: d.guard.slice() }),
        cfg: Object.assign({}, c),
        keyTag: tek ? tek.tag : null,
        tskTag: d.ow === 'ON' && tsk ? tsk.tag : null,
        conn: Object.assign({}, this.env.getConn()),
        secure: this.secure,
        powerW: d.power,
        call: this.dama ? this.dama.call : null,
      };
    }

    callKey() {
      if (this.mode === 'DAMA') {
        if (!this.dama || this.dama.status !== 'CONNECTED') return this.flash('DAMA NO CONECTADO');
        const call = { type: 'PLACE A CALL', dest: 0, prec: 'ROUTINE', dur: 0 };
        const disc = () => call.type !== 'PLACE A CALL';
        return this.go(this.wizard('CALL', [
          this.f.choice('SELECT REQUEST TYPE', () => call.type, (v) => { call.type = v; }, () => ['PLACE A CALL', 'DISCONNECT CALL']),
          Object.assign(this.f.num('SELECT A DESTINATION', '##', () => 0, (v) => { call.dest = v; }, (v) => (v >= 0 && v < NUM_DEST ? null : 'DESTINO 00-49'), {
            suffix: (v) => (this.damaDests[v] ? `[${this.damaDests[v].name}]` : ''),
          }), { skip: disc }),
          Object.assign(this.f.choice('PRECEDENCE', () => call.prec, (v) => { call.prec = v; }, () => PRECEDENCE), { skip: disc }),
          Object.assign(this.f.num('DURATION', '####', () => 0, (v) => { call.dur = v; }, null), { skip: disc }),
        ], () => {
          if (call.type === 'PLACE A CALL') return this.placeDamaCall(call);
          this.dama.call = null;
          this.dama.service = 'IDLE';
          this.emit('dama', { ok: true, status: 'IDLE' });
          this.flash('LLAMADA TERMINADA');
        }));
      }
      const n = this.net;
      if (n.type === 'SAT') {
        return this.go({ id: 'RSSI', stage: 0 });
      }
      if (n.type === 'HOP' && n.hop === 'HAVEQUICK') {
        return this.go(this.wizard('CALL', [this.f.choice('TOD SYNC', () => 'RECEIVE', (v) => {
          if (v === 'TRANSMIT') return 'TOD NO DISPONIBLE';
          this.after(0, () => this.todReceive());
          return null;
        }, () => ['RECEIVE', 'TRANSMIT'])]));
      }
      return this.flash('CALL: SIN FUNCION EN LOS');
    }

    placeDamaCall(call) {
      this.home();
      const dest = this.damaDests[call.dest];
      this.dama.service = 'PENDING';
      this.changed();
      this.after(2000, () => {
        if (!this.dama) return;
        const r = this.env.net ? this.env.net.damaCall(this.damaSnapshot(), { dest, prec: call.prec }) : { ok: false, code: 82 };
        if (!r.ok) {
          this.dama.service = 'IDLE';
          this.flash(`ERROR ${r.code}`, 4000);
          this.emit('dama', { ok: false, code: r.code, reason: r.reason });
        } else {
          this.dama.service = 'ACTIVE';
          this.dama.call = { dest: dest.ac25.slice(), prec: call.prec, name: dest.name };
          this.emit('dama', { ok: true, status: 'ACTIVE', dest: dest.ac25.slice() });
        }
        this.changed();
      });
    }

    key_RSSI(k) {
      const s = this.screen;
      if (k === 'CLR') return this.back();
      if (k !== 'ENT') return;
      if (s.stage === 0) {
        const n = this.net;
        if (n.crypto !== 'ANDVT' && n.crypto !== 'KG-84') return this.flash('RSSI REQUIERE ANDVT/KG-84', 3000);
        s.stage = 1;
        this.after(2500, () => {
          const score = this.env.net ? this.env.net.rssi(this.linkSnapshot()) : 0;
          s.stage = 2;
          s.score = score;
          this.lastRssi = { score, code: this.net.code, at: this.env.now() };
          this.emit('rssi', this.lastRssi);
          this.changed();
        });
      } else if (s.stage === 2) {
        s.stage = 0;
      }
    }

    todReceive() {
      this.go({ id: 'TODRX', done: false });
      const screen = this.screen;
      this.after(3500, () => {
        const ok = this.env.net ? this.env.net.todAvailable(this.linkSnapshot()) : false;
        screen.done = true;
        screen.ok = ok;
        if (ok) {
          this.todHQ = this.env.now();
          this.emit('tod', { kind: 'HAVE_QUICK', via: 'CALL' });
        }
        this.changed();
      });
    }
    key_TODRX(k) {
      if (this.screen.done && (k === 'CLR' || k === 'ENT')) this.back();
    }

    // ================================================================ LD: carga de claves
    fillMenu() {
      // MORE FILL DATA? YES conserva la última selección (dispositivo, cripto, tipo y número)
      const req = Object.assign({ device: 'KYK-13', crypto: 'VINSON', keyType: 'TEK', num: 1 }, this.lastFill || {});
      this.fillReq = req;
      const numMax = () => (req.keyType === 'WOD' ? 31 : 25);
      const noNum = () => req.device === 'CYZ10-RDS' || req.keyType === 'KEK' || req.keyType === 'TRKEK';
      return this.wizard('FILL MENU', [
        this.f.choice('FILL DEVICE', () => req.device, (v) => {
          if (v === 'KOI-18' || v === 'MX-18290') return 'DISPOSITIVO NO SIMULADO';
          req.device = v;
          return null;
        }, () => FILL_DEVICES),
        Object.assign(this.f.choice('CRYPTO TYPE', () => req.crypto, (v) => {
          req.crypto = v;
          if (!KEY_TYPES[v].includes(req.keyType)) req.keyType = KEY_TYPES[v][0];
        }, () => CRYPTO_TYPES), { skip: () => req.device === 'CYZ10-RDS' }),
        Object.assign(this.f.choice('SELECT KEY TYPE', () => req.keyType, (v) => { req.keyType = v; }, () => KEY_TYPES[req.crypto]), { skip: () => req.device === 'CYZ10-RDS' }),
        Object.assign(this.f.num('KEY NUMBER', '##', () => req.num, (v) => { req.num = v; }, (v) => (v >= 1 && v <= numMax() ? null : `KEY 01-${numMax()}`), {
          suffix: () => (req.keyType === 'WOD' ? '(DIA)' : ''),
        }), { skip: noNum }),
      ], () => {
        this.lastFill = Object.assign({}, req);
        this.go({ id: 'FILL', stage: 'READY', req: Object.assign({}, req) });
      });
    }

    fillLabel(req) {
      if (req.device === 'CYZ10-RDS') return 'CYZ10-RDS';
      const dev = req.device === 'KYK-13' ? 'KYK13' : 'DS101';
      const num = req.keyType === 'KEK' || req.keyType === 'TRKEK' ? '' : ' ' + pad(req.num);
      return `${dev} ${req.crypto} ${req.keyType}${num}`;
    }

    key_FILL(k) {
      const s = this.screen;
      if (s.stage === 'READY') {
        if (k === 'ENT') return this.fillStart();
        if (k === 'CLR') return this.home();
        return;
      }
      if (s.stage === 'DONE' || s.stage === 'BAD') {
        s.stage = 'MORE';
        s.more = 'YES';
        return;
      }
      if (s.stage === 'MORE') {
        const n = Radio.nav(k);
        if (n === 'UP' || n === 'DOWN') s.more = s.more === 'YES' ? 'NO' : 'YES';
        else if (k === 'ENT') {
          if (s.more === 'YES') this.home();
          else s.stage = 'CHANGE';
        }
      }
    }

    fillStart() {
      const s = this.screen;
      s.stage = 'PROGRESS';
      const req = s.req;
      if (req.device === 'CYZ10-RDS') {
        s.waitUntil = this.env.now() + 60000;
        this.after(60000, () => {
          if (this.screen === s && s.stage === 'PROGRESS') {
            s.stage = 'BAD';
            this.emit('fill', { ok: false, req, reason: 'No se recibió el loadset (tiempo agotado)' });
            this.changed();
          }
        });
        return;
      }
      let tries = 0;
      const attempt = () => {
        if (this.screen !== s || s.stage !== 'PROGRESS') return;
        const r = this.env.fillPull(Object.assign({}, req));
        if (r.ok) {
          const okStore = this.storeKey(req, r.key, r.protocol);
          s.stage = okStore === true ? 'DONE' : 'BAD';
          this.emit('fill', { ok: okStore === true, req, key: r.key, protocol: r.protocol, reason: okStore === true ? null : okStore });
          return this.changed();
        }
        tries++;
        if (!r.wait || tries > 60) {
          s.stage = 'BAD';
          this.emit('fill', { ok: false, req, reason: r.reason || 'Sin respuesta del dispositivo de llenado' });
          return this.changed();
        }
        this.after(500, attempt);
      };
      this.after(1200, attempt);
    }

    /** Guarda la clave en el banco/tipo/número elegido en la radio. Devuelve true o motivo de error. */
    storeKey(req, key, protocol) {
      // DS-101 transporta el tipo de clave: la radio rechaza un tipo distinto del seleccionado
      const bankOk = key.bank === req.crypto || (key.bank === 'SATCOM' && ['VINSON', 'ANDVT', 'KG-84'].includes(req.crypto));
      if (protocol === 'DS-101' && (!bankOk || key.type !== req.keyType)) {
        return `DS-101: la clave es ${key.bank} ${key.type} y la radio esperaba ${req.crypto} ${req.keyType}`;
      }
      const rec = { tag: key.tag, src: 'SKL', proto: protocol, at: this.env.now() };
      const bank = this.keys[req.crypto];
      if (req.keyType === 'KEK' || req.keyType === 'TRKEK') bank[req.keyType] = rec;
      else bank[req.keyType][req.num - 1] = rec;
      return true;
    }

    /** Recepción de un loadset SINCGARS por ICOM (SKL, pestaña Plats). */
    receiveLoadset(ls, includeTime) {
      const s = this.screen;
      if (!this.booted || this.sw !== 'LD') return { ok: false, reason: 'La radio no está en LD' };
      if (s.id !== 'FILL' || s.req.device !== 'CYZ10-RDS' || s.stage !== 'PROGRESS') {
        return { ok: false, reason: 'La radio no está esperando un loadset (FILL DEVICE: CYZ10-RDS, ENT, «FILL IN PROGRESS»)' };
      }
      s.stage = 'STORE';
      this.after(3000, () => {
        // TEK #1-#5 -> VINSON TEK 21-25, KEK #6 -> VINSON KEK, hopsets -> SINCGARS TSK 20-25
        ls.teks.forEach((t, i) => { this.keys.VINSON.TEK[20 + i] = { tag: t, src: 'SKL', proto: 'DS-102', at: this.env.now() }; });
        if (ls.kek) this.keys.VINSON.KEK = { tag: ls.kek, src: 'SKL', proto: 'DS-102', at: this.env.now() };
        ls.hopsets.forEach((h, i) => { this.keys.SINCGARS.TSK[19 + i] = { tag: h.tag, netId: h.netId, src: 'SKL', proto: 'DS-102', at: this.env.now() }; });
        if (includeTime) this.todSinc = this.env.now();
        s.stage = 'DONE';
        this.emit('fill', { ok: true, loadset: ls.name, req: s.req });
        this.changed();
      });
      this.changed();
      return { ok: true };
    }

    /** Borrado de datos rojos (COMSEC y TRANSEC). */
    zeroizeRed(source) {
      this.keys = emptyBanks();
      this.todHQ = null;
      this.todSinc = null;
      this.dama = null;
      this.emit('zeroize', { all: true, source });
      this.changed();
    }

    /** El SKL se conectó a J1 fuera de LD/RV: la radio entra en transmisión. */
    fillHazard() {
      if (!this.operating) return;
      this.hazards++;
      this.tx = true;
      this.flash('ADF: TX AUTOMATICA!', 3000);
      this.after(2000, () => {
        this.tx = false;
        this.changed();
      });
      this.emit('hazard');
      this.changed();
    }

    // ================================================================ TX / RX
    /** Clave de tráfico (TEK) que usará la red actual. */
    netTek(n) {
      const bank = BANK_OF[n.crypto];
      return bank ? this.keys[bank].TEK[n.key - 1] : null;
    }

    pttDown() {
      const fail = (reason, lcd) => {
        if (lcd && this.booted) this.flash(lcd, 2500);
        return { ok: false, reason };
      };
      if (!this.booted || this.sw === 'OFF') return fail('La radio está apagada');
      if (this.sw === 'LD' || this.sw === 'RV') return fail(`El interruptor está en ${this.sw}: gírelo a PT, CT o TD`);
      if (!this.operating) return fail('La radio no está operativa');
      const c = this.env.getConn();
      if (c.j1 !== 'HANDSET') return fail('No hay microteléfono H-250 en J1 (AUDIO/DATA/FILL)');
      if (this.mode === 'DAMA') {
        if (!this.dama || this.dama.status !== 'CONNECTED') return fail('DAMA no está conectado a la red', 'DAMA NO CONECTADO');
        if (this.dama.service !== 'ACTIVE') return fail('En DAMA hay que establecer la llamada antes de hablar: CALL > PLACE A CALL', 'SIN SERVICIO ACTIVO');
        const cfg = this.damaCfgs[this.damaNets[this.damaCur].cfg];
        if (this.secure && cfg.crypto !== 'NONE') {
          const k = this.keys[BANK_OF[cfg.crypto]].TEK[cfg.key - 1];
          if (!k) return fail(`No hay ${cfg.crypto} TEK ${pad(cfg.key)} cargada`, 'NO KEY');
        }
      } else {
        const n = this.net;
        if (this.mode !== 'NORMAL') return fail('Vuelva al modo NORMAL (MODE)');
        if (n.rxOnly) return fail('El preset está en RECEIVE ONLY', 'RECEIVE ONLY');
        if (this.secure && n.crypto !== 'NONE' && !this.netTek(n)) return fail(`No hay ${n.crypto} TEK ${pad(n.key)} cargada`, 'NO KEY');
        if (n.type === 'HOP' && n.hop === 'SINCGARS') {
          if (!this.keys.SINCGARS.TSK[n.hopset - 1]) return fail(`El compartimento de hopset ${pad(n.hopset)} está vacío`, 'HOPSET EMPTY');
          if (!this.todSinc) return fail('SINCGARS necesita la hora de red (loadset con hora u OPT > TIME)', 'ERR: SIN TOD');
        }
        if (n.type === 'HOP' && n.hop === 'HAVEQUICK') {
          if (!this.todHQ) return fail('HAVEQUICK necesita TOD: OPT > TIME > HAVE_QUICK o CALL > TOD SYNC', 'ERR: SIN TOD');
          if (!this.keys.HAVEQUICK.WOD[new Date(this.env.now()).getUTCDate() - 1]) return fail('Falta la MWOD del día UTC actual', 'ERR: SIN MWOD');
        }
      }
      this.rx = null;
      this.tx = true;
      this.txStart = this.env.now();
      this.changed();
      return { ok: true };
    }

    pttUp(text) {
      if (!this.tx) return;
      this.tx = false;
      const dur = this.env.now() - this.txStart;
      this.battery = Math.max(0, this.battery - Math.min(dur / 1000, 30) * 0.05);
      this.changed();
      this.emit('transmit', { snapshot: this.linkSnapshot(), text: text || '', dur });
    }

    linkSnapshot() {
      if (this.mode === 'DAMA') return Object.assign({ dama: true, presetNum: this.damaCur }, this.damaSnapshot());
      const n = Object.assign({}, this.net);
      const tek = this.netTek(n);
      const hop = n.type === 'HOP' && n.hop === 'SINCGARS' ? this.keys.SINCGARS.TSK[n.hopset - 1] : null;
      const wod = this.keys.HAVEQUICK.WOD[new Date(this.env.now()).getUTCDate() - 1];
      const sf = n.type === 'SAT' ? satFreqs(n) : null;
      return {
        dama: false,
        net: n,
        presetNum: this.cur,
        secure: this.secure,
        keyTag: tek ? tek.tag : null,
        hopTag: hop ? hop.tag : null,
        hopNetId: hop ? hop.netId : null,
        wodTag: wod ? wod.tag : null,
        todHQ: !!this.todHQ,
        todSinc: !!this.todSinc,
        sat: sf ? Object.assign({ bw: satBw(n) }, sf) : null,
        conn: Object.assign({}, this.env.getConn()),
        powerW: n.power,
        rangeKm: rangeKm(n.power),
        port: antennaPort(n),
      };
    }

    receive({ from, clear, dur }) {
      if (!this.operating || this.tx) return false;
      const token = {};
      this.rx = { from, clear, token };
      this.after(dur || 2500, () => {
        if (this.rx && this.rx.token === token) {
          this.rx = null;
          this.emit('squelch-tail');
          this.changed();
        }
      });
      this.changed();
      return true;
    }

    tick(dtSec) {
      if (!this.booted) return;
      const before = Math.ceil(this.battery);
      this.battery = Math.max(0, this.battery - dtSec * (this.tx ? 0.08 : 0.01));
      this._eti = (this._eti || 0) + dtSec;
      if (this._eti >= 60) {
        this._eti -= 60;
        this.etiMin++;
      }
      if (this.battery <= 0) {
        this.clearTimers();
        this.booted = false;
        this.tx = false;
        this.rx = null;
        this.screen = { id: 'OFF' };
        this.emit('dead');
        return this.changed();
      }
      if (Math.ceil(this.battery) !== before) this.changed();
    }

    replaceBattery() {
      this.battery = 100;
      if (!['OFF', 'CLR'].includes(this.sw) && !this.booted) this.boot();
      this.changed();
    }

    // ================================================================ pantalla
    /*
     * Cada vista devuelve una descripción de la pantalla gráfica del KDU:
     *   status: línea pequeña superior { crypto, mode } (R/T, batería y PT/CT se añaden siempre)
     *           o { title } en pantallas de menú/campo (solo se ve el título y PT/CT a la derecha)
     *   rows:   hasta 2 filas en letra grande { l, c, r }
     *   grid:   columnas [valor, etiqueta] que sustituyen a la 2.ª fila y al pie
     *   foot:   línea pequeña inferior { l, c, r }
     *   icons:  muestra ⟳ y el medidor RX/TX junto a la 1.ª fila
     */
    swTag() {
      return SW_LABEL[this.sw];
    }

    cryptoText(crypto, key) {
      if (crypto === 'NONE') return '';
      const bank = BANK_OF[crypto];
      const has = bank && this.keys[bank].TEK[key - 1];
      return `${crypto.replace('-', '')} ${has ? 'TEK' + pad(key) : 'NO KEY'}`;
    }

    view_MAIN() {
      if (this.mode === 'DAMA') return this.viewDama();
      const n = this.net;
      const name = `${pad(this.cur)}-${n.name}`;
      const status = { mode: 'NORM', crypto: this.cryptoText(n.crypto, n.key) };
      const sqS = { TONE: 'TONE', NOISE: 'NOISE', OFF: 'OFF' };
      const rate = n.crypto === 'NONE' ? 'ANLG' : n.crypto === 'ANDVT' ? '2.4' : '16.0';
      const pages = [];
      if (n.type === 'LOS') {
        pages.push({ rows: [{ l: name }], grid: [['LOS', 'TYPE'], ['VOC', 'ADF'], ['VOC', 'DATA'], [n.mod, 'MODE'], [sqS[n.sq], 'SQL']] });
        pages.push({ rows: [{ l: `R:${f5(n.rx)}`, r: 'LOS' }, { l: `T:${f5(n.tx)}`, r: rate }], foot: { l: 'FREQUENCY', r: 'RATE' } });
      } else if (n.type === 'SAT') {
        const sf = satFreqs(n);
        pages.push({ rows: [{ l: name }], grid: [['SAT', 'TYPE'], ['VOC', 'ADF'], ['VOC', 'DATA'], ['181', 'MODE'], [n.dsq === 'ON' ? 'DIG' : 'OFF', 'SQL']] });
        pages.push({ rows: [{ l: `R:${f5(sf.rx)}`, r: 'SAT' }, { l: `T:${f5(sf.tx)}`, r: rate }], foot: { l: 'FREQUENCY', c: 'RATE', r: pad(n.code, 3) } });
        const voc = n.crypto === 'ANDVT' ? n.voice : n.crypto === 'VINSON' ? 'CVSD' : 'NONE';
        pages.push({ rows: [{ l: name }], grid: [[`${satBw(n)}K`, 'BW'], [voc, 'VOC'], ['FSK', 'MOD'], [n.crypto === 'VINSON' ? '132' : n.opt, 'OPT'], ['NONE', 'INTERLV']] });
      } else if (n.hop === 'SINCGARS') {
        const t = this.keys.SINCGARS.TSK[n.hopset - 1];
        const st = !t ? 'EMPTY' : !this.todSinc ? 'ERR' : 'OK';
        pages.push({ rows: [{ l: name }], grid: [['SINC', 'TYPE'], ['VOC', 'ADF'], ['VOC', 'DATA'], [t ? 'F' + pad(t.netId, 3) : '----', 'NET'], [st, 'FH']] });
        pages.push({ rows: [{ l: `HOPSET ${pad(n.hopset)}`, r: t ? 'F' + pad(t.netId, 3) : 'EMPTY' }, { l: `TOD ${this.todSinc ? 'OK' : '--'}`, r: `${n.power}W` }], foot: { l: 'COMPARTMENT', r: 'NET ID' } });
      } else {
        const wod = this.keys.HAVEQUICK.WOD[new Date(this.env.now()).getUTCDate() - 1];
        const st = !this.todHQ || !wod ? 'ERR' : 'OK';
        pages.push({ rows: [{ l: name }], grid: [['HVQUIK', 'TYPE'], ['VOC', 'ADF'], ['VOC', 'DATA'], ['OFF', 'SQL'], [st, 'FH']] });
        pages.push({ rows: [{ l: `NET ${n.hqNet}`, r: 'HQII' }, { l: `TOD ${this.todHQ ? 'OK' : '--'}`, r: `MWOD ${wod ? 'OK' : '--'}` }], foot: { l: 'NET NUMBER', r: 'STATUS' } });
      }
      return Object.assign({ status, icons: true }, pages[this.page % pages.length]);
    }

    viewDama() {
      const d = this.damaNets[this.damaCur];
      const c = this.damaCfgs[d.cfg];
      const st = this.dama ? this.dama.status : 'DISABLE';
      const sc = satCode(d.channel);
      const bw = sc && !sc.manual ? sc.bw : 25;
      const status = { mode: 'DAMA', crypto: this.cryptoText(c.crypto, c.key) };
      const statusText = {
        CONFIG: 'CONFIGURING', ACQUIRING: 'ACQUIRING', RANGING: 'RANGING', 'LOGGING IN': 'LOGGING IN',
        CONNECTED: 'CONNECTED', ERROR: `ERROR ${this.dama && this.dama.err ? this.dama.err : ''}`, DISABLE: 'DISABLE',
      }[st];
      const name = `${this.damaCur}-${d.name}`;
      const pages = [
        { rows: [{ l: name }, { l: statusText, r: bw === 25 ? '25KHZ-AC' : '5KHZ' }], foot: { l: 'NETWORK' } },
        { rows: [{ l: `R:${sc && !sc.manual ? sc.rx.toFixed(3) : '---.---'}`, r: `OW:${d.ow === 'ON' ? 'CT' : 'PT'}` }, { l: `T:${sc && !sc.manual ? sc.tx.toFixed(3) : '---.---'}`, c: d.txCap, r: pad(d.channel, 3) }], foot: { l: 'FREQUENCY', c: 'TX_OPTS', r: 'CHAN' } },
        { rows: [{ l: `${d.cfg}-${c.name}` }, { l: this.dama ? this.dama.service : 'IDLE' }], foot: { l: 'SERVICE', r: 'TIME REMAINING' } },
        { rows: [{ l: `TO: ${this.dama && this.dama.call ? pad(this.dama.call.dest[0] || 0, 5) : '-----'}` }, { l: 'VOC', c: c.crypto === 'ANDVT' ? '2400' : '16K', r: 'SYNC' }], foot: { l: 'ADF', c: 'DATA RATE', r: 'SYNCH' } },
        { rows: [{ l: this.dama ? this.dama.service : 'IDLE', r: `F:257 ${c.code25}` }, { l: st === 'CONNECTED' ? 'CONNECTED' : statusText, c: c.voice, r: pad(d.channel, 3) }], foot: { l: 'NETWORK', c: 'ENC', r: 'CHAN' } },
      ];
      return Object.assign({ status, icons: true }, pages[this.page % pages.length]);
    }

    view_BOOT() {
      const s = this.screen.step;
      return { rows: [{ c: 'POWER ON SELF TEST' }, { c: '#'.repeat(s * 5).padEnd(20, '.') }], foot: { c: 'AN/PRC-117F (SIM)' } };
    }
    view_ZALL() {
      return { status: { title: '' }, rows: [{ c: 'ZEROIZE PASSED' }, { c: 'RESET RADIO' }] };
    }
    view_NOTICE() {
      const l = this.screen.lines.filter(Boolean);
      return { status: { title: '' }, rows: [{ c: l[0] || '' }, { c: l.length > 3 ? l[1] + ' ' + l[2] : l[1] || '' }], foot: { c: l[l.length - 1] || '' } };
    }
    view_RV() {
      return { status: { title: 'RV' }, rows: [{ c: 'RECEIVE VARIABLE' }, { c: 'OTAR/OTAT' }], foot: { c: 'NO SIMULADO EN EL ENTRENADOR' } };
    }
    view_INFO() {
      const l = this.screen.lines;
      return { status: { title: l[0] }, rows: [{ c: l[1] || '' }, { c: l[2] || '' }], foot: { c: l[3] || 'CLR=SALIR' } };
    }
    view_BIT() {
      if (!this.screen.done) return { status: { title: 'TEST' }, rows: [{ c: 'BIT IN PROGRESS' }, { c: '' }] };
      return { status: { title: 'TEST' }, rows: [{ c: this.bitResult.pass ? 'BIT PASSED' : 'BIT FAILED' }, { c: this.bitResult.pass ? 'HUB OK' : 'LOW BATTERY' }], foot: { c: 'PRESS CLR' } };
    }
    view_RSSI() {
      const s = this.screen;
      const n = this.net;
      const status = { mode: 'NORM', crypto: this.cryptoText(n.crypto, n.key) };
      if (s.stage === 0) return { status, rows: [{ c: 'PRESS ENT' }, { c: 'RSSI' }], foot: { c: 'USE < > TO SELECT ITEM' } };
      if (s.stage === 1) return { status, rows: [{ c: 'RSSI TEST' }, { c: 'PINGING...' }] };
      return { status, rows: [{ c: `RSSI SCORE: ${pad(s.score, 3)}` }, { c: s.score >= 80 ? 'POINTING OK' : 'REPOINT ANTENNA' }], foot: { c: 'PRESS ENT AGAIN · CLR' } };
    }
    view_TODRX() {
      const s = this.screen;
      if (!s.done) return { status: { title: 'TOD SYNC' }, rows: [{ c: 'WAITING FOR' }, { c: 'RECEPTION' }] };
      return s.ok
        ? { status: { title: 'TOD SYNC' }, rows: [{ c: 'SUCCESSFUL RECEIVE' }, { c: SIM.utcStamp(this.env.now()).slice(0, 19) }], foot: { c: 'PRESS CLR' } }
        : { status: { title: 'TOD SYNC' }, rows: [{ c: 'NO RECEPTION' }, { c: '' }], foot: { c: 'PRESS CLR' } };
    }
    view_FILL() {
      const s = this.screen;
      const lab = this.fillLabel(s.req);
      const R = (a, b) => ({ status: { title: 'FILL MENU' }, rows: [{ c: a }, { c: b }], foot: { c: lab } });
      switch (s.stage) {
        case 'READY': return R('PRESS ENTER', 'TO INITIATE');
        case 'PROGRESS': return R('FILL IN PROGRESS', '');
        case 'STORE': return R('KEY STORE', 'IN PROGRESS');
        case 'DONE': return R('FILL DONE', 'PRESS ANY KEY');
        case 'BAD': return R('BAD FILL', 'PRESS ANY KEY');
        case 'MORE': return R('MORE FILL DATA?', blink(s.more));
        default: return R('CHANGE SW FROM LD', '');
      }
    }
    view_MENU() {
      const s = this.screen;
      const items = typeof s.items === 'function' ? s.items() : s.items;
      s.idx = Math.min(s.idx, items.length - 1);
      // reparte los elementos en filas de 20 columnas (letra grande)
      const BW = 20;
      const rows = [];
      let row = [];
      let w = 0;
      items.forEach((it, i) => {
        const len = it.label.length + (row.length ? 2 : 0);
        if (w + len > BW && row.length) {
          rows.push(row);
          row = [];
          w = 0;
        }
        row.push(i);
        w += it.label.length + (row.length > 1 ? 2 : 0);
      });
      if (row.length) rows.push(row);
      const r = rows.findIndex((rr) => rr.includes(s.idx));
      const start = Math.max(0, Math.min(r, rows.length - 2));
      const lines = rows.slice(start, start + 2).map((rr) => rr.map((i) => (i === s.idx ? blink(items[i].label) : items[i].label)).join('  '));
      while (lines.length < 2) lines.push('');
      // flechas de desplazamiento: hay más opciones arriba/abajo (se llega con < >)
      const up = start > 0 ? '▲' : '';
      const down = start + 2 < rows.length ? '▼' : '';
      return { status: { title: '' }, rows: [{ l: lines[0], r: up }, { l: lines[1], r: down }], foot: { l: s.ctx || '', c: 'USE < > TO SELECT ITEM' } };
    }
    view_WIZ() {
      const s = this.screen;
      const fd = this.curField();
      if (!fd) return { status: { title: '' }, rows: [{ c: s.title }, { c: '' }] };
      const ed = s.ed || {};
      const status = { title: '' };
      const foot = (hint) => ({ l: s.ctx || '', c: hint });
      if (fd.kind === 'choice') {
        const v = fd.fmt ? fd.fmt(ed.val) : String(ed.val);
        return { status, rows: [{ c: fd.label }, { c: blink(v) }], foot: foot('USE ▲▼ TO SELECT ITEM') };
      }
      if (fd.kind === 'info') return { status, rows: [{ c: fd.label }, { c: fd.lines[0] || '' }], foot: foot(fd.lines[1] || 'PRESS ENT') };
      if (fd.kind === 'num') {
        const str = ed.chars.join('');
        const shown = ed.cur >= 0 ? str.slice(0, ed.cur) + blink(str[ed.cur]) + str.slice(ed.cur + 1) : str;
        const raw = fd.parse ? fd.parse(str) : Number(str);
        const sfx = fd.suffix ? ' ' + fd.suffix(raw) : fd.unit ? ' ' + fd.unit : '';
        return { status, rows: [{ c: fd.label }, { c: `${fd.prefix || ''}${shown}${sfx}` }], foot: foot('ENTER DIGITS · ◄ ► · ENT') };
      }
      const chars = ed.chars.slice();
      const shown = chars.map((ch, i) => (i === ed.cur ? blink(ch || ' ') : ch)).join('') + (ed.cur >= chars.length ? blink(' ') : '');
      return { status, rows: [{ c: fd.label }, { c: shown }], foot: foot('1ABC 2DEF ... ► NEXT CHAR') };
    }

    /** Texto plano de una fila {l,c,r}. */
    static rowText(r) {
      if (!r) return '';
      return [r.l, r.c, r.r].filter((x) => x != null && x !== '').join(' ');
    }

    display() {
      const blank = { lit: false, status: null, rows: [], grid: null, foot: null, text: ['', '', '', ''] };
      if (['OFF', 'CLR'].includes(this.sw) || this.screen.id === 'OFF' || this.battery <= 0) return blank;
      const view = this['view_' + this.screen.id];
      if (!view) return blank;
      const v = view.call(this);
      if (this.msg && !['BOOT', 'ZALL'].includes(this.screen.id)) {
        v.foot = { c: this.msg };
        if (v.grid) {
          v.rows = [v.rows[0], { l: v.grid.map((g) => g[0]).join(' ') }];
          v.grid = null;
        }
      }
      const rt = this.tx ? 'T' : 'R';
      const status = v.status && v.status.title !== undefined
        ? { title: v.status.title, sw: this.swTag() }
        : v.status ? { rt, bat: Math.ceil(this.battery), mode: v.status.mode, crypto: v.status.crypto, sw: this.swTag() } : null;
      const rows = (v.rows || []).slice(0, 2);
      const statusText = !status ? '' : status.title !== undefined ? SIM.lr(status.title, status.sw, 34) : SIM.lr(`${status.rt} BAT ${status.mode} ${status.crypto}`.trim(), status.sw, 34);
      const text = [
        statusText,
        Radio.rowText(rows[0]),
        v.grid ? v.grid.map((g) => g[0]).join(' ') : Radio.rowText(rows[1]),
        v.grid ? v.grid.map((g) => g[1]).join(' ') : Radio.rowText(v.foot),
      ];
      return {
        lit: true,
        light: this.light,
        status,
        rows,
        grid: v.grid || null,
        foot: v.grid ? null : v.foot || null,
        icons: !!v.icons,
        meter: this.tx ? 1 : this.rx ? 0.75 : 0,
        text,
        lines: text, // compatibilidad
        ann: { T: this.tx, R: !!this.rx, BAT: this.battery <= 15 },
      };
    }

    // ================================================================ persistencia
    serialize() {
      return {
        v: 2,
        nets: this.nets,
        damaNets: this.damaNets,
        damaCfgs: this.damaCfgs,
        damaDests: this.damaDests,
        keys: this.keys,
        cur: this.cur,
        damaCur: this.damaCur,
        volume: this.volume,
        light: this.light,
        battery: this.battery,
        etiMin: this.etiMin,
      };
    }

    load(o) {
      if (!o || typeof o !== 'object' || o.v !== 2) return;
      const merge = (arr, def, n) => (Array.isArray(arr) && arr.length === n ? arr.map((x, i) => Object.assign(def(i), x)) : null);
      this.nets = merge(o.nets, defNet, NUM_NETS) || this.nets;
      this.damaNets = merge(o.damaNets, defDama, NUM_DAMA) || this.damaNets;
      this.damaCfgs = merge(o.damaCfgs, defCfg, NUM_DAMA) || this.damaCfgs;
      this.damaDests = merge(o.damaDests, defDest, NUM_DEST) || this.damaDests;
      if (o.keys && typeof o.keys === 'object') {
        const k = emptyBanks();
        for (const b of Object.keys(k)) {
          if (!o.keys[b]) continue;
          for (const t of Object.keys(k[b])) {
            const src = o.keys[b][t];
            if (Array.isArray(k[b][t]) && Array.isArray(src) && src.length === k[b][t].length) k[b][t] = src.map((x) => (x && x.tag ? x : null));
            else if (!Array.isArray(k[b][t]) && src && src.tag) k[b][t] = src;
          }
        }
        this.keys = k;
      }
      if (Number.isInteger(o.cur) && o.cur >= 0 && o.cur < NUM_NETS) this.cur = o.cur;
      if (Number.isInteger(o.damaCur) && o.damaCur >= 0 && o.damaCur < NUM_DAMA) this.damaCur = o.damaCur;
      if (Number.isFinite(o.volume)) this.volume = Math.max(0, Math.min(8, o.volume));
      if (Number.isInteger(o.light)) this.light = o.light % 4;
      if (Number.isFinite(o.battery)) this.battery = Math.max(0, Math.min(100, o.battery));
      if (Number.isInteger(o.etiMin)) this.etiMin = o.etiMin;
      this.changed();
    }

    /** Número de claves cargadas en todos los bancos. */
    keyCount() {
      let n = 0;
      for (const b of Object.values(this.keys)) for (const v of Object.values(b)) n += Array.isArray(v) ? v.filter(Boolean).length : v ? 1 : 0;
      return n;
    }
  }

  Radio.SW = SW;
  Radio.SW_LABEL = SW_LABEL;
  Radio.POWERS = POWERS;
  Radio.NUM_NETS = NUM_NETS;
  Radio.CRYPTO_TYPES = CRYPTO_TYPES;
  Radio.KEY_TYPES = KEY_TYPES;
  Radio.BANK_OF = BANK_OF;
  Radio.satCode = satCode;
  Radio.satBw = satBw;
  Radio.satFreqs = satFreqs;
  Radio.powerOptions = powerOptions;
  Radio.cryptoOptions = cryptoOptions;
  Radio.antennaPort = antennaPort;
  Radio.rangeKm = rangeKm;
  SIM.Radio = Radio;
})(typeof window !== 'undefined' ? window : globalThis);
