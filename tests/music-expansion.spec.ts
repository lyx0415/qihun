import { expect, test } from '@playwright/test'

test('新版配乐真实解码，自动随页面切曲，关闭后停止循环', async ({ page }) => {
  await page.addInitScript(() => {
    const start = AudioBufferSourceNode.prototype.start
    const stop = AudioBufferSourceNode.prototype.stop
    AudioBufferSourceNode.prototype.start = function (...args: Parameters<typeof start>) {
      if (this.loop && this.buffer) {
        document.documentElement.dataset.musicSeconds = this.buffer.duration.toFixed(2)
      }
      return start.apply(this, args)
    }
    AudioBufferSourceNode.prototype.stop = function (...args: Parameters<typeof stop>) {
      if (this.loop) {
        const data = document.documentElement.dataset
        data.musicStops = String(Number(data.musicStops ?? 0) + 1)
      }
      return stop.apply(this, args)
    }
  })
  await page.goto('/#settings')
  await page.getByRole('checkbox', { name: '背景音乐' }).check()
  const html = page.locator('html')
  await expect(html).toHaveAttribute('data-music-seconds', '21.82')
  await page.getByRole('navigation').getByRole('button', { name: '牌类' }).click()
  await expect(html).toHaveAttribute('data-music-seconds', '15.74')
  await page.getByRole('navigation').getByRole('button', { name: '设置' }).click()
  await page.getByLabel('配乐', { exact: true }).selectOption('duel')
  await expect(html).toHaveAttribute('data-music-seconds', '16.55')
  const stopped = Number(await html.getAttribute('data-music-stops'))
  await page.getByRole('checkbox', { name: '背景音乐' }).uncheck()
  await expect(html).toHaveAttribute('data-music-stops', String(stopped + 1))
})

test('四人锄大地接力开局、隐藏手牌及连续三家过牌', async ({ page }) => {
  await page.goto('/#cards')
  await page.getByRole('button', { name: /锄大地/ }).click()
  await page.getByRole('button', { name: '四人同屏接力' }).click()
  await page.getByRole('button', { name: '开始发牌' }).click()
  await expect(page.locator('.table-seat')).toHaveCount(4)
  await expect(page.locator('.hand-card')).toHaveCount(0)
  const turn = await page.locator('.table-current strong').innerText()
  await page.getByRole('button', { name: '我已接手' }).click()
  await expect(page.locator('.hand-card')).toHaveCount(13)
  await page.getByRole('button', { name: '3♦', exact: true }).click()
  await page.getByRole('button', { name: '出牌', exact: true }).click()
  for (let i = 0; i < 3; i++) {
    await expect(page.locator('.hand-card')).toHaveCount(0)
    await page.getByRole('button', { name: '我已接手' }).click()
    await page.getByRole('button', { name: '不出', exact: true }).click()
  }
  await expect(page.locator('.table-current strong')).toHaveText(turn)
  await expect(page.locator('.table-caption')).toContainText('重新领出')
  await page.reload()
  await expect(page.locator('.hand-card')).toHaveCount(0)
})

test('英式跳棋界面显示必吃，跳吃后减少对方棋子并切换回合', async ({ page }) => {
  await page.goto('/#home')
  await page.locator('.game-card').filter({ hasText: '英式跳棋' }).click()
  await page.getByRole('dialog').getByRole('button', { name: '同屏对弈' }).click()
  await page.getByRole('button', { name: '开始对弈' }).click()
  const cell = (n: number) => page.locator('button[data-cell="' + n + '"]')
  for (const [from, to] of [[40, 33], [19, 26]]) {
    await cell(from).click()
    await cell(to).click()
  }
  await expect(page.locator('.play-status')).toContainText('有子可吃')
  await cell(33).click()
  await expect(cell(19)).toHaveAccessibleName(/可落子/)
  await cell(19).click()
  await expect(page.locator('.move-feedback')).toContainText('跳吃')
  await expect(page.locator('.board .token')).toHaveCount(23)
  await expect(page.locator('.player-current')).toContainText('红方')
})
