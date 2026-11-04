"use strict";
/* Mon assistant — saisie rapide, tout en local (localStorage). */
const KEY = "assistant-v1";
const $ = (s) => document.querySelector(s);
const pad = (n) => String(n).padStart(2, "0");
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const addDays = (dateStr, n) => { const d = new Date(dateStr + "T00:00:00"); d.setDate(d.getDate() + n); return iso(d); };
const today = () => iso(new Date());
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const DAYS = ["dimanche","lundi","mardi","mercredi","jeudi","vendredi","samedi"];
const TYPES = {rdv:"Rendez-vous", mail:"Mail à répondre", tache:"Tâche", note:"Note"};
const longDate = (s) => new Date(s + "T00:00:00").toLocaleDateString("fr-FR", {weekday:"long", day:"numeric", month:"long"});

let items = load(), view = "today";
function load() { try { const v = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(v) ? v : []; } catch { return []; } }
function save() { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch { toast("Enregistrement impossible"); } }
function toast(m) { const t = $("#toast"); t.textContent = m; t.classList.add("on"); setTimeout(() => t.classList.remove("on"), 2200); }

/* Analyse d'une phrase libre -> {type, title, date, time} */
function parse(text) {
  let t = " " + text.trim() + " ", type = "tache", date = "", time = "";
  const k = t.match(/^\s*(rdv|rendez-vous|mail|mél|email|e-mail|note|tache|tâche)\b[\s:,-]*/i);
  if (k) {
    const w = k[1].toLowerCase();
    type = /^(rdv|rendez)/.test(w) ? "rdv" : /mail|mél/.test(w) ? "mail" : w === "note" ? "note" : "tache";
    t = " " + t.slice(k[0].length);
  }
  const cut = (re, fn) => { const m = t.match(re); if (m) { t = t.replace(m[0], " "); fn(m); } return !!m; };
  const tm = cut(/(?<![\d/])(\d{1,2})\s?[h:]\s?(\d{2})?(?!\d)/i, (m) => {
    const h = +m[1], mi = +(m[2] || 0);
    if (h < 24 && mi < 60) time = `${pad(h)}:${pad(mi)}`;
  });
  if (!time && tm) t = t; // heure invalide ignorée
  cut(/\baujourd'?hui\b/i, () => date = today()) ||
  cut(/\bapr[eè]s-?demain\b/i, () => date = addDays(today(), 2)) ||
  cut(/\bdemain\b/i, () => date = addDays(today(), 1)) ||
  cut(/\bdans\s+(\d+)\s+jours?\b/i, (m) => date = addDays(today(), +m[1])) ||
  cut(new RegExp("\\b(" + DAYS.join("|") + ")\\b", "i"), (m) => {
    const diff = (DAYS.indexOf(m[1].toLowerCase()) - new Date().getDay() + 7) % 7;
    date = addDays(today(), diff === 0 ? 7 : diff);
  }) ||
  cut(/(?<![\d/])(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?![\d/])/, (m) => {
    const now = new Date(); let y = m[3] ? +m[3] : now.getFullYear(); if (y < 100) y += 2000;
    let d = new Date(y, +m[2] - 1, +m[1]);
    if (!m[3] && iso(d) < today()) d = new Date(y + 1, +m[2] - 1, +m[1]);
    if (d.getMonth() === +m[2] - 1) date = iso(d);
  });
  if (time && type === "tache") type = "rdv";
  if (type === "rdv" && !date) date = today();
  if (type === "note" || type === "mail") { /* date facultative */ }
  t = t.replace(/\s+/g, " ").trim().replace(/\s+(à|a|le|pour|de|du|vers)$/i, "").replace(/^(à|le)\s+/i, "");
  if (!t) t = text.trim();
  return {type, title: t.charAt(0).toUpperCase() + t.slice(1), date, time};
}

function describe(p) {
  return `${TYPES[p.type]} · ${p.date ? longDate(p.date) : "sans date"}${p.time ? " à " + p.time.replace(":", "h") : ""}`;
}

function row(it, extra = "") {
  return `<li class="item ${it.done ? "done" : ""}" data-id="${it.id}">
    <input type="checkbox" class="chk" ${it.done ? "checked" : ""} aria-label="Fait">
    ${it.time ? `<span class="time">${it.time.replace(":", "h")}</span>` : ""}
    <div class="main">${esc(it.title)}<div class="m">${extra}</div></div>
    ${it.type !== "note" && it.type !== "rdv" && !it.done ? `<button class="icon later" title="Reporter à demain" aria-label="Reporter à demain">→</button>` : ""}
    <button class="icon del" aria-label="Supprimer">✕</button></li>`;
}
const sect = (title, arr, cls = "", fn = (i) => "") =>
  arr.length ? `<h2 class="${cls}">${title} (${arr.length})</h2><ul class="list">${arr.map((i) => row(i, fn(i))).join("")}</ul>` : "";
const byTime = (a, b) => (a.date || "").localeCompare(b.date || "") || (a.time || "99").localeCompare(b.time || "99");

function render() {
  const td = today();
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.v === view));
  $("#head").textContent = view === "today" ? longDate(td) : view === "next" ? "À venir" : "Notes";
  const open = items.filter((i) => !i.done);
  let h = "";
  if (view === "today") {
    const late = open.filter((i) => i.type !== "note" && i.type !== "mail" && i.date && i.date < td).sort(byTime);
    const rdv = open.filter((i) => i.type === "rdv" && i.date === td).sort(byTime);
    const mails = open.filter((i) => i.type === "mail");
    const tasks = open.filter((i) => i.type === "tache" && (!i.date || i.date === td));
    const done = items.filter((i) => i.done && (i.date === td || !i.date) && i.type !== "note").slice(-5);
    h = sect("En retard", late, "late", (i) => longDate(i.date)) + sect("Rendez-vous", rdv) +
        sect("Mails à répondre", mails, "", (i) => i.date ? "pour " + longDate(i.date) : "") + sect("À faire", tasks) + sect("Fait", done);
    if (!h) h = `<p class="empty">Rien pour aujourd'hui. Tape une phrase ci-dessus pour ajouter quelque chose.</p>`;
  } else if (view === "next") {
    const nx = open.filter((i) => i.type !== "note" && i.date > td).sort(byTime);
    h = nx.length ? `<ul class="list">${nx.map((i) => row(i, TYPES[i.type] + " · " + longDate(i.date))).join("")}</ul>` : `<p class="empty">Rien de prévu.</p>`;
  } else {
    const ns = items.filter((i) => i.type === "note").reverse();
    h = ns.length ? `<ul class="list">${ns.map((i) => row(i, new Date(i.created).toLocaleDateString("fr-FR"))).join("")}</ul>` : `<p class="empty">Aucune note. Commence une phrase par « note ».</p>`;
  }
  $("#view").innerHTML = h;
}

