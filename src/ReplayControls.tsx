import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react'
import { useEffect, useState } from 'react'

export function ReplayControls({ cursor, last, onStep }: { cursor: number; last: number; onStep: (step: number) => void }) {
  const [playing, setPlaying] = useState(false)
  const [pace, setPace] = useState(1)
  useEffect(() => {
    if (!playing) return
    if (cursor >= last) { setPlaying(false); return }
    const timer = window.setTimeout(() => onStep(cursor + 1), 850 / pace)
    return () => window.clearTimeout(timer)
  }, [playing, cursor, last, onStep, pace])
  const seek = (index: number) => { setPlaying(false); onStep(index) }
  return <div className="review-panel">
    <input type="range" min="0" max={last} value={cursor} aria-label="复盘进度"
      onChange={event => seek(Number(event.target.value))} />
    <div className="replay-controls">
      <button className="icon-button" aria-label="第一步" onClick={() => seek(0)} disabled={!cursor}><ChevronFirst size={18} /></button>
      <button className="icon-button" aria-label="上一步" onClick={() => seek(cursor - 1)} disabled={!cursor}><ChevronLeft size={18} /></button>
      <button className="icon-button" aria-label={playing ? '暂停复盘' : '自动复盘'} disabled={!last} onClick={() => {
        if (playing) { setPlaying(false); return }
        if (cursor >= last) onStep(0)
        setPlaying(true)
      }}>{playing ? <Pause size={18} /> : <Play size={18} />}</button>
      <span>{cursor} / {last}</span>
      <button className="icon-button" aria-label="下一步" onClick={() => seek(cursor + 1)} disabled={cursor === last}><ChevronRight size={18} /></button>
      <button className="icon-button" aria-label="最后一步" onClick={() => seek(last)} disabled={cursor === last}><ChevronLast size={18} /></button>
      <select aria-label="复盘速度" value={pace} onChange={event => setPace(Number(event.target.value))}>
        <option value=".5">0.5×</option><option value="1">1×</option><option value="2">2×</option>
      </select>
    </div>
  </div>
}
