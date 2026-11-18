# Anniversaire M. Eurin

Microsite statique (Vite + React + TypeScript), deux écrans : une fausse soumission, puis le gâteau et la lettre.

- **Textes** : tout est dans `src/content.ts`.
- **Gâteau** : dessin en caractères dans `src/components/PixelCake.tsx`.
- **Couleurs** : jetons en haut de `src/styles.css`.

```bash
npm install
npm run dev      # développement
npm run build    # génère dist/ (site statique, chemins relatifs)
```

`dist/` se dépose tel quel sur Netlify Drop, Vercel, GitHub Pages ou tout hébergement statique.
