import type { VoiceCue } from '../audio'
import { rankOf } from './rules'
import type { CardAction, HandKind, Table } from './rules'

const shapes: Record<HandKind, VoiceCue> = {
  single: 'single', pair: 'pair', triple: 'triple', tripleSingle: 'tripleSingle', triplePair: 'triplePair',
  straight: 'straight', pairRun: 'pairRun', plane: 'airplane', planeSingles: 'planeSingles', planePairs: 'planePairs',
  fourSingles: 'fourSingles', fourPairs: 'fourPairs', bomb: 'bomb', rocket: 'rocket',
  flush: 'flush', fullHouse: 'fullHouse', fourOne: 'fourOne', straightFlush: 'straightFlush',
}

export function speechForCards(before: Table, action: CardAction, next: Table, solo: boolean, full: boolean): VoiceCue[] {
  if (before.round !== next.round) return ['noBid', 'deal']
  if (action.type === 'bid') {
    const bids = ['noBid', 'bid1', 'bid2', 'bid3'] as const
    return next.phase === 'play' ? [bids[action.value], 'cardBidWon'] : [bids[action.value]]
  }
  if (action.type === 'pass') return next.last ? ['cardPass'] : ['cardPass', 'trickReset']
  const kind = next.last?.pattern.kind
  if (!kind) return []
  const left = next.hands[before.turn].length
  if (!full && left > 2 && (kind === 'single' || kind === 'pair')) return []
  const spoken: VoiceCue[] = [shapes[kind]]
  if (full && (kind === 'single' || kind === 'pair' || kind === 'triple')) {
    spoken.push(('rank' + rankOf(action.cards[0])) as VoiceCue)
  }
  if (next.result) spoken.push(solo && next.result.scores[0] < 0 ? 'lose' : next.options.game !== 'landlord' ? 'cardsWin'
    : next.result.winner === next.landlord ? 'landlord' : 'farmers')
  else if (left < 3) spoken.push(left === 1 ? 'lastCard' : 'lastPair')
  return spoken
}
