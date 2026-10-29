/* ============================================================
   GereStock — script.js
   JavaScript puro (Vanilla JS) · dados em localStorage
   ============================================================ */
'use strict';

/* ------------------------------------------------------------
   1. CONSTANTES E ESTADO
   ------------------------------------------------------------ */
const KEYS = {
  products: 'gerestock_products_v1',
  sales: 'gerestock_sales_v1',
  settings: 'gerestock_settings_v1',
  clients: 'gerestock_clients_v1',
  suppliers: 'gerestock_suppliers_v1',
  movements: 'gerestock_movements_v1'
};

const VAT_RATE = 23;          // taxa de IVA (23%)
const LOW_STOCK = 3;          // limite de stock crítico
const MEDIUM_STOCK = 20;      // limite de stock reduzido
const PAGE_SIZE = 10;         // linhas por página no histórico

const state = {
  products: [],
  sales: [],
  clients: [],
  suppliers: [],
  movements: [],
  settings: { theme: 'light', counter: 0, adminName: 'Admin', adminRole: 'Gestor de loja', storeName: 'GereStock', storeLocation: 'Arrábida Shopping, Loja 1.24, Vila Nova de Gaia', defaultPayment: 'card' },
  filters: {
    inventory: { search: '', stock: 'all', price: 'all', sort: 'name-asc' },
    history: { search: '', product: 'all', date: '', sort: 'recent', page: 1 }
  }
};

/* Páginas: título, subtítulo e gráficos associados */
const PAGES = {
  inicio:     { title: 'Página Inicial',      subtitle: 'Visão geral da sua loja', chartIds: [] },
  dashboard:  { title: 'Dashboard',          subtitle: 'Resumo geral do negócio', chartIds: ['chart-fat', 'chart-stock', 'chart-products'] },
  inventario: { title: 'Inventário',         subtitle: 'Gestão de produtos e stock', chartIds: [] },
  venda:      { title: 'Registar Venda',     subtitle: 'Ponto de venda (POS)', chartIds: [] },
  historico:  { title: 'Histórico de Vendas', subtitle: 'Todas as vendas registadas', chartIds: [] },
  clientes:   { title: 'Clientes', subtitle: 'Gestão e histórico de clientes', chartIds: [] },
  fornecedores:{ title: 'Fornecedores', subtitle: 'Gestão de fornecedores', chartIds: [] },
  movimentos: { title: 'Movimentos de Stock', subtitle: 'Entradas e saídas do inventário', chartIds: [] },
  relatorios: { title: 'Relatórios',         subtitle: 'Análise de vendas e stock', chartIds: ['chart-sales-by-product', 'chart-revenue-by-product', 'chart-evolution', 'chart-stock-report'] },
  empresa:    { title: 'Empresa',            subtitle: 'Quem somos, produtos e contactos', chartIds: [] },
  faq:        { title: 'FAQ',                subtitle: 'Perguntas frequentes', chartIds: [] },
  definicoes: { title: 'Definições',         subtitle: 'Administrador, loja e preferências', chartIds: [] }
};

/* ------------------------------------------------------------
   2. UTILITÁRIOS
   ------------------------------------------------------------ */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const money = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
const num = new Intl.NumberFormat('pt-PT');

function fmtMoney(v) { return money.format(Number(v) || 0); }
function fmtNum(v) { return num.format(Number(v) || 0); }
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' }) +
         ' ' + d.toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
}
function fmtDateShort(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' });
}
function sum(list, fn) { return list.reduce((acc, item) => acc + (Number(fn(item)) || 0), 0); }
function uid() {
  return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function esc(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function round2(v) { return Math.round((Number(v) + Number.EPSILON) * 100) / 100; }
const PAYMENT_METHODS = { cash: 'Dinheiro', card: 'Cartão', mbway: 'MB WAY', transfer: 'Transferência bancária' };
function paymentLabel(value) { return PAYMENT_METHODS[value] || 'Não registado'; }
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#2563eb';
}

/* Cálculo de valores de uma venda (IVA incluído no total) */
function computeSale(unitPrice, qty) {
  const subtotal = round2(unitPrice * qty);
  const vat = round2(subtotal * (VAT_RATE / 100));
  const total = round2(subtotal + vat);
  return { subtotal, vat, total };
}

/* Classe de estado do stock */
function stockStatus(stock) {
  if (stock <= LOW_STOCK)   return { key: 'crit', label: 'Crítico',  cls: 'crit' };
  if (stock <= MEDIUM_STOCK) return { key: 'warn', label: 'Reduzido', cls: 'warn' };
  return { key: 'ok', label: 'Normal', cls: 'ok' };
}

/* ------------------------------------------------------------
   3. PERSISTÊNCIA (localStorage)
   ------------------------------------------------------------ */
function saveProducts() {
  localStorage.setItem(KEYS.products, JSON.stringify(state.products));
}
function saveSales() {
  localStorage.setItem(KEYS.sales, JSON.stringify(state.sales));
}
function saveSettings() { localStorage.setItem(KEYS.settings, JSON.stringify(state.settings)); }
function saveClients() { localStorage.setItem(KEYS.clients, JSON.stringify(state.clients)); }
function saveSuppliers() { localStorage.setItem(KEYS.suppliers, JSON.stringify(state.suppliers)); }
function saveMovements() { localStorage.setItem(KEYS.movements, JSON.stringify(state.movements)); }

function loadData() {
  const readJSON = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      console.warn('Dados inválidos em ' + key + ', a usar valores padrão.', err);
      return fallback;
    }
  };

  state.products = readJSON(KEYS.products, null) || [];
  state.sales = readJSON(KEYS.sales, null) || [];
  state.clients = readJSON(KEYS.clients, null) || [];
  state.suppliers = readJSON(KEYS.suppliers, null) || [];
  state.movements = readJSON(KEYS.movements, null) || [];
  const settings = readJSON(KEYS.settings, null);
  if (settings && typeof settings === 'object') {
    state.settings = Object.assign({ theme: 'light', counter: 0, adminName: 'Admin', adminRole: 'Gestor de loja', storeName: 'GereStock', storeLocation: 'Arrábida Shopping, Loja 1.24, Vila Nova de Gaia', defaultPayment: 'card' }, settings);
  }

  // Primeira utilização: carregar dados iniciais automaticamente
  if (!state.products.length && !localStorage.getItem(KEYS.products)) {
    seedInitialData();
  }
}

/* ------------------------------------------------------------
   4. DADOS INICIAIS (seed da primeira utilização)
   ------------------------------------------------------------ */
const SEED_PRODUCTS = [
  { ref: 'ART001', name: 'Rato Optico USB',                price: 20.90,  stock: 100 },
  { ref: 'ART002', name: 'Teclado Mecanico PT',            price: 55.00,  stock: 120 },
  { ref: 'ART003', name: 'Monitor 24 Full HD',             price: 129.90, stock: 30  },
  { ref: 'ART004', name: 'Cabo HDMI 2m',                   price: 10.50,  stock: 120 },
  { ref: 'ART005', name: 'Impressora Jato tinta',          price: 80.50,  stock: 70  },
  { ref: 'ART006', name: 'Zebra TC21 Terminal Portatil',   price: 500.00, stock: 100 },
  { ref: 'ART007', name: 'TECURS Teclado e Rato Sem Fios', price: 30.00,  stock: 120 },
  { ref: 'ART008', name: 'Cartao microSD SDCS2/32GB',      price: 20.00,  stock: 60  },
  { ref: 'ART009', name: 'Router WiFi 6 AX3000',           price: 95.00,  stock: 60  },
  { ref: 'ART010', name: 'ThinkPad P14s Gen 6',            price: 1999.00, stock: 60 }
];

/* Vendas de demonstração (dias atrás, hora, referência, quantidade) */
const SEED_SALES = [
  { d: 6, h: 10, ref: 'ART001', qty: 3 },
  { d: 6, h: 15, ref: 'ART004', qty: 5 },
  { d: 5, h: 11, ref: 'ART002', qty: 2 },
  { d: 5, h: 18, ref: 'ART008', qty: 4 },
  { d: 4, h: 12, ref: 'ART010', qty: 1 },
  { d: 4, h: 16, ref: 'ART003', qty: 2 },
  { d: 3, h: 10, ref: 'ART007', qty: 3 },
  { d: 3, h: 19, ref: 'ART006', qty: 1 },
  { d: 2, h: 13, ref: 'ART005', qty: 2 },
  { d: 2, h: 17, ref: 'ART009', qty: 1 },
  { d: 1, h: 11, ref: 'ART001', qty: 2 },
  { d: 1, h: 20, ref: 'ART002', qty: 1 },
  { d: 0, h: 10, ref: 'ART004', qty: 6 },
  { d: 0, h: 14, ref: 'ART010', qty: 1 }
];

function seedInitialData() {
  const now = Date.now();

  state.products = SEED_PRODUCTS.map((p, i) => ({
    id: uid() + i,
    ref: p.ref,
    name: p.name,
    price: p.price,
    stock: p.stock,
    createdAt: now,
    updatedAt: now, minStock: 3, category: 'Informática', supplierId: ''
  }));

  let counter = 0;
  state.sales = SEED_SALES.map((s) => {
    const product = state.products.find((p) => p.ref === s.ref);
    const date = new Date();
    date.setDate(date.getDate() - s.d);
    date.setHours(s.h, (counter * 7) % 60, 0, 0);
    const values = computeSale(product.price, s.qty);
    counter += 1;
    return {
      id: counter,
      productId: product.id,
      productName: product.name,
      productRef: product.ref,
      unitPrice: product.price,
      qty: s.qty,
      subtotal: values.subtotal,
      vat: values.vat,
      total: values.total,
      vatRate: VAT_RATE,
      date: date.toISOString()
    };
  });

  state.settings.counter = counter;

  saveProducts();
  saveSales();
  saveSettings();
}

/* ------------------------------------------------------------
   5. NOTIFICAÇÕES (toasts)
   ------------------------------------------------------------ */
const ICONS = { success: 'fa-circle-check', error: 'fa-circle-exclamation', info: 'fa-circle-info' };

function toast(message, type = 'success', title = '') {
  const container = $('#toast-container');
  const box = document.createElement('div');
  box.className = 'toast ' + type;
  box.innerHTML =
    '<i class="fa-solid ' + (ICONS[type] || ICONS.info) + '"></i>' +
    '<div>' + (title ? '<strong>' + esc(title) + '</strong>' : '') + '<span>' + esc(message) + '</span></div>';
  container.appendChild(box);
  setTimeout(() => {
    box.classList.add('hide');
    setTimeout(() => box.remove(), 320);
  }, 3600);
}

/* ------------------------------------------------------------
   6. MODAIS
   ------------------------------------------------------------ */
