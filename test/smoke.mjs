/* Test dymny: parser DXF + geometria + wycena, bez przeglądarki.
   Uruchom:  node test/smoke.mjs                                        */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, '..');

/* --- minimalne atrapy DOM, żeby app.js dał się wczytać w node --- */
const stubEl = () => ({
  value: '', textContent: '', innerHTML: '', style: {}, classList: {add(){}, remove(){}},
  selectedOptions: [{textContent: ''}], parentElement: {getBoundingClientRect: () => ({width: 800, height: 600})},
  getContext: () => new Proxy({}, {get: () => () => {}}),
  addEventListener(){}, append(){}, appendChild(){}, onchange: null, oninput: null, onclick: null,
  files: [], getBoundingClientRect: () => ({width: 800, height: 600, left: 0, top: 0}),
});
const els = {};
const sandbox = {
  console,
  document: {
    getElementById: id => (els[id] ??= stubEl()),
    createElement: () => stubEl(),
    addEventListener(){}, body: {addEventListener(){}},
  },
  window: {addEventListener(){}, devicePixelRatio: 1},
  navigator: {clipboard: {writeText: async () => {}}},
  FileReader: class {},
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'cennik.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), sandbox);

const {parseDXF, eLen, countContours, getBB, getSpeed, getGasPierce} = sandbox;
const CFG = vm.runInContext('CFG', sandbox);   // `const` nie ląduje na globalu vm

/* --- rysunek testowy: prostokąt 100×50 + otwór Ø20 w środku --- */
const dxf = fs.readFileSync(path.join(dir, 'plytka.dxf'), 'utf8');
const r = parseDXF(dxf);

let fail = 0;
const chk = (name, got, want, tol = 1e-6) => {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) fail++;
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}: ${typeof got === 'number' ? got.toFixed(4) : got}` +
              (ok ? '' : `  (oczekiwano ${want})`));
};

console.log('\n— parser —');
chk('encji', r.ents.length, 6);            // 4 linie + okrąg + 1 linia osiowa
chk('$INSUNITS', r.insunits, 4);

const cutting = r.ents.filter(e => r.lyrs[e.lyr].vis && r.ltypes[e.lt].vis);
console.log('\n— geometria (bez linii osiowej) —');
chk('encji do cięcia', cutting.length, 5);
const len = cutting.reduce((s, e) => s + eLen(e), 0);
chk('długość cięcia [mm]', len, 2 * (100 + 50) + Math.PI * 20, 1e-6);
chk('kontury (przebicia)', countContours(cutting), 2);
const bb = getBB(cutting);
chk('gabaryt X', bb.x1 - bb.x0, 100);
chk('gabaryt Y', bb.y1 - bb.y0, 50);

console.log('\n— wycena (stal 3 mm, 10 szt.) —');
const th = 3, mat = 'steel', qty = 10;
const m = CFG.materialy[mat];
const speed = getSpeed(mat, th), gp = getGasPierce(mat, th);
const areaM2 = ((bb.x1 - bb.x0) * (bb.y1 - bb.y0)) / 1e6;
const kg = areaM2 * (th / 1000) * m.gestosc;
const t = len / speed;
const perPiece = kg * m.plnKg + t * (gp.gas + CFG.elecMin + CFG.machMin) + 2 * gp.p;
const netto = Math.max(CFG.minZlecenie, (perPiece * qty + CFG.setupFee) * (1 + CFG.marza / 100));
console.log(`  prędkość:      ${speed} mm/min`);
console.log(`  czas/szt.:     ${(t * 60).toFixed(1)} s`);
console.log(`  masa/szt.:     ${kg.toFixed(3)} kg`);
console.log(`  koszt techn./szt.: ${perPiece.toFixed(3)} zł`);
console.log(`  netto ${qty} szt.: ${netto.toFixed(2)} zł   brutto: ${(netto * 1.23).toFixed(2)} zł`);
chk('masa 100×50×3 stal [kg]', kg, 0.1 * 0.05 * 0.003 * 7850, 1e-9);

console.log(fail ? `\n${fail} FAIL\n` : '\nwszystko OK\n');
process.exit(fail ? 1 : 0);
