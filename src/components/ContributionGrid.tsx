import { useEffect, useRef, type PointerEvent, type Ref } from 'react'

/**
 * Grille décorative façon « calendrier de contributions », vivante :
 * sous le doigt (ou la souris) les carrés s'allument en onde, et chaque
 * carré touché gagne un niveau de vert. Au clic sur « Relire la mission »,
 * la scène 3D relit ces couleurs : ce qu'il a dessiné finit dans le gâteau.
 *
 * Aucune donnée réelle : un générateur pseudo-aléatoire à graine fixe
 * produit toujours le même motif de départ, plus dense vers la droite.
 */

export const GRID_ROWS = 7
const ROWS = GRID_ROWS
const COLS = 20
const SEED = 0x2e0121
const MAX_LEVEL = 4

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

/** Durée de l'animation d'entrée (doit couvrir --col × délai + durée en CSS). */
const INTRO_MS = 1300

export function ContributionGrid({
  ref,
  hidden,
  interactive = true,
  intro = true,
}: {
  ref?: Ref<HTMLDivElement>
  hidden?: boolean
  interactive?: boolean
  /** Onde de démonstration une fois l'entrée terminée. */
  intro?: boolean
}) {
  const gridRef = useRef<HTMLDivElement | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const levels = useRef<number[]>([...LEVELS])
  const lastCell = useRef(-1)
  const interactiveRef = useRef(interactive)
  interactiveRef.current = interactive

  const setGridRef = (el: HTMLDivElement | null) => {
    gridRef.current = el
    if (typeof ref === 'function') ref(el)
    else if (ref) ref.current = el
  }

  const cells = () => (gridRef.current ? (Array.from(gridRef.current.children) as HTMLElement[]) : [])

  /** Allume une onde de lumière autour de (col, row). */
  const ping = (col: number, row: number, radius: number, step: number) => {
    const list = cells().filter((_, i) => Math.hypot(Math.floor(i / ROWS) - col, (i % ROWS) - row) <= radius)
    list.forEach((el) => el.classList.remove('is-ping'))
    void gridRef.current?.offsetWidth // relance l'animation CSS
    list.forEach((el) => {
      const i = Array.prototype.indexOf.call(gridRef.current!.children, el)
      const d = Math.hypot(Math.floor(i / ROWS) - col, (i % ROWS) - row)
      el.style.setProperty('--d', `${Math.round(d * step)}ms`)
      el.classList.add('is-ping')
    })
  }

  /** Le carré touché gagne un niveau de vert (persistant). */
  const commit = (i: number) => {
    const el = cells()[i]
    if (!el) return
    if (levels.current[i] < MAX_LEVEL) {
      levels.current[i]++
      el.dataset.level = String(levels.current[i])
    }
    el.classList.add('is-commit')
    window.setTimeout(() => el.classList.remove('is-commit'), 140)
  }

  const cellAt = (e: PointerEvent<HTMLDivElement>) => {
    const grid = gridRef.current
    if (!grid) return null
    const r = grid.getBoundingClientRect()
    const gap = parseFloat(getComputedStyle(grid).columnGap) || 0
    const col = Math.floor(((e.clientX - r.left) / (r.width + gap)) * COLS)
    const row = Math.floor(((e.clientY - r.top) / (r.height + gap)) * ROWS)
    if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null
    return { col, row, i: col * ROWS + row }
  }

  const moveGlow = (e: PointerEvent<HTMLDivElement>) => {
    const wrap = wrapRef.current
    if (!wrap) return
    const r = wrap.getBoundingClientRect()
    wrap.style.setProperty('--gx', `${e.clientX - r.left}px`)
    wrap.style.setProperty('--gy', `${e.clientY - r.top}px`)
    wrap.classList.add('is-touched')
  }

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (!interactiveRef.current) return
    moveGlow(e)
    const c = cellAt(e)
    if (!c) return
    try {
      e.currentTarget.setPointerCapture(e.pointerId) // le tracé continue hors de la grille
    } catch {
      /* pointeur déjà relâché : sans importance */
    }
    lastCell.current = c.i
    commit(c.i)
    ping(c.col, c.row, 3.2, 45)
  }

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!interactiveRef.current) return
    moveGlow(e)
    const c = cellAt(e)
    if (!c || c.i === lastCell.current) return
    lastCell.current = c.i
    const pressed = e.buttons > 0 || e.pointerType === 'touch'
    if (pressed) {
      commit(c.i)
      ping(c.col, c.row, 2, 40)
    } else {
      ping(c.col, c.row, 1.5, 40) // survol à la souris : lumière seulement
    }
  }

  const onPointerLeave = () => {
    lastCell.current = -1
    wrapRef.current?.classList.remove('is-touched')
  }

  // Fin de l'entrée : on fige les carrés, puis une onde traverse la grille une fois.
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const settle = window.setTimeout(() => gridRef.current?.classList.add('grid--settled'), reduce ? 0 : INTRO_MS)
    const wave =
      intro && !reduce
        ? window.setTimeout(() => interactiveRef.current && ping(14, 3, 30, 34), INTRO_MS + 150)
        : 0
    return () => {
      clearTimeout(settle)
      clearTimeout(wave)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div
      ref={wrapRef}
      className="grid-wrap"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onPointerCancel={onPointerLeave}
    >
      <div ref={setGridRef} className={`grid${hidden ? ' grid--hidden' : ''}`} aria-hidden="true">
        {LEVELS.map((level, i) => (
          <span
            key={i}
            className="grid__cell"
            data-level={level}
            style={{ ['--col' as string]: Math.floor(i / ROWS) }}
          />
        ))}
      </div>
    </div>
  )
}
