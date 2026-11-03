import { useEffect, useState } from 'react'
import { getCleanups, getComposition, getHistory } from '../api.js'
import { folderGrowth, forecast, gb, mbOrGb, shortDate } from '../chartUtils.js'
import DiskHistory from './DiskHistory.jsx'
import DiskDonut from './DiskDonut.jsx'
import GrowthRanking from './GrowthRanking.jsx'
import CleanupCalendar from './CleanupCalendar.jsx'
import MonthReport from './MonthReport.jsx'
import './DiskHistory.css'

// Tela Gráficos: números de destaque (espaço livre, "Já liberei", previsão), linha do espaço livre,
// rosca do que o disco é feito, pastas que mais cresceram, calendário de limpezas e o relatório do mês.

export default function ChartsScreen({ withChat = false }) {
  const [history, setHistory] = useState(null)
  const [cleanups, setCleanups] = useState([])
  const [composition, setComposition] = useState(null)
  const [error, setError] = useState('')
  const [showReport, setShowReport] = useState(false)

  useEffect(() => {
    getHistory()
      .then(setHistory)
      .catch((err) => setError(err.message))
    getCleanups()
      .then(setCleanups)
      .catch(() => {}) // sem limpezas: os blocos mostram "nenhuma limpeza"
    getComposition()
      .then(setComposition)
      .catch(() => {})
  }, [])

  const days = history || []
  const last = days.at(-1)
  const first = days[0]
  const change = days.length >= 2 ? last.livre_gb - first.livre_gb : null
  const freedMb = cleanups.reduce((sum, cleanup) => sum + cleanup.liberado_mb, 0)
  const prediction = forecast(days)

  return (
    <section className={`charts glass ${withChat ? 'with-chat' : ''}`}>
      <header className="charts-header">
        <div>
          <h2>Gráficos</h2>
          <p>Como o seu disco está mudando</p>
        </div>
        <button className="map-btn ask" onClick={() => setShowReport(true)}>
          📄 Relatório do mês
        </button>
      </header>

      {error && <p className="section-empty">{error}</p>}
      {history && days.length === 0 && <p className="section-empty">Ainda não há histórico. Rode um scan na tela inicial para começar.</p>}

      {last && (
        <div className="charts-stats">
          <div className="stat stat-hero">
            <span className="stat-label">Espaço livre</span>
            <span className="hero-value">{gb(last.livre_gb)}</span>
            <span className="stat-detail">
              de {gb(last.total_gb)}
              {change !== null && (
                <span className={`hero-change ${change >= 0 ? 'up' : 'down'}`}>
                  {' '}
                  {change >= 0 ? '▲' : '▼'} {gb(Math.abs(change))} desde {shortDate(first.data)}
                </span>
              )}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Já liberei</span>
            <span className="stat-value">{mbOrGb(freedMb)}</span>
            <span className="stat-detail">
              em {cleanups.length} {cleanups.length === 1 ? 'limpeza' : 'limpezas'}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">Previsão</span>
            <span className="stat-value">
              {!prediction ? '—' : prediction.growing ? 'Estável' : `~${prediction.daysLeft} dias`}
            </span>
            <span className="stat-detail">
              {!prediction
                ? 'preciso de 2 dias de histórico'
                : prediction.growing
                  ? 'o espaço livre não está diminuindo'
                  : `para o disco encher no ritmo atual (${gb(-prediction.perDay)}/dia), lá por ${prediction.date.toLocaleDateString('pt-BR')}`}
            </span>
          </div>
        </div>
      )}

      {last && <DiskHistory days={days} />}
      {composition ? (
        <DiskDonut data={composition} />
      ) : (
        <section className="chart-section">
          <p className="section-empty">Medindo do que o disco é feito…</p>
        </section>
      )}
      {history && <GrowthRanking folders={folderGrowth(days)} />}
      <CleanupCalendar cleanups={cleanups} />

      {showReport && <MonthReport onClose={() => setShowReport(false)} />}
    </section>
  )
}
