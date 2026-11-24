export type CardGame = 'landlord' | 'shedding' | 'bigtwo'
export type Seat = 0 | 1 | 2 | 3
export type CardMode = 'solo' | 'local'
export type CardLevel = 'beginner' | 'standard' | 'challenge'
export type Options = { game: CardGame; mustBeat: boolean; deckSize?: 15 | 16; level?: CardLevel }
export type Bid = 0 | 1 | 2 | 3
export type CardAction = { type: 'bid'; value: Bid } | { type: 'play'; cards: number[] } | { type: 'pass' }
export type HandKind = 'single' | 'pair' | 'triple' | 'tripleSingle' | 'triplePair' | 'straight' | 'pairRun'
  | 'plane' | 'planeSingles' | 'planePairs' | 'fourSingles' | 'fourPairs' | 'bomb' | 'rocket'
  | 'flush' | 'fullHouse' | 'fourOne' | 'straightFlush'
type Pattern = { kind: HandKind; high: number; size: number; tie?: number }
export type CardMatch = {
  id: string; rules: string; options: Options; mode: CardMode; seed: string; actions: CardAction[]
}
export type Table = {
  options: Options; seed: string; round: number; hands: number[][]; bottom: number[]
  turn: Seat; phase: 'bid' | 'play' | 'end'; landlord?: Seat; bid: Bid; bidSeat?: Seat; bidTurns: number
  last?: { seat: Seat; cards: number[]; pattern: Pattern }; passes: number; played: number; multiplier: number
  result?: { winner: Seat; label: string; scores: number[] }
}

export const names: Record<CardGame, string> = { landlord: '经典斗地主', shedding: '跑得快', bigtwo: '锄大地' }
export const labels: Record<HandKind, string> = {
  single: '单张', pair: '对子', triple: '三张', tripleSingle: '三带一', triplePair: '三带二',
  straight: '顺子', pairRun: '连对', plane: '飞机', planeSingles: '飞机带单', planePairs: '飞机带对',
  fourSingles: '四带二', fourPairs: '四带两对', bomb: '炸弹', rocket: '王炸',
  flush: '同花', fullHouse: '葫芦', fourOne: '四条', straightFlush: '同花顺',
}
const seats = [0, 1, 2, 3] as const
export const seatList = (game: CardGame): Seat[] => seats.slice(0, game === 'bigtwo' ? 4 : 3)
const nextSeat = (seat: Seat, count: number): Seat => seats[(seat + 1) % count]
export function firstCard(game: CardGame) {
  return game === 'bigtwo' ? 3 : 0
}
export const rankOf = (id: number) => id >= 52 ? id - 36 : Math.floor(id / 4) + 3
export const suitOf = (id: number) => id >= 52 ? '★' : ['♠', '♥', '♣', '♦'][id % 4]
export const faceOf = (id: number) => ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2', '小王', '大王'][rankOf(id) - 3]
const sort = (cards: number[]) => cards.slice().sort((a, b) => a - b)
const consecutive = (ranks: number[]) => ranks.at(-1)! <= 14 && ranks.every((r, i) => i === 0 || r === ranks[i - 1] + 1)

function groups(cards: number[]) {
  const by = new Map<number, number[]>()
  for (const id of sort(cards)) {
    const rank = rankOf(id)
    const group = by.get(rank) ?? []
    group.push(id)
    by.set(rank, group)
  }
  return by
}

const fiveCardOrder: HandKind[] = ['straight', 'flush', 'fullHouse', 'fourOne', 'straightFlush']

function bigTwoPattern(cards: number[], by: Map<number, number[]>): Pattern | undefined {
  if (cards.some(id => id >= 52)) return
  const ranks = [...by.keys()]
  const size = cards.length
  const high = ranks.at(-1)!
  const topSuit = (rank: number) => Math.max(...by.get(rank)!.map(id => 3 - id % 4))
  const countRank = (size: number) => ranks.find(rank => by.get(rank)?.length === size)
  if (ranks.length === 1 && size <= 3) return {
    kind: (['single', 'pair', 'triple'] as const)[size - 1], high, size, tie: topSuit(high),
  }
  if (size !== 5) return
  const straight = ranks.length === 5 && consecutive(ranks)
  const flush = cards.every(id => id % 4 === cards[0] % 4)
  if (straight && flush) return { kind: 'straightFlush', high, size, tie: topSuit(high) }
  const quad = countRank(4)
  if (quad !== undefined) return { kind: 'fourOne', high: quad, size }
  const triple = countRank(3)
  if (triple !== undefined && countRank(2) !== undefined) return { kind: 'fullHouse', high: triple, size }
  if (flush) {
    const faceValue = ranks.slice().reverse().reduce((value, rank) => value * 16 + rank, 0)
    return { kind: 'flush', high: 3 - cards[0] % 4, size, tie: faceValue }
  }
  if (straight) return { kind: 'straight', high, size, tie: topSuit(high) }
}

