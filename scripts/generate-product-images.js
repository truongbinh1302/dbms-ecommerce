#!/usr/bin/env node
/*
  Sinh ảnh minh hoạ SVG cho sản phẩm trong seed (không dùng ảnh chụp của hãng hay shop).
  Đọc database/seeds/*.sql lấy slug, tên, hãng, thông số; vẽ hình theo loại sản phẩm, màu nhấn theo hãng,
  ghi frontend-app/public/images/products/<slug>.svg và category-<danh-mục>.svg (ảnh dự phòng theo danh mục).
  Chạy: node scripts/generate-product-images.js
  Seed 014 gắn đường dẫn ảnh vào cột Images của các sản phẩm chưa có ảnh.
*/
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SEED_DIR = path.join(ROOT, 'database', 'seeds');
const OUT_DIR = path.join(ROOT, 'frontend-app', 'public', 'images', 'products');

const CATEGORY_BY_ID = {
  1: 'pc-gaming', 2: 'gaming-laptops', 3: 'office-laptops', 4: 'monitors', 5: 'keyboards', 6: 'mice', 7: 'headsets',
  8: 'components', 9: 'storage', 10: 'networking', 11: 'cameras', 12: 'printers', 13: 'chairs', 14: 'smart-devices', 15: 'accessories',
};

const BRAND_COLORS = {
  amd: '#d9363e', intel: '#1f6fd1', nvidia: '#5aa832', kingston: '#d1343a', corsair: '#d9a520', 'g.skill': '#b8322e',
  samsung: '#2e5bd6', crucial: '#2f97d1', teamgroup: '#e0563a', wd: '#7a4fd6', seagate: '#2b9b62', seasonic: '#4b5563',
  'cooler master': '#7d55c7', deepcool: '#2b9fd9', thermalright: '#6b7280', binhtinh: '#e11d48', asus: '#475569',
  msi: '#c0262d', gigabyte: '#ea7d1c', asrock: '#2b78c5', zotac: '#e0b100', sapphire: '#2563eb', lenovo: '#e2231a',
  dell: '#0b76bc', logitech: '#0ea5e9', hyperx: '#d71e28', keychron: '#525252', klevv: '#16a34a', acer: '#65a30d', apple: '#64748b',
};

const unquote = (value) => value.replace(/''/g, "'");
const escapeXml = (value) => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Đọc các dòng sản phẩm trong seed; file sau ghi đè file trước. */
function readSeedProducts() {
  const products = new Map();
  const files = fs.readdirSync(SEED_DIR).filter((file) => file.endsWith('.sql')).sort();
  for (const file of files) {
    const text = fs.readFileSync(path.join(SEED_DIR, file), 'utf8');
    // 002: (N'Name', N'slug', N'Brand', N'Desc', price, old, stock, categoryId, N'[specs]', ...
    const showcase = /\(N'((?:[^']|'')*)', N'([a-z0-9-]+)', N'((?:[^']|'')*)', N'(?:[^']|'')*', \d+, \d+, \d+, (\d+), N'(\[(?:[^']|'')*\])'/g;
    for (const m of text.matchAll(showcase)) {
      products.set(m[2], { slug: m[2], name: unquote(m[1]), brand: unquote(m[3]), category: CATEGORY_BY_ID[m[4]], specs: JSON.parse(unquote(m[5])), spec: {} });
    }
    // 003 / 010 / 013: (N'slug', N'Name', N'Brand', N'Desc', price, old, stock, N'category', N'[specs]', ...
    const rows = /\(N'([a-z0-9-]+)', N'((?:[^']|'')*)', N'((?:[^']|'')*)',[\s\S]*?(?=\n\(N'|\n--|;\s*\n)/g;
    for (const m of text.matchAll(rows)) {
      const body = m[0];
      const category = /\d+, (?:\d+|NULL), \d+, N'([a-z-]+)'/.exec(body);
      if (!category) continue;
      const specs = /N'(\[(?:[^']|'')*\])'/.exec(body);
      const json = /N'(\{(?:[^']|'')*\})'/.exec(body);
      const laptopType = /\]', N'(laptop_ram|storage)'/.exec(body);
      const spec = json ? JSON.parse(unquote(json[1])) : laptopType ? { type: laptopType[1] } : {};
      const previous = products.get(m[1]) || {};
      products.set(m[1], {
        slug: m[1],
        name: unquote(m[2]),
        brand: unquote(m[3]),
        category: category[1],
        specs: specs ? JSON.parse(unquote(specs[1])) : previous.specs || [],
        spec: Object.keys(spec).length ? spec : previous.spec || {},
      });
    }
  }
  return [...products.values()];
}

