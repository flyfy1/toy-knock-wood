// Knock on Wood / 电子木鱼: a lacquered wooden fish on a cushion, a padded mallet, a warm "tok".
// Cozy rules: springs, soft shadows, small sounds. No shake / flash / hit-stop / additive particles.
import { audio } from './engine/AudioEngine'
import { track } from './analytics'
import { knockVariants, locale, t } from './i18n'
import { type Stage, clamp, easeOutBack, haptic, rand, runLoop, setupCanvas } from './engine/juice'

const FONT = locale === 'ja' ? 'system-ui, "Hiragino Sans", "Noto Sans CJK JP", sans-serif' : 'system-ui, "PingFang SC", "Hiragino Sans", "Noto Sans CJK SC", sans-serif'
const TAU = Math.PI * 2

// ---------- persistent ledger (device only) ----------

const LS_TOTAL = 'knock.total'
const LS_DAY = 'knock.day'
const LS_TODAY = 'knock.today'
const LS_BIG = 'knock.big'
const todayKey = () => {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}
const lsGet = (k: string) => {
  try {
    return localStorage.getItem(k)
  } catch {
    return null
  }
}
const lsSet = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v)
  } catch {
    /* private mode */
  }
}

// ---------- tiny seeded RNG so the baked grain is identical every load ----------

function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let x = a
    x = Math.imul(x ^ (x >>> 15), x | 1)
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

const makeCanvas = (w: number, h: number) => {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.ceil(w))
  c.height = Math.max(1, Math.ceil(h))
  return c
}

// ---------- fish geometry (units of R, origin = body centre) ----------

const BODY_A = 1.0 // half width
const BODY_B = 0.86 // half height before the base is flattened
const FLAT_FROM = 0.5 // y/B where the base starts to flatten
/** Silhouette point at parameter θ: a superellipse, a little wider at the base, flat-bottomed. */
function bodyPt(th: number): [number, number] {
  const c = Math.cos(th)
  const s = Math.sin(th)
  const n = 2.5
  let x = BODY_A * Math.sign(c) * Math.pow(Math.abs(c), 2 / n)
  let y = BODY_B * Math.sign(s) * Math.pow(Math.abs(s), 2 / n)
  x *= 1 + 0.07 * (y / BODY_B)
  if (y > FLAT_FROM * BODY_B) y = FLAT_FROM * BODY_B + (y - FLAT_FROM * BODY_B) * 0.72
  return [x, y]
}
const BODY_BOTTOM = FLAT_FROM * BODY_B + (1 - FLAT_FROM) * BODY_B * 0.72
const BODY_TOP = -BODY_B

function bodyPath(c: CanvasRenderingContext2D, R: number, ox: number, oy: number) {
  c.beginPath()
  const N = 260
  for (let i = 0; i <= N; i++) {
    const [x, y] = bodyPt((i / N) * TAU)
    if (i === 0) c.moveTo(ox + x * R, oy + y * R)
    else c.lineTo(ox + x * R, oy + y * R)
  }
  c.closePath()
}

/** Where eyes sit (local, units of R). Pupils are live so they can glance at you. */
const EYE_X = 0.5
const EYE_Y = -0.06
const EYE_W = 0.3
const EYE_H = 0.17

// Slit (resonance mouth): a crescent smile across the lower third, two round holes at the ends.
const SLIT_HALF = 0.65
const SLIT_Y = 0.25 // y at the ends
const SLIT_SAG = 0.1 // how far the centre dips
const SLIT_THICK = 0.055
const HOLE_R = 0.085

interface Sprite {
  img: HTMLCanvasElement
  /** sprite px of the body centre */
  cx: number
  cy: number
  scale: number // sprite px per CSS px
}