export function classify(cards: number[], game: CardGame): Pattern | undefined {
  const size = cards.length
  if (!size || new Set(cards).size !== size || cards.some(id => !Number.isInteger(id) || id < 0 || id > 53)) return
  const by = groups(cards)
  if (game === 'bigtwo') return bigTwoPattern(cards, by)
  const ranks = [...by.keys()]
  const high = ranks.at(-1)!
  const counts = [...by.values()].map(group => group.length)
  const pattern = (kind: HandKind, value = high): Pattern => ({ kind, high: value, size })
  if (size === 2 && cards.includes(52) && cards.includes(53)) return game === 'landlord' ? pattern('rocket') : undefined
  if (ranks.length === 1) {
    return pattern((['single', 'pair', 'triple', 'bomb'] as const)[size - 1])
  }
  const triple = ranks[counts.indexOf(3)]
  if (ranks.length === 2 && triple !== undefined && size === 4) return pattern('tripleSingle', triple)
  if (ranks.length === 2 && triple !== undefined && size === 5) return pattern('triplePair', triple)
  if (size >= 5 && size === ranks.length && consecutive(ranks)) return pattern('straight')
  if (ranks.length >= (game === 'landlord' ? 3 : 2) && counts.every(n => n === 2) && consecutive(ranks)) return pattern('pairRun')
  const four = ranks[counts.indexOf(4)]
  if (game === 'landlord' && four !== undefined) {
    if (size === 6) return pattern('fourSingles', four)
    if (size === 8 && ranks.length === 3 && counts.filter(n => n === 2).length === 2) return pattern('fourPairs', four)
  }
  for (const [unit, kind] of [[3, 'plane'], [4, 'planeSingles'], [5, 'planePairs']] as const) {
    const length = size / unit
    if (length < 2 || !Number.isInteger(length)) continue
    for (let first = 3; first + length - 1 <= 14; first++) {
      const core = Array.from({ length }, (_, i) => first + i)
      if (!core.every(r => by.get(r)?.length === 3)) continue
      if (kind === 'planePairs' && counts.filter(n => n === 2).length !== length) continue
      return pattern(kind, core.at(-1))
    }
  }
}

export function beats(a: Pattern, b: Pattern, game: CardGame = 'landlord') {
  if (game === 'bigtwo') {
    if (a.size !== b.size) return false
    const category = fiveCardOrder.indexOf(a.kind) - fiveCardOrder.indexOf(b.kind)
    if (a.size === 5 && category) return category > 0
    return a.kind === b.kind && (a.high > b.high || a.high === b.high && (a.tie ?? 0) > (b.tie ?? 0))
  }
  if (b.kind === 'rocket') return false
  if (a.kind === 'rocket') return true
  if (a.kind === 'bomb' && b.kind !== 'bomb') return true
  return a.kind === b.kind && a.size === b.size && a.high > b.high
}

function shuffle(seed: string, options: Options) {
  const { game, deckSize } = options
  let state = 2166136261
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619)
  const removed = deckSize === 15 ? [43, 45, 46, 47, 49, 50, 51] : [44, 49, 50, 51]
  const deck = Array.from({ length: game === 'landlord' ? 54 : 52 }, (_, i) => i)
    .filter(id => game !== 'shedding' || !removed.includes(id))
  for (let i = deck.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    const j = Math.floor(state / 4294967296 * (i + 1))
    const saved = deck[i]
    deck[i] = deck[j]
    deck[j] = saved
  }
  return deck
}

