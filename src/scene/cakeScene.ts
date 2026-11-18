/**
 * Scène Three.js de la révélation : les carrés de la grille deviennent
 * les cubes d'un gâteau à deux étages. Quand on souffle la bougie, le
 * gâteau se défait et les cubes reforment la grille, qui écrit « MERCI ».
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
import { isMerciCell } from '../lib/merci'
import { mulberry32 } from '../lib/random'

// ───────── Réglages ─────────

/** Couleurs du gâteau, couche par couche, de bas en haut (sRGB).
 *  null : la couche garde les couleurs d'origine des cases de la grille,
 *  pour qu'on reconnaisse la grille dans le gâteau. */
const LAYER_COLORS = ['#34344a', null, '#eceef2', '#34344a', '#eceef2']
const CANDLE_COLORS = ['#60dd00', '#eceef2']
const FLAME_COLOR = '#f6ffee'
const GLOW_COLOR = '#60dd00'
const FLASH_COLOR = '#c4ff8f'
const CONFETTI_COLORS = ['#60dd00', '#469e05', '#9cf25c', '#c4ff8f', '#eceef2', '#316908']
const SMOKE_COLORS = ['#8f95a5', '#6c7180', '#b3b8c4']

/** Grille finale « MERCI ». */
const CELL_OFF = '#17171f' // même couleur qu'une case vide de la grille DOM
const CELL_ON = '#60dd00'
const CELL_FLASH = '#e9ffd6'
const CELL_GLINT = '#c4ff8f'

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

const N_CONFETTI = 72
const N_SMOKE = 14
/** Gravité des confettis, en cubes par seconde². */
const GRAVITY = 30

/** Chronologie de la révélation, en secondes depuis le clic. */
const T = {
  waveStep: 0.018, // décalage entre deux colonnes
  waveDur: 0.3,
  flightDelay: 0.16, // départ après le début de la vague de la colonne
  rowStep: 0.012,
  flightDur: 0.75,
  squashDur: 0.22, // écrasement d'un cube à l'atterrissage
  turnStart: 0.3,
  turnDur: 1.15,
  candleStart: 1.36,
  candleStep: 0.06,
  candleDur: 0.18,
  flameStart: 1.62,
  flameDur: 0.25,
  flashDur: 0.6,
  title: 1.7,
  letter: 1.95,
  end: 1.9,
  idleIn: 0.8, // le gâteau se met à flotter progressivement
}

/** Chronologie du souffle, en secondes depuis l'appui. */
const B = {
  flameOut: 0.35,
  smoke: 0.16,
  candleStart: 0.5,
  candleDur: 0.25,
  fly: 0.8,
  colStep: 0.02,
  rowStep: 0.01,
  flyDur: 0.85,
  lightStep: 0.045,
  lightDur: 0.42,
  glintEvery: 3.6, // un reflet traverse « MERCI » toutes les 3,6 s
}

// ───────── Utilitaires ─────────

const TAU = Math.PI * 2
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)
const easeIn = (x: number) => x * x * x
const easeOut = (x: number) => 1 - (1 - x) ** 3
const easeOutBack = (x: number) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return x <= 0 ? 0 : 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2
}
/** 0 → 1 → 0 entre a et b, 0 ailleurs. */
const bump = (x: number, a: number, b: number) => (x > a && x < b ? Math.sin((Math.PI * (x - a)) / (b - a)) : 0)

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
  /** Appui bref sur le gâteau (sans le faire tourner). */
  onTap?: () => void
}

export interface BlowOptions {
  reduced: boolean
  /** « MERCI » est entièrement écrit. */
  onDone: () => void
}

export interface CakeScene {
  play(options: PlayOptions): void
  blow(options: BlowOptions): void
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
  const cols = Math.ceil(count / rows)
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

  // Onde de lumière quand la bougie s'allume.
  const flash = new Sprite(
    new SpriteMaterial({
      map: glowTex,
      color: FLASH_COLOR,
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      opacity: 0,
    }),
  )
  scene.add(flash)