function bakeFish(R: number, dpr: number): Sprite {
  const pad = 0.12 * R
  const W = 2 * BODY_A * 1.08 * R + 2 * pad
  const H = (BODY_BOTTOM - BODY_TOP) * R + 2 * pad
  const img = makeCanvas(W * dpr, H * dpr)
  const c = img.getContext('2d')!
  c.scale(dpr, dpr)
  const ox = W / 2
  const oy = pad - BODY_TOP * R
  const r = rng(108)

  // 1. base lacquer: lit from upper-left
  bodyPath(c, R, ox, oy)
  const base = c.createRadialGradient(ox - 0.38 * R, oy - 0.45 * R, 0.05 * R, ox - 0.1 * R, oy - 0.05 * R, 1.25 * R)
  base.addColorStop(0, '#D9703C')
  base.addColorStop(0.22, '#C0562A')
  base.addColorStop(0.62, '#7A2C12')
  base.addColorStop(1, '#4A180A')
  c.fillStyle = base
  c.fill()

  c.save()
  bodyPath(c, R, ox, oy)
  c.clip()

  // 2. wood grain that wraps around the form: contour-like curves, bowed by the sphere
  c.lineCap = 'round'
  for (let i = 0; i < 46; i++) {
    const y0 = (-0.95 + (i / 45) * 1.75) * R + rand(-0.02, 0.02) * R
    const bow = (0.18 + 0.12 * r()) * R * (y0 < 0 ? 1 : 0.6)
    const wav = (r() - 0.5) * 0.08 * R
    const dark = r() < 0.65
    c.strokeStyle = dark ? `rgba(40,10,3,${0.08 + r() * 0.12})` : `rgba(240,150,90,${0.04 + r() * 0.06})`
    c.lineWidth = (0.6 + r() * 1.8) * (R / 100)
    c.beginPath()
    c.moveTo(ox - 1.2 * R, oy + y0 + bow)
    c.bezierCurveTo(ox - 0.45 * R, oy + y0 - bow * 0.2 + wav, ox + 0.45 * R, oy + y0 - bow * 0.2 - wav, ox + 1.2 * R, oy + y0 + bow)
    c.stroke()
  }
  // cathedral figure (nested ovals) on the right cheek, very faint
  for (let k = 0; k < 6; k++) {
    c.strokeStyle = `rgba(35,8,2,${0.07 + k * 0.012})`
    c.lineWidth = 1.1 * (R / 100)
    c.beginPath()
    c.ellipse(ox + 0.5 * R, oy + 0.52 * R, (0.08 + k * 0.07) * R, (0.03 + k * 0.025) * R, -0.15, 0, TAU)
    c.stroke()
  }
  // fine fibres
  for (let i = 0; i < 420; i++) {
    const x = ox + (r() * 2.1 - 1.05) * R
    const y = oy + (r() * 1.7 - 0.9) * R
    const len = (0.04 + r() * 0.12) * R
    c.strokeStyle = r() < 0.7 ? `rgba(30,8,2,${0.05 + r() * 0.07})` : `rgba(255,190,130,${0.03 + r() * 0.05})`
    c.lineWidth = 0.6 * (R / 100)
    c.beginPath()
    c.moveTo(x, y)
    c.lineTo(x + len, y + (r() - 0.5) * 0.02 * R)
    c.stroke()
  }

  // 3. form shading: core shadow toward lower-right, ambient occlusion at the rim
  const core = c.createRadialGradient(ox - 0.45 * R, oy - 0.5 * R, 0.4 * R, ox - 0.2 * R, oy - 0.2 * R, 1.55 * R)
  core.addColorStop(0, 'rgba(20,4,0,0)')
  core.addColorStop(0.55, 'rgba(20,4,0,0.08)')
  core.addColorStop(1, 'rgba(20,4,0,0.55)')
  c.fillStyle = core
  c.fillRect(0, 0, W, H)
  c.save()
  c.translate(ox, oy)
  c.scale(1, BODY_B / BODY_A)
  const ao = c.createRadialGradient(0, 0, 0.72 * R, 0, 0, 1.08 * R)
  ao.addColorStop(0, 'rgba(15,3,0,0)')
  ao.addColorStop(1, 'rgba(15,3,0,0.45)')
  c.fillStyle = ao
  c.fillRect(-2 * R, -2 * R, 4 * R, 4 * R)
  c.restore()

  // 4. red bounce light from the cushion on the underside
  const bounce = c.createLinearGradient(0, oy + BODY_BOTTOM * R, 0, oy + 0.25 * R)
  bounce.addColorStop(0, 'rgba(214,60,70,0.42)')
  bounce.addColorStop(1, 'rgba(214,60,70,0)')
  c.globalCompositeOperation = 'screen'
  c.fillStyle = bounce
  c.fillRect(0, 0, W, H)
  c.globalCompositeOperation = 'source-over'

  // 5. carved scales: three rows of semicircles on the crown
  const sr = 0.16 * R
  const rows = [
    { y: -0.68, n: 4 },
    { y: -0.53, n: 5 },
    { y: -0.38, n: 6 },
  ]
  c.lineCap = 'round'
  rows.forEach((row, ri) => {
    const span = (row.n - 1) * sr * 1.55
    for (let i = 0; i < row.n; i++) {
      const x = ox - span / 2 + i * sr * 1.55
      const y = oy + row.y * R + Math.pow(Math.abs(x - ox) / R, 2) * 0.35 * R
      const rr = sr * (1 - 0.18 * Math.pow(Math.abs(x - ox) / R, 2)) * (0.95 + ri * 0.03)
      // carved groove: dark line, then a lit lip offset up-left
      c.lineWidth = 1.6 * (R / 100)
      c.strokeStyle = 'rgba(70,22,8,0.9)'
      c.beginPath()
      c.arc(x, y, rr, 0.08 * Math.PI, 0.92 * Math.PI)
      c.stroke()
      c.lineWidth = 1 * (R / 100)
      c.strokeStyle = 'rgba(232,140,85,0.55)'
      c.beginPath()
      c.arc(x - 0.01 * R, y - 0.012 * R, rr, 0.1 * Math.PI, 0.9 * Math.PI)
      c.stroke()
    }
  })
  // a carved fin line framing the crown
  c.lineWidth = 1.5 * (R / 100)
  c.strokeStyle = 'rgba(70,22,8,0.75)'
  c.beginPath()
  c.ellipse(ox, oy - 0.18 * R, 0.78 * R, 0.62 * R, 0, 1.12 * Math.PI, 1.88 * Math.PI)
  c.stroke()
  c.strokeStyle = 'rgba(232,140,85,0.4)'
  c.lineWidth = 1 * (R / 100)
  c.beginPath()
  c.ellipse(ox - 0.01 * R, oy - 0.195 * R, 0.78 * R, 0.62 * R, 0, 1.14 * Math.PI, 1.86 * Math.PI)
  c.stroke()

  // 6. carved eye sockets (pupils drawn live)
  for (const sx of [-1, 1]) {
    const ex = ox + sx * EYE_X * R
    const ey = oy + EYE_Y * R
    c.save()
    c.translate(ex, ey)
    c.rotate(sx * -0.12)
    // socket: sunk, so dark at the top (lip shadow) and lit at the bottom
    almond(c, EYE_W * R, EYE_H * R)
    const sock = c.createLinearGradient(0, -EYE_H * R, 0, EYE_H * R)
    sock.addColorStop(0, '#3A1206')
    sock.addColorStop(0.55, '#6B2610')
    sock.addColorStop(1, '#A4471F')
    c.fillStyle = sock
    c.fill()
    c.lineWidth = 1.6 * (R / 100)
    c.strokeStyle = 'rgba(40,10,3,0.9)'
    c.stroke()
    almond(c, EYE_W * R * 1.12, EYE_H * R * 1.35, 0.012 * R)
    c.lineWidth = 1 * (R / 100)
    c.strokeStyle = 'rgba(236,150,95,0.45)'
    c.stroke()
    c.restore()
  }

  // 7. resonance slit with depth
  const sx0 = ox - SLIT_HALF * R
  const sx1 = ox + SLIT_HALF * R
  const sy = oy + SLIT_Y * R
  const slit = () => {
    c.beginPath()
    c.moveTo(sx0, sy)
    c.quadraticCurveTo(ox, sy + SLIT_SAG * 2 * R, sx1, sy)
    c.quadraticCurveTo(ox, sy + (SLIT_SAG * 2 + SLIT_THICK * 2) * R, sx0, sy)
    c.closePath()
    c.moveTo(sx0 + HOLE_R * R, sy)
    c.arc(sx0, sy, HOLE_R * R, 0, TAU)
    c.moveTo(sx1 + HOLE_R * R, sy)
    c.arc(sx1, sy, HOLE_R * R, 0, TAU)
  }
  // lit lower lip, drawn slightly below the opening
  c.save()
  c.translate(0, 0.018 * R)
  slit()
  c.fillStyle = 'rgba(245,160,105,0.55)'
  c.fill('nonzero')
  c.restore()
  slit()
  const inner = c.createLinearGradient(0, sy, 0, sy + (SLIT_SAG + SLIT_THICK) * R)
  inner.addColorStop(0, '#0E0402')
  inner.addColorStop(0.6, '#1E0A05')
  inner.addColorStop(1, '#3A160A')
  c.fillStyle = inner
  c.fill('nonzero')
  c.lineWidth = 1.4 * (R / 100)
  c.strokeStyle = 'rgba(30,8,2,0.8)'
  c.beginPath()
  c.moveTo(sx0, sy - 0.005 * R)
  c.quadraticCurveTo(ox, sy + SLIT_SAG * 2 * R - 0.01 * R, sx1, sy - 0.005 * R)
  c.stroke()

  // 8. lacquer: soft bloom + sharp core + window streak + rim light
  const hl = (x: number, y: number, rx: number, ry: number, rot: number, a: number) => {
    c.save()
    c.translate(x, y)
    c.rotate(rot)
    c.scale(1, ry / rx)
    const g = c.createRadialGradient(0, 0, 0, 0, 0, rx)
    g.addColorStop(0, `rgba(255,246,230,${a})`)
    g.addColorStop(0.45, `rgba(255,236,210,${a * 0.45})`)
    g.addColorStop(1, 'rgba(255,236,210,0)')
    c.fillStyle = g
    c.fillRect(-rx, -rx, 2 * rx, 2 * rx)
    c.restore()
  }
  hl(ox - 0.42 * R, oy - 0.5 * R, 0.5 * R, 0.18 * R, -0.55, 0.42)
  hl(ox - 0.45 * R, oy - 0.52 * R, 0.2 * R, 0.055 * R, -0.55, 0.95)
  hl(ox - 0.3 * R, oy - 0.62 * R, 0.07 * R, 0.03 * R, -0.4, 0.8)
  hl(ox - 0.78 * R, oy - 0.12 * R, 0.16 * R, 0.035 * R, -1.3, 0.35)
  hl(ox + 0.62 * R, oy + 0.42 * R, 0.22 * R, 0.04 * R, -0.75, 0.12)
  // rim light just inside the upper-left silhouette
  c.save()
  bodyPath(c, R * 0.985, ox, oy)
  c.lineWidth = 0.035 * R
  const rim = c.createLinearGradient(ox - R, oy - R, ox + 0.2 * R, oy + 0.2 * R)
  rim.addColorStop(0, 'rgba(255,215,170,0.45)')
  rim.addColorStop(0.5, 'rgba(255,215,170,0)')
  c.strokeStyle = rim
  c.stroke()
  c.restore()

  c.restore() // clip
  return { img, cx: ox * dpr, cy: oy * dpr, scale: dpr }
}

