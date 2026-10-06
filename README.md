# Assistant patients — chirurgie digestive générale (prototype de démonstration)

Application mobile (PWA) avec texte et voix. Elle répond aux questions fréquentes des patients **uniquement** à partir de fiches validées par le chirurgien. Les urgences sont renvoyées vers le 15, et ce qui n'est pas couvert part vers le secrétariat.

```
Téléphone (PWA, micro) → serveur sur ce PC → 1. tri des urgences (règles fixes)
                                            → 2. recherche dans les 500 fiches (data/)
                                            → 3. Claude reformule SEULEMENT avec ces fiches
                                            → sinon : transfert au secrétariat
```

## Démarrer
1. Double-cliquer sur `demarrer.cmd` (ou lancer `node server.js`). Il faut Node 18 ou plus et la commande `claude` connectée à ton abonnement.
2. Sur le PC : http://localhost:8787, code d'accès `demo`.
3. Sur le téléphone, sur le même Wi-Fi : `http://<IP du PC>:8787`. Le chat marche tel quel.
4. **Pour la voix sur téléphone : `demarrer-public.cmd`.** Il lance le serveur et un tunnel https Cloudflare (gratuit, sans compte, avec `bin/cloudflared.exe`). Il affiche une adresse `https://….trycloudflare.com` et un **code d'accès aléatoire**, car l'adresse est publique. L'adresse change à chaque lancement. Sur le téléphone : ouvrir l'adresse, entrer le code, puis « Ajouter à l'écran d'accueil ».
   Si `bin/cloudflared.exe` manque, le télécharger depuis https://github.com/cloudflare/cloudflared/releases/latest (`cloudflared-windows-amd64.exe`, renommé `cloudflared.exe`).

Réglages (variables d'environnement) : `ACCESS_CODE` (code patient), `PORT`, `USE_LLM=0` (répond directement avec la fiche, sans Claude, en mode instantané), `LLM_TIMEOUT_MS`.

## Fichiers
- `data/*.json` : le second brain. 500 fiches réparties en 10 thèmes. **Toutes ont `validated:false`** : elles ont été rédigées sans le chirurgien et doivent être relues.
- `node scripts/export-relecture.js` : produit `relecture-fiches.csv` pour Excel, à faire annoter par le chirurgien.
- `lib/redflags.js` : signes d'alerte → message « appelez le 15 ». À faire valider en priorité.
- `lib/brain.js` : recherche dans les fiches (BM25, sans dépendance).
- `test/run.js` : `node test/run.js` (tests automatiques).

## Limites assumées (démo)
- **Abonnement Claude personnel** via la commande `claude -p` : acceptable pour une démonstration, pas pour des patients réels. En production, passer à l'API.
- Aucune question de patient n'est écrite sur disque. Seuls des compteurs en mémoire existent (`/api/stats?code=...`).
- Le PC doit rester allumé. Pour de vrais patients, prévoir un hébergement, un avis juridique (statut de dispositif médical) et l'accord de l'assurance du chirurgien.
## Notifications au secrétariat
À chaque **alerte** ou **transfert**, une notification part avec une référence courte, le motif et la priorité (« urgent » pour une alerte). Le patient voit la même référence et peut cliquer « 📞 Être rappelé(e) ». Son numéro est envoyé dans une seconde notification et n'est jamais enregistré.
- **ntfy (gratuit, sans compte)** : installer l'application ntfy sur le téléphone du secrétariat et s'abonner à un sujet difficile à deviner. Puis lancer le serveur avec `set NTFY_URL=https://ntfy.sh/<sujet-secret>`.
- **Webhook générique** (Teams, Slack, Make, n8n) : `set NOTIFY_WEBHOOK_URL=<url>`, qui reçoit un envoi au format JSON.
- **La question du patient n'est PAS envoyée par défaut**, car ntfy.sh est un service public. `NOTIFY_INCLUDE_QUESTION=1` la joint, mais seulement sur un canal privé.
- Sans canal configuré, le serveur l'écrit simplement dans la console.

## Préparation de mon opération (onglet 📋)
Un suivi en 5 étapes, avec une vue d'avancement (pourcentage, statut de chaque étape, compte à rebours avant l'opération) :
1. **Clinique et date** : Clinique du Parc (ELSAN) ou Médipôle Lyon-Villeurbanne (Ramsay).
2. **Préadmission** : le lien vers le portail **officiel** de la clinique (Mon Espace Elsan Care / ramsayservices.fr) et la liste des documents. Les formulaires des cliniques ne sont pas recopiés.
3. **Questionnaire d'anesthésie** : 17 questions, imprimable ou enregistrable en PDF pour la consultation d'anesthésie.
4. **Consentements** : le suivi des documents officiels signés (chirurgie, anesthésie, personne de confiance, devis).
5. **Veille et jour J** : la liste des choses à faire avant de partir.

**Les réponses restent sur le téléphone du patient** (stockage du navigateur). Rien n'est envoyé au serveur, et le test le vérifie. Bouton « Effacer mes informations ».
Test : serveur lancé, puis `node test/prep-ui.cjs <code>`. Le test utilise `playwright-core`, installé dans `../BlocAccord`.
Vue « Patients » de l'admin (document complet signé) : `node test/admin-dossier-ui.cjs`. Il lance seul son serveur, sur une copie du projet.

## Accès à l'admin : code obligatoire (2026-10-06)
L'admin (`/admin.html`) demande un **code par rôle** : chirurgien (valide et publie) ou secrétariat (propose). Sans code reconnu, toutes les routes `/api/admin/*` répondent 401.
- Les codes viennent des variables `ADMIN_CHIRURGIEN` et `ADMIN_SECRETARIAT`. Sinon, ils sont tirés au hasard au premier démarrage et gardés dans `admin-data/codes.json` (non versionné).
- Le code est retenu pour l'onglet en cours ; « Quitter » l'oublie.
- Avant cette date, un code absent ou faux entrait en chirurgien (démo). Un audit a mesuré que, une fois le serveur joignable en public, n'importe qui pouvait alors lire les dossiers et signatures et publier des fiches.

## Relecture et sujets manquants (2026-10-02)
- Admin → **Fiches** : propositions du secrétariat en tête (« ✓ Valider et publier » / « Rejeter »), puis « + Nouvelle fiche », puis « ✓ Valider telle quelle » sur chaque fiche non relue (les onglets Relecture, À valider et Nouvelle fiche ont été retirés le 2026-10-05).
- `ONLY_VALIDATED=1` (variable d'environnement au démarrage) : l'assistant n'utilise plus QUE les fiches validées. Désactivé par défaut tant que la relecture n'est pas avancée, sinon presque tout part au secrétariat.
- Admin → **Sujets manquants** : mots isolés comptés dans `admin-data/sujets.json` quand aucune fiche ne répondait. Aucune question n'est gardée ; seuls les mots vus au moins 3 fois s'affichent.
