import type { Ref } from 'react'

/**
 * Grille décorative façon « calendrier de contributions ».
 * Aucune donnée réelle : un générateur pseudo-aléatoire à graine fixe
 * produit toujours le même motif, un peu plus dense vers la droite.
 */

export const GRID_ROWS = 7
const ROWS = GRID_ROWS
const COLS = 20
const SEED = 0x2e0121

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function buildLevels(): number[] {
  const rand = mulberry32(SEED)
  const levels: number[] = []
  for (let col = 0; col < COLS; col++) {
    const trend = col / (COLS - 1) // 0 → 1 de gauche à droite
    for (let row = 0; row < ROWS; row++) {
      const r = rand() * 0.75 + trend * 0.3
      levels.push(r < 0.3 ? 0 : r < 0.55 ? 1 : r < 0.75 ? 2 : r < 0.9 ? 3 : 4)
    }
  }
  return levels
}

const LEVELS = buildLevels()

export function ContributionGrid({ ref, hidden }: { ref?: Ref<HTMLDivElement>; hidden?: boolean }) {
  return (
    <div ref={ref} className={`grid${hidden ? ' grid--hidden' : ''}`} aria-hidden="true">
      {LEVELS.map((level, i) => (
        <span
          key={i}
          className={`grid__cell grid__cell--l${level}`}
          style={{ ['--col' as string]: Math.floor(i / ROWS) }}
        />
      ))}
    </div>
  )
}
