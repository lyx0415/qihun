import { blank, onBoard, other } from './types'
import type { GomokuOptions, Position, Rules, Side } from './types'

export const defaultGomoku: GomokuOptions = { size: 15, exactFive: false }
const directions = [[1, 0], [0, 1], [1, 1], [1, -1]]

export function linesAt(board: Position['board'], to: number, side: Side) {
  const width = Math.sqrt(board.length)
  const x = to % width
  const y = Math.floor(to / width)
  return directions.map(([dx, dy]) => {
    let length = 1
    let open = 0
    let before = 0
    for (const sign of [-1, 1]) {
      let tx = x + sign * dx
      let ty = y + sign * dy
      while (onBoard(tx, ty, width, width) && board[ty * width + tx]?.side === side) {
        length++
        if (sign === -1) before++
        tx += sign * dx
        ty += sign * dy
      }
      if (onBoard(tx, ty, width, width) && !board[ty * width + tx]) open++
    }
    return { length, open, before, step: dy * width + dx }
  })
}

export const fiveWins = (length: number, exactFive?: boolean) => exactFive ? length === 5 : length >= 5

export function winningFive(position: Position, to: number, side: Side) {
  const line = linesAt(position.board, to, side).find(item => fiveWins(item.length, position.exactFive))
  return line ? Array.from({ length: line.length }, (_, index) => to + (index - line.before) * line.step) : []
}

export function createGomoku(options: GomokuOptions = defaultGomoku): Rules {
  const width = options.size
  return {
  id: 'gomoku', name: '五子棋', subtitle: '纵横落子 · 五子连珠', sides: ['黑方', '白方'],
  variant: options.exactFive ? '恰五五子棋 v1' : '自由五子棋 v1', width, height: width, surface: 'intersections',
  guide: [options.exactFive ? '黑方先走。横、竖或斜线恰好连成五子获胜，长连可以落子，长连本身不算赢。'
    : '黑方先走。横、竖或斜线连成五子或更多立即获胜。', '双方轮流在空交叉点落子。无禁手，棋盘下满且未分出胜负时和棋。'],
  initial: () => ({ board: blank(width * width), turn: 0, exactFive: options.exactFive }),
  legal: position => position.result ? [] : position.board.flatMap((piece, to) => piece ? [] : [{ type: 'play', to }]),
  advance(position, move) {
    if (move.type !== 'play') return position
    const board = position.board.slice()
    board[move.to] = { kind: 'stone', side: position.turn }
    const next: Position = { ...position, board, turn: other(position.turn) }
    if (linesAt(board, move.to, position.turn).some(line => fiveWins(line.length, position.exactFive))) {
      next.result = { winner: position.turn, reason: '五子连珠' }
    } else if (board.every(Boolean)) {
      next.result = { winner: null, reason: '棋盘已满' }
    }
    return next
  },
  }
}

export const gomoku = createGomoku()