$("#in").addEventListener("input", () => { const v = $("#in").value.trim(); $("#prev").textContent = v ? "→ " + describe(parse(v)) : ""; });
$("#cap").addEventListener("submit", (e) => {
  e.preventDefault();
  const v = $("#in").value.trim(); if (!v) return;
  const p = parse(v);
  items.push({id: uid(), done: false, created: Date.now(), ...p});
  save(); $("#in").value = ""; $("#prev").textContent = "";
  view = p.type === "note" ? "notes" : p.date && p.date > today() ? "next" : "today";
  toast("Ajouté : " + describe(p)); render();
});
$("#tabs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { view = b.dataset.v; render(); } });
$("#view").addEventListener("click", (e) => {
  const li = e.target.closest(".item"); if (!li) return;
  const it = items.find((i) => i.id === li.dataset.id); if (!it) return;
  if (e.target.classList.contains("chk")) it.done = !it.done;
  else if (e.target.closest(".later")) { it.date = addDays(it.date && it.date > today() ? it.date : today(), 1); toast("Reporté au " + longDate(it.date)); }
  else if (e.target.closest(".del")) items = items.filter((i) => i !== it);
  else return;
  save(); render();
});

/* Dictée vocale (si le navigateur la gère) */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
if (SR) {
  $("#mic").hidden = false;
  $("#mic").onclick = () => {
    const r = new SR(); r.lang = "fr-FR";
    r.onresult = (ev) => { $("#in").value = ev.results[0][0].transcript; $("#in").dispatchEvent(new Event("input")); };
    r.onerror = () => toast("Micro indisponible");
    r.start(); toast("Je t'écoute…");
  };
}

function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], {type}));
  a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
$("#exp").onclick = () => download(`assistant-${today()}.json`, JSON.stringify(items, null, 2), "application/json");
$("#imp").onchange = async (e) => {
  try {
    const v = JSON.parse(await e.target.files[0].text());
    if (!Array.isArray(v) || !v.every((i) => i && typeof i.title === "string" && i.type in TYPES)) throw 0;
    if (confirm(`Remplacer les données par ${v.length} élément(s) ?`)) { items = v.map((i) => ({id: uid(), done: false, created: Date.now(), date: "", time: "", ...i})); save(); render(); }
  } catch { toast("Fichier invalide"); }
  e.target.value = "";
};
$("#ics").onclick = () => {
  const t = (s) => s.replace(/[\;,]/g, "\\$&");
  const ev = items.filter((i) => i.type === "rdv" && !i.done && i.date).map((i) => {
    const d = i.date.replace(/-/g, "");
    let start, end;
    if (i.time) {
      const [h, m] = i.time.split(":").map(Number);
      start = `DTSTART:${d}T${pad(h)}${pad(m)}00`; end = `DTEND:${d}T${pad((h + 1) % 24)}${pad(m)}00`;
    } else { start = `DTSTART;VALUE=DATE:${d}`; end = `DTEND;VALUE=DATE:${addDays(i.date, 1).replace(/-/g, "")}`; }
    return `BEGIN:VEVENT\r\nUID:${i.id}@assistant\r\nDTSTAMP:${d}T000000Z\r\n${start}\r\n${end}\r\nSUMMARY:${t(i.title)}\r\nEND:VEVENT`;
  });
  if (!ev.length) return toast("Aucun rendez-vous à exporter");
  download("rendez-vous.ics", `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//assistant//FR\r\n${ev.join("\r\n")}\r\nEND:VCALENDAR\r\n`, "text/calendar");
};
$("#wipe").onclick = () => { if (confirm("Tout effacer ?")) { items = []; save(); render(); } };
render();
