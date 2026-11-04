"use strict";
/* Budget & épargne — application locale, sans serveur. Données dans localStorage. */

const KEY = "budget-epargne-v1";
const CATS_DEP = ["Logement","Alimentation","Transport","Loisirs","Santé","Études","Abonnements","Autres"];
const CATS_REV = ["Salaire","Job étudiant","Bourse / aides","Famille","Autres revenus"];
const COLORS = ["var(--c1)","var(--c2)","var(--c3)","var(--c4)","var(--c5)","var(--c6)","var(--c7)","var(--c8)"];
const NS = "http://www.w3.org/2000/svg";

/* ---------- utilitaires ---------- */
const fmt = (n) => new Intl.NumberFormat("fr-FR",{style:"currency",currency:"EUR"}).format(n || 0);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const pad = (n) => String(n).padStart(2, "0");
const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };
const monthKey = (dateStr) => dateStr.slice(0, 7);
const curMonth = () => todayStr().slice(0, 7);
const shiftMonth = (key, delta) => { const [y, m] = key.split("-").map(Number); const d = new Date(y, m - 1 + delta, 1); return `${d.getFullYear()}-${pad(d.getMonth()+1)}`; };
const monthLabel = (key) => { const [y, m] = key.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("fr-FR",{month:"long",year:"numeric"}); };
const shortMonth = (key) => { const [y, m] = key.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("fr-FR",{month:"short"}); };
const num = (v) => { const n = parseFloat(String(v).replace(",", ".")); return Number.isFinite(n) ? n : NaN; };

function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, "");
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of kids.flat()) { if (c == null || c === false) continue; e.append(c.nodeType ? c : document.createTextNode(c)); }
  return e;
}
function s(tag, attrs, ...kids) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) e.setAttribute(k, v);
  for (const c of kids.flat()) { if (c == null) continue; e.append(c.nodeType ? c : document.createTextNode(c)); }
  return e;
}
function toast(msg) {
  const t = document.getElementById("toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2200);
}

/* ---------- état ---------- */
function defaults() {
  return { transactions: [], budgets: {}, goals: [], challenge: { step: 1, paid: [] } };
}
let state = load();
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaults();
    return normalize(JSON.parse(raw));
  } catch (e) { return defaults(); }
}
function normalize(d) {
  const base = defaults();
  const out = {
    transactions: Array.isArray(d.transactions) ? d.transactions.filter(t => t && t.date && Number.isFinite(+t.amount)).map(t => ({ id: String(t.id || uid()), date: String(t.date).slice(0,10), type: t.type === "revenu" ? "revenu" : "depense", amount: Math.abs(+t.amount), category: String(t.category || "Autres"), note: String(t.note || "") })) : base.transactions,
    budgets: d.budgets && typeof d.budgets === "object" ? Object.fromEntries(Object.entries(d.budgets).filter(([, v]) => Number.isFinite(+v) && +v >= 0).map(([k, v]) => [k, +v])) : {},
    goals: Array.isArray(d.goals) ? d.goals.filter(g => g && g.name).map(g => ({ id: String(g.id || uid()), name: String(g.name), target: Math.max(0, +g.target || 0), saved: Math.max(0, +g.saved || 0), deadline: g.deadline ? String(g.deadline).slice(0,10) : "" })) : [],
    challenge: { step: Math.max(0.01, +(d.challenge && d.challenge.step) || 1), paid: Array.isArray(d.challenge && d.challenge.paid) ? d.challenge.paid.map(Number).filter(n => n >= 1 && n <= 52) : [] },
  };
  return out;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch (e) { toast("Impossible d'enregistrer : stockage du navigateur indisponible."); }
}

/* ---------- calculs ---------- */
const inMonth = (key) => state.transactions.filter(t => monthKey(t.date) === key);
function totals(key) {
  let rev = 0, dep = 0;
  for (const t of inMonth(key)) { if (t.type === "revenu") rev += t.amount; else dep += t.amount; }
  return { rev, dep, solde: rev - dep, taux: rev > 0 ? (rev - dep) / rev : null };
}
function spendByCat(key) {
  const m = {};
  for (const t of inMonth(key)) if (t.type === "depense") m[t.category] = (m[t.category] || 0) + t.amount;
  return m;
}

