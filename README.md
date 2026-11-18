# Anniversaire M. Eurin

Microsite statique (Vite + React + TypeScript), deux écrans : une fausse soumission, puis le gâteau et la lettre.

- **Textes** : tout est dans `src/content.ts`.
- **Transition 3D** : `src/scene/cakeScene.ts` (Three.js, chargé en différé). Couleurs des couches, angle de vue et chronologie en tête de fichier.
- **Gâteau CSS de repli** : dessin en caractères dans `src/components/PixelCake.tsx`. Utilisé si Three.js n'est pas encore chargé au clic ou si WebGL échoue.
- **Couleurs** : jetons en haut de `src/styles.css`.

```bash
npm install
npm run dev      # développement
npm run build    # génère dist/ (site statique, chemins relatifs)
```

`dist/` se dépose tel quel sur Netlify Drop, Vercel, GitHub Pages ou tout hébergement statique.
