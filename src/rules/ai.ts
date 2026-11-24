import { groupAt, goNeighbors, goPlacement } from './go'
import { flightChanges, flightFinish } from './flight'
import { fiveWins, linesAt } from './gomoku'
import { moveCoord, other } from './types'
import type { Move, Position, Rules, Side } from './types'

export type Difficulty = 'novice' | 'medium' | 'advanced'
const values: Record<string, number> = {
  k: 9000, q: 900, r: 550, h: 295, b: 335, n: 320, e: 145, a: 145, c: 320, p: 100,
  鼠: 140, 猫: 180, 狼: 220, 狗: 240, 豹: 285, 虎: 380, 狮: 410, 象: 440, man: 120, king: 235,
}
const best = (moves: Move[], score: (move: Move) => number) =>
  moves.map(move => ({ move, score: score(move) })).sort((a, b) => b.score - a.score)

function material(game: Rules, position: Position, side: Side) {
  return position.board.reduce((score, piece, index) => {
    if (!piece) return score
    const x = index % game.width
    const y = Math.floor(index / game.width)
    const center = game.width / 2 - Math.abs(x - (game.width - 1) / 2)
    const forward = piece.side === 0 ? game.height - 1 - y : y
    const weight = values[piece.kind] ?? 0
    const activity = piece.kind === 'p' || game.id === 'jungle' || piece.kind === 'man' ? forward * 6 : center * 4
    return score + (piece.side === side ? 1 : -1) * (weight + activity)
  }, 0)
}

function evaluate(game: Rules, position: Position, side: Side, depth = 0) {
  if (!position.result && game.id === 'reversi') {
    const diskScore = (position.score?.[side === 0 ? 0 : 1] ?? 0) - (position.score?.[other(side)] ?? 0)
    const corners = [0, 7, 56, 63].reduce((score, index) => {
      const piece = position.board[index]
      return score + (!piece ? 0 : piece.side === side ? 22 : -22)
    }, 0)
    const moves = game.legal(position).filter(move => move.type === 'play').length
    return corners + diskScore + (position.turn === side ? moves : -moves) * 3
  }
  if (!position.result) return material(game, position, side)
  if (position.result.winner === null) return 0
  return (position.result.winner === side ? 1 : -1) * (100000 + depth)
}

function tacticalScore(position: Position, move: Move) {
  if (move.type !== 'play') return 0
  const victim = position.board[move.to]
  const piece = move.from === undefined ? null : position.board[move.from]
  return (victim ? (values[victim.kind] ?? 0) * 10 : 0) -
    (victim && piece ? (values[piece.kind] ?? 0) / 20 : 0) + (move.promotion ? values[move.promotion] : 0)
}

function search(game: Rules, position: Position, side: Side, depth: number, alpha: number, beta: number, deadline: number): number {
  if (depth === 0 || position.result || Date.now() >= deadline) return evaluate(game, position, side, depth)
  const max = position.turn === side
  let value = max ? -Infinity : Infinity
  const moves = best(game.legal(position), move => tacticalScore(position, move))
  for (const { move } of moves) {
    const score = search(game, game.advance(position, move), side, depth - 1, alpha, beta, deadline)
    value = max ? Math.max(value, score) : Math.min(value, score)
    if (max) alpha = Math.max(alpha, value)
    else beta = Math.min(beta, value)
    if (alpha >= beta || Date.now() >= deadline) break
  }
  return Number.isFinite(value) ? value : evaluate(game, position, side)
}

function chooseGomoku(position: Position, moves: Move[], difficulty: Difficulty) {
  const width = Math.sqrt(position.board.length)
  const mid = (width - 1) / 2
  const weight = (length: number, open: number) => fiveWins(length, position.exactFive) ? 100000 : (open && length < 5 ? 8 ** length * open : 0)
  const ranked = best(moves, move => {
    if (move.type !== 'play') return 0
    const attack = linesAt(position.board, move.to, position.turn).map(line => weight(line.length, line.open))
    const defence = linesAt(position.board, move.to, other(position.turn)).map(line => weight(line.length, line.open))
    const center = width - 1 - Math.abs(move.to % width - mid) - Math.abs(Math.floor(move.to / width) - mid)
    if (Math.max(...attack) === 100000) return 1000000
    if (Math.max(...defence) === 100000) return 900000
    const threats = attack.filter(value => value >= 512).length
    const defensiveWeight = difficulty === 'advanced' ? 0.99 : 0.86
    return attack.reduce((a, b) => a + b) + defence.reduce((a, b) => a + b) * defensiveWeight +
      (difficulty === 'advanced' && threats >= 2 ? 600 : 0) + center
  })
  const candidates = difficulty === 'novice' && ranked[0].score < 900000 ? Math.min(3, ranked.length) : 1
  return ranked[Math.floor(Math.random() * candidates)].move
}