  // Confettis : des petits cubes aux couleurs de la grille.
  const rand = mulberry32(0xb1a5e)
  const confetti = new InstancedMesh(box, cubeMat, N_CONFETTI)
  confetti.instanceMatrix.setUsage(DynamicDrawUsage)
  confetti.frustumCulled = false
  const conf = Array.from({ length: N_CONFETTI }, () => {
    const angle = rand() * TAU
    const spread = 0.3 + rand() * 0.7
    return {
      vx: Math.cos(angle) * spread * 10, // cubes par seconde
      vz: Math.sin(angle) * spread * 6,
      vy: 10 + rand() * 12,
      axis: new Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(),
      spin: (rand() - 0.5) * 18,
      size: 0.2 + rand() * 0.22,
      life: 1.2 + rand() * 0.6,
      delay: rand() * 0.08,
    }
  })
  conf.forEach((_, k) => confetti.setColorAt(k, new Color(CONFETTI_COLORS[k % CONFETTI_COLORS.length])))
  scene.add(confetti)

  // Fumée : quelques cubes gris qui montent quand la flamme s'éteint.
  const smoke = new InstancedMesh(box, cubeMat, N_SMOKE)
  smoke.instanceMatrix.setUsage(DynamicDrawUsage)
  smoke.frustumCulled = false
  const smk = Array.from({ length: N_SMOKE }, (_, k) => ({
    delay: k * 0.055 + rand() * 0.04,
    vy: 2.6 + rand() * 1.8,
    drift: (rand() - 0.5) * 1.6,
    phase: rand() * TAU,
    size: 0.16 + rand() * 0.16,
    life: 1.1 + rand() * 0.6,
    axis: new Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize(),
  }))
  smk.forEach((_, k) => smoke.setColorAt(k, new Color(SMOKE_COLORS[k % SMOKE_COLORS.length])))
  scene.add(smoke)

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
  const merci = Array.from({ length: count }, (_, i) => isMerciCell(i, rows))
  const cellOff = new Color(CELL_OFF)
  const cellOn = new Color(CELL_ON)
  const cellFlash = new Color(CELL_FLASH)
  const cellGlint = new Color(CELL_GLINT)

  // Fin du souffle : dernière case de « MERCI » allumée.
  const blowLight = B.fly + (cols - 1) * B.colStep + (rows - 1) * B.rowStep + B.flyDur + 0.05
  const blowEnd = blowLight + (cols - 1) * B.lightStep + B.lightDur

  // État mesuré dans le DOM.
  const restX = new Float32Array(count)
  const restY = new Float32Array(count)
  let restSize = 10
  let restGap = 3
  const finalX = new Float32Array(count)
  const finalY = new Float32Array(count)
  let finalSize = 10
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
    const gap = parseFloat(getComputedStyle(grid).columnGap) || 0
    restGap = gap
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

    // Grille finale : centrée dans la zone du gâteau, cases au plus de la taille d'origine.
    const g = restGap
    const s = Math.min(restSize, (r.width - g * (cols - 1)) / cols, (r.height * 0.82 - g * (rows - 1)) / rows)
    finalSize = Math.max(s, 2)
    const gw = cols * finalSize + (cols - 1) * g
    const gh = rows * finalSize + (rows - 1) * g
    for (let i = 0; i < count; i++) {
      const col = Math.floor(i / rows)
      const row = i % rows
      finalX[i] = cx - gw / 2 + col * (finalSize + g) + finalSize / 2
      finalY[i] = cy + gh / 2 - (row * (finalSize + g) + finalSize / 2)
    }
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

  // ───────── État ─────────
  type State = 'rest' | 'playing' | 'live' | 'dead'
  let state: State = 'rest'
  let motion = true // false avec « réduire les animations »
  let revealT0 = 0
  let revealDone = false // saut direct à l'état final (mouvement réduit, onglet suspendu)
  let blowT0 = -1
  let blowDone = false
  let blowOpts: BlowOptions | null = null
  let pendingBlow: BlowOptions | null = null

  // Rotation au doigt.
  let dragYaw = 0
  let dragVel = 0
  let dragging = false

  /** Temps de la révélation : −1 au repos. */
  const tReveal = (now: number) => (state === 'rest' ? -1 : revealDone ? Infinity : now - revealT0)
  /** Temps du souffle : −1 tant qu'on n'a pas soufflé. */
  const tBlow = (now: number) => (blowT0 < 0 ? -1 : blowDone ? Infinity : now - blowT0)

  // Objets temporaires réutilisés à chaque image.
  const m = new Matrix4()
  const pos = new Vector3()
  const target = new Vector3()
  const scl = new Vector3()
  const up = new Vector3()
  const flameW = new Vector3()
  const origin = new Vector3()
  const q = new Quaternion()
  const qIdentity = new Quaternion()
  const qCake = new Quaternion()
  const qFinal = new Quaternion().setFromEuler(new Euler(TILT, YAW, 0))
  const euler = new Euler()
  const col = new Color()
  const hidden = new Matrix4().makeScale(0.0001, 0.0001, 0.0001)

