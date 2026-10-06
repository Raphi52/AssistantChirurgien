// Test du mode admin, sur une COPIE du projet (les vraies fiches ne sont jamais touchées).
// Usage : node test/admin-api.cjs
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), assert = require('assert');
const { spawn } = require('child_process');
const SRC = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-admin-'));
for (const d of ['lib', 'data', 'public', 'llm-sandbox']) fs.cpSync(path.join(SRC, d), path.join(TMP, d), { recursive: true });
fs.copyFileSync(path.join(SRC, 'server.js'), path.join(TMP, 'server.js'));
const PORT = 8791, U = `http://localhost:${PORT}`;
const env = { ...process.env, PORT: String(PORT), USE_LLM: '0', ACCESS_CODE: 'p', ADMIN_CHIRURGIEN: 'chir', ADMIN_SECRETARIAT: 'secr' };
const srv = spawn(process.execPath, ['server.js'], { cwd: TMP, env, stdio: 'ignore' });
let ok = 0, ko = 0;
const t = async (n, f) => { try { await f(); ok++; console.log('OK: ' + n); } catch (e) { ko++; console.log('ÉCHEC: ' + n + ' — ' + e.message); } };
const call = async (code, p, body) => { const r = await fetch(U + '/api/admin/' + p, { method: body ? 'POST' : 'GET', headers: { 'x-admin-code': code, 'content-type': 'application/json' }, body: body && JSON.stringify(body) }); return { s: r.status, j: await r.json() }; };
const ask = async q => (await (await fetch(U + '/api/ask', { method: 'POST', headers: { 'x-access-code': 'p', 'content-type': 'application/json' }, body: JSON.stringify({ question: q }) })).json());

