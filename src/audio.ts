import type { SoundCue } from './rules/feedback'
import type { ExtraVoice } from './voice-lines'

export type SoundStyle = 'crisp' | 'soft'
export type MusicScene = 'lounge' | 'duel' | 'cards'
export type MusicChoice = 'auto' | MusicScene
export const musicNames: Record<MusicChoice, string> = {
  auto: '自动随局', lounge: '竹影清音', duel: '楚河交锋', cards: '牌桌律动',
}
type Tone = [frequency: number, delay: number, gain: number, length: number, wave?: OscillatorType, end?: number]
type Sound = { tones: Tone[]; impact?: [filter: number, gain: number, length: number] }
const sounds: Record<SoundCue, Sound> = {
  move: { tones: [[295, 0, .29, .075, 'triangle', 230], [1060, .005, .09, .038]], impact: [1220, .16, .045] },
  capture: { tones: [[233, 0, .49, .17, 'triangle', 136], [817, .026, .22, .13, 'triangle'], [135, .058, .17, .16]], impact: [1020, .33, .14] },
  cannon: { tones: [[126, 0, .64, .36, 'triangle', 49], [470, .037, .27, .20, 'square', 130], [192, .11, .11, .23]], impact: [510, .45, .33] },
  check: { tones: [[294, 0, .25, .17, 'triangle', 190], [698, .062, .34, .36, 'triangle'], [1175, .21, .21, .44, 'triangle']], impact: [1880, .18, .105] },
  atari: { tones: [[740, 0, .25, .09, 'triangle'], [1110, .103, .19, .19, 'triangle']], impact: [1950, .10, .055] },
  threat: { tones: [[350, 0, .21, .09, 'square'], [530, .074, .19, .09, 'triangle'], [708, .15, .15, .21, 'triangle']] },
  goCapture: { tones: [[830, 0, .28, .11, 'triangle', 513], [397, .063, .18, .12]], impact: [2140, .12, .07] },
  goMulti: { tones: [[835, 0, .26, .12], [620, .08, .23, .12], [465, .154, .26, .17, 'triangle']], impact: [1990, .22, .15] },
  roll: { tones: [[490, 0, .20, .06, 'square'], [580, .06, .15, .06, 'triangle'], [720, .13, .19, .08, 'triangle']], impact: [1680, .18, .15] },
  takeoff: { tones: [[200, 0, .28, .28, 'triangle', 730], [1020, .12, .11, .20]], impact: [1700, .09, .14] },
  collision: { tones: [[126, 0, .56, .22, 'triangle', 63], [445, .035, .26, .18, 'square', 172]], impact: [890, .42, .19] },
  arrival: { tones: [[523, 0, .23, .23, 'triangle'], [780, .11, .22, .27, 'triangle'], [1047, .20, .17, .31]] },
  jump: { tones: [[355, 0, .23, .16, 'triangle', 915], [1130, .12, .11, .19]] },
  bounce: { tones: [[418, 0, .29, .11, 'triangle', 245], [360, .12, .21, .13, 'triangle', 180]] },
  flip: { tones: [[375, 0, .22, .095, 'triangle'], [800, .065, .17, .14]], impact: [2650, .21, .10] },
  end: { tones: [[98, 0, .41, .37, 'triangle', 61], [392, .03, .28, .23, 'triangle'], [523, .18, .26, .26, 'triangle'],
    [659, .32, .24, .47, 'triangle'], [784, .46, .29, .69, 'triangle'], [1047, .49, .17, .60], [392, .48, .18, .59]], impact: [1900, .13, .18] },
  defeat: { tones: [[311, 0, .23, .37, 'triangle'], [247, .19, .24, .44, 'triangle'], [147, .42, .28, .55]], impact: [620, .09, .17] },
  draw: { tones: [[523, 0, .21, .27], [392, .14, .20, .40, 'triangle'], [523, .25, .15, .32]] },
  message: { tones: [[880, 0, .10, .16]] },
  cardPlay: { tones: [[420, 0, .14, .056, 'triangle'], [252, .041, .19, .082, 'triangle']], impact: [3150, .29, .10] },
  cardRun: { tones: [[285, 0, .19, .08, 'triangle'], [470, .04, .19, .10, 'triangle'], [745, .10, .13, .14]], impact: [3020, .32, .17] },
  bombBlast: { tones: [[149, 0, .68, .44, 'triangle', 42], [377, .029, .25, .24, 'sawtooth', 88],
    [84, .19, .24, .41, 'triangle', 47]], impact: [550, .53, .47] },
  rocketBlast: { tones: [[316, 0, .24, .22, 'triangle', 1310], [216, .16, .37, .27, 'sawtooth', 1560],
    [133, .33, .63, .50, 'triangle', 43], [920, .36, .26, .28, 'triangle', 340]], impact: [780, .44, .54] },
  flushBurst: { tones: [[196, 0, .39, .32, 'triangle', 84], [523, .036, .27, .24, 'triangle'],
    [659, .095, .23, .27, 'triangle'], [784, .157, .22, .30, 'triangle'], [1047, .22, .19, .41]], impact: [2520, .34, .21] },
  kinged: { tones: [[294, 0, .28, .28, 'triangle'], [587, .085, .28, .35], [880, .19, .21, .46]], impact: [1900, .12, .09] },
  chain: { tones: [[330, 0, .37, .10, 'triangle'], [494, .11, .32, .11, 'triangle'], [740, .21, .18, .15]], impact: [1370, .24, .17] },
}

