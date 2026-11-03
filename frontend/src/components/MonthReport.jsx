import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { getReport } from '../api.js'
import { gb, mbOrGb } from '../chartUtils.js'

// Relatório do mês: os números do mês e um resumo escrito pela Linnea (1 chamada à IA, frações de centavo).
// "Baixar PDF" abre a janela de impressão do navegador, onde dá para escolher "Salvar como PDF";
// na impressão só o relatório aparece (ver @media print no CSS).

export default function MonthReport({ onClose }) {
  const [report, setReport] = useState(null)
  const [error, setError] = useState('')
  const [generatedAt] = useState(() => new Date().toLocaleDateString('pt-BR'))

  useEffect(() => {
    getReport()
      .then(setReport)
      .catch((err) => setError(err.message))
  }, [])

  return createPortal(
    <div className="report-overlay" role="dialog" aria-label="Relatório do mês" onKeyDown={(event) => event.key === 'Escape' && onClose()}>
      <article className="report-sheet">
        <header className="report-head">
          <span className="report-logo">✦</span>
          <div>
            <h2>Relatório de {report?.mes || 'este mês'}</h2>
            <p>Gerado pela Linnea em {generatedAt}</p>
          </div>
        </header>

        {error && <p className="report-status">{error}</p>}
        {!report && !error && <p className="report-status">A Linnea está escrevendo o relatório…</p>}

        {report && (
          <>
            <section>
              <h3>Resumo da Linnea</h3>
              <p className="report-text">{report.resumo || 'A IA não respondeu agora, então o relatório saiu só com os números.'}</p>
            </section>

            <section>
              <h3>Números do mês</h3>
              <dl className="report-numbers">
                <div>
                  <dt>Espaço livre</dt>
                  <dd>
                    {report.livre_fim_gb === null
                      ? '—'
                      : report.livre_inicio_gb === report.livre_fim_gb
                        ? gb(report.livre_fim_gb)
                        : `${gb(report.livre_inicio_gb)} → ${gb(report.livre_fim_gb)}`}
                  </dd>
                </div>
                <div>
                  <dt>Liberado no mês</dt>
                  <dd>{mbOrGb(report.liberado_mb)}</dd>
                </div>
                <div>
                  <dt>Limpezas</dt>
                  <dd>{report.limpezas}</dd>
                </div>
                <div>
                  <dt>Dias com scan</dt>
                  <dd>{report.dias_com_scan}</dd>
                </div>
                <div>
                  <dt>Lixo agora</dt>
                  <dd>{report.lixo_gb === null ? '—' : gb(report.lixo_gb)}</dd>
                </div>
              </dl>
              {Object.keys(report.liberado_por_acao_mb).length > 0 && (
                <ul className="report-actions-list">
                  {Object.entries(report.liberado_por_acao_mb).map(([action, mb]) => (
                    <li key={action}>
                      {action}: <strong>{mbOrGb(mb)}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        <footer className="report-actions">
          <button className="map-btn" onClick={onClose}>
            Fechar
          </button>
          <button className="map-btn ask" onClick={() => window.print()} disabled={!report} autoFocus>
            📄 Baixar PDF
          </button>
        </footer>
      </article>
    </div>,
    document.body,
  )
}
