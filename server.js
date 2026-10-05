// Assistant patients — chirurgie digestive générale (PROTOTYPE DE DÉMONSTRATION)
// Serveur sans dépendance : sert la PWA et répond via le second brain (data/*.json)
// + la commande `claude` (abonnement personnel, démo uniquement).
// AUCUNE question de patient n'est écrite sur disque.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { loadBrain, search, tokens } = require('./lib/brain');
const { checkRedFlags } = require('./lib/redflags');
const { notify, newRef } = require('./lib/notify');
const { createStore } = require('./lib/admin');
const { createDossiers } = require('./lib/dossiers');
const { createOperations } = require('./lib/operations');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8787);
const ACCESS_CODE = process.env.ACCESS_CODE || 'demo';
const USE_LLM = process.env.USE_LLM !== '0';
const LLM_TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 90000);
const PUBLIC = path.join(__dirname, 'public');

const brain = loadBrain(path.join(__dirname, 'data'));
console.log(`[brain] ${brain.docs.length} fiches chargées`);

// Codes du mode admin (un par rôle). Fixés par variables d'environnement, sinon générés au démarrage et affichés dans le journal.
// Sans variable d'environnement, les codes sont générés UNE fois et gardés dans admin-data/codes.json (stables entre redémarrages).
const CODES_FILE = path.join(__dirname, 'admin-data', 'codes.json');
const ADMIN_CODES = (() => {
  let saved = {}; try { saved = JSON.parse(fs.readFileSync(CODES_FILE, 'utf8')); } catch {}
  const c = {
    chirurgien: process.env.ADMIN_CHIRURGIEN || saved.chirurgien || crypto.randomInt(10000000, 99999999).toString(),
    secretariat: process.env.ADMIN_SECRETARIAT || saved.secretariat || crypto.randomInt(10000000, 99999999).toString(),
  };
  if (!process.env.ADMIN_CHIRURGIEN && require.main === module) { fs.mkdirSync(path.dirname(CODES_FILE), { recursive: true }); fs.writeFileSync(CODES_FILE, JSON.stringify(c, null, 1)); }
  return c;
})();
if (require.main === module) console.log(`[admin] codes administrateur dans ${CODES_FILE}`);
// Démo : plus de code admin exigé — sans code reconnu, on entre en chirurgien (choix utilisateur, 2026-10-04).
const roleOf = req => Object.keys(ADMIN_CODES).find(r => req.headers['x-admin-code'] === ADMIN_CODES[r]) || 'chirurgien';

// ⚠️ DÉMO : dossiers de préparation stockés sur le serveur — dérogation à « aucune donnée patient » (voir lib/dossiers.js).
const operations = createOperations(path.join(__dirname, 'admin-data', 'operations.json'));
const dossiers = createDossiers(path.join(__dirname, 'admin-data', 'dossiers-demo'), operations);

// Compteurs en mémoire seulement (quelles fiches servent) — aucune question stockée.
const stats = { questions: 0, alertes: 0, sansFiche: 0, fiches: {} };

