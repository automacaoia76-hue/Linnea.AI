import { useEffect, useState } from 'react'
import './BeforeAfter.css'

// "Antes e depois" da limpeza: aparece no canto quando o scan depois de apagar mostra mais espaço livre.
// A barra "Depois" começa do tamanho da "Antes" e encolhe até o uso novo.
// before / after = { usado_gb, total_gb, livre_gb } (do scan anterior e do novo)

const percent = (disk) => (disk.usado_gb / disk.total_gb) * 100
const pct = (value) => `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
const gb = (value) => `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GB`
const level = (value) => (value >= 90 ? 'danger' : value >= 70 ? 'warning' : 'ok')

export default function BeforeAfter({ before, after, onClose }) {
  const [afterWidth, setAfterWidth] = useState(percent(before)) // começa igual à "Antes"

  useEffect(() => {
    const frame = requestAnimationFrame(() => setAfterWidth(percent(after))) // e encolhe até o valor novo
    const timer = setTimeout(onClose, 10000)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(timer)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const freed = after.livre_gb - before.livre_gb
  return (
    <div className="before-after glass" role="status" aria-live="polite">
      <header>
        <strong>Antes e depois da limpeza</strong>
        <button onClick={onClose} aria-label="Fechar">
          ✕
        </button>
      </header>

      <div className="ba-row">
        <span className="ba-label">Antes</span>
        <span className={`ba-bar ${level(percent(before))}`}>
          <span style={{ width: `${percent(before)}%` }} />
        </span>
        <span className="ba-value">{pct(percent(before))}</span>
      </div>
      <div className="ba-row">
        <span className="ba-label">Depois</span>
        <span className={`ba-bar ${level(percent(after))}`}>
          <span className="shrinking" style={{ width: `${afterWidth}%` }} />
        </span>
        <span className="ba-value">{pct(percent(after))}</span>
      </div>

      <p className="ba-summary">
        🎉 <strong>+{gb(freed)}</strong> livres no disco · {gb(before.livre_gb)} → {gb(after.livre_gb)}
      </p>
    </div>
  )
}
