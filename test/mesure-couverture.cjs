// Mesure de couverture : quelle part des questions de patients reçoit LA BONNE fiche ?
// Mesure le chemin SANS modèle (la décision réelle du serveur : tri des urgences, puis ficheDirecte),
// qui sert dès que `claude` ne répond pas, et seul chemin d'un serveur sans abonnement.
// Usage : node test/mesure-couverture.cjs [--travail] [--detail] [--json]   (--travail : sans regarder le contrôle)
// Jeu : test/questions-patients.json (gelé ; indices pairs = travail, impairs = contrôle).
'use strict';
const path = require('path');
const { loadBrain, search, ficheDirecte } = require('../lib/brain');
const { checkRedFlags } = require('../lib/redflags');

const brain = loadBrain(path.join(__dirname, '..', 'data'));
const J = require('./questions-patients.json');
const detail = process.argv.includes('--detail');

function issue(q) {
  if (checkRedFlags(q)) return { k: 'alerte' };
  const hits = search(brain, q, 10);
  const doc = ficheDirecte(hits);
  return { k: doc ? 'fiche' : 'renvoi', id: doc && doc.id, top10: hits.map(h => h.doc.id) };
}

function mesurer(jeu) {
  const pos = J.positives.filter((_, i) => (i % 2 === 0) === (jeu === 'travail'));
  const neg = J.negatives.filter((_, i) => (i % 2 === 0) === (jeu === 'travail'));
  const r = { jeu, positives: pos.length, juste: 0, fausse: 0, renvoi: 0, alerte: 0, top10: 0, negatives: neg.length, negRenvoi: 0, negFiche: 0, echecs: [] };
  for (const [q, ok] of pos) {
    const o = issue(q);
    if (o.k === 'alerte') r.alerte++;
    else if (o.k === 'renvoi') { r.renvoi++; r.echecs.push(`RENVOI  ${q}  (attendu ${ok.join('/')}, proches ${o.top10.slice(0, 3).join(',')})`); }
    else if (ok.includes(o.id)) r.juste++;
    else { r.fausse++; r.echecs.push(`FAUSSE  ${q}  → ${o.id} ${brain.byId[o.id].question}  (attendu ${ok.join('/')})`); }
    if (o.top10 && o.top10.some(id => ok.includes(id))) r.top10++;
  }
  for (const q of neg) {
    const o = issue(q);
    if (o.k === 'fiche') { r.negFiche++; r.echecs.push(`HORS SUJET SERVI  ${q}  → ${o.id} ${brain.byId[o.id].question}`); }
    else r.negRenvoi++;
  }
  return r;
}

module.exports = { mesurer };
if (require.main !== module) return;
const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + ' %' : '—');
const R = (process.argv.includes('--travail') ? ['travail'] : ['travail', 'controle']).map(mesurer);
if (process.argv.includes('--json')) { console.log(JSON.stringify(R.map(({ echecs, ...x }) => x))); process.exit(0); }
for (const r of R) {
  const n = r.positives - r.alerte;
  console.log(`\n== Jeu de ${r.jeu} : ${r.positives} questions de patients, ${r.negatives} hors sujet`);
  console.log(`  bonne fiche donnée      ${r.juste}/${n}  ${pct(r.juste, n)}   ← couverture`);
  console.log(`  MAUVAISE fiche donnée   ${r.fausse}/${n}  ${pct(r.fausse, n)}   ← réponse fausse au patient`);
  console.log(`  renvoi au secrétariat   ${r.renvoi}/${n}  ${pct(r.renvoi, n)}`);
  console.log(`  alerte urgence          ${r.alerte} (exclues du calcul ; tri en règles fixes, non modifié)`);
  console.log(`  bonne fiche dans les 10 proches (indice donné au modèle) ${r.top10}/${n}  ${pct(r.top10, n)}`);
  console.log(`  hors sujet bien renvoyés ${r.negRenvoi}/${r.negatives} · hors sujet servis avec une fiche ${r.negFiche}`);
  if (detail) r.echecs.forEach(e => console.log('    ' + e));
}
