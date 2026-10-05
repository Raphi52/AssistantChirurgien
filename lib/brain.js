// Second brain : fiches JSON validables, recherche BM25 sans dépendance.
'use strict';
const fs = require('fs');
const path = require('path');

const STOP = new Set('le la les un une des de du d l et ou a au aux en dans pour par sur avec sans ce cet cette ces mon ma mes ton ta tes son sa ses je j tu il elle on nous vous ils elles me m te t se s ne n pas plus est suis es sont ai as avons avez ont etre avoir que qu qui quoi quand comment pourquoi combien quel quelle quels quelles y est-ce ça ca c faut peux peut puis-je dois doit bien tres trop apres avant grave normal normale inquieter inquiete inquiet souci probleme possible savoir voudrais aimerais docteur'.split(' '));

function norm(s) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ');
}
function stem(w) { return w.length > 5 ? w.replace(/(ements|ement|ations|ation|ees|ee|es|s|e)$/, '') : w.replace(/s$/, ''); }
function tokens(s) { return norm(s).split(' ').filter(w => w.length > 1 && !STOP.has(w)).map(stem); }

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
  const qt = [...new Set(tokens(q))];
  const N = brain.docs.length, k1 = 1.4, b = 0.7;
  const scored = brain.docs.map(d => {
    let s = 0, hit = 0;
    for (const t of qt) {
      const tf = d._tf[t]; if (!tf) continue;
      hit++;
      const idf = Math.log(1 + (N - brain.df[t] + 0.5) / (brain.df[t] + 0.5));
      s += idf * (tf * (k1 + 1)) / (tf + k1 * (1 - b + b * d._tok.length / brain.avg));
    }
    return { doc: d, score: s, coverage: qt.length ? hit / qt.length : 0 };
  }).filter(h => h.score > 0).sort((a, b2) => b2.score - a.score);
  return scored.slice(0, k);
}

module.exports = { loadBrain, search, tokens };
