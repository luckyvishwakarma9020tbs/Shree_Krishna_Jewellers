/* Shree Krishna Jewellers — Customer Khata, Numbered Stock, Orders & Girvi Book
   Browser-only. All data stays on the phone (localStorage / IndexedDB). */
'use strict';

const SHOP_NAME = 'Shree Krishna Jewellers';
const SHOP_ADDR = 'Waghobanagar, Kalwa East, Thane — Near Parsik Tunnel';
const RK = 'jw2_records', SK = 'jw2_settings', GK = 'jw2_girvi', IK = 'jw3_items', OK = 'jw3_orders', CK2 = 'jw3_cats';
const DEFAULT_PASSWORD = 'jewellery';
const CAT_LABEL = {gold: 'Gold', silver: 'Silver'};
const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = v => { const x = parseFloat(v); return isNaN(x) ? 0 : x; };
const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
const money = n => '₹' + Number(n || 0).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const money0 = n => '₹' + Math.round(n || 0).toLocaleString('en-IN');
const fmtDate = iso => new Date(iso).toLocaleString('en-IN', {day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit'});
const fmtDay = iso => new Date(iso).toLocaleDateString('en-IN', {day:'2-digit', month:'short', year:'numeric'});
const fmtShort = iso => new Date(iso).toLocaleDateString('en-IN', {day:'2-digit', month:'short'});
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const digits = s => String(s || '').replace(/\D/g, '');
const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);

/* ---------- date helpers (plain YYYY-MM-DD strings / day numbers) ---------- */
const pad2 = n => String(n).padStart(2, '0');
const dateStr = d => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const todayStr = () => dateStr(new Date());
const dn = s => { const [y, m, d] = s.split('-').map(Number); return Math.round(Date.UTC(y, m - 1, d) / 864e5); };
const dayOfIso = iso => dn(dateStr(new Date(iso)));
const addDaysStr = (s, n) => { const d = new Date((dn(s) + n) * 864e5); return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`; };
function addMonths(s, n){
  const [y, m, d] = s.split('-').map(Number);
  const t = new Date(y, m - 1 + n, 1), last = new Date(t.getFullYear(), t.getMonth() + 1, 0).getDate();
  return `${t.getFullYear()}-${pad2(t.getMonth() + 1)}-${pad2(Math.min(d, last))}`;
}
const fmtD = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('en-IN', {day: '2-digit', month: 'short', year: 'numeric'}); };
const daysText = n => n === 0 ? 'aaj' : n === 1 ? 'kal' : n + ' din mein';
const nowLocalInput = () => { const d = new Date(); return `${dateStr(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
const isoFromLocal = v => { const d = v ? new Date(v) : new Date(); return isNaN(d) ? new Date().toISOString() : d.toISOString(); };

/* ---------- storage ---------- */
function load(k, d){ try { const v = JSON.parse(localStorage.getItem(k)); return v === null || v === undefined ? d : v; } catch(e){ return d; } }
let storageFailed = false;
function save(k, v){
  try { localStorage.setItem(k, JSON.stringify(v)); }
  catch(e){ if (!storageFailed){ storageFailed = true; setTimeout(() => { alert('Phone ki storage bhar gayi ya block hai — data save NAHI hua. Pehle backup lo aur purani photos/records saaf karo.'); storageFailed = false; }, 0); } }
}

const DEFAULT_SETTINGS = {
  password: DEFAULT_PASSWORD, phone: '', gstin: '', nextReceipt: 1, nextGirvi: 1, nextOrder: 1, lastBackup: null,
  defRate: '', defMonths: 12, defWarn: 15,
  gstDefault: 3, makingDefault: 0, rateGold: '', rateSilver: '',
  ledgerType: 'none', ledgerRate: 2, ledgerDue: 30, remindBefore: 3
};
let settings = Object.assign({}, DEFAULT_SETTINGS, load(SK, {}));

/* ---------- normalisers (older versions are converted on load) ---------- */
function normalizeRecord(r){
  if (!Array.isArray(r.items)){
    const amt = num(r.amount);
    r = {id: r.id || uid(), receiptNo: r.receiptNo || 0, date: r.date, name: r.name, phone: '',
      items: [{name: r.product || 'Item', qty: 1, weight: num(r.weight), rate: num(r.rate), amount: amt}],
      total: amt, payments: [{date: r.date, amount: amt}]};
  }
  r.id = r.id || uid(); r.phone = r.phone || '';
  const pays = r.payments || (num(r.paid) > 0 ? [{date: r.date, amount: num(r.paid)}] : []);
  r.payments = pays.map((p, i) => ({id: p.id || r.id + ':p' + i, gid: p.gid || p.id || r.id + ':p' + i, date: p.date || r.date,
    amount: num(p.amount), note: p.note || '', mode: p.mode || ''}));
  r.items.forEach(it => { if (it.qty === undefined) it.qty = 1; it.weight = num(it.weight); it.rate = it.rate === '' ? '' : num(it.rate); it.amount = num(it.amount); });
  r.gstPct = num(r.gstPct ?? r.gstRate ?? r.gstPercent);
  r.gstAmt = num(r.gstAmt ?? r.gstCost);
  r.makingAmt = num(r.makingAmt ?? r.makingCost ?? r.makingTotal);
  r.makingMode = r.makingMode || 'pct';
  r.makingVal = num(r.makingVal ?? r.makingPercent);
  r.total = num(r.total);
  r.subtotal = r.subtotal !== undefined ? num(r.subtotal) : r2(sum(r.items, i => i.amount));
  r.interest = r.interest && r.interest.type ? r.interest : {type: 'none', rate: 0, dueDays: settings.ledgerDue};
  r.interest.dueDays = r.interest.dueDays === undefined ? settings.ledgerDue : num(r.interest.dueDays);
  r.paid = r2(sum(r.payments, p => p.amount));
  return r;
}
function normalizeItem(it){
  it.cat = it.cat === 'silver' ? 'silver' : 'gold'; it.no = Math.floor(num(it.no));
  it.status = it.status === 'sold' ? 'sold' : 'stock';
  it.catId = it.catId || ''; it.catName = it.catName || ''; it.code = it.code || ''; it.pad = it.pad || 0;
  it.weight = num(it.weight); it.purity = it.purity || ''; it.name = it.name || 'Item';
  it.rate = it.rate === '' || it.rate === undefined || it.rate === null ? '' : num(it.rate);
  it.amount = it.amount === '' || it.amount === undefined || it.amount === null ? '' : num(it.amount);
  return it;
}
function normalizeOrder(o){
  o.id = o.id || uid(); o.no = o.no || 0; o.phone = o.phone || ''; o.desc = o.desc || ''; o.estimate = num(o.estimate);
  o.advances = (o.advances || []).map((a, i) => ({id: a.id || o.id + ':a' + i, date: a.date || o.date, amount: num(a.amount), note: a.note || '', mode: a.mode || ''}));
  o.status = ['open', 'delivered', 'cancelled'].includes(o.status) ? o.status : 'open';
  o.dueDate = o.dueDate || ''; o.address = o.address || ''; o.photos = Array.isArray(o.photos) ? o.photos : [];
  return o;
}

let records = load(RK, null);
if (records === null){
  const old = load('jw_records_v1', []);
  records = old; save(RK, records);
}
records = records.map(normalizeRecord);
let items = load(IK, []).map(normalizeItem);
let girvi = load(GK, []);
let cats = load(CK2, []);
/* items from older builds (plain Gold 1-500 / Silver 1-1000) get a category of their own so nothing is lost */
function legacyCats(its, cs){
  ['gold', 'silver'].forEach(m => {
    const lost = its.filter(i => i.cat === m && !i.catId); if (!lost.length) return;
    let c = cs.find(x => x.metal === m && x.legacy);
    if (!c){ c = {id: uid(), metal: m, name: CAT_LABEL[m], code: m === 'gold' ? 'G' : 'S', limit: Math.max(m === 'gold' ? 500 : 1000, ...lost.map(i => i.no)), legacy: true}; cs.push(c); }
    lost.forEach(i => { i.catId = c.id; i.catName = c.name; i.code = c.code; i.pad = m === 'gold' ? 3 : 4; });
  });
  return cs;
}
cats = legacyCats(items, Array.isArray(cats) ? cats : []);
let orders = load(OK, null);
if (orders === null){
  /* orders saved by the previous build ("advance orders") are carried over */
  orders = load('jw2_advance_orders', []).map((a, i) => normalizeOrder({
    id: a.id, no: i + 1, date: a.date, name: a.name, phone: a.phone, desc: a.item + (a.notes ? ' — ' + a.notes : ''), estimate: a.total,
    advances: a.paid > 0 ? [{date: a.date, amount: a.paid, note: 'Advance'}] : [], dueDate: a.due || '', status: 'open'}));
  if (orders.length) settings.nextOrder = Math.max(settings.nextOrder, orders.length + 1);
}
orders = orders.map(normalizeOrder);
const saveAll = () => { save(RK, records); save(GK, girvi); save(IK, items); save(OK, orders); save(CK2, cats); save(SK, settings); };
saveAll();

let currentId = null, currentCk = null, currentOid = null, currentGid = null;
let receiptReturn = 'home', receiptKind = 'sale', girviFilter = 'active', khataFilter = 'all', orderFilter = 'open';
let stockView = 'gold', histCat = 'all', stockCat = 'all', histCatId = 'all';

/* ---------- small UI helpers ---------- */
function toast(msg, ms){
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, ms || 2600);
}
function sparkle(x, y){
  if (reduced) return;
  for (let i = 0; i < 18; i++){
    const s = document.createElement('i'); s.className = 'spark';
    const a = Math.random() * 6.283, d = 40 + Math.random() * 70;
    s.style.cssText = `left:${x}px;top:${y}px;--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d}px`;
    document.body.appendChild(s); setTimeout(() => s.remove(), 900);
  }
}
function countUp(el, to, fmt){
  const from = Number(el.dataset.v || 0); el.dataset.v = to;
  if (reduced || from === to) { el.textContent = fmt(to); return; }
  const t0 = performance.now(), dur = 700;
  (function step(t){
    const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
    el.textContent = fmt(from + (to - from) * e);
    if (k < 1) requestAnimationFrame(step);
  })(t0);
}
const initial = n => (String(n).trim()[0] || '?').toUpperCase();
const waNumber = ph => { let to = digits(ph); if (to.length === 10) to = '91' + to; return to; };

/* ---------- modal + password gate ---------- */
let modalOk = null;
function openModal(title, body, okLabel, onOk, cancelLabel){
  $('#mTitle').textContent = title; $('#mBody').innerHTML = body;
  $('#mOk').textContent = okLabel || 'Save'; $('#mCancel').textContent = cancelLabel || 'Cancel';
  $('#mOk').hidden = !onOk && okLabel === null; modalOk = onOk;
  $('#modal').hidden = false;
  const f = $('#mBody input:not([type=hidden])'); if (f) setTimeout(() => f.focus(), 60);
}
function closeModal(){ $('#modal').hidden = true; modalOk = null; }
/* every delete / wipe asks for the app password first */
function askPassword(msg, cb){
  openModal('Password zaroori hai', `<p>${esc(msg)}</p><label>App password<input id="apw" type="password" autocomplete="off" placeholder="Password"></label>`, 'Confirm', () => {
    if ($('#apw').value !== settings.password){ toast('Password galat hai'); $('#apw').value = ''; return false; }
    setTimeout(cb, 0); return true;
  });
  $('#apw').addEventListener('keydown', e => { if (e.key === 'Enter') $('#mOk').click(); });
}

/* ---------- navigation ---------- */
const TAB_OF = {detail: 'khata', custDetail: 'khata', orderAdd: 'orders', orderDetail: 'orders', girviAdd: 'girvi', girviDetail: 'girvi'};
function show(name){
  $$('main .screen').forEach(s => s.hidden = s.id !== name);
  const scr = $('#' + name); scr.classList.remove('enter'); void scr.offsetWidth; scr.classList.add('enter');
  let tab = TAB_OF[name] || name;
  if (name === 'receipt') tab = ({home: 'home', detail: 'khata', custDetail: 'khata', girviDetail: 'girvi', orderDetail: 'orders', stock: 'stock'})[receiptReturn] || '';
  $$('.tab').forEach(b => b.classList.toggle('active', b.dataset.go === tab));
  window.scrollTo(0, 0);
  renderWarn();
  const R = {home: renderHome, khata: renderKhata, custDetail: renderCustDetail, detail: renderDetail, stock: renderStock, add: renderSale,
    admin: renderAdmin, girvi: renderGirvi, girviDetail: renderGirviDetail, orders: renderOrders, orderAdd: renderOrderForm, orderDetail: renderOrderDetail};
  if (R[name]) R[name]();
  if (name === 'girviAdd') { renderGPhotos(); updateGPreview(); }
}

/* ---------- login ---------- */
function login(){
  if ($('#pw').value === settings.password){
    sessionStorage.setItem('jw_in', '1'); $('#pw').value = ''; $('#loginErr').textContent = '';
    enter();
  } else $('#loginErr').textContent = 'Wrong password. Try again.';
}
function enter(){ $('#login').hidden = true; $('#app').hidden = false; show('home'); }
function logout(){ sessionStorage.removeItem('jw_in'); $('#app').hidden = true; $('#login').hidden = false; }

/* ---------- reminder bars ---------- */
function renderWarn(){ renderGirviWarn(); renderRemindWarn(); }
function renderRemindWarn(){
  const ca = custAlerts(), oa = orderAlerts(), bar = $('#rWarnBar');
  $('#tabDotK').hidden = !ca.length; $('#tabDotO').hidden = !oa.length;
  if (!ca.length && !oa.length){ bar.hidden = true; return; }
  const parts = [];
  ca.slice(0, 2).forEach(x => parts.push(`${x.c.name} ${money0(x.c.bal)} baaki (${x.left < 0 ? -x.left + ' din se overdue' : 'due ' + daysText(x.left)})`));
  oa.slice(0, 2).forEach(o => { const s = orderState(o); parts.push(`Order ${oNo(o)} ${o.name} (${s.k === 'over' ? 'delivery ' + (-s.left) + ' din late' : 'delivery ' + daysText(s.left)})`); });
  const total = ca.length + oa.length, shown = Math.min(ca.length, 2) + Math.min(oa.length, 2);
  const over = ca.some(x => x.left < 0) || oa.some(o => orderState(o).k === 'over');
  bar.className = 'warnbar remind' + (over ? ' out' : '');
  bar.innerHTML = `Reminder: <span>${esc(parts.join(' · '))}${total > shown ? ' +' + (total - shown) + ' more' : ''}</span>`;
  bar.hidden = false;
}

let _logo = null;
async function logoData(){
  if (_logo) return _logo;
  try {
    const r = await fetch('icon-192.png'), b = await r.blob();
    _logo = await new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b); });
  } catch(e){
    try { const im = document.querySelector('.logo img'), c = document.createElement('canvas'); c.width = c.height = 192; c.getContext('2d').drawImage(im, 0, 0, 192, 192); _logo = c.toDataURL('image/png'); }
    catch(e2){ _logo = 'icon-192.png'; }
  }
  return _logo;
}

/* ---------- girvi (mortgage) ---------- */
const PHOTO_TILES = (camId, galId) => `<button type="button" class="ph add" id="${camId}"><svg viewBox="0 0 24 24"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg><span>Camera</span></button><button type="button" class="ph add" id="${galId}"><svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M21 16l-5-5-8 9"/></svg><span>Gallery</span></button>`;
const gNo = g => 'G-' + String(g.no).padStart(4, '0');

/* photos live in IndexedDB (localStorage is too small for pictures) */
const photoCache = {};
let _db = null;
function openDB(){
  if (_db) return _db;
  _db = new Promise((res, rej) => {
    try {
      const r = indexedDB.open('kj_photos', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('p');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    } catch(e){ rej(e); }
  });
  return _db;
}
function idbDo(mode, fn){
  return openDB().then(d => new Promise((res, rej) => {
    const t = d.transaction('p', mode), q = fn(t.objectStore('p'));
    t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error);
  }));
}
async function pPut(id, data){ photoCache[id] = data; try { await idbDo('readwrite', s => s.put(data, id)); return true; } catch(e){ return false; } }
async function pGet(id){
  if (photoCache[id]) return photoCache[id];
  try { const v = await idbDo('readonly', s => s.get(id)); if (v) photoCache[id] = v; return v || ''; } catch(e){ return ''; }
}
async function pDel(id){ delete photoCache[id]; try { await idbDo('readwrite', s => s.delete(id)); } catch(e){} }
async function pClear(){ Object.keys(photoCache).forEach(k => delete photoCache[k]); try { await idbDo('readwrite', s => s.clear()); } catch(e){} }
function hydratePhotos(root){
  root.querySelectorAll('img[data-photo]').forEach(async im => {
    const d = await pGet(im.dataset.photo); if (d){ im.src = d; im.classList.add('loaded'); }
  });
}
function readPhoto(file){
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 900, s = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas'); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      res(c.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('img')); };
    img.src = url;
  });
}

/* interest: simple interest per month on the principal still outstanding (daily basis, 30 days = 1 month) */
function girviCalc(g, asOf){
  const end = dn(g.status === 'released' ? g.releasedDate : asOf);
  let p = g.principal, last = dn(g.startDate), interest = 0, paidInt = 0, paidPrin = 0;
  const compound = (g.interestType || 'simple') === 'compound';
  const accrue = (from, to) => {
    const days = Math.max(0, to - from); if (!days) return 0;
    if (!compound) return p * g.rate / 100 * days / 30;
    const base = p + Math.max(0, interest - paidInt);
    const months = Math.floor(days / 30), remainder = days % 30;
    const grown = base * Math.pow(1 + g.rate / 100, months);
    return (grown - base) + grown * g.rate / 100 * remainder / 30;
  };
  const evs = (g.payments || []).filter(e => e.kind !== 'settle').sort((a, b) => dn(a.date) - dn(b.date));
  for (const e of evs){
    const d = dn(e.date); if (d > end) continue;
    interest += accrue(last, d); last = Math.max(last, d);
    if (e.kind === 'principal'){ const x = Math.min(e.amount, p); p -= x; paidPrin += x; } else paidInt += e.amount;
  }
  interest += accrue(last, end);
  interest = r2(interest); p = r2(p);
  const interestDue = r2(Math.max(0, interest - paidInt));
  return {principalLeft: p, interest, paidInt: r2(paidInt), paidPrin: r2(paidPrin), interestDue, totalDue: r2(p + interestDue), days: Math.max(0, end - dn(g.startDate))};
}
function girviState(g){
  if (g.status === 'released') return {k: 'rel', days: 0};
  const left = dn(g.dueDate) - dn(todayStr());
  if (left < 0) return {k: 'over', days: -left};
  if (left <= (num(g.warnDays) || 0)) return {k: 'soon', days: left};
  return {k: 'ok', days: left};
}
function stBadge(g){
  const s = girviState(g);
  if (s.k === 'rel') return ['paid', 'Released'];
  if (s.k === 'over') return ['out', `Overdue ${s.days}d`];
  if (s.k === 'soon') return ['low', s.days === 0 ? 'Due today' : `Due in ${s.days}d`];
  return ['ok', `${s.days} days left`];
}
function girviPct(g){
  const total = Math.max(1, dn(g.dueDate) - dn(g.startDate));
  const now = g.status === 'released' ? dn(g.releasedDate) : dn(todayStr());
  return Math.round(Math.max(0, Math.min(total, now - dn(g.startDate))) / total * 100);
}
function girviAlerts(){
  return girvi.filter(g => g.status !== 'released').map(g => ({g, s: girviState(g)}))
    .filter(x => x.s.k === 'over' || x.s.k === 'soon')
    .sort((a, b) => (a.s.k === 'over' ? 0 : 1) - (b.s.k === 'over' ? 0 : 1) || dn(a.g.dueDate) - dn(b.g.dueDate));
}
function renderGirviWarn(){
  const al = girviAlerts(), bar = $('#gWarnBar');
  $('#tabDotG').hidden = !al.length;
  if (!al.length){ bar.hidden = true; return; }
  const over = al.filter(x => x.s.k === 'over').length;
  const txt = al.slice(0, 3).map(x => `${x.g.name} (${x.s.k === 'over' ? x.s.days + ' din se overdue' : x.s.days === 0 ? 'aaj last din' : x.s.days + ' din bache'})`).join(', ');
  bar.className = 'warnbar girvi' + (over ? ' out' : '');
  bar.innerHTML = `Girvi ${over ? 'ki date nikal gayi' : 'ki date paas hai'}: <span>${esc(txt)}${al.length > 3 ? ' +' + (al.length - 3) + ' more' : ''}</span>`;
  bar.hidden = false;
}

