// Second brain : fiches JSON validables, recherche BM25 sans dépendance.
'use strict';
const fs = require('fs');
const path = require('path');

const STOP = new Set('le la les un une des de du d l et ou a au aux en dans pour par sur avec sans ce cet cette ces mon ma mes ton ta tes son sa ses je j tu il elle on nous vous ils elles me m te t se s ne n pas plus est suis es sont ai as avons avez ont etre avoir que qu qui quoi quand comment pourquoi combien quel quelle quels quelles y est-ce ça ca c faut peux peut puis-je dois doit bien tres trop apres avant grave normal normale inquieter inquiete inquiet souci probleme possible savoir voudrais aimerais docteur depuis va vais vas vont fait fais faire'.split(' '));

// Les ligatures œ/æ ne se décomposent pas en NFD : sans ce remplacement « cœlioscopie » devenait « c lioscopie » et ne
// rencontrait jamais « coelioscopie » tapé par le patient (35 fiches touchées, mesuré le 2026-10-06).
function norm(s) {
  return s.toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ');
}
// Racine : verbe, participe et nom d'une même famille tombent sur la même racine (opérer / opéré / opération → « oper »).
// Mots courts dont le « s » final n'est pas un pluriel : « fils » ≠ « fil » (sinon « mon fils… » servait la fiche
// « un fil dépasse de ma cicatrice »).
const INVARIABLES = new Set(['fils', 'mois', 'fois', 'pus', 'gaz', 'os', 'dos']);
function stem(w) {
  if (INVARIABLES.has(w)) return w;
  // Dès 5 lettres : « jambe » et « jambes » donnent tous deux « jamb » (avant : « jambe » ≠ « jamb »).
  return w.length > 4 ? w.replace(/(ements|ement|ations|ation|ees|ee|er|ez|es|s|e)$/, '') : w.replace(/s$/, '');
}
function tokens(s) { return norm(s).split(' ').filter(w => w.length > 1 && !STOP.has(w)).map(stem); }
// Mots de la QUESTION, en « notions » : chaque notion est une liste d'ALTERNATIVES dont une seule suffit.
// Le vocabulaire du patient est traduit par lib/lexique.js : « enlève » → [retir|enlev] = UNE notion, et non deux mots
// à trouver tous les deux (sinon F089, qui dit seulement « retirer », perdait la moitié de l'information).
const { LEXIQUE } = require('./lexique');
function notionsLexique(v) {
  return v.split(' ').filter(Boolean).map(groupe => [...new Set(groupe.split('|').flatMap(tokens))]).filter(a => a.length);
}
function notionsQuestion(q) {
  const out = [], vus = new Set();
  for (const w of norm(q).split(' ').filter(w => w.length > 1)) {
    const notions = LEXIQUE[w] ? notionsLexique(LEXIQUE[w]) : STOP.has(w) ? [] : [[stem(w)]];
    for (const a of notions) { const cle = [...a].sort().join('|'); if (!vus.has(cle)) { vus.add(cle); out.push(a); } }
  }
  return out;
}
const tokensQuestion = q => notionsQuestion(q).flat();

function loadBrain(dir) {
  const docs = [];
  for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort()) {
    // Le thème vient du nom de fichier (« 05-vesicule.json » → « vesicule ») ; une fiche est non validée par défaut.
    const theme = f.replace(/^\d+-|\.json$/g, '').replace(/-/g, ' ');
    for (const d of JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'))) docs.push({ theme, validated: false, ...d });
  }
  const byId = {}, df = {};
  let total = 0;
  for (const d of docs) {
    if (byId[d.id]) throw new Error(`id en double : ${d.id}`);
    byId[d.id] = d;
    // question et mots-clés pèsent plus que la réponse
    d._tok = [...tokens(d.question), ...tokens(d.question), ...tokens((d.keywords || []).join(' ')), ...tokens((d.keywords || []).join(' ')), ...tokens(d.answer)];
    d._tf = {};
    for (const t of d._tok) d._tf[t] = (d._tf[t] || 0) + 1;
    for (const t of Object.keys(d._tf)) df[t] = (df[t] || 0) + 1;
    total += d._tok.length;
  }
  return { docs, byId, df, avg: total / Math.max(docs.length, 1) };
}

function search(brain, q, k = 4) {
  const notions = notionsQuestion(q);
  const N = brain.docs.length, k1 = 1.4, b = 0.7;
  // Poids d'un mot de la question = son pouvoir de distinction. Un mot ABSENT de toutes les fiches (« cataracte »,
  // « otite ») pèse le maximum : la question parle de quelque chose que les fiches ne traitent pas.
  // (Vérifié le 2026-10-06 sur un jeu frais jamais utilisé pour régler : donner moins de poids aux mots inconnus
  //  fait servir davantage de questions hors sujet. Le poids maximal est conservé.)
  const idf = t => Math.log(1 + (N - (brain.df[t] || 0) + 0.5) / ((brain.df[t] || 0) + 0.5));
  // Une notion à plusieurs alternatives pèse comme la plus courante d'entre elles (estimation prudente).
  const poidsNotion = notions.map(a => Math.min(...a.map(idf)));
  const poidsTotal = poidsNotion.reduce((s, x) => s + x, 0);
  const scored = brain.docs.map(d => {
    let s = 0, hit = 0, poids = 0;
    notions.forEach((alts, i) => {
      // meilleure alternative présente dans la fiche (une seule compte : pas de double score pour des synonymes)
      let best = 0;
      for (const t of alts) {
        const tf = d._tf[t]; if (!tf) continue;
        best = Math.max(best, idf(t) * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * d._tok.length / brain.avg)));
      }
      if (best > 0) { hit++; poids += poidsNotion[i]; s += best; }
    });
    // coverage : part des NOTIONS trouvées · information : part de l'INFORMATION de la question trouvée dans la fiche
    // (« mal au mollet depuis l'opération » → « je dors mal depuis l'opération » : 3 mots sur 4, mais pas « mollet »).
    return { doc: d, score: s, coverage: notions.length ? hit / notions.length : 0, information: poidsTotal ? poids / poidsTotal : 0 };
  }).filter(h => h.score > 0).sort((a, b2) => b2.score - a.score);
  return scored.slice(0, k);
}

// Réponse SANS modèle (USE_LLM=0, ou `claude` indisponible) : la fiche la plus proche si elle est assez sûre,
// sinon null → renvoi au secrétariat. Seule source de cette décision : le serveur ET la mesure de couverture
// (test/mesure-couverture.cjs) l'appellent, pour mesurer exactement ce que reçoit le patient.
// Seuil réglé le 2026-10-06 sur le jeu de TRAVAIL de test/questions-patients.json, une mauvaise fiche comptée deux
// fois plus cher qu'un renvoi. Ancien seuil (score ≥ 3, 30 % des MOTS) : 20 mauvaises fiches sur 90, 7 hors sujet
// servis sur 13. Après pondération, racines, ligatures, lexique : plateau 45-52 %, sommet à 50 % (72 bonnes,
// 3 mauvaises, 2 hors sujet servis) — autant de mauvaises fiches qu'à 55 %, six bonnes de plus.
const SEUIL_SCORE = 3, SEUIL_INFORMATION = 0.5;
function ficheDirecte(hits) {
  return hits.length && hits[0].score >= SEUIL_SCORE && hits[0].information >= SEUIL_INFORMATION ? hits[0].doc : null;
}

module.exports = { loadBrain, search, tokens, tokensQuestion, notionsQuestion, notionsLexique, ficheDirecte };
