// Questions de « Préparation de mon opération » : UNE seule liste, lue par le téléphone (prep.js), la vue du dossier
// dans l'admin (admin.html) et le serveur (lib/dossiers.js, qui ne garde que les réponses à ces questions-là).
// Ajouter une question ici l'ajoute partout.
'use strict';
(function (racine) {
  const F = {
    DOCS: [
      ['identite', 'Pièce d’identité valide (carte d’identité, passeport, titre de séjour)'],
      ['vitale', 'Carte Vitale et attestation de droits'],
      ['mutuelle', 'Carte de mutuelle (et prise en charge si demandée)'],
      ['ald', 'Justificatif ALD / accident du travail / CSS (si concerné)'],
      ['ordos', 'Ordonnances et liste de tous vos traitements'],
    ],
    ANESTH: [
      { id: 'poids', q: 'Votre poids (kg)', t: 'num' },
      { id: 'taille', q: 'Votre taille (cm)', t: 'num' },
      { id: 'allergie', q: 'Avez-vous des allergies (médicaments, latex, iode, aliments) ?', t: 'ouinon', detail: 'Lesquelles et quelle réaction ?' },
      { id: 'traitements', q: 'Prenez-vous des médicaments, y compris sans ordonnance ?', t: 'ouinon', detail: 'Noms et doses' },
      { id: 'anticoag', q: 'Prenez-vous un anticoagulant ou antiagrégant (Eliquis, Xarelto, Kardégic, Plavix…) ?', t: 'ouinon', detail: 'Lequel ?' },
      { id: 'operations', q: 'Avez-vous déjà été opéré(e) ?', t: 'ouinon', detail: 'Quelles opérations et quand ?' },
      { id: 'pbanesth', q: 'Problème lors d’une anesthésie (vous ou votre famille) ?', t: 'ouinon', detail: 'Lequel ?' },
      { id: 'coeur', q: 'Maladie du cœur, hypertension, pacemaker ?', t: 'ouinon', detail: 'Précisez' },
      { id: 'poumons', q: 'Asthme, bronchite chronique, essoufflement ?', t: 'ouinon', detail: 'Précisez' },
      { id: 'apnee', q: 'Apnée du sommeil (avec ou sans appareil) ?', t: 'ouinon' },
      { id: 'diabete', q: 'Diabète ?', t: 'ouinon', detail: 'Traitement (comprimés, insuline)' },
      { id: 'reinfoie', q: 'Maladie des reins ou du foie ?', t: 'ouinon', detail: 'Précisez' },
      { id: 'saignement', q: 'Saignez-vous facilement (bleus, saignements prolongés) ?', t: 'ouinon' },
      { id: 'tabac', q: 'Fumez-vous ?', t: 'ouinon', detail: 'Combien par jour ?' },
      { id: 'alcool', q: 'Buvez-vous de l’alcool tous les jours ?', t: 'ouinon' },
      { id: 'dents', q: 'Prothèse dentaire, dent qui bouge ?', t: 'ouinon' },
      { id: 'grossesse', q: 'Grossesse possible ou en cours ?', t: 'ouinon_na' },
    ],
    JOURJ: [
      ['jeun', 'Je connais mes heures de jeûne (fixées par l’anesthésiste)'],
      ['douche', 'Douche(s) faite(s) selon la fiche de la clinique'],
      ['bijoux', 'Bijoux, piercings, vernis et maquillage retirés'],
      ['docs', 'Documents, ordonnances et examens dans mon sac'],
      ['retour', 'Retour organisé (accompagnant obligatoire en ambulatoire)'],
    ],
  };
  if (typeof module === 'object' && module.exports) module.exports = F; else racine.PREP_FORMULAIRE = F;
})(typeof window !== 'undefined' ? window : globalThis);
