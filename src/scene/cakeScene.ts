/**
 * Scène Three.js de la révélation : les carrés de la grille deviennent
 * les cubes d'un gâteau à deux étages.
 *
 * Repère : 1 unité = 1 pixel CSS, origine en haut à gauche du document,
 * axe y vers le haut (y monde = −y document). La caméra orthographique
 * fait donc coïncider exactement les cubes vus de face avec la grille DOM.
 *
 * Ce module n'est chargé qu'en différé (import dynamique depuis App).
 */
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  Euler,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  OrthographicCamera,
  Quaternion,
  Scene,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three'

// ───────── Réglages ─────────

/** Couleurs du gâteau, couche par couche, de bas en haut (sRGB).
 *  null : la couche garde les couleurs d'origine des cases de la grille,
 *  pour qu'on reconnaisse la grille dans le gâteau. */
const LAYER_COLORS = ['#34344a', null, '#eceef2', '#34344a', '#eceef2']
const CANDLE_COLORS = ['#60dd00', '#eceef2']
const FLAME_COLOR = '#f6ffee'
const GLOW_COLOR = '#60dd00'

/** Ombrage figé par face (+x, −x, +y, −y, +z, −z). La face avant vaut 1 :
 *  vue de face, un cube a exactement la couleur de sa case DOM. */
const FACE_SHADE = [0.7, 0.6, 1.25, 0.5, 1, 0.6]

/** Vue de trois quarts finale. */
const TILT = 0.44 // rad, autour de x : on voit le dessus
const YAW = -0.62 // rad, autour de y : on voit le flanc droit

/** Taille d'un cube du gâteau = hauteur de la zone / STAGE_UNITS. */
const STAGE_UNITS = 11
/** Décalage vertical (en cubes) pour centrer gâteau + bougie dans la zone. */
const CAKE_OFFSET_Y = -3.3

/** Chronologie, en secondes. */
const T = {
  waveStep: 0.018, // décalage entre deux colonnes
  waveDur: 0.3,
  flightDelay: 0.16, // départ après le début de la vague de la colonne
  rowStep: 0.012,
  flightDur: 0.75,
  turnStart: 0.3,
  turnDur: 1.15,
  candleStart: 1.36,
  candleStep: 0.06,
  candleDur: 0.18,
  flameStart: 1.62,
  flameDur: 0.25,
  title: 1.7,
  letter: 1.95,
  end: 1.9,
}

// ───────── Utilitaires ─────────

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)
const easeOutBack = (x: number) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return x <= 0 ? 0 : 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2
}

/** Lit une couleur CSS calculée (rgb/rgba) et la compose sur un fond, en sRGB. */
function parseRgb(css: string): [number, number, number, number] {
  const n = css.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0]
  return [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0, n[3] ?? 1]
}

function composite(fg: string, bg: string): Color {
  const [r, g, b, a] = parseRgb(fg)
  const [br, bgG, bb] = parseRgb(bg)
  const mix = (f: number, k: number) => (f * a + k * (1 - a)) / 255
  return new Color().setRGB(mix(r, br), mix(g, bgG), mix(b, bb), SRGBColorSpace)
}

function glowTexture(): CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  g.addColorStop(0, 'rgba(255,255,255,0.9)')
  g.addColorStop(0.35, 'rgba(255,255,255,0.35)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 64, 64)
  const tex = new CanvasTexture(c)
  tex.colorSpace = SRGBColorSpace
  return tex
}

// ───────── API ─────────

export interface PlayOptions {
  stage: HTMLElement
  reduced: boolean
  onTitle: () => void
  onLetter: () => void
  onDone: () => void
}

export interface CakeScene {
  play(options: PlayOptions): void
  dispose(): void
}

export interface CreateOptions {
  host: HTMLElement
  grid: HTMLElement
  rows: number
  onFail: () => void
}