// Le second brain est TOUJOURS interrogé et le modèle répond TOUJOURS : il s'appuie d'abord sur les fiches
// de l'équipe (plusieurs si besoin), et ne complète par une information générale prudente que si elles ne couvrent pas la question.
// Mesuré le 2026-10-02 : les 500 fiches font ~30 000 tokens et la réponse arrive en ~9 s, soit autant qu'avec 10 fiches.
// La recherche par mots ratait les reformulations (« tondre la pelouse » ≠ « jardinage / porter des charges ») :
// on donne donc TOUT le second brain au modèle, la recherche ne sert plus qu'à signaler les fiches les plus proches.
let BRAIN_TEXT = '';
function rebuildBrainText() { BRAIN_TEXT = brain.docs.map(d => `[${d.id}] ${d.question}\n${d.answer}`).join('\n\n'); }
rebuildBrainText();
// ONLY_VALIDATED=1 : seules les fiches relues par le chirurgien (validated:true) servent de réponse et sont données au modèle.
// Désactivé par défaut : au 2026-10-02 aucune des 500 fiches n'est relue, l'activer renverrait tout au secrétariat.
const seulementValidees = () => process.env.ONLY_VALIDATED === '1';
const utilisable = d => !seulementValidees() || !!d.validated;
const brainText = () => seulementValidees() ? brain.docs.filter(utilisable).map(d => `[${d.id}] ${d.question}\n${d.answer}`).join('\n\n') : BRAIN_TEXT;
// Rechargement à chaud après une modification admin : la réponse suivante utilise déjà la fiche corrigée.
const store = createStore(__dirname, brain, () => {
  Object.assign(brain, loadBrain(path.join(__dirname, 'data')));
  rebuildBrainText();
  console.log(`[brain] rechargé : ${brain.docs.length} fiches`);
});
function buildPrompt(question, hits, historique = []) {
  const fil = historique.length ? historique.map(m => (m.role === 'patient' ? 'PATIENT : ' : 'TOI : ') + m.texte).join('\n') : '(début de conversation)';
  const proches = hits.length ? hits.map(h => h.doc.id).join(', ') : 'aucune';
  const fiches = `${brainText() || '(aucune fiche relue)'}\n\n(Fiches qui partagent le plus de mots avec la question : ${proches}. La bonne réponse peut être ailleurs.)`;
  return `Tu es l'assistant d'information des patients d'un chirurgien digestif (estomac, vésicule, hernies, reflux, appendicite, côlon, avant et après l'opération).
Le SECOND BRAIN ci-dessous contient les fiches rédigées pour l'équipe. C'est ta source PRIORITAIRE.
RÈGLES :
- Réponds TOUJOURS à la question du patient, même si elle est formulée autrement que les fiches : cherche le sens, combine plusieurs fiches si utile.
- Appuie-toi d'abord sur les fiches et ne les contredis jamais. Cite à la fin la ou les références utilisées entre crochets, ex. [F012][F089].
- Si aucune fiche ne couvre la question, donne une information générale prudente et courante sur le sujet, et termine par [GENERAL].
- Si la question n'a aucun rapport avec une opération ou la santé digestive, dis gentiment que tu réponds aux questions sur l'opération, et termine par [HORS_SUJET].
- Jamais de diagnostic personnel, jamais de modification de traitement. Si un symptôme décrit peut être grave, dis d'appeler le 15.
- Français simple et rassurant, 2 à 6 phrases, sans markdown, tutoiement interdit (vouvoie).

SECOND BRAIN (toutes les fiches de l'équipe) :
${fiches}

CONVERSATION EN COURS (ce que le patient a déjà dit : son opération, sa date, ses symptômes — tiens-en compte, ne lui redemande pas et ne parle pas d'une autre opération) :
${fil}

SITUATION : avant de répondre, déduis de la conversation quelle opération, à combien de jours, et ce qui l'inquiète ; adapte la réponse à CE patient.

NOUVELLE QUESTION DU PATIENT : ${question}`;
}

// Lit le flux JSON ligne à ligne de `claude --output-format stream-json` : chaque morceau de texte part vers onDelta
// dès qu'il arrive (le patient voit la réponse s'écrire au lieu d'un écran figé ~10 s).
function parseClaudeStream(onDelta) {
  let buf = '', text = '', result = null;
  return {
    push(chunk) {
      buf += chunk; let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line) continue;
        let m; try { m = JSON.parse(line); } catch { continue; }
        const d = m.type === 'stream_event' && m.event && m.event.delta;
        if (d && d.type === 'text_delta' && d.text) { text += d.text; onDelta && onDelta(text); }
        else if (m.type === 'result' && typeof m.result === 'string') result = m.result;
      }
    },
    text: () => (result ?? text).trim(),
  };
}

