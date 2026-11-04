"use strict";
/* Budget & épargne — interface. La logique métier est dans core.js. Données dans localStorage. */
const KEY = "budget-epargne-v2", OLD_KEY = "budget-epargne-v1";
const NS = "http://www.w3.org/2000/svg";
const ACCENTS = { blue: ["#2f6fed", "#6a9bff"], green: ["#1a9b5f", "#3ac083"], violet: ["#7c4ddf", "#a98bff"], rose: ["#d63f85", "#f27db5"] };
const WD = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];
const { pad, uid, round2, todayStr, monthKey, shiftMonth, daysInMonth } = Core;

/* ---------- état ---------- */
let S = loadState();
let unlocked = false;
const ui = { tab: "dash", month: monthKey(todayStr()), filter: "tous", scope: "mois", q: "", cat: "", acc: "", sort: "date-desc", limit: 50, period: "mois" };

function loadState() {
  let st;
  try { const raw = localStorage.getItem(KEY) || localStorage.getItem(OLD_KEY); st = Core.normalize(raw ? JSON.parse(raw) : {}); }
  catch (e) { st = Core.normalize({}); }
  return st;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); }
  catch (e) { toast("Enregistrement impossible : le stockage du navigateur est indisponible."); }
}
const fmt = (n) => Core.money(n, S.settings.currency);

/* ---------- DOM ---------- */
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, "");
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of kids.flat(Infinity)) { if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(c)); }
  return e;
}
function s(tag, attrs, ...kids) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
  for (const c of kids.flat()) { if (c == null) continue; e.append(c.nodeType ? c : document.createTextNode(c)); }
  return e;
}
function toast(msg, actionLabel, action) {
  const t = document.getElementById("toast"); t.replaceChildren(msg);
  if (actionLabel) t.append(h("button", { type: "button", onclick: () => { t.classList.remove("show"); action(); } }, actionLabel));
  t.classList.add("show"); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), actionLabel ? 6000 : 2400);
}
const monthLabel = (key) => { const [y, m] = key.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "long", year: "numeric" }); };
const shortMonth = (key) => { const [y, m] = key.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("fr-FR", { month: "short" }); };
const dayLabel = (d) => new Date(d + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
const num = (v) => { const n = parseFloat(String(v).replace(",", ".")); return Number.isFinite(n) ? n : NaN; };
const catN = (type, id) => Core.catName(S, type, id), catC = (type, id) => Core.catColor(S, type, id);
const accN = (id) => (S.accounts.find(a => a.id === id) || { name: "—" }).name;

/* ---------- thème ---------- */
function applyTheme() {
  const r = document.documentElement, th = S.settings.theme;
  if (th === "light" || th === "dark") r.dataset.theme = th; else delete r.dataset.theme;
  const dark = th === "dark" || (th === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
  const a = ACCENTS[S.settings.accent] || ACCENTS.blue;
  r.style.setProperty("--accent", dark ? a[1] : a[0]); r.style.setProperty("--accent-ink", dark ? "#0b1020" : "#ffffff");
  const meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.content = dark ? "#181c26" : "#ffffff";
}
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);

/* ---------- verrouillage par code ---------- */
async function hashPin(pin, salt) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + ":" + pin));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function showLock() {
  const ov = document.getElementById("lock"); ov.hidden = false; ov.replaceChildren();
  const inp = h("input", { type: "password", inputmode: "numeric", autocomplete: "off", maxlength: "12", "aria-label": "Code", placeholder: "Code" });
  const err = h("div", { class: "bad", style: "min-height:1.4em;margin-top:8px" });
  const form = h("form", { class: "lockbox" }, h("h2", null, "Budget & épargne"), h("p", { class: "muted" }, "Entre ton code pour continuer."), inp, err, h("button", { class: "btn primary", type: "submit", style: "width:100%;margin-top:10px" }, "Déverrouiller"));
  form.addEventListener("submit", async (e) => { e.preventDefault(); if (await hashPin(inp.value, S.settings.pinSalt) === S.settings.pinHash) { unlocked = true; ov.hidden = true; ov.replaceChildren(); render(); } else { err.textContent = "Code incorrect."; inp.value = ""; inp.focus(); } });
  ov.append(form); inp.focus();
}

/* ---------- navigation ---------- */
const TABS = [["dash", "Accueil"], ["tx", "Transactions"], ["bud", "Budgets"], ["stats", "Statistiques"], ["epa", "Épargne"], ["set", "Réglages"]];
function go(tab) { ui.tab = tab; render(); window.scrollTo(0, 0); }
function renderTabs() {
  const nav = document.getElementById("tabs"); nav.replaceChildren();
  for (const [id, label] of TABS) nav.append(h("button", { type: "button", "aria-current": ui.tab === id ? "page" : null, onclick: () => go(id) }, label));
}
function render() {
  if (S.settings.pinHash && !unlocked) { showLock(); return; }
  renderTabs();
  const v = document.getElementById("view"); v.replaceChildren();
  ({ dash: viewDash, tx: viewTx, bud: viewBud, stats: viewStats, epa: viewEpa, set: viewSet })[ui.tab](v);
}
function monthBar(extra) {
  return h("div", { class: "monthbar" },
    h("button", { class: "btn small", type: "button", "aria-label": "Mois précédent", onclick: () => { ui.month = shiftMonth(ui.month, -1); render(); } }, "‹"),
    h("strong", null, monthLabel(ui.month)),
    h("button", { class: "btn small", type: "button", "aria-label": "Mois suivant", onclick: () => { ui.month = shiftMonth(ui.month, 1); render(); } }, "›"),
    h("button", { class: "btn small", type: "button", onclick: () => { ui.month = monthKey(todayStr()); render(); } }, "Aujourd'hui"), extra || null);
}
const fab = (v) => v.append(h("button", { class: "btn primary fab no-print", type: "button", onclick: () => txDialog(null) }, "+ Transaction"));

/* ---------- graphiques ---------- */
function donut(data, total) {
  const R = 52, C = 2 * Math.PI * R;
  const svg = s("svg", { viewBox: "0 0 140 140", width: "150", height: "150", role: "img", "aria-label": "Répartition des dépenses par catégorie" });
  svg.append(s("circle", { cx: 70, cy: 70, r: R, fill: "none", stroke: "var(--line)", "stroke-width": 18 }));
  let off = 0;
  for (const d of data) { const len = total ? (d.value / total) * C : 0; svg.append(s("circle", { cx: 70, cy: 70, r: R, fill: "none", stroke: d.color, "stroke-width": 18, "stroke-dasharray": `${len} ${C - len}`, "stroke-dashoffset": -off, transform: "rotate(-90 70 70)" })); off += len; }
  svg.append(s("text", { x: 70, y: 74, "text-anchor": "middle", style: "fill:var(--ink);font-size:13px;font-weight:700" }, fmt(total)));
  return svg;
}
function bars(months) {
  const W = 320, H = 150, pb = 22, max = Math.max(1, ...months.flatMap(m => [m.rev, m.dep])), gw = W / months.length;
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Revenus et dépenses par mois" });
  months.forEach((m, i) => {
    const bw = Math.min(16, gw / 3), x0 = i * gw + gw / 2, hr = (m.rev / max) * (H - pb - 8), hd = (m.dep / max) * (H - pb - 8);
    svg.append(s("rect", { x: x0 - bw - 1, y: H - pb - hr, width: bw, height: hr, rx: 3, fill: "var(--good)" }));
    svg.append(s("rect", { x: x0 + 1, y: H - pb - hd, width: bw, height: hd, rx: 3, fill: "var(--bad)" }));
    svg.append(s("text", { x: x0, y: H - 6, "text-anchor": "middle" }, shortMonth(m.key)));
  });
  svg.append(s("line", { x1: 0, y1: H - pb, x2: W, y2: H - pb, stroke: "var(--line)" }));
  return svg;
}
function lineChart(points) {
  const W = 320, H = 150, pl = 8, pb = 22, pt = 10;
  const vals = points.map(p => p.value), min = Math.min(0, ...vals), max = Math.max(1, ...vals), span = max - min || 1;
  const X = (i) => pl + (points.length === 1 ? (W - 2 * pl) / 2 : (i / (points.length - 1)) * (W - 2 * pl)), Y = (v) => pt + (1 - (v - min) / span) * (H - pb - pt);
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Évolution de l'épargne cumulée" });
  svg.append(s("line", { x1: 0, y1: Y(0), x2: W, y2: Y(0), stroke: "var(--line)" }));
  svg.append(s("polyline", { points: points.map((p, i) => `${X(i)},${Y(p.value)}`).join(" "), fill: "none", stroke: "var(--accent)", "stroke-width": 2.5, "stroke-linejoin": "round" }));
  points.forEach((p, i) => { svg.append(s("circle", { cx: X(i), cy: Y(p.value), r: 3, fill: "var(--accent)" })); if (points.length <= 12) svg.append(s("text", { x: X(i), y: H - 6, "text-anchor": "middle" }, p.label)); });
  return svg;
}
function hbars(items, colorOf) {
  const max = Math.max(1, ...items.map(i => i.value));
  return h("div", { class: "hbars" }, items.map((i, k) => h("div", { class: "hb" }, h("span", null, i.label), h("div", { class: "bar" }, h("i", { style: `width:${(i.value / max) * 100}%;background:${colorOf ? colorOf(i, k) : "var(--accent)"}` })), h("span", { class: "muted" }, fmt(i.value)))));
}

