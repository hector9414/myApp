/* Interfaz principal: conecta los modelos con la página. */
(function () {
  'use strict';
  const SIM = window.SIM;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const STORE = 'sim-prc117f-skl-v1';

  const DEFAULT_CONN = { antenna: 'NONE', handset: false, fillCable: false, cik: false };
  const conn = Object.assign({}, DEFAULT_CONN);
  const prefs = { hints: true, voice: false, call: 'Lobo 2', scenario: 'bit' };
  let completed = {};

  const radio = new SIM.Radio({ getConn: () => conn });
  const skl = new SIM.SKL({ cik: () => conn.cik, fill: SIM.makeFillBridge(() => conn, radio) });
  const net = new SIM.Net(radio, { myCall: () => prefs.call.trim() || 'Lobo 2' });

  // ------------------------------------------------------------------ persistencia
  function load() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { data = null; }
    if (!data) return;
    try {
      radio.load(data.radio);
      skl.load(data.skl);
      if (data.conn) for (const k of Object.keys(DEFAULT_CONN)) if (k in data.conn) conn[k] = data.conn[k];
      if (data.prefs) Object.assign(prefs, data.prefs);
      if (data.completed) completed = data.completed;
    } catch (e) { /* estado corrupto: se ignora */ }
  }
  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORE, JSON.stringify({ radio: radio.serialize(), skl: skl.serialize(), conn, prefs, completed }));
      } catch (e) { /* almacenamiento no disponible */ }
    }, 400);
  }

  // ------------------------------------------------------------------ avisos
  function toast(text, kind = 'info') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = text;
    $('#toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), 3600);
    setTimeout(() => el.remove(), 4200);
  }

  const logEl = $('#log');
  function addLog({ dir, from, text, meta, quality }) {
    const li = document.createElement('li');
    li.className = 'log-' + dir.toLowerCase();
    const badge = { TX: 'TX', RX: 'RX', INFO: 'INFO', HINT: 'AYUDA', FILL: 'CLAVES' }[dir] || dir;
    li.innerHTML = `<time>${SIM.hhmmss(Date.now())}</time><span class="badge">${badge}</span><div class="log-body"></div>`;
    const body = li.querySelector('.log-body');
    if (from) {
      const b = document.createElement('b');
      b.textContent = from + ': ';
      body.appendChild(b);
    }
    body.appendChild(document.createTextNode(text));
    if (meta || quality) {
      const m = document.createElement('small');
      m.textContent = [meta, quality ? 'calidad: ' + quality : ''].filter(Boolean).join(' · ');
      body.appendChild(m);
    }
    logEl.appendChild(li);
    while (logEl.children.length > 150) logEl.firstChild.remove();
    logEl.scrollTop = logEl.scrollHeight;
  }
  const hint = (text) => prefs.hints && addLog({ dir: 'HINT', text });

  // ------------------------------------------------------------------ radio
  const lcdLines = $$('#radio-lcd .lcd-line');
  const KNOB_ANGLE = { Z: -120, OFF: -60, ON: 0, LD: 60, RMT: 120 };

  function renderRadio() {
    const d = radio.display();
    lcdLines.forEach((el, i) => { el.textContent = d.lines[i]; });
    const lcd = $('#radio-lcd');
    lcd.classList.toggle('on', d.lit);
    lcd.classList.toggle('backlight', d.lit && radio.light);
    $$('#radio-ann [data-ann]').forEach((el) => {
      const k = el.dataset.ann;
      if (k === 'MODE') el.textContent = d.ann.MODE || '';
      el.classList.toggle('active', !!d.ann[k]);
    });
    $('#func-knob').style.setProperty('--angle', KNOB_ANGLE[radio.knob] + 'deg');
    $$('.knob-pos').forEach((b) => {
      b.classList.toggle('active', b.dataset.knob === radio.knob);
      b.setAttribute('aria-pressed', String(b.dataset.knob === radio.knob));
    });
    $('#vol-value').textContent = radio.volume;
    SIM.audio.volume = radio.volume / 8;
    $('#ptt').classList.toggle('tx', radio.tx);
    const bat = Math.ceil(radio.battery);
    $('#bat-bar').style.width = bat + '%';
    $('#bat-bar').className = bat <= 15 ? 'low' : '';
    $('#bat-text').textContent = bat + ' %';
  }

  function renderConn() {
    $$('input[name="antenna"]').forEach((r) => { r.checked = r.value === conn.antenna; });
    $('#conn-handset').checked = conn.handset;
    $('#conn-fill').checked = conn.fillCable;
    $('#conn-cik').checked = conn.cik;
    $('#port-ant').classList.toggle('connected', conn.antenna !== 'NONE');
    $('#port-ant').title = { NONE: 'Sin antena', WHIP: 'Antena de látigo', SATCOM: 'Antena SATCOM' }[conn.antenna];
    $('#port-audio').classList.toggle('connected', conn.handset);
    $('#port-fill').classList.toggle('connected', conn.fillCable);
    $('#skl-fill').classList.toggle('connected', conn.fillCable);
    $('#cik-slot').classList.toggle('connected', conn.cik);
    $('#handset').classList.toggle('disconnected', !conn.handset);
    $('#handset-state').textContent = conn.handset ? 'conectado' : 'desconectado';
    $('#ptt').disabled = !conn.handset;
  }

  // ------------------------------------------------------------------ SKL
  function renderSKL() {
    const el = $('#skl-screen');
    el.className = 'skl-screen' + (skl.power ? ' on' : '');
    el.innerHTML = SIM.renderSKL(skl, { hints: prefs.hints });
  }

  // ------------------------------------------------------------------ ejercicios
  function renderScenarios() {
    const ctx = { radio, skl, net, conn };
    const list = $('#sc-list');
    const results = {};
    SIM.SCENARIOS.forEach((sc) => {
      results[sc.id] = SIM.evaluateScenario(sc, ctx);
      if (!completed[sc.id] && results[sc.id].every((c) => c.ok)) {
        completed[sc.id] = true;
        toast(`Ejercicio completado: ${sc.title}`, 'ok');
        addLog({ dir: 'INFO', text: `✔ Ejercicio completado: ${sc.title}` });
        save();
      }
    });
    list.innerHTML = SIM.SCENARIOS.map((sc, i) => `
      <button type="button" class="sc-item${prefs.scenario === sc.id ? ' active' : ''}${completed[sc.id] ? ' done' : ''}" data-sc="${sc.id}">
        <span class="sc-num">${completed[sc.id] ? '✓' : i + 1}</span>
        <span class="sc-name">${sc.title}</span>
        <span class="sc-level">${sc.level}</span>
      </button>`).join('');
    const sc = SIM.SCENARIOS.find((s) => s.id === prefs.scenario);
    const det = $('#sc-detail');
    if (!sc) {
      det.innerHTML = '<p class="muted">Seleccione un ejercicio o practique libremente.</p>';
      return;
    }
    const res = results[sc.id];
    const done = res.filter((c) => c.ok).length;
    det.innerHTML = `
      <h3>${sc.title}</h3>
      <p class="goal">${sc.goal}</p>
      <ol class="steps">${sc.steps.map((s) => `<li>${s}</li>`).join('')}</ol>
      <div class="progress"><div style="width:${Math.round((done / res.length) * 100)}%"></div></div>
      <ul class="checks">${res.map((c) => `<li class="${c.ok ? 'ok' : ''}"><span>${c.ok ? '✓' : '○'}</span>${c.label}</li>`).join('')}</ul>`;
  }

  function renderStations() {
    $('#stations').innerHTML = SIM.Net.STATIONS.map((s) => `<li><b>${s.call}</b>: ${s.desc}</li>`).join('');
  }

  let frame = null;
  function renderAll() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = null;
      renderRadio();
      renderConn();
      renderSKL();
      renderScenarios();
    });
  }

  // ------------------------------------------------------------------ eventos de los modelos
  radio.on('change', () => { renderAll(); save(); });
  radio.on('beep', () => SIM.audio.beep());
  radio.on('squelch-tail', () => SIM.audio.noise(180));
  radio.on('fill', ({ slot, key, overwritten }) => addLog({ dir: 'FILL', text: `Radio: ${key.type} ${key.tag} recibida en el slot ${SIM.pad(slot)}${overwritten ? ' (sobrescribe la anterior)' : ''}.` }));
  radio.on('zeroize', (e) => addLog({ dir: 'FILL', text: e.all ? `Radio: zeroize, todas las claves borradas (${e.source}).` : `Radio: slot ${SIM.pad(e.slot)} borrado.` }));
  radio.on('bit', (r) => addLog({ dir: 'INFO', text: `Autoprueba BIT ${r.pass ? 'SUPERADA' : 'FALLIDA'}.` }));
  radio.on('tod', () => addLog({ dir: 'INFO', text: 'Hora TOD sincronizada.' }));
  radio.on('dead', () => toast('La batería de la radio se ha agotado. Reemplácela en «Conexiones».', 'warn'));
  skl.on('change', () => { renderAll(); save(); });
  net.on('log', (l) => {
    addLog(l);
    if (l.dir === 'RX') {
      SIM.audio.noise(90);
      if (prefs.voice && l.text && !l.text.startsWith('[')) SIM.audio.speak(l.text);
    }
  });
  net.on('hint', hint);
  net.on('contact', renderAll);

  // ------------------------------------------------------------------ controles de la radio
  $('#radio-keypad').addEventListener('click', (e) => {
    const b = e.target.closest('[data-key]');
    if (!b) return;
    SIM.audio.unlock();
    radio.press(b.dataset.key);
  });

  $$('.knob-pos').forEach((b) => b.addEventListener('click', () => {
    SIM.audio.unlock();
    const pos = b.dataset.knob;
    if (pos === 'Z' && !window.confirm('Posición Z: borrado de emergencia de TODAS las claves de la radio.\n\n¿Continuar?')) return;
    radio.setKnob(pos);
  }));

  $('#vol-up').addEventListener('click', () => radio.setVolume(radio.volume + 1));
  $('#vol-down').addEventListener('click', () => radio.setVolume(radio.volume - 1));

  let pttActive = false;
  function pttStart() {
    if (pttActive) return;
    SIM.audio.unlock();
    SIM.audio.stopSpeech();
    const r = radio.pttDown();
    if (!r.ok) {
      toast(r.reason, 'warn');
      return;
    }
    pttActive = true;
    SIM.audio.beep(1000, 60);
  }
  function pttStop() {
    if (!pttActive) return;
    pttActive = false;
    radio.pttUp($('#tx-text').value.trim());
  }
  const ptt = $('#ptt');
  ptt.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { ptt.setPointerCapture(e.pointerId); } catch (err) { /* nada */ }
    pttStart();
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((ev) => ptt.addEventListener(ev, pttStop));
  ptt.addEventListener('contextmenu', (e) => e.preventDefault());
  ptt.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter') && !e.repeat) { e.preventDefault(); pttStart(); }
  });
  ptt.addEventListener('keyup', (e) => { if (e.key === 'Enter') pttStop(); });
  $('#tx-text').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); toast('Mensaje listo: mantenga pulsado PTT (o la barra espaciadora) para transmitir.'); }
  });

  // teclado físico
  const KEYMAP = {
    Enter: 'ENT', Backspace: 'CLR', Escape: 'CLR', Delete: 'CLR',
    ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
    '.': '.', ',': '.', p: 'PGM', o: 'OPT', m: 'MODE', c: 'CTPT', l: 'LUZ', '+': 'PRE+', '-': 'PRE-',
  };
  const typing = (el) => el && (el.tagName === 'INPUT' && !['checkbox', 'radio'].includes(el.type) || el.tagName === 'TEXTAREA' || el.isContentEditable);
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
    if (e.key === ' ') {
      e.preventDefault();
      if (!e.repeat) pttStart();
      return;
    }
    // Intro sobre un botón fuera de la radio (SKL, ejercicios…) activa ese botón
    if (e.target.tagName === 'BUTTON' && e.key === 'Enter' && !e.target.closest('.radio')) return;
    const k = /^[0-9]$/.test(e.key) ? e.key : KEYMAP[e.key] || KEYMAP[e.key.toLowerCase()];
    if (!k) return;
    e.preventDefault();
    SIM.audio.unlock();
    radio.press(k);
    const b = document.querySelector(`#radio-keypad [data-key="${CSS.escape(k)}"]`);
    if (b) { b.classList.add('pressed'); setTimeout(() => b.classList.remove('pressed'), 120); }
  });
  document.addEventListener('keyup', (e) => {
    if (e.key !== ' ' || typing(e.target)) return;
    e.preventDefault(); // evita que la barra active el botón enfocado
    pttStop();
  });
  window.addEventListener('blur', pttStop);

  // ------------------------------------------------------------------ controles del SKL
  $('#skl-power').addEventListener('click', () => { SIM.audio.unlock(); skl.powerButton(); });
  $('#skl-screen').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    SIM.audio.beep(2400, 25);
    skl.act(b.dataset.act, b.dataset.arg);
  });

  // ------------------------------------------------------------------ conexiones
  $$('input[name="antenna"]').forEach((r) => r.addEventListener('change', () => {
    conn.antenna = r.value;
    if (radio.tx) toast('Cambiar la antena durante la transmisión puede dañar el amplificador.', 'warn');
    radio.changed();
  }));
  $('#conn-handset').addEventListener('change', (e) => { conn.handset = e.target.checked; if (!conn.handset) pttStop(); radio.changed(); });
  $('#conn-fill').addEventListener('change', (e) => { conn.fillCable = e.target.checked; radio.changed(); });
  $('#conn-cik').addEventListener('change', (e) => { conn.cik = e.target.checked; skl.cikChanged(); renderAll(); save(); });
  $('#bat-replace').addEventListener('click', () => { radio.replaceBattery(); toast('Batería reemplazada.', 'ok'); });

  // ------------------------------------------------------------------ cabecera
  $('#my-call').value = prefs.call;
  $('#my-call').addEventListener('input', (e) => { prefs.call = e.target.value; save(); });
  $('#pref-hints').checked = prefs.hints;
  $('#pref-hints').addEventListener('change', (e) => { prefs.hints = e.target.checked; renderAll(); save(); });
  $('#pref-voice').checked = prefs.voice;
  $('#pref-voice').addEventListener('change', (e) => { prefs.voice = e.target.checked; if (!prefs.voice) SIM.audio.stopSpeech(); save(); });
  $('#btn-reset').addEventListener('click', () => {
    if (!window.confirm('Se borrarán presets, claves, auditoría y progreso de los ejercicios. ¿Reiniciar?')) return;
    try { localStorage.removeItem(STORE); } catch (e) { /* nada */ }
    net.reset();
    radio.hardReset();
    skl.hardReset();
    Object.assign(conn, DEFAULT_CONN);
    completed = {};
    logEl.innerHTML = '';
    addLog({ dir: 'INFO', text: 'Simulador reiniciado.' });
    renderAll();
  });
  $('#log-clear').addEventListener('click', () => { logEl.innerHTML = ''; });
  $('#sc-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-sc]');
    if (!b) return;
    prefs.scenario = prefs.scenario === b.dataset.sc ? null : b.dataset.sc;
    renderAll();
    save();
  });

  // ------------------------------------------------------------------ arranque
  load();
  $('#my-call').value = prefs.call;
  $('#pref-hints').checked = prefs.hints;
  $('#pref-voice').checked = prefs.voice;
  renderStations();
  renderAll();
  addLog({ dir: 'INFO', text: 'Simulador listo. Empiece por el ejercicio 1 o practique libremente.' });

  setInterval(() => {
    radio.tick(1);
    net.tick();
  }, 1000);

  window.SIM_APP = { radio, skl, net, conn, prefs };
})();
