// Exporte les 200 fiches en CSV (ouvrable dans Excel) pour relecture par le chirurgien.
// Usage : node scripts/export-relecture.js  →  relecture-fiches.csv
'use strict';
const fs = require('fs');
const path = require('path');
const { loadBrain } = require('../lib/brain');
const b = loadBrain(path.join(__dirname, '..', 'data'));
const esc = s => '"' + String(s).replace(/"/g, '""') + '"';
const rows = [['ID', 'Thème', 'Question', 'Réponse', 'Validé (oui/non)', 'Correction du chirurgien'].map(esc).join(';')];
for (const d of b.docs) rows.push([d.id, d.theme, d.question, d.answer, d.validated ? 'oui' : '', ''].map(esc).join(';'));
const out = path.join(__dirname, '..', 'relecture-fiches.csv');
fs.writeFileSync(out, '﻿' + rows.join('\r\n'), 'utf8');
console.log(`${b.docs.length} fiches → ${out}`);
