import assert from 'node:assert/strict'
import { test } from 'node:test'
import { advance, beats, canPass, classify, deal, framesFor, possiblePlays, recommendation, rankOf } from '../src/cards/rules'
import type { CardAction, CardGame, CardMatch, Table } from '../src/cards/rules'

const landlord = { game: 'landlord', mustBeat: false } as const
const shedding = { game: 'shedding', mustBeat: true } as const
const bigtwo = { game: 'bigtwo', mustBeat: false } as const
const kind = (cards: number[], game: CardGame = 'landlord') => classify(cards, game)?.kind

test('两套牌桌发牌唯一且可按种子重建', () => {
  const first = deal(landlord, '棋魂')
  assert.deepEqual(deal(landlord, '棋魂'), first)
  assert.deepEqual(first.hands.map(hand => hand.length), [17, 17, 17])
  assert.equal(new Set([...first.hands.flat(), ...first.bottom]).size, 54)
  const fast = deal(shedding, '跑得快')
  assert.deepEqual(fast.hands.map(hand => hand.length), [16, 16, 16])
  assert.ok(fast.hands[fast.turn].includes(0))
  assert.ok([44, 49, 50, 51, 52, 53].every(id => !fast.hands.flat().includes(id)))
})

test('斗地主叫分只可提高，三分立即结束，全不叫重发', () => {
  const start = deal(landlord, '开局')
  const raised = advance(start, { type: 'bid', value: 2 })
  assert.equal(advance(raised, { type: 'bid', value: 2 }), raised)
  const chosen = advance(raised, { type: 'bid', value: 3 })
  assert.equal(chosen.landlord, raised.turn)
  assert.equal(chosen.turn, raised.turn)
  assert.equal(chosen.hands[raised.turn].length, 20)
  const redealt = [0, 0, 0].reduce(table => advance(table, { type: 'bid', value: 0 }), start)
  assert.equal(redealt.round, 1)
  assert.equal(redealt.phase, 'bid')
  assert.notDeepEqual(redealt.hands, start.hands)
})

test('识别顺子、连对、飞机带牌、炸弹、王炸，非法搭配被拒绝', () => {
  assert.equal(kind([0, 4, 8, 12, 16]), 'straight')
  assert.equal(kind([36, 40, 44, 48, 52]), undefined)
  assert.equal(kind([0, 1, 4, 5]), undefined)
  assert.equal(kind([0, 1, 4, 5], 'shedding'), 'pairRun')
  assert.equal(kind([0, 1, 4, 5, 8, 9]), 'pairRun')
  assert.equal(kind([0, 1, 2, 4, 5, 6, 8, 12]), 'planeSingles')
  assert.equal(kind([0, 1, 2, 4, 5, 6, 8, 9, 12, 13]), 'planePairs')
  assert.equal(kind([0, 1, 2, 3, 4, 8]), 'fourSingles')
  assert.equal(kind([0, 1, 2, 3, 4, 5, 8, 9]), 'fourPairs')
  assert.equal(kind([0, 1, 2, 3]), 'bomb')
  assert.equal(kind([52, 53]), 'rocket')
  assert.equal(kind([0, 0]), undefined)
  assert.ok(beats(classify([0, 1, 2, 3], 'landlord')!, classify([53], 'landlord')!))
  assert.ok(!beats(classify([4, 5], 'landlord')!, classify([0, 1, 2], 'landlord')!))
})

test('跑得快先手必须持带黑桃三，两次过牌恢复领出，必管配置生效', () => {
  const initial = deal(shedding, '跟牌')
  const nonOpener = initial.hands[initial.turn].find(id => id !== 0)!
  assert.equal(advance(initial, { type: 'play', cards: [nonOpener] }), initial)
  const table: Table = { ...initial, hands: [[0, 1], [4, 5], [8, 9]], turn: 0 }
  const opened = advance(table, { type: 'play', cards: [0] })
  assert.ok(!canPass(opened))
  assert.deepEqual(possiblePlays(opened).map(cards => cards.map(rankOf)), [[4]])
  const openPass = { ...opened, options: { ...shedding, mustBeat: false } }
  const reset = advance(advance(openPass, { type: 'pass' }), { type: 'pass' })
  assert.equal(reset.turn, 0)
  assert.equal(reset.last, undefined)
  assert.ok(!canPass(reset))
})

test('三套牌桌不同发牌均可由人机走完并逐步复盘', () => {
  for (const options of [landlord, shedding, { ...shedding, mustBeat: false }, bigtwo]) {
    for (let seed = 0; seed < 7; seed++) {
      const initial = String(seed)
      let table = deal(options, initial)
      const actions: CardAction[] = []
      while (!table.result && actions.length < 350) {
        const move = recommendation(table, true)
        const next = advance(table, move)
        assert.notEqual(next, table, options.game + ' seed ' + initial + ' event ' + actions.length)
        actions.push(move)
        table = next
      }
      assert.ok(table.result)
      assert.equal(table.result.scores.reduce((total, score) => total + score, 0), 0)
      const match: CardMatch = { id: initial, options, mode: 'solo', rules: 'test', seed: initial, actions }
      assert.deepEqual(framesFor(match).at(-1), table)
    }
  }
})

test('锄大地四人发牌、方块三首出、三家过牌回到领出者', () => {
  const initial = deal(bigtwo, '四人局')
  assert.deepEqual(initial.hands.map(hand => hand.length), [13, 13, 13, 13])
  assert.equal(new Set(initial.hands.flat()).size, 52)
  assert.ok(initial.hands[initial.turn].includes(3))
  const otherCard = initial.hands[initial.turn].find(id => id !== 3)!
  assert.equal(advance(initial, { type: 'play', cards: [otherCard] }), initial)
  let active = advance(initial, { type: 'play', cards: [3] })
  for (let i = 0; i < 3; i++) {
    assert.ok(canPass(active))
    active = advance(active, { type: 'pass' })
  }
  assert.equal(active.turn, initial.turn)
  assert.equal(active.last, undefined)
  assert.ok(!canPass(active))
})

test('锄大地比较同点花色与五张牌等级，四条不能压单张', () => {
  const suit = (cards: number[]) => classify(cards, 'bigtwo')!
  assert.ok(beats(suit([0]), suit([3]), 'bigtwo'))
  assert.ok(beats(suit([0, 3]), suit([1, 2]), 'bigtwo'))
  const straight = suit([3, 4, 10, 13, 19])
  const flush = suit([0, 4, 8, 16, 24])
  const fullHouse = suit([0, 1, 2, 8, 9])
  const fourOne = suit([0, 1, 2, 3, 4])
  const straightFlush = suit([3, 7, 11, 15, 19])
  for (const [better, worse] of [[flush, straight], [fullHouse, flush], [fourOne, fullHouse], [straightFlush, fourOne]]) {
    assert.ok(beats(better, worse, 'bigtwo'))
  }
  assert.ok(!beats(fourOne, suit([48]), 'bigtwo'))
  assert.equal(classify([32, 37, 42, 47, 48], 'bigtwo'), undefined)
})