/* ---------- composants ---------- */
const kpi = (label, value, cls) => h("div", { class: "card kpi" }, h("div", { class: "l" }, label), h("div", { class: "v " + (cls || "") }, value));
function txRow(t, editable) {
  let title, sub, color, sign = "", cls = "";
  if (t.type === "virement") { title = t.note || "Virement"; sub = `${accN(t.account)} → ${accN(t.toAccount)} · ${dayLabel(t.date)}`; color = "var(--muted)"; }
  else { title = t.note || catN(t.type, t.category); sub = `${catN(t.type, t.category)} · ${S.accounts.length > 1 ? accN(t.account) + " · " : ""}${dayLabel(t.date)}`; color = catC(t.type, t.category); sign = t.type === "revenu" ? "+" : "−"; cls = t.type === "revenu" ? "good" : ""; }
  return h("div", { class: "tx" }, h("span", { class: "dot", style: `background:${color}` }),
    h("div", { class: "t" }, h("b", null, title, t.recurringId ? h("span", { class: "tag", title: "Opération récurrente" }, "↻") : null), h("span", null, sub)),
    h("div", { class: "a " + cls }, sign + fmt(t.amount)),
    editable ? h("button", { class: "btn small no-print", type: "button", "aria-label": "Modifier", onclick: () => txDialog(t) }, "✎") : null);
}
function budRow(name, spent, limit) {
  const pct = limit > 0 ? spent / limit : 0, cls = pct > 1 ? "over" : pct >= 0.8 ? "warn" : "";
  return h("div", { class: "item" },
    h("div", { class: "row" }, h("b", { class: "grow" }, name), h("span", { class: pct > 1 ? "bad" : "muted" }, `${fmt(spent)} / ${fmt(limit)}`)),
    h("div", { class: "bar " + cls, style: "margin-top:6px", role: "progressbar", "aria-valuenow": Math.round(pct * 100), "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": "Budget " + name }, h("i", { style: `width:${Math.min(100, pct * 100)}%` })),
    pct > 1 ? h("div", { class: "bad small-t" }, `Dépassé de ${fmt(spent - limit)}`) : h("div", { class: "muted small-t" }, `Reste ${fmt(limit - spent)}`));
}
const seg = (opts, cur, on) => h("div", { class: "seg" }, opts.map(([id, l]) => h("button", { type: "button", "aria-pressed": cur === id, onclick: () => on(id) }, l)));
const section = (title, ...kids) => h("div", { class: "card", style: "margin-top:12px" }, h("h2", null, title), kids);
const empty = (...k) => h("div", { class: "empty" }, k);

/* ---------- accueil ---------- */
function viewDash(v) {
  const T = Core.totals(S, ui.month), sp = Core.spendByCat(S, ui.month), today = todayStr();
  v.append(monthBar(inFrame ? null : h("button", { class: "btn small no-print", type: "button", onclick: () => window.print() }, "Imprimer")));
  v.append(h("div", { class: "grid cards" }, kpi("Revenus", fmt(T.rev), "good"), kpi("Dépenses", fmt(T.dep)), kpi("Solde du mois", fmt(T.solde), T.solde >= 0 ? "good" : "bad"), kpi("Taux d'épargne", T.taux == null ? "—" : Math.round(T.taux * 100) + " %", T.taux != null && T.taux < 0 ? "bad" : "")));

  const left = [], f = Core.forecast(S, ui.month, today);
  if (f) {
    const totalBud = Object.values(S.budgets).reduce((a, b) => a + b, 0);
    left.push(!f.reliable ? h("div", { class: "card" }, h("h2", null, "Prévision de fin de mois"), h("p", { class: "muted", style: "margin:0" }, "Pas encore assez de données : la prévision s'affiche à partir du 5 du mois.")) : h("div", { class: "card" }, h("h2", null, "Prévision de fin de mois"),
      h("div", { class: "row" }, h("div", { class: "grow" }, h("div", { class: "v2" }, fmt(f.projected)), h("div", { class: "muted small-t" }, `dépenses estimées : ${fmt(f.fixed)} de frais fixes + ${fmt(f.perDay)} par jour de dépenses variables, ${f.remainingDays} jours restants`)),
        f.revenus > 0 ? h("div", { class: f.projected > f.revenus ? "bad v2" : "good v2" }, fmt(f.revenus - f.projected)) : null),
      f.revenus > 0 ? h("div", { class: "muted small-t" }, "← reste estimé en fin de mois") : null,
      totalBud > 0 ? h("div", { class: "muted small-t", style: "margin-top:6px" }, `Budgets cumulés : ${fmt(totalBud)}`) : null));
  }
  const accCard = h("div", { class: "card" }, h("h2", null, "Mes comptes"));
  let net = 0; S.accounts.forEach(a => { const b = Core.accountBalance(S, a.id); net += b; accCard.append(h("div", { class: "row item" }, h("span", { class: "grow" }, a.name, h("span", { class: "tag" }, { courant: "courant", epargne: "épargne", especes: "espèces" }[a.type])), h("b", { class: b < 0 ? "bad" : "" }, fmt(b)))); });
  if (S.accounts.length > 1) accCard.append(h("div", { class: "row item" }, h("b", { class: "grow" }, "Total"), h("b", null, fmt(net))));
  left.push(accCard);
  v.append(h("div", { class: "grid two", style: "margin-top:12px" }, left));

  const ins = Core.insights(S, ui.month, today);
  v.append(section("Conseils du mois", ins.map(i => h("div", { class: "insight " + i.type }, h("span", { "aria-hidden": "true" }, { good: "✓", warn: "!", info: "i" }[i.type]), h("span", null, i.text)))));

  const entries = Object.entries(sp).sort((a, b) => b[1] - a[1]).map(([id, value]) => ({ name: catN("depense", id), value, color: catC("depense", id) }));
  const cardCat = h("div", { class: "card" }, h("h2", null, "Dépenses par catégorie"));
  if (!entries.length) cardCat.append(empty("Aucune dépense ce mois-ci."));
  else cardCat.append(h("div", { class: "row" }, donut(entries, T.dep), h("div", { class: "legend grow" }, entries.map(d => h("div", null, h("i", { style: `background:${d.color}` }), h("span", null, d.name), h("span", null, fmt(d.value)))))));
  const cardBars = h("div", { class: "card" }, h("h2", null, "Six derniers mois"), bars(Core.monthlySeries(S, ui.month, 6)),
    h("div", { class: "row muted small-t", style: "gap:14px" }, h("span", { class: "good" }, "■ revenus"), h("span", { class: "bad" }, "■ dépenses")));
  v.append(h("div", { class: "grid two", style: "margin-top:12px" }, cardCat, cardBars));

  const withB = S.categories.depense.filter(c => S.budgets[c.id] > 0);
  v.append(section("Budgets du mois", withB.length ? withB.map(c => budRow(c.name, sp[c.id] || 0, S.budgets[c.id])) : empty("Aucun budget défini. ", h("button", { class: "btn small", type: "button", onclick: () => go("bud") }, "Définir mes budgets"))));
  const recent = Core.inMonth(S, ui.month).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  v.append(section("Dernières transactions", recent.length ? recent.map(t => txRow(t, false)) : empty("Rien pour l'instant. Ajoute ta première transaction avec le bouton +.")));
  fab(v);
}