function almond(c: CanvasRenderingContext2D, w: number, h: number, dy = 0) {
  c.beginPath()
  c.moveTo(-w / 2, dy)
  c.bezierCurveTo(-w * 0.22, -h * 0.75 + dy, w * 0.22, -h * 0.75 + dy, w / 2, dy)
  c.bezierCurveTo(w * 0.22, h * 0.62 + dy, -w * 0.22, h * 0.62 + dy, -w / 2, dy)
  c.closePath()
}

// ---------- mallet (baked lying along +x, pivot = hand end) ----------

const STICK = 1.6
const HEAD_R = 0.2

function bakeMallet(R: number, dpr: number) {
  const pad = 0.12 * R
  const W = (STICK + HEAD_R + 0.2) * R + 2 * pad
  const H = 2 * HEAD_R * R + 2 * pad + 0.1 * R
  const img = makeCanvas(W * dpr, H * dpr)
  const c = img.getContext('2d')!
  c.scale(dpr, dpr)
  const px = pad + 0.14 * R // pivot
  const py = H / 2
  const hx = px + STICK * R // head centre
  const th = 0.09 * R

  // soft drop shadow (baked once; never per frame)
  c.save()
  c.shadowColor = 'rgba(10,3,0,0.55)'
  c.shadowBlur = 0.09 * R * dpr
  c.shadowOffsetX = 0.03 * R * dpr
  c.shadowOffsetY = 0.07 * R * dpr
  c.fillStyle = '#000'
  c.beginPath()
  c.roundRect(px - 0.14 * R, py - th / 2, STICK * R, th, th / 2)
  c.fill()
  c.beginPath()
  c.ellipse(hx, py, HEAD_R * R * 1.08, HEAD_R * R, 0, 0, TAU)
  c.fill()
  c.restore()
  // erase the black stand-ins, keep only their shadows
  c.globalCompositeOperation = 'destination-out'
  c.beginPath()
  c.roundRect(px - 0.14 * R, py - th / 2, STICK * R, th, th / 2)
  c.fill()
  c.beginPath()
  c.ellipse(hx, py, HEAD_R * R * 1.08, HEAD_R * R, 0, 0, TAU)
  c.fill()
  c.globalCompositeOperation = 'source-over'

  // stick: turned wood, tapered slightly toward the head
  c.beginPath()
  c.moveTo(px - 0.14 * R, py - th * 0.56)
  c.lineTo(hx - 0.1 * R, py - th * 0.4)
  c.lineTo(hx - 0.1 * R, py + th * 0.4)
  c.lineTo(px - 0.14 * R, py + th * 0.56)
  c.arc(px - 0.14 * R, py, th * 0.56, Math.PI / 2, -Math.PI / 2)
  c.closePath()
  const sg = c.createLinearGradient(0, py - th / 2, 0, py + th / 2)
  sg.addColorStop(0, '#F2D7A6')
  sg.addColorStop(0.35, '#D9B27A')
  sg.addColorStop(1, '#8A6236')
  c.fillStyle = sg
  c.fill()
  c.save()
  c.clip()
  const r = rng(7)
  for (let i = 0; i < 9; i++) {
    c.strokeStyle = `rgba(110,70,30,${0.15 + r() * 0.2})`
    c.lineWidth = 0.6 * (R / 100)
    const y = py + (r() - 0.5) * th
    c.beginPath()
    c.moveTo(px - 0.2 * R, y)
    c.bezierCurveTo(px + 0.4 * R, y + (r() - 0.5) * th * 0.3, px + 0.9 * R, y + (r() - 0.5) * th * 0.3, hx, y)
    c.stroke()
  }
  c.restore()
  // end cap ring
  c.fillStyle = 'rgba(90,55,25,0.55)'
  c.fillRect(px - 0.02 * R, py - th * 0.56, 0.03 * R, th * 1.12)

  // cord binding where head meets stick
  c.fillStyle = '#8E1F2B'
  c.beginPath()
  c.roundRect(hx - HEAD_R * R - 0.1 * R, py - th * 0.62, 0.12 * R, th * 1.24, 0.02 * R)
  c.fill()
  c.strokeStyle = 'rgba(255,190,150,0.35)'
  c.lineWidth = 0.8 * (R / 100)
  for (let i = 0; i < 4; i++) {
    const x = hx - HEAD_R * R - 0.085 * R + i * 0.028 * R
    c.beginPath()
    c.moveTo(x, py - th * 0.6)
    c.lineTo(x + 0.012 * R, py + th * 0.6)
    c.stroke()
  }

  // padded head: cloth-wrapped ball
  c.save()
  c.beginPath()
  c.ellipse(hx, py, HEAD_R * R * 1.08, HEAD_R * R, 0, 0, TAU)
  const hg = c.createRadialGradient(hx - 0.07 * R, py - 0.08 * R, 0.01 * R, hx, py, HEAD_R * R * 1.1)
  hg.addColorStop(0, '#FBF0DA')
  hg.addColorStop(0.45, '#E9D2A6')
  hg.addColorStop(1, '#A88A5C')
  c.fillStyle = hg
  c.fill()
  c.clip()
  // wrap folds
  c.lineWidth = 1.1 * (R / 100)
  for (let i = -3; i <= 3; i++) {
    c.strokeStyle = 'rgba(120,90,50,0.35)'
    c.beginPath()
    c.ellipse(hx + i * 0.05 * R, py, 0.03 * R + Math.abs(i) * 0.004 * R, HEAD_R * R * 1.05, 0, -Math.PI / 2, Math.PI / 2, i < 0)
    c.stroke()
  }
  // cloth weave speckle
  for (let i = 0; i < 70; i++) {
    c.fillStyle = r() < 0.5 ? 'rgba(130,100,60,0.18)' : 'rgba(255,255,240,0.18)'
    c.fillRect(hx + (r() - 0.5) * 0.42 * R, py + (r() - 0.5) * 0.4 * R, 0.012 * R, 0.012 * R)
  }
  c.restore()
  return { img, px: px * dpr, py: py * dpr, dpr }
}

