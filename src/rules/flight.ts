import { blank } from './types'
import type { FlightOptions, Move, Position, Rules, Side } from './types'

const width = 15
const at = (x: number, y: number) => y * width + x
const track = [
  [0, 6], [1, 6], [2, 6], [3, 6], [4, 6], [5, 6], [6, 5], [6, 4], [6, 3], [6, 2], [6, 1], [6, 0],
  [7, 0], [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [9, 6], [10, 6], [11, 6], [12, 6], [13, 6], [14, 6],
  [14, 7], [14, 8], [13, 8], [12, 8], [11, 8], [10, 8], [9, 8], [8, 9], [8, 10], [8, 11], [8, 12], [8, 13], [8, 14],
  [7, 14], [6, 14], [6, 13], [6, 12], [6, 11], [6, 10], [6, 9], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8], [0, 7],
].map(([x, y]) => at(x, y))
const hangars = [
  [at(1, 1), at(3, 1), at(1, 3), at(3, 3)],
  [at(11, 11), at(13, 11), at(11, 13), at(13, 13)],
  [at(11, 1), at(13, 1), at(11, 3), at(13, 3)],
  [at(1, 11), at(3, 11), at(1, 13), at(3, 13)],
]
const home = [
  [at(1, 7), at(2, 7), at(3, 7), at(4, 7), at(5, 7), at(6, 7)],
  [at(13, 7), at(12, 7), at(11, 7), at(10, 7), at(9, 7), at(8, 7)],
  [at(7, 1), at(7, 2), at(7, 3), at(7, 4), at(7, 5), at(7, 6)],
  [at(7, 13), at(7, 12), at(7, 11), at(7, 10), at(7, 9), at(7, 8)],
]
const offsets = [0, 26, 13, 39]
const colors = ['red', 'green', 'gold', 'blue']
const clockwise: Side[] = [0, 2, 1, 3]
export const flightFinish = 56
export const defaultFlight: FlightOptions = { players: 2, fleet: 4, takeoff: 'six', overshoot: 'bounce', colorJump: false }
export const playerCounts = ['', '', '双人', '三人', '四人'] as const

export function flightSeatOrder(count: number) {
  return clockwise.filter(side => side < count)
}

function nextTurn(current: Side, count: number, retired: Side[] = []) {
  const order = flightSeatOrder(count)
  const start = order.indexOf(current)
  for (let i = 1; i <= order.length; i++) {
    const seat = order[(start + i) % order.length]
    if (!retired.includes(seat)) return seat
  }
  return current
}

function trackSeat(index: number) {
  return clockwise[index % 4]
}

function jumpSeat(index: number, players: number) {
  const side = trackSeat(index)
  const start = offsets.indexOf(index)
  const progress = (index + track.length - offsets[side]) % track.length
  return side < players && (start < 0 || start >= players) && progress < 47 ? side : undefined
}

function cell(side: Side, plane: number, progress: number) {
  if (progress < 0) return hangars[side][plane]
  if (progress >= 51) return home[side][progress - 51]
  return track[(progress + offsets[side]) % track.length]
}

export function flightTerrain(index: number, options?: FlightOptions) {
  const { players, fleet, colorJump } = options ?? defaultFlight
  const seat = flightSeatOrder(players).find(side =>
    hangars[side].slice(0, fleet).includes(index) || home[side].includes(index))
  if (seat !== undefined) return `flight-${colors[seat]}`
  const routeIndex = track.indexOf(index)
  if (routeIndex >= 0) {
    const start = offsets.findIndex(offset => offset === routeIndex)
    if (start >= 0 && start < players) return `flight-${colors[start]} flight-start`
    const side = jumpSeat(routeIndex, players)
    return colorJump && side !== undefined ? `flight-${colors[side]} flight-jump` : 'flight-track'
  }
  if (index === at(7, 7)) return 'flight-center'
  const x = index % width
  const y = Math.floor(index / width)
  const corner = x < 6 ? (y < 6 ? 0 : y > 8 ? 3 : -1) : x > 8 ? (y < 6 ? 2 : y > 8 ? 1 : -1) : -1
  return corner >= 0 && corner < players ? `flight-out flight-base-${colors[corner]}` : 'flight-out'
}

function makeBoard(planes: number[][], retired: Side[] = []) {
  const board = blank(width * width)
  for (const side of flightSeatOrder(planes.length)) {
    if (retired.includes(side)) continue
    planes[side].forEach((progress, plane) => {
      const index = cell(side, plane, progress)
      const previous = Number(board[index]?.kind ?? 0)
      board[index] = { kind: String(previous + 1), side }
    })
  }
  return board
}

function destination(side: Side, progress: number, die: number, options: FlightOptions) {
  if (progress === flightFinish) return null
  if (progress < 0) return die === 6 || die === 1 && options.takeoff === 'one-or-six' ? 0 : null
  const next = progress + die
  if (next > flightFinish) return options.overshoot === 'bounce' ? 2 * flightFinish - next : null
  if (options.colorJump && next < 47 && jumpSeat((next + offsets[side]) % track.length, options.players) === side) return next + 4
  return next
}

