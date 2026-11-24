import { movePiece, onBoard, other, positionKey } from './types'
import type { Move, Piece, Position, Rules, Side } from './types'

const width = 8
const height = 4
const directions = [[0, -1], [1, 0], [0, 1], [-1, 0]]
const ranks = ['p', 'c', 'h', 'r', 'e', 'a', 'k']

function shuffled(seed: string) {
  const kinds = ['k', 'a', 'a', 'e', 'e', 'r', 'r', 'h', 'h', 'c', 'c', 'p', 'p', 'p', 'p', 'p']
  const pieces: Piece[] = ([0, 1] as const).flatMap(side => kinds.map(kind => ({ side, kind })))
  let state = 2166136261
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619)
  for (let index = pieces.length - 1; index > 0; index--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    const swap = Math.floor(state / 4294967296 * (index + 1))
    ;[pieces[index], pieces[swap]] = [pieces[swap], pieces[index]]
  }
  return pieces
}

function legal(position: Position, source?: number): Move[] {
  if (position.result) return []
  const { board, turn } = position
  const moves: Move[] = []
  if (source === undefined) board.forEach((piece, to) => {
    if (piece?.kind === 'hidden') moves.push({ type: 'play', to })
  })
  for (const from of source === undefined ? board.keys() : [source]) {
    const piece = board[from]
    if (!piece || piece.kind === 'hidden' || piece.side !== turn) continue
    const x = from % width
    const y = Math.floor(from / width)
    for (const [dx, dy] of directions) {
      let screen = false
      for (let tx = x + dx, ty = y + dy; onBoard(tx, ty, width, height); tx += dx, ty += dy) {
        const to = ty * width + tx
        const target = board[to]
        const adjacent = tx === x + dx && ty === y + dy
        if (!target && adjacent) moves.push({ type: 'play', from, to })
        if (piece.kind !== 'c') {
          if (target && target.kind !== 'hidden' && target.side !== turn &&
            (piece.kind === 'p' && target.kind === 'k' || ranks.indexOf(piece.kind) >= ranks.indexOf(target.kind) &&
              !(piece.kind === 'k' && target.kind === 'p'))) moves.push({ type: 'play', from, to })
          break
        }
        if (!target) continue
        if (!screen) screen = true
        else {
          if (target.kind !== 'hidden' && target.side !== turn) moves.push({ type: 'play', from, to })
          break
        }
      }
    }
  }
  return moves
}

export function darkColor(position: Position, side: Side): Side {
  const first = position.dark?.first ?? 0
  return side === 0 ? first : other(first)
}

export const dark: Rules = {
  id: 'dark', name: '象棋翻棋', subtitle: '覆子翻开 · 逐格攻防', sides: ['先手', '后手'],
  variant: '双人翻棋 v1', width, height, surface: 'squares',
  guide: [
    '在 4 × 8 的棋盘上盖好 32 枚棋子。首枚翻出的棋子决定先手阵营，之后每回合翻一枚或走一枚己方棋子。',
    '棋子横竖走一格，等级为将、士、象、车、马、炮、卒。将不能吃卒，卒可吃将。炮吃子须隔一枚棋子，且只能吃已翻开的敌子。',
    '对方无棋可走即胜。第三次重复盘面或连续 80 个半回合未吃子也未翻子判和。',
  ],
  initial(seed = 'qihun-dark') {
    const board: Piece[] = Array.from({ length: width * height }, () => ({ side: 0, kind: 'hidden' }))
    return { board, turn: 0, quiet: 0, seen: [positionKey(board, 0)], dark: { hidden: shuffled(seed) } }
  },
  legal,
  advance(position, move) {
    if (move.type !== 'play' || !position.dark) return position
    const turn = other(position.turn)
    let dark = position.dark
    let board: Position['board']
    if (move.from === undefined) {
      const revealed = dark.hidden[move.to]
      if (!revealed) return position
      const first = dark.first ?? revealed.side
      const hidden = dark.hidden.slice()
      hidden[move.to] = null
      dark = { first, hidden }
      board = position.board.slice()
      board[move.to] = { kind: revealed.kind, side: revealed.side === first ? 0 : 1 }
    } else board = movePiece(position.board, move.from, move.to)
    const quiet = move.from === undefined || position.board[move.to] ? 0 : (position.quiet ?? 0) + 1
    const key = positionKey(board, turn)
    const seen = [...(position.seen ?? []), key]
    const next: Position = { board, turn, dark, quiet, seen }
    if (!legal(next).length) next.result = { winner: position.turn, reason: '对方无棋可走' }
    else if (quiet >= 80 || seen.filter(item => item === key).length >= 3) {
      next.result = { winner: null, reason: quiet >= 80 ? '80 个半回合未吃子或翻子' : '重复盘面' }
    }
    return next
  },
}
