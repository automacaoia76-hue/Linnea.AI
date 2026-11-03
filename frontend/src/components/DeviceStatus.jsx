import { useEffect, useState } from 'react'
import { getPcHealth } from '../api.js'
import './DeviceStatus.css'

// Card "Saúde do PC" embaixo do chat: anel com a nota, a situação e 3 indicadores (disco, RAM, temperatura).
// Atualiza a cada minuto; clicar abre a tela de saúde do PC (a mesma do clique no fone do robô).

const STATUS_COLOR = { Excelente: 'var(--green)', Bom: 'var(--blue)', Atenção: '#eda100', Crítico: 'var(--pink)' }
const R = 15
const CIRCUMFERENCE = 2 * Math.PI * R

export default function DeviceStatus({ onOpenHealth }) {
  const [health, setHealth] = useState(null)

  useEffect(() => {
    let open = true
    const load = () => getPcHealth().then((result) => open && setHealth(result)).catch(() => {})
    load()
    const timer = setInterval(load, 60000)
    return () => {
      open = false
      clearInterval(timer)
    }
  }, [])

  const color = health ? STATUS_COLOR[health.situacao] : 'var(--purple)'
  const temperature = health?.cpu.temperatura ?? health?.gpu.temperatura
  return (
    <button className="device-status glass" onClick={onOpenHealth} title="Ver a saúde do PC">
      <svg className="mini-ring" viewBox="0 0 36 36" aria-hidden="true">
        <circle className="mini-track" cx="18" cy="18" r={R} />
        <circle
          className="mini-progress"
          cx="18"
          cy="18"
          r={R}
          stroke={color}
          strokeDasharray={`${health ? (CIRCUMFERENCE * health.nota) / 100 : 0} ${CIRCUMFERENCE}`}
        />
        <text x="18" y="22" textAnchor="middle">
          {health ? health.nota : '…'}
        </text>
      </svg>
      <div className="health-text">
        <strong>
          Saúde do PC
          {health && (
            <span className="health-status-label">
              <span className="health-dot" style={{ background: color }} />
              {health.situacao}
            </span>
          )}
        </strong>
        <span>
          {health
            ? `Disco ${health.armazenamento.uso}% · RAM ${health.ram.uso}%${temperature != null ? ` · ${temperature} °C` : ''}`
            : 'verificando o PC…'}
        </span>
      </div>
      <span className="health-arrow" aria-hidden="true">
        ›
      </span>
    </button>
  )
}
