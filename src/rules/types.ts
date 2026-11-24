export type Side = 0 | 1 | 2 | 3
export type GameId = 'xiangqi' | 'gomoku' | 'chess' | 'go' | 'jungle' | 'flight' | 'dark' | 'reversi' | 'checkers'
export type FlightOptions = {
  players: 2 | 3 | 4
  fleet: 2 | 4
  takeoff: 'six' | 'one-or-six'
  overshoot: 'bounce' | 'exact'
  colorJump: boolean
}
export type GoOptions = { size: 9 | 13 | 19; komi: 0.5 | 5.5 | 7.5; handicap: 0 | 2 | 3 | 4; review: boolean }
export type GomokuOptions = { size: 11 | 15 | 19; exactFive: boolean }
export type XiangqiOptions = { handicapPiece: 'horse' | 'cannon' | 'rook' | 'twoHorses' }
export type GridOptions = GoOptions | GomokuOptions | XiangqiOptions
export type Piece = { side: Side; kind: string }
export type Move =
  | { type: 'play'; to: number; from?: number; promotion?: string }
  | { type: 'pass' }
  | { type: 'roll'; die: number }
  | { type: 'resign'; side: Side }
  | { type: 'draw'; side: Side }
  | { type: 'markDead'; to: number }
  | { type: 'confirmScore' }
  | { type: 'resumePlay' }
export type Result = { winner: Side | null; reason: string }
export type Position = {
  board: (Piece | null)[]
  turn: Side
  result?: Result
  seen?: string[]
  quiet?: number
  exactFive?: boolean
  jumpFrom?: number
  fen?: string
  passes?: number
  captured?: number[]
  score?: [number, number]
  goScoring?: { dead: number[]; accepted: Side[]; returnTurn: Side }
  flight?: { planes: number[][]; die: number | null; options?: FlightOptions; retired?: Side[] }
  dark?: { hidden: (Piece | null)[]; first?: Side }
}
export type Rules = {
  id: GameId
  name: string
  subtitle: string
  sides: readonly string[]
  variant: string
  width: number
  height: number
  surface: 'intersections' | 'squares'
  guide: string[]
  initial(seed?: string, handicap?: Side, flightOptions?: FlightOptions): Position
  legal(position: Position, from?: number): Move[]
  advance(position: Position, move: Move): Position
}

export const other = (side: Side): 0 | 1 => side === 0 ? 1 : 0
export const blank = (size: number): (Piece | null)[] => Array<Piece | null>(size).fill(null)
export const onBoard = (x: number, y: number, width: number, height: number) =>
  x >= 0 && y >= 0 && x < width && y < height
export const coord = (index: number, width: number) =>
  `${String.fromCharCode(65 + index % width)}${Math.floor(index / width) + 1}`
export const moveCoord = (game: Rules, index: number) =>
  game.id === 'chess' ? `${String.fromCharCode(97 + index % 8)}${8 - Math.floor(index / 8)}` : coord(index, game.width)
export const positionKey = (board: Position['board'], turn?: Side) =>
  board.map(piece => piece ? piece.kind + piece.side : '.').join('|') + (turn ?? '')

export function movePiece(board: Position['board'], from: number, to: number) {
  const copy = board.slice()
  copy[to] = copy[from]
  copy[from] = null
  return copy
}

export function sameMove(a: Move, b: Move) {
  if (a.type !== b.type) return false
  if (a.type === 'play' && b.type === 'play') {
    return a.to === b.to && a.from === b.from && a.promotion === b.promotion
  }
  if (a.type === 'markDead' && b.type === 'markDead') return a.to === b.to
  return true
}
