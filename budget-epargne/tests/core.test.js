"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("../core.js");

const mk = () => C.normalize({});
const tx = (o) => Object.assign({ id: C.uid(), date: "2026-11-05", type: "depense", amount: 10, category: "alimentation", account: "main", note: "" }, o);

test("parseAmount gère les formats courants", () => {
  assert.equal(C.parseAmount("1 234,56"), 1234.56);
  assert.equal(C.parseAmount("-12.5"), -12.5);
  assert.equal(C.parseAmount("(45,00)"), -45);
  assert.equal(C.parseAmount("1,234.50"), 1234.5);
  assert.equal(C.parseAmount("1.234,50"), 1234.5);
  assert.equal(C.parseAmount("12,50 €"), 12.5);
  assert.equal(C.parseAmount("12,50-"), -12.5);
  assert.equal(C.parseAmount("+7"), 7);
  assert.ok(Number.isNaN(C.parseAmount("")));
  assert.ok(Number.isNaN(C.parseAmount("abc")));
});

test("parseDate gère plusieurs formats et refuse les dates impossibles", () => {
  assert.equal(C.parseDate("2026-11-05"), "2026-11-05");
  assert.equal(C.parseDate("05/11/2026"), "2026-11-05");
  assert.equal(C.parseDate("5.11.26"), "2026-11-05");
  assert.equal(C.parseDate("31/02/2026"), null);
  assert.equal(C.parseDate("n'importe quoi"), null);
});

test("parseCSV détecte le séparateur et gère les guillemets", () => {
  const r = C.parseCSV('Date;Libellé;Montant\n05/11/2026;"Café; crème";-3,50\n06/11/2026;Salaire;1000\n');
  assert.equal(r.delimiter, ";"); assert.equal(r.rows.length, 3);
  assert.equal(r.rows[1][1], "Café; crème");
  const r2 = C.parseCSV("a,b\n1,\"x\"\"y\"\n"); assert.equal(r2.rows[1][1], 'x"y');
});

test("totaux : les virements ne comptent ni en revenus ni en dépenses", () => {
  const st = mk(); st.accounts.push({ id: "livret", name: "Livret", type: "epargne", initial: 0 });
  st.transactions.push(tx({ type: "revenu", amount: 1000, category: "salaire" }), tx({ amount: 300 }), tx({ type: "virement", amount: 200, toAccount: "livret", category: "" }));
  const t = C.totals(st, "2026-11"); assert.equal(t.rev, 1000); assert.equal(t.dep, 300); assert.equal(t.solde, 700); assert.equal(t.taux, 0.7);
  assert.equal(C.accountBalance(st, "main"), 500); assert.equal(C.accountBalance(st, "livret"), 200);
});

test("solde d'un compte avec solde initial et date limite", () => {
  const st = mk(); st.accounts[0].initial = 100;
  st.transactions.push(tx({ date: "2026-10-01", type: "revenu", amount: 50, category: "salaire" }), tx({ date: "2026-11-01", amount: 20 }));
  assert.equal(C.accountBalance(st, "main"), 130); assert.equal(C.accountBalance(st, "main", "2026-10-31"), 150);
});

test("récurrents : génération idempotente, fin de mois et mois ignorés", () => {
  const st = mk();
  st.recurring.push({ id: "r1", type: "depense", amount: 380, category: "logement", account: "main", note: "Loyer", day: 31, start: "2026-09-15", end: "", active: true, skipped: [] });
  assert.equal(C.applyRecurring(st, "2026-11-10"), 2);                         // sept (30), oct (31) ; nov 30 pas encore passé
  assert.deepEqual(st.transactions.map(t => t.date).sort(), ["2026-09-30", "2026-10-31"]);
  assert.equal(C.applyRecurring(st, "2026-11-10"), 0);                         // idempotent
  assert.equal(C.applyRecurring(st, "2026-11-30"), 1);
  const removed = C.removeTransaction(st, st.transactions.find(t => t.date === "2026-10-31").id);
  assert.ok(removed); assert.equal(C.applyRecurring(st, "2026-11-30"), 0);     // le mois supprimé n'est pas régénéré
});

