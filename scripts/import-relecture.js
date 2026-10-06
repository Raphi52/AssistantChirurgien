// Réimporte dans data/ la relecture que le chirurgien a notée dans relecture-fiches.csv (produit par export-relecture.js).
// Usage : node scripts/import-relecture.js [fichier.csv]               → montre ce qui serait fait, n'écrit RIEN
//         node scripts/import-relecture.js [fichier.csv] --appliquer   → écrit dans data/ (serveur arrêté)
// Ce qui est repris, ligne par ligne, d'après la colonne « Référence » :
//   Fiche F### : « oui » → validée telle quelle · une correction (dernière colonne) → nouvelle réponse, validée ·
//     « non » sans correction → archivée (plus servie aux patients, restaurable dans l'admin).
//     Si la fiche a changé dans data/ depuis l'export, RIEN n'est fait : le chirurgien a relu un autre texte (conflit signalé).
//   Sujet sans fiche : une réponse dans la dernière colonne → nouvelle fiche validée (data/11-ajouts-equipe.json), dont la
//     question est le texte de « À relire » (pour un mot du compteur patients, le remplacer par la question complète).
//   Lexique : jamais écrit ici (c'est du code, lib/lexique.js) : les « non » et corrections sont listés, à reporter à la main.
// Les écritures passent par lib/admin.js, comme l'admin : écriture atomique, journal admin-data/journal.jsonl, archivage.
// Accepte le CSV tel qu'Excel le réenregistre : UTF-8 ou Windows-1252, séparateur « ; » ou « , », colonnes dans n'importe quel ordre.
// Relancer sur le même fichier ne refait rien : ce qui est déjà appliqué est reconnu.
'use strict';
const fs = require('fs');
const path = require('path');
const net = require('net');
const { loadBrain } = require('../lib/brain');
const { createStore } = require('../lib/admin');

const RACINE = path.join(__dirname, '..');

// Excel enregistre souvent en Windows-1252 (« CSV séparateur point-virgule ») : on le reconnaît à un UTF-8 invalide.
// PAS de TextDecoder('windows-1252') : depuis Node 20.18.3 / 22.13.0 il décode en ISO-8859-1 et change « œ » (0x9C), « — » (0x97),
// « € » (0x80)… en caractères de contrôle (https://github.com/nodejs/node/issues/60888, constaté ici sous Node 20.20.2).
// Table des octets 0x80-0x9F selon https://encoding.spec.whatwg.org/index-windows-1252.txt ; les autres octets valent leur code.
const CP1252 = '€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008DŽ\u008F' +
  '\u0090‘’“”•–—˜™š›œ\u009DžŸ';
function decoder(buf) {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString('utf8');
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch {}
  return Buffer.from(buf).toString('latin1').replace(/[\x80-\x9f]/g, c => CP1252[c.charCodeAt(0) - 0x80]);
}

// CSV : guillemets doublés, retours à la ligne dans un champ, fin de ligne \r\n ou \n. Séparateur deviné sur l'en-tête.
function lireCsv(texte) {
  let pv = 0, v = 0;
  for (let i = 0, q = false; i < texte.length && (q || (texte[i] !== '\n' && texte[i] !== '\r')); i++) {
    if (texte[i] === '"') q = !q; else if (!q && texte[i] === ';') pv++; else if (!q && texte[i] === ',') v++;
  }
  const sep = v > pv ? ',' : ';';
  const lignes = []; let l = [], champ = '', q = false;
  for (let i = 0; i < texte.length; i++) {
    const c = texte[i];
    if (q) { if (c === '"') { if (texte[i + 1] === '"') { champ += '"'; i++; } else q = false; } else champ += c; }
    else if (c === '"') q = true;
    else if (c === sep) { l.push(champ); champ = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && texte[i + 1] === '\n') i++; l.push(champ); lignes.push(l); l = []; champ = ''; }
    else champ += c;
  }
  if (champ || l.length) { l.push(champ); lignes.push(l); }
  return lignes.filter(r => r.some(x => x.trim()));
}

const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
const comparable = s => String(s || '').replace(/\s+/g, ' ').trim();
const meme = (a, b) => comparable(a) === comparable(b);
const COLONNES = { ref: ['reference', 'Référence'], aRelire: ['a relire', 'À relire'], contenu: ['contenu actuel', 'Contenu actuel'],
  valide: ['valide', 'Validé / fiche à écrire'], correction: ['correction', 'Correction ou réponse du chirurgien'] };
