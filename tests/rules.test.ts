import assert from 'node:assert/strict'
import { test } from 'node:test'
import { games, play, replay, rules } from '../src/rules'
import { chooseMove } from '../src/rules/ai'
import { checkedKing, moveFeedback } from '../src/rules/feedback'
import { defaultFlight, flightChanges } from '../src/rules/flight'
import { blank, positionKey } from '../src/rules/types'
import type { Move, Piece, Position } from '../src/rules/types'

const legality = (game: keyof typeof rules, state: Position, from: number, to: number) =>
  rules[game].legal(state, from).some(move => move.type === 'play' && move.from === from && move.to === to)

function board(size: number, entries: [number, Piece['kind'], Piece['side']][]) {
  const cells = blank(size)
  for (const [index, kind, side] of entries) cells[index] = { kind, side }
  return cells
}

test('中国象棋开局、炮架和蹩腿', () => {
  const initial = rules.xiangqi.initial()
  assert.equal(rules.xiangqi.legal(initial).length, 44)
  const state: Position = { turn: 0, board: board(90, [[85, 'k', 0], [4, 'k', 1], [40, 'p', 0], [64, 'c', 0], [37, 'p', 0], [10, 'r', 1], [83, 'h', 0], [74, 'p', 0]]) }
  assert.equal(legality('xiangqi', state, 64, 10), true)
  assert.equal(legality('xiangqi', state, 64, 28), false)
  assert.equal(legality('xiangqi', state, 83, 66), false)
  assert.equal(legality('xiangqi', state, 83, 72), true)
})

test('中国象棋不可暴露将帅照面，象眼和过河受限', () => {
  const state: Position = { turn: 0, board: board(90, [[85, 'k', 0], [4, 'k', 1], [40, 'r', 0], [47, 'e', 0], [57, 'e', 0], [65, 'p', 0]]) }
  assert.equal(legality('xiangqi', state, 40, 39), false)
  assert.equal(legality('xiangqi', state, 40, 31), true)
  assert.equal(legality('xiangqi', state, 47, 31), false)
  assert.equal(legality('xiangqi', state, 57, 73), false)
  assert.equal(legality('xiangqi', state, 57, 77), true)
})

test('中国象棋红黑往返三次盘面判和', () => {
  const cycle: Move[] = [{ type: 'play', from: 82, to: 63 }, { type: 'play', from: 1, to: 18 }, { type: 'play', from: 63, to: 82 }, { type: 'play', from: 18, to: 1 }]
  const frames = replay(rules.xiangqi, [...cycle, ...cycle])
  assert.equal(frames.length, 9)
  assert.deepEqual(frames.at(-1)?.result, { winner: null, reason: '重复盘面' })
})

test('象棋让马局保留执先并按相同设定复盘', () => {
  const game = rules.xiangqi
  const red = game.initial(undefined, 0)
  const black = game.initial(undefined, 1)
  assert.equal(red.turn, 0)
  assert.equal(red.board[82], null)
  assert.equal(black.board[7], null)
  assert.equal(black.board.filter(Boolean).length, 31)
  assert.deepEqual(replay(game, [], undefined, 1)[0], black)
})

test('五子棋上边缘长连获胜，跨行不计算连子', () => {
  const state: Position = { turn: 0, board: board(225, [0, 1, 2, 3, 5].map(i => [i, 'stone', 0])) }
  assert.equal(play(rules.gomoku, state, { type: 'play', to: 4 }).result?.winner, 0)
  const broken: Position = { turn: 0, board: board(225, [12, 13, 14, 15].map(i => [i, 'stone', 0])) }
  assert.equal(play(rules.gomoku, broken, { type: 'play', to: 16 }).result, undefined)
})

test('五子棋人机会挡住盘上唯一必防点', () => {
  const state: Position = { turn: 0, board: board(225, [[0, 'stone', 1], [1, 'stone', 1], [2, 'stone', 1], [3, 'stone', 1]]) }
  assert.deepEqual(chooseMove(rules.gomoku, state, 'novice'), { type: 'play', to: 4 })
})

