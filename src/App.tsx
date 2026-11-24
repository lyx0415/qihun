import { ArrowDownToLine, ArrowDownRight, ArrowRight, BookOpen, Bot, ChevronRight, CircleHelp, Clock3, Dices, Grid2X2, Home, Leaf, Play, Plus, Settings2, Spade, Swords, Trophy, UserRound, Users, Volume2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { announce, effect, musicNames, reconcileMusic, stopVoice, syncMusic, syncVolume, unlockAudio } from './audio'
import type { MusicChoice, VoiceCue } from './audio'
import { CardDesk } from './cards/CardDesk'
import { names as cardNames } from './cards/rules'
import type { CardAction, CardGame, CardLevel, CardMatch, CardMode, Table } from './cards/rules'
import { MatchDesk } from './MatchDesk'
import { configuredRules, games, rules } from './rules'
import type { Difficulty } from './rules/ai'
import type { SoundCue } from './rules/feedback'
import { defaultFlight, playerCounts } from './rules/flight'
import { defaultGo } from './rules/go'
import { defaultGomoku } from './rules/gomoku'
import type { FlightOptions, GameId, GoOptions, GomokuOptions, Move, Position, Side, XiangqiOptions } from './rules/types'
import { xiangqiHandicaps } from './rules/xiangqi'
import { activeProfile, addProfile, exportHistory, makeId, saveMatch, updateProfile, useStore } from './store'
import type { AppData, Match, Mode, Settings } from './store'
import { Dialog, GameIcon } from './ui'

const sections = [
  { id: 'home', label: '大厅', icon: Home },
  { id: 'library', label: '棋类', icon: Grid2X2 },
  { id: 'cards', label: '牌类', icon: Spade },
  { id: 'history', label: '棋谱', icon: BookOpen },
  { id: 'settings', label: '设置', icon: Settings2 },
] as const
type Section = typeof sections[number]['id']
type Route = { section: Section } | { section: 'play' | 'review'; game: GameId; id: string }
  | { section: 'table' | 'card-review'; game: CardGame; id: string }

function readRoute(): Route {
  const [section, game, id] = location.hash.slice(1).split('/')
  if ((section === 'play' || section === 'review') && games.some(item => item.id === game) && id) return { section, game: game as GameId, id }
  if ((section === 'table' || section === 'card-review') && (game === 'landlord' || game === 'shedding' || game === 'bigtwo') && id) return { section, game, id }
  const view = sections.find(entry => entry.id === section)
  return { section: view?.id ?? 'home' }
}

function navigate(section: Route['section'], game?: GameId | CardGame, id?: string) {
  location.hash = game && id ? `${section}/${game}/${id}` : section
}

function shortDate(iso: string) {
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

const gameMeta: Record<GameId, string> = {
  xiangqi: '楚河汉界', gomoku: '11／15／19 路 · 自由或恰五', go: '9／13／19 路 · 面积计分',
  chess: '8 × 8 · 标准开局', jungle: '7 × 9 · 动物棋子', flight: '2–4 人 · 自选规则', dark: '4 × 8 · 盖子开局',
  reversi: '8 × 8 · 夹击翻子',
  checkers: '8 × 8 · 必吃连跳',
}

const cardGames = ['landlord', 'shedding', 'bigtwo'] as const
const cardTagline: Record<CardGame, string> = {
  landlord: '叫分定地主 · 炸弹翻倍', shedding: '15／16 张 · 三人竞速', bigtwo: '四人竞速 · 同花与顺子',
}

const boardCollection = [
  ['gomoku', 'stones'], ['checkers', 'walnut'], ['flight', 'paper-flight'],
] as const

export default function App() {
  const { data, ready, error, update } = useStore()
  const [route, setRoute] = useState(readRoute)
  const [setup, setSetup] = useState<GameId>()
  const [cardSetup, setCardSetup] = useState<CardGame>()
  const [cardMode, setCardMode] = useState<CardMode>('solo')
  const [mustBeat, setMustBeat] = useState(true)
  const [deckSize, setDeckSize] = useState<15 | 16>(16)
  const [cardLevel, setCardLevel] = useState<CardLevel>('standard')
  const [profilesOpen, setProfilesOpen] = useState(false)
  const [setupMode, setSetupMode] = useState<Mode>('ai')
  const [level, setLevel] = useState<Difficulty>('medium')
  const [human, setHuman] = useState<Side>(0)
  const [handicap, setHandicap] = useState<Side>()
  const [handicapPiece, setHandicapPiece] = useState<XiangqiOptions['handicapPiece']>('horse')
  const [flightOptions, setFlightOptions] = useState<FlightOptions>(defaultFlight)
  const [goOptions, setGoOptions] = useState<GoOptions>(defaultGo)
  const [gomokuOptions, setGomokuOptions] = useState<GomokuOptions>(defaultGomoku)
  const [inMatchSettings, setInMatchSettings] = useState(false)
  const [name, setName] = useState('')
  const [filter, setFilter] = useState<GameId | 'all'>('all')
  const [backup, setBackup] = useState('')
  const intro = useRef<VoiceCue | undefined>(undefined)

  useEffect(() => {
    const change = () => {
      setRoute(readRoute())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', change)
    return () => window.removeEventListener('hashchange', change)
  }, [])
  useEffect(() => syncVolume(data.settings.volume, data.settings.musicVolume, data.settings.voiceVolume),
    [data.settings.volume, data.settings.musicVolume, data.settings.voiceVolume])
  useEffect(() => {
    const cue = intro.current
    intro.current = undefined
    if (cue) announce(cue, true)
  }, [route])
  const autoScene = route.section === 'table' || route.section === 'cards' ? 'cards'
    : route.section === 'play' && ['xiangqi', 'chess', 'jungle', 'dark', 'checkers'].includes(route.game) ? 'duel' : 'lounge'
  const scene = data.settings.musicChoice === 'auto' ? autoScene : data.settings.musicChoice
  useEffect(() => { syncMusic(data.settings.music, scene) }, [data.settings.music, scene])
  useEffect(() => {
    document.addEventListener('visibilitychange', reconcileMusic)
    return () => { document.removeEventListener('visibilitychange', reconcileMusic); syncMusic(false) }
  }, [])
  useEffect(() => {
    document.addEventListener('click', unlockAudio, { capture: true, once: true })
    return () => document.removeEventListener('click', unlockAudio, true)
  }, [])

  if (!ready) return <div className="loading"><Leaf size={28} /><span>正在读取本地棋谱…</span></div>
  const profile = activeProfile(data)
  const ongoing = Object.values(profile.active).sort((a, b) => Number(b.game === 'xiangqi') - Number(a.game === 'xiangqi') || b.started.localeCompare(a.started))
  const recent = ongoing[0]
  const isDesk = route.section === 'play' || route.section === 'review'
  const isTable = route.section === 'table' || route.section === 'card-review'
  const currentMatch = isDesk ? (profile.active[route.game]?.id === route.id ? profile.active[route.game] : profile.history.find(item => item.id === route.id)) : undefined
  const currentCard = isTable ? (profile.cards?.[route.game]?.id === route.id ? profile.cards[route.game] :
    profile.cardHistory?.find(item => item.id === route.id)) : undefined
  const selectedNav = isTable ? 'cards' : isDesk ? (route.section === 'review' ? 'history' : 'library') : route.section
  const soundsOn = data.settings.sound || data.settings.voice

  function openSetup(game: GameId, mode: Mode = 'ai', previous?: Match) {
    setSetupMode(mode)
    setLevel(previous?.level ?? 'medium')
    setHuman(previous?.human ?? 0)
    setHandicap(previous?.handicap)
    setFlightOptions(previous?.flightOptions ?? defaultFlight)
    const grid = previous?.gridOptions
    setHandicapPiece(grid && 'handicapPiece' in grid ? grid.handicapPiece : 'horse')
    setGoOptions(grid && 'komi' in grid ? grid : defaultGo)
    setGomokuOptions(grid && 'exactFive' in grid ? grid : defaultGomoku)
    setSetup(game)
  }

  function continueMatch(match: Match) {
    if (data.settings.voice && data.settings.voiceDetail === 'full') intro.current = 'resume'
    navigate('play', match.game, match.id)
  }

  function openGame(game: GameId) {
    const active = profile.active[game]
    if (active) continueMatch(active)
    else openSetup(game)
  }

  function start() {
    if (!setup) return
    const gridOptions = setup === 'go' ? goOptions : setup === 'gomoku' ? gomokuOptions
      : setup === 'xiangqi' && handicap !== undefined ? { handicapPiece } : undefined
    const variant = configuredRules(setup, gridOptions).variant + (setup === 'flight' ? ` · ${playerCounts[flightOptions.players]}`
      : setup !== 'xiangqi' || handicap === undefined ? '' : ` · ${rules[setup].sides[handicap]}${xiangqiHandicaps[handicapPiece]}`)
    const match: Match = { id: makeId(), game: setup, variant, mode: setupMode, human, level, handicap,
      flightOptions: setup === 'flight' ? flightOptions : undefined, gridOptions, started: new Date().toISOString(), moves: [] }
    update(state => saveMatch(state, match))
    setSetup(undefined)
    unlockAudio()
    syncVolume(data.settings.volume, data.settings.musicVolume, data.settings.voiceVolume)
    if (data.settings.voice && data.settings.voiceDetail === 'full') intro.current = 'chessStart'
    navigate('play', match.game, match.id)
  }

  function writeMove(move: Move, next: Position) {
    if (!currentMatch) return
    update(state => {
      const active = activeProfile(state).active[currentMatch.game]
      if (active?.id !== currentMatch.id || active.moves !== currentMatch.moves) return state
      return saveMatch(state, { ...active, moves: [...active.moves, move] }, next.result)
    })
  }

  function undo(length: number) {
    if (!currentMatch) return
    update(state => {
      const active = activeProfile(state).active[currentMatch.game]
      if (active?.id !== currentMatch.id || active.moves !== currentMatch.moves) return state
      return saveMatch(state, { ...active, moves: active.moves.slice(0, length) })
    })
  }

  function setSettings(patch: Partial<Settings>) {
    unlockAudio()
    if (patch.sound) effect('move', true, data.settings.soundStyle)
    if (patch.voice === false) stopVoice()
    if (patch.voice === true) announce('check', true)
    update(state => ({ ...state, settings: { ...state.settings, ...patch } }))
  }

  function openCard(game: CardGame, newMatch = false) {
    const active = profile.cards?.[game]
    if (active && !newMatch) {
      if (data.settings.voice && data.settings.voiceDetail === 'full') intro.current = 'resume'
      navigate('table', game, active.id)
      return
    }
    setCardMode(currentCard?.mode ?? 'solo')
    setMustBeat(currentCard?.options.mustBeat ?? true)
    setDeckSize(currentCard?.options.deckSize ?? 16)
    setCardLevel(currentCard?.options.level ?? 'standard')
    setCardSetup(game)
  }

  function startCards() {
    if (!cardSetup) return
    const id = makeId()
    const match: CardMatch = {
      id, seed: id, mode: cardMode, options: { game: cardSetup, mustBeat: cardSetup === 'shedding' && mustBeat,
        deckSize: cardSetup === 'shedding' ? deckSize : undefined, level: cardLevel },
      rules: cardSetup === 'landlord' ? '三人经典 · 叫分版 v1' : cardSetup === 'bigtwo' ? '四人家庭 · 方块 3 版 v1'
        : `三人每手 ${deckSize} 张 · ` + (mustBeat ? '有大必管' : '可主动过牌') + ' v1',
      actions: [],
    }
    update(state => updateProfile(state, account => ({ ...account, cards: { ...account.cards, [cardSetup]: match } })))
    setCardSetup(undefined)
    effect('flip', data.settings.sound, data.settings.soundStyle)
    if (data.settings.voice) intro.current = 'deal'
    navigate('table', cardSetup, id)
  }

  function writeCard(action: CardAction, next: Table) {
    if (!currentCard) return
    const game = currentCard.options.game
    update(state => updateProfile(state, account => {
      const active = account.cards?.[game]
      if (active?.id !== currentCard.id || active.actions !== currentCard.actions) return account
      const match = { ...active, actions: [...active.actions, action] }
      const cards = { ...account.cards, [game]: match }
      if (!next.result) return { ...account, cards }
      delete cards[game]
      return { ...account, cards, cardHistory: [match, ...(account.cardHistory ?? []).filter(item => item.id !== match.id)] }
    }))
  }

  function download() {
    const content = exportHistory(data)
    setBackup(content)
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = 'qihun-games.json'
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  function editProfile(edit: (state: AppData) => AppData) {
    update(edit)
    setProfilesOpen(false)
    setName('')
    if (isDesk || isTable) navigate('home')
  }

  const gameList = <div className="game-grid">{games.map(game => <button className="game-card" key={game.id} onClick={() => openGame(game.id)}>
    <GameIcon game={game.id} /><span className="game-text"><strong>{game.name}</strong><small>{profile.active[game.id] ? '继续上局' : gameMeta[game.id]}</small></span>
    <ChevronRight className="card-arrow" size={18} />
  </button>)}</div>

  return <div className={`app ${isDesk || isTable ? 'in-desk' : ''}`}>
    <aside className="rail">
      <button className="brand" onClick={() => navigate('home')} aria-label="棋魂大厅"><span className="brand-icon"><Grid2X2 size={21} strokeWidth={1.7} /></span><span>棋魂<small>棋类与牌桌</small></span></button>
      <nav aria-label="主导航">{sections.map(({ id, label, icon: Icon }) => <button key={id} className={selectedNav === id ? 'nav-active' : ''} aria-current={selectedNav === id ? 'page' : undefined} onClick={() => navigate(id)}>
        <Icon size={20} strokeWidth={1.85} /><span>{label}</span>
      </button>)}</nav>
      <button className="rail-profile" onClick={() => setProfilesOpen(true)}><span className="avatar"><UserRound size={18} /></span><span><strong>{profile.name}</strong><small>本地棋手</small></span><ChevronRight size={16} /></button>
    </aside>
    <main className="main">
      {!isDesk && !isTable && <div className="topbar">
        <button className="brand mobile-brand" onClick={() => navigate('home')} aria-label="棋魂大厅"><span className="brand-icon"><Grid2X2 size={19} strokeWidth={1.7} /></span><span>棋魂</span></button>
        <div className="top-tools"><button className="icon-button" aria-label="棋局声音开关" title={soundsOn ? '关闭棋局声音' : '打开棋局声音'} onClick={() => setSettings({ sound: !soundsOn, voice: !soundsOn })}><Volume2 size={19} className={!soundsOn ? 'is-muted' : ''} /></button>
          <button className="top-profile" onClick={() => setProfilesOpen(true)}><span className="avatar"><UserRound size={17} /></span><strong>{profile.name}</strong></button></div>
      </div>}
      {error && <div className="storage-error" role="status">{error}</div>}
      {route.section === 'home' && <>
        <section className="hero">
          <div className="hero-content">
            <div className="hero-kicker"><Leaf size={16} /> 开一局中国象棋</div>
            <h1>楚河汉界<br />棋逢对手</h1>
            <p>与棋友同屏切磋，或和电脑练一局。</p>
            <button className="button primary" onClick={() => openGame('xiangqi')}><Play size={17} fill="currentColor" />{profile.active.xiangqi ? '继续象棋' : '立即对弈'}<ArrowRight size={17} /></button>
          </div>
        </section>
        <div className="quick-links">
          <button className="quick-card" onClick={() => recent ? continueMatch(recent) : openSetup('xiangqi', 'ai')}>
            <span className="quick-icon"><Bot size={24} strokeWidth={1.7} /></span><span><strong>{recent ? '继续对弈' : '人机练习'}</strong><small>{recent ? `${rules[recent.game].name} · ${recent.moves.length} 步` : '挑选难度，随时开局'}</small></span><ArrowDownRight size={19} />
          </button>
          <button className="quick-card" onClick={() => openSetup('xiangqi', 'local')}>
            <span className="quick-icon gold"><Users size={23} strokeWidth={1.7} /></span><span><strong>同屏对弈</strong><small>和身边的棋友下一盘</small></span><ArrowDownRight size={19} />
          </button>
          <button className="quick-card" onClick={() => navigate('history')}>
            <span className="quick-icon violet"><Clock3 size={23} strokeWidth={1.7} /></span><span><strong>我的棋谱</strong><small>{profile.history.length ? `已保存 ${profile.history.length} 局` : '随时回看每一步'}</small></span><ArrowDownRight size={19} />
          </button>
        </div>
        <section className="library-section">
          <div className="section-title"><h2>棋类大厅</h2><button className="text-button" onClick={() => navigate('library')}>查看全部 <ArrowRight size={17} /></button></div>
          {gameList}
        </section>
      </>}
      {route.section === 'library' && <section className="library-section inner-page">
        <div className="page-title"><h1>棋类大厅</h1><p>选一种棋，开始同屏或人机对弈。</p></div>
        <div className="collection-grid">
          <button className="collection-tile studio" onClick={() => openGame('xiangqi')}><span>中国象棋</span><ArrowRight size={20} /></button>
          <button className="collection-tile garden" onClick={() => openGame('go')}><span>围棋</span><ArrowRight size={20} /></button>
        </div>
        <div className="collection-grid board-collection">{boardCollection.map(([game, art]) =>
          <button key={game} className={`collection-tile ${art}`} onClick={() => openGame(game)}>
            <span>{rules[game].name}</span><ArrowRight size={18} />
          </button>)}</div>
        {gameList}
      </section>}
      {route.section === 'cards' && <section className="inner-page">
        <div className="page-title"><h1>牌桌</h1><p>三人或四人接力同屏，也可以和电脑同桌。</p></div>
        <div className="collection-grid card-collection">{cardGames.map(game =>
          <button className={`collection-tile tile-${game}`} key={game} onClick={() => openCard(game)}>
            <span>{cardNames[game]}<small>{profile.cards?.[game] ? '继续牌局' : cardTagline[game]}</small></span>
            <ArrowRight size={20} />
          </button>)}</div>
        {!!profile.cardHistory?.length && <section className="panel history-panel">
          <div className="panel-title"><h2>已完成的牌局</h2></div>
          {profile.cardHistory.map(item => <button key={item.id} className="history-row"
            onClick={() => navigate('card-review', item.options.game, item.id)}><Spade size={20} />
            <span><strong>{cardNames[item.options.game]}</strong><small>{item.rules} · {item.actions.length} 步</small></span>
            <span className="record-status">复盘</span><ChevronRight size={17} />
          </button>)}
        </section>}
      </section>}
      {route.section === 'history' && <section className="inner-page">
        <div className="page-title page-title-with-action"><div><h1>我的棋谱</h1><p>{profile.name}的本地对局</p></div>
          <button className="button secondary" disabled={!profile.history.length && !ongoing.length && !profile.cardHistory?.length &&
            !Object.keys(profile.cards ?? {}).length} onClick={download}><ArrowDownToLine size={17} />导出记录</button></div>
        <div className="stats-strip">
          <div><span>已结束</span><strong>{profile.history.length}</strong></div>
          <div><span>获胜</span><strong>{profile.history.filter(item => item.result.winner === (item.mode === 'ai' ? item.human : 0)).length}</strong></div>
          <div><span>和棋</span><strong>{profile.history.filter(item => item.result.winner === null).length}</strong></div>
        </div>
        {!!ongoing.length && <section className="panel history-panel">
          <div className="panel-title"><h2>进行中</h2></div>
          {ongoing.map(item => <button key={item.id} className="history-row" onClick={() => continueMatch(item)}>
            <GameIcon game={item.game} size="small" /><span><strong>{rules[item.game].name}</strong><small>{item.mode === 'ai' ? '人机' : '同屏'} · {item.moves.length} 步</small></span>
            <span className="record-status">继续下棋</span><ChevronRight size={17} />
          </button>)}
        </section>}
        <section className="panel history-panel">
          <div className="panel-title"><h2>历史对局</h2><select aria-label="筛选棋类" value={filter} onChange={event => setFilter(event.target.value as typeof filter)}>
            <option value="all">全部棋类</option>{games.map(game => <option value={game.id} key={game.id}>{game.name}</option>)}</select></div>
          {profile.history.filter(item => filter === 'all' || item.game === filter).map(item => <button key={item.id} className="history-row" onClick={() => navigate('review', item.game, item.id)}>
            <GameIcon game={item.game} size="small" /><span><strong>{rules[item.game].name}</strong><small>{shortDate(item.ended)} · {item.moves.length} 步</small></span>
            <span className="record-status">{item.result.winner === null ? '和棋' : `${rules[item.game].sides[item.result.winner]}获胜`}</span><ChevronRight size={17} />
          </button>)}
          {!profile.history.some(item => filter === 'all' || item.game === filter) && <div className="empty-state"><Trophy size={28} /><p>这里还没有已结束的对局。</p><button className="button secondary" onClick={() => navigate('library')}>去下棋</button></div>}
        </section>
      </section>}
      {route.section === 'settings' && <section className="inner-page settings-page">
        <div className="page-title"><h1>设置</h1><p>调整棋盘、声音和本地棋手。</p></div>
        <div className="panel settings-panel"><SettingsForm settings={data.settings} update={setSettings} /></div>
        <div className="panel settings-panel"><div className="settings-line"><span><strong>本地棋手</strong><small>{profile.name} · 档案仅保存在本设备</small></span><button className="button secondary" onClick={() => setProfilesOpen(true)}>管理档案</button></div></div>
      </section>}
      {isDesk && (currentMatch ? <MatchDesk key={route.section + ':' + currentMatch.id} name={profile.name} match={currentMatch}
        settings={data.settings} reviewing={route.section === 'review'} paused={inMatchSettings || setup !== undefined} onMove={writeMove} onUndo={undo}
        onBack={() => navigate(route.section === 'review' ? 'history' : 'home')} onNew={() => openSetup(currentMatch.game, currentMatch.mode, currentMatch)}
        onReview={() => navigate('review', currentMatch.game, currentMatch.id)} onSettings={() => setInMatchSettings(true)} /> :
        <div className="empty-state"><CircleHelp size={28} /><p>当前棋手的档案里找不到这局棋。</p><button className="button secondary" onClick={() => navigate('library')}>返回棋类大厅</button></div>)}
      {isTable && (currentCard ? <CardDesk key={route.section + ':' + currentCard.id} match={currentCard}
        settings={data.settings} profileName={profile.name} reviewing={route.section === 'card-review'} paused={inMatchSettings || cardSetup !== undefined}
        save={writeCard} onBack={() => navigate('cards')} onSettings={() => setInMatchSettings(true)}
        onReview={() => navigate('card-review', currentCard.options.game, currentCard.id)}
        onNew={() => openCard(currentCard.options.game, true)} /> :
        <div className="empty-state"><Spade size={28} /><p>当前档案找不到这局牌。</p><button className="button secondary" onClick={() => navigate('cards')}>返回牌类</button></div>)}
    </main>
    {cardSetup && <Dialog title={cardNames[cardSetup]} onClose={() => setCardSetup(undefined)}>
      <div className={`card-setup-art tile-${cardSetup}`} />
      <div className="field-title">牌桌模式</div>
      <div className="choice-grid">{([['solo', '一人对电脑'], ['local', cardSetup === 'bigtwo' ? '四人同屏接力' : '三人同屏接力']] as const).map(([mode, label]) =>
        <button key={mode} className={`choice ${cardMode === mode ? 'choice-active' : ''}`} aria-pressed={cardMode === mode}
          onClick={() => setCardMode(mode)}>{label}</button>)}</div>
      {cardSetup === 'shedding' && <>
        <label className="settings-line"><strong>每手牌数</strong><select aria-label="每手牌数" value={deckSize}
          onChange={event => setDeckSize(event.target.value === '15' ? 15 : 16)}><option value="16">16 张</option><option value="15">15 张</option></select></label>
        <label className="settings-line"><span><strong>有大必管</strong><small>有能压过的牌时必须出</small></span>
          <input type="checkbox" className="toggle" checked={mustBeat} onChange={event => setMustBeat(event.target.checked)} /></label>
      </>}
      {cardMode === 'solo' && <label className="settings-line"><strong>牌桌难度</strong><select aria-label="牌桌难度" value={cardLevel}
        onChange={event => setCardLevel(event.target.value as CardLevel)}><option value="beginner">入门</option>
        <option value="standard">标准</option><option value="challenge">挑战</option></select></label>}
      {profile.cards?.[cardSetup] && <p className="muted">新开局会替换这个玩法的未结束牌局。</p>}
      <button className="button primary full" onClick={startCards}><Spade size={17} />{profile.cards?.[cardSetup] ? '替换旧局并发牌' : '开始发牌'}</button>
    </Dialog>}
    {setup && <Dialog title={`开始${rules[setup].name}`} onClose={() => setSetup(undefined)}>
      <div className="setup-game"><GameIcon game={setup} /><div><strong>{rules[setup].name}</strong><small>{rules[setup].variant}</small></div></div>
      <div className="field-title">对弈模式</div>
      <div className="choice-grid">
        <button className={`choice ${setupMode === 'ai' ? 'choice-active' : ''}`} aria-pressed={setupMode === 'ai'} onClick={() => setSetupMode('ai')}><Bot size={19} />人机对弈</button>
        <button className={`choice ${setupMode === 'local' ? 'choice-active' : ''}`} aria-pressed={setupMode === 'local'} onClick={() => setSetupMode('local')}><Users size={19} />同屏对弈</button>
      </div>
      {setup === 'flight' && <FlightSetup options={flightOptions} update={next => {
        setFlightOptions(next)
        if (human >= next.players) setHuman(0)
      }} />}
      {setup === 'go' && <GoSetup options={goOptions} update={setGoOptions} />}
      {setup === 'gomoku' && <>
        <label className="settings-line"><strong>棋盘路数</strong><select aria-label="棋盘路数" value={gomokuOptions.size}
          onChange={event => setGomokuOptions({ ...gomokuOptions, size: Number(event.target.value) as GomokuOptions['size'] })}>
          <option value="11">11 路快局</option><option value="15">15 路</option><option value="19">19 路</option></select></label>
        <label className="settings-line"><strong>连珠规则</strong><select aria-label="连珠规则" value={gomokuOptions.exactFive ? 'exact' : 'free'}
          onChange={event => setGomokuOptions({ ...gomokuOptions, exactFive: event.target.value === 'exact' })}>
          <option value="free">至少五连</option><option value="exact">恰好五连</option></select></label>
      </>}
      {setupMode === 'ai' && <>
        {setup !== 'flight' && setup !== 'dark' && <><div className="field-title">电脑难度</div><div className="choice-grid three">
          {([['novice', '入门'], ['medium', '进阶'], ['advanced', '挑战']] as const).map(([id, label]) => <button key={id} className={`choice ${id === level ? 'choice-active' : ''}`} aria-pressed={id === level} onClick={() => setLevel(id)}>{label}</button>)}
        </div></>}
        <div className="field-title">选择执方</div><div className="choice-grid">
          {rules[setup].sides.slice(0, setup === 'flight' ? flightOptions.players : 2).map((side, index) => <button key={side} className={`choice ${index === human ? 'choice-active' : ''}`} aria-pressed={index === human} onClick={() => setHuman(index as Side)}>{side}{index === (setup === 'go' && goOptions.handicap ? 1 : 0) ? ' · 先手' : ''}</button>)}
        </div>
      </>}
      {setup === 'xiangqi' && <><div className="field-title">开局让子</div><div className="choice-grid three">
        {([[undefined, '不让子'], [0, '红方让子'], [1, '黑方让子']] as const).map(([side, label]) =>
          <button key={label} className={`choice ${side === handicap ? 'choice-active' : ''}`} aria-pressed={side === handicap} onClick={() => setHandicap(side)}>{label}</button>)}
      </div>{handicap !== undefined && <label className="settings-line"><strong>让子棋形</strong><select aria-label="让子棋形" value={handicapPiece}
        onChange={event => setHandicapPiece(event.target.value as XiangqiOptions['handicapPiece'])}>
        {Object.entries(xiangqiHandicaps).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>}</>}
      {!!profile.active[setup] && <p className="muted">新开局会覆盖该棋种的未完成对局。</p>}
      <button className="button primary full" onClick={start}>{setup === 'flight' ? <Dices size={18} /> : <Swords size={18} />}{profile.active[setup] ? '覆盖旧局并开局' : '开始对弈'}</button>
    </Dialog>}
    {profilesOpen && <Dialog title="本地棋手档案" onClose={() => { setProfilesOpen(false); setName('') }}>
      <p className="muted">每个档案独立保存棋谱和未完成的对局。</p>
      <div className="profiles-list">{data.profiles.map(item => <button className="history-row" key={item.id} onClick={() => editProfile(state => ({ ...state, current: item.id }))}>
        <span className="avatar"><UserRound size={16} /></span><strong>{item.name}</strong>{item.id === profile.id && <span className="record-status">正在使用</span>}
      </button>)}</div>
      <form className="inline-form" onSubmit={event => {
        event.preventDefault()
        const trimmed = name.trim()
        if (trimmed) editProfile(state => addProfile(state, trimmed))
      }}><input value={name} aria-label="新棋手昵称" placeholder="输入新棋手昵称" maxLength={18} onChange={event => setName(event.target.value)} />
        <button className="button primary" disabled={!name.trim()}><Plus size={17} />创建</button></form>
    </Dialog>}
    {inMatchSettings && <Dialog title="对局设置" onClose={() => setInMatchSettings(false)}><SettingsForm settings={data.settings} update={setSettings} /></Dialog>}
    {backup && <Dialog title="导出本地对局" onClose={() => setBackup('')}><p>已请求保存 JSON 文件。也可以直接复制以下内容。</p>
      <textarea className="backup" value={backup} readOnly aria-label="对局 JSON" onFocus={event => event.target.select()} /></Dialog>}
  </div>
}

function SettingsForm({ settings, update }: { settings: Settings; update: (patch: Partial<Settings>) => void }) {
  const fields = [
    ['sound', '落子音效', '包含将军、提子、打吃、撞机等提示'],
    ['voice', '普通话报音', '落子、走棋、出牌和关键事件均可播报'],
    ['music', '背景音乐', '大厅、交锋与牌桌各有配乐'],
    ['animation', '棋子动画', '移动和落子过渡'],
    ['hints', '着法提示', '显示合法落点和建议按钮'],
    ['undo', '允许悔棋', '在未结束的本地对局中回退'],
    ['coordinates', '棋盘坐标', '显示空位坐标，便于对照棋谱'],
    ['moveTrail', '走棋轨迹', '标出上一手的起点和落点'],
  ] as const
  return <>
    {fields.map(([key, label, help]) => <label className="settings-line" key={key}>
      <span><strong>{label}</strong><small>{help}</small></span>
      <input type="checkbox" className="toggle" aria-label={label} checked={settings[key]} onChange={event => update({ [key]: event.target.checked })} />
    </label>)}
    <label className="settings-line volume-line"><span><strong>音效音量</strong><small>{settings.volume}%</small></span>
      <input type="range" min="0" max="100" value={settings.volume} aria-label="音效音量" onChange={event => update({ volume: Number(event.target.value) })} />
    </label>
    <label className="settings-line volume-line"><span><strong>音乐音量</strong><small>{settings.musicVolume}%</small></span>
      <input type="range" min="0" max="100" value={settings.musicVolume} aria-label="音乐音量" onChange={event => update({ musicVolume: Number(event.target.value) })} />
    </label>
    <div className="settings-line"><span><strong>配乐</strong><small>语音响起时自动压低音乐</small></span>
      <select aria-label="配乐" value={settings.musicChoice} onChange={event => update({ musicChoice: event.target.value as MusicChoice })}>
        {Object.entries(musicNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </div>
    <label className="settings-line volume-line"><span><strong>语音音量</strong><small>{settings.voiceVolume}%</small></span>
      <input type="range" min="0" max="100" value={settings.voiceVolume} aria-label="语音音量" onChange={event => update({ voiceVolume: Number(event.target.value) })} />
    </label>
    <label className="settings-line"><strong>报音频率</strong><select aria-label="报音频率" value={settings.voiceDetail}
      onChange={event => update({ voiceDetail: event.target.value === 'key' ? 'key' : 'full' })}>
      <option value="full">完整报音</option><option value="key">仅关键事件</option></select></label>
    <div className="settings-line sound-samples"><strong>试听人声</strong>
      <div>{([['check', '将军'], ['capture', '吃子'], ['takeThree', '提三子'], ['roll6', '六点'], ['bomb', '炸弹'], ['win', '获胜']] as const).map(([cue, label]) =>
        <button key={cue} className="action-button" disabled={!settings.voice} onClick={() => announce(cue, true)}>{label}</button>)}</div>
    </div>
    <label className="settings-line"><strong>音效风格</strong><select aria-label="音效风格" value={settings.soundStyle}
      onChange={event => update({ soundStyle: event.target.value === 'soft' ? 'soft' : 'crisp' })}><option value="crisp">脆响</option><option value="soft">柔和</option></select></label>
    <div className="settings-line sound-samples"><strong>试玩音效</strong>
      <div>{([['check', '将军'], ['cannon', '炮打'], ['atari', '打吃'], ['collision', '撞机'], ['rocketBlast', '王炸'], ['flushBurst', '同花顺'], ['end', '获胜']] as [SoundCue, string][]).map(([cue, label]) =>
        <button key={cue} className="action-button" aria-label={label + '音效'} disabled={!settings.sound}
          onClick={() => { unlockAudio(); effect(cue, true, settings.soundStyle) }}>{label}</button>)}</div>
    </div>
    <label className="settings-line"><strong>斗兽棋棋子</strong><select aria-label="斗兽棋棋子" value={settings.jungleStyle}
      onChange={event => update({ jungleStyle: event.target.value === 'text' ? 'text' : 'illustrated' })}><option value="illustrated">动物插画</option><option value="text">文字棋子</option></select></label>
    <label className="settings-line"><strong>扑克牌面</strong><select aria-label="扑克牌面" value={settings.cardSkin}
      onChange={event => update({ cardSkin: event.target.value === 'midnight' ? 'midnight' : 'ivory' })}>
      <option value="ivory">象牙白</option><option value="midnight">墨蓝</option></select></label>
    <label className="settings-line"><span><strong>棋盘配色</strong><small>象棋、五子棋和围棋</small></span><select aria-label="棋盘配色" value={settings.boardTheme}
      onChange={event => update({ boardTheme: event.target.value === 'jade' ? 'jade' : 'wood' })}><option value="wood">原木</option><option value="jade">青玉</option></select>
    </label>
  </>
}

function GoSetup({ options, update }: { options: GoOptions; update: (value: GoOptions) => void }) {
  return <>
    <label className="settings-line"><strong>棋盘路数</strong><select aria-label="棋盘路数" value={options.size} onChange={event => {
      const size = Number(event.target.value) as GoOptions['size']
      update({ ...options, size, review: size > 9 || options.review })
    }}><option value="9">9 路快局</option><option value="13">13 路</option><option value="19">19 路</option></select></label>
    <details className="flight-config" open={options.size > 9 || undefined}>
      <summary>围棋规则设置</summary>
      <label>白方贴目<select aria-label="白方贴目" value={options.komi}
        onChange={event => update({ ...options, komi: Number(event.target.value) as GoOptions['komi'] })}>
        <option value="0.5">半目</option><option value="5.5">5.5 目</option><option value="7.5">7.5 目</option></select></label>
      <label>固定让子<select aria-label="固定让子" value={options.handicap} onChange={event => {
        const handicap = Number(event.target.value) as GoOptions['handicap']
        update({ ...options, handicap, komi: handicap ? 0.5 : defaultGo.komi })
      }}><option value="0">分先</option><option value="2">让 2 子</option><option value="3">让 3 子</option><option value="4">让 4 子</option></select></label>
      <label>终局双方确认<input type="checkbox" className="toggle" checked={options.review}
        onChange={event => update({ ...options, review: event.target.checked })} /></label>
    </details>
  </>
}

function FlightSetup({ options, update }: { options: FlightOptions; update: (value: FlightOptions) => void }) {
  return <>
    <div className="field-title">机队人数</div>
    <div className="choice-grid three">{([2, 3, 4] as const).map(players =>
      <button className={`choice ${players === options.players ? 'choice-active' : ''}`} aria-pressed={players === options.players}
        key={players} onClick={() => update({ ...options, players })}>{playerCounts[players]}</button>)}</div>
    <details className="flight-config">
      <summary>飞行规则设置</summary>
      <label>每队飞机<select aria-label="每队飞机" value={options.fleet} onChange={event => update({ ...options, fleet: event.target.value === '2' ? 2 : 4 })}>
        <option value="4">四架</option><option value="2">两架快局</option></select></label>
      <label>起飞点数<select aria-label="起飞点数" value={options.takeoff} onChange={event => update({ ...options, takeoff: event.target.value === 'one-or-six' ? 'one-or-six' : 'six' })}>
        <option value="six">仅 6 点</option><option value="one-or-six">1 或 6 点</option></select></label>
      <label>超过终点<select aria-label="超过终点" value={options.overshoot} onChange={event => update({ ...options, overshoot: event.target.value === 'exact' ? 'exact' : 'bounce' })}>
        <option value="bounce">按多出点数反弹</option><option value="exact">该飞机不能走</option></select></label>
      <label>同色格跳四格<input aria-label="同色格跳四格" className="toggle" type="checkbox" checked={options.colorJump}
        onChange={event => update({ ...options, colorJump: event.target.checked })} /></label>
    </details>
  </>
}