function openModal(id) {
  const m = document.getElementById(id);
  m.hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeModal(id) {
  const m = document.getElementById(id);
  m.hidden = true;
  document.body.style.overflow = '';
}
function showAlert(el, message, type = 'error') {
  el.textContent = message;
  el.className = 'alert ' + type;
  el.hidden = false;
}
function hideAlert(el) { el.hidden = true; }

/* Confirmação genérica */
let confirmCallback = null;
function askConfirm(message, onOk, okLabel = 'Confirmar') {
  $('#confirm-message').textContent = message;
  const ok = $('#confirm-ok');
  ok.innerHTML = '<i class="fa-solid fa-check"></i> ' + esc(okLabel);
  confirmCallback = onOk;
  openModal('confirm-modal');
}

/* ------------------------------------------------------------
   7. GRÁFICOS (SVG gerados em JavaScript)
   ------------------------------------------------------------ */
const SVGNS = 'http://www.w3.org/2000/svg';
const charts = {};   // id -> { el, draw }

function registerChart(id, draw) {
  const el = document.getElementById(id);
  if (el) charts[id] = { el, draw };
}

function svgNode(tag, attrs) {
  const node = document.createElementNS(SVGNS, tag);
  if (attrs) {
    for (const key in attrs) node.setAttribute(key, attrs[key]);
  }
  return node;
}

function chartBox(holder) {
  const w = Math.max(holder.clientWidth || 0, 240);
  const h = Math.max(holder.clientHeight || 0, 180);
  holder.innerHTML = '';
  const svg = svgNode('svg', { viewBox: '0 0 ' + w + ' ' + h, preserveAspectRatio: 'none', role: 'img' });
  svg.setAttribute('width', w);
  svg.setAttribute('height', h);
  svg.style.overflow = 'visible';
  holder.appendChild(svg);
  return { svg, w, h };
}

function emptyChart(holder, message) {
  holder.innerHTML = '<div class="chart-empty">' + esc(message) + '</div>';
}

/* Escala "bonita" para o eixo Y */
function niceMax(max) {
  if (!max || max <= 0) return 10;
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  const norm = max / pow;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return step * pow;
}
function shortMoney(v) {
  if (v >= 1000) return (v / 1000).toFixed(v >= 10000 ? 0 : 1).replace('.', ',') + ' k€';
  return fmtMoney(v).replace(/\s?€/, '€');
}
function palette() {
  return [
    cssVar('--brand'), cssVar('--green'), cssVar('--violet'),
    cssVar('--cyan'), cssVar('--amber'), cssVar('--red')
  ];
}

/* --- Barras verticais --- */
function drawBarChart(holder, data, opts = {}) {
  if (!data.length) { emptyChart(holder, 'Sem dados para apresentar.'); return; }
  const { svg, w, h } = chartBox(holder);
  const pad = { top: 16, right: 18, bottom: 38, left: opts.money === false ? 44 : 58 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;
  const max = niceMax(Math.max(...data.map((d) => d.value)));
  const gridColor = cssVar('--border');
  const textColor = cssVar('--text-soft');
  const accent = cssVar('--brand');

  // linhas de grelha + etiquetas Y
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (plotH * i) / 4;
    svg.appendChild(svgNode('line', {
      x1: pad.left, x2: w - pad.right, y1: y, y2: y,
      stroke: gridColor, 'stroke-width': 1, 'stroke-dasharray': i === 4 ? '0' : '4 4'
    }));
    const label = svgNode('text', {
      x: pad.left - 10, y: y + 4, 'text-anchor': 'end',
      'font-size': 10, fill: textColor
    });
    label.textContent = shortMoney((max * (4 - i)) / 4);
    svg.appendChild(label);
  }

  const slot = plotW / data.length;
  const barW = Math.min(slot * 0.6, 54);

  data.forEach((d, i) => {
    const bh = max > 0 ? (d.value / max) * plotH : 0;
    const x = pad.left + slot * i + (slot - barW) / 2;
    const y = pad.top + plotH - bh;

    const bar = svgNode('rect', { x, y, width: barW, height: Math.max(bh, 0), rx: Math.min(7, barW / 2) });
    bar.style.fill = d.color || accent;
    bar.style.opacity = 0.92;
    bar.setAttribute('class', 'chart-bar');
    const tip = svgNode('title');
    tip.textContent = d.label + ': ' + (opts.money === false ? fmtNum(d.value) : fmtMoney(d.value));
    bar.appendChild(tip);
    svg.appendChild(bar);

    const xLabel = svgNode('text', {
      x: x + barW / 2, y: h - pad.bottom + 18, 'text-anchor': 'middle',
      'font-size': 10.5, fill: textColor
    });
    xLabel.textContent = d.label;
    svg.appendChild(xLabel);
  });
}

/* --- Barras horizontais --- */
function drawHBarChart(holder, data, opts = {}) {
  if (!data.length) { emptyChart(holder, 'Sem dados para apresentar.'); return; }
  const { svg, w, h } = chartBox(holder);
  const labelW = Math.min(Math.max(w * 0.3, 110), 210);
  const pad = { top: 12, right: 74, bottom: 12, left: labelW + 12 };
  const plotW = Math.max(w - pad.left - pad.right, 60);
  const rowH = (h - pad.top - pad.bottom) / data.length;
  const barH = Math.min(rowH * 0.62, 30);
  const max = niceMax(Math.max(...data.map((d) => d.value)));
  const textColor = cssVar('--text-soft');
  const colors = palette();

  data.forEach((d, i) => {
    const y = pad.top + rowH * i + (rowH - barH) / 2;
    const bw = max > 0 ? (d.value / max) * plotW : 0;

    const name = svgNode('text', {
      x: labelW, y: y + barH / 2 + 4, 'text-anchor': 'end',
      'font-size': 11.5, fill: textColor
    });
    name.textContent = d.label.length > 26 ? d.label.slice(0, 25) + '…' : d.label;
    const nameTip = svgNode('title');
    nameTip.textContent = d.label;
    name.appendChild(nameTip);
    svg.appendChild(name);

    svg.appendChild(svgNode('rect', {
      x: pad.left, y, width: plotW, height: barH, rx: barH / 2, fill: cssVar('--surface-2'),
      stroke: cssVar('--border'), 'stroke-width': 1
    }));

    const bar = svgNode('rect', { x: pad.left, y, width: Math.max(bw, 2), height: barH, rx: barH / 2 });
    bar.style.fill = d.color || colors[i % colors.length];
    bar.setAttribute('class', 'chart-bar');
    const tip = svgNode('title');
    tip.textContent = d.label + ': ' + (opts.money === false ? fmtNum(d.value) : fmtMoney(d.value));
    bar.appendChild(tip);
    svg.appendChild(bar);

    const value = svgNode('text', {
      x: pad.left + Math.max(bw, 2) + 8, y: y + barH / 2 + 4,
      'font-size': 11, fill: textColor, 'font-weight': 600
    });
    value.textContent = opts.money === false ? fmtNum(d.value) : shortMoney(d.value);
    svg.appendChild(value);
  });
}

/* --- Gráfico circular (doughnut) --- */
function drawDoughnut(holder, data, centerLabel) {
  const total = sum(data, (d) => d.value);
  if (!data.length || total <= 0) { emptyChart(holder, 'Sem dados para apresentar.'); return; }
  const { svg, w, h } = chartBox(holder);
  const legendRight = w >= 430;
  const size = Math.min(legendRight ? w * 0.5 : w, h - 10, 240);
  const cx = legendRight ? size / 2 + 8 : w / 2;
  const cy = legendRight ? h / 2 : size / 2 + 4;
  const rOuter = size / 2 - 6;
  const rInner = rOuter * 0.6;
  const textColor = cssVar('--text-soft');
  const strongColor = cssVar('--text');

  const active = data.filter((d) => d.value > 0);

  if (active.length === 1) {
    // Caso especial: uma única fatia — um arco completo colapsaria num path vazio
    const ring = svgNode('circle', { cx, cy, r: (rOuter + rInner) / 2, fill: 'none', stroke: active[0].color, 'stroke-width': rOuter - rInner });
    const tipOnly = svgNode('title');
    tipOnly.textContent = active[0].label + ': ' + fmtNum(active[0].value) + ' (100%)';
    ring.appendChild(tipOnly);
    svg.appendChild(ring);
  } else {
    let angle = -Math.PI / 2;
    data.forEach((d) => {
      const slice = (d.value / total) * Math.PI * 2;
      if (slice <= 0) return;
      const path = svgNode('path', { d: arcPath(cx, cy, rOuter, rInner, angle, angle + slice) });
      path.style.fill = d.color;
      path.setAttribute('class', 'chart-bar');
      const tip = svgNode('title');
      tip.textContent = d.label + ': ' + fmtNum(d.value) + ' (' + Math.round((d.value / total) * 100) + '%)';
      path.appendChild(tip);
      svg.appendChild(path);
      angle += slice;
    });
  }

  const center = svgNode('text', {
    x: cx, y: cy + 2, 'text-anchor': 'middle', 'font-size': 20,
    'font-weight': 700, fill: strongColor
  });
  center.textContent = fmtNum(total);
  svg.appendChild(center);

  const cap = svgNode('text', {
    x: cx, y: cy + 20, 'text-anchor': 'middle', 'font-size': 10.5, fill: textColor
  });
  cap.textContent = centerLabel || 'total';
  svg.appendChild(cap);

  // legenda
  const items = data.filter((d) => d.value > 0);
  const lx = legendRight ? size + 26 : 10;
  let ly = legendRight ? Math.max(20, h / 2 - items.length * 11) : size + 16;
  items.forEach((d) => {
    const dot = svgNode('rect', { x: lx, y: ly - 8, width: 10, height: 10, rx: 3 });
    dot.style.fill = d.color;
    svg.appendChild(dot);

    const txt = svgNode('text', { x: lx + 16, y: ly + 1, 'font-size': 11, fill: textColor });
    const pct = Math.round((d.value / total) * 100);
    txt.textContent = d.label + ' — ' + fmtNum(d.value) + ' (' + pct + '%)';
    svg.appendChild(txt);

    ly += legendRight ? 22 : 20;
  });
}

function arcPath(cx, cy, rOuter, rInner, start, end) {
  const pt = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const large = end - start > Math.PI ? 1 : 0;
  const [x1, y1] = pt(rOuter, start);
  const [x2, y2] = pt(rOuter, end);
  const [x3, y3] = pt(rInner, end);
  const [x4, y4] = pt(rInner, start);
  return 'M' + x1 + ',' + y1 +
         ' A' + rOuter + ',' + rOuter + ' 0 ' + large + ' 1 ' + x2 + ',' + y2 +
         ' L' + x3 + ',' + y3 +
         ' A' + rInner + ',' + rInner + ' 0 ' + large + ' 0 ' + x4 + ',' + y4 + ' Z';
}

/* --- Gráfico de linha (evolução) --- */
function drawLineChart(holder, data, opts = {}) {
  if (data.length < 2) { emptyChart(holder, 'Dados insuficientes para a evolução.'); return; }
  const { svg, w, h } = chartBox(holder);
  const pad = { top: 18, right: 22, bottom: 40, left: 58 };
  const plotW = w - pad.left - pad.right;
  const plotH = h - pad.top - pad.bottom;
  const max = niceMax(Math.max(...data.map((d) => d.value)));
  const gridColor = cssVar('--border');
  const textColor = cssVar('--text-soft');
  const brand = cssVar('--brand');

  const defs = svgNode('defs');
  const grad = svgNode('linearGradient', { id: 'lineGrad', x1: 0, y1: 0, x2: 0, y2: 1 });
  const s1 = svgNode('stop', { offset: '0%' }); s1.style.stopColor = brand; s1.style.stopOpacity = 0.35;
  const s2 = svgNode('stop', { offset: '100%' }); s2.style.stopColor = brand; s2.style.stopOpacity = 0.02;
  grad.appendChild(s1); grad.appendChild(s2); defs.appendChild(grad);
  svg.appendChild(defs);

  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (plotH * i) / 4;
    svg.appendChild(svgNode('line', {
      x1: pad.left, x2: w - pad.right, y1: y, y2: y,
      stroke: gridColor, 'stroke-dasharray': i === 4 ? '0' : '4 4'
    }));
    const label = svgNode('text', { x: pad.left - 10, y: y + 4, 'text-anchor': 'end', 'font-size': 10, fill: textColor });
    label.textContent = opts.money === false ? fmtNum(Math.round((max * (4 - i)) / 4)) : shortMoney((max * (4 - i)) / 4);
    svg.appendChild(label);
  }

  const stepX = plotW / (data.length - 1);
  const points = data.map((d, i) => ({
    x: pad.left + stepX * i,
    y: pad.top + plotH - (max > 0 ? (d.value / max) * plotH : 0),
    d
  }));

  const line = points.map((p) => p.x + ',' + p.y).join(' ');
  const area = svgNode('polygon', {
    points: pad.left + ',' + (pad.top + plotH) + ' ' + line + ' ' + (pad.left + plotW) + ',' + (pad.top + plotH),
    fill: 'url(#lineGrad)'
  });
  svg.appendChild(area);
  svg.appendChild(svgNode('polyline', {
    points: line, fill: 'none', stroke: brand, 'stroke-width': 2.4,
    'stroke-linejoin': 'round', 'stroke-linecap': 'round'
  }));

  points.forEach((p) => {
    const dot = svgNode('circle', { cx: p.x, cy: p.y, r: 4, fill: cssVar('--surface'), stroke: brand, 'stroke-width': 2.2 });
    const tip = svgNode('title');
    tip.textContent = p.d.label + ': ' + (opts.money === false ? fmtNum(p.d.value) : fmtMoney(p.d.value));
    dot.appendChild(tip);
    dot.setAttribute('class', 'chart-bar');
    svg.appendChild(dot);

    if (p.d.label) {
      const t = svgNode('text', {
        x: p.x, y: h - pad.bottom + 18, 'text-anchor': 'middle', 'font-size': 10, fill: textColor
      });
      t.textContent = p.d.label;
      svg.appendChild(t);
    }
  });
}

