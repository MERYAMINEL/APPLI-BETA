"use strict";
/* Logique métier pure (sans DOM), utilisable dans le navigateur et dans Node pour les tests. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Core = factory();
})(typeof self !== "undefined" ? self : this, function () {

  const VERSION = 2;
  const CURRENCIES = { EUR: "Euro (€)", USD: "Dollar US ($)", GBP: "Livre (£)", CHF: "Franc suisse", CAD: "Dollar canadien", MAD: "Dirham marocain", TND: "Dinar tunisien", DZD: "Dinar algérien", XOF: "Franc CFA" };

  /* ---------- utilitaires ---------- */
  const pad = (n) => String(n).padStart(2, "0");
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const dateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayStr = () => dateStr(new Date());
  const monthKey = (ds) => ds.slice(0, 7);
  const shiftMonth = (key, delta) => { const [y, m] = key.split("-").map(Number); const d = new Date(y, m - 1 + delta, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
  const daysInMonth = (key) => { const [y, m] = key.split("-").map(Number); return new Date(y, m, 0).getDate(); };
  const slug = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const money = (n, cur) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: cur || "EUR", maximumFractionDigits: 2 }).format(n || 0);
  const isDate = (s) => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + "T12:00:00"));

  /* ---------- état par défaut ---------- */
  const DEFAULT_DEP = [
    ["logement", "Logement", "besoins"], ["alimentation", "Alimentation", "besoins"], ["transport", "Transport", "besoins"],
    ["sante", "Santé", "besoins"], ["etudes", "Études", "besoins"], ["abonnements", "Abonnements", "envies"],
    ["loisirs", "Loisirs", "envies"], ["autres", "Autres", "envies"]];
  const DEFAULT_REV = [["salaire", "Salaire"], ["job-etudiant", "Job étudiant"], ["bourse-aides", "Bourse / aides"], ["famille", "Famille"], ["autres-revenus", "Autres revenus"]];
  const PALETTE = ["#2f6fed", "#1a9b5f", "#d98a0b", "#8a5cf6", "#d6453d", "#0ea5b7", "#e0559b", "#7a8699", "#84cc16", "#f97316", "#14b8a6", "#a855f7"];
  const DEFAULT_RULES = [
    ["carrefour", "alimentation"], ["leclerc", "alimentation"], ["auchan", "alimentation"], ["lidl", "alimentation"], ["monoprix", "alimentation"], ["boulangerie", "alimentation"], ["restaurant", "alimentation"],
    ["sncf", "transport"], ["ratp", "transport"], ["navigo", "transport"], ["uber", "transport"], ["essence", "transport"], ["total", "transport"],
    ["netflix", "abonnements"], ["spotify", "abonnements"], ["disney", "abonnements"], ["amazon prime", "abonnements"], ["free mobile", "abonnements"], ["orange", "abonnements"],
    ["loyer", "logement"], ["edf", "logement"], ["engie", "logement"], ["pharmacie", "sante"], ["mutuelle", "sante"], ["cinema", "loisirs"], ["cinéma", "loisirs"], ["salaire", "salaire"], ["caf", "bourse-aides"], ["crous", "bourse-aides"]];

  function defaults() {
    return {
      version: VERSION,
      settings: { currency: "EUR", theme: "auto", accent: "blue", pinHash: "", pinSalt: "" },
      categories: {
        depense: DEFAULT_DEP.map(([id, name, group], i) => ({ id, name, group, color: PALETTE[i % PALETTE.length] })),
        revenu: DEFAULT_REV.map(([id, name], i) => ({ id, name, color: PALETTE[i % PALETTE.length] })),
      },
      accounts: [{ id: "main", name: "Compte courant", type: "courant", initial: 0 }],
      transactions: [], recurring: [], budgets: {}, goals: [], challenge: { step: 1, paid: [] },
      rules: DEFAULT_RULES.map(([keyword, category]) => ({ keyword, category })),
    };
  }

  /* ---------- normalisation et migration (v1 -> v2) ---------- */
  function normalize(d) {
    const base = defaults();
    d = d && typeof d === "object" ? d : {};
    const st = Object.assign(base, { settings: Object.assign(base.settings, d.settings || {}) });
    if (!CURRENCIES[st.settings.currency]) st.settings.currency = "EUR";

    const cleanCats = (arr, fallback, isDep) => {
      if (!Array.isArray(arr) || !arr.length) return fallback;
      const seen = new Set(), out = [];
      for (const c of arr) {
        if (!c || !c.name) continue;
        const id = String(c.id || slug(c.name) || uid()); if (seen.has(id)) continue; seen.add(id);
        const o = { id, name: String(c.name).slice(0, 40), color: /^#[0-9a-f]{6}$/i.test(c.color) ? c.color : PALETTE[out.length % PALETTE.length] };
        if (isDep) o.group = ["besoins", "envies"].includes(c.group) ? c.group : "envies";
        out.push(o);
      }
      return out.length ? out : fallback;
    };
    st.categories = { depense: cleanCats(d.categories && d.categories.depense, base.categories.depense, true), revenu: cleanCats(d.categories && d.categories.revenu, base.categories.revenu, false) };

    st.accounts = (Array.isArray(d.accounts) && d.accounts.length ? d.accounts : base.accounts).filter(a => a && a.name).map(a => ({ id: String(a.id || uid()), name: String(a.name).slice(0, 40), type: ["courant", "epargne", "especes"].includes(a.type) ? a.type : "courant", initial: Number.isFinite(+a.initial) ? +a.initial : 0 }));
    if (!st.accounts.length) st.accounts = base.accounts;
    const mainId = st.accounts[0].id, accIds = new Set(st.accounts.map(a => a.id));

    const catIdFor = (type, ref) => {
      const list = st.categories[type]; ref = String(ref || "");
      let c = list.find(x => x.id === ref) || list.find(x => x.name === ref) || list.find(x => slug(x.name) === slug(ref));
      if (!c) { c = { id: slug(ref) || uid(), name: ref || "Autres", color: PALETTE[list.length % PALETTE.length] }; if (type === "depense") c.group = "envies"; if (list.some(x => x.id === c.id)) c.id = uid(); list.push(c); }
      return c.id;
    };

    st.transactions = (Array.isArray(d.transactions) ? d.transactions : []).filter(t => t && isDate(String(t.date).slice(0, 10)) && Number.isFinite(+t.amount) && +t.amount !== 0).map(t => {
      const type = t.type === "revenu" ? "revenu" : t.type === "virement" ? "virement" : "depense";
      const o = { id: String(t.id || uid()), date: String(t.date).slice(0, 10), type, amount: round2(Math.abs(+t.amount)), note: String(t.note || "").slice(0, 120), account: accIds.has(t.account) ? t.account : mainId };
      if (type === "virement") { o.toAccount = accIds.has(t.toAccount) && t.toAccount !== o.account ? t.toAccount : (st.accounts.find(a => a.id !== o.account) || {}).id; if (!o.toAccount) return null; o.category = ""; }
      else o.category = catIdFor(type, t.category);
      if (t.recurringId) o.recurringId = String(t.recurringId);
      return o;
    }).filter(Boolean);

    st.recurring = (Array.isArray(d.recurring) ? d.recurring : []).filter(r => r && Number.isFinite(+r.amount) && +r.amount > 0 && isDate(String(r.start))).map(r => {
      const type = r.type === "revenu" ? "revenu" : "depense";
      return { id: String(r.id || uid()), type, amount: round2(+r.amount), category: catIdFor(type, r.category), account: accIds.has(r.account) ? r.account : mainId, note: String(r.note || "").slice(0, 120), day: Math.min(31, Math.max(1, Math.round(+r.day) || 1)), start: String(r.start), end: isDate(String(r.end)) ? String(r.end) : "", active: r.active !== false, skipped: Array.isArray(r.skipped) ? r.skipped.map(String) : [] };
    });

    st.budgets = {};
    if (d.budgets && typeof d.budgets === "object") for (const [k, v] of Object.entries(d.budgets)) if (Number.isFinite(+v) && +v >= 0) st.budgets[catIdFor("depense", k)] = +v;

    st.goals = (Array.isArray(d.goals) ? d.goals : []).filter(g => g && g.name).map(g => ({ id: String(g.id || uid()), name: String(g.name).slice(0, 60), target: Math.max(0, +g.target || 0), saved: Math.max(0, +g.saved || 0), deadline: isDate(String(g.deadline)) ? String(g.deadline) : "" }));
    const ch = d.challenge || {};
    st.challenge = { step: Math.max(0.01, +ch.step || 1), paid: Array.isArray(ch.paid) ? [...new Set(ch.paid.map(Number).filter(n => n >= 1 && n <= 52))].sort((a, b) => a - b) : [] };
    if (Array.isArray(d.rules)) st.rules = d.rules.filter(r => r && r.keyword).map(r => ({ keyword: String(r.keyword).toLowerCase().slice(0, 40), category: String(r.category || "autres") }));
    st.version = VERSION;
    return st;
  }

  /* ---------- catégories ---------- */
  const catList = (st, type) => st.categories[type === "revenu" ? "revenu" : "depense"];
  const findCat = (st, type, id) => catList(st, type).find(c => c.id === id);
  const catName = (st, type, id) => { const c = findCat(st, type, id); return c ? c.name : (id || "—"); };
  const catColor = (st, type, id) => { const c = findCat(st, type, id); return c ? c.color : "#7a8699"; };

  /* ---------- sélection et agrégats ---------- */
  const inMonth = (st, key) => st.transactions.filter(t => monthKey(t.date) === key);
  const between = (st, from, to) => st.transactions.filter(t => t.date >= from && t.date <= to);
  function sum(list) { let rev = 0, dep = 0; for (const t of list) { if (t.type === "revenu") rev += t.amount; else if (t.type === "depense") dep += t.amount; } rev = round2(rev); dep = round2(dep); return { rev, dep, solde: round2(rev - dep), taux: rev > 0 ? (rev - dep) / rev : null }; }
  const totals = (st, key) => sum(inMonth(st, key));
  function spendBy(list) { const m = {}; for (const t of list) if (t.type === "depense") m[t.category] = round2((m[t.category] || 0) + t.amount); return m; }
  const spendByCat = (st, key) => spendBy(inMonth(st, key));
  function monthlySeries(st, key, n) { const out = []; for (let i = n - 1; i >= 0; i--) { const k = shiftMonth(key, -i); out.push(Object.assign({ key: k }, totals(st, k))); } return out; }

  function accountBalance(st, id, upTo) {
    const a = st.accounts.find(x => x.id === id); if (!a) return 0;
    let b = a.initial;
    for (const t of st.transactions) {
      if (upTo && t.date > upTo) continue;
      if (t.type === "revenu" && t.account === id) b += t.amount;
      else if (t.type === "depense" && t.account === id) b -= t.amount;
      else if (t.type === "virement") { if (t.account === id) b -= t.amount; if (t.toAccount === id) b += t.amount; }
    }
    return round2(b);
  }

  /* ---------- opérations récurrentes ---------- */
  function applyRecurring(st, today) {
    let added = 0; today = today || todayStr();
    const have = new Set(st.transactions.filter(t => t.recurringId).map(t => t.recurringId + "|" + monthKey(t.date)));
    for (const r of st.recurring) {
      if (!r.active) continue;
      let k = monthKey(r.start); const last = monthKey(today);
      for (let guard = 0; k <= last && guard < 600; guard++, k = shiftMonth(k, 1)) {
        const date = `${k}-${pad(Math.min(r.day, daysInMonth(k)))}`;
        if (date < r.start || date > today || (r.end && date > r.end)) continue;
        if (have.has(r.id + "|" + k) || r.skipped.includes(k)) continue;
        st.transactions.push({ id: uid(), date, type: r.type, amount: r.amount, category: r.category, account: r.account, note: r.note, recurringId: r.id });
        have.add(r.id + "|" + k); added++;
      }
    }
    return added;
  }
  function removeTransaction(st, id) {
    const t = st.transactions.find(x => x.id === id); if (!t) return null;
    st.transactions = st.transactions.filter(x => x.id !== id);
    if (t.recurringId) { const r = st.recurring.find(x => x.id === t.recurringId); if (r && !r.skipped.includes(monthKey(t.date))) r.skipped.push(monthKey(t.date)); }
    return t;
  }

  /* ---------- import CSV ---------- */
  function parseCSV(text) {
    text = String(text).replace(/^﻿/, "");
    const first = text.split(/\r?\n/).find(l => l.trim()) || "";
    const count = (c) => (first.match(new RegExp(c === "\t" ? "\\t" : "\\" + c, "g")) || []).length;
    const delimiter = [";", ",", "\t"].map(c => [c, count(c)]).sort((a, b) => b[1] - a[1])[0][0];
    const rows = []; let row = [], cur = "", q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === delimiter) { row.push(cur); cur = ""; }
      else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); cur = ""; if (row.some(c => c.trim() !== "")) rows.push(row); row = []; }
      else cur += ch;
    }
    row.push(cur); if (row.some(c => c.trim() !== "")) rows.push(row);
    return { rows, delimiter };
  }
  function parseDate(s) {
    s = String(s || "").trim(); let m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return chk(+m[1], +m[2], +m[3]);
    if ((m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/))) { let y = +m[3]; if (y < 100) y += 2000; return chk(y, +m[2], +m[1]); }
    return null;
    function chk(y, mo, d) { const dt = new Date(y, mo - 1, d); return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d ? `${y}-${pad(mo)}-${pad(d)}` : null; }
  }
  function parseAmount(s) {
    let v = String(s == null ? "" : s).trim(); if (!v) return NaN;
    let neg = false;
    if (/^\(.*\)$/.test(v)) { neg = true; v = v.slice(1, -1); }
    if (/-\s*$/.test(v)) { neg = true; v = v.replace(/-\s*$/, ""); }
    v = v.replace(/[\s  ]/g, "").replace(/[^\d.,+-]/g, "");
    if (v.startsWith("-")) { neg = !neg; v = v.slice(1); } else if (v.startsWith("+")) v = v.slice(1);
    const lc = v.lastIndexOf(","), ld = v.lastIndexOf(".");
    if (lc > -1 && ld > -1) v = lc > ld ? v.replace(/\./g, "").replace(",", ".") : v.replace(/,/g, "");
    else if (lc > -1) v = v.replace(",", ".");
    const n = parseFloat(v); return Number.isFinite(n) ? (neg ? -n : n) : NaN;
  }
  function guessMapping(header) {
    const find = (re) => header.findIndex(h => re.test(String(h)));
    return { date: find(/date/i), label: find(/libell|descr|note|memo|d[ée]tail|label|intitul|objet/i), amount: find(/^\s*(montant|amount|valeur|somme)/i), debit: find(/d[ée]bit/i), credit: find(/cr[ée]dit/i) };
  }
  function categorize(st, note, type) {
    const n = String(note || "").toLowerCase(); if (!n) return null;
    for (const r of st.rules) if (n.includes(r.keyword) && findCat(st, type || "depense", r.category)) return r.category;
    return null;
  }
  function buildImport(st, rows, map, hasHeader) {
    const data = hasHeader ? rows.slice(1) : rows; const items = []; let skipped = 0;
    const seen = new Set(st.transactions.map(t => [t.date, t.type, t.amount, t.note.toLowerCase()].join("|")));
    for (const r of data) {
      const date = parseDate(r[map.date]); let type, amount;
      if (map.amount > -1) { const a = parseAmount(r[map.amount]); if (!Number.isFinite(a) || a === 0) { skipped++; continue; } type = a < 0 ? "depense" : "revenu"; amount = Math.abs(a); }
      else { const d = parseAmount(r[map.debit]), c = parseAmount(r[map.credit]); if (Number.isFinite(d) && d !== 0) { type = "depense"; amount = Math.abs(d); } else if (Number.isFinite(c) && c !== 0) { type = "revenu"; amount = Math.abs(c); } else { skipped++; continue; } }
      if (!date) { skipped++; continue; }
      const note = String(map.label > -1 ? r[map.label] || "" : "").trim().slice(0, 120); amount = round2(amount);
      const key = [date, type, amount, note.toLowerCase()].join("|"); const dup = seen.has(key); seen.add(key);
      items.push({ date, type, amount, note, category: categorize(st, note, type) || (type === "revenu" ? "autres-revenus" : "autres"), dup });
    }
    return { items, skipped };
  }

  /* ---------- analyses ---------- */
  function forecast(st, key, today) {
    today = today || todayStr(); if (monthKey(today) !== key) return null;
    const day = +today.slice(8, 10), dim = daysInMonth(key), t = totals(st, key);
    /* Les dépenses fixes (récurrentes ou de logement) ne sont pas extrapolées : seul le variable est projeté. */
    let fixed = 0;
    for (const x of inMonth(st, key)) if (x.type === "depense" && (x.recurringId || x.category === "logement")) fixed += x.amount;
    fixed = round2(fixed); const variable = round2(t.dep - fixed), perDay = variable / day;
    return { day, dim, spent: t.dep, fixed, variable, perDay, reliable: day >= 5, projected: round2(fixed + perDay * dim), revenus: t.rev, remainingDays: dim - day };
  }
  function rule503020(st, key) {
    const t = totals(st, key), sp = spendByCat(st, key); let besoins = 0, envies = 0;
    for (const [id, v] of Object.entries(sp)) { const c = findCat(st, "depense", id); if (c && c.group === "besoins") besoins += v; else envies += v; }
    const base = t.rev || 0; const epargne = Math.max(0, t.rev - t.dep);
    return { base, besoins, envies, epargne, pct: base > 0 ? { besoins: besoins / base, envies: envies / base, epargne: epargne / base } : null };
  }
  function insights(st, key, today) {
    const out = [], cur = st.settings.currency, t = totals(st, key), prev = totals(st, shiftMonth(key, -1));
    const sp = spendByCat(st, key), spPrev = spendByCat(st, shiftMonth(key, -1));
    if (!inMonth(st, key).length) return [{ type: "info", text: "Ajoute des transactions pour voir apparaître des conseils personnalisés." }];
    if (t.rev > 0) out.push(t.taux >= 0.2 ? { type: "good", text: `Bravo : tu épargnes ${Math.round(t.taux * 100)} % de tes revenus ce mois-ci.` } : t.taux < 0 ? { type: "warn", text: `Tes dépenses dépassent tes revenus de ${money(-t.solde, cur)} ce mois-ci.` } : { type: "info", text: `Ton taux d'épargne est de ${Math.round(t.taux * 100)} %. L'objectif courant est 20 %.` });
    const ups = Object.entries(sp).map(([id, v]) => ({ id, v, p: spPrev[id] || 0 })).filter(x => x.p > 0 && x.v - x.p >= 20 && x.v / x.p >= 1.2).sort((a, b) => (b.v - b.p) - (a.v - a.p)).slice(0, 2);
    for (const u of ups) out.push({ type: "warn", text: `${catName(st, "depense", u.id)} : +${Math.round((u.v / u.p - 1) * 100)} % par rapport au mois dernier (${money(u.v, cur)} contre ${money(u.p, cur)}).` });
    for (const [id, lim] of Object.entries(st.budgets)) if (lim > 0 && (sp[id] || 0) > lim) out.push({ type: "warn", text: `Budget « ${catName(st, "depense", id)} » dépassé de ${money(sp[id] - lim, cur)}.` });
    const f = forecast(st, key, today);
    if (f && f.day >= 5 && f.revenus > 0 && f.projected > f.revenus) out.push({ type: "warn", text: `À ce rythme, tu dépenseras environ ${money(f.projected, cur)} ce mois-ci, plus que tes revenus (${money(f.revenus, cur)}).` });
    const big = inMonth(st, key).filter(x => x.type === "depense").sort((a, b) => b.amount - a.amount)[0];
    if (big) out.push({ type: "info", text: `Plus grosse dépense : ${money(big.amount, cur)}${big.note ? " (" + big.note + ")" : ""}.` });
    if (prev.dep > 0 && t.dep < prev.dep * 0.9 && monthKey(today || todayStr()) !== key) out.push({ type: "good", text: `Tu as dépensé ${Math.round((1 - t.dep / prev.dep) * 100)} % de moins que le mois précédent.` });
    return out;
  }
  function weekdaySpend(list) { const a = [0, 0, 0, 0, 0, 0, 0]; for (const t of list) if (t.type === "depense") { const d = new Date(t.date + "T12:00:00").getDay(); a[(d + 6) % 7] += t.amount; } return a.map(round2); }

  return { VERSION, CURRENCIES, PALETTE, defaults, normalize, pad, uid, round2, dateStr, todayStr, monthKey, shiftMonth, daysInMonth, slug, money, isDate,
    catList, findCat, catName, catColor, inMonth, between, sum, totals, spendBy, spendByCat, monthlySeries, accountBalance, applyRecurring, removeTransaction,
    parseCSV, parseDate, parseAmount, guessMapping, categorize, buildImport, forecast, rule503020, insights, weekdaySpend };
});
