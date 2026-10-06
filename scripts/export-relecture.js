// Export de relecture pour le chirurgien, CLASSÉ PAR PRIORITÉ (2026-10-06) : un seul CSV pour Excel, à lire de haut en bas.
// Il contient les fiches (data/), le lexique (lib/lexique.js) et les sujets sans fiche.
// Ordre = risque pour le patient retiré par minute de relecture :
//   1. Lexique — médicament : une trentaine de lignes, quelques minutes ; une marque mal rangée oriente vers la fiche d'un autre médicament.
//   2. Fiche — médicament ou alerte : ce que le patient peut appliquer tel quel (piqûre, antidouleur, « appelez le 15 », fièvre).
//   3. Sujet sans fiche — patients : mots du compteur anonyme vus au moins 3 fois ; chaque question part au secrétariat. Une fiche à écrire ?
//   4. Fiche — autre : les plus demandées d'abord (nombre de questions types des jeux de test qui y renvoient).
//   5. Lexique — vocabulaire : mots familiers, abréviations, synonymes.
//   6. Sujet sans fiche — test : questions écrites par le modèle (test/questions-sans-fiche.json), pas par de vrais patients.
//   7. Fiche — déjà validée : relue, à revoir seulement en cas de doute.
// Les rangs 1 et 2 reposent sur des mots-clés, montrés dans « Pourquoi ce rang » : ils ordonnent la lecture, ils ne dispensent d'aucune ligne.
// Aucune donnée de patient : les sujets réels ne sont que des mots isolés comptés (lib/sujets.js), jamais une question.
// Usage : node scripts/export-relecture.js  →  relecture-fiches.csv
'use strict';
const fs = require('fs');
const path = require('path');
const { loadBrain, tokens } = require('../lib/brain');
const { LEXIQUE } = require('../lib/lexique');
const { sujetsNonCouverts } = require('../lib/sujets');

const RACINE = path.join(__dirname, '..');

// Mot-clé lisible retrouvé à partir des racines que produit tokens() (« fievr » → « fièvre »).
function motsCles(liste) {
  const m = new Map();
  for (const mot of liste) for (const r of tokens(mot)) m.set(r, mot);
  return m;
}
// Classes de médicaments telles que les fiches les nomment (ce sont aussi les cibles de la partie « médicaments » du lexique).
const MEDICAMENTS = motsCles(['paracétamol', 'ibuprofène', 'anti-inflammatoire', 'anti-acide', 'aspirine', 'anticoagulant', 'antibiotique', 'morphine',
  'tramadol', 'codéine', 'laxatif', 'somnifère', 'insuline', 'metformine', 'piqûre', 'comprimé', 'dose', 'médicament']);
// Signes qui font agir le patient. Pas « 15 » seul (il attrape « 15 jours ») : l'appel du 15 est repéré à part.
const ALERTE = motsCles(['fièvre', 'saignement', 'saigne', 'hémorragie', 'samu', 'essoufflement', 'jaunisse', 'malaise', 'pus']);
const APPEL_15 = /\b(?:le|au) 15\b/i;

const PRIORITES = ['', 'Lexique — médicament', 'Fiche — médicament ou alerte', 'Sujet sans fiche — patients', 'Fiche — autre',
  'Lexique — vocabulaire', 'Sujet sans fiche — test', 'Fiche — déjà validée'];

function risqueFiche(d) {
  const vus = new Set(tokens(`${d.question} ${d.answer}`));
  const mots = new Set([...MEDICAMENTS, ...ALERTE].filter(([r]) => vus.has(r)).map(([, mot]) => mot));
  if (APPEL_15.test(d.answer)) mots.add('appel du 15');
  return [...mots];
}
const lisible = cible => cible.split(' ').map(n => n.split('|').join(' ou ')).join(' + ');

