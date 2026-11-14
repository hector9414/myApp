/* Interfaz principal: conecta los modelos con la página. */
(function () {
  'use strict';
  const SIM = window.SIM;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const STORE = 'sim-prc117f-skl-v2';

  const DEFAULT_CONN = { j1: 'NONE', j5: false, j8: 'NONE', az: 0, el: 0, cik: false };
  const conn = Object.assign({}, DEFAULT_CONN);
  const prefs = { hints: true, voice: false, call: 'Lobo 2', scenario: 'bit' };
  let completed = {};

  const radio = new SIM.Radio({ getConn: () => conn });
  const skl = new SIM.SKL({ cik: () => conn.cik });
  SIM.connectFill(() => conn, radio, skl);
  const net = new SIM.Net(radio, { myCall: () => prefs.call.trim() || 'Lobo 2' });
  radio.env.net = net;

  // ------------------------------------------------------------------ persistencia
  function load() {
    let data = null;
    try { data = JSON.parse(localStorage.getItem(STORE) || 'null'); } catch (e) { data = null; }
    if (!data) return;
    try {
      radio.load(data.radio);
      skl.load(data.skl);
      if (data.conn) for (const k of Object.keys(DEFAULT_CONN)) if (k in data.conn) conn[k] = data.conn[k];
      conn.j1 = conn.j1 === 'SKL' ? 'NONE' : conn.j1; // al abrir, nunca con el SKL ya conectado
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

  // ------------------------------------------------------------------ avisos y registro
  function toast(text, kind = 'info') {
    const el = document.createElement('div');
    el.className = 'toast ' + kind;
    el.textContent = text;
    $('#toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), 4200);
    setTimeout(() => el.remove(), 4800);
  }

  const logEl = $('#log');
  function addLog({ dir, from, text, meta, quality }) {
    const li = document.createElement('li');
    li.className = 'log-' + dir.toLowerCase();
    const badge = { TX: 'TX', RX: 'RX', INFO: 'INFO', HINT: 'AYUDA', FILL: 'COMSEC', WARN: 'ALERTA' }[dir] || dir;
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
    while (logEl.children.length > 200) logEl.firstChild.remove();
    logEl.scrollTop = logEl.scrollHeight;
  }
  const hint = (text) => prefs.hints && addLog({ dir: 'HINT', text });

  // ------------------------------------------------------------------ radio
  const lcdLines = $$('#radio-lcd .lcd-line');
  const SW_ANGLE = { CLR: -140, ZALL: -100, OFF: -60, PT: -20, CT: 20, TD: 60, RV: 100, LD: 140 };
  const escHtml = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const lcdHtml = (line) => escHtml(line).replace(/\u0001/g, '<span class="blink">').replace(/\u0002/g, '</span>');

  function renderRadio() {
    const d = radio.display();
    lcdLines.forEach((el, i) => {
      const html = lcdHtml(d.lines[i]);
      if (el.innerHTML !== html) el.innerHTML = html;
    });
    const lcd = $('#radio-lcd');
    lcd.classList.toggle('on', d.lit);
    lcd.dataset.light = d.lit ? String(d.light || 0) : '0';
    $('#func-switch').style.setProperty('--angle', SW_ANGLE[radio.sw] + 'deg');
    $$('.knob-pos').forEach((b) => {
      b.classList.toggle('active', b.dataset.sw === radio.sw);
      b.setAttribute('aria-pressed', String(b.dataset.sw === radio.sw));
    });
    const bat = Math.ceil(radio.battery);
    $('#bat-meter i').style.width = (d.lit ? bat : 0) + '%';
    $('#bat-meter').classList.toggle('low', bat <= 15);
    $('#bat-bar').style.width = bat + '%';
    $('#bat-bar').className = bat <= 15 ? 'low' : '';
    $('#bat-text').textContent = bat + ' %';
    SIM.audio.volume = radio.volume / 8;
    $('#ptt').classList.toggle('tx', radio.tx);
  }

  function renderConn() {
    $$('input[name="j1"]').forEach((r) => { r.checked = r.value === conn.j1; });
    $$('input[name="j8"]').forEach((r) => { r.checked = r.value === conn.j8; });
    $('#conn-j5').checked = conn.j5;
    $('#conn-cik').checked = conn.cik;
    if (document.activeElement !== $('#conn-az')) $('#conn-az').value = conn.az;
    if (document.activeElement !== $('#conn-el')) $('#conn-el').value = conn.el;
    $('#pointing').disabled = conn.j8 !== 'SATCOM';
    $('#port-j1').classList.toggle('connected', conn.j1 !== 'NONE');
    $('#port-j1').classList.toggle('fill', conn.j1 === 'SKL');
    $('#j1-what').textContent = { NONE: '—', HANDSET: 'H-250', SKL: 'SKL' }[conn.j1];
    $('#port-j5').classList.toggle('connected', conn.j5);
    $('#port-j8').classList.toggle('connected', conn.j8 !== 'NONE');
    $('#j8-what').textContent = { NONE: '—', FLEX: 'FLEX', SATCOM: 'SATCOM' }[conn.j8];
    $('#skl-fill').classList.toggle('connected', conn.j1 === 'SKL');
    $('#cik-slot').classList.toggle('connected', conn.cik);
    $('#handset').classList.toggle('disconnected', conn.j1 !== 'HANDSET');
    $('#handset-state').textContent = conn.j1 === 'HANDSET' ? 'conectado a J1' : 'no conectado';
    $('#ptt').disabled = conn.j1 !== 'HANDSET';
  }

  // ------------------------------------------------------------------ SKL
  let lastSkl = '';
  function renderSKL() {
    const el = $('#skl-screen');
    el.className = 'skl-screen' + (skl.power ? ' on' : '');
    const html = SIM.renderSKL(skl, { hints: prefs.hints });
    if (html !== lastSkl) {
      lastSkl = html;
      el.innerHTML = html;
      const user = el.querySelector('input[name="user"]');
      if (user) user.focus({ preventScroll: true });
    }
    $('#skl-kov').className = 'kov ' + (skl.kov === 'GREEN' ? 'green' : '');
    const b = Math.ceil(skl.battery);
    const col = b > 40 ? 'g' : b > 10 ? 'a' : 'r';
    $('#skl-bat').className = 'skl-bat ' + (skl.power ? col : 'off');
    $('#skl-bat i').style.setProperty('--w', b + '%');
    $('#skl-bat b').textContent = skl.power ? b + ' %' : '';
    $('#skl-bat-bar').style.width = b + '%';
    $('#skl-bat-bar').className = col === 'r' ? 'low' : col === 'a' ? 'mid' : '';
    $('#skl-bat-text').textContent = b + ' %';
  }

  // ------------------------------------------------------------------ ejercicios
  function renderScenarios() {
    const ctx = { radio, skl, net, conn };
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
    $('#sc-list').innerHTML = SIM.SCENARIOS.map((sc, i) => `
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
    const N = SIM.Net;
    $('#stations').innerHTML = N.STATIONS.map((s) => `<li><b>${s.call}</b>: ${s.desc}</li>`).join('')
      + `<li><b>Satélite ${N.SATELLITE.name}</b>: azimut ${N.SATELLITE.az}°, elevación ${N.SATELLITE.el}° (prueba RSSI ≥ 80).</li>`
      + '<li><b>Códigos de frecuencia SATCOM (tabla de entrenamiento)</b>: 009-128 = 25 kHz, 129-239 = 5 kHz, 999 = manual. El 150 es RX 247,70500 / TX 296,20500 MHz.</li>';
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
  /** Conectar un dispositivo de llenado a J1 fuera de LD/RV hace transmitir a la radio (aviso del curso). */
  function checkFillHazard() {
    if (conn.j1 === 'SKL' && radio.operating) {
      radio.fillHazard();
    }
  }

  radio.on('change', () => { renderAll(); save(); });
  radio.on('beep', () => SIM.audio.beep());
  radio.on('squelch-tail', () => SIM.audio.noise(180));
  radio.on('fill', (e) => {
    const where = e.loadset ? `loadset ${e.loadset}` : `${e.req.crypto} ${e.req.keyType}${e.req.keyType === 'KEK' || e.req.keyType === 'TRKEK' ? '' : ' ' + SIM.pad(e.req.num)}`;
    if (e.ok) addLog({ dir: 'FILL', text: `Radio: FILL DONE · ${e.key ? e.key.tag + ' → ' : ''}${where}${e.protocol ? ' (' + e.protocol + ')' : ''}.` });
    else {
      addLog({ dir: 'WARN', text: `Radio: BAD FILL · ${where}.` });
      if (e.reason) hint(e.reason);
    }
  });
  radio.on('zeroize', (e) => addLog({ dir: 'FILL', text: e.black && e.all ? 'Radio: CLR · programación y COMSEC borrados.' : e.black ? 'Radio: ZERO · programación borrada (COMSEC conservado).' : `Radio: ${e.source} · COMSEC y TRANSEC borrados.` }));
  radio.on('bit', (r) => addLog({ dir: 'INFO', text: `Radio: ${r.pass ? 'BIT PASSED' : 'BIT FAILED'}.` }));
  radio.on('tod', (e) => addLog({ dir: 'INFO', text: `Radio: TOD ${e.kind}${e.via ? ' por ' + e.via : ''} establecido.` }));
  radio.on('rssi', (r) => addLog({ dir: 'INFO', text: `Radio: prueba RSSI ${r.score} (${r.score >= 80 ? 'apuntamiento correcto' : 'reoriente la antena'}).` }));
  radio.on('dama', (d) => {
    if (d.ok) addLog({ dir: 'INFO', text: `DAMA: ${d.status}${d.dest ? ' → ' + d.dest.join(', ') : ''}.` });
    else {
      addLog({ dir: 'WARN', text: `DAMA: error ${d.code}.` });
      if (d.reason) hint(`DAMA error ${d.code}: ${d.reason}.`);
    }
  });
  radio.on('hazard', () => {
    addLog({ dir: 'WARN', text: 'Radio: dispositivo de llenado conectado a J1 fuera de LD/RV. La radio ha transmitido automáticamente.' });
    toast('¡Peligro! Conecte el dispositivo de llenado solo con el interruptor en LD o RV, y desconéctelo antes de volver a PT/CT/TD.', 'warn');
  });
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
  $('.kdu').addEventListener('click', (e) => {
    const b = e.target.closest('[data-key]');
    if (!b) return;
    SIM.audio.unlock();
    radio.press(b.dataset.key);
  });

  $$('.knob-pos').forEach((b) => b.addEventListener('click', () => {
    SIM.audio.unlock();
    const pos = b.dataset.sw;
    if (pos === 'ZALL' && !window.confirm('Z-ALL: se borrarán todas las claves COMSEC y los datos de salto (TRANSEC). La programación se conserva.\n\n¿Continuar?')) return;
    if (pos === 'CLR' && !window.confirm('CLR: desconecta la batería de mantenimiento y borra TODA la programación y el COMSEC.\n\n¿Continuar?')) return;
    const wasLd = radio.sw === 'LD';
    radio.setSwitch(pos);
    if (wasLd && conn.j1 === 'SKL' && ['PT', 'CT', 'TD'].includes(pos)) setTimeout(checkFillHazard, 0);
  }));

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
  $('#tx-text').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.target.blur();
      toast('Mensaje listo: mantenga pulsado PTT (o la barra espaciadora) para transmitir.');
    }
  });

  // teclado físico
  const KEYMAP = {
    Enter: 'ENT', Backspace: 'CLR', Escape: 'CLR', Delete: 'CLR',
    ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
    PageUp: 'PRE+', PageDown: 'PRE-',
  };
  const typing = (el) => el && ((el.tagName === 'INPUT' && !['checkbox', 'radio'].includes(el.type)) || el.tagName === 'TEXTAREA' || el.isContentEditable);
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
    if (e.key === ' ') {
      e.preventDefault();
      if (!e.repeat) pttStart();
      return;
    }
    if (e.target.tagName === 'BUTTON' && e.key === 'Enter' && !e.target.closest('.radio')) return;
    const k = /^[0-9]$/.test(e.key) ? e.key : KEYMAP[e.key];
    if (!k) return;
    e.preventDefault();
    SIM.audio.unlock();
    radio.press(k);
    const b = document.querySelector(`.kdu [data-key="${CSS.escape(k === 'UP' ? '6' : k === 'DOWN' ? '9' : k)}"]`);
    if (b) {
      b.classList.add('pressed');
      setTimeout(() => b.classList.remove('pressed'), 120);
    }
  });
  document.addEventListener('keyup', (e) => {
    if (e.key !== ' ' || typing(e.target)) return;
    e.preventDefault();
    pttStop();
  });
  window.addEventListener('blur', pttStop);

  // ------------------------------------------------------------------ controles del SKL
  $('#skl-power').addEventListener('click', () => { SIM.audio.unlock(); skl.powerButton(); });
  $('#skl-zero').addEventListener('click', () => {
    if (!skl.power) return toast('El SKL está apagado.', 'warn');
    if (window.confirm('ZEROIZE del SKL: se borrarán TODAS las claves y loadsets.\n\n¿Continuar?')) skl.zeroize();
  });
  $('#skl-screen').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    SIM.audio.beep(2400, 25);
    skl.act(b.dataset.act, b.dataset.arg);
  });
  $('#skl-screen').addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.dataset.form === 'login') skl.act('login', { user: f.user.value, pass: f.pass.value });
  });

  // ------------------------------------------------------------------ conexiones
  $$('input[name="j1"]').forEach((r) => r.addEventListener('change', () => {
    const prev = conn.j1;
    conn.j1 = r.value;
    if (prev === 'HANDSET') pttStop();
    if (conn.j1 === 'SKL') checkFillHazard();
    renderAll();
    save();
  }));
  $$('input[name="j8"]').forEach((r) => r.addEventListener('change', () => { conn.j8 = r.value; renderAll(); save(); }));
  $('#conn-j5').addEventListener('change', (e) => { conn.j5 = e.target.checked; renderAll(); save(); });
  const clampIn = (el, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(el.value) || 0)));
  $('#conn-az').addEventListener('change', (e) => { conn.az = clampIn(e.target, 0, 359); renderAll(); save(); });
  $('#conn-el').addEventListener('change', (e) => { conn.el = clampIn(e.target, 0, 90); renderAll(); save(); });
  $('#conn-cik').addEventListener('change', (e) => {
    conn.cik = e.target.checked;
    if (skl.power) {
      skl.cikChanged();
      toast('El CIK solo debe insertarse o retirarse con el SKL apagado (queda registrado en la auditoría).', 'warn');
    }
    renderAll();
    save();
  });
  $('#bat-replace').addEventListener('click', () => { radio.replaceBattery(); toast('Batería de la radio reemplazada.', 'ok'); });
  $('#skl-bat-replace').addEventListener('click', () => { skl.replaceBattery(); toast('Batería del SKL recargada.', 'ok'); });

  // ------------------------------------------------------------------ cabecera
  $('#my-call').addEventListener('input', (e) => { prefs.call = e.target.value; save(); });
  $('#pref-hints').addEventListener('change', (e) => { prefs.hints = e.target.checked; lastSkl = ''; renderAll(); save(); });
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
    skl.tick(1);
    net.tick();
  }, 1000);

  window.SIM_APP = { radio, skl, net, conn, prefs };
})();