/** Renvoie null si WebGL est indisponible : l'appelant bascule sur le gâteau CSS. */
export function createCakeScene({ host, grid, rows, onFail }: CreateOptions): CakeScene | null {
  let renderer: WebGLRenderer
  try {
    renderer = new WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' })
    if (!renderer.getContext()) throw new Error('no context')
  } catch {
    return null
  }

  // Résolution plafonnée : 2× suffit, au-delà on paie sans rien voir.
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setClearColor(0x000000, 0)
  const canvas = renderer.domElement
  host.appendChild(canvas)

  const scene = new Scene()
  const camera = new OrthographicCamera(0, 1, 0, -1, 1, 4000)
  camera.position.z = 2000

  // Une seule géométrie, partagée par tous les cubes, la bougie et la flamme.
  const box = new BoxGeometry(1, 1, 1)
  const shade = new Float32Array(24 * 3)
  for (let face = 0; face < 6; face++)
    for (let v = 0; v < 4; v++) shade.fill(FACE_SHADE[face], (face * 4 + v) * 3, (face * 4 + v + 1) * 3)
  box.setAttribute('color', new BufferAttribute(shade, 3))
  const cubeMat = new MeshBasicMaterial({ vertexColors: true })

  const cells = Array.from(grid.children) as HTMLElement[]
  const count = cells.length
  const cubes = new InstancedMesh(box, cubeMat, count)
  cubes.instanceMatrix.setUsage(DynamicDrawUsage)
  cubes.frustumCulled = false
  scene.add(cubes)

  // Le gâteau : bougie + flamme suivent la rotation du groupe.
  const cake = new Group()
  scene.add(cake)

  const candle = new InstancedMesh(box, cubeMat, 4)
  candle.frustumCulled = false
  for (let k = 0; k < 4; k++) candle.setColorAt(k, new Color(CANDLE_COLORS[k % 2]))
  cake.add(candle)

  const flame = new Mesh(box, new MeshBasicMaterial({ color: FLAME_COLOR }))
  cake.add(flame)

  const glowTex = glowTexture()
  const glow = new Sprite(
    new SpriteMaterial({
      map: glowTex,
      color: GLOW_COLOR,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      opacity: 0,
    }),
  )
  cake.add(glow)

  // Emplacements : étage du bas 6×6×3, étage du haut 4×4×2 = 140 cubes,
  // triés de bas en haut pour que le gâteau se construise par couches.
  const slots: Vector3[] = []
  LAYER_COLORS.forEach((_, y) => {
    const n = y < 3 ? 6 : 4
    for (let x = 0; x < n; x++)
      for (let z = 0; z < n; z++) slots.push(new Vector3(x - (n - 1) / 2, y + 0.5, z - (n - 1) / 2))
  })
  const slotColor = slots.map((s) => {
    const c = LAYER_COLORS[Math.floor(s.y)]
    return c ? new Color(c) : null
  })

  // État mesuré dans le DOM.
  const restX = new Float32Array(count)
  const restY = new Float32Array(count)
  let restSize = 10
  const fromColor = cells.map(() => new Color())
  let stage: HTMLElement | null = null
  let cx = 0
  let cy = 0
  let unit = 16
  let width = 0
  let height = 0

  function measureGrid() {
    if (!grid.isConnected) return
    const r = grid.getBoundingClientRect()
    if (r.width === 0) return
    const cols = Math.ceil(count / rows)
    const gap = parseFloat(getComputedStyle(grid).columnGap) || 0
    restSize = (r.width - gap * (cols - 1)) / cols
    const left = r.left + window.scrollX
    const top = r.top + window.scrollY
    const cardBg = getComputedStyle(grid.parentElement ?? grid).backgroundColor
    cells.forEach((cell, i) => {
      const col = Math.floor(i / rows)
      const row = i % rows
      restX[i] = left + col * (restSize + gap) + restSize / 2
      restY[i] = -(top + row * (restSize + gap) + restSize / 2)
      fromColor[i].copy(composite(getComputedStyle(cell).backgroundColor, cardBg))
    })
  }

  function measureStage() {
    if (!stage) return
    const r = stage.getBoundingClientRect()
    cx = r.left + window.scrollX + r.width / 2
    cy = -(r.top + window.scrollY + r.height / 2)
    unit = r.height / STAGE_UNITS
  }

  function resize() {
    // Largeur de mise en page réelle (clientWidth ignore scrollbar-gutter).
    const w = Math.floor(document.documentElement.getBoundingClientRect().width)
    let bottom = 0
    if (grid.isConnected) bottom = Math.max(bottom, -Math.min(...restY) + restSize)
    if (stage) bottom = Math.max(bottom, -cy + (STAGE_UNITS / 2 + 2) * unit)
    const h = Math.ceil(bottom + 40)
    if (w === width && h === height) return
    width = w
    height = h
    renderer.setSize(w, h)
    camera.left = 0
    camera.right = w
    camera.top = 0
    camera.bottom = -h
    camera.updateProjectionMatrix()
  }

  // Objets temporaires réutilisés à chaque image.
  const m = new Matrix4()
  const pos = new Vector3()
  const target = new Vector3()
  const scl = new Vector3()
  const q = new Quaternion()
  const qIdentity = new Quaternion()
  const qCake = new Quaternion()
  const euler = new Euler()
  const col = new Color()

  /** Pose la scène à l'instant t (secondes). t < 0 : grille au repos. */
  function frame(t: number) {
    const turn = easeInOut(clamp01((t - T.turnStart) / T.turnDur))
    qCake.setFromEuler(euler.set(TILT * turn, YAW * turn, 0))
    cake.quaternion.copy(qCake)
    cake.position.set(cx, cy, 0)

    for (let i = 0; i < count; i++) {
      const c = Math.floor(i / rows)
      const row = i % rows
      const waveStart = c * T.waveStep
      const flightStart = waveStart + T.flightDelay + row * T.rowStep

      const w = clamp01((t - waveStart) / T.waveDur)
      const hop = Math.sin(Math.PI * w) * restSize * 0.8
      const p = clamp01((t - flightStart) / T.flightDur)
      const e = easeInOut(p)
      const arc = Math.sin(Math.PI * p)

      const slot = slots[i]
      if (slot) {
        target.set(slot.x * unit, (slot.y + CAKE_OFFSET_Y) * unit, slot.z * unit)
        target.applyQuaternion(qCake)
        target.x += cx
        target.y += cy
      } else target.set(cx, cy, 0)

      const sx = restX[i]
      const sy = restY[i]
      const dist = Math.hypot(target.x - sx, target.y - sy)
      const arcH = Math.min(70, 16 + dist * 0.18)
      pos.set(
        sx + (target.x - sx) * e + Math.sign(sx - cx) * arcH * 0.6 * arc,
        sy + (target.y - sy) * e + hop + arcH * 0.5 * arc,
        target.z * e + 80 * arc,
      )
      const size = slot ? restSize + (unit - restSize) * e : restSize * (1 - e)
      q.slerpQuaternions(qIdentity, qCake, e)
      cubes.setMatrixAt(i, m.compose(pos, q, scl.setScalar(Math.max(size, 0.0001))))
      const to = slotColor[i]
      cubes.setColorAt(i, to ? col.lerpColors(fromColor[i], to, e) : fromColor[i])
    }
    cubes.instanceMatrix.needsUpdate = true
    if (cubes.instanceColor) cubes.instanceColor.needsUpdate = true

    // Bougie : quatre petits cubes rayés qui poussent au centre.
    const cw = 0.45
    for (let k = 0; k < 4; k++) {
      const a = easeOutBack(clamp01((t - T.candleStart - k * T.candleStep) / T.candleDur))
      pos.set(0, (5 + cw * (k + 0.5) + CAKE_OFFSET_Y) * unit, 0)
      candle.setMatrixAt(k, m.compose(pos, qIdentity, scl.setScalar(Math.max(cw * unit * a, 0.0001))))
    }
    candle.instanceMatrix.needsUpdate = true

    // Flamme.
    const f = easeOutBack(clamp01((t - T.flameStart) / T.flameDur))
    const flameY = (5 + cw * 4 + 0.5 + CAKE_OFFSET_Y) * unit
    flame.position.set(0, flameY, 0)
    const fs = Math.max(unit * f, 0.0001)
    flame.scale.set(0.42 * fs, 0.62 * fs, 0.42 * fs)
    glow.position.set(0, flameY, 0)
    glow.scale.setScalar(Math.max(3.4 * unit * f, 0.0001))
    glow.material.opacity = 0.85 * clamp01(f)
  }

  const render = () => renderer.render(scene, camera)

  // ───────── Cycle de vie ─────────
  type State = 'rest' | 'playing' | 'done' | 'dead'
  let state: State = 'rest'
  let raf = 0
  let safety = 0
  let opts: PlayOptions | null = null
  const fired = { title: false, letter: false, done: false }

  function fire(t: number) {
    if (!opts) return
    if (!fired.title && t >= T.title) {
      fired.title = true
      opts.onTitle()
    }
    if (!fired.letter && t >= T.letter) {
      fired.letter = true
      opts.onLetter()
    }
    if (!fired.done && t >= T.end) {
      fired.done = true
      opts.onDone()
    }
  }

  function finish() {
    cancelAnimationFrame(raf)
    clearTimeout(safety)
    state = 'done'
    frame(Infinity)
    render()
    fire(Infinity)
  }

  function relayout() {
    if (state === 'dead') return
    if (state === 'rest') measureGrid()
    measureStage()
    resize()
    if (state === 'rest') {
      frame(-1)
      render()
    } else if (state === 'done') {
      frame(Infinity)
      render()
    }
  }

  const onResize = () => relayout()
  window.addEventListener('resize', onResize)
  const ro = new ResizeObserver(onResize)
  ro.observe(grid)

  const onLost = (e: Event) => {
    e.preventDefault()
    if (state === 'dead') return
    cancelAnimationFrame(raf)
    clearTimeout(safety)
    state = 'dead'
    onFail()
  }
  canvas.addEventListener('webglcontextlost', onLost)

  // Premier rendu : la grille au repos, vue de face.
  relayout()

  return {
    play(o) {
      if (state !== 'rest') return // double appui : ignoré
      opts = o
      stage = o.stage
      ro.observe(stage)
      measureGrid()
      measureStage()
      resize()
      if (o.reduced) {
        finish()
        return
      }
      // Première image dessinée tout de suite : le canvas devient visible dans
      // la même image que celle où la grille HTML se cache, sans trou.
      frame(0)
      render()
      state = 'playing'
      let t0 = 0
      const tick = (now: number) => {
        if (state !== 'playing') return
        if (!t0) t0 = now
        const t = (now - t0) / 1000
        if (t >= T.end) {
          finish()
          return
        }
        frame(t)
        render()
        fire(t)
        raf = requestAnimationFrame(tick)
      }
      raf = requestAnimationFrame(tick)
      // Filet de sécurité si les images sont suspendues (onglet en arrière-plan…).
      safety = window.setTimeout(() => state === 'playing' && finish(), 4000)
    },

    dispose() {
      state = 'dead'
      cancelAnimationFrame(raf)
      clearTimeout(safety)
      window.removeEventListener('resize', onResize)
      ro.disconnect()
      canvas.removeEventListener('webglcontextlost', onLost)
      box.dispose()
      cubeMat.dispose()
      flame.material.dispose()
      glow.material.dispose()
      glowTex.dispose()
      cubes.dispose()
      candle.dispose()
      renderer.dispose()
      canvas.remove()
    },
  }
}