export function deal(options: Options, seed: string, round = 0): Table {
  const deck = shuffle(seed + ':' + round, options)
  const isLandlord = options.game === 'landlord'
  const count = isLandlord ? 17 : options.game === 'bigtwo' ? 13 : options.deckSize ?? 16
  const roster = seatList(options.game)
  const hands = roster.map(seat => sort(deck.slice(count * seat, count * (seat + 1))))
  const turn = isLandlord ? roster[(deck[0] + round) % 3] : roster[hands.findIndex(hand => hand.includes(firstCard(options.game)))]
  return { options, seed, round, hands, turn, phase: isLandlord ? 'bid' : 'play', bottom: deck.slice(count * roster.length),
    bid: 0, bidTurns: 0, passes: 0, played: 0, multiplier: 1 }
}

function validPattern(table: Table, cards: number[]) {
  const pattern = classify(cards, table.options.game)
  if (!pattern || !cards.every(card => table.hands[table.turn].includes(card))) return
  if (table.options.game !== 'landlord' && !table.played && !cards.includes(firstCard(table.options.game))) return
  if (table.last && !beats(pattern, table.last.pattern, table.options.game)) return
  return pattern
}

function subsets<T>(items: T[], count: number): T[][] {
  if (count === 0) return [[]]
  return items.flatMap((item, index) => index + count <= items.length
    ? subsets(items.slice(index + 1), count - 1).map(tail => [item, ...tail]) : [])
}

export function possiblePlays(table: Table): number[][] {
  if (table.phase !== 'play') return []
  const hand = table.hands[table.turn]
  if (table.options.game === 'bigtwo') {
    const sizes = table.last ? [table.last.pattern.size] : [1, 2, 3, 5]
    return sizes.flatMap(size => subsets(hand, size).filter(cards => validPattern(table, cards)))
  }
  const by = groups(hand)
  const entries = [...by.entries()]
  const plays = new Map<string, number[]>()
  const add = (cards: number[]) => {
    if (!validPattern(table, cards)) return
    const sorted = sort(cards)
    plays.set(sorted.join(','), sorted)
  }
  const pairWings = (rest: number[], count: number) =>
    subsets([...groups(rest).values()].filter(g => g.length >= 2), count).map(pairs => pairs.flatMap(g => g.slice(0, 2)))
  for (const [rank, group] of entries) {
    for (let count = 1; count <= group.length; count++) add(group.slice(0, count))
    if (group.length < 3) continue
    const rest = hand.filter(id => rankOf(id) !== rank)
    for (const card of rest) add([...group.slice(0, 3), card])
    for (const wing of pairWings(rest, 1)) add([...group.slice(0, 3), ...wing])
    if (group.length === 4 && table.options.game === 'landlord') {
      for (const wing of [...subsets(rest, 2), ...pairWings(rest, 2)]) add([...group, ...wing])
    }
  }
  if (hand.includes(52) && hand.includes(53)) add([52, 53])
  for (const unit of [1, 2, 3]) {
    for (const [first] of entries) {
      const core: number[] = []
      for (let rank = first; rank <= 14; rank++) {
        const group = by.get(rank)
        if (!group || group.length < unit) break
        core.push(...group.slice(0, unit))
        const length = rank - first + 1
        if (length < (unit === 1 ? 5 : unit === 2 && table.options.game === 'landlord' ? 3 : 2)) continue
        add(core)
        if (unit === 3) {
          const rest = hand.filter(id => rankOf(id) < first || rankOf(id) > rank)
          for (const wing of [...subsets(rest, length), ...pairWings(rest, length)]) add([...core, ...wing])
        }
      }
    }
  }
  return [...plays.values()]
}

export function canPass(table: Table) {
  return table.phase === 'play' && !!table.last &&
    (!table.options.mustBeat || table.options.game !== 'shedding' || !cachedPlays(table).length)
}

const tablePlays = new WeakMap<Table, number[][]>()

function cachedPlays(table: Table) {
  const cached = tablePlays.get(table)
  if (cached) return cached
  const plays = possiblePlays(table)
  tablePlays.set(table, plays)
  return plays
}

