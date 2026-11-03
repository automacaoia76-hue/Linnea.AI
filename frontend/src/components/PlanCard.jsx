import { mbOrGb } from '../chartUtils.js'
import { SparkleIcon } from './Icons.jsx'
import './PlanCard.css'

// Cartão do "plano do agente" dentro da resposta da Linnea: os passos, quanto cada um libera e,
// durante a execução, o andamento de cada passo (fazendo, feito ou pulado).
// plan = { passos: [{ titulo, detalhe, ferramenta, libera_mb, estado }], status }
// status: pendente (esperando você decidir) | executando | concluido | recusado

const STEP_ICON = { pendente: '○', fazendo: '', feito: '✓', pulado: '↷' }
const STEP_LABEL = { pendente: 'a fazer', fazendo: 'fazendo agora', feito: 'feito', pulado: 'pulado' }

export default function PlanCard({ plan, onRun, onCancel, disabled }) {
  const total = plan.passos.reduce((sum, step) => sum + step.libera_mb, 0)
  return (
    <div className={`plan-card ${plan.status}`}>
      <header>
        <span className="plan-title">
          <SparkleIcon size={14} /> Plano da Linnea
        </span>
        {total > 0 && <span className="plan-total">libera ~{mbOrGb(total)}</span>}
      </header>

      <ol>
        {plan.passos.map((step, i) => (
          <li key={i} className={step.estado}>
            <span className="plan-icon" aria-label={STEP_LABEL[step.estado]}>
              {step.estado === 'fazendo' ? <span className="plan-spinner" /> : STEP_ICON[step.estado]}
            </span>
            <div>
              <strong>{step.titulo}</strong>
              <span>
                {step.detalhe}
                {step.libera_mb > 0 && ` · ${mbOrGb(step.libera_mb)}`}
              </span>
            </div>
          </li>
        ))}
      </ol>

      {plan.status === 'pendente' && (
        <div className="plan-buttons">
          <button className="plan-cancel" onClick={onCancel} disabled={disabled}>
            Agora não
          </button>
          <button className="plan-run" onClick={onRun} disabled={disabled}>
            Executar plano
          </button>
        </div>
      )}
      {plan.status === 'executando' && <p className="plan-note">Executando… aprove cada passo quando ela pedir.</p>}
      {plan.status === 'concluido' && <p className="plan-note done">✓ Plano concluído</p>}
      {plan.status === 'recusado' && <p className="plan-note">Plano cancelado.</p>}
    </div>
  )
}