function girviItemHTML(g){
  const c = girviCalc(g, todayStr()), [cls, txt] = stBadge(g);
  const ph = g.photos && g.photos[0] ? `<img data-photo="${esc(g.photos[0])}" alt="">` : '';
  return `<button class="item gitem" data-gid="${esc(g.id)}">
    <span class="thumb">${ph}</span>
    <span class="l"><b>${esc(g.name)}</b><small>${esc(g.item)} · ${Number(g.weight).toFixed(3)} g · ${gNo(g)}</small><i class="bar ${cls}"><u style="width:${girviPct(g)}%"></u></i></span>
    <span class="r">${money0(g.status === 'released' ? g.principal : c.principalLeft)}<em class="badge ${cls}">${esc(txt)}</em></span></button>`;
}
function bindGirvi(box){ box.querySelectorAll('.gitem').forEach(b => b.onclick = () => openGirviDetail(b.dataset.gid)); hydratePhotos(box); }

function renderHomeGirvi(){
  const act = girvi.filter(g => g.status !== 'released');
  countUp($('#stGirvi'), act.length, v => Math.round(v));
  countUp($('#stGirviAmt'), act.reduce((a, g) => a + girviCalc(g, todayStr()).principalLeft, 0), money0);
  const al = girviAlerts().slice(0, 4);
  $('#homeGirviWrap').hidden = !al.length;
  const box = $('#homeGirvi'); box.innerHTML = al.map(x => girviItemHTML(x.g)).join(''); bindGirvi(box);
}

function renderGirvi(){
  const q = $('#gSearch').value.trim().toLowerCase();
  const cnt = {active: 0, alert: 0, released: 0, all: girvi.length};
  girvi.forEach(g => {
    if (g.status === 'released') cnt.released++;
    else { cnt.active++; const k = girviState(g).k; if (k === 'over' || k === 'soon') cnt.alert++; }
  });
  $('#gChips').innerHTML = [['active', 'Active'], ['alert', 'Due / Overdue'], ['released', 'Released'], ['all', 'All']]
    .map(([k, l]) => `<button class="chip ${girviFilter === k ? 'on' : ''}" data-gf="${k}">${l} (${cnt[k]})</button>`).join('');
  let list = girvi.slice().reverse().filter(g => {
    if (girviFilter === 'all') return true;
    if (girviFilter === 'released') return g.status === 'released';
    if (g.status === 'released') return false;
    return girviFilter === 'active' || ['over', 'soon'].includes(girviState(g).k);
  });
  if (girviFilter === 'alert') list.sort((a, b) => dn(a.dueDate) - dn(b.dueDate));
  if (q) list = list.filter(g => [g.name, g.phone, g.item, gNo(g)].join(' ').toLowerCase().includes(q));
  const box = $('#gList');
  box.innerHTML = list.length ? list.map(girviItemHTML).join('') : `<p class="empty">${girvi.length ? 'Is filter mein koi girvi nahi.' : 'Abhi koi girvi nahi. “+ New Girvi” dabao.'}</p>`;
  bindGirvi(box);
}

/* ----- new girvi form ----- */
let gPhotos = [];
function resetGirviForm(){
  ['#gName', '#gPhone', '#gAddr', '#gItem', '#gWeight', '#gPurity', '#gValue', '#gPrincipal', '#gRemarks'].forEach(s => $(s).value = '');
  $('#gType').value = 'Gold'; $('#gInterestType').value = 'simple'; $('#gQty').value = 1;
  $('#gRate').value = settings.defRate || ''; $('#gMonths').value = settings.defMonths || 12;
  $('#gWarn').value = settings.defWarn ?? 15; $('#gStart').value = todayStr();
  gPhotos = []; renderGPhotos(); updateGPreview();
}
function renderGPhotos(){
  $('#gPhotos').innerHTML = gPhotos.map((p, i) => `<div class="ph"><img src="${p.data}" alt="Photo ${i + 1}"><button type="button" class="x" data-rm="${i}" aria-label="Remove photo">×</button></div>`).join('')
    + (gPhotos.length < 3 ? PHOTO_TILES('gAddCam', 'gAddPhoto') : '');
}
async function addPhotos(files){
  for (const f of Array.from(files).slice(0, 3 - gPhotos.length)){
    try { gPhotos.push({id: uid(), data: await readPhoto(f)}); } catch(e){ toast('Photo nahi khul paayi'); }
  }
  renderGPhotos();
}
function updateGPreview(){
  const st = $('#gStart').value || todayStr(), m = Math.floor(num($('#gMonths').value));
  const p = num($('#gPrincipal').value), r = num($('#gRate').value);
  $('#gDue').textContent = m > 0 ? fmtD(addMonths(st, m)) : '—';
  $('#gMonthly').textContent = money(p * r / 100);
  const compound = $('#gInterestType').value === 'compound';
  $('#gTotalDue').textContent = money(compound ? p * Math.pow(1 + r / 100, Math.max(m, 0)) : p + p * r / 100 * Math.max(m, 0));
}
async function saveGirvi(ev){
  const name = $('#gName').value.trim(), phone = digits($('#gPhone').value), item = $('#gItem').value.trim();
  const qty = Math.floor(num($('#gQty').value)), weight = num($('#gWeight').value), principal = r2(num($('#gPrincipal').value));
  const rate = num($('#gRate').value), months = Math.floor(num($('#gMonths').value)), start = $('#gStart').value;
  if (!name) return toast('Customer ka naam likho');
  if (phone && phone.length < 10) return toast('Phone number 10 digit ka hona chahiye');
  if (!item) return toast('Item ka naam likho');
  if (qty < 1) return toast('Pieces likho');
  if (!(weight > 0)) return toast('Item ka weight likho');
  if (!(principal > 0)) return toast('Loan amount likho');
  if ($('#gRate').value === '' || rate < 0) return toast('Interest rate likho');
  if (months < 1) return toast('Duration (months) likho');
  if (!start) return toast('Start date chuno');
  $('#gSave').disabled = true;
  const ids = [];
  for (const p of gPhotos){ const ok = await pPut(p.id, p.data); ids.push(p.id); if (!ok) toast('Photo phone mein save nahi ho paayi'); }
  const g = {
    id: uid(), no: settings.nextGirvi++, created: new Date().toISOString(), name, phone, address: $('#gAddr').value.trim(),
    item, type: $('#gType').value, qty, weight, purity: $('#gPurity').value.trim(), value: num($('#gValue').value),
    principal, rate, interestType: $('#gInterestType').value, months, startDate: start, dueDate: addMonths(start, months), warnDays: Math.max(0, Math.floor(num($('#gWarn').value))),
    remarks: $('#gRemarks').value.trim(), photos: ids, payments: [], status: 'active', renewals: 0
  };
  girvi.push(g); saveAll(); resetGirviForm(); $('#gSave').disabled = false;
  if (ev && ev.clientX !== undefined) sparkle(ev.clientX, ev.clientY);
  toast(`Girvi ${gNo(g)} saved ✓`);
  openGirviSlip(g.id, 'girviDetail');
}

/* ----- girvi detail ----- */
function openGirviDetail(id){ currentGid = id; show('girviDetail'); }
function renderGirviDetail(){
  const g = girvi.find(x => x.id === currentGid); if (!g){ show('girvi'); return; }
  const c = girviCalc(g, todayStr()), s = girviState(g), [cls, txt] = stBadge(g), rel = g.status === 'released';
  const R = 52, C = 2 * Math.PI * R, pct = girviPct(g);
  const big = rel ? '✓' : s.days, lab = rel ? 'released' : s.k === 'over' ? 'days overdue' : 'days left';
  const photos = (g.photos || []).length ? `<div class="gphotos">${g.photos.map(id => `<span class="thumb" data-big="${esc(id)}"><img data-photo="${esc(id)}" alt="Pledged item"></span>`).join('')}</div>` : '';
  const kv = [
    ['Girvi no.', gNo(g)], ['Item', esc(g.item) + (g.qty > 1 ? ' × ' + g.qty : '')], ['Type', esc(g.type)], ['Weight', Number(g.weight).toFixed(3) + ' g'],
    g.purity ? ['Purity', esc(g.purity)] : null, g.value ? ['Est. value', money(g.value)] : null,
    ['Phone', g.phone ? esc(g.phone) : '—'], g.address ? ['Address', esc(g.address)] : null,
    ['Start date', fmtD(g.startDate)], ['Due date', fmtD(g.dueDate)], rel ? ['Released on', fmtD(g.releasedDate)] : null,
    g.renewals ? ['Extended', g.renewals + ' time(s)'] : null, g.remarks ? ['Remarks', esc(g.remarks)] : null
  ].filter(Boolean).map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  const pays = (g.payments || []).slice().sort((a, b) => dn(a.date) - dn(b.date)).map(p =>
    `<tr><td>${esc(fmtD(p.date))}</td><td>${({interest: 'Interest', principal: 'Principal', settle: 'Final settlement'})[p.kind]}</td><td class="n">${money(p.amount)}</td></tr>`).join('');
  let amounts = `<dl class="dl"><dt>Loan given</dt><dd>${money(g.principal)}</dd>
    ${c.paidPrin ? `<dt>Principal repaid</dt><dd>${money(c.paidPrin)}</dd>` : ''}
    <dt>Principal left</dt><dd>${money(c.principalLeft)}</dd>
    <dt>Interest rate</dt><dd>${g.rate}% / month${g.interestType === 'compound' ? ' · compound' : ''} (${money(c.principalLeft * g.rate / 100)} / month)</dd>
    <dt>Interest ${rel ? 'charged' : 'till today'}</dt><dd>${money(c.interest)}</dd>
    ${c.paidInt ? `<dt>Interest paid</dt><dd>${money(c.paidInt)}</dd>` : ''}</dl>`;
  if (rel){
    const diff = r2(c.totalDue - g.settle.amount);
    amounts += `<div class="totalbox" style="background:var(--green)"><span>Settled</span><b>${money(g.settle.amount)}</b></div>` + (diff > 0 ? `<p class="muted">Discount / chhoot: ${money(diff)}</p>` : '');
  } else amounts += `<div class="totalbox"><span>Total due today</span><b>${money(c.totalDue)}</b></div>`;
  $('#gdBody').innerHTML = `<div class="card shine"><div class="ghead">
      <svg class="ring" viewBox="0 0 120 120" role="img" aria-label="${esc(txt)}"><circle class="rb" cx="60" cy="60" r="${R}"/><circle class="rf ${cls}" id="gRing" cx="60" cy="60" r="${R}" style="stroke-dasharray:${C};stroke-dashoffset:${C}"/><text x="60" y="64" class="rn">${big}</text><text x="60" y="82" class="rl">${lab}</text></svg>
      <div><h3>${esc(g.name)}</h3><em class="badge ${cls}" style="display:inline-block">${esc(txt)}</em></div></div>${photos}</div>
    <div class="card"><dl class="dl">${kv}</dl></div>
    <div class="card"><h3>Amount</h3>${amounts}</div>
    ${pays ? `<div class="card"><h3>Payments</h3><table class="mini"><tbody>${pays}</tbody></table></div>` : ''}`;
  hydratePhotos($('#gdBody'));
  requestAnimationFrame(() => requestAnimationFrame(() => { const r = $('#gRing'); if (r) r.style.strokeDashoffset = C * (1 - pct / 100); }));
  $('#gdPay').hidden = $('#gdRelease').hidden = $('#gdExtend').hidden = rel;
}
function girviPay(){
  const g = girvi.find(x => x.id === currentGid); if (!g) return;
  const c = girviCalc(g, todayStr());
  openModal('Receive payment', `<p class="muted">Interest due: <b>${money(c.interestDue)}</b> · Principal left: <b>${money(c.principalLeft)}</b></p>
    <label>Payment type<select id="gpKind"><option value="interest">Interest</option><option value="principal">Principal (loan kam karo)</option></select></label>
    <label>Amount (₹)<input id="gpAmt" type="number" min="0" step="0.01" inputmode="decimal" value="${c.interestDue}"></label>
    <label>Date<input id="gpDate" type="date" value="${todayStr()}" max="${todayStr()}"></label>`, 'Save payment', () => {
    const kind = $('#gpKind').value, a = r2(num($('#gpAmt').value)), d = $('#gpDate').value;
    if (a <= 0){ toast('Amount likho'); return false; }
    if (!d || dn(d) < dn(g.startDate) || dn(d) > dn(todayStr())){ toast('Date galat hai'); return false; }
    if (kind === 'principal' && a > girviCalc(g, d).principalLeft){ toast('Amount principal se zyada hai'); return false; }
    g.payments.push({date: d, kind, amount: a}); saveAll(); renderGirviDetail(); renderWarn(); toast('Payment saved'); return true;
  });
  $('#gpKind').onchange = () => { $('#gpAmt').value = $('#gpKind').value === 'interest' ? c.interestDue : c.principalLeft; };
}
function girviRelease(){
  const g = girvi.find(x => x.id === currentGid); if (!g) return;
  const c = girviCalc(g, todayStr());
  openModal('Release item', `<p>Customer ko <b>${esc(g.item)}</b> wapas dena hai.</p>
    <div class="bill-row"><span>Total due</span><b id="grDue">${money(c.totalDue)}</b></div>
    <label>Amount received (₹)<input id="grAmt" type="number" min="0" step="0.01" inputmode="decimal" value="${c.totalDue}"></label>
    <label>Release date<input id="grDate" type="date" value="${todayStr()}" max="${todayStr()}"></label>
    <p class="muted">Kam amount lene par farak chhoot (discount) maana jayega.</p>`, 'Release item', () => {
    const a = r2(num($('#grAmt').value)), d = $('#grDate').value;
    if ($('#grAmt').value === '' || a < 0){ toast('Amount likho'); return false; }
    if (!d || dn(d) < dn(g.startDate) || dn(d) > dn(todayStr())){ toast('Date galat hai'); return false; }
    g.status = 'released'; g.releasedDate = d; g.settle = {amount: a, date: d}; g.payments.push({date: d, kind: 'settle', amount: a});
    saveAll(); renderGirviDetail(); renderWarn(); toast('Item release ho gaya ✓'); return true;
  });
  $('#grDate').onchange = () => {
    const d = $('#grDate').value; if (!d || dn(d) < dn(g.startDate)) return;
    const cc = girviCalc(g, d); $('#grDue').textContent = money(cc.totalDue); $('#grAmt').value = cc.totalDue;
  };
}
function girviExtend(){
  const g = girvi.find(x => x.id === currentGid); if (!g) return;
  openModal('Extend duration', `<p class="muted">Abhi due date: <b>${fmtD(g.dueDate)}</b></p>
    <label>Kitne mahine badhane hain?<input id="geM" type="number" min="1" step="1" inputmode="numeric" value="3"></label>`, 'Extend', () => {
    const m = Math.floor(num($('#geM').value)); if (m < 1){ toast('Months likho'); return false; }
    g.dueDate = addMonths(g.dueDate, m); g.months += m; g.renewals = (g.renewals || 0) + 1;
    saveAll(); renderGirviDetail(); renderWarn(); toast('Due date: ' + fmtD(g.dueDate)); return true;
  });
}
function deleteGirvi(){
  const g = girvi.find(x => x.id === currentGid); if (!g) return;
  const warn = g.status === 'released' ? 'Ye girvi record aur uski photos delete ho jayengi.' : 'Item abhi customer ko wapas nahi gaya hai! Phir bhi record aur photos delete karne hain?';
  askPassword(warn, async () => {
    for (const id of g.photos || []) await pDel(id);
    girvi = girvi.filter(x => x.id !== g.id); saveAll(); currentGid = null; toast('Girvi deleted'); show('girvi');
  });
}
function openLightbox(id){ pGet(id).then(d => { if (!d) return; $('#lightbox img').src = d; $('#lightbox').hidden = false; }); }

