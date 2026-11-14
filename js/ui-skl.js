/* Pantalla táctil del SKL AN/PYQ-10: genera el HTML de cada pantalla. */
(function (g) {
  'use strict';
  const SIM = g.SIM;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const btn = (label, act, arg, cls = '') =>
    `<button type="button" class="sk-btn ${cls}" data-act="${act}"${arg != null ? ` data-arg="${esc(arg)}"` : ''}>${label}</button>`;

  function statusBar(skl) {
    return `<div class="sk-status"><span>SKL · OPERADOR</span><span>${esc(skl.protocol)}</span><span>${SIM.hhmmss(skl.env.now()).slice(0, 5)}</span></div>`;
  }
  function titleBar(title, backTo = 'HOME') {
    return `<div class="sk-title">${btn('◄', 'go', backTo, 'sk-back')}<span>${esc(title)}</span></div>`;
  }
  function keyState(skl, k) {
    if (skl.isExpired(k)) return '<span class="sk-badge bad">CADUCADA</span>';
    if (skl.isPending(k)) return '<span class="sk-badge warn">NO VIGENTE</span>';
    return '<span class="sk-badge ok">VIGENTE</span>';
  }
  const msg = (skl) => (skl.message ? `<p class="sk-msg">${esc(skl.message)}</p>` : '');

  const screens = {
    OFF: () => '',
    BOOT: () => `<div class="sk-center"><div class="sk-logo">AN/PYQ-10</div><p>Simple Key Loader</p><div class="sk-spinner"></div><p class="sk-small">Iniciando KOV-21 y aplicación de usuario…</p></div>`,
    CIK: () => `<div class="sk-center"><div class="sk-icon">🔑</div><p><b>Inserte el CIK</b></p><p class="sk-small">La llave de encendido criptográfico es necesaria para acceder al equipo. Actívela en «Conexiones».</p></div>`,
    LOCKED: () => `<div class="sk-center"><div class="sk-icon">⛔</div><p><b>Equipo bloqueado</b></p><p class="sk-small">Se superó el número de intentos de PIN. Requiere intervención del administrador.</p>${btn('Desbloqueo (instructor)', 'adminUnlock')}</div>`,
    PIN(skl, o) {
      const dots = '●'.repeat(skl.pin.length) + '○'.repeat(Math.max(0, 4 - skl.pin.length));
      const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => btn(d, 'pinDigit', d)).join('');
      return `<div class="sk-title"><span>Inicio de sesión</span></div>
        <div class="sk-body sk-pin">
          <p>Usuario: <b>OPERADOR</b></p>
          <div class="sk-dots" aria-label="PIN introducido">${dots}</div>
          ${msg(skl)}
          <div class="sk-keypad">${keys}${btn('⌫', 'pinBack')}${btn('0', 'pinDigit', '0')}${btn('OK', 'pinOk', null, 'primary')}</div>
          ${o.hints ? `<p class="sk-small">PIN de entrenamiento: ${SIM.SKL.TRAINING_PIN}</p>` : ''}
        </div>`;
    },
    HOME(skl) {
      const tiles = [
        ['🗝️', 'Claves', 'go', 'KEYS'],
        ['📤', 'Emitir claves', 'go', 'ISSUE'],
        ['📋', 'Auditoría', 'go', 'AUDIT'],
        ['➕', 'Generar', 'go', 'NEW'],
        ['⚙️', 'Configuración', 'go', 'SETTINGS'],
        ['🔥', 'Zeroize', 'go', 'ZERO_CONFIRM'],
      ];
      return `${statusBar(skl)}<div class="sk-body">
        <div class="sk-tiles">${tiles.map(([i, l, a, s]) => `<button type="button" class="sk-tile${s === 'ZERO_CONFIRM' ? ' danger' : ''}" data-act="${a}" data-arg="${s}"><span>${i}</span>${l}</button>`).join('')}</div>
        ${msg(skl)}
        <div class="sk-row end">${btn('Cerrar sesión', 'logout', null, 'ghost')}</div>
      </div>`;
    },
    KEYS(skl) {
      const rows = skl.keys.length
        ? skl.keys.map((k) => `<button type="button" class="sk-item" data-act="detail" data-arg="${esc(k.id)}"><span class="sk-type">${k.type}${k.alg === 'ANDVT' ? '·A' : k.alg ? '·V' : ''}</span><span class="sk-tag">${esc(k.tag)}</span>${keyState(skl, k)}</button>`).join('')
        : '<p class="sk-small">Base de datos vacía.</p>';
      return `${statusBar(skl)}${titleBar(`Claves (${skl.keys.length})`)}<div class="sk-body sk-list">${rows}</div>`;
    },
    DETAIL(skl) {
      const k = skl.keyById(skl.detailId);
      if (!k) return screens.KEYS(skl);
      const sel = skl.selected.includes(k.id);
      return `${statusBar(skl)}${titleBar(k.tag, 'KEYS')}<div class="sk-body">
        <table class="sk-table">
          <tr><th>Tipo</th><td>${k.type} · ${esc(SIM.SKL.KEY_TYPES[k.type] || '')}</td></tr>
          ${k.alg ? `<tr><th>Algoritmo</th><td>${k.alg}</td></tr>` : ''}
          <tr><th>Uso</th><td>${esc(k.desc)}</td></tr>
          <tr><th>Estado</th><td>${keyState(skl, k)}</td></tr>
          <tr><th>Vigencia</th><td>${SIM.fmtDate(k.eff)} → ${SIM.fmtDate(k.exp)}</td></tr>
          <tr><th>Suma control</th><td>${k.chk}</td></tr>
          <tr><th>Emisiones</th><td>${k.issued}</td></tr>
          <tr><th>Clasificación</th><td>${esc(k.cls)}</td></tr>
        </table>
        <div class="sk-row">${btn(sel ? 'Quitar de la emisión' : 'Marcar para emitir', 'toggleSelect', k.id)}${btn('Borrar', 'askDelete', k.id, 'danger')}</div>
      </div>`;
    },
    ISSUE(skl) {
      const rows = skl.keys.length
        ? skl.keys.map((k) => `<label class="sk-item check"><input type="checkbox" data-act="toggleSelect" data-arg="${esc(k.id)}"${skl.selected.includes(k.id) ? ' checked' : ''}><span class="sk-type">${k.type}${k.alg === 'ANDVT' ? '·A' : k.alg ? '·V' : ''}</span><span class="sk-tag">${esc(k.tag)}</span>${keyState(skl, k)}</label>`).join('')
        : '<p class="sk-small">No hay claves para emitir.</p>';
      return `${statusBar(skl)}${titleBar('Emitir claves · seleccionar')}<div class="sk-body sk-list">${rows}</div>
        <div class="sk-foot">${msg(skl)}${btn(`Revisar (${skl.selected.length})`, 'issueReview', null, 'primary')}</div>`;
    },
    ISSUE_CONFIRM(skl) {
      const list = skl.selected.map((id) => skl.keyById(id)).filter(Boolean)
        .map((k) => `<li>${k.type}${k.alg ? ' ' + k.alg : ''} · <b>${esc(k.tag)}</b> ${keyState(skl, k)}</li>`).join('');
      const proto = ['DS-101', 'DS-102'].map((p) => btn(p, 'setProtocol', p, skl.protocol === p ? 'primary' : 'ghost')).join('');
      const target = Object.entries(SIM.SKL.TARGETS).map(([id, name]) => btn(name, 'setTarget', id, skl.target === id ? 'primary' : 'ghost')).join('');
      const tip = skl.target === 'KYK13'
        ? 'Antes de emitir: cable SKL ↔ KYK-13, protocolo <b>DS-102</b>, KYK-13 en <b>ON</b> y en la posición destino.'
        : 'Antes de emitir: FILL de la radio cableado al SKL, radio en <b>LD</b> y slot destino elegido.';
      return `${statusBar(skl)}${titleBar('Emitir claves · revisar', 'ISSUE')}<div class="sk-body">
        <ul class="sk-ul">${list}</ul>
        <p class="sk-small">Equipo destino:</p><div class="sk-row">${target}</div>
        <p class="sk-small">Protocolo de llenado:</p><div class="sk-row">${proto}</div>
        <p class="sk-small">${tip}</p>
        <div class="sk-row end">${btn('Emitir', 'issueGo', null, 'primary')}</div>
      </div>`;
    },
    ISSUING(skl) {
      const j = skl.issue;
      const n = j.queue.length;
      const k = skl.keyById(j.queue[Math.min(j.idx, n - 1)]);
      return `${statusBar(skl)}<div class="sk-center"><p><b>Emitiendo ${Math.min(j.idx + 1, n)} de ${n}</b></p>
        <p>${esc(k ? k.tag : '')}</p><div class="sk-progress"><div style="width:${Math.round((j.idx / n) * 100)}%"></div></div>
        <p class="sk-small">No desconecte el cable de llenado.</p></div>`;
    },
    ISSUE_RESULT(skl) {
      const dest = SIM.SKL.TARGETS[skl.issue.target];
      const rows = skl.issue.results.map((r) => `<li class="${r.ok ? 'ok' : 'bad'}">${r.ok ? '✓' : '✗'} <b>${esc(r.tag)}</b> ${r.ok ? `→ ${dest} ${esc(r.where)}${r.overwritten ? ' (sobrescrito)' : ''}` : '· ' + esc(r.reason)}</li>`).join('');
      return `${statusBar(skl)}${titleBar('Resultado de la emisión')}<div class="sk-body"><ul class="sk-ul result">${rows}</ul>
        <div class="sk-row end">${btn('Emitir otra', 'go', 'ISSUE')}${btn('Inicio', 'go', 'HOME', 'primary')}</div></div>`;
    },
    AUDIT(skl) {
      const rows = skl.audit.length
        ? skl.audit.map((a) => `<li class="${a.ok ? '' : 'bad'}"><time>${SIM.hhmmss(a.t)}</time> <b>${esc(a.action)}</b> ${esc(a.detail)}</li>`).join('')
        : '<li>Sin registros.</li>';
      return `${statusBar(skl)}${titleBar('Auditoría')}<div class="sk-body sk-list"><ol class="sk-audit">${rows}</ol></div>`;
    },
    NEW(skl) {
      const opts = [['TEK:VINSON', 'TEK', 'TEK VINSON (voz 25 kHz)'], ['TEK:ANDVT', 'TEK', 'TEK ANDVT (voz banda estrecha / SATCOM 5 kHz)'], ['TSK', 'TSK', SIM.SKL.KEY_TYPES.TSK], ['WOD', 'WOD', SIM.SKL.KEY_TYPES.WOD], ['KEK', 'KEK', SIM.SKL.KEY_TYPES.KEK]];
      const types = opts.map(([arg, t, label]) => `<button type="button" class="sk-item" data-act="newKey" data-arg="${arg}"><span class="sk-type">${t}</span><span class="sk-tag">${esc(label)}</span></button>`).join('');
      return `${statusBar(skl)}${titleBar('Generar clave de entrenamiento')}<div class="sk-body sk-list">${types}</div>`;
    },
    SETTINGS(skl) {
      const proto = ['DS-101', 'DS-102'].map((p) => btn(p, 'setProtocol', p, skl.protocol === p ? 'primary' : 'ghost')).join('');
      return `${statusBar(skl)}${titleBar('Configuración')}<div class="sk-body">
        <p class="sk-small">Protocolo de llenado por defecto</p><div class="sk-row">${proto}</div>
        <p class="sk-small">Base de datos: ${skl.keys.length} claves · auditoría: ${skl.audit.length} registros</p>
        <div class="sk-row">${btn('Restaurar BD de entrenamiento', 'restoreDb', null, 'ghost')}</div>
        ${msg(skl)}
        <p class="sk-small">AN/PYQ-10 (SIM) · software de entrenamiento 1.0</p>
      </div>`;
    },
    ZERO_CONFIRM(skl) {
      return `${statusBar(skl)}${titleBar('Zeroize')}<div class="sk-center">
        <div class="sk-icon">⚠️</div><p><b>Se borrarán TODAS las claves del SKL (${skl.keys.length}).</b></p>
        <p class="sk-small">Esta acción no se puede deshacer.</p>
        <div class="sk-row">${btn('Cancelar', 'go', 'HOME', 'ghost')}${btn('ZEROIZE', 'zeroize', null, 'danger')}</div></div>`;
    },
    DEL_CONFIRM(skl) {
      const k = skl.keyById(skl.detailId);
      if (!k) return screens.KEYS(skl);
      return `${statusBar(skl)}${titleBar('Borrar clave', 'KEYS')}<div class="sk-center">
        <p>¿Borrar <b>${esc(k.tag)}</b> de la base de datos?</p>
        <div class="sk-row">${btn('Cancelar', 'detail', k.id, 'ghost')}${btn('Borrar', 'delete', k.id, 'danger')}</div></div>`;
    },
  };

  SIM.renderSKL = (skl, opts) => {
    const fn = screens[skl.screen] || screens.OFF;
    return fn(skl, opts || {});
  };
})(window);
