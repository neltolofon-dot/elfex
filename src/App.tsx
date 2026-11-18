import { useEffect, useRef, useState } from 'react'
import { content } from './content'
import { ContributionGrid } from './components/ContributionGrid'
import { PixelCake } from './components/PixelCake'

export function App() {
  const [revealed, setRevealed] = useState(false)
  const titleRef = useRef<HTMLHeadingElement>(null)

  // À la révélation : retour en haut et focus sur le titre
  // (clavier et lecteurs d'écran repartent du bon endroit).
  useEffect(() => {
    if (!revealed) return
    window.scrollTo(0, 0)
    titleRef.current?.focus({ preventScroll: true })
  }, [revealed])

  const { soumission, surprise, lettre } = content

  if (!revealed) {
    return (
      <main className="screen screen--submission">
        <p className="mention">{soumission.mention}</p>
        <h1 className="submission__title">{soumission.titre}</h1>
        <div className="card">
          <ContributionGrid />
        </div>
        <button type="button" className="button" onClick={() => setRevealed(true)}>
          {soumission.bouton}
        </button>
      </main>
    )
  }

  return (
    <main className="screen screen--surprise">
      <PixelCake label={surprise.gateauAlt} />
      <h1 ref={titleRef} tabIndex={-1} className="surprise__title">
        {surprise.titre}
      </h1>
      <article className="letter">
        <p className="letter__salutation">{lettre.salutation}</p>
        {lettre.paragraphes.map((p) => (
          <p key={p}>{p}</p>
        ))}
        <p className="letter__signature">{lettre.signature}</p>
      </article>
    </main>
  )
}
