import './ReasoningPanel.css'

// Painel "Raciocínio da Linnea": mostra os passos do loop ReAct do agente AO VIVO
// (pensar -> agir com uma ferramenta -> ver o resultado -> responder).
// run = { id, status: 'idle' | 'thinking' | 'done' | 'error', steps: [{ kind, text }], model }

const LABELS = {
  pensando: { icon: '◌', label: 'Pensando' },
  acao: { icon: '▶', label: 'Ação' },
  resultado: { icon: '✓', label: 'Resultado' },
  troca: { icon: '⇄', label: 'Reserva' },
  permissao: { icon: '⏸', label: 'Permissão' },
}

export default function ReasoningPanel({ run }) {
  const toolCount = run.steps.filter((step) => step.kind === 'acao').length
  const lastIsAction = run.steps.at(-1)?.kind === 'acao'

  return (
    <section className="reasoning glass">
      <header className="reasoning-head">
        <h2>Raciocínio da Linnea</h2>
        <span className={`reasoning-status ${run.status}`}>
          {run.status === 'thinking'
            ? '● ao vivo'
            : run.status === 'waiting'
              ? '⏸ aguardando você'
              : run.status === 'done'
                ? `${run.steps.length + 1} passos`
                : ''}
        </span>
      </header>

      <ol className="reasoning-steps">
        {run.status === 'idle' && (
          <li className="reasoning-empty">Mande uma mensagem e veja aqui como ela pensa e age, passo a passo.</li>
        )}

        {run.steps.map((step, i) => {
          const { icon, label } = LABELS[step.kind] || LABELS.pensando
          return (
            <li key={`${run.id}-${i}`} className={`step ${step.kind}`}>
              <span className="step-icon">{icon}</span>
              <span className="step-label">{label}</span>
              <span className="step-text">{step.text}</span>
            </li>
          )
        })}

        {/* Linha "ao vivo" no fim: o que ela está fazendo agora */}
        {run.status === 'thinking' && (
          <li className="step pensando live">
            <span className="step-icon">◌</span>
            <span className="step-label">{lastIsAction ? 'Ação' : 'Pensando'}</span>
            <span className="step-text">
              {lastIsAction ? 'executando a ferramenta' : 'analisando'}
              <span className="cursor">▌</span>
            </span>
          </li>
        )}

        {run.status === 'done' && (
          <li className="step resposta">
            <span className="step-icon">✦</span>
            <span className="step-label">Resposta</span>
            <span className="step-text">enviada no chat</span>
          </li>
        )}

        {run.status === 'error' && <li className="reasoning-empty">Não consegui completar o raciocínio desta vez.</li>}
      </ol>

      {run.status === 'done' && (
        <footer className="reasoning-foot">
          modelo: {run.model} · {toolCount} {toolCount === 1 ? 'ferramenta usada' : 'ferramentas usadas'}
        </footer>
      )}
    </section>
  )
}
