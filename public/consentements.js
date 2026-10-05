// ⚠️ MODÈLES PROVISOIRES — textes TYPES de consentement, rédigés pour la démonstration (2026-10-05).
// Ils ne sont PAS validés par le chirurgien, l'anesthésiste ni la clinique : à REMPLACER par les formulaires officiels.
// Pour remplacer un document : garder la même clé (chir, anesth, confiance, devis), changer titre / resume / paragraphes.
// « {patient} », « {clinique} » et « {date} » sont remplacés à l'affichage par les informations saisies sur le téléphone.
// Repères juridiques cités (texte public, Légifrance) : art. L1111-2 et L1111-4 (information et consentement),
// L1111-6 (personne de confiance), L1111-3 (information sur les frais) du Code de la santé publique.
'use strict';
window.CONSENTEMENTS_MODELES = {
  chir: {
    titre: 'Consentement éclairé à l’intervention chirurgicale',
    resume: [
      'Le chirurgien vous a expliqué <b>l’opération prévue</b> et son but.',
      'Vous connaissez les <b>risques</b> fréquents et les risques graves, même rares.',
      'On vous a présenté les <b>autres solutions</b> possibles et ce qui arrive sans opération.',
      'Le chirurgien peut <b>adapter le geste</b> pendant l’opération si votre sécurité l’exige.',
      'Vous pouvez <b>retirer votre accord</b> à tout moment avant l’opération.',
    ],
    paragraphes: [
      'Je soussigné(e) {patient}, reconnais avoir reçu du chirurgien, au cours d’une consultation, une information claire, loyale et adaptée sur l’intervention qui m’est proposée, prévue le {date} à {clinique}.',
      'Cette information a porté sur la nature et le but de l’intervention, son déroulement, la durée prévisible d’hospitalisation et de convalescence, ainsi que sur les soins et précautions à suivre après l’opération.',
      'J’ai été informé(e) des risques fréquents et des risques graves, même exceptionnels, liés à l’intervention, ainsi que des conséquences possibles d’un refus de l’opération et des autres solutions thérapeutiques envisageables.',
      'J’accepte que le chirurgien puisse, au cours de l’intervention, réaliser un geste complémentaire ou modifier la technique prévue si une découverte ou une difficulté imprévue le rend nécessaire dans mon intérêt. J’en serai informé(e) à mon réveil.',
      'J’ai pu poser toutes mes questions et j’ai disposé d’un délai de réflexion suffisant. Je sais que je peux retirer mon consentement à tout moment avant l’intervention (art. L1111-4 du Code de la santé publique).',
      'En conséquence, je donne mon accord pour la réalisation de cette intervention.',
    ],
  },
  anesth: {
    titre: 'Consentement à l’anesthésie',
    resume: [
      'Vous avez vu le <b>médecin anesthésiste</b> en consultation avant l’opération.',
      'Le <b>type d’anesthésie</b> proposé (générale, locorégionale…) vous a été expliqué.',
      'Vous connaissez les <b>effets indésirables</b> et les risques, même rares.',
      'Vous devez respecter les consignes de <b>jeûne</b> et de traitements données.',
      'L’anesthésiste peut <b>changer de technique</b> si votre sécurité l’exige.',
    ],
    paragraphes: [
      'Je soussigné(e) {patient}, reconnais avoir été reçu(e) en consultation d’anesthésie avant l’intervention prévue le {date} à {clinique}.',
      'Le médecin anesthésiste m’a informé(e) de la technique d’anesthésie envisagée, de son déroulement, de la surveillance au réveil et de la prise en charge de la douleur.',
      'J’ai été informé(e) des effets indésirables possibles et des risques, fréquents ou graves même exceptionnels, propres à l’anesthésie et à la transfusion éventuelle.',
      'Je m’engage à respecter les consignes qui m’ont été données, notamment le jeûne avant l’intervention et l’arrêt ou la poursuite de mes traitements, et à signaler tout changement de mon état de santé avant l’opération.',
      'J’accepte que l’anesthésiste modifie la technique prévue si les circonstances l’exigent pour ma sécurité.',
      'J’ai pu poser mes questions. Je donne mon accord pour l’anesthésie qui m’a été proposée.',
    ],
  },
  confiance: {
    titre: 'Désignation de la personne de confiance',
    resume: [
      'Vous pouvez <b>désigner une personne</b> de votre entourage, sans obligation.',
      'Elle peut vous <b>accompagner</b> dans vos démarches et entretiens médicaux.',
      'Si vous ne pouvez plus vous exprimer, l’équipe la <b>consultera en priorité</b>.',
      'La désignation est <b>révocable à tout moment</b>.',
    ],
    paragraphes: [
      'Je soussigné(e) {patient}, hospitalisé(e) à {clinique} pour une intervention prévue le {date}, ai été informé(e) de la possibilité de désigner une personne de confiance (art. L1111-6 du Code de la santé publique).',
      'La personne de confiance peut m’accompagner dans mes démarches et assister aux entretiens médicaux afin de m’aider dans mes décisions. Si je ne suis plus en état d’exprimer ma volonté, elle sera consultée en priorité par l’équipe médicale.',
      'Je désigne comme personne de confiance : nom, prénom, lien, téléphone — à compléter sur le formulaire officiel de la clinique.',
      'Cette désignation vaut pour la durée de mon hospitalisation, sauf décision contraire de ma part. Je peux la modifier ou l’annuler à tout moment.',
    ],
  },
  devis: {
    titre: 'Information sur les honoraires et devis',
    resume: [
      'Vous avez reçu le <b>montant des honoraires</b> du chirurgien et, le cas échéant, de l’anesthésiste.',
      'Les <b>dépassements d’honoraires</b> éventuels vous ont été indiqués avant l’opération.',
      'Vous savez ce qui est <b>remboursé</b> par l’Assurance maladie et ce qui peut l’être par votre mutuelle.',
    ],
    paragraphes: [
      'Je soussigné(e) {patient}, reconnais avoir reçu, avant l’intervention prévue le {date} à {clinique}, une information écrite sur les honoraires du chirurgien et, le cas échéant, sur les dépassements d’honoraires (art. L1111-3 du Code de la santé publique).',
      'Cette information précise la part prise en charge par l’Assurance maladie et le montant restant à ma charge, dont une partie peut être remboursée par ma complémentaire santé selon mon contrat.',
      'Le montant exact figure sur le devis remis par le praticien, qui reste le seul document de référence.',
      'J’ai disposé d’un délai de réflexion et j’accepte ces conditions.',
    ],
  },
};