// Nombre de questions types (jeux de test) qui attendent chaque fiche : approximation de ce que les patients demandent.
function demandesParFiche() {
  const n = {};
  for (const f of ['questions-patients.json', 'questions-fraiches.json']) {
    let jeu; try { jeu = JSON.parse(fs.readFileSync(path.join(RACINE, 'test', f), 'utf8')); } catch { continue; }
    for (const [, ids] of jeu.positives) for (const id of [].concat(ids)) n[id] = (n[id] || 0) + 1;
  }
  return n;
}
// Questions du jeu « sans fiche », moins celles qu'une fiche couvre déjà (relecture manuelle), avec la note des cas limites.
function sansFicheDeTest() {
  let S; try { S = JSON.parse(fs.readFileSync(path.join(RACINE, 'test', 'questions-sans-fiche.json'), 'utf8')); } catch { return []; }
  const c = S._controle_manuel || {};
  return S.questions.filter(q => !(c.couvertes || {})[q]).map(q => ({ question: q, limite: (c.limites || {})[q] }));
}

// Lignes à relire, dans l'ordre. Les sources sont injectables pour les tests ; par défaut, celles du projet.
function lignesRelecture({ docs = loadBrain(path.join(RACINE, 'data')).docs, lexique = LEXIQUE,
  sujets = sujetsNonCouverts(3), sansFiche = sansFicheDeTest(), demandes = demandesParFiche() } = {}) {
  const l = [];
  const ajoute = (priorite, o) => l.push({ priorite, type: PRIORITES[priorite], ...o });
  for (const [mot, cible] of Object.entries(lexique)) {
    const med = tokens(cible).some(r => MEDICAMENTS.has(r));
    ajoute(med ? 1 : 5, { ref: `lexique : ${mot}`, aRelire: `« ${mot} » chez le patient`, contenu: `cherché comme : ${lisible(cible)}`, ordre: mot,
      pourquoi: med ? 'marque ou nom de médicament : une erreur oriente vers la fiche d\'un autre médicament' : 'vocabulaire courant : oriente la recherche sans modèle' });
  }
  for (const d of docs) {
    const n = demandes[d.id] || 0, risque = risqueFiche(d);
    const freq = n ? `${n} question(s) type(s) y renvoient` : 'aucune question type n\'y renvoie';
    const priorite = d.validated ? 7 : risque.length ? 2 : 4;
    ajoute(priorite, { ref: d.id, theme: d.theme, aRelire: d.question, contenu: d.answer, valide: d.validated ? 'oui' : '', ordre: -n,
      pourquoi: [d.validated ? 'déjà validée' : risque.length ? `parle de : ${risque.join(', ')}` : '', freq].filter(Boolean).join(' · ') });
  }
  for (const { mot, n } of sujets)
    ajoute(3, { ref: 'sujet (patients)', aRelire: mot, contenu: `mot vu ${n} fois dans des questions restées sans fiche`, ordre: -n,
      pourquoi: 'chaque question sur ce sujet part au secrétariat : écrire une fiche ?' });
  for (const { question, limite } of sansFiche)
    ajoute(6, { ref: 'sujet (test)', aRelire: question, contenu: limite || 'aucune fiche ne répond : renvoyé au secrétariat', ordre: 0,
      pourquoi: 'question type écrite par le modèle, pas par un patient : écrire une fiche ?' });
  // Tri stable : priorité, puis ordre interne (fiches et sujets les plus demandés d'abord ; lexique alphabétique).
  return l.sort((a, b) => a.priorite - b.priorite || (typeof a.ordre === 'number' ? a.ordre - b.ordre : String(a.ordre).localeCompare(b.ordre)));
}

function csv(lignes) {
  const esc = s => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
  const tete = ['Rang', 'Priorité', 'Type', 'Référence', 'Thème', 'À relire', 'Contenu actuel', 'Pourquoi ce rang', 'Validé / fiche à écrire (oui/non)', 'Correction ou réponse du chirurgien'];
  return '﻿' + [tete, ...lignes.map((x, i) => [i + 1, x.priorite, x.type, x.ref, x.theme, x.aRelire, x.contenu, x.pourquoi, x.valide, ''])]
    .map(r => r.map(esc).join(';')).join('\r\n');
}

if (require.main === module) {
  const lignes = lignesRelecture();
  const out = path.join(RACINE, 'relecture-fiches.csv');
  fs.writeFileSync(out, csv(lignes), 'utf8');
  console.log(`${lignes.length} lignes → ${out}`);
  for (let p = 1; p < PRIORITES.length; p++) console.log(`  ${p}. ${PRIORITES[p].padEnd(30)} ${lignes.filter(x => x.priorite === p).length}`);
}

module.exports = { lignesRelecture, csv, PRIORITES };
