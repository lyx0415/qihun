import { expect, test } from '@playwright/test'
import { advance, deal, recommendation } from '../src/cards/rules'
import type { CardAction, CardMatch } from '../src/cards/rules'

test('离线普通话可以解码并发声，炮打事件实际载入对应音频', async ({ page }) => {
  await page.addInitScript(() => {
    const decoded = new WeakSet<AudioBuffer>()
    const decode = AudioContext.prototype.decodeAudioData
    const start = AudioBufferSourceNode.prototype.start
    AudioContext.prototype.decodeAudioData = async function (bytes) {
      const buffer = await decode.call(this, bytes)
      if (buffer.getChannelData(0).some(value => Math.abs(value) > .05)) decoded.add(buffer)
      return buffer
    }
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof start>) {
      if (this.buffer && decoded.has(this.buffer)) {
        document.documentElement.dataset.voiceStarts = String(Number(document.documentElement.dataset.voiceStarts ?? 0) + 1)
      }
      return start.apply(this, args)
    }
  })
  await page.goto('/#settings')
  await expect(page.getByRole('checkbox', { name: '普通话报音' })).toBeChecked()
  const voice = page.waitForResponse(res => res.url().endsWith('/voice/check.wav') && res.ok())
  await page.getByRole('button', { name: '将军', exact: true }).click()
  await voice
  await expect(page.locator('html')).toHaveAttribute('data-voice-starts', '1')
  await page.goto('/#home')
  await page.locator('.hero .button').click()
  await page.getByRole('dialog').getByRole('button', { name: '同屏对弈' }).click()
  await page.getByRole('button', { name: '开始对弈' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-voice-starts', '2')
  const before = Number((await page.locator('html').getAttribute('data-voice-starts')) ?? 0)
  const cannon = page.waitForResponse(res => res.url().endsWith('/voice/cannon.wav') && res.ok())
  await page.locator('button[data-cell="64"]').click()
  await page.locator('button[data-cell="1"]').click()
  await expect(page.locator('.move-feedback')).toContainText('炮打')
  await cannon
  await expect(page.locator('html')).toHaveAttribute('data-voice-starts', String(before + 1))
})

test('斗地主图赏可开牌局，叫三分进入出牌，交接与刷新均先隐藏手牌', async ({ page }) => {
  await page.goto('/#home')
  await page.getByRole('navigation').getByRole('button', { name: '牌类' }).click()
  await page.getByRole('button', { name: /经典斗地主/ }).click()
  const setup = page.getByRole('dialog')
  await setup.getByRole('button', { name: '三人同屏接力' }).click()
  await setup.getByRole('button', { name: '开始发牌' }).click()
  await expect(page.locator('.hand-card')).toHaveCount(0)
  await page.getByRole('button', { name: '我已接手' }).click()
  await expect(page.locator('.hand-card')).toHaveCount(17)
  await page.getByRole('button', { name: '叫 3 分' }).click()
  await expect(page.locator('.hand-card')).toHaveCount(0)
  await expect(page.locator('.table-seat.table-current')).toContainText('地主 · 20 张')
  await page.getByRole('button', { name: '我已接手' }).click()
  await page.getByRole('button', { name: '提示' }).click()
  await page.getByRole('button', { name: '出牌', exact: true }).click()
  await expect(page.locator('.played-cards .card-face').first()).toBeVisible()
  await expect(page.locator('.hand-card')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.hand-card')).toHaveCount(0)
  await expect(page.locator('.played-cards .card-face').first()).toBeVisible()
})

test('跑得快结算从正在进行转到牌局复盘', async ({ page }) => {
  const options = { game: 'shedding', mustBeat: true } as const
  const actions: CardAction[] = []
  let table = deal(options, 'end-to-end')
  for (;;) {
    const move = recommendation(table)
    const next = advance(table, move)
    if (next.result) break
    if (next === table || actions.length >= 350) throw new Error('Fixture failed to finish')
    actions.push(move)
    table = next
  }
  const active: CardMatch = { id: 'end-fixture', seed: 'end-to-end', options, mode: 'local', rules: '三人 48 张', actions }
  await page.addInitScript(match => {
    localStorage.setItem('qihun.local.v1', JSON.stringify({
      version: 1, current: 'guest', settings: { voice: false }, profiles: [{
        id: 'guest', name: '棋手', active: {}, history: [], cards: { shedding: match },
      }],
    }))
  }, active)
  await page.goto('/#table/shedding/end-fixture')
  await page.getByRole('button', { name: '我已接手' }).click()
  await page.getByRole('button', { name: '提示' }).click()
  await page.getByRole('button', { name: '出牌', exact: true }).click()
  await expect(page.locator('.card-result h2')).toContainText('获胜')
  await page.getByRole('button', { name: '复盘', exact: true }).click()
  await expect(page.getByRole('heading', { name: '跑得快复盘' })).toBeVisible()
  await expect(page.locator('.hand-card')).toHaveCount(0)
  await page.getByRole('button', { name: '下一步' }).click()
  await expect(page.locator('.replay-controls')).toContainText('1 /')
})
