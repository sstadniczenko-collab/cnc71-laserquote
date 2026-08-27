/* ============================================================================
   CNC71 — LaserQuote :: silnik
   Wszystko liczy się w przeglądarce. Plik DXF NIE wychodzi na żaden serwer.
   ==========================================================================*/
'use strict';

const DEG = Math.PI / 180;
const TOL = 0.02;                 // tolerancja łączenia końców konturu [j. rys.]
const INSUNITS = {1:25.4, 2:304.8, 4:1, 5:10, 6:1000};
const NON_CUT = new Set(['center','center2','centerx2','centerline','hidden','hidden2',
  'hiddenx2','dashdot','dashdot2','dashdotx2','dashed','dashed2','dashedx2','divide',
  'divide2','dividex2','phantom','phantom2','phantomx2','chain','dot','dot2','border','border2',
  'osiowa','kreskowa','punktowa']);
const PALETTE = ['#22d3ee','#a78bfa','#4ade80','#f472b6','#fbbf24','#60a5fa','#f87171','#34d399'];

let ents = [], lyrs = {}, ltypes = {}, bb = {x0:0,y0:0,x1:100,y1:100};
let vp = {sc:1, px:0, py:0};
let hasDXF = false, fileName = '', lastCalc = null;

const $ = id => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d');

/* ============================ 1. PARSER DXF ============================== */

