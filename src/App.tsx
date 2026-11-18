import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, m, useReducedMotion } from 'motion/react'
import { content } from './content'
import { ContributionGrid, GRID_ROWS } from './components/ContributionGrid'
import { PixelCake } from './components/PixelCake'
import { MerciGrid } from './components/MerciGrid'
import { Letter, RevealTitle } from './components/Letter'
import type { CakeScene } from './scene/cakeScene'

type SceneModule = typeof import('./scene/cakeScene')
type Mode = '3d' | 'css'
type Blow = 'no' | 'blowing' | 'done'

/** On prépare la scène 3D après la séquence d'ouverture, pour ne pas la saccader. */
const SCENE_PREP_DELAY = 1600
const EASE_OUT = [0.16, 1, 0.3, 1] as const

/** Fausse relecture : une ligne toutes les REVIEW_STEP_MS, puis l'alerte et le glitch. */
const REVIEW_STEP_MS = 340
const GLITCH_MS = 420
const ALERT_HOLD_MS = 600 // le temps de lire « anniversaire » avant l'explosion

/** Repli CSS : flamme soufflée, puis la grille « MERCI » remplace le gâteau. */
const CSS_BLOW_MS = 900

const prefersReduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

/** Remonte en haut de la page et attend d'y être (ou abandonne après 1,5 s). */
function scrollToTop(instant: boolean): Promise<void> {
  if (window.scrollY < 4) return Promise.resolve()
  window.scrollTo({ top: 0, behavior: instant ? 'auto' : 'smooth' })
  return new Promise<void>((resolve) => {
    const start = performance.now()
    const check = () => {
      if (window.scrollY < 4 || performance.now() - start > 1500) resolve()
      else requestAnimationFrame(check)
    }
    requestAnimationFrame(check)
  }).then(() => new Promise<void>((r) => window.setTimeout(r, instant ? 0 : 220)))
}