  /** Pose la scène à l'instant `now` (secondes, horloge de la page). */
  function frame(now: number) {
    const t = tReveal(now)
    const b = tBlow(now)
    const live = motion && Number.isFinite(t)

    // Gâteau qui flotte, qui tourne au doigt, puis qui se défait au souffle.
    const turn = easeInOut(clamp01((t - T.turnStart) / T.turnDur))
    const flyAll = b < 0 ? 0 : easeInOut(clamp01((b - B.fly) / (blowLight - B.fly)))
    const idle = motion ? clamp01((t - T.end) / T.idleIn) * (1 - flyAll) : 0
    const sway = idle * 0.08 * Math.sin(now * 0.6)
    const bob = idle * unit * 0.12 * Math.sin(now * 1.5)
    qCake.setFromEuler(euler.set(TILT * turn, YAW * turn + sway + dragYaw * (1 - flyAll), 0))
    cake.quaternion.copy(qCake)
    cake.position.set(cx, cy + bob, 0)

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
        target.y += cy + bob
      } else target.set(cx, cy, 0)

      const sx0 = restX[i]
      const sy0 = restY[i]
      const dist = Math.hypot(target.x - sx0, target.y - sy0)
      const arcH = Math.min(70, 16 + dist * 0.18)
      pos.set(
        sx0 + (target.x - sx0) * e + Math.sign(sx0 - cx) * arcH * 0.6 * arc,
        sy0 + (target.y - sy0) * e + hop + arcH * 0.5 * arc,
        target.z * e + 80 * arc,
      )
      const size = slot ? restSize + (unit - restSize) * e : restSize * (1 - e)
      q.slerpQuaternions(qIdentity, qCake, e)
      let sx = size
      let sy = size
      let sz = size

      // Atterrissage : le cube s'écrase un instant sur la couche du dessous.
      if (motion && slot) {
        const land = (t - flightStart - T.flightDur) / T.squashDur
        if (land > 0 && land < 1) {
          const k = Math.sin(Math.PI * land) * 0.26
          sy = size * (1 - k)
          sx = sz = size * (1 + k * 0.5)
          up.set(0, 1, 0).applyQuaternion(q)
          pos.addScaledVector(up, (-size * k) / 2)
        }
      }

      const to = slotColor[i]
      col.lerpColors(fromColor[i], to ?? fromColor[i], e)

      // Souffle : retour à la grille, puis « MERCI » s'allume colonne par colonne.
      if (b >= 0) {
        const p2 = clamp01((b - B.fly - c * B.colStep - row * B.rowStep) / B.flyDur)
        const e2 = easeInOut(p2)
        const arc2 = Math.sin(Math.PI * p2)
        pos.set(
          pos.x + (finalX[i] - pos.x) * e2,
          pos.y + (finalY[i] - pos.y) * e2 + unit * 1.4 * arc2,
          pos.z * (1 - e2) + 140 * arc2,
        )
        if (p2 > 0) sx = sy = sz = size + (finalSize - size) * e2
        q.slerp(qIdentity, e2)
        col.lerp(cellOff, e2)

        if (merci[i]) {
          const lp = clamp01((b - blowLight - c * B.lightStep) / B.lightDur)
          if (lp > 0) {
            if (lp < 0.35) col.lerpColors(cellOff, cellFlash, lp / 0.35)
            else col.lerpColors(cellFlash, cellOn, (lp - 0.35) / 0.65)
            const pop = 1 + 0.34 * Math.sin(Math.PI * lp)
            sx *= pop
            sy *= pop
            sz *= pop
          }
          // Un reflet repasse de temps en temps sur le mot.
          if (motion && Number.isFinite(b)) {
            const g = b - blowEnd - c * 0.05
            if (g > 0) {
              const ph = g % B.glintEvery
              if (ph < 0.6) col.lerp(cellGlint, Math.sin((Math.PI * ph) / 0.6) * 0.75)
            }
          }
        }
      }

