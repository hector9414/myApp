/*
 * Pantalla del SKL AN/PYQ-10: reproduce la interfaz Windows CE del curso
 * (Core Library, UAS, menús, árboles, diálogos y barra de tareas).
 */
(function (g) {
  'use strict';
  const SIM = g.SIM;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nl = (s) => esc(s).replace(/\n/g, '<br>');

  // ------------------------------------------------------------------ iconos (dibujados con CSS/SVG, sin imágenes externas)
  const ICON = {
    st: '<i class="ic ic-st">ST</i>',
    ed: '<i class="ic ic-ed">Ed</i>',
    YELLOW: '<i class="ic ic-key y" title="Key variable stored"></i>',
    PENDING: '<i class="ic ic-key y" title="Not yet effective"></i>',
    RED: '<i class="ic ic-key r" title="Key variable date has expired"></i>',
    TAG: '<i class="ic ic-seg" title="Key variable is needed">Seg</i>',
    EXPTAG: '<i class="ic ic-exp" title="Segment date has expired">Exp</i>',
    eq: '<i class="ic ic-eq"></i>',
    loc: '<i class="ic ic-loc">LOC</i>',
    plat: '<i class="ic ic-plat">♆</i>',
    soi: '<i class="ic ic-soi"></i>',
    soiitem: '<i class="ic ic-dot"></i>',
    hop: '<i class="ic ic-hop">FH</i>',
  };
  const MSGICON = { i: '<i class="ce-mi i">i</i>', '?': '<i class="ce-mi q">?</i>', '!': '<i class="ce-mi w">!</i>' };

  // ------------------------------------------------------------------ menús
  const SEP = { sep: true };
  const it = (label, cmd, extra) => Object.assign({ label, cmd }, extra || {});
  const dis = (label, extra) => Object.assign({ label, disabled: true }, extra || {});

  function coreMenus(skl) {
    return {
      Session: [
        it('Login', 'login', { disabled: !!skl.user }),
        it('Logout', 'logout', { disabled: !skl.user }),
        it('Protocol', 'protocol'),
        it('Reset Card', 'resetCard'),
      ],
      Tools: [
        { label: 'User', sub: [it('Get Card Time/Date', 'getTime'), it('Change Password...', 'changePw')] },
        { label: 'SSO', sub: [
          it('Set Card Time/Date', 'setTime'),
          { label: 'User Management', sub: [dis('Add User...'), dis('Delete User...')] },
          { label: 'Audit Functions', sub: [it('View Audit Trail...', 'viewAudit'), dis('Upload Audit Trail...'), it('Delete Audit Trail...', 'deleteAudit')] },
          { label: 'Firmware Controls', sub: [dis('Update Firmware...')] },
          { label: 'File Controls', sub: [dis('Import...'), dis('Export...')] },
        ] },
      ],
      Launch: [it('Launch UAS', 'launchUAS')],
      Help: [it('About Core Lib...', 'about')],
    };
  }

  function uasMenus(skl) {
    const head = {
      PLATS: [dis('Delete Platform', { key: 'Del' }), dis('Add Platform...', { key: 'Ctrl+N' }), dis('Edit Platform...', { key: 'Enter' })],
      EQS: [dis('Delete Equipment', { key: 'Del' }), dis('Add Equipment...', { key: 'Ctrl+N' }), dis('Edit Equipment...', { key: 'Enter' })],
      KEYS: [it('Delete Key Tag', 'deleteKeyTag', { key: 'Del' }), dis('Add ...', { key: 'Ctrl+N' }), dis('Edit ...', { key: 'Enter' })],
      SOI: [dis('Unassign Edition'), dis('Add Equipment...', { key: 'Ctrl+N' }), dis('Edit ...', { key: 'Enter' })],
    }[skl.tab];
    return {
      File: [
        ...head,
        dis('Empty Quick Reference'),
        it('Delete Database...', 'deleteDb'),
        SEP,
        { label: 'Transmit', sub: [
          it('Load...', 'load'),
          dis('Load Modern Keys...'),
          it('Load Selected Keys...', 'loadSelectedKeys'),
          dis('Load Selected Locations...'),
          dis('Load EPLRS...'),
          dis('Load PRC-137...'),
          dis('Database...'),
          dis('ECU Commands...'),
        ] },
        { label: 'Receive', sub: [dis('Database...'), dis('Key...'), dis('Key Needed...')] },
        { label: 'OTAD', sub: [dis('Transmit...'), dis('Receive...')] },
        SEP,
        dis('Create Key Tags...'),
        { label: 'Assign', sub: [dis('Key Tags...'), dis('EP...'), dis('Message Data...'), dis('Equipment...')] },
        SEP,
        it('Save Database...', 'saveDb'),
        it('Exit', 'exit'),
      ],
      View: [
        dis('Find...'),
        SEP,
        it('Current Selection', 'currentSel'),
        dis('File Header...'),
        { label: 'Keys', sub: [it('Expired Keys...', 'expired'), dis('Matching Keys...'), dis('Modern Keys...'), dis('TrKEKs...')] },
        { label: 'SOI', sub: [dis('Edition...')] },
        dis('Host Configuration Registers'),
        it('Summary Status...', 'summary'),
        dis('KLS...'),
        SEP,
        dis('Move Up'),
        dis('Move Down'),
        SEP,
        it('Refresh', 'refresh'),
        it('Expand Tree', 'expandTree'),
        { label: 'Tree', sub: [it('Collapse All', 'collapseTree')] },
      ],
      Settings: [it('Fill Protocol...', 'settingsProtocol'), dis('Display...')],
    };
  }

  /** Lista desplegable; open = ruta abierta («File/Transmit»). */
  function dropdown(items, path, open) {
    return `<ul class="ce-dd">${items.map((m) => {
      if (m.sep) return '<li class="sep"></li>';
      const p = `${path}/${m.label}`;
      if (m.sub) {
        const isOpen = open === p || open.startsWith(p + '/');
        return `<li class="sub${isOpen ? ' hl' : ''}" data-act="menu" data-arg="${esc(p)}"><span>${esc(m.label)}</span><b>▸</b>${isOpen ? dropdown(m.sub, p, open) : ''}</li>`;
      }
      if (m.disabled) return `<li class="dis"><span>${esc(m.label)}</span>${m.key ? `<em>${m.key}</em>` : ''}</li>`;
      return `<li data-act="cmd" data-arg="${m.cmd}"><span>${esc(m.label)}</span>${m.key ? `<em>${m.key}</em>` : ''}</li>`;
    }).join('')}</ul>`;
  }

  function menuBar(menus, skl, extra = '') {
    const top = skl.menu ? skl.menu.split('/')[0] : null;
    return `<div class="ce-menubar"><div class="ce-menus">${Object.keys(menus).map((name) => `
      <div class="ce-mi-top${top === name ? ' on' : ''}" data-act="menu" data-arg="${name}">${name}${top === name ? dropdown(menus[name], name, skl.menu) : ''}</div>`).join('')}</div>
      ${extra}<button type="button" class="ce-x" data-act="${skl.win === 'UAS' ? 'cmd' : 'focus'}" data-arg="${skl.win === 'UAS' ? 'exit' : 'DESKTOP'}" aria-label="Cerrar">×</button></div>`;
  }

  // ------------------------------------------------------------------ árbol
  function tree(skl) {
    const rows = skl.visibleNodes();
    if (!rows.length) return '<div class="ce-tree empty"></div>';
    return `<div class="ce-tree" role="tree">${rows.map((n) => {
      const exp = n.children.length ? `<b class="ce-exp" data-act="toggle" data-arg="${esc(n.id)}">${skl.expanded.has(n.id) ? '−' : '+'}</b>` : '<b class="ce-exp none"></b>';
      const sel = skl.sel[skl.tab] === n.id ? ' sel' : '';
      return `<div class="ce-node${sel}" style="--d:${n.depth}" data-act="select" data-arg="${esc(n.id)}" data-node="${esc(n.id)}" role="treeitem">${exp}${ICON[n.icon] || ''}<span>${esc(n.label)}</span></div>`;
    }).join('')}</div>`;
  }

  // ------------------------------------------------------------------ diálogos
  const B = (label, opts = {}) => `<button type="button" class="ce-btn${opts.def ? ' def' : ''}" ${opts.disabled ? 'disabled' : `data-dlg-btn="${esc(label)}"`}>${esc(opts.text || label)}</button>`;
  function dlgBox(title, body, buttons, opts = {}) {
    return `<div class="ce-modal${opts.full ? ' full' : ''}"><form class="ce-dlg" data-dlg="${esc(opts.type || '')}" onsubmit="return false">
      <div class="ce-title"><span>${esc(title)}</span>${opts.okInTitle ? '<button type="button" class="ce-tok" data-dlg-btn="OK">OK</button>' : ''}<button type="button" class="ce-x" data-dlg-btn="${opts.closeBtn || 'Cancel'}">×</button></div>
      ${opts.sub ? `<div class="ce-sub">${esc(opts.sub)}</div>` : ''}
      <div class="ce-dbody">${body}</div>
      ${buttons ? `<div class="ce-dbtns">${buttons}</div>` : ''}
    </form></div>`;
  }
  const field = (label, name, value = '', type = 'text', ro = false) =>
    `<label class="ce-field"><span>${esc(label)}</span><input name="${name}" type="${type}" value="${esc(value)}" ${ro ? 'readonly' : ''} autocomplete="off" autocapitalize="off" spellcheck="false"></label>`;

  function dialogHtml(skl, d, opts) {
    switch (d.type) {
      case 'MSG':
        return dlgBox(d.title, `<div class="ce-msg">${MSGICON[d.icon] || ''}<p>${nl(d.text)}</p></div>`, d.buttons.map((b, i) => B(b, { def: i === 0 })).join(''), { okInTitle: d.buttons.length === 1, closeBtn: d.buttons[d.buttons.length - 1], type: 'MSG' });
      case 'LOWBAT':
        return dlgBox('Main Batteries Very Low', `<div class="ce-msg">${MSGICON['!']}<p>Your main batteries are running very low on power. Please change the batteries at your next opportunity.<br><br>Consult the manufacturer's instructions for directions on replacing or charging the main batteries.<br><br>Warning: To avoid data loss, be sure to turn off your device before removing the batteries.</p></div>`, '', { closeBtn: 'OK', type: 'LOWBAT' });
      case 'DEFAULT_SSO':
        return dlgBox('Default SSO Login', `<p>This is an UNINITIALIZED DTD 2000 INFOSEC Card. Would you like to initialize this card and pair it to this host computer?</p>
          ${field('User', 'user', 'SSO')}${field('Password:', 'pass', 'DEFAULTPIN')}`, B('Cancel') + B('OK', { def: true }), { type: 'DEFAULT_SSO' });
      case 'LOGIN':
        return dlgBox('Login', `${field('User', 'user')}${field('Password:', 'pass', '', 'password')}
          ${opts.hints ? '<p class="ce-hint">Cuentas de entrenamiento: OPERADOR / Operador1 · SSO / (la que fijó al inicializar)</p>' : ''}`, B('Cancel') + B('OK', { def: true }), { type: 'LOGIN' });
      case 'CHANGE_PW':
        return dlgBox('Change Password', `${field('User ID:', 'uid', d.userId, 'text', true)}${field('Old Password:', 'old', '', 'password')}${field('New Password:', 'new', '', 'password')}${field('Confirm Password:', 'confirm', '', 'password')}
          ${opts.hints && d.init ? '<p class="ce-hint">Old Password: DEFAULTPIN. Nueva: 8+ caracteres con letras y números.</p>' : ''}`, B('Clear', { text: 'Clear' }) + B('Cancel') + B('OK', { def: true }), { type: 'CHANGE_PW' });
      case 'STARTUP':
        return dlgBox('Startup Information', `<div class="ce-list"><div class="ce-lh">Item</div>${skl.startupInfo().map((l) => `<div>${esc(l)}</div>`).join('')}</div>`, B('OK', { def: true }), { sub: 'Startup Information', full: true, type: 'STARTUP' });
      case 'LAUNCH':
        return dlgBox('Launch UAS', '<p>Installed applications. Choose one:</p><div class="ce-list sel1"><div class="on">SKL</div></div>', B('Cancel') + B('OK', { def: true }), { type: 'LAUNCH' });
      case 'PROTOCOL':
        return dlgBox('Protocol', `<p>Default fill protocol:</p>${['DS-101', 'DS-102'].map((p) => `<label class="ce-radio"><input type="radio" name="protocol" value="${p}"${skl.protocol === p ? ' checked' : ''}> ${p}</label>`).join('')}`, B('Cancel') + B('OK', { def: true }), { type: 'PROTOCOL' });
      case 'GET_TIME':
        return dlgBox('Get Card Date/Time', `<p>Set Host PC time and date to the card time and date?</p>
          <label class="ce-radio"><input type="radio" name="mode" value="YES" checked> YES, set host time/date to card time/date.</label>
          <label class="ce-radio"><input type="radio" name="mode" value="NO"> NO, display card time/date (only).</label>`, B('Cancel') + B('OK', { def: true }), { type: 'GET_TIME' });
      case 'SET_TIME': {
        const t = new Date(skl.env.now());
        return dlgBox('Set Card Date/Time', `<p>Card Time:</p><div class="ce-box">${esc(t.toLocaleTimeString('en-US'))}</div><p>Card Date:</p><div class="ce-box">${esc(t.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }))}</div><p class="ce-hint">Set date first then time.</p>`, B('Cancel') + B('OK', { def: true }), { full: true, type: 'SET_TIME' });
      }
      case 'ABOUT':
        return dlgBox('About Core Lib', '<div class="ce-msg">' + MSGICON.i + '<p>Core Library (SIM)<br>AN/PYQ-10 Simple Key Loader<br>Entrenador: sin material criptográfico real.</p></div>', B('OK', { def: true }), { closeBtn: 'OK', type: 'ABOUT' });
      case 'AUDIT':
        return dlgBox('AUDIT TRAIL', `<div class="ce-list audit">${skl.auditRows().map((a) => `<div class="${a.ok ? '' : 'bad'}"><code>${esc(a.when)}</code> ${esc(a.text)}</div>`).join('')}</div>`, B('OK', { def: true }), { full: true, closeBtn: 'OK', type: 'AUDIT' });
      case 'SUMMARY':
        return dlgBox('Summary Status', `<div class="ce-list"><div class="ce-lh two"><span>Item</span><span>Count</span></div>${skl.summary().map(([a, b]) => `<div class="two"><span>${esc(a)}</span><span>${esc(b)}</span></div>`).join('')}</div>`, B('Close', { def: true }), { sub: 'Summary Status', full: true, closeBtn: 'Close', type: 'SUMMARY' });
      case 'SEGMENT': {
        const k = skl.keyById(d.key);
        if (!k) return '';
        const ids = skl.keys.map((x) => x.id);
        const i = ids.indexOf(k.id);
        const row = (l, v) => `<div class="ce-kv"><span>${l}</span><b>${esc(v)}</b></div>`;
        return dlgBox('Segment', [
          row('Short Title:', k.tag), row('Edition:', k.edition), row('Segment Number:', k.segment), row('Key Use:', k.type),
          row('CT3 Key Type:', k.type), row('Key Source:', k.source), row('Effective Date:', SIM.fmtDate(k.eff)),
          row('Expires After:', SIM.fmtDate(k.exp)), row('Classification:', k.cls), row('Algoritmo:', k.bank), row('Uso:', k.desc),
        ].join(''), B('Back', { text: '<< Back', disabled: i <= 0 }) + B('Next', { text: 'Next >>', disabled: i >= ids.length - 1, def: true }) + B('Close'), { sub: `Segment Info ${k.segment}`, full: true, closeBtn: 'Close', type: 'SEGMENT' });
      }
      case 'EXPIRED': {
        const list = skl.keys.filter((k) => ['RED', 'EXPTAG'].includes(skl.keyStatus(k)));
        return dlgBox('Expired Keys', `<div class="ce-list grid3"><div class="ce-lh g3"><span>Short Title</span><span>E.</span><span>Text ID</span></div>
          ${list.map((k) => `<label class="g3"><span><input type="checkbox" name="keys" value="${esc(k.id)}"> ${ICON[skl.keyStatus(k)]} ${esc(k.tag)}</span><span>${esc(k.edition)}.</span><span>${esc(k.text)}</span></label>`).join('') || '<div>(none)</div>'}</div>`,
        B('Delete') + B('Delete All', { text: 'Delete All' }) + B('Close'), { sub: 'Expired Keys', full: true, closeBtn: 'Close', type: 'EXPIRED' });
      }
      case 'LOAD_SEL': {
        const ok = skl.keys.filter((k) => skl.keyStatus(k) === 'YELLOW');
        return dlgBox('Load Selected Keys', `<p>Select the key(s) to load:</p><div class="ce-list">${ok.map((k) => `<label><input type="checkbox" name="keys" value="${esc(k.id)}"> ${ICON.YELLOW} ${esc(k.tag)} <small>${esc(skl.segLabel(k))}</small></label>`).join('')}</div>`, B('Cancel') + B('OK', { def: true }), { full: true, type: 'LOAD_SEL' });
      }
      case 'LOAD_OPTS':
        return dlgBox('Load', `<p class="ce-lbl">Protocol</p>${['DS-101', 'DS-102'].map((p) => `<label class="ce-radio"><input type="radio" name="protocol" value="${p}"${skl.protocol === p ? ' checked' : ''}> ${p}</label>`).join('')}
          <p class="ce-lbl">Activation Mode</p><select name="activation"><option${skl.activation === 'KYK-13' ? ' selected' : ''}>KYK-13</option></select>
          <p class="ce-hint">${d.queue.length} key(s). Con DS-102 el SKL emula un KYK-13.</p>`, B('Cancel') + B('OK', { def: true }), { type: 'LOAD_OPTS' });
      case 'READY': {
        const k = skl.currentSendKey();
        const s = skl.send;
        return dlgBox('Ready to Send Key', `<div class="ce-msg">${MSGICON.i}<p>Ready to send key ${s.idx + 1} of ${s.queue.length}:<br><b>${esc(k ? k.tag : '')}</b><br>${esc(k ? skl.segLabel(k) : '')}<br><br>${esc(s.protocol)}${s.protocol === 'DS-102' ? ' · KYK-13' : ''}</p></div>`, B('Cancel') + B('OK', { def: true }), { type: 'READY' });
      }
      case 'STATUS': {
        const lines = d.kind === 'ICOM' ? (skl.icom ? skl.icom.lines : []) : skl.send ? skl.send.lines : [];
        return dlgBox('Status', `<div class="ce-list status">${lines.map((l) => `<div>${esc(l)}</div>`).join('')}</div><div class="ce-logo">SKL</div>`, B('Continue', { disabled: true }) + B('Cancel'), { sub: 'Status', full: true, type: 'STATUS' });
      }
      case 'SINC_MODE':
        return dlgBox('SINCGARS Mode', `<p class="ce-lbl">Select Transfer Type</p>
          <label class="ce-radio"><input type="radio" name="transfer" value="ICOM" checked> ICOM</label>
          <label class="ce-radio"><input type="radio" name="transfer" value="NON-ICOM"> NON-ICOM</label>
          <label class="ce-check"><input type="checkbox" name="sendTime" value="1"> Send Time</label>`, B('Cancel') + B('OK', { def: true }), { type: 'SINC_MODE' });
      case 'ECU_WIZ': {
        const ls = skl.icom ? skl.icom.ls : null;
        const steps = [
          ['Equipment', `<p>Equipment: <b>${esc(ls ? ls.name : '')}</b> (${esc(ls ? ls.type : '')})</p><p>Destination: AN/PRC-117F</p><p>Verify the equipment and select Next.</p>`],
          ['Connect to', '<ul class="ce-ul"><li>CONNECT CABLE TO THE AUD/FILL PORT (J1)</li><li>SET FUNCT SWITCH TO LD</li><li>RT: FILL DEVICE CYZ10-RDS, press ENT</li></ul>'],
          ['Profiles', '<p>Ensure the RT displays <b>FILL IN PROGRESS</b>, then select Send.</p>'],
        ];
        const [sub, body] = steps[d.step];
        return dlgBox('Load ECU Wizard', body, B('Back', { text: '<< Back', disabled: d.step === 0 }) + B('Next', { text: 'Next >>', disabled: d.step === 2, def: d.step < 2 }) + B('Send', { disabled: d.step !== 2, def: d.step === 2 }) + B('Cancel'), { sub, full: true, type: 'ECU_WIZ' });
      }
      case 'CONFIRM_SAVE':
        return dlgBox('SKL', `<div class="ce-msg">${MSGICON['!']}<p>The database has changed. Do you want to save the changes?</p></div>`, B('Yes', { def: true }) + B('No'), { closeBtn: 'No', type: 'CONFIRM_SAVE' });
      default:
        return '';
    }
  }

  // ------------------------------------------------------------------ ventanas
  const VEHICLE = `<svg class="ce-veh" viewBox="0 0 220 110" aria-hidden="true"><g fill="#7c8475"><rect x="20" y="48" width="170" height="34" rx="6"/><path d="M58 48 L78 22 H150 L168 48 Z"/><rect x="150" y="14" width="40" height="10" rx="2" fill="#5d6458"/><rect x="88" y="27" width="26" height="16" fill="#cfd5c8"/><rect x="120" y="27" width="26" height="16" fill="#cfd5c8"/></g><g fill="#2f332c"><circle cx="58" cy="86" r="16"/><circle cx="160" cy="86" r="16"/></g><g fill="#9aa093"><circle cx="58" cy="86" r="6"/><circle cx="160" cy="86" r="6"/></g></svg>`;

  function desktop() {
    return `<div class="ce-desktop">
      <button type="button" class="ce-dicon" data-act="cmd" data-arg="refresh"><i class="ic-big cal"></i>calibrate</button>
      <button type="button" class="ce-dicon" data-act="focus" data-arg="CORELIB"><i class="ic-big core"></i>CoreLib</button>
      <button type="button" class="ce-dicon" data-act="cmd" data-arg="refresh"><i class="ic-big set"></i>SKL Settings</button>
      <div class="ce-logo-big">SIMPLE<br>KEY<br>LOADER</div>
    </div>`;
  }

  function coreLib(skl) {
    return `<div class="ce-win">${menuBar(coreMenus(skl), skl)}<div class="ce-body center">${VEHICLE}</div></div>`;
  }

  function uas(skl) {
    const icons = `<div class="ce-tools"><button type="button" class="ce-ti recv" data-act="cmd" data-arg="recv" title="Receive"><i></i>RECV</button><button type="button" class="ce-ti load" data-act="cmd" data-arg="load" title="Load"><i></i>LOAD</button></div>`;
    const tabs = [['PLATS', '♆', 'Plats'], ['EQS', '🖧', 'Eqs'], ['KEYS', '⚿', 'Keys'], ['SOI', '▣', 'SOI']]
      .map(([id, ic, l]) => `<button type="button" class="ce-tab${skl.tab === id ? ' on' : ''}" data-act="tab" data-arg="${id}"><i>${ic}</i>${l}</button>`).join('');
    return `<div class="ce-win">${menuBar(uasMenus(skl), skl, icons)}<div class="ce-tabs">${tabs}</div><div class="ce-body">${tree(skl)}</div></div>`;
  }

  function taskbar(skl) {
    const b = Math.ceil(skl.battery);
    const col = b > 40 ? 'g' : b > 10 ? 'a' : 'r';
    const app = skl.dlg && ['MSG', 'LOWBAT'].includes(skl.dlg.type) ? 'Informati...' : skl.shutdown ? 'Shutdown!' : skl.win === 'UAS' ? 'SKL' : skl.win === 'CORELIB' ? 'CoreLib' : 'Desktop';
    const appIcon = skl.win === 'UAS' ? '<i class="ic-app sk"></i>' : '<i class="ic-app core"></i>';
    return `<div class="ce-task">
      <button type="button" class="ce-start" data-act="start" aria-label="Inicio"><i></i></button>
      <button type="button" class="ce-app" data-act="switcher">${appIcon}${esc(app)}</button>
      <span class="ce-tray"><i class="ce-bat ${col}" title="Batería ${b} %"><b style="height:${Math.max(8, b)}%"></b></i><small>${Math.min(99, Math.round(b / 10) * 10)}</small><span>${esc(skl.dateText)}</span></span>
      <i class="ce-pen" title="Input panel"></i>
      <button type="button" class="ce-sw" data-act="switcher" aria-label="Cambiar de programa"><i></i></button>
      ${skl.startMenu ? `<div class="ce-startmenu"><div class="ce-sm-side">Windows CE</div><ul class="ce-dd"><li class="sub hl"><span>Programs</span><b>▸</b><ul class="ce-dd"><li data-act="cmd" data-arg="refresh"><span>calibrate</span></li><li data-act="focus" data-arg="CORELIB"><span>CoreLib</span></li><li data-act="cmd" data-arg="refresh"><span>SKL Settings</span></li></ul></li></ul></div>` : ''}
      ${skl.switcher ? `<div class="ce-switch"><ul class="ce-dd">${skl.uasOpen ? '<li data-act="focus" data-arg="UAS"><span>SKL</span></li>' : ''}<li data-act="focus" data-arg="CORELIB"><span>CoreLib</span></li><li data-act="focus" data-arg="DESKTOP"><span>Desktop</span></li></ul></div>` : ''}
    </div>`;
  }

  SIM.renderSKL = (skl, opts = {}) => {
    if (!skl.power) return '';
    if (skl.win === 'BOOT') return '<div class="ce-boot"><div class="ce-logo-big">SIMPLE<br>KEY<br>LOADER</div><p>Windows CE · Core Library</p></div>';
    const main = skl.win === 'UAS' ? uas(skl) : skl.win === 'CORELIB' ? coreLib(skl) : desktop();
    const progress = skl.progress ? `<div class="ce-modal full"><div class="ce-dlg"><div class="ce-title"><span>Progress</span></div><div class="ce-sub">Progress</div><div class="ce-dbody"><p class="ce-prog">${esc(skl.progress.text)}</p></div></div></div>` : '';
    const dlg = skl.dlg ? dialogHtml(skl, skl.dlg, opts) : '';
    const sd = skl.shutdown ? `<div class="ce-modal"><div class="ce-shut"><p>Shutdown in</p><b>${skl.shutdown.n}</b><p>seconds!</p><small>Press power button to abort.</small></div></div>` : '';
    const tip = opts.hints && skl.win === 'CORELIB' && !skl.dlg && !skl.user ? '<div class="ce-tip">Session &gt; Login para iniciar sesión</div>' : '';
    return `<div class="ce-screen${skl.nvg ? ' nvg' : ''}" style="--bright:${0.55 + skl.bright * 0.12}">
      <div class="ce-area">${main}${tip}${progress}${dlg}${sd}</div>${taskbar(skl)}</div>`;
  };
})(window);