export function App() {
  const [revealed, setRevealed] = useState(false)
  const [mode, setMode] = useState<Mode>('css')
  const [ghost, setGhost] = useState(false) // écran 1 qui s'efface pendant la scène 3D
  const [titleOn, setTitleOn] = useState(false)
  const [letterOn, setLetterOn] = useState(false)
  const [review, setReview] = useState(-1) // ligne de relecture affichée, −1 : au repos
  const [glitch, setGlitch] = useState(false)
  const [blown, setBlown] = useState<Blow>('no')
  const reduce = useReducedMotion()

  const lockRef = useRef(false)
  const reviewRef = useRef(false)
  const blownRef = useRef(false)
  const reducedRef = useRef(false)
  const modRef = useRef<SceneModule | null>(null)
  const sceneRef = useRef<CakeScene | null>(null)
  const sceneFailedRef = useRef(false) // WebGL indisponible : on ne réessaie pas
  const timers = useRef<number[]>([])
  const gridRef = useRef<HTMLDivElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)

  const later = (ms: number, fn: () => void) => {
    timers.current.push(window.setTimeout(fn, ms))
  }
  useEffect(() => () => timers.current.forEach(clearTimeout), [])

  /** Repli : gâteau CSS, titre et lettre affichés tout de suite. */
  const fallBackToCss = useCallback(() => {
    sceneRef.current?.dispose()
    sceneRef.current = null
    setMode('css')
    setGhost(false)
    setTitleOn(true)
    setLetterOn(true)
    if (blownRef.current) setBlown('done') // la scène est morte pendant le souffle
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

  /** Clic sur « Relire la mission » : fausse relecture, alerte, puis la surprise. */
  function startReview() {
    if (reviewRef.current || lockRef.current) return // double appui
    reviewRef.current = true
    navigator.vibrate?.(12) // petit retour haptique (Android)
    if (prefersReduced()) return reveal()

    const steps = content.soumission.relecture.length
    setReview(0)
    for (let k = 1; k < steps; k++) later(k * REVIEW_STEP_MS, () => setReview(k))
    const alertAt = (steps - 1) * REVIEW_STEP_MS
    later(alertAt, () => {
      setGlitch(true)
      navigator.vibrate?.([10, 50, 10])
    })
    later(alertAt + GLITCH_MS, () => setGlitch(false))
    later(alertAt + ALERT_HOLD_MS, reveal)
  }

  function reveal() {
    if (lockRef.current) return
    lockRef.current = true
    reducedRef.current = prefersReduced()

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

  /** Souffler la bougie : on remonte au gâteau, la flamme s'éteint, la grille écrit « MERCI ». */
  const blow = useCallback(async () => {
    if (blownRef.current) return
    blownRef.current = true
    setBlown('blowing')
    const reduced = prefersReduced()
    await scrollToTop(reduced)
    navigator.vibrate?.(10)
    const done = () => setBlown('done')
    const scene = sceneRef.current
    if (scene) {
      try {
        scene.blow({ reduced, onDone: done })
      } catch {
        fallBackToCss()
      }
    } else later(reduced ? 0 : CSS_BLOW_MS, done)
  }, [fallBackToCss])

  // La scène reçoit ses rappels une fois pour toutes : on passe par une ref.
  const blowRef = useRef(blow)
  blowRef.current = blow

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
        onTap: () => void blowRef.current(),
      })
    } catch {
      fallBackToCss()
    }
    // Ne doit tourner qu'une fois, au moment de la révélation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revealed])

  const { soumission, surprise, lettre, bougie } = content
  const showSubmission = !revealed || ghost
  // « HashCode / Soumission de Nelkaël » : l'organisation, puis le document.
  const slash = soumission.mention.indexOf(' / ')
  const mentionOrg = slash > 0 ? soumission.mention.slice(0, slash) : soumission.mention
  const mentionRest = slash > 0 ? soumission.mention.slice(slash) : ''
  const reviewing = review >= 0
  const alert = review === soumission.relecture.length - 1

  return (
    <main>
      {showSubmission && (
        <section
          className={`screen screen--submission${revealed ? ' screen--ghost' : ''}${glitch ? ' screen--glitch' : ''}`}
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
            interactive={!revealed && !reviewing}
            scan={reviewing}
          />
          <m.button
            type="button"
            className={`button${reviewing ? ' button--review' : ''}${alert ? ' button--alert' : ''}`}
            onClick={startReview}
            disabled={revealed || reviewing}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: EASE_OUT, delay: 0.55 }}
            whileTap={reviewing ? undefined : { scale: 0.97 }}
          >
            {reviewing && (
              <span
                className="review__bar"
                style={{ ['--p' as string]: (review + 1) / soumission.relecture.length }}
              />
            )}
            <AnimatePresence initial={false}>
              <m.span
                key={review}
                className={reviewing ? 'review__line' : 'button__label'}
                initial={{ y: '120%', opacity: 0 }}
                animate={{ y: '0%', opacity: 1 }}
                exit={{ y: '-120%', opacity: 0 }}
                transition={{ duration: 0.26, ease: EASE_OUT }}
              >
                {reviewing ? (
                  <>
                    <span className="review__label">{soumission.relecture[review].label}</span>
                    <span className="review__leader" aria-hidden="true" />
                    <span className="review__value">
                      {soumission.relecture[review].valeur}
                      {alert ? '' : ' ✓'}
                    </span>
                  </>
                ) : (
                  soumission.bouton
                )}
              </m.span>
            </AnimatePresence>
          </m.button>
          <span className="sr-only" role="status">
            {reviewing ? `${soumission.relecture[review].label} : ${soumission.relecture[review].valeur}` : ''}
          </span>
        </section>
      )}

      {revealed && (
        <section className="screen screen--surprise" data-mode={mode} data-blown={blown}>
          <div
            ref={stageRef}
            className="cake-stage"
            role="img"
            aria-label={blown === 'done' ? bougie.merciAlt : surprise.gateauAlt}
            onClick={mode === 'css' && blown === 'no' ? () => void blow() : undefined}
          >
            {mode === 'css' && (blown === 'done' ? <MerciGrid /> : <PixelCake blown={blown === 'blowing'} />)}
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
          {letterOn && (
            <m.div
              className="finale"
              initial={reduce ? false : { opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.8 }}
              // Après la signature, qui se trace en 1,65 s.
              transition={{ duration: 0.7, ease: EASE_OUT, delay: reduce ? 0 : 1.8 }}
            >
              {blown === 'no' && <p className="finale__invite">{bougie.invite}</p>}
              <button
                type="button"
                className="button button--wish"
                onClick={() => void blow()}
                disabled={blown !== 'no'}
              >
                <span className="button__label">{blown === 'no' ? bougie.bouton : bougie.fait}</span>
              </button>
            </m.div>
          )}
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