/** Loại hình vẽ cho sản phẩm. */
function kindOf(product) {
  const name = product.name.toLowerCase();
  const specText = product.specs.join(' ').toLowerCase();
  switch (product.spec.type) {
    case 'cpu': return 'cpu';
    case 'mainboard': return 'mainboard';
    case 'ram': return 'ram';
    case 'laptop_ram': return 'sodimm';
    case 'gpu': return 'gpu';
    case 'psu': return 'psu';
    case 'case': return 'case';
    case 'cooler': return name.includes('aio') ? 'aio' : (product.spec.heightMm || 999) < 80 ? 'lowprofile' : 'tower';
    case 'storage':
      if (name.includes('hdd')) return 'hdd';
      return product.spec.storageInterface === 'SATA' || name.includes('sata') ? 'sata' : 'm2';
    default: break;
  }
  if (product.category === 'storage') return specText.includes('pcie') || name.includes('nvme') ? 'm2' : 'sata';
  return {
    'pc-gaming': 'pc', 'gaming-laptops': 'laptop', 'office-laptops': 'laptop', monitors: 'monitor', keyboards: 'keyboard',
    mice: 'mouse', headsets: 'headset', cameras: 'webcam', networking: 'router', printers: 'printer', chairs: 'chair',
    'smart-devices': 'speaker', accessories: 'box', components: 'cpu',
  }[product.category] || 'box';
}

const accentOf = (brand, name = '') => {
  const lowerName = name.toLowerCase();
  if (lowerName.includes('geforce') || lowerName.includes('rtx')) return BRAND_COLORS.nvidia;
  if (lowerName.includes('radeon')) return BRAND_COLORS.amd;
  return BRAND_COLORS[String(brand).toLowerCase()] || '#64748b';
};

function shade(hex, amount) {
  const value = parseInt(hex.slice(1), 16);
  const channel = (shift) => Math.max(0, Math.min(255, Math.round(((value >> shift) & 255) + amount * 255)));
  return `#${[16, 8, 0].map((shift) => channel(shift).toString(16).padStart(2, '0')).join('')}`;
}

/* ---------- Hình vẽ theo loại (khung 800x800, vật thể nằm trong vùng y 110-560) ---------- */

const fan = (cx, cy, r, accent) => {
  const blades = Array.from({ length: 7 }, (_, i) => {
    const angle = (i * 360) / 7;
    return `<path d="M ${cx} ${cy} q ${r * 0.55} ${-r * 0.15} ${r * 0.82} ${-r * 0.5}" stroke="#94a3b8" stroke-width="${r * 0.16}" stroke-linecap="round" fill="none" transform="rotate(${angle} ${cx} ${cy})"/>`;
  }).join('');
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#0f172a"/><circle cx="${cx}" cy="${cy}" r="${r - 6}" fill="#1e293b" stroke="${accent}" stroke-opacity="0.55" stroke-width="3"/>${blades}<circle cx="${cx}" cy="${cy}" r="${r * 0.24}" fill="#334155" stroke="${accent}" stroke-width="3"/>`;
};

const goldPins = (x, y, width, count, height = 18) => Array.from({ length: count }, (_, i) => {
  const step = width / count;
  return `<rect x="${x + i * step + step * 0.18}" y="${y}" width="${step * 0.64}" height="${height}" rx="2" fill="#d4a72c"/>`;
}).join('');

