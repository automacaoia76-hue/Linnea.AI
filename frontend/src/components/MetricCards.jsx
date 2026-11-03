import { useId } from 'react'
import { HardDriveIcon, TrashIcon, CopyIcon, FolderIcon, MoreIcon } from './Icons.jsx'
import { sizeParts } from '../format.js'
import CountUp from './CountUp.jsx'
import './MetricCards.css'

// Monta os 4 cards a partir do resultado do scan (JSON do backend).
// "trend" são os pontos do gráfico de onda, de 0 (baixo) a 1 (alto); por enquanto é só decorativo.
function metricsFromScan(scan) {
  const disk = scan.disco
  const trash = sizeParts(scan.lixo.tamanho_gb)
  const dup = sizeParts(scan.duplicatas.tamanho_gb)
  const large = sizeParts(scan.arquivos_grandes.tamanho_gb)
  // Outros discos além do C: (ex.: "E: 78%"), para a legenda do card Disco
  const otherDisks = (scan.discos || []).filter((d) => !d.sistema).map((d) => ` · ${d.unidade} ${d.uso}%`).join('')
  const count = (n, one, many) => `${n.toLocaleString('pt-BR')} ${n === 1 ? one : many}`
  return [
    {
      id: 'disco',
      label: 'Disco',
      ...sizeParts(disk.usado_gb),
      caption: otherDisks ? `de ${disk.total_gb.toLocaleString('pt-BR')} GB no C:${otherDisks}` : `de ${disk.total_gb.toLocaleString('pt-BR')} GB usados`,
      color: 'blue',
      Icon: HardDriveIcon,
      trend: [0.18, 0.42, 0.55, 0.32, 0.5, 0.75, 0.3],
    },
    {
      id: 'lixo',
      label: 'Lixo',
      ...trash,
      caption: 'em temporários e lixeira',
      color: 'pink',
      Icon: TrashIcon,
      trend: [0.2, 0.42, 0.36, 0.25, 0.55, 0.85, 0.35],
    },
    {
      id: 'duplicatas',
      label: 'Duplicatas',
      ...dup,
      caption: `em ${count(scan.duplicatas.arquivos, 'cópia', 'cópias')}`,
      color: 'purple',
      Icon: CopyIcon,
      trend: [0.2, 0.45, 0.5, 0.3, 0.55, 0.8, 0.4],
    },
    {
      id: 'grandes',
      label: 'Arquivos grandes',
      ...large,
      caption: `em ${count(scan.arquivos_grandes.quantidade, 'arquivo', 'arquivos')} (+${scan.arquivos_grandes.minimo_mb} MB)`,
      color: 'sky',
      Icon: FolderIcon,
      trend: [0.15, 0.35, 0.4, 0.28, 0.5, 0.82, 0.6],
    },
  ]
}

// Transforma os pontos numa curva suave (SVG path) que cabe em width x height
function wavePath(points, width, height) {
  const step = width / (points.length - 1)
  const xy = points.map((p, i) => [i * step, height - p * height])
  let d = `M ${xy[0][0]} ${xy[0][1]}`
  for (let i = 1; i < xy.length; i++) {
    const [x0, y0] = xy[i - 1]
    const [x1, y1] = xy[i]
    const midX = (x0 + x1) / 2
    d += ` C ${midX} ${y0}, ${midX} ${y1}, ${x1} ${y1}`
  }
  return d
}

function WaveChart({ points }) {
  const gradientId = useId() // id único, para cada card ter o seu degradê
  const width = 200
  const height = 60
  const line = wavePath(points, width, height)

  return (
    <svg className="metric-chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L ${width} ${height} L 0 ${height} Z`} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

function MetricCard({ id, label, value, unit, caption, color, Icon, trend, spotlight, updating }) {
  return (
    // data-linnea: alvo do cursor da Linnea quando ela destaca este card
    <article data-linnea={`card-${id}`} className={`metric-card glass ${color} ${spotlight ? 'spotlight' : ''} ${updating ? 'updating' : ''}`}>
      <div className="metric-head">
        <div className="metric-icon">
          <Icon size={18} />
        </div>
        <button className="metric-more" aria-label={`Mais opções de ${label}`}>
          <MoreIcon size={16} />
        </button>
      </div>

      <h2 className="metric-label">{label}</h2>
      <p className="metric-value">
        <CountUp id={id} value={value} />
        <span className="metric-unit">{unit}</span>
      </p>
      <p className="metric-caption">{caption}</p>

      <WaveChart points={trend} />

      {/* TODO: pedir para o agente analisar esta categoria */}
      <button className="metric-button">Analisar</button>
    </article>
  )
}

// highlight = { alvo: 'lixo' | 'todos' | ..., key } — card que a Linnea destacou (key muda a cada destaque)
// updating = true enquanto a Linnea roda um scan novo
export default function MetricCards({ scan, highlight, updating }) {
  return (
    <section className="metric-cards">
      {metricsFromScan(scan).map((metric) => {
        const lit = highlight && (highlight.alvo === metric.id || highlight.alvo === 'todos')
        // A key muda quando o card é destacado de novo: o React recria o card e a animação recomeça
        return (
          <MetricCard
            key={lit ? `${metric.id}-${highlight.key}` : metric.id}
            {...metric}
            spotlight={lit}
            updating={updating}
          />
        )
      })}
    </section>
  )
}