export function flightChanges(before: Position, after: Position, move: Move) {
  const events = { collision: 0, takeoff: false, arrival: false, jump: false, bounce: false }
  if (!before.flight || !after.flight || move.type !== 'play') return events
  const { turn } = before
  const { die, planes } = before.flight
  after.flight.planes.forEach((group, seat) => group.forEach((progress, plane) => {
    const prior = planes[seat][plane]
    if (seat !== turn) { if (prior >= 0 && progress < 0) events.collision++; return }
    if (prior < 0 && progress >= 0) events.takeoff = true
    if (prior !== flightFinish && progress === flightFinish) events.arrival = true
    if (die !== null && prior >= 0 && prior !== flightFinish && progress > prior + die) events.jump = true
    if (die !== null && prior >= 0 && prior !== flightFinish && prior + die > flightFinish &&
      progress === 2 * flightFinish - (prior + die) && cell(turn, plane, prior) === move.from &&
      cell(turn, plane, progress) === move.to) events.bounce = true
  }))
  return events
}

export function retireFlight(position: Position, side: Side): Position {
  const flight = position.flight
  if (!flight || side >= flight.planes.length || flight.retired?.includes(side)) return position
  const retired = [...(flight.retired ?? []), side]
  const remaining = flightSeatOrder(flight.planes.length).filter(seat => !retired.includes(seat))
  const turn = position.turn === side ? nextTurn(side, flight.planes.length, retired) : position.turn
  const die = position.turn === side ? null : flight.die
  const next = { board: makeBoard(flight.planes, retired), turn, flight: { ...flight, retired, die } }
  return remaining.length === 1 ? { ...next, result: { winner: remaining[0], reason: '其他机队均已退出' } } : next
}

function legal(position: Position, from?: number): Move[] {
  if (position.result || !position.flight) return []
  const { die, planes, options = defaultFlight } = position.flight
  if (die === null) return [{ type: 'roll', die: 0 }]
  const side = position.turn
  const moves = planes[side].flatMap((progress, plane): Move[] => {
    const next = destination(side, progress, die, options)
    if (next === null) return []
    const source = cell(side, plane, progress)
    if (from !== undefined && from !== source) return []
    return [{ type: 'play', from: source, to: cell(side, plane, next) }]
  })
  return moves.filter((move, index) => moves.findIndex(otherMove =>
    move.type === 'play' && otherMove.type === 'play' && move.from === otherMove.from && move.to === otherMove.to) === index)
}

export const flight: Rules = {
  id: 'flight', name: '飞行棋', subtitle: '掷骰起飞 · 两至四队竞速',
  sides: ['赤队', '青队', '金队', '蓝队'], variant: '家庭飞行棋 v2', width, height: width, surface: 'squares',
  guide: [
    '赤队先掷骰。可以将符合起飞条件的飞机移出机库，或让场上的飞机按骰点前进。掷出 6 点可再掷一次。',
    '轮流顺时针行棋。飞机沿外圈前进，绕回本队入口后进入终点跑道。先选飞机，再点亮起的落点。',
    '最终落点有其他队的飞机时，将它们撞回机库。自家飞机可同格停留。先让全队飞机抵达终点的一方获胜。',
  ],
  initial(_seed, _handicap, options) {
    const { players, fleet } = options ?? defaultFlight
    const planes = Array.from({ length: players }, () => Array<number>(fleet).fill(-1))
    return { board: makeBoard(planes), turn: 0, flight: { planes, die: null, options } }
  },
  legal,
  advance(position, move) {
    if (!position.flight) return position
    const { turn } = position
    const { planes: previous, retired, options = defaultFlight } = position.flight
    const following = nextTurn(turn, previous.length, retired)
    if (move.type === 'roll') {
      const next = { ...position, flight: { ...position.flight, die: move.die } }
      if (legal(next).length) return next
      return { ...position, turn: move.die === 6 ? turn : following }
    }
    if (move.type !== 'play' || position.flight.die === null) return position
    const die = position.flight.die
    const planes = previous.map(group => group.slice())
    const plane = planes[turn].findIndex((progress, index) => {
      const target = destination(turn, progress, die, options)
      return target !== null && cell(turn, index, progress) === move.from && cell(turn, index, target) === move.to
    })
    if (plane < 0) return position
    const progress = destination(turn, planes[turn][plane], die, options)!
    planes[turn][plane] = progress
    if (progress < 51) for (const seat of flightSeatOrder(planes.length)) {
      if (seat === turn || retired?.includes(seat)) continue
      planes[seat] = planes[seat].map((value, index) =>
        value >= 0 && value < 51 && cell(seat, index, value) === move.to ? -1 : value)
    }
    const next: Position = { board: makeBoard(planes, retired), turn: die === 6 ? turn : following, flight: { ...position.flight, planes, die: null } }
    if (planes[turn].every(value => value === flightFinish)) {
      next.result = { winner: turn, reason: `${planes[turn].length === 2 ? '两' : '四'}架飞机全部抵达` }
    }
    return next
  },
}
