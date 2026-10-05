# Projet : assistant patients de chirurgie digestive générale

But : réduire les sollicitations du chirurgien en répondant aux questions répétitives de ses patients, sans jamais remplacer un avis médical.

Règles du projet :
- Le modèle ne répond QU'avec les fiches de `data/`. Aucun savoir médical ajouté hors des fiches.
- Le tri des urgences (`lib/redflags.js`) passe AVANT le modèle et reste en règles fixes.
- Aucune donnée de patient n'est stockée, ni question, ni identité.
- Une fiche n'est fiable que si `validated:true`, ce qui suppose une relecture par le chirurgien.
- Après chaque modification : `node test/run.js` doit rester vert.