// ---------- background + cushion (baked) ----------

function bakeBackground(s: Stage, L: Layout) {
  const { w, h, dpr } = s
  const img = makeCanvas(w * dpr, h * dpr)
  const c = img.getContext('2d')!
  c.scale(dpr, dpr)
  const R = L.R
  // warm dark wood table
  const bg = c.createLinearGradient(0, 0, 0, h)
  bg.addColorStop(0, '#2B1D14')
  bg.addColorStop(1, '#1A110B')
  c.fillStyle = bg
  c.fillRect(0, 0, w, h)
  // table planks + grain below the horizon
  const r = rng(3)
  const horizon = L.cy - 0.9 * R
  for (let i = 0; i < 90; i++) {
    const y = horizon + Math.pow(r(), 0.8) * (h - horizon)
    c.strokeStyle = r() < 0.6 ? `rgba(0,0,0,${0.06 + r() * 0.08})` : `rgba(200,140,90,${0.025 + r() * 0.03})`
    c.lineWidth = 0.5 + r() * 1.5
    c.beginPath()
    c.moveTo(-10, y)
    const k = (r() - 0.5) * 10
    c.bezierCurveTo(w * 0.3, y + k, w * 0.7, y - k, w + 10, y + k * 0.5)
    c.stroke()
  }
  // a back wall / table edge: slightly darker above the horizon
  const wall = c.createLinearGradient(0, 0, 0, horizon)
  wall.addColorStop(0, 'rgba(10,5,2,0.35)')
  wall.addColorStop(1, 'rgba(10,5,2,0.05)')
  c.fillStyle = wall
  c.fillRect(0, 0, w, horizon)
  // soft spotlight from the top
  const spot = c.createRadialGradient(L.fx, L.cy - 0.6 * R, 0.2 * R, L.fx, L.cy - 0.2 * R, Math.max(w, h) * 0.62)
  spot.addColorStop(0, 'rgba(255,196,130,0.26)')
  spot.addColorStop(0.4, 'rgba(255,170,100,0.09)')
  spot.addColorStop(1, 'rgba(255,170,100,0)')
  c.fillStyle = spot
  c.fillRect(0, 0, w, h)
  // vignette
  const vig = c.createRadialGradient(w / 2, h * 0.5, Math.min(w, h) * 0.35, w / 2, h * 0.5, Math.hypot(w, h) * 0.62)
  vig.addColorStop(0, 'rgba(0,0,0,0)')
  vig.addColorStop(1, 'rgba(0,0,0,0.55)')
  c.fillStyle = vig
  c.fillRect(0, 0, w, h)

  // cushion shadow on the table
  const cx = L.fx
  const cy = L.cy
  const rx = 1.3 * R
  const ry = 0.45 * R
  const band = 0.3 * R
  c.save()
  c.translate(cx, cy + band + 0.08 * R)
  c.scale(1, 0.28)
  const sh = c.createRadialGradient(0, 0, 0.3 * R, 0, 0, 1.75 * R)
  sh.addColorStop(0, 'rgba(0,0,0,0.6)')
  sh.addColorStop(1, 'rgba(0,0,0,0)')
  c.fillStyle = sh
  c.fillRect(-2 * R, -2 * R, 4 * R, 4 * R)
  c.restore()

  // cushion side band (a puffy cylinder)
  c.beginPath()
  c.ellipse(cx, cy, rx, ry, 0, Math.PI, 0, false)
  c.lineTo(cx + rx * 0.99, cy + band * 0.75)
  c.ellipse(cx, cy + band, rx * 0.97, ry, 0, 0, Math.PI, false)
  c.closePath()
  const side = c.createLinearGradient(cx - rx, 0, cx + rx, 0)
  side.addColorStop(0, '#3E0B12')
  side.addColorStop(0.3, '#7A1A25')
  side.addColorStop(0.55, '#8E1F2B')
  side.addColorStop(1, '#330910')
  c.fillStyle = side
  c.fill()
  const sideV = c.createLinearGradient(0, cy, 0, cy + band + ry)
  sideV.addColorStop(0, 'rgba(0,0,0,0)')
  sideV.addColorStop(1, 'rgba(0,0,0,0.45)')
  c.fillStyle = sideV
  c.fill()
  // silk pleats on the band
  c.save()
  c.clip()
  for (let i = 0; i < 26; i++) {
    const a = Math.PI * (i / 25)
    const x = cx + Math.cos(a) * rx * 0.98
    c.strokeStyle = 'rgba(0,0,0,0.12)'
    c.lineWidth = 1
    c.beginPath()
    c.moveTo(x, cy + Math.sin(a) * ry)
    c.quadraticCurveTo(x + (x - cx) * 0.02, cy + band * 0.6 + Math.sin(a) * ry, x, cy + band + Math.sin(a) * ry)
    c.stroke()
  }
  c.restore()
  // bottom piping
  c.strokeStyle = '#B88A34'
  c.lineWidth = 2.5
  c.beginPath()
  c.ellipse(cx, cy + band, rx * 0.97, ry, 0, 0.05, Math.PI - 0.05)
  c.stroke()

  // top surface
  c.beginPath()
  c.ellipse(cx, cy, rx, ry, 0, 0, TAU)
  const top = c.createRadialGradient(cx - 0.4 * R, cy - 0.2 * R, 0.1 * R, cx, cy, rx)
  top.addColorStop(0, '#C23A47')
  top.addColorStop(0.45, '#9E2532')
  top.addColorStop(1, '#6A1520')
  c.fillStyle = top
  c.fill()
  // tufting creases toward the centre
  c.save()
  c.clip()
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + 0.2
    c.strokeStyle = 'rgba(40,0,6,0.22)'
    c.lineWidth = 1.2
    c.beginPath()
    c.moveTo(cx + Math.cos(a) * rx * 0.25, cy + Math.sin(a) * ry * 0.25)
    c.quadraticCurveTo(cx + Math.cos(a + 0.12) * rx * 0.6, cy + Math.sin(a + 0.12) * ry * 0.6, cx + Math.cos(a) * rx * 0.95, cy + Math.sin(a) * ry * 0.95)
    c.stroke()
  }
  // silk sheen band
  c.save()
  c.translate(cx - 0.35 * R, cy - 0.16 * R)
  c.scale(1, 0.32)
  const sheen = c.createRadialGradient(0, 0, 0, 0, 0, 0.8 * R)
  sheen.addColorStop(0, 'rgba(255,200,200,0.26)')
  sheen.addColorStop(1, 'rgba(255,200,200,0)')
  c.fillStyle = sheen
  c.fillRect(-R, -R * 3, 2 * R, 6 * R)
  c.restore()
  c.restore()
  // gold piping around the top, with a highlight thread
  c.lineWidth = 3
  c.strokeStyle = '#D6A84A'
  c.beginPath()
  c.ellipse(cx, cy, rx, ry, 0, 0, TAU)
  c.stroke()
  c.lineWidth = 1
  c.strokeStyle = 'rgba(255,236,170,0.8)'
  c.beginPath()
  c.ellipse(cx, cy - 1, rx, ry, 0, Math.PI * 1.05, Math.PI * 1.7)
  c.stroke()
  c.strokeStyle = 'rgba(80,40,0,0.5)'
  c.beginPath()
  c.ellipse(cx, cy + 1.2, rx, ry, 0, 0.1, Math.PI - 0.1)
  c.stroke()
  return img
}

