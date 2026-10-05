// Lance le serveur + un tunnel https Cloudflare (gratuit, sans compte) pour le téléphone.
// La voix (micro) n'est autorisée par les navigateurs mobiles qu'en https.
// Usage : node scripts/public.js   (ou demarrer-public.cmd)
// L'adresse est PUBLIQUE : un code d'accès aléatoire est généré si ACCESS_CODE n'est pas défini.
'use strict';
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const exe = [path.join(root, 'bin', 'cloudflared.exe'), path.join(root, 'bin', 'cloudflared')].find(f => fs.existsSync(f)) || 'cloudflared';
const PORT = process.env.PORT || '8787';
const ACCESS_CODE = process.env.ACCESS_CODE && process.env.ACCESS_CODE !== 'demo'
  ? process.env.ACCESS_CODE
  : crypto.randomInt(100000, 999999).toString();

const server = spawn(process.execPath, [path.join(root, 'server.js')], { env: { ...process.env, PORT, ACCESS_CODE }, stdio: 'inherit' });
const tunnel = spawn(exe, ['tunnel', '--no-autoupdate', '--url', `http://localhost:${PORT}`], { stdio: ['ignore', 'pipe', 'pipe'] });

// Adresse FIXE : https://assistant-chirurgien.pages.dev relaie vers ce tunnel (relais-cloudflare/).
const RELAIS = 'https://assistant-chirurgien.pages.dev';
const TOKEN_FILE = path.join(root, 'admin-data', 'relais-token.txt');
async function annoncerAuRelais(cible) {
  if (!fs.existsSync(TOKEN_FILE)) return console.log('[relais] pas de jeton, adresse fixe non mise à jour');
  // Le tunnel met quelques secondes à répondre : on réessaie jusqu'à ce que le relais accepte.
  for (let i = 0; i < 10; i++) {
    try {
      const r = await fetch(RELAIS + '/__relais', { method: 'POST', headers: { 'content-type': 'application/json', 'x-relais-token': fs.readFileSync(TOKEN_FILE, 'utf8').trim() }, body: JSON.stringify({ cible }) });
      if (r.ok) return console.log(' Adresse FIXE           : ' + RELAIS + '  (QR code : qr-assistant.svg)');
      console.log('[relais] refus ' + r.status);
      return;
    } catch { await new Promise(r => setTimeout(r, 3000)); }
  }
  console.log('[relais] injoignable, utilise l adresse ci-dessus');
}
let shown = false;
const watch = d => {
  const m = String(d).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (m && !shown) {
    shown = true;
    annoncerAuRelais(m[0]);
    console.log('\n==============================================');
    console.log(' Ouvre sur le téléphone : ' + m[0]);
    console.log(' Code d\'accès           : ' + ACCESS_CODE);
    console.log(' (puis « Ajouter à l\'écran d\'accueil »)');
    console.log('==============================================\n');
  }
};
tunnel.stdout.on('data', watch);
tunnel.stderr.on('data', watch);
tunnel.on('exit', c => { console.error(`[tunnel] arrêté (code ${c})`); server.kill(); process.exit(c || 1); });
server.on('exit', c => { console.error(`[serveur] arrêté (code ${c})`); tunnel.kill(); process.exit(c || 1); });
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { tunnel.kill(); server.kill(); process.exit(0); });
