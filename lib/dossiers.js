// ⚠️ DÉMO UNIQUEMENT — stockage des dossiers de préparation (avancement + consentements signés) sur le serveur.
// Ceci DÉROGE à la règle du projet « aucune donnée de patient stockée » (choix utilisateur du 2026-10-05, pour la démonstration).
// En production : hébergement certifié données de santé (HDS), analyse RGPD/AIPD, chiffrement et authentification réelle obligatoires.
'use strict';
const fs = require('fs');
const path = require('path');

const ETAPES = ['clinique', 'preadm', 'anesth', 'consent', 'jourj'];
const CONSENTS = ['chir', 'anesth', 'confiance', 'devis'];
const texte = (v, n) => String(v || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);

// operations : lib/operations.js — le type d'opération enregistré doit exister dans les types réglés par le chirurgien.
function createDossiers(dir, operations) {
  fs.mkdirSync(dir, { recursive: true });
  const fileOf = id => path.join(dir, id + '.json');
  const lire = id => { try { return JSON.parse(fs.readFileSync(fileOf(id), 'utf8')); } catch { return null; } };

  function enregistrer(B) {
    const id = String(B && B.id || '');
    if (!/^[a-f0-9]{16}$/.test(id)) throw new Error('identifiant invalide');
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
    // Nom, prénom, type d'opération : une synchro qui ne les porte pas (téléphone connecté avant leur ajout) ne les efface pas.
    const ancien = lire(id) || {};
    const garde = k => (B[k] !== undefined ? B[k] : ancien[k]);
    const d = {
      id, patient: texte(B.patient, 80) || 'non renseigné',
      nom: texte(garde('nom'), 60), prenom: texte(garde('prenom'), 60),
      operation: operations && operations.liste().some(o => o.id === garde('operation')) ? garde('operation') : '',
      clinique: String(B.clinique || '').slice(0, 30), date: /^\d{4}-\d{2}-\d{2}$/.test(B.date || '') ? B.date : '',
      progression, signatures, majLe: new Date().toISOString(),
    };
    fs.writeFileSync(fileOf(id), JSON.stringify(d));
    return { ok: true };
  }
  const resume = d => {
    const tot = Object.values(d.progression).reduce((a, [f, t]) => [a[0] + f, a[1] + t], [0, 0]);
    return { id: d.id, patient: d.patient, nom: d.nom || '', prenom: d.prenom || '', operation: d.operation || '', clinique: d.clinique, date: d.date, progression: d.progression,
      pct: tot[1] ? Math.round(tot[0] / tot[1] * 100) : 0, consentements: Object.keys(d.signatures), majLe: d.majLe };
  };
  const liste = () => fs.readdirSync(dir).filter(f => f.endsWith('.json')).map(f => lire(f.slice(0, -5))).filter(Boolean)
    .map(resume).sort((a, b) => (a.date || '9') < (b.date || '9') ? -1 : 1);
  const detail = id => { const d = /^[a-f0-9]{16}$/.test(String(id)) && lire(id); if (!d) throw new Error('dossier introuvable'); return d; };
  return { enregistrer, liste, detail };
}
module.exports = { createDossiers };