function colonnes(tete) {
  const c = {};
  for (const [k, [debut, nom]] of Object.entries(COLONNES)) {
    c[k] = tete.findIndex(h => norm(h).startsWith(debut));
    if (c[k] < 0) throw new Error(`colonne « ${nom} » introuvable : ce fichier vient-il bien de scripts/export-relecture.js ?`);
  }
  return c;
}
function avisDe(s) {
  const v = norm(s).replace(/[.!]/g, '');
  return /^(oui|o|x|ok|yes|y|1|✓|valide|validee)$/.test(v) ? 'oui' : /^(non|n|no|0|refuse|refusee)$/.test(v) ? 'non' : v ? 'incompris' : '';
}
// Mêmes seuils que check() dans lib/admin.js, pour que la simulation annonce les refus que l'écriture ferait.
const tropCourte = (question, answer) => (question.length < 5 ? 'question trop courte' : answer.length < 20 ? 'réponse trop courte (20 caractères minimum)' : '');

// Ce que le CSV demande, comparé à data/ ACTUEL. N'écrit rien.
function planifier(texte, root = RACINE) {
  const brain = loadBrain(path.join(root, 'data'));
  let archives = []; try { archives = JSON.parse(fs.readFileSync(path.join(root, 'admin-data', 'archives.json'), 'utf8')); } catch {}
  const archivees = new Set(archives.map(d => d.id));
  const [tete = [], ...lignes] = lireCsv(texte);
  const c = colonnes(tete);
  const actions = [], notes = [];
  const note = (genre, ref, message) => notes.push({ genre, ref, message });
  const questions = new Map(brain.docs.map(d => [norm(comparable(d.question)), d.id]));
  const vues = new Set();
  let relues = 0;
  for (const r of lignes) {
    const cell = k => r[c[k]] || '';
    const ref = cell('ref').trim(), aRelire = comparable(cell('aRelire')), corr = cell('correction').trim(), avis = avisDe(cell('valide'));
    if (!avis && !corr) continue; // ligne non relue
    relues++;
    if (avis === 'incompris') { note('incompris', ref, `« ${cell('valide').trim()} » dans la colonne Validé : écrire oui ou non`); continue; }
    if (/^F\d{3,}$/.test(ref)) {
      if (vues.has(ref)) { note('incompris', ref, 'fiche présente deux fois dans le CSV : seconde ligne ignorée'); continue; }
      vues.add(ref);
      const d = brain.byId[ref];
      if (!d) { note(archivees.has(ref) ? 'deja' : 'conflit', ref, archivees.has(ref) ? 'déjà archivée' : 'fiche absente de data/ depuis l\'export'); continue; }
      const base = { id: d.id, question: d.question, keywords: d.keywords || [], answer: d.answer };
      if (corr) {
        if (meme(d.answer, corr)) { if (d.validated) note('deja', ref, 'correction déjà appliquée'); else actions.push({ genre: 'valider', id: ref, fiche: base }); continue; }
        if (!meme(d.answer, cell('contenu'))) { note('conflit', ref, 'la fiche a changé dans data/ depuis l\'export : correction non appliquée, à reprendre dans l\'admin'); continue; }
        const refus = tropCourte(d.question, corr); if (refus) { note('refus', ref, refus); continue; }
        actions.push({ genre: 'corriger', id: ref, fiche: { ...base, answer: corr }, avant: d.answer });
        continue;
      }
      if (avis === 'oui' && d.validated) { note('deja', ref, 'déjà validée'); continue; }
      if (!meme(d.answer, cell('contenu'))) { note('conflit', ref, `la fiche a changé dans data/ depuis l'export : « ${avis} » non appliqué (le chirurgien a relu un autre texte)`); continue; }
      actions.push(avis === 'oui' ? { genre: 'valider', id: ref, fiche: base } : { genre: 'archiver', id: ref, fiche: base });
      continue;
    }
    if (/^lexique/i.test(ref)) {
      if (avis === 'non' || corr) note('a-la-main', ref, corr ? `correction : ${corr}` : 'refusé par le chirurgien');
      continue;
    }
    if (/^sujet/i.test(ref)) {
      if (avis === 'non') { if (corr) note('incompris', ref, '« non » ET une réponse : aucune fiche créée'); continue; }
      if (!corr) { note('incompris', ref, `« oui » sans réponse : écrire la réponse dans la dernière colonne (${aRelire.slice(0, 50)})`); continue; }
      if (!/\s/.test(aRelire)) { note('refus', ref, `« ${aRelire} » n'est pas une question : la remplacer par la question complète dans « À relire »`); continue; }
      const deja = questions.get(norm(aRelire));
      if (deja) { note('deja', ref, `une fiche existe déjà pour cette question (${deja})`); continue; }
      const refus = tropCourte(aRelire, corr); if (refus) { note('refus', ref, refus); continue; }
      questions.set(norm(aRelire), '(nouvelle)');
      actions.push({ genre: 'creer', fiche: { question: aRelire, keywords: [], answer: corr } });
      continue;
    }
    note('incompris', ref || '(sans référence)', 'référence inconnue : ligne ignorée');
  }
  return { actions, notes, relues, lignes: lignes.length };
}

