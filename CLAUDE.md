# Projet : assistant patients de chirurgie digestive générale

But : réduire les sollicitations du chirurgien en répondant aux questions répétitives de ses patients, sans jamais remplacer un avis médical.

Règles du projet :
- Le modèle répond d'abord avec les fiches de `data/`, en citant leurs références.
- Sans fiche qui couvre la question (décision du 2026-10-07) : le patient lit quand même la réponse générale et prudente du modèle, marquée « non relue par le chirurgien », avec le bouton de rappel. La question et cette réponse deviennent une PROPOSITION de nouvelle fiche dans l'admin (`admin-data/propositions.json`). Le chirurgien la corrige puis la publie, ou la rejette.
- Le tri des urgences (`lib/redflags.js`) passe AVANT le modèle et reste en règles fixes.
- Aucune identité de patient n'est stockée. Seule exception pour les questions : une question sans fiche est gardée dans la proposition admin.
- Exception de DÉMONSTRATION, les dossiers de préparation (`lib/dossiers.js`, interdit en production sans hébergement HDS) : depuis le 2026-10-14, le secrétariat crée le patient dans l'admin (nom, prénom, date de naissance), ce qui génère son code personnel. Le patient n'entre qu'avec ce code ; l'ancien code commun `ACCESS_CODE` n'ouvre plus l'application.
- Une fiche n'est fiable que si `validated:true`, ce qui suppose une relecture par le chirurgien.
- Après chaque modification : `node test/run.js` doit rester vert.