/* ----- girvi receipt ----- */
function girviSlipInner(g, shots){
  const rel = g.status === 'released', c = girviCalc(g, rel ? g.releasedDate : todayStr());
  const monthly = r2(g.principal * g.rate / 100), shopPhone = settings.phone.trim();
  const rows = [
    ['Item', esc(g.item) + (g.qty > 1 ? ' × ' + g.qty : '')], ['Type', esc(g.type)], ['Weight', Number(g.weight).toFixed(3) + ' g'],
    g.purity ? ['Purity', esc(g.purity)] : null, g.value ? ['Estimated value', money(g.value)] : null,
    ['Loan amount', money(g.principal)], ['Interest', `${g.rate}% per month${g.interestType === 'compound' ? ' (compound)' : ''} (${money(monthly)})`],
    ['Duration', `${g.months} month${g.months > 1 ? 's' : ''}`], ['Start date', fmtD(g.startDate)], ['Due date', fmtD(g.dueDate)]
  ].filter(Boolean);
  const kv = rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
  const payable = r2(g.principal + monthly * g.months);
  const totals = rel
    ? `<div><span>Loan</span><b>${money(g.principal)}</b></div><div><span>Interest charged</span><b>${money(c.interest)}</b></div><div class="bal zero"><span>Received</span><b>${money(g.settle.amount)}</b></div>`
    : `<div><span>Loan</span><b>${money(g.principal)}</b></div><div><span>Interest (${g.months} m)</span><b>${money(r2(monthly * g.months))}</b></div><div class="bal"><span>Payable on due date</span><b>${money(payable)}</b></div>`;
  return `<div class="rc">
    <img class="rc-logo" src="icon-192.png" alt="">
    <div class="rc-name">${SHOP_NAME}</div>
    <div class="rc-addr">${esc(SHOP_ADDR)}</div>
    ${shopPhone ? `<div class="rc-phone">Phone: ${esc(shopPhone)}</div>` : ''}
    <svg class="rc-orn" viewBox="0 0 200 12"><path d="M0 6h82M118 6h82" stroke-width="1"/><path d="M100 1l5 5-5 5-5-5z" fill="#c9a227" stroke="none"/><circle cx="88" cy="6" r="2"/><circle cx="112" cy="6" r="2"/></svg>
    <div class="rc-title">${rel ? 'GIRVI RELEASE RECEIPT' : 'GIRVI RECEIPT'}</div>
    <div class="rc-meta"><div>Girvi No.<b>${gNo(g)}</b></div><div style="text-align:right">${rel ? 'Released on' : 'Date'}<b>${fmtD(rel ? g.releasedDate : g.startDate)}</b></div></div>
    <div class="rc-cust"><div>Customer<b>${esc(g.name)}</b></div>${g.phone ? `<div style="text-align:right">Phone<b>${esc(g.phone)}</b></div>` : ''}${g.address ? `<div style="flex-basis:100%">${esc(g.address)}</div>` : ''}</div>
    ${shots.length ? `<div class="rc-photos">${shots.map(s => `<img src="${s}" alt="Pledged item">`).join('')}</div>` : ''}
    <table class="rc-items rc-kv"><tbody>${kv}</tbody></table>
    <div class="rc-bottom">
      <div class="rc-stampwrap"><span class="rc-stamp ${rel ? 'paid' : 'due'}">${rel ? 'RELEASED' : 'PLEDGED'}</span></div>
      <div class="rc-totals">${totals}</div>
    </div>
    <div class="rc-pay">Pledged item is kept by the shop as security and will be returned on payment of the loan amount plus interest.</div>
    <div class="rc-sign"><span>Customer</span><span>Authorised signature</span></div>
    <div class="rc-foot">Thank you!</div>
  </div>`;
}
async function openGirviSlip(id, back){
  const g = girvi.find(x => x.id === id); if (!g) return;
  const shots = (await Promise.all((g.photos || []).map(pGet))).filter(Boolean);
  currentGid = id; receiptKind = 'girvi'; receiptReturn = back || 'girviDetail';
  $('#receiptPaper').innerHTML = girviSlipInner(g, shots);
  show('receipt');
}
async function downloadGirviSlip(){
  const g = girvi.find(x => x.id === currentGid); if (!g) return;
  const shots = (await Promise.all((g.photos || []).map(pGet))).filter(Boolean);
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${gNo(g)}</title><style>body{margin:14px;background:#fff}${RECEIPT_CSS}</style></head><body>${girviSlipInner(g, shots).replace('src="icon-192.png"', 'src="' + await logoData() + '"')}</body></html>`;
  downloadFile(`girvi-${gNo(g)}-${g.name.replace(/[^\w]+/g, '_')}.html`, html, 'text/html');
}
function whatsappGirvi(){
  const g = girvi.find(x => x.id === currentGid); if (!g) return;
  const monthly = r2(g.principal * g.rate / 100);
  const text = `*${SHOP_NAME}*\n${SHOP_ADDR}${settings.phone ? '\nPh: ' + settings.phone : ''}\n\n*Girvi Receipt ${gNo(g)}* · ${fmtD(g.startDate)}\nCustomer: ${g.name}\n\nItem: ${g.item}${g.qty > 1 ? ' × ' + g.qty : ''} (${Number(g.weight).toFixed(3)} g)\nLoan: ${money(g.principal)}\nInterest: ${g.rate}% per month (${money(monthly)})\nDuration: ${g.months} month(s)\n*Due date: ${fmtD(g.dueDate)}*\n\nItem will be returned on payment of loan + interest.`;
  let to = digits(g.phone); if (to.length === 10) to = '91' + to;
  window.open(`https://wa.me/${to}?text=${encodeURIComponent(text)}`, '_blank');
}

/* ---------- numbered stock: Gold / Silver → your own categories → product numbers per category ---------- */
const catById = id => cats.find(c => c.id === id);
const metalCats = m => cats.filter(c => c.metal === m);
const padOf = c => Math.max(3, String(c.limit).length);
const tagOf = (c, no) => c.code + '-' + String(no).padStart(padOf(c), '0');
const itemNo = it => (it.code || (it.cat === 'gold' ? 'G' : 'S')) + '-' + String(it.no).padStart(it.pad || (it.cat === 'gold' ? 3 : 4), '0');
/* the number printed on a bill line (older bills only stored metal + number) */
const lineTag = i => i.tag || (i.no ? (i.cat === 'gold' ? 'G-' : 'S-') + String(i.no).padStart(i.cat === 'gold' ? 3 : 4, '0') : '');
const stockOf = catId => items.filter(i => i.status === 'stock' && (!catId || i.catId === catId));
const stockMetal = m => items.filter(i => i.status === 'stock' && i.cat === m);
const findStock = (catId, no) => items.find(i => i.catId === catId && i.no === no && i.status === 'stock');
function freeNo(catId){
  const c = catById(catId); if (!c) return 0;
  const used = new Set(stockOf(catId).map(i => i.no));
  for (let n = 1; n <= c.limit; n++) if (!used.has(n)) return n;
  return 0;
}
const itemDays = it => Math.max(0, (it.status === 'sold' && it.soldAt ? dayOfIso(it.soldAt) : dn(todayStr())) - dayOfIso(it.addedAt));
const daysLabel = d => d === 0 ? 'usi din' : d + ' din';
const lastWithNo = (catId, no) => items.filter(i => i.catId === catId && i.no === no && i.status === 'sold')
  .sort((a, b) => new Date(b.soldAt) - new Date(a.soldAt))[0];

function itemSub(it){
  const bits = [Number(it.weight).toFixed(3) + ' g'];
  if (it.purity) bits.push(esc(it.purity));
  if (it.rate !== '') bits.push('₹' + Number(it.rate).toLocaleString('en-IN') + '/g');
  return bits.join(' · ');
}
function lifeText(it){
  const from = fmtDay(it.addedAt);
  if (it.status === 'sold') return `Stock: ${from} → ${fmtDay(it.soldAt)} (${daysLabel(itemDays(it))}) · ${esc(it.buyer ? it.buyer.name : '')} ko bika`;
  return `Stock mein: ${from} se (${daysLabel(itemDays(it))})`;
}
function itemRow(it, hist){
  const sold = it.status === 'sold';
  return `<button class="item irow" data-iid="${it.id}">
    <span class="pno ${it.cat}">${esc(itemNo(it))}</span>
    <span class="l"><b>${esc(it.name)}</b><small>${esc(it.catName)} · ${itemSub(it)}</small>${hist ? `<small>${lifeText(it)}</small>` : ''}</span>
    <span class="r">${it.amount !== '' ? money0(it.amount) : ''}<em class="badge ${sold ? 'due' : 'ok'}">${sold ? 'Sold' : 'In stock'}</em></span></button>`;
}
function itemDetailCard(it){
  const sold = it.status === 'sold';
  return `<div class="card pcard ${sold ? 'out' : 'ok'}">
    <div class="ptop"><div><span class="pno ${it.cat} big">${esc(itemNo(it))}</span></div><em class="badge ${sold ? 'due' : 'ok'}">${sold ? 'Sold' : 'In stock'}</em></div>
    <h3 style="margin:.4em 0 .2em">${esc(it.name)}</h3>
    <dl class="dl" style="grid-template-columns:110px 1fr">
      <dt>Category</dt><dd>${esc(CAT_LABEL[it.cat])} › ${esc(it.catName)}</dd>
      <dt>Weight</dt><dd>${Number(it.weight).toFixed(3)} g</dd>
      ${it.purity ? `<dt>Purity</dt><dd>${esc(it.purity)}</dd>` : ''}
      ${it.rate !== '' ? `<dt>Rate</dt><dd>₹${Number(it.rate).toLocaleString('en-IN')} / g</dd>` : ''}
      ${it.amount !== '' ? `<dt>Amount</dt><dd>${money(it.amount)}</dd>` : ''}
      <dt>Stock mein aaya</dt><dd>${fmtDate(it.addedAt)}</dd>
      ${sold ? `<dt>Bika</dt><dd>${fmtDate(it.soldAt)}</dd><dt>Customer</dt><dd>${esc(it.buyer ? it.buyer.name : '')}${it.buyer && it.buyer.phone ? ' · ' + esc(it.buyer.phone) : ''}</dd>${it.recNo ? `<dt>Bill</dt><dd>#${String(it.recNo).padStart(4, '0')}${it.soldAmount ? ' · ' + money(it.soldAmount) : ''}</dd>` : ''}` : ''}
      <dt>${sold ? 'Stock mein raha' : 'Stock mein hai'}</dt><dd>${daysLabel(itemDays(it))}</dd>
    </dl></div>`;
}

function renderStock(){
  const gN = stockMetal('gold').length, sN = stockMetal('silver').length, hist = stockView === 'hist';
  $('#stockSeg').innerHTML = `<button data-sv="gold" class="${stockView === 'gold' ? 'on' : ''}">Gold <small>${gN} items</small></button>
    <button data-sv="silver" class="${stockView === 'silver' ? 'on' : ''}">Silver <small>${sN} items</small></button>
    <button data-sv="hist" class="${hist ? 'on' : ''}">History <small>${items.length}</small></button>`;
  $('#catBar').hidden = true; $('#histCats').hidden = !hist; $('#histCatSel').hidden = !hist;
  const q = $('#stockSearch').value.trim(), isNum = /^\d+$/.test(q), n = isNum ? parseInt(q, 10) : 0;
  $('#stockSearch').placeholder = hist ? 'Product number ya naam/customer search' : 'Product number ya naam search';
  const info = $('#stockInfo'), list = $('#stockList');
  let html = '', top = '';

  if (!hist){
    const m = stockView, mc = metalCats(m);
    if (!mc.some(c => c.id === stockCat)) stockCat = '';
    $('#stockSearch').hidden = !stockCat;
    if (!mc.length){
      info.innerHTML = `<div class="card empty-card"><b>${CAT_LABEL[m]} ki abhi koi category nahi hai.</b><br><span class="muted">Pehle Admin mein category banao (jaise Chain, Ring, Bangle) aur uski limit set karo. Phir har category ke apne product number chalenge.</span><br><button class="btn small primary" data-go="admin">Admin kholo › Stock categories</button></div>`;
      list.innerHTML = ''; return;
    }
    if (!stockCat){
      info.innerHTML = `<p class="muted" style="margin:.2em 0 .6em">${CAT_LABEL[m]} ki category par click karo — uske andar ke product dikhenge.</p>`;
      list.innerHTML = mc.map(c => { const n = stockOf(c.id).length, pct = Math.round(n / c.limit * 100);
        return `<button class="item catcard" data-sc="${c.id}"><span class="pno ${m}">${esc(c.code)}</span><span class="l"><b>${esc(c.name)}</b><small>${n} item stock mein · limit ${c.limit}</small><span class="bar"><u style="width:${pct}%"></u></span></span><span class="chev">›</span></button>`; }).join('');
      return;
    }
    const c = catById(stockCat);
    if (c){
      const all = stockOf(c.id).sort((a, b) => a.no - b.no), nx = freeNo(c.id), pct = Math.round(all.length / c.limit * 100);
      info.innerHTML = `<button class="link" data-sc="">‹ ${CAT_LABEL[m]} categories</button>
        <div class="card cap"><div class="ptop"><div><b style="font-size:1.25rem">${esc(c.name)}</b><small>${all.length} item stock mein · ${c.limit - all.length} jagah khali (limit ${c.limit})</small></div>
        <button class="btn small primary" data-ia="addcat" data-cat="${c.id}">+ Add</button></div>
        <div class="gauge"><i style="width:${pct}%"></i></div>
        <small class="muted">${nx ? 'Agla product number: ' + esc(tagOf(c, nx)) : 'Saare number bhar gaye — Admin mein limit badhao'}</small></div>`;
      let shown = all;
      if (isNum){
        shown = all.filter(i => String(i.no).startsWith(String(n)));
        const ex = findStock(c.id, n);
        if (ex) top = itemDetailCard(ex) + `<div class="quick"><button class="btn small" data-ia="edit" data-id="${ex.id}">Edit</button><button class="btn small primary" data-ia="sell" data-id="${ex.id}">Sell this</button><button class="btn small danger" data-ia="del" data-id="${ex.id}">Delete</button></div>`;
        else if (n >= 1 && n <= c.limit){
          const prev = lastWithNo(c.id, n);
          top = `<div class="card empty-card"><b>${esc(tagOf(c, n))} khali hai</b><br><span class="muted">Is number par abhi stock mein koi item nahi.${prev ? `<br>Pichhli baar: ${esc(prev.name)} — ${esc(prev.buyer ? prev.buyer.name : '')} ko bika (${fmtDay(prev.soldAt)}).` : ''}</span><br><button class="btn small primary" data-ia="addno" data-cat="${c.id}" data-no="${n}">+ Is number par item add karo</button></div>`;
        } else top = `<div class="card empty-card"><b>${esc(c.name)} ke number 1 se ${c.limit} tak hain.</b></div>`;
        shown = shown.filter(i => !(ex && i.id === ex.id));
      } else if (q){ const k = q.toLowerCase(); shown = all.filter(i => (i.name + ' ' + i.purity).toLowerCase().includes(k)); }
      html = top + (shown.length ? shown.map(i => itemRow(i)).join('') : (!top ? `<div class="empty">${all.length ? 'Koi match nahi mila.' : esc(c.name) + ' stock khali hai. “+ Add Item” dabao.'}</div>` : ''));
    } else {
      const order = id => mc.findIndex(x => x.id === id);
      const all = stockMetal(m).sort((a, b) => order(a.catId) - order(b.catId) || a.no - b.no);
      info.innerHTML = `<div class="card cap"><b>${CAT_LABEL[m]} — saari categories</b><br><span class="muted">${all.length} item · ${mc.length} categories. Upar se category chuno ya number likh kar search karo.</span></div>`;
      let shown = all;
      if (isNum){
        shown = all.filter(i => String(i.no).startsWith(String(n)));
        const ex = shown.filter(i => i.no === n);
        if (ex.length === 1) top = itemDetailCard(ex[0]) + `<div class="quick"><button class="btn small" data-ia="edit" data-id="${ex[0].id}">Edit</button><button class="btn small primary" data-ia="sell" data-id="${ex[0].id}">Sell this</button><button class="btn small danger" data-ia="del" data-id="${ex[0].id}">Delete</button></div>`;
        shown = shown.filter(i => !(ex.length === 1 && i.id === ex[0].id));
      } else if (q){ const k = q.toLowerCase(); shown = all.filter(i => (i.name + ' ' + i.purity + ' ' + i.catName).toLowerCase().includes(k)); }
      html = top + (shown.length ? shown.map(i => itemRow(i)).join('') : (!top ? `<div class="empty">${all.length ? 'Koi match nahi mila.' : CAT_LABEL[m] + ' stock khali hai. “+ Add Item” dabao.'}</div>` : ''));
    }
  } else {
    $$('#histCats .chip').forEach(c => c.classList.toggle('on', c.dataset.hc === histCat));
    const pool = cats.filter(c => histCat === 'all' || c.metal === histCat);
    if (histCatId !== 'all' && !pool.some(c => c.id === histCatId)) histCatId = 'all';
    $('#histCatSel').innerHTML = '<option value="all">Saari categories</option>' + pool.map(c => `<option value="${c.id}" ${c.id === histCatId ? 'selected' : ''}>${esc(CAT_LABEL[c.metal])} › ${esc(c.name)}</option>`).join('');
    const base = items.filter(i => (histCat === 'all' || i.cat === histCat) && (histCatId === 'all' || i.catId === histCatId));
    let shown = base;
    if (isNum){
      shown = base.filter(i => i.no === n);
      info.innerHTML = `<div class="card cap"><b>Number ${n}</b><br><span class="muted">${shown.length ? shown.length + ' item is number par rahe hain — purane se naya (neeche).' : 'Is number par kabhi koi item nahi raha.'}</span></div>`;
      shown = shown.sort((a, b) => new Date(a.addedAt) - new Date(b.addedAt));
    } else {
      if (q){ const k = q.toLowerCase(); shown = base.filter(i => (i.name + ' ' + i.purity + ' ' + i.catName + ' ' + (i.buyer ? i.buyer.name + ' ' + i.buyer.phone : '')).toLowerCase().includes(k)); }
      shown = shown.sort((a, b) => new Date(b.soldAt || b.addedAt) - new Date(a.soldAt || a.addedAt));
      const soldN = base.filter(i => i.status === 'sold').length;
      info.innerHTML = `<div class="card cap"><b>Item history</b><br><span class="muted">${base.length} item · ${base.length - soldN} stock mein · ${soldN} bik chuke. Category chuno aur number likh kar uski poori history dekho.</span></div>`;
    }
    html = shown.length ? shown.map(i => itemRow(i, true)).join('') : '<div class="empty">Kuch nahi mila.</div>';
  }
  list.innerHTML = html;
}

/* ---------- add / edit / delete ---------- */
let aiMetal = 'gold', aiCatId = '';
const PURITY = {gold: ['24K', '22K', '18K', '14K'], silver: ['999', '925', '800']};
function addItem(pre){
  pre = pre || {};
  if (!cats.length){
    openModal('Pehle category banao', `<p>Stock mein item daalne se pehle Admin mein category banani padegi (jaise <b>Chain</b>, <b>Ring</b>, <b>Bangle</b>), uska naam aur kitne item ka limit hai wo set karo.</p>`,
      'Admin kholo', () => { setTimeout(() => show('admin'), 0); return true; });
    return;
  }
  const pc = pre.catId && catById(pre.catId);
  aiMetal = pc ? pc.metal : (stockView === 'silver' ? 'silver' : 'gold');
  if (!metalCats(aiMetal).length) aiMetal = aiMetal === 'gold' ? 'silver' : 'gold';
  aiCatId = pc ? pc.id : (catById(stockCat) && catById(stockCat).metal === aiMetal ? stockCat : metalCats(aiMetal)[0].id);
  openModal('Add item to stock', `
    <div class="quick" id="aiMetals"><button type="button" class="chip" data-aim="gold">Gold</button><button type="button" class="chip" data-aim="silver">Silver</button></div>
    <label>Category<select id="aiCat"></select></label>
    <p class="muted" id="aiNext"></p>
    <label>Item name<input id="aiName" placeholder="e.g. Ring, Chain, Payal" autocomplete="off"></label>
    <div class="row">
      <label>Weight (g)<input id="aiWeight" type="number" min="0" step="0.001" inputmode="decimal" placeholder="0.000"></label>
      <label>Purity<input id="aiPurity" list="aiPurityList" placeholder="22K / 925" autocomplete="off"><datalist id="aiPurityList"></datalist></label>
    </div>
    <div class="row">
      <label>Rate ₹/g <span class="muted">(optional)</span><input id="aiRate" type="number" min="0" step="0.01" inputmode="decimal"></label>
      <label>Amount ₹ <span class="muted">(optional)</span><input id="aiAmount" type="number" min="0" step="0.01" inputmode="decimal"></label>
    </div>
    <label>Product number <span class="muted">(khali chhodo = app khud dega)</span><input id="aiNo" type="number" min="1" step="1" inputmode="numeric" placeholder="Auto" value="${pre.no || ''}"></label>`,
    'Save item', () => {
      const c = catById($('#aiCat').value); if (!c){ toast('Category chuno'); return false; }
      const name = $('#aiName').value.trim(), w = num($('#aiWeight').value);
      if (!name){ toast('Item ka naam likho'); return false; }
      if (!(w > 0)){ toast('Weight likho'); return false; }
      const no = $('#aiNo').value === '' ? freeNo(c.id) : Math.floor(num($('#aiNo').value));
      if (!no){ toast(`${c.name} ke saare ${c.limit} number bhare hain — Admin mein limit badhao`); return false; }
      if (no < 1 || no > c.limit){ toast(`${c.name} ka number 1 se ${c.limit} ke beech ho`); return false; }
      if (findStock(c.id, no)){ toast(`${tagOf(c, no)} pehle se stock mein hai`); return false; }
      const it = normalizeItem({id: uid(), cat: c.metal, catId: c.id, catName: c.name, code: c.code, pad: padOf(c), no, name, weight: w, purity: $('#aiPurity').value.trim(),
        rate: $('#aiRate').value === '' ? '' : num($('#aiRate').value), amount: $('#aiAmount').value === '' ? '' : r2(num($('#aiAmount').value)),
        addedAt: new Date().toISOString(), status: 'stock'});
      items.push(it); saveAll(); stockView = c.metal; stockCat = c.id; $('#stockSearch').value = ''; renderStock();
      setTimeout(() => itemAdded(it), 0); return true;
    });
  const sync = () => {
    $$('#aiMetals .chip').forEach(c => c.classList.toggle('on', c.dataset.aim === aiMetal));
    const mc = metalCats(aiMetal);
    $('#aiCat').innerHTML = mc.length ? mc.map(c => `<option value="${c.id}" ${c.id === aiCatId ? 'selected' : ''}>${esc(c.name)} (${stockOf(c.id).length}/${c.limit})</option>`).join('') : '<option value="">— category nahi —</option>';
    const c = catById($('#aiCat').value), nx = c ? freeNo(c.id) : 0;
    $('#aiNext').innerHTML = !c ? `<b class="bad">${CAT_LABEL[aiMetal]} ki category Admin mein banao.</b>` : nx ? `Agla number: <b>${esc(tagOf(c, nx))}</b> (limit ${c.limit})` : `<b class="bad">${esc(c.name)} ke saare ${c.limit} number bhare hain — Admin mein limit badhao.</b>`;
    $('#aiPurityList').innerHTML = PURITY[aiMetal].map(p => `<option value="${p}">`).join('');
  };
  $('#aiMetals').onclick = e => { const c = e.target.closest('[data-aim]'); if (c){ aiMetal = c.dataset.aim; aiCatId = (metalCats(aiMetal)[0] || {}).id || ''; sync(); } };
  $('#aiCat').onchange = () => { aiCatId = $('#aiCat').value; sync(); };
  sync();
}
function itemAdded(it){
  openModal('Item stock mein add ho gaya ✓', `<div class="bigno ${it.cat}">${esc(itemNo(it))}</div>
    <p style="text-align:center"><b>${esc(it.name)}</b> · ${esc(it.catName)}<br>${itemSub(it)}</p>
    <p class="muted" style="text-align:center">Ye product number item par likh lo / tag laga do. Sale mein yahi number daalna hai.</p>`,
    '+ Add another', () => { setTimeout(() => addItem({catId: it.catId}), 0); return true; }, 'Done');
}
function openItem(id){
  const it = items.find(x => x.id === id); if (!it) return;
  const sold = it.status === 'sold';
  const btns = sold
    ? `${it.buyer ? `<button class="btn small primary" data-ia="cust" data-id="${it.id}">Customer ka record</button>` : ''}${it.recId && records.some(r => r.id === it.recId) ? `<button class="btn small" data-ia="bill" data-id="${it.id}">Bill dekho</button>` : ''}`
    : `<button class="btn small primary" data-ia="sell" data-id="${it.id}">Sell this</button><button class="btn small" data-ia="edit" data-id="${it.id}">Edit</button><button class="btn small danger" data-ia="del" data-id="${it.id}">Delete</button>`;
  openModal(sold ? 'Item history' : 'Stock item', itemDetailCard(it) + `<div class="quick">${btns}</div>`, null, null, 'Close');
}
function editItem(id){
  const it = items.find(x => x.id === id); if (!it || it.status !== 'stock') return;
  openModal('Edit ' + itemNo(it), `
    <label>Item name<input id="eiName" value="${esc(it.name)}"></label>
    <div class="row"><label>Weight (g)<input id="eiWeight" type="number" step="0.001" inputmode="decimal" value="${it.weight}"></label>
    <label>Purity<input id="eiPurity" value="${esc(it.purity)}"></label></div>
    <div class="row"><label>Rate ₹/g<input id="eiRate" type="number" step="0.01" inputmode="decimal" value="${it.rate}"></label>
    <label>Amount ₹<input id="eiAmount" type="number" step="0.01" inputmode="decimal" value="${it.amount}"></label></div>`, 'Save', () => {
    const name = $('#eiName').value.trim(), w = num($('#eiWeight').value);
    if (!name || !(w > 0)){ toast('Naam aur weight likho'); return false; }
    Object.assign(it, {name, weight: w, purity: $('#eiPurity').value.trim(),
      rate: $('#eiRate').value === '' ? '' : num($('#eiRate').value), amount: $('#eiAmount').value === '' ? '' : r2(num($('#eiAmount').value))});
    saveAll(); renderStock(); toast('Item updated'); return true;
  });
}
function deleteItem(id){
  const it = items.find(x => x.id === id); if (!it) return;
  askPassword(`${itemNo(it)} · ${it.name} stock se hamesha ke liye delete hoga.`, () => {
    items = items.filter(x => x.id !== id); saveAll(); renderStock(); renderWarn(); toast(itemNo(it) + ' delete ho gaya');
  });
}
/* an item goes back to stock (e.g. a sale bill was deleted); if its number was taken meanwhile it gets a new one */
function restoreItem(it){
  it.status = 'stock'; delete it.soldAt; delete it.buyer; delete it.recId; delete it.recNo; delete it.soldAmount;
  if (items.some(x => x !== it && x.status === 'stock' && x.catId === it.catId && x.no === it.no)){
    const nx = freeNo(it.catId); if (nx) it.no = nx;
  }
}

/* ---------- category manager (Admin) ---------- */
function renderCatList(){
  const box = $('#catList'); if (!box) return;
  box.innerHTML = cats.length ? ['gold', 'silver'].map(m => {
    const mc = metalCats(m); if (!mc.length) return '';
    return `<h3 style="margin:.8em 0 .2em;font-size:1rem">${CAT_LABEL[m]}</h3>` + mc.map(c => `<div class="catrow"><span class="pno ${m}">${esc(c.code)}</span>
      <span class="l"><b>${esc(c.name)}</b><small>${stockOf(c.id).length} / ${c.limit} items</small></span>
      <button class="btn small" data-cedit="${c.id}">Edit</button><button class="btn small danger" data-cdel="${c.id}">Delete</button></div>`).join('');
  }).join('') : '<p class="muted">Abhi koi category nahi. “+ Add category” se Gold ya Silver ki category banao.</p>';
}
const autoCode = name => {
  const base = (String(name).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 3) || 'X');
  let code = base, k = 2; while (cats.some(c => c.code === code)) code = base.slice(0, 2) + (k++);
  return code;
};
function categoryForm(c){
  openModal(c ? 'Edit category' : 'Add category', `
    ${c ? `<p class="muted">${CAT_LABEL[c.metal]} category (metal badal nahi sakte)</p>` : `<div class="quick" id="acMetals"><button type="button" class="chip on" data-acm="gold">Gold</button><button type="button" class="chip" data-acm="silver">Silver</button></div>`}
    <label>Category ka naam<input id="acName" placeholder="e.g. Chain, Ring, Bangle, Payal" value="${c ? esc(c.name) : ''}" autocomplete="off"></label>
    <div class="row">
      <label>Kitne item tak (limit)<input id="acLimit" type="number" min="1" step="1" inputmode="numeric" placeholder="e.g. 100" value="${c ? c.limit : ''}"></label>
      <label>Number ka code<input id="acCode" maxlength="5" placeholder="auto" value="${c ? esc(c.code) : ''}" autocomplete="off"></label>
    </div>
    <p class="muted">Product number aise banega: <b id="acEx"></b>. Har category ka number 1 se limit tak alag chalta hai.</p>`, 'Save', () => {
    const name = $('#acName').value.trim(), limit = Math.floor(num($('#acLimit').value));
    if (!name){ toast('Category ka naam likho'); return false; }
    if (!(limit >= 1)){ toast('Limit likho (kam se kam 1)'); return false; }
    const metal = c ? c.metal : ($('#acMetals .chip.on') || {dataset: {acm: 'gold'}}).dataset.acm;
    if (cats.some(x => x !== c && x.metal === metal && x.name.toLowerCase() === name.toLowerCase())){ toast(`${CAT_LABEL[metal]} mein “${name}” category pehle se hai`); return false; }
    let code = $('#acCode').value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '') || (c ? c.code : autoCode(name));
    if (cats.some(x => x !== c && x.code === code)){ toast(`Code “${code}” kisi aur category ka hai — alag code likho`); return false; }
    if (c){
      const mx = Math.max(0, ...stockOf(c.id).map(i => i.no));
      if (limit < mx){ toast(`Stock mein number ${mx} maujood hai — limit ${mx} se kam nahi ho sakti`); return false; }
      c.name = name; c.limit = limit; c.code = code;
      stockOf(c.id).forEach(i => { i.catName = name; i.code = code; i.pad = padOf(c); });
    } else cats.push({id: uid(), metal, name, limit, code});
    saveAll(); renderCatList(); if (!$('#stock').hidden) renderStock(); toast('Category saved ✓'); return true;
  });
  const ex = () => { const code = $('#acCode').value.trim().toUpperCase() || (c ? c.code : autoCode($('#acName').value || 'X')); const lim = Math.floor(num($('#acLimit').value)) || 100; $('#acEx').textContent = code + '-' + String(1).padStart(Math.max(3, String(lim).length), '0'); };
  ['acName', 'acLimit', 'acCode'].forEach(id => $('#' + id).addEventListener('input', ex)); ex();
  if (!c) $('#acMetals').onclick = e => { const b = e.target.closest('[data-acm]'); if (b) $$('#acMetals .chip').forEach(x => x.classList.toggle('on', x === b)); };
}
function deleteCategory(id){
  const c = catById(id); if (!c) return;
  if (stockOf(id).length) return toast(`${c.name} mein ${stockOf(id).length} item stock mein hain — pehle unhe bechein ya delete karein`);
  askPassword(`Category “${c.name}” delete hogi. Purani history aur bills par asar nahi padega.`, () => {
    cats = cats.filter(x => x.id !== id); saveAll(); renderCatList(); toast('Category delete ho gayi');
  });
}

