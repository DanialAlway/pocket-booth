/* Pocket Booth: photo filters and strip templates.
 * Everything is drawn onto a 2D canvas so the final image is one flat JPEG. */
const Booth = (() => {
  'use strict';

  const F = {
    serif: '"DM Serif Display", Georgia, serif',
    mono: '"Courier Prime", "Courier New", monospace',
    hand: '"Caveat", "Bradley Hand", cursive',
    script: '"Pinyon Script", "Snell Roundhand", cursive',
  };

  // ---------------------------------------------------------------------------
  // Filters. `css` drives the live camera preview, `filterPixels` the final image
  // (Safari has no canvas ctx.filter, so pixels are processed by hand).
  // ---------------------------------------------------------------------------
  const FILTERS = [
    { id: 'vintage', name: 'Vintage', css: 'grayscale(1) sepia(.4) contrast(1.05) brightness(1.02)' },
    { id: 'bw', name: 'B&W', css: 'grayscale(1) contrast(1.15)' },
    { id: 'noir', name: 'Noir', css: 'grayscale(1) contrast(1.6) brightness(.95)' },
    { id: 'film', name: 'Film', css: 'sepia(.25) saturate(.85) contrast(.95) brightness(1.05)' },
    { id: 'seoul', name: 'Seoul', css: 'saturate(.85) brightness(1.08) contrast(.92) hue-rotate(-6deg)' },
    { id: 'rose', name: 'Rosé', css: 'sepia(.18) saturate(1.1) hue-rotate(-14deg) brightness(1.05)' },
    { id: 'none', name: 'Color', css: 'none' },
  ];
  const MONO = new Set(['vintage', 'bw', 'noir']);

  function filterPixels(c, id, grain) {
    if (id === 'none' && !grain) return;
    const g = c.getContext('2d', { willReadFrequently: true });
    const img = g.getImageData(0, 0, c.width, c.height), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      let r = d[i], gr = d[i + 1], b = d[i + 2];
      const L = 0.299 * r + 0.587 * gr + 0.114 * b;
      switch (id) {
        case 'bw': r = gr = b = (L - 128) * 1.15 + 128; break;
        case 'vintage': { const v = (L - 128) * 1.08 + 130; r = v * 1.05 + 10; gr = v * 0.99 + 4; b = v * 0.86 + 2; break; }
        case 'noir': r = gr = b = (L - 128) * 1.6 + 120; break;
        case 'film':
          r = (L + (r - L) * 0.82) * 0.92 + 26; gr = (L + (gr - L) * 0.82) * 0.9 + 20; b = (L + (b - L) * 0.82) * 0.82 + 22; break;
        case 'seoul':
          r = (L + (r - L) * 0.85) * 0.92 + 22; gr = (L + (gr - L) * 0.85) * 0.94 + 22; b = (L + (b - L) * 0.85) * 0.92 + 32; break;
        case 'rose':
          r = (L + (r - L) * 1.05) * 0.94 + 30; gr = (L + (gr - L) * 1.05) * 0.92 + 12; b = (L + (b - L) * 1.05) * 0.92 + 22; break;
      }
      if (grain) { const n = (Math.random() - 0.5) * grain; r += n; gr += n; b += n; }
      d[i] = r; d[i + 1] = gr; d[i + 2] = b; // Uint8ClampedArray clamps for us
    }
    g.putImageData(img, 0, 0);
  }

  // ---------------------------------------------------------------------------
  // Drawing helpers
  // ---------------------------------------------------------------------------
  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function text(ctx, str, x, y, font, color, align = 'center', base = 'middle') {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = base;
    ctx.fillText(str, x, y);
  }

  // Largest font size (down from `size`) that keeps `str` within `max` px.
  function fit(ctx, str, size, family, max, weight = '') {
    let s = size;
    ctx.font = `${weight} ${s}px ${family}`;
    while (ctx.measureText(str).width > max && s > 12) { s -= 2; ctx.font = `${weight} ${s}px ${family}`; }
    return ctx.font;
  }

  function inkOn(hex) {
    const n = parseInt(hex.slice(1), 16);
    const L = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
    return L < 0.5 ? '#f5efe4' : '#1d1b19';
  }

  // Crops `src` to cover w×h, applies the filter, grain and vignette.
  function photo(src, w, h, o) {
    const s = o.scale || 1;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * s));
    c.height = Math.max(1, Math.round(h * s));
    const g = c.getContext('2d', { willReadFrequently: true });
    const k = Math.max(c.width / src.width, c.height / src.height);
    const dw = src.width * k, dh = src.height * k;
    g.imageSmoothingQuality = 'high';
    g.drawImage(src, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
    filterPixels(c, o.filter, o.grain ? (MONO.has(o.filter) ? 26 : 16) : 0);
    if (o.grain) {
      const v = g.createRadialGradient(c.width / 2, c.height / 2, Math.min(c.width, c.height) * 0.35,
        c.width / 2, c.height / 2, Math.max(c.width, c.height) * 0.75);
      v.addColorStop(0, 'rgba(0,0,0,0)');
      v.addColorStop(1, 'rgba(0,0,0,.32)');
      g.fillStyle = v;
      g.fillRect(0, 0, c.width, c.height);
    }
    return c;
  }

  function place(ctx, o, idx, x, y, w, h, radius = 0) {
    const src = o.photos[idx % o.photos.length];
    if (!src) return;
    const c = photo(src, w, h, o);
    ctx.save();
    if (radius) { roundRect(ctx, x, y, w, h, radius); ctx.clip(); }
    ctx.drawImage(c, x, y, w, h);
    ctx.restore();
  }

  // ---------------------------------------------------------------------------
  // Film pieces
  // ---------------------------------------------------------------------------
  const FILM = '#111110', HOLE = '#dcd8cf', EDGE = '#e39b35';

  function holes(ctx, x, y, len, thick, vertical) {
    const a = thick * 0.46, b = a * 1.35, step = b * 1.8;
    ctx.fillStyle = HOLE;
    for (let p = step * 0.35; p + b < len; p += step) {
      if (vertical) roundRect(ctx, x + (thick - a) / 2, y + p, a, b, a * 0.18);
      else roundRect(ctx, x + p, y + (thick - a) / 2, b, a, a * 0.18);
      ctx.fill();
    }
  }

  function scratches(ctx, x, y, w, h, n, rng) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.5)';
    ctx.lineWidth = 1.6;
    for (let i = 0; i < n; i++) {
      let px = x + rng() * w, py = y + rng() * h;
      const len = 60 + rng() * 200;
      ctx.beginPath();
      ctx.moveTo(px, py);
      for (let k = 0; k < 7; k++) { px += (rng() - 0.5) * 16; py += len / 7; ctx.lineTo(px, py); }
      ctx.stroke();
    }
    ctx.restore();
  }

  // Orange digital date stamp, like an old point-and-shoot.
  function stampDate(ctx, right, bottom, str) {
    ctx.save();
    ctx.shadowColor = 'rgba(255,120,30,.85)';
    ctx.shadowBlur = 10;
    text(ctx, str, right - 22, bottom - 22, `bold 30px ${F.mono}`, '#ff9a3c', 'right', 'bottom');
    ctx.restore();
  }

  function filmStripV(ctx, o, x, y, w, h, idxs, frameStart, stamp) {
    ctx.fillStyle = FILM;
    ctx.fillRect(x, y, w, h);
    const m = Math.round(w * 0.125);
    holes(ctx, x, y, h, m, true);
    holes(ctx, x + w - m, y, h, m, true);
    const n = idxs.length, gap = 36, band = gap * 0.6;
    const px = x + m + band, pw = w - 2 * m - 2 * band, ph = (h - gap * (n + 1)) / n;
    idxs.forEach((idx, i) => {
      const py = y + gap + i * (ph + gap);
      place(ctx, o, idx, px, py, pw, ph);
      ctx.save();
      ctx.translate(x + m + band / 2, py + ph / 2);
      ctx.rotate(-Math.PI / 2);
      text(ctx, `▸ ${frameStart + i}A`, 0, 0, `bold 14px ${F.mono}`, EDGE);
      ctx.restore();
      ctx.save();
      ctx.translate(x + w - m - band / 2, py + ph / 2);
      ctx.rotate(Math.PI / 2);
      text(ctx, 'POCKET 400', 0, 0, `bold 14px ${F.mono}`, EDGE);
      ctx.restore();
      if (stamp && o.date && i === n - 1) stampDate(ctx, px + pw, py + ph, o.date.stamp);
    });
    if (o.grain) scratches(ctx, x, y, w, h, 6, o.rng);
  }

  function filmStripH(ctx, o, x, y, w, h, idxs, frameStart) {
    ctx.fillStyle = FILM;
    ctx.fillRect(x, y, w, h);
    const m = Math.round(h * 0.125);
    holes(ctx, x, y, w, m, false);
    holes(ctx, x, y + h - m, w, m, false);
    const n = idxs.length, gap = 36, band = gap * 0.6;
    const py = y + m + band, ph = h - 2 * m - 2 * band, pw = (w - gap * (n + 1)) / n;
    idxs.forEach((idx, i) => {
      const px = x + gap + i * (pw + gap);
      place(ctx, o, idx, px, py, pw, ph);
      text(ctx, `▸ ${frameStart + i}A`, px + 16, y + m + band / 2, `bold 14px ${F.mono}`, EDGE, 'left');
      text(ctx, 'POCKET 400', px + pw - 16, y + h - m - band / 2, `bold 14px ${F.mono}`, EDGE, 'right');
      if (o.date && i === n - 1) stampDate(ctx, px + pw, py + ph, o.date.stamp);
    });
    if (o.grain) scratches(ctx, x, y, w, h, 6, o.rng);
  }

  // A paper strip of stacked photos with a caption area at the bottom.
  function paperStrip(ctx, o, x, y, w, h, idxs, { m = 36, gap = 24, bottom = 200, cap = 64 } = {}) {
    ctx.fillStyle = o.color;
    ctx.fillRect(x, y, w, h);
    const n = idxs.length, pw = w - 2 * m, ph = (h - m - bottom - gap * (n - 1)) / n;
    idxs.forEach((idx, i) => place(ctx, o, idx, x + m, y + m + i * (ph + gap), pw, ph));
    const ink = inkOn(o.color), cy = y + h - bottom / 2;
    if (o.caption) {
      ctx.font = fit(ctx, o.caption, cap, F.hand, pw);
      text(ctx, o.caption, x + w / 2, cy - (o.date ? 16 : 0), ctx.font, ink);
    }
    if (o.date) {
      ctx.globalAlpha = 0.7;
      text(ctx, o.date.dots, x + w / 2, cy + (o.caption ? 40 : 0), `20px ${F.mono}`, ink);
      ctx.globalAlpha = 1;
    }
  }

  function heart(ctx, cx, cy, s) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + s * 0.35);
    ctx.bezierCurveTo(cx - s, cy - s * 0.3, cx - s * 0.45, cy - s, cx, cy - s * 0.45);
    ctx.bezierCurveTo(cx + s * 0.45, cy - s, cx + s, cy - s * 0.3, cx, cy + s * 0.35);
    ctx.fill();
  }

  // ---------------------------------------------------------------------------
  // Templates. `aspect` is the photo slot ratio (w/h) used for the viewfinder.
  // ---------------------------------------------------------------------------
  const PAPER = ['#f7f4ee', '#151515', '#efe2c9', '#f4c6cf', '#bcd7ee', '#c9e4c5'];

  const TEMPLATES = [
    {
      id: 'film', name: 'Film Strip', shots: 4, size: [720, 2160], aspect: 1,
      render(ctx, o) { filmStripV(ctx, o, 0, 0, 720, 2160, [0, 1, 2, 3], 12, true); },
    },
    {
      id: 'film2', name: 'Double Film', shots: 8, size: [1440, 2160], aspect: 1,
      render(ctx, o) {
        filmStripV(ctx, o, 0, 0, 720, 2160, [0, 1, 2, 3], 12, false);
        filmStripV(ctx, o, 720, 0, 720, 2160, [4, 5, 6, 7], 16, true);
      },
    },
    {
      id: 'cuts', name: 'Four Cuts', shots: 4, size: [1200, 1800], aspect: 0.716, colors: PAPER, caption: true,
      render(ctx, o) {
        const m = 48, gap = 24, bottom = 220;
        const pw = (1200 - 2 * m - gap) / 2, ph = (1800 - m - bottom - gap) / 2;
        ctx.fillStyle = o.color;
        ctx.fillRect(0, 0, 1200, 1800);
        for (let i = 0; i < 4; i++) place(ctx, o, i, m + (i % 2) * (pw + gap), m + Math.floor(i / 2) * (ph + gap), pw, ph);
        const ink = inkOn(o.color), cy = 1800 - bottom / 2;
        if (o.caption) text(ctx, o.caption, 600, cy - (o.date ? 18 : 0), fit(ctx, o.caption, 76, F.serif, 1000), ink);
        if (o.date) {
          ctx.globalAlpha = 0.65;
          text(ctx, `${o.date.dots}  ·  POCKET BOOTH`, 600, cy + (o.caption ? 46 : 0), `22px ${F.mono}`, ink);
          ctx.globalAlpha = 1;
        }
      },
    },
    {
      id: 'classic4', name: 'Classic Strip', shots: 4, size: [600, 1800], aspect: 1.415, colors: PAPER, caption: true,
      render(ctx, o) { paperStrip(ctx, o, 0, 0, 600, 1800, [0, 1, 2, 3]); },
    },
    {
      id: 'twin', name: 'Twin Strips', shots: 4, size: [1200, 1800], aspect: 1.386, colors: PAPER, caption: true,
      render(ctx, o) {
        const opt = { gap: 20, bottom: 180, cap: 54 };
        paperStrip(ctx, o, 0, 0, 600, 1800, [0, 1, 2, 3], opt);
        paperStrip(ctx, o, 600, 0, 600, 1800, [0, 1, 2, 3], opt);
        ctx.save();
        ctx.setLineDash([14, 12]);
        ctx.strokeStyle = inkOn(o.color);
        ctx.globalAlpha = 0.3;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(600, 0);
        ctx.lineTo(600, 1800);
        ctx.stroke();
        ctx.restore();
      },
    },
    {
      id: 'eight', name: 'Eight Frames', shots: 8, size: [1200, 1800], aspect: 1.43,
      colors: ['#6b1420', '#151515', '#24365a', '#efe7da'], caption: true,
      render(ctx, o) {
        const side = 70, top = 50, bottom = 240, gap = 20;
        const pw = (1200 - 2 * side - gap) / 2, ph = (1800 - top - bottom - 3 * gap) / 4;
        ctx.fillStyle = o.color;
        ctx.fillRect(0, 0, 1200, 1800);
        for (let i = 0; i < 8; i++) place(ctx, o, i, side + (i % 2) * (pw + gap), top + Math.floor(i / 2) * (ph + gap), pw, ph);
        const ink = inkOn(o.color);
        ctx.globalAlpha = 0.75;
        for (const [x, rot, str] of [[side / 2, -Math.PI / 2, 'A touch of Time'], [1200 - side / 2, Math.PI / 2, 'pocket booth']]) {
          ctx.save();
          ctx.translate(x, top + (1800 - top - bottom) / 2);
          ctx.rotate(rot);
          text(ctx, str, 0, 0, `italic 26px ${F.serif}`, ink);
          ctx.restore();
        }
        ctx.globalAlpha = 1;
        if (o.caption) text(ctx, o.caption, 600, 1800 - bottom / 2 - 6, fit(ctx, o.caption, 110, F.script, 900), ink);
        if (o.date) text(ctx, o.date.slash, side, 1800 - 34, `20px ${F.mono}`, ink, 'left');
      },
    },
    {
      id: 'velvet', name: 'Velvet Booth', shots: 4, size: [1200, 1500], aspect: 0.86, caption: true,
      render(ctx, o) {
        ctx.fillStyle = '#5a0d14';
        ctx.fillRect(0, 0, 1200, 1500);
        for (let x = 0; x < 1200; x += 80) {
          const g = ctx.createLinearGradient(x, 0, x + 80, 0);
          g.addColorStop(0, 'rgba(0,0,0,.45)');
          g.addColorStop(0.5, 'rgba(255,110,110,.18)');
          g.addColorStop(1, 'rgba(0,0,0,.45)');
          ctx.fillStyle = g;
          ctx.fillRect(x, 0, 80, 1500);
        }
        ctx.strokeStyle = '#d4af5a';
        ctx.lineWidth = 6;
        ctx.strokeRect(40, 40, 1120, 1420);
        ctx.lineWidth = 2;
        ctx.strokeRect(54, 54, 1092, 1392);
        const m = 90, gap = 30, bottom = 230;
        const pw = (1200 - 2 * m - gap) / 2, ph = (1500 - m - bottom - gap) / 2;
        for (let i = 0; i < 4; i++) {
          const x = m + (i % 2) * (pw + gap), y = m + Math.floor(i / 2) * (ph + gap);
          ctx.fillStyle = '#f3ead6';
          ctx.fillRect(x - 10, y - 10, pw + 20, ph + 20);
          place(ctx, o, i, x, y, pw, ph);
        }
        const cy = 1500 - bottom / 2;
        if (o.caption) text(ctx, o.caption, 600, cy - (o.date ? 14 : 0), fit(ctx, o.caption, 72, F.serif, 960), '#e6c77a');
        if (o.date) {
          ctx.globalAlpha = 0.75;
          text(ctx, o.date.dots, 600, cy + (o.caption ? 46 : 0), `22px ${F.mono}`, '#e6c77a');
          ctx.globalAlpha = 1;
        }
      },
    },
    {
      id: 'polaroid', name: 'Polaroid', shots: 1, size: [1080, 1320], aspect: 1, caption: true,
      render(ctx, o) {
        ctx.fillStyle = '#fbf9f4';
        ctx.fillRect(0, 0, 1080, 1320);
        place(ctx, o, 0, 60, 60, 960, 960);
        ctx.strokeStyle = 'rgba(0,0,0,.08)';
        ctx.lineWidth = 2;
        ctx.strokeRect(60, 60, 960, 960);
        if (o.caption) text(ctx, o.caption, 540, 1160, fit(ctx, o.caption, 100, F.hand, 940), '#2a2622');
        if (o.date) text(ctx, o.date.dots, 1020, 1272, `22px ${F.mono}`, '#9a9389', 'right');
      },
    },
    {
      id: 'stack', name: 'Polaroid Stack', shots: 3, size: [1200, 1600], aspect: 1, caption: true,
      render(ctx, o) {
        ctx.fillStyle = '#e8dcc5';
        ctx.fillRect(0, 0, 1200, 1600);
        ctx.fillStyle = 'rgba(120,90,50,.14)';
        for (let i = 0; i < 500; i++) ctx.fillRect(o.rng() * 1200, o.rng() * 1600, 3, 3);
        const cards = [[350, 390, -0.12], [860, 610, 0.09], [480, 1030, -0.04]];
        cards.forEach(([x, y, r], i) => {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(r);
          ctx.shadowColor = 'rgba(0,0,0,.28)';
          ctx.shadowBlur = 30;
          ctx.shadowOffsetY = 12;
          ctx.fillStyle = '#fbf9f4';
          ctx.fillRect(-300, -350, 600, 700);
          ctx.shadowColor = 'transparent';
          place(ctx, o, i, -260, -310, 520, 520);
          ctx.rotate(0.05);
          ctx.fillStyle = 'rgba(255,246,214,.78)';
          ctx.fillRect(-75, -378, 150, 52);
          ctx.restore();
        });
        if (o.caption) text(ctx, o.caption, 600, 1478, fit(ctx, o.caption, 96, F.hand, 1000), '#3a2d20');
        if (o.date) text(ctx, o.date.dots, 1140, 1568, `20px ${F.mono}`, '#6d5c48', 'right');
      },
    },
    {
      id: 'love', name: 'Love Notes', shots: 4, size: [1200, 1600], aspect: 0.79,
      colors: ['#f6d6dc', '#e3d7f3', '#d4ecdf', '#f8ecc2'], caption: true,
      render(ctx, o) {
        ctx.fillStyle = o.color;
        ctx.fillRect(0, 0, 1200, 1600);
        ctx.fillStyle = 'rgba(208,68,106,.22)';
        for (let i = 0; i < 70; i++) heart(ctx, o.rng() * 1200, o.rng() * 1600, 14 + o.rng() * 26);
        ctx.save();
        ctx.shadowColor = 'rgba(120,40,60,.18)';
        ctx.shadowBlur = 40;
        ctx.fillStyle = '#fffdfb';
        roundRect(ctx, 70, 70, 1060, 1460, 40);
        ctx.fill();
        ctx.restore();
        const pw = 475, ph = 600, gap = 30;
        for (let i = 0; i < 4; i++) place(ctx, o, i, 110 + (i % 2) * (pw + gap), 110 + Math.floor(i / 2) * (ph + gap), pw, ph, 24);
        if (o.caption) text(ctx, o.caption, 600, 1412, fit(ctx, o.caption, 104, F.hand, 900), '#c2415f');
        ctx.fillStyle = '#e07890';
        heart(ctx, 160, 1412, 22);
        heart(ctx, 1040, 1412, 22);
        if (o.date) {
          ctx.globalAlpha = 0.7;
          text(ctx, o.date.dots, 600, 1486, `22px ${F.mono}`, '#c2415f');
          ctx.globalAlpha = 1;
        }
      },
    },
    {
      id: 'classic3', name: 'Trio Strip', shots: 3, size: [600, 1800], aspect: 1.06, colors: PAPER, caption: true,
      render(ctx, o) { paperStrip(ctx, o, 0, 0, 600, 1800, [0, 1, 2], { bottom: 220 }); },
    },
    {
      id: 'roll', name: 'Film Roll', shots: 3, size: [2400, 780], aspect: 1.39,
      render(ctx, o) { filmStripH(ctx, o, 0, 0, 2400, 780, [0, 1, 2], 20); },
    },
    {
      id: 'contact', name: 'Contact Sheet', shots: 6, size: [1500, 1800], aspect: 1.375,
      render(ctx, o) {
        ctx.fillStyle = '#161514';
        ctx.fillRect(0, 0, 1500, 1800);
        text(ctx, 'POCKET BOOTH · CONTACT SHEET', 60, 54, `22px ${F.mono}`, '#8d877c', 'left');
        if (o.date) text(ctx, o.date.dots, 1440, 54, `22px ${F.mono}`, '#8d877c', 'right');
        const pw = 660, ph = 480;
        const pos = i => [60 + (i % 2) * (pw + 60), 110 + Math.floor(i / 2) * (ph + 100)];
        for (let i = 0; i < 6; i++) {
          const [x, y] = pos(i);
          ctx.fillStyle = '#2d2b28';
          ctx.fillRect(x - 8, y - 8, pw + 16, ph + 16);
          place(ctx, o, i, x, y, pw, ph);
          text(ctx, `${12 + i}  ▸ ${12 + i}A`, x, y + ph + 36, `bold 20px ${F.mono}`, EDGE, 'left');
          text(ctx, 'POCKET 400', x + pw, y + ph + 36, `bold 20px ${F.mono}`, EDGE, 'right');
        }
        // Grease-pencil "pick" circle and a star, like a photographer's proof.
        const [x1, y1] = pos(1);
        ctx.strokeStyle = '#e0362c';
        ctx.lineWidth = 7;
        ctx.lineCap = 'round';
        for (let k = 0; k < 2; k++) {
          ctx.beginPath();
          ctx.ellipse(x1 + pw / 2 + k * 6, y1 + ph / 2 - k * 4, pw / 2 + 26 - k * 8, ph / 2 + 30 - k * 6, -0.04 + k * 0.02, 0.1 + k * 0.3, Math.PI * 2 + k * 0.2);
          ctx.stroke();
        }
        const [x4, y4] = pos(4);
        text(ctx, '★', x4 + pw - 30, y4 + 40, `64px ${F.hand}`, '#e0362c');
      },
    },
  ];

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  function render(t, canvas, o) {
    const s = o.scale || 1;
    canvas.width = Math.round(t.size[0] * s);
    canvas.height = Math.round(t.size[1] * s);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.imageSmoothingQuality = 'high';
    t.render(ctx, Object.assign({}, o, {
      rng: mulberry32(7),
      color: o.color || (t.colors ? t.colors[0] : '#ffffff'),
    }));
  }

  // Stand-in photo (two silhouettes in front of a curtain) for template previews.
  function placeholder(i) {
    const c = document.createElement('canvas');
    c.width = 400; c.height = 400;
    const g = c.getContext('2d');
    const h = [20, 200, 330, 150, 45, 260, 0, 180][i % 8];
    const grd = g.createLinearGradient(0, 0, 0, 400);
    grd.addColorStop(0, `hsl(${h},35%,80%)`);
    grd.addColorStop(1, `hsl(${h},30%,64%)`);
    g.fillStyle = grd;
    g.fillRect(0, 0, 400, 400);
    g.fillStyle = 'rgba(255,255,255,.14)';
    for (let x = 0; x < 400; x += 40) g.fillRect(x, 0, 14, 400);
    g.fillStyle = `hsl(${h},25%,36%)`;
    const person = (cx, cy, s) => {
      g.beginPath(); g.arc(cx, cy, 46 * s, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(cx, cy + 240 * s, 100 * s, 150 * s, 0, Math.PI, Math.PI * 2); g.fill();
    };
    person(150 + (i % 2 ? 12 : -12), 170, 1);
    person(258, 186 + (i % 3) * 8, 0.92);
    return c;
  }

  const fontsReady = document.fonts
    ? Promise.all(Object.values(F).map(f => document.fonts.load(`40px ${f}`))).catch(() => {})
    : Promise.resolve();

  return { FILTERS, TEMPLATES, render, placeholder, fontsReady };
})();
