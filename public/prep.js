// « Préparation de mon opération » — gardée sur le TÉLÉPHONE du patient (localStorage).
// ⚠️ DÉMO : l'avancement et les signatures sont AUSSI envoyés au serveur (/api/prep) pour la vue « Patients » de l'admin.
// Dérogation à la règle « aucune donnée patient stockée » — interdit en production sans hébergement HDS (voir lib/dossiers.js).
// Les préadmissions renvoient vers les portails OFFICIELS des cliniques (sources ci-dessous).
'use strict';
(function () {
  const KEY = 'prep-v1';
  // Sources des portails, vérifiées le 2026-10-02 :
  // Clinique du Parc Lyon (ELSAN) : https://www.elsan.care/fr/clinique-parc-lyon/nos-actualites/mon-espace-elsan-care-la-preadmission-en-ligne-debarque-la
  // Médipôle Lyon-Villeurbanne (Ramsay) : https://www.medipolelyonvilleurbanne.fr/votre-sejour/en-chirurgie-conventionnelle/
  // Types d'opération RÉGLÉS par le chirurgien dans l'admin (lib/operations.js) : { id, nom, cliniques, anesthesie }.
  // Chargés depuis /api/operations, gardés sur le téléphone pour fonctionner hors connexion.
  let OPERATIONS = (() => { try { return JSON.parse(localStorage.getItem('operations-cache')) || []; } catch { return []; } })();
  let opsChargees = false, opsEnCours = false;
  function chargerOperations() {
    const code = localStorage.getItem('code'); if (opsChargees || opsEnCours || !code) return;
    opsEnCours = true;
    fetch('/api/operations', { headers: { 'x-access-code': code } }).then(r => (r.ok ? r.json() : null))
      .then(L => { if (Array.isArray(L)) { OPERATIONS = L; opsChargees = true; localStorage.setItem('operations-cache', JSON.stringify(L)); render(); } })
      .catch(e => console.warn('[prep] types d’opération non chargés', e)).finally(() => { opsEnCours = false; });
  }
  const opCourante = () => OPERATIONS.find(o => o.id === g('operation'));
  // Type compté seulement s'il existe et se fait dans la clinique choisie.
  const opOk = () => { const o = opCourante(); return !!o && (!g('clinique') || o.cliniques.includes(g('clinique'))); };
  // Sans type choisi, l'étape anesthésie reste affichée (cas le plus fréquent) ; le type peut la retirer.
  // Consentements demandés : sans questionnaire d'anesthésie (réglage du type d'opération), pas de consentement anesthésie non plus.
  const consentsActifs = () => CONSENTS.filter(([k]) => k !== 'anesth' || anesthOn());
  const anesthOn = () => { const o = opCourante(); return !o || o.anesthesie !== false; };
  const CLINIQUES = {
    parc: { nom: 'Clinique du Parc (Lyon 6e)', portail: 'https://www.elsan.care/fr/clinique-parc-lyon', portailNom: 'Mon Espace Elsan Care',
      delai: 'dès que possible après la date fixée', tel: '08 26 39 00 06', adresse: '155 ter boulevard de Stalingrad, 69006 Lyon' },
    medipole: { nom: 'Médipôle Lyon-Villeurbanne', portail: 'https://www.ramsayservices.fr', portailNom: 'Ramsay Services',
      delai: 'au plus tôt, et au moins 10 jours avant l’hospitalisation', tel: '', adresse: 'Villeurbanne — un bureau de préadmission existe aussi au centre de consultation Léon Blum' },
  };
  const DOCS = [
    ['identite', 'Pièce d’identité valide (carte d’identité, passeport, titre de séjour)'],
    ['vitale', 'Carte Vitale et attestation de droits'],
    ['mutuelle', 'Carte de mutuelle (et prise en charge si demandée)'],
    ['ald', 'Justificatif ALD / accident du travail / CSS (si concerné)'],
    ['ordos', 'Ordonnances et liste de tous vos traitements'],
  ];
  const ANESTH = [
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
  ];
  const CONSENTS = [
    ['chir', 'Consentement éclairé pour l’opération', 'Remis par le chirurgien après l’explication de l’intervention.'],
    ['anesth', 'Consentement pour l’anesthésie', 'Remis lors de la consultation d’anesthésie.'],
    ['confiance', 'Désignation de la personne de confiance', 'Formulaire de la clinique, à remplir à l’admission ou avant.'],
    ['devis', 'Devis / information sur les honoraires', 'Si des dépassements d’honoraires sont prévus.'],
  ];
  const JOURJ = [
    ['jeun', 'Je connais mes heures de jeûne (fixées par l’anesthésiste)'],
    ['douche', 'Douche(s) faite(s) selon la fiche de la clinique'],
    ['bijoux', 'Bijoux, piercings, vernis et maquillage retirés'],
    ['docs', 'Documents, ordonnances et examens dans mon sac'],
    ['retour', 'Retour organisé (accompagnant obligatoire en ambulatoire)'],
  ];

  let S = load();
  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } }
  function save() { localStorage.setItem(KEY, JSON.stringify(S)); render(); envoyer(); }
  // Nom et prénom : saisis séparément sur la page de connexion (index.html). Absents pour un téléphone connecté avant
  // ce changement : non envoyés, le serveur garde alors ce qu'il avait et l'admin découpe le nom complet.
  // Envoi (démo) : ni le questionnaire d'anesthésie ni les documents cochés, seulement l'avancement et les signatures.
  function idDossier() { let i = localStorage.getItem('prep-id'); if (!/^[a-f0-9]{16}$/.test(i || '')) { i = [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, '0')).join(''); localStorage.setItem('prep-id', i); } return i; }
  // Envoi immédiat, en file (un seul à la fois, le dernier état gagne) : un minuteur différé était perdu
  // quand la page enchaînait l'impression (mesuré dans test/prep-ui.cjs, 2026-10-05).
  let enCours = null, enAttente = false;
  function envoyer() {
    if (enCours) { enAttente = true; return; }
    const code = localStorage.getItem('code'); if (!code) return;
    enCours = fetch('/api/prep', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-access-code': code },
      body: JSON.stringify({ id: idDossier(), patient: localStorage.getItem('patient') || '', nom: localStorage.getItem('nom') ?? undefined, prenom: localStorage.getItem('prenom') ?? undefined, clinique: g('clinique', ''), date: g('date', ''), operation: g('operation', ''), progression: progress(), signatures: Object.fromEntries(Object.entries(g('sig', {})).filter(([k]) => consentsActifs().some(c => c[0] === k))) }) })
      .catch(e => console.warn('[prep] envoi au service échoué', e))
      .finally(() => { enCours = null; if (enAttente) { enAttente = false; envoyer(); } });
  }
  const g = (path, def) => path.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), S) ?? def;
  function set(path, v) {
    const ks = path.split('.'); let o = S;
    ks.slice(0, -1).forEach(k => (o = o[k] = o[k] || {}));
    o[ks[ks.length - 1]] = v; save();
  }
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // --- avancement de chaque étape : [fait, total]
  function progress() {
    const a = ANESTH.filter(x => x.t !== 'ouinon_na' || true);
    const answered = a.filter(x => { const v = g('anesth.' + x.id); return v !== undefined && v !== ''; }).length;
    return {
      clinique: [(g('clinique') ? 1 : 0) + (dateOk(g('date')) ? 1 : 0) + (opOk() ? 1 : 0), 3],
      preadm: [DOCS.filter(([k]) => g('docs.' + k)).length + (g('preadmFaite') ? 1 : 0), DOCS.length + 1],
      anesth: anesthOn() ? [answered, a.length] : [0, 0], // [0, 0] = non concernée
      consent: [consentsActifs().filter(([k]) => g('sig.' + k) || g('consent.' + k)).length, consentsActifs().length],
      jourj: [JOURJ.filter(([k]) => g('jourj.' + k)).length, JOURJ.length],
    };
  }
  // Date d'opération plausible : d'aujourd'hui à 2 ans. Une date hors de cette plage (année mal tapée, date passée) n'est ni comptée ni utilisée pour le J-x.
  const iso = d => d.toISOString().slice(0, 10);
  const DMIN = () => iso(new Date(Date.now() - new Date().getTimezoneOffset() * 60000));
  const DMAX = () => { const d = new Date(DMIN()); d.setFullYear(d.getFullYear() + 2); return iso(d); };
  const dateOk = v => /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(v || '') && v >= DMIN() && v <= DMAX();
  // Numéros calculés à l'affichage : l'étape anesthésie peut être retirée par le type d'opération.
  const TITRES = { clinique: 'Ma clinique, mon opération et ma date', preadm: 'Préadmission', anesth: 'Questionnaire d’anesthésie', consent: 'Consentements', jourj: 'Veille et jour J' };
  const etapes = () => Object.keys(TITRES).filter(k => k !== 'anesth' || anesthOn());
  const titre = k => (etapes().indexOf(k) + 1) + '. ' + TITRES[k];
  const statut = ([f, t]) => (f === 0 ? ['À faire', 'todo'] : f >= t ? ['Fait ✓', 'done'] : [`En cours ${f}/${t}`, 'wip']);

  function joursAvant() {
    const d = g('date'); if (!dateOk(d)) return null;
    const ms = new Date(d + 'T00:00:00') - new Date(new Date().toDateString());
    return Math.round(ms / 86400000);
  }

  // Document de consentement mis en page, avec la signature placée dans son emplacement « Signature du patient ».
  function docHtml(k) {
    const cl = CLINIQUES[g('clinique')];
    return window.consentementDoc ? window.consentementDoc(k, { patient: localStorage.getItem('patient') || '', clinique: cl ? cl.nom : '', date: dateOk(g('date')) ? g('date') : '', sig: g('sig.' + k) }) : '';
  }

  function render() {
    const root = document.getElementById('v-prep'); if (!root) return;
    chargerOperations();
    const P = progress(), cl = CLINIQUES[g('clinique')];
    const tot = Object.values(P).reduce((a, [f, t]) => [a[0] + f, a[1] + t], [0, 0]);
    const pct = Math.round((tot[0] / tot[1]) * 100);
    const j = joursAvant();
    const open = g('_open', null) ?? (etapes().find(k => P[k][0] < P[k][1]) || null);
    const step = (k, body, r) => {
      const lib = r === 0 ? 'Fait ✓' : (r === 1 ? '1 restant' : r + ' restants'), cls = r === 0 ? 'done' : P[k][0] ? 'wip' : 'todo';
      return `<details class="step" data-step="${k}" ${open === k ? 'open' : ''}><summary><span>${titre(k)}</span><span class="chip ${cls}" data-testid="st-${k}">${lib}</span></summary><div class="body">${body}</div></details>`;
    };

    const cb = (path, label) => `<label class="cb"><input type="checkbox" data-path="${path}" ${g(path) ? 'checked' : ''}> ${esc(label)}</label>`;

    // Étape 4 : résumé des points clés, document complet repliable, signature INSÉRÉE dans le document (modèles de public/consentements.js).
    const sigBloc = (k, l, d) => {
      const sig = g('sig.' + k), M = (window.CONSENTEMENTS_MODELES || {})[k];
      const tete = `<div><b>${sig || g('consent.' + k) ? '✓ ' : ''}${esc(M ? M.titre : l)}</b>${M ? ' <span class="prov">Modèle provisoire</span>' : ''}</div>`;
      const corps = M ? `<ul class="resume">${M.resume.map(r => '<li>' + r + '</li>').join('')}</ul>
        <details class="doc" data-testid="doc-${k}" ${sig ? 'open' : ''}><summary>${sig ? 'Voir le document signé' : 'Lire le document complet'}</summary>${docHtml(k)}</details>`
        : `<div class="sub" style="margin-left:0">${esc(d)}</div>`;
      return `<div class="sigb" data-testid="sig-${k}">${tete}${corps}` + (sig
        ? `<div class="sub" style="margin-left:0">Signé le ${esc(sig.le)} <button type="button" class="lnk" data-act="sig-effacer" data-k="${k}">Effacer</button></div>${M ? `<button type="button" class="btn" data-act="sig-imprimer" data-k="${k}">🖨️ Enregistrer le document signé (PDF)</button>` : `<img class="sigimg" src="${sig.img}" alt="Signature">`}`
        : `<div class="kick">Votre signature</div><canvas class="sigpad" data-k="${k}" width="600" height="200"></canvas><button type="button" class="btn" data-act="sig-valider" data-k="${k}">Valider ma signature</button> <button type="button" class="lnk" data-act="sig-recommencer" data-k="${k}">Recommencer</button>`) + '</div>';
    };
    const anesthForm = ANESTH.map(x => {
      const v = g('anesth.' + x.id, '');
      if (x.t === 'num') return `<label class="fld">${esc(x.q)}<input inputmode="numeric" data-path="anesth.${x.id}" value="${esc(v)}"></label>`;
      const opts = x.t === 'ouinon_na' ? [['non', 'Non'], ['oui', 'Oui'], ['na', 'Non concerné']] : [['non', 'Non'], ['oui', 'Oui']];
      return `<div class="fld"><div>${esc(x.q)}</div><div class="seg">${opts.map(([o, l]) => `<button type="button" data-path="anesth.${x.id}" data-val="${o}" class="${v === o ? 'on' : ''}">${l}</button>`).join('')}</div>${x.detail && v === 'oui' ? `<input placeholder="${esc(x.detail)}" data-path="anesthDetail.${x.id}" value="${esc(g('anesthDetail.' + x.id, ''))}">` : ''}</div>`;
    }).join('');

    const BODY = {}; const def = (k, b) => { BODY[k] = b; return ''; };
    void `
      ${def('clinique', `
        <div class="fld">Où êtes-vous opéré(e) ?<div class="seg">${Object.entries(CLINIQUES).map(([k, c]) => `<button type="button" data-path="clinique" data-val="${k}" class="${g('clinique') === k ? 'on' : ''}">${esc(c.nom)}</button>`).join('')}</div></div>
        <label class="fld">Quelle opération ?<select data-path="operation" data-testid="type-operation"><option value="">${OPERATIONS.length ? '— Choisir —' : 'Chargement de la liste…'}</option>${OPERATIONS
          .filter(o => !g('clinique') || o.cliniques.includes(g('clinique')) || o.id === g('operation'))
          .map(o => `<option value="${esc(o.id)}"${g('operation') === o.id ? ' selected' : ''}>${esc(o.nom)}</option>`).join('')}</select></label>
        ${opCourante() && !opOk() ? `<p class="err" data-testid="op-err">« ${esc(opCourante().nom)} » ne se fait pas à ${esc(cl ? cl.nom : 'cette clinique')} : choisissez une autre opération ou une autre clinique.</p>` : ''}
        ${opOk() && !anesthOn() ? '<p class="note" data-testid="sans-anesth">Pas de questionnaire d’anesthésie à remplir pour cette opération.</p>' : ''}
        <label class="fld">Date de l’opération<input type="date" data-path="date" min="${DMIN()}" max="${DMAX()}" value="${esc(g('date', ''))}"></label>
        ${g('date') && !dateOk(g('date')) ? '<p class="err" data-testid="date-err">Date impossible : choisissez une date entre aujourd’hui et dans 2 ans.</p>' : ''}
        ${cl ? `<p class="note">${esc(cl.adresse)}${cl.tel ? ' · ' + esc(cl.tel) : ''}</p>` : ''}`)}
      ${def('preadm', cl ? `
        <p>La préadmission se fait sur le portail officiel de la clinique : <b>${esc(cl.portailNom)}</b>, ${esc(cl.delai)}.</p>
        <a class="btn" href="${cl.portail}" target="_blank" rel="noopener" data-testid="portail">Ouvrir ${esc(cl.portailNom)} ↗</a>
        <div class="kick">Documents à préparer</div>
        ${DOCS.map(([k, l]) => cb('docs.' + k, l)).join('')}
        <hr>${cb('preadmFaite', 'J’ai validé ma préadmission en ligne')}` : '<p>Choisissez d’abord votre clinique (étape 1).</p>')}
      ${def('anesth', `
        <p class="note">À apporter à la <b>consultation d’anesthésie</b>, obligatoire avant l’opération. Ce questionnaire ne la remplace pas.</p>
        ${anesthForm}
        <button type="button" class="btn" data-act="print">🖨️ Imprimer / enregistrer en PDF</button>`)}
      ${def('consent', `
        <p class="note">Lisez les points clés, ouvrez le document complet si besoin, puis signez avec le doigt : la signature est <b>placée dans le document</b>. ⚠️ Ces textes sont des <b>modèles provisoires</b>, en attendant les formulaires officiels du chirurgien, de l’anesthésiste et de la clinique. Cette signature est transmise au service (démonstration) : elle ne remplace pas la signature du document officiel.</p>
        ${consentsActifs().map(([k, l, d]) => sigBloc(k, l, d)).join('')}`)}
      ${def('jourj', JOURJ.map(([k, l]) => cb('jourj.' + k, l)).join(''))}
`;
    const keys = etapes();
    const fini = k => P[k][0] >= P[k][1];
    const cur = keys.find(k => !fini(k)) || null;
    const reste = tot[1] - tot[0];
    const jalons = keys.map((k, i) => `<span class="jl ${fini(k) ? 'ok' : k === cur ? 'now' : ''}" data-goto="${k}" title="${esc(titre(k))}">${fini(k) ? '✓' : i + 1}</span>` + (i < keys.length - 1 ? `<i class="tr ${fini(k) ? 'ok' : ''}"></i>` : '')).join('');
    const autres = keys.filter(k => k !== cur && !fini(k));
    const faits = keys.filter(fini);
    root.innerHTML = lienBanniere() + `
      <section class="suivi" data-testid="suivi">
        <div class="jalons">${jalons}</div>
        <div class="resume">${cur ? `Plus que <b data-testid="reste">${reste} élément${reste > 1 ? 's' : ''}</b>` : '<b>Tout est prêt ✓</b>'} · <span data-testid="pct">${pct} %</span>${j !== null ? ` · <b data-testid="jours">${j > 0 ? 'J-' + j : j === 0 ? 'C’est aujourd’hui' : 'Opération passée'}</b>` : ''}</div>
      </section>
      ${cur ? `<div class="maint" data-testid="maintenant"><div class="kick">À faire maintenant</div>${step(cur, BODY[cur], P[cur][1] - P[cur][0])}</div>` : ''}
      ${autres.map(k => step(k, BODY[k], P[k][1] - P[k][0])).join('')}
      ${faits.length ? `<details class="faits" ${faits.includes(open) ? 'open' : ''}><summary>${faits.length} étape${faits.length > 1 ? 's' : ''} terminée${faits.length > 1 ? 's' : ''} ▾</summary>${faits.map(k => step(k, BODY[k], 0)).join('')}</details>` : ''}
      <p class="note" data-testid="demo-envoi">⚠️ <b>Démonstration</b> : votre avancement et vos signatures sont transmis au service. Le questionnaire d’anesthésie reste sur ce téléphone.</p>
      <button type="button" class="lnk" data-act="reset">Effacer mes informations de ce téléphone</button>
      <div id="print-area"></div>`;
  }

  function printSheet() {
    const cl = CLINIQUES[g('clinique')];
    const rows = ANESTH.map(x => {
      const v = g('anesth.' + x.id, '—'), d = g('anesthDetail.' + x.id, '');
      const lv = { oui: 'Oui', non: 'Non', na: 'Non concerné' }[v] || v;
      return `<tr><td>${esc(x.q)}</td><td><b>${esc(lv)}</b>${d ? ' — ' + esc(d) : ''}</td></tr>`;
    }).join('');
    document.getElementById('print-area').innerHTML = `<h2>Questionnaire pré-anesthésique</h2><p>Clinique : ${esc(cl ? cl.nom : '—')} · Date prévue : ${esc(g('date', '—'))}</p><table>${rows}</table><p>Nom, prénom : ______________________ &nbsp; Signature : __________</p>`;
    window.print();
  }

  document.addEventListener('click', e => {
    const t = e.target.closest('[data-val],[data-act],[data-goto],summary');
    if (!t || !t.closest('#v-prep')) return;
    if (t.matches('summary')) { const k = t.parentElement.dataset.step; setTimeout(() => { S._open = t.parentElement.open ? k : null; localStorage.setItem(KEY, JSON.stringify(S)); }, 0); return; }
    if (t.dataset.goto) { S._open = t.dataset.goto; localStorage.setItem(KEY, JSON.stringify(S)); render(); document.querySelector(`[data-step="${t.dataset.goto}"]`)?.scrollIntoView({ behavior: 'smooth' }); return; }
    if (t.dataset.val) return set(t.dataset.path, t.dataset.val);
    if (t.dataset.act === 'print') return printSheet();
    if (t.dataset.act === 'sig-imprimer') { document.getElementById('print-area').innerHTML = docHtml(t.dataset.k); return window.print(); }
    if (t.dataset.act && t.dataset.act.startsWith('sig-')) {
      const k = t.dataset.k, c = document.querySelector(`canvas.sigpad[data-k="${k}"]`);
      if (t.dataset.act === 'sig-effacer') { delete (S.sig || {})[k]; if (S.consent) delete S.consent[k]; return save(); }
      if (t.dataset.act === 'sig-recommencer' && c) { c.getContext('2d').clearRect(0, 0, c.width, c.height); c._traits = 0; return; }
      if (t.dataset.act === 'sig-valider' && c) {
        if ((c._traits || 0) < 1) return alert('Signez d’abord dans le cadre avec votre doigt.');
        S._open = 'consent';
        return set('sig.' + k, { img: c.toDataURL('image/png'), le: new Date().toLocaleString('fr-FR') });
      }
    }
    if (t.dataset.act === 'lien-appliquer') { Object.assign(S, LIEN); LIEN = null; return save(); }
    if (t.dataset.act === 'lien-ignorer') { LIEN = null; return render(); }
    if (t.dataset.act === 'reset' && confirm('Effacer toutes vos informations de préparation de ce téléphone ?')) { S = {}; localStorage.removeItem(KEY); render(); envoyer(); }
  });
  document.addEventListener('change', e => {
    const t = e.target; if (!t.closest('#v-prep') || !t.dataset.path) return;
    if (t.type === 'checkbox') return set(t.dataset.path, t.checked);
    // Champ de saisie (date, poids…) : on enregistre SANS redessiner, sinon le champ perd le curseur
    // au milieu de la frappe (année tapée « 0025 »). Le redessin se fait en quittant le champ.
    const ks = t.dataset.path.split('.'); let o = S;
    ks.slice(0, -1).forEach(k => (o = o[k] = o[k] || {}));
    o[ks[ks.length - 1]] = t.value.trim();
    localStorage.setItem(KEY, JSON.stringify(S)); envoyer();
    // Date : Tab passe de jour à mois à année SANS quitter le champ, donc on redessine dès qu'une date valide est complète
    // (une année en cours de frappe, « 0202 », n'est pas valide : pas de redessin, le curseur reste en place).
    if (t.tagName === 'SELECT') return render();
    if (t.dataset.path === 'date' && dateOk(t.value)) { render(); document.querySelector('[data-path=date]')?.focus(); }
  });
  document.addEventListener('focusout', e => {
    const t = e.target;
    if (t.closest && t.closest('#v-prep') && t.dataset.path && t.type !== 'checkbox') setTimeout(render, 0);
  });

  // Signature au doigt : pointer events (doigt, stylet, souris). On ne redessine PAS la page pendant le tracé.
  let trace = null;
  const pt = (c, e) => { const r = c.getBoundingClientRect(); return [(e.clientX - r.left) * c.width / r.width, (e.clientY - r.top) * c.height / r.height]; };
  document.addEventListener('pointerdown', e => {
    const c = e.target.closest && e.target.closest('canvas.sigpad'); if (!c) return;
    e.preventDefault(); c.setPointerCapture?.(e.pointerId);
    const x = c.getContext('2d'); x.lineWidth = 4; x.lineCap = x.lineJoin = 'round'; x.strokeStyle = '#10243e';
    const [a, b] = pt(c, e); x.beginPath(); x.moveTo(a, b); trace = c;
  });
  document.addEventListener('pointermove', e => {
    if (!trace) return; e.preventDefault();
    const x = trace.getContext('2d'), [a, b] = pt(trace, e); x.lineTo(a, b); x.stroke(); trace._traits = (trace._traits || 0) + 1;
  });
  const fin = () => { trace = null; };
  document.addEventListener('pointerup', fin); document.addEventListener('pointercancel', fin);

  // Lien venu de BlocAccord : ?prep=1&clinique=<clé>&date=AAAA-MM-JJ. Lu dans le navigateur, gardé sur le téléphone seulement.
  // Valeurs inconnues ignorées ; une saisie existante du patient n'est remplacée qu'après son accord (bannière).
  let LIEN = null;
  function lienBanniere() {
    if (!LIEN) return '';
    const cl = CLINIQUES[LIEN.clinique || g('clinique')];
    return `<div class="card" data-testid="lien-recu"><p>Votre chirurgien vous a envoyé : <b>${esc(cl ? cl.nom : '—')}</b>${LIEN.date ? ' le <b>' + esc(LIEN.date) + '</b>' : ''}. Remplacer ce que vous aviez saisi ?</p>
      <button type="button" class="btn" data-act="lien-appliquer">Remplacer</button> <button type="button" class="lnk" data-act="lien-ignorer">Garder le mien</button></div>`;
  }
  (function lireLien() {
    const q = new URLSearchParams(location.search); if (q.get('prep') !== '1') return;
    const recu = {};
    if (CLINIQUES[q.get('clinique')]) recu.clinique = q.get('clinique');
    if (dateOk(q.get('date'))) recu.date = q.get('date');
    const conflit = {};
    for (const [k, v] of Object.entries(recu)) { if (S[k] && S[k] !== v) conflit[k] = v; else S[k] = v; }
    if (Object.keys(conflit).length) LIEN = conflit;
    S._open = 'clinique'; localStorage.setItem(KEY, JSON.stringify(S));
    history.replaceState(null, '', location.pathname + location.hash);
    document.querySelector('.tabs [data-tab=prep]')?.click();
  })();

  window.Prep = { render };
  render();
})();