      cubes.setMatrixAt(i, m.compose(pos, q, scl.set(Math.max(sx, 0.0001), Math.max(sy, 0.0001), Math.max(sz, 0.0001))))
      cubes.setColorAt(i, col)
    }
    cubes.instanceMatrix.needsUpdate = true
    if (cubes.instanceColor) cubes.instanceColor.needsUpdate = true

    // Bougie : quatre petits cubes rayés qui poussent au centre, puis rentrent au souffle.
    const cw = 0.45
    const candleOut = b < 0 ? 1 : 1 - easeIn(clamp01((b - B.candleStart) / B.candleDur))
    for (let k = 0; k < 4; k++) {
      const a = easeOutBack(clamp01((t - T.candleStart - k * T.candleStep) / T.candleDur)) * candleOut
      pos.set(0, (5 + cw * (k + 0.5) + CAKE_OFFSET_Y) * unit, 0)
      candle.setMatrixAt(k, m.compose(pos, qIdentity, scl.setScalar(Math.max(cw * unit * a, 0.0001))))
    }
    candle.instanceMatrix.needsUpdate = true

    // Flamme : elle vacille, puis se couche et s'éteint au souffle.
    const f = easeOutBack(clamp01((t - T.flameStart) / T.flameDur))
    const fo = b < 0 ? 0 : clamp01(b / B.flameOut)
    const out = 1 - easeIn(fo)
    const flick = live && t > T.flameStart ? 1 + 0.08 * Math.sin(now * 17) + 0.05 * Math.sin(now * 29 + 1.3) : 1
    const flameY = (5 + cw * 4 + 0.5 + CAKE_OFFSET_Y) * unit
    flame.position.set(0, flameY, 0)
    const fs = unit * f
    flame.scale.set(
      Math.max(0.42 * fs * (1 + 0.6 * fo) * out, 0.0001),
      Math.max(0.62 * fs * flick * out, 0.0001),
      Math.max(0.42 * fs * out, 0.0001),
    )
    flame.rotation.z = 0.6 * easeOut(fo)
    glow.position.set(0, flameY, 0)
    glow.scale.setScalar(Math.max(3.4 * unit * f, 0.0001))
    glow.material.opacity = 0.85 * clamp01(f) * out * (live ? 0.92 + 0.08 * Math.sin(now * 11) : 1)

    // Point d'émission : la flamme, vue dans la pose finale du gâteau.
    origin.set(0, flameY, 0).applyQuaternion(qFinal)
    origin.x += cx
    origin.y += cy

    // Onde de lumière à l'allumage.
    const fl = t - T.flameStart
    if (motion && fl > 0 && fl < T.flashDur) {
      const k = fl / T.flashDur
      flash.position.copy(origin)
      flash.scale.setScalar(unit * (2 + 11 * easeOut(k)))
      flash.material.opacity = 0.8 * (1 - k) ** 2
    } else {
      flash.material.opacity = 0
      flash.scale.setScalar(0.0001)
    }

    // Confettis : lancés depuis la flamme, ils retombent en tournant.
    const floorY = -height + unit * 0.5
    for (let k = 0; k < N_CONFETTI; k++) {
      const cf = conf[k]
      const age = fl - cf.delay
      if (!motion || !(age > 0) || age > cf.life) {
        confetti.setMatrixAt(k, hidden)
        continue
      }
      pos.set(
        origin.x + cf.vx * unit * age,
        origin.y + (cf.vy * age - 0.5 * GRAVITY * age * age) * unit,
        cf.vz * unit * age + 60,
      )
      q.setFromAxisAngle(cf.axis, cf.spin * age)
      const shrink = 1 - easeIn(clamp01((age - cf.life * 0.55) / (cf.life * 0.45)))
      const edge = clamp01((pos.y - floorY) / (unit * 2)) // fond avant le bas du canvas
      confetti.setMatrixAt(k, m.compose(pos, q, scl.setScalar(Math.max(cf.size * unit * shrink * edge, 0.0001))))
    }
    confetti.instanceMatrix.needsUpdate = true

    // Fumée : elle monte de la mèche en ondulant, grossit, puis se dissipe.
    flameW.set(0, flameY, 0).applyQuaternion(qCake).add(cake.position)
    for (let k = 0; k < N_SMOKE; k++) {
      const s = smk[k]
      const age = b - B.smoke - s.delay
      if (!motion || !Number.isFinite(b) || !(age > 0) || age > s.life) {
        smoke.setMatrixAt(k, hidden)
        continue
      }
      const pk = age / s.life
      pos.set(
        flameW.x + s.drift * unit * pk + Math.sin(age * 3.2 + s.phase) * unit * 0.3,
        flameW.y + s.vy * unit * age,
        flameW.z + 40,
      )
      q.setFromAxisAngle(s.axis, age * 2)
      const sz = s.size * unit * (0.7 + pk) * (1 - easeIn(pk))
      smoke.setMatrixAt(k, m.compose(pos, q, scl.setScalar(Math.max(sz, 0.0001))))
    }
    smoke.instanceMatrix.needsUpdate = true

    // Secousse de caméra : grondement à l'atterrissage, coup sec à l'allumage et au souffle.
    let shake = 0
    if (motion && Number.isFinite(t)) {
      shake += 2.2 * bump(t, 0.86, 1.42)
      if (fl > 0) shake += 5 * Math.exp(-fl * 9)
    }
    if (motion && Number.isFinite(b) && b > B.fly) shake += 3.5 * Math.exp(-(b - B.fly) * 10)
    camera.position.x = shake * Math.sin(now * 91)
    camera.position.y = shake * Math.sin(now * 73 + 1)
  }

  const render = () => renderer.render(scene, camera)

  // ───────── Boucle ─────────
  let raf = 0
  let lastNow = 0
  let safety = 0
  let blowSafety = 0
  let visible = true
  let opts: PlayOptions | null = null
  const fired = { title: false, letter: false, done: false, blow: false }

  function fire(now: number) {
    const t = tReveal(now)
    if (opts) {
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
        clearTimeout(safety)
        opts.onDone()
      }
    }
    if (blowOpts && !fired.blow && tBlow(now) >= blowEnd) {
      fired.blow = true
      clearTimeout(blowSafety)
      blowOpts.onDone()
    }
  }

  /** Le tour complet le plus proche : le gâteau revient toujours face à nous. */
  const nearestTurn = (a: number) => Math.round(a / TAU) * TAU

  function stepDrag(dt: number) {
    if (dragging || dt <= 0) return
    dragYaw += dragVel * dt
    dragVel *= Math.exp(-dt * 3)
    const k = 1 - Math.exp(-dt * (Math.abs(dragVel) < 1.5 ? 5 : 0.8))
    dragYaw += (nearestTurn(dragYaw) - dragYaw) * k
    if (Math.abs(dragVel) < 0.01 && Math.abs(dragYaw - nearestTurn(dragYaw)) < 0.001) {
      dragVel = 0
      dragYaw = 0
    }
  }

  /** Doit-on continuer à dessiner, même gâteau hors de l'écran ? */
  function busy(now: number) {
    if (state === 'playing' || dragging || dragVel !== 0 || dragYaw !== 0) return true
    const t = tReveal(now)
    if (Number.isFinite(t) && t < T.flameStart + 2) return true
    const b = tBlow(now)
    return b >= 0 && Number.isFinite(b) && b < blowEnd + 2
  }

  function tick(ms: number) {
    raf = 0
    if (state === 'rest' || state === 'dead') return
    const now = ms / 1000
    const dt = lastNow ? Math.min(0.05, now - lastNow) : 0
    lastNow = now
    stepDrag(dt)
    if (state === 'playing' && tReveal(now) >= T.end) goLive()
    frame(now)
    render()
    fire(now)
    if (motion && (visible || busy(now))) raf = requestAnimationFrame(tick)
    else lastNow = 0
  }

  function wake() {
    if (raf || state === 'rest' || state === 'dead') return
    raf = requestAnimationFrame(tick)
  }

  function goLive() {
    state = 'live'
    if (pendingBlow) {
      const p = pendingBlow
      pendingBlow = null
      startBlow(p)
    }
  }

  /** Saut à l'état final (mouvement réduit, ou images suspendues). */
  function finish() {
    revealDone = true
    if (state === 'playing') goLive()
    const now = performance.now() / 1000
    frame(now)
    render()
    fire(now)
    wake()
  }

  function startBlow(o: BlowOptions) {
    blowOpts = o
    blowT0 = performance.now() / 1000
    dragging = false
    if (o.reduced || !motion) {
      blowDone = true
      const now = performance.now() / 1000
      frame(now)
      render()
      fire(now)
      return
    }
    wake()
    // Filet de sécurité si les images sont suspendues.
    blowSafety = window.setTimeout(() => {
      if (fired.blow || state === 'dead') return
      blowDone = true
      const now = performance.now() / 1000
      frame(now)
      render()
      fire(now)
    }, (blowEnd + 1.5) * 1000)
  }

  function relayout() {
    if (state === 'dead') return
    if (state === 'rest') measureGrid()
    measureStage()
    resize()
    if (!raf) {
      frame(performance.now() / 1000)
      render()
    }
  }

  const onResize = () => relayout()
  window.addEventListener('resize', onResize)
  const ro = new ResizeObserver(onResize)
  ro.observe(grid)

  // Le gâteau n'anime que s'il est à l'écran (la lettre se lit sans calcul 3D).
  const io = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true
    if (visible) wake()
  })

  // ───────── Doigt : faire tourner le gâteau, ou toucher pour souffler ─────────
  let pid = -1
  let downX = 0
  let downY = 0
  let downAt = 0
  let lastX = 0
  let lastMoveAt = 0
  let moved = false

  const onDown = (e: PointerEvent) => {
    if (state === 'rest' || state === 'dead' || pid !== -1) return
    pid = e.pointerId
    downX = lastX = e.clientX
    downY = e.clientY
    downAt = lastMoveAt = performance.now()
    moved = false
    dragging = false
  }

  const onMove = (e: PointerEvent) => {
    if (e.pointerId !== pid) return
    const now = performance.now()
    if (!moved && Math.hypot(e.clientX - downX, e.clientY - downY) > 8) {
      moved = true
      // Seulement un geste horizontal fait tourner ; le vertical fait défiler la page.
      if (motion && blowT0 < 0 && Math.abs(e.clientX - downX) > Math.abs(e.clientY - downY)) {
        dragging = true
        dragVel = 0
        try {
          stage?.setPointerCapture(pid)
        } catch {
          /* pointeur déjà relâché */
        }
        wake()
      }
    }
    if (dragging) {
      const d = (e.clientX - lastX) * 0.011
      dragYaw += d
      const dt = (now - lastMoveAt) / 1000
      if (dt > 0) dragVel = Math.max(-14, Math.min(14, dragVel * 0.5 + (d / dt) * 0.5))
    }
    lastX = e.clientX
    lastMoveAt = now
  }

  const onUp = (e: PointerEvent) => {
    if (e.pointerId !== pid) return
    pid = -1
    if (dragging) {
      dragging = false
      if (performance.now() - lastMoveAt > 80) dragVel = 0 // doigt arrêté avant de lâcher
      wake()
    } else if (!moved && performance.now() - downAt < 600) opts?.onTap?.()
  }

  const onCancel = (e: PointerEvent) => {
    if (e.pointerId !== pid) return
    pid = -1
    dragging = false
    wake()
  }

  const onLost = (e: Event) => {
    e.preventDefault()
    if (state === 'dead') return
    cancelAnimationFrame(raf)
    raf = 0
    clearTimeout(safety)
    clearTimeout(blowSafety)
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
      motion = !o.reduced
      ro.observe(stage)
      io.observe(stage)
      stage.addEventListener('pointerdown', onDown)
      stage.addEventListener('pointermove', onMove)
      stage.addEventListener('pointerup', onUp)
      stage.addEventListener('pointercancel', onCancel)
      measureGrid()
      measureStage()
      resize()
      state = 'playing'
      revealT0 = performance.now() / 1000
      if (o.reduced) {
        finish()
        return
      }
      // Première image dessinée tout de suite : le canvas devient visible dans
      // la même image que celle où la grille HTML se cache, sans trou.
      frame(revealT0)
      render()
      wake()
      // Filet de sécurité si les images sont suspendues (onglet en arrière-plan…).
      safety = window.setTimeout(() => !fired.done && state !== 'dead' && finish(), 4000)
    },

    blow(o) {
      if (state === 'dead' || blowT0 >= 0 || pendingBlow) return
      if (state === 'live') startBlow(o)
      else pendingBlow = o // la révélation n'est pas finie : on soufflera juste après
    },

    dispose() {
      state = 'dead'
      cancelAnimationFrame(raf)
      clearTimeout(safety)
      clearTimeout(blowSafety)
      window.removeEventListener('resize', onResize)
      ro.disconnect()
      io.disconnect()
      if (stage) {
        stage.removeEventListener('pointerdown', onDown)
        stage.removeEventListener('pointermove', onMove)
        stage.removeEventListener('pointerup', onUp)
        stage.removeEventListener('pointercancel', onCancel)
      }
      canvas.removeEventListener('webglcontextlost', onLost)
      box.dispose()
      cubeMat.dispose()
      flame.material.dispose()
      glow.material.dispose()
      flash.material.dispose()
      glowTex.dispose()
      cubes.dispose()
      candle.dispose()
      confetti.dispose()
      smoke.dispose()
      renderer.dispose()
      canvas.remove()
    },
  }
}