/* Re-render dos gráficos de uma página */
function renderCharts(ids) {
  ids.forEach((id) => {
    const chart = charts[id];
    if (chart && chart.el && chart.el.clientWidth > 40) chart.draw(chart.el);
  });
}
function renderAllCharts() {
  Object.keys(charts).forEach((id) => {
    const chart = charts[id];
    if (chart && chart.el && chart.el.clientWidth > 40 && chart.el.offsetParent !== null) chart.draw(chart.el);
  });
}

/* ------------------------------------------------------------
   8. AGREGADOS / ESTATÍSTICAS
   ------------------------------------------------------------ */
function getStats() {
  const products = state.products;
  const sales = state.sales;
  const totalStock = sum(products, (p) => p.stock);
  const lowProducts = products.filter((p) => p.stock <= LOW_STOCK);

  // agregações por produto
  const byProduct = new Map();
  sales.forEach((s) => {
    const key = s.productRef || s.productName;
    const entry = byProduct.get(key) || { ref: s.productRef, name: s.productName, qty: 0, revenue: 0, vat: 0 };
    entry.qty += s.qty;
    entry.revenue = round2(entry.revenue + s.total);
    entry.vat = round2(entry.vat + s.vat);
    byProduct.set(key, entry);
  });
  const productSales = Array.from(byProduct.values());

  const bestSeller = productSales.slice().sort((a, b) => b.qty - a.qty)[0] || null;
  const topRevenue = productSales.slice().sort((a, b) => b.revenue - a.revenue)[0] || null;

  return {
    totalProducts: products.length,
    totalStock,
    stockValue: round2(sum(products, (p) => p.price * p.stock)),
    salesCount: sales.length,
    revenue: round2(sum(sales, (s) => s.total)),
    vatTotal: round2(sum(sales, (s) => s.vat)),
    netTotal: round2(sum(sales, (s) => s.subtotal)),
    avgTicket: sales.length ? round2(sum(sales, (s) => s.total) / sales.length) : 0,
    lowProducts,
    lowCount: lowProducts.length,
    productSales,
    bestSeller,
    topRevenue
  };
}

/* Dados para gráficos temporais */
function lastDaysSeries(days, moneyBased) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const daySales = state.sales.filter((s) => {
      const t = new Date(s.date).getTime();
      return t >= d.getTime() && t < next.getTime();
    });
    out.push({
      label: d.toLocaleDateString('pt-PT', { day: '2-digit', month: '2-digit' }),
      value: moneyBased ? round2(sum(daySales, (s) => s.total)) : daySales.length
    });
  }
  return out;
}

/* Cartões de estatística com animação numérica */
function renderStats(container, cards) {
  container.innerHTML = '';
  cards.forEach((c) => {
    const article = document.createElement('article');
    article.className = 'stat-card';
    article.style.setProperty('--accent', c.accent || 'var(--brand)');
    article.innerHTML =
      '<div class="stat-top">' +
        '<span class="stat-label">' + esc(c.label) + '</span>' +
        '<span class="stat-icon"><i class="' + c.icon + '"></i></span>' +
      '</div>' +
      '<p class="stat-value"></p>' +
      '<p class="stat-foot">' + (c.foot || '') + '</p>';
    container.appendChild(article);

    const valueEl = article.querySelector('.stat-value');
    if (typeof c.value === 'number' && c.format) {
      animateValue(valueEl, c.value, c.format);
    } else {
      valueEl.textContent = c.display || '';
    }
  });
}

function animateValue(el, target, format) {
  const duration = 620;
  const start = performance.now();
  const from = 0;
  function frame(now) {
    const p = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = format(from + (target - from) * eased);
    if (p < 1) requestAnimationFrame(frame);
    else el.textContent = format(target);
  }
  requestAnimationFrame(frame);
}

/* ------------------------------------------------------------
   9. NAVEGAÇÃO (router por hash)
   ------------------------------------------------------------ */
function navigate(page, push = true) {
  if (!PAGES[page]) page = 'dashboard';
  const config = PAGES[page];

  $$('.page').forEach((section) => section.classList.toggle('active', section.id === 'page-' + page));
  $$('.nav-item').forEach((item) => item.classList.toggle('active', item.dataset.page === page));

  $('#page-title').textContent = config.title;
  $('#page-subtitle').textContent = config.subtitle;
  document.title = config.title + ' · GereStock';

  if (push && location.hash !== '#' + page) location.hash = '#' + page;

  renderPage(page);
  closeSidebar();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function renderPage(page) {
  if (page === 'inicio') renderHome();
  if (page === 'dashboard') renderDashboard();
  if (page === 'inventario') renderInventory();
  if (page === 'venda') renderPOS();
  if (page === 'historico') renderHistory();
  if (page === 'clientes') renderClients();
  if (page === 'fornecedores') renderSuppliers();
  if (page === 'movimentos') renderMovements();
  if (page === 'relatorios') renderReports();
  if (page === 'definicoes') renderSettings();
  requestAnimationFrame(() => renderCharts(PAGES[page].chartIds));
}

function updateBranding() {
  const s = state.settings;
  const initials = (s.adminName || 'Admin').trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'AD';
  $('#admin-avatar').textContent = initials;
  $('#admin-name-display').textContent = s.adminName;
  $('#admin-role-display').textContent = s.adminRole;
  $('#home-admin-name').textContent = s.adminName;
  $('#home-store-name').textContent = s.storeName;
  $('#home-store-location').textContent = s.storeLocation;
  $('#home-payment-method').textContent = paymentLabel(s.defaultPayment);
  $('#footer-store-name').textContent = s.storeName;
  $('#footer-store-location').textContent = s.storeLocation;
}

function renderHome() {
  const s = getStats();
  updateBranding();
  renderStats($('#home-stats'), [
    { label: 'Faturação total', value: s.revenue, format: fmtMoney, icon: 'fa-solid fa-euro-sign', accent: 'var(--green)', foot: 'IVA incluído' },
    { label: 'Vendas registadas', value: s.salesCount, format: fmtNum, icon: 'fa-solid fa-receipt', accent: 'var(--brand)', foot: 'Ticket médio: ' + fmtMoney(s.avgTicket) },
    { label: 'Stock baixo', value: s.lowCount, format: fmtNum, icon: 'fa-solid fa-triangle-exclamation', accent: 'var(--amber)', foot: s.lowCount ? 'Produtos a repor' : 'Stock controlado' }
  ]);
}

function renderSettings() {
  const s = state.settings;
  $('#settings-admin-name').value = s.adminName;
  $('#settings-admin-role').value = s.adminRole;
  $('#settings-store-name').value = s.storeName;
  $('#settings-store-location').value = s.storeLocation;
  $('#settings-payment').value = PAYMENT_METHODS[s.defaultPayment] ? s.defaultPayment : 'card';
}

function saveSettingsForm(event) {
  event.preventDefault();
  const values = {
    adminName: $('#settings-admin-name').value.trim(),
    adminRole: $('#settings-admin-role').value.trim(),
    storeName: $('#settings-store-name').value.trim(),
    storeLocation: $('#settings-store-location').value.trim(),
    defaultPayment: $('#settings-payment').value
  };
  if (!values.adminName || !values.adminRole || !values.storeName || !values.storeLocation) {
    toast('Preencha todos os campos das definições.', 'error', 'Dados incompletos');
    return;
  }
  Object.assign(state.settings, values);
  saveSettings();
  updateBranding();
  toast('Definições guardadas com sucesso.', 'success', 'Dados atualizados');
}

/* ------------------------------------------------------------
   10. DASHBOARD
   ------------------------------------------------------------ */
function renderDashboard() {
  const s = getStats();
  const vatRateLabel = 'IVA (' + VAT_RATE + '%)';

  renderStats($('#dashboard-stats'), [
    { label: 'Total de produtos', value: s.totalProducts, format: fmtNum, icon: 'fa-solid fa-boxes-stacking', accent: 'var(--brand)', foot: fmtNum(s.totalStock) + ' unidades em stock' },
    { label: 'Stock total', value: s.totalStock, format: fmtNum, icon: 'fa-solid fa-cubes', accent: 'var(--violet)', foot: 'Valor: ' + fmtMoney(s.stockValue) },
    { label: 'Número de vendas', value: s.salesCount, format: fmtNum, icon: 'fa-solid fa-receipt', accent: 'var(--cyan)', foot: 'Ticket médio: ' + fmtMoney(s.avgTicket) },
    { label: 'Faturação total', value: s.revenue, format: fmtMoney, icon: 'fa-solid fa-euro-sign', accent: 'var(--green)', foot: 'Base: ' + fmtMoney(s.netTotal) },
    { label: vatRateLabel + ' liquidado', value: s.vatTotal, format: fmtMoney, icon: 'fa-solid fa-file-invoice', accent: 'var(--amber)', foot: 'Taxa normal (Portugal)' },
    { label: 'Produtos com stock baixo', value: s.lowCount, format: fmtNum, icon: 'fa-solid fa-triangle-exclamation', accent: s.lowCount ? 'var(--red)' : 'var(--green)', foot: 'Stock igual ou inferior a ' + LOW_STOCK + ' unidades' }
  ]);

  // Últimas vendas
  const latest = state.sales.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);
  const tbody = $('#dashboard-sales-body');
  if (!latest.length) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-inline">Ainda não existem vendas registadas.</div></td></tr>';
  } else {
    tbody.innerHTML = latest.map((sale) =>
      '<tr>' +
        '<td class="mono">#' + String(sale.id).padStart(4, '0') + '</td>' +
        '<td><strong>' + esc(sale.productName) + '</strong><br><span class="mono">' + esc(sale.productRef || '') + '</span></td>' +
        '<td class="num">' + fmtNum(sale.qty) + '</td>' +
        '<td class="num">' + fmtMoney(sale.subtotal) + '</td>' +
        '<td class="num">' + fmtMoney(sale.vat) + '</td>' +
        '<td class="num"><strong>' + fmtMoney(sale.total) + '</strong></td>' +
        '<td>' + fmtDate(sale.date) + '</td>' +
      '</tr>').join('');
  }

  // Stock baixo
  renderLowStockList($('#dashboard-low-stock'), $('#low-stock-count'), s.lowProducts);
  updateSidebarHealth(s);

  // Gráficos
  registerChart('chart-fat', (holder) => {
    drawBarChart(holder, lastDaysSeries(7, true));
  });
  registerChart('chart-stock', (holder) => {
    const crit = state.products.filter((p) => p.stock <= LOW_STOCK).length;
    const warn = state.products.filter((p) => p.stock > LOW_STOCK && p.stock <= MEDIUM_STOCK).length;
    const ok = state.products.filter((p) => p.stock > MEDIUM_STOCK).length;
    drawDoughnut(holder, [
      { label: 'Normal', value: ok, color: cssVar('--green') },
      { label: 'Reduzido', value: warn, color: cssVar('--amber') },
      { label: 'Crítico', value: crit, color: cssVar('--red') }
    ], 'produtos');
  });
  registerChart('chart-products', (holder) => {
    const data = state.products.slice()
      .sort((a, b) => b.stock - a.stock)
      .slice(0, 10)
      .map((p) => ({ label: p.name, value: p.stock, color: cssVar('--brand') }));
    drawHBarChart(holder, data, { money: false });
  });
}

