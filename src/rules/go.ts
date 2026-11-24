import { blank, onBoard, other, positionKey } from './types'
import type { GoOptions, Move, Position, Rules, Side } from './types'

type Board = Position['board']
export const defaultGo: GoOptions = { size: 9, komi: 7.5, handicap: 0, review: false }
const adjacency = new Map<number, number[][]>()

export function goNeighbors(board: Board, index: number) {
  const width = Math.sqrt(board.length)
  let cached = adjacency.get(width)
  if (!cached) {
    cached = Array.from({ length: board.length }, (_, point) => {
      const x = point % width
      const y = Math.floor(point / width)
      return [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]
        .filter(([tx, ty]) => onBoard(tx, ty, width, width))
        .map(([tx, ty]) => ty * width + tx)
    })
    adjacency.set(width, cached)
  }
  return cached[index] ?? []
}

export function groupAt(board: Board, start: number) {
  const side = board[start]?.side
  const stones = new Set([start])
  const liberties = new Set<number>()
  const neighbors = new Set<Side>()
  for (const here of stones) {
    for (const there of goNeighbors(board, here)) {
      const nextSide = board[there]?.side
      if (nextSide === side) stones.add(there)
      else if (nextSide === undefined) liberties.add(there)
      else neighbors.add(nextSide)
    }
  }
  return { stones, liberties, neighbors }
}

export function goPlacement(position: Position, to: number) {
  if (!Number.isInteger(to) || to < 0 || to >= position.board.length || position.board[to]) return null
  const board = position.board.slice()
  board[to] = { side: position.turn, kind: 'stone' }
  let captures = 0
  for (const cell of goNeighbors(board, to)) {
    if (board[cell]?.side !== other(position.turn)) continue
    const group = groupAt(board, cell)
    if (!group.liberties.size) {
      captures += group.stones.size
      for (const point of group.stones) board[point] = null
    }
  }
  if (!groupAt(board, to).liberties.size) return null
  const key = positionKey(board)
  return position.seen?.includes(key) ? null : { board, captures, key }
}

export function areaScore(board: Board, komi = 7.5, dead: number[] = []): [number, number] {
  const removed = new Set(dead)
  if (removed.size) board = board.map((piece, index) => removed.has(index) ? null : piece)
  const score: [number, number] = [0, komi]
  const visited = new Set<number>()
  board.forEach((piece, index) => {
    if (piece) score[piece.side === 0 ? 0 : 1]++
    else if (!visited.has(index)) {
      const group = groupAt(board, index)
      for (const point of group.stones) visited.add(point)
      const owner = [...group.neighbors][0]
      if (group.neighbors.size === 1) score[owner === 0 ? 0 : 1] += group.stones.size
    }
  })
  return score
}

function finish(position: Position, komi: number, dead: number[] = []): Position {
  const score = areaScore(position.board, komi, dead)
  return { ...position, score, result: { winner: score[0] === score[1] ? null : score[0] > score[1] ? 0 : 1, reason: '黑 ' + score[0] + ' · 白 ' + score[1] } }
}

export function createGo(options: GoOptions = defaultGo): Rules {
  const width = options.size
  return {
    id: 'go', name: '围棋', subtitle: '落子围地 · 九至十九路', sides: ['黑方', '白方'],
    variant: (width === 9 ? '九' : width === 13 ? '十三' : '十九') + '路面积计分 ' + (options.review ? 'v2' : 'v1'),
    width, height: width, surface: 'intersections',
    guide: [
      '横竖相邻的同色棋子组成棋块。无气就会被提走。禁止自杀和重现此前的盘面。',
      '白贴 ' + options.komi + '。' + (options.handicap ? '黑方预摆 ' + options.handicap + ' 子，白方先走。' : '黑先白后。'),
      options.review ? '双方停一手后进入数子。点棋块可标记或取消死子，两方确认后结算。有分歧可恢复对局。'
        : '双方停一手后按当前盘面数面积。请在停手前先把应提的死子提净。',
    ],
    initial() {
      const board = blank(width * width)
      const low = width === 9 ? 2 : 3
      const high = width - 1 - low
      const stars = [high * width + low, low * width + high, low * width + low, high * width + high]
      for (const point of stars.slice(0, options.handicap)) board[point] = { side: 0, kind: 'stone' }
      return { board, turn: options.handicap ? 1 : 0, passes: 0, seen: [positionKey(board)], captured: [0, 0] }
    },
    legal(position) {
      if (position.result) return []
      if (position.goScoring) return [{ type: 'confirmScore' }, { type: 'resumePlay' },
        ...position.board.flatMap((stone, to): Move[] => stone ? [{ type: 'markDead', to }] : [])]
      const moves: Move[] = [{ type: 'pass' }]
      position.board.forEach((piece, to) => {
        if (!piece && goPlacement(position, to)) moves.push({ type: 'play', to })
      })
      return moves
    },
    advance(position, move) {
      const turn = other(position.turn)
      const scoring = position.goScoring
      if (scoring) {
        if (move.type === 'resumePlay') return { ...position, goScoring: undefined, turn: scoring.returnTurn, passes: 0 }
        if (move.type === 'markDead' && position.board[move.to]) {
          const group = groupAt(position.board, move.to).stones
          const dead = scoring.dead.includes(move.to) ? scoring.dead.filter(index => !group.has(index)) : [...scoring.dead, ...group]
          return { ...position, goScoring: { ...scoring, dead, accepted: [] } }
        }
        if (move.type === 'confirmScore') {
          const accepted = [...scoring.accepted, position.turn]
          const next = { ...position, turn, goScoring: { ...scoring, accepted } }
          return accepted.length === 2 ? finish(next, options.komi, scoring.dead) : next
        }
        return position
      }
      if (move.type === 'pass') {
        const passes = (position.passes ?? 0) + 1
        const next = { ...position, passes, turn }
        if (passes < 2) return next
        return options.review ? { ...next, goScoring: { dead: [], accepted: [], returnTurn: turn } } : finish(next, options.komi)
      }
      if (move.type !== 'play') return position
      const next = goPlacement(position, move.to)
      if (!next) return position
      const captured = [...(position.captured ?? [0, 0])]
      captured[position.turn] += next.captures
      return { board: next.board, turn, passes: 0, seen: [...(position.seen ?? []), next.key], captured }
    },
  }
}

export const go = createGo()
