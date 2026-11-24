import { chessCheck } from './chess'
import { jumpedSquare } from './checkers'
import { flightChanges } from './flight'
import { groupAt } from './go'
import { linesAt } from './gomoku'
import { reversiFlips } from './reversi'
import { other } from './types'
import type { Move, Position, Rules } from './types'
import { xiangqiCheck } from './xiangqi'

export type SoundCue = 'move' | 'capture' | 'cannon' | 'check' | 'atari' | 'threat' | 'goCapture' | 'goMulti'
  | 'roll' | 'takeoff' | 'collision' | 'arrival' | 'jump' | 'bounce' | 'flip' | 'end' | 'draw' | 'message'
  | 'defeat' | 'cardPlay' | 'cardRun' | 'bombBlast' | 'rocketBlast' | 'flushBurst' | 'kinged' | 'chain'

type Feedback = { sound: SoundCue; label: string; cells?: number[] }

export function checkedKing(game: Rules, position: Position) {
  const checked = game.id === 'xiangqi' ? xiangqiCheck(position.board, position.turn) : game.id === 'chess' && chessCheck(position)
  return checked ? position.board.findIndex(piece => piece?.kind === 'k' && piece.side === position.turn) : -1
}

function newAtari(before: Position, after: Position) {
  const visited = new Set<number>()
  const targets: number[] = []
  after.board.forEach((piece, index) => {
    if (piece?.side !== after.turn || visited.has(index)) return
    const group = groupAt(after.board, index)
    for (const point of group.stones) visited.add(point)
    if (group.liberties.size === 1 && groupAt(before.board, index).liberties.size > 1) targets.push(...group.stones)
  })
  return targets
}

export function moveFeedback(game: Rules, before: Position, move: Move, after: Position): Feedback[] {
  const cues: Feedback[] = []
  if (move.type === 'roll') cues.push({ sound: 'roll', label: `掷出 ${move.die} 点` })
  if (move.type === 'play') {
    const { to, from } = move
    const opponent = other(before.turn)
    if (game.id === 'flight') {
      const outcome = flightChanges(before, after, move)
      if (outcome.takeoff) cues.push({ sound: 'takeoff', label: '起飞' })
      if (outcome.jump) cues.push({ sound: 'jump', label: '同色跳跃' })
      if (outcome.collision) cues.push({ sound: 'collision', label: `撞回 ${outcome.collision} 架飞机` })
      if (outcome.bounce) cues.push({ sound: 'bounce', label: '终点反弹' })
      if (outcome.arrival) cues.push({ sound: 'arrival', label: '抵达终点' })
    } else if (game.id === 'go') {
      const count = (after.captured?.[before.turn] ?? 0) - (before.captured?.[before.turn] ?? 0)
      if (count > 0) cues.push({ sound: count === 1 ? 'goCapture' : 'goMulti', label: `提 ${count} 子` })
      const targets = newAtari(before, after)
      if (targets.length) cues.push({ sound: 'atari', label: '打吃', cells: targets })
    } else if (game.id === 'gomoku') {
      const threats = linesAt(after.board, to, before.turn).filter(line => line.length === 4 && line.open > 0)
      if (threats.length) cues.push({ sound: 'threat', label: threats.length > 1 ? '双四' : threats[0].open === 2 ? '活四' : '冲四' })
    } else if (game.id === 'reversi') {
      const cells = reversiFlips(before.board, to, before.turn)
      cues.push({ sound: 'flip', label: `翻转 ${cells.length} 子`, cells })
    } else if (game.id === 'dark' && from === undefined) {
      cues.push({ sound: 'flip', label: '翻开盖子' })
    } else if (game.id === 'checkers' && from !== undefined) {
      if (before.board[from]?.kind === 'man' && after.board[to]?.kind === 'king') cues.push({ sound: 'kinged', label: '升王' })
      const victim = jumpedSquare(from, to)
      if (victim !== undefined) cues.push(after.jumpFrom !== undefined
        ? { sound: 'chain', label: '继续连跳', cells: [to] }
        : { sound: 'capture', label: before.jumpFrom !== undefined ? '连跳吃子' : '跳吃' })
    } else if (from !== undefined) {
      const moving = before.board[from]
      const target = before.board[to]
      const enPassant = game.id === 'chess' && moving?.kind === 'p' && !target && from % 8 !== to % 8
      if (target?.side === opponent || enPassant) {
        const cannon = (game.id === 'xiangqi' || game.id === 'dark') && moving?.kind === 'c'
        cues.push({ sound: cannon ? 'cannon' : 'capture', label: cannon ? '炮打' : enPassant ? '吃过路兵' : '吃子' })
      }
      if (game.id === 'jungle' && Math.abs(from % 7 - to % 7) + Math.abs(Math.floor(from / 7) - Math.floor(to / 7)) > 1) {
        cues.push({ sound: 'jump', label: '跳河' })
      }
      if (move.promotion) cues.push({ sound: 'arrival', label: '兵升变' })
      const king = checkedKing(game, after)
      if (king >= 0) cues.push({ sound: 'check', label: '将军' })
    }
  }
  if (after.result) cues.push({ sound: after.result.winner === null ? 'draw' : 'end', label: after.result.reason })
  if (!cues.length && move.type === 'play') cues.push({ sound: 'move', label: '' })
  return cues
}
