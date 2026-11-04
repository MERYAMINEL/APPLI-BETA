# Budget & épargne

Application web personnelle pour suivre ses dépenses et son épargne. Sans serveur, sans compte, sans dépendance externe : ouvre `index.html` dans un navigateur. Elle fonctionne sur ordinateur et téléphone, en clair ou en sombre, et peut s'installer comme une application (hors ligne) quand elle est servie en HTTPS ou en `localhost`.

## Fonctions

**Accueil**
- Revenus, dépenses, solde et taux d'épargne du mois, navigation mois par mois
- Prévision de fin de mois (les dépenses fixes ne sont pas extrapolées, projection à partir du 5 du mois)
- Soldes de tous les comptes, conseils personnalisés (hausses par catégorie, budgets dépassés, taux d'épargne…)
- Répartition par catégorie, six derniers mois, budgets, dernières transactions, impression du rapport

**Transactions**
- Dépenses, revenus et virements entre comptes
- Recherche, filtres (type, catégorie, compte), tri, vue « ce mois » ou « tout »
- Catégorie proposée automatiquement d'après la note (règles modifiables)
- Suppression avec bouton « Annuler »
- Import d'un relevé bancaire CSV : détection du séparateur, des colonnes, des formats de date et de montant, des doublons

**Budgets**
- Plafond mensuel par catégorie, barres de progression (orange à 80 %, rouge au-delà), budget total
- Opérations récurrentes (loyer, abonnements, salaire) ajoutées automatiquement chaque mois

**Statistiques**
- Périodes : mois, 3 mois, 12 mois, tout ; comparaison avec la période précédente
- Épargne cumulée sur 12 mois, plus grosses dépenses, dépenses par jour de la semaine
- Règle 50 / 30 / 20 (besoins, envies, épargne)

**Épargne**
- Plusieurs comptes (courant, épargne, espèces) avec soldes de départ
- Objectifs avec échéance et montant à mettre de côté par mois
- Défi des 52 semaines

**Réglages**
- Thème clair, sombre ou automatique, couleur d'accent, neuf devises
- Catégories personnalisables (nom, couleur, besoins ou envies)
- Code de verrouillage (masque l'application, ne chiffre pas les données)
- Sauvegarde et restauration JSON, export CSV, données d'exemple

Raccourcis : `N` nouvelle transaction, `←` `→` changer de mois.

## Données
Tout est enregistré dans le navigateur (`localStorage`), sur l'appareil utilisé. Fais une sauvegarde JSON de temps en temps : vider les données du navigateur efface tout. Les sauvegardes de la première version restent compatibles (migration automatique).

## Fichiers
| Fichier | Rôle |
|---|---|
| `index.html`, `style.css` | Page et styles |
| `core.js` | Logique métier (calculs, récurrents, import CSV, prévisions), sans accès au DOM |
| `app.js` | Interface |
| `sw.js`, `manifest.webmanifest`, `icon.svg` | Installation et mode hors ligne |
| `tests/core.test.js` | Tests unitaires de `core.js` |

## Tests
```bash
node --test tests/core.test.js
```