/* ---------- new sale ---------- */
const firstCat = m => (metalCats(m)[0] || {}).id || '';
const newLine = cat => ({key: uid(), cat: cat || 'gold', catId: firstCat(cat || 'gold'), no: '', itemId: null, name: '', weight: '', purity: '', rate: '', amount: '', amtManual: false});
const newDraft = () => ({name: '', phone: '', orderId: null, lines: [newLine()], makingMode: 'pct', makingVal: settings.makingDefault || '',
  gstPct: settings.gstDefault, paid: '', interest: {type: settings.ledgerType, rate: settings.ledgerRate, dueDays: settings.ledgerDue}});
let draft = newDraft();
const defaultRate = cat => cat === 'silver' ? settings.rateSilver : cat === 'gold' ? settings.rateGold : '';
const lineEl = l => $(`.line[data-key="${l.key}"]`);
function setVal(el, v){ if (el && document.activeElement !== el) el.value = v; }

function lineHTML(l, i){
  const man = l.cat === 'manual', lock = !!l.itemId;
  return `<div class="card line" data-key="${l.key}">
    <div class="line-head"><b>Item ${i + 1}</b>${draft.lines.length > 1 ? '<button type="button" class="x" data-la="rm" aria-label="Remove item">×</button>' : ''}</div>
    <div class="quick lcats">
      <button type="button" class="chip ${l.cat === 'gold' ? 'on' : ''}" data-la="cat" data-v="gold">Gold</button>
      <button type="button" class="chip ${l.cat === 'silver' ? 'on' : ''}" data-la="cat" data-v="silver">Silver</button>
      <button type="button" class="chip ${man ? 'on' : ''}" data-la="cat" data-v="manual">Bina number</button>
    </div>
    ${man ? '' : (metalCats(l.cat).length ? `<label>Category<select data-f="catId">${metalCats(l.cat).map(c => `<option value="${c.id}" ${c.id === l.catId ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
    <label>${esc((catById(l.catId) || {}).name || '')} product number<input data-f="no" type="number" min="1" step="1" inputmode="numeric" placeholder="e.g. 12" value="${esc(l.no)}"></label><div class="hint" data-hint></div>` : `<p class="hint bad">${CAT_LABEL[l.cat]} ki category nahi hai — Admin › Stock categories mein banao, ya “Bina number” chuno.</p>`)}
    <label>Item name<input data-f="name" placeholder="${man ? 'Item ka naam' : 'Number daalte hi bhar jayega'}" value="${esc(l.name)}" ${lock ? 'readonly' : ''}></label>
    <div class="row">
      <label>Weight (g)<input data-f="weight" type="number" min="0" step="0.001" inputmode="decimal" placeholder="0.000" value="${esc(l.weight)}" ${lock ? 'readonly' : ''}></label>
      <label>Purity<input data-f="purity" placeholder="22K / 925" value="${esc(l.purity)}" ${lock ? 'readonly' : ''}></label>
    </div>
    <div class="row">
      <label>Rate ₹/g<input data-f="rate" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(l.rate)}"></label>
      <label>Amount ₹<input data-f="amount" type="number" min="0" step="0.01" inputmode="decimal" value="${esc(l.amount)}"></label>
    </div>
  </div>`;
}
function hintFor(l){
  if (l.cat === 'manual') return ['', ''];
  const c = catById(l.catId); if (!c) return ['Category chuno.', 'bad'];
  const n = Math.floor(num(l.no));
  if (!l.no || n < 1) return ['Product number likho — details apne aap aa jayengi.', ''];
  if (n > c.limit) return [`${c.name} ka number 1 se ${c.limit} tak hota hai.`, 'bad'];
  const it = findStock(c.id, n);
  if (it){
    if (draft.lines.some(x => x !== l && x.itemId === it.id)) return ['Ye item is bill mein pehle se hai.', 'bad'];
    return [`✓ ${itemNo(it)} · ${it.name} · ${itemSub(it)} — ${daysLabel(itemDays(it))} se stock mein`, 'ok'];
  }
  const prev = lastWithNo(c.id, n);
  return [`${tagOf(c, n)} stock mein nahi hai (khali).${prev ? ' Pichhli baar: ' + prev.name + ' — ' + (prev.buyer ? prev.buyer.name : '') + ' ko bika.' : ''}`, 'bad'];
}
function renderLines(){ $('#lines').innerHTML = draft.lines.map(lineHTML).join(''); draft.lines.forEach(refreshHint); }
function refreshHint(l){
  const el = lineEl(l); if (!el) return; const h = el.querySelector('[data-hint]'); if (!h) return;
  const [t, c] = hintFor(l); h.textContent = t; h.className = 'hint ' + c;
}
function autoCalc(l){
  if (l.amtManual) return;
  const w = num(l.weight), r = num(l.rate);
  l.amount = w > 0 && r > 0 ? r2(w * r) : '';
}
function lookupLine(l){
  const n = Math.floor(num(l.no)), it = l.cat !== 'manual' && n >= 1 ? findStock(l.catId, n) : null;
  const dup = it && draft.lines.some(x => x !== l && x.itemId === it.id);
  if (it && !dup){
    if (l.itemId !== it.id){
      l.itemId = it.id; l.name = it.name; l.weight = it.weight; l.purity = it.purity;
      l.rate = it.rate !== '' ? it.rate : defaultRate(l.cat);
      if (it.amount !== ''){ l.amount = it.amount; l.amtManual = true; } else { l.amtManual = false; autoCalc(l); }
    }
  } else if (l.itemId){
    l.itemId = null; l.name = ''; l.weight = ''; l.purity = ''; l.rate = ''; l.amount = ''; l.amtManual = false;
  }
}
function refreshLine(l){
  const el = lineEl(l); if (!el) return;
  const lock = !!l.itemId;
  ['name', 'weight', 'purity', 'rate', 'amount'].forEach(f => { const i = el.querySelector(`[data-f="${f}"]`); setVal(i, l[f]); if (i && ['name', 'weight', 'purity'].includes(f)) i.readOnly = lock; });
  refreshHint(l);
}
function saleTotals(){
  const subtotal = r2(sum(draft.lines, l => num(l.amount)));
  const making = draft.makingMode === 'pct' ? r2(subtotal * num(draft.makingVal) / 100) : r2(num(draft.makingVal));
  const taxable = r2(subtotal + making), gst = r2(taxable * num(draft.gstPct) / 100), total = r2(taxable + gst);
  const o = draft.orderId ? orders.find(x => x.id === draft.orderId) : null, adv = o ? orderAdv(o) : 0;
  return {subtotal, making, gst, total, adv};
}
function updateTotals(){
  const t = saleTotals(), paid = r2(num(draft.paid)), bal = r2(t.total - t.adv - paid);
  $('#sumSubtotal').textContent = money(t.subtotal);
  $('#makingCost').textContent = money(t.making);
  $('#gstCost').textContent = money(t.gst);
  $('#gstSplit').textContent = num(draft.gstPct) > 0 ? `CGST ${r2(num(draft.gstPct) / 2)}% + SGST ${r2(num(draft.gstPct) / 2)}%` : 'GST nahi lagega';
  $('#sumTotal').textContent = money(t.total);
  $('#advRow').hidden = !draft.orderId; $('#sumAdv').textContent = '− ' + money(t.adv);
  const box = $('#balBox'); box.classList.remove('clear', 'zero');
  if (paid + t.adv > t.total + 0.004){ $('#balLabel').textContent = 'Paid total se zyada hai'; $('#sumBal').textContent = money(paid + t.adv - t.total); }
  else if (bal <= 0.004){ box.classList.add('clear'); $('#balLabel').textContent = 'Fully paid ✓'; $('#sumBal').textContent = money(0); }
  else { $('#balLabel').textContent = 'Balance (udhaar)'; $('#sumBal').textContent = money(bal); }
  $('#intBox').hidden = bal <= 0.004;
  $('#iRateRow').hidden = draft.interest.type === 'none';
}
function renderSale(){
  setVal($('#fName'), draft.name); setVal($('#fPhone'), draft.phone);
  setVal($('#makingMode'), draft.makingMode); setVal($('#makingVal'), draft.makingVal); setVal($('#gstPct'), draft.gstPct); setVal($('#fPaid'), draft.paid);
  setVal($('#iType'), draft.interest.type); setVal($('#iRate'), draft.interest.rate); setVal($('#iDue'), draft.interest.dueDays);
  const o = draft.orderId ? orders.find(x => x.id === draft.orderId) : null;
  $('#saleBanner').innerHTML = o ? `<div class="card empty-card"><b>Order ${oNo(o)} se purchase</b><br><span class="muted">${esc(o.desc)} · Advance ${money(orderAdv(o))} bill mein adjust hoga.</span><br><button class="btn small" id="saleDropOrder">Order se alag karo</button></div>` : '';
  renderLines(); updateTotals(); custSuggest($('#fName'), $('#fPhone'), $('#custSug'), $('#custNote'));
}
function resetSale(){ draft = newDraft(); renderSale(); }

function onLineInput(e){
  const f = e.target.dataset.f; if (!f) return;
  const card = e.target.closest('.line'), l = draft.lines.find(x => x.key === card.dataset.key); if (!l) return;
  l[f] = e.target.value;
  if (f === 'catId'){ lookupLine(l); const lab = card.querySelector('label:has([data-f="no"])'); if (lab) lab.firstChild.textContent = ((catById(l.catId) || {}).name || '') + ' product number'; draft.lines.forEach(x => { if (x.cat !== 'manual' && x.no) refreshHint(x); }); }
  if (f === 'no'){ lookupLine(l); draft.lines.forEach(x => { if (x !== l && x.cat !== 'manual' && x.no) refreshHint(x); }); }
  if (f === 'weight' || f === 'rate'){ l.amtManual = false; autoCalc(l); }
  if (f === 'amount') l.amtManual = true;
  refreshLine(l); updateTotals();
}
function onLineClick(e){
  const b = e.target.closest('[data-la]'); if (!b) return;
  const card = b.closest('.line'), l = draft.lines.find(x => x.key === card.dataset.key); if (!l) return;
  if (b.dataset.la === 'rm'){ draft.lines = draft.lines.filter(x => x !== l); renderLines(); updateTotals(); return; }
  if (b.dataset.la === 'cat' && l.cat !== b.dataset.v){
    const wasLocked = !!l.itemId; l.cat = b.dataset.v; l.catId = l.cat === 'manual' ? '' : firstCat(l.cat); l.itemId = null; l.no = '';
    if (wasLocked){ l.name = ''; l.weight = ''; l.purity = ''; l.rate = ''; l.amount = ''; l.amtManual = false; }
    if (l.cat !== 'manual' && !num(l.rate)) l.rate = defaultRate(l.cat);
    renderLines(); updateTotals();
  }
}

/* customer search / suggestions (used by sale + order forms) */
function custSuggest(nameEl, phoneEl, boxEl, noteEl){
  const qn = nameEl.value.trim().toLowerCase(), qp = digits(phoneEl.value), cs = customers();
  const m = (qn.length >= 2 || qp.length >= 3) ? cs.filter(c => (qn.length >= 2 && c.name.toLowerCase().includes(qn)) || (qp.length >= 3 && digits(c.phone).includes(qp))).slice(0, 5) : [];
  const ex = cs.find(c => c.ck === ckOf(nameEl.value, phoneEl.value));
  boxEl.innerHTML = m.filter(c => !(ex && c.ck === ex.ck)).map(c => `<button type="button" class="chip" data-pick="${esc(c.ck)}">${esc(c.name)}${c.phone ? ' · ' + esc(c.phone) : ''}${c.bal > 0.004 ? ' · ' + money0(c.bal) + ' baaki' : ''}</button>`).join('');
  noteEl.innerHTML = ex ? `<b>Purana customer ✓</b> — ${ex.recs.length} purchase · total ${money0(ex.total)} · baaki <b>${money0(ex.bal)}</b>. Nayi sale isi record mein judegi.` : (nameEl.value.trim() ? 'Naya customer.' : '');
}
function pickCustomer(ck, nameEl, phoneEl, after){
  const c = customers().find(x => x.ck === ck); if (!c) return;
  nameEl.value = c.name; phoneEl.value = c.phone; if (after) after();
}

function saveSale(ev){
  const name = draft.name.trim(), phone = digits(draft.phone);
  if (!name) return toast('Customer ka naam likho');
  if (phone && phone.length < 10) return toast('Phone number 10 digit ka hona chahiye');
  for (let i = 0; i < draft.lines.length; i++){
    const l = draft.lines[i], tag = `Item ${i + 1}: `;
    if (l.cat !== 'manual'){
      if (!l.no) return toast(tag + 'product number likho (ya “Bina number” chuno)');
      if (!l.itemId) return toast(tag + hintFor(l)[0]);
    } else if (!l.name.trim()) return toast(tag + 'item ka naam likho');
    if (l.amount === '' || num(l.amount) <= 0) return toast(tag + 'amount likho (rate bhar do ya seedha amount)');
  }
  const t = saleTotals(), paid = r2(num(draft.paid));
  if (t.total <= 0) return toast('Bill amount 0 hai');
  if (paid < 0) return toast('Paid amount galat hai');
  if (paid + t.adv > t.total + 0.004) return toast('Paid amount total se zyada hai');
  const now = new Date().toISOString(), id = uid(), receiptNo = settings.nextReceipt++;
  const o = draft.orderId ? orders.find(x => x.id === draft.orderId) : null;
  const payments = [];
  if (o) o.advances.forEach(a => payments.push({id: uid(), gid: a.id, date: a.date, amount: a.amount, note: `Advance (Order ${oNo(o)})`, mode: a.mode || ''}));
  if (paid > 0) payments.push({id: uid(), gid: uid(), date: now, amount: paid, note: 'Paid at purchase', mode: ''});
  const rec = normalizeRecord({
    id, receiptNo, date: now, name, phone,
    items: draft.lines.map(l => { const st = l.itemId && items.find(x => x.id === l.itemId); return {itemId: l.itemId || null, cat: l.cat === 'manual' ? '' : l.cat, catId: st ? st.catId : '', catName: st ? st.catName : '', tag: st ? itemNo(st) : '', no: st ? st.no : 0,
      name: l.name.trim(), purity: l.purity.trim(), qty: 1, weight: num(l.weight), rate: l.rate === '' ? '' : num(l.rate), amount: r2(num(l.amount))}; }),
    subtotal: t.subtotal, makingMode: draft.makingMode, makingVal: num(draft.makingVal), makingAmt: t.making,
    gstPct: num(draft.gstPct), gstAmt: t.gst, total: t.total, payments,
    interest: {type: draft.interest.type, rate: num(draft.interest.rate), dueDays: Math.max(0, Math.floor(num(draft.interest.dueDays)))},
    orderId: o ? o.id : null
  });
  records.push(rec);
  rec.items.forEach(li => {
    const it = li.itemId && items.find(x => x.id === li.itemId);
    if (it){ it.status = 'sold'; it.soldAt = now; it.buyer = {name, phone}; it.recId = id; it.recNo = receiptNo; it.soldAmount = li.amount; }
  });
  if (o){ o.status = 'delivered'; o.recId = id; o.deliveredAt = now; }
  saveAll(); resetSale();
  if (ev && ev.clientX !== undefined) sparkle(ev.clientX, ev.clientY);
  toast('Saved ✓  Receipt #' + String(receiptNo).padStart(4, '0'));
  openReceipt(id, 'home');
}

/* start a sale from elsewhere */
function sellItem(id){
  const it = items.find(x => x.id === id); if (!it || it.status !== 'stock') return;
  if (draft.lines.some(l => l.itemId === it.id)){ show('add'); return; }
  let l = draft.lines.find(x => !x.itemId && !x.name && !x.no && !num(x.amount));
  if (!l){ l = newLine(); draft.lines.push(l); }
  l.cat = it.cat; l.catId = it.catId; l.no = String(it.no); lookupLine(l);
  closeModal(); show('add');
}
function saleFor(name, phone){
  draft.name = name; draft.phone = phone; show('add');
}

/* ---------- customer khata: balance, interest, reminders ---------- */
function ckOf(name, phone){
  const ph = digits(phone);
  return ph.length >= 10 ? 'p:' + ph.slice(-10) : 'n:' + String(name || '').toLowerCase().replace(/\s+/g, ' ').trim();
}
const syncPaid = r => { r.paid = r2(sum(r.payments, p => p.amount)); };
const INT_LABEL = {none: 'Koi interest nahi', simple: 'Simple interest', compound: 'Compound interest'};

/* What is still owed on one bill, as on day `asDay`.
   Interest starts after the bill's grace days. Simple = on the unpaid principal only;
   compound = on principal + unpaid interest, compounded every 30 days. Payments clear interest first. */
function recDue(r, asDay){
  asDay = asDay === undefined ? dn(todayStr()) : asDay;
  const pays = r.payments.slice().sort((a, b) => new Date(a.date) - new Date(b.date)).filter(p => dayOfIso(p.date) <= asDay);
  const it = r.interest || {type: 'none'};
  if (it.type === 'none' || !(num(it.rate) > 0)){
    const p = Math.max(0, r2(r.total - sum(pays, x => x.amount)));
    return {p, i: 0, t: p, start: null};
  }
  const rate = num(it.rate) / 100, start = dayOfIso(r.date) + Math.max(0, Math.floor(num(it.dueDays)));
  let P = r.total, I = 0, last = start;
  const accrue = (from, to) => {
    const d = to - from; if (d <= 0 || P <= 0.005) return;
    if (it.type === 'simple') I += P * rate * d / 30;
    else { const base = P + I, m = Math.floor(d / 30), rem = d % 30, g = base * Math.pow(1 + rate, m); I += (g - base) + g * rate * rem / 30; }
  };
  for (const p of pays){
    const d = dayOfIso(p.date);
    if (d > last){ accrue(last, d); last = d; }
    let a = p.amount; const ii = Math.min(a, I); I -= ii; a -= ii; P -= Math.min(a, P);
  }
  accrue(last, asDay);
  P = Math.max(0, r2(P)); I = Math.max(0, r2(I));
  return {p: P, i: I, t: r2(P + I), start};
}
const recDueLeft = r => dayOfIso(r.date) + Math.max(0, Math.floor(num(r.interest.dueDays))) - dn(todayStr());

function customers(){
  const map = new Map();
  records.slice().sort((a, b) => new Date(a.date) - new Date(b.date)).forEach(r => {
    const ck = ckOf(r.name, r.phone); let c = map.get(ck);
    if (!c){ c = {ck, name: r.name, phone: r.phone, recs: [], total: 0, paid: 0, p: 0, i: 0, bal: 0, last: r.date}; map.set(ck, c); }
    c.name = r.name; if (r.phone) c.phone = r.phone; c.recs.push(r); c.last = r.date;
    const d = recDue(r); c.total += r.total; c.paid += r.paid; c.p += d.p; c.i += d.i;
  });
  orders.forEach(o => {
    const ck = ckOf(o.name, o.phone);
    if (!map.has(ck)) map.set(ck, {ck, name: o.name, phone: o.phone, recs: [], total: 0, paid: 0, p: 0, i: 0, bal: 0, last: o.date});
  });
  map.forEach(c => {
    c.total = r2(c.total); c.paid = r2(c.paid); c.p = r2(c.p); c.i = r2(c.i); c.bal = r2(c.p + c.i);
    c.orders = orders.filter(o => ckOf(o.name, o.phone) === c.ck);
    const lastO = c.orders.length ? c.orders[c.orders.length - 1].date : c.last; if (new Date(lastO) > new Date(c.last)) c.last = lastO;
  });
  return [...map.values()];
}
const customerOf = ck => customers().find(c => c.ck === ck);
function custDueLeft(c){
  let best = null;
  c.recs.forEach(r => { if (recDue(r).t > 0.004){ const l = recDueLeft(r); if (best === null || l < best) best = l; } });
  return best;
}
function custAlerts(){
  const out = [];
  customers().forEach(c => { if (c.bal <= 0.004) return; const left = custDueLeft(c); if (left !== null && left <= num(settings.remindBefore)) out.push({c, left}); });
  return out.sort((a, b) => a.left - b.left);
}
function dueBadge(c){
  if (c.bal <= 0.004) return '<em class="badge paid">Clear</em>';
  const l = custDueLeft(c);
  if (l !== null && l < 0) return `<em class="badge out">${-l}d overdue</em>`;
  if (l !== null && l <= num(settings.remindBefore)) return `<em class="badge low">due ${l === 0 ? 'aaj' : l + 'd'}</em>`;
  return '<em class="badge due">Baaki</em>';
}

/* ---------- khata list ---------- */
function renderKhata(){
  const q = $('#kSearch').value.trim().toLowerCase(), qd = digits(q);
  $$('#kChips .chip').forEach(c => c.classList.toggle('on', c.dataset.kf === khataFilter));
  let list = customers();
  const owed = sum(list, c => c.bal), people = list.filter(c => c.bal > 0.004).length;
  $('#kSummary').innerHTML = `<div><small>Total baaki (interest mila kar)</small><b>${money(owed)}</b></div><div style="text-align:right"><small>Customers jinka baaki hai</small><b>${people}</b></div>`;
  if (khataFilter === 'due') list = list.filter(c => c.bal > 0.004);
  if (khataFilter === 'clear') list = list.filter(c => c.bal <= 0.004);
  if (q) list = list.filter(c => c.name.toLowerCase().includes(q) || (qd.length >= 2 && digits(c.phone).includes(qd)));
  list.sort((a, b) => (b.bal > 0.004) - (a.bal > 0.004) || new Date(b.last) - new Date(a.last));
  $('#kList').innerHTML = list.length ? list.map(c => `<button class="item" data-ck="${esc(c.ck)}"><span class="avatar">${esc(initial(c.name))}</span>
    <span class="l"><b>${esc(c.name)}</b><small>${c.phone ? esc(c.phone) + ' · ' : ''}${c.recs.length} purchase${c.orders.some(o => o.status === 'open') ? ' · order open' : ''}</small></span>
    <span class="r">${c.bal > 0.004 ? `<span class="red">${money0(c.bal)}</span>` : money0(c.total)}${dueBadge(c)}</span></button>`).join('')
    : `<div class="empty">${q ? 'Koi customer nahi mila.' : 'Abhi koi customer record nahi hai. “+” se pehli sale banao.'}</div>`;
}
const openCust = ck => { currentCk = ck; show('custDetail'); };

/* ---------- customer detail ---------- */
function recSummary(r){
  const n = r.items.map(i => (lineTag(i) ? lineTag(i) + ' ' : '') + i.name);
  return n.slice(0, 2).join(', ') + (n.length > 2 ? ` +${n.length - 2}` : '');
}
function timelineHTML(events){
  if (!events.length) return '<div class="empty">Abhi koi entry nahi.</div>';
  return `<div class="tl-wrap">${events.map(e => `<div class="tl ${e.k}"><span class="tl-dot"></span><div class="tl-b"><div class="tl-t">${e.t}</div><small>${esc(fmtDate(e.d))}${e.s ? ' · ' + e.s : ''}</small></div><b class="tl-a">${e.k === 'buy' ? '+' : '−'}${money(e.a)}</b></div>`).join('')}</div>`;
}
function custEvents(c){
  const ev = [];
  c.recs.forEach(r => ev.push({k: 'buy', d: r.date, a: r.total, t: `Purchase #${String(r.receiptNo).padStart(4, '0')} — ${esc(recSummary(r))}`, s: ''}));
  const groups = new Map();
  c.recs.forEach(r => r.payments.forEach(p => {
    const g = groups.get(p.gid) || {k: 'pay', d: p.date, a: 0, parts: [], notes: new Set()}; groups.set(p.gid, g);
    g.a += p.amount; g.parts.push('#' + String(r.receiptNo).padStart(4, '0') + ' ' + money0(p.amount)); if (p.note) g.notes.add(p.note); if (p.mode) g.notes.add(p.mode);
  }));
  groups.forEach(g => ev.push({k: 'pay', d: g.d, a: r2(g.a), t: 'Payment mila', s: esc([...g.notes].join(' · ') + (g.parts.length > 1 || g.notes.size ? (g.notes.size ? ' · ' : '') + 'bills: ' + g.parts.join(', ') : ''))}));
  c.orders.filter(o => o.status === 'open').forEach(o => o.advances.forEach(a => ev.push({k: 'adv', d: a.date, a: a.amount, t: `Advance — Order ${oNo(o)} (${esc(o.desc)})`, s: esc(a.note || '')})));
  return ev.sort((a, b) => new Date(b.d) - new Date(a.d));
}
function renderCustDetail(){
  const c = customerOf(currentCk); if (!c){ show('khata'); return; }
  const open = c.orders.filter(o => o.status === 'open');
  const left = custDueLeft(c);
  $('#cdBody').innerHTML = `
    <div class="chead"><span class="avatar big">${esc(initial(c.name))}</span><div><h3 style="margin:0">${esc(c.name)}</h3><div class="muted">${c.phone ? esc(c.phone) : 'Phone nahi'} · ${c.recs.length} purchase</div></div></div>
    <div class="cgrid">
      <div><small>Total purchase</small><b>${money0(c.total)}</b></div>
      <div><small>Total paid</small><b class="green">${money0(c.paid)}</b></div>
      <div><small>Interest (aaj tak)</small><b>${money0(c.i)}</b></div>
      <div class="${c.bal > 0.004 ? 'dueb' : 'okb'}"><small>Balance baaki</small><b>${money0(c.bal)}</b></div>
    </div>
    ${c.bal > 0.004 && left !== null ? `<p class="hint ${left < 0 ? 'bad' : left <= num(settings.remindBefore) ? 'warn' : ''}">${left < 0 ? 'Sabse purana baaki ' + (-left) + ' din se overdue hai.' : 'Agli due date: ' + daysText(left) + '.'}</p>` : ''}`;
  $('#cdPay').hidden = c.bal <= 0.004; $('#cdRemind').hidden = c.bal <= 0.004 || !c.phone;
  $('#cdOrders').innerHTML = open.length ? `<h3>Open orders (advance)</h3>` + open.map(o => orderRow(o)).join('') : '';
  $('#cdRecs').innerHTML = c.recs.length ? c.recs.slice().reverse().map(r => { const d = recDue(r);
    return `<button class="item" data-rid="${r.id}"><span class="avatar">#</span><span class="l"><b>Bill #${String(r.receiptNo).padStart(4, '0')} · ${money0(r.total)}</b><small>${esc(fmtDay(r.date))} · ${esc(recSummary(r))}</small></span>
    <span class="r">${d.t > 0.004 ? `<span class="red">${money0(d.t)}</span><em class="badge due">Baaki</em>` : '<em class="badge paid">Paid</em>'}</span></button>`; }).join('') : '<div class="empty">Abhi koi purchase nahi.</div>';
  $('#cdTl').innerHTML = timelineHTML(custEvents(c));
}
function remindCustomer(){
  const c = customerOf(currentCk); if (!c || c.bal <= 0.004) return;
  const old = c.recs.filter(r => recDue(r).t > 0.004)[0];
  const text = `*${SHOP_NAME}*\n${settings.phone ? 'Ph: ' + settings.phone + '\n' : ''}\nNamaste ${c.name},\nAapke khate mein *${money(c.bal)}* baaki hai${c.i > 0.004 ? ` (principal ${money(c.p)} + interest ${money(c.i)})` : ''}.${old ? `\nSabse purana bill: #${String(old.receiptNo).padStart(4, '0')} (${fmtDay(old.date)}).` : ''}\nKripya jaldi jama kar dein. Dhanyavaad 🙏`;
  window.open(`https://wa.me/${waNumber(c.phone)}?text=${encodeURIComponent(text)}`, '_blank');
}

