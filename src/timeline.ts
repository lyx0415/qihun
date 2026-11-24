import { useMemo, useRef } from 'react'

type Timeline<State, Action> = { actions: Action[]; frames: State[] }

export function advanceTimeline<State, Action>(
  initial: () => State, apply: (state: State, action: Action) => State, actions: Action[], previous?: Timeline<State, Action>,
): Timeline<State, Action> {
  let common = 0
  if (previous) {
    const limit = Math.min(actions.length, previous.frames.length - 1)
    while (common < limit && previous.actions[common] === actions[common]) common++
  }
  const frames = previous ? previous.frames.slice(0, common + 1) : [initial()]
  for (let index = common; index < actions.length; index++) {
    const current = frames[frames.length - 1]
    const next = apply(current, actions[index])
    if (next === current) break
    frames.push(next)
  }
  return { actions, frames }
}

export function useTimeline<State, Action>(key: object | string, initial: () => State, apply: (state: State, action: Action) => State, actions: Action[]) {
  const cache = useRef<{ key: object | string; result: Timeline<State, Action> } | undefined>(undefined)
  return useMemo(() => {
    const previous = cache.current?.key === key ? cache.current.result : undefined
    const result = advanceTimeline(initial, apply, actions, previous)
    cache.current = { key, result }
    return result.frames
  }, [key, actions, initial, apply])
}