function parseDXF(txt) {
  const raw = txt.replace(/\r\n?/g, '\n').split('\n');
  const tok = [];
  for (let i = 0; i + 1 < raw.length; i += 2) {
    const code = parseInt(raw[i].trim(), 10);
    if (!isNaN(code)) tok.push([code, raw[i + 1].trim()]);
  }

  const out = [], layers = {}, lts = {};
  let i = 0, inEnt = false, inHdr = false, wantIU = false, insunits = 0, lp = 0, tp = 0;
  const WANTED = new Set(['LINE','ARC','CIRCLE','LWPOLYLINE','POLYLINE','SPLINE','ELLIPSE']);

  while (i < tok.length) {
    const [c, v] = tok[i];

    if (c === 0 && v === 'SECTION') {
      i++;
      if (i < tok.length) { inHdr = tok[i][1] === 'HEADER'; inEnt = tok[i][1] === 'ENTITIES'; }
      i++; continue;
    }
    if (c === 0 && v === 'ENDSEC') { inHdr = inEnt = false; i++; continue; }

    if (inHdr) {
      if (c === 9 && v === '$INSUNITS') wantIU = true;
      else if (wantIU && c === 70) { insunits = parseInt(v) || 0; wantIU = false; }
      i++; continue;
    }

    if (inEnt && c === 0) {
      const type = v; i++;
      if (!WANTED.has(type)) { while (i < tok.length && tok[i][0] !== 0) i++; continue; }

      const p = {}, vs = [], fit = [];
      while (i < tok.length && tok[i][0] !== 0) {
        const [cc, vv] = tok[i];
        if (type === 'LWPOLYLINE') {
          if (cc === 10) vs.push({x:parseFloat(vv), y:0, b:0});
          else if (cc === 20 && vs.length) vs[vs.length - 1].y = parseFloat(vv);
          else if (cc === 42 && vs.length) vs[vs.length - 1].b = parseFloat(vv);
          else p[cc] = vv;
        } else if (type === 'SPLINE') {
          if (cc === 10) vs.push({x:parseFloat(vv), y:0});
          else if (cc === 20 && vs.length) vs[vs.length - 1].y = parseFloat(vv);
          else if (cc === 11) fit.push({x:parseFloat(vv), y:0});
          else if (cc === 21 && fit.length) fit[fit.length - 1].y = parseFloat(vv);
          else p[cc] = vv;
        } else p[cc] = vv;
        i++;
      }

      // stary POLYLINE: wierzchołki siedzą w osobnych encjach VERTEX
      if (type === 'POLYLINE') {
        const closed = (parseInt(p[70] || 0) & 1) !== 0;
        while (i < tok.length && !(tok[i][0] === 0 && tok[i][1] === 'SEQEND')) {
          if (tok[i][0] === 0 && tok[i][1] === 'VERTEX') {
            i++;
            const vtx = {x:0, y:0, b:0};
            while (i < tok.length && tok[i][0] !== 0) {
              const [cc, vv] = tok[i];
              if (cc === 10) vtx.x = parseFloat(vv);
              else if (cc === 20) vtx.y = parseFloat(vv);
              else if (cc === 42) vtx.b = parseFloat(vv);
              i++;
            }
            vs.push(vtx);
          } else i++;
        }
        if (vs.length < 2) continue;
        p[70] = closed ? '1' : '0';
      }

      const lyr = p[8] || '0';
      const ltn = p[6] || 'Continuous';
      const isCut = !NON_CUT.has(ltn.toLowerCase());

      if (!layers[lyr]) layers[lyr] = {name:lyr, vis:true, col:PALETTE[lp++ % PALETTE.length], cnt:0};
      layers[lyr].cnt++;
      if (!lts[ltn]) {
        const low = ltn.toLowerCase();
        const col = (low === 'continuous' || low === 'bylayer') ? '#22d3ee'
                  : (isCut ? PALETTE[tp++ % PALETTE.length] : '#5a6474');
        lts[ltn] = {name:ltn, vis:isCut, col, cnt:0, isCut};
      }
      lts[ltn].cnt++;

      const e = {type: type === 'POLYLINE' ? 'LWPOLYLINE' : type, lyr, lt:ltn, id:out.length};

      if (e.type === 'LINE') {
        e.x1 = +p[10] || 0; e.y1 = +p[20] || 0; e.x2 = +p[11] || 0; e.y2 = +p[21] || 0;
        if (Math.hypot(e.x2 - e.x1, e.y2 - e.y1) < 1e-8) continue;
      } else if (e.type === 'ARC') {
        e.cx = +p[10] || 0; e.cy = +p[20] || 0; e.r = +p[40] || 0;
        e.sa = +p[50] || 0; e.ea = +p[51] || 0;
        if (e.r <= 0) continue;
      } else if (e.type === 'CIRCLE') {
        e.cx = +p[10] || 0; e.cy = +p[20] || 0; e.r = +p[40] || 0;
        if (e.r <= 0) continue;
        e.closed = true;
      } else if (e.type === 'LWPOLYLINE') {
        e.vs = vs; e.closed = (parseInt(p[70] || 0) & 1) !== 0;
        if (vs.length < 2) continue;
      } else if (e.type === 'SPLINE') {
        const pts = fit.length >= 2 ? fit : vs;
        if (pts.length < 2) continue;
        e.vs = pts.map(q => ({x:q.x, y:q.y, b:0}));
        e.closed = (parseInt(p[70] || 0) & 1) !== 0;
        e.type = 'LWPOLYLINE';
      } else if (e.type === 'ELLIPSE') {
        const cx = +p[10] || 0, cy = +p[20] || 0, mx = +p[11] || 0, my = +p[21] || 0;
        const ratio = +p[40] || 1;
        const sa = p[41] !== undefined ? +p[41] : 0;
        const ea = p[42] !== undefined ? +p[42] : 2 * Math.PI;
        const a = Math.hypot(mx, my), b = a * ratio, th = Math.atan2(my, mx);
        if (a < 1e-10) continue;
        const N = 64, pts = [];
        for (let k = 0; k <= N; k++) {
          const t = sa + (k / N) * (ea - sa);
          pts.push({
            x: cx + a * Math.cos(t) * Math.cos(th) - b * Math.sin(t) * Math.sin(th),
            y: cy + a * Math.cos(t) * Math.sin(th) + b * Math.sin(t) * Math.cos(th),
            b: 0
          });
        }
        e.vs = pts;
        e.closed = Math.abs(Math.abs(ea - sa) - 2 * Math.PI) < 0.01;
        e.type = 'LWPOLYLINE';
      }

      out.push(e); continue;
    }
    i++;
  }
  return {ents: out, lyrs: layers, ltypes: lts, insunits};
}