/* ---------- navigation ---------- */
const TABS = [["dash","Tableau de bord"],["tx","Transactions"],["bud","Budgets"],["epa","Épargne"],["set","Réglages"]];
const ui = { tab: "dash", month: curMonth(), filter: "tous" };
function renderTabs() {
  const nav = document.getElementById("tabs"); nav.replaceChildren();
  for (const [id, label] of TABS) nav.append(h("button", { type: "button", "aria-current": ui.tab === id ? "page" : null, onclick: () => { ui.tab = id; render(); window.scrollTo(0, 0); } }, label));
}
function render() {
  renderTabs();
  const v = document.getElementById("view"); v.replaceChildren();
  ({ dash: viewDash, tx: viewTx, bud: viewBud, epa: viewEpa, set: viewSet })[ui.tab](v);
}
function monthBar() {
  return h("div", { class: "monthbar" },
    h("button", { class: "btn small", type: "button", "aria-label": "Mois précédent", onclick: () => { ui.month = shiftMonth(ui.month, -1); render(); } }, "‹"),
    h("strong", null, monthLabel(ui.month)),
    h("button", { class: "btn small", type: "button", "aria-label": "Mois suivant", onclick: () => { ui.month = shiftMonth(ui.month, 1); render(); } }, "›"),
    h("button", { class: "btn small", type: "button", onclick: () => { ui.month = curMonth(); render(); } }, "Aujourd'hui"));
}

/* ---------- graphiques ---------- */
function donut(data) {
  const total = data.reduce((a, d) => a + d.value, 0);
  const R = 52, C = 2 * Math.PI * R;
  const svg = s("svg", { viewBox: "0 0 140 140", width: "150", height: "150", role: "img", "aria-label": "Répartition des dépenses par catégorie" });
  svg.append(s("circle", { cx: 70, cy: 70, r: R, fill: "none", stroke: "var(--line)", "stroke-width": 18 }));
  let off = 0;
  data.forEach((d, i) => {
    const len = total ? (d.value / total) * C : 0;
    svg.append(s("circle", { cx: 70, cy: 70, r: R, fill: "none", stroke: COLORS[i % COLORS.length], "stroke-width": 18, "stroke-dasharray": `${len} ${C - len}`, "stroke-dashoffset": -off, transform: "rotate(-90 70 70)" }));
    off += len;
  });
  const t = s("text", { x: 70, y: 74, "text-anchor": "middle", style: "fill:var(--ink);font-size:13px;font-weight:700" }, fmt(total));
  svg.append(t);
  return svg;
}
function bars(months) {
  const W = 320, H = 150, pb = 22, max = Math.max(1, ...months.flatMap(m => [m.rev, m.dep]));
  const svg = s("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img", "aria-label": "Revenus et dépenses sur six mois" });
  const gw = W / months.length;
  months.forEach((m, i) => {
    const bw = 16, x0 = i * gw + gw / 2;
    const hr = (m.rev / max) * (H - pb - 8), hd = (m.dep / max) * (H - pb - 8);
    svg.append(s("rect", { x: x0 - bw - 2, y: H - pb - hr, width: bw, height: hr, rx: 3, fill: "var(--c2)" }));
    svg.append(s("rect", { x: x0 + 2, y: H - pb - hd, width: bw, height: hd, rx: 3, fill: "var(--c5)" }));
    svg.append(s("text", { x: x0, y: H - 6, "text-anchor": "middle" }, shortMonth(m.key)));
  });
  svg.append(s("line", { x1: 0, y1: H - pb, x2: W, y2: H - pb, stroke: "var(--line)" }));
  return svg;
}