function renderLowStockList(listEl, countEl, lowProducts) {
  if (countEl) countEl.textContent = lowProducts.length;
  if (!listEl) return;

  if (!lowProducts.length) {
    listEl.innerHTML =
      '<li class="empty-inline" style="display:block;border-style:dashed">' +
      '<i class="fa-solid fa-circle-check" style="color:var(--green)"></i><br>' +
      'Sem alertas: todos os produtos têm mais de ' + LOW_STOCK + ' unidades.</li>';

    return;
  }

  listEl.innerHTML = lowProducts
    .sort((a, b) => a.stock - b.stock)
    .map((p) => {
      const st = stockStatus(p.stock);
      return '<li>' +
        '<span><span class="ls-name">' + esc(p.name) + '</span>' +
        '<span class="ls-ref">' + esc(p.ref) + ' · ' + fmtMoney(p.price) + '</span></span>' +
        '<span class="ls-qty" style="color:var(--' + (st.cls === 'crit' ? 'red' : st.cls === 'warn' ? 'amber' : 'green') + ')">' +
        fmtNum(p.stock) + ' un.</span>' +
        '</li>';
    }).join('');
}

function updateSidebarHealth(s) {
  const el = $('#sidebar-low-stock');
  if (el) el.textContent = s.lowCount;
  const bar = $('#sidebar-health-bar');
  if (bar) {
    const total = Math.max(s.totalProducts, 1);
    bar.style.width = Math.min((s.lowCount / total) * 100 * 3, 100) + '%';
  }
}

/* ------------------------------------------------------------
   11. INVENTÁRIO
   ------------------------------------------------------------ */
function getFilteredProducts() {
  const f = state.filters.inventory;
  let list = state.products.slice();

  if (f.search.trim()) {
    const q = f.search.trim().toLowerCase();
    list = list.filter((p) => p.name.toLowerCase().includes(q) || p.ref.toLowerCase().includes(q));
  }

  if (f.stock === 'low')    list = list.filter((p) => p.stock <= LOW_STOCK);
  if (f.stock === 'medium') list = list.filter((p) => p.stock > LOW_STOCK && p.stock <= MEDIUM_STOCK);
  if (f.stock === 'ok')     list = list.filter((p) => p.stock > MEDIUM_STOCK);

  if (f.price === 'p1') list = list.filter((p) => p.price <= 25);
  if (f.price === 'p2') list = list.filter((p) => p.price > 25 && p.price <= 100);
  if (f.price === 'p3') list = list.filter((p) => p.price > 100 && p.price <= 500);
  if (f.price === 'p4') list = list.filter((p) => p.price > 500);

  const sorters = {
    'name-asc':  (a, b) => a.name.localeCompare(b.name, 'pt'),
    'name-desc': (a, b) => b.name.localeCompare(a.name, 'pt'),
    'price-asc': (a, b) => a.price - b.price,
    'price-desc': (a, b) => b.price - a.price,
    'stock-asc': (a, b) => a.stock - b.stock,
    'stock-desc': (a, b) => b.stock - a.stock
  };
  return list.sort(sorters[f.sort] || sorters['name-asc']);
}

function renderInventory() {
  const list = getFilteredProducts();
  const tbody = $('#inventory-body');
  const empty = $('#inv-empty');

  $('#inv-info').textContent =
    list.length + ' de ' + state.products.length + ' produtos · ' +
    fmtNum(sum(list, (p) => p.stock)) + ' unidades · valor ' + fmtMoney(sum(list, (p) => p.price * p.stock));

  if (!list.length) {
    tbody.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  tbody.innerHTML = list.map((p) => {
    const st = stockStatus(p.stock);
    return '<tr>' +
      '<td class="mono">' + esc(p.ref) + '</td>' +
      '<td><strong>' + esc(p.name) + '</strong></td>' +
      '<td class="num">' + fmtMoney(p.price) + '</td>' +
      '<td class="num"><strong>' + fmtNum(p.stock) + '</strong></td>' +
      '<td><span class="badge ' + st.cls + '">' +
        '<i class="fa-solid fa-circle" style="font-size:.5rem"></i> ' + st.label + '</span></td>' +
      '<td class="col-actions"><div class="row-actions">' +
        '<button class="mini-btn edit" data-action="edit" data-id="' + p.id + '" title="Editar produto"><i class="fa-solid fa-pen"></i></button>' +
        '<button class="mini-btn restock" data-action="restock" data-id="' + p.id + '" title="Repor stock"><i class="fa-solid fa-plus"></i></button>' +
        '<button class="mini-btn delete" data-action="delete" data-id="' + p.id + '" title="Eliminar produto"><i class="fa-solid fa-trash"></i></button>' +
      '</div></td>' +
    '</tr>';
  }).join('');
}

/* --- Modal de produto (adicionar / editar) --- */
function openProductModal(product) {
  const editing = Boolean(product);
  $('#product-modal-title').textContent = editing ? 'Editar produto' : 'Adicionar produto';
  $('#product-id').value = editing ? product.id : '';
  $('#product-ref').value = editing ? product.ref : nextRef();
  $('#product-ref').readOnly = true;
  $('#product-name').value = editing ? product.name : '';
  $('#product-price').value = editing ? product.price : '';
  $('#product-stock').value = editing ? product.stock : '';
  $('#product-min-stock').value = editing ? (product.minStock ?? 3) : 3;
  $('#product-category').value = editing ? (product.category || '') : '';
  renderSupplierOptions(editing ? (product.supplierId || '') : '');
  hideAlert($('#product-alert'));
  openModal('product-modal');
  setTimeout(() => $('#product-name').focus(), 60);
}

function nextRef() {
  const nums = state.products
    .map((p) => (p.ref.match(/(\d+)$/) ? parseInt(p.ref.match(/(\d+)$/)[1], 10) : 0))
    .filter((n) => n > 0);
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return 'ART' + String(next).padStart(3, '0');
}

function submitProductForm(event) {
  event.preventDefault();
  const alertEl = $('#product-alert');
  const id = $('#product-id').value;
  const ref = id ? $('#product-ref').value.trim().toUpperCase() : nextRef();
  const name = $('#product-name').value.trim();
  const price = parseFloat($('#product-price').value);
  const stock = parseInt($('#product-stock').value, 10);
  const minStock = parseInt($('#product-min-stock').value, 10);
  const category = $('#product-category').value.trim();
  const supplierId = $('#product-supplier').value;

  if (!ref || !name) { showAlert(alertEl, 'Preencha a referência e o nome do produto.'); return; }
  if (isNaN(price) || price < 0) { showAlert(alertEl, 'Indique um preço válido (maior ou igual a 0).'); return; }
  if (isNaN(stock) || stock < 0) { showAlert(alertEl, 'Indique um stock válido (maior ou igual a 0).'); return; }
  if (isNaN(minStock) || minStock < 0) { showAlert(alertEl, 'Indique um stock mínimo válido.'); return; }

  const duplicated = state.products.some((p) => p.ref === ref && p.id !== id);
  if (duplicated) { showAlert(alertEl, 'Já existe um produto com a referência ' + ref + '.'); return; }

  if (id) {
    const product = state.products.find((p) => p.id === id);
    if (!product) { showAlert(alertEl, 'Produto não encontrado.'); return; }
    Object.assign(product, { ref, name, price: round2(price), stock, minStock, category, supplierId, updatedAt: Date.now() });
    toast(name + ' atualizado com sucesso.', 'success', 'Produto guardado');
  } else {
    state.products.push({
      id: uid(), ref, name, price: round2(price), stock, minStock, category, supplierId,
      createdAt: Date.now(), updatedAt: Date.now()
    });
    toast(name + ' adicionado ao inventário.', 'success', 'Produto criado');
  }

  saveProducts();
  closeModal('product-modal');
  renderInventory();
  refreshAfterDataChange();
}

/* --- Repor stock --- */
let restockProductId = null;
function openRestockModal(product) {
  restockProductId = product.id;
  $('#restock-product-label').innerHTML =
    '<strong>' + esc(product.name) + '</strong> (' + esc(product.ref) + ') · stock atual: ' + fmtNum(product.stock) + ' un.';
  $('#restock-qty').value = 10;
  hideAlert($('#restock-alert'));
  openModal('restock-modal');
  setTimeout(() => $('#restock-qty').select(), 60);
}

function submitRestockForm(event) {
  event.preventDefault();
  const alertEl = $('#restock-alert');
  const qty = parseInt($('#restock-qty').value, 10);
  const product = state.products.find((p) => p.id === restockProductId);

  if (!product) { showAlert(alertEl, 'Produto não encontrado.'); return; }
  if (isNaN(qty) || qty <= 0) { showAlert(alertEl, 'A quantidade a adicionar tem de ser maior que zero.'); return; }

  product.stock += qty;
  product.updatedAt = Date.now();
  state.movements.unshift({ id: uid(), productId: product.id, productName: product.name, productRef: product.ref, type: 'Entrada', qty, date: new Date().toISOString(), note: 'Reposição de stock' });
  saveProducts();
  saveMovements();
  closeModal('restock-modal');
  toast('+' + fmtNum(qty) + ' un. em ' + product.name + ' (stock: ' + fmtNum(product.stock) + ').', 'success', 'Stock reposto');
  renderInventory();
  refreshAfterDataChange();
}

/* --- Eliminar produto --- */
function confirmDeleteProduct(product) {
  askConfirm(
    'Eliminar o produto "' + product.name + '" (' + product.ref + ')? As vendas já registadas no histórico são mantidas.',
    () => {
      state.products = state.products.filter((p) => p.id !== product.id);
      saveProducts();
      toast(product.name + ' removido do inventário.', 'info', 'Produto eliminado');
      renderInventory();
      refreshAfterDataChange();
    },
    'Eliminar'
  );
}

/* ------------------------------------------------------------
   12. REGISTAR VENDA (POS)
   ------------------------------------------------------------ */
function renderPOS() {
  const select = $('#sale-product');
  const current = select.value;
  const options = ['<option value="">— Selecione um produto —</option>'].concat(
    state.products
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, 'pt'))
      .map((p) => '<option value="' + p.id + '">' + esc(p.ref) + ' · ' + esc(p.name) +
        ' (' + fmtNum(p.stock) + ' un.)</option>')
  );
  select.innerHTML = options.join('');
  if (current && state.products.some((p) => p.id === current)) select.value = current;
  const payment = $('#sale-payment');
  if (payment) payment.value = PAYMENT_METHODS[state.settings.defaultPayment] ? state.settings.defaultPayment : 'card';
  updateSalePreview();
}

