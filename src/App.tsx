import { useEffect, useRef, useState } from 'react'
import { MoreMenu } from './components/MoreMenu'
import { applyMeta, locale, t } from './i18n'
import { startAnalytics, track } from './analytics'
import { arrive, landing, live, openSheet, parseWords, sharePeak, stats, store, syncWordsToUrl, trackLanding, wordsFromUrl } from './share'
import { Hint } from './components/Hint'
import { Tag } from './components/Tag'
import { IconAuto, IconMallet } from './components/Icons'
import { IconKnock } from './components/ToyIcons'
import { startGame, type GameApi } from './game'

const AUTO_STEPS = [0, 1, 2] as const
const fmt = new Intl.NumberFormat(locale)

export default function App() {
  const ref = useRef<HTMLCanvasElement>(null)
  const api = useRef<GameApi | null>(null)
  const urlTimer = useRef<number | undefined>(undefined)
  const gaTimer = useRef<number | undefined>(undefined)
  const toastTimer = useRef<number | undefined>(undefined)
  const [touched, setTouched] = useState(false)
  // Words from a shared link (?w=KPI -1,老板 -1) pre-fill the box and the floating text.
  const [initial] = useState(() => wordsFromUrl())
  const [text, setText] = useState(() => initial.join(', '))
  const [count, setCount] = useState({ total: 0, today: 0 })
  const [bump, setBump] = useState(0)
  const [toast, setToast] = useState<{ text: string; id: number } | null>(null)
  const [auto, setAuto] = useState(0)
  const [bigUnlocked, setBigUnlocked] = useState(false)
  const [big, setBig] = useState(false)
  // a recipient answering: the box opens empty, with its own placeholder; done typing, the sheet comes back
  const box = useRef<HTMLInputElement>(null)
  const [ph, setPh] = useState('')

  useEffect(() => {
    applyMeta('knock')
    // a link with something in it: the title (what WeChat shows when it is forwarded) says so
    if (landing.recipient) document.title = t('knock_tag')
    startAnalytics('knock')
    stats.words = initial
    trackLanding({ words: initial.length })
    let last = -1
    let wordKnocks = 0
    const data = () => ({ ...g.ledger(), wordKnocks })
    const g = startGame(
      ref.current!,
      {
        onFirst() {
          setTouched(true)
          track('play_start')
        },
        onCount(total, today) {
          if (last >= 0 && total > last && stats.words?.length) wordKnocks++
          last = total
          stats.n = total
          setCount({ total, today })
          setBump((b) => b + 1)
          if (total >= 108) setBigUnlocked(true)
        },
        onToast(msg) {
          setToast({ text: msg, id: Date.now() })
          window.clearTimeout(toastTimer.current)
          toastTimer.current = window.setTimeout(() => setToast(null), 3200)
        },
        onBigUnlocked() {
          setBigUnlocked(true)
          window.setTimeout(() => {
            setToast({ text: t('knock_big_unlock'), id: Date.now() })
            window.clearTimeout(toastTimer.current)
            toastTimer.current = window.setTimeout(() => setToast(null), 3200)
          }, 3300)
        },
        onPeak(kind) {
          // the merit statement: offered when a stick burns out; later milestones only refresh it
          if (kind === 'milestone') {
            if (store.peak) sharePeak('knock', { snap: store.peak.snap, data: data() }, true)
            return
          }
          g.snapSoon((snap) => sharePeak('knock', { snap, data: data() }))
        },
      },
      initial,
      landing.recipient ? initial : [],
    )
    api.current = g
    live.snap = () => g.crop()
    live.data = data
    try {
      setBig(localStorage.getItem('knock.big') === '1')
    } catch {
      /* ignore */
    }
    // a portal visit (from charge's pufferfish, scratch's merit prize): a tag where a recipient's would sit
    arrive('knock', ['top-[9.4rem]', 'bg-[#8E1F2B] text-[#F6D98B] font-medium'])
    return () => g.dispose()
  }, [initial])

  const onText = (value: string) => {
    setText(value)
    const words = parseWords(value)
    stats.words = words
    api.current?.setWords(words)
    window.clearTimeout(urlTimer.current)
    urlTimer.current = window.setTimeout(() => syncWordsToUrl(words), 300)
    window.clearTimeout(gaTimer.current)
    if (words.length) gaTimer.current = window.setTimeout(() => track('custom_text_set', { count: words.length }), 1500)
  }

  live.reply = () => {
    onText('')
    setPh(t('knock_reply_ph'))
    box.current?.focus()
  }
  const sendReply = () => {
    if (!ph || !parseWords(text).length) return
    setPh('')
    window.clearTimeout(urlTimer.current)
    syncWordsToUrl(parseWords(text))
    openSheet('reply')
  }

  const cycleAuto = () => {
    const next = AUTO_STEPS[(AUTO_STEPS.indexOf(auto as 0 | 1 | 2) + 1) % AUTO_STEPS.length]
    setAuto(next)
    api.current?.setAuto(next)
    if (next > 0) track('auto_on', { rate: next })
    else track('auto_off')
  }

  const toggleBig = () => {
    const b = !big
    setBig(b)
    api.current?.setBig(b)
  }

  const pill =
    'inline-flex min-h-[44px] items-center gap-2 rounded-full border border-amber-100/20 bg-black/25 px-[14px] text-sm font-medium leading-none text-amber-50/85 backdrop-blur-md hover:bg-black/35 active:scale-95'

  return (
    <>
      <canvas ref={ref} />
      <input
        ref={box}
        value={text}
        maxLength={140}
        placeholder={ph || t('knock_placeholder')}
        enterKeyHint="done"
        onPointerDown={(e) => e.stopPropagation()}
        onChange={(e) => onText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        onBlur={sendReply}
        className="fixed left-1/2 top-3 z-20 w-80 max-w-[86vw] -translate-x-1/2 rounded-full border border-amber-100/20 bg-black/20 px-4 py-1.5 text-center text-base text-amber-50 placeholder-amber-50/45 outline-none backdrop-blur-md focus:border-amber-100/40 focus:bg-black/30"
      />
      <div className="pointer-events-none fixed inset-x-0 top-16 z-10 select-none text-center" style={{ color: 'rgba(246,217,139,0.8)' }}>
        <div className="text-[13px] font-semibold uppercase tracking-[0.3em] opacity-70">{t('knock_label')}</div>
        <div key={bump % 2} className="knock-bump text-4xl font-semibold tabular-nums leading-tight">
          {fmt.format(count.total)}
        </div>
        <div className="mt-0.5 text-xs tabular-nums opacity-60">{t('knock_today', { n: fmt.format(count.today) })}</div>
      </div>
      {toast && (
        <div key={toast.id} className={`knock-toast pointer-events-none fixed inset-x-0 top-[9.6rem] z-10 px-6 text-center text-base font-medium`} style={{ color: 'rgba(255,238,205,0.92)' }}>
          {toast.text}
        </div>
      )}
      <Hint text={t('hint_knock')} hidden={touched} />
      {landing.recipient && (
        <Tag
          text={initial.length ? t('knock_tag_words', { w: initial.join(locale === 'zh-CN' || locale === 'ja' ? '，' : ', ') }) : t('knock_tag')}
          className="top-[9.4rem]"
          paper="bg-[#8E1F2B] text-[#F6D98B] font-medium"
        />
      )}
      {bigUnlocked && (
        <button
          type="button"
          onClick={toggleBig}
          aria-label={big ? t('knock_small') : t('knock_big')}
          title={big ? t('knock_small') : t('knock_big')}
          className={`fixed left-3 top-16 z-20 ${pill} w-11 justify-center !px-0 ${big ? 'border-amber-200/50 bg-amber-200/15' : ''}`}
        >
          <IconKnock />
        </button>
      )}
      <div className="fixed bottom-3 left-3 z-20 flex items-end gap-2 select-none" onPointerDown={(e) => e.stopPropagation()}>
        <button type="button" onClick={cycleAuto} className={`${pill} max-[400px]:!px-2.5 max-[400px]:!text-[13px] ${auto ? 'border-amber-200/50 bg-amber-200/15 text-amber-100' : ''}`}>
          {/* narrow phones: the label is the joke, the icon gives way so the row fits beside Share and More */}
          <span className="max-[430px]:hidden">{auto ? <IconAuto /> : <IconMallet />}</span>
          {auto ? t('knock_auto_on', { r: auto }) : t('knock_auto_off')}
        </button>
      </div>
      <MoreMenu current="knock" />
    </>
  )
}