/* ---------- vues ---------- */
function kpi(label, value, cls) { return h("div", { class: "card kpi" }, h("div", { class: "l" }, label), h("div", { class: "v " + (cls || "") }, value)); }
function txRow(t, withDelete) {
  const idx = (t.type === "depense" ? CATS_DEP : CATS_REV).indexOf(t.category);
  const color = t.type === "revenu" ? "var(--good)" : COLORS[(idx < 0 ? 7 : idx) % COLORS.length];
  return h("div", { class: "tx" },
    h("span", { class: "dot", style: `background:${color}` }),
    h("div", { class: "t" }, h("b", null, t.note || t.category), h("span", null, `${t.category} · ${new Date(t.date + "T12:00:00").toLocaleDateString("fr-FR",{day:"numeric",month:"short"})}`)),
    h("div", { class: "a " + (t.type === "revenu" ? "good" : "") }, (t.type === "revenu" ? "+" : "−") + fmt(t.amount).replace("-", "")),
    withDelete ? h("button", { class: "btn small", type: "button", "aria-label": "Modifier", onclick: () => txDialog(t) }, "✎") : null);
}
function viewDash(v) {
  const T = totals(ui.month), sp = spendByCat(ui.month);
  v.append(monthBar());
  v.append(h("div", { class: "grid cards" },
    kpi("Revenus", fmt(T.rev), "good"), kpi("Dépenses", fmt(T.dep)),
    kpi("Solde du mois", fmt(T.solde), T.solde >= 0 ? "good" : "bad"),
    kpi("Taux d'épargne", T.taux == null ? "—" : Math.round(T.taux * 100) + " %", T.taux != null && T.taux < 0 ? "bad" : "")));
  const entries = Object.entries(sp).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));
  const cardCat = h("div", { class: "card" }, h("h2", null, "Dépenses par catégorie"));
  if (!entries.length) cardCat.append(h("div", { class: "empty" }, "Aucune dépense ce mois-ci."));
  else {
    cardCat.append(h("div", { class: "row" }, donut(entries),
      h("div", { class: "legend grow" }, entries.map((d, i) => h("div", null, h("i", { style: `background:${COLORS[i % COLORS.length]}` }), h("span", null, d.name), h("span", null, fmt(d.value)))))));
  }
  const months = [];
  for (let i = 5; i >= 0; i--) { const k = shiftMonth(ui.month, -i), t = totals(k); months.push({ key: k, rev: t.rev, dep: t.dep }); }
  const cardBars = h("div", { class: "card" }, h("h2", null, "Six derniers mois"), bars(months),
    h("div", { class: "row muted", style: "font-size:13px;gap:14px" }, h("span", null, "■ revenus"), h("span", null, "■ dépenses")));
  cardBars.querySelectorAll("span")[0].style.color = "var(--c2)"; cardBars.querySelectorAll("span")[1].style.color = "var(--c5)";
  v.append(h("div", { class: "grid two", style: "margin-top:12px" }, cardCat, cardBars));

  const budCard = h("div", { class: "card", style: "margin-top:12px" }, h("h2", null, "Budgets du mois"));
  const withB = CATS_DEP.filter(c => state.budgets[c] > 0);
  if (!withB.length) budCard.append(h("div", { class: "empty" }, "Aucun budget défini. ", h("button", { class: "btn small", type: "button", onclick: () => { ui.tab = "bud"; render(); } }, "Définir mes budgets")));
  else withB.forEach(c => budCard.append(budRow(c, sp[c] || 0, state.budgets[c])));
  v.append(budCard);

  const recent = inMonth(ui.month).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5);
  const recCard = h("div", { class: "card", style: "margin-top:12px" }, h("h2", null, "Dernières transactions"));
  if (!recent.length) recCard.append(h("div", { class: "empty" }, "Rien pour l'instant. Ajoute ta première transaction avec le bouton +."));
  else recent.forEach(t => recCard.append(txRow(t, false)));
  v.append(recCard);
  fab(v);
}
function budRow(cat, spent, limit) {
  const pct = limit > 0 ? spent / limit : 0;
  const cls = pct > 1 ? "over" : pct >= 0.8 ? "warn" : "";
  return h("div", { class: "item" },
    h("div", { class: "row" }, h("b", { class: "grow" }, cat), h("span", { class: pct > 1 ? "bad" : "muted" }, `${fmt(spent)} / ${fmt(limit)}`)),
    h("div", { class: "bar " + cls, style: "margin-top:6px", role: "progressbar", "aria-valuenow": Math.round(pct * 100), "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": "Budget " + cat }, h("i", { style: `width:${Math.min(100, pct * 100)}%` })),
    pct > 1 ? h("div", { class: "bad", style: "font-size:13px;margin-top:4px" }, `Dépassé de ${fmt(spent - limit)}`) : h("div", { class: "muted", style: "font-size:13px;margin-top:4px" }, `Reste ${fmt(limit - spent)}`));
}
function fab(v) { v.append(h("button", { class: "btn primary fab", type: "button", onclick: () => txDialog(null) }, "+ Transaction")); }

