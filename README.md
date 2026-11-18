# Anniversaire M. Eurin

Microsite statique (Vite + React + TypeScript), deux écrans : une fausse soumission, puis le gâteau et la lettre.

- **Textes** : tout est dans `src/content.ts`.
- **Transition 3D** : `src/scene/cakeScene.ts` (Three.js, chargé en différé). Couleurs des couches, angle de vue et chronologie en tête de fichier.
- **Fausse relecture** : au clic, le bouton devient une ligne de terminal (`lint`, `tests`, `revue`, puis l'alerte « 1 anomalie : anniversaire » et un glitch de l'écran). Lignes dans `src/content.ts`, rythme en tête de `src/App.tsx`.
- **Révélation 3D** : cubes qui s'écrasent à l'atterrissage, secousse de caméra, onde de lumière et confettis à l'allumage. Ensuite le gâteau flotte et se fait tourner du doigt.
- **Final** : sous la signature, « Souffler la bougie » (ou toucher le gâteau). La page remonte, la flamme s'éteint en fumée, les cubes reforment la grille, qui écrit « MERCI » (`src/lib/merci.ts`).
- **Gâteau CSS de repli** : dessin en caractères dans `src/components/PixelCake.tsx`. Utilisé si Three.js n'est pas encore chargé au clic ou si WebGL échoue.
- **Lettre animée** : `src/components/Letter.tsx` (Motion) — titre révélé mot par mot, encre qui suit le défilement, signature manuscrite tracée par une pointe verte. Tout s'affiche directement avec « réduire les animations ».
- **Polices** : Newsreader (titre + lettre) et Mrs Saint Delafield (signature), auto-hébergées via Fontsource.
- **Couleurs** : jetons en haut de `src/styles.css`.

```bash
npm install
npm run dev      # développement
npm run build    # génère dist/ (site statique, chemins relatifs)
```

`dist/` se dépose tel quel sur Netlify Drop, Vercel, GitHub Pages ou tout hébergement statique.

## Aperçu de partage (WhatsApp)

Défini dans `index.html` (`og:*`) : « Une mission pour M. Eurin » + image `public/og-grid.png` (la grille seule).
Rien dans ce fichier ne doit trahir la surprise : il est lu tel quel par l'aperçu et visible dans le code source.
L'URL de l'image doit être absolue : à mettre à jour si le domaine change.

## Déploiement

Projet Vercel `mission-pour-eurin`, relié à ce dépôt : chaque push sur `main` redéploie la production
(https://mission-pour-eurin.vercel.app).
