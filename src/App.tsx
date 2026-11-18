import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { content } from './content'
import { ContributionGrid, GRID_ROWS } from './components/ContributionGrid'
import { PixelCake } from './components/PixelCake'
import type { CakeScene } from './scene/cakeScene'

type SceneModule = typeof import('./scene/cakeScene')
type Mode = '3d' | 'css'

/** Laisse l'animation d'entrée de la grille DOM se terminer avant de passer au canvas. */
const SCENE_SWAP_DELAY = 1200

export function App() {
  const [revealed, setRevealed] = useState(false)
  const [mode, setMode] = useState<Mode>('css')
  const [sceneReady, setSceneReady] = useState(false)
  const [ghost, setGhost] = useState(false) // écran 1 qui s'efface pendant la scène 3D
  const [titleOn, setTitleOn] = useState(false)
  const [letterOn, setLetterOn] = useState(false)

  const lockRef = useRef(false)
  const reducedRef = useRef(false)
  const modRef = useRef<SceneModule | null>(null)
  const sceneRef = useRef<CakeScene | null>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)

  /** Repli : gâteau CSS, titre et lettre affichés tout de suite. */
  const fallBackToCss = useCallback(() => {
    sceneRef.current?.dispose()
    sceneRef.current = null
    setSceneReady(false)
    setMode('css')
    setGhost(false)
    setTitleOn(true)
    setLetterOn(true)
  }, [])

  const ensureScene = useCallback((): CakeScene | null => {
    if (sceneRef.current) return sceneRef.current
    const mod = modRef.current
    if (!mod || !gridRef.current || !hostRef.current) return null
    sceneRef.current = mod.createCakeScene({
      host: hostRef.current,
      grid: gridRef.current,
      rows: GRID_ROWS,
      onFail: fallBackToCss,
    })
    return sceneRef.current
  }, [fallBackToCss])

  // Three.js est chargé en différé, sans jamais bloquer le bouton.
  useEffect(() => {
    let cancelled = false
    let timer = 0
    const mountedAt = performance.now()
    import('./scene/cakeScene')
      .then((mod) => {
        if (cancelled) return
        modRef.current = mod
        const wait = Math.max(0, SCENE_SWAP_DELAY - (performance.now() - mountedAt))
        timer = window.setTimeout(() => {
          if (cancelled || lockRef.current) return
          if (ensureScene()) setSceneReady(true)
        }, wait)
      })
      .catch(() => {
        /* chargement impossible : le gâteau CSS prendra le relais */
      })
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [ensureScene])

  useEffect(() => () => sceneRef.current?.dispose(), [])

  function reveal() {
    if (lockRef.current) return // double appui
    lockRef.current = true
    reducedRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let scene: CakeScene | null = null
    try {
      scene = ensureScene() // crée la scène à la volée si Three.js est déjà chargé
    } catch {
      scene = null
    }

    if (scene) {
      setSceneReady(true)
      setMode('3d')
      setGhost(!reducedRef.current)
    } else {
      setMode('css')
      setTitleOn(true)
      setLetterOn(true)
    }
    setRevealed(true)
  }

  // Après le rendu de l'écran 2 : on remonte, on place le focus, on lance la scène.
  useLayoutEffect(() => {
    if (!revealed) return
    window.scrollTo(0, 0)
    titleRef.current?.focus({ preventScroll: true })
    if (mode !== '3d') return
    const scene = sceneRef.current
    const stage = stageRef.current
    if (!scene || !stage) return fallBackToCss()
    try {
      scene.play({
        stage,
        reduced: reducedRef.current,
        onTitle: () => setTitleOn(true),
        onLetter: () => setLetterOn(true),
        onDone: () => setGhost(false),
      })
    } catch {
      fallBackToCss()
    }
    // Ne doit tourner qu'une fois, au moment de la révélation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed])

  const { soumission, surprise, lettre } = content
  const showSubmission = !revealed || ghost

  return (
    <main>
      {showSubmission && (
        <section
          className={`screen screen--submission${revealed ? ' screen--ghost' : ''}`}
          aria-hidden={revealed || undefined}
          inert={revealed}
        >
          <p className="mention">{soumission.mention}</p>
          <h1 className="submission__title">{soumission.titre}</h1>
          <div className="card">
            <ContributionGrid ref={gridRef} hidden={sceneReady} />
          </div>
          <button type="button" className="button" onClick={reveal} disabled={revealed}>
            {soumission.bouton}
          </button>
        </section>
      )}

      {revealed && (
        <section className="screen screen--surprise" data-mode={mode}>
          <div ref={stageRef} className="cake-stage" role="img" aria-label={surprise.gateauAlt}>
            {mode === 'css' && <PixelCake />}
          </div>
          <h1
            ref={titleRef}
            tabIndex={-1}
            className={`surprise__title${titleOn ? ' is-on' : ''}`}
          >
            {surprise.titre}
          </h1>
          <article className={`letter${letterOn ? ' is-on' : ''}`}>
            <p className="letter__salutation">{lettre.salutation}</p>
            {lettre.paragraphes.map((p) => (
              <p key={p}>{p}</p>
            ))}
            <p className="letter__signature">{lettre.signature}</p>
          </article>
        </section>
      )}

      <div ref={hostRef} className="scene" aria-hidden="true" />
    </main>
  )
}