// Écrit le plan dans data/ par le même chemin que l'admin (rôle chirurgien, journalisé).
function appliquer(plan, root = RACINE, quand = new Date().toISOString().slice(0, 10)) {
  const dir = path.join(root, 'data');
  const brain = loadBrain(dir);
  // Recharger après chaque écriture : deux nouvelles fiches ne doivent jamais recevoir le même numéro.
  const store = createStore(root, brain, () => Object.assign(brain, loadBrain(dir)));
  const motif = `relecture CSV du chirurgien (${quand})`;
  for (const a of plan.actions) {
    if (a.genre === 'archiver') store.archive('chirurgien', a.id, motif);
    else a.id = store.publish('chirurgien', a.fiche, motif).id;
  }
  return plan.actions;
}

// Le serveur garde les fiches en mémoire : écrire pendant qu'il tourne le laisserait servir les anciennes (même archivées),
// et son admin pourrait redonner un numéro déjà pris. On refuse donc d'écrire tant que son port accepte une connexion.
// Une connexion acceptée suffit (un serveur occupé peut tarder à répondre) ; seul un refus net prouve qu'il est arrêté.
function serveurActif(port) {
  return new Promise(ok => {
    const s = net.connect({ host: '127.0.0.1', port });
    const fin = actif => { s.destroy(); ok(actif); };
    s.setTimeout(1500, () => fin(true)); // ni accepté ni refusé : dans le doute, on n'écrit pas
    s.once('connect', () => fin(true));
    s.once('error', () => fin(false));
  });
}

const ICONES = { valider: '✓ valider ', corriger: '✎ corriger', archiver: '✗ archiver', creer: '+ créer   ' };
const TITRES = { conflit: 'Conflits (rien fait : la fiche a changé depuis l\'export)', refus: 'Refusé', incompris: 'Non compris',
  'a-la-main': 'À reporter à la main dans lib/lexique.js', deja: 'Déjà appliqué' };

if (require.main === module) {
  (async () => {
    const args = process.argv.slice(2), ecrire = args.includes('--appliquer');
    const fichier = path.resolve(args.find(a => !a.startsWith('--')) || path.join(RACINE, 'relecture-fiches.csv'));
    let plan;
    try { plan = planifier(decoder(fs.readFileSync(fichier))); } catch (e) { console.error(`✗ ${fichier} : ${e.message}`); process.exit(1); }
    console.log(`${fichier} : ${plan.relues} ligne(s) annotée(s) par le chirurgien sur ${plan.lignes}.`);
    console.log(`\nÀ appliquer (${plan.actions.length}) :`);
    for (const a of plan.actions) console.log(`  ${ICONES[a.genre]}  ${a.id || '(nouvelle)'}  ${a.fiche.question.slice(0, 80)}`);
    for (const [genre, titre] of Object.entries(TITRES)) {
      const n = plan.notes.filter(x => x.genre === genre); if (!n.length) continue;
      console.log(`\n${titre} (${n.length}) :`); for (const x of n) console.log(`  ${x.ref}  ${x.message}`);
    }
    if (!ecrire) { console.log(`\nRien n'a été écrit. Pour appliquer : node scripts/import-relecture.js${args.find(a => !a.startsWith('--')) ? ' "' + fichier + '"' : ''} --appliquer`); return; }
    if (!plan.actions.length) { console.log('\nRien à écrire.'); return; }
    const port = Number(process.env.PORT || 8787);
    if (await serveurActif(port)) {
      console.error(`\n✗ Le serveur répond sur le port ${port} : arrêtez-le, relancez cette commande, puis redémarrez-le.`);
      console.error('  Sinon il continuerait de servir les anciennes fiches, y compris celles que le chirurgien a refusées.');
      process.exit(2);
    }
    appliquer(plan);
    console.log(`\n✓ ${plan.actions.length} changement(s) écrit(s) dans data/ et notés dans admin-data/journal.jsonl.`);
    for (const a of plan.actions.filter(x => x.genre === 'creer')) console.log(`  nouvelle fiche ${a.id} : ${a.fiche.question.slice(0, 80)}`);
  })();
}

module.exports = { lireCsv, decoder, planifier, appliquer, serveurActif };