/* ---------- payments ---------- */
function payModal(title, dueAmt, interestNote, onSave){
  const now = nowLocalInput();
  openModal(title, `<p>Baaki: <b>${money(dueAmt)}</b>${interestNote ? `<br><span class="muted">${interestNote}</span>` : ''}</p>
    <label>Amount (₹)<input id="pyAmt" type="number" min="0" step="0.01" inputmode="decimal" value="${dueAmt}"></label>
    <label>Payment mode<select id="pyMode"><option>Cash</option><option>UPI</option><option>Card</option><option>Bank transfer</option></select></label>
    <label>Date &amp; time<input id="pyWhen" type="datetime-local" value="${now}" max="${now}"></label>
    <label>Note <span class="muted">(optional)</span><input id="pyNote" placeholder="e.g. 2nd instalment"></label>`, 'Save payment', () => {
    const a = r2(num($('#pyAmt').value));
    if (!(a > 0)){ toast('Amount likho'); return false; }
    if (a > dueAmt + 0.005){ toast('Amount baaki se zyada hai (' + money(dueAmt) + ')'); return false; }
    const when = $('#pyWhen').value, d = when ? new Date(when) : new Date();
    if (isNaN(d) || d.getTime() > Date.now() + 60000){ toast('Date/time future ka nahi ho sakta'); return false; }
    onSave(a, {date: d.toISOString(), mode: $('#pyMode').value, note: $('#pyNote').value.trim()});
    return true;
  });
}
function addPayment(r, amount, meta, gid){
  r.payments.push({id: uid(), gid: gid || uid(), date: meta.date, amount, note: meta.note, mode: meta.mode}); syncPaid(r);
}
function payRecord(){
  const r = records.find(x => x.id === currentId); if (!r) return;
  const d = recDue(r); if (d.t <= 0.004) return toast('Is bill ka koi baaki nahi hai');
  payModal(`Payment — Bill #${String(r.receiptNo).padStart(4, '0')}`, d.t, d.i > 0 ? `Principal ${money(d.p)} + interest ${money(d.i)}` : '', (a, meta) => {
    addPayment(r, a, meta); saveAll(); renderDetail(); renderWarn(); toast('Payment save hua ✓  Baaki: ' + money(recDue(r).t));
  });
}
function payCustomer(){
  const c = customerOf(currentCk); if (!c || c.bal <= 0.004) return;
  payModal(`Payment — ${c.name}`, c.bal, 'Sabse purane bill se adjust hoga' + (c.i > 0 ? ` · interest ${money(c.i)} shamil` : ''), (a, meta) => {
    let rem = a; const gid = uid();
    c.recs.slice().sort((x, y) => new Date(x.date) - new Date(y.date)).forEach(r => {
      if (rem <= 0.004) return; const d = recDue(r); if (d.t <= 0.004) return;
      const part = r2(Math.min(rem, d.t)); addPayment(r, part, meta, gid); rem = r2(rem - part);
    });
    saveAll(); renderCustDetail(); renderWarn(); sparkle(innerWidth / 2, innerHeight / 2); toast('Payment save hua ✓  Baaki: ' + money(customerOf(c.ck).bal));
  });
}
function deletePayment(rid, pid){
  const r = records.find(x => x.id === rid); const p = r && r.payments.find(x => x.id === pid); if (!p) return;
  askPassword(`${money(p.amount)} ki payment entry (${fmtDate(p.date)}) delete hogi aur balance badh jayega.`, () => {
    r.payments = r.payments.filter(x => x.id !== pid); syncPaid(r); saveAll(); renderDetail(); renderWarn(); toast('Payment entry delete ho gayi');
  });
}
function editInterest(){
  const r = records.find(x => x.id === currentId); if (!r) return;
  openModal('Due date & interest', `<label>Payment due (kitne din baad)<input id="eiDue" type="number" min="0" step="1" inputmode="numeric" value="${r.interest.dueDays}"></label>
    <label>Interest type<select id="eiType"><option value="none">Koi interest nahi</option><option value="simple">Simple (normal) interest</option><option value="compound">Compound interest (badhta rehta hai)</option></select></label>
    <label>Interest rate (% per month)<input id="eiRate" type="number" min="0" step="0.01" inputmode="decimal" value="${r.interest.rate || ''}"></label>
    <p class="muted">Interest due date ke baad se chalta hai. Payment pehle interest mein, phir principal mein jaati hai.</p>`, 'Save', () => {
    const type = $('#eiType').value, rate = num($('#eiRate').value);
    if (type !== 'none' && !(rate > 0)){ toast('Interest rate likho'); return false; }
    r.interest = {type, rate: type === 'none' ? 0 : rate, dueDays: Math.max(0, Math.floor(num($('#eiDue').value)))};
    saveAll(); renderDetail(); renderWarn(); toast('Saved'); return true;
  });
  $('#eiType').value = r.interest.type;
}

