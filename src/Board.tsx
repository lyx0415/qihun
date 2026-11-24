import { Crosshair, Crown, PawPrint, Plane } from 'lucide-react'
import { useLayoutEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { pieceName } from './rules/ai'
import { darkColor } from './rules/dark'
import { flightTerrain } from './rules/flight'
import { jungleTerrain } from './rules/jungle'
import { moveCoord } from './rules/types'
import type { Move, Piece, Position, Rules } from './rules/types'

const chessGlyph: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }

const animals = ['鼠', '猫', '狼', '狗', '豹', '虎', '狮', '象']

function Token({ game, piece, jungleStyle }: { game: Rules['id']; piece: Piece; jungleStyle: 'illustrated' | 'text' }) {
  if (game === 'checkers') return piece.kind === 'king' ? <Crown size="64%" aria-hidden="true" /> : null
  if (game === 'flight') return <><Plane size="68%" strokeWidth={2.6} aria-hidden="true" />{Number(piece.kind) > 1 && <sup>{piece.kind}</sup>}</>
  if (game === 'chess') return chessGlyph[piece.kind]
  if (game === 'jungle' && jungleStyle === 'illustrated') {
    const index = animals.indexOf(piece.kind)
    return <><span aria-hidden="true" className="animal-portrait" style={{ backgroundPosition: `${(index % 4) * 100 / 3}% ${index < 4 ? 0 : 100}%` }} />
      <span aria-hidden="true" className="animal-name">{piece.kind}</span></>
  }
  if (game === 'dark' && piece.kind === 'hidden') return '棋'
  if (game === 'xiangqi' || game === 'jungle' || game === 'dark') return pieceName(game, piece.kind, piece.side)
  return null
}