function viewTx(v) {
  v.append(monthBar());
  v.append(h("div", { class: "seg", style: "margin-bottom:12px" }, [["tous","Tout"],["depense","Dépenses"],["revenu","Revenus"]].map(([id, l]) => h("button", { type: "button", "aria-pressed": ui.filter === id, onclick: () => { ui.filter = id; render(); } }, l))));
  const list = inMonth(ui.month).filter(t => ui.filter === "tous" || t.type === ui.filter).sort((a, b) => b.date.localeCompare(a.date));
  const card = h("div", { class: "card" });
  if (!list.length) card.append(h("div", { class: "empty" }, "Aucune transaction pour ce filtre."));
  else list.forEach(t => card.append(txRow(t, true)));
  v.append(card); fab(v);
}
function viewBud(v) {
  v.append(monthBar());
  const sp = spendByCat(ui.month);
  const card = h("div", { class: "card" }, h("h2", null, "Plafond mensuel par catégorie (laisse vide pour ne pas en fixer)"));
  CATS_DEP.forEach(c => {
    const inp = h("input", { type: "number", inputmode: "decimal", min: "0", step: "1", placeholder: "Pas de plafond", value: state.budgets[c] != null ? state.budgets[c] : "", "aria-label": "Plafond " + c, style: "max-width:160px" });
    inp.addEventListener("change", () => { const n = num(inp.value); if (inp.value.trim() === "" ) delete state.budgets[c]; else if (n >= 0) state.budgets[c] = n; save(); render(); });
    card.append(h("div", { class: "item" }, h("div", { class: "row" }, h("b", { class: "grow" }, c), inp), state.budgets[c] > 0 ? budRow(c, sp[c] || 0, state.budgets[c]) : h("div", { class: "muted", style: "font-size:13px;margin-top:4px" }, `Dépensé ce mois : ${fmt(sp[c] || 0)}`)));
  });
  v.append(card);
}

function viewEpa(v) {
  /* Objectifs */
  const gHead = h("div", { class: "row", style: "margin-bottom:10px" }, h("h2", { class: "grow", style: "margin:0;font-size:17px" }, "Objectifs d'épargne"), h("button", { class: "btn primary small", type: "button", onclick: () => goalDialog() }, "+ Objectif"));
  v.append(gHead);
  const gCard = h("div", { class: "card" });
  if (!state.goals.length) gCard.append(h("div", { class: "empty" }, "Aucun objectif. Crée-en un : voyage, ordinateur, fonds d'urgence…"));
  state.goals.forEach(g => {
    const pct = g.target > 0 ? g.saved / g.target : 0, done = pct >= 1;
    let hint = "";
    if (!done && g.deadline) {
      const now = new Date(), end = new Date(g.deadline + "T12:00:00");
      const months = Math.max(1, (end.getFullYear() - now.getFullYear()) * 12 + end.getMonth() - now.getMonth() + (end.getDate() >= now.getDate() ? 0 : -1) + (end < now ? 0 : 1));
      hint = end < now ? "Échéance dépassée." : `À mettre de côté : ${fmt((g.target - g.saved) / months)} par mois jusqu'au ${end.toLocaleDateString("fr-FR")}.`;
    }
    gCard.append(h("div", { class: "item" },
      h("div", { class: "row" }, h("b", { class: "grow" }, g.name), h("span", { class: done ? "good" : "muted" }, `${fmt(g.saved)} / ${fmt(g.target)}`)),
      h("div", { class: "bar " + (done ? "done" : ""), style: "margin:6px 0", role: "progressbar", "aria-valuenow": Math.round(pct * 100), "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": "Objectif " + g.name }, h("i", { style: `width:${Math.min(100, pct * 100)}%` })),
      h("div", { class: "muted", style: "font-size:13px" }, done ? "Objectif atteint 🎉" : hint),
      h("div", { class: "row", style: "margin-top:8px" },
        h("button", { class: "btn small", type: "button", onclick: () => contribDialog(g) }, "+ Verser"),
        h("button", { class: "btn small", type: "button", onclick: () => goalDialog(g) }, "Modifier"),
        h("button", { class: "btn small danger", type: "button", onclick: () => { if (confirm(`Supprimer l'objectif « ${g.name} » ?`)) { state.goals = state.goals.filter(x => x.id !== g.id); save(); render(); } } }, "Supprimer"))));
  });
  v.append(gCard);

  /* Défi 52 semaines */
  const step = state.challenge.step, paid = new Set(state.challenge.paid);
  const total = step * (52 * 53 / 2);
  const saved = [...paid].reduce((a, w) => a + w * step, 0);
  const stepInp = h("input", { type: "number", inputmode: "decimal", min: "0.01", step: "0.5", value: step, style: "max-width:120px", "aria-label": "Montant de base du défi" });
  stepInp.addEventListener("change", () => { const n = num(stepInp.value); if (n > 0) { state.challenge.step = n; save(); render(); } });
  const weeks = h("div", { class: "weeks" });
  for (let w = 1; w <= 52; w++) weeks.append(h("button", { type: "button", "aria-pressed": paid.has(w), "aria-label": `Semaine ${w}, ${fmt(w * step)}`, onclick: () => { paid.has(w) ? paid.delete(w) : paid.add(w); state.challenge.paid = [...paid].sort((a, b) => a - b); save(); render(); } }, h("span", null, "S" + w), h("b", null, fmt(w * step).replace(/ €/, "€"))));
  v.append(h("div", { class: "card", style: "margin-top:16px" },
    h("h2", null, "Défi des 52 semaines"),
    h("div", { class: "muted", style: "font-size:14px;margin-bottom:10px" }, "Semaine 1 : montant de base, semaine 2 : le double, etc. Coche chaque semaine réalisée."),
    h("div", { class: "row" }, h("label", { style: "margin:0" }, "Montant de base (€)"), stepInp, h("span", { class: "grow" }), h("b", null, `${fmt(saved)} / ${fmt(total)}`)),
    h("div", { class: "bar " + (saved >= total ? "done" : ""), style: "margin:10px 0 14px" }, h("i", { style: `width:${Math.min(100, saved / total * 100)}%` })),
    weeks));
}