function selectedSaleProduct() {
  return state.products.find((p) => p.id === $('#sale-product').value) || null;
}

function updateSalePreview() {
  const product = selectedSaleProduct();
  const qtyInput = $('#sale-qty');
  let qty = parseInt(qtyInput.value, 10);
  if (isNaN(qty) || qty < 1) qty = 1;

  const stockChip = $('#sale-stock-chip');
  const priceChip = $('#sale-price-chip');
  const hint = $('#sale-product-hint');

  if (!product) {
    stockChip.className = 'stock-chip';
    stockChip.innerHTML = '<i class="fa-solid fa-warehouse"></i> Stock: —';
    priceChip.innerHTML = '<i class="fa-solid fa-tag"></i> Preço: —';
    hint.textContent = 'Selecione um produto para ver o stock disponível.';
    $('#sum-product').textContent = '—';
    $('#sum-ref').textContent = '—';
    $('#sum-qty').textContent = '0';
    $('#sum-price').textContent = '—';
    $('#sum-payment').textContent = paymentLabel($('#sale-payment').value);
    $('#sum-client').textContent = 'Consumidor final';
    $('#sum-discount').textContent = fmtMoney(0);
    $('#sum-subtotal').textContent = fmtMoney(0);
    $('#sum-iva').textContent = fmtMoney(0);
    $('#sum-total').textContent = fmtMoney(0);
    $('#sale-lines').innerHTML = '';
    return;
  }

  const st = stockStatus(product.stock);
  stockChip.className = 'stock-chip' + (product.stock <= LOW_STOCK ? ' low' : '');
  stockChip.innerHTML = '<i class="fa-solid fa-warehouse"></i> Stock disponível: ' + fmtNum(product.stock) + ' un.';
  priceChip.innerHTML = '<i class="fa-solid fa-tag"></i> Preço: ' + fmtMoney(product.price) + ' / un.';
  hint.textContent = 'Estado do stock: ' + st.label + ' · IVA aplicado: ' + VAT_RATE + '%.';

  const discount = Math.max(0, parseFloat($('#sale-discount').value) || 0);
  const base = computeSale(product.price, qty);
  const subtotal = Math.max(0, round2(base.subtotal - discount));
  const vat = round2(subtotal * (VAT_RATE / 100));
  const total = round2(subtotal + vat);
  const client = state.clients.find(c => c.id === $('#sale-client').value);

  $('#sum-product').textContent = product.name;
  $('#sum-ref').textContent = product.ref;
  $('#sum-qty').textContent = fmtNum(qty);
  $('#sum-price').textContent = fmtMoney(product.price);
  $('#sum-payment').textContent = paymentLabel($('#sale-payment').value);
  $('#sum-client').textContent = client ? client.name : 'Consumidor final';
  $('#sum-discount').textContent = fmtMoney(discount);
  $('#sum-subtotal').textContent = fmtMoney(subtotal);
  $('#sum-iva').textContent = fmtMoney(vat);
  $('#sum-total').textContent = fmtMoney(total);

  $('#sale-lines').innerHTML =
    '<div class="line"><span>Preço</span><strong>' + fmtMoney(product.price) + '</strong></div>' +
    '<div class="line"><span>Quantidade</span><strong>' + fmtNum(qty) + '</strong></div>' +
    '<div class="line"><span>Subtotal</span><strong>' + fmtMoney(subtotal) + '</strong></div>' +
    '<div class="line"><span>Desconto</span><strong>' + fmtMoney(discount) + '</strong></div>' +
    '<div class="line"><span>IVA (' + VAT_RATE + '%)</span><strong>' + fmtMoney(vat) + '</strong></div>' +
    '<div class="line"><span>Total</span><strong style="color:var(--brand)">' + fmtMoney(total) + '</strong></div>';
}

function finalizeSale(event) {
  event.preventDefault();
  const alertEl = $('#sale-alert');
  const product = selectedSaleProduct();
  const qty = parseInt($('#sale-qty').value, 10);
  const paymentMethod = $('#sale-payment').value;

  // validações
  if (!product) { showAlert(alertEl, 'Selecione um produto antes de finalizar a venda.'); toast('Nenhum produto selecionado.', 'error', 'Venda não registada'); return; }
  if (isNaN(qty) || qty <= 0) { showAlert(alertEl, 'A quantidade tem de ser um número inteiro maior que zero.'); toast('Quantidade inválida.', 'error', 'Venda não registada'); return; }
  if (qty > product.stock) {
    showAlert(alertEl, 'Stock insuficiente: apenas ' + fmtNum(product.stock) + ' un. de ' + product.name + ' em stock (pedido: ' + fmtNum(qty) + ').');
    toast('Stock insuficiente para ' + product.name + '.', 'error', 'Venda não registada');
    return;
  }

  const discount = Math.max(0, parseFloat($('#sale-discount').value) || 0);
  const clientId = $('#sale-client').value || '';
  const client = state.clients.find((c) => c.id === clientId);
  const base = computeSale(product.price, qty);
  const subtotalAfterDiscount = Math.max(0, round2(base.subtotal - discount));
  const vat = round2(subtotalAfterDiscount * (VAT_RATE / 100));
  const total = round2(subtotalAfterDiscount + vat);
  state.settings.counter = (state.settings.counter || 0) + 1;
  const sale = {
    id: state.settings.counter, saleNumber: 'VND' + String(state.settings.counter).padStart(4, '0'),
    productId: product.id, productName: product.name, productRef: product.ref, unitPrice: product.price, qty,
    subtotal: subtotalAfterDiscount, discount, vat, total, vatRate: VAT_RATE, paymentMethod,
    clientId, clientName: client ? client.name : 'Consumidor final', clientNif: client ? client.nif : '',
    employee: state.settings.adminName, status: 'Concluída', date: new Date().toISOString()
  };

  // atualizar stock e histórico
  product.stock -= qty;
  product.updatedAt = Date.now();
  state.sales.push(sale);
  state.movements.unshift({ id: uid(), productId: product.id, productName: product.name, productRef: product.ref, type: 'Saída', qty, date: sale.date, note: 'Venda ' + sale.saleNumber });

  saveProducts();
  saveSales();
  saveMovements();
  saveSettings();

  hideAlert(alertEl);
  toast('#' + String(sale.id).padStart(4, '0') + ' · ' + product.name + ' ×' + qty + ' = ' + fmtMoney(sale.total) + '. Stock atual: ' + fmtNum(product.stock) + ' un.', 'success', 'Venda registada');
  clearSaleForm();
  renderPOS();
  refreshAfterDataChange();
}

function clearSaleForm() {
  const qty = $('#sale-qty');
  if (qty) qty.value = 1;
  const payment = $('#sale-payment');
  if (payment) payment.value = state.settings.defaultPayment || 'card';
  if ($('#sale-client')) $('#sale-client').value = '';
  if ($('#sale-discount')) $('#sale-discount').value = 0;
  hideAlert($('#sale-alert'));
  updateSalePreview();
}

/* ------------------------------------------------------------
   12B. CLIENTES, FORNECEDORES E MOVIMENTOS
   ------------------------------------------------------------ */
