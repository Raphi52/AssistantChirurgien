// ⚠️ DÉMO UNIQUEMENT — stockage des dossiers de préparation (avancement, consentements signés et, depuis le
// 2026-10-14, réponses du formulaire dont le questionnaire d'anesthésie) sur le serveur.
// Ceci DÉROGE à la règle du projet « aucune donnée de patient stockée » (choix utilisateur du 2026-10-05, pour la démonstration).
// En production : hébergement certifié données de santé (HDS), analyse RGPD/AIPD, chiffrement et authentification réelle obligatoires.
// Décision du 2026-10-14 : c'est le SECRÉTARIAT qui crée le dossier dans l'admin (nom, prénom, date de naissance) ;
// la création génère le CODE PERSONNEL que le patient saisit sur son téléphone. Ce code désigne son dossier :
// l'identité vient toujours de la saisie du secrétariat, jamais du téléphone.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ETAPES = ['clinique', 'preadm', 'anesth', 'consent', 'jourj'];
const CONSENTS = ['chir', 'anesth', 'confiance', 'devis'];
const texte = (v, n) => String(v || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);

// Code personnel : 8 caractères sans 0/O ni 1/I/L, pour se dicter au téléphone sans confusion (31^8 ≈ 850 milliards).
// Gardé sans tiret ; affiché « ABCD-EFGH ». Le patient peut le taper en minuscules, avec tiret ou espaces.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LONGUEUR_CODE = 8;
const normCode = c => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const memeCode = (a, b) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };
// Date de naissance : AAAA-MM-JJ réelle, entre 1900 et aujourd'hui.
function naissanceValide(s) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(s || ''))) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s && s >= '1900-01-01' && s <= new Date().toISOString().slice(0, 10);
}
const cle = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');

// Réponses du formulaire envoyées par le téléphone (2026-10-14, pour que le secrétariat vérifie le remplissage).
// Seules les questions de public/formulaire.js sont gardées, avec des valeurs bornées : rien d'autre n'est stocké.
const FORM = require('../public/formulaire.js');
function nettoyerFormulaire(f) {
  if (!f || typeof f !== 'object') return null;
  const o = v => (v && typeof v === 'object' ? v : {});
  const docs = {}, jourj = {}, anesth = {}, anesthDetail = {};
  for (const [k] of FORM.DOCS) docs[k] = o(f.docs)[k] === true;
  for (const [k] of FORM.JOURJ) jourj[k] = o(f.jourj)[k] === true;
  for (const x of FORM.ANESTH) {
    const v = o(f.anesth)[x.id];
    if (x.t === 'num') { const n = String(v ?? '').replace(/[^\d,.]/g, '').slice(0, 6); if (n) anesth[x.id] = n; }
    else if ((x.t === 'ouinon_na' ? ['oui', 'non', 'na'] : ['oui', 'non']).includes(v)) anesth[x.id] = v;
    if (x.detail && anesth[x.id] === 'oui') { const d = texte(o(f.anesthDetail)[x.id], 300); if (d) anesthDetail[x.id] = d; }
  }
  return { docs, preadmFaite: f.preadmFaite === true, anesth, anesthDetail, jourj };
}

