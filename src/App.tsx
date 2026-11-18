import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { m } from 'motion/react'
import { content } from './content'
import { ContributionGrid, GRID_ROWS } from './components/ContributionGrid'
import { PixelCake } from './components/PixelCake'
import { Letter, RevealTitle } from './components/Letter'
import type { CakeScene } from './scene/cakeScene'

type SceneModule = typeof import('./scene/cakeScene')
type Mode = '3d' | 'css'

/** On prépare la scène 3D après la séquence d'ouverture, pour ne pas la saccader. */
const SCENE_PREP_DELAY = 1600
const EASE_OUT = [0.16, 1, 0.3, 1] as const

export function App() {
  const [revealed, setRevealed] = useState(false)
  const [mode, setMode] = useState<Mode>('css')
  const [ghost, setGhost] = useState(false) // écran 1 qui s'efface pendant la scène 3D
  const [titleOn, setTitleOn] = useState(false)
  const [letterOn, setLetterOn] = useState(false)

  const lockRef = useRef(false)
  const reducedRef = useRef(false)
  const modRef = useRef<SceneModule | null>(null)
  const sceneRef = useRef<CakeScene | null>(null)
  const sceneFailedRef = useRef(false) // WebGL indisponible : on ne réessaie pas
  const gridRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)

  /** Repli : gâteau CSS, titre et lettre affichés tout de suite. */
  const fallBackToCss = useCallback(() => {
    sceneRef.current?.dispose()
    sceneRef.current = null
    setMode('css')
    setGhost(false)
    setTitleOn(true)
    setLetterOn(true)
  }, [])

  const ensureScene = useCallback((): CakeScene | null => {
    if (sceneRef.current) return sceneRef.current
    if (sceneFailedRef.current) return null
    const mod = modRef.current
    if (!mod || !gridRef.current || !hostRef.current) return null
    sceneRef.current = mod.createCakeScene({
      host: hostRef.current,
      grid: gridRef.current,
      rows: GRID_ROWS,
      onFail: fallBackToCss,
    })
    if (!sceneRef.current) sceneFailedRef.current = true
    else hostRef.current.dataset.ready = 'true'
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
        const wait = Math.max(0, SCENE_PREP_DELAY - (performance.now() - mountedAt))
        timer = window.setTimeout(() => {
          if (cancelled || lockRef.current) return
          ensureScene()
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
    navigator.vibrate?.(12) // petit retour haptique (Android)
    reducedRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    let scene: CakeScene | null = null
    try {
      scene = ensureScene() // crée la scène à la volée si Three.js est déjà chargé
    } catch {
      scene = null
    }

    if (scene) {
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
  // « HashCode / Soumission de Nelkaël » : l'organisation, puis le document.
  const slash = soumission.mention.indexOf(' / ')
  const mentionOrg = slash > 0 ? soumission.mention.slice(0, slash) : soumission.mention
  const mentionRest = slash > 0 ? soumission.mention.slice(slash) : ''

  return (
    <main>
      {showSubmission && (
        <section
          className={`screen screen--submission${revealed ? ' screen--ghost' : ''}`}
          aria-hidden={revealed || undefined}
          inert={revealed}
        >
          <m.p
            className="mention"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE_OUT }}
          >
            <span className="mention__org">{mentionOrg}</span>
            {mentionRest}
          </m.p>
          <RevealTitle
            className="submission__title"
            text={soumission.titre}
            show
            delay={0.12}
            stagger={0.05}
            focusable={false}
            breakAfter={0}
          />
          <ContributionGrid
            ref={gridRef}
            hidden={revealed && mode === '3d'}
            interactive={!revealed}
          />
          <m.button
            type="button"
            className="button"
            onClick={reveal}
            disabled={revealed}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE_OUT, delay: 0.55 }}
            whileTap={{ scale: 0.97 }}
          >
            <span className="button__label">{soumission.bouton}</span>
          </m.button>
        </section>
      )}

      {revealed && (
        <section className="screen screen--surprise" data-mode={mode}>
          <div ref={stageRef} className="cake-stage" role="img" aria-label={surprise.gateauAlt}>
            {mode === 'css' && <PixelCake />}
          </div>
          {/* En mode CSS, on laisse le gâteau se construire avant le titre. */}
          <RevealTitle
            ref={titleRef}
            text={surprise.titre}
            show={titleOn}
            delay={mode === 'css' ? 0.8 : 0}
          />
          <Letter
            salutation={lettre.salutation}
            paragraphs={lettre.paragraphes}
            signature={lettre.signature}
            show={letterOn}
            delay={mode === 'css' ? 1.2 : 0.15}
          />
        </section>
      )}

      {/* Le canvas n'apparaît qu'au clic : au repos, la grille HTML reste touchable. */}
      <div
        ref={hostRef}
        className={`scene${revealed && mode === '3d' ? ' scene--live' : ''}`}
        aria-hidden="true"
      />
    </main>
  )
}
