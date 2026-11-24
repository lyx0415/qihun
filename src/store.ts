import { Capacitor } from '@capacitor/core'
import { Preferences } from '@capacitor/preferences'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Difficulty } from './rules/ai'
import type { FlightOptions, GameId, GridOptions, Move, Result, Side } from './rules/types'
import type { MusicChoice, SoundStyle } from './audio'
import type { CardGame, CardMatch } from './cards/rules'

export type Mode = 'local' | 'ai'
export type Settings = {
  sound: boolean
  voice: boolean
  voiceDetail: 'full' | 'key'
  voiceVolume: number
  music: boolean
  musicChoice: MusicChoice
  volume: number
  musicVolume: number
  soundStyle: SoundStyle
  jungleStyle: 'illustrated' | 'text'
  boardTheme: 'wood' | 'jade'
  animation: boolean
  hints: boolean
  undo: boolean
  coordinates: boolean
  moveTrail: boolean
  cardSkin: 'ivory' | 'midnight'
}
export type Match = {
  id: string
  game: GameId
  variant: string
  mode: Mode
  level: Difficulty
  human: Side
  handicap?: Side
  flightOptions?: FlightOptions
  gridOptions?: GridOptions
  started: string
  moves: Move[]
}
export type Completed = Match & { ended: string; result: Result }
type Profile = {
  id: string
  name: string
  active: Partial<Record<GameId, Match>>
  history: Completed[]
  cards?: Partial<Record<CardGame, CardMatch>>
  cardHistory?: CardMatch[]
}
export type AppData = {
  version: 1
  current: string
  profiles: Profile[]
  settings: Settings
}

const key = 'qihun.local.v1'
const native = Capacitor.isNativePlatform()
const defaults: Settings = {
  sound: true, voice: true, voiceDetail: 'full', voiceVolume: 86, music: false, musicChoice: 'auto', volume: 69, musicVolume: 42, soundStyle: 'crisp',
  jungleStyle: 'illustrated', boardTheme: 'wood', animation: true, hints: true, undo: true, coordinates: false, moveTrail: true, cardSkin: 'ivory',
}
const initial: AppData = {
  version: 1,
  current: 'guest',
  profiles: [{ id: 'guest', name: '访客棋手', active: {}, history: [] }],
  settings: defaults,
}

export function activeProfile(data: AppData) {
  return data.profiles.find(profile => profile.id === data.current) ?? data.profiles[0]
}

export function updateProfile(data: AppData, edit: (profile: Profile) => Profile): AppData {
  return { ...data, profiles: data.profiles.map(profile => profile.id === data.current ? edit(profile) : profile) }
}

export function saveMatch(data: AppData, match: Match, result?: Result): AppData {
  return updateProfile(data, profile => {
    const active = { ...profile.active, [match.game]: match }
    if (!result) return { ...profile, active }
    delete active[match.game]
    const record = { ...match, result, ended: new Date().toISOString() }
    return { ...profile, active, history: [record, ...profile.history.filter(item => item.id !== record.id)] }
  })
}

export function addProfile(data: AppData, name: string): AppData {
  const id = makeId()
  return { ...data, current: id, profiles: [...data.profiles, { id, name, active: {}, history: [] }] }
}

export function makeId() {
  return globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2)
}

function decode(raw: string): AppData {
  const data: AppData = JSON.parse(raw)
  if (data.version !== 1 || !Array.isArray(data.profiles) || !data.profiles.length ||
    !data.profiles.every(profile => profile.id && profile.name && profile.active && Array.isArray(profile.history))) {
    throw new Error('无法识别本地档案')
  }
  return { ...data, current: activeProfile(data).id, settings: { ...defaults, ...data.settings } }
}

export function useStore() {
  const [data, setData] = useState(initial)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState('')
  const current = useRef(initial)
  const writes = useRef(Promise.resolve())
  const writable = useRef(true)

  useEffect(() => {
    async function load() {
      try {
        const raw = native ? (await Preferences.get({ key })).value : localStorage.getItem(key)
        if (raw) current.current = decode(raw)
        setData(current.current)
      } catch {
        writable.current = false
        setError('无法读取原存档，本次对局只在当前会话保留。')
      } finally {
        setReady(true)
      }
    }
    void load()
  }, [])

  const update = useCallback((edit: (old: AppData) => AppData) => {
    const next = edit(current.current)
    if (next === current.current) return
    current.current = next
    setData(next)
    if (!writable.current) return
    const raw = JSON.stringify(next)
    if (native) {
      writes.current = writes.current.then(async () => {
        try {
          await Preferences.set({ key, value: raw })
          setError('')
        } catch {
          setError('本地保存失败，请检查设备空间。')
        }
      })
    } else {
      try {
        localStorage.setItem(key, raw)
        setError('')
      } catch {
        setError('本地保存失败，请检查浏览器存储权限或空间。')
      }
    }
  }, [])

  return { data, ready, error, update }
}

export function exportHistory(data: AppData) {
  const { name, active, history, cards, cardHistory } = activeProfile(data)
  return JSON.stringify({ version: 1, name, exported: new Date().toISOString(), active, history, cards, cardHistory }, null, 2)
}
