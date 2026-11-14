/* Sonido: pitidos de teclado, ruido de squelch y voz sintetizada (opcional). */
(function (g) {
  'use strict';
  const SIM = g.SIM;
  let ctx = null;

  function ac() {
    if (!ctx) {
      const AC = g.AudioContext || g.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  SIM.audio = {
    volume: 0.5,
    unlock() { ac(); },
    beep(freq = 1800, ms = 45) {
      const c = ac();
      if (!c || this.volume <= 0) return;
      const o = c.createOscillator();
      const gn = c.createGain();
      o.type = 'square';
      o.frequency.value = freq;
      gn.gain.value = 0.04 * this.volume;
      o.connect(gn).connect(c.destination);
      o.start();
      o.stop(c.currentTime + ms / 1000);
    },
    noise(ms = 160) {
      const c = ac();
      if (!c || this.volume <= 0) return;
      const len = Math.floor(c.sampleRate * ms / 1000);
      const buf = c.createBuffer(1, len, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = c.createBufferSource();
      const gn = c.createGain();
      gn.gain.value = 0.12 * this.volume;
      src.buffer = buf;
      src.connect(gn).connect(c.destination);
      src.start();
    },
    speak(text) {
      if (!g.speechSynthesis || this.volume <= 0) return;
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'es-ES';
        u.rate = 1.05;
        u.volume = Math.min(1, this.volume);
        g.speechSynthesis.cancel();
        g.speechSynthesis.speak(u);
      } catch (e) { /* sin voz disponible */ }
    },
    stopSpeech() {
      try { if (g.speechSynthesis) g.speechSynthesis.cancel(); } catch (e) { /* nada */ }
    },
  };
})(window);