test("récurrents : respectent la date de début, de fin et l'état inactif", () => {
  const st = mk();
  st.recurring.push({ id: "a", type: "revenu", amount: 100, category: "salaire", account: "main", note: "", day: 5, start: "2026-10-10", end: "2026-11-30", active: true, skipped: [] });
  st.recurring.push({ id: "b", type: "depense", amount: 5, category: "autres", account: "main", note: "", day: 1, start: "2026-10-01", end: "", active: false, skipped: [] });
  assert.equal(C.applyRecurring(st, "2026-12-20"), 1);                          // 05/10 est avant le début, 05/11 ok, 05/12 après la fin
  assert.equal(st.transactions[0].date, "2026-11-05");
});

test("migration v1 : catégories en nom, budgets par nom, compte par défaut", () => {
  const v1 = { transactions: [{ id: "1", date: "2026-11-02", type: "depense", amount: 12, category: "Alimentation", note: "x" }, { id: "2", date: "2026-11-03", type: "revenu", amount: 50, category: "Job étudiant" }, { id: "3", date: "2026-11-04", type: "depense", amount: 5, category: "Vélo" }],
    budgets: { Loisirs: 50 }, goals: [{ id: "g", name: "Voyage", target: 600, saved: 10, deadline: "2027-06-30" }], challenge: { step: 2, paid: [1, 3, 3, 99] } };
  const st = C.normalize(v1);
  assert.equal(st.version, 2);
  assert.equal(st.transactions[0].category, "alimentation"); assert.equal(st.transactions[1].category, "job-etudiant");
  assert.equal(st.transactions[2].category, "velo"); assert.ok(C.findCat(st, "depense", "velo"));
  assert.equal(st.budgets.loisirs, 50); assert.deepEqual(st.challenge.paid, [1, 3]); assert.equal(st.transactions[0].account, "main");
});

test("normalize nettoie les données invalides", () => {
  const st = C.normalize({ transactions: [{ date: "pas une date", amount: 5 }, { date: "2026-11-01", amount: "abc" }, { date: "2026-11-01", amount: 0 }, { date: "2026-11-01", amount: -7, type: "depense", category: "Autres" }], settings: { currency: "XXX" } });
  assert.equal(st.transactions.length, 1); assert.equal(st.transactions[0].amount, 7); assert.equal(st.settings.currency, "EUR");
  assert.equal(C.normalize(null).transactions.length, 0); assert.equal(C.normalize("zzz").accounts.length, 1);
});

test("virement invalide (même compte) est écarté", () => {
  const st = C.normalize({ transactions: [{ date: "2026-11-01", amount: 5, type: "virement", account: "main", toAccount: "main" }] });
  assert.equal(st.transactions.length, 0);
});

test("import CSV : mapping, signes, doublons, catégories automatiques", () => {
  const st = mk(); st.transactions.push(tx({ date: "2026-11-05", amount: 12.5, note: "carrefour market" }));
  const { rows } = C.parseCSV("Date;Libellé;Montant\n05/11/2026;CARREFOUR MARKET;-12,50\n06/11/2026;Salaire novembre;1 200,00\n07/11/2026;Netflix;-13,49\nxx;Truc;-1\n08/11/2026;Rien;\n");
  const map = C.guessMapping(rows[0]); assert.deepEqual(map, { date: 0, label: 1, amount: 2, debit: -1, credit: -1 });
  const r = C.buildImport(st, rows, map, true);
  assert.equal(r.items.length, 3); assert.equal(r.skipped, 2);
  assert.equal(r.items[0].dup, true); assert.equal(r.items[1].type, "revenu"); assert.equal(r.items[1].category, "salaire");
  assert.equal(r.items[2].category, "abonnements"); assert.equal(r.items[2].amount, 13.49);
});

