import { chess } from './chess'
import { checkers } from './checkers'
import { dark } from './dark'
import { flight, retireFlight } from './flight'
import { createGo, go } from './go'
import { createGomoku, gomoku } from './gomoku'
import { jungle } from './jungle'
import { reversi } from './reversi'
import { other, sameMove } from './types'
import type { FlightOptions, GameId, GridOptions, Move, Position, Rules, Side } from './types'
import { createXiangqi, xiangqi } from './xiangqi'

export const rules: Record<GameId, Rules> = { xiangqi, gomoku, go, chess, jungle, flight, dark, reversi, checkers }
export const games = Object.values(rules)

export function configuredRules(game: GameId, grid?: GridOptions) {
  if (game === 'go' && grid && 'komi' in grid) return createGo(grid)
  if (game === 'gomoku' && grid && 'exactFive' in grid) return createGomoku(grid)
  if (game === 'xiangqi' && grid && 'handicapPiece' in grid) return createXiangqi(grid)
  return rules[game]
}

export function play(game: Rules, position: Position, move: Move): Position {
  if (position.result) return position
  const multiplayer = (position.flight?.planes.length ?? 0) > 2
  if (move.type === 'resign' && multiplayer) return retireFlight(position, move.side)
  if (move.type === 'draw' && multiplayer) return position
  if ((move.type === 'resign' || move.type === 'draw') && move.side > 1) return position
  if (move.type === 'resign') return { ...position, result: { winner: other(move.side), reason: `${game.sides[move.side]}认输` } }
  if (move.type === 'draw') return { ...position, result: { winner: null, reason: '双方同意和棋' } }
  if (move.type === 'roll' && (!Number.isInteger(move.die) || move.die < 1 || move.die > 6)) return position
  if (move.type === 'play' && (!Number.isInteger(move.to) || move.to < 0 || move.to >= position.board.length)) return position
  const from = move.type === 'play' ? move.from : undefined
  if (game.id === 'go' && move.type === 'play' && from === undefined && !position.goScoring) return game.advance(position, move)
  if (!game.legal(position, from).some(candidate => sameMove(move, candidate))) return position
  return game.advance(position, move)
}

export function replay(game: Rules, moves: Move[], seed?: string, handicap?: Side, flightOptions?: FlightOptions) {
  const frames = [game.initial(seed, handicap, flightOptions)]
  for (const move of moves) {
    const previous = frames[frames.length - 1]
    const next = play(game, previous, move)
    if (next === previous) break
    frames.push(next)
  }
  return frames
}
