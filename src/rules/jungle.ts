import { blank, movePiece, onBoard, other, positionKey } from './types'
import type { Move, Position, Rules, Side } from './types'

const width = 7
const height = 9
const dens = [59, 3]
const traps = [[52, 58, 60], [2, 4, 10]]
const directions = [[0, 1], [1, 0], [0, -1], [-1, 0]]
const ranks = ['鼠', '猫', '狼', '狗', '豹', '虎', '狮', '象']

export function jungleRiver(index: number) {
  const x = index % width
  const y = Math.floor(index / width)
  return y >= 3 && y <= 5 && [1, 2, 4, 5].includes(x)
}

export function jungleTerrain(index: number) {
  if (dens.includes(index)) return 'den'
  if (traps.some(points => points.includes(index))) return 'trap'
  return jungleRiver(index) ? 'water' : 'land'
}

function legal(position: Position, source?: number): Move[] {
  if (position.result) return []
  const { board, turn } = position
  const moves: Move[] = []
  for (const from of source === undefined ? board.keys() : [source]) {
    const piece = board[from]
    if (!piece || piece.side !== turn) continue
    const rank = ranks.indexOf(piece.kind)
    for (const [dx, dy] of directions) {
      let x = from % width + dx
      let y = Math.floor(from / width) + dy
      if (!onBoard(x, y, width, height)) continue
      let to = y * width + x
      if (jungleRiver(to) && rank !== 0) {
        if (rank !== 5 && rank !== 6) continue
        let blocked = false
        while (onBoard(x, y, width, height) && jungleRiver(to)) {
          if (board[to]) blocked = true
          x += dx
          y += dy
          to = y * width + x
        }
        if (blocked || !onBoard(x, y, width, height)) continue
      }
      if (to === dens[turn]) continue
      const target = board[to]
      if (target?.side === turn) continue
      if (target) {
        if (jungleRiver(to) !== jungleRiver(from)) continue
        const attacker = traps[target.side].includes(from) ? -1 : rank
        const defender = traps[turn].includes(to) ? -1 : ranks.indexOf(target.kind)
        const canCapture = defender < 0 || (attacker === 0 && defender === 7) || (attacker >= defender && !(rank === 7 && defender === 0))
        if (!canCapture) continue
      }
      moves.push({ type: 'play', from, to })
    }
  }
  return moves
}

export const jungle: Rules = {
  id: 'jungle', name: '斗兽棋', subtitle: '丛林河谷 · 八兽交锋', sides: ['赤队', '青队'],
  variant: '经典斗兽棋 v1', width, height, surface: 'squares',
  guide: [
    '棋子每次横竖走一格。兽力由高到低为象、狮、虎、豹、狗、狼、猫、鼠，鼠可以吃象，象不能吃鼠。',
    '只有鼠可入水，水陆之间不可吃子。狮虎可跳河，路径被鼠占据时不能跳。',
    '敌兽进入己方陷阱时失去战力。踏入对方兽穴、吃光对方或使对方无步可走即胜。第三次重复盘面和棋。',
  ],
  initial() {
    const board = blank(width * height)
    const top = [[0, '狮'], [6, '虎'], [8, '狗'], [12, '猫'], [14, '鼠'], [16, '豹'], [18, '狼'], [20, '象']] as const
    for (const [point, kind] of top) {
      board[point] = { kind, side: 1 }
      board[width * height - 1 - point] = { kind, side: 0 }
    }
    return { board, turn: 0, seen: [positionKey(board, 0)] }
  },
  legal,
  advance(position, move) {
    if (move.type !== 'play' || move.from === undefined) return position
    const turn = other(position.turn)
    const board = movePiece(position.board, move.from, move.to)
    const key = positionKey(board, turn)
    const seen = [...(position.seen ?? []), key]
    const next: Position = { board, turn, seen }
    if (move.to === dens[turn]) next.result = { winner: position.turn, reason: '占领兽穴' }
    else if (!board.some(piece => piece?.side === turn)) next.result = { winner: position.turn, reason: '对手棋子全失' }
    else if (!legal(next).length) next.result = { winner: position.turn, reason: '对方无棋可走' }
    else if (seen.filter(item => item === key).length >= 3) next.result = { winner: null, reason: '重复盘面' }
    return next
  },
}
