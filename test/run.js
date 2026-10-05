// Tests sans dépendance : node test/run.js
'use strict';
process.env.USE_LLM = '0';
// Les tests ne touchent jamais le vrai compteur admin-data/sujets.json.
process.env.SUJETS_FILE = require('path').join(require('os').tmpdir(), 'sujets-tests-' + process.pid + '.json');
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const { loadBrain, search } = require('../lib/brain');
const { checkRedFlags } = require('../lib/redflags');
const { answer } = require('../server');

let ok = 0, ko = 0;
async function t(name, fn) { try { await fn(); ok++; } catch (e) { ko++; console.log('✗', name, '-', e.message); } }

(async () => {
  const brain = loadBrain(path.join(__dirname, '..', 'data'));
  await t('500 fiches, ids uniques F001..F500', () => {
    assert.strictEqual(brain.docs.length, 500);
    for (let i = 1; i <= 500; i++) assert.ok(brain.byId['F' + String(i).padStart(3, '0')], 'manque F' + i);
  });
  await t('chaque fiche a question + réponse', () => brain.docs.forEach(d => assert.ok(d.question && d.answer && d.answer.length > 40, d.id)));
  await t('types d’opération : 8 par défaut, deux cliniques, avec anesthésie', () => {
    const { createOperations } = require('../lib/operations');
    const L = createOperations(path.join(require('os').tmpdir(), 'ops-absent-' + process.pid + '.json')).liste();
    assert.strictEqual(L.length, 8); assert.ok(L.every(o => o.cliniques.length === 2 && o.anesthesie === true && /^[a-z0-9-]+$/.test(o.id)));
    assert.ok(L.some(o => o.id === 'appendicectomie'));
  });
  await t('types d’opération : enregistrés, validés, relus', () => {
    const { createOperations } = require('../lib/operations');
    const F = path.join(require('os').tmpdir(), 'ops-' + process.pid + '.json');
    const O = createOperations(F);
    O.enregistrer([{ nom: 'Hernie <b>inguinale', cliniques: ['parc', 'inconnue'], anesthesie: false }, { id: 'appendicectomie', nom: 'Appendicectomie', cliniques: ['medipole'] }]);
    assert.deepStrictEqual(O.liste(), [{ id: 'hernie-binguinale', nom: 'Hernie binguinale', cliniques: ['parc'], anesthesie: false }, { id: 'appendicectomie', nom: 'Appendicectomie', cliniques: ['medipole'], anesthesie: true }]);
    assert.throws(() => O.enregistrer([{ nom: 'X1', cliniques: [] }]), /au moins une clinique/);
    assert.throws(() => O.enregistrer([{ nom: 'Abc', cliniques: ['parc'] }, { nom: 'abc', cliniques: ['parc'] }]), /double/);
    assert.throws(() => O.enregistrer([{ nom: '', cliniques: ['parc'] }]), /nom/);
    fs.rmSync(F);
  });
  await t('clés des cliniques identiques : serveur, téléphone, administration', () => {
    const { CLINIQUES } = require('../lib/operations');
    const pub = n => fs.readFileSync(path.join(__dirname, '..', 'public', n), 'utf8');
    const prep = pub('prep.js').match(/const CLINIQUES = \{([\s\S]*?)\n  \};/)[1].match(/^    (\w+):/gm).map(s => s.trim().slice(0, -1));
    const adm = Object.keys(eval('(' + pub('admin.html').match(/const CLINIQUES_NOMS = (\{[^}]*\})/)[1] + ')'));
    assert.deepStrictEqual(prep, CLINIQUES); assert.deepStrictEqual(adm, CLINIQUES);
  });
  await t('admin : « Quitter » ramène à l\'accueil patients', () => {
    const h = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.html'), 'utf8');
    assert.match(h.match(/\$\('#out'\)\.onclick = [^\n]*/)[0], /location\.href = '\/'/);
  });
  await t('plus aucune fiche sur la chirurgie de l\'obésité', () => brain.docs.forEach(d => assert.ok(!/sleeve|bypass|bariatr/i.test(d.question + d.answer), d.id)));

  const URG = ["j'ai de la fièvre à 39", "j'ai une douleur dans la poitrine", "mon coeur bat très vite", "je vomis tout depuis hier",
    "il y a du sang dans mes vomissements", "j'ai des selles noires", "mon mollet est gonflé et douloureux", "j'ai du mal à respirer",
    "j'ai envie d'en finir", "ma cicatrice coule du pus", "j'ai une douleur au ventre très intense",
    "ma hernie ne rentre plus", "j'ai les yeux jaunes", "ma stomie est devenue noire", "je n'ai plus de gaz et je vomis"];
  for (const q of URG) await t('urgence : ' + q, () => assert.ok(checkRedFlags(q), 'non détectée'));

  const NON = ["quand faire ma prise de sang ?", "j'ai 38 ans, puis-je faire du sport ?", "peut-on vivre sans vésicule ?", "quand porter des charges après une hernie ?"];
  for (const q of NON) await t('pas une urgence : ' + q, () => assert.strictEqual(checkRedFlags(q), null));

  const SEARCH = [["combien de temps à jeun avant l'opération", 'F003'], ["je prends du xarelto avant l'opération", 'F007'],
    ["peut-on vivre sans vésicule", 'F204'], ["diarrhée depuis qu'on m'a enlevé la vésicule", 'F208'],
    ["c'est quoi une hernie étranglée", 'F307'], ["quand porter des charges après ma hernie", 'F315'],
    ["mes bourses sont gonflées après la hernie", 'F317'], ["appendicite peut-elle revenir", 'F264'],
    ["opération de Nissen", 'F355'], ["je n'arrive plus à avaler après l'opération du reflux", 'F357'],
    ["différence colostomie iléostomie", 'F407'], ["comment changer la poche de stomie", 'F411'],
    ["combien de paracétamol par jour", 'F456'], ["quand retirer les agrafes", 'F089'], ["je suis constipé depuis l'opération", 'F153']];
  for (const [q, id] of SEARCH) await t(`recherche "${q}" → ${id}`, () => {
    const h = search(brain, q, 3).map(x => x.doc.id);
    assert.ok(h.includes(id), 'obtenu ' + h.join(','));
  });

  await t('question hors sujet → transfert', async () => assert.strictEqual((await answer('quel temps fera-t-il à Paris demain')).type, 'transfert'));
  await t('urgence → alerte avant toute IA', async () => assert.strictEqual((await answer("j'ai 39 de fièvre")).type, 'alerte'));
  await t('question courante → réponse avec fiche', async () => { const r = await answer('peut-on vivre sans vésicule ?'); assert.strictEqual(r.type, 'reponse'); assert.strictEqual(r.fiche.id, 'F204'); });

  const { notify } = require('../lib/notify');
  const fake = () => { const calls = []; const f = async (url, o) => { calls.push({ url, ...o }); return { ok: true }; }; f.calls = calls; return f; };
  await t('notif : la question n\'est PAS envoyée par défaut', async () => {
    const f = fake(); const r = await notify({ type: 'transfert', ref: 'ABC123', question: 'SECRET-Q' }, { NTFY_URL: 'http://n/x' }, f);
    assert.ok(r.envoye); assert.strictEqual(f.calls.length, 1); assert.ok(!JSON.stringify(f.calls).includes('SECRET-Q')); assert.ok(f.calls[0].body.includes('ABC123'));
  });
  await t('notif : question jointe seulement si NOTIFY_INCLUDE_QUESTION=1', async () => {
    const f = fake(); await notify({ type: 'transfert', ref: 'ABC123', question: 'SECRET-Q' }, { NTFY_URL: 'http://n/x', NOTIFY_INCLUDE_QUESTION: '1' }, f);
    assert.ok(f.calls[0].body.includes('SECRET-Q'));
  });
  await t('notif : alerte en priorité urgente, ntfy + webhook', async () => {
    const f = fake(); await notify({ type: 'alerte', ref: 'ABC123', motif: 'fièvre' }, { NTFY_URL: 'http://n/x', NOTIFY_WEBHOOK_URL: 'http://w/y' }, f);
    assert.strictEqual(f.calls.length, 2); assert.strictEqual(f.calls[0].headers.Priority, 'urgent');
  });
  await t('notif : aucun canal → envoye:false, rien envoyé', async () => { const f = fake(); const r = await notify({ type: 'alerte', ref: 'A' }, {}, f); assert.strictEqual(r.envoye, false); assert.strictEqual(f.calls.length, 0); });
  await t('notif : échec réseau → envoye:false', async () => { const r = await notify({ type: 'alerte', ref: 'A' }, { NTFY_URL: 'http://n' }, async () => { throw new Error('down'); }); assert.strictEqual(r.envoye, false); });
  await t('toute réponse porte une référence (bouton « pas satisfaisante ? »)', async () => {
    assert.match((await answer('quel temps fera-t-il demain')).ref, /^[A-F0-9]{6}$/);
    assert.match((await answer("j'ai 39 de fièvre")).ref, /^[A-F0-9]{6}$/);
    assert.match((await answer('peut-on vivre sans vésicule ?')).ref, /^[A-F0-9]{6}$/);
  });
  // Questions formulées comme un patient : elles étaient renvoyées au secrétariat par l'ancien seuil.
  const PATIENT = [["je peux manger du fromage après qu'on m'ait enlevé la vésicule", 'F207'], ["on m'a mis des agrafes qui les enlève", 'F089'],
    ["ça fait combien de temps la convalescence", 'F075']];
  // « tondre la pelouse » ne partage aucun mot avec F173/F315 : c'est pour ça que le modèle reçoit TOUT le brain.
  const { buildPrompt } = require('../server');
  await t('le modèle reçoit les 500 fiches, même sans mot commun', () => {
    const p = buildPrompt("mon mari a été opéré d'une hernie il peut tondre la pelouse ?", []);
    assert.ok(p.includes('[F173]') && p.includes('[F315]') && p.includes('[F500]'));
  });
  for (const [q, id] of PATIENT) await t(`question patient : la bonne fiche est fournie au modèle → ${id}`, () => {
    const h = search(brain, q, 10).map(x => x.doc.id);
    assert.ok(h.includes(id), 'obtenu ' + h.join(','));
  });
  await t('question patient : plus de renvoi au secrétariat quand une fiche existe', async () => {
    const r = await answer("on m'a mis des agrafes qui les enlève");
    assert.strictEqual(r.type, 'reponse'); assert.strictEqual(r.fiche.id, 'F089');
  });

  // ONLY_VALIDATED=1 : aucune fiche non relue ne sert de reponse ni n'est donnee au modele.
  await t('ONLY_VALIDATED : fiche non relue jamais utilisee ni fournie au modele', async () => {
    process.env.ONLY_VALIDATED = '1';
    try {
      assert.ok(!brain.byId.F089.validated, 'prerequis : F089 non relue');
      const r = await answer("on m'a mis des agrafes qui les enleve");
      assert.strictEqual(r.type, 'transfert', 'obtenu ' + r.type + ' ' + (r.fiche && r.fiche.id));
      assert.ok(!require('../server').buildPrompt("agrafes", []).includes('[F089] ' + brain.byId.F089.question), 'F089 encore dans le prompt'); assert.ok(require('../server').buildPrompt("x", []).includes('(aucune fiche relue)'));
    } finally { delete process.env.ONLY_VALIDATED; }
  });
  await t('ONLY_VALIDATED : une fiche validee reste utilisee', async () => {
    const d = require('../server').brain.byId.F089; const avant = d.validated;
    process.env.ONLY_VALIDATED = '1'; d.validated = true;
    try { const r = await answer("on m'a mis des agrafes qui les enleve"); assert.strictEqual(r.type, 'reponse'); assert.strictEqual(r.fiche.id, 'F089'); }
    finally { d.validated = avant; delete process.env.ONLY_VALIDATED; }
  });
  // Compteur anonyme des sujets non couverts : des mots isolés comptés, jamais la phrase du patient.
  await t('sujets non couverts : compte des mots, ne garde jamais la question', async () => {
    const os = require('os'); const f = require('path').join(os.tmpdir(), 'sujets-test-' + process.pid + '.json');
    const avantF = process.env.SUJETS_FILE; process.env.SUJETS_FILE = f;
    try {
      const q = 'combien coute un abonnement trottinette electrique';
      await answer(q); await answer(q);
      const s = JSON.parse(fs.readFileSync(f, 'utf8'));
      const k = Object.keys(s.mots).find(m => m.startsWith('trottinet')); assert.ok(k, JSON.stringify(s)); assert.strictEqual(s.mots[k], 2);
      assert.ok(!fs.readFileSync(f, 'utf8').includes('trottinette electrique'), 'la question est stockée');
      assert.ok(!fs.readFileSync(f, 'utf8').includes('abonnement trottinette'), 'la question est stockée');
      const { sujetsNonCouverts } = require('../server');
      assert.deepStrictEqual(sujetsNonCouverts(3), [], 'seuil 3 non respecté');
      await answer(q); assert.ok(sujetsNonCouverts(3).some(x => x.n === 3));
    } finally { process.env.SUJETS_FILE = avantF; try { fs.unlinkSync(f); } catch {} }
  });
  const { parseClaudeStream, texteVisible } = require('../server');
  await t('flux claude : chaque morceau de texte est relayé dès réception', () => {
    const vus = []; const p = parseClaudeStream(x => vus.push(x));
    const ev = txt => JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: txt } } }) + '\n';
    const e = ev('Bonjour, '); p.push(e.slice(0, 20)); assert.deepStrictEqual(vus, []); p.push(e.slice(20));
    p.push(ev('vous pouvez [F0')); p.push(ev('03].') + JSON.stringify({ type: 'result', result: 'Bonjour, vous pouvez [F003].' }) + '\n');
    assert.deepStrictEqual(vus, ['Bonjour, ', 'Bonjour, vous pouvez [F0', 'Bonjour, vous pouvez [F003].']);
    assert.strictEqual(p.text(), 'Bonjour, vous pouvez [F003].');
  });
  await t('texte partiel : aucune étiquette [F…] montrée au patient, même incomplète', () => {
    assert.strictEqual(texteVisible('Bonjour, vous pouvez [F0'), 'Bonjour, vous pouvez ');
    assert.strictEqual(texteVisible('Oui [F003]. Et [GENERAL]'), 'Oui. Et ');
  });
  console.log(`\n${ok} ok, ${ko} échec(s)`);
  process.exit(ko ? 1 : 0);
})();