let audio: AudioContext | undefined
let effectsBus: GainNode | undefined
let musicBus: GainNode | undefined
let duckBus: GainNode | undefined
let voiceBus: GainNode | undefined
let noiseBuffer: AudioBuffer | undefined
let volumeLevel = .6
let musicLevel = .42
let voiceLevel = .86
let voiceTicket = 0
let voiceSource: AudioBufferSourceNode | undefined
let voiceBusy = false
let waitingVoice: VoiceCue[] | undefined
const clips = new Map<string, Promise<AudioBuffer | undefined>>()
let wantedMusic: MusicScene | undefined
let loadingMusic: MusicScene | undefined
let activeMusic: { scene: MusicScene; source: AudioBufferSourceNode; fade: GainNode } | undefined
export type VoiceCue = 'check' | 'capture' | 'cannon' | 'atari' | 'threat' | 'goCapture' | 'goMulti'
  | 'roll' | 'takeoff' | 'collision' | 'arrival' | 'jump' | 'bounce' | 'flip' | 'mate' | 'end' | 'draw'
  | 'deal' | 'bid1' | 'bid2' | 'bid3' | 'noBid' | 'pass' | 'single' | 'pair' | 'triple' | 'tripleSingle' | 'triplePair'
  | 'straight' | 'pairRun' | 'airplane' | 'fourSingles' | 'fourPairs' | 'bomb' | 'rocket'
  | 'lastCard' | 'lastPair' | 'landlord' | 'farmers' | 'cardsWin' | 'kinged' | 'chain' | 'win' | 'lose'
  | 'flush' | 'fullHouse' | 'fourOne' | 'straightFlush' | ExtraVoice

export function unlockAudio() {
  try {
    if (!audio) {
      audio = new AudioContext()
      const compressor = audio.createDynamicsCompressor()
      compressor.threshold.value = -11
      compressor.attack.value = .003
      compressor.connect(audio.destination)
      effectsBus = audio.createGain()
      effectsBus.gain.value = volumeLevel
      effectsBus.connect(compressor)
      musicBus = audio.createGain()
      musicBus.gain.value = musicLevel
      duckBus = audio.createGain()
      musicBus.connect(duckBus).connect(compressor)
      voiceBus = audio.createGain()
      voiceBus.gain.value = voiceLevel
      voiceBus.connect(compressor)
      audio.addEventListener('statechange', reconcileMusic)
    }
    if (audio.state === 'suspended') void audio.resume().then(reconcileMusic).catch(() => {})
    else reconcileMusic()
  } catch {
    // Sound availability depends on the browser and device.
  }
}