test("import CSV : colonnes débit / crédit", () => {
  const st = mk(); const { rows } = C.parseCSV("Date,Description,Débit,Crédit\n2026-11-01,Loyer,380,\n2026-11-02,Aide CAF,,150\n");
  const map = C.guessMapping(rows[0]); assert.equal(map.amount, -1);
  const r = C.buildImport(st, rows, map, true);
  assert.deepEqual(r.items.map(i => [i.type, i.amount, i.category]), [["depense", 380, "logement"], ["revenu", 150, "bourse-aides"]]);
});

test("prévision de fin de mois", () => {
  const st = mk(); st.transactions.push(tx({ date: "2026-11-02", amount: 100 }), tx({ date: "2026-11-05", amount: 50 }), tx({ type: "revenu", amount: 900, category: "salaire", date: "2026-11-01" }));
  const f = C.forecast(st, "2026-11", "2026-11-10"); assert.equal(f.spent, 150); assert.equal(f.projected, 450); assert.equal(f.remainingDays, 20);
  assert.equal(C.forecast(st, "2026-10", "2026-11-10"), null);
});

test("prévision : les dépenses fixes ne sont pas extrapolées et il faut 5 jours", () => {
  const st = mk(); st.transactions.push(tx({ date: "2026-11-02", amount: 380, category: "logement" }), tx({ date: "2026-11-03", amount: 30 }), tx({ date: "2026-11-04", amount: 20, recurringId: "r" }));
  const f = C.forecast(st, "2026-11", "2026-11-10"); assert.equal(f.fixed, 400); assert.equal(f.variable, 30); assert.equal(f.projected, 400 + 3 * 30);
  assert.equal(C.forecast(st, "2026-11", "2026-11-04").reliable, false); assert.equal(f.reliable, true);
});

test("règle 50/30/20 et catégories d'épargne", () => {
  const st = mk(); st.transactions.push(tx({ type: "revenu", amount: 1000, category: "salaire" }), tx({ category: "logement", amount: 400 }), tx({ category: "loisirs", amount: 200 }));
  const r = C.rule503020(st, "2026-11"); assert.equal(r.besoins, 400); assert.equal(r.envies, 200); assert.equal(r.epargne, 400); assert.equal(r.pct.besoins, 0.4);
});

test("conseils : hausse par catégorie, budget dépassé, vide", () => {
  const st = mk(); assert.equal(C.insights(st, "2026-11", "2026-11-20").length, 1);
  st.transactions.push(tx({ date: "2026-10-05", category: "loisirs", amount: 30 }), tx({ date: "2026-11-05", category: "loisirs", amount: 90 }), tx({ type: "revenu", amount: 500, category: "salaire", date: "2026-11-01" }));
  st.budgets.loisirs = 50;
  const txts = C.insights(st, "2026-11", "2026-11-20").map(i => i.text).join("\n");
  assert.match(txts, /Loisirs : \+200 %/); assert.match(txts, /Budget « Loisirs » dépassé/);
});

test("série mensuelle et dépenses par jour de semaine", () => {
  const st = mk(); st.transactions.push(tx({ date: "2026-11-02", amount: 10 }), tx({ date: "2026-10-03", amount: 5 }));
  const s = C.monthlySeries(st, "2026-11", 3); assert.deepEqual(s.map(x => x.key), ["2026-09", "2026-10", "2026-11"]); assert.equal(s[1].dep, 5);
  assert.equal(C.weekdaySpend([tx({ date: "2026-11-02", amount: 10 })])[0], 10);   // 2 nov. 2026 = lundi
});

test("décalage de mois et jours dans le mois", () => {
  assert.equal(C.shiftMonth("2026-01", -1), "2025-12"); assert.equal(C.shiftMonth("2026-12", 1), "2027-01");
  assert.equal(C.daysInMonth("2026-02"), 28); assert.equal(C.daysInMonth("2028-02"), 29);
});