// ---------- layout ----------

interface Layout {
  R: number // base unit
  fR: number // fish unit (bigger for the big fish)
  fx: number
  cy: number // cushion top-surface centre
  baseY: number // fish base line (resting on the cushion)
  headRest: [number, number]
  headStrike: [number, number]
  angRest: number // stick direction head → hand
  angStrike: number
  contact: [number, number] // where the mallet head meets the fish
}

function layout(s: Stage, big: boolean): Layout {
  // doc: min(w, h) * 0.24; capped by height so the mallet and counter fit on landscape screens
  const R = Math.min(s.w * 0.24, s.h * 0.19)
  const fR = R * (big ? 1.16 : 1)
  const fx = s.w / 2
  const cy = Math.min(s.h * 0.6 + 0.75 * R, s.h - R - 40)
  const baseY = cy + 0.05 * R
  // contact point on the upper-right shoulder of the body
  const th = -0.95
  const [px, py] = bodyPt(th)
  const bodyCy = baseY - BODY_BOTTOM * fR
  const contact: [number, number] = [fx + px * fR, bodyCy + py * fR]
  const nl = Math.hypot(Math.cos(th), Math.sin(th))
  const headStrike: [number, number] = [contact[0] + (Math.cos(th) / nl) * HEAD_R * R, contact[1] + (Math.sin(th) / nl) * HEAD_R * R]
  // at rest the mallet is lifted up and to the right, stick pointing up-right (a wrist, not a pivot)
  const angRest = -0.9 // direction head → hand
  let headRest: [number, number] = [fx + 0.98 * fR, bodyCy + (BODY_TOP - 0.42) * fR]
  // keep the hand end on screen on narrow phones: slide the rest pose in, steepen the strike pose
  const reach = (STICK + 0.1) * R
  const handX = headRest[0] + Math.cos(angRest) * reach
  if (handX > s.w - 6) headRest = [headRest[0] - (handX - s.w + 6), headRest[1]]
  let angStrike = -0.62
  const room = s.w - 6 - headStrike[0]
  if (Math.cos(angStrike) * reach > room) angStrike = -Math.acos(clamp(room / reach, 0.2, 1))
  return { R, fR, fx, cy, baseY, headRest, headStrike, angRest, angStrike, contact }
}

// ---------- live effects ----------

interface Floater {
  text: string
  x: number
  y: number
  t0: number
  drift: number
  tilt: number
  special: boolean
  dur: number
}
interface Mote {
  x: number
  y: number
  vx: number
  vy: number
  t0: number
  life: number
  size: number
  ambient: boolean
}
interface Ring {
  t0: number
}

export interface GameApi {
  dispose(): void
  setWords(words: string[]): void
  setAuto(rate: number): void
  setBig(big: boolean): void
  knock(): void
}

export interface GameEvents {
  onFirst(): void
  onCount(total: number, today: number): void
  onToast(text: string): void
  onBigUnlocked(): void
}

