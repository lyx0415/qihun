import type { VoiceCue } from '../audio'
import type { SoundCue } from './feedback'
import type { GameId, Move, Position } from './types'

type Event = { sound: SoundCue; label: string }
type Speech = { cues: VoiceCue[]; routine: boolean }
type Placement = Extract<Move, { type: 'play' }>

const cueFor: Partial<Record<SoundCue, VoiceCue>> = {
  check: 'check', capture: 'capture', cannon: 'cannon', atari: 'atari', threat: 'threat',
  goCapture: 'goCapture', goMulti: 'goMulti', takeoff: 'takeoff', collision: 'collision', arrival: 'arrival',
  jump: 'jump', bounce: 'bounce', flip: 'flip', end: 'win', defeat: 'lose', draw: 'draw', kinged: 'kinged', chain: 'chain',
}
const xiangqi: Record<string, VoiceCue> = { k: 'xKing', a: 'xGuard', e: 'xElephant', h: 'xHorse', r: 'xRook', c: 'xCannon', p: 'xPawn' }
const animals: Record<string, VoiceCue> = {
  鼠: 'jungleMouse', 猫: 'jungleCat', 狼: 'jungleWolf', 狗: 'jungleDog', 豹: 'jungleLeopard',
  虎: 'jungleTiger', 狮: 'jungleLion', 象: 'jungleElephant',
}
const promotes: Record<string, VoiceCue> = { q: 'queenUp', r: 'rookUp', b: 'bishopUp', n: 'knightUp' }

function specialty(game: GameId, before: Position, move: Placement, after: Position, events: Event[]): VoiceCue[] {
  if (game === 'chess') {
    if (move.promotion) return [promotes[move.promotion] ?? 'chessMove']
    if (events.some(event => event.label === '吃过路兵')) return ['chessEnPassant']
    if (move.from !== undefined && before.board[move.from]?.kind === 'k' && Math.abs(move.to - move.from) === 2) return ['chessCastle']
  }
  if (game === 'go') {
    const count = (after.captured?.[before.turn] ?? 0) - (before.captured?.[before.turn] ?? 0)
    const take: VoiceCue | undefined = count === 1 ? 'goCapture' : count === 2 ? 'takeTwo' : count === 3 ? 'takeThree' : count > 3 ? 'goMulti' : undefined
    return [...(take ? [take] : []), ...(events.some(event => event.sound === 'atari') ? ['atari' as const] : [])]
  }
  if (game === 'gomoku') {
    if (after.result?.reason === '五子连珠') return ['fiveInRow']
    const label = events.find(event => event.sound === 'threat')?.label
    if (label) return [label === '双四' ? 'doubleFour' : label === '活四' ? 'openFour' : 'rushFour']
  }
  if (game === 'reversi') {
    const count = after.board.reduce((sum, piece, index) => sum + Number(index !== move.to && !!piece && before.board[index]?.side !== piece.side), 0)
    return [count === 1 ? 'reversiOne' : count === 2 ? 'reversiTwo' : count === 3 ? 'reversiThree' : 'reversiMany']
  }
  if (game === 'dark' && move.from === undefined) return ['darkReveal']
  if (game === 'jungle' && after.result?.reason === '占领兽穴') return ['jungleDen']
  if (game === 'jungle' && events.some(event => event.sound === 'jump')) return ['jungleRiver']
  if (game === 'checkers' && events.some(event => event.sound === 'capture')) return ['checkersCapture']
  return []
}

function normal(game: GameId, before: Position, move: Placement): VoiceCue {
  const kind = move.from === undefined ? '' : before.board[move.from]?.kind ?? ''
  switch (game) {
    case 'xiangqi': return xiangqi[kind] ?? 'chessMove'
    case 'chess': return kind === 'p' ? 'chessPawn' : kind === 'n' ? 'chessKnight' : 'chessMove'
    case 'go': return before.turn === 0 ? 'goBlack' : 'goWhite'
    case 'gomoku': return before.turn === 0 ? 'gomokuBlack' : 'gomokuWhite'
    case 'jungle': return animals[kind] ?? 'chessMove'
    case 'flight': return 'flyMove'
    case 'dark': return 'darkMove'
    case 'checkers': return 'checkersMove'
    case 'reversi': return 'reversiOne'
  }
}

export function speechForMove(game: GameId, before: Position, move: Move, after: Position, events: Event[]): Speech {
  const result = events.at(-1)
  const end = result && (result.sound === 'end' || result.sound === 'defeat' || result.sound === 'draw') ? cueFor[result.sound] : undefined
  if (move.type === 'resign') return { cues: ['resign', ...(end ? [end] : [])], routine: false }
  if (move.type === 'draw') return { cues: ['agreesDraw'], routine: false }
  if (move.type === 'markDead') return { cues: ['goMark'], routine: true }
  if (move.type === 'confirmScore') return { cues: ['goConfirm', ...(end ? [end] : [])], routine: false }
  if (move.type === 'resumePlay') return { cues: ['goContinue'], routine: false }
  if (move.type === 'pass') return {
    cues: [game === 'reversi' ? 'reversiPass' : after.result || after.goScoring ? 'goCount' : 'goPass', ...(end ? [end] : [])], routine: false,
  }
  if (move.type === 'roll') {
    const number = ('roll' + move.die) as VoiceCue
    const extra = after.flight?.die === null ? (after.turn === before.turn ? 'flyAgain' : 'flySkip') : undefined
    return { cues: extra ? [number, extra] : [number], routine: false }
  }
  if (result?.label === '将死') return { cues: ['check', 'mate', ...(result.sound === 'defeat' ? ['lose' as const] : [])], routine: false }

  const detail = specialty(game, before, move, after, events)
  const remaining = events.filter(event => event !== result || !end).flatMap(event => cueFor[event.sound] ? [cueFor[event.sound]!] : [])
  if (!detail.length) detail.push(...remaining)
  else {
    if (remaining.includes('check')) detail.push('check')
    if (game === 'checkers' && remaining.includes('kinged')) detail.unshift('kinged')
    if (game === 'jungle' && remaining.includes('capture')) detail.push('capture')
    if (game === 'chess' && detail[0] !== 'chessEnPassant' && remaining.includes('capture')) detail.unshift('capture')
  }
  if (game === 'flight' && !detail.length) detail.push('flyMove')
  if (game === 'flight' && !end && after.turn === before.turn) detail.push('flyAgain')
  if (end) detail.push(end)
  if (detail.length) return { cues: [...new Set(detail)], routine: detail.length === 1 && detail[0] === 'flyMove' }
  return { cues: [normal(game, before, move)], routine: true }
}