function viewSet(v) {
  const card = h("div", { class: "card" }, h("h2", null, "Données"),
    h("p", { class: "muted", style: "margin-top:0" }, "Tout est enregistré dans ce navigateur, sur cet appareil. Fais une sauvegarde de temps en temps."),
    h("div", { class: "row" },
      h("button", { class: "btn", type: "button", onclick: exportJSON }, "Sauvegarder (JSON)"),
      h("button", { class: "btn", type: "button", onclick: exportCSV }, "Exporter en CSV"),
      h("label", { class: "btn", style: "margin:0;cursor:pointer;color:var(--ink);font-size:16px" }, "Restaurer une sauvegarde", h("input", { type: "file", accept: "application/json,.json", style: "display:none", onchange: importJSON }))),
    h("div", { class: "row", style: "margin-top:12px" },
      h("button", { class: "btn", type: "button", onclick: demo }, "Charger des données d'exemple"),
      h("button", { class: "btn danger", type: "button", onclick: () => { if (confirm("Effacer toutes les données ? Cette action est définitive.")) { state = defaults(); save(); render(); toast("Données effacées"); } } }, "Tout effacer")));
  v.append(card);
}
function download(name, text, mime) {
  const a = h("a", { href: URL.createObjectURL(new Blob([text], { type: mime })), download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function exportJSON() { download(`budget-sauvegarde-${todayStr()}.json`, JSON.stringify(state, null, 2), "application/json"); }
function exportCSV() {
  const q = (x) => `"${String(x).replace(/"/g, '""')}"`;
  const rows = [["date","type","montant","categorie","note"].join(";")].concat(state.transactions.slice().sort((a, b) => a.date.localeCompare(b.date)).map(t => [t.date, t.type, String(t.amount).replace(".", ","), q(t.category), q(t.note)].join(";")));
  download(`budget-transactions-${todayStr()}.csv`, "﻿" + rows.join("\n"), "text/csv");
}
function importJSON(ev) {
  const f = ev.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { try { const d = normalize(JSON.parse(r.result)); if (confirm(`Remplacer les données actuelles par la sauvegarde (${d.transactions.length} transactions) ?`)) { state = d; save(); render(); toast("Sauvegarde restaurée"); } } catch (e) { toast("Fichier invalide."); } };
  r.readAsText(f);
}
function demo() {
  if (state.transactions.length && !confirm("Ajouter des données d'exemple à tes données actuelles ?")) return;
  const now = curMonth();
  for (let i = 0; i < 4; i++) {
    const k = shiftMonth(now, -i);
    const add = (d, type, amount, category, note) => state.transactions.push({ id: uid(), date: `${k}-${pad(d)}`, type, amount, category, note });
    add(1, "revenu", 650, "Job étudiant", "Salaire job"); add(5, "revenu", 200, "Famille", "Aide");
    add(2, "depense", 380, "Logement", "Loyer"); add(8, "depense", 62 + i * 7, "Alimentation", "Courses"); add(15, "depense", 71, "Alimentation", "Courses");
    add(10, "depense", 30, "Transport", "Pass"); add(12, "depense", 25 + i * 4, "Loisirs", "Sortie"); add(20, "depense", 14, "Abonnements", "Streaming");
  }
  state.budgets = Object.assign({ Alimentation: 160, Loisirs: 50, Transport: 40 }, state.budgets);
  if (!state.goals.length) state.goals.push({ id: uid(), name: "Voyage été", target: 600, saved: 180, deadline: `${new Date().getFullYear() + 1}-06-30` });
  save(); render(); toast("Données d'exemple ajoutées");
}

/* ---------- boîtes de dialogue ---------- */
const dlg = document.getElementById("dlg");
function openDlg(title, body, onSubmit, submitLabel, extra) {
  dlg.replaceChildren();
  const form = h("form", { method: "dialog" }, h("h3", null, title), body,
    h("div", { class: "actions" }, extra || null, h("button", { class: "btn", type: "button", onclick: () => dlg.close() }, "Annuler"), h("button", { class: "btn primary", type: "submit" }, submitLabel || "Enregistrer")));
  form.addEventListener("submit", (e) => { e.preventDefault(); if (onSubmit() !== false) dlg.close(); });
  dlg.append(form); dlg.showModal();
}
function field(label, input) { return h("div", null, h("label", null, label), input); }
function txDialog(t) {
  let type = t ? t.type : "depense";
  const amount = h("input", { type: "number", inputmode: "decimal", step: "0.01", min: "0.01", required: true, value: t ? t.amount : "" });
  const date = h("input", { type: "date", required: true, value: t ? t.date : (monthKey(todayStr()) === ui.month ? todayStr() : ui.month + "-01") });
  const note = h("input", { type: "text", maxlength: "80", placeholder: "Facultatif", value: t ? t.note : "" });
  const cat = h("select");
  const fill = () => { cat.replaceChildren(...(type === "depense" ? CATS_DEP : CATS_REV).map(c => h("option", { value: c }, c))); if (t && t.type === type) cat.value = t.category; };
  const seg = h("div", { class: "seg" });
  const drawSeg = () => { seg.replaceChildren(...[["depense","Dépense"],["revenu","Revenu"]].map(([id, l]) => h("button", { type: "button", "aria-pressed": type === id, onclick: () => { type = id; drawSeg(); fill(); } }, l))); };
  drawSeg(); fill();
  const body = h("div", null, seg, field("Montant (€)", amount), field("Catégorie", cat), field("Date", date), field("Note", note));
  const del = t ? h("button", { class: "btn danger", type: "button", onclick: () => { state.transactions = state.transactions.filter(x => x.id !== t.id); save(); dlg.close(); render(); toast("Transaction supprimée"); } }, "Supprimer") : null;
  openDlg(t ? "Modifier la transaction" : "Nouvelle transaction", body, () => {
    const n = num(amount.value); if (!(n > 0)) { toast("Montant invalide"); return false; }
    const rec = { id: t ? t.id : uid(), date: date.value, type, amount: Math.round(n * 100) / 100, category: cat.value, note: note.value.trim() };
    if (t) Object.assign(t, rec); else state.transactions.push(rec);
    save(); ui.month = monthKey(rec.date); render(); toast(t ? "Transaction modifiée" : "Transaction ajoutée");
  }, null, del);
  amount.focus();
}
function goalDialog(g) {
  const name = h("input", { type: "text", required: true, maxlength: "60", value: g ? g.name : "" });
  const target = h("input", { type: "number", inputmode: "decimal", min: "1", step: "1", required: true, value: g ? g.target : "" });
  const deadline = h("input", { type: "date", value: g ? g.deadline : "" });
  openDlg(g ? "Modifier l'objectif" : "Nouvel objectif", h("div", null, field("Nom", name), field("Montant à atteindre (€)", target), field("Échéance (facultatif)", deadline)), () => {
    const n = num(target.value); if (!(n > 0) || !name.value.trim()) { toast("Nom et montant requis"); return false; }
    if (g) Object.assign(g, { name: name.value.trim(), target: n, deadline: deadline.value }); else state.goals.push({ id: uid(), name: name.value.trim(), target: n, saved: 0, deadline: deadline.value });
    save(); render();
  });
  name.focus();
}
function contribDialog(g) {
  const amount = h("input", { type: "number", inputmode: "decimal", step: "0.01", required: true, placeholder: "Négatif pour retirer" });
  openDlg("Verser sur « " + g.name + " »", field("Montant (€)", amount), () => {
    const n = num(amount.value); if (!Number.isFinite(n) || n === 0) { toast("Montant invalide"); return false; }
    g.saved = Math.max(0, Math.round((g.saved + n) * 100) / 100); save(); render(); toast(n > 0 ? "Versement ajouté" : "Retrait enregistré");
  }, "Valider");
  amount.focus();
}

render();
