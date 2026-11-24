import { ArrowLeft, BookOpen, Bot, Dices, Flag, Handshake, Lightbulb, MessageCircle, RotateCcw, Scan, Settings2, Swords, Trophy, Undo2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Board } from './Board'
import { announceSequence, effect, stopVoice, unlockAudio } from './audio'
import { configuredRules, play } from './rules'
import { chooseMove, describeMove, pieceName } from './rules/ai'
import { darkColor } from './rules/dark'
import { checkedKing, moveFeedback } from './rules/feedback'
import { defaultFlight, flightFinish, flightSeatOrder } from './rules/flight'
import { areaScore } from './rules/go'
import { winningFive } from './rules/gomoku'
import { speechForMove } from './rules/voice-director'
import { other } from './rules/types'
import type { Move, Position, Side } from './rules/types'
import { xiangqiHandicaps } from './rules/xiangqi'
import type { Completed, Match, Settings } from './store'
import { Dialog, GameIcon } from './ui'
import { ReplayControls } from './ReplayControls'
import { useTimeline } from './timeline'

const levels = { novice: '入门', medium: '进阶', advanced: '挑战' }
const reactions = ['👏 好棋', '🤝 承让', '🌿 慢慢想', '😄 再来一盘']
type Props = {
  match: Match | Completed
  settings: Settings
  name: string
  reviewing?: boolean
  paused?: boolean
  onMove: (move: Move, next: Position) => void
  onUndo: (length: number) => void
  onBack: () => void
  onNew: () => void
  onReview: () => void
  onSettings: () => void
}

