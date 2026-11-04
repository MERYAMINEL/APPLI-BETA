"use strict";
/* Assemble l'application en un seul fichier HTML.
   node build.js            -> dist/budget-epargne.html (page complète, utilisable seule)
   node build.js --fragment -> dist/budget-epargne.fragment.html (sans <html>/<head>/<body>, pour une plateforme qui ajoute son propre squelette) */
const fs = require("fs"), path = require("path");
const read = (f) => fs.readFileSync(path.join(__dirname, f), "utf8");
const fragment = process.argv.includes("--fragment");
const css = read("style.css"), core = read("core.js"), app = read("app.js");
for (const [n, s] of [["core.js", core], ["app.js", app]]) if (/<\/script/i.test(s)) throw new Error(n + " contient </script");
const body = `<header class="top no-print">
  <h1>Budget &amp; épargne</h1>
  <nav id="tabs" aria-label="Navigation principale"></nav>
</header>
<main id="view"></main>
<dialog id="dlg"></dialog>
<dialog id="dlg2"></dialog>
<div id="lock" hidden></div>
<div id="toast" role="status" aria-live="polite"></div>
<script>${core}</script>
<script>${app.replace(/if \("serviceWorker" in navigator[^\n]*\n?/, "")}</script>`;
const desc = "Suivi de budget et d'épargne, hors ligne, sans compte.";
const out = fragment
  ? `<title>Budget et épargne</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n<style>${css}</style>\n${body}\n`
  : `<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<meta name="description" content="${desc}">\n<title>Budget et épargne</title>\n<style>${css}</style>\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
fs.mkdirSync(path.join(__dirname, "dist"), { recursive: true });
const file = path.join(__dirname, "dist", fragment ? "budget-epargne.fragment.html" : "budget-epargne.html");
fs.writeFileSync(file, out); console.log(file, (out.length / 1024).toFixed(1) + " Ko");
