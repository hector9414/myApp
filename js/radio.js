/*
 * Modelo de la radio AN/PRC-117F (simulación de entrenamiento).
 *
 * Modela el panel frontal: perilla de función, teclado, pantalla de 4 líneas,
 * presets, ranuras (slots) de claves COMSEC/TRANSEC, modos LOS, SINCGARS,
 * HAVE QUICK II y SATCOM, autoprueba (BIT), sincronización TOD, carga de
 * claves (LD) y borrado de emergencia (zeroize).
 *
 * No contiene algoritmos ni datos criptográficos reales: las "claves" son
 * etiquetas de entrenamiento.
 */
(function (g) {
  'use strict';
  const SIM = g.SIM;
  const { pad, fit, lr } = SIM;

  const W = 22; // caracteres por línea de pantalla
  const MODES = ['LOS', 'SINCGARS', 'HQ', 'SATCOM'];
  const MODE_SHORT = { LOS: 'LOS', SINCGARS: 'SINC', HQ: 'HQII', SATCOM: 'SAT' };
  const POWER = [
    { id: 'BAJA', w: 1, km: 4 },
    { id: 'MEDIA', w: 5, km: 10 },
    { id: 'ALTA', w: 10, km: 16 },
    { id: 'MAX', w: 20, km: 25 },
  ];
  const NUM_PRESETS = 10;
  const NUM_SLOTS = 12;
  const KNOB = ['Z', 'OFF', 'ON', 'LD', 'RMT'];
  const BANDS = { FM: [30, 512], AM: [90, 400] };

  const powerOf = (id) => POWER.find((p) => p.id === id) || POWER[2];
  const slotOpts = () => Array.from({ length: NUM_SLOTS }, (_, i) => i + 1);
  const transecType = (mode) => (mode === 'SINCGARS' ? 'TSK' : mode === 'HQ' ? 'WOD' : null);

  function defaultPresets() {
    return Array.from({ length: NUM_PRESETS }, (_, i) => ({
      name: i === 0 ? 'MANDO' : 'P' + pad(i + 1),
      mode: 'LOS',
      mod: 'FM',
      freq: i === 0 ? 40 : 30,
      bw: 25,
      power: 'ALTA',
      traffic: 'VOZ',
      crypto: 'PT',
      keySlot: 1,
      transecSlot: 1,
      netId: 0,
      hqNet: 0,
      satChannel: 1,
    }));
  }

  const FIELDS = {
    mode: { label: 'MODO', type: 'enum', options: () => MODES },
    mod: { label: 'MODULACION', type: 'enum', options: () => ['FM', 'AM'] },
    freq: { label: 'FREC', type: 'num', fmt: (v) => v.toFixed(4) },
    bw: { label: 'CANAL', type: 'enum', options: () => [25, 12.5], fmt: (v) => v + 'K' },
    netId: { label: 'RED SINC', type: 'num', fmt: (v) => pad(v, 3) },
    hqNet: { label: 'RED HQ', type: 'num', fmt: (v) => pad(v, 3) },
    satChannel: { label: 'CANAL SAT', type: 'num', fmt: (v) => pad(v, 2) },
    transecSlot: { label: 'SLOT TRANSEC', type: 'enum', options: slotOpts, fmt: (v) => 'S' + pad(v) },
    power: { label: 'POTENCIA', type: 'enum', options: () => POWER.map((p) => p.id), fmt: (v) => v + ' ' + powerOf(v).w + 'W' },
    traffic: { label: 'TRAFICO', type: 'enum', options: () => ['VOZ', 'DATOS'] },
    crypto: { label: 'CIFRADO', type: 'enum', options: () => ['PT', 'CT'] },
    keySlot: { label: 'SLOT TEK', type: 'enum', options: slotOpts, fmt: (v) => 'S' + pad(v) },
  };

  function fieldLabel(name, p) {
    if (name === 'transecSlot') return p.mode === 'HQ' ? 'SLOT WOD' : 'SLOT TSK';
    return FIELDS[name].label;
  }
  function fieldValue(name, p) {
    const f = FIELDS[name];
    return f.fmt ? f.fmt(p[name]) : String(p[name]);
  }

  function fieldsFor(p) {
    const f = ['mode'];
    if (p.mode === 'LOS') f.push('mod', 'freq', 'bw');
    if (p.mode === 'SINCGARS') f.push('netId', 'transecSlot');
    if (p.mode === 'HQ') f.push('hqNet', 'transecSlot');
    if (p.mode === 'SATCOM') f.push('satChannel');
    f.push('power', 'traffic', 'crypto');
    if (p.crypto === 'CT') f.push('keySlot');
    return f;
  }

  function validateNum(name, v, p) {
    if (!Number.isFinite(v)) return 'VALOR INVALIDO';
    if (name === 'freq') {
      const [lo, hi] = BANDS[p.mod];
      if (v < lo || v > hi) return `RANGO ${p.mod} ${lo}-${hi}`;
      if (Math.abs(v * 1e4 - Math.round(v * 1e4)) > 1e-6) return 'MAX 4 DECIMALES';
      return null;
    }
    if (!Number.isInteger(v)) return 'SOLO ENTEROS';
    if (name === 'netId' || name === 'hqNet') return v < 0 || v > 999 ? 'RANGO 000-999' : null;
    if (name === 'satChannel') return v < 1 || v > 99 ? 'RANGO 01-99' : null;
    return null;
  }

  class Radio extends SIM.Device {
    /**
     * env.getConn() -> { antenna: 'NONE'|'WHIP'|'SATCOM', handset: bool, fillCable: bool }
     */
    constructor(env) {
      super(env);
      if (!this.env.getConn) this.env.getConn = () => ({ antenna: 'WHIP', handset: true, fillCable: true });
      this.hardReset();
    }

    hardReset() {
      this.clearTimers();
      this.knob = 'OFF';
      this.booted = false;
      this.presets = defaultPresets();
      this.slots = new Array(NUM_SLOTS).fill(null);
      this.cur = 0;
      this.volume = 4;
      this.light = false;
      this.squelch = true;
      this.keyTone = true;
      this.bitResult = null;
      this.todValid = false;
      this.battery = 100;
      this.ldSlot = 1;
      this.screen = { id: 'OFF' };
      this.stack = [];
      this.msg = null;
      this.tx = false;
      this.rx = null;
      this.page = 0;
      this.changed();
    }

    get preset() {
      return this.presets[this.cur];
    }
    /** La radio está encendida, arrancada y operando en ON (no LD/RMT). */
    get operating() {
      return this.booted && this.knob === 'ON';
    }

    flash(text, ms = 2000) {
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
      this.stack.push(this.screen);
      this.screen = screen;
    }
    back() {
      this.screen = this.stack.pop() || { id: 'MAIN' };
    }

    // ---------------------------------------------------------------- perilla
    setKnob(pos) {
      if (!KNOB.includes(pos) || pos === this.knob || this.knob === 'Z') return;
      if (pos === 'Z') {
        const back = this.knob;
        this.knob = 'Z';
        this.zeroizeAll('PERILLA Z');
        if (this.booted) {
          this.stack = [];
          this.screen = { id: 'ZMSG' };
        }
        this.changed();
        // la posición Z tiene retorno por resorte
        this.after(1200, () => {
          this.knob = back;
          if (this.booted) {
            this.enterKnobScreen();
            this.flash('CLAVES BORRADAS', 2500);
          }
          this.changed();
        });
        return;
      }
      const wasOff = this.knob === 'OFF';
      this.knob = pos;
      if (pos === 'OFF') return this.powerOff();
      if (this.battery <= 0) return this.changed();
      if (wasOff) this.boot();
      else if (this.booted) this.enterKnobScreen();
      this.changed();
    }

    powerOff() {
      this.clearTimers();
      this.booted = false;
      this.tx = false;
      this.rx = null;
      this.todValid = false; // el reloj TOD se pierde al apagar
      this.screen = { id: 'OFF' };
      this.stack = [];
      this.msg = null;
      this.changed();
    }

    boot() {
      this.booted = false;
      this.stack = [];
      this.screen = { id: 'BOOT', step: 0 };
      const steps = 4;
      for (let i = 1; i <= steps; i++) {
        this.after(550 * i, () => {
          if (this.screen.id !== 'BOOT') return;
          this.screen.step = i;
          if (i === steps) {
            this.booted = true;
            this.enterKnobScreen();
            if (!this.slots.some(Boolean)) this.flash('AVISO: SIN CLAVES', 2500);
          }
          this.changed();
        });
      }
    }

    enterKnobScreen() {
      this.stack = [];
      if (this.knob === 'LD') this.screen = { id: 'LD', last: null };
      else if (this.knob === 'RMT') this.screen = { id: 'RMT' };
      else this.screen = { id: 'MAIN' };
    }

    // ---------------------------------------------------------------- teclado
    press(key) {
      if (!this.booted || this.knob === 'OFF' || this.knob === 'Z') return;
      if (this.keyTone) this.emit('beep');
      if (key === 'LUZ') {
        this.light = !this.light;
        return this.changed();
      }
      if (this.knob === 'RMT') return this.flash('PANEL EN REMOTO');
      const h = this['key_' + this.screen.id];
      if (h) h.call(this, key);
      this.changed();
    }

    key_MAIN(k) {
      const p = this.preset;
      if (k === 'PRE+' || k === 'PRE-') {
        this.cur = (this.cur + (k === 'PRE+' ? 1 : -1) + NUM_PRESETS) % NUM_PRESETS;
        this.page = 0;
        this.rx = null;
      } else if (k === 'UP' || k === 'DOWN') {
        const n = this.mainPages().length;
        this.page = (this.page + (k === 'UP' ? n - 1 : 1)) % n;
      } else if (k === 'CTPT') {
        this.toggleCrypto();
      } else if (k === 'MODE') {
        const next = MODES[(MODES.indexOf(p.mode) + 1) % MODES.length];
        this.applyField(p, 'mode', next);
        this.page = 0;
        this.flash('MODO ' + next);
      } else if (k === 'PGM') {
        this.go(this.menuPGM());
      } else if (k === 'OPT') {
        this.go(this.menuOPT());
      } else if (k === 'ZERO') {
        this.go({
          id: 'CONFIRM',
          lines: ['BORRAR TODAS', 'LAS CLAVES?', 'ENT=SI   CLR=NO'],
          yes: () => {
            this.zeroizeAll('TECLA ZERO');
            this.enterKnobScreen();
            this.flash('CLAVES BORRADAS', 2500);
          },
        });
      } else if (/^[0-9]$/.test(k)) {
        this.go({ id: 'PRESET_ENTRY', buf: k });
      } else if (k === 'CLR') {
        this.msg = null;
      }
    }

    toggleCrypto() {
      const p = this.preset;
      if (p.crypto === 'CT') {
        p.crypto = 'PT';
        return this.flash('MODO PT (CLARO)');
      }
      const k = this.slots[p.keySlot - 1];
      if (!k || k.type !== 'TEK') return this.flash(`S${pad(p.keySlot)} SIN TEK`);
      p.crypto = 'CT';
      this.flash('MODO CT (CIFRADO)');
    }

    key_PRESET_ENTRY(k) {
      const s = this.screen;
      if (/^[0-9]$/.test(k) && s.buf.length < 2) s.buf += k;
      else if (k === 'CLR') this.back();
      else if (k === 'ENT') {
        const n = parseInt(s.buf, 10);
        this.back();
        if (n >= 1 && n <= NUM_PRESETS) {
          this.cur = n - 1;
          this.page = 0;
        } else this.flash('PRESET INVALIDO');
      }
    }

    // ---------------------------------------------------------------- menús
    menuPGM() {
      return {
        id: 'MENU',
        title: 'PROGRAMACION',
        idx: 0,
        items: () => [
          { label: 'PRESETS', run: () => this.go(this.menuPresets()) },
          { label: 'CLAVES COMSEC', run: () => this.go(this.menuSlots()) },
          { label: 'SINCRONIZAR TOD', run: () => this.startTod() },
          { label: 'AUTOPRUEBA BIT', run: () => this.startBit() },
          { label: 'INFORMACION', run: () => this.go({ id: 'INFO' }) },
        ],
      };
    }

    menuPresets() {
      return {
        id: 'MENU',
        title: 'PRESETS',
        idx: this.cur,
        items: () =>
          this.presets.map((p, i) => ({
            label: `P${pad(i + 1)} ${fit(p.name, 6)} ${MODE_SHORT[p.mode]}`,
            run: () => this.go({ id: 'FIELDS', p: i, idx: 0 }),
          })),
      };
    }

    menuSlots() {
      return {
        id: 'MENU',
        title: 'CLAVES COMSEC',
        idx: 0,
        items: () =>
          this.slots.map((s, i) => ({
            label: s ? `${pad(i + 1)} ${s.type} ${s.tag}` : `${pad(i + 1)} -- VACIO --`,
            run: () => (s ? this.go(this.menuSlot(i)) : this.flash('SLOT VACIO')),
          })),
      };
    }

    menuSlot(i) {
      return {
        id: 'MENU',
        title: `SLOT ${pad(i + 1)}`,
        idx: 0,
        items: () => [
          { label: 'VER DETALLE', run: () => this.go({ id: 'SLOTINFO', i }) },
          {
            label: 'BORRAR SLOT',
            run: () =>
              this.go({
                id: 'CONFIRM',
                lines: [`BORRAR SLOT ${pad(i + 1)}?`, this.slots[i] ? this.slots[i].tag : '', 'ENT=SI   CLR=NO'],
                yes: () => {
                  this.slots[i] = null;
                  this.emit('zeroize', { slot: i + 1 });
                  this.back(); // confirmación
                  this.back(); // menú del slot
                  this.flash(`SLOT ${pad(i + 1)} BORRADO`);
                },
              }),
          },
        ],
      };
    }

    menuOPT() {
      return {
        id: 'MENU',
        title: 'OPCIONES',
        idx: 0,
        items: () => [
          { label: `SQUELCH: ${this.squelch ? 'ON' : 'OFF'}`, run: () => (this.squelch = !this.squelch) },
          { label: `LUZ FONDO: ${this.light ? 'ON' : 'OFF'}`, run: () => (this.light = !this.light) },
          { label: `TONO TECLAS: ${this.keyTone ? 'ON' : 'OFF'}`, run: () => (this.keyTone = !this.keyTone) },
          {
            label: `POTENCIA: ${this.preset.power}`,
            run: () => {
              const ids = POWER.map((p) => p.id);
              this.preset.power = ids[(ids.indexOf(this.preset.power) + 1) % ids.length];
            },
          },
        ],
      };
    }

    key_MENU(k) {
      const s = this.screen;
      const items = s.items();
      if (k === 'UP') s.idx = (s.idx + items.length - 1) % items.length;
      else if (k === 'DOWN') s.idx = (s.idx + 1) % items.length;
      else if (k === 'ENT') items[s.idx].run();
      else if (k === 'CLR') this.back();
    }

    key_CONFIRM(k) {
      if (k === 'ENT') this.screen.yes();
      else if (k === 'CLR') this.back();
    }

    key_FIELDS(k) {
      const s = this.screen;
      const p = this.presets[s.p];
      const f = fieldsFor(p);
      s.idx = Math.min(s.idx, f.length - 1);
      if (k === 'UP') s.idx = (s.idx + f.length - 1) % f.length;
      else if (k === 'DOWN') s.idx = (s.idx + 1) % f.length;
      else if (k === 'CLR') this.back();
      else if (k === 'ENT') this.go({ id: 'EDIT', p: s.p, field: f[s.idx], val: p[f[s.idx]], buf: '' });
    }

    key_EDIT(k) {
      const s = this.screen;
      const p = this.presets[s.p];
      const def = FIELDS[s.field];
      if (def.type === 'enum') {
        const opts = def.options();
        const i = opts.indexOf(s.val);
        if (k === 'UP' || k === 'RIGHT') s.val = opts[(i + 1) % opts.length];
        else if (k === 'DOWN' || k === 'LEFT') s.val = opts[(i + opts.length - 1) % opts.length];
        else if (k === 'CLR') this.back();
        else if (k === 'ENT') this.commitEdit(p, s.field, s.val);
        return;
      }
      if (/^[0-9]$/.test(k) || (k === '.' && s.field === 'freq' && !s.buf.includes('.'))) {
        if (s.buf.length < 9) s.buf += k;
      } else if (k === 'CLR') {
        if (s.buf) s.buf = s.buf.slice(0, -1);
        else this.back();
      } else if (k === 'ENT') {
        if (!s.buf) return this.back();
        const v = Number(s.buf);
        const err = validateNum(s.field, v, p);
        if (err) {
          s.buf = '';
          return this.flash(err, 2500);
        }
        this.commitEdit(p, s.field, v);
      }
    }

    commitEdit(p, field, val) {
      const err = this.applyField(p, field, val);
      if (err) return this.flash(err, 2500);
      this.back();
      if (field === 'crypto' && val === 'CT') {
        const k = this.slots[p.keySlot - 1];
        if (!k || k.type !== 'TEK') return this.flash(`AVISO: S${pad(p.keySlot)} SIN TEK`, 2500);
      }
      this.flash('GUARDADO');
    }

    /** Aplica un valor a un campo del preset con sus efectos secundarios. Devuelve error o null. */
    applyField(p, field, val) {
      if (field === 'mod' && val === 'AM' && (p.freq < BANDS.AM[0] || p.freq > BANDS.AM[1])) return 'FREC NO VALIDA EN AM';
      p[field] = val;
      if (field === 'mode') {
        if (val === 'SINCGARS') p.mod = 'FM';
        if (val === 'HQ') p.mod = 'AM';
        if (val === 'LOS' && p.mod === 'AM' && (p.freq < BANDS.AM[0] || p.freq > BANDS.AM[1])) p.mod = 'FM';
      }
      return null;
    }

    key_SLOTINFO(k) {
      if (k === 'CLR' || k === 'ENT') this.back();
    }
    key_INFO(k) {
      if (k === 'CLR' || k === 'ENT') this.back();
    }
    key_TOD(k) {
      if ((k === 'CLR' || k === 'ENT') && this.screen.done) this.back();
    }
    key_BIT(k) {
      const s = this.screen;
      if (!s.done) return;
      if (k === 'UP') s.scroll = Math.max(0, s.scroll - 1);
      else if (k === 'DOWN') s.scroll = Math.min(Math.max(0, this.bitResult.items.length - 2), s.scroll + 1);
      else if (k === 'CLR' || k === 'ENT') this.back();
    }
    key_LD(k) {
      if (k === 'UP') this.ldSlot = (this.ldSlot % NUM_SLOTS) + 1;
      else if (k === 'DOWN') this.ldSlot = ((this.ldSlot + NUM_SLOTS - 2) % NUM_SLOTS) + 1;
      this.screen.last = null;
    }

    // ---------------------------------------------------------------- BIT / TOD
    startBit() {
      this.go({ id: 'BIT', done: false, scroll: 0 });
      const screen = this.screen;
      this.after(3000, () => {
        const c = this.env.getConn();
        const items = [];
        items.push('PROCESADOR ....... OK');
        items.push('SINTETIZADOR ..... OK');
        items.push('MODULO CRIPTO .... OK');
        items.push(c.antenna === 'NONE' ? 'ANTENA/VSWR .... FALLO' : 'ANTENA/VSWR ...... OK');
        items.push(this.battery > 20 ? 'BATERIA .......... OK' : 'BATERIA ...... BAJA');
        items.push(`CLAVES CARGADAS .. ${pad(this.slots.filter(Boolean).length)}`);
        const pass = c.antenna !== 'NONE' && this.battery > 20;
        this.bitResult = { pass, items, at: this.env.now() };
        screen.done = true;
        this.emit('bit', this.bitResult);
        this.changed();
      });
    }

    startTod() {
      this.go({ id: 'TOD', done: false });
      const screen = this.screen;
      this.after(2000, () => {
        this.todValid = true;
        screen.done = true;
        this.emit('tod');
        this.changed();
      });
    }

    // ---------------------------------------------------------------- claves
    zeroizeAll(source) {
      // Los presets conservan su configuración (CT, slot), pero quedan sin clave.
      this.slots = new Array(NUM_SLOTS).fill(null);
      this.emit('zeroize', { all: true, source });
      this.changed();
    }

    /** Llamado por el SKL (a través del cable de llenado). */
    receiveFill(key) {
      if (!this.booted || this.knob === 'OFF') return { ok: false, reason: 'Equipo destino apagado: no responde' };
      if (this.knob !== 'LD') return { ok: false, reason: 'La radio no está en posición LD (carga)' };
      const i = this.ldSlot - 1;
      const overwritten = !!this.slots[i];
      this.slots[i] = { tag: key.tag, type: key.type, chk: key.chk, loadedAt: this.env.now() };
      this.screen = { id: 'LD', last: `${overwritten ? 'SOBRESCR' : 'RECIBIDO'} S${pad(this.ldSlot)} ${key.type}` };
      this.emit('beep');
      this.emit('fill', { slot: this.ldSlot, key, overwritten });
      this.changed();
      return { ok: true, slot: this.ldSlot, overwritten };
    }

    // ---------------------------------------------------------------- TX / RX
    pttDown() {
      const fail = (reason, lcd) => {
        if (lcd && this.booted) this.flash(lcd, 2500);
        return { ok: false, reason };
      };
      if (!this.booted || this.knob === 'OFF') return fail('La radio está apagada');
      if (this.knob === 'LD') return fail('La radio está en modo LD (carga): gire la perilla a ON', 'MODO CARGA: NO TX');
      if (this.knob === 'RMT') return fail('La radio está en control remoto (RMT)', 'PANEL EN REMOTO');
      if (this.knob !== 'ON') return fail('La radio no está en ON');
      const c = this.env.getConn();
      if (!c.handset) return fail('No hay microteléfono conectado al conector de audio');
      const p = this.preset;
      if (p.traffic !== 'VOZ') return fail('El preset está configurado para DATOS: el PTT de voz está inhibido', 'TRAFICO DATOS');
      if (p.crypto === 'CT') {
        const k = this.slots[p.keySlot - 1];
        if (!k || k.type !== 'TEK') return fail(`Preset en CT pero el slot ${pad(p.keySlot)} no tiene una TEK`, `ERROR S${pad(p.keySlot)} SIN TEK`);
      }
      const tt = transecType(p.mode);
      if (tt) {
        const t = this.slots[p.transecSlot - 1];
        if (!t || t.type !== tt) return fail(`El modo ${p.mode} necesita una clave ${tt} en el slot ${pad(p.transecSlot)}`, `ERROR S${pad(p.transecSlot)} SIN ${tt}`);
      }
      if (p.mode === 'HQ' && !this.todValid) return fail('HAVE QUICK necesita la hora (TOD) sincronizada: PGM > SINCRONIZAR TOD', 'ERROR: SIN TOD');
      if (c.antenna === 'NONE') this.flash('ALARMA: VSWR ALTO', 2500);
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
      const p = Object.assign({}, this.preset);
      const key = p.crypto === 'CT' ? this.slots[p.keySlot - 1] : null;
      const tt = transecType(p.mode);
      const tr = tt ? this.slots[p.transecSlot - 1] : null;
      return {
        preset: p,
        presetNum: this.cur + 1,
        keyTag: key && key.type === 'TEK' ? key.tag : null,
        transecTag: tr && tr.type === tt ? tr.tag : null,
        todValid: this.todValid,
        conn: Object.assign({}, this.env.getConn()),
        powerW: powerOf(p.power).w,
        powerKm: powerOf(p.power).km,
      };
    }

    /** Recepción de una transmisión simulada. */
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

    // ---------------------------------------------------------------- batería
    tick(dtSec) {
      if (!this.booted || this.knob === 'OFF') return;
      const before = Math.ceil(this.battery);
      this.battery = Math.max(0, this.battery - dtSec * (this.tx ? 0.08 : 0.01));
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
      if (this.knob !== 'OFF' && this.knob !== 'Z' && !this.booted) this.boot();
      this.changed();
    }

    // ---------------------------------------------------------------- pantalla
    mainPages() {
      const p = this.preset;
      const pw = powerOf(p.power);
      const pages = [`${pw.w}W ${p.traffic}${p.mode === 'LOS' ? ' BW' + p.bw + 'K' : ''}${this.squelch ? ' SQL' : ''}`];
      if (p.crypto === 'CT') {
        const k = this.slots[p.keySlot - 1];
        pages.push(`TEK S${pad(p.keySlot)} ${k ? k.tag : 'VACIO!'}`);
      } else pages.push('PT - SIN CIFRADO');
      const tt = transecType(p.mode);
      if (tt) {
        const t = this.slots[p.transecSlot - 1];
        pages.push(`${tt} S${pad(p.transecSlot)} ${t ? t.tag : 'VACIO!'}`);
      }
      pages.push(`BAT ${Math.ceil(this.battery)}% TOD:${this.todValid ? 'OK' : '--'}`);
      return pages;
    }

    channelLine(p) {
      if (p.mode === 'LOS') return `LOS ${p.mod} ${p.freq.toFixed(4)}`;
      if (p.mode === 'SINCGARS') return `SINC FM  RED ${pad(p.netId, 3)}`;
      if (p.mode === 'HQ') return `HQII AM  RED ${pad(p.hqNet, 3)}`;
      return `SAT CANAL ${pad(p.satChannel)}`;
    }

    view_BOOT() {
      const s = this.screen.step;
      return ['AN/PRC-117F  (SIM)', 'AUTOPRUEBA INICIAL', '#'.repeat(s * 5).padEnd(20, '.'), s >= 3 ? 'CARGANDO PRESETS' : 'VERIFICANDO...'];
    }
    view_ZMSG() {
      return ['** ZEROIZE **', 'BORRADO DE EMERGENCIA', 'TODAS LAS CLAVES', 'ELIMINADAS'];
    }
    view_MAIN() {
      const p = this.preset;
      const pages = this.mainPages();
      this.page = Math.min(this.page, pages.length - 1);
      let l4;
      if (this.tx) l4 = 'TX >>>>>>>>';
      else if (this.rx) l4 = this.rx.clear ? 'RX <<<<<<<<' : 'RX <<<< ????';
      else if (this.env.getConn().antenna === 'NONE') l4 = 'ALARMA: SIN ANTENA';
      else if (this.battery <= 15) l4 = 'BATERIA BAJA';
      else l4 = `PAG ${this.page + 1}/${pages.length}  ▲▼`;
      return [lr(`P${pad(this.cur + 1)} ${p.name}`, p.crypto, W), this.channelLine(p), pages[this.page], l4];
    }
    view_PRESET_ENTRY() {
      return ['SELECCION PRESET', `PRESET: ${this.screen.buf}_`, `(01-${NUM_PRESETS})`, 'ENT=OK  CLR=SALIR'];
    }
    view_MENU() {
      const s = this.screen;
      const items = s.items();
      const start = Math.max(0, Math.min(s.idx - 1, items.length - 3));
      const rows = [];
      for (let i = start; i < Math.min(items.length, start + 3); i++) rows.push((i === s.idx ? '>' : ' ') + items[i].label);
      while (rows.length < 3) rows.push('');
      return [lr(s.title, `${s.idx + 1}/${items.length}`, W), ...rows];
    }
    view_CONFIRM() {
      return ['CONFIRMAR', ...this.screen.lines];
    }
    view_FIELDS() {
      const s = this.screen;
      const p = this.presets[s.p];
      const f = fieldsFor(p);
      s.idx = Math.min(s.idx, f.length - 1);
      const start = Math.max(0, Math.min(s.idx - 1, f.length - 3));
      const rows = [];
      for (let i = start; i < Math.min(f.length, start + 3); i++) {
        rows.push((i === s.idx ? '>' : ' ') + lr(fieldLabel(f[i], p), fieldValue(f[i], p), W - 1));
      }
      while (rows.length < 3) rows.push('');
      return [lr(`P${pad(s.p + 1)} PROGRAMAR`, `${s.idx + 1}/${f.length}`, W), ...rows];
    }
    view_EDIT() {
      const s = this.screen;
      const p = this.presets[s.p];
      const def = FIELDS[s.field];
      let val;
      if (def.type === 'enum') val = def.fmt ? def.fmt(s.val) : String(s.val);
      else val = s.buf ? s.buf + '_' : fieldValue(s.field, p);
      const hint = def.type === 'enum' ? '▲▼ CAMBIAR ENT=OK' : s.field === 'freq' ? '0-9 . ENT=OK CLR=<' : '0-9 ENT=OK CLR=<';
      return [`P${pad(s.p + 1)} ${fieldLabel(s.field, p)}`, `> ${val}${s.field === 'freq' ? ' MHZ' : ''}`, hint, ''];
    }
    view_SLOTINFO() {
      const k = this.slots[this.screen.i];
      if (!k) return [`SLOT ${pad(this.screen.i + 1)}`, 'VACIO', '', 'CLR=VOLVER'];
      return [lr(`SLOT ${pad(this.screen.i + 1)}`, k.type, W), k.tag, `CHK ${k.chk}`, `CARGA ${SIM.hhmmss(k.loadedAt)}`];
    }
    view_INFO() {
      return ['AN/PRC-117F (SIM)', 'SW ENTRENAMIENTO 1.0', 'S/N SIM-0117', `CLAVES ${pad(this.slots.filter(Boolean).length)}/${NUM_SLOTS}`];
    }
    view_TOD() {
      if (!this.screen.done) return ['SINCRONIZAR TOD', 'RECIBIENDO HORA...', '', ''];
      const d = new Date(this.env.now());
      const z = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}Z`;
      return ['SINCRONIZAR TOD', 'TOD SINCRONIZADO', z, 'CLR=VOLVER'];
    }
    view_BIT() {
      const s = this.screen;
      if (!s.done) return ['AUTOPRUEBA BIT', 'PRUEBA EN CURSO...', 'NO TRANSMITIR', ''];
      const r = this.bitResult;
      return [lr('BIT', r.pass ? 'SUPERADA' : 'FALLIDA', W), r.items[s.scroll] || '', r.items[s.scroll + 1] || '', '▲▼ VER   CLR=SALIR'];
    }
    view_LD() {
      const s = this.slots[this.ldSlot - 1];
      return [
        'MODO CARGA (LD)',
        lr(`SLOT DESTINO S${pad(this.ldSlot)}`, '▲▼', W),
        s ? `ACTUAL ${s.type} ${s.tag}` : 'ACTUAL: VACIO',
        this.screen.last || 'ESPERANDO DISPOSITIVO',
      ];
    }
    view_RMT() {
      return ['CONTROL REMOTO', 'PANEL BLOQUEADO', '', 'GIRE A ON PARA LOCAL'];
    }

    display() {
      const blank = { lines: ['', '', '', ''], ann: {}, lit: false };
      if (this.knob === 'OFF' || this.screen.id === 'OFF' || this.battery <= 0) return blank;
      const view = this['view_' + this.screen.id];
      if (!view) return blank;
      const lines = view.call(this).slice(0, 4);
      while (lines.length < 4) lines.push('');
      if (this.msg && this.screen.id !== 'BOOT' && this.screen.id !== 'ZMSG') lines[3] = this.msg;
      const p = this.preset;
      return {
        lines: lines.map((l) => fit(l, W)),
        lit: true,
        ann: {
          TX: this.tx,
          RX: !!this.rx,
          CT: this.booted && p.crypto === 'CT',
          MODE: this.booted ? MODE_SHORT[p.mode] : '',
          BAT: this.battery <= 15,
          LD: this.knob === 'LD',
        },
      };
    }

    // ---------------------------------------------------------------- persistencia
    serialize() {
      return {
        presets: this.presets,
        slots: this.slots,
        cur: this.cur,
        volume: this.volume,
        light: this.light,
        squelch: this.squelch,
        keyTone: this.keyTone,
        battery: this.battery,
        ldSlot: this.ldSlot,
      };
    }

    load(o) {
      if (!o || typeof o !== 'object') return;
      if (Array.isArray(o.presets) && o.presets.length === NUM_PRESETS) {
        const def = defaultPresets();
        this.presets = o.presets.map((p, i) => Object.assign(def[i], p));
      }
      if (Array.isArray(o.slots) && o.slots.length === NUM_SLOTS) this.slots = o.slots.map((s) => (s && s.tag ? s : null));
      if (Number.isInteger(o.cur) && o.cur >= 0 && o.cur < NUM_PRESETS) this.cur = o.cur;
      if (Number.isFinite(o.volume)) this.volume = Math.max(0, Math.min(8, o.volume));
      if (typeof o.light === 'boolean') this.light = o.light;
      if (typeof o.squelch === 'boolean') this.squelch = o.squelch;
      if (typeof o.keyTone === 'boolean') this.keyTone = o.keyTone;
      if (Number.isFinite(o.battery)) this.battery = Math.max(0, Math.min(100, o.battery));
      if (Number.isInteger(o.ldSlot) && o.ldSlot >= 1 && o.ldSlot <= NUM_SLOTS) this.ldSlot = o.ldSlot;
      this.changed();
    }

    setVolume(v) {
      this.volume = Math.max(0, Math.min(8, v));
      this.changed();
    }
  }

  Radio.MODES = MODES;
  Radio.POWER = POWER;
  Radio.NUM_PRESETS = NUM_PRESETS;
  Radio.NUM_SLOTS = NUM_SLOTS;
  Radio.KNOB = KNOB;
  Radio.BANDS = BANDS;
  Radio.fieldsFor = fieldsFor;
  Radio.validateNum = validateNum;
  Radio.powerOf = powerOf;
  Radio.transecType = transecType;
  SIM.Radio = Radio;
})(typeof window !== 'undefined' ? window : globalThis);