/* ---------- transactions ---------- */
function filteredTx() {
  let list = ui.scope === "mois" ? Core.inMonth(S, ui.month) : S.transactions.slice();
  if (ui.filter !== "tous") list = list.filter(t => t.type === ui.filter);
  if (ui.cat) list = list.filter(t => t.category === ui.cat);
  if (ui.acc) list = list.filter(t => t.account === ui.acc || t.toAccount === ui.acc);
  const q = ui.q.trim().toLowerCase();
  if (q) list = list.filter(t => (t.note + " " + (t.category ? catN(t.type, t.category) : "") + " " + t.amount).toLowerCase().includes(q));
  const [k, dir] = ui.sort.split("-"), m = dir === "desc" ? -1 : 1;
  return list.sort((a, b) => (k === "date" ? a.date.localeCompare(b.date) || a.id.localeCompare(b.id) : a.amount - b.amount) * m);
}
function viewTx(v) {
  v.append(ui.scope === "mois" ? monthBar() : h("div", { class: "monthbar" }, h("strong", null, "Toutes les transactions")));
  const search = h("input", { type: "search", placeholder: "Rechercher (note, catégorie, montant)…", value: ui.q, "aria-label": "Rechercher" });
  search.addEventListener("input", () => { ui.q = search.value; ui.limit = 50; const pos = search.selectionStart; renderList(); });
  const catSel = h("select", { "aria-label": "Catégorie", onchange: (e) => { ui.cat = e.target.value; ui.limit = 50; render(); } }, h("option", { value: "" }, "Toutes catégories"),
    h("optgroup", { label: "Dépenses" }, S.categories.depense.map(c => h("option", { value: c.id, selected: ui.cat === c.id }, c.name))), h("optgroup", { label: "Revenus" }, S.categories.revenu.map(c => h("option", { value: c.id, selected: ui.cat === c.id }, c.name))));
  const accSel = h("select", { "aria-label": "Compte", onchange: (e) => { ui.acc = e.target.value; ui.limit = 50; render(); } }, h("option", { value: "" }, "Tous les comptes"), S.accounts.map(a => h("option", { value: a.id, selected: ui.acc === a.id }, a.name)));
  const sortSel = h("select", { "aria-label": "Tri", onchange: (e) => { ui.sort = e.target.value; render(); } }, [["date-desc", "Date (récent d'abord)"], ["date-asc", "Date (ancien d'abord)"], ["amount-desc", "Montant décroissant"], ["amount-asc", "Montant croissant"]].map(([id, l]) => h("option", { value: id, selected: ui.sort === id }, l)));
  v.append(h("div", { class: "row no-print", style: "margin-bottom:10px" },
    seg([["mois", "Ce mois"], ["tout", "Tout"]], ui.scope, (id) => { ui.scope = id; ui.limit = 50; render(); }),
    seg([["tous", "Tout"], ["depense", "Dépenses"], ["revenu", "Revenus"], ["virement", "Virements"]], ui.filter, (id) => { ui.filter = id; ui.limit = 50; render(); })));
  v.append(h("div", { class: "filters no-print" }, search, catSel, accSel, sortSel));
  v.append(h("div", { class: "row no-print", style: "margin:10px 0" }, h("button", { class: "btn small", type: "button", onclick: () => importDialog() }, "Importer un CSV"), h("button", { class: "btn small", type: "button", onclick: () => txDialog(null, "virement") }, "Virement entre comptes")));
  const holder = h("div", { id: "txlist" }); v.append(holder); renderList(); fab(v);
}
function renderList() {
  const holder = document.getElementById("txlist"); if (!holder) return; holder.replaceChildren();
  const list = filteredTx(), t = Core.sum(list);
  const card = h("div", { class: "card" });
  if (!list.length) card.append(empty("Aucune transaction pour ces filtres."));
  else {
    card.append(h("div", { class: "row muted small-t", style: "margin-bottom:6px" }, h("span", { class: "grow" }, `${list.length} transaction${list.length > 1 ? "s" : ""}`), h("span", { class: "good" }, "+" + fmt(t.rev)), h("span", null, "−" + fmt(t.dep))));
    list.slice(0, ui.limit).forEach(x => card.append(txRow(x, true)));
    if (list.length > ui.limit) card.append(h("button", { class: "btn", type: "button", style: "width:100%;margin-top:8px", onclick: () => { ui.limit += 50; renderList(); } }, `Afficher plus (${list.length - ui.limit} restantes)`));
  }
  holder.append(card);
}

/* ---------- budgets et récurrents ---------- */
function viewBud(v) {
  v.append(monthBar());
  const sp = Core.spendByCat(S, ui.month), totalLim = Object.values(S.budgets).reduce((a, b) => a + b, 0);
  const spentLim = S.categories.depense.filter(c => S.budgets[c.id] > 0).reduce((a, c) => a + (sp[c.id] || 0), 0);
  if (totalLim > 0) v.append(h("div", { class: "card", style: "margin-bottom:12px" }, h("h2", null, "Budget total du mois"), budRow("Toutes catégories avec plafond", spentLim, totalLim)));
  const card = h("div", { class: "card" }, h("h2", null, "Plafond mensuel par catégorie (vide = pas de plafond)"));
  S.categories.depense.forEach(c => {
    const inp = h("input", { type: "number", inputmode: "decimal", min: "0", step: "1", placeholder: "Pas de plafond", value: S.budgets[c.id] != null ? S.budgets[c.id] : "", "aria-label": "Plafond " + c.name, style: "max-width:160px" });
    inp.addEventListener("change", () => { const n = num(inp.value); if (inp.value.trim() === "") delete S.budgets[c.id]; else if (n >= 0) S.budgets[c.id] = n; save(); render(); });
    card.append(h("div", { class: "item" }, h("div", { class: "row" }, h("span", { class: "dot", style: `background:${c.color}` }), h("b", { class: "grow" }, c.name), inp), S.budgets[c.id] > 0 ? budRow("", sp[c.id] || 0, S.budgets[c.id]) : h("div", { class: "muted small-t" }, `Dépensé ce mois : ${fmt(sp[c.id] || 0)}`)));
  });
  v.append(card);
  const rc = h("div", { class: "card", style: "margin-top:12px" }, h("div", { class: "row" }, h("h2", { class: "grow", style: "margin:0" }, "Opérations récurrentes"), h("button", { class: "btn primary small", type: "button", onclick: () => recurringDialog(null) }, "+ Récurrente")),
    h("p", { class: "muted small-t" }, "Loyer, abonnements, salaire : ils sont ajoutés automatiquement chaque mois, à la date choisie."));
  if (!S.recurring.length) rc.append(empty("Aucune opération récurrente."));
  S.recurring.forEach(r => rc.append(h("div", { class: "item" }, h("div", { class: "row" }, h("div", { class: "grow" }, h("b", null, r.note || catN(r.type, r.category)), h("div", { class: "muted small-t" }, `${catN(r.type, r.category)} · le ${r.day} de chaque mois${r.active ? "" : " · en pause"}`)), h("b", { class: r.type === "revenu" ? "good" : "" }, (r.type === "revenu" ? "+" : "−") + fmt(r.amount)), h("button", { class: "btn small", type: "button", onclick: () => recurringDialog(r) }, "Modifier")))));
  v.append(rc);
}