const DRAW = {
  cpu: (a) => {
    const pins = (side) => Array.from({ length: 12 }, (_, i) => {
      const p = 238 + i * 27;
      return side === 'h' ? `<rect x="${p}" y="196" width="10" height="16" rx="2" fill="#d4a72c"/><rect x="${p}" y="548" width="10" height="16" rx="2" fill="#d4a72c"/>`
        : `<rect x="216" y="${p - 20}" width="16" height="10" rx="2" fill="#d4a72c"/><rect x="568" y="${p - 20}" width="16" height="10" rx="2" fill="#d4a72c"/>`;
    }).join('');
    return `${pins('h')}${pins('v')}<rect x="230" y="210" width="340" height="340" rx="22" fill="#14532d"/><rect x="262" y="242" width="276" height="276" rx="18" fill="url(#metal)" stroke="#94a3b8" stroke-width="3"/><rect x="262" y="242" width="276" height="10" rx="5" fill="${a}"/><circle cx="292" cy="490" r="8" fill="#d4a72c"/>`;
  },
  mainboard: (a) => `<rect x="210" y="130" width="380" height="440" rx="16" fill="#111827"/><rect x="210" y="130" width="380" height="440" rx="16" fill="none" stroke="${a}" stroke-opacity="0.6" stroke-width="4"/>
    <rect x="236" y="152" width="120" height="70" rx="8" fill="#374151"/><rect x="250" y="166" width="92" height="16" rx="4" fill="${a}" fill-opacity="0.8"/>
    <rect x="270" y="244" width="120" height="120" rx="10" fill="#4b5563"/><rect x="290" y="264" width="80" height="80" rx="6" fill="#9ca3af"/>
    ${[0, 1, 2, 3].map((i) => `<rect x="${430 + i * 30}" y="160" width="14" height="230" rx="4" fill="#1f2937" stroke="#6b7280" stroke-width="2"/>`).join('')}
    <rect x="236" y="404" width="330" height="22" rx="5" fill="#1f2937" stroke="${a}" stroke-width="2"/><rect x="236" y="470" width="330" height="16" rx="5" fill="#1f2937" stroke="#6b7280" stroke-width="2"/>
    <rect x="252" y="438" width="200" height="22" rx="4" fill="#374151"/><rect x="236" y="510" width="150" height="36" rx="6" fill="#374151"/><rect x="420" y="508" width="146" height="40" rx="8" fill="${a}" fill-opacity="0.35"/>`,
  ram: (a) => `<g transform="rotate(-8 400 340)"><rect x="140" y="250" width="520" height="150" rx="10" fill="#0f172a"/>
    <path d="M140 262 a12 12 0 0 1 12 -12 h496 a12 12 0 0 1 12 12 v70 h-520 z" fill="${a}"/><path d="M140 300 l520 -30 v20 l-520 30 z" fill="#ffffff" fill-opacity="0.18"/>
    <rect x="170" y="344" width="460" height="26" rx="4" fill="#1e293b"/>${goldPins(150, 384, 500, 40)}<rect x="392" y="380" width="14" height="26" fill="#f8fafc"/></g>`,
  sodimm: (a) => `<g transform="rotate(-6 400 340)"><rect x="220" y="230" width="360" height="190" rx="10" fill="#166534"/>
    ${[0, 1, 2, 3].map((i) => `<rect x="${244 + i * 82}" y="256" width="66" height="70" rx="6" fill="#111827"/>`).join('')}
    <rect x="244" y="340" width="150" height="34" rx="4" fill="#f8fafc"/><rect x="252" y="350" width="90" height="6" rx="3" fill="${a}"/><rect x="252" y="362" width="60" height="5" rx="2" fill="#94a3b8"/>
    ${goldPins(228, 398, 344, 30, 22)}<rect x="350" y="394" width="14" height="30" fill="#f8fafc"/></g>`,
  gpu: (a, p) => {
    const three = (p.spec.lengthMm || 0) >= 280;
    const fans = three ? [235, 400, 565].map((x) => fan(x, 335, 70, a)).join('') : [300, 500].map((x) => fan(x, 335, 84, a)).join('');
    return `<rect x="130" y="230" width="540" height="210" rx="26" fill="#1f2937"/><rect x="130" y="230" width="540" height="210" rx="26" fill="none" stroke="${a}" stroke-width="5"/>
      <path d="M150 432 h500" stroke="${a}" stroke-width="6" stroke-linecap="round"/>${fans}<rect x="200" y="440" width="300" height="20" rx="3" fill="#0f172a"/>${goldPins(214, 458, 270, 34, 16)}<rect x="660" y="248" width="22" height="160" rx="6" fill="#64748b"/>`;
  },
  m2: (a) => `<g transform="rotate(-10 400 340)"><rect x="130" y="290" width="540" height="100" rx="10" fill="#111827"/>
    <rect x="160" y="306" width="250" height="68" rx="8" fill="#e5e7eb"/><rect x="176" y="320" width="150" height="12" rx="6" fill="${a}"/><rect x="176" y="342" width="200" height="8" rx="4" fill="#94a3b8"/><rect x="176" y="356" width="120" height="8" rx="4" fill="#94a3b8"/>
    <rect x="430" y="310" width="90" height="60" rx="6" fill="#1f2937"/><rect x="535" y="310" width="90" height="60" rx="6" fill="#1f2937"/>${goldPins(668, 298, 28, 1, 84)}<circle cx="148" cy="340" r="12" fill="#f8fafc" stroke="#94a3b8" stroke-width="3"/></g>`,
  sata: (a) => `<rect x="230" y="200" width="340" height="250" rx="18" fill="#1e293b"/><rect x="250" y="220" width="300" height="210" rx="12" fill="url(#metal)"/>
    <rect x="250" y="220" width="300" height="56" rx="12" fill="${a}"/><rect x="276" y="306" width="180" height="16" rx="8" fill="#475569"/><rect x="276" y="336" width="120" height="12" rx="6" fill="#94a3b8"/><rect x="330" y="446" width="140" height="18" rx="3" fill="#0f172a"/>`,
  hdd: (a) => `<rect x="215" y="160" width="370" height="400" rx="18" fill="#334155"/><rect x="232" y="178" width="336" height="364" rx="12" fill="url(#metal)"/>
    <circle cx="400" cy="330" r="130" fill="#cbd5e1" stroke="#94a3b8" stroke-width="4"/><circle cx="400" cy="330" r="34" fill="#64748b"/><path d="M520 470 L420 340" stroke="${a}" stroke-width="16" stroke-linecap="round"/><circle cx="525" cy="475" r="20" fill="#475569"/>`,
  psu: (a) => `<rect x="200" y="200" width="400" height="300" rx="20" fill="#111827"/><rect x="200" y="200" width="400" height="300" rx="20" fill="none" stroke="${a}" stroke-width="4"/>
    ${[110, 90, 70, 50].map((r) => `<circle cx="400" cy="350" r="${r}" fill="none" stroke="#475569" stroke-width="6"/>`).join('')}<path d="M290 350 h220 M400 240 v220" stroke="#475569" stroke-width="6"/><circle cx="400" cy="350" r="26" fill="${a}"/>
    <rect x="200" y="460" width="400" height="40" rx="0" fill="#1f2937"/>${[0, 1, 2, 3, 4].map((i) => `<rect x="${226 + i * 72}" y="470" width="52" height="20" rx="4" fill="#374151"/>`).join('')}`,
  tower: (a) => `${Array.from({ length: 16 }, (_, i) => `<rect x="270" y="${160 + i * 22}" width="260" height="10" rx="3" fill="url(#metal)"/>`).join('')}
    <rect x="304" y="150" width="14" height="380" rx="6" fill="#b45309"/><rect x="482" y="150" width="14" height="380" rx="6" fill="#b45309"/>
    <rect x="236" y="190" width="40" height="300" rx="10" fill="#1f2937"/><rect x="248" y="200" width="16" height="280" rx="6" fill="${a}" fill-opacity="0.7"/>
    <rect x="300" y="520" width="200" height="34" rx="8" fill="#334155"/>`,
  lowprofile: (a) => `${Array.from({ length: 22 }, (_, i) => `<rect x="${200 + i * 18}" y="300" width="8" height="120" rx="3" fill="url(#metal)"/>`).join('')}
    ${fan(400, 300, 120, a)}<rect x="260" y="430" width="280" height="36" rx="8" fill="#334155"/>`,
  aio: (a) => `<rect x="150" y="170" width="500" height="150" rx="16" fill="#111827"/>${[275, 525].map((x) => fan(x, 245, 64, a)).join('')}
    <path d="M300 320 C 300 420, 360 420, 380 450 M500 320 C 500 420, 440 420, 420 450" stroke="#1f2937" stroke-width="22" fill="none" stroke-linecap="round"/>
    <circle cx="400" cy="490" r="74" fill="#1f2937"/><circle cx="400" cy="490" r="56" fill="none" stroke="${a}" stroke-width="8"/><circle cx="400" cy="490" r="26" fill="${a}" fill-opacity="0.5"/>`,
  case: (a) => `<rect x="250" y="130" width="300" height="440" rx="18" fill="#111827"/><rect x="270" y="150" width="170" height="400" rx="10" fill="#1e293b" stroke="#475569" stroke-width="3"/>
    ${Array.from({ length: 18 }, (_, r) => Array.from({ length: 3 }, (_, c) => `<circle cx="${470 + c * 26}" cy="${170 + r * 21}" r="5" fill="#475569"/>`).join('')).join('')}
    <rect x="290" y="300" width="130" height="34" rx="6" fill="${a}" fill-opacity="0.5"/><rect x="290" y="190" width="70" height="70" rx="8" fill="#334155"/><rect x="250" y="566" width="40" height="12" rx="4" fill="#334155"/><rect x="510" y="566" width="40" height="12" rx="4" fill="#334155"/>`,
  pc: (a) => `<rect x="230" y="120" width="340" height="460" rx="20" fill="#0f172a"/><rect x="252" y="142" width="200" height="416" rx="12" fill="#1e293b" stroke="${a}" stroke-opacity="0.8" stroke-width="3"/>
    <rect x="272" y="170" width="160" height="150" rx="8" fill="#111827"/><rect x="300" y="200" width="56" height="56" rx="6" fill="#9ca3af"/><rect x="372" y="186" width="10" height="110" rx="3" fill="${a}"/><rect x="390" y="186" width="10" height="110" rx="3" fill="${a}"/>
    <rect x="268" y="350" width="170" height="54" rx="10" fill="#1f2937" stroke="${a}" stroke-width="3"/>${fan(510, 220, 40, a)}${fan(510, 330, 40, a)}${fan(510, 440, 40, a)}<rect x="268" y="470" width="170" height="70" rx="8" fill="#111827"/>`,
  laptop: (a) => `<path d="M215 150 h370 a16 16 0 0 1 16 16 v270 h-402 v-270 a16 16 0 0 1 16 -16 z" fill="#1f2937"/>
    <rect x="221" y="166" width="358" height="252" rx="6" fill="url(#screen)"/><path d="M221 418 l358 -252 v120 l-188 132 z" fill="#ffffff" fill-opacity="0.06"/>
    <path d="M150 446 h500 l-34 70 a10 10 0 0 1 -9 6 h-414 a10 10 0 0 1 -9 -6 z" fill="url(#metal)"/><rect x="350" y="452" width="100" height="10" rx="5" fill="#94a3b8"/><rect x="150" y="440" width="500" height="10" rx="5" fill="#475569"/>`,
  monitor: (a) => `<rect x="120" y="140" width="560" height="330" rx="16" fill="#111827"/><rect x="134" y="154" width="532" height="302" rx="8" fill="url(#screen)"/>
    <path d="M134 456 l532 -302 v120 l-320 182 z" fill="#ffffff" fill-opacity="0.05"/><rect x="370" y="470" width="60" height="70" fill="#475569"/><rect x="290" y="536" width="220" height="22" rx="11" fill="#334155"/>`,
  keyboard: (a) => `<g transform="rotate(-6 400 340)"><rect x="110" y="230" width="580" height="220" rx="22" fill="#1f2937"/>
    ${Array.from({ length: 5 }, (_, r) => Array.from({ length: 14 }, (_, c) => `<rect x="${130 + c * 39}" y="${250 + r * 38}" width="33" height="32" rx="6" fill="${r === 0 && c === 0 ? a : '#e5e7eb'}"/>`).join('')).join('')}
    <rect x="286" y="402" width="226" height="32" rx="6" fill="#e5e7eb"/></g>`,
  mouse: (a) => `<g transform="rotate(-18 400 340)"><path d="M400 160 C 520 160, 540 300, 530 400 C 520 520, 460 560, 400 560 C 340 560, 280 520, 270 400 C 260 300, 280 160, 400 160 z" fill="#1f2937"/>
    <path d="M400 160 v150" stroke="#475569" stroke-width="4"/><rect x="388" y="210" width="24" height="56" rx="12" fill="${a}"/><path d="M290 420 C 330 460, 470 460, 510 420" stroke="${a}" stroke-opacity="0.6" stroke-width="6" fill="none"/></g>`,
  headset: (a) => `<path d="M230 400 C 230 170, 570 170, 570 400" stroke="#1f2937" stroke-width="34" fill="none" stroke-linecap="round"/><path d="M250 370 C 260 210, 540 210, 550 370" stroke="${a}" stroke-width="10" fill="none"/>
    <rect x="185" y="350" width="110" height="170" rx="46" fill="#111827"/><rect x="505" y="350" width="110" height="170" rx="46" fill="#111827"/><rect x="200" y="372" width="80" height="126" rx="34" fill="${a}" fill-opacity="0.45"/><rect x="520" y="372" width="80" height="126" rx="34" fill="${a}" fill-opacity="0.45"/>
    <path d="M230 500 q 30 60 110 50" stroke="#1f2937" stroke-width="10" fill="none"/><circle cx="345" cy="550" r="12" fill="#1f2937"/>`,
  webcam: (a) => `<rect x="210" y="250" width="380" height="140" rx="70" fill="#111827"/><circle cx="400" cy="320" r="52" fill="#1f2937" stroke="#475569" stroke-width="6"/><circle cx="400" cy="320" r="28" fill="#0b1220" stroke="${a}" stroke-width="5"/><circle cx="410" cy="310" r="8" fill="#e2e8f0" fill-opacity="0.7"/>
    <circle cx="300" cy="320" r="8" fill="#334155"/><circle cx="500" cy="320" r="8" fill="#334155"/><rect x="370" y="390" width="60" height="70" rx="8" fill="#334155"/><rect x="330" y="456" width="140" height="26" rx="10" fill="#1f2937"/>`,
  router: (a) => `<rect x="200" y="330" width="400" height="140" rx="26" fill="#1f2937"/>${[250, 350, 450, 550].map((x, i) => `<rect x="${x - 9}" y="${180 + (i % 2) * 20}" width="18" height="${160 - (i % 2) * 20}" rx="9" fill="#111827" transform="rotate(${(i - 1.5) * 8} ${x} 340)"/>`).join('')}
    ${[0, 1, 2, 3, 4].map((i) => `<circle cx="${280 + i * 40}" cy="410" r="7" fill="${i < 3 ? a : '#475569'}"/>`).join('')}`,
  printer: (a) => `<rect x="250" y="160" width="300" height="110" rx="8" fill="#f8fafc" stroke="#cbd5e1" stroke-width="4"/><rect x="180" y="250" width="440" height="200" rx="24" fill="#334155"/><rect x="230" y="420" width="340" height="110" rx="6" fill="#f8fafc" stroke="#cbd5e1" stroke-width="4"/>
    <rect x="270" y="450" width="200" height="10" rx="5" fill="#cbd5e1"/><rect x="270" y="474" width="150" height="10" rx="5" fill="#cbd5e1"/><circle cx="560" cy="300" r="12" fill="${a}"/>`,
  chair: (a) => `<rect x="300" y="130" width="200" height="260" rx="60" fill="#1f2937"/><rect x="330" y="160" width="140" height="200" rx="44" fill="${a}" fill-opacity="0.55"/><rect x="270" y="380" width="260" height="60" rx="28" fill="#1f2937"/>
    <rect x="390" y="440" width="20" height="70" fill="#475569"/><path d="M300 540 L400 505 L500 540 M400 505 V555" stroke="#475569" stroke-width="12" stroke-linecap="round"/>${[300, 400, 500].map((x) => `<circle cx="${x}" cy="552" r="12" fill="#111827"/>`).join('')}`,
  speaker: (a) => `<rect x="300" y="170" width="200" height="380" rx="100" fill="#1f2937"/>${Array.from({ length: 11 }, (_, r) => Array.from({ length: 6 }, (_, c) => `<circle cx="${342 + c * 23}" cy="${250 + r * 24}" r="5" fill="#475569"/>`).join('')).join('')}<ellipse cx="400" cy="190" rx="70" ry="14" fill="${a}" fill-opacity="0.7"/>`,
  box: (a) => `<path d="M400 160 L600 250 L600 470 L400 560 L200 470 L200 250 z" fill="#d6b88a"/><path d="M400 160 L600 250 L400 340 L200 250 z" fill="#e7cfa6"/><path d="M400 340 V560" stroke="#b8956a" stroke-width="4"/><path d="M300 205 L500 295" stroke="${a}" stroke-width="22"/>`,
};