function renderSupplierOptions(selected = '') {
  const el = $('#product-supplier');
  if (!el) return;
  el.innerHTML = '<option value="">Sem fornecedor</option>' + state.suppliers.map(s => '<option value="'+esc(s.id)+'">'+esc(s.name)+'</option>').join('');
  el.value = selected || '';
}
function renderClientOptions(selected = '') {
  const el = $('#sale-client');
  if (!el) return;
  el.innerHTML = '<option value="">Consumidor final</option>' + state.clients.map(c => '<option value="'+esc(c.id)+'">'+esc(c.name)+(c.nif ? ' — '+esc(c.nif) : '')+'</option>').join('');
  el.value = selected || '';
}
function renderClients() {
  const q = ($('#client-search')?.value || '').toLowerCase();
  const rows = state.clients.filter(c => [c.name,c.nif,c.phone,c.email].join(' ').toLowerCase().includes(q));
  $('#clients-body').innerHTML = rows.map(c => '<tr><td><strong>'+esc(c.name)+'</strong></td><td>'+esc(c.nif||'—')+'</td><td>'+esc(c.phone||'—')+'</td><td>'+esc(c.email||'—')+'</td><td>'+esc(c.address||'—')+'</td><td class="col-actions"><div class="row-actions"><button class="mini-btn edit" data-action="edit-client" data-id="'+c.id+'"><i class="fa-solid fa-pen"></i></button><button class="mini-btn delete" data-action="delete-client" data-id="'+c.id+'"><i class="fa-solid fa-trash"></i></button></div></td></tr>').join('') || '<tr><td colspan="6" class="muted">Ainda não existem clientes registados.</td></tr>';
}
function renderSuppliers() {
  const q = ($('#supplier-search')?.value || '').toLowerCase();
  const rows = state.suppliers.filter(s => [s.name,s.nif,s.phone,s.email].join(' ').toLowerCase().includes(q));
  $('#suppliers-body').innerHTML = rows.map(s => '<tr><td><strong>'+esc(s.name)+'</strong></td><td>'+esc(s.nif||'—')+'</td><td>'+esc(s.phone||'—')+'</td><td>'+esc(s.email||'—')+'</td><td>'+esc(s.address||'—')+'</td><td class="col-actions"><div class="row-actions"><button class="mini-btn edit" data-action="edit-supplier" data-id="'+s.id+'"><i class="fa-solid fa-pen"></i></button><button class="mini-btn delete" data-action="delete-supplier" data-id="'+s.id+'"><i class="fa-solid fa-trash"></i></button></div></td></tr>').join('') || '<tr><td colspan="6" class="muted">Ainda não existem fornecedores registados.</td></tr>';
}
function renderMovements() {
  const rows = state.movements.slice().sort((a,b)=>new Date(b.date)-new Date(a.date));
  $('#movements-body').innerHTML = rows.map(m => '<tr><td>'+fmtDate(m.date)+'</td><td>'+esc(m.productName)+'</td><td>'+esc(m.productRef)+'</td><td><span class="pill '+(m.type==='Entrada'?'pill-ok':'pill-warn')+'">'+esc(m.type)+'</span></td><td class="num">'+(m.type==='Entrada'?'+':'-')+fmtNum(m.qty)+'</td><td>'+esc(m.note||'')+'</td></tr>').join('') || '<tr><td colspan="6" class="muted">Ainda não existem movimentos registados.</td></tr>';
}
function openClientModal(client=null) {
  $('#client-id').value=client?client.id:''; $('#client-name').value=client?client.name:''; $('#client-nif').value=client?client.nif||'':''; $('#client-phone').value=client?client.phone||'':''; $('#client-email').value=client?client.email||'':''; $('#client-address').value=client?client.address||'':''; $('#client-modal-title').textContent=client?'Editar cliente':'Novo cliente'; hideAlert($('#client-alert')); openModal('client-modal');
}
function openSupplierModal(supplier=null) {
  $('#supplier-id').value=supplier?supplier.id:''; $('#supplier-name').value=supplier?supplier.name:''; $('#supplier-nif').value=supplier?supplier.nif||'':''; $('#supplier-phone').value=supplier?supplier.phone||'':''; $('#supplier-email').value=supplier?supplier.email||'':''; $('#supplier-address').value=supplier?supplier.address||'':''; $('#supplier-modal-title').textContent=supplier?'Editar fornecedor':'Novo fornecedor'; hideAlert($('#supplier-alert')); openModal('supplier-modal');
}
function isValidEmail(email){return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);}
function keepDigitsOnly(input){if(!input)return;input.addEventListener('input',()=>{const cleaned=input.value.replace(/\D/g,'').slice(0,9);if(input.value!==cleaned)input.value=cleaned;});}
['#client-nif','#client-phone','#supplier-nif','#supplier-phone'].forEach(selector=>keepDigitsOnly($(selector)));
function saveClientForm(e){e.preventDefault();const id=$('#client-id').value;const c={id:id||uid(),name:$('#client-name').value.trim(),nif:$('#client-nif').value.trim(),phone:$('#client-phone').value.trim(),email:$('#client-email').value.trim(),address:$('#client-address').value.trim()};if(!c.name){showAlert($('#client-alert'),'O nome do cliente é obrigatório.');return;}if(!c.email){showAlert($('#client-alert'),'O email do cliente é obrigatório.');return;}if(!isValidEmail(c.email)){showAlert($('#client-alert'),'Introduza um email válido.');return;}if(!/^\d{9}$/.test(c.phone)){showAlert($('#client-alert'),'O telefone é obrigatório e deve conter exatamente 9 dígitos, sem letras ou espaços.');return;}if(c.nif&&!/^\d{9}$/.test(c.nif)){showAlert($('#client-alert'),'O NIF, se preenchido, deve conter exatamente 9 dígitos, sem letras ou espaços.');return;}if(id){Object.assign(state.clients.find(x=>x.id===id),c)}else state.clients.push(c);saveClients();closeModal('client-modal');renderClients();renderClientOptions();toast('Cliente guardado com sucesso.','success','Clientes');}
function saveSupplierForm(e){e.preventDefault();const id=$('#supplier-id').value;const s={id:id||uid(),name:$('#supplier-name').value.trim(),nif:$('#supplier-nif').value.trim(),phone:$('#supplier-phone').value.trim(),email:$('#supplier-email').value.trim(),address:$('#supplier-address').value.trim()};if(!s.name){showAlert($('#supplier-alert'),'O nome da empresa é obrigatório.');return;}if(!s.email){showAlert($('#supplier-alert'),'O email do fornecedor é obrigatório.');return;}if(!isValidEmail(s.email)){showAlert($('#supplier-alert'),'Introduza um email válido.');return;}if(!/^\d{9}$/.test(s.phone)){showAlert($('#supplier-alert'),'O telefone é obrigatório e deve conter exatamente 9 dígitos, sem letras ou espaços.');return;}if(!/^\d{9}$/.test(s.nif)){showAlert($('#supplier-alert'),'O NIF é obrigatório e deve conter exatamente 9 dígitos, sem letras ou espaços.');return;}if(id){Object.assign(state.suppliers.find(x=>x.id===id),s)}else state.suppliers.push(s);saveSuppliers();closeModal('supplier-modal');renderSuppliers();renderSupplierOptions();toast('Fornecedor guardado com sucesso.','success','Fornecedores');}
function printSale(sale){const w=window.open('','_blank','width=760,height=700');if(!w){toast('Permita janelas pop-up para imprimir o recibo.','error');return;}w.document.write('<!doctype html><html lang="pt-PT"><head><meta charset="utf-8"><title>'+esc(sale.saleNumber||('VND'+sale.id))+'</title><style>body{font-family:Arial,sans-serif;max-width:700px;margin:40px auto;padding:20px;color:#111}h1{margin-bottom:4px}table{width:100%;border-collapse:collapse;margin-top:25px}th,td{padding:9px;border-bottom:1px solid #ddd;text-align:left}.total{text-align:right;font-size:22px;font-weight:bold;margin-top:20px}.muted{color:#666}</style></head><body><h1>GereStock</h1><p class="muted">Recibo de venda</p><p><strong>N.º:</strong> '+esc(sale.saleNumber||('VND'+String(sale.id).padStart(4,'0')))+'<br><strong>Data:</strong> '+fmtDate(sale.date)+'<br><strong>Funcionário:</strong> '+esc(sale.employee||state.settings.adminName)+'<br><strong>Cliente:</strong> '+esc(sale.clientName||'Consumidor final')+(sale.clientNif?' — NIF '+esc(sale.clientNif):'')+'</p><table><tr><th>Produto</th><th>Qtd.</th><th>Preço</th><th>Total</th></tr><tr><td>'+esc(sale.productName)+'<br><small>'+esc(sale.productRef)+'</small></td><td>'+fmtNum(sale.qty)+'</td><td>'+fmtMoney(sale.unitPrice)+'</td><td>'+fmtMoney(sale.subtotal)+'</td></tr></table><p>Desconto: '+fmtMoney(sale.discount||0)+'<br>IVA ('+sale.vatRate+'%): '+fmtMoney(sale.vat)+'</p><div class="total">Total: '+fmtMoney(sale.total)+'</div><p class="muted">Pagamento: '+paymentLabel(sale.paymentMethod)+' · Estado: '+esc(sale.status||'Concluída')+'</p><script>window.onload=()=>window.print();</script></body></html>');w.document.close();}

/* ------------------------------------------------------------
   13. HISTÓRICO DE VENDAS
   ------------------------------------------------------------ */
function getFilteredSales() {
  const f = state.filters.history;
  let list = state.sales.slice();

  if (f.search.trim()) {
    const q = f.search.trim().toLowerCase();
    list = list.filter((s) =>
      s.productName.toLowerCase().includes(q) ||
      String(s.productRef || '').toLowerCase().includes(q) ||
      String(s.id).includes(q));
  }
  if (f.product !== 'all') list = list.filter((s) => s.productRef === f.product);
  if (f.date) {
    list = list.filter((s) => new Date(s.date).toISOString().slice(0, 10) === f.date);
  }

  const sorters = {
    recent:      (a, b) => new Date(b.date) - new Date(a.date),
    old:         (a, b) => new Date(a.date) - new Date(b.date),
    'total-desc': (a, b) => b.total - a.total,
    'total-asc':  (a, b) => a.total - b.total
  };
  return list.sort(sorters[f.sort] || sorters.recent);
}

function renderHistory() {
  const filtered = getFilteredSales();
  const f = state.filters.history;

  renderStats($('#history-stats'), [
    { label: 'Total faturado', value: round2(sum(filtered, (s) => s.total)), format: fmtMoney, icon: 'fa-solid fa-euro-sign', accent: 'var(--green)', foot: 'Faturação (IVA incluído)' },
    { label: 'Total de IVA', value: round2(sum(filtered, (s) => s.vat)), format: fmtMoney, icon: 'fa-solid fa-file-invoice', accent: 'var(--amber)', foot: 'IVA liquidado a ' + VAT_RATE + '%' },
    { label: 'Número de vendas', value: filtered.length, format: fmtNum, icon: 'fa-solid fa-receipt', accent: 'var(--brand)', foot: filtered.length !== state.sales.length ? 'Vendas filtradas de ' + state.sales.length : 'Todas as vendas registadas' }
  ]);

  // filtro por produto
  const productSelect = $('#hist-product');
  const currentProduct = productSelect.value || f.product;
  productSelect.innerHTML = '<option value="all">Todos os produtos</option>' +
    state.products.slice().sort((a, b) => a.name.localeCompare(b.name, 'pt'))
      .map((p) => '<option value="' + esc(p.ref) + '">' + esc(p.ref) + ' · ' + esc(p.name) + '</option>').join('');
  productSelect.value = currentProduct && Array.from(productSelect.options).some((o) => o.value === currentProduct)
    ? currentProduct : f.product;

  const pages = Math.max(Math.ceil(filtered.length / PAGE_SIZE), 1);
  if (f.page > pages) f.page = pages;
  const start = (f.page - 1) * PAGE_SIZE;
  const pageItems = filtered.slice(start, start + PAGE_SIZE);

  $('#hist-info').textContent = filtered.length + ' venda(s) encontrada(s) · a mostrar ' +
    (filtered.length ? (start + 1) + '–' + (start + pageItems.length) : '0') + ' de ' + filtered.length;

  const tbody = $('#history-body');
  if (!pageItems.length) {
    tbody.innerHTML = '<tr><td colspan="10"><div class="empty-inline">Nenhuma venda corresponde aos filtros selecionados.</div></td></tr>';
  } else {
    tbody.innerHTML = pageItems.map((s) =>
      '<tr>' +
        '<td class="mono">#' + String(s.id).padStart(4, '0') + '</td>' +
        '<td><strong>' + esc(s.productName) + '</strong></td>' +
        '<td class="mono">' + esc(s.productRef || '') + '</td>' +
        '<td class="num">' + fmtNum(s.qty) + '</td>' +
        '<td class="num">' + fmtMoney(s.subtotal) + '</td>' +
        '<td class="num">' + fmtMoney(s.vat) + '</td>' +
        '<td class="num"><strong>' + fmtMoney(s.total) + '</strong></td>' +
        '<td>' + esc(paymentLabel(s.paymentMethod)) + '</td>' +
        '<td>' + fmtDate(s.date) + '</td>' +
        '<td class="col-actions"><div class="row-actions">' +
          '<button class="mini-btn" data-action="print-sale" title="Imprimir recibo"><i class="fa-solid fa-print"></i></button><button class="mini-btn delete" data-action="delete-sale" data-id="' + s.id + '" title="Anular venda e repor stock"><i class="fa-solid fa-rotate-left"></i></button>' +
        '</div></td>' +
      '</tr>').join('');
  }

  // paginação
  const pag = $('#hist-pagination');
  pag.innerHTML = '';
  if (filtered.length > PAGE_SIZE) {
    const addBtn = (label, page, disabled, active) => {
      const b = document.createElement('button');
      b.textContent = label;
      if (active) b.classList.add('active');
      b.disabled = Boolean(disabled);
      b.addEventListener('click', () => { f.page = page; renderHistory(); });
      pag.appendChild(b);
    };
    addBtn('‹', Math.max(f.page - 1, 1), f.page === 1, false);
    for (let i = 1; i <= pages; i++) {
      if (pages > 7 && i !== 1 && i !== pages && Math.abs(i - f.page) > 1) {
        if (i === 2 || i === pages - 1) {
          const span = document.createElement('button');
          span.textContent = '…';
          span.disabled = true;
          pag.appendChild(span);
        }
        continue;
      }
      addBtn(String(i), i, false, i === f.page);
    }
    addBtn('›', Math.min(f.page + 1, pages), f.page === pages, false);
  }
}