function askClaude(prompt, onDelta) {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['-p', '--output-format', 'stream-json', '--verbose', '--include-partial-messages'], {
      cwd: path.join(__dirname, 'llm-sandbox'), shell: process.platform === 'win32',
      env: { ...process.env },
    });
    const p = parseClaudeStream(onDelta);
    let err = '';
    const t = setTimeout(() => { child.kill(); reject(new Error('timeout')); }, LLM_TIMEOUT_MS);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', d => p.push(d));
    child.stderr.on('data', d => (err += d));
    child.on('error', e => { clearTimeout(t); reject(e); });
    child.on('close', code => {
      clearTimeout(t); p.push('\n');
      code === 0 && p.text() ? resolve(p.text()) : reject(new Error(err || `exit ${code}`));
    });
    child.stdin.end(prompt);
  });
}

// Texte partiel montrable au patient : sans les étiquettes [F001]/[GENERAL]/[HORS_SUJET], ni une étiquette encore incomplète en fin.
function texteVisible(t) {
  return t.replace(/\[[A-Z0-9_]*$/, '').replace(/\s*\[(F\d{3}|GENERAL|HORS_SUJET)\]\s*/g, ' ').replace(/\s+([.!?])/g, '$1').trimStart();
}

const TRANSFER_MSG = "Je n'ai pas de réponse validée à cette question. Le secrétariat du service a été prévenu : laissez votre numéro avec le bouton ci-dessous pour être rappelé(e). En cas de symptôme inquiétant, appelez le 15.";

// Prévient le secrétariat sans bloquer la réponse au patient ; un échec d'envoi est journalisé, jamais avalé en silence.
// Compteur ANONYME des sujets non couverts : chaque mot significatif (normalisé, >= 4 lettres) est compté à part.
// Ni la phrase, ni l'ordre des mots, ni la date ne sont gardés. L'écran admin n'affiche que les mots vus au moins 3 fois.
const sujetsFile = () => process.env.SUJETS_FILE || path.join(__dirname, 'admin-data', 'sujets.json');
// fix-ok: édits multiples = ajout ONLY_VALIDATED + compteur, puis 1 défaut mesuré : regex /^d+$/ (antislash perdu par heredoc) au lieu de /^\d+$/ ; test run.js rouge->vert.
function compterSujet(question) {
  try {
    const f = sujetsFile(); let s = { mots: {} };
    try { s = JSON.parse(fs.readFileSync(f, 'utf8')); } catch {}
    for (const m of new Set(tokens(question).filter(w => w.length >= 4 && !/^\d+$/.test(w)))) s.mots[m] = (s.mots[m] || 0) + 1;
    fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(s));
  } catch (e) { console.warn('[sujets] non compté :', e.message); }
}
function sujetsNonCouverts(min = 3) {
  try { const { mots } = JSON.parse(fs.readFileSync(sujetsFile(), 'utf8'));
    return Object.entries(mots).filter(([, n]) => n >= min).sort((a, b) => b[1] - a[1]).slice(0, 100).map(([mot, n]) => ({ mot, n })); } catch { return []; }
}

function signaler(type, question, motif) {
  const ref = newRef();
  notify({ type, ref, motif, question }).catch(e => console.warn('[notif] erreur :', e.message));
  return ref;
}

