import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { LazyMotion, MotionConfig, domAnimation } from 'motion/react'
import '@fontsource-variable/newsreader/opsz.css'
import '@fontsource/mrs-saint-delafield/latin-400.css'
import { App } from './App'
import './styles.css'

// Les polices de la lettre ne servent qu'à l'écran 2 : on les charge dès
// maintenant pour qu'elles soient prêtes au moment de la révélation.
document.fonts?.load('400 1em "Newsreader Variable"').catch(() => {})
document.fonts?.load('400 1em "Mrs Saint Delafield"', 'Nelkaël').catch(() => {})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domAnimation} strict>
        <App />
      </LazyMotion>
    </MotionConfig>
  </StrictMode>,
)
