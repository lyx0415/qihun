import { ArrowLeft, BookOpen, Hand, Lightbulb, Settings2, Trophy, X } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { announceSequence, effect, stopVoice, unlockAudio } from '../audio'
import type { Settings } from '../store'
import { Dialog } from '../ui'
import { advance, canPass, classify, deal, faceOf, labels, names, recommendation, seatList, suitOf } from './rules'
import type { CardAction, CardMatch, Seat, Table } from './rules'
import { speechForCards } from './voice'
import { ReplayControls } from '../ReplayControls'
import { useTimeline } from '../timeline'

const role = (table: Table, seat: Seat) => table.landlord === undefined ? '玩家' : table.landlord === seat ? '地主' : '农民'
const shortCard = (id: number) => id >= 52 ? faceOf(id) : faceOf(id) + suitOf(id)
const powerHands = ['bomb', 'rocket', 'straightFlush', 'fourOne']

function CardFace({ id }: { id: number }) {
  const suit = suitOf(id)
  const red = suit === '♥' || suit === '♦' || id === 53
  return <span className={'card-face' + (red ? ' red-suit' : '')}><span className="card-value">{faceOf(id)}</span>
    <span className="card-pip" aria-hidden="true">{suit}</span></span>
}

function actionName(action: CardAction, table: Table) {
  if (action.type === 'pass') return '过牌'
  if (action.type === 'bid') return action.value ? '叫 ' + action.value + ' 分' : '不叫'
  const pattern = classify(action.cards, table.options.game)
  return [pattern ? labels[pattern.kind] : '', action.cards.map(shortCard).join(' ')].join(' · ')
}

function playSound(previous: Table, action: CardAction, next: Table, settings: Settings, solo: boolean) {
  unlockAudio()
  const kind = next.last?.pattern.kind
  const power = action.type === 'bid' ? previous.round !== next.round ? 'flip' : 'move' : action.type === 'pass' ? 'message'
    : kind === 'rocket' ? 'rocketBlast' : kind === 'straightFlush' ? 'flushBurst' : kind === 'bomb' || kind === 'fourOne' ? 'bombBlast'
      : action.cards.length >= 4 ? 'cardRun' : 'cardPlay'
  effect(power, settings.sound, settings.soundStyle)
  const lose = next.result && solo && next.result.scores[0] < 0
  if (next.result) effect(lose ? 'defeat' : 'end', settings.sound, settings.soundStyle, power === 'cardPlay' ? .22 : .52)
  announceSequence(speechForCards(previous, action, next, solo, settings.voiceDetail === 'full'),
    settings.voice, power === 'cardPlay' && !next.result)
}

type Props = {
  match: CardMatch
  settings: Settings
  profileName: string
  reviewing: boolean
  paused: boolean
  onBack(): void
  onReview(): void
  onNew(): void
  onSettings(): void
  save(action: CardAction, next: Table): void
}