function chooseGo(position: Position, moves: Move[], difficulty: Difficulty) {
  if (position.goScoring) return { type: 'confirmScore' } as const
  const width = Math.sqrt(position.board.length)
  const mid = (width - 1) / 2
  const ranked = best(moves, move => {
    if (move.type !== 'play') return position.passes ? 10 : -15
    const placed = goPlacement(position, move.to)
    if (!placed) return -Infinity
    const group = groupAt(placed.board, move.to)
    const x = move.to % width
    const y = Math.floor(move.to / width)
    const center = (width - 1 - Math.abs(x - mid) - Math.abs(y - mid)) * 0.5
    const shape = (group.liberties.size === 1 ? -10 : Math.min(group.liberties.size, 6)) + center
    const advancedShape = difficulty === 'advanced' ? Math.min(group.stones.size, 4) * 0.7 : 0
    return neighborPressure(position, move.to) + shape + advancedShape + placed.captures * (difficulty === 'novice' ? 10 : 19)
  })
  return ranked[0].move
}

function neighborPressure(position: Position, to: number) {
  let score = 0
  for (const cell of goNeighbors(position.board, to)) {
    const piece = position.board[cell]
    if (!piece) continue
    const liberties = groupAt(position.board, cell).liberties.size
    if (piece.side !== position.turn) score += liberties < 4 ? 2 : 1
    else if (liberties === 1) score += 8
  }
  return score
}

export function chooseMove(game: Rules, position: Position, difficulty: Difficulty, budget = 700): Move | null {
  const moves = game.legal(position)
  if (!moves.length) return null
  if (game.id === 'gomoku') return chooseGomoku(position, moves, difficulty)
  if (game.id === 'go') return chooseGo(position, moves, difficulty)
  if (game.id === 'dark') {
    const ranked = best(moves, move => {
      if (move.type !== 'play') return 0
      const variation = Math.random()
      if (move.from === undefined) return 5 + variation
      if (position.board[move.to]) return 10 + (values[position.board[move.to]!.kind] ?? 0) / 100 + variation
      return variation
    })
    return ranked[0].move
  }
  if (game.id === 'flight') {
    if (moves[0].type === 'roll') return { type: 'roll', die: 1 + Math.floor(Math.random() * 6) }
    return best(moves, move => {
      const next = game.advance(position, move)
      const before = position.flight!
      const after = next.flight!
      const advanced = after.planes[position.turn].reduce((sum, value, index) =>
        sum + (value === flightFinish && before.planes[position.turn][index] !== flightFinish ? 20 : 0) +
        (before.planes[position.turn][index] < 0 && value >= 0 ? 12 : value - before.planes[position.turn][index]), 0)
      const captures = flightChanges(position, next, move).collision
      return advanced + captures * 25
    })[0].move
  }

  const ordered = best(moves, move => tacticalScore(position, move)).map(({ move }) => {
    const next = game.advance(position, move)
    return { move, next, score: evaluate(game, next, position.turn) }
  }).sort((a, b) => b.score - a.score)
  if (difficulty === 'novice') {
    const picks = ordered.filter(item => item.score >= ordered[0].score - 12).slice(0, 4)
    return picks[Math.floor(Math.random() * picks.length)].move
  }
  if (ordered[0].next.result?.winner === position.turn) return ordered[0].move
  let chosen = ordered[0].move
  const deadline = Date.now() + budget
  for (let depth = 1; depth <= (difficulty === 'advanced' ? 2 : 1); depth++) {
    let highest = -Infinity
    let candidate = chosen
    for (const { move, next } of ordered) {
      const score = search(game, next, position.turn, depth, highest, Infinity, deadline)
      if (score > highest) {
        highest = score
        candidate = move
      }
      if (Date.now() >= deadline) break
    }
    if (Date.now() >= deadline) break
    chosen = candidate
  }
  return chosen
}

export function describeMove(game: Rules, position: Position, move: Move) {
  if (move.type === 'draw') return '同意和棋'
  if (move.type === 'resign') return `${game.sides[move.side]}认输`
  if (move.type === 'pass') return game.id === 'reversi' ? '无棋可下，跳过' : '停一手'
  if (move.type === 'roll') return `掷出 ${move.die} 点`
  if (move.type === 'confirmScore') return '确认数子'
  if (move.type === 'resumePlay') return '恢复行棋'
  if (move.type === 'markDead') return `调整死子 ${moveCoord(game, move.to)}`
  const target = moveCoord(game, move.to)
  if (move.from === undefined) return game.id === 'dark' ? `翻子 ${target}` : target
  const name = position.board[move.from]?.kind
  return `${game.id === 'xiangqi' || game.id === 'chess' ? pieceName(game.id, name ?? '', position.turn) + ' ' : ''}${moveCoord(game, move.from)} → ${target}${move.promotion ? ' · 升变' : ''}`
}

const xiangqiNames: Record<string, [string, string]> = {
  k: ['帅', '将'], a: ['仕', '士'], e: ['相', '象'], h: ['马', '马'],
  r: ['车', '车'], c: ['炮', '炮'], p: ['兵', '卒'],
}
const chessNames: Record<string, string> = { k: '王', q: '后', r: '车', b: '象', n: '马', p: '兵' }
export function pieceName(game: Rules['id'], kind: string, side: Side) {
  if (game === 'xiangqi' || game === 'dark') return kind === 'hidden' ? '盖子' : xiangqiNames[kind]?.[side === 0 ? 0 : 1] ?? kind
  if (game === 'chess') return chessNames[kind] ?? kind
  if (game === 'flight') return `${kind} 架飞机`
  if (game === 'checkers') return kind === 'king' ? '王棋' : '兵棋'
  return kind === 'stone' || kind === 'disc' ? '棋子' : kind
}