test('国际象棋易位的车随王移动，存在四种升变', () => {
  const castle: Position = { turn: 0, board: blank(64), fen: 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1' }
  const next = play(rules.chess, castle, { type: 'play', from: 60, to: 62 })
  assert.equal(next.board[61]?.kind, 'r')
  assert.equal(next.board[62]?.kind, 'k')
  const promotion: Position = { turn: 0, board: blank(64), fen: '7k/P7/8/8/8/8/8/7K w - - 0 1' }
  assert.equal(rules.chess.legal(promotion, 8).length, 4)
  assert.equal(play(rules.chess, promotion, { type: 'play', from: 8, to: 0 }), promotion)
  assert.equal(play(rules.chess, promotion, { type: 'play', from: 8, to: 0, promotion: 'q' }).board[0]?.kind, 'q')
})

test('国际象棋过路兵、最短将死和终局拒绝着法', () => {
  const enPassant: Position = { turn: 0, board: blank(64), fen: '7k/8/8/3pP3/8/8/8/7K w - d6 0 1' }
  const next = play(rules.chess, enPassant, { type: 'play', from: 28, to: 19 })
  assert.equal(next.board[27], null)
  assert.equal(next.board[19]?.kind, 'p')
  const moves: Move[] = [{ type: 'play', from: 53, to: 45 }, { type: 'play', from: 12, to: 28 }, { type: 'play', from: 54, to: 38 }, { type: 'play', from: 3, to: 39 }]
  const final = replay(rules.chess, moves).at(-1)!
  assert.deepEqual(final.result, { winner: 1, reason: '将死' })
  assert.equal(play(rules.chess, final, moves[0]), final)
})

test('围棋提子、禁自杀和盘面重复判定', () => {
  const cells = board(81, [[10, 'stone', 1], [1, 'stone', 0], [9, 'stone', 0], [11, 'stone', 0],
    [18, 'stone', 1], [20, 'stone', 1], [28, 'stone', 1]])
  const state: Position = { board: cells, turn: 0, seen: [positionKey(cells)] }
  const next = play(rules.go, state, { type: 'play', to: 19 })
  assert.equal(next.board[10], null)
  assert.deepEqual(next.captured, [1, 0])
  assert.equal(play(rules.go, next, { type: 'play', to: 10 }), next)
  const suicide: Position = { board: board(81, [[1, 'stone', 1], [9, 'stone', 1]]), turn: 0 }
  assert.equal(play(rules.go, suicide, { type: 'play', to: 0 }), suicide)
})

test('围棋连续两次停手按面积与贴目结算', () => {
  const state = replay(rules.go, [{ type: 'pass' }, { type: 'pass' }]).at(-1)
  assert.deepEqual(state?.score, [0, 7.5])
  assert.equal(state?.result?.winner, 1)
})

test('斗兽棋狮虎跳河、鼠阻挡、鼠吃象和占穴', () => {
  const line = board(63, [[28, '虎', 0], [31, '象', 1]])
  assert.equal(legality('jungle', { board: line, turn: 0 }, 28, 31), false)
  line[31] = { kind: '狼', side: 1 }
  assert.equal(legality('jungle', { board: line, turn: 0 }, 28, 31), true)
  line[29] = { kind: '鼠', side: 1 }
  assert.equal(legality('jungle', { board: line, turn: 0 }, 28, 31), false)
  const hunt: Position = { board: board(63, [[7, '鼠', 0], [8, '象', 1], [10, '虎', 0]]), turn: 0 }
  assert.equal(legality('jungle', hunt, 7, 8), true)
  assert.equal(play(rules.jungle, hunt, { type: 'play', from: 10, to: 3 }).result?.reason, '占领兽穴')
})

test('飞行棋掷骰范围、六点起飞再掷、撞子和终点反弹', () => {
  const initial = rules.flight.initial()
  assert.equal(play(rules.flight, initial, { type: 'roll', die: 9 }), initial)
  assert.equal(play(rules.flight, initial, { type: 'roll', die: 2 }).turn, 1)
  const rolled = play(rules.flight, initial, { type: 'roll', die: 6 })
  assert.equal(rules.flight.legal(rolled).length, 4)
  const takeOff = play(rules.flight, rolled, rules.flight.legal(rolled)[0])
  assert.equal(takeOff.flight?.planes[0][0], 0)
  assert.equal(takeOff.turn, 0)
  const route: Position = { ...initial, flight: { planes: [[24, 55, 56, 56], [0, -1, -1, -1]], die: 2 } }
  const hit = play(rules.flight, route, rules.flight.legal(route)[0])
  assert.equal(hit.flight?.planes[1][0], -1)
  const bounce = play(rules.flight, route, rules.flight.legal(route)[1])
  assert.equal(bounce.flight?.planes[0][1], 55)
})

test('翻棋固定种子可回放，首翻定阵营与盖子可作炮架', () => {
  const game = rules.dark
  const seed = 'fixed-layout'
  const initial = game.initial(seed)
  const next = play(game, initial, { type: 'play', to: 0 })
  assert.equal(next.dark?.first, initial.dark?.hidden[0]?.side)
  assert.equal(next.board[0]?.side, 0)
  assert.equal(next.board[1]?.kind, 'hidden')
  assert.deepEqual(replay(game, [{ type: 'play', to: 0 }], seed).at(-1), next)
  const cannon: Position = { ...initial, board: board(32, [[0, 'c', 0], [1, 'hidden', 0], [3, 'k', 1]]) }
  assert.equal(legality('dark', cannon, 0, 3), true)
  const rank: Position = { ...initial, board: board(32, [[0, 'k', 0], [1, 'p', 1]]) }
  assert.equal(legality('dark', rank, 0, 1), false)
  assert.equal(legality('dark', { ...rank, turn: 1 }, 1, 0), true)
})

test('飞行棋三四队按顺时针轮转，退出不影响剩余机队', () => {
  const game = rules.flight
  const miss: Move = { type: 'roll', die: 2 }
  const three = game.initial(undefined, undefined, { ...defaultFlight, players: 3, fleet: 2 })
  assert.equal(three.board.filter(Boolean).length, 6)
  assert.equal(play(game, three, miss).turn, 2)
  assert.equal(play(game, play(game, three, miss), miss).turn, 1)
  const options = { ...defaultFlight, players: 4 } as const
  const frames = replay(game, [miss, miss, miss, miss], 'flight', undefined, options)
  assert.deepEqual(frames.map(frame => frame.turn), [0, 2, 1, 3, 0])
  let active = frames.at(-1)!
  for (const side of [0, 2, 1] as const) active = play(game, active, { type: 'resign', side })
  assert.equal(active.result?.winner, 3)
  assert.equal(active.board.filter(Boolean).length, 4)
})

test('飞行棋可选一码起飞、过点禁走与同色跳，撞机指向正确队伍', () => {
  const game = rules.flight
  const options = { ...defaultFlight, players: 4, fleet: 2, takeoff: 'one-or-six', overshoot: 'exact', colorJump: true } as const
  const initial = game.initial(undefined, undefined, options)
  const ready = play(game, initial, { type: 'roll', die: 1 })
  const launch = game.legal(ready)[0]
  const airborne = play(game, ready, launch)
  assert.ok(flightChanges(ready, airborne, launch).takeoff)
  assert.equal(airborne.turn, 2)
  const jump: Position = { ...initial, flight: { options, planes: [[3, -1], [-1, -1], [-1, -1], [-1, -1]], die: 1 } }
  const jumpMove = game.legal(jump).find(move => move.type === 'play' && move.to === 51)!
  const jumped = play(game, jump, jumpMove)
  assert.equal(jumped.flight?.planes[0][0], 8)
  assert.ok(flightChanges(jump, jumped, jumpMove).jump)
  const exact: Position = { ...initial, flight: { options, planes: [[55, 56], [-1, -1], [-1, -1], [-1, -1]], die: null } }
  assert.equal(play(game, exact, { type: 'roll', die: 2 }).turn, 2)
  const finishing: Position = { ...initial, flight: { options, planes: [[54, 56], [-1, -1], [-1, -1], [-1, -1]], die: 2 } }
  const arrival = game.legal(finishing)[0]
  assert.equal(arrival.type === 'play' && arrival.to, 111)
  assert.equal(play(game, finishing, arrival).result?.winner, 0)
  const crash: Position = { ...initial, flight: { options, planes: [[11, -1], [-1, -1], [0, -1], [-1, -1]], die: 2 } }
  const collision = game.legal(crash)[0]
  const crashed = play(game, crash, collision)
  assert.equal(crashed.flight?.planes[2][0], -1)
  assert.equal(flightChanges(crash, crashed, collision).collision, 1)
})

test('四队飞行棋人机走完后可完整复盘', () => {
  const game = rules.flight
  const options = { ...defaultFlight, players: 4, fleet: 2, colorJump: true, takeoff: 'one-or-six' } as const
  let position = game.initial(undefined, undefined, options)
  let random = 7821
  const moves: Move[] = []
  while (!position.result && moves.length < 2000) {
    const decision = chooseMove(game, position, 'medium')!
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0
    const move = decision.type === 'roll' ? { ...decision, die: 1 + (random >>> 16) % 6 } : decision
    const next = play(game, position, move)
    assert.notEqual(next, position)
    position = next
    moves.push(move)
  }
  assert.ok(position.result && position.result.winner !== null)
  assert.deepEqual(replay(game, moves, undefined, undefined, options).at(-1), position)
})

test('黑白棋只允许夹子，翻子后计分，无合法落点才可跳过', () => {
  const game = rules.reversi
  const initial = game.initial()
  assert.deepEqual(game.legal(initial).map(move => move.type === 'play' && move.to), [19, 26, 37, 44])
  assert.equal(play(game, initial, { type: 'pass' }), initial)
  const move: Move = { type: 'play', to: 19 }
  const placed = play(game, initial, move)
  assert.deepEqual(placed.score, [4, 1])
  assert.deepEqual(moveFeedback(game, initial, move, placed)[0].cells, [27])
  const limited: Position = { turn: 0, board: Array.from({ length: 64 }, (_, index) =>
    index === 0 ? null : { side: index === 1 ? 0 : 1, kind: 'disc' }) }
  assert.deepEqual(game.legal(limited), [{ type: 'pass' }])
  const passed = play(game, limited, { type: 'pass' })
  assert.equal(passed.turn, 1)
  assert.equal(play(game, passed, { type: 'play', to: 0 }).result?.winner, 1)
})

test('象棋将军和炮打、西洋棋将死对应独立提示', () => {
  const game = rules.xiangqi
  const checked: Position = { turn: 0, board: board(90, [[85, 'k', 0], [4, 'k', 1], [40, 'p', 0], [14, 'r', 0]]) }
  const attack: Move = { type: 'play', from: 14, to: 13 }
  const after = play(game, checked, attack)
  assert.equal(checkedKing(game, after), 4)
  assert.deepEqual(moveFeedback(game, checked, attack, after).map(event => event.sound), ['check'])
  const artillery: Position = { turn: 0, board: board(90, [[85, 'k', 0], [4, 'k', 1], [40, 'p', 0], [64, 'c', 0], [37, 'p', 0], [10, 'r', 1]]) }
  const capture: Move = { type: 'play', from: 64, to: 10 }
  assert.equal(moveFeedback(game, artillery, capture, play(game, artillery, capture))[0].sound, 'cannon')
  const chessMoves: Move[] = [{ type: 'play', from: 53, to: 45 }, { type: 'play', from: 12, to: 28 },
    { type: 'play', from: 54, to: 38 }, { type: 'play', from: 3, to: 39 }]
  const frames = replay(rules.chess, chessMoves)
  assert.deepEqual(moveFeedback(rules.chess, frames[3], chessMoves[3], frames[4]).map(event => event.sound), ['check', 'end'])
})

test('围棋区分打吃与多子提取，并标出受打吃的一组棋', () => {
  const game = rules.go
  const attack: Position = { turn: 0, board: board(81, [[10, 'stone', 1], [1, 'stone', 0], [9, 'stone', 0]]) }
  const drop: Move = { type: 'play', to: 19 }
  assert.deepEqual(moveFeedback(game, attack, drop, play(game, attack, drop)), [{ sound: 'atari', label: '打吃', cells: [10] }])
  const take: Position = { turn: 0, board: board(81, [[10, 'stone', 1], [11, 'stone', 1],
    [1, 'stone', 0], [2, 'stone', 0], [9, 'stone', 0], [12, 'stone', 0], [20, 'stone', 0]]) }
  assert.equal(moveFeedback(game, take, drop, play(game, take, drop))[0].sound, 'goMulti')
})

test('英式跳棋全盘有吃必吃，连跳期间只允许原棋继续', () => {
  const game = rules.checkers
  assert.equal(game.initial().board.filter(Boolean).length, 24)
  const state: Position = { turn: 0, board: board(64, [[42, 'man', 0], [46, 'man', 0], [35, 'man', 1], [21, 'man', 1], [1, 'man', 1]]) }
  const jump: Move = { type: 'play', from: 42, to: 28 }
  assert.deepEqual(game.legal(state), [jump])
  assert.equal(play(game, state, { type: 'play', from: 46, to: 37 }), state)
  const after = play(game, state, jump)
  assert.equal(after.turn, 0)
  assert.equal(after.jumpFrom, 28)
  assert.equal(after.board[35], null)
  assert.equal(moveFeedback(game, state, jump, after)[0].sound, 'chain')
  const resolved = play(game, after, { type: 'play', from: 28, to: 14 })
  assert.equal(resolved.turn, 1)
  assert.equal(resolved.jumpFrom, undefined)
  assert.equal(resolved.board[21], null)
})

test('英式跳棋升王结束回合，王可用反向吃子', () => {
  const game = rules.checkers
  const state: Position = { turn: 0, board: board(64, [[17, 'man', 0], [10, 'man', 1], [12, 'man', 1]]) }
  const move: Move = { type: 'play', from: 17, to: 3 }
  const after = play(game, state, move)
  assert.equal(after.turn, 1)
  assert.deepEqual(after.board[3], { side: 0, kind: 'king' })
  assert.equal(moveFeedback(game, state, move, after)[0].sound, 'kinged')
  assert.deepEqual(game.legal({ ...after, turn: 0 }), [{ type: 'play', from: 3, to: 21 }])
})

test('九种棋的合法动作序列可以稳定回放', () => {
  let seed = 493180
  const random = (n: number) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
    return seed % n
  }
  for (const game of games) {
    for (let run = 0; run < 3; run++) {
      let position = game.initial()
      const moves: Move[] = []
      for (let step = 0; step < 100 && !position.result; step++) {
        const legal = game.legal(position)
        assert.ok(legal.length > 0, game.id)
        const pick = legal[random(legal.length)]
        const move: Move = pick.type === 'roll' ? { type: 'roll', die: 1 + random(6) } : pick
        const next = play(game, position, move)
        assert.notEqual(next, position, game.id)
        position = next
        moves.push(move)
      }
      assert.deepEqual(replay(game, moves).at(-1), position, game.id)
    }
  }
})
