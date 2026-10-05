// Test bout en bout de « Préparation de mon opération », format téléphone.
// Usage : serveur lancé sur le port 8787, puis  node test/prep-ui.cjs [code]
// playwright-core est pris dans BlocAccord (même dossier parent) pour ne rien installer ici.
'use strict';
const path = require('path');
const { chromium } = require(path.join(__dirname, '..', '..', 'BlocAccord', 'node_modules', 'playwright-core'));
const URL_ = process.env.APP_URL || 'http://localhost:8787';
const CODE = process.argv[2] || process.env.ACCESS_CODE;
const out = path.join(__dirname, '..', 'captures');
let fails = 0;
const ok = (c, m) => { console.log((c ? 'OK: ' : 'ÉCHEC: ') + m); if (!c) fails++; };

(async () => {
  require('fs').mkdirSync(out, { recursive: true });
  const b = await chromium.launch({ channel: 'msedge', headless: true });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR' });
  const p = await ctx.newPage();
  const errs = [], envois = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => m.type() === 'error' && errs.push(m.text()));
  p.on('request', r => {  if (r.method() !== 'GET') envois.push(r.url() + ' ' + (r.postData() || '')); });
  p.on('dialog', d => d.accept());
  await p.goto(URL_);
  await p.evaluate(c => { localStorage.clear(); if (c) { localStorage.setItem('code', c); localStorage.setItem('patient', 'Test Patient'); } }, CODE);
  await p.reload();

  await p.click('[data-tab=prep]');
  const ouvrir = k => p.evaluate(k => { const el = document.querySelector(`[data-step=${k}]`); const f = el.closest('.faits'); if (f) f.open = true; if (!el.open) el.querySelector('summary').click(); }, k);
  ok(await p.isVisible('[data-testid=suivi]'), 'vue de suivi visible');
  ok((await p.innerText('[data-testid=pct]')) === '0 %', 'départ à 0 %');
  ok((await p.innerText('[data-testid=maintenant]')).includes('Ma clinique'), 'à faire maintenant : étape 1');
  await p.screenshot({ path: path.join(out, 'prep-1-vide.png') });

  // Étape 1 : clinique + date
  await p.fill('[data-path=date]', '1226-09-25'); await p.press('[data-path=date]', 'Tab');
  // fix-ok: le redessin après sortie du champ est différé (prep.js focusout → setTimeout(render,0)) : attendre le message.
  await p.waitForSelector('[data-testid=date-err]', { timeout: 3000 }).catch(() => {});
  ok(await p.isVisible('[data-testid=date-err]') && !(await p.textContent('[data-testid=st-clinique]')).includes('1 restant') && (await p.$('[data-testid=jours]')) === null, 'date dans le passé refusée (non comptée, message affiché)');
  await p.click('[data-path=clinique][data-val=medipole]');
  ok(!(await p.textContent('[data-testid=st-clinique]')).includes('Fait'), 'étape 1 pas finie sans le type d’opération');
  await p.selectOption('[data-testid=type-operation]', 'Appendicectomie');
  // Date LOCALE (comme l'app) : toISOString donne la date UTC, décalée d'un jour entre minuit et 2 h en France.
  const dl = new Date(); dl.setDate(dl.getDate() + 12);
  const d = dl.getFullYear() + '-' + String(dl.getMonth() + 1).padStart(2, '0') + '-' + String(dl.getDate()).padStart(2, '0');
  await p.fill('[data-path=date]', d); await p.press('[data-path=date]', 'Tab');
  ok((await p.textContent('[data-testid=st-clinique]')).includes('Fait'), 'étape 1 faite (clinique, opération, date)');
  ok(envois.some(e => e.includes('/api/prep') && e.includes('"operation":"appendicectomie"')), 'type d’opération envoyé au serveur');
  const jrs = await p.innerText('[data-testid=jours]', { timeout: 3000 }).catch(() => 'absent'); ok(jrs === 'J-12', 'compte à rebours J-12 (lu : ' + jrs + ')');
  ok((await p.innerText('[data-testid=maintenant]')).includes('Préadmission'), 'à faire maintenant passe à la préadmission');
  ok(await p.$eval('[data-step=preadm]', d => d.open), 'préadmission ouverte toute seule');

  // Étape 2 : lien du portail officiel selon la clinique
  await ouvrir('preadm');
  ok((await p.getAttribute('[data-testid=portail]', 'href')) === 'https://www.ramsayservices.fr', 'Médipôle → Ramsay Services');
  await p.check('[data-path="docs.identite"]'); await p.check('[data-path="docs.vitale"]');
  ok((await p.innerText('[data-testid=st-preadm]')).includes('4 restants'), 'préadmission : 4 restants');
  await ouvrir('clinique');
  await p.click('[data-path=clinique][data-val=parc]');
  await ouvrir('preadm');
  ok((await p.getAttribute('[data-testid=portail]', 'href')).includes('elsan.care'), 'Clinique du Parc → Elsan Care');

  // Étape 3 : questionnaire
  await ouvrir('anesth');
  await p.fill('[data-path="anesth.poids"]', '72'); await p.press('[data-path="anesth.poids"]', 'Tab');
  await p.click('[data-path="anesth.allergie"][data-val=oui]');
  await p.fill('[data-path="anesthDetail.allergie"]', 'pénicilline'); await p.press('[data-path="anesthDetail.allergie"]', 'Tab');
  ok((await p.innerText('[data-testid=st-anesth]')).includes('15 restants'), 'questionnaire : 15 restants');
  await p.screenshot({ path: path.join(out, 'prep-2-questionnaire.png'), fullPage: true });

  // Étape 4 : consentements
  await ouvrir('consent');
  // Demande du 2026-10-05 : uniquement le document et la signature — ni introduction, ni points clés, ni lien à déplier.
  ok(await p.locator('[data-step=consent] .body > p.note, [data-step=consent] .resume, [data-step=consent] .prov, [data-step=consent] .body summary').count() === 0, 'consentement : ni introduction, ni points clés, ni lien à déplier');
  ok((await p.innerText('[data-testid=doc-chir] .docpage')).includes('MODÈLE PROVISOIRE'), 'document affiché d’emblée, marqué provisoire');
  await p.click('[data-act=sig-valider][data-k=chir]'); // sans tracé : refusé
  ok(await p.locator('canvas.sigpad[data-k=chir]').count() === 1, 'signature vide refusée');
  // Trait rond, pas en plume : le cadre affiché garde les proportions de son dessin interne (même échelle en largeur et en hauteur).
  const ech = await p.$eval('canvas.sigpad[data-k=chir]', c => [c.clientWidth / c.width, c.clientHeight / c.height]);
  ok(Math.abs(ech[0] / ech[1] - 1) < 0.01, 'signature : même échelle horizontale et verticale (' + ech.map(v => v.toFixed(3)).join(' / ') + ')');
  for (const k of ['chir', 'anesth', 'confiance', 'devis']) {
    await p.locator(`canvas.sigpad[data-k=${k}]`).scrollIntoViewIfNeeded();
    const bx = await p.locator(`canvas.sigpad[data-k=${k}]`).boundingBox();
    await p.mouse.move(bx.x + 20, bx.y + 30); await p.mouse.down();
    await p.mouse.move(bx.x + 120, bx.y + 80, { steps: 8 }); await p.mouse.move(bx.x + 200, bx.y + 40, { steps: 8 }); await p.mouse.up();
    await p.click(`[data-act=sig-valider][data-k=${k}]`);
    ok(await p.locator(`[data-testid=doc-${k}] .docsig img.sigimg`).count() === 1, 'signature ' + k + ' insérée dans le document');
  }
  ok((await p.innerText('[data-testid=st-consent]')).includes('Fait'), 'consentements faits');
  const docSigne = await p.innerText('[data-testid=doc-chir] .docsig');
  ok(/Fait le [0-9]{2}\/[0-9]{2}\/[0-9]{4}/.test(docSigne) && !docSigne.includes('……'), 'document signé : date et nom remplis (' + docSigne.replace(/\s+/g, ' ').trim() + ')');
  await p.locator('[data-testid=doc-chir]').scrollIntoViewIfNeeded();
  await p.screenshot({ path: path.join(out, 'prep-4-document-signe.png') });

  // Persistance et confidentialité
  await p.reload(); await p.click('[data-tab=prep]');
  ok((await p.innerText('[data-testid=st-consent]')).includes('Fait') && (await p.innerText('[data-testid=st-anesth]')).includes('15 restants'), 'conservé après rechargement');
  const pct = await p.innerText('[data-testid=pct]');
  ok(pct !== '0 %', 'avancement global ' + pct);
  const reste = await p.innerText('[data-testid=reste]');
  ok(/^[0-9]+ éléments?$/.test(reste), 'plus que ' + reste);
  await p.click('.jl[data-goto=jourj]');
  ok(await p.$eval('[data-step=jourj]', d => d.open), 'clic sur le jalon 5 ouvre son étape');
  await p.screenshot({ path: path.join(out, 'prep-3-suivi.png') });
  // ⚠️ DÉMO : l'avancement et les signatures partent vers /api/prep ; les réponses d'anesthésie, jamais.
  await p.waitForTimeout(1200);
  ok(!envois.some(e => /pénicilline|anesthDetail|prep-v1/i.test(e)), 'réponses d’anesthésie jamais envoyées (' + envois.length + ' envoi(s) au total)');
  ok(envois.some(e => e.includes('/api/prep') && e.includes('data:image/png')), 'démo : avancement et signatures transmis au service');

  // Le chat marche toujours
  await p.click('[data-tab=chat]');
  ok(await p.isVisible('#q'), 'onglet Questions intact');

  // Lien venu de BlocAccord : ?prep=1&clinique=…&date=… pré-remplit l'étape 1, sans écraser ce que le patient a déjà saisi
  const J30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const KEYP = 'prep-v1';
  const viaLien = async (q, etat) => {
    await p.evaluate(([c, k, e]) => { localStorage.clear(); if (c) { localStorage.setItem('code', c); localStorage.setItem('patient', 'Test Patient'); } if (e) localStorage.setItem(k, JSON.stringify(e)); }, [CODE, KEYP, etat]);
    await p.goto(URL_ + '/?' + q); await p.waitForTimeout(300);
  };
  await viaLien('prep=1&clinique=parc&date=' + J30);
  ok(await p.isVisible('#v-prep') && !(await p.isVisible('#q')), 'lien : onglet Préparation ouvert directement');
  ok(await p.$eval('[data-path=clinique][data-val=parc]', b => b.classList.contains('on')), 'lien : Clinique du Parc pré-sélectionnée');
  ok((await p.inputValue('[data-path=date]')) === J30, 'lien : date pré-remplie');
  ok(!(await p.evaluate(() => location.search)).includes('clinique'), 'lien : paramètres retirés de l’adresse après lecture');
  await viaLien('prep=1&clinique=inconnue&date=1999-01-01');
  ok(await p.isVisible('#v-prep') && (await p.inputValue('[data-path=date]')) === '' && (await p.$$('[data-path=clinique].on')).length === 0, 'lien : clinique inconnue et date impossible ignorées');
  await viaLien('prep=1&clinique=parc&date=' + J30, { clinique: 'medipole', date: d });
  ok(await p.$eval('[data-path=clinique][data-val=medipole]', b => b.classList.contains('on')) && (await p.inputValue('[data-path=date]')) === d, 'lien : saisie existante du patient non écrasée');
  ok(await p.isVisible('[data-testid=lien-recu]'), 'lien : proposition de remplacement affichée');
  await p.click('[data-act=lien-appliquer]');
  ok(await p.$eval('[data-path=clinique][data-val=parc]', b => b.classList.contains('on')) && (await p.inputValue('[data-path=date]')) === J30 && !(await p.isVisible('[data-testid=lien-recu]')), 'lien : remplacement après accord du patient');
  await p.screenshot({ path: path.join(out, 'prep-4-lien.png') });
  ok(errs.length === 0, 'aucune erreur console ' + JSON.stringify(errs));
  await b.close();
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
