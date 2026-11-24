import { Chess } from 'chess.js'
import type { PieceSymbol, Square } from 'chess.js'
import type { Position, Rules } from './types'

const square = (index: number) => `${String.fromCharCode(97 + index % 8)}${8 - Math.floor(index / 8)}` as Square
const index = (cell: Square) => (8 - Number(cell[1])) * 8 + cell.charCodeAt(0) - 97
const key = (engine: Chess) => engine.fen().split(' ').slice(0, 4).join(' ')

export function chessCheck(position: Position) {
  return !!position.fen && new Chess(position.fen).isCheck()
}

function positionFrom(engine: Chess, seen: string[]): Position {
  const fen = engine.fen()
  const next: Position = {
    board: engine.board().flat().map(piece => piece ? { kind: piece.type, side: piece.color === 'w' ? 0 : 1 } : null),
    turn: engine.turn() === 'w' ? 0 : 1,
    fen,
    seen,
  }
  if (engine.isCheckmate()) next.result = { winner: next.turn === 0 ? 1 : 0, reason: '将死' }
  else if (engine.isStalemate()) next.result = { winner: null, reason: '逼和' }
  else if (engine.isInsufficientMaterial()) next.result = { winner: null, reason: '子力不足' }
  else if (engine.isDrawByFiftyMoves()) next.result = { winner: null, reason: '五十回合规则' }
  else if (seen.filter(value => value === key(engine)).length >= 3) next.result = { winner: null, reason: '三次重复局面' }
  return next
}

export const chess: Rules = {
  id: 'chess', name: '国际象棋', subtitle: '黑白棋格 · 王翼攻防', sides: ['白方', '黑方'],
  variant: '休闲国际象棋 v1', width: 8, height: 8, surface: 'squares',
  guide: [
    '白方先走。王被攻击时须应将。将死获胜，轮到一方无合法着法且未被将军时逼和。',
    '支持王车易位、吃过路兵及兵升变。升变可选后、车、象或马。',
    '休闲局会自动按五十回合、三次重复与子力不足判和。',
  ],
  initial() {
    const engine = new Chess()
    return positionFrom(engine, [key(engine)])
  },
  legal(position, from) {
    if (position.result) return []
    const engine = new Chess(position.fen)
    const moves = from === undefined ? engine.moves({ verbose: true }) : engine.moves({ square: square(from), verbose: true })
    return moves.map(move => ({ type: 'play', from: index(move.from), to: index(move.to), promotion: move.promotion }))
  },
  advance(position, move) {
    if (move.type !== 'play' || move.from === undefined) return position
    const engine = new Chess(position.fen)
    engine.move({ from: square(move.from), to: square(move.to), promotion: move.promotion as PieceSymbol | undefined })
    return positionFrom(engine, [...(position.seen ?? []), key(engine)])
  },
}
