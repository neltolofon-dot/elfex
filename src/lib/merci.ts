/**
 * « MERCI » dessiné sur la grille de contributions (20 colonnes × 7 lignes).
 * X = case allumée. Une ligne = une rangée de la grille, de haut en bas.
 * Utilisé par la scène 3D (le gâteau redevient grille) et par le repli CSS.
 */
export const MERCI_ART = [
  '....................',
  'X...X.XXX.XXX...XX.X',
  'XX.XX.X...X..X.X...X',
  'X.X.X.XX..XXX..X...X',
  'X...X.X...X.X..X...X',
  'X...X.XXX.X..X..XX.X',
  '....................',
] as const

export const MERCI_ROWS: number = MERCI_ART.length
export const MERCI_COLS: number = MERCI_ART[0].length

/** Case i de la grille (ordre colonne par colonne, comme la grille DOM). */
export function isMerciCell(i: number, rows = MERCI_ROWS): boolean {
  const col = Math.floor(i / rows)
  const row = i % rows
  return MERCI_ART[row]?.[col] === 'X'
}