function confirmCancelSale(sale) {
  askConfirm(
    'Anular a venda #' + String(sale.id).padStart(4, '0') + ' (' + sale.productName + ' ×' + sale.qty +
    ' — ' + fmtMoney(sale.total) + ')? O stock será reposto em ' + sale.qty + ' unidade(s).',
    () => {
      const product = state.products.find((p) => p.id === sale.productId);
      if (product) {
        product.stock += sale.qty;
        product.updatedAt = Date.now();
        saveProducts();
        state.movements.unshift({ id: uid(), productId: product.id, productName: product.name, productRef: product.ref, type: 'Entrada', qty: sale.qty, date: new Date().toISOString(), note: 'Anulação ' + (sale.saleNumber || ('VND' + String(sale.id).padStart(4, '0'))) });
        saveMovements();
      }
      state.sales = state.sales.filter((s) => s.id !== sale.id);
      saveSales();
      toast('Venda #' + String(sale.id).padStart(4, '0') + ' anulada.' + (product ? ' Stock de ' + product.name + ': ' + fmtNum(product.stock) + ' un.' : ''), 'info', 'Venda anulada');
      renderHistory();
      refreshAfterDataChange();
    },
    'Anular venda'
  );
}

/* ------------------------------------------------------------
   14. RELATÓRIOS
   ------------------------------------------------------------ */
function renderReports() {
  const s = getStats();

  renderStats($('#report-stats'), [
    { label: 'Faturação total', value: s.revenue, format: fmtMoney, icon: 'fa-solid fa-euro-sign', accent: 'var(--green)', foot: 'Com IVA incluído' },
    { label: 'IVA total', value: s.vatTotal, format: fmtMoney, icon: 'fa-solid fa-file-invoice', accent: 'var(--amber)', foot: 'Taxa de ' + VAT_RATE + '%' },
    { label: 'Número de vendas', value: s.salesCount, format: fmtNum, icon: 'fa-solid fa-receipt', accent: 'var(--brand)', foot: 'Ticket médio ' + fmtMoney(s.avgTicket) },
    {
      label: 'Produto mais vendido', display: s.bestSeller ? s.bestSeller.name : '—',
      icon: 'fa-solid fa-ranking-star', accent: 'var(--violet)',
      foot: s.bestSeller ? fmtNum(s.bestSeller.qty) + ' unidades vendidas' : 'Sem vendas registadas'
    },
    {
      label: 'Maior faturação', display: s.topRevenue ? s.topRevenue.name : '—',
      icon: 'fa-solid fa-trophy', accent: 'var(--cyan)',
      foot: s.topRevenue ? fmtMoney(s.topRevenue.revenue) + ' faturados' : 'Sem vendas registadas'
    },
    { label: 'Stock total', value: s.totalStock, format: fmtNum, icon: 'fa-solid fa-cubes', accent: 'var(--brand)', foot: 'Valor de inventário ' + fmtMoney(s.stockValue) },
    { label: 'Produtos com stock baixo', value: s.lowCount, format: fmtNum, icon: 'fa-solid fa-triangle-exclamation', accent: s.lowCount ? 'var(--red)' : 'var(--green)', foot: 'Limite: ≤ ' + LOW_STOCK + ' unidades' },
    { label: 'Produtos no catálogo', value: s.totalProducts, format: fmtNum, icon: 'fa-solid fa-boxes-stacking', accent: 'var(--violet)', foot: 'Valor médio ' + fmtMoney(s.totalProducts ? s.stockValue / s.totalProducts : 0) + ' / produto' }
  ]);

  // tabela de stock baixo
  const lowBody = $('#report-low-stock');
  if (!s.lowProducts.length) {
    lowBody.innerHTML = '<tr><td colspan="5"><div class="empty-inline">Nenhum produto com stock igual ou inferior a ' + LOW_STOCK + ' unidades.</div></td></tr>';
  } else {
    lowBody.innerHTML = s.lowProducts.slice().sort((a, b) => a.stock - b.stock).map((p) =>
      '<tr>' +
        '<td class="mono">' + esc(p.ref) + '</td>' +
        '<td><strong>' + esc(p.name) + '</strong></td>' +
        '<td class="num"><span class="badge ' + stockStatus(p.stock).cls + '">' + fmtNum(p.stock) + '</span></td>' +
        '<td class="num">' + fmtMoney(p.price) + '</td>' +
        '<td class="num">' + fmtMoney(round2(p.price * p.stock)) + '</td>' +
      '</tr>').join('');
  }

  registerChart('chart-sales-by-product', (holder) => {
    const data = s.productSales.slice().sort((a, b) => b.qty - a.qty).slice(0, 8)
      .map((p) => ({ label: p.name, value: p.qty, color: cssVar('--brand') }));
    drawHBarChart(holder, data, { money: false });
  });

  registerChart('chart-revenue-by-product', (holder) => {
    const data = s.productSales.slice().sort((a, b) => b.revenue - a.revenue).slice(0, 8)
      .map((p) => ({ label: p.name, value: p.revenue, color: cssVar('--green') }));
    drawHBarChart(holder, data);
  });

  registerChart('chart-evolution', (holder) => {
    drawLineChart(holder, lastDaysSeries(14, true));
  });

  registerChart('chart-stock-report', (holder) => {
    const data = state.products.slice().sort((a, b) => b.stock - a.stock).slice(0, 6)
      .map((p, i) => ({ label: p.name, value: p.stock, color: palette()[i % palette().length] }));
    drawDoughnut(holder, data, 'unidades');
  });
}

/* ------------------------------------------------------------
   15. EXPORTAÇÃO EXCEL
   ------------------------------------------------------------ */
function downloadExcel(filename, rows, sheetName) {
  if (typeof XLSX === 'undefined') {
    toast('Não foi possível carregar a biblioteca de exportação.', 'error', 'Exportação cancelada');
    return;
  }
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet['!cols'] = rows[0].map(() => ({ wch: 18 }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filename);
}

function exportSalesExcel() {
  const list = getFilteredSales();
  if (!list.length) { toast('Não existem vendas para exportar com os filtros atuais.', 'error', 'Exportação cancelada'); return; }

  const rows = [['ID', 'Produto', 'Referência', 'Quantidade', 'Preço unitário (EUR)', 'Subtotal (EUR)', 'IVA (EUR)', 'Taxa IVA (%)', 'Total (EUR)', 'Pagamento', 'Data']];
  list.forEach((s) => rows.push([
    String(s.id).padStart(4, '0'), s.productName, s.productRef || '', s.qty,
    s.unitPrice.toFixed(2).replace('.', ','),
    s.subtotal.toFixed(2).replace('.', ','),
    s.vat.toFixed(2).replace('.', ','),
    String(s.vatRate || VAT_RATE),
    s.total.toFixed(2).replace('.', ','),
    paymentLabel(s.paymentMethod),
    fmtDate(s.date)
  ]));
  rows.push([]);
  rows.push(['Total faturado (EUR)', round2(sum(list, (s) => s.total)).toFixed(2).replace('.', ',')]);
  rows.push(['Total de IVA (EUR)', round2(sum(list, (s) => s.vat)).toFixed(2).replace('.', ',')]);
  rows.push(['Número de vendas', list.length]);

  downloadExcel('gerestock-vendas-' + new Date().toISOString().slice(0, 10) + '.xlsx', rows, 'Vendas');
  toast(list.length + ' venda(s) exportada(s) para Excel.', 'success', 'Exportação concluída');
}

function exportReportExcel() {
  const s = getStats();
  const rows = [];

  rows.push(['GereStock — Relatório de gestão']);
  rows.push(['Gerado em', fmtDate(new Date().toISOString())]);
  rows.push([]);
  rows.push(['INDICADORES']);
  rows.push(['Faturação total (EUR)', s.revenue.toFixed(2).replace('.', ',')]);
  rows.push(['IVA total (EUR)', s.vatTotal.toFixed(2).replace('.', ',')]);
  rows.push(['Base tributável (EUR)', s.netTotal.toFixed(2).replace('.', ',')]);
  rows.push(['Número de vendas', s.salesCount]);
  rows.push(['Ticket médio (EUR)', s.avgTicket.toFixed(2).replace('.', ',')]);
  rows.push(['Total de produtos', s.totalProducts]);
  rows.push(['Stock total (unidades)', s.totalStock]);
  rows.push(['Valor do inventário (EUR)', s.stockValue.toFixed(2).replace('.', ',')]);
  rows.push(['Produtos com stock baixo', s.lowCount]);
  rows.push(['Produto mais vendido', s.bestSeller ? s.bestSeller.name + ' (' + s.bestSeller.qty + ' un.)' : '—']);
  rows.push(['Produto com maior faturação', s.topRevenue ? s.topRevenue.name + ' (' + s.topRevenue.revenue.toFixed(2).replace('.', ',') + ' EUR)' : '—']);
  rows.push([]);

  rows.push(['VENDAS POR PRODUTO']);
  rows.push(['Referência', 'Produto', 'Unidades vendidas', 'Faturação (EUR)', 'IVA (EUR)']);
  s.productSales.slice().sort((a, b) => b.revenue - a.revenue).forEach((p) => rows.push([
    p.ref || '', p.name, p.qty,
    p.revenue.toFixed(2).replace('.', ','),
    p.vat.toFixed(2).replace('.', ',')
  ]));
  rows.push([]);

  rows.push(['INVENTÁRIO']);
  rows.push(['Referência', 'Produto', 'Preço (EUR)', 'Stock', 'Estado', 'Valor em stock (EUR)']);
  state.products.slice().sort((a, b) => a.ref.localeCompare(b.ref)).forEach((p) => rows.push([
    p.ref, p.name,
    p.price.toFixed(2).replace('.', ','),
    p.stock,
    stockStatus(p.stock).label,
    round2(p.price * p.stock).toFixed(2).replace('.', ',')
  ]));
  rows.push([]);

  rows.push(['HISTÓRICO DE VENDAS']);
  rows.push(['ID', 'Produto', 'Referência', 'Quantidade', 'Subtotal (EUR)', 'IVA (EUR)', 'Total (EUR)', 'Pagamento', 'Data']);
  state.sales.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).forEach((sale) => rows.push([
    String(sale.id).padStart(4, '0'), sale.productName, sale.productRef || '', sale.qty,
    sale.subtotal.toFixed(2).replace('.', ','),
    sale.vat.toFixed(2).replace('.', ','),
    sale.total.toFixed(2).replace('.', ','),
    paymentLabel(sale.paymentMethod),
    fmtDate(sale.date)
  ]));

  downloadExcel('gerestock-relatorio-' + new Date().toISOString().slice(0, 10) + '.xlsx', rows, 'Relatório');
  toast('Relatório completo exportado para Excel.', 'success', 'Exportação concluída');
}

/* ------------------------------------------------------------
   16. TEMA (claro / escuro)
   ------------------------------------------------------------ */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  state.settings.theme = theme;
  saveSettings();
  const icon = $('#theme-toggle i');
  if (icon) icon.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
  requestAnimationFrame(renderAllCharts);
}