// Rendu PARTAGÉ du document signé : page patient (prep.js) et vue « Patients » de l'admin (admin.html).
// champs = { patient, clinique (nom affiché), date (AAAA-MM-JJ), sig ({ img, le } ou absent) }.
(function () {
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  window.consentementDoc = function (k, champs) {
    const M = window.CONSENTEMENTS_MODELES[k]; if (!M) return '';
    const vide = '……………', sig = champs.sig, nom = String(champs.patient || '').trim();
    const d = /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(champs.date || '') ? new Date(champs.date + 'T00:00:00').toLocaleDateString('fr-FR') : '';
    const v = { patient: nom || vide, clinique: champs.clinique || vide, date: d || vide };
    const p = t => esc(t).replace(/\{(patient|clinique|date)\}/g, (_, c) => '<b>' + esc(v[c]) + '</b>');
    return `<div class="docpage"><div class="provban">MODÈLE PROVISOIRE — texte type non validé, à remplacer par le formulaire officiel</div>
      <h4>${esc(M.titre)}</h4>${M.paragraphes.map(t => '<p>' + p(t) + '</p>').join('')}
      <div class="docsig"><div>Fait le <b>${sig ? esc(String(sig.le).split(' ')[0]) : vide}</b></div><div>Nom et signature du patient : <b>${esc(nom || vide)}</b></div>
      ${sig ? `<img class="sigimg" src="${esc(sig.img)}" alt="Signature du patient">` : '<div class="sigvide">Signez ci-dessous : la signature apparaîtra ici.</div>'}</div></div>`;
  };
  const st = document.createElement('style');
  st.textContent = `.docpage { background:#fff; border:1px solid #d6dde1; border-radius:6px; padding:12px 14px; margin:6px 0; font:13px/1.5 Georgia,serif; color:#1f2933; max-width:720px; }
  .docpage h4 { margin:6px 0 8px; font:600 15px system-ui; } .docpage p { margin:0 0 8px; }
  .provban { font:600 11px system-ui; color:#92400e; background:#fef3c7; border-radius:4px; padding:4px 6px; }
  .docsig { margin-top:12px; padding-top:8px; border-top:1px solid #d6dde1; } .docsig .sigimg { display:block; max-width:220px; width:100%; height:auto; border:0; border-bottom:1px solid #9aa7b1; border-radius:0; background:#fff; }
  .sigvide { height:50px; border:1px dashed #f3d08a; background:#fff8e6; border-radius:4px; font:12px system-ui; color:#92400e; padding:6px; margin-top:4px; }
  details.doc > summary { color:#0f766e; text-decoration:underline; font-size:14px; cursor:pointer; padding:4px 0; }`;
  document.head.appendChild(st);
})();