async function answer(question, historique = [], onDelta) {
  stats.questions++;
  const flag = checkRedFlags(question);
  if (flag) {
    stats.alertes++;
    return { type: 'alerte', text: flag.message, motif: flag.motif, ref: signaler('alerte', question, flag.motif) };
  }
  // Plus de seuil qui bloque avant le modèle : on lui donne les 10 fiches les plus proches et il juge lui-même.
  const hits = search(brain, question, 10).filter(h => utilisable(h.doc));
  const ref = newRef(); // sert au bouton « Réponse pas satisfaisante ? » ; aucune notification tant qu'il n'est pas utilisé
  let text, source = 'fiche';
  if (USE_LLM) {
    try {
      text = await askClaude(buildPrompt(question, hits, historique), onDelta && (t => onDelta(texteVisible(t))));
      source = 'claude';
    } catch (e) {
      console.warn('[llm] indisponible, réponse directe par fiche :', e.message.slice(0, 120));
    }
  }
  if (!text) {
    // Sans modèle : la fiche la plus proche si la recherche a trouvé quelque chose, sinon renvoi au secrétariat.
    // (filtre léger, mode SANS modèle seulement : sinon « quel temps fera-t-il » ressortait une fiche au hasard)
    if (!hits.length || hits[0].score < 3 || hits[0].coverage < 0.3) { stats.sansFiche++; compterSujet(question); return { type: 'transfert', text: TRANSFER_MSG, ref: signaler('transfert', question, 'aucune fiche ne correspond') }; }
    text = `${hits[0].doc.answer} [${hits[0].doc.id}]`;
  }
  const portee = /\[HORS_SUJET\]/.test(text) ? 'hors_sujet' : /\[GENERAL\]/.test(text) ? 'generale' : 'fiches';
  const ids = [...new Set((text.match(/\[(F\d{3})\]/g) || []).map(s => s.slice(1, -1)))].filter(id => brain.byId[id] && utilisable(brain.byId[id]));
  if (portee !== 'fiches') stats.sansFiche++;
  if (portee === 'generale') compterSujet(question);
  ids.forEach(id => (stats.fiches[id] = (stats.fiches[id] || 0) + 1));
  const docs = ids.map(id => brain.byId[id]);
  return {
    type: 'reponse', source, portee, ref,
    text: text.replace(/\s*\[(F\d{3}|GENERAL|HORS_SUJET)\]\s*/g, ' ').replace(/\s+([.!?])/g, '$1').trim(),
    fiche: docs[0] ? { id: docs[0].id, titre: docs[0].question, valide: !!docs[0].validated } : undefined,
    fiches: docs.map(d => ({ id: d.id, titre: d.question, valide: !!d.validated })),
  };
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.css': 'text/css' };

function send(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST' && url.pathname === '/api/ask') {
    if (req.headers['x-access-code'] !== ACCESS_CODE) return send(res, 401, { error: 'code' });
    let body = '';
    req.on('data', c => { body += c; if (body.length > 20000) req.destroy(); });
    req.on('end', async () => {
      let q, h;
      try { const B = JSON.parse(body); q = String(B.question || '').trim().slice(0, 800);
        h = (Array.isArray(B.historique) ? B.historique : []).slice(-8).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'patient', texte: String(m.texte || '').slice(0, 1200) })); } catch { return send(res, 400, { error: 'json' }); }
      if (!q) return send(res, 400, { error: 'vide' });
      // Flux NDJSON si la page le demande : {delta} au fil de l'écriture, puis {final} = la réponse complète habituelle.
      if (String(req.headers.accept || '').includes('application/x-ndjson')) {
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' });
        const line = o => { if (!res.writableEnded) res.write(JSON.stringify(o) + '\n'); };
        try { line({ final: await answer(q, h, delta => line({ delta })) }); } catch { line({ final: { type: 'transfert', text: TRANSFER_MSG } }); }
        return res.end();
      }
      try { send(res, 200, await answer(q, h)); } catch (e) { send(res, 500, { error: 'interne' }); }
    });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/api/rappel') {
    if (req.headers['x-access-code'] !== ACCESS_CODE) return send(res, 401, { error: 'code' });
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1000) req.destroy(); });
    req.on('end', async () => {
      let ref, telephone, patient;
      try { ({ ref, telephone, patient } = JSON.parse(body)); } catch { return send(res, 400, { error: 'json' }); }
      telephone = String(telephone || '').replace(/[^\d+ ]/g, '').trim();
      if (!/^[A-F0-9]{6}$/.test(String(ref)) || telephone.replace(/\D/g, '').length < 9) return send(res, 400, { error: 'numéro invalide' });
      const nomPatient = String(patient || '').replace(/[<>\s]+/g, ' ').slice(0, 80).trim() || 'non renseigné';
      const r = await notify({ type: 'rappel', ref, telephone, patient: nomPatient }).catch(() => ({ envoye: false }));
      send(res, 200, { envoye: r.envoye });
    });
    return;
  }
  if (req.method === 'GET' && url.pathname === '/api/operations') {
    if (req.headers['x-access-code'] !== ACCESS_CODE) return send(res, 401, { error: 'code' });
    return send(res, 200, operations.liste());
  }
  if (req.method === 'POST' && url.pathname === '/api/prep') {
    if (req.headers['x-access-code'] !== ACCESS_CODE) return send(res, 401, { error: 'code' });
    let body = '';
    req.on('data', c => { body += c; if (body.length > 1500000) req.destroy(); });
    req.on('end', () => { try { send(res, 200, dossiers.enregistrer(JSON.parse(body))); } catch (e) { send(res, 400, { error: e.message }); } });
    return;
  }
  if (url.pathname.startsWith('/api/admin/')) {
    const role = roleOf(req);
    if (!role) return send(res, 401, { error: 'code admin' });
    const action = url.pathname.slice('/api/admin/'.length);
    if (req.method === 'GET') {
      if (action === 'moi') return send(res, 200, { role });
      if (action === 'fiches') return send(res, 200, store.fiches());
      if (action === 'propositions') return send(res, 200, store.propositions());
      if (action === 'archives') return send(res, 200, store.archives());
      if (action === 'journal') return send(res, 200, store.journal());
      if (action === 'patients') return send(res, 200, dossiers.liste());
      if (action === 'patient') { try { return send(res, 200, dossiers.detail(url.searchParams.get('id'))); } catch (e) { return send(res, 404, { error: e.message }); } }
      if (action === 'sujets') return send(res, 200, sujetsNonCouverts(3));
      if (action === 'operations') return send(res, 200, operations.liste());
      return send(res, 404, { error: 'inconnu' });
    }
    let body = '';
    req.on('data', c => { body += c; if (body.length > 50000) req.destroy(); });
    req.on('end', () => {
      let B; try { B = JSON.parse(body || '{}'); } catch { return send(res, 400, { error: 'json' }); }
      try {
        // Le secrétariat PROPOSE ; seul le chirurgien publie, valide, archive et restaure.
        if (action === 'proposer') return send(res, 200, store.propose(role, B.fiche, B.note));
        if (role !== 'chirurgien') return send(res, 403, { error: 'Réservé au chirurgien : faites une proposition.' });
        if (action === 'publier') return send(res, 200, store.publish(role, B.fiche, B.note));
        if (action === 'valider') return send(res, 200, { fiche: store.decide(role, B.pid, true) });
        if (action === 'rejeter') { store.decide(role, B.pid, false, B.note); return send(res, 200, { ok: true }); }
        if (action === 'archiver') { store.archive(role, B.id, B.note); return send(res, 200, { ok: true }); }
        if (action === 'operations') return send(res, 200, operations.enregistrer(B.operations));
        if (action === 'restaurer') { store.restore(role, B.id); return send(res, 200, { ok: true }); }
        return send(res, 404, { error: 'inconnu' });
      } catch (e) { return send(res, 400, { error: e.message }); }
    });
    return;
  }
  if (url.pathname === '/api/stats') {
    if (url.searchParams.get('code') !== ACCESS_CODE) return send(res, 401, { error: 'code' });
    return send(res, 200, { ...stats, totalFiches: brain.docs.length });
  }
  let p = path.normalize(path.join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!p.startsWith(PUBLIC)) { res.writeHead(403); return res.end(); }
  fs.readFile(p, (e, data) => {
    if (e) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    res.end(data);
  });
});

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => console.log(`[serveur] http://localhost:${PORT}  (code d'accès : ${ACCESS_CODE === 'demo' ? 'demo' : 'défini'})`));
}
module.exports = { answer, parseClaudeStream, texteVisible, buildPrompt, server, ADMIN_CODES, brain, sujetsNonCouverts };
