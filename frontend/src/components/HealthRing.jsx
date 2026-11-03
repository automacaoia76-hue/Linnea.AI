import { BatteryChargingIcon } from './Icons.jsx'

// Anel grande em cima do fone do robô (modo saúde do PC): primeiro gira "verificando",
// depois mostra a nota de 0 a 100 e a situação (Excelente, Bom, Atenção, Crítico).

const STATUS_COLOR = { Excelente: 'var(--green)', Bom: 'var(--blue)', Atenção: '#eda100', Crítico: 'var(--pink)' }
const R = 92
const CIRCUMFERENCE = 2 * Math.PI * R

export default function HealthRing({ health }) {
  const ready = Boolean(health)
  const color = ready ? STATUS_COLOR[health.situacao] : 'var(--purple)'
  return (
    <div className="health-ring" role="status" aria-label={ready ? `Saúde do PC: ${health.nota}%, ${health.situacao}` : 'Verificando o PC'}>
      <svg viewBox="0 0 220 220" aria-hidden="true">
        <circle className="ring-track" cx="110" cy="110" r={R} />
        <circle
          className={`ring-progress ${ready ? '' : 'spinning'}`}
          cx="110"
          cy="110"
          r={R}
          stroke={color}
          // Pedaço do anel proporcional à nota (verificando: um pedaço girando)
          strokeDasharray={`${ready ? (CIRCUMFERENCE * health.nota) / 100 : CIRCUMFERENCE * 0.22} ${CIRCUMFERENCE}`}
        />
      </svg>
      <div className="ring-center">
        {ready ? (
          <>
            <BatteryChargingIcon size={26} />
            <span className="ring-label">SAÚDE DO PC</span>
            <strong>{health.nota}%</strong>
            <span className="ring-status">
              <span className="status-dot" style={{ background: color }} />
              {health.situacao.toUpperCase()}
            </span>
          </>
        ) : (
          <span className="ring-label">VERIFICANDO…</span>
        )}
      </div>
    </div>
  )
}
