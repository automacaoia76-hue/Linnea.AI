import { useState } from 'react'
import { gb, mbOrGb } from '../chartUtils.js'

// Rosca "Do que o disco é feito". A cor segue a categoria (sempre a mesma cor para Vídeos, Imagens...);
// a legenda ao lado mostra nome, tamanho e porcentagem, para ninguém depender só da cor.

const COLORS = {
  Vídeos: 'var(--cat-1)',
  Imagens: 'var(--cat-2)',
  Áudios: 'var(--cat-3)',
  Documentos: 'var(--cat-4)',
  Compactados: 'var(--cat-5)',
  Instaladores: 'var(--cat-6)',
  Lixo: 'var(--cat-7)',
  'Outros arquivos': 'var(--cat-others)',
  'Sistema e programas': 'var(--cat-system)',
}
const R = 62 // raio do anel
const STROKE = 24 // espessura do anel
const CIRCUMFERENCE = 2 * Math.PI * R
const GAP = 2 // espaço entre as fatias, em pixels

// Porcentagem curta: "97%", "0,6%" ou "<0,1%" (em vez de um "0%" enganoso)
function percent(part, total) {
  const value = (part / total) * 100
  if (value < 0.1) return '<0,1%'
  return `${value.toLocaleString('pt-BR', { maximumFractionDigits: value < 1 ? 1 : 0 })}%`
}

// data = { usado_gb, total_gb, partes: [{ nome, gb }] }
export default function DiskDonut({ data }) {
  const [hovered, setHovered] = useState(null) // nome da fatia sob o mouse
  const parts = data.partes.filter((part) => part.gb > 0)
  const total = parts.reduce((sum, part) => sum + part.gb, 0)
  // Cada fatia começa onde a anterior terminou
  const slices = parts.reduce((list, part) => {
    const previous = list.at(-1)
    const offset = previous ? previous.offset + previous.length : 0
    return [...list, { ...part, length: (part.gb / total) * CIRCUMFERENCE, offset }]
  }, [])
  const focus = slices.find((slice) => slice.nome === hovered)

  return (
    <section className="chart-section">
      <header className="section-header">
        <div>
          <h3>Do que o disco é feito</h3>
          <p>{gb(data.usado_gb)} usados de {gb(data.total_gb)}</p>
        </div>
      </header>

      <div className="donut-layout">
        <svg className="donut" viewBox="0 0 160 160" role="img" aria-label="Divisão do espaço usado no disco">
          <g transform="rotate(-90 80 80)">
            {slices.map((slice) => (
              <circle
                key={slice.nome}
                cx="80"
                cy="80"
                r={R}
                fill="none"
                stroke={COLORS[slice.nome]}
                strokeWidth={hovered === slice.nome ? STROKE + 4 : STROKE}
                // Desenha só o pedaço da fatia (e deixa 2 px de espaço até a próxima)
                strokeDasharray={`${Math.max(slice.length - GAP, 0.5)} ${CIRCUMFERENCE}`}
                strokeDashoffset={-slice.offset}
                onPointerEnter={() => setHovered(slice.nome)}
                onPointerLeave={() => setHovered(null)}
              />
            ))}
          </g>
          {/* Centro: a fatia sob o mouse (ou o total usado) */}
          <text className="donut-value" x="80" y="78" textAnchor="middle">
            {focus ? mbOrGb(focus.gb * 1024) : gb(total)}
          </text>
          <text className="donut-caption" x="80" y="96" textAnchor="middle">
            {focus ? focus.nome : 'usados'}
          </text>
        </svg>

        <ul className="donut-legend">
          {slices.map((slice) => (
            <li
              key={slice.nome}
              className={hovered === slice.nome ? 'active' : ''}
              onPointerEnter={() => setHovered(slice.nome)}
              onPointerLeave={() => setHovered(null)}
            >
              <span className="legend-key" style={{ background: COLORS[slice.nome] }} />
              <span className="legend-name">{slice.nome}</span>
              <span className="legend-value">{mbOrGb(slice.gb * 1024)}</span>
              <span className="legend-percent">{percent(slice.gb, total)}</span>
            </li>
          ))}
        </ul>
      </div>
      {data.parcial && <p className="history-hint">Medição incompleta: tem arquivo demais para medir tudo.</p>}
    </section>
  )
}
