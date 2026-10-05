// Notification au secrétariat (transfert / alerte / demande de rappel).
// RIEN n'est écrit sur disque. Par défaut, la question du patient N'EST PAS envoyée :
// seulement le type, le motif et une référence courte affichée aussi au patient.
//   NTFY_URL              ex. https://ntfy.sh/<sujet-secret>  (appli ntfy gratuite sur le téléphone du secrétariat)
//   NOTIFY_WEBHOOK_URL    POST JSON générique (Teams, Slack, Make, n8n…)
//   NOTIFY_INCLUDE_QUESTION=1   joint le texte de la question (déconseillé sur un service public)
'use strict';
const crypto = require('crypto');

function newRef() { return crypto.randomBytes(3).toString('hex').toUpperCase(); }

function format(evt) {
  const titres = { alerte: '🚨 ALERTE patient', transfert: '❓ Question sans réponse', rappel: '📞 Rappel demandé' };
  const lignes = [`Réf. ${evt.ref}`];
  if (evt.motif) lignes.push(`Motif : ${evt.motif}`);
  if (evt.patient) lignes.push(`Patient : ${evt.patient}`);
  if (evt.telephone) lignes.push(`Rappeler au : ${evt.telephone}`);
  if (evt.question) lignes.push(`Question : ${evt.question}`);
  return { title: titres[evt.type] || 'Assistant patients', body: lignes.join('\n'), priority: evt.type === 'alerte' ? 'urgent' : 'default' };
}

async function notify(evt, env = process.env, fetchImpl = globalThis.fetch) {
  const e = { ...evt };
  if (env.NOTIFY_INCLUDE_QUESTION !== '1') delete e.question;
  const msg = format(e);
  const envois = [];
  if (env.NTFY_URL) envois.push(fetchImpl(env.NTFY_URL, {
    method: 'POST', body: msg.body,
    headers: { Title: encodeURIComponent(msg.title), Priority: msg.priority, Tags: e.type },
  }));
  if (env.NOTIFY_WEBHOOK_URL) envois.push(fetchImpl(env.NOTIFY_WEBHOOK_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: msg.title, text: `${msg.title}\n${msg.body}`, ...e }),
  }));
  if (!envois.length) { console.log(`[notif] (aucun canal configuré) ${msg.title} réf. ${e.ref}`); return { envoye: false, raison: 'non configuré' }; }
  const res = await Promise.allSettled(envois);
  const ok = res.filter(r => r.status === 'fulfilled' && r.value.ok).length;
  if (ok < res.length) console.warn(`[notif] ${res.length - ok}/${res.length} envoi(s) en échec pour réf. ${e.ref}`);
  return { envoye: ok > 0, canaux: ok };
}

module.exports = { notify, format, newRef };