/* ------------------------------------------------------------
   17. FAQ (acordeões)
   ------------------------------------------------------------ */
function initFAQ() {
  $$('.faq-question').forEach((button) => {
    button.addEventListener('click', () => {
      const item = button.closest('.faq-item');
      const answer = item.querySelector('.faq-answer');
      const isOpen = item.classList.contains('open');

      // fechar os outros (comportamento de acordeão)
      $$('.faq-item.open').forEach((other) => {
        if (other !== item) {
          other.classList.remove('open');
          other.querySelector('.faq-question').setAttribute('aria-expanded', 'false');
          other.querySelector('.faq-answer').style.maxHeight = '0px';
        }
      });

      if (isOpen) {
        item.classList.remove('open');
        button.setAttribute('aria-expanded', 'false');
        answer.style.maxHeight = '0px';
      } else {
        item.classList.add('open');
        button.setAttribute('aria-expanded', 'true');
        answer.style.maxHeight = answer.scrollHeight + 40 + 'px';
      }
    });
  });
}

/* ------------------------------------------------------------
   18. SIDEBAR MOBILE
   ------------------------------------------------------------ */
function openSidebar() {
  $('#sidebar').classList.add('open');
  $('#sidebar-overlay').classList.add('show');
  $('#menu-toggle').setAttribute('aria-expanded', 'true');
}
function closeSidebar() {
  $('#sidebar').classList.remove('open');
  $('#sidebar-overlay').classList.remove('show');
  $('#menu-toggle').setAttribute('aria-expanded', 'false');
}

/* ------------------------------------------------------------
   19. ATUALIZAÇÃO GLOBAL APÓS ALTERAÇÃO DE DADOS
   ------------------------------------------------------------ */
function refreshAfterDataChange() {
  updateSidebarHealth(getStats());
  renderCharts(PAGES[currentPage()].chartIds);
}

function currentPage() {
  const hash = location.hash.replace('#', '');
  return PAGES[hash] ? hash : 'inicio';
}

/* ------------------------------------------------------------
   20. EVENTOS E ARRANQUE
   ------------------------------------------------------------ */
function bindEvents() {
  // navegação
  $$('.nav-item').forEach((item) => {
    item.addEventListener('click', (event) => {
      event.preventDefault();
      navigate(item.dataset.page);
    });
  });
  $$('[data-page]').forEach((el) => {
    if (el.classList.contains('nav-item')) return;
    el.addEventListener('click', (event) => { event.preventDefault(); navigate(el.dataset.page); });
  });
  window.addEventListener('hashchange', () => navigate(currentPage(), false));

  // sidebar mobile
  $('#menu-toggle').addEventListener('click', () => {
    $('#sidebar').classList.contains('open') ? closeSidebar() : openSidebar();
  });
  $('#sidebar-overlay').addEventListener('click', closeSidebar);

  // tema
  $('#theme-toggle').addEventListener('click', () => {
    applyTheme(state.settings.theme === 'dark' ? 'light' : 'dark');
  });
  $('#admin-settings').addEventListener('click', () => navigate('definicoes'));
  $('#settings-theme-toggle').addEventListener('click', () => {
    applyTheme(state.settings.theme === 'dark' ? 'light' : 'dark');
  });
  $('#settings-form').addEventListener('submit', saveSettingsForm);

  // --- inventário: filtros ---
  $('#inv-search').addEventListener('input', debounce((e) => { state.filters.inventory.search = e.target.value; renderInventory(); }, 180));
  $('#inv-filter-stock').addEventListener('change', (e) => { state.filters.inventory.stock = e.target.value; renderInventory(); });
  $('#inv-filter-price').addEventListener('change', (e) => { state.filters.inventory.price = e.target.value; renderInventory(); });
  $('#inv-sort').addEventListener('change', (e) => { state.filters.inventory.sort = e.target.value; renderInventory(); });
  $('#inv-reset').addEventListener('click', () => {
    state.filters.inventory = { search: '', stock: 'all', price: 'all', sort: 'name-asc' };
    $('#inv-search').value = '';
    $('#inv-filter-stock').value = 'all';
    $('#inv-filter-price').value = 'all';
    $('#inv-sort').value = 'name-asc';
    renderInventory();
    toast('Filtros do inventário reiniciados.', 'info');
  });

  $('#btn-add-product').addEventListener('click', () => openProductModal(null));
  $('#product-form').addEventListener('submit', submitProductForm);
  $('#product-modal-close').addEventListener('click', () => closeModal('product-modal'));
  $('#product-cancel').addEventListener('click', () => closeModal('product-modal'));
  $('#restock-form').addEventListener('submit', submitRestockForm);
  $('#restock-close').addEventListener('click', () => closeModal('restock-modal'));
  $('#restock-cancel').addEventListener('click', () => closeModal('restock-modal'));

  // ações em tabela (delegação de eventos)
  document.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;

    if (action === 'edit') {
      const product = state.products.find((p) => p.id === id);
      if (product) openProductModal(product);
    }
    if (action === 'restock') {
      const product = state.products.find((p) => p.id === id);
      if (product) openRestockModal(product);
    }
    if (action === 'delete') {
      const product = state.products.find((p) => p.id === id);
      if (product) confirmDeleteProduct(product);
    }
    if (action === 'print-sale') { const sale=state.sales.find(s=>String(s.id)===String(id)); if(sale) printSale(sale); }
    if (action === 'delete-sale') {
      const sale = state.sales.find((s) => String(s.id) === String(id));
      if (sale) confirmCancelSale(sale);
    }
    if (action === 'edit-client') { const c=state.clients.find(x=>x.id===id); if(c) openClientModal(c); }
    if (action === 'delete-client') { state.clients=state.clients.filter(x=>x.id!==id); saveClients(); renderClients(); renderClientOptions(); toast('Cliente eliminado.','info'); }
    if (action === 'edit-supplier') { const s=state.suppliers.find(x=>x.id===id); if(s) openSupplierModal(s); }
    if (action === 'delete-supplier') { state.suppliers=state.suppliers.filter(x=>x.id!==id); saveSuppliers(); renderSuppliers(); renderSupplierOptions(); toast('Fornecedor eliminado.','info'); }
  });

  // confirmação
  $('#confirm-ok').addEventListener('click', () => {
    const cb = confirmCallback;
    confirmCallback = null;
    closeModal('confirm-modal');
    if (typeof cb === 'function') cb();
  });
  $('#confirm-cancel').addEventListener('click', () => { confirmCallback = null; closeModal('confirm-modal'); });
  $('#confirm-close').addEventListener('click', () => { confirmCallback = null; closeModal('confirm-modal'); });

  // fechar modais com ESC / clique no fundo
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      ['product-modal', 'restock-modal', 'confirm-modal', 'client-modal', 'supplier-modal'].forEach((id) => {
        if (!document.getElementById(id).hidden) closeModal(id);
      });
    }
  });
  $$('.modal-overlay').forEach((overlay) => {
    overlay.addEventListener('mousedown', (event) => {
      if (event.target === overlay) {
        confirmCallback = null;
        overlay.hidden = true;
        document.body.style.overflow = '';
      }
    });
  });

  // --- clientes / fornecedores / movimentos ---
  $('#btn-add-client').addEventListener('click', () => openClientModal());
  $('#client-form').addEventListener('submit', saveClientForm);
  $('#client-modal-close').addEventListener('click', () => closeModal('client-modal'));
  $('#client-cancel').addEventListener('click', () => closeModal('client-modal'));
  $('#client-search').addEventListener('input', debounce(renderClients, 150));
  $('#btn-add-supplier').addEventListener('click', () => openSupplierModal());
  $('#supplier-form').addEventListener('submit', saveSupplierForm);
  $('#supplier-modal-close').addEventListener('click', () => closeModal('supplier-modal'));
  $('#supplier-cancel').addEventListener('click', () => closeModal('supplier-modal'));
  $('#supplier-search').addEventListener('input', debounce(renderSuppliers, 150));

  // --- POS ---
  $('#sale-product').addEventListener('change', updateSalePreview);
  $('#sale-qty').addEventListener('input', updateSalePreview);
  $('#sale-payment').addEventListener('change', updateSalePreview);
  $('#sale-client').addEventListener('change', updateSalePreview);
  $('#sale-discount').addEventListener('input', updateSalePreview);
  renderClientOptions();
  renderSupplierOptions();
  renderClients();
  renderSuppliers();
  renderMovements();
  $('#qty-plus').addEventListener('click', () => {
    const input = $('#sale-qty');
    input.value = (parseInt(input.value, 10) || 0) + 1;
    updateSalePreview();
  });
  $('#qty-minus').addEventListener('click', () => {
    const input = $('#sale-qty');
    input.value = Math.max((parseInt(input.value, 10) || 1) - 1, 1);
    updateSalePreview();
  });
  $('#sale-form').addEventListener('submit', finalizeSale);
  $('#btn-clear-sale').addEventListener('click', () => {
    $('#sale-product').value = '';
    clearSaleForm();
    toast('Formulário de venda limpo.', 'info');
  });

  // --- histórico: filtros ---
  $('#hist-search').addEventListener('input', debounce((e) => { state.filters.history.search = e.target.value; state.filters.history.page = 1; renderHistory(); }, 180));
  $('#hist-product').addEventListener('change', (e) => { state.filters.history.product = e.target.value; state.filters.history.page = 1; renderHistory(); });
  $('#hist-date').addEventListener('change', (e) => { state.filters.history.date = e.target.value; state.filters.history.page = 1; renderHistory(); });
  $('#hist-sort').addEventListener('change', (e) => { state.filters.history.sort = e.target.value; renderHistory(); });
  $('#hist-reset').addEventListener('click', () => {
    state.filters.history = { search: '', product: 'all', date: '', sort: 'recent', page: 1 };
    $('#hist-search').value = '';
    $('#hist-product').value = 'all';
    $('#hist-date').value = '';
    $('#hist-sort').value = 'recent';
    renderHistory();
    toast('Filtros do histórico reiniciados.', 'info');
  });
  $('#btn-export-sales').addEventListener('click', exportSalesExcel);
  $('#btn-export-report').addEventListener('click', exportReportExcel);

  // re-render dos gráficos em redimensionamento / mudança de orientação
  window.addEventListener('resize', debounce(() => { renderAllCharts(); }, 200));
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(debounce(() => {
      renderAllCharts();
      const open = $('.faq-item.open .faq-answer');
      if (open) open.style.maxHeight = open.scrollHeight + 40 + 'px';
    }, 200));
    $$('.chart-holder').forEach((h) => observer.observe(h));
  }
}

function init() {
  loadData();

  // tema inicial
  applyTheme(state.settings.theme === 'dark' ? 'dark' : 'light');
  updateBranding();

  // data de hoje na topbar
  const today = new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  $('#today-date').textContent = today.charAt(0).toUpperCase() + today.slice(1);
  $('#footer-year').textContent = new Date().getFullYear();

  bindEvents();
  initFAQ();
  navigate(currentPage(), false);

  if (!localStorage.getItem('gerestock_welcome_shown')) {
    localStorage.setItem('gerestock_welcome_shown', '1');
    setTimeout(() => toast('Dados iniciais carregados: ' + state.products.length + ' produtos no inventário.', 'info', 'Bem-vindo ao GereStock'), 700);
  }
}

document.addEventListener('DOMContentLoaded', init);
