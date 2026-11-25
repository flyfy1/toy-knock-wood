// 一炷香: one stick of incense in a small bronze burner beside the fish. It burns down over 108 knocks
// done by hand; outsourced knocks do not burn it. Its smoke is a streakline (points emitted at the ember
// and carried by a smooth air field), so it rises straight, starts to sway, then curls and thins out.
// Every number below is in units of R (layout base unit) unless it says px.

const TAU = Math.PI * 2
export const STICK_KNOCKS = 108

const COAT = 0.95 // incense-coated length when new
const STEM = 0.13 // bare red bamboo foot above the ash (香脚)
const TILT = -0.07 // ~4 deg, leaning away from the fish
const LIFE = 4.6 // s a smoke point lives
const EMIT = 1 / 24 // s between smoke points
const MAX_STEMS = 7 // spent feet left standing in the ash

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

interface Pt {
  x: number
  y: number
  born: number
  kv: number // knock push, px/s, decays
  s0: number // birth time of the first point of this unbroken run of smoke
  e0: number // y it was emitted at: heights in the air field are measured from here, so a new taller stick does not jolt an old wisp
}

/** a run of smoke fades in at its head and out at its tail, so a wisp never ends in a hard bright tip */
const FADE = 0.5

/** Bronze bowl of ash, baked into the background. (x, y) = centre of the ash surface. */
export function bakeBurner(c: CanvasRenderingContext2D, x: number, y: number, R: number) {
  const w = 0.22 * R // half width of the mouth
  const ry = 0.055 * R // mouth ellipse half height
  const h = 0.2 * R // body depth below the mouth
  // shadow on the table
  c.save()
  c.translate(x + 0.03 * R, y + h + 0.01 * R)
  c.scale(1, 0.25)
  const sh = c.createRadialGradient(0, 0, 0.02 * R, 0, 0, 0.42 * R)
  sh.addColorStop(0, 'rgba(0,0,0,0.6)')
  sh.addColorStop(1, 'rgba(0,0,0,0)')
  c.fillStyle = sh
  c.fillRect(-0.5 * R, -0.5 * R, R, R)
  c.restore()
  // three stub feet
  c.fillStyle = '#24170A'
  for (const fx of [-0.6, 0, 0.6]) {
    c.beginPath()
    c.ellipse(x + fx * w * 0.9, y + h - 0.005 * R + (fx === 0 ? 0.012 * R : 0), 0.03 * R, 0.022 * R, 0, 0, TAU)
    c.fill()
  }
  // body: a round-bellied bowl, lit from the spotlight up and to the right
  c.beginPath()
  c.moveTo(x - w, y)
  c.bezierCurveTo(x - w * 1.12, y + h * 0.55, x - w * 0.62, y + h, x, y + h)
  c.bezierCurveTo(x + w * 0.62, y + h, x + w * 1.12, y + h * 0.55, x + w, y)
  c.ellipse(x, y, w, ry, 0, 0, Math.PI, false)
  c.closePath()
  const body = c.createLinearGradient(x - w, 0, x + w, 0)
  body.addColorStop(0, '#2A1A08')
  body.addColorStop(0.45, '#5A3C17')
  body.addColorStop(0.7, '#7A5424')
  body.addColorStop(1, '#3A250C')
  c.fillStyle = body
  c.fill()
  c.save()
  c.clip()
  const shade = c.createLinearGradient(0, y, 0, y + h)
  shade.addColorStop(0, 'rgba(0,0,0,0)')
  shade.addColorStop(1, 'rgba(0,0,0,0.5)')
  c.fillStyle = shade
  c.fillRect(x - w * 1.2, y - ry, w * 2.4, h + 2 * ry)
  // soft specular on the belly
  c.save()
  c.translate(x + w * 0.32, y + h * 0.42)
  c.scale(1, 1.8)
  const sp = c.createRadialGradient(0, 0, 0, 0, 0, w * 0.32)
  sp.addColorStop(0, 'rgba(255,214,150,0.38)')
  sp.addColorStop(1, 'rgba(255,214,150,0)')
  c.fillStyle = sp
  c.fillRect(-w, -w, 2 * w, 2 * w)
  c.restore()
  // a cast band under the lip
  c.strokeStyle = 'rgba(20,10,2,0.45)'
  c.lineWidth = Math.max(0.8, 0.008 * R)
  c.beginPath()
  c.ellipse(x, y + 0.045 * R, w * 1.03, ry, 0, 0.1, Math.PI - 0.1)
  c.stroke()
  c.restore()
  // ash surface, slightly domed, a little speckled
  c.beginPath()
  c.ellipse(x, y, w * 0.93, ry * 0.86, 0, 0, TAU)
  const ash = c.createRadialGradient(x - w * 0.2, y - ry * 0.3, 0, x, y, w)
  ash.addColorStop(0, '#C9C0B3')
  ash.addColorStop(0.7, '#A89E91')
  ash.addColorStop(1, '#6E655A')
  c.fillStyle = ash
  c.fill()
  let s = 9
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  for (let i = 0; i < 26; i++) {
    const a = r() * TAU
    const d = Math.sqrt(r()) * 0.85
    c.fillStyle = r() < 0.5 ? 'rgba(80,72,62,0.35)' : 'rgba(235,228,218,0.4)'
    c.fillRect(x + Math.cos(a) * d * w, y + Math.sin(a) * d * ry * 0.8, Math.max(0.6, 0.006 * R), Math.max(0.6, 0.006 * R))
  }
  // rim: thin gold lip, brightest toward the light
  c.lineWidth = Math.max(1, 0.012 * R)
  const rim = c.createLinearGradient(x - w, 0, x + w, 0)
  rim.addColorStop(0, 'rgba(120,84,34,0.9)')
  rim.addColorStop(0.65, '#C9973B')
  rim.addColorStop(1, 'rgba(150,104,40,0.9)')
  c.strokeStyle = rim
  c.beginPath()
  c.ellipse(x, y, w, ry, 0, 0, TAU)
  c.stroke()
}

