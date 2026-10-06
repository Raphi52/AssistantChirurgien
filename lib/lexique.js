// Vocabulaire du patient → mots des fiches (2026-10-06).
// Ne contient AUCUNE réponse médicale : il oriente seulement la recherche vers une fiche existante, dont le patient
// lit ensuite le texte. Chaque entrée remplace le mot du patient. Notation : « a|b » = alternatives, UNE suffit
// (synonymes) ; « a b » = deux notions à trouver toutes les deux. Garder le mot d'origine en alternative s'il figure
// aussi dans les fiches. Toutes les cibles doivent exister dans les fiches (vérifié par test/run.js).
// Comme les fiches, ce tableau est à relire par le chirurgien : une marque mal rangée orienterait vers la mauvaise fiche.
'use strict';

const LEXIQUE = {
  // abréviations et formes familières
  op: 'operation', ope: 'operation', operee: 'operation', opere: 'operation', intervention: 'operation|intervention',
  coelio: 'coelioscopie', celio: 'coelioscopie', laparo: 'laparotomie',
  bosser: 'travail', boulot: 'travail', taf: 'travail', job: 'travail',
  pipi: 'uriner', caca: 'selles',
  courante: 'diarrhee', chiasse: 'diarrhee',
  footing: 'sport', jogging: 'sport', courir: 'sport', muscu: 'sport|musculation', gym: 'sport', salle: 'sport',
  fac: 'etudes', college: 'ecole', lycee: 'ecole', creche: 'enfant',
  conges: 'vacances',
  // synonymes courants que les fiches n'emploient pas toujours
  soigner: 'soigner|traiter', soigne: 'soigner|traiter', traiter: 'traiter|soigner',
  refaire: 'reprendre', recommencer: 'reprendre',
  enlever: 'retirer|enlever', enleve: 'retirer|enlever', enlevent: 'retirer|enlever',
  irm: 'irm|imagerie', scanner: 'scanner|imagerie', radio: 'radio|imagerie', radios: 'radio|imagerie',
  secu: 'rembourse', mutuelle: 'rembourse', remboursement: 'rembourse',
  cailloux: 'calculs', caillou: 'calcul', pierres: 'calculs',
  tuyau: 'drain|sonde', tuyaux: 'drain|sonde',
  angoisse: 'peur', angoisser: 'peur', stress: 'peur|stress', stresse: 'peur|stress', trouille: 'peur',
  moral: 'deprime', deprime: 'deprime', cafard: 'deprime',
  enfle: 'gonfle', enflee: 'gonfle', enflees: 'gonfle', enfles: 'gonfle',
  mollet: 'jambe', mollets: 'jambe', cheville: 'jambe', chevilles: 'jambe',
  migraine: 'mal tete', crane: 'tete',
  fondre: 'dissoudre', recidiver: 'revenir', recidive: 'revenir',
  poche: 'poche|stomie', poches: 'poche|stomie',
  generaliste: 'medecin traitant', toubib: 'medecin|chirurgien',
  anapath: 'analyse', anatomopathologie: 'analyse', biopsie: 'analyse',
  gastroscopie: 'fibroscopie', gastro: 'fibroscopie',
  cholecystectomie: 'ablation vesicule', appendicectomie: 'operation appendicite',
  // médicaments : marque → classe telle que les fiches la nomment
  doliprane: 'paracetamol', dafalgan: 'paracetamol', efferalgan: 'paracetamol',
  advil: 'ibuprofene', nurofen: 'ibuprofene', antiinflammatoire: 'ibuprofene',
  lovenox: 'anticoagulant piqure', innohep: 'anticoagulant piqure', fragmine: 'anticoagulant piqure', arixtra: 'anticoagulant piqure',
  eliquis: 'anticoagulant', xarelto: 'anticoagulant', pradaxa: 'anticoagulant', previscan: 'anticoagulant', coumadine: 'anticoagulant',
  kardegic: 'aspirine|anticoagulant', plavix: 'anticoagulant',
  forlax: 'laxatif', movicol: 'laxatif', duphalac: 'laxatif', microlax: 'laxatif',
  imodium: 'diarrhee medicament', smecta: 'diarrhee medicament',
  omeprazole: 'anti acide', mopral: 'anti acide', inexium: 'anti acide', pantoprazole: 'anti acide', lansoprazole: 'anti acide',
  stilnox: 'somnifere', zolpidem: 'somnifere', imovane: 'somnifere',
};

module.exports = { LEXIQUE };
