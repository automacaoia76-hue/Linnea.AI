import { useEffect, useState } from 'react'
import { SparkleIcon } from './Icons.jsx'
import { runScan } from '../api.js'
import './StartScan.css'

// Tela de abertura: botão "Start scan". O backend faz o scan; quando termina, chama onDone(resultado).
const STAGES = ['Espaço em disco', 'Lixo e temporários', 'Arquivos duplicados', 'Arquivos grandes']

export default function StartScan({ onDone }) {
  const [status, setStatus] = useState('idle') // 'idle' | 'scanning' | 'error'
  const [stage, setStage] = useState(0)
  const [error, setError] = useState('')

  // Enquanto escaneia, avança as etapas na tela (o scan real roda no backend)
  useEffect(() => {
    if (status !== 'scanning') return
    const timer = setInterval(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 1600)
    return () => clearInterval(timer)
  }, [status])

  async function start() {
    setStatus('scanning')
    setStage(0)
    try {
      const result = await runScan()
      setStage(STAGES.length) // tudo concluído
      setTimeout(() => onDone(result), 600) // pequena pausa para ver os checks antes de trocar de tela
    } catch (e) {
      setError(e.message)
      setStatus('error')
    }
  }

  const scanning = status === 'scanning'

  return (
    <section className="start-scan">
      <p className="start-kicker">Linnea · análise do sistema</p>
      <h1>
        {scanning ? 'Analisando seus arquivos…' : (
          <>
            Vamos ver como está o <span className="gradient-text">seu PC</span>?
          </>
        )}
      </h1>
      <p className="start-subtitle">
        {scanning
          ? 'Isso leva alguns segundos. Nada é apagado: eu só leio o disco.'
          : 'Eu verifico o espaço, o lixo, os duplicados e os arquivos grandes.'}
      </p>

      <button className={`scan-button ${scanning ? 'scanning' : ''}`} onClick={start} disabled={scanning}>
        <span className="scan-ring" />
        <span className="scan-core">
          <SparkleIcon size={26} />
          <span>{scanning ? 'Escaneando' : 'Start scan'}</span>
        </span>
      </button>

      <ul className={`scan-stages ${scanning ? 'visible' : ''}`}>
        {STAGES.map((label, i) => (
          <li key={label} className={i < stage ? 'done' : i === stage ? 'active' : ''}>
            <span className="stage-dot" />
            {label}
          </li>
        ))}
      </ul>

      {status === 'error' && <p className="start-error">{error}</p>}
    </section>
  )
}