export function MatchDesk({ match, settings, name, reviewing, paused, onMove, onUndo, onBack, onNew, onReview, onSettings }: Props) {
  const game = useMemo(() => configuredRules(match.game, match.gridOptions), [match.game, match.gridOptions])
  const initial = useCallback(() => game.initial(match.id, match.handicap, match.flightOptions),
    [game, match.id, match.handicap, match.flightOptions])
  const pushMove = useCallback((prior: Position, action: Move) => play(game, prior, action), [game])
  const frames = useTimeline(match.id, initial, pushMove, match.moves)
  const final = frames[frames.length - 1]
  const [step, setStep] = useState(0)
  const cursor = reviewing ? Math.min(step, frames.length - 1) : frames.length - 1
  const position = frames[cursor]
  const [selected, select] = useState<number>()
  const pieceInPlay = position.jumpFrom ?? selected
  const [flipped, setFlipped] = useState(match.mode === 'ai' && match.human === 1)
  const [panel, setPanel] = useState<'rules' | 'resign' | 'draw' | 'interaction'>()
  const [promotion, setPromotion] = useState<Move[]>([])
  const [messages, setMessages] = useState<{ side: Side; text: string }[]>([])
  const [message, setMessage] = useState('')
  const [notice, setNotice] = useState('')
  const [hint, setHint] = useState<Move>()
  const [hintThinking, setHintThinking] = useState(false)
  const hintWorker = useRef<Worker | undefined>(undefined)
  const log = useRef<HTMLDivElement>(null)
  const isAi = !reviewing && !position.result && match.mode === 'ai' && position.turn !== match.human
  const interactive = !reviewing && !position.result && !isAi
  const valid = useMemo<Move[]>(() => interactive ? game.id === 'go' && !position.goScoring
    ? [{ type: 'pass' }] : game.legal(position) : [], [game, interactive, position])
  const forcedJump = game.id === 'checkers' && valid.some(move =>
    move.type === 'play' && move.from !== undefined && Math.abs(move.from % 8 - move.to % 8) === 2)
  const placed = game.id === 'go' || game.id === 'gomoku' || game.id === 'reversi'
  const checked = checkedKing(game, position)
  const check = checked >= 0 && !position.result
  const flight = position.flight
  const manyPlayers = (flight?.planes.length ?? 0) > 2
  const resignSide = match.mode === 'ai' ? match.human : position.turn
  const selectable = new Set(valid.flatMap(move => move.type === 'play' && move.from !== undefined ? [move.from] : []))
  const targets = new Set(valid.flatMap(move => move.type === 'play' && settings.hints &&
    ((pieceInPlay !== undefined && move.from === pieceInPlay) || game.id === 'reversi') ? [move.to] : []))
  if (hint?.type === 'play') {
    if (hint.from !== undefined) selectable.add(hint.from)
    targets.add(hint.to)
  }
  const latest = cursor ? match.moves[cursor - 1] : undefined
  const events = useMemo(() => latest ? moveFeedback(game, frames[cursor - 1], latest, frames[cursor]) : [],
    [game, frames, latest, cursor])
  const sceneEvents = events.filter(event => event.label && event.sound !== 'roll' && event.sound !== 'end' && event.sound !== 'draw')
  const marked = new Set(sceneEvents.filter(event => event.sound === 'atari').flatMap(event => event.cells ?? []))
  if (checked >= 0) marked.add(checked)
  const changed = new Set(sceneEvents.filter(event => event.sound === 'flip').flatMap(event => event.cells ?? []))
  const winning = game.id === 'gomoku' && latest?.type === 'play' && position.result?.reason === '五子连珠' && position.result.winner !== null
    ? winningFive(position, latest.to, position.result.winner) : []
  const scoring = position.goScoring
  const goKomi = match.gridOptions && 'komi' in match.gridOptions ? match.gridOptions.komi : 7.5
  const xiangqiHandicap = match.gridOptions && 'handicapPiece' in match.gridOptions ? match.gridOptions.handicapPiece : 'horse'
  const estimate = useMemo(() => scoring && areaScore(position.board, goKomi, scoring.dead), [position.board, scoring, goKomi])

  function commit(move: Move) {
    const next = play(game, position, move)
    if (next === position) return false
    unlockAudio()
    const feedback = moveFeedback(game, position, move, next).map(event =>
      event.sound === 'end' && match.mode === 'ai' && next.result?.winner !== match.human
        ? { ...event, sound: 'defeat' as const } : event)
    feedback.forEach((event, index) =>
      effect(event.sound, settings.sound, settings.soundStyle, index * .17))
    const speech = speechForMove(game.id, position, move, next, feedback)
    announceSequence(speech.cues, settings.voice && (!speech.routine || settings.voiceDetail === 'full'), speech.routine)
    select(undefined)
    setHint(undefined)
    setHintThinking(false)
    setPromotion([])
    setNotice(move.type === 'roll' && next.flight?.die === null ? `掷出 ${move.die} 点，无可移动棋子` : '')
    onMove(move, next)
    return true
  }

  const commitRef = useRef(commit)
  useEffect(() => () => stopVoice(), [])
  commitRef.current = commit
  const currentPosition = useRef(position)
  currentPosition.current = position
  useEffect(() => () => {
    hintWorker.current?.terminate()
    hintWorker.current = undefined
  }, [position])
  useEffect(() => {
    if (!isAi || paused) return
    let worker: Worker | undefined
    let cancelled = false
    let settled = false
    const deliver = (move: Move | null) => {
      if (cancelled || settled || currentPosition.current !== position) return
      settled = true
      if (move) commitRef.current(move)
    }
    const timer = setTimeout(() => {
      const fallback = () => {
        worker?.terminate()
        if (!cancelled && !settled) deliver(chooseMove(game, position, 'novice', 60))
      }
      try {
        worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' })
        worker.onmessage = (event: MessageEvent<Move | null>) => deliver(event.data)
        worker.onerror = fallback
        worker.postMessage({ game: game.id, grid: match.gridOptions, position, level: match.level })
      } catch {
        fallback()
      }
    }, game.id === 'flight' ? 350 : 300)
    return () => {
      cancelled = true
      clearTimeout(timer)
      worker?.terminate()
    }
  }, [game, isAi, match.level, match.gridOptions, position, paused])

  useEffect(() => {
    if (!reviewing && log.current) log.current.scrollTop = log.current.scrollHeight
  }, [cursor, reviewing])

  function onCell(index: number) {
    if (!interactive) return
    unlockAudio()
    if (game.id === 'go') {
      if (scoring) { if (position.board[index]) commit({ type: 'markDead', to: index }); return }
      if (!commit({ type: 'play', to: index })) showIllegal('这个点无法落子，请换一个交叉点。')
      return
    }
    const matching = valid.filter(move => move.type === 'play' && move.to === index &&
      (move.from === pieceInPlay || (game.id === 'dark' && move.from === undefined)))
    if (matching.length > 1) setPromotion(matching)
    else if (matching.length) commit(matching[0])
    else if (!placed && selectable.has(index)) {
      select(selected === index ? undefined : index)
      setNotice('')
      setHint(undefined)
    } else if (placed || pieceInPlay !== undefined) {
      showIllegal('这里不能落子，请选择合法位置。')
    }
  }

  function showIllegal(message: string) {
    if (notice !== message) announceSequence(['invalid'], settings.voice && settings.voiceDetail === 'full', true)
    setNotice(message)
  }

  function requestHint() {
    setHintThinking(true)
    const show = (recommended: Move | null) => {
      if (currentPosition.current !== position) return
      setHintThinking(false)
      if (!recommended) return
      setHint(recommended)
      if (recommended.type === 'play') select(recommended.from)
      setNotice(`建议：${describeMove(game, position, recommended)}`)
      announceSequence(['hint'], settings.voice && settings.voiceDetail === 'full', true)
    }
    try {
      const worker = new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' })
      hintWorker.current = worker
      worker.onmessage = (event: MessageEvent<Move | null>) => { worker.terminate(); show(event.data) }
      worker.onerror = () => { worker.terminate(); show(chooseMove(game, position, 'novice', 60)) }
      worker.postMessage({ game: game.id, grid: match.gridOptions, position, level: 'novice' })
    } catch {
      show(chooseMove(game, position, 'novice', 60))
    }
  }

  let undoLength = match.moves.length - 1
  if (match.mode === 'ai') {
    while (undoLength >= 0 && frames[undoLength].turn !== match.human) undoLength--
  }
  const undoable = !reviewing && !position.result && settings.undo && undoLength >= 0
  const winner = final.result?.winner
  const resultTitle = winner === null ? '和棋' : winner === undefined ? '' : `${game.sides[winner]}获胜`
  const canRoll = valid.some(move => move.type === 'roll')
  const canPass = valid.some(move => move.type === 'pass')
  const displayName = (side: Side) => match.mode === 'ai' ? (side === match.human ? name : manyPlayers ? `电脑 · ${game.sides[side]}` : '电脑')
    : (side === 0 ? name : manyPlayers ? `同屏棋友 · ${game.sides[side]}` : '同屏棋友')
  const player = (side: Side) => <div key={side} className={`player-row ${!position.result && position.turn === side ? 'player-current' : ''}`}>
    <span className={`player-icon player-side-${game.id === 'dark' ? darkColor(position, side) : side}`}>{match.mode === 'ai' && side !== match.human ? <Bot size={19} /> : game.sides[side][0]}</span>
    <span><strong>{displayName(side)}</strong><small>{game.sides[side]}{game.id === 'go' ? ` · 提 ${position.captured?.[side] ?? 0} 子` : ''}
      {game.id === 'reversi' ? ` · ${position.score?.[side === 0 ? 0 : 1] ?? 0} 子` : ''}
      {flight ? (flight.retired?.includes(side) ? ' · 已退出' : ` · 抵达 ${flight.planes[side].filter(value => value === flightFinish).length}/${flight.planes[side].length}`) : ''}
      {game.id === 'dark' && position.dark?.first !== undefined ? (darkColor(position, side) === 0 ? ' · 红棋' : ' · 黑棋') : ''}</small></span>
    {!position.result && position.turn === side && <span className="player-turn">{scoring ? '待确认数子' : isAi ? '思考中' : check ? '被将军' : '本方行棋'}</span>}
  </div>

  function sendReaction(text: string) {
    if (!text.trim()) return
    setMessages(list => [...list.slice(-19), { side: position.turn, text: text.trim() }])
    setMessage('')
    unlockAudio()
    effect('message', settings.sound, settings.soundStyle)
    announceSequence(['greeting'], settings.voice && settings.voiceDetail === 'full', true)
  }

  return <div className="desk">
    <header className="desk-heading">
      <button className="icon-button" onClick={onBack} aria-label="返回"><ArrowLeft size={22} /></button>
      <GameIcon game={game.id} size="small" />
      <div><h1>{game.name}{reviewing ? '复盘' : ''}</h1><p>{match.mode === 'local' ? '同屏对弈' : `人机对弈${game.id === 'flight' || game.id === 'dark' ? '' : ` · ${levels[match.level]}`}`}<span> · </span>{match.variant}</p></div>
      <button className="icon-button desk-settings" onClick={onSettings} aria-label="对局设置"><Settings2 size={22} /></button>
    </header>
    <div className="desk-columns">
      <section className="board-area">
        {flight ? <div className="flight-seats">{flightSeatOrder(flight.planes.length).map(player)}</div> : player(flipped ? 0 : 1)}
        <Board game={game} position={position} selected={pieceInPlay} selectable={settings.hints ? selectable : new Set()}
          targets={targets} latest={latest} step={cursor} flipped={flipped} coordinates={settings.coordinates}
          animation={settings.animation && !reviewing} readOnly={reviewing || !!position.result} onCell={onCell}
          marked={marked} changed={changed} theme={settings.boardTheme} jungleStyle={settings.jungleStyle}
          trail={settings.moveTrail} winning={winning} />
        {!flight && player(flipped ? 1 : 0)}
        {sceneEvents.length > 0 && <div className="move-feedback" aria-live="polite">{sceneEvents.map(event =>
          <span key={event.sound} className={event.sound === 'check' || event.sound === 'atari' ? 'feedback-alert' : ''}>{event.label}</span>)}</div>}
        {!reviewing && !position.result && <div className="play-status" aria-live="polite">
          {notice || (check ? (isAi ? '将军，电脑正在应将…' : '将军，请先应将。') : isAi ? '电脑正在思考…' : scoring ? '点击棋块标记死子，再确认数子。' :
            position.jumpFrom !== undefined ? '用高亮的棋子继续连跳。' : forcedJump ? '有子可吃，请跳吃。' :
            flight?.die ? `已掷出 ${flight.die} 点，请移动飞机。` :
            game.id === 'reversi' && canPass ? '当前无合法落点，请跳过回合。' :
            `${game.sides[position.turn]}${game.id === 'flight' ? '掷骰' : '行棋'}`)}
        </div>}
        {scoring && estimate && !position.result && <div className="go-count-panel">
          <strong>面积预估</strong> <span>黑 {estimate[0]} · 白 {estimate[1]} · 已确认 {scoring.accepted.length}/2</span>
        </div>}
        {reviewing ? <ReplayControls cursor={cursor} last={frames.length - 1} onStep={setStep} /> : !position.result && <div className="desk-actions">
          {game.id === 'flight' && <button className="action-button primary" disabled={!canRoll} onClick={() => {
            unlockAudio()
            commit({ type: 'roll', die: 1 + Math.floor(Math.random() * 6) })
          }}><Dices size={17} />掷骰</button>}
          {flight && latest?.type === 'roll' && <span className={`dice-face ${settings.animation ? 'dice-animate' : ''}`} key={cursor} aria-label={`骰子 ${latest.die} 点`}>{'⚀⚁⚂⚃⚄⚅'[latest.die - 1]}</span>}
          {(game.id === 'go' && !scoring || game.id === 'reversi' && canPass) && <button className="action-button" disabled={!canPass}
            onClick={() => commit({ type: 'pass' })}>{game.id === 'go' ? '停一手' : '跳过回合'}</button>}
          {scoring && <>
            <button className="action-button primary" disabled={!interactive} onClick={() => commit({ type: 'confirmScore' })}>确认数子</button>
            <button className="action-button" disabled={!interactive} onClick={() => commit({ type: 'resumePlay' })}>继续下棋</button>
          </>}
          <button className="action-button" disabled={!undoable} onClick={() => {
            select(undefined)
            setHint(undefined)
            setHintThinking(false)
            setNotice('')
            announceSequence(['undo'], settings.voice && settings.voiceDetail === 'full', true)
            onUndo(undoLength)
          }}><Undo2 size={17} />悔棋</button>
          {settings.hints && game.id !== 'flight' && !scoring && <button className="action-button" disabled={!interactive || hintThinking}
            onClick={requestHint}><Lightbulb size={17} />{hintThinking ? '计算建议…' : '建议'}</button>}
          {!flight?.retired?.includes(resignSide) && <button className="action-button" onClick={() => setPanel('resign')}><Flag size={17} />认输</button>}
        </div>}
      </section>
      <aside className="match-aside">
        {final.result && <section className="panel result-panel">
          <Trophy size={24} /><h2>{resultTitle}</h2><p>{final.result.reason}</p>
          <div className="button-row">
            {!reviewing && <button className="button secondary" onClick={onReview}>复盘</button>}
            <button className="button primary" onClick={onNew}><RotateCcw size={16} />再开一局</button>
          </div>
        </section>}
        <section className="panel moves-panel">
          <div className="panel-title"><h2>着法记录</h2><span>{match.moves.length} 步</span></div>
          <div className="moves-list" ref={log}>
            {!match.moves.length && <p className="empty-text">落下第一步后，这里会记录着法。</p>}
            {match.moves.slice(0, frames.length - 1).map((move, index) => {
              const before = frames[index]
              const row = <><span>{String(index + 1).padStart(2, '0')}</span><span>{game.sides[move.type === 'resign' ? move.side : before.turn]}</span><strong>{describeMove(game, before, move)}</strong></>
              return reviewing ?
                <button key={index} className={`move-row ${cursor === index + 1 ? 'move-current' : ''}`} onClick={() => setStep(index + 1)}>{row}</button> :
                <div key={index} className={`move-row ${cursor === index + 1 ? 'move-current' : ''}`}>{row}</div>
            })}
          </div>
        </section>
        <div className="aside-tools">
          <button className="action-button" onClick={() => setFlipped(!flipped)}><Scan size={16} />翻转</button>
          <button className="action-button" onClick={() => setPanel('rules')}><BookOpen size={16} />规则</button>
          {!reviewing && !position.result && match.mode === 'local' && <>
            {!manyPlayers && <button className="action-button" onClick={() => setPanel('draw')}><Handshake size={16} />求和</button>}
            <button className="action-button" onClick={() => setPanel('interaction')}><MessageCircle size={16} />互动</button>
          </>}
          {!reviewing && !position.result && <button className="action-button" onClick={onNew}><Swords size={16} />新开局</button>}
        </div>
        {messages.length > 0 && !reviewing && <div className="latest-message"><MessageCircle size={16} />{messages.at(-1)?.text}</div>}
      </aside>
    </div>
    {promotion.length > 0 && <Dialog title="选择升变棋子" onClose={() => setPromotion([])}>
      <div className="choice-grid">{promotion.map(move => move.type === 'play' && <button className="choice" key={move.promotion} onClick={() => commit(move)}>
        {pieceName(game.id, move.promotion ?? '', position.turn)}
      </button>)}</div>
    </Dialog>}
    {panel === 'rules' && <Dialog title={match.variant} onClose={() => setPanel(undefined)}>
      <ul className="guide-list">{game.guide.map(line => <li key={line}>{line}</li>)}
        {flight && <li>{flight.planes.length} 支队伍，每队 {flight.planes[0].length} 架。{(flight.options ?? defaultFlight).takeoff === 'six' ? '仅 6 点起飞。' : '1 或 6 点起飞。'}
          {(flight.options ?? defaultFlight).overshoot === 'bounce' ? '超过终点反弹。' : '点数超过终点时，该飞机不能走。'}
          {(flight.options ?? defaultFlight).colorJump ? '外圈亮色格允许本队向前跳四格。' : '同色跳跃关闭。'}</li>}
        {game.id === 'xiangqi' && match.handicap !== undefined && <li>{game.sides[match.handicap]}开局{xiangqiHandicaps[xiangqiHandicap]}，仍由红方先走。</li>}</ul>
    </Dialog>}
    {panel === 'resign' && <Dialog title="确认认输" onClose={() => setPanel(undefined)}>
      <p>{game.sides[resignSide]}{manyPlayers && (flight?.retired?.length ?? 0) < (flight?.planes.length ?? 0) - 2 ?
        '将退出，其余机队继续比赛。' : '认输后，本局将进入棋谱。'}</p>
      <div className="button-row"><button className="button secondary" onClick={() => setPanel(undefined)}>继续下棋</button>
        <button className="button danger" onClick={() => {
          setPanel(undefined)
          commit({ type: 'resign', side: resignSide })
        }}>{manyPlayers ? '确认退出' : '认输并结算'}</button></div>
    </Dialog>}
    {panel === 'draw' && <Dialog title="申请和棋" onClose={() => setPanel(undefined)}>
      <p>{game.sides[position.turn]}提出和棋，请把设备交给{game.sides[other(position.turn)]}确认。</p>
      <div className="button-row"><button className="button secondary" onClick={() => setPanel(undefined)}>继续对局</button>
        <button className="button primary" onClick={() => {
          setPanel(undefined)
          commit({ type: 'draw', side: position.turn })
        }}>同意和棋</button></div>
    </Dialog>}
    {panel === 'interaction' && <Dialog title="同屏互动" onClose={() => setPanel(undefined)}>
      <p className="muted">消息显示在当前棋桌。</p>
      <div className="choice-grid">{reactions.map(text => <button className="choice" onClick={() => sendReaction(text)} key={text}>{text}</button>)}</div>
      {messages.length > 0 && <div className="messages">{messages.map((item, index) => <p key={index}><strong>{game.sides[item.side]}</strong>{item.text}</p>)}</div>}
      <form className="inline-form" onSubmit={event => { event.preventDefault(); sendReaction(message) }}>
        <input aria-label="同屏消息" value={message} onChange={event => setMessage(event.target.value)} maxLength={40} placeholder="输入短消息" />
        <button className="button primary" disabled={!message.trim()}>发送</button>
      </form>
    </Dialog>}
  </div>
}