export function CardDesk({ match, settings, profileName, reviewing, paused, onBack, onReview, onNew, onSettings, save }: Props) {
  const initial = useCallback(() => deal(match.options, match.seed), [match.options, match.seed])
  const frames = useTimeline(match.id, initial, advance, match.actions)
  const [step, setStep] = useState(0)
  const [visibleStep, reveal] = useState<number>()
  const [chosen, choose] = useState<number[]>([])
  const [rulesOpen, showRules] = useState(false)
  const cursor = reviewing ? Math.min(step, frames.length - 1) : frames.length - 1
  const table = frames[cursor]
  const seats = seatList(table.options.game)
  const fourSeats = seats.length === 4
  const latest = cursor ? match.actions[cursor - 1] : undefined
  const active = !reviewing && table.phase !== 'end'
  const bot = active && match.mode === 'solo' && table.turn !== 0
  const showHand = active && !bot && (match.mode === 'solo' || visibleStep === cursor)
  const hand = match.mode === 'solo' ? table.hands[0] : showHand ? table.hands[table.turn] : []
  const players = seats.map(seat => match.mode === 'solo' ? (seat === 0 ? profileName : '电脑 ' + seat) : '玩家 ' + (seat + 1))
  const mayPlay = showHand && table.phase === 'play'
  const action: CardAction = { type: 'play', cards: chosen }
  const validSelection = mayPlay && chosen.length > 0 && advance(table, action) !== table
  const passable = mayPlay && canPass(table)
  const pattern = chosen.length ? classify(chosen, table.options.game) : undefined
  const lastPower = table.last && powerHands.includes(table.last.pattern.kind)

  function commit(move: CardAction) {
    const next = advance(table, move)
    if (next === table) return
    playSound(table, move, next, settings, match.mode === 'solo')
    choose([])
    save(move, next)
  }

  const commitRef = useRef(commit)
  commitRef.current = commit
  useEffect(() => () => stopVoice(), [])
  useEffect(() => {
    if (!bot || paused) return
    const timer = window.setTimeout(() => commitRef.current(recommendation(table, true)), settings.voice ? 1250 : 580)
    return () => window.clearTimeout(timer)
  }, [bot, table, settings.voice, paused])

  const caption = table.result?.label ?? (latest?.type === 'pass' ? (table.last ? '过牌' : '本轮收牌，重新领出') :
    table.last ? players[table.last.seat] + ' · ' + labels[table.last.pattern.kind] :
    table.phase === 'bid' ? '第 ' + (table.round + 1) + ' 次发牌 · 轮流叫分' : '等待首手出牌')

  return <section className={'card-desk table-' + table.options.game + ' deck-' + settings.cardSkin}>
    <header className="desk-heading">
      <button className="icon-button" aria-label="返回牌类" onClick={onBack}><ArrowLeft size={20} /></button>
      <div><h1>{names[table.options.game]}{reviewing ? '复盘' : ''}</h1>
        <p>{match.rules} · {match.mode === 'solo' ? '人机牌桌' : fourSeats ? '四人同屏接力' : '三人同屏接力'}</p></div>
      <button className="icon-button desk-settings" aria-label="对局设置" onClick={onSettings}><Settings2 size={20} /></button>
    </header>
    <div className={'felt-table' + (lastPower ? ' power-table' : '')}>
      <div className={'table-seats' + (fourSeats ? ' four-seats' : '')}>{seats.map(seat => <div className={'table-seat' + (seat === table.turn && active ? ' table-current' : '')} key={seat}>
        <strong>{players[seat]}</strong><span>{role(table, seat)} · {table.hands[seat].length} 张</span></div>)}</div>
      <div className="table-middle">
        {table.options.game === 'landlord' && <div className="table-meta">
          {table.phase === 'bid' ? '底牌 3 张 · 当前叫分 ' + table.bid : <>底牌 {table.bottom.map(shortCard).join(' ')} · {table.multiplier} 倍</>}
        </div>}
        {table.last ? <div key={table.last.seat + ':' + table.played}
          className={'played-cards' + (settings.animation && !reviewing ? ' animate-cards' : '') +
            (lastPower ? ' bomb-play' : table.last.cards.length >= 4 ? ' run-play' : '')}>
          {table.last.cards.map(id => <CardFace id={id} key={id} />)}
        </div> : <div className="table-emblem" aria-hidden="true">♠</div>}
        <p className="table-caption" aria-live="polite">{caption}</p>
      </div>
    </div>
    {reviewing && <ReplayControls cursor={cursor} last={frames.length - 1} onStep={setStep} />}
    {active && <section className="card-hand-panel" aria-label="手牌区">
      <div className="hand-title"><strong>{match.mode === 'solo' ? '我的手牌' : players[table.turn] + '的回合'}</strong>
        <span aria-live="polite">{bot ? players[table.turn] + '思考中' : showHand ? (table.phase === 'bid' ? '请选择叫分' :
          chosen.length ? (pattern ? labels[pattern.kind] : '未组成牌型') :
          !table.played && table.options.game !== 'landlord' ? (fourSeats ? '首手含方块 3' : '首手含黑桃 3') :
          '请选择手牌') : '请交接设备'}</span>
      </div>
      {match.mode === 'local' && !showHand ? <div className="hand-off">
        <p>将设备交给{players[table.turn]}，确认后显示手牌。</p>
        <button className="button primary" onClick={() => {
          unlockAudio()
          reveal(cursor)
          announceSequence(['cardReady'], settings.voice && settings.voiceDetail === 'full', true)
        }}><Hand size={17} />我已接手</button>
      </div> : <div className="card-hand">
        {hand.map(id => <button type="button" className={'hand-card' + (chosen.includes(id) ? ' chosen' : '')}
          key={id} disabled={!mayPlay} aria-pressed={chosen.includes(id)} aria-label={shortCard(id)}
          onClick={() => choose(list => list.includes(id) ? list.filter(card => card !== id) : [...list, id])}><CardFace id={id} /></button>)}
      </div>}
      {showHand && table.phase === 'bid' && <div className="card-actions">
        {([0, 1, 2, 3] as const).map(value => <button key={value} className={'button ' + (value ? 'primary' : 'secondary')}
          disabled={value !== 0 && value <= table.bid} onClick={() => commit({ type: 'bid', value })}>{value ? '叫 ' + value + ' 分' : '不叫'}</button>)}
      </div>}
      {mayPlay && <div className="card-actions">
        {settings.hints && <button className="button secondary" onClick={() => {
          const hint = recommendation(table)
          choose(hint.type === 'play' ? hint.cards : [])
          announceSequence(['hint'], settings.voice && settings.voiceDetail === 'full', true)
        }}><Lightbulb size={16} />提示</button>}
        {chosen.length > 0 && <button className="button secondary" onClick={() => {
          choose([])
          announceSequence(['cardCleared'], settings.voice && settings.voiceDetail === 'full', true)
        }}><X size={15} />清空</button>}
        <button className="button secondary" disabled={!passable} onClick={() => commit({ type: 'pass' })}>不出</button>
        <button className="button primary" disabled={!validSelection} onClick={() => commit(action)}>出牌</button>
      </div>}
    </section>}
    {!reviewing && table.result && <div className="panel card-result"><Trophy size={24} /><h2>{table.result.label}</h2>
      <p>{table.result.scores.map((score, seat) => players[seat] + ' ' + (score > 0 ? '+' : '') + score).join(' · ')}</p>
      <div className="card-actions"><button className="button secondary" onClick={onReview}>复盘</button>
        <button className="button primary" onClick={onNew}>再开一局</button></div>
    </div>}
    <div className="card-desk-footer"><button className="action-button" onClick={() => showRules(true)}><BookOpen size={16} />规则</button>
      {active && <button className="action-button" onClick={onNew}>新开局</button>}</div>
    <section className="panel card-log"><div className="panel-title"><h2>牌局记录</h2><span>{match.actions.length} 步</span></div>
      <div className="moves-list">{match.actions.slice(0, frames.length - 1).map((move, index) =>
        <button key={index} disabled={!reviewing} className={'move-row' + (index + 1 === cursor ? ' move-current' : '')}
          onClick={() => setStep(index + 1)}><span>{index + 1}</span><span>{frames[index].turn + 1} 号</span>
          <strong>{actionName(move, frames[index])}</strong></button>)}</div>
    </section>
    {rulesOpen && <Dialog title={match.rules} onClose={() => showRules(false)}><ul className="guide-list">
      {table.options.game === 'landlord' ? <>
        <li>54 张牌，三人各 17 张，另有 3 张底牌。轮到时可不叫或提高叫分，最高 3 分。全不叫时重新发牌。</li>
        <li>地主收底牌并先出。两名农民合作，任一农民出完即为农民获胜。炸弹和王炸翻倍，以叫分乘倍数结算。</li>
        <li>支持四带二、四带两对和飞机带单或对。</li>
      </> : fourSeats ? <>
        <li>无王的 52 张牌，四人各 13 张。方块 3 持有者先出，首手须带方块 3。点数 3 最小，2 最大。花色从小到大为方块、梅花、红桃、黑桃。</li>
        <li>单张、对子、三张同型比较，同点数的同型牌比较最高花色。五张牌从小到大为顺子、同花、葫芦、四条带一、同花顺，任何五张牌型只能压五张。</li>
        <li>顺子和同花顺只用 3 到 A。比较顺子先看最大牌点数再看花色。同花先比花色，再依次比较点数。葫芦比较三条，四条比较四张同点。</li>
        <li>连续三家过牌后，由最后出牌者重新领出。首个出完的人获胜，每张余牌计一分。</li>
      </> : <>
        <li>{table.options.deckSize === 15 ? '45 张牌。去大小王、非黑桃的 2 与 A、方块 K，三人各 15 张。'
          : '48 张牌。去大小王、三个非黑桃 2 与黑桃 A，三人各 16 张。'}黑桃 3 持有者先出，首手必须带出该牌。</li>
        <li>{table.options.mustBeat ? '有能压过的牌时必须出。' : '允许主动过牌。'} 先出完获胜，按其它玩家各自剩余牌数计分。</li>
        <li>两对连续即可连对。支持三张、三带一、三带二、飞机和四张炸弹。</li>
      </>}
      {!fourSeats && <li>同型同张数比大小，炸弹可压其它牌型。顺子至少五张，连牌不含 2 或王。连续两家不出后，由上一手出牌者重新领出。</li>}
    </ul></Dialog>}
  </section>
}
