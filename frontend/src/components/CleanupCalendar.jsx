import { useState } from 'react'
import { dayKey, mbOrGb } from '../chartUtils.js'

// Calendário de limpezas (estilo GitHub): um quadradinho por dia das últimas 18 semanas;
// quanto mais escuro, mais espaço foi liberado no dia. Embaixo, as últimas limpezas.

const WEEKS = 18
const WEEKDAYS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

// Nível de cor (0 a 4) conforme o espaço liberado no dia
const level = (mb) => (mb <= 0 ? 0 : mb < 100 ? 1 : mb < 500 ? 2 : mb < 2048 ? 3 : 4)

// cleanups = [{ quando, acao, itens, liberado_mb }]
export default function CleanupCalendar({ cleanups }) {
  const [today] = useState(() => new Date()) // pega a data uma vez só, quando a tela abre
  const byDay = {}
  for (const cleanup of cleanups) {
    const key = cleanup.quando.slice(0, 10)
    byDay[key] = (byDay[key] || 0) + cleanup.liberado_mb
  }
  // Colunas = semanas (domingo a sábado), terminando na semana de hoje
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - today.getDay() - (WEEKS - 1) * 7)
  const weeks = Array.from({ length: WEEKS }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + w * 7 + d)
      return date > today ? null : { key: dayKey(date), date, mb: byDay[dayKey(date)] || 0 }
    }),
  )
  const recent = [...cleanups].reverse().slice(0, 5)

  return (
    <section className="chart-section">
      <header className="section-header">
        <div>
          <h3>Calendário de limpezas</h3>
          <p>Últimas {WEEKS} semanas · quanto mais escuro, mais espaço liberado</p>
        </div>
      </header>

      <div className="calendar" role="img" aria-label={`Calendário de limpezas: ${Object.keys(byDay).length} dia(s) com limpeza`}>
        <div className="calendar-weekdays">
          {WEEKDAYS.map((day, i) => (
            <span key={i}>{i % 2 ? day : ''}</span>
          ))}
        </div>
        {weeks.map((week, w) => (
          <div key={w} className="calendar-week">
            {week.map((day, d) =>
              day ? (
                <span
                  key={day.key}
                  className={`calendar-day level-${level(day.mb)}`}
                  title={`${day.date.toLocaleDateString('pt-BR')}: ${day.mb ? `${mbOrGb(day.mb)} liberados` : 'sem limpeza'}`}
                />
              ) : (
                <span key={d} className="calendar-day future" />
              ),
            )}
          </div>
        ))}
      </div>
      <div className="calendar-scale" aria-hidden="true">
        menos {[0, 1, 2, 3, 4].map((n) => <span key={n} className={`calendar-day level-${n}`} />)} mais
      </div>

      <h4 className="recent-title">Últimas limpezas</h4>
      {recent.length === 0 ? (
        <p className="section-empty">Nenhuma limpeza registrada ainda. A partir de agora, tudo o que for para a Lixeira aparece aqui.</p>
      ) : (
        <ul className="recent-list">
          {recent.map((cleanup) => (
            <li key={cleanup.quando + cleanup.acao}>
              <span>{new Date(cleanup.quando).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
              <span>
                {cleanup.acao} · {cleanup.itens} {cleanup.itens === 1 ? 'item' : 'itens'}
              </span>
              <strong>{mbOrGb(cleanup.liberado_mb)}</strong>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