(async () => {
  for (let i = 0; i < 40; i++) { try { await fetch(U + '/'); break; } catch { await new Promise(r => setTimeout(r, 250)); } }
  // L'admin contient des dossiers patients et des signatures, et peut publier des fiches servies aux patients :
  // sans code reconnu, TOUT est refusé (avant le 2026-10-06, un code absent ou faux entrait en chirurgien).
  const sansEntete = async (p, body) => (await fetch(U + '/api/admin/' + p, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json' }, body: body && JSON.stringify(body) })).status;
  await t('sans code → refusé (401) sur chaque route admin', async () => {
    for (const p of ['moi', 'fiches', 'patients', 'patient?id=0123456789abcdef', 'journal', 'operations']) assert.strictEqual(await sansEntete(p), 401, p);
    assert.strictEqual(await sansEntete('publier', { fiche: { question: 'Intrusion test', answer: 'x'.repeat(30) } }), 401, 'publier');
  });
  // (Les espaces autour d'un en-tête sont retirés par HTTP lui-même : « chir » entouré d'espaces reste « chir ».)
  await t('code faux, vide, tronqué ou trop long → refusé (401)', async () => { for (const c of ['faux', '', 'chi', 'chirr', 'secr0']) assert.strictEqual((await call(c, 'moi')).s, 401, JSON.stringify(c)); });
  await t('rôles reconnus', async () => { assert.strictEqual((await call('chir', 'moi')).j.role, 'chirurgien'); assert.strictEqual((await call('secr', 'moi')).j.role, 'secretariat'); });
  await t('500 fiches listées', async () => assert.strictEqual((await call('secr', 'fiches')).j.length, 500));
  await t('le secrétariat ne peut pas publier directement', async () => assert.strictEqual((await call('secr', 'publier', { fiche: { question: 'Test test', answer: 'x'.repeat(30) } })).s, 403));

  const F089 = (await call('chir', 'fiches')).j.find(f => f.id === 'F089');
  const NOUVEAU = 'Les agrafes sont retirées au 10e jour par l’infirmière du cabinet de votre choix (protocole du service).';
  let pid;
  await t('le secrétariat propose une correction', async () => { const r = await call('secr', 'proposer', { fiche: { ...F089, answer: NOUVEAU }, note: 'protocole 2026' }); assert.strictEqual(r.s, 200); pid = r.j.pid; });
  await t('la proposition n’est PAS encore utilisée par l’assistant', async () => assert.ok(!(await ask('quand retirer les agrafes')).text.includes('10e jour')));
  await t('le chirurgien voit la proposition avec l’avant/après', async () => { const P = (await call('chir', 'propositions')).j; assert.strictEqual(P.length, 1); assert.ok(P[0].avant.answer.includes('7 et 15 jours')); });
  await t('le chirurgien valide → publiée et validée', async () => { const r = await call('chir', 'valider', { pid }); assert.strictEqual(r.j.fiche.validated, true); });
  await t('l’assistant utilise la correction SANS redémarrage', async () => assert.ok((await ask('quand retirer les agrafes')).text.includes('10e jour')));
  await t('écrit dans le bon fichier de fiches', async () => assert.ok(fs.readFileSync(path.join(TMP, 'data', '02-hospitalisation-sortie.json'), 'utf8').includes('10e jour')));

  let nid;
  await t('le chirurgien crée une fiche nouvelle', async () => { const r = await call('chir', 'publier', { fiche: { question: 'Puis-je tondre la pelouse après une hernie ?', keywords: 'tondre, pelouse, tondeuse', answer: 'Attendez 4 semaines avant de pousser une tondeuse, selon le protocole du service.' } }); nid = r.j.id; assert.strictEqual(nid, 'F501'); });
  await t('nouvelle fiche trouvée par l’assistant', async () => assert.ok((await ask('je peux tondre la pelouse')).text.includes('tondeuse')));
  await t('archiver retire la fiche', async () => { await call('chir', 'archiver', { id: nid }); assert.ok(!(await call('chir', 'fiches')).j.some(f => f.id === nid)); assert.strictEqual((await call('chir', 'archives')).j.length, 1); });
  await t('restaurer la remet', async () => { await call('chir', 'restaurer', { id: nid }); assert.ok((await call('chir', 'fiches')).j.some(f => f.id === nid)); });
  await t('fiche trop courte refusée', async () => assert.strictEqual((await call('chir', 'publier', { fiche: { question: 'Q', answer: 'court' } })).s, 400));
  await t('journal trace tout (avant/après, rôle, note)', async () => {
    const J = (await call('chir', 'journal')).j.map(e => e.action);
    for (const a of ['proposition', 'modification', 'creation', 'archivage', 'restauration']) assert.ok(J.includes(a), 'manque ' + a);
  });
  await t('les vraies fiches n’ont pas été touchées', async () => assert.ok(!fs.readFileSync(path.join(SRC, 'data', '02-hospitalisation-sortie.json'), 'utf8').includes('10e jour')));

  const prep = b => fetch(U + '/api/prep', { method: 'POST', headers: { 'x-access-code': 'p', 'content-type': 'application/json' }, body: JSON.stringify(b) });
  const SIG = 'data:image/png;base64,iVBORw0KGgo=';
  await t('préparation patient : sans code d’accès → refusée', async () => assert.strictEqual((await fetch(U + '/api/prep', { method: 'POST', body: '{}' })).status, 401));
  await t('préparation patient : enregistrée puis listée (démo)', async () => {
    assert.strictEqual((await prep({ id: '0123456789abcdef', patient: 'Jean <b>Test', clinique: 'parc', date: '2027-01-10', progression: { clinique: [2, 2], consent: [1, 4] }, signatures: { chir: { img: SIG, le: 'hier' }, autre: { img: SIG } } })).status, 200);
    const L = (await call('secr', 'patients')).j; assert.strictEqual(L.length, 1);
    assert.strictEqual(L[0].patient, 'Jean bTest'); assert.deepStrictEqual(L[0].consentements, ['chir']); assert.ok(!('signatures' in L[0]));
  });
  await t('nom, prénom, type d’opération : gardés quand le téléphone resynchronise sans eux', async () => {
    assert.strictEqual((await prep({ id: '0123456789abcdef', patient: 'Jean Test', nom: 'Durand', prenom: 'Jean', operation: 'appendicectomie', clinique: 'parc', date: '2027-01-10', signatures: { chir: { img: SIG, le: 'hier' } } })).status, 200);
    assert.strictEqual((await prep({ id: '0123456789abcdef', patient: 'Jean Test', clinique: 'parc', date: '2027-01-10', signatures: { chir: { img: SIG, le: 'hier' } } })).status, 200);
    const p = (await call('secr', 'patients')).j[0];
    assert.deepStrictEqual([p.nom, p.prenom, p.operation], ['Durand', 'Jean', 'appendicectomie']);
    await prep({ id: '0123456789abcdef', patient: 'Jean Test', operation: 'Greffe inventée', signatures: { chir: { img: SIG, le: 'hier' } } });
    assert.strictEqual((await call('secr', 'patients')).j[0].operation, '', 'type hors liste refusé');
  });
  await t('types d’opération : lecture patient avec code, sinon refusée', async () => {
    assert.strictEqual((await fetch(U + '/api/operations')).status, 401);
    const L = await (await fetch(U + '/api/operations', { headers: { 'x-access-code': 'p' } })).json();
    assert.strictEqual(L.length, 8);
  });
  await t('types d’opération : le secrétariat lit mais n’enregistre pas', async () => {
    assert.strictEqual((await call('secr', 'operations')).j.length, 8);
    assert.strictEqual((await call('secr', 'operations', { operations: [{ nom: 'Test', cliniques: ['parc'] }] })).s, 403);
  });
  await t('types d’opération : le chirurgien enregistre ; un type supprimé n’est plus accepté', async () => {
    const r = await call('chir', 'operations', { operations: [{ id: 'appendicectomie', nom: 'Appendicectomie', cliniques: ['parc'], anesthesie: false }, { nom: 'Colectomie', cliniques: ['medipole'] }] });
    assert.strictEqual(r.s, 200); assert.deepStrictEqual(r.j.map(o => o.id), ['appendicectomie', 'colectomie']);
    assert.strictEqual((await call('chir', 'operations', { operations: [{ nom: 'Sans clinique', cliniques: [] }] })).s, 400);
    await prep({ id: '0123456789abcdef', patient: 'Jean Test', operation: 'cure-de-hernie-inguinale', progression: { anesth: [0, 0] }, signatures: { chir: { img: SIG, le: 'hier' } } });
    const p = (await call('secr', 'patients')).j[0];
    assert.strictEqual(p.operation, '', 'type supprimé refusé');
    assert.deepStrictEqual(p.progression.anesth, [0, 0], 'étape anesthésie non concernée gardée à 0/0');
  });
  await t('consentement signé récupérable dans le dossier', async () => assert.strictEqual((await call('chir', 'patient?id=0123456789abcdef')).j.signatures.chir.img, SIG));
  await t('identifiant forgé refusé (pas de chemin de fichier)', async () => { assert.strictEqual((await prep({ id: '../codes' })).status, 400); assert.strictEqual((await call('chir', 'patient?id=../codes')).s, 404); });

  // Attendre l'arrêt réel du serveur de test avant d'effacer sa copie (sinon Windows garde le dossier verrouillé).
  await new Promise(r => { srv.once('exit', r); srv.kill(); });
  fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  console.log(`\n${ok} ok, ${ko} échec(s)`); process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); srv.kill(); process.exit(1); });