export interface IncenseOpts {
  /** knocks already burned on this stick (0..107) */
  burned: number
  sticks: number
}

export function makeIncense(opts: IncenseOpts) {
  let R = 100
  let bx = 0 // ash surface centre
  let by = 0
  let burned = opts.burned
  let sticks = opts.sticks
  let t = 0 // sim clock, s
  let emitAcc = 0
  let paused = true
  let lite = false // slow device: one strand, two passes
  let runS0 = 0
  let lastBorn = 0
  const runEnds = new Map<number, number>() // run start → last birth, once the ember stopped
  const strands: Pt[][] = [[], []]
  let flareT = -9 // last manual knock
  let auto = false
  let dimAuto = 1
  // stick life: 'lit' → 'out' (dims, last wisp) → 'swap' (new stick slides in) → 'lit'
  let phase: 'lit' | 'out' | 'swap' = 'lit'
  let phaseT = 0
  let lit = 1 // ember 0..1
  let ashN = burned % 12 // knocks since the ash tip last fell
  const flecks: { x: number; y: number; vx: number; vy: number; t: number }[] = []
  const gusts: { at: number; v: number; dir: number; ph: number }[] = []
  let gustN = 0

  let tapTimes: number[] = []

  const coatLeft = () => COAT * (1 - burned / STICK_KNOCKS)
  /** tip of the stick (top of the ash cap) and the ember point, in px */
  const geom = (slide = 0) => {
    const ux = Math.sin(TILT)
    const uy = -Math.cos(TILT)
    const len = (STEM + Math.max(0.012, coatLeft())) * R
    const ash = (0.014 + Math.min(1, ashN / 12) * 0.05) * R * (phase === 'lit' ? 1 : 0.6)
    const oy = -slide * 1.3 * R
    const base = [bx - 0.03 * R, by + oy]
    const ember = [base[0] + ux * len, base[1] + uy * len]
    return { ux, uy, base, ember, tip: [ember[0] + ux * ash, ember[1] + uy * ash], ash }
  }

  /** the air: rises, slows a little, sways with waves that travel up the plume; laminar near the ember */
  function step(dt: number) {
    t += dt
    // phase machine
    if (phase === 'out') {
      lit = Math.max(0, 1 - (t - phaseT) / 0.6)
      if (t - phaseT > 1.5) {
        phase = 'swap'
        phaseT = t
        burned = 0
        ashN = 0
      }
    } else if (phase === 'swap') {
      lit = smooth(0.3, 0.7, t - phaseT)
      if (t - phaseT > 0.7) phase = 'lit'
    }
    dimAuto += ((auto ? 0.6 : 1) - dimAuto) * Math.min(1, dt * 3)

    const g = geom()
    const ex = g.tip[0]
    const ey = g.tip[1]
    // emit while the ember is lit
    emitAcc += dt
    while (emitAcc >= EMIT) {
      emitAcc -= EMIT
      if (lit > 0.15 && !(phase === 'swap' && t - phaseT < 0.35)) {
        const born = t - emitAcc
        if (paused) runS0 = born
        for (let k = 0; k < 2; k++) strands[k].push({ x: ex, y: ey, born, kv: 0, s0: runS0, e0: ey })
        paused = false
        lastBorn = born
      } else if (!paused) {
        paused = true
        runEnds.set(runS0, lastBorn)
        for (const k of runEnds.keys()) if (t - runEnds.get(k)! > LIFE) runEnds.delete(k)
      }
    }
    // the knock arrives with the sound ring
    // every knock lands (queued), but fast knocking cannot stack the push past one strong knock
    while (gusts.length && t >= gusts[0].at) {
      const gu = gusts.shift()!
      const cap = 0.8 * gu.v * R
      for (const s of strands)
        for (const p of s) {
          const h = (p.e0 - p.y) / R
          const kv = p.kv + gu.dir * gu.v * R * (0.05 + 0.95 * Math.sin(h * 7 + gu.ph)) * smooth(-0.05, 0.3, h)
          p.kv = Math.max(-cap, Math.min(cap, kv))
        }
    }
    const drift = 0.05 * Math.sin(t * 0.21) + 0.03 * Math.sin(t * 0.37 + 2)
    const kd = Math.exp(-dt / 0.4)
    for (let k = 0; k < 2; k++) {
      const s = strands[k]
      while (s.length && t - s[0].born > LIFE) s.shift()
      const ph = k * 0.9
      for (const p of s) {
        const h = Math.max(0, (p.e0 - p.y) / R)
        const turb = smooth(0.35, 1.25, h)
        const b = p.born
        // waves keyed to emission time travel upward with the smoke: the curls rise instead of waving in place
        const w1 = Math.sin(b * 2.73 + h * 1.9 + ph * 0.3)
        const w2 = Math.sin(b * 1.69 - h * 2.6 + 1.3 + ph)
        const w3 = Math.sin(b * 4.1 + h * 3.3 + 0.4 + ph * 1.7)
        const vx = drift + turb * (0.16 * w1 + 0.11 * w2 + 0.05 * w3 * turb) + turb * turb * 0.05 * (k ? 1 : -1) * Math.sin(b * 0.9)
        const vy = -(0.5 - 0.1 * Math.min(h, 2)) + turb * 0.12 * Math.cos(b * 2.73 + h * 1.9 + ph * 0.3)
        p.x += (vx * R + p.kv) * dt
        p.y += vy * R * dt
        p.kv *= kd
      }
    }
    // ash flecks
    for (let i = flecks.length - 1; i >= 0; i--) {
      const f = flecks[i]
      f.t += dt
      if (f.y < by - 0.01 * R) {
        f.vy += 2 * R * dt
        f.x += f.vx * dt
        f.y += f.vy * dt
      }
      if (f.t > 2.2) flecks.splice(i, 1)
    }
  }

  return {
    layout(r: number, x: number, y: number) {
      const dx = x - bx
      const dy = y - by
      const k = r / R
      R = r
      bx = x
      by = y
      // keep live smoke attached after a resize
      for (const s of strands)
        for (const p of s) {
          p.x = x + (p.x - x + dx) * k
          p.y = y + (p.y - y + dy) * k
        }
    },
    /** fill the air so a fresh load already has a full plume */
    prewarm() {
      for (let i = 0; i < LIFE * 30; i++) step(1 / 30)
    },
    step,
    /** slow device: keep the smoke, at about half the cost */
    setLite(on: boolean) {
      lite = on
    },
    setAuto(on: boolean) {
      auto = on
    },
    get burned() {
      return burned
    },
    get sticks() {
      return sticks
    },
    /** A knock. Manual knocks burn the stick; returns true when this knock finished it. */
    knock(manual: boolean, tNowMs: number): boolean {
      if (!manual || phase !== 'lit') return false
      flareT = t
      burned++
      ashN++
      tapTimes.push(tNowMs)
      tapTimes = tapTimes.filter((x) => tNowMs - x < 1000)
      // the ash tip breaks off every 12 knocks, at once when knocking hard and fast
      if (ashN >= 12 || (tapTimes.length > 6 && ashN >= 3)) {
        const g = geom()
        flecks.push({ x: g.tip[0], y: g.tip[1], vx: (Math.random() - 0.5) * 0.08 * R, vy: 0, t: 0 })
        ashN = 0
      }
      if (burned >= STICK_KNOCKS) {
        phase = 'out'
        phaseT = t
        sticks++
        return true
      }
      return false
    },
    /** the fish was hit at (cx, cy): the air moves when the sound ring reaches the smoke */
    contact(cx: number, cy: number, v: number) {
      const g = geom()
      const d = Math.hypot(g.ember[0] - cx, g.ember[1] - cy) / R
      // mostly a shiver (the S flips with every knock), only a little net push, so steady knocking cannot blow the plume away
      gusts.push({ at: t + d / 4.5, v: 2.2 * v * Math.exp(-d / 4), dir: Math.sign(g.ember[0] - cx) || -1, ph: 1.1 + (gustN++ % 2) * Math.PI })
      if (gusts.length > 8) gusts.shift()
    },
    draw(c: CanvasRenderingContext2D) {
      const slide = phase === 'swap' ? 1 - easeOutBackClamp(Math.min(1, (t - phaseT) / 0.3)) : 0
      const g = geom(slide)
      const lw = Math.max(1, 0.015 * R)
      c.lineCap = 'round'
      // spent feet from earlier sticks, standing in the ash
      const n = Math.min(MAX_STEMS, phase === 'out' ? sticks - 1 : sticks) // the one just finished is still standing
      for (let i = 0; i < n; i++) {
        const a = i * 2.39996 + 0.7
        const d = 0.25 + 0.6 * ((i * 0.618 + 0.3) % 1)
        const x = bx + Math.cos(a) * d * 0.2 * R
        const y = by + Math.sin(a) * d * 0.045 * R
        const tl = 0.14 + 0.25 * Math.sin(i * 1.7)
        const len = (0.08 + 0.05 * ((i * 0.37) % 1)) * R
        c.strokeStyle = '#8E2A22'
        c.lineWidth = lw * 0.75
        c.beginPath()
        c.moveTo(x, y)
        c.lineTo(x + Math.sin(tl) * len, y - Math.cos(tl) * len)
        c.stroke()
        // charred tip
        c.strokeStyle = '#2A1A14'
        c.beginPath()
        c.moveTo(x + Math.sin(tl) * len * 0.92, y - Math.cos(tl) * len * 0.92)
        c.lineTo(x + Math.sin(tl) * len, y - Math.cos(tl) * len)
        c.stroke()
      }
      if (phase === 'swap' || phase === 'lit' || phase === 'out') {
        c.save()
        if (phase === 'swap') {
          c.beginPath()
          c.rect(bx - R, by - 3 * R, 2 * R, 3 * R) // the new stick goes into the ash, not through it
          c.clip()
          c.globalAlpha = Math.min(1, (t - phaseT) / 0.15)
        }
        const [x0, y0] = g.base
        const stemEnd = [x0 + g.ux * STEM * R, y0 + g.uy * STEM * R]
        // red bamboo foot
        c.strokeStyle = '#A3322A'
        c.lineWidth = lw * 0.8
        c.beginPath()
        c.moveTo(x0, y0)
        c.lineTo(stemEnd[0], stemEnd[1])
        c.stroke()
        // incense-coated part: dark sandalwood brown, a faint lit edge
        if (phase !== 'out') {
          c.strokeStyle = '#5E3A24'
          c.lineWidth = lw * 1.25
          c.beginPath()
          c.moveTo(stemEnd[0], stemEnd[1])
          c.lineTo(g.ember[0], g.ember[1])
          c.stroke()
          c.strokeStyle = 'rgba(214,160,110,0.35)'
          c.lineWidth = lw * 0.4
          c.beginPath()
          c.moveTo(stemEnd[0] + 0.3 * lw, stemEnd[1])
          c.lineTo(g.ember[0] + 0.3 * lw, g.ember[1])
          c.stroke()
        }
        // ash cap
        c.strokeStyle = '#B8B0A4'
        c.lineWidth = lw * 1.2
        c.beginPath()
        c.moveTo(g.ember[0], g.ember[1])
        c.lineTo(g.tip[0], g.tip[1])
        c.stroke()
        c.restore()
      }
      // ember: breathes at 0.3 Hz, flares on a hand knock, dim while outsourced
      const breathe = 0.9 + 0.1 * Math.sin(t * TAU * 0.3)
      const flare = t - flareT < 0.15 ? 1.4 : 1 + 0.4 * Math.max(0, 1 - (t - flareT - 0.15) / 0.25)
      const e = lit * breathe * flare * dimAuto
      if (e > 0.01) {
        const [x, y] = g.ember
        const gr = 0.075 * R
        const glow = c.createRadialGradient(x, y, 0, x, y, gr)
        glow.addColorStop(0, `rgba(255,140,60,${Math.min(0.6, 0.32 * e)})`)
        glow.addColorStop(0.35, `rgba(255,110,40,${Math.min(0.25, 0.12 * e)})`)
        glow.addColorStop(1, 'rgba(255,100,30,0)')
        c.fillStyle = glow
        c.fillRect(x - gr, y - gr, 2 * gr, 2 * gr)
        c.fillStyle = `rgba(255,122,46,${Math.min(1, e)})`
        c.beginPath()
        c.arc(x, y, 0.012 * R, 0, TAU)
        c.fill()
        c.fillStyle = `rgba(255,217,160,${Math.min(1, e * 0.9)})`
        c.beginPath()
        c.arc(x, y, 0.006 * R, 0, TAU)
        c.fill()
      }
      // falling ash
      for (const f of flecks) {
        c.fillStyle = `rgba(200,192,180,${Math.max(0, 1 - Math.max(0, f.t - 1) / 1.2)})`
        c.beginPath()
        c.arc(f.x, f.y, 0.012 * R, 0, TAU)
        c.fill()
      }
    },
    /** smoke goes behind the fish (the burner stands further back) */
    drawSmoke(c: CanvasRenderingContext2D) {
      const ey = geom().tip[1]
      const top = ey - 2.4 * R
      const puff = phase === 'out' ? 1 + Math.max(0, 1 - (t - phaseT) / 0.8) : 1
      const passes: [number, number, number, number][] = [
        // width (R), alpha, where alpha peaks (0 = ember, 1 = top), how far it reaches
        [0.075, 0.04, 0.45, 1],
        [0.026, 0.075, 0.25, 0.85],
        [0.011, 0.16, 0.06, 0.6],
      ]
      // newest point (at the ember) first; the strand is cut into runs of equal fade, each one Path2D
      const groups: [Path2D, number][][] = [[], []]
      const nStrands = lite ? 1 : 2
      for (let k = 0; k < nStrands; k++) {
        const s = strands[k]
        if (s.length < 3) continue
        const fade = (p: Pt) => {
          const end = runEnds.get(p.s0) ?? Infinity
          // once the ember is out, the last wisp thins away over 2.5 s
          const f = Math.min(1, (p.born - p.s0) / FADE, (end - p.born) / FADE, end === Infinity ? 1 : 1 - (t - end) / 2.5)
          return Math.round(Math.max(0, f) * 8) / 8
        }
        let level = fade(s[s.length - 1])
        let path = new Path2D()
        let px = s[s.length - 1].x
        let py = s[s.length - 1].y
        path.moveTo(px, py)
        for (let i = s.length - 2; i > 0; i--) {
          const p = s[i]
          const q = s[i - 1]
          if (p.s0 !== q.s0) {
            // the ember went out between these two: do not join a new run to an old wisp
            path.lineTo(p.x, p.y)
            groups[k].push([path, level])
            path = new Path2D()
            px = q.x
            py = q.y
            path.moveTo(px, py)
            level = fade(q)
            continue
          }
          const lv = fade(p)
          if (lv !== level) {
            groups[k].push([path, level])
            path = new Path2D()
            path.moveTo(px, py)
            level = lv
          }
          px = (p.x + q.x) / 2
          py = (p.y + q.y) / 2
          path.quadraticCurveTo(p.x, p.y, px, py)
        }
        groups[k].push([path, level])
      }
      c.lineCap = 'butt'
      c.lineJoin = 'bevel'
      for (const [w, a0, peak, reach] of lite ? [passes[0], passes[2]] : passes) {
        const x = c
        const gr = c.createLinearGradient(0, ey, 0, top)
        gr.addColorStop(0, 'rgba(225,222,215,0)')
        gr.addColorStop(0.02, `rgba(225,222,215,${a0 * puff * 0.5})`)
        gr.addColorStop(peak, `rgba(225,222,215,${a0 * puff})`)
        gr.addColorStop(reach, 'rgba(225,222,215,0)')
        if (reach < 1) gr.addColorStop(1, 'rgba(225,222,215,0)')
        x.strokeStyle = gr
        x.lineWidth = w * R
        for (let k = 0; k < nStrands; k++)
          for (const [path, lv] of groups[k]) {
            if (lv <= 0) continue
            x.globalAlpha = lv * (k ? 0.75 : 1)
            x.stroke(path)
          }
      }
      c.globalAlpha = 1
    },
    /** dev: jump to a stick state */
    set(b: number) {
      burned = Math.max(0, Math.min(STICK_KNOCKS - 1, b))
      ashN = burned % 12
      phase = 'lit'
      lit = 1
    },
  }
}

function easeOutBackClamp(p: number) {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2)
}

export type Incense = ReturnType<typeof makeIncense>