function loadClip(path: string) {
  const ctx = audio
  if (!ctx) return Promise.resolve(undefined)
  const previous = clips.get(path)
  if (previous) return previous
  const request = fetch(new URL(path, document.baseURI)).then(response => {
    if (!response.ok) throw new Error(`Audio asset ${path}: ${response.status}`)
    return response.arrayBuffer()
  }).then(bytes => ctx.decodeAudioData(bytes)).catch(() => {
    clips.delete(path)
    return undefined
  })
  clips.set(path, request)
  return request
}

export function stopVoice() {
  voiceTicket++
  voiceSource?.stop()
  voiceSource = undefined
  voiceBusy = false
  waitingVoice = undefined
}

function duckMusic(depth: number, hold: number) {
  if (!audio || !duckBus) return
  const start = audio.currentTime
  duckBus.gain.cancelScheduledValues(start)
  duckBus.gain.setTargetAtTime(depth, start, .045)
  duckBus.gain.setTargetAtTime(1, start + hold, .25)
}

export function announce(cue: VoiceCue, enabled: boolean, follow?: VoiceCue) {
  announceSequence(follow ? [cue, follow] : [cue], enabled)
}

export function announceSequence(cues: VoiceCue[], enabled: boolean, routine = false) {
  if (!enabled || !cues.length) return
  if (routine && voiceBusy) {
    waitingVoice = cues
    return
  }
  unlockAudio()
  const ctx = audio
  if (!ctx || !voiceBus) return
  stopVoice()
  const ticket = voiceTicket
  const bus = voiceBus
  voiceBusy = true
  const running = ctx.state === 'suspended' ? ctx.resume().catch(() => {}) : Promise.resolve()
  const finish = () => {
    if (ticket !== voiceTicket) return
    voiceSource = undefined
    voiceBusy = false
    const queued = waitingVoice
    waitingVoice = undefined
    if (queued) announceSequence(queued, true)
  }
  void Promise.all(cues.map(async line => ({ line, clip: await loadClip(`voice/${line}.wav`) }))).then(async loaded => {
    await running
    if (ticket !== voiceTicket) return
    if (ctx.state !== 'running') { finish(); return }
    const phrases = loaded.filter((item): item is { line: VoiceCue; clip: AudioBuffer } => !!item.clip)
    const play = (index: number) => {
      if (ticket !== voiceTicket) return
      const phrase = phrases[index]
      if (!phrase) { finish(); return }
      const { clip, line } = phrase
      const source = ctx.createBufferSource()
      source.buffer = clip
      source.playbackRate.value = ['bomb', 'rocket', 'straightFlush', 'cannon', 'check', 'chain'].includes(line) ? 1.09 : line === 'lose' ? .94 : 1
      source.connect(bus)
      voiceSource = source
      duckMusic(.43, clip.duration / source.playbackRate.value + .08)
      source.start()
      source.onended = () => play(index + 1)
    }
    play(0)
  }).catch(finish)
}

function envelope(ctx: AudioContext, start: number, gain: number, length: number) {
  const node = ctx.createGain()
  node.gain.setValueAtTime(.001, start)
  node.gain.exponentialRampToValueAtTime(gain, start + .007)
  node.gain.exponentialRampToValueAtTime(.001, start + length)
  return node
}

function pluck(bus: GainNode, tone: Tone, offset: number, soft: boolean) {
  if (!audio) return
  const [frequency, delay, gain, length, wave = 'sine', end] = tone
  const start = audio.currentTime + delay + offset
  const oscillator = audio.createOscillator()
  const amp = envelope(audio, start, gain * (soft ? .63 : 1), length)
  oscillator.type = soft && (wave === 'square' || wave === 'sawtooth') ? 'triangle' : wave
  oscillator.frequency.setValueAtTime(frequency, start)
  if (end) oscillator.frequency.exponentialRampToValueAtTime(end, start + length * .72)
  oscillator.connect(amp).connect(bus)
  oscillator.start(start)
  oscillator.stop(start + length)
}

