import { blank, movePiece, onBoard, other, positionKey } from './types'
import type { Move, Position, Rules } from './types'

export function jumpedSquare(from: number, to: number) {
  return Math.abs(from % 8 - to % 8) === 2 ? (from + to) / 2 : undefined
}

function steps(position: Position, from: number, capture: boolean): Move[] {
  const { board, turn } = position
  const piece = board[from]
  if (piece?.side !== turn) return []
  const x = from % 8
  const y = Math.floor(from / 8)
  const forward = turn === 0 ? -1 : 1
  const moves: Move[] = []
  for (const dy of piece.kind === 'king' ? [-1, 1] : [forward]) {
    for (const dx of [-1, 1]) {
      const distance = capture ? 2 : 1
      const tx = x + dx * distance
      const ty = y + dy * distance
      const to = ty * 8 + tx
      if (!onBoard(tx, ty, 8, 8) || board[to]) continue
      if (capture && board[(y + dy) * 8 + x + dx]?.side !== other(turn)) continue
      moves.push({ type: 'play', from, to })
    }
  }
  return moves
}

function legal(position: Position, from?: number): Move[] {
  if (position.result) return []
  let moves: Move[]
  if (position.jumpFrom !== undefined) moves = steps(position, position.jumpFrom, true)
  else {
    const all = [...position.board.keys()]
    const captures = all.flatMap(index => steps(position, index, true))
    moves = captures.length ? captures : all.flatMap(index => steps(position, index, false))
  }
  return from === undefined ? moves : moves.filter(move => move.type === 'play' && move.from === from)
}

export const checkers: Rules = {
  id: 'checkers', name: '英式跳棋', subtitle: '斜线攻防 · 连跳升王',
  sides: ['黑方', '红方'], variant: '休闲英式跳棋 v1', width: 8, height: 8, surface: 'squares',
  guide: [
    '黑方先走。普通棋子向前斜走一格，跳过相邻敌子并落到空格即可吃子。王可以前后斜走和吃子。',
    '全盘有吃必吃。落地后能连吃时，须用同一枚棋继续跳。到达底线升王时，该回合立即结束。',
    '对手无棋可走即获胜。第三次重复局面，或连续 80 个半回合没有吃子或普通棋子移动，判和。',
  ],
  initial() {
    const board = blank(64)
    board.forEach((_, index) => {
      const row = Math.floor(index / 8)
      if ((row + index % 8) % 2 && (row < 3 || row > 4)) {
        board[index] = { kind: 'man', side: row < 3 ? 1 : 0 }
      }
    })
    return { board, turn: 0, seen: [positionKey(board, 0)], quiet: 0 }
  },
  legal,
  advance(position, move) {
    if (move.type !== 'play' || move.from === undefined) return position
    const side = position.turn
    const moving = position.board[move.from]!
    const board = movePiece(position.board, move.from, move.to)
    const victim = jumpedSquare(move.from, move.to)
    const promoted = moving.kind === 'man' && Math.floor(move.to / 8) === (side === 0 ? 0 : 7)
    if (victim !== undefined) board[victim] = null
    if (promoted) board[move.to] = { side, kind: 'king' }
    if (victim !== undefined && !promoted && steps({ ...position, board }, move.to, true).length) {
      return { ...position, board, quiet: 0, jumpFrom: move.to }
    }
    const turn = other(side)
    const quiet = victim !== undefined || moving.kind === 'man' ? 0 : (position.quiet ?? 0) + 1
    const key = positionKey(board, turn)
    const seen = [...(position.seen ?? []), key]
    const next: Position = { board, turn, quiet, seen }
    if (!legal(next).length) next.result = { winner: side, reason: '对方无棋可走' }
    else if (quiet >= 80 || seen.filter(item => item === key).length >= 3) next.result = {
      winner: null, reason: quiet >= 80 ? '连续 80 个半回合无吃子或兵步' : '重复局面',
    }
    return next
  },
}
