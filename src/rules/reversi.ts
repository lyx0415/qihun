import { blank, onBoard, other } from './types'
import type { Move, Position, Rules, Side } from './types'

const width = 8
const directions = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]]

export function reversiFlips(board: Position['board'], to: number, side: Side) {
  if (board[to]) return []
  const x = to % width
  const y = Math.floor(to / width)
  const flips: number[] = []
  for (const [dx, dy] of directions) {
    const line: number[] = []
    for (let tx = x + dx, ty = y + dy; onBoard(tx, ty, width, width); tx += dx, ty += dy) {
      const index = ty * width + tx
      const target = board[index]
      if (!target) break
      if (target.side === side) {
        flips.push(...line)
        break
      }
      line.push(index)
    }
  }
  return flips
}

function placements(board: Position['board'], side: Side): Move[] {
  return board.flatMap((piece, to) => !piece && reversiFlips(board, to, side).length ? [{ type: 'play', to }] : [])
}

export const reversi: Rules = {
  id: 'reversi', name: '黑白棋', subtitle: '夹住一线 · 翻转局势',
  variant: '经典黑白棋 v1', sides: ['黑方', '白方'], width, height: width, surface: 'squares',
  guide: [
    '黑方先手。落子必须沿横、竖或斜线，夹住至少一枚连续的对方棋。被夹住的棋子全部翻成己方颜色。',
    '当前无合法落点时必须跳过回合。双方都无棋可下即结束，棋子较多的一方获胜。',
  ],
  initial() {
    const board = blank(64)
    for (const index of [28, 35]) board[index] = { kind: 'disc', side: 0 }
    for (const index of [27, 36]) board[index] = { kind: 'disc', side: 1 }
    return { board, turn: 0, score: [2, 2] }
  },
  legal(position) {
    if (position.result) return []
    const moves = placements(position.board, position.turn)
    return moves.length ? moves : [{ type: 'pass' }]
  },
  advance(position, move) {
    if (move.type === 'pass') return { ...position, turn: other(position.turn) }
    if (move.type !== 'play') return position
    const side = position.turn === 0 ? 0 : 1
    const turn = other(side)
    const board = position.board.slice()
    for (const index of [move.to, ...reversiFlips(board, move.to, side)]) board[index] = { kind: 'disc', side }
    const score: [number, number] = [0, 0]
    for (const piece of board) {
      if (piece) score[piece.side === 0 ? 0 : 1]++
    }
    const next: Position = { board, turn, score }
    if (!placements(board, turn).length && !placements(board, side).length) {
      next.result = { winner: score[0] === score[1] ? null : score[0] > score[1] ? 0 : 1, reason: `黑 ${score[0]} · 白 ${score[1]}` }
    }
    return next
  },
}
