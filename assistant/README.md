# Mon assistant

Application web personnelle pour gérer rendez-vous, mails à répondre, tâches et notes **sans rien trier à la main**. Pas de serveur, pas de compte : ouvre `index.html` dans un navigateur.

## Utilisation
Une seule zone de saisie. Tape (ou dicte avec 🎤) une phrase :

- `rdv dentiste demain 14h30`
- `mail répondre à Julie vendredi`
- `note idée pour le projet`
- `appeler la banque` (tâche)

L'appli détecte le type (rdv, mail, tâche, note), la date (aujourd'hui, demain, après-demain, lundi…dimanche, 12/03, dans 3 jours) et l'heure (14h, 14h30, 9:15).

## Vues
- **Aujourd'hui** : en retard, rendez-vous du jour, mails à répondre, tâches. Le bouton → reporte à demain.
- **À venir** : tout ce qui est daté dans le futur.
- **Notes**.

## Données
Enregistrées dans le navigateur (`localStorage`). Sauvegarde/restauration JSON et export des rendez-vous vers un agenda (.ics) dans « Aide et données ».
