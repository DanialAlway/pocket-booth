/* Pocket Booth: screens, camera, countdown sequence and saving. */
(() => {
  'use strict';

  const { FILTERS, TEMPLATES, render, placeholder, fontsReady } = Booth;
  const $ = s => document.querySelector(s);

  const POSES = [
    'Cheek to cheek', 'Hug from behind', 'Poke their cheeks', 'Cover their eyes', 'Peace signs ✌',
    'Kiss on the cheek', 'Funniest face you can', 'Forehead touch', 'Look at each other', 'Big laugh!',
    'Finger hearts', 'Pinch their nose', 'Back to back', 'Act surprised', 'Rest your head on their shoulder',
    'Squish faces together', 'Pretend to whisper a secret', 'Bunny ears!',
  ];

  const state = {
    template: TEMPLATES[0],
    filter: 'vintage',
    grain: true,
    timer: 3,
    poses: true,
    facing: 'user',
    photos: [],
    color: null,
    caption: 'us ♡',
    showDate: true,
    retake: -1,
    blob: null,
  };

  let stream = null, running = false, runId = 0;

  // ---------------------------------------------------------------------------
  // Screens
  // ---------------------------------------------------------------------------
  const screens = { home: $('#home'), booth: $('#booth'), result: $('#result') };
  function go(name) {
    for (const k in screens) screens[k].classList.toggle('active', k === name);
    if (name !== 'booth') stopCamera();
    window.scrollTo(0, 0);
  }

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => t.classList.remove('show'), 2200);
  }

  function dateStrings(d = new Date()) {
    const dd = String(d.getDate()).padStart(2, '0'), mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear(), yy = String(yyyy).slice(2);
    return { dots: `${dd}.${mm}.${yyyy}`, slash: `${dd}/${mm}/${yy}`, stamp: `'${yy} ${mm} ${dd}` };
  }

  const wait = ms => new Promise(r => setTimeout(r, ms));
  const shotsLabel = n => `${n} shot${n > 1 ? 's' : ''}`;

  // Small square preview of a captured photo.
  function miniCanvas(src, size = 112) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const k = Math.max(size / src.width, size / src.height);
    c.getContext('2d').drawImage(src, (size - src.width * k) / 2, (size - src.height * k) / 2, src.width * k, src.height * k);
    return c;
  }

  // ---------------------------------------------------------------------------
  // Sound (tiny WebAudio synth; unlocked by the first tap)
  // ---------------------------------------------------------------------------
  let actx = null;
  function audio() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } }
    if (actx && actx.state === 'suspended') actx.resume();
    return actx;
  }
  function beep(freq, dur = 0.08, vol = 0.06) {
    const a = audio();
    if (!a) return;
    const o = a.createOscillator(), g = a.createGain(), t = a.currentTime;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(a.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  function shutterSound() {
    const a = audio();
    if (!a) return;
    const len = Math.floor(a.sampleRate * 0.12), buf = a.createBuffer(1, len, a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const s = a.createBufferSource(), g = a.createGain();
    s.buffer = buf;
    g.gain.value = 0.35;
    s.connect(g).connect(a.destination);
    s.start();
  }

  // ---------------------------------------------------------------------------
  // Home
  // ---------------------------------------------------------------------------
  const placeholders = Array.from({ length: 8 }, (_, i) => placeholder(i));

  function buildHome() {
    const grid = $('#templates');
    grid.innerHTML = '';
    $('#tplCount').textContent = `${TEMPLATES.length} templates`;
    for (const t of TEMPLATES) {
      const card = document.createElement('button');
      card.className = 'tpl';
      card.dataset.id = t.id;
      const thumb = document.createElement('div');
      thumb.className = 'thumb';
      const cv = document.createElement('canvas');
      const s = Math.min(360 / t.size[0], 480 / t.size[1]);
      render(t, cv, { photos: placeholders, filter: 'vintage', grain: false, scale: s, caption: 'us ♡', date: dateStrings() });
      thumb.append(cv);
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.innerHTML = `<b>${t.name}</b><span>${shotsLabel(t.shots)}</span>`;
      card.append(thumb, meta);
      grid.append(card);
    }
  }

  $('#templates').addEventListener('click', e => {
    const card = e.target.closest('.tpl');
    if (!card) return;
    audio();
    const t = TEMPLATES.find(x => x.id === card.dataset.id);
    state.template = t;
    state.color = t.colors ? t.colors[0] : null;
    state.photos = [];
    state.retake = -1;
    openBooth();
  });

  // ---------------------------------------------------------------------------
  // Booth
  // ---------------------------------------------------------------------------
  function filterChips(el) {
    el.innerHTML = '';
    for (const f of FILTERS) {
      const b = document.createElement('button');
      b.className = 'chip' + (f.id === state.filter ? ' on' : '');
      b.dataset.f = f.id;
      b.textContent = f.name;
      el.append(b);
    }
  }
  function setFilter(id) {
    state.filter = id;
    for (const b of document.querySelectorAll('[data-f]')) b.classList.toggle('on', b.dataset.f === id);
    $('#video').style.filter = FILTERS.find(f => f.id === id).css;
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-f]');
    if (!b) return;
    setFilter(b.dataset.f);
    if (screens.result.classList.contains('active')) draw(true);
  });

  function renderDots() {
    const el = $('#dots');
    el.innerHTML = '';
    const n = state.template.shots;
    const next = state.retake >= 0 ? state.retake : state.photos.filter(Boolean).length;
    for (let i = 0; i < n; i++) {
      const d = document.createElement('div');
      const has = state.retake < 0 ? !!state.photos[i] : (i !== state.retake && !!state.photos[i]);
      d.className = 'dot' + (has ? ' done' : '') + (i === next && running ? ' next' : '');
      if (has) d.append(miniCanvas(state.photos[i], 68));
      else d.textContent = i + 1;
      el.append(d);
    }
  }

  function updateMirror() {
    $('#video').style.transform = state.facing === 'user' ? 'scaleX(-1)' : 'none';
  }

  function camError(msg) {
    const box = $('#camError');
    box.querySelector('p').textContent = msg;
    box.classList.remove('hidden');
  }

  async function startCamera() {
    stopCamera();
    $('#camError').classList.add('hidden');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      camError('The camera is not available here. Open Pocket Booth in Safari (https), or upload photos instead.');
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: state.facing, width: { ideal: 1920 }, height: { ideal: 1920 } },
        audio: false,
      });
      if (!screens.booth.classList.contains('active')) { s.getTracks().forEach(t => t.stop()); return; }
      stream = s;
      const v = $('#video');
      v.srcObject = stream;
      await v.play().catch(() => {});
      updateMirror();
    } catch (e) {
      camError(e && e.name === 'NotAllowedError'
        ? 'Camera access was blocked. Allow it in Settings → Safari → Camera, then reload. Or upload photos instead.'
        : 'Could not start the camera. You can upload photos instead.');
    }
  }

  function stopCamera() {
    runId++;
    running = false;
    screens.booth.classList.remove('shooting');
    $('#count').classList.add('hidden');
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    $('#video').srcObject = null;
  }

  function openBooth() {
    const t = state.template;
    go('booth');
    $('#boothTitle').textContent = t.name;
    $('#boothSub').textContent = state.retake >= 0 ? `Retake shot ${state.retake + 1}` : shotsLabel(t.shots);
    $('#shotNum').textContent = state.retake >= 0 ? 1 : t.shots;
    $('#viewfinder').style.setProperty('--ar', t.aspect);
    filterChips($('#boothFilters'));
    setFilter(state.filter);
    for (const b of document.querySelectorAll('#timerSeg button')) b.classList.toggle('on', +b.dataset.t === state.timer);
    $('#posesToggle').classList.toggle('on', state.poses);
    renderDots();
    startCamera();
  }

  $('#timerSeg').addEventListener('click', e => {
    const b = e.target.closest('[data-t]');
    if (!b) return;
    state.timer = +b.dataset.t;
    for (const x of document.querySelectorAll('#timerSeg button')) x.classList.toggle('on', x === b);
  });
  $('#posesToggle').addEventListener('click', e => {
    state.poses = !state.poses;
    e.currentTarget.classList.toggle('on', state.poses);
  });
  $('#flip').addEventListener('click', () => {
    if (running) return;
    state.facing = state.facing === 'user' ? 'environment' : 'user';
    startCamera();
  });
  $('#boothBack').addEventListener('click', () => {
    if (state.retake >= 0 && state.photos.filter(Boolean).length >= state.template.shots) {
      state.retake = -1;
      openResult();
    } else go('home');
  });

  async function countdown(sec, my) {
    const box = $('#count'), num = box.querySelector('.num'), pose = box.querySelector('.pose');
    pose.textContent = state.poses ? POSES[Math.floor(Math.random() * POSES.length)] : '';
    box.classList.remove('hidden');
    for (let n = sec; n > 0; n--) {
      num.textContent = n;
      num.style.animation = 'none';
      void num.offsetWidth;
      num.style.animation = '';
      beep(n === 1 ? 880 : 660);
      await wait(1000);
      if (my !== runId) return false;
    }
    box.classList.add('hidden');
    return true;
  }

  function capture() {
    const v = $('#video'), vw = v.videoWidth, vh = v.videoHeight;
    if (!vw || !vh) return null;
    const k = Math.min(1, 1600 / Math.max(vw, vh));
    const c = document.createElement('canvas');
    c.width = Math.round(vw * k);
    c.height = Math.round(vh * k);
    const g = c.getContext('2d');
    if (state.facing === 'user') { g.translate(c.width, 0); g.scale(-1, 1); }
    g.drawImage(v, 0, 0, c.width, c.height);
    return c;
  }

  async function runSequence() {
    if (running) return;
    if (!stream) { toast('Camera is not ready yet'); return; }
    audio();
    running = true;
    const my = ++runId;
    const single = state.retake >= 0;
    const indices = single ? [state.retake] : Array.from({ length: state.template.shots }, (_, i) => i);
    if (!single) state.photos = [];
    screens.booth.classList.add('shooting');
    for (const i of indices) {
      renderDots();
      if (!await countdown(state.timer, my)) return;
      const shot = capture();
      if (!shot) { toast('Could not read the camera'); stopCamera(); startCamera(); return; }
      state.photos[i] = shot;
      shutterSound();
      const fl = $('#flash');
      fl.classList.remove('go');
      void fl.offsetWidth;
      fl.classList.add('go');
      renderDots();
      await wait(900);
      if (my !== runId) return;
    }
    running = false;
    state.retake = -1;
    openResult();
  }
  $('#shutter').addEventListener('click', runSequence);

  // Upload from the photo library (also the fallback when there is no camera).
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file), im = new Image();
      im.onload = () => {
        const k = Math.min(1, 1600 / Math.max(im.naturalWidth, im.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(im.naturalWidth * k);
        c.height = Math.round(im.naturalHeight * k);
        c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c);
      };
      im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
      im.src = url;
    });
  }
  for (const input of document.querySelectorAll('.upload-input')) {
    input.addEventListener('change', async e => {
      const files = [...e.target.files].slice(0, 8);
      e.target.value = '';
      if (!files.length) return;
      let imgs;
      try { imgs = await Promise.all(files.map(loadImage)); } catch (err) { toast('One of those photos could not be opened'); return; }
      const n = state.template.shots;
      if (state.retake >= 0) state.photos[state.retake] = imgs[0];
      else {
        state.photos = Array.from({ length: n }, (_, i) => imgs[i % imgs.length]);
        if (imgs.length < n) toast(`Used ${imgs.length} photo${imgs.length > 1 ? 's' : ''} for ${n} slots`);
      }
      state.retake = -1;
      openResult();
    });
  }

  // ---------------------------------------------------------------------------
  // Result
  // ---------------------------------------------------------------------------
  function buildResult() {
    const t = state.template, have = state.photos.filter(Boolean).length;
    $('#resSub').textContent = `${t.name} · ${shotsLabel(t.shots)}`;

    const tc = $('#tplChips');
    tc.innerHTML = '';
    for (const x of TEMPLATES) {
      const b = document.createElement('button');
      b.className = 'chip' + (x === t ? ' on' : '');
      b.dataset.tpl = x.id;
      b.disabled = x.shots > have;
      b.innerHTML = x.shots > have ? `${x.name}<small>needs ${x.shots}</small>` : x.name;
      tc.append(b);
    }
    const on = tc.querySelector('.on');
    if (on) requestAnimationFrame(() => { tc.scrollLeft = on.offsetLeft - tc.clientWidth / 2 + on.clientWidth / 2; });
    filterChips($('#resFilters'));

    $('#colorBlock').classList.toggle('hidden', !t.colors);
    const sw = $('#swatches');
    sw.innerHTML = '';
    for (const c of t.colors || []) {
      const b = document.createElement('button');
      b.className = 'swatch' + (c === state.color ? ' on' : '');
      b.style.setProperty('--c', c);
      b.dataset.color = c;
      b.setAttribute('aria-label', 'Frame color ' + c);
      sw.append(b);
    }

    $('#captionBlock').classList.toggle('hidden', !t.caption);
    $('#caption').value = state.caption;
    $('#dateToggle').classList.toggle('on', state.showDate);
    $('#grainToggle').classList.toggle('on', state.grain);

    const th = $('#thumbs');
    th.innerHTML = '';
    for (let i = 0; i < t.shots; i++) {
      const b = document.createElement('button');
      b.dataset.retake = i;
      b.setAttribute('aria-label', `Retake shot ${i + 1}`);
      if (state.photos[i]) b.append(miniCanvas(state.photos[i]));
      th.append(b);
    }
  }

  let drawTimer = 0;
  function draw(now) {
    clearTimeout(drawTimer);
    state.blob = null;
    drawTimer = setTimeout(() => {
      const t = state.template, out = $('#out');
      render(t, out, {
        photos: state.photos,
        filter: state.filter,
        grain: state.grain,
        caption: t.caption ? state.caption.trim() : '',
        date: state.showDate ? dateStrings() : null,
        color: state.color,
        scale: 1,
      });
      // Pre-build the file so the Share sheet opens straight from the tap (iOS needs that).
      out.toBlob(b => { state.blob = b; }, 'image/jpeg', 0.92);
    }, now ? 0 : 220);
  }

  function openResult() {
    go('result');
    buildResult();
    draw(true);
  }

  $('#tplChips').addEventListener('click', e => {
    const b = e.target.closest('[data-tpl]');
    if (!b || b.disabled) return;
    const t = TEMPLATES.find(x => x.id === b.dataset.tpl);
    state.template = t;
    if (t.colors && !t.colors.includes(state.color)) state.color = t.colors[0];
    buildResult();
    draw(true);
  });
  $('#swatches').addEventListener('click', e => {
    const b = e.target.closest('[data-color]');
    if (!b) return;
    state.color = b.dataset.color;
    for (const x of document.querySelectorAll('.swatch')) x.classList.toggle('on', x === b);
    draw(true);
  });
  $('#caption').addEventListener('input', e => { state.caption = e.target.value; draw(false); });
  $('#dateToggle').addEventListener('click', e => {
    state.showDate = !state.showDate;
    e.currentTarget.classList.toggle('on', state.showDate);
    draw(true);
  });
  $('#grainToggle').addEventListener('click', e => {
    state.grain = !state.grain;
    e.currentTarget.classList.toggle('on', state.grain);
    draw(true);
  });
  $('#thumbs').addEventListener('click', e => {
    const b = e.target.closest('[data-retake]');
    if (!b) return;
    state.retake = +b.dataset.retake;
    openBooth();
  });
  $('#againBtn').addEventListener('click', () => {
    state.photos = [];
    state.retake = -1;
    openBooth();
  });
  $('#homeBtn').addEventListener('click', () => go('home'));

  async function save() {
    if (!state.blob) {
      await new Promise(r => setTimeout(r, 300));
      if (!state.blob) { toast('Still developing… try again'); return; }
    }
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
    const file = new File([state.blob], `pocket-booth-${stamp}.jpg`, { type: 'image/jpeg' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Pocket Booth' });
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(state.blob);
    a.download = file.name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    toast('Saved to your downloads');
  }
  $('#saveBtn').addEventListener('click', save);
  $('#saveTop').addEventListener('click', save);

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screens.booth.classList.contains('active')) stopCamera();
    else if (!document.hidden && screens.booth.classList.contains('active') && !stream) startCamera();
  });

  buildHome();
  fontsReady.then(buildHome);

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
})();