// operations : lib/operations.js — le type d'opération enregistré doit exister dans les types réglés par le chirurgien.
function createDossiers(dir, operations) {
  fs.mkdirSync(dir, { recursive: true });
  const fileOf = id => path.join(dir, id + '.json');
  const lire = id => { try { return JSON.parse(fs.readFileSync(fileOf(id), 'utf8')); } catch { return null; } };
  const tous = () => fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => lire(f.slice(0, -5))).filter(Boolean);
  const progressionVide = () => Object.fromEntries(ETAPES.map(k => [k, [0, 1]]));

  // Le secrétariat crée le patient. Un patient déjà créé (même nom, prénom et date de naissance) n'est pas dupliqué :
  // on rend son dossier et son code existants, signalés par existait:true.
  function creer(B) {
    const nom = texte(B && B.nom, 60), prenom = texte(B && B.prenom, 60), naissance = String(B && B.naissance || '');
    if (!nom || !prenom) throw new Error('Nom et prénom obligatoires.');
    if (!naissanceValide(naissance)) throw new Error('Date de naissance invalide.');
    const L = tous();
    const deja = L.find(d => d.code && d.naissance === naissance && cle(d.nom) === cle(nom) && cle(d.prenom) === cle(prenom));
    if (deja) return { ...resume(deja), existait: true };
    const pris = new Set(L.map(d => d.code).filter(Boolean));
    let code;
    do { code = Array.from({ length: LONGUEUR_CODE }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join(''); } while (pris.has(code));
    let id;
    do { id = crypto.randomBytes(8).toString('hex'); } while (lire(id));
    const d = { id, code, patient: prenom + ' ' + nom, nom, prenom, naissance, creeLe: new Date().toISOString(),
      operation: '', clinique: '', date: '', progression: progressionVide(), signatures: {}, majLe: '' };
    fs.writeFileSync(fileOf(id), JSON.stringify(d));
    return { ...resume(d), existait: false };
  }

  // Le dossier désigné par un code personnel, ou null. Les anciens dossiers (créés par un téléphone) n'ont pas de code.
  function parCode(c) {
    const n = normCode(c);
    if (n.length !== LONGUEUR_CODE) return null;
    return tous().find(d => d.code && memeCode(d.code, n)) || null;
  }

  // Synchro du téléphone vers le dossier `id` (celui du code personnel). Seuls l'avancement, la clinique, la date,
  // le type d'opération et les signatures viennent du téléphone ; l'identité reste celle saisie par le secrétariat.
  function enregistrer(id, B) {
    id = String(id || '');
    if (!/^[a-f0-9]{16}$/.test(id)) throw new Error('identifiant invalide');
    const ancien = lire(id);
    if (!ancien) throw new Error('dossier introuvable');
    B = B || {};
    const progression = {};
    for (const k of ETAPES) {
      const p = B.progression && B.progression[k];
      const f = Math.max(0, Math.min(99, Number(p && p[0]) || 0)), t = Math.max(0, Math.min(99, p && Number.isFinite(Number(p[1])) ? Number(p[1]) : 1));
      // Total 0 = étape non concernée (ex. pas de questionnaire d'anesthésie pour ce type d'opération).
      progression[k] = [Math.min(f, t), t];
    }
    const signatures = {};
    for (const k of CONSENTS) {
      const s = B.signatures && B.signatures[k];
      if (s && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(String(s.img)) && s.img.length < 300000)
        signatures[k] = { img: s.img, le: String(s.le || '').slice(0, 40) };
    }
    // Type d'opération : une synchro qui ne le porte pas ne l'efface pas.
    const op = B.operation !== undefined ? B.operation : ancien.operation;
    const d = {
      ...ancien,
      operation: operations && operations.liste().some(o => o.id === op) ? op : '',
      clinique: String(B.clinique || '').slice(0, 30), date: /^\d{4}-\d{2}-\d{2}$/.test(B.date || '') ? B.date : '',
      // Téléphone d'avant l'envoi des réponses : pas de formulaire dans la synchro, on garde ce qu'on avait.
      formulaire: nettoyerFormulaire(B.formulaire) || ancien.formulaire || null,
      progression, signatures, majLe: new Date().toISOString(),
    };
    fs.writeFileSync(fileOf(id), JSON.stringify(d));
    return { ok: true };
  }

  // Suppression par le chirurgien (dossier de test, ancien dossier sans code). Le dossier quitte la liste et son code
  // n'ouvre plus rien ; une copie est d'abord écrite dans corbeille/ (récupérable à la main), puis l'original est effacé.
  function supprimer(id, par) {
    id = String(id || '');
    const d = /^[a-f0-9]{16}$/.test(id) && lire(id);
    if (!d) throw new Error('dossier introuvable');
    const corbeille = path.join(dir, 'corbeille');
    fs.mkdirSync(corbeille, { recursive: true });
    fs.writeFileSync(path.join(corbeille, id + '-' + Date.now() + '.json'), JSON.stringify({ ...d, supprimeLe: new Date().toISOString(), supprimePar: String(par || '') }));
    fs.unlinkSync(fileOf(id));
    return { ok: true, patient: d.patient };
  }
  function resume(d) {
    const tot = Object.values(d.progression).reduce((a, [f, t]) => [a[0] + f, a[1] + t], [0, 0]);
    return { id: d.id, patient: d.patient, nom: d.nom || '', prenom: d.prenom || '', naissance: d.naissance || '', code: d.code || '',
      operation: d.operation || '', clinique: d.clinique, date: d.date, progression: d.progression,
      pct: tot[1] ? Math.round(tot[0] / tot[1] * 100) : 0, consentements: Object.keys(d.signatures), majLe: d.majLe, creeLe: d.creeLe || '' };
  }
  const liste = () => tous().map(resume).sort((a, b) => (a.date || '9') < (b.date || '9') ? -1 : 1);
  const detail = id => { const d = /^[a-f0-9]{16}$/.test(String(id)) && lire(id); if (!d) throw new Error('dossier introuvable'); return d; };
  return { creer, parCode, enregistrer, supprimer, liste, detail };
}
module.exports = { createDossiers, normCode, nettoyerFormulaire };
