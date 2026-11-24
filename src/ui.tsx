import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { GameId } from './rules/types'

export function GameIcon({ game, size = 'normal' }: { game: GameId; size?: 'normal' | 'small' }) {
  const symbols: Partial<Record<GameId, string>> = { xiangqi: '帥', chess: '♞', jungle: '虎', flight: '✈', dark: '翻', checkers: '♛' }
  return <span className={`game-icon game-icon-${game} ${size}`} aria-hidden="true">
    {symbols[game] ? <i>{symbols[game]}</i> : <><b /><b />{game === 'gomoku' && <b />}</>}
  </span>
}

export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return <dialog ref={ref} className="dialog" aria-label={title} onCancel={event => {
    event.preventDefault()
    onClose()
  }} onClick={event => {
    if (event.target === ref.current) {
      const bounds = ref.current.getBoundingClientRect()
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose()
    }
  }}>
    <div className="dialog-head"><h2>{title}</h2><button className="icon-button" aria-label="关闭" onClick={onClose}><X size={20} /></button></div>
    {children}
  </dialog>
}
