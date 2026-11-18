/**
 * Écran 2, partie texte : titre révélé mot par mot, lettre dont l'encre
 * suit le défilement, signature écrite à la main.
 *
 * Tout le mouvement passe par Motion (ex-Framer Motion). Avec
 * prefers-reduced-motion, chaque composant rend directement l'état final.
 */
import { useEffect, useRef, useState, type Ref } from 'react'
import { m, useReducedMotion, useScroll, useTransform, type MotionValue } from 'motion/react'

const EASE_OUT = [0.16, 1, 0.3, 1] as const
const INK_DRY = '#8f95a5' // encre sèche : déjà lisible (contraste 6,4:1)
const INK_WET = '#f2f3f6' // encre fraîche

// ───────── Titre ─────────

export function RevealTitle({
  text,
  show,
  delay = 0,
  ref,
  className = 'surprise__title',
  focusable = true,
  breakAfter,
  stagger = 0.08,
}: {
  text: string
  show: boolean
  delay?: number
  ref?: Ref<HTMLHeadingElement>
  className?: string
  /** Cible du focus après la révélation. */
  focusable?: boolean
  /** Index du mot après lequel passer à la ligne (ex. après « M. Eurin, »). */
  breakAfter?: number
  stagger?: number
}) {
  const reduce = useReducedMotion()
  const words = text.split(' ')
  return (
    <h1 ref={ref} tabIndex={focusable ? -1 : undefined} className={className}>
      {words.map((word, i) => (
        <span key={i}>
          <span className="mask">
            <m.span
              className="mask__word"
              initial={reduce ? false : { y: '108%' }}
              animate={show ? { y: '0%' } : undefined}
              transition={{ duration: 0.9, ease: EASE_OUT, delay: delay + i * stagger }}
            >
              {word}
            </m.span>
          </span>
          {i === breakAfter ? <br /> : i < words.length - 1 ? ' ' : null}
        </span>
      ))}
    </h1>
  )
}

// ───────── Encre au défilement ─────────

function InkWord({
  progress,
  range,
  children,
}: {
  progress: MotionValue<number>
  range: [number, number]
  children: string
}) {
  const color = useTransform(progress, range, [INK_DRY, INK_WET])
  return <m.span style={{ color }}>{children}</m.span>
}

/** Un paragraphe dont les mots passent du gris au blanc quand il traverse
 *  la zone de lecture (entre 92 % et 70 % de la hauteur d'écran). */
function InkParagraph({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLParagraphElement>(null)
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start 0.92', 'end 0.7'] })
  const words = text.split(' ')
  const n = words.length
  return (
    <p ref={ref} className={className}>
      {words.map((word, i) => {
        const start = (i / n) * 0.85
        return (
          <span key={i}>
            <InkWord progress={scrollYProgress} range={[start, Math.min(1, start + 0.15 + 0.85 / n)]}>
              {word}
            </InkWord>
            {i < n - 1 ? ' ' : null}
          </span>
        )
      })}
    </p>
  )
}

// ───────── Signature ─────────

function Signature({ text, animate }: { text: string; animate: boolean }) {
  if (!animate) {
    return (
      <p className="signature">
        <span className="signature__text">{text}</span>
      </p>
    )
  }
  const draw = { duration: 1.5, ease: [0.55, 0, 0.25, 1] as const, delay: 0.15 }
  return (
    <m.p
      className="signature"
      initial="hidden"
      whileInView="shown"
      viewport={{ once: true, amount: 0.9 }}
    >
      <m.span
        className="signature__text"
        variants={{
          hidden: { clipPath: 'inset(-40% 100% -40% -10%)' },
          shown: { clipPath: 'inset(-40% -10% -40% -10%)', transition: draw },
        }}
      >
        {text}
      </m.span>
      {/* La pointe verte qui trace le mot, puis disparaît. */}
      <m.span
        className="signature__nib"
        aria-hidden="true"
        variants={{
          hidden: { left: '0%', opacity: 0, y: 0 },
          shown: {
            left: ['0%', '100%'],
            opacity: [0, 1, 1, 0],
            y: [6, -10, 8, -6, 10, -4, 2],
            transition: { ...draw, opacity: { ...draw, times: [0, 0.08, 0.85, 1] } },
          },
        }}
      />
    </m.p>
  )
}

// ───────── Lettre ─────────

export function Letter({
  salutation,
  paragraphs,
  signature,
  show,
  delay = 0,
}: {
  salutation: string
  paragraphs: readonly string[]
  signature: string
  show: boolean
  delay?: number
}) {
  const reduce = useReducedMotion()
  const [scrollable, setScrollable] = useState(true)

  // Si la page ne défile pas (très grand écran), l'encre ne pourrait jamais
  // sécher : on affiche alors la lettre directement en blanc.
  useEffect(() => {
    const check = () =>
      setScrollable(document.documentElement.scrollHeight - window.innerHeight > 160)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [show])

  const ink = !reduce && scrollable

  return (
    <m.article
      className={`letter${ink ? '' : ' letter--plain'}`}
      initial={reduce ? false : { opacity: 0, y: 18 }}
      animate={show ? { opacity: 1, y: 0 } : undefined}
      transition={{ duration: 0.8, ease: EASE_OUT, delay }}
    >
      <p className="letter__salutation">{salutation}</p>
      {paragraphs.map((p) => (ink ? <InkParagraph key={p} text={p} /> : <p key={p}>{p}</p>))}
      <Signature text={signature} animate={!reduce} />
    </m.article>
  )
}