/* ---------- purchase (bill) detail ---------- */
function openDetail(id){ currentId = id; show('detail'); }
function renderDetail(){
  const r = records.find(x => x.id === currentId); if (!r){ show('khata'); return; }
  const d = recDue(r), it = r.interest, dueDay = addDaysStr(dateStr(new Date(r.date)), Math.max(0, Math.floor(num(it.dueDays))));
  const rows = r.items.map(i => `<tr><td>${lineTag(i) ? `<span class="pno ${i.cat}">${esc(lineTag(i))}</span> ` : ''}${esc(i.name)}${(i.catName || i.purity) ? ` <small class="muted">${esc([i.catName, i.purity].filter(Boolean).join(' · '))}</small>` : ''}</td><td class="n">${Number(i.weight).toFixed(3)}</td><td class="n">${i.rate !== '' ? money0(i.rate) : '—'}</td><td class="n">${money(i.amount)}</td></tr>`).join('');
  const pays = r.payments.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).map(p => `<div class="tl pay"><span class="tl-dot"></span><div class="tl-b"><div class="tl-t">${esc(p.note || 'Payment')}${p.mode ? ' · ' + esc(p.mode) : ''}</div><small>${esc(fmtDate(p.date))}</small></div><b class="tl-a">${money(p.amount)}</b><button class="x" data-delpay="${p.id}" aria-label="Delete payment">×</button></div>`).join('');
  $('#detailBody').innerHTML = `
    <div class="ptop"><div><b>Bill #${String(r.receiptNo).padStart(4, '0')}</b><small>${esc(fmtDate(r.date))}</small></div><em class="badge ${d.t > 0.004 ? 'due' : 'paid'}">${d.t > 0.004 ? 'Baaki' : 'Paid'}</em></div>
    <p style="margin:.6em 0"><button class="link" data-ck="${esc(ckOf(r.name, r.phone))}">${esc(r.name)}${r.phone ? ' · ' + esc(r.phone) : ''} ›</button></p>
    <table class="mini"><thead><tr><th>Item</th><th class="n">Wt (g)</th><th class="n">Rate</th><th class="n">Amount</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="sumrows">
      <div><span>Items subtotal</span><b>${money(r.subtotal)}</b></div>
      ${r.makingAmt ? `<div><span>Making charge ${r.makingMode === 'pct' ? '(' + r.makingVal + '%)' : ''}</span><b>${money(r.makingAmt)}</b></div>` : ''}
      ${r.gstAmt ? `<div><span>GST ${r.gstPct}% (CGST ${r2(r.gstPct / 2)}% + SGST ${r2(r.gstPct / 2)}%)</span><b>${money(r.gstAmt)}</b></div>` : ''}
      <div class="tot"><span>Bill total</span><b>${money(r.total)}</b></div>
      <div><span>Paid</span><b class="green">${money(r.paid)}</b></div>
      ${d.i > 0.004 ? `<div><span>Principal baaki</span><b>${money(d.p)}</b></div><div><span>Interest (${INT_LABEL[it.type]} ${it.rate}%/mahina)</span><b>${money(d.i)}</b></div>` : ''}
      <div class="tot ${d.t > 0.004 ? 'due' : 'ok'}"><span>${d.t > 0.004 ? 'Total baaki' : 'Fully paid ✓'}</span><b>${money(d.t)}</b></div>
    </div>
    <p class="muted">Payment due: ${fmtD(dueDay)}${it.type !== 'none' ? ' · ' + INT_LABEL[it.type] + ' ' + it.rate + '% / mahina' : ''}</p>
    <h3>Payment history</h3>${pays || '<div class="empty">Abhi koi payment nahi.</div>'}`;
  $('#detailPay').hidden = d.t <= 0.004;
}
function deleteRecord(){
  const r = records.find(x => x.id === currentId); if (!r) return;
  askPassword(`Bill #${String(r.receiptNo).padStart(4, '0')} (${r.name}, ${money(r.total)}) aur uski saari payment entries delete hongi.`, () => {
    const linked = r.items.map(i => items.find(x => x.id === i.itemId && x.recId === r.id)).filter(Boolean);
    if (linked.length && confirm(`${linked.length} item(s) wapas stock mein daal dein? (OK = haan, Cancel = nahi)`)) linked.forEach(restoreItem);
    else linked.forEach(it => { /* stays marked sold, but its bill is gone */ it.recId = null; });
    const ck = ckOf(r.name, r.phone);
    orders.forEach(o => { if (o.recId === r.id){ o.status = 'open'; o.recId = null; } });
    records = records.filter(x => x.id !== r.id); saveAll(); currentId = null; renderWarn(); toast('Record delete ho gaya');
    show(customerOf(ck) && customerOf(ck).recs.length ? (currentCk = ck, 'custDetail') : 'khata');
  });
}

/* ---------- advance orders (order booked, purchase later) ---------- */
const oNo = o => 'O-' + String(o.no).padStart(4, '0');
const orderAdv = o => r2(sum(o.advances, a => a.amount));
const orderBal = o => r2(o.estimate - orderAdv(o));
function orderState(o){
  if (o.status !== 'open') return {k: 'done', left: null};
  if (!o.dueDate) return {k: 'none', left: null};
  const left = dn(o.dueDate) - dn(todayStr());
  return {k: left < 0 ? 'over' : left <= num(settings.remindBefore) ? 'soon' : 'ok', left};
}
const orderAlerts = () => orders.filter(o => { const k = orderState(o).k; return k === 'over' || k === 'soon'; })
  .sort((a, b) => dn(a.dueDate) - dn(b.dueDate));
function orderBadge(o){
  if (o.status === 'delivered') return '<em class="badge paid">Delivered</em>';
  if (o.status === 'cancelled') return '<em class="badge out">Cancelled</em>';
  const s = orderState(o);
  if (s.k === 'over') return `<em class="badge out">${-s.left}d late</em>`;
  if (s.k === 'soon') return `<em class="badge low">delivery ${s.left === 0 ? 'aaj' : s.left + 'd'}</em>`;
  return '<em class="badge ok">Open</em>';
}
function orderRow(o){
  return `<button class="item" data-oid="${o.id}"><span class="avatar">O</span>
    <span class="l"><b>${oNo(o)} · ${esc(o.desc)}</b><small>${esc(o.name)}${o.dueDate ? ' · delivery ' + fmtD(o.dueDate) : ''}</small></span>
    <span class="r">${money0(orderAdv(o))} <small class="muted">/ ${money0(o.estimate)}</small>${orderBadge(o)}</span></button>`;
}
function renderOrders(){
  const q = $('#oSearch').value.trim().toLowerCase();
  $$('#oChips .chip').forEach(c => c.classList.toggle('on', c.dataset.of === orderFilter));
  const openList = orders.filter(o => o.status === 'open');
  $('#oSummary').innerHTML = `<div><small>Open orders</small><b>${openList.length}</b></div><div style="text-align:right"><small>Advance jama (open orders)</small><b>${money0(sum(openList, orderAdv))}</b></div>`;
  let list = orders.filter(o => orderFilter === 'all' || o.status === orderFilter);
  if (q) list = list.filter(o => (o.name + ' ' + o.phone + ' ' + o.desc + ' ' + oNo(o)).toLowerCase().includes(q));
  list.sort((a, b) => (o => o.status === 'open' ? 0 : 1)(a) - (o => o.status === 'open' ? 0 : 1)(b) || new Date(b.date) - new Date(a.date));
  $('#oList').innerHTML = list.length ? list.map(orderRow).join('') : '<div class="empty">Koi order nahi. “+ New Order” se advance order banao.</div>';
}

let oPhotos = [];
function renderOPhotos(){
  $('#oPhotos').innerHTML = oPhotos.map((p, i) => `<div class="ph"><img src="${p.data}" alt="Photo ${i + 1}"><button type="button" class="x" data-rm="${i}" aria-label="Remove photo">×</button></div>`).join('')
    + (oPhotos.length < 3 ? PHOTO_TILES('oAddCam', 'oAddPhoto') : '');
}
async function addOrderPhotos(files){
  for (const f of Array.from(files).slice(0, 3 - oPhotos.length)){
    try { oPhotos.push({id: uid(), data: await readPhoto(f)}); } catch(e){ toast('Photo nahi khul paayi'); }
  }
  renderOPhotos();
}
function renderOrderForm(){
  if (!renderOrderForm.init){ renderOrderForm.init = true; resetOrderForm(); }
  renderOPhotos();
  custSuggest($('#oName'), $('#oPhone'), $('#oSug'), $('#oNote'));
}
function resetOrderForm(){
  ['oName', 'oPhone', 'oAddr', 'oDesc', 'oEst', 'oAdv', 'oDue', 'oAdvNote'].forEach(id => $('#' + id).value = '');
  $('#oMode').value = 'Cash'; $('#oSug').innerHTML = ''; $('#oNote').textContent = ''; oPhotos = []; renderOPhotos();
}
async function saveOrder(ev){
  const name = $('#oName').value.trim(), phone = digits($('#oPhone').value), desc = $('#oDesc').value.trim();
  const est = r2(num($('#oEst').value)), adv = r2(num($('#oAdv').value));
  if (!name) return toast('Customer ka naam likho');
  if (phone && phone.length < 10) return toast('Phone number 10 digit ka hona chahiye');
  if (!desc) return toast('Order kya hai — item ka description likho');
  if (!(est > 0)) return toast('Order ka estimated amount likho');
  if (adv < 0 || adv > est) return toast('Advance, order amount se zyada nahi ho sakta');
  const now = new Date().toISOString();
  for (const ph of oPhotos) await pPut(ph.id, ph.data);
  const o = normalizeOrder({id: uid(), no: settings.nextOrder++, date: now, name, phone, address: $('#oAddr').value.trim(), photos: oPhotos.map(x => x.id), desc, estimate: est, dueDate: $('#oDue').value, status: 'open',
    advances: adv > 0 ? [{id: uid(), date: now, amount: adv, note: $('#oAdvNote').value.trim() || 'Advance', mode: $('#oMode').value}] : []});
  orders.push(o); saveAll(); resetOrderForm();
  if (ev && ev.clientX !== undefined) sparkle(ev.clientX, ev.clientY);
  toast('Order ' + oNo(o) + ' save hua ✓');
  currentOid = o.id; show('orderDetail');
}