function Lines({ game, theme }: { game: Rules; theme: 'wood' | 'jade' }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useLayoutEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const draw = () => {
      const ctx = canvas.getContext('2d')
      const { width, height } = canvas.getBoundingClientRect()
      if (!ctx || !width || !height) return
      const density = Math.min(window.devicePixelRatio || 1, 3)
      canvas.width = Math.round(width * density)
      canvas.height = Math.round(height * density)
      ctx.scale(canvas.width / width, canvas.height / height)
      const dx = width / game.width
      const dy = height / game.height
      const x = (column: number) => dx * (column + 0.5)
      const y = (row: number) => dy * (row + 0.5)
      const line = (a: number, b: number, c: number, d: number) => {
        ctx.moveTo(x(a), y(b))
        ctx.lineTo(x(c), y(d))
      }
      const ink = theme === 'jade' ? '#53775b' : '#896b46'
      ctx.strokeStyle = ink
      ctx.lineWidth = Math.max(0.65, width / 530)
      ctx.beginPath()
      for (let row = 0; row < game.height; row++) line(0, row, game.width - 1, row)
      for (let column = 0; column < game.width; column++) {
        if (game.id === 'xiangqi' && column !== 0 && column !== 8) {
          line(column, 0, column, 4)
          line(column, 5, column, 9)
        } else line(column, 0, column, game.height - 1)
      }
      if (game.id === 'xiangqi') {
        for (const offset of [0, 7]) {
          line(3, offset, 5, offset + 2)
          line(5, offset, 3, offset + 2)
        }
      }
      ctx.stroke()
      ctx.fillStyle = ink
      if (game.id === 'xiangqi') {
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.font = `600 ${dx * 0.48}px "KaiTi", "Noto Serif SC", serif`
        ctx.fillText('楚 河', x(2), y(4.5))
        ctx.fillText('汉 界', x(6), y(4.5))
      } else {
        const low = game.width <= 11 ? 2 : 3
        const stars = [low, (game.width - 1) / 2, game.width - 1 - low]
        for (const a of stars) for (const b of stars) {
          if (!(game.id === 'go' && game.width === 19) && ((a === stars[1]) !== (b === stars[1]))) continue
          ctx.beginPath()
          ctx.arc(x(a), y(b), Math.max(1.5, dx * 0.065), 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }
    draw()
    const watcher = new ResizeObserver(draw)
    watcher.observe(canvas)
    return () => watcher.disconnect()
  }, [game, theme])
  return <canvas aria-hidden="true" ref={ref} className="board-lines" />
}

type BoardProps = {
  game: Rules
  position: Position
  selected?: number
  selectable: Set<number>
  targets: Set<number>
  latest?: Move
  step: number
  flipped: boolean
  coordinates: boolean
  animation: boolean
  theme: 'wood' | 'jade'
  jungleStyle: 'illustrated' | 'text'
  marked: Set<number>
  changed: Set<number>
  winning: number[]
  trail: boolean
  readOnly?: boolean
  onCell?: (index: number) => void
}

export function Board({ game, position, selected, selectable, targets, latest, step, flipped, coordinates, animation,
  theme, jungleStyle, marked, changed, winning, trail, readOnly, onCell }: BoardProps) {
  const cols = game.width
  const rows = game.height
  const last = latest?.type === 'play' ? latest : undefined
  const css = { '--cols': cols, '--rows': rows } as CSSProperties
  const direction = flipped ? -1 : 1
  const track = trail && last?.from !== undefined && last.from !== last.to ? (() => {
    const origin = flipped ? cols * rows - 1 - last.from : last.from
    const destination = flipped ? cols * rows - 1 - last.to : last.to
    const dx = destination % cols - origin % cols
    const dy = Math.floor(destination / cols) - Math.floor(origin / cols)
    return {
      left: `${(origin % cols + 0.5) * 100 / cols}%`,
      top: `${(Math.floor(origin / cols) + 0.5) * 100 / rows}%`,
      width: `${Math.hypot(dx, dy) * 100 / cols}%`,
      transform: `rotate(${Math.atan2(dy, dx)}rad)`,
    }
  })() : undefined
  return <div data-game={game.id} className={`board-shell ${game.surface === 'intersections' ? (theme === 'jade' ? 'wood jade' : 'wood') : game.id}`}>
    <div className={`board board-${game.id}`} style={css} aria-label={`${game.name}棋盘`}>
      {game.surface === 'intersections' && <Lines game={game} theme={theme} />}
      {position.board.map((_, display) => {
        const index = flipped ? cols * rows - 1 - display : display
        const piece = position.board[index]
        const displayPiece = game.id === 'dark' && piece ? { ...piece, side: darkColor(position, piece.side) } : piece
        const recent = last?.to === index
        const hint = targets.has(index)
        const active = selected === index
        const tile = game.id === 'jungle' ? jungleTerrain(index) : game.id === 'flight' ? flightTerrain(index, position.flight?.options)
          : game.id === 'chess' || game.id === 'checkers' ? ((index % cols + Math.floor(index / cols)) % 2 ? 'dark-tile' : 'light-tile') : ''
        const terrain = tile === 'den' ? '穴' : tile === 'trap' ? '陷' : ''
        const unplayable = tile.startsWith('flight-out') || tile === 'flight-center'
        const warning = marked.has(index)
        const turned = changed.has(index)
        const delta = recent && last?.from !== undefined ? {
          '--dx': `${direction * (last.from % cols - index % cols) * (game.id === 'flight' ? 125 : 112)}%`,
          '--dy': `${direction * (Math.floor(last.from / cols) - Math.floor(index / cols)) * (game.id === 'flight' ? 125 : 112)}%`,
        } as CSSProperties : undefined
        const dead = position.goScoring?.dead.includes(index)
        const className = `cell ${tile} ${recent ? 'recent' : ''} ${active ? 'selected' : ''} ${hint ? 'target' : ''} ${selectable.has(index) ? 'selectable' : ''} ${warning ? 'threatened' : ''} ${dead ? 'dead-point' : ''} ${winning.includes(index) ? 'winning-point' : ''}`
        const contents = <>
          {terrain && <span className="terrain-label" aria-hidden="true">{terrain === '穴' ? <PawPrint /> : <Crosshair />}{terrain}</span>}
          {tile === 'flight-center' && <Plane size="76%" aria-hidden="true" />}
          {tile.includes('flight-start') && !piece && <span className="runway-mark" aria-hidden="true">◆</span>}
          {coordinates && !piece && !unplayable && <span className="coord">{moveCoord(game, index)}</span>}
          {displayPiece && <span className={`token side-${displayPiece.side} ${displayPiece.kind === 'king' ? 'king-disc' : ''} ${displayPiece.kind === 'hidden' ? 'hidden-piece' : ''} ${game.id === 'jungle' && jungleStyle === 'illustrated' ? 'illustrated' : ''} ${animation ? turned ? 'flip-in' : recent ? (delta ? 'slide-in' : 'place-in') : '' : ''}`}
            style={delta} key={recent || turned ? `latest-${step}` : `piece-${index}`}><Token game={game.id} piece={displayPiece} jungleStyle={jungleStyle} /></span>}
          {hint && <span className="target-dot" />}
          {recent && piece && <i className="last-mark" />}
          {dead && <strong className="dead-mark" aria-hidden="true">×</strong>}
        </>
        if (readOnly || unplayable) return <div key={display} className={className}>{contents}</div>
        return <button key={display} className={className} type="button" onClick={() => onCell?.(index)}
          data-cell={index} aria-pressed={active || undefined}
          aria-label={`${moveCoord(game, index)}${terrain ? ` ${terrain === '穴' ? '兽穴' : '陷阱'}` : ''}${piece && displayPiece ? (piece.kind === 'hidden' ? ' 盖子' : ` ${game.sides[piece.side]}${pieceName(game.id, piece.kind, displayPiece.side)}`) : ''}${hint ? ' 可落子' : ''}${dead ? ' 已标记死子' : ''}`}>{contents}</button>
      })}
      {track && <span aria-hidden="true" className="move-track" style={track} />}
    </div>
  </div>
}