/* ---------- statistiques ---------- */
function periodInfo() {
  const m = ui.month, n = { mois: 1, "3m": 3, "12m": 12, all: 0 }[ui.period], endKey = m, endDate = `${m}-${pad(daysInMonth(m))}`;
  if (!n) { const ds = S.transactions.map(t => t.date).sort(); return { from: ds[0] || `${m}-01`, to: ds.length ? ds[ds.length - 1] : endDate, prev: null, months: 0, label: "Toute la période" }; }
  const startKey = shiftMonth(endKey, -(n - 1)), pStart = shiftMonth(startKey, -n), pEnd = shiftMonth(startKey, -1);
  return { from: `${startKey}-01`, to: endDate, prev: { from: `${pStart}-01`, to: `${pEnd}-${pad(daysInMonth(pEnd))}` }, months: n, label: n === 1 ? monthLabel(m) : `${n} mois jusqu'à ${monthLabel(m)}` };
}
function viewStats(v) {
  v.append(monthBar());
  v.append(h("div", { style: "margin-bottom:12px" }, seg([["mois", "Mois"], ["3m", "3 mois"], ["12m", "12 mois"], ["all", "Tout"]], ui.period, (id) => { ui.period = id; render(); })));
  const P = periodInfo(), list = Core.between(S, P.from, P.to), T = Core.sum(list);
  if (!list.length) { v.append(h("div", { class: "card" }, empty("Aucune donnée pour cette période."))); return; }
  const days = Math.max(1, Math.round((new Date(P.to + "T12:00:00") - new Date(P.from + "T12:00:00")) / 864e5) + 1);
  v.append(h("p", { class: "muted", style: "margin:0 0 10px;text-transform:capitalize" }, P.label));
  v.append(h("div", { class: "grid cards" }, kpi("Revenus", fmt(T.rev), "good"), kpi("Dépenses", fmt(T.dep)), kpi("Solde", fmt(T.solde), T.solde >= 0 ? "good" : "bad"), kpi("Dépense moyenne par jour", fmt(T.dep / days))));

  const cur = Core.spendBy(list), prevSp = P.prev ? Core.spendBy(Core.between(S, P.prev.from, P.prev.to)) : null;
  const rows = Object.entries(cur).sort((a, b) => b[1] - a[1]), catCard = h("div", { class: "card" }, h("h2", null, "Dépenses par catégorie"));
  rows.forEach(([id, val]) => {
    const p = prevSp ? prevSp[id] || 0 : null, d = p ? (val / p - 1) * 100 : null;
    catCard.append(h("div", { class: "item" }, h("div", { class: "row" }, h("span", { class: "dot", style: `background:${catC("depense", id)}` }), h("b", { class: "grow" }, catN("depense", id)), h("span", null, fmt(val)), d != null ? h("span", { class: (d > 0 ? "bad" : "good") + " small-t", title: "Par rapport à la période précédente" }, (d > 0 ? "+" : "") + Math.round(d) + " %") : null),
      h("div", { class: "bar", style: "margin-top:6px" }, h("i", { style: `width:${T.dep ? (val / T.dep) * 100 : 0}%;background:${catC("depense", id)}` })), h("div", { class: "muted small-t" }, `${T.dep ? Math.round((val / T.dep) * 100) : 0} % des dépenses`)));
  });
  const series = Core.monthlySeries(S, ui.month, 12); let cum = 0;
  const trend = h("div", { class: "card" }, h("h2", null, "Épargne cumulée (12 mois)"), lineChart(series.map(m => { cum += m.solde; return { label: shortMonth(m.key), value: round2(cum) }; })), h("div", { class: "muted small-t" }, `Total sur 12 mois : ${fmt(cum)}`));
  v.append(h("div", { class: "grid two" }, catCard, h("div", { class: "grid" }, trend, h("div", { class: "card" }, h("h2", null, "Revenus et dépenses"), bars(Core.monthlySeries(S, ui.month, 12).slice(-6))))));

  const top = list.filter(t => t.type === "depense").sort((a, b) => b.amount - a.amount).slice(0, 5);
  const wd = Core.weekdaySpend(list);
  v.append(h("div", { class: "grid two", style: "margin-top:12px" }, h("div", { class: "card" }, h("h2", null, "Cinq plus grosses dépenses"), top.map(t => txRow(t, false))),
    h("div", { class: "card" }, h("h2", null, "Dépenses par jour de la semaine"), hbars(WD.map((l, i) => ({ label: l, value: wd[i] })), () => "var(--accent)"))));

  const r = Core.rule503020(S, ui.month);
  const rule = h("div", { class: "card", style: "margin-top:12px" }, h("h2", null, "Règle 50 / 30 / 20 du mois"), h("p", { class: "muted small-t", style: "margin-top:0" }, "Repère courant : 50 % de tes revenus pour les besoins, 30 % pour les envies, 20 % pour l'épargne. Les catégories se classent en besoins ou envies dans Réglages."));
  if (!r.pct) rule.append(empty("Ajoute un revenu ce mois-ci pour calculer cette répartition."));
  else [["Besoins", r.pct.besoins, 0.5, r.besoins, true], ["Envies", r.pct.envies, 0.3, r.envies, true], ["Épargne", r.pct.epargne, 0.2, r.epargne, false]].forEach(([n, p, goal, val, max]) => {
    const ok = max ? p <= goal : p >= goal;
    rule.append(h("div", { class: "item" }, h("div", { class: "row" }, h("b", { class: "grow" }, n), h("span", { class: ok ? "good" : "bad" }, `${Math.round(p * 100)} %`), h("span", { class: "muted" }, `objectif ${max ? "≤" : "≥"} ${goal * 100} %`)), h("div", { class: "bar " + (ok ? "done" : "over"), style: "margin-top:6px" }, h("i", { style: `width:${Math.min(100, p * 100)}%` })), h("div", { class: "muted small-t" }, fmt(val))));
  });
  v.append(rule);
}

/* ---------- épargne : comptes, objectifs, défi ---------- */
function viewEpa(v) {
  const accHead = h("div", { class: "row", style: "margin-bottom:10px" }, h("h2", { class: "grow", style: "margin:0;font-size:17px" }, "Mes comptes"), h("button", { class: "btn small", type: "button", onclick: () => txDialog(null, "virement") }, "Virement"), h("button", { class: "btn primary small", type: "button", onclick: () => accountDialog(null) }, "+ Compte"));
  v.append(accHead);
  const accCard = h("div", { class: "card" });
  S.accounts.forEach(a => { const b = Core.accountBalance(S, a.id); accCard.append(h("div", { class: "item" }, h("div", { class: "row" }, h("div", { class: "grow" }, h("b", null, a.name), h("div", { class: "muted small-t" }, { courant: "Compte courant", epargne: "Compte d'épargne", especes: "Espèces" }[a.type])), h("b", { class: b < 0 ? "bad" : "" }, fmt(b)), h("button", { class: "btn small", type: "button", onclick: () => accountDialog(a) }, "Modifier")))); });
  v.append(accCard);

  v.append(h("div", { class: "row", style: "margin:16px 0 10px" }, h("h2", { class: "grow", style: "margin:0;font-size:17px" }, "Objectifs d'épargne"), h("button", { class: "btn primary small", type: "button", onclick: () => goalDialog() }, "+ Objectif")));
  const gCard = h("div", { class: "card" });
  if (!S.goals.length) gCard.append(empty("Aucun objectif. Crée-en un : voyage, ordinateur, fonds d'urgence…"));
  S.goals.forEach(g => {
    const pct = g.target > 0 ? g.saved / g.target : 0, done = pct >= 1; let hint = "";
    if (!done && g.deadline) {
      const now = new Date(), end = new Date(g.deadline + "T12:00:00");
      if (end < now) hint = "Échéance dépassée.";
      else { const months = Math.max(1, (end.getFullYear() - now.getFullYear()) * 12 + end.getMonth() - now.getMonth() + (end.getDate() >= now.getDate() ? 1 : 0)); hint = `À mettre de côté : ${fmt((g.target - g.saved) / months)} par mois jusqu'au ${end.toLocaleDateString("fr-FR")}.`; }
    }
    gCard.append(h("div", { class: "item" },
      h("div", { class: "row" }, h("b", { class: "grow" }, g.name), h("span", { class: done ? "good" : "muted" }, `${fmt(g.saved)} / ${fmt(g.target)}`)),
      h("div", { class: "bar " + (done ? "done" : ""), style: "margin:6px 0", role: "progressbar", "aria-valuenow": Math.round(pct * 100), "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": "Objectif " + g.name }, h("i", { style: `width:${Math.min(100, pct * 100)}%` })),
      h("div", { class: "muted small-t" }, done ? "Objectif atteint 🎉" : hint),
      h("div", { class: "row", style: "margin-top:8px" }, h("button", { class: "btn small", type: "button", onclick: () => contribDialog(g) }, "+ Verser"), h("button", { class: "btn small", type: "button", onclick: () => goalDialog(g) }, "Modifier"),
        h("button", { class: "btn small danger", type: "button", onclick: () => { const snap = S.goals.slice(); S.goals = S.goals.filter(x => x.id !== g.id); save(); render(); toast("Objectif supprimé", "Annuler", () => { S.goals = snap; save(); render(); }); } }, "Supprimer"))));
  });
  v.append(gCard);

  const step = S.challenge.step, paid = new Set(S.challenge.paid), total = step * (52 * 53 / 2), saved = [...paid].reduce((a, w) => a + w * step, 0);
  const stepInp = h("input", { type: "number", inputmode: "decimal", min: "0.01", step: "0.5", value: step, style: "max-width:120px", "aria-label": "Montant de base du défi" });
  stepInp.addEventListener("change", () => { const n = num(stepInp.value); if (n > 0) { S.challenge.step = n; save(); render(); } });
  const weeks = h("div", { class: "weeks" });
  for (let w = 1; w <= 52; w++) weeks.append(h("button", { type: "button", "aria-pressed": paid.has(w), "aria-label": `Semaine ${w}, ${fmt(w * step)}`, onclick: () => { paid.has(w) ? paid.delete(w) : paid.add(w); S.challenge.paid = [...paid].sort((a, b) => a - b); save(); render(); } }, h("span", null, "S" + w), h("b", null, fmt(w * step).replace(/ /g, ""))));
  v.append(h("div", { class: "card", style: "margin-top:16px" }, h("h2", null, "Défi des 52 semaines"), h("div", { class: "muted small-t", style: "margin-bottom:10px" }, "Semaine 1 : montant de base, semaine 2 : le double, etc. Coche chaque semaine réalisée."),
    h("div", { class: "row" }, h("label", { style: "margin:0" }, "Montant de base"), stepInp, h("span", { class: "grow" }), h("b", null, `${fmt(saved)} / ${fmt(total)}`)),
    h("div", { class: "bar " + (saved >= total ? "done" : ""), style: "margin:10px 0 14px" }, h("i", { style: `width:${Math.min(100, saved / total * 100)}%` })), weeks));
}

