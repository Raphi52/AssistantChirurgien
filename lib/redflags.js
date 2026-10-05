// Tri des urgences : RÈGLES FIXES, exécutées AVANT l'IA. Jamais laissé au modèle.
'use strict';
const URGENCE = "⚠️ Ce que vous décrivez peut être un signe de complication et ne doit pas attendre. Appelez le 15 (SAMU) ou rendez-vous aux urgences maintenant, en précisant si vous avez été opéré(e) récemment et de quoi. Prévenez ensuite le service.";

const RULES = [
  { motif: 'fièvre', re: /fi[eè]vre|temp[ée]rature [àa] 3[89]|\b(3[89]|40)([.,]\d)? ?(°|degr)|frissons/ },
  { motif: 'douleur thoracique / épaule', re: /douleur.{0,30}(poitrine|thorax|thoracique|[ée]paule)|(poitrine|[ée]paule).{0,30}(douleur|mal)|oppression/ },
  { motif: 'essoufflement', re: /essouffl|respir.{0,15}(mal|difficil)|du mal [àa] respirer|souffle court|[ée]touff/ },
  { motif: 'cœur rapide', re: /c(oe|œ)ur.{0,15}(vite|rapide|bat fort|s.emballe)|tachycard|palpitation/ },
  { motif: 'vomissements persistants', re: /vomi.{0,30}(tout|sans arr[eê]t|plusieurs|depuis|continu|chaque)|(ne|n.)\s?(peux|arrive)\s?(plus|pas).{0,20}(boire|avaler)|rien ne passe|ne garde rien/ },
  { motif: 'sang', re: /(?<!prise de |bilan de )\bsang\b|saign|h[ée]morrag|selles noires|vomi.{0,10}noir|caillot/ },
  { motif: 'douleur abdominale forte', re: /(douleur|mal).{0,25}(ventre|abdomen|estomac).{0,25}(fort|intense|insupportable|violent|aigu)|(fort|intense|insupportable|violent).{0,20}(douleur|mal) au ventre/ },
  { motif: 'malaise', re: /malaise|perte de connaissance|[ée]vanoui|syncope|confus/ },
  { motif: 'mollet / phlébite', re: /mollet.{0,25}(gonfl|douleur|rouge|chaud|dur)|phl[ée]bite|embolie/ },
  { motif: 'cicatrice infectée', re: /(cicatrice|plaie).{0,30}(pus|coule|rouge|chaud|ouvert|odeur)/ },
  { motif: 'hernie étranglée', re: /hernie.{0,40}(ne rentre plus|dure|bloqu|coinc|[ée]trangl)|(boule|bosse).{0,30}(ne rentre plus|devenue dure)/ },
  { motif: 'occlusion', re: /(plus de|pas de|aucun).{0,10}gaz.{0,40}(vomi|gonfl)|(vomi|gonfl).{0,40}(plus de|pas de|aucun).{0,10}gaz/ },
  { motif: 'jaunisse', re: /(peau|yeux).{0,20}jaune|jaunisse|ict[eè]re/ },
  { motif: 'stomie en souffrance', re: /stomie.{0,30}(noire|violette|ne produit plus|plus rien)/ },
  { motif: 'détresse psychologique', re: /suicid|en finir|me tuer|plus envie de vivre|me faire du mal/ },
];

function checkRedFlags(q) {
  const s = q.toLowerCase();
  for (const r of RULES) if (r.re.test(s)) {
    const message = r.motif === 'détresse psychologique'
      ? "Vous n'êtes pas seul(e). Appelez maintenant le 3114 (prévention du suicide, 24h/24, gratuit) ou le 15 en cas de danger immédiat. Le service sera prévenu."
      : URGENCE;
    return { motif: r.motif, message };
  }
  return null;
}
module.exports = { checkRedFlags, RULES };