function impact(bus: GainNode, sample: NonNullable<Sound['impact']>, offset: number, soft: boolean) {
  if (!audio) return
  const [frequency, gain, length] = sample
  if (!noiseBuffer) {
    noiseBuffer = audio.createBuffer(1, Math.ceil(audio.sampleRate * .60), audio.sampleRate)
    const samples = noiseBuffer.getChannelData(0)
    for (let index = 0; index < samples.length; index++) samples[index] = 2 * Math.random() - 1
  }
  const noise = audio.createBufferSource()
  noise.buffer = noiseBuffer
  const filter = audio.createBiquadFilter()
  filter.type = 'bandpass'
  filter.frequency.value = soft ? frequency * .75 : frequency
  filter.Q.value = 1.1
  const start = audio.currentTime + offset
  const amp = envelope(audio, start, gain * (soft ? .40 : 1), length)
  noise.connect(filter).connect(amp).connect(bus)
  noise.start(start)
  noise.stop(start + length)
}

export function effect(name: SoundCue, enabled: boolean, style: SoundStyle = 'crisp', delay = 0) {
  if (!enabled || !audio) return
  const schedule = () => {
    if (!effectsBus || audio?.state !== 'running') return
    const sound = sounds[name]
    const soft = style === 'soft'
    if (['bombBlast', 'rocketBlast', 'cannon', 'check', 'end', 'defeat'].includes(name) && !delay) {
      duckMusic(soft ? .72 : .56, name === 'rocketBlast' ? .86 : .55)
    }
    for (const tone of sound.tones) pluck(effectsBus, tone, delay, soft)
    if (sound.impact) impact(effectsBus, sound.impact, delay, soft)
  }
  if (audio.state === 'running') schedule()
  else if (audio.state === 'suspended') void audio.resume().then(schedule).catch(() => {})
}

export function syncVolume(volume: number, musicVolume: number, voiceVolume: number) {
  volumeLevel = volume / 100
  musicLevel = musicVolume / 100
  voiceLevel = voiceVolume / 100
  if (audio && effectsBus && musicBus && voiceBus) {
    effectsBus.gain.setTargetAtTime(volumeLevel, audio.currentTime, .03)
    musicBus.gain.setTargetAtTime(musicLevel, audio.currentTime, .03)
    voiceBus.gain.setTargetAtTime(voiceLevel, audio.currentTime, .03)
  }
}

function fadeOldMusic() {
  if (!audio || !activeMusic) return
  const time = audio.currentTime
  activeMusic.fade.gain.cancelScheduledValues(time)
  activeMusic.fade.gain.setTargetAtTime(0, time, .08)
  activeMusic.source.stop(time + .38)
  activeMusic = undefined
}

export function reconcileMusic() {
  const scene = document.hidden ? undefined : wantedMusic
  const ctx = audio
  const bus = musicBus
  if (!scene) { fadeOldMusic(); return }
  if (!ctx || ctx.state !== 'running' || !bus || activeMusic?.scene === scene || loadingMusic === scene) return
  loadingMusic = scene
  void loadClip(`music/${scene}.ogg`).then(clip => {
    if (loadingMusic === scene) loadingMusic = undefined
    if (!clip || document.hidden || wantedMusic !== scene || ctx.state !== 'running' || activeMusic?.scene === scene) return
    fadeOldMusic()
    const fade = ctx.createGain()
    fade.gain.setValueAtTime(0, ctx.currentTime)
    fade.gain.linearRampToValueAtTime(.76, ctx.currentTime + .35)
    const source = ctx.createBufferSource()
    source.buffer = clip
    source.loop = true
    source.connect(fade).connect(bus)
    source.start()
    activeMusic = { scene, source, fade }
  })
}

export function syncMusic(enabled: boolean, scene: MusicScene = 'lounge') {
  wantedMusic = enabled ? scene : undefined
  reconcileMusic()
}
