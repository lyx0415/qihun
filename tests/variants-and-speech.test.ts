import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import test from 'node:test'
import { speechForCards } from '../src/cards/voice'
import { advance, deal, recommendation } from '../src/cards/rules'
import { configuredRules, games, play, replay } from '../src/rules'
import { moveFeedback } from '../src/rules/feedback'
import { winningFive } from '../src/rules/gomoku'
import type { Move, Side } from '../src/rules/types'
import { speechForMove } from '../src/rules/voice-director'
import { advanceTimeline } from '../src/timeline'
import { newVoiceLines } from '../src/voice-lines'

const voiceFiles = new Set(readdirSync(new URL('../public/voice', import.meta.url)))

test('九种棋的首个正常动作各有语音，每条新增台词都有离线资产', () => {
  const expected = ['xPawn', 'gomokuBlack', 'goBlack', 'chessPawn', 'jungleElephant', 'roll6',
    'darkReveal', 'reversiOne', 'checkersMove']
  for (const [index, game] of games.entries()) {
    const before = game.initial('speech-test')
    const move = game.id === 'flight' ? { type: 'roll', die: 6 } as const : game.legal(before).find(action => action.type === 'play')!
    const next = play(game, before, move)
    assert.notEqual(next, before, game.id)
    const cues = speechForMove(game.id, before, move, next, moveFeedback(game, before, move, next)).cues
    assert.equal(cues[0], expected[index], game.id)
    assert(cues.every(cue => voiceFiles.has(`${cue}.wav`)), game.id)
  }
  assert(Object.keys(newVoiceLines).every(cue => voiceFiles.has(`${cue}.wav`)))
})

test('19 路盘保留让子，双方确认、改标和恢复可在同一份棋谱中重建', () => {
  const game = configuredRules('go', { size: 19, komi: 0.5, handicap: 3, review: true })
  const initial = game.initial()
  assert.equal(initial.board.length, 361)
  assert.equal(initial.board.filter(Boolean).length, 3)
  assert.equal(initial.turn, 1)
  const moves: Move[] = [
    { type: 'play', to: 180 }, { type: 'pass' }, { type: 'pass' },
    { type: 'markDead', to: 180 }, { type: 'confirmScore' }, { type: 'markDead', to: 180 }, { type: 'resumePlay' },
    { type: 'pass' }, { type: 'pass' }, { type: 'markDead', to: 180 }, { type: 'confirmScore' }, { type: 'confirmScore' },
  ]
  const frames = replay(game, moves)
  assert.equal(frames.length, moves.length + 1)
  assert.deepEqual(frames[5].goScoring?.accepted, [0])
  assert.deepEqual(frames[6].goScoring?.accepted, [])
  assert.equal(frames[7].goScoring, undefined)
  assert.equal(frames[7].turn, 0)
  assert.deepEqual(frames.at(-1)?.score, [361, 0.5])
  assert.equal(frames.at(-1)?.result?.winner, 0)
})

test('五子棋的长连和胜线按开局规则判定，象棋旧让马与新让子各自复现', () => {
  function line(exactFive: boolean) {
    const game = configuredRules('gomoku', { size: 11, exactFive })
    let position = game.initial()
    for (const to of [55, 0, 56, 2, 57, 4, 59, 6, 60, 8, 58]) {
      const next = play(game, position, { type: 'play', to })
      assert.notEqual(next, position)
      position = next
    }
    return position
  }
  assert.equal(line(true).result, undefined)
  const free = line(false)
  assert.equal(free.result?.winner, 0)
  assert.equal(winningFive(free, 58, 0).length, 6)
  for (const side of [0, 1] as const satisfies readonly Side[]) {
    assert.equal(configuredRules('xiangqi').initial('old', side).board[side === 0 ? 82 : 7], null)
    assert.equal(configuredRules('xiangqi', { handicapPiece: 'cannon' }).initial('new', side).board[side === 0 ? 64 : 25], null)
    assert.equal(configuredRules('xiangqi', { handicapPiece: 'twoHorses' }).initial('new', side).board.filter(Boolean).length, 30)
  }
})

test('三种牌可全程用报音驱动，三档电脑能玩完 15 张新牌桌', () => {
  for (const game of ['landlord', 'shedding', 'bigtwo'] as const) {
    for (const level of ['beginner', 'standard', 'challenge'] as const) {
      let table = deal({ game, mustBeat: true, deckSize: 15, level }, 'voice-full-round')
      if (game === 'shedding') {
        assert(table.hands.every(hand => hand.length === 15))
        assert.equal(new Set(table.hands.flat()).size, 45)
      }
      for (let step = 0; step < 220 && !table.result; step++) {
        const action = recommendation(table, true)
        const next = advance(table, action)
        assert.notEqual(next, table)
        const cues = speechForCards(table, action, next, true, true)
        assert(cues.length > 0 && cues.every(cue => voiceFiles.has(`${cue}.wav`)), `${game} ${action.type}: ${cues}`)
        table = next
      }
      assert(table.result, `${game} ${level}`)
    }
  }
})

test('不断追加或悔棋时保留已计算帧，仅重算变动的部分', () => {
  let applications = 0
  const apply = (prior: { sum: number }, change: number) => { applications++; return { sum: prior.sum + change } }
  const initial = () => ({ sum: 0 })
  const first = advanceTimeline(initial, apply, [2, 4, 6])
  const append = advanceTimeline(initial, apply, [2, 4, 6, 8], first)
  assert.equal(applications, 4)
  assert.strictEqual(first.frames[3], append.frames[3])
  const undoAndBranch = advanceTimeline(initial, apply, [2, 3], append)
  assert.equal(applications, 5)
  assert.strictEqual(first.frames[1], undoAndBranch.frames[1])
  assert.equal(undoAndBranch.frames.at(-1)?.sum, 5)
})