export function startGame(canvas: HTMLCanvasElement, ev: GameEvents, initialWords: string[] = []): GameApi {
  // ledger
  let total = Number(lsGet(LS_TOTAL)) || 0
  let today = lsGet(LS_DAY) === todayKey() ? Number(lsGet(LS_TODAY)) || 0 : 0
  let session = 0
  let big = total >= 108 && lsGet(LS_BIG) === '1'
  ev.onCount(total, today)

  let words = initialWords
  let wordIdx = 0
  const variants = knockVariants()

  let L: Layout
  let fish: Sprite
  let mallet: ReturnType<typeof bakeMallet>
  let bg: HTMLCanvasElement
  const relayout = (s: Stage) => {
    L = layout(s, big)
    fish = bakeFish(L.fR, s.dpr)
    mallet = bakeMallet(L.R, s.dpr)
    bg = bakeBackground(s, L)
  }
  const { stage, dispose: disposeCanvas } = setupCanvas(canvas, relayout)

  // time: real clock, or frozen for screenshots (dev only)
  let frozen: number | null = null
  const now = () => frozen ?? performance.now()

  // mallet pose: u = 0 at rest, 1 at contact
  let u = 0
  let swing: { from: number; t0: number; dur: number; phase: 'down' | 'up' } | null = null
  let pendingTexts: { text: string; special: boolean; v: number }[] = []
  // tassel pendulum (hangs from the hand end)
  let tassel = 0
  let tasselV = 0
  let lastU = u

  // fish springs
  let sq = 0 // squash displacement, 1 = (1.06, 0.93)
  let sqV = 0
  let tilt = 0
  let tiltV = 0
  let dimple = 0

  const floaters: Floater[] = []
  const FAN = [0, -1, 0.9] // lanes, so fast knocking fans out instead of piling up
  let fanIdx = 0
  const motes: Mote[] = []
  const rings: Ring[] = []

  // eye glance
  let glanceUntil = 0
  let glanceT0 = 0

  // rate tracking for "Sincerity not detected"
  const tapTimes: number[] = []
  let fastSince = 0
  let fastCooldown = 0

  // auto knock
  let autoRate = 0
  let autoNext = 0
  let autoCount = 0

  let started = false

  const save = () => {
    lsSet(LS_TOTAL, String(total))
    lsSet(LS_DAY, todayKey())
    lsSet(LS_TODAY, String(today))
  }

  const nextText = (auto: boolean): { text: string; special: boolean } => {
    if (auto && autoCount % 20 === 0) return { text: t('knock_proxy'), special: true }
    if (words.length) return { text: words[wordIdx++ % words.length], special: false }
    if (Math.random() < 1 / 8) return { text: variants[(Math.random() * variants.length) | 0], special: false }
    return { text: t('knock_default'), special: false }
  }

  const MILESTONES: [number, Parameters<typeof t>[0]][] = [
    [18, 'knock_m18'],
    [108, 'knock_m108'],
    [1000, 'knock_m1000'],
    [10000, 'knock_m10000'],
  ]

  /** One knock. Sound, haptic and count happen right here, synchronously with the input. */
  function knock(auto = false, v = 0.85) {
    audio.unlock()
    const tNow = now()
    if (!started) {
      started = true
      ev.onFirst()
    }
    audio.woodKnock(v, big ? 390 : 520)
    haptic(10)
    const before = total
    total++
    if (lsGet(LS_DAY) !== todayKey()) today = 0
    today++
    session++
    if (auto) autoCount++
    save()
    ev.onCount(total, today)

    const txt = nextText(auto)
    // too fast: more than 6 manual knocks/s held for 3 s
    if (!auto) {
      tapTimes.push(tNow)
      while (tapTimes.length && tNow - tapTimes[0] > 1000) tapTimes.shift()
      if (tapTimes.length > 6) {
        if (!fastSince) fastSince = tapTimes[0]
        if (tNow - fastSince >= 3000 && tNow > fastCooldown) {
          // the line itself goes to the toast (readable); the fish's side-eye does the rest
          ev.onToast(t('knock_fast'))
          glanceT0 = tNow
          glanceUntil = tNow + 1600
          fastCooldown = tNow + 8000
          fastSince = 0
          track('too_fast')
        }
      } else fastSince = 0
    }
    pendingTexts.push({ ...txt, v })

    for (const [n, key] of MILESTONES) {
      if (before < n && total >= n) {
        ev.onToast(t(key))
        audio.bell(n >= 1000 ? 660 : 784)
        track('knock_milestone', { n })
        if (n === 108) ev.onBigUnlocked()
      }
    }

    // mallet: (re)start the down-swing from wherever it is. The swing is short (33 ms,
    // two frames) so the visual contact lands with the sound, which is already scheduled.
    const frac = clamp(1 - u, 0, 1.2)
    swing = { from: u, t0: tNow, dur: Math.max(16, 33 * frac), phase: 'down' }
    if (frac < 0.05) contact(tNow)
  }

  function contact(tNow: number) {
    const R = L.fR
    const items = pendingTexts.length ? pendingTexts : [{ text: t('knock_default'), special: false, v: 0.85 }]
    pendingTexts = []
    const v = items[items.length - 1].v
    // squash spring kick (accumulates a little under fast knocking)
    sq = clamp(sq + 1 * v, -0.6, 1.35)
    sqV = 0
    tiltV -= 0.6 * v
    rings.push({ t0: tNow })
    if (rings.length > 2) rings.shift()
    const [cx, cy] = L.contact
    for (let i = 0; i < 6; i++) {
      motes.push({
        x: cx + rand(-0.06, 0.06) * R,
        y: cy + rand(-0.03, 0.03) * R,
        vx: rand(-0.45, 0.55) * R,
        vy: rand(-0.6, -0.15) * R,
        t0: tNow,
        life: rand(800, 1400),
        size: rand(0.6, 1.5) * (R / 100),
        ambient: false,
      })
    }
    while (motes.length > 140) motes.shift()
    items.forEach((it, k) => {
      const alive = floaters.length
      // fast knocking fans the texts out instead of stacking them on one line
      if (alive + k === 0) fanIdx = 0
      const fan = FAN[fanIdx++ % FAN.length]
      floaters.push({
        text: it.text,
        x: L.fx,
        y: L.baseY - (BODY_BOTTOM - BODY_TOP + 0.12) * R,
        t0: tNow + k * 40,
        drift: fan * 1.0 * R + rand(-0.04, 0.04) * R,
        dur: it.special ? 1500 : alive > 2 ? 650 : 900,
        tilt: fan * 0.12,
        special: it.special,
      })
    })
    while (floaters.length > 24) floaters.shift()
    u = 1
    swing = { from: 1, t0: tNow, dur: 220, phase: 'up' }
  }

  // ambient dust in the spotlight
  for (let i = 0; i < 18; i++) spawnAmbient(true)
  function spawnAmbient(anywhere: boolean) {
    const R = L.R
    motes.push({
      x: L.fx + rand(-1.6, 1.6) * R,
      y: anywhere ? L.cy - rand(0.4, 3.2) * R : L.cy - rand(0.4, 1.2) * R,
      vx: rand(-0.04, 0.04) * R,
      vy: rand(-0.09, -0.03) * R,
      t0: now() - (anywhere ? rand(0, 8000) : 0),
      life: rand(9000, 14000),
      size: rand(0.6, 1.5) * (R / 100),
      ambient: true,
    })
  }

  // Build the AudioContext (suspended) up front, so the first tap only has to resume it.
  // Creating it inside the first pointerdown cost ~100 ms before the first tok.
  audio.unlock()

  // ---------- input ----------
  const onDown = (e: PointerEvent) => {
    if (e.button > 0) return
    e.preventDefault()
    knock(false, e.pointerType === 'mouse' ? 0.8 : clamp(0.7 + (e.pressure || 0.5) * 0.4, 0.6, 1))
  }
  const onKey = (e: KeyboardEvent) => {
    // only when nothing else has focus and no overlay (About / share dialog) is open
    if ((e.key === ' ' || e.key === 'Enter') && e.target === document.body && !document.body.classList.contains('about-open') && !document.querySelector('[role="dialog"]')) {
      if (e.repeat) return
      e.preventDefault()
      knock()
    }
  }
  canvas.addEventListener('pointerdown', onDown)
  // iOS Safari only grants audio activation on touchend / pointerup: unlock there too
  const onUp = () => audio.unlock()
  window.addEventListener('pointerup', onUp)
  window.addEventListener('touchend', onUp)
  window.addEventListener('keydown', onKey)
  const onHide = () => {
    if (session > 0) track('session_knocks', { n: session })
    session = 0
  }
  window.addEventListener('pagehide', onHide)

  // ---------- loop ----------
  let lastT = now()
  const stopLoop = runLoop(() => {
    const tNow = now()
    const dt = frozen !== null ? 0 : Math.min(0.033, (tNow - lastT) / 1000)
    lastT = tNow

    // auto knock (paused with the tab since the loop is rAF)
    if (autoRate > 0 && frozen === null) {
      if (tNow - autoNext > 1000) autoNext = tNow
      if (tNow >= autoNext) {
        autoNext += 1000 / autoRate
        knock(true, 0.7)
      }
    }

    // mallet
    if (swing) {
      const p = clamp((tNow - swing.t0) / swing.dur, 0, 1)
      if (swing.phase === 'down') {
        u = swing.from + (1 - swing.from) * p * p
        if (p >= 1) contact(tNow)
      } else {
        u = 1 - easeOutBack(p)
        if (p >= 1) {
          u = 0
          swing = null
        }
      }
    }

    // springs: stiffness 300, damping 12
    const sub = 3
    for (let i = 0; i < sub; i++) {
      const h = dt / sub
      sqV += (-300 * sq - 12 * sqV) * h
      sq += sqV * h
      tiltV += (-260 * tilt - 10 * tiltV) * h
      tilt += tiltV * h
      // tassel: driven by mallet angular velocity, pendulum back to hanging
      const uV = dt > 0 ? (u - lastU) / dt : 0
      tasselV += (-60 * tassel - 4 * tasselV + uV * 0.9) * h
      tassel += tasselV * h
    }
    lastU = u
    dimple = Math.max(0, sq)

    draw(tNow)
  })

  function draw(tNow: number) {
    const { ctx, dpr } = stage
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.drawImage(bg, 0, 0)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    const R = L.fR

    // dimple + contact shadow on the cushion
    const dip = dimple * 0.04 * L.R
    ctx.save()
    ctx.translate(L.fx, L.baseY - 0.03 * R)
    ctx.scale(1, 0.2)
    const cs = ctx.createRadialGradient(0, 0, 0.1 * R, 0, 0, (1.0 + 0.06 * dimple) * R)
    cs.addColorStop(0, `rgba(20,0,3,${0.75 + 0.15 * dimple})`)
    cs.addColorStop(0.55, 'rgba(20,0,3,0.55)')
    cs.addColorStop(0.8, 'rgba(25,0,4,0.18)')
    cs.addColorStop(1, 'rgba(25,0,4,0)')
    ctx.fillStyle = cs
    ctx.fillRect(-1.3 * R, -1.3 * R, 2.6 * R, 2.6 * R)
    ctx.restore()

    // sound ring
    for (let i = rings.length - 1; i >= 0; i--) {
      const p = (tNow - rings[i].t0) / 400
      if (p >= 1) {
        rings.splice(i, 1)
        continue
      }
      const e = 1 - Math.pow(1 - p, 2)
      ctx.strokeStyle = `rgba(246,217,139,${0.25 * (1 - p)})`
      ctx.lineWidth = 2
      ctx.beginPath()
      const bodyCy = L.baseY - BODY_BOTTOM * R
      ctx.ellipse(L.fx, bodyCy, (1 + 0.8 * e) * R * 1.02, (1 + 0.8 * e) * R * 0.86, 0, 0, TAU)
      ctx.stroke()
    }

    // fish: anchored at its base, squash + slight tilt away from the strike
    const sx = 1 + 0.06 * sq
    const sy = 1 - 0.07 * sq
    ctx.save()
    ctx.translate(L.fx, L.baseY + dip)
    ctx.rotate(tilt)
    ctx.scale(sx, sy)
    const k = 1 / fish.scale
    ctx.drawImage(fish.img, -fish.cx * k, -BODY_BOTTOM * R - fish.cy * k, fish.img.width * k, fish.img.height * k)
    // pupils (lacquered beads): serene, looking down; glance = side-eye at you
    const bodyY = -BODY_BOTTOM * R
    let gx = 0
    let gy = 0.25
    if (tNow < glanceUntil) {
      const p = (tNow - glanceT0) / (glanceUntil - glanceT0)
      const env = Math.min(1, p * 6, (1 - p) * 4)
      gx = 0.75 * env
      gy = 0.25 - 0.45 * env
    }
    for (const s of [-1, 1]) {
      const ex = s * EYE_X * R + gx * EYE_W * 0.28 * R
      const ey = bodyY + EYE_Y * R + gy * EYE_H * 0.3 * R
      const pr = 0.058 * R
      const pg = ctx.createRadialGradient(ex - pr * 0.3, ey - pr * 0.35, pr * 0.1, ex, ey, pr)
      pg.addColorStop(0, '#4a2a1c')
      pg.addColorStop(1, '#0d0503')
      ctx.fillStyle = pg
      ctx.beginPath()
      ctx.arc(ex, ey, pr, 0, TAU)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,240,220,0.85)'
      ctx.beginPath()
      ctx.arc(ex - pr * 0.35, ey - pr * 0.4, pr * 0.24, 0, TAU)
      ctx.fill()
      // heavy lid during the glance: deadpan
      if (gx > 0.05) {
        ctx.save()
        ctx.translate(s * EYE_X * R, bodyY + EYE_Y * R)
        ctx.rotate(s * -0.12)
        ctx.beginPath()
        ctx.rect(-EYE_W * R * 0.6, -EYE_H * R, EYE_W * R * 1.2, EYE_H * R * (0.55 + 0.25 * Math.min(1, gx / 0.75)))
        ctx.clip()
        almond(ctx, EYE_W * R, EYE_H * R)
        ctx.fillStyle = '#7A2C12'
        ctx.fill()
        ctx.strokeStyle = 'rgba(40,10,3,0.8)'
        ctx.lineWidth = 1.4 * (R / 100)
        ctx.stroke()
        ctx.restore()
      }
    }
    ctx.restore()

    // mallet
    ctx.save()
    const mp = malletPose()
    ctx.translate(mp.hand[0], mp.hand[1])
    ctx.rotate(mp.ang + Math.PI) // baked along +x from the hand to the head
    const mk = 1 / mallet.dpr
    ctx.drawImage(mallet.img, -mallet.px * mk, -mallet.py * mk, mallet.img.width * mk, mallet.img.height * mk)
    ctx.restore()
    drawTassel(ctx)

    // motes (normal alpha blend)
    for (let i = motes.length - 1; i >= 0; i--) {
      const m = motes[i]
      const age = tNow - m.t0
      if (age > m.life) {
        motes.splice(i, 1)
        if (m.ambient) spawnAmbient(false)
        continue
      }
      const s = age / 1000
      const x = m.x + m.vx * s + Math.sin(age / 700 + m.size * 10) * 0.03 * L.R
      const y = m.y + m.vy * s
      const p = age / m.life
      const a = m.ambient ? 0.35 * Math.sin(Math.PI * p) : 0.55 * (1 - p) * (1 - p)
      ctx.fillStyle = `rgba(255,226,170,${a})`
      ctx.beginPath()
      ctx.arc(x, y, m.size, 0, TAU)
      ctx.fill()
    }

    // floating text
    const fs = clamp(0.22 * L.R, 15, 30)
    const rise = Math.min(1.2 * L.R, 170)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = `700 ${fs}px ${FONT}`
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i]
      const age = tNow - f.t0
      if (age < 0) continue
      const dur = f.dur
      if (age > dur) {
        floaters.splice(i, 1)
        continue
      }
      const p = age / dur
      const e = 1 - Math.pow(1 - p, 3)
      const fadeFrom = dur * (2 / 3)
      const a = age < fadeFrom ? 1 : 1 - (age - fadeFrom) / (dur - fadeFrom)
      const pop = age < 110 ? 1.18 - 0.18 * (age / 110) : 1
      const x = f.x + f.drift * e
      const y = f.y - rise * e
      ctx.save()
      ctx.translate(x, y)
      ctx.rotate(f.tilt * e)
      ctx.scale(pop, pop)
      ctx.globalAlpha = Math.max(0, a)
      ctx.fillStyle = '#3A1A08'
      ctx.fillText(f.text, 2, 2)
      ctx.fillStyle = f.special ? '#FFE9B8' : '#F6D98B'
      ctx.fillText(f.text, 0, 0)
      ctx.restore()
    }
    ctx.globalAlpha = 1
  }

  function malletPose() {
    const k = u
    const hx = L.headRest[0] + (L.headStrike[0] - L.headRest[0]) * k
    const hy = L.headRest[1] + (L.headStrike[1] - L.headRest[1]) * k
    const ang = L.angRest + (L.angStrike - L.angRest) * k
    const len = STICK * L.R
    return { ang, hand: [hx + Math.cos(ang) * len, hy + Math.sin(ang) * len] as [number, number] }
  }

  function drawTassel(ctx: CanvasRenderingContext2D) {
    // hangs from the hand end of the stick, below the pivot
    const R = L.R
    const mp = malletPose()
    const hx = mp.hand[0] - Math.cos(mp.ang) * 0.08 * R
    const hy = mp.hand[1] - Math.sin(mp.ang) * 0.08 * R
    const a = clamp(tassel, -1.1, 1.1)
    const len = 0.34 * R
    const ex = hx + Math.sin(a) * len
    const ey = hy + Math.cos(a) * len
    ctx.strokeStyle = '#8E1F2B'
    ctx.lineWidth = Math.max(1.2, 0.018 * R)
    ctx.beginPath()
    ctx.moveTo(hx, hy)
    ctx.quadraticCurveTo(hx + Math.sin(a) * len * 0.3, hy + len * 0.5, ex, ey)
    ctx.stroke()
    // knot + fringe
    ctx.fillStyle = '#B8323F'
    ctx.beginPath()
    ctx.arc(ex, ey, 0.035 * R, 0, TAU)
    ctx.fill()
    ctx.strokeStyle = '#A42A36'
    ctx.lineWidth = Math.max(0.8, 0.01 * R)
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath()
      ctx.moveTo(ex + i * 0.008 * R, ey)
      ctx.lineTo(ex + i * 0.013 * R + Math.sin(a) * 0.16 * R, ey + Math.cos(a) * 0.17 * R)
      ctx.stroke()
    }
  }

  const api: GameApi = {
    dispose() {
      stopLoop()
      disposeCanvas()
      canvas.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('touchend', onUp)
      window.removeEventListener('pagehide', onHide)
    },
    setWords(ws) {
      words = ws
      wordIdx = 0
    },
    setAuto(rate) {
      autoRate = rate
      autoNext = now() + 150
      if (rate > 0) audio.unlock()
    },
    setBig(b) {
      big = b && total >= 108
      lsSet(LS_BIG, big ? '1' : '0')
      relayout(stage)
      u = 0
      swing = null
    },
    knock: () => knock(),
  }

  if (import.meta.env.DEV) {
    ;(window as unknown as Record<string, unknown>).__knock = {
      freeze: () => (frozen = performance.now()),
      unfreeze: () => {
        frozen = null
      },
      setTotal: (n: number) => {
        total = n
        save()
        ev.onCount(total, today)
      },
      api,
      sample: (n: number) => Array.from({ length: n }, () => nextText(false).text),
    }
  }
  return api
}
