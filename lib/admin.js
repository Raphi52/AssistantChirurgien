// Mode admin du second brain — inspiré du Brain d'Autowin OS :
//   proposition (candidat)  →  validation humaine (promotion)  →  fiche publiée
//   + journal de chaque modification (avant / après), archivage au lieu de suppression, restauration.
// Rôles : « secretariat » propose ; « chirurgien » valide, publie, archive, restaure.
// Aucune donnée de patient ici : seulement le contenu des fiches.
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function createStore(root, brain, onChange) {
  const DATA = path.join(root, 'data');
  const ADMIN = path.join(root, 'admin-data');
  const PROPS = path.join(ADMIN, 'propositions.json');
  const ARCH = path.join(ADMIN, 'archives.json');
  const JOURNAL = path.join(ADMIN, 'journal.jsonl');
  const AJOUTS = '11-ajouts-equipe.json';
  fs.mkdirSync(ADMIN, { recursive: true });

  const readJson = (f, def) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return def; } };
  // Écriture atomique : fichier temporaire puis renommage, pour ne jamais laisser une fiche à moitié écrite.
  const writeJson = (f, v) => { const t = f + '.tmp'; fs.writeFileSync(t, JSON.stringify(v, null, 1) + '\n', 'utf8'); fs.renameSync(t, f); };
  const journal = (role, action, id, avant, apres, note) =>
    fs.appendFileSync(JOURNAL, JSON.stringify({ ts: new Date().toISOString(), role, action, id, avant: avant || null, apres: apres || null, note: note || '' }) + '\n');

  // Dans quel fichier vit chaque fiche (pour réécrire au bon endroit).
  function fileOf(id) {
    for (const f of fs.readdirSync(DATA).filter(f => f.endsWith('.json'))) {
      if (readJson(path.join(DATA, f), []).some(d => d.id === id)) return f;
    }
    return null;
  }
  const clean = d => ({ id: d.id, question: String(d.question || '').trim(), keywords: (Array.isArray(d.keywords) ? d.keywords : String(d.keywords || '').split(',')).map(s => s.trim()).filter(Boolean), answer: String(d.answer || '').trim(), validated: !!d.validated });
  function check(d) {
    if (d.question.length < 5) throw new Error('La question est trop courte.');
    if (d.answer.length < 20) throw new Error('La réponse est trop courte.');
  }
  function nextId() {
    const ids = [...brain.docs.map(d => d.id), ...readJson(ARCH, []).map(d => d.id), ...readJson(PROPS, []).map(p => p.fiche.id).filter(Boolean)];
    const n = Math.max(0, ...ids.map(i => Number(String(i).slice(1)) || 0)) + 1;
    return 'F' + String(n).padStart(3, '0');
  }

  // Publie (crée ou remplace) une fiche dans les fichiers data/ et dans le brain en mémoire.
  function publish(role, fiche, note) {
    const d = clean(fiche); check(d);
    if (!d.id) d.id = nextId();
    d.validated = true; // publiée par le chirurgien = validée
    const avant = brain.byId[d.id] ? clean(brain.byId[d.id]) : null;
    const f = fileOf(d.id) || AJOUTS;
    const fp = path.join(DATA, f);
    const arr = readJson(fp, []);
    const i = arr.findIndex(x => x.id === d.id);
    if (i >= 0) arr[i] = { ...arr[i], ...d }; else arr.push(d);
    writeJson(fp, arr);
    journal(role, avant ? 'modification' : 'creation', d.id, avant, d, note);
    onChange();
    return d;
  }

  function archive(role, id, note) {
    const f = fileOf(id); if (!f) throw new Error('Fiche introuvable : ' + id);
    const fp = path.join(DATA, f);
    const arr = readJson(fp, []);
    const d = arr.find(x => x.id === id);
    writeJson(fp, arr.filter(x => x.id !== id));
    const ar = readJson(ARCH, []); ar.push({ ...d, _fichier: f, _archiveLe: new Date().toISOString() }); writeJson(ARCH, ar);
    journal(role, 'archivage', id, clean(d), null, note);
    onChange();
  }

  function restore(role, id) {
    const ar = readJson(ARCH, []);
    const d = ar.find(x => x.id === id); if (!d) throw new Error('Archive introuvable : ' + id);
    const fp = path.join(DATA, d._fichier || AJOUTS);
    const arr = readJson(fp, []); const { _fichier, _archiveLe, ...fiche } = d; arr.push(fiche); writeJson(fp, arr);
    writeJson(ARCH, ar.filter(x => x.id !== id));
    journal(role, 'restauration', id, null, clean(fiche));
    onChange();
  }

  // --- propositions (file « À valider »)
  function propose(role, fiche, note) {
    const d = clean(fiche); check(d);
    const props = readJson(PROPS, []);
    const p = { pid: crypto.randomBytes(4).toString('hex'), ts: new Date().toISOString(), role, note: String(note || ''), fiche: d, avant: d.id && brain.byId[d.id] ? clean(brain.byId[d.id]) : null };
    props.push(p); writeJson(PROPS, props);
    journal(role, 'proposition', d.id || '(nouvelle)', p.avant, d, note);
    return p;
  }
  function decide(role, pid, accept, note) {
    const props = readJson(PROPS, []);
    const p = props.find(x => x.pid === pid); if (!p) throw new Error('Proposition introuvable.');
    writeJson(PROPS, props.filter(x => x.pid !== pid));
    if (accept) return publish(role, p.fiche, 'proposition validée' + (p.note ? ' : ' + p.note : ''));
    journal(role, 'rejet', p.fiche.id || '(nouvelle)', null, p.fiche, note);
    return null;
  }

  return {
    fiches: () => brain.docs.map(d => ({ ...clean(d), theme: d.theme })),
    propositions: () => readJson(PROPS, []),
    archives: () => readJson(ARCH, []),
    journal: (n = 200) => { try { return fs.readFileSync(JOURNAL, 'utf8').trim().split('\n').filter(Boolean).slice(-n).reverse().map(l => JSON.parse(l)); } catch { return []; } },
    publish, archive, restore, propose, decide,
  };
}

module.exports = { createStore };
