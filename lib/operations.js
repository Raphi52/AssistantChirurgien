// Types d'opération RÉGLABLES depuis l'admin (écran « Types d'opération », chirurgien seul pour enregistrer).
// Chaque type règle ce que voit le patient dans « Préparation de mon opération » :
//  - cliniques : où ce type se fait (l'étape 1 ne propose que les types de la clinique choisie) ;
//  - anesthesie : false = l'étape « Questionnaire d'anesthésie » n'apparaît pas.
// Nouveau réglage par type : l'ajouter ici (normaliser), dans l'écran admin et dans public/prep.js.
// Ceci n'est PAS du savoir médical : c'est l'organisation du service, saisie par le chirurgien.
'use strict';
const fs = require('fs');
const path = require('path');

// Clés des cliniques : COPIE des clés de CLINIQUES dans public/prep.js (test/run.js vérifie la copie).
const CLINIQUES = ['parc', 'medipole'];
// Point de départ tant que le chirurgien n'a rien enregistré : les thèmes chirurgicaux des fiches de data/,
// faits dans les deux cliniques, avec questionnaire d'anesthésie.
const DEFAUT = ['Cholécystectomie (vésicule)', 'Appendicectomie', 'Cure de hernie inguinale', 'Cure de hernie ombilicale', 'Cure d’éventration',
  'Chirurgie du reflux (fundoplicature)', 'Colectomie', 'Fermeture de stomie'].map(nom => ({ nom, cliniques: [...CLINIQUES], anesthesie: true }));

const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

function normaliser(liste) {
  if (!Array.isArray(liste)) throw new Error('liste attendue');
  if (liste.length > 60) throw new Error('60 types au maximum');
  const vus = new Set();
  return liste.map(o => {
    const nom = String(o && o.nom || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
    if (nom.length < 2) throw new Error('chaque type doit avoir un nom');
    const id = /^[a-z0-9-]{1,40}$/.test(o.id || '') ? o.id : slug(nom);
    if (!id || vus.has(id)) throw new Error('type en double : ' + nom);
    vus.add(id);
    const cliniques = CLINIQUES.filter(c => Array.isArray(o.cliniques) && o.cliniques.includes(c));
    if (!cliniques.length) throw new Error('« ' + nom + ' » : cochez au moins une clinique');
    return { id, nom, cliniques, anesthesie: o.anesthesie !== false };
  });
}

function createOperations(file) {
  const liste = () => { try { return normaliser(JSON.parse(fs.readFileSync(file, 'utf8'))); } catch { return normaliser(DEFAUT); } };
  function enregistrer(L) {
    const n = normaliser(L);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(n, null, 2));
    return n;
  }
  return { liste, enregistrer };
}
module.exports = { createOperations, CLINIQUES };
