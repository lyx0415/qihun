import { blank, movePiece, onBoard, other, positionKey } from './types'
import type { Move, Piece, Position, Rules, Side, XiangqiOptions } from './types'

type Board = Position['board']
const width = 9
const height = 10
const palace = (x: number, y: number, side: Side) =>
  x >= 3 && x <= 5 && (side === 0 ? y >= 7 && y <= 9 : y >= 0 && y <= 2)
const home = (y: number, side: Side) => side === 0 ? y >= 5 : y <= 4
const orthogonal = [[0, -1], [1, 0], [0, 1], [-1, 0]]
const diagonal = [[1, 1], [-1, 1], [1, -1], [-1, -1]]
const horses = [[1, 2], [-1, 2], [1, -2], [-1, -2], [2, 1], [2, -1], [-2, 1], [-2, -1]]

function destinations(board: Board, from: number, piece: Piece): number[] {
  const x = from % width
  const y = Math.floor(from / width)
  const { side, kind } = piece
  const targets: number[] = []
  const add = (tx: number, ty: number) => {
    const to = ty * width + tx
    if (onBoard(tx, ty, width, height) && board[to]?.side !== side) targets.push(to)
  }
  if (kind === 'r' || kind === 'c') {
    for (const [dx, dy] of orthogonal) {
      let screen = false
      for (let tx = x + dx, ty = y + dy; onBoard(tx, ty, width, height); tx += dx, ty += dy) {
        const to = ty * width + tx
        const occupant = board[to]
        if (kind === 'r') {
          add(tx, ty)
          if (occupant) break
        } else if (!screen) {
          if (occupant) screen = true
          else targets.push(to)
        } else if (occupant) {
          if (occupant.side !== side) targets.push(to)
          break
        }
      }
    }
  }
  if (kind === 'h') {
    for (const [dx, dy] of horses) {
      const lx = x + (Math.abs(dx) === 2 ? Math.sign(dx) : 0)
      const ly = y + (Math.abs(dy) === 2 ? Math.sign(dy) : 0)
      if (!board[ly * width + lx]) add(x + dx, y + dy)
    }
  }
  if (kind === 'e') {
    for (const [dx, dy] of diagonal) {
      if (home(y + 2 * dy, side) && !board[(y + dy) * width + x + dx]) add(x + 2 * dx, y + 2 * dy)
    }
  }
  if (kind === 'a' || kind === 'k') {
    for (const [dx, dy] of kind === 'a' ? diagonal : orthogonal) {
      if (palace(x + dx, y + dy, side)) add(x + dx, y + dy)
    }
    if (kind === 'k') {
      const forward = side === 0 ? -1 : 1
      for (let ty = y + forward; ty >= 0 && ty < height; ty += forward) {
        const target = board[ty * width + x]
        if (!target) continue
        if (target.kind === 'k' && target.side !== side) targets.push(ty * width + x)
        break
      }
    }
  }
  if (kind === 'p') {
    add(x, y + (side === 0 ? -1 : 1))
    if (!home(y, side)) {
      add(x - 1, y)
      add(x + 1, y)
    }
  }
  return targets
}

export function xiangqiCheck(board: Board, side: Side) {
  const king = board.findIndex(piece => piece?.kind === 'k' && piece.side === side)
  if (king < 0) return true
  return board.some((piece, from) => piece?.side === other(side) && destinations(board, from, piece).includes(king))
}

function legal(position: Position, source?: number): Move[] {
  const moves: Move[] = []
  const { board, turn } = position
  if (position.result) return moves
  const sources = source === undefined ? board.keys() : [source]
  for (const from of sources) {
    const piece = board[from]
    if (!piece || piece.side !== turn) continue
    for (const to of destinations(board, from, piece)) {
      if (!xiangqiCheck(movePiece(board, from, to), turn)) moves.push({ type: 'play', from, to })
    }
  }
  return moves
}

export const xiangqi: Rules = {
  id: 'xiangqi',
  name: '中国象棋',
  subtitle: '楚河汉界 · 车马争锋',
  sides: ['红方', '黑方'],
  variant: '休闲象棋 v1',
  width,
  height,
  surface: 'intersections',
  guide: [
    '红方先走。车走直线，马走日且不能蹩腿，象走田且不能过河，士只能在九宫内斜走。',
    '炮不吃子时走直线，吃子须隔一枚棋子。兵卒过河后可向前或横走。将帅不能照面。',
    '被将军必须应将。无合法着法判负。第三次重复盘面或连续 120 个半回合未吃子判和。',
  ],
  initial(_seed, handicap) {
    return initialXiangqi(handicap, 'horse')
  },
  legal,
  advance(position, move) {
    if (move.type !== 'play' || move.from === undefined) return position
    const turn = other(position.turn)
    const board = movePiece(position.board, move.from, move.to)
    const quiet = position.board[move.to] ? 0 : (position.quiet ?? 0) + 1
    const key = positionKey(board, turn)
    const seen = [...(position.seen ?? []), key]
    const next: Position = { board, turn, quiet, seen }
    if (legal(next).length === 0) {
      next.result = { winner: position.turn, reason: xiangqiCheck(board, turn) ? '将死' : '困毙' }
    } else if (seen.filter(item => item === key).length >= 3 || quiet >= 120) {
      next.result = { winner: null, reason: quiet >= 120 ? '120 个半回合未吃子' : '重复盘面' }
    }
    return next
  },
}

export const xiangqiHandicaps: Record<XiangqiOptions['handicapPiece'], string> = {
  horse: '让马', cannon: '让炮', rook: '让车', twoHorses: '让双马',
}

const leftPieces: Record<XiangqiOptions['handicapPiece'], number[]> = {
  horse: [1], cannon: [19], rook: [0], twoHorses: [1, 7],
}

function initialXiangqi(handicap: Side | undefined, piece: XiangqiOptions['handicapPiece']): Position {
  const board = blank(width * height)
  const row = ['r', 'h', 'e', 'a', 'k', 'a', 'e', 'h', 'r']
  for (const side of [0, 1] as const) {
    const at = (x: number, y: number) => (side === 0 ? 9 - y : y) * width + x
    row.forEach((kind, x) => board[at(x, 0)] = { kind, side })
    for (const x of [1, 7]) board[at(x, 2)] = { kind: 'c', side }
    for (const x of [0, 2, 4, 6, 8]) board[at(x, 3)] = { kind: 'p', side }
  }
  if (handicap !== undefined) {
    for (const offset of leftPieces[piece]) {
      const row = Math.floor(offset / width)
      const column = offset % width
      board[handicap === 0 ? (height - 1 - row) * width + column : row * width + width - 1 - column] = null
    }
  }
  return { board, turn: 0, quiet: 0, seen: [positionKey(board, 0)] }
}

export function createXiangqi(options: XiangqiOptions): Rules {
  return { ...xiangqi, initial: (_seed, handicap) => initialXiangqi(handicap, options.handicapPiece) }
}