export function advance(table: Table, action: CardAction): Table {
  if (table.phase === 'end') return table
  if (table.phase === 'bid') {
    if (action.type !== 'bid' || ![0, 1, 2, 3].includes(action.value) || (action.value > 0 && action.value <= table.bid)) return table
    const bid = action.value || table.bid
    const leader = action.value ? table.turn : table.bidSeat
    if (table.bidTurns < 2 && bid !== 3) return {
      ...table, turn: nextSeat(table.turn, table.hands.length), bid, bidSeat: leader, bidTurns: table.bidTurns + 1,
    }
    if (leader === undefined) return deal(table.options, table.seed, table.round + 1)
    const hands = table.hands.map((hand, seat) => seat === leader ? sort([...hand, ...table.bottom]) : hand)
    return { ...table, hands, phase: 'play', turn: leader, landlord: leader, bid, bidSeat: leader }
  }
  if (action.type === 'pass') {
    if (!canPass(table)) return table
    const reset = table.passes === table.hands.length - 2
    return { ...table, turn: nextSeat(table.turn, table.hands.length), last: reset ? undefined : table.last, passes: reset ? 0 : table.passes + 1 }
  }
  if (action.type !== 'play') return table
  const pattern = validPattern(table, action.cards)
  if (!pattern) return table
  const winner = table.turn
  const hands = table.hands.map((hand, seat) => seat === winner ? hand.filter(id => !action.cards.includes(id)) : hand)
  const multiplier = table.multiplier * (pattern.kind === 'bomb' || pattern.kind === 'rocket' ? 2 : 1)
  const next: Table = { ...table, hands, multiplier, last: { seat: winner, cards: sort(action.cards), pattern },
    passes: 0, played: table.played + 1, turn: nextSeat(winner, hands.length) }
  if (hands[winner].length) return next
  if (table.landlord !== undefined) {
    const won = winner === table.landlord
    const unit = table.bid * multiplier * (won ? 1 : -1)
    next.result = { winner, label: won ? '地主获胜' : '农民获胜', scores: hands.map((_, seat) => seat === table.landlord ? unit * 2 : -unit) }
  } else {
    const losses = hands.map(hand => -hand.length)
    next.result = { winner, label: `玩家 ${winner + 1} 获胜`, scores: losses.map((loss, seat) =>
      seat === winner ? -losses.reduce((sum, value) => sum + value, 0) : loss) }
  }
  return { ...next, phase: 'end' }
}

export function framesFor(match: CardMatch) {
  const frames = [deal(match.options, match.seed)]
  for (const action of match.actions) {
    const prior = frames.at(-1)!
    const next = advance(prior, action)
    if (next === prior) break
    frames.push(next)
  }
  return frames
}

export function recommendation(table: Table, ai = false): CardAction {
  if (table.phase === 'bid') {
    const strength = table.hands[table.turn].reduce((value, id) => value + (id >= 52 ? 3 : rankOf(id) === 15 ? 1 : 0), 0)
    const bid: Bid = strength >= 8 ? 3 : strength >= 5 ? 2 : strength >= 3 ? 1 : 0
    return { type: 'bid', value: bid > table.bid || (!table.bid && table.bidTurns === 2) ? bid || 1 : 0 }
  }
  const candidates = cachedPlays(table)
  const finish = candidates.find(cards => cards.length === table.hands[table.turn].length)
  if (finish) return { type: 'play', cards: finish.slice() }
  if (ai && table.landlord !== undefined && table.last && table.last.seat !== table.landlord && table.turn !== table.landlord) {
    return { type: 'pass' }
  }
  const score = (cards: number[]) => {
    const p = classify(cards, table.options.game)!
    const bomb = p.kind === 'bomb' || p.kind === 'rocket' ? 120 : 0
    if (!ai || table.options.level === undefined || table.options.level === 'standard') return cards.length * 19 - p.high - bomb
    if (table.options.level === 'beginner') return cards.length * 8 - p.high - bomb
    const remainder = table.hands[table.turn].filter(card => !cards.includes(card))
    const lonely = [...groups(remainder).values()].filter(group => group.length === 1).length
    return cards.length * 22 - p.high * 1.9 - bomb - lonely * 3
  }
  let cards: number[] | undefined
  let best = -Infinity
  for (const candidate of candidates) {
    const value = score(candidate)
    if (value > best) { cards = candidate; best = value }
  }
  return cards ? { type: 'play', cards: cards.slice() } : { type: 'pass' }
}
