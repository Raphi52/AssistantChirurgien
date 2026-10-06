// Mesure de couverture AVEC le modèle (chemin normal du patient : `claude -p`, abonnement personnel).
// Appelle la vraie fonction answer() du serveur. Coûteux : ~30 000 jetons et quelques secondes par question.
// Aucun effet de bord : notifications coupées, compteur de sujets redirigé vers un fichier temporaire.
// Usage : node test/mesure-couverture-modele.cjs [travail|controle|frais|dev-hors-sujet] [parallélisme, 3 par défaut]
//   frais : test/questions-fraiches.json (juge indépendant) · dev-hors-sujet : les 25 hors sujet de travail+contrôle
'use strict';
const os = require('os'), path = require('path');
delete process.env.NTFY_URL; delete process.env.NOTIFY_WEBHOOK_URL;
process.env.SUJETS_FILE = path.join(os.tmpdir(), 'sujets-mesure-' + process.pid + '.json');
process.env.USE_LLM = '1';
const { answer } = require('../server');
const J = require('./questions-patients.json'), F = require('./questions-fraiches.json');

const jeu = ['travail', 'frais', 'dev-hors-sujet'].includes(process.argv[2]) ? process.argv[2] : 'controle';
const par = Number((process.argv.find(a => /^\d+$/.test(a))) || 3);
const garde = (_, i) => (i % 2 === 0) === (jeu === 'travail');
const liste = id => (Array.isArray(id) ? id : [id]);
const taches = jeu === 'frais'
  ? [...F.positives.map(([q, id]) => ({ q, ok: liste(id) })), ...F.negatives.map(q => ({ q, ok: null }))]
  : jeu === 'dev-hors-sujet' ? J.negatives.map(q => ({ q, ok: null }))
  : [...J.positives.filter(garde).map(([q, ok]) => ({ q, ok })), ...J.negatives.filter(garde).map(q => ({ q, ok: null }))];

(async () => {
  const t0 = Date.now(), res = new Array(taches.length);
  let i = 0;
  await Promise.all(Array.from({ length: par }, async () => {
    while (i < taches.length) {
      const k = i++, { q, ok } = taches[k], d = Date.now();
      let r; try { r = await answer(q); } catch (e) { r = { type: 'erreur', text: e.message }; }
      const ids = (r.fiches || []).map(f => f.id);
      res[k] = { q, ok, type: r.type, portee: r.portee, source: r.source, ids, ms: Date.now() - d };
    }
  }));
  const pos = res.filter(r => r.ok), neg = res.filter(r => !r.ok);
  const juge = pos.filter(r => r.type === 'reponse');
  const juste = juge.filter(r => r.ids.some(id => r.ok.includes(id)));
  const fausse = juge.filter(r => r.portee === 'fiches' && !r.ids.some(id => r.ok.includes(id)));
  const sansFiche = juge.filter(r => r.portee !== 'fiches');
  const repli = res.filter(r => r.source && r.source !== 'claude').length;
  const p = (a, b) => (b ? (100 * a / b).toFixed(1) + ' %' : '—');
  console.log(`== Avec le modèle — jeu de ${jeu} (${pos.length} questions + ${neg.length} hors sujet), ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  console.log(`  bonne fiche citée        ${juste.length}/${juge.length}  ${p(juste.length, juge.length)}   ← couverture`);
  console.log(`  seulement de MAUVAISES fiches citées ${fausse.length}/${juge.length}  ${p(fausse.length, juge.length)}`);
  console.log(`  réponse générale, sans fiche ${sansFiche.length}/${juge.length}  ${p(sansFiche.length, juge.length)}`);
  console.log(`  alertes ${pos.filter(r => r.type === 'alerte').length} · erreurs ${res.filter(r => r.type === 'erreur').length} · réponses SANS modèle (repli) ${repli}`);
  console.log(`  hors sujet servis avec une fiche ${neg.filter(r => r.portee === 'fiches').length}/${neg.length}`);
  const ms = res.filter(r => r.source === 'claude').map(r => r.ms).sort((a, b) => a - b);
  if (ms.length) console.log(`  durée par réponse : médiane ${(ms[ms.length >> 1] / 1000).toFixed(1)} s`);
  for (const r of [...fausse, ...sansFiche]) console.log(`    ${r.portee === 'fiches' ? 'FAUSSE' : 'SANS FICHE'}  ${r.q}  → ${r.ids.join(',') || '—'} (attendu ${r.ok.join('/')})`);
  console.log(`  hors sujet : refusés [HORS_SUJET] ${neg.filter(r => r.portee === 'hors_sujet').length} · réponse générale ${neg.filter(r => r.portee === 'generale').length} · fiche ${neg.filter(r => r.portee === 'fiches').length} · alerte/autre ${neg.filter(r => r.type !== 'reponse').length}`);
  for (const r of neg.filter(r => r.type === 'reponse' && r.portee !== 'hors_sujet')) console.log(`    HORS SUJET ${r.portee === 'fiches' ? 'SERVI (fiche)' : 'RÉPONDU (général)'}  ${r.q}  → ${r.ids.join(',') || '—'}`);
  process.exit(0);
})();
