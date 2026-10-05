// Test bout en bout de la vue « Patients » de l'admin : le document COMPLET signé se consulte dans le dossier.
// Tourne sur une COPIE du projet (admin-data et dossiers réels jamais touchés), navigateur Edge sans fenêtre.
// Usage : node test/admin-dossier-ui.cjs
'use strict';
const fs = require('fs'), os = require('os'), path = require('path');
const { spawn } = require('child_process');
const { chromium } = require(path.join(__dirname, '..', '..', 'BlocAccord', 'node_modules', 'playwright-core'));
const SRC = path.join(__dirname, '..');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'brain-dossier-'));
for (const d of ['lib', 'data', 'public', 'llm-sandbox']) fs.cpSync(path.join(SRC, d), path.join(TMP, d), { recursive: true });
fs.copyFileSync(path.join(SRC, 'server.js'), path.join(TMP, 'server.js'));
const PORT = 8792, U = `http://localhost:${PORT}`;
const env = { ...process.env, PORT: String(PORT), USE_LLM: '0', ACCESS_CODE: 'p', ADMIN_CHIRURGIEN: 'chir', ADMIN_SECRETARIAT: 'secr' };
const srv = spawn(process.execPath, ['server.js'], { cwd: TMP, env, stdio: 'ignore' });
let n = 0, ko = 0;
const ok = (c, m) => { n++; if (!c) ko++; console.log((c ? 'OK: ' : 'ÉCHEC: ') + m); };
// PNG 1×1 VALIDE : l'image doit vraiment s'afficher dans le document (naturalWidth > 0).
const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