const KIND_LABEL = {
  cpu: 'CPU', mainboard: 'Mainboard', ram: 'RAM', sodimm: 'RAM laptop', gpu: 'Card đồ hoạ', m2: 'SSD NVMe', sata: 'SSD SATA', hdd: 'HDD',
  psu: 'Nguồn', tower: 'Tản khí', lowprofile: 'Tản khí', aio: 'Tản nước', case: 'Case', pc: 'PC', laptop: 'Laptop', monitor: 'Màn hình',
  keyboard: 'Bàn phím', mouse: 'Chuột', headset: 'Tai nghe', webcam: 'Webcam', router: 'Thiết bị mạng', printer: 'Máy in', chair: 'Ghế',
  speaker: 'Thiết bị thông minh', box: 'Phụ kiện',
};

/** Chia tên dài thành tối đa 2 dòng. */
function wrap(text, max) {
  if (text.length <= max) return [text];
  const words = text.split(' ');
  const lines = [''];
  for (const word of words) {
    const current = lines[lines.length - 1];
    if ((current + ' ' + word).trim().length > max && lines.length < 2) lines.push(word);
    else lines[lines.length - 1] = (current + ' ' + word).trim();
  }
  return lines;
}

function renderSvg({ kind, accent, brand, title, subtitle, product = { spec: {} } }) {
  const lines = wrap(title, 26);
  const titleSize = lines.some((line) => line.length > 22) ? 40 : 46;
  const titleY = lines.length > 1 ? 630 : 660;
  const body = DRAW[kind](accent, product);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" width="800" height="800" role="img" aria-label="${escapeXml(title)}">
  <title>${escapeXml(title)}</title>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f8fafc"/><stop offset="1" stop-color="${shade(accent, 0.38)}"/></linearGradient>
    <linearGradient id="metal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e2e8f0"/><stop offset="0.5" stop-color="#cbd5e1"/><stop offset="1" stop-color="#94a3b8"/></linearGradient>
    <linearGradient id="screen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(accent, -0.25)}"/><stop offset="0.55" stop-color="${accent}"/><stop offset="1" stop-color="#0f172a"/></linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.45" r="0.5"><stop offset="0" stop-color="${accent}" stop-opacity="0.22"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="800" height="800" rx="48" fill="url(#bg)"/>
  <circle cx="400" cy="350" r="300" fill="url(#glow)"/>
  <ellipse cx="400" cy="585" rx="250" ry="22" fill="#0f172a" fill-opacity="0.12"/>
  <g>${body}</g>
  <text x="56" y="84" font-family="Inter, 'Segoe UI', Arial, sans-serif" font-size="30" font-weight="800" fill="${shade(accent, -0.18)}" letter-spacing="3">${escapeXml(String(brand).toUpperCase())}</text>
  <text x="744" y="84" text-anchor="end" font-family="Inter, 'Segoe UI', Arial, sans-serif" font-size="24" font-weight="600" fill="#475569">${escapeXml(KIND_LABEL[kind])}</text>
  ${lines.map((line, i) => `<text x="400" y="${titleY + i * (titleSize + 8)}" text-anchor="middle" font-family="Inter, 'Segoe UI', Arial, sans-serif" font-size="${titleSize}" font-weight="900" fill="#0f172a">${escapeXml(line)}</text>`).join('\n  ')}
  <text x="400" y="${titleY + lines.length * (titleSize + 8) + 22}" text-anchor="middle" font-family="Inter, 'Segoe UI', Arial, sans-serif" font-size="26" font-weight="600" fill="#475569">${escapeXml(subtitle)}</text>
  <text x="744" y="768" text-anchor="end" font-family="Inter, 'Segoe UI', Arial, sans-serif" font-size="18" fill="#64748b">Ảnh minh hoạ</text>
</svg>
`;
}

function titleOf(product) {
  const brand = product.brand.toLowerCase();
  let name = product.name;
  if (name.toLowerCase().startsWith(`${brand} `)) name = name.slice(product.brand.length + 1);
  return name;
}

const CATEGORY_FALLBACKS = {
  'pc-gaming': ['pc', 'PC Gaming'], 'gaming-laptops': ['laptop', 'Laptop gaming'], 'office-laptops': ['laptop', 'Laptop văn phòng'],
  monitors: ['monitor', 'Màn hình'], keyboards: ['keyboard', 'Bàn phím'], mice: ['mouse', 'Chuột'], headsets: ['headset', 'Tai nghe'],
  components: ['cpu', 'Linh kiện'], storage: ['m2', 'Lưu trữ'], networking: ['router', 'Thiết bị mạng'], cameras: ['webcam', 'Camera'],
  printers: ['printer', 'Máy in'], chairs: ['chair', 'Ghế'], 'smart-devices': ['speaker', 'Thiết bị thông minh'], accessories: ['box', 'Phụ kiện'],
};

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const products = readSeedProducts();
  for (const product of products) {
    const kind = kindOf(product);
    const svg = renderSvg({
      kind,
      accent: accentOf(product.brand, product.name),
      brand: product.brand,
      title: titleOf(product),
      // Tối đa 3 thông số, bớt dần cho vừa một dòng.
      subtitle: [3, 2, 1].map((n) => product.specs.slice(0, n).join(' · ')).find((text) => text.length <= 40) || product.specs[0] || '',
      product,
    });
    fs.writeFileSync(path.join(OUT_DIR, `${product.slug}.svg`), svg);
  }
  for (const [slug, [kind, label]] of Object.entries(CATEGORY_FALLBACKS)) {
    fs.writeFileSync(path.join(OUT_DIR, `category-${slug}.svg`), renderSvg({ kind, accent: '#e11d48', brand: 'BinhTinhStore', title: label, subtitle: 'Ảnh minh hoạ theo danh mục' }));
  }
  console.log(`Đã sinh ${products.length} ảnh sản phẩm và ${Object.keys(CATEGORY_FALLBACKS).length} ảnh danh mục vào ${path.relative(ROOT, OUT_DIR)}`);
  return products;
}

if (require.main === module) main();

module.exports = { readSeedProducts, kindOf };
