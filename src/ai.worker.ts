import { chooseMove } from './rules/ai'
import type { Difficulty } from './rules/ai'
import { configuredRules } from './rules'
import type { GameId, GridOptions, Position } from './rules/types'

self.onmessage = (event: MessageEvent<{ game: GameId; grid?: GridOptions; position: Position; level: Difficulty }>) => {
  const { game, grid, position, level } = event.data
  self.postMessage(chooseMove(configuredRules(game, grid), position, level))
}
