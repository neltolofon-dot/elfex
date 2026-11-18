/**
 * Gâteau en pixels, 100 % HTML/CSS : chaque caractère du dessin devient
 * une case d'une grille CSS. Pour retoucher le gâteau, modifie le dessin.
 *
 *   .  vide            F  cœur de la flamme   f  halo de la flamme
 *   C  bougie          c  rayure de bougie    W  mèche
 *   I  glaçage         i  ombre du glaçage    S  génoise
 *   s  génoise (ombre) J  crème               P  assiette
 */
const DRAWING = [
  '.........ff.........',
  '........fFFf........',
  '........fFFf........',
  '.........ff.........',
  '.........WW.........',
  '.........cC.........',
  '.........Cc.........',
  '.........cC.........',
  '.........Cc.........',
  '...IIIIIIIIIIIIII...',
  '..IIIIIIIIIIIIIIII..',
  '..IiIIIiIIIIiIIIiI..',
  '..SiSSSiSSSSiSSSiS..',
  '..SSSSSiSSSSSSSSSS..',
  '..SSSSSSSSSSSSSSSS..',
  '..JJJJJJJJJJJJJJJJ..',
  '..SSSSSSSSSSSSSSSS..',
  '..ssssssssssssssss..',
  'PPPPPPPPPPPPPPPPPPPP',
  '.PPPPPPPPPPPPPPPPPP.',
]

const CLASS: Record<string, string> = {
  F: 'flame-core',
  f: 'flame',
  W: 'wick',
  C: 'candle',
  c: 'candle-stripe',
  I: 'icing',
  i: 'icing-shade',
  S: 'sponge',
  s: 'sponge-shade',
  J: 'cream',
  P: 'plate',
}

const COLS = DRAWING[0].length
const ROWS = DRAWING.length

/** Version CSS du gâteau : repli si Three.js n'est pas prêt ou si WebGL échoue.
 *  Purement décorative : la zone parente porte la description accessible. */
export function PixelCake({ blown = false }: { blown?: boolean }) {
  return (
    <div
      className={`cake${blown ? ' cake--blown' : ''}`}
      aria-hidden="true"
      style={{ ['--cols' as string]: COLS, ['--rows' as string]: ROWS }}
    >
      {DRAWING.flatMap((line, row) =>
        [...line].map((ch, col) =>
          ch === '.' ? (
            <span key={`${row}-${col}`} />
          ) : (
            <span
              key={`${row}-${col}`}
              className={`px px--${CLASS[ch]}`}
              // Le gâteau se construit de bas en haut.
              style={{ ['--step' as string]: ROWS - 1 - row }}
            />
          ),
        ),
      )}
    </div>
  )
}
