import { useEffect, useRef, useState } from 'react'
import { gb, parseDay, shortDate } from '../chartUtils.js'

// Gráfico de linha do espaço livre ao longo dos dias (1 ponto por dia em que rodou um scan),
// com régua que segue o mouse, dica com os valores e a opção de ver em tabela.

const MARGIN = { top: 18, right: 66, bottom: 28, left: 46 } // espaço para os eixos e o rótulo do último ponto

// Topo "redondo" para o eixo Y, com no máximo 6 marcas (ex.: 11,3 -> 12 com marcas de 2 em 2)
function niceScale(max) {
  if (max <= 0) return { top: 1, step: 0.5 }
  const power = 10 ** Math.floor(Math.log10(max / 6))
  const step = [1, 2, 5, 10].map((n) => n * power).find((s) => Math.ceil(max / s) <= 6)
  return { top: Math.ceil(max / step) * step, step }
}

// days = histórico do disco, do mais antigo para o mais novo
export default function DiskHistory({ days }) {
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [active, setActive] = useState(null) // índice do dia sob o mouse (ou escolhido pelas setas)
  const [showTable, setShowTable] = useState(false)
  const chartRef = useRef(null)

  // Mede a área do gráfico (e mede de novo se a janela mudar de tamanho)
  useEffect(() => {
    if (!chartRef.current) return
    const observer = new ResizeObserver(([entry]) => {
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    observer.observe(chartRef.current)
    return () => observer.disconnect()
  }, [showTable])

  const last = days.at(-1)
  const first = days[0]

  // Escalas: data -> x em pixels, GB -> y em pixels
  const innerW = Math.max(size.w - MARGIN.left - MARGIN.right, 0)
  const innerH = Math.max(size.h - MARGIN.top - MARGIN.bottom, 0)
  const { top, step } = niceScale(Math.max(...days.map((d) => d.livre_gb), 0) * 1.15)
  const t0 = parseDay(first.data).getTime()
  const t1 = parseDay(last.data).getTime()
  const x = (day) => MARGIN.left + (t1 === t0 ? innerW / 2 : ((parseDay(day.data).getTime() - t0) / (t1 - t0)) * innerW)
  const y = (value) => MARGIN.top + innerH - (value / top) * innerH
  const points = days.map((day) => ({ day, px: x(day), py: y(day.livre_gb) }))
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${p.px},${p.py}`).join(' ')
  const area = `${line} L${points.at(-1).px},${y(0)} L${points[0].px},${y(0)} Z`
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step)
  // Datas no eixo X: no máximo 6, sempre com a primeira e a última
  const labelEvery = Math.max(1, Math.ceil(points.length / 6))
  const xLabels = points.filter((_, i) => i % labelEvery === 0 || i === points.length - 1)

  // Régua do mouse: acha o dia mais perto na horizontal
  function handlePointerMove(event) {
    const mouseX = event.clientX - event.currentTarget.getBoundingClientRect().left
    let nearest = 0
    points.forEach((p, i) => {
      if (Math.abs(p.px - mouseX) < Math.abs(points[nearest].px - mouseX)) nearest = i
    })
    setActive(nearest)
  }

  // Setas do teclado também andam pelos dias (para quem não usa mouse)
  function handleKeyDown(event) {
    if (event.key === 'ArrowLeft') setActive((i) => Math.max((i ?? points.length) - 1, 0))
    if (event.key === 'ArrowRight') setActive((i) => Math.min((i ?? -1) + 1, points.length - 1))
  }

  const hovered = active !== null ? points[active] : null

  return (
    <section className="chart-section">
      <header className="section-header">
        <div>
          <h3>Espaço livre no disco</h3>
          <p>Um ponto por dia em que você rodou um scan</p>
        </div>
        <button className="history-toggle" onClick={() => setShowTable(!showTable)}>
          {showTable ? 'Ver gráfico' : 'Ver tabela'}
        </button>
      </header>

      {showTable ? (
        <div className="history-table">
          <table>
            <thead>
              <tr>
                <th>Dia</th>
                <th className="num">Livre</th>
                <th className="num">Usado</th>
                <th className="num">Lixo</th>
              </tr>
            </thead>
            <tbody>
              {[...days].reverse().map((day) => (
                <tr key={day.data}>
                  <td>{shortDate(day.data)}</td>
                  <td className="num">{gb(day.livre_gb)}</td>
                  <td className="num">{gb(day.usado_gb)}</td>
                  <td className="num">{gb(day.lixo_gb)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="history-chart" ref={chartRef}>
          <svg
            width={size.w}
            height={size.h}
            role="img"
            aria-label={`Espaço livre por dia. Último dia: ${gb(last.livre_gb)}.`}
            tabIndex={0}
            onPointerMove={handlePointerMove}
            onPointerLeave={() => setActive(null)}
            onKeyDown={handleKeyDown}
            onBlur={() => setActive(null)}
          >
            {/* Linhas de grade e valores do eixo Y */}
            {ticks.map((tick) => (
              <g key={tick}>
                <line className="grid" x1={MARGIN.left} x2={MARGIN.left + innerW} y1={y(tick)} y2={y(tick)} />
                <text className="axis" x={MARGIN.left - 8} y={y(tick)} textAnchor="end" dominantBaseline="middle">
                  {tick.toLocaleString('pt-BR')}
                </text>
              </g>
            ))}
            {/* Datas do eixo X */}
            {xLabels.map((p) => (
              <text key={p.day.data} className="axis" x={p.px} y={MARGIN.top + innerH + 18} textAnchor="middle">
                {shortDate(p.day.data)}
              </text>
            ))}

            <path className="area" d={area} />
            <path className="line" d={line} />

            {/* Régua que segue o mouse */}
            {hovered && <line className="crosshair" x1={hovered.px} x2={hovered.px} y1={MARGIN.top} y2={MARGIN.top + innerH} />}

            {/* Último ponto (com o valor ao lado) e o ponto sob o mouse */}
            <circle className="dot" cx={points.at(-1).px} cy={points.at(-1).py} r={5} />
            <text className="end-label" x={points.at(-1).px + 10} y={points.at(-1).py} dominantBaseline="middle">
              {gb(last.livre_gb)}
            </text>
            {hovered && <circle className="dot" cx={hovered.px} cy={hovered.py} r={5} />}
          </svg>

          {hovered && (
            <div
              className={`history-tooltip ${hovered.px > size.w * 0.65 ? 'left' : ''}`}
              style={{ left: hovered.px, top: hovered.py }}
            >
              <strong>{gb(hovered.day.livre_gb)} livres</strong>
              <span>{parseDay(hovered.day.data).toLocaleDateString('pt-BR')}</span>
              <span>Usado: {gb(hovered.day.usado_gb)} · Lixo: {gb(hovered.day.lixo_gb)}</span>
            </div>
          )}
        </div>
      )}

      {days.length === 1 && (
        <p className="history-hint">O histórico começou hoje. Rode um scan nos próximos dias e a linha vai se formando.</p>
      )}
    </section>
  )
}