/* ---------- réglages ---------- */
function viewSet(v) {
  const cs = h("select", { "aria-label": "Devise", onchange: (e) => { S.settings.currency = e.target.value; save(); render(); } }, Object.entries(Core.CURRENCIES).map(([k, l]) => h("option", { value: k, selected: S.settings.currency === k }, l)));
  v.append(section("Apparence", h("label", null, "Thème"), seg([["auto", "Auto"], ["light", "Clair"], ["dark", "Sombre"]], S.settings.theme, (id) => { S.settings.theme = id; save(); applyTheme(); render(); }),
    h("label", null, "Couleur d'accent"), h("div", { class: "row" }, Object.entries(ACCENTS).map(([k, c]) => h("button", { type: "button", class: "swatch", "aria-label": k, "aria-pressed": S.settings.accent === k, style: `background:${c[0]}`, onclick: () => { S.settings.accent = k; save(); applyTheme(); render(); } }))),
    h("label", null, "Devise"), cs));

  const catSec = (type, title) => h("div", { class: "card", style: "margin-top:12px" }, h("div", { class: "row" }, h("h2", { class: "grow", style: "margin:0" }, title), h("button", { class: "btn small", type: "button", onclick: () => categoryDialog(type, null) }, "+ Catégorie")),
    S.categories[type].map(c => h("div", { class: "row item" }, h("span", { class: "dot", style: `background:${c.color}` }), h("span", { class: "grow" }, c.name, type === "depense" ? h("span", { class: "tag" }, c.group) : null), h("button", { class: "btn small", type: "button", onclick: () => categoryDialog(type, c) }, "Modifier"))));
  v.append(catSec("depense", "Catégories de dépenses"), catSec("revenu", "Catégories de revenus"));

  v.append(section("Catégorisation automatique", h("p", { class: "muted small-t", style: "margin-top:0" }, "Si la note d'une transaction contient un mot-clé, la catégorie est choisie automatiquement (à la saisie et à l'import CSV)."),
    h("div", { class: "chips" }, S.rules.map((r, i) => h("span", { class: "chip" }, `${r.keyword} → ${catN("depense", r.category) !== r.category ? catN("depense", r.category) : catN("revenu", r.category)}`, h("button", { type: "button", "aria-label": "Supprimer la règle " + r.keyword, onclick: () => { S.rules.splice(i, 1); save(); render(); } }, "×")))),
    h("button", { class: "btn small", type: "button", style: "margin-top:10px", onclick: ruleDialog }, "+ Règle")));

  const hasPin = !!S.settings.pinHash;
  v.append(section("Verrouillage", h("p", { class: "muted small-t", style: "margin-top:0" }, "Un code demandé à chaque ouverture. Il masque l'application aux regards, mais ne chiffre pas les données : ne le considère pas comme une protection forte."),
    hasPin ? h("div", { class: "row" }, h("button", { class: "btn", type: "button", onclick: () => pinDialog() }, "Changer le code"), h("button", { class: "btn danger", type: "button", onclick: () => { S.settings.pinHash = ""; S.settings.pinSalt = ""; save(); render(); toast("Code retiré"); } }, "Retirer le code")) : h("button", { class: "btn", type: "button", onclick: () => pinDialog() }, "Définir un code")));

  v.append(section("Données", h("p", { class: "muted small-t", style: "margin-top:0" }, "Tout est enregistré dans ce navigateur, sur cet appareil. Fais une sauvegarde de temps en temps."),
    h("div", { class: "row" }, h("button", { class: "btn", type: "button", onclick: exportJSON }, "Sauvegarder (JSON)"), h("button", { class: "btn", type: "button", onclick: exportCSV }, "Exporter en CSV"),
      h("label", { class: "btn filebtn" }, "Restaurer un fichier", h("input", { type: "file", accept: "application/json,.json", onchange: importJSON })), h("button", { class: "btn", type: "button", onclick: pasteDialog }, "Coller une sauvegarde")),
    h("div", { class: "row", style: "margin-top:12px" }, h("button", { class: "btn", type: "button", onclick: demo }, "Charger des données d'exemple"),
      h("button", { class: "btn danger", type: "button", onclick: async () => { if (await askConfirm("Effacer toutes les données ? Cette action est définitive.", "Tout effacer")) { const keepSettings = S.settings; S = Core.normalize({ settings: keepSettings }); save(); render(); toast("Données effacées"); } } }, "Tout effacer"))));
  v.append(h("p", { class: "muted small-t", style: "text-align:center" }, "Raccourcis : N = nouvelle transaction · ← → = changer de mois"));
}
function download(name, text, mime) {
  const a = h("a", { href: URL.createObjectURL(new Blob([text], { type: mime })), download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function saveText(name, text, mime, title) {
  if (inFrame) textDialog(title, text, "Copie ce texte et garde-le dans un fichier ou une note. Pour restaurer, utilise « Coller une sauvegarde ».");
  else download(name, text, mime);
}
const exportJSON = () => saveText(`budget-sauvegarde-${todayStr()}.json`, JSON.stringify(S, null, 2), "application/json", "Sauvegarde (JSON)");
function exportCSV() {
  const q = (x) => `"${String(x).replace(/"/g, '""')}"`;
  const rows = [["date", "type", "montant", "categorie", "compte", "note"].join(";")].concat(S.transactions.slice().sort((a, b) => a.date.localeCompare(b.date)).map(t => [t.date, t.type, String(t.amount).replace(".", ","), q(t.type === "virement" ? "" : catN(t.type, t.category)), q(accN(t.account) + (t.toAccount ? " → " + accN(t.toAccount) : "")), q(t.note)].join(";")));
  download(`budget-transactions-${todayStr()}.csv`, "﻿" + rows.join("\n"), "text/csv");
}
async function restoreFromText(text) {
  let d; try { d = Core.normalize(JSON.parse(text)); } catch (e) { toast("Fichier invalide."); return; }
  if (await askConfirm(`Remplacer les données actuelles par la sauvegarde (${d.transactions.length} transactions) ?`, "Remplacer")) { S = d; Core.applyRecurring(S); save(); applyTheme(); render(); toast("Sauvegarde restaurée"); }
}
function importJSON(ev) {
  const f = ev.target.files[0]; if (!f) return; const r = new FileReader();
  r.onload = () => restoreFromText(String(r.result)); r.readAsText(f); ev.target.value = "";
}
async function demo() {
  if (S.transactions.length && !(await askConfirm("Ajouter des données d'exemple à tes données actuelles ?", "Ajouter"))) return;
  const now = monthKey(todayStr()); if (!S.accounts.some(a => a.type === "epargne")) S.accounts.push({ id: "livret", name: "Livret A", type: "epargne", initial: 150 });
  for (let i = 0; i < 6; i++) {
    const k = shiftMonth(now, -i), add = (d, type, amount, category, note) => S.transactions.push({ id: uid(), date: `${k}-${pad(d)}`, type, amount, category, account: "main", note });
    add(1, "revenu", 650, "job-etudiant", "Salaire job"); add(5, "revenu", 200, "famille", "Aide"); add(2, "depense", 380, "logement", "Loyer");
    add(8, "depense", 62 + (i % 3) * 9, "alimentation", "Courses"); add(15, "depense", 71 - (i % 2) * 8, "alimentation", "Courses"); add(10, "depense", 30, "transport", "Pass");
    add(12, "depense", 25 + i * 4, "loisirs", "Sortie"); add(20, "depense", 14, "abonnements", "Streaming");
  }
  S.budgets = Object.assign({ alimentation: 160, loisirs: 50, transport: 40 }, S.budgets);
  if (!S.goals.length) S.goals.push({ id: uid(), name: "Voyage été", target: 600, saved: 180, deadline: `${new Date().getFullYear() + 1}-06-30` });
  save(); render(); toast("Données d'exemple ajoutées");
}

/* ---------- boîtes de dialogue ---------- */
const dlg = document.getElementById("dlg"), dlg2 = document.getElementById("dlg2");
const inFrame = window.self !== window.top;
/* Quand une fenêtre se ferme, ne laisse pas le focus sur l'un de ses champs. */
for (const d of [dlg, dlg2]) d.addEventListener("close", () => { if (d.contains(document.activeElement)) document.activeElement.blur(); });
/* Confirmation intégrée à la page (confirm() n'est pas disponible dans une page intégrée). */
function askConfirm(message, okLabel) {
  return new Promise((resolve) => {
    const ok = () => { dlg2.onclose = null; dlg2.close(); resolve(true); };
    const okBtn = h("button", { class: "btn primary", type: "submit", onclick: (e) => { e.preventDefault(); ok(); } }, okLabel || "Confirmer");
    const form = h("form", { method: "dialog" }, h("p", { style: "margin:0 0 4px" }, message),
      h("div", { class: "actions" }, h("button", { class: "btn", type: "button", onclick: () => { dlg2.close(); resolve(false); } }, "Annuler"), okBtn));
    form.addEventListener("submit", (e) => { e.preventDefault(); ok(); });
    dlg2.replaceChildren(form); dlg2.onclose = () => resolve(false); dlg2.showModal(); okBtn.focus();
  });
}
/* Affiche un texte à copier (sauvegarde) quand le téléchargement direct n'est pas possible. */
function textDialog(title, text, hint) {
  const ta = h("textarea", { readonly: true, rows: "8", style: "width:100%;font:13px/1.4 ui-monospace,monospace;padding:8px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--ink)" }); ta.value = text;
  const copy = h("button", { class: "btn primary", type: "button", onclick: async () => { try { await navigator.clipboard.writeText(text); toast("Copié"); } catch (e) { ta.focus(); ta.select(); toast("Sélectionné : fais Ctrl+C"); } } }, "Copier");
  openDlg(title, h("div", null, h("p", { class: "muted small-t", style: "margin-top:0" }, hint), ta), () => { }, false, copy);
  ta.addEventListener("focus", () => ta.select());
}
function pasteDialog() {
  const ta = h("textarea", { rows: "8", placeholder: "Colle ici le contenu d'une sauvegarde JSON", style: "width:100%;font:13px/1.4 ui-monospace,monospace;padding:8px;border:1px solid var(--line);border-radius:10px;background:var(--bg);color:var(--ink)" });
  openDlg("Restaurer une sauvegarde", ta, () => { restoreFromText(ta.value); }, "Restaurer"); ta.focus();
}
function openDlg(title, body, onSubmit, submitLabel, extra) {
  dlg.replaceChildren();
  const run = () => { if (onSubmit() !== false) dlg.close(); };
  const form = h("form", { method: "dialog" }, h("h3", null, title), body, h("div", { class: "actions" }, extra || null, h("button", { class: "btn", type: "button", onclick: () => dlg.close() }, "Annuler"),
    submitLabel === false ? null : h("button", { class: "btn primary", type: "submit", onclick: (e) => { e.preventDefault(); if (form.reportValidity()) run(); } }, submitLabel || "Enregistrer")));
  form.addEventListener("submit", (e) => { e.preventDefault(); run(); });
  dlg.append(form); dlg.showModal(); return form;
}
const field = (label, input) => h("div", null, h("label", null, label), input);
const accSelect = (val) => h("select", null, S.accounts.map(a => h("option", { value: a.id, selected: a.id === val }, a.name)));
const catSelect = (type, val) => h("select", null, S.categories[type].map(c => h("option", { value: c.id, selected: c.id === val }, c.name)));
function deleteWithUndo(t) {
  const snapTx = S.transactions.slice(), snapRec = JSON.stringify(S.recurring);
  Core.removeTransaction(S, t.id); save(); render();
  toast("Transaction supprimée", "Annuler", () => { S.transactions = snapTx; S.recurring = JSON.parse(snapRec); save(); render(); });
}
function txDialog(t, forceType) {
  let type = t ? t.type : (forceType || "depense"), catTouched = !!t;
  const amount = h("input", { type: "number", inputmode: "decimal", step: "0.01", min: "0.01", required: true, value: t ? t.amount : "" });
  const date = h("input", { type: "date", required: true, value: t ? t.date : (monthKey(todayStr()) === ui.month ? todayStr() : ui.month + "-01") });
  const note = h("input", { type: "text", maxlength: "120", placeholder: "Facultatif", value: t ? t.note : "" });
  const cat = h("select", { onchange: () => { catTouched = true; } }), acc = accSelect(t ? t.account : (S.accounts[0] || {}).id), to = accSelect(t && t.toAccount ? t.toAccount : (S.accounts[1] || S.accounts[0]).id);
  const catWrap = h("div"), toWrap = h("div"), accLabel = h("label"), segEl = h("div", { class: "seg" });
  const refresh = () => {
    segEl.replaceChildren(...[["depense", "Dépense"], ["revenu", "Revenu"], ["virement", "Virement"]].map(([id, l]) => h("button", { type: "button", "aria-pressed": type === id, onclick: () => { type = id; refresh(); } }, l)));
    const isV = type === "virement"; catWrap.hidden = isV; toWrap.hidden = !isV; accLabel.textContent = isV ? "Du compte" : "Compte";
    if (!isV) { cat.replaceChildren(...S.categories[type].map(c => h("option", { value: c.id }, c.name))); cat.value = t && t.type === type && Core.findCat(S, type, t.category) ? t.category : S.categories[type][0].id; }
  };
  note.addEventListener("input", () => { if (!catTouched && type !== "virement") { const c = Core.categorize(S, note.value, type); if (c) cat.value = c; } });
  catWrap.append(h("label", null, "Catégorie"), cat); toWrap.append(h("label", null, "Vers le compte"), to);
  const body = h("div", null, segEl, field("Montant", amount), catWrap, h("div", null, accLabel, acc), toWrap, field("Date", date), field("Note", note)); refresh();
  const del = t ? h("button", { class: "btn danger", type: "button", onclick: () => { dlg.close(); deleteWithUndo(t); } }, "Supprimer") : null;
  openDlg(t ? "Modifier la transaction" : "Nouvelle transaction", body, () => {
    const n = num(amount.value); if (!(n > 0)) { toast("Montant invalide"); return false; }
    if (type === "virement" && acc.value === to.value) { toast("Choisis deux comptes différents"); return false; }
    const rec = { id: t ? t.id : uid(), date: date.value, type, amount: round2(n), category: type === "virement" ? "" : cat.value, account: acc.value, note: note.value.trim() };
    if (type === "virement") rec.toAccount = to.value; if (t && t.recurringId) rec.recurringId = t.recurringId;
    if (t) { const i = S.transactions.indexOf(t); S.transactions[i] = rec; } else S.transactions.push(rec);
    save(); ui.month = monthKey(rec.date); render(); toast(t ? "Transaction modifiée" : "Transaction ajoutée");
  }, null, del);
  amount.focus();
}
function recurringDialog(r) {
  let type = r ? r.type : "depense";
  const amount = h("input", { type: "number", inputmode: "decimal", step: "0.01", min: "0.01", required: true, value: r ? r.amount : "" });
  const cat = h("select"), acc = accSelect(r ? r.account : S.accounts[0].id), note = h("input", { type: "text", maxlength: "120", value: r ? r.note : "", placeholder: "Ex. Loyer" });
  const day = h("input", { type: "number", min: "1", max: "31", step: "1", required: true, value: r ? r.day : 1 });
  const start = h("input", { type: "date", required: true, value: r ? r.start : todayStr() }), end = h("input", { type: "date", value: r ? r.end : "" });
  const active = h("input", { type: "checkbox", checked: r ? r.active : true, style: "width:auto;min-height:0" }), segEl = h("div", { class: "seg" });
  const refresh = () => { segEl.replaceChildren(...[["depense", "Dépense"], ["revenu", "Revenu"]].map(([id, l]) => h("button", { type: "button", "aria-pressed": type === id, onclick: () => { type = id; refresh(); } }, l))); cat.replaceChildren(...S.categories[type].map(c => h("option", { value: c.id }, c.name))); cat.value = r && r.type === type ? r.category : S.categories[type][0].id; };
  refresh();
  const body = h("div", null, segEl, field("Montant", amount), field("Catégorie", cat), field("Compte", acc), field("Jour du mois (si le mois est plus court : dernier jour)", day), field("À partir du", start), field("Jusqu'au (facultatif)", end), field("Note", note), h("label", { class: "check" }, active, " Active"));
  const del = r ? h("button", { class: "btn danger", type: "button", onclick: async () => { if (await askConfirm("Supprimer cette opération récurrente ? Les transactions déjà créées sont conservées.", "Supprimer")) { S.recurring = S.recurring.filter(x => x.id !== r.id); save(); dlg.close(); render(); } } }, "Supprimer") : null;
  openDlg(r ? "Modifier l'opération récurrente" : "Nouvelle opération récurrente", body, () => {
    const n = num(amount.value); if (!(n > 0)) { toast("Montant invalide"); return false; }
    const rec = { id: r ? r.id : uid(), type, amount: round2(n), category: cat.value, account: acc.value, note: note.value.trim(), day: Math.min(31, Math.max(1, Math.round(+day.value) || 1)), start: start.value, end: end.value, active: active.checked, skipped: r ? r.skipped : [] };
    if (r) Object.assign(r, rec); else S.recurring.push(rec);
    const added = Core.applyRecurring(S); save(); render(); toast(added ? `${added} transaction${added > 1 ? "s" : ""} ajoutée${added > 1 ? "s" : ""}` : "Enregistré");
  }, null, del);
}
function accountDialog(a) {
  const name = h("input", { type: "text", required: true, maxlength: "40", value: a ? a.name : "" });
  const type = h("select", null, [["courant", "Compte courant"], ["epargne", "Compte d'épargne"], ["especes", "Espèces"]].map(([k, l]) => h("option", { value: k, selected: a && a.type === k }, l)));
  const init = h("input", { type: "number", inputmode: "decimal", step: "0.01", value: a ? a.initial : 0 });
  const del = a && S.accounts.length > 1 ? h("button", { class: "btn danger", type: "button", onclick: async () => {
    if (!(await askConfirm(`Supprimer le compte « ${a.name} » ? Ses transactions seront déplacées vers un autre compte (les virements concernés sont supprimés).`, "Supprimer"))) return;
    const other = S.accounts.find(x => x.id !== a.id).id;
    S.transactions = S.transactions.filter(t => !(t.type === "virement" && (t.account === a.id || t.toAccount === a.id)));
    S.transactions.forEach(t => { if (t.account === a.id) t.account = other; }); S.recurring.forEach(r => { if (r.account === a.id) r.account = other; });
    S.accounts = S.accounts.filter(x => x.id !== a.id); save(); dlg.close(); render(); } }, "Supprimer") : null;
  openDlg(a ? "Modifier le compte" : "Nouveau compte", h("div", null, field("Nom", name), field("Type", type), field("Solde de départ", init)), () => {
    if (!name.value.trim()) { toast("Nom requis"); return false; }
    const rec = { id: a ? a.id : uid(), name: name.value.trim(), type: type.value, initial: Number.isFinite(num(init.value)) ? num(init.value) : 0 };
    if (a) Object.assign(a, rec); else S.accounts.push(rec); save(); render();
  }, null, del);
  name.focus();
}
function goalDialog(g) {
  const name = h("input", { type: "text", required: true, maxlength: "60", value: g ? g.name : "" }), target = h("input", { type: "number", inputmode: "decimal", min: "1", step: "1", required: true, value: g ? g.target : "" }), deadline = h("input", { type: "date", value: g ? g.deadline : "" });
  openDlg(g ? "Modifier l'objectif" : "Nouvel objectif", h("div", null, field("Nom", name), field("Montant à atteindre", target), field("Échéance (facultatif)", deadline)), () => {
    const n = num(target.value); if (!(n > 0) || !name.value.trim()) { toast("Nom et montant requis"); return false; }
    if (g) Object.assign(g, { name: name.value.trim(), target: n, deadline: deadline.value }); else S.goals.push({ id: uid(), name: name.value.trim(), target: n, saved: 0, deadline: deadline.value }); save(); render();
  }); name.focus();
}
function contribDialog(g) {
  const amount = h("input", { type: "number", inputmode: "decimal", step: "0.01", required: true, placeholder: "Négatif pour retirer" });
  openDlg("Verser sur « " + g.name + " »", field("Montant", amount), () => {
    const n = num(amount.value); if (!Number.isFinite(n) || n === 0) { toast("Montant invalide"); return false; }
    g.saved = Math.max(0, round2(g.saved + n)); save(); render(); toast(n > 0 ? "Versement ajouté" : "Retrait enregistré");
  }, "Valider"); amount.focus();
}
function categoryDialog(type, c) {
  const name = h("input", { type: "text", required: true, maxlength: "40", value: c ? c.name : "" }), color = h("input", { type: "color", value: c ? c.color : Core.PALETTE[S.categories[type].length % Core.PALETTE.length], style: "padding:2px;height:44px" });
  const group = h("select", null, [["besoins", "Besoins"], ["envies", "Envies"]].map(([k, l]) => h("option", { value: k, selected: c && c.group === k }, l)));
  const fallback = type === "depense" ? "autres" : "autres-revenus";
  const del = c && c.id !== fallback ? h("button", { class: "btn danger", type: "button", onclick: async () => {
    const used = S.transactions.filter(t => t.type === type && t.category === c.id).length;
    if (!(await askConfirm(`Supprimer « ${c.name} » ?${used ? ` Ses ${used} transaction(s) passeront dans « ${catN(type, fallback)} ».` : ""}`, "Supprimer"))) return;
    S.transactions.forEach(t => { if (t.type === type && t.category === c.id) t.category = fallback; }); S.recurring.forEach(r => { if (r.type === type && r.category === c.id) r.category = fallback; });
    S.categories[type] = S.categories[type].filter(x => x.id !== c.id); delete S.budgets[c.id]; S.rules = S.rules.filter(r => r.category !== c.id); save(); dlg.close(); render(); } }, "Supprimer") : null;
  openDlg(c ? "Modifier la catégorie" : "Nouvelle catégorie", h("div", null, field("Nom", name), field("Couleur", color), type === "depense" ? field("Type de dépense (règle 50/30/20)", group) : null), () => {
    const n = name.value.trim(); if (!n) { toast("Nom requis"); return false; }
    if (S.categories[type].some(x => x !== c && x.name.toLowerCase() === n.toLowerCase())) { toast("Cette catégorie existe déjà"); return false; }
    if (c) { c.name = n; c.color = color.value; if (type === "depense") c.group = group.value; }
    else { let id = Core.slug(n) || uid(); if (S.categories[type].some(x => x.id === id)) id = uid(); const o = { id, name: n, color: color.value }; if (type === "depense") o.group = group.value; S.categories[type].push(o); }
    save(); render();
  }, null, del); name.focus();
}
function ruleDialog() {
  const kw = h("input", { type: "text", required: true, maxlength: "40", placeholder: "Ex. boulangerie" });
  const cat = h("select", null, h("optgroup", { label: "Dépenses" }, S.categories.depense.map(c => h("option", { value: c.id }, c.name))), h("optgroup", { label: "Revenus" }, S.categories.revenu.map(c => h("option", { value: c.id }, c.name))));
  openDlg("Nouvelle règle", h("div", null, field("Si la note contient", kw), field("Alors la catégorie est", cat)), () => {
    const k = kw.value.trim().toLowerCase(); if (!k) { toast("Mot-clé requis"); return false; }
    S.rules.unshift({ keyword: k, category: cat.value }); save(); render();
  }); kw.focus();
}
function pinDialog() {
  if (!(window.crypto && crypto.subtle)) { toast("Le verrouillage n'est pas disponible dans ce navigateur."); return; }
  const a = h("input", { type: "password", inputmode: "numeric", maxlength: "12", required: true, autocomplete: "off" }), b = h("input", { type: "password", inputmode: "numeric", maxlength: "12", required: true, autocomplete: "off" });
  openDlg("Code de verrouillage", h("div", null, field("Nouveau code (4 à 12 chiffres)", a), field("Confirmer le code", b)), () => {
    if (!/^\d{4,12}$/.test(a.value)) { toast("Le code doit contenir 4 à 12 chiffres"); return false; }
    if (a.value !== b.value) { toast("Les deux codes sont différents"); return false; }
    const salt = uid(); hashPin(a.value, salt).then(hh => { S.settings.pinSalt = salt; S.settings.pinHash = hh; unlocked = true; save(); render(); toast("Code enregistré"); }); 
  }); a.focus();
}
function importDialog() {
  const file = h("input", { type: "file", accept: ".csv,text/csv,text/plain" });
  openDlg("Importer un relevé CSV", h("div", null, h("p", { class: "muted small-t", style: "margin-top:0" }, "Exporte ton relevé depuis ta banque au format CSV, puis choisis le fichier. Tu pourras vérifier les colonnes avant d'importer."), file), () => { }, false);
  file.addEventListener("change", () => {
    const f = file.files[0]; if (!f) return; const r = new FileReader();
    r.onload = () => { const parsed = Core.parseCSV(String(r.result)); if (parsed.rows.length < 2) { toast("Fichier vide ou illisible"); return; } importMapping(parsed.rows); };
    r.readAsText(f, "utf-8");
  });
}
function importMapping(rows) {
  const g = Core.guessMapping(rows[0]), hasHeader = g.date > -1;
  const colOpts = (sel, none) => [none ? h("option", { value: "-1" }, "(aucune)") : null, rows[0].map((c, i) => h("option", { value: i, selected: i === sel }, hasHeaderBox.checked ? (c.trim() || "Colonne " + (i + 1)) : "Colonne " + (i + 1) + " : " + (c.trim().slice(0, 18)))) ];
  const hasHeaderBox = h("input", { type: "checkbox", checked: hasHeader, style: "width:auto;min-height:0" });
  const mk = (sel, none) => h("select", null, colOpts(sel, none));
  const sDate = mk(g.date), sLabel = mk(g.label, true), sAmount = mk(g.amount, true), sDebit = mk(g.debit, true), sCredit = mk(g.credit, true);
  if (g.amount < 0 && g.amount !== -1) sAmount.value = "-1"; else if (g.amount === -1) sAmount.value = "-1";
  const dupBox = h("input", { type: "checkbox", style: "width:auto;min-height:0" }), acc = accSelect(S.accounts[0].id), preview = h("div", { class: "muted small-t", style: "margin-top:10px" });
  let built = null;
  const compute = () => {
    const map = { date: +sDate.value, label: +sLabel.value, amount: +sAmount.value, debit: +sDebit.value, credit: +sCredit.value };
    if (map.amount < 0 && map.debit < 0 && map.credit < 0) { preview.textContent = "Choisis la colonne Montant, ou les colonnes Débit / Crédit."; built = null; return; }
    built = Core.buildImport(S, rows, map, hasHeaderBox.checked);
    const fresh = built.items.filter(i => !i.dup), dups = built.items.length - fresh.length;
    preview.replaceChildren(h("div", null, `${fresh.length} nouvelle${fresh.length > 1 ? "s" : ""} transaction${fresh.length > 1 ? "s" : ""}, ${dups} déjà présente${dups > 1 ? "s" : ""}, ${built.skipped} ligne${built.skipped > 1 ? "s" : ""} ignorée${built.skipped > 1 ? "s" : ""}.`), built.items.slice(0, 5).map(i => h("div", { class: "row small-t", style: "gap:8px" }, h("span", null, i.date), h("span", { class: "grow", style: "overflow:hidden;text-overflow:ellipsis;white-space:nowrap" }, i.note || "—"), h("span", null, catN(i.type, i.category)), h("b", { class: i.type === "revenu" ? "good" : "" }, (i.type === "revenu" ? "+" : "−") + fmt(i.amount)))));
  };
  [hasHeaderBox, sDate, sLabel, sAmount, sDebit, sCredit, dupBox].forEach(e => e.addEventListener("change", () => { if (e === hasHeaderBox) { for (const [sel, none] of [[sDate, false], [sLabel, true], [sAmount, true], [sDebit, true], [sCredit, true]]) { const cur = sel.value; sel.replaceChildren(...colOpts(+cur, none).flat(Infinity).filter(Boolean)); sel.value = cur; } } compute(); }));
  const body = h("div", null, h("label", { class: "check" }, hasHeaderBox, " La première ligne contient les titres"), field("Colonne de la date", sDate), field("Colonne du libellé", sLabel), field("Colonne du montant (positif = revenu, négatif = dépense)", sAmount), field("… ou colonne Débit", sDebit), field("… et colonne Crédit", sCredit), field("Compte", acc), h("label", { class: "check" }, dupBox, " Importer aussi les doublons"), preview);
  openDlg("Vérifier l'import", body, () => {
    if (!built) { toast("Colonnes à compléter"); return false; }
    const items = built.items.filter(i => dupBox.checked || !i.dup); if (!items.length) { toast("Rien à importer"); return false; }
    items.forEach(i => S.transactions.push({ id: uid(), date: i.date, type: i.type, amount: i.amount, category: i.category, account: acc.value, note: i.note }));
    save(); ui.scope = "tout"; render(); toast(`${items.length} transaction${items.length > 1 ? "s" : ""} importée${items.length > 1 ? "s" : ""}`);
  }, "Importer"); compute();
}

/* ---------- raccourcis et démarrage ---------- */
document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || dlg.open || dlg2.open || (S.settings.pinHash && !unlocked)) return;
  const ae = document.activeElement;
  if (ae && ae.closest && ae.closest("dialog:not([open])")) ae.blur();   /* champ resté actif dans une fenêtre déjà fermée */
  else if (/^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName)) return;
  if (e.key === "n" || e.key === "N") { e.preventDefault(); txDialog(null); }
  else if (e.key === "ArrowLeft" && ["dash", "tx", "bud", "stats"].includes(ui.tab)) { ui.month = shiftMonth(ui.month, -1); render(); }
  else if (e.key === "ArrowRight" && ["dash", "tx", "bud", "stats"].includes(ui.tab)) { ui.month = shiftMonth(ui.month, 1); render(); }
});
if (Core.applyRecurring(S)) save();
applyTheme(); render();
if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register("sw.js").catch(() => { });