function renderOrderDetail(){
  const o = orders.find(x => x.id === currentOid); if (!o){ show('orders'); return; }
  const open = o.status === 'open', adv = orderAdv(o), bal = orderBal(o), rec = o.recId && records.find(r => r.id === o.recId);
  const advRows = o.advances.slice().sort((a, b) => new Date(b.date) - new Date(a.date)).map(a => `<div class="tl adv"><span class="tl-dot"></span><div class="tl-b"><div class="tl-t">${esc(a.note || 'Advance')}${a.mode ? ' · ' + esc(a.mode) : ''}</div><small>${esc(fmtDate(a.date))}</small></div><b class="tl-a">${money(a.amount)}</b>${open ? `<button class="x" data-deladv="${a.id}" aria-label="Delete advance">×</button>` : ''}</div>`).join('');
  $('#odBody').innerHTML = `
    <div class="ptop"><div><b>Order ${oNo(o)}</b><small>${esc(fmtDate(o.date))}</small></div>${orderBadge(o)}</div>
    <p style="margin:.6em 0"><button class="link" data-ck="${esc(ckOf(o.name, o.phone))}">${esc(o.name)}${o.phone ? ' · ' + esc(o.phone) : ''} ›</button></p>
    <h3 style="margin:.2em 0">${esc(o.desc)}</h3>
    ${o.address ? `<p class="muted">Address: ${esc(o.address)}</p>` : ''}
    ${(o.photos || []).length ? `<div class="gphotos">${o.photos.map(id => `<span class="thumb" data-big="${esc(id)}"><img data-photo="${esc(id)}" alt="Order photo"></span>`).join('')}</div>` : ''}
    <div class="sumrows">
      <div><span>Order amount (estimate)</span><b>${money(o.estimate)}</b></div>
      <div><span>Advance mila</span><b class="green">${money(adv)}</b></div>
      <div class="tot ${bal > 0.004 ? 'due' : 'ok'}"><span>${bal > 0.004 ? 'Delivery par dena baaki' : 'Poora advance mil gaya ✓'}</span><b>${money(Math.max(0, bal))}</b></div>
    </div>
    ${o.dueDate ? `<p class="muted">Delivery date: <b>${fmtD(o.dueDate)}</b></p>` : ''}
    ${rec ? `<p class="muted">Purchase bill ban chuka hai: <button class="link" data-rid="${rec.id}">Bill #${String(rec.receiptNo).padStart(4, '0')} ›</button></p>` : ''}
    <h3>Advance payments</h3>${advRows || '<div class="empty">Koi advance nahi liya.</div>'}`;
  hydratePhotos($('#odBody'));
  $('#odAdd').hidden = !open || bal <= 0.004; $('#odEdit').hidden = !open; $('#odConvert').hidden = !open; $('#odCancel').hidden = !open;
}
function addAdvance(){
  const o = orders.find(x => x.id === currentOid); if (!o || o.status !== 'open') return;
  const bal = orderBal(o); if (bal <= 0.004) return toast('Poora advance pehle hi mil chuka hai');
  payModal(`Advance — ${oNo(o)}`, bal, `Order ${money(o.estimate)} · ab tak ${money(orderAdv(o))} mila`, (a, meta) => {
    o.advances.push({id: uid(), date: meta.date, amount: a, note: meta.note || 'Advance', mode: meta.mode});
    saveAll(); renderOrderDetail(); renderWarn(); toast('Advance save hua ✓  Total advance: ' + money(orderAdv(o)));
  });
}
function editOrder(){
  const o = orders.find(x => x.id === currentOid); if (!o || o.status !== 'open') return;
  openModal('Edit order ' + oNo(o), `<label>Order description<input id="eoDesc" value="${esc(o.desc)}"></label>
    <label>Estimated amount (₹)<input id="eoEst" type="number" min="0" step="0.01" inputmode="decimal" value="${o.estimate}"></label>
    <label>Delivery date<input id="eoDue" type="date" value="${esc(o.dueDate)}"></label>`, 'Save', () => {
    const desc = $('#eoDesc').value.trim(), est = r2(num($('#eoEst').value));
    if (!desc || !(est > 0)){ toast('Description aur amount likho'); return false; }
    if (est < orderAdv(o) - 0.004){ toast('Amount mil chuke advance (' + money(orderAdv(o)) + ') se kam nahi ho sakta'); return false; }
    o.desc = desc; o.estimate = est; o.dueDate = $('#eoDue').value; saveAll(); renderOrderDetail(); renderWarn(); toast('Order updated'); return true;
  });
}
function deleteAdvance(aid){
  const o = orders.find(x => x.id === currentOid); const a = o && o.advances.find(x => x.id === aid); if (!a) return;
  askPassword(`${money(a.amount)} ki advance entry (${fmtDate(a.date)}) delete hogi.`, () => {
    o.advances = o.advances.filter(x => x.id !== aid); saveAll(); renderOrderDetail(); toast('Advance entry delete ho gayi');
  });
}
function convertOrder(){
  const o = orders.find(x => x.id === currentOid); if (!o || o.status !== 'open') return;
  draft = newDraft(); draft.name = o.name; draft.phone = o.phone; draft.orderId = o.id;
  const l = newLine('manual'); l.name = o.desc; l.amount = o.estimate; l.amtManual = true; draft.lines = [l];
  toast('Item ka product number daal sakte ho, ya aise hi rakho. Advance bill mein adjust hoga.', 4200);
  show('add');
}
function cancelOrder(){
  const o = orders.find(x => x.id === currentOid); if (!o || o.status !== 'open') return;
  const adv = orderAdv(o);
  askPassword(`Order ${oNo(o)} cancel hoga.${adv > 0 ? ' Customer ko ' + money(adv) + ' advance wapas dena ho to alag se de dena.' : ''}`, () => {
    o.status = 'cancelled'; o.cancelledAt = new Date().toISOString(); saveAll(); renderOrderDetail(); renderWarn(); toast('Order cancel ho gaya');
  });
}
function deleteOrder(){
  const o = orders.find(x => x.id === currentOid); if (!o) return;
  askPassword(`Order ${oNo(o)} (${o.desc}) record hamesha ke liye delete hoga.`, async () => {
    for (const id of o.photos || []) await pDel(id);
    orders = orders.filter(x => x.id !== o.id); saveAll(); currentOid = null; renderWarn(); toast('Order delete ho gaya'); show('orders');
  });
}

/* ---------- home ---------- */
function renderHome(){
  $('#heroDate').textContent = new Date().toLocaleDateString('en-IN', {weekday:'long', day:'numeric', month:'long', year:'numeric'});
  const today = new Date().toDateString(), cs = customers();
  countUp($('#stToday'), sum(records.filter(r => new Date(r.date).toDateString() === today), r => r.total), money0);
  countUp($('#stTotal'), sum(records, r => r.total), money0);
  countUp($('#stDue'), sum(cs, c => c.bal), money0);
  countUp($('#stCount'), cs.filter(c => c.recs.length).length, v => Math.round(v));
  countUp($('#stGold'), stockMetal('gold').length, v => Math.round(v));
  countUp($('#stSilver'), stockMetal('silver').length, v => Math.round(v));
  const open = orders.filter(o => o.status === 'open');
  countUp($('#stOrders'), open.length, v => Math.round(v));
  countUp($('#stAdv'), sum(open, orderAdv), money0);
  const lastOk = settings.lastBackup && (Date.now() - new Date(settings.lastBackup)) < 7 * 864e5;
  $('#backupNudge').hidden = !((records.length || items.length || girvi.length) && !lastOk);

  const ca = custAlerts().slice(0, 4), oa = orderAlerts().slice(0, 3);
  $('#homeRemWrap').hidden = !(ca.length || oa.length);
  $('#homeRem').innerHTML = ca.map(x => `<button class="item" data-ck="${esc(x.c.ck)}"><span class="avatar">${esc(initial(x.c.name))}</span><span class="l"><b>${esc(x.c.name)}</b><small>Udhaar ${money0(x.c.bal)}</small></span><span class="r"><em class="badge ${x.left < 0 ? 'out' : 'low'}">${x.left < 0 ? -x.left + 'd overdue' : 'due ' + (x.left === 0 ? 'aaj' : x.left + 'd')}</em></span></button>`).join('')
    + oa.map(orderRow).join('');

  const recent = cs.filter(c => c.recs.length).sort((a, b) => new Date(b.last) - new Date(a.last)).slice(0, 5);
  $('#recent').innerHTML = recent.length ? recent.map(c => `<button class="item" data-ck="${esc(c.ck)}"><span class="avatar">${esc(initial(c.name))}</span>
    <span class="l"><b>${esc(c.name)}</b><small>${c.recs.length} purchase · ${esc(fmtShort(c.last))}</small></span>
    <span class="r">${c.bal > 0.004 ? `<span class="red">${money0(c.bal)}</span><em class="badge due">Baaki</em>` : '<em class="badge paid">Clear</em>'}</span></button>`).join('')
    : '<p class="empty">Abhi koi customer nahi. “New Sale” se shuru karo.</p>';
  renderHomeGirvi();
}

/* ---------- receipts ---------- */
const RECEIPT_CSS = `
:root{--maroon:#6d1420;--gold:#c9a227}
.rc{position:relative;font-family:Georgia,'Times New Roman',serif;color:#2b1a14;background:#fffdf6;padding:22px 22px 18px;border:2px solid #c9a227;outline:1px solid #6d1420;outline-offset:-8px;max-width:520px;margin:0 auto;box-shadow:0 8px 24px rgba(60,20,10,.18)}
.rc-logo{display:block;width:84px;height:84px;border-radius:50%;border:2px solid #c9a227;margin:0 auto 8px;background:#000}
.rc-name{text-align:center;font-size:24px;line-height:1.15;color:#6d1420;font-weight:700;letter-spacing:.5px}
.rc-addr,.rc-phone{text-align:center;font-size:12.5px;color:#5a4a3c;margin-top:2px}
.rc-orn{display:block;margin:8px auto;width:70%;height:12px;fill:none;stroke:#c9a227}
.rc-title{text-align:center;font-size:12px;letter-spacing:5px;color:#fff;background:#6d1420;padding:5px 0;margin:4px 0 12px}
.rc-meta{display:flex;justify-content:space-between;gap:8px;font-size:12px;color:#5a4a3c;margin-bottom:8px}
.rc-meta b{display:block;font-size:14px;color:#2b1a14}
.rc-cust{border:1px dashed #c9a227;padding:8px 10px;margin-bottom:10px;font-size:12px;color:#5a4a3c;display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}
.rc-cust b{display:block;font-size:15px;color:#2b1a14}
.rc-items{width:100%;border-collapse:collapse;font-size:12.5px}
.rc-items th{background:#f6ecc9;color:#6d1420;text-align:left;padding:6px 4px;border-bottom:1.5px solid #c9a227}
.rc-items td{padding:7px 4px;border-bottom:1px dotted #c8b98a;vertical-align:top}
.rc-items .n{text-align:right;white-space:nowrap}
.rc-bottom{display:flex;gap:10px;align-items:flex-start;margin-top:10px}
.rc-stampwrap{flex:1;min-width:0;padding-top:14px;text-align:center}
.rc-stamp{display:inline-block;transform:rotate(-10deg);border:3px double;padding:4px 10px;font-size:16px;font-weight:700;letter-spacing:1.5px;opacity:.8}
.rc-stamp.paid{color:#1f7a3d}.rc-stamp.due{color:#b3261e}
.rc-totals{flex:none;width:58%;min-width:0;font-size:14px}
.rc-totals div{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px dotted #c8b98a}
.rc-totals .bal{background:#6d1420;color:#f3d77a;padding:8px;margin-top:6px;font-size:16px;font-weight:700;border:0}
.rc-totals .bal.zero{background:#1f6b3a;color:#fff}
.rc-pay{font-size:11.5px;color:#5a4a3c;margin-top:10px}
.rc-sign{display:flex;justify-content:space-between;margin-top:34px;font-size:11.5px;color:#5a4a3c}
.rc-sign span{border-top:1px solid #6d1420;padding-top:4px;min-width:110px;text-align:center}
.rc-photos{display:flex;gap:6px;justify-content:center;margin:0 0 10px}.rc-photos img{width:31%;max-width:150px;aspect-ratio:1;object-fit:cover;border:1px solid #c9a227}
.rc-kv td:first-child{color:#5a4a3c;width:40%}.rc-kv td:last-child{text-align:right;font-weight:600}
.rc-foot{text-align:center;margin-top:14px;font-size:12.5px;color:#6d1420;font-style:italic}
.rc-gst{color:#5a4a3c;font-size:13px}
.rc-no{display:inline-block;font-size:10.5px;font-weight:700;color:#6d1420;border:1px solid #c9a227;border-radius:4px;padding:0 4px;margin-right:4px;white-space:nowrap}
.rc-gstin{text-align:center;font-size:12px;color:#5a4a3c;margin-top:2px;letter-spacing:.4px}
.rc-hist{width:100%;border-collapse:collapse;font-size:11.5px;margin-top:10px}
.rc-hist th{background:#f6ecc9;color:#6d1420;text-align:left;padding:5px 4px;border-bottom:1.5px solid #c9a227}
.rc-hist td{padding:5px 4px;border-bottom:1px dotted #c8b98a;vertical-align:top}
.rc-hist .n{text-align:right;white-space:nowrap}
.rc-h{font-size:12px;letter-spacing:2px;color:#6d1420;margin:12px 0 2px;font-weight:700}
.rc-note{font-size:11.5px;color:#5a4a3c;margin-top:10px;border:1px dashed #c9a227;padding:6px 8px}
.rc-totals .sub{border-bottom:1px dotted #c8b98a;font-size:13px;color:#5a4a3c}
`;

const rcHead = (title, meta) => `
    <img class="rc-logo" src="icon-192.png" alt="">
    <div class="rc-name">${SHOP_NAME}</div>
    <div class="rc-addr">${esc(SHOP_ADDR)}</div>
    ${settings.phone.trim() ? `<div class="rc-phone">Phone: ${esc(settings.phone.trim())}</div>` : ''}
    ${settings.gstin.trim() ? `<div class="rc-gstin">GSTIN: ${esc(settings.gstin.trim())}</div>` : ''}
    <svg class="rc-orn" viewBox="0 0 200 12"><path d="M0 6h82M118 6h82" stroke-width="1"/><path d="M100 1l5 5-5 5-5-5z" fill="#c9a227" stroke="none"/><circle cx="88" cy="6" r="2"/><circle cx="112" cy="6" r="2"/></svg>
    <div class="rc-title">${title}</div>${meta}`;

function receiptInner(r){
  const d = recDue(r), base = r2(r.total - r.paid), shop = customerOf(ckOf(r.name, r.phone));
  const rows = r.items.map(i => `<tr><td>${lineTag(i) ? `<span class="rc-no">${esc(lineTag(i))}</span>` : ''}${esc(i.name)}${(i.catName || i.purity) ? `<div class="rc-gst">${esc([i.catName, i.purity].filter(Boolean).join(' · '))}</div>` : ''}</td><td class="n">${Number(i.weight).toFixed(3)}</td><td class="n">${i.rate !== '' ? money0(i.rate) : '—'}</td><td class="n">${money(i.amount)}</td></tr>`).join('');
  const pays = r.payments.length ? `<div class="rc-h">PAYMENT HISTORY</div><table class="rc-hist"><tbody>${r.payments.slice().sort((a, b) => new Date(a.date) - new Date(b.date)).map(p => `<tr><td>${esc(fmtDate(p.date))}</td><td>${esc((p.note || '') + (p.mode ? ' · ' + p.mode : ''))}</td><td class="n">${money(p.amount)}</td></tr>`).join('')}</tbody></table>` : '';
  const other = shop ? r2(shop.bal - d.t) : 0;
  const half = r2(r.gstPct / 2);
  return `<div class="rc">${rcHead('RECEIPT', `
    <div class="rc-meta"><div>Receipt No.<b>#${String(r.receiptNo).padStart(4, '0')}</b></div><div style="text-align:right">Date &amp; time<b>${esc(fmtDate(r.date))}</b></div></div>
    <div class="rc-cust"><div>Customer<b>${esc(r.name)}</b></div>${r.phone ? `<div style="text-align:right">Phone<b>${esc(r.phone)}</b></div>` : ''}</div>`)}
    <table class="rc-items"><thead><tr><th>Item</th><th class="n">Wt (g)</th><th class="n">Rate/g</th><th class="n">Amount</th></tr></thead><tbody>${rows}</tbody></table>
    <div class="rc-bottom">
      <div class="rc-stampwrap"><span class="rc-stamp ${d.t > 0.004 ? 'due' : 'paid'}">${d.t > 0.004 ? 'BALANCE DUE' : 'PAID'}</span></div>
      <div class="rc-totals">
        <div class="sub"><span>Items subtotal</span><span>${money(r.subtotal)}</span></div>
        ${r.makingAmt ? `<div class="sub"><span>Making charge${r.makingMode === 'pct' ? ' (' + r.makingVal + '%)' : ''}</span><span>${money(r.makingAmt)}</span></div>` : ''}
        ${r.gstAmt ? `<div class="sub"><span>CGST ${half}%</span><span>${money(r.gstAmt / 2)}</span></div><div class="sub"><span>SGST ${half}%</span><span>${money(r.gstAmt - r2(r.gstAmt / 2))}</span></div>` : ''}
        <div><span>Total</span><b>${money(r.total)}</b></div>
        <div><span>Paid</span><b>${money(r.paid)}</b></div>
        ${d.i > 0.004 ? `<div class="sub"><span>Principal baaki</span><span>${money(d.p)}</span></div><div class="sub"><span>Interest (${r.interest.rate}%/mo)</span><span>${money(d.i)}</span></div>` : ''}
        <div class="bal ${d.t > 0.004 ? '' : 'zero'}"><span>${d.i > 0.004 ? 'Total due' : 'Balance'}</span><b>${money(d.t)}</b></div>
      </div>
    </div>
    ${pays}
    ${other > 0.004 ? `<div class="rc-note">Is bill ke alawa aapke khate mein <b>${money(other)}</b> aur baaki hai. Kul baaki: <b>${money(shop.bal)}</b>.</div>` : ''}
    ${d.t > 0.004 ? `<div class="rc-note">Payment due: ${fmtD(addDaysStr(dateStr(new Date(r.date)), Math.max(0, Math.floor(num(r.interest.dueDays)))))}${r.interest.type !== 'none' ? ' · ' + INT_LABEL[r.interest.type] + ' ' + r.interest.rate + '% per month due date ke baad' : ''}</div>` : ''}
    <div class="rc-sign"><span>Customer</span><span>Authorised signature</span></div>
    <div class="rc-foot">Thank you! Visit again.</div>
  </div>`;
}
function orderSlipInner(o){
  const adv = orderAdv(o), bal = orderBal(o);
  const rows = o.advances.slice().sort((a, b) => new Date(a.date) - new Date(b.date)).map(a => `<tr><td>${esc(fmtDate(a.date))}</td><td>${esc((a.note || '') + (a.mode ? ' · ' + a.mode : ''))}</td><td class="n">${money(a.amount)}</td></tr>`).join('');
  return `<div class="rc">${rcHead('ADVANCE / ORDER RECEIPT', `
    <div class="rc-meta"><div>Order No.<b>${oNo(o)}</b></div><div style="text-align:right">Date &amp; time<b>${esc(fmtDate(o.date))}</b></div></div>
    <div class="rc-cust"><div>Customer<b>${esc(o.name)}</b></div>${o.phone ? `<div style="text-align:right">Phone<b>${esc(o.phone)}</b></div>` : ''}</div>`)}
    <table class="rc-items rc-kv"><tbody><tr><td>Order</td><td>${esc(o.desc)}</td></tr>${o.dueDate ? `<tr><td>Delivery date</td><td>${fmtD(o.dueDate)}</td></tr>` : ''}<tr><td>Status</td><td>${o.status === 'open' ? 'Order booked' : o.status === 'delivered' ? 'Delivered' : 'Cancelled'}</td></tr></tbody></table>
    ${rows ? `<div class="rc-h">ADVANCE PAYMENTS</div><table class="rc-hist"><tbody>${rows}</tbody></table>` : ''}
    <div class="rc-bottom"><div class="rc-stampwrap"><span class="rc-stamp ${bal > 0.004 ? 'due' : 'paid'}">ORDER BOOKED</span></div>
      <div class="rc-totals"><div><span>Order amount</span><b>${money(o.estimate)}</b></div><div><span>Advance paid</span><b>${money(adv)}</b></div>
      <div class="bal ${bal > 0.004 ? '' : 'zero'}"><span>Balance on delivery</span><b>${money(Math.max(0, bal))}</b></div></div></div>
    <div class="rc-note">Ye sirf order ki advance receipt hai, purchase bill nahi. Final bill banne par advance adjust hoga.</div>
    <div class="rc-sign"><span>Customer</span><span>Authorised signature</span></div>
    <div class="rc-foot">Thank you! Visit again.</div></div>`;
}
function statementInner(c){
  const bills = c.recs.map(r => { const d = recDue(r); return `<tr><td>#${String(r.receiptNo).padStart(4, '0')}<br><span class="rc-gst">${esc(fmtShort(r.date))}</span></td><td class="n">${money(r.total)}</td><td class="n">${money(r.paid)}</td><td class="n">${money(d.t)}</td></tr>`; }).join('');
  const pays = custEvents(c).filter(e => e.k === 'pay').reverse().map(e => `<tr><td>${esc(fmtDate(e.d))}</td><td class="n">${money(e.a)}</td></tr>`).join('');
  return `<div class="rc">${rcHead('ACCOUNT STATEMENT', `
    <div class="rc-meta"><div>As on<b>${esc(fmtDay(new Date().toISOString()))}</b></div><div style="text-align:right">Purchases<b>${c.recs.length}</b></div></div>
    <div class="rc-cust"><div>Customer<b>${esc(c.name)}</b></div>${c.phone ? `<div style="text-align:right">Phone<b>${esc(c.phone)}</b></div>` : ''}</div>`)}
    <table class="rc-hist"><thead><tr><th>Bill</th><th class="n">Total</th><th class="n">Paid</th><th class="n">Baaki</th></tr></thead><tbody>${bills}</tbody></table>
    ${pays ? `<div class="rc-h">PAYMENTS RECEIVED</div><table class="rc-hist"><tbody>${pays}</tbody></table>` : ''}
    <div class="rc-bottom"><div class="rc-stampwrap"><span class="rc-stamp ${c.bal > 0.004 ? 'due' : 'paid'}">${c.bal > 0.004 ? 'BALANCE DUE' : 'CLEAR'}</span></div>
      <div class="rc-totals"><div><span>Total purchase</span><b>${money(c.total)}</b></div><div><span>Total paid</span><b>${money(c.paid)}</b></div>
      ${c.i > 0.004 ? `<div class="sub"><span>Interest</span><span>${money(c.i)}</span></div>` : ''}
      <div class="bal ${c.bal > 0.004 ? '' : 'zero'}"><span>Balance</span><b>${money(c.bal)}</b></div></div></div>
    <div class="rc-foot">Thank you! Visit again.</div></div>`;
}
function openReceipt(id, back){
  const r = records.find(x => x.id === id); if (!r) return;
  currentId = id; receiptReturn = back || 'detail'; receiptKind = 'sale';
  $('#receiptPaper').innerHTML = receiptInner(r); show('receipt');
}
function openOrderSlip(id, back){
  const o = orders.find(x => x.id === id); if (!o) return;
  currentOid = id; receiptReturn = back || 'orderDetail'; receiptKind = 'order';
  $('#receiptPaper').innerHTML = orderSlipInner(o); show('receipt');
}
function openStatement(ck, back){
  const c = customerOf(ck); if (!c) return;
  currentCk = ck; receiptReturn = back || 'custDetail'; receiptKind = 'stmt';
  $('#receiptPaper').innerHTML = statementInner(c); show('receipt');
}
function downloadFile(name, text, type){
  const blob = new Blob([text], {type});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function downloadReceipt(){
  if (receiptKind === 'girvi') return downloadGirviSlip();
  let inner, title, file;
  if (receiptKind === 'order'){ const o = orders.find(x => x.id === currentOid); if (!o) return; inner = orderSlipInner(o); title = 'Order ' + oNo(o); file = `order-${oNo(o)}-${o.name.replace(/[^\w]+/g, '_')}.html`; }
  else if (receiptKind === 'stmt'){ const c = customerOf(currentCk); if (!c) return; inner = statementInner(c); title = 'Statement ' + c.name; file = `statement-${c.name.replace(/[^\w]+/g, '_')}.html`; }
  else { const r = records.find(x => x.id === currentId); if (!r) return; inner = receiptInner(r); title = 'Receipt ' + r.receiptNo; file = `receipt-${r.receiptNo}-${r.name.replace(/[^\w]+/g, '_')}.html`; }
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>body{margin:14px;background:#fff}${RECEIPT_CSS}</style></head><body>${inner.replace('src="icon-192.png"', 'src="' + await logoData() + '"')}</body></html>`;
  downloadFile(file, html, 'text/html');
}
function whatsappReceipt(){
  if (receiptKind === 'girvi') return whatsappGirvi();
  const head = `*${SHOP_NAME}*\n${SHOP_ADDR}${settings.phone ? '\nPh: ' + settings.phone : ''}${settings.gstin ? '\nGSTIN: ' + settings.gstin : ''}\n\n`;
  let text, phone;
  if (receiptKind === 'order'){
    const o = orders.find(x => x.id === currentOid); if (!o) return; phone = o.phone;
    text = `${head}*Advance / Order Receipt ${oNo(o)}* · ${fmtDate(o.date)}\nCustomer: ${o.name}\nOrder: ${o.desc}\n\nOrder amount: ${money(o.estimate)}\nAdvance paid: ${money(orderAdv(o))}\n*Balance on delivery: ${money(Math.max(0, orderBal(o)))}*${o.dueDate ? '\nDelivery: ' + fmtD(o.dueDate) : ''}\n\nThank you! Visit again.`;
  } else if (receiptKind === 'stmt'){
    const c = customerOf(currentCk); if (!c) return; phone = c.phone;
    text = `${head}*Account statement* — ${c.name}\nTotal purchase: ${money(c.total)}\nTotal paid: ${money(c.paid)}${c.i > 0.004 ? '\nInterest: ' + money(c.i) : ''}\n*Balance: ${money(c.bal)}*\n\nThank you! Visit again.`;
  } else {
    const r = records.find(x => x.id === currentId); if (!r) return; phone = r.phone; const d = recDue(r);
    const lns = r.items.map(i => `• ${lineTag(i) ? lineTag(i) + ' ' : ''}${i.name}${i.catName ? ' [' + i.catName + ']' : ''} (${Number(i.weight).toFixed(3)} g) — ${money(i.amount)}`).join('\n');
    text = `${head}Receipt #${String(r.receiptNo).padStart(4, '0')} · ${fmtDate(r.date)}\nCustomer: ${r.name}\n\n${lns}\n\nSubtotal: ${money(r.subtotal)}${r.makingAmt ? '\nMaking: ' + money(r.makingAmt) : ''}${r.gstAmt ? '\nGST ' + r.gstPct + '%: ' + money(r.gstAmt) : ''}\nTotal: ${money(r.total)}\nPaid: ${money(r.paid)}${d.i > 0.004 ? '\nInterest: ' + money(d.i) : ''}\n*Balance: ${money(d.t)}*\n\nThank you! Visit again.`;
  }
  window.open(`https://wa.me/${waNumber(phone)}?text=${encodeURIComponent(text)}`, '_blank');
}

/* ---------- admin ---------- */
function renderAdmin(){
  renderCatList();
  $('#sPhone').value = settings.phone; $('#sGstin').value = settings.gstin;
  $('#bGst').value = settings.gstDefault; $('#bMaking').value = settings.makingDefault || ''; $('#bGold').value = settings.rateGold; $('#bSilver').value = settings.rateSilver;
  $('#kType').value = settings.ledgerType; $('#kRate').value = settings.ledgerRate; $('#kDue').value = settings.ledgerDue; $('#kRemind').value = settings.remindBefore;
  $('#dRate').value = settings.defRate; $('#dMonths').value = settings.defMonths; $('#dWarn').value = settings.defWarn;
  $('#lastBackup').textContent = settings.lastBackup ? 'Last backup: ' + fmtDate(settings.lastBackup) : 'Abhi tak backup nahi liya.';
}
function savePhone(){ settings.phone = $('#sPhone').value.trim(); settings.gstin = $('#sGstin').value.trim().toUpperCase(); saveAll(); toast('Shop details saved'); }
function saveBilling(){
  settings.gstDefault = Math.max(0, num($('#bGst').value)); settings.makingDefault = Math.max(0, num($('#bMaking').value));
  settings.rateGold = $('#bGold').value === '' ? '' : num($('#bGold').value); settings.rateSilver = $('#bSilver').value === '' ? '' : num($('#bSilver').value);
  saveAll(); const pristine = !draft.lines.some(l => l.itemId || l.name || num(l.amount)) && !draft.name;
  if (pristine) resetSale(); toast('Billing defaults saved');
}
function saveKhata(){
  settings.ledgerType = $('#kType').value; settings.ledgerRate = Math.max(0, num($('#kRate').value));
  settings.ledgerDue = Math.max(0, Math.floor(num($('#kDue').value))); settings.remindBefore = Math.max(0, Math.floor(num($('#kRemind').value)));
  saveAll(); renderWarn(); toast('Khata defaults saved (sirf nayi sales par lagenge)');
}
function saveDefaults(){
  settings.defRate = $('#dRate').value === '' ? '' : num($('#dRate').value);
  settings.defMonths = Math.max(1, Math.floor(num($('#dMonths').value)) || 12);
  settings.defWarn = Math.max(0, Math.floor(num($('#dWarn').value)));
  saveAll(); resetGirviFormIfPristine(); toast('Defaults saved');
}
function resetGirviFormIfPristine(){ if (!$('#gName').value && !$('#gItem').value && !gPhotos.length) resetGirviForm(); }

/* ---------- encrypted backup (AES-256-GCM, key from backup password via PBKDF2) ---------- */
async function deriveBackupKey(passphrase, salt){
  if (!window.crypto || !crypto.subtle) throw new Error('SECURE_CONTEXT_REQUIRED');
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({name: 'PBKDF2', salt, iterations: 310000, hash: 'SHA-256'}, material, {name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
}
function bytesToB64(bytes){ let s = ''; for (let i = 0; i < bytes.length; i += 8192) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192)); return btoa(s); }
function b64ToBytes(s){ const raw = atob(s); const out = new Uint8Array(raw.length); for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i); return out; }
const BACKUP_SETTINGS = ['phone', 'gstin', 'nextReceipt', 'nextGirvi', 'nextOrder', 'defRate', 'defMonths', 'defWarn', 'gstDefault', 'makingDefault', 'rateGold', 'rateSilver', 'ledgerType', 'ledgerRate', 'ledgerDue', 'remindBefore'];
function backup(){
  if (!window.crypto || !crypto.subtle) return toast('Encrypted backup ke liye app ko HTTPS (GitHub Pages / installed app) se kholein.');
  openModal('Encrypted backup', `<p class="muted">Ye password app password se alag rakho. Bhool gaye to backup khul nahi sakta.</p>
    <label>Backup password (kam se kam 12 characters)<input id="bkPass" type="password" autocomplete="new-password"></label>
    <label>Backup password dobara<input id="bkPass2" type="password" autocomplete="new-password"></label>`, 'Download backup', () => {
    const p = $('#bkPass').value;
    if (p.length < 12){ toast('Backup password kam se kam 12 characters ka ho'); return false; }
    if (p !== $('#bkPass2').value){ toast('Dono password same nahi hain'); return false; }
    setTimeout(() => doBackup(p), 0); return true;
  });
}
async function doBackup(pass){
  try {
    settings.lastBackup = new Date().toISOString(); saveAll();
    const photos = {};
    for (const g of girvi.concat(orders)) for (const id of g.photos || []) { const d = await pGet(id); if (d) photos[id] = d; }
    const st = {}; BACKUP_SETTINGS.forEach(k => st[k] = settings[k]);
    const data = {app: 'shree-krishna-jewellers', version: 5, exported: settings.lastBackup, settings: st, items, cats, records, girvi, orders, photos};
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveBackupKey(pass, salt);
    const ct = await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, new TextEncoder().encode(JSON.stringify(data)));
    const env = {format: 'SKJ-ENCRYPTED-BACKUP', version: 1, cipher: 'AES-256-GCM', kdf: 'PBKDF2-SHA-256', iterations: 310000,
      salt: bytesToB64(salt), iv: bytesToB64(iv), ciphertext: bytesToB64(new Uint8Array(ct)), exported: settings.lastBackup};
    downloadFile(`shree-krishna-jewellers-backup-${settings.lastBackup.slice(0, 10)}.skjbackup`, JSON.stringify(env), 'application/octet-stream');
    renderAdmin(); toast('Encrypted backup download hua. Downloads folder check karo.');
  } catch(e){ console.error(e); toast('Backup nahi bana. Storage / browser permission check karo.'); }
}
function restoreStart(file){
  if (!file) return;
  askPassword('Restore karne se current data replace ho jayega.', () => restore(file));
  $('#restoreFile').value = '';
}
function restore(file){
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const raw = JSON.parse(reader.result);
      if (raw && raw.format === 'SKJ-ENCRYPTED-BACKUP'){
        if (raw.version !== 1 || raw.cipher !== 'AES-256-GCM' || raw.kdf !== 'PBKDF2-SHA-256' || raw.iterations !== 310000) throw new Error('unsupported');
        openModal('Backup password', `<label>Is backup ka password<input id="rsPass" type="password" autocomplete="off"></label>`, 'Open backup', () => {
          const p = $('#rsPass').value; if (!p){ toast('Password likho'); return false; }
          setTimeout(async () => {
            try {
              const key = await deriveBackupKey(p, b64ToBytes(raw.salt));
              const clear = await crypto.subtle.decrypt({name: 'AES-GCM', iv: b64ToBytes(raw.iv)}, key, b64ToBytes(raw.ciphertext));
              applyBackup(JSON.parse(new TextDecoder().decode(clear)));
            } catch(e){ console.error(e); toast('Restore fail: password galat ya file kharab hai.'); }
          }, 0); return true;
        });
      } else {
        if (!confirm('Ye purana unencrypted backup hai. Sirf apni trusted file ho tabhi restore karo. Continue?')) return;
        applyBackup(raw);
      }
    } catch(e){ console.error(e); toast('Ye valid backup file nahi hai.'); }
  };
  reader.readAsText(file);
}
async function applyBackup(d){
  try {
    if (!d || d.app !== 'shree-krishna-jewellers' || !Array.isArray(d.records)) throw new Error('bad');
    const recs = d.records.map(normalizeRecord), its = (Array.isArray(d.items) ? d.items : []).map(normalizeItem), cs = legacyCats(its, Array.isArray(d.cats) ? d.cats : []), gv = Array.isArray(d.girvi) ? d.girvi : [];
    let ords = Array.isArray(d.orders) ? d.orders : (Array.isArray(d.advanceOrders) ? d.advanceOrders.map((a, i) => ({id: a.id, no: i + 1, date: a.date, name: a.name, phone: a.phone,
      desc: a.item + (a.notes ? ' — ' + a.notes : ''), estimate: a.total, advances: a.paid > 0 ? [{date: a.date, amount: a.paid, note: 'Advance'}] : [], dueDate: a.due || '', status: 'open'})) : []);
    ords = ords.map(normalizeOrder);
    if (!confirm(`Restore: ${recs.length} records, ${its.length} stock items, ${gv.length} girvi, ${ords.length} orders. Current data replace ho jayega. Continue?`)) return;
    records = recs; items = its; cats = cs; girvi = gv; orders = ords;
    await pClear();
    for (const [id, data] of Object.entries(d.photos || {})) await pPut(id, data);
    if (d.settings) BACKUP_SETTINGS.forEach(k => { if (d.settings[k] !== undefined) settings[k] = d.settings[k]; });
    settings.nextReceipt = Math.max(num(settings.nextReceipt) || 1, ...recs.map(r => num(r.receiptNo) + 1));
    settings.nextGirvi = Math.max(num(settings.nextGirvi) || 1, ...gv.map(g => num(g.no) + 1), 1);
    settings.nextOrder = Math.max(num(settings.nextOrder) || 1, ...ords.map(o => num(o.no) + 1), 1);
    saveAll(); resetSale(); renderAdmin(); renderWarn(); toast('Backup restore ho gaya ✓');
  } catch(e){ console.error(e); toast('Restore fail: file ka format sahi nahi hai.'); }
}

function changePassword(){
  const o = $('#pwOld').value, n = $('#pwNew').value;
  if (o !== settings.password) return toast('Current password galat hai');
  if (n.length < 4) return toast('New password kam se kam 4 character ka ho');
  settings.password = n; saveAll(); $('#pwOld').value = ''; $('#pwNew').value = ''; toast('Password changed');
}
function wipe(what){
  const msg = {records: 'Saare customer records aur payments', orders: 'Saare advance orders', stock: 'Poora stock aur item history (categories rahengi)', girvi: 'Saare girvi records aur photos', all: 'Records, stock, orders aur girvi — SAB kuch'}[what];
  askPassword(`${msg} delete honge. Pehle backup le lo. Ye undo nahi hoga.`, async () => {
    if (what === 'records' || what === 'all') records = [];
    if (what === 'orders' && !(what === 'all')) for (const o of orders) for (const id of o.photos || []) await pDel(id);
    if (what === 'orders' || what === 'all') orders = [];
    if (what === 'stock' || what === 'all') items = [];
    if (what === 'all') cats = [];
    if (what === 'girvi' || what === 'all'){ girvi = []; await pClear(); }
    if (what === 'records') items.forEach(it => { if (it.status === 'sold'){ it.recId = null; } });
    saveAll(); resetSale(); renderWarn(); renderAdmin(); toast('Delete ho gaya');
  });
}

/* ---------- wire up ---------- */
document.addEventListener('click', e => {
  const t = e.target;
  const pick = t.closest('[data-pick]');
  if (pick){
    if (pick.closest('#custSug')){ pickCustomer(pick.dataset.pick, $('#fName'), $('#fPhone'), () => { draft.name = $('#fName').value; draft.phone = $('#fPhone').value; custSuggest($('#fName'), $('#fPhone'), $('#custSug'), $('#custNote')); }); }
    else pickCustomer(pick.dataset.pick, $('#oName'), $('#oPhone'), () => custSuggest($('#oName'), $('#oPhone'), $('#oSug'), $('#oNote')));
    return;
  }
  const ia = t.closest('[data-ia]');
  if (ia){
    const id = ia.dataset.id, it = items.find(x => x.id === id), a = ia.dataset.ia;
    if (a === 'edit'){ closeModal(); editItem(id); }
    else if (a === 'del'){ closeModal(); deleteItem(id); }
    else if (a === 'sell') sellItem(id);
    else if (a === 'addcat'){ addItem({catId: ia.dataset.cat}); }
    else if (a === 'addno'){ closeModal(); addItem({catId: ia.dataset.cat, no: ia.dataset.no}); }
    else if (a === 'cust' && it && it.buyer){ const ck = ckOf(it.buyer.name, it.buyer.phone); closeModal(); if (customerOf(ck)) openCust(ck); else toast('Customer record nahi mila'); }
    else if (a === 'bill' && it && it.recId){ closeModal(); openDetail(it.recId); }
    return;
  }
  const g = t.closest('[data-go]'); if (g){ show(g.dataset.go); return; }
  if (t.closest('[data-act="addItem"]')){ addItem(); return; }
  const sv = t.closest('[data-sv]'); if (sv){ stockView = sv.dataset.sv; stockCat = 'all'; $('#stockSearch').value = ''; renderStock(); return; }
  const sc = t.closest('[data-sc]'); if (sc){ stockCat = sc.dataset.sc; $('#stockSearch').value = ''; renderStock(); return; }
  const ce = t.closest('[data-cedit]'); if (ce){ categoryForm(catById(ce.dataset.cedit)); return; }
  const cd = t.closest('[data-cdel]'); if (cd){ deleteCategory(cd.dataset.cdel); return; }
  const hc = t.closest('[data-hc]'); if (hc){ histCat = hc.dataset.hc; histCatId = 'all'; renderStock(); return; }
  const dp = t.closest('[data-delpay]'); if (dp){ deletePayment(currentId, dp.dataset.delpay); return; }
  const da = t.closest('[data-deladv]'); if (da){ deleteAdvance(da.dataset.deladv); return; }
  const ck = t.closest('[data-ck]'); if (ck){ openCust(ck.dataset.ck); return; }
  const rid = t.closest('[data-rid]'); if (rid){ openDetail(rid.dataset.rid); return; }
  const oid = t.closest('[data-oid]'); if (oid){ currentOid = oid.dataset.oid; show('orderDetail'); return; }
  const iid = t.closest('[data-iid]'); if (iid){ openItem(iid.dataset.iid); return; }
  if (t.closest('#saleDropOrder')){ draft.orderId = null; renderSale(); }
});
document.addEventListener('pointerdown', e => {
  const t = e.target.closest('.btn, .item, .tile'); if (!t || reduced) return;
  const rect = t.getBoundingClientRect(), size = Math.max(rect.width, rect.height) * 2;
  const s = document.createElement('span'); s.className = 'ripple';
  s.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - rect.left - size / 2}px;top:${e.clientY - rect.top - size / 2}px`;
  t.appendChild(s); setTimeout(() => s.remove(), 650);
});
document.addEventListener('pointermove', e => {
  const c = e.target.closest('.shine'); if (!c) return;
  const r = c.getBoundingClientRect();
  c.style.setProperty('--mx', (e.clientX - r.left) + 'px'); c.style.setProperty('--my', (e.clientY - r.top) + 'px');
});

$('#loginBtn').onclick = login;
$('#pw').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });
$('#lockBtn').onclick = logout;
$('#rWarnBar').onclick = () => show(custAlerts().length ? 'khata' : 'orders');
$('#gWarnBar').onclick = () => show('girvi');

/* sale form */
const syncSaleFields = () => {
  draft.name = $('#fName').value; draft.phone = $('#fPhone').value;
  custSuggest($('#fName'), $('#fPhone'), $('#custSug'), $('#custNote'));
};
$('#fName').addEventListener('input', syncSaleFields);
$('#fPhone').addEventListener('input', syncSaleFields);
$('#lines').addEventListener('input', onLineInput);
$('#lines').addEventListener('click', onLineClick);
$('#addLine').onclick = () => { draft.lines.push(newLine()); renderLines(); updateTotals(); };
[['makingMode', 'makingMode'], ['makingVal', 'makingVal'], ['gstPct', 'gstPct'], ['fPaid', 'paid']].forEach(([id, k]) => {
  $('#' + id).addEventListener('input', e => { draft[k] = e.target.value; updateTotals(); });
  $('#' + id).addEventListener('change', e => { draft[k] = e.target.value; updateTotals(); });
});
$('#iType').addEventListener('change', e => { draft.interest.type = e.target.value; if (e.target.value !== 'none' && !num(draft.interest.rate)){ draft.interest.rate = 2; $('#iRate').value = 2; } updateTotals(); });
$('#iRate').addEventListener('input', e => { draft.interest.rate = e.target.value; });
$('#iDue').addEventListener('input', e => { draft.interest.dueDays = e.target.value; });
$$('[data-paid]').forEach(b => b.onclick = () => {
  const t = saleTotals(), left = Math.max(0, r2(t.total - t.adv));
  draft.paid = b.dataset.paid === 'full' ? left : b.dataset.paid === 'half' ? r2(left / 2) : '';
  $('#fPaid').value = draft.paid; updateTotals();
});
$('#saveBtn').onclick = saveSale;

/* khata */
$('#kSearch').addEventListener('input', renderKhata);
$('#kChips').addEventListener('click', e => { const c = e.target.closest('[data-kf]'); if (c){ khataFilter = c.dataset.kf; renderKhata(); } });
$('#cdPay').onclick = payCustomer;
$('#cdNew').onclick = () => { const c = customerOf(currentCk); if (c) saleFor(c.name, c.phone); };
$('#cdRemind').onclick = remindCustomer;
$('#cdStmt').onclick = () => openStatement(currentCk, 'custDetail');
$('#detailPay').onclick = payRecord;
$('#detailReceipt').onclick = () => openReceipt(currentId, 'detail');
$('#detailInterest').onclick = editInterest;
$('#detailDelete').onclick = deleteRecord;

/* orders */
$('#oSearch').addEventListener('input', renderOrders);
$('#oChips').addEventListener('click', e => { const c = e.target.closest('[data-of]'); if (c){ orderFilter = c.dataset.of; renderOrders(); } });
$('#oName').addEventListener('input', () => custSuggest($('#oName'), $('#oPhone'), $('#oSug'), $('#oNote')));
$('#oPhone').addEventListener('input', () => custSuggest($('#oName'), $('#oPhone'), $('#oSug'), $('#oNote')));
$('#oSave').onclick = saveOrder;
$('#odAdd').onclick = addAdvance;
$('#odEdit').onclick = editOrder;
$('#odConvert').onclick = convertOrder;
$('#odSlip').onclick = () => openOrderSlip(currentOid, 'orderDetail');
$('#odCancel').onclick = cancelOrder;
$('#odDelete').onclick = deleteOrder;

/* stock */
$('#stockSearch').addEventListener('input', renderStock);
$('#histCatSel').addEventListener('change', e => { histCatId = e.target.value; renderStock(); });
$('#addCat').onclick = () => categoryForm(null);

/* receipt screen */
$('#rcBack').onclick = () => show(receiptReturn);
$('#rcPrint').onclick = () => window.print();
$('#rcDownload').onclick = downloadReceipt;
$('#rcWhats').onclick = whatsappReceipt;

/* admin */
$('#savePhone').onclick = savePhone;
$('#saveBilling').onclick = saveBilling;
$('#saveKhata').onclick = saveKhata;
$('#backupBtn').onclick = backup;
$('#restoreFile').onchange = e => restoreStart(e.target.files[0]);
$('#pwSave').onclick = changePassword;
$$('[data-wipe]').forEach(b => b.onclick = () => wipe(b.dataset.wipe));
$('#logoutBtn').onclick = logout;
$('#saveDefaults').onclick = saveDefaults;

/* modal */
$('#mCancel').onclick = closeModal;
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
$('#mOk').onclick = () => { const r = modalOk ? modalOk() : true; if (r !== false) closeModal(); };

/* girvi */
$('#gChips').addEventListener('click', e => { const b = e.target.closest('[data-gf]'); if (b){ girviFilter = b.dataset.gf; renderGirvi(); } });
$('#gSearch').addEventListener('input', renderGirvi);
$('#gPhotos').addEventListener('click', e => {
  if (e.target.closest('#gAddPhoto')) { $('#gFile').click(); return; }
  if (e.target.closest('#gAddCam')) { $('#gCam').click(); return; }
  const rm = e.target.closest('[data-rm]'); if (rm){ gPhotos.splice(Number(rm.dataset.rm), 1); renderGPhotos(); }
});
$('#gFile').addEventListener('change', e => { addPhotos(e.target.files).then(() => { e.target.value = ''; }); });
$('#gCam').addEventListener('change', e => { addPhotos(e.target.files).then(() => { e.target.value = ''; }); });
/* order photos */
$('#oPhotos').addEventListener('click', e => {
  if (e.target.closest('#oAddPhoto')) { $('#oFile').click(); return; }
  if (e.target.closest('#oAddCam')) { $('#oCam').click(); return; }
  const rm = e.target.closest('[data-rm]'); if (rm){ oPhotos.splice(Number(rm.dataset.rm), 1); renderOPhotos(); }
});
['#oFile', '#oCam'].forEach(s => $(s).addEventListener('change', e => { addOrderPhotos(e.target.files).then(() => { e.target.value = ''; }); }));
$('#odBody').addEventListener('click', e => { const t = e.target.closest('[data-big]'); if (t) openLightbox(t.dataset.big); });
['#gStart', '#gMonths', '#gPrincipal', '#gRate'].forEach(s => $(s).addEventListener('input', updateGPreview));
$('#gInterestType').addEventListener('change', updateGPreview);
$$('[data-m]').forEach(b => b.onclick = () => { $('#gMonths').value = b.dataset.m; updateGPreview(); });
$('#gSave').onclick = saveGirvi;
$('#gdPay').onclick = girviPay;
$('#gdRelease').onclick = girviRelease;
$('#gdExtend').onclick = girviExtend;
$('#gdSlip').onclick = () => openGirviSlip(currentGid, 'girviDetail');
$('#gdDelete').onclick = deleteGirvi;
$('#gdBody').addEventListener('click', e => { const t = e.target.closest('[data-big]'); if (t) openLightbox(t.dataset.big); });
$('#lightbox').onclick = () => { $('#lightbox').hidden = true; };
resetGirviForm();

const rcStyle = document.createElement('style'); rcStyle.textContent = RECEIPT_CSS; document.head.appendChild(rcStyle);
renderSale();
if (sessionStorage.getItem('jw_in') === '1') enter();

/* offline support (works when served over https, e.g. GitHub Pages or inside the APK) */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
