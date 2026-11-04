# Budget & épargne

Application web personnelle pour suivre ses dépenses et son épargne. Pas de serveur, pas de compte : ouvre `index.html` dans un navigateur.

## Fonctions
- **Tableau de bord** : revenus, dépenses, solde et taux d'épargne du mois ; répartition par catégorie ; six derniers mois ; budgets ; dernières transactions.
- **Transactions** : ajout, modification, suppression, filtre dépenses/revenus, navigation par mois.
- **Budgets** : plafond mensuel par catégorie avec barre de progression (orange à 80 %, rouge au-delà).
- **Épargne** : objectifs avec échéance (montant à mettre de côté par mois) et défi des 52 semaines.
- **Réglages** : sauvegarde et restauration (JSON), export CSV (ouvrable dans Excel), données d'exemple, effacement.

## Données
Tout est enregistré dans le navigateur (`localStorage`), sur l'appareil utilisé. Fais une sauvegarde JSON de temps en temps : vider les données du navigateur efface tout.

## Fichiers
- `index.html` : structure
- `style.css` : styles (clair/sombre, mobile et ordinateur)
- `app.js` : logique, sans dépendance externe