(async () => {
  for (let i = 0; i < 40; i++) { try { await fetch(U + '/'); break; } catch { await new Promise(r => setTimeout(r, 250)); } }
  const r = await fetch(U + '/api/prep', { method: 'POST', headers: { 'x-access-code': 'p', 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'aaaabbbbccccdddd', patient: 'Marie Durand', clinique: 'parc', date: '2027-01-10', progression: { consent: [2, 4] },
      signatures: { chir: { img: SIG, le: '05/10/2026 09:15:00' }, anesth: { img: SIG, le: '06/10/2026 10:00:00' } } }) });
  ok(r.status === 200, 'dossier patient enregistré (démo)');
  await fetch(U + '/api/prep', { method: 'POST', headers: { 'x-access-code': 'p', 'content-type': 'application/json' },
    body: JSON.stringify({ id: 'eeeeffff00001111', patient: 'x', nom: 'Bernard', prenom: 'Lucas', operation: 'colectomie', clinique: 'medipole', date: '2027-02-01', progression: { consent: [4, 4] } }) });

  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const p = await b.newPage({ viewport: { width: 1000, height: 1400 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  // Demande du 2026-10-05 : nom et prénom viennent de la page de connexion du patient (index.html), envoyés séparément.
  const tel = await b.newPage({ viewport: { width: 390, height: 844 } });
  tel.on('pageerror', e => errs.push(e.message));
  await tel.goto(U + '/');
  await tel.fill('#code', 'p'); await tel.fill('#prenom', 'Jean Pierre'); await tel.fill('#nom', 'De la Tour'); await tel.click('#go');
  await tel.waitForSelector('#gate', { state: 'hidden' });
  const envoi = tel.waitForRequest(r => r.url().endsWith('/api/prep') && r.method() === 'POST');
  await tel.click('[data-tab=prep]'); await tel.click('[data-path=clinique][data-val=parc]');
  const corps = JSON.parse((await envoi).postData());
  ok(corps.prenom === 'Jean Pierre' && corps.nom === 'De la Tour', 'connexion : prénom et nom envoyés séparément (' + corps.prenom + ' / ' + corps.nom + ')');
  await tel.waitForTimeout(500); await tel.close();
  await p.goto(U + '/admin.html');
  if (await p.isVisible('#code')) { await p.fill('#code', 'chir'); await p.click('#go'); }
  await p.click('[data-v=patients]');
  await p.waitForSelector('[data-testid=liste-patients] tbody tr');
  const noms = () => p.$$eval('[data-testid=liste-patients] tbody tr', L => L.map(r => r.cells[0].innerText));
  const entetes = await p.$$eval('[data-testid=liste-patients] th', L => L.map(h => h.innerText.replace(/[▲▼]/g, '').trim()));
  ok(['Nom', 'Prénom', 'Type d’opération'].every(t => entetes.includes(t)), 'colonnes Nom, Prénom, Type d’opération (' + entetes.join(' | ') + ')');
  ok((await p.$$eval('[data-testid=liste-patients] tbody tr', L => L.map(r => r.cells[1].innerText))).includes('Marie'), 'nom libre « Marie Durand » découpé en prénom/nom');
  ok(await p.isVisible('text=Colectomie'), 'type d’opération affiché');
  const jp = await p.$$eval('[data-testid=liste-patients] tbody tr', L => L.map(r => r.cells[0].innerText + '|' + r.cells[1].innerText));
  ok(jp.includes('De la Tour|Jean Pierre'), 'nom composé et prénom composé de la connexion affichés tels quels ' + JSON.stringify(jp));
  await p.click('th[data-tri=nom]');
  ok(JSON.stringify(await noms()) === JSON.stringify(['Bernard', 'De la Tour', 'Durand']), 'tri par nom croissant ' + JSON.stringify(await noms()));
  await p.click('th[data-tri=nom]');
  ok(JSON.stringify(await noms()) === JSON.stringify(['Durand', 'De la Tour', 'Bernard']), 'second clic : tri décroissant');
  ok((await p.getAttribute('th[data-tri=nom]', 'data-sens')) === '▼' && (await p.$eval('th[data-tri=nom]', h => getComputedStyle(h, '::after').content)) === '"▼"', 'flèche de sens affichée');
  await p.fill('[data-testid=recherche-patients]', 'colec');
  ok(JSON.stringify(await noms()) === JSON.stringify(['Bernard']), 'recherche par type d’opération');
  ok((await p.innerText('#np')).includes('1 patient(s) sur 3'), 'compteur filtré');
  await p.fill('[data-testid=recherche-patients]', 'marie');
  ok(JSON.stringify(await noms()) === JSON.stringify(['Durand']), 'recherche par prénom');
  await p.fill('[data-testid=recherche-patients]', '');
  await p.screenshot({ path: path.join(SRC, 'captures', 'admin-patients-liste.png') });
  await p.click('[data-act=dossier][data-id=aaaabbbbccccdddd]');
  await p.waitForSelector('[data-testid=dossier]');

  ok(await p.locator('div.doc').count() === 2, 'un document par consentement signé (2), aucun pour les non signés');
  ok(await p.locator('[data-testid=adoc-confiance]').count() === 0, 'personne de confiance non signée : pas de document');
  // Demande du 2026-10-05 : plus de signature seule ni de dépliage, le document entier signé s'affiche d'office.
  ok(await p.locator('[data-testid=dossier] summary').count() === 0, 'aucun lien à déplier');
  ok(await p.locator('[data-testid=dossier] > .card > img.sigimg').count() === 0, 'pas de signature isolée hors du document');
  const sum = p.locator('[data-testid=adoc-chir]');
  // Chevauchement signalé le 2026-10-05 : le lien « Télécharger » (a.btn en ligne) remontait sur la ligne « Voir le document… ».
  const bas = (await sum.boundingBox()), btn = await p.locator('[data-testid=adoc-chir] + a.btn').boundingBox();
  await p.locator('[data-testid=adoc-chir]').locator('..').screenshot({ path: path.join(SRC, 'captures', 'admin-dossier-carte.png') });
  ok(btn && bas && btn.y >= bas.y + bas.height - 0.5, 'bouton Télécharger sous le document, sans chevauchement (document bas=' + Math.round(bas.y + bas.height) + ', bouton haut=' + Math.round(btn && btn.y) + ')');
  const doc = p.locator('[data-testid=adoc-chir] .docpage');
  ok(await doc.isVisible(), 'document visible sans clic');
  const t = await doc.innerText();
  ok(t.includes('MODÈLE PROVISOIRE'), 'bandeau « modèle provisoire » présent');
  ok(t.includes('Consentement éclairé à l’intervention chirurgicale'), 'titre du document');
  ok(t.includes('Je soussigné(e) Marie Durand'), 'nom du patient inséré dans le texte');
  ok(t.includes('Clinique du Parc (Lyon 6e)'), 'nom de la clinique en clair (pas la clé « parc »)');
  ok(t.includes('10/01/2027'), 'date d’opération insérée');
  ok(/Fait le 05\/10\/2026/.test(t) && !t.includes('……'), 'date de signature remplie, aucun champ vide (' + (t.match(/Fait le [^\n]*/) || [''])[0] + ')');
  const img = p.locator('[data-testid=adoc-chir] .docsig img.sigimg');
  ok(await img.count() === 1 && (await img.getAttribute('src')) === SIG, 'signature insérée dans le document, à la ligne de signature');
  ok(await img.evaluate(i => i.complete && i.naturalWidth > 0), 'image de signature réellement affichée');
  ok(/Fait le 06\/10\/2026/.test(await p.innerText('[data-testid=adoc-anesth] .docpage')), 'chaque document porte SA date de signature');

  // Impression du dossier : les documents, déjà affichés, figurent dans le PDF.
  await p.evaluate(() => { window.print = () => { window.__imprime = true; }; });
  await p.click('[data-act=imprimer-dossier]');
  ok(await p.evaluate(() => window.__imprime === true && [...document.querySelectorAll('div.doc')].every(d => d.offsetHeight > 0)), 'impression : tous les documents visibles');
  // Demande du 2026-10-05 : les types d'opération se règlent dans l'admin (cliniques, questionnaire d'anesthésie) et changent la préparation du patient.
  await p.click('[data-v=patients]');
  await p.click('[data-testid=regler-operations]');
  await p.waitForSelector('[data-testid=types-operation] tbody tr');
  ok(await p.locator('[data-testid=types-operation] tbody tr').count() === 8, '8 types d’opération par défaut');
  const ligne = nom => p.locator('[data-testid=types-operation] tbody tr', { has: p.locator(`input.op-nom[value="${nom}"]`) });
  await ligne('Appendicectomie').locator('.op-anesth').uncheck();
  await ligne('Colectomie').locator('.op-cl[value=parc]').uncheck();
  await p.click('[data-act=op-ajouter]');
  await p.locator('[data-testid=types-operation] tbody tr:last-child .op-nom').fill('Cure de hémorroïdes');
  await p.click('[data-testid=enregistrer-operations]');
  await p.waitForSelector('.msg.ok');
  ok((await p.innerText('.msg.ok')).includes('9'), 'réglages enregistrés (9 types)');
  ok(await ligne('Cure de hémorroïdes').count() === 1 && !(await ligne('Appendicectomie').locator('.op-anesth').isChecked()), 'réglages relus après enregistrement');
  await p.screenshot({ path: path.join(SRC, 'captures', 'admin-types-operation.png'), fullPage: true });

  const tel2 = await b.newPage({ viewport: { width: 390, height: 844 } });
  tel2.on('pageerror', e => errs.push(e.message));
  await tel2.goto(U + '/');
  await tel2.evaluate(() => { localStorage.clear(); localStorage.setItem('code', 'p'); localStorage.setItem('patient', 'Zoé Test'); });
  await tel2.reload();
  await tel2.click('[data-tab=prep]');
  await tel2.waitForFunction(() => document.querySelectorAll('[data-testid=type-operation] option').length > 1);
  await tel2.click('[data-path=clinique][data-val=parc]');
  const opts = await tel2.$$eval('[data-testid=type-operation] option', L => L.map(o => o.textContent));
  ok(!opts.includes('Colectomie') && opts.includes('Cure de hémorroïdes'), 'Clinique du Parc : Colectomie absente, nouveau type présent');
  ok(await tel2.locator('[data-step=anesth]').count() === 1, 'avant choix : étape anesthésie présente');
  await tel2.selectOption('[data-testid=type-operation]', { label: 'Appendicectomie' });
  await tel2.waitForSelector('[data-testid=sans-anesth]');
  ok(await tel2.locator('[data-step=anesth]').count() === 0, 'Appendicectomie sans anesthésie : étape retirée');
  ok(await tel2.locator('.jalons .jl').count() === 4 && (await tel2.innerText('[data-step=consent] summary')).startsWith('3. Consentements'), 'étapes renumérotées (4 jalons, « 3. Consentements »)');
  await tel2.screenshot({ path: path.join(SRC, 'captures', 'prep-sans-anesthesie.png') });
  ok(await tel2.locator('[data-testid=sig-anesth]').count() === 0 && await tel2.locator('[data-testid=sig-chir]').count() === 1, 'sans anesthésie : consentement anesthésie retiré, consentement opération gardé');
  ok((await tel2.textContent('[data-testid=st-consent]')).includes('3 restants'), 'étape Consentements : 3 au lieu de 4');
  await tel2.selectOption('[data-testid=type-operation]', { label: 'Cure de hémorroïdes' });
  await tel2.click('[data-path=clinique][data-val=medipole]');
  ok(await tel2.locator('[data-step=anesth]').count() === 1, 'type avec anesthésie : étape de retour');
  ok(await tel2.locator('[data-testid=sig-anesth]').count() === 1 && (await tel2.textContent('[data-testid=st-consent]')).includes('4 restants'), 'type avec anesthésie : consentement anesthésie de retour (4)');
  await tel2.selectOption('[data-testid=type-operation]', { label: 'Colectomie' });
  ok(!(await tel2.isVisible('[data-testid=op-err]')), 'Colectomie au Médipôle : acceptée');
  await tel2.click('[data-path=clinique][data-val=parc]');
  ok(await tel2.isVisible('[data-testid=op-err]') && (await tel2.textContent('[data-testid=st-clinique]')).includes('2 restants'), 'Colectomie puis Clinique du Parc : message, type non compté');
  await tel2.close();

  ok(errs.length === 0, 'aucune erreur JavaScript ' + JSON.stringify(errs));
  await b.close();

  await new Promise(r => { srv.once('exit', r); srv.kill(); });
  fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  console.log(`\n${n - ko} ok, ${ko} échec(s)`); process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); srv.kill(); process.exit(1); });