/* ========================== 2. GEOMETRIA ================================= */

const isVis = e => !!lyrs[e.lyr]?.vis && !!ltypes[e.lt]?.vis;

function eLen(e) {
  if (e.type === 'LINE')   return Math.hypot(e.x2 - e.x1, e.y2 - e.y1);
  if (e.type === 'CIRCLE') return 2 * Math.PI * e.r;
  if (e.type === 'ARC')  { let a = (e.ea - e.sa) * DEG; if (a <= 0) a += 2 * Math.PI; return e.r * a; }
  if (e.type === 'LWPOLYLINE') {
    let t = 0; const n = e.vs.length, lim = e.closed ? n : n - 1;
    for (let j = 0; j < lim; j++) {
      const v1 = e.vs[j], v2 = e.vs[(j + 1) % n];
      const ch = Math.hypot(v2.x - v1.x, v2.y - v1.y);
      if (Math.abs(v1.b || 0) > 1e-3) {           // łuk zdefiniowany wybrzuszeniem
        const ang = 4 * Math.atan(Math.abs(v1.b));
        t += ang < 1e-10 ? ch : (ch / (2 * Math.sin(ang / 2))) * ang;
      } else t += ch;
    }
    return t;
  }
  return 0;
}

/** Końce encji — null dla zamkniętych (te są konturem same z siebie). */
function endPts(e) {
  if (e.type === 'CIRCLE') return null;
  if (e.type === 'LINE')   return [[e.x1, e.y1], [e.x2, e.y2]];
  if (e.type === 'ARC')    return [
    [e.cx + e.r * Math.cos(e.sa * DEG), e.cy + e.r * Math.sin(e.sa * DEG)],
    [e.cx + e.r * Math.cos(e.ea * DEG), e.cy + e.r * Math.sin(e.ea * DEG)]];
  if (e.type === 'LWPOLYLINE') {
    if (e.closed || e.vs.length < 2) return null;
    const a = e.vs[0], b = e.vs[e.vs.length - 1];
    return [[a.x, a.y], [b.x, b.y]];
  }
  return null;
}

/** Liczba osobnych konturów = liczba przebić wiązki. Union-find po końcach. */
function countContours(list) {
  const n = list.length; if (!n) return 0;
  const par = Array.from({length:n}, (_, i) => i);
  const find = x => par[x] === x ? x : (par[x] = find(par[x]));
  const eps = list.map(endPts);
  for (let i = 0; i < n; i++) {
    if (!eps[i]) continue;
    for (let j = i + 1; j < n; j++) {
      if (!eps[j] || find(i) === find(j)) continue;
      let hit = false;
      for (const a of eps[i]) { for (const b of eps[j]) {
        if (Math.hypot(a[0] - b[0], a[1] - b[1]) < TOL) { hit = true; break; }
      } if (hit) break; }
      if (hit) par[find(i)] = find(j);
    }
  }
  return new Set(list.map((_, i) => find(i))).size;
}

function getBB(list) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const e of list) {
    if (e.type === 'LINE') {
      x0 = Math.min(x0, e.x1, e.x2); x1 = Math.max(x1, e.x1, e.x2);
      y0 = Math.min(y0, e.y1, e.y2); y1 = Math.max(y1, e.y1, e.y2);
    } else if (e.type === 'ARC' || e.type === 'CIRCLE') {
      x0 = Math.min(x0, e.cx - e.r); x1 = Math.max(x1, e.cx + e.r);
      y0 = Math.min(y0, e.cy - e.r); y1 = Math.max(y1, e.cy + e.r);
    } else if (e.vs) {
      for (const v of e.vs) {
        x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x);
        y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
      }
    }
  }
  if (x0 === Infinity) return {x0:0, y0:0, x1:100, y1:100};
  return {x0, y0, x1, y1};
}

