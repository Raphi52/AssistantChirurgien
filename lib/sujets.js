// Compteur ANONYME des sujets non couverts : chaque mot significatif (normalisé, >= 4 lettres) est compté à part.
// Ni la phrase, ni l'ordre des mots, ni la date ne sont gardés. On ne montre (écran admin, export de relecture)
// que les mots vus au moins 3 fois : un mot isolé pourrait désigner un patient.
// Sorti de server.js le 2026-10-06 pour que l'export de relecture applique exactement la même règle.
'use strict';
const fs = require('fs');
const path = require('path');
const { tokens } = require('./brain');

const sujetsFile = () => process.env.SUJETS_FILE || path.join(__dirname, '..', 'admin-data', 'sujets.json');

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

module.exports = { compterSujet, sujetsNonCouverts };