/** Punkty łuku z wybrzuszenia (bulge) — do rysowania polilinii. */
function bulgePts(x1, y1, x2, y2, b, n = 16) {
  const ch = Math.hypot(x2 - x1, y2 - y1);
  if (ch < 1e-10 || Math.abs(b) < 1e-3) return [[x2, y2]];
  const ang = 4 * Math.atan(b), r = ch / (2 * Math.sin(Math.abs(ang) / 2));
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const px = -(y2 - y1) / ch, py = (x2 - x1) / ch;
  const d = r * Math.cos(Math.abs(ang) / 2), s = b > 0 ? -1 : 1;
  const cx = mx + s * px * d, cy = my + s * py * d;
  const sa = Math.atan2(y1 - cy, x1 - cx);
  const pts = [];
  for (let k = 1; k <= n; k++) { const a = sa + (k / n) * ang; pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
  return pts;
}

/* ============================ 3. RENDER ================================== */

function resizeCanvas() {
  const r = cv.parentElement.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.max(1, Math.round(r.width * dpr));
  cv.height = Math.max(1, Math.round(r.height * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
  if (hasDXF) render();
}

const toScr = (x, y) => [(x - bb.x0) * vp.sc + vp.px, (bb.y1 - y) * vp.sc + vp.py];

function fitView() {
  if (!hasDXF) return;
  const r = cv.parentElement.getBoundingClientRect();
  const bw = bb.x1 - bb.x0 || 1, bh = bb.y1 - bb.y0 || 1;
  vp.sc = Math.min((r.width - 40) / bw, (r.height - 40) / bh);
  vp.px = (r.width - bw * vp.sc) / 2;
  vp.py = (r.height - bh * vp.sc) / 2;
  render();
}

function zoom(f) {
  if (!hasDXF) return;
  const r = cv.parentElement.getBoundingClientRect();
  vp.px = r.width / 2 - (r.width / 2 - vp.px) * f;
  vp.py = r.height / 2 - (r.height / 2 - vp.py) * f;
  vp.sc *= f; render();
}

function drawEnt(e) {
  const cut = isVis(e);
  ctx.strokeStyle = cut ? (ltypes[e.lt]?.col || '#22d3ee') : '#3d4552';
  ctx.lineWidth = cut ? 1.4 : 1;
  ctx.setLineDash(cut ? [] : [5, 4]);
  ctx.beginPath();
  if (e.type === 'LINE') {
    const a = toScr(e.x1, e.y1), b = toScr(e.x2, e.y2);
    ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]);
  } else if (e.type === 'CIRCLE') {
    const c = toScr(e.cx, e.cy);
    ctx.arc(c[0], c[1], e.r * vp.sc, 0, 2 * Math.PI);
  } else if (e.type === 'ARC') {
    const c = toScr(e.cx, e.cy);
    ctx.arc(c[0], c[1], e.r * vp.sc, -e.ea * DEG, -e.sa * DEG);
  } else if (e.type === 'LWPOLYLINE') {
    const n = e.vs.length, lim = e.closed ? n : n - 1;
    const s0 = toScr(e.vs[0].x, e.vs[0].y);
    ctx.moveTo(s0[0], s0[1]);
    for (let j = 0; j < lim; j++) {
      const v1 = e.vs[j], v2 = e.vs[(j + 1) % n];
      if (Math.abs(v1.b || 0) > 1e-3) {
        for (const p of bulgePts(v1.x, v1.y, v2.x, v2.y, v1.b)) { const s = toScr(p[0], p[1]); ctx.lineTo(s[0], s[1]); }
      } else { const s = toScr(v2.x, v2.y); ctx.lineTo(s[0], s[1]); }
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);
}

function render() {
  const r = cv.parentElement.getBoundingClientRect();
  ctx.clearRect(0, 0, r.width, r.height);
  for (const e of ents) if (!isVis(e)) drawEnt(e);
  for (const e of ents) if (isVis(e)) drawEnt(e);
}

/* ============================ 4. WYCENA ================================== */

const nearestKey = (obj, t) => {
  const keys = Object.keys(obj).map(Number).filter(k => !isNaN(k));
  if (!keys.length) return null;
  return String(keys.reduce((a, b) => Math.abs(b - t) < Math.abs(a - t) ? b : a));
};

function getSpeed(mat, t) {
  const tab = CFG.speedTable[mat] || {};
  const k = nearestKey(tab, t);
  return (k ? tab[k] : 1000) * (CFG.mocFactor || 1);
}

function getGasPierce(mat, t) {
  const tab = CFG.gazPrzebicie[mat] || {};
  const k = nearestKey(tab, t);
  return k ? tab[k] : {gas:0, p:0};
}

function calc() {
  if (!hasDXF) return;
  const sc = parseFloat($('scale').value) || 1;
  const mat = $('mat').value;
  const th = parseFloat($('thick').value);
  const qty = Math.max(1, parseInt($('qty').value) || 1);
  const prio = CFG.priorytety[$('prio').value] || {mult:1};

  const cutting = ents.filter(isVis);
  const skipped = ents.length - cutting.length;
  const lenMM = cutting.reduce((s, e) => s + eLen(e), 0) * sc;
  const contours = countContours(cutting);
  const cb = cutting.length ? getBB(cutting) : {x0:0, y0:0, x1:0, y1:0};
  const w = (cb.x1 - cb.x0) * sc, h = (cb.y1 - cb.y0) * sc;
  const areaM2 = (w * h) / 1e6;

  const m = CFG.materialy[mat];
  const speed = getSpeed(mat, th);
  const gp = getGasPierce(mat, th);
  const timeMin = speed > 0 ? lenMM / speed : 0;
  const kg = areaM2 * (th / 1000) * m.gestosc;

  const cMat = kg * (m.plnKg || 0);
  const cGas = timeMin * (gp.gas || 0);
  const cEle = timeMin * (CFG.elecMin || 0);
  const cMach = timeMin * (CFG.machMin || 0);
  const cPierce = contours * (gp.p || 0);
  const cCut = cGas + cEle + cMach + cPierce;

  const perPiece = cMat + cCut;
  const techn = perPiece * qty + CFG.setupFee;
  let netto = techn * (1 + CFG.marza / 100) * prio.mult;
  const belowMin = CFG.minZlecenie > 0 && netto < CFG.minZlecenie;
  if (belowMin) netto = CFG.minZlecenie;
  const brutto = netto * (1 + CFG.vat / 100);

  lastCalc = {mat, matName:m.nazwa, th, qty, sc, lenMM, contours, w, h, areaM2, timeMin,
              kg, cMat, cCut, perPiece, netto, brutto, prio:$('prio').value, skipped, speed};

  /* --- statystyki --- */
  $('s-len').textContent  = lenMM.toFixed(0);
  $('s-con').textContent  = contours;
  $('s-dim').textContent  = `${w.toFixed(1)} × ${h.toFixed(1)} mm`;
  $('s-time').textContent = timeMin < 1 ? `${(timeMin * 60).toFixed(0)} s` : `${timeMin.toFixed(2)} min`;
  $('s-kg').textContent   = `${kg.toFixed(3)} kg`;
  $('s-ex').textContent   = skipped;

  /* --- rozbicie ceny (netto, z marżą i priorytetem) --- */
  const gm = (1 + CFG.marza / 100) * prio.mult;
  const f = v => v.toFixed(2);
  $('pbox').innerHTML =
    `<div class="prow"><span class="l">Materia&#322; ${qty > 1 ? `(${qty}×)` : ''}</span><span class="v">${f(cMat * qty * gm)} z&#322;</span></div>` +
    `<div class="prow"><span class="l">Ci&#281;cie ${qty > 1 ? `(${qty}×)` : ''}</span><span class="v">${f(cCut * qty * gm)} z&#322;</span></div>` +
    `<div class="prow"><span class="l">Ustawienie / program (1×)</span><span class="v">${f(CFG.setupFee * gm)} z&#322;</span></div>` +
    (qty > 1 ? `<div class="pdiv"></div><div class="prow"><span class="l">Cena 1 szt. netto</span><span class="v">${f(netto / qty)} z&#322;</span></div>` : '') +
    `<div class="pdiv"></div>` +
    `<div class="prow"><span class="l"><b>Netto</b></span><span class="v"><b>${f(netto)} z&#322;</b></span></div>` +
    `<div class="prow"><span class="l">VAT ${CFG.vat}%</span><span class="v">${f(brutto - netto)} z&#322;</span></div>`;

  $('ptot').classList.remove('hide');
  $('ptot-l').textContent = qty > 1 ? `${qty} szt. brutto` : 'Razem brutto';
  $('ptot-v').textContent = `${brutto.toFixed(2)} zł`;
  $('pnote').classList.remove('hide');
  $('inqbox').classList.remove('hide');

  /* --- ostrzeżenia --- */
  const warn = [];
  if (!m.plnKg) warn.push(`Brak ceny materia&#322;u dla „${m.nazwa}” w cenniku &mdash; koszt blachy nie jest wliczony.`);
  if (w > CFG.maxDetal.x || h > CFG.maxDetal.y) {
    const fits = (h <= CFG.maxDetal.x && w <= CFG.maxDetal.y);
    warn.push(fits ? 'Detal mie&#347;ci si&#281; na stole dopiero po obrocie o 90°.'
                   : `Detal wi&#281;kszy ni&#380; st&oacute;&#322; ${CFG.maxDetal.x}×${CFG.maxDetal.y} mm &mdash; do uzgodnienia.`);
  }
  if (belowMin) warn.push(`Zlecenie poni&#380;ej minimum ${CFG.minZlecenie} z&#322; netto &mdash; doliczono do minimum.`);
  if (contours === 0) warn.push('Nie wykryto &#380;adnego konturu do ci&#281;cia.');
  if (w < 20 || h < 20) warn.push('Bardzo ma&#322;y detal &mdash; mo&#380;e wymaga&#263; mikroz&#322;&#261;czy (dopłata do uzgodnienia).');
  if ((CFG.niedostepne[mat] || []).includes(th)) warn.push('Ta grubo&#347;&#263; jest chwilowo niedost&#281;pna &mdash; zapytaj o termin.');
  $('pwarn').innerHTML = warn.length ? `<div class="warnbox">${warn.join('<br>')}</div>` : '';
}

/* ============================= 5. UI ==================================== */

function fillSelects() {
  $('mat').innerHTML = Object.entries(CFG.materialy)
    .map(([k, v]) => `<option value="${k}">${v.nazwa}</option>`).join('');
  $('prio').innerHTML = Object.entries(CFG.priorytety)
    .map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('');
  applyThickness();
  $('hc').innerHTML = `${CFG.email}${CFG.tel ? ' &middot; ' + CFG.tel : ''}`;
  $('ft').innerHTML = `${CFG.firma} &middot; wycena orientacyjna, generowana automatycznie w Twojej przegl&#261;darce &mdash; ` +
    `plik DXF nie opuszcza tego komputera. Pytania: <a href="mailto:${CFG.email}">${CFG.email}</a>`;
}

function applyThickness() {
  const mat = $('mat').value || Object.keys(CFG.materialy)[0];
  const off = CFG.niedostepne[mat] || [];
  const cur = parseFloat($('thick').value);
  $('thick').innerHTML = CFG.grubosci
    .map(t => `<option value="${t}"${off.includes(t) ? ' disabled' : ''}${t === cur ? ' selected' : ''}>${t}${off.includes(t) ? ' — brak' : ''}</option>`)
    .join('');
  if (!$('thick').value || off.includes(parseFloat($('thick').value))) {
    const first = CFG.grubosci.find(t => !off.includes(t));
    if (first !== undefined) $('thick').value = first;
  }
}

function renderGroups(target, map, onChange) {
  const box = $(target); box.innerHTML = '';
  for (const [key, g] of Object.entries(map)) {
    const d = document.createElement('div'); d.className = 'grp';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = g.vis;
    cb.onchange = () => { g.vis = cb.checked; onChange(); };
    const sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = g.col;
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = g.name;
    const ct = document.createElement('span'); ct.className = 'ct'; ct.textContent = g.cnt;
    d.append(cb, sw, nm, ct); box.appendChild(d);
  }
}

function loadDXF(text, name) {
  let r;
  try { r = parseDXF(text); }
  catch (err) { $('ferr').innerHTML = `<div class="errbox">Nie uda&#322;o si&#281; odczyta&#263; pliku: ${err.message}</div>`; return; }

  if (!r.ents.length) {
    $('ferr').innerHTML = '<div class="errbox">Plik nie zawiera geometrii 2D (LINE / ARC / CIRCLE / POLYLINE / SPLINE). ' +
      'Je&#347;li to bry&#322;a 3D lub rysunek w blokach &mdash; wy&#347;lij mailem, wycenimy r&#281;cznie.</div>';
    return;
  }
  $('ferr').innerHTML = '';

  ents = r.ents; lyrs = r.lyrs; ltypes = r.ltypes;
  hasDXF = true; fileName = name;
  bb = getBB(ents);

  if (INSUNITS[r.insunits]) {
    $('scale').value = String(INSUNITS[r.insunits]);
    $('iuhint').innerHTML = `Wykryto z nag&#322;&#243;wka DXF ($INSUNITS): <b>${$('scale').selectedOptions[0].textContent}</b>`;
  } else {
    $('iuhint').innerHTML = 'Plik nie deklaruje jednostki ($INSUNITS) &mdash; sprawd&#378;, czy gabaryt detalu si&#281; zgadza.';
  }

  $('fname').innerHTML = `<b>${name}</b> &middot; ${ents.length} element&oacute;w`;
  $('opts').classList.remove('hide');
  $('cvempty').classList.add('hide');
  $('cvhint').textContent = 'przeciągnij = przesuń · kółko = zoom';

  renderGroups('lyrs', lyrs, () => { render(); calc(); });
  renderGroups('lts', ltypes, () => { render(); calc(); });

  resizeCanvas(); fitView(); calc();
}

function readFile(file) {
  if (!file) return;
  if (!/\.dxf$/i.test(file.name)) {
    $('ferr').innerHTML = '<div class="errbox">Obs&#322;ugujemy pliki <b>.dxf</b>. ' +
      `DWG / STEP / PDF &mdash; wy&#347;lij na <a href="mailto:${CFG.email}">${CFG.email}</a>, odpowiadamy w 24 h.</div>`;
    return;
  }
  const fr = new FileReader();
  fr.onload = () => loadDXF(String(fr.result), file.name);
  fr.onerror = () => { $('ferr').innerHTML = '<div class="errbox">B&#322;&#261;d odczytu pliku.</div>'; };
  fr.readAsText(file, 'utf-8');
}

/* ------------------------- zapytanie ofertowe ---------------------------- */

function spec() {
  const c = lastCalc; if (!c) return '';
  const pr = CFG.priorytety[c.prio];
  return [
    `ZAPYTANIE — CIĘCIE LASEREM (${CFG.firma})`,
    ``,
    `Plik:            ${fileName}`,
    `Materiał:        ${c.matName}`,
    `Grubość:         ${c.th} mm`,
    `Ilość:           ${c.qty} szt.`,
    `Termin:          ${pr.label}${pr.mult !== 1 ? ` (${pr.opis})` : ''}`,
    ``,
    `Gabaryt detalu:  ${c.w.toFixed(1)} × ${c.h.toFixed(1)} mm`,
    `Długość cięcia:  ${c.lenMM.toFixed(0)} mm`,
    `Przebicia:       ${c.contours}`,
    `Masa (1 szt.):   ${c.kg.toFixed(3)} kg`,
    `Czas cięcia:     ${c.timeMin.toFixed(2)} min/szt.`,
    ``,
    `WYCENA ORIENTACYJNA`,
    `Netto:           ${c.netto.toFixed(2)} zł`,
    `Brutto (VAT ${CFG.vat}%): ${c.brutto.toFixed(2)} zł`,
    ``,
    `Imię / firma:    ${$('q-name').value}`,
    `E-mail:          ${$('q-mail').value}`,
    `Telefon:         ${$('q-tel').value}`,
    `Uwagi:           ${$('q-msg').value}`,
    ``,
    `[ Pamiętaj o załączeniu pliku DXF ]`
  ].join('\n');
}

/* ----------------------------- zdarzenia --------------------------------- */

document.addEventListener('DOMContentLoaded', () => {
  fillSelects();
  resizeCanvas();

  $('dz').onclick = () => $('fi').click();
  $('fi').onchange = e => readFile(e.target.files[0]);

  ['dragenter', 'dragover'].forEach(ev => $('dz').addEventListener(ev, e => {
    e.preventDefault(); $('dz').classList.add('on');
  }));
  ['dragleave', 'drop'].forEach(ev => $('dz').addEventListener(ev, e => {
    e.preventDefault(); $('dz').classList.remove('on');
  }));
  $('dz').addEventListener('drop', e => readFile(e.dataTransfer.files[0]));
  document.body.addEventListener('dragover', e => e.preventDefault());
  document.body.addEventListener('drop', e => {
    e.preventDefault();
    if (e.dataTransfer.files.length) readFile(e.dataTransfer.files[0]);
  });

  $('mat').onchange   = () => { applyThickness(); calc(); };
  $('thick').onchange = calc;
  $('qty').oninput    = calc;
  $('prio').onchange  = calc;
  $('scale').onchange = calc;

  /* pan + zoom */
  let drag = null;
  cv.addEventListener('mousedown', e => { drag = {x:e.clientX, y:e.clientY}; cv.classList.add('drag'); });
  window.addEventListener('mouseup', () => { drag = null; cv.classList.remove('drag'); });
  window.addEventListener('mousemove', e => {
    if (!drag || !hasDXF) return;
    vp.px += e.clientX - drag.x; vp.py += e.clientY - drag.y;
    drag = {x:e.clientX, y:e.clientY}; render();
  });
  cv.addEventListener('wheel', e => {
    if (!hasDXF) return;
    e.preventDefault();
    const r = cv.getBoundingClientRect();
    const mx = e.clientX - r.left, my = e.clientY - r.top;
    const f = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    vp.px = mx - (mx - vp.px) * f; vp.py = my - (my - vp.py) * f;
    vp.sc *= f; render();
  }, {passive:false});

  window.addEventListener('resize', resizeCanvas);

  $('btn-mail').onclick = () => {
    if (!lastCalc) return;
    const subj = `Zapytanie — cięcie laserem — ${fileName}`;
    window.location.href = `mailto:${CFG.email}?subject=${encodeURIComponent(subj)}&body=${encodeURIComponent(spec())}`;
  };
  $('btn-copy').onclick = async () => {
    if (!lastCalc) return;
    try {
      await navigator.clipboard.writeText(spec());
      $('btn-copy').textContent = 'Skopiowano ✓';
      setTimeout(() => { $('btn-copy').innerHTML = 'Skopiuj specyfikacj&#281; do schowka'; }, 1800);
    } catch { $('btn-copy').textContent = 'Nie udało się — zaznacz ręcznie'; }
  };
});
