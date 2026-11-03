import { AlertIcon, ArrowLeftIcon, CheckIcon, CpuIcon, GpuIcon, HardDriveIcon, MemoryIcon, ThermometerIcon } from './Icons.jsx'
import './PcHealth.css'

// Painel "Configurações do PC" (modo saúde do PC): CPU, GPU, RAM, armazenamento e temperatura reais.
// Quem busca os dados (a cada 5 s) é o App; aqui só mostramos.

// Cor da barra conforme o uso: normal, alto, no limite (a situação também vai escrita, nunca só a cor)
const level = (value) => (value >= 90 ? 'danger' : value >= 70 ? 'warning' : 'ok')

function Meter({ value }) {
  if (value === null || value === undefined) return <span className="meter-empty">sem leitura</span>
  return (
    <span className={`meter ${level(value)}`} aria-hidden="true">
      <span style={{ width: `${value}%` }} />
    </span>
  )
}

function Row({ Icon, label, detail, value }) {
  return (
    <div className="health-row">
      <Icon size={26} className="row-icon" />
      <div className="row-text">
        <span className="row-label">{label}</span>
        <span className="row-detail">{detail}</span>
        <Meter value={value} />
      </div>
      <strong className="row-value">{value === null || value === undefined ? '—' : `${value}%`}</strong>
    </div>
  )
}

// health = resposta do /api/saude (null enquanto carrega); onBack = voltar para a tela inicial
export default function PcHealth({ health, onBack }) {
  const checkedAt = health && new Date(health.verificado_em).toLocaleTimeString('pt-BR')
  return (
    <section className="pc-health glass" aria-label="Configurações do PC">
      <header className="health-header">
        <h2>Configurações do PC</h2>
        <button className="map-btn" onClick={onBack}>
          <ArrowLeftIcon size={14} /> Voltar
        </button>
      </header>

      {!health && <p className="health-loading">Lendo o seu PC…</p>}

      {health && (
        <>
          <Row Icon={CpuIcon} label="CPU" detail={health.cpu.nome} value={health.cpu.uso} />
          <Row Icon={GpuIcon} label="GPU" detail={health.gpu.nome} value={health.gpu.uso} />
          <Row Icon={MemoryIcon} label="RAM" detail={`${health.ram.total_gb.toLocaleString('pt-BR')} GB`} value={health.ram.uso} />
          {/* Uma linha para cada disco (C:, E:...) */}
          {(health.discos?.length ? health.discos : [{ ...health.armazenamento, sistema: true }]).map((disk) => (
            <Row
              key={disk.unidade}
              Icon={HardDriveIcon}
              label={`Disco ${disk.unidade}${disk.sistema ? ' (Windows)' : ''}`}
              detail={[
                disk.nome,
                `${Math.round(disk.total_gb)} GB`,
                disk.livre_gb != null && `${disk.livre_gb.toLocaleString('pt-BR')} GB livres`,
              ]
                .filter(Boolean)
                .join(' · ')}
              value={disk.uso}
            />
          ))}

          <div className="health-row temperature">
            <ThermometerIcon size={26} className="row-icon" />
            <div className="row-text">
              <span className="row-label">Temperatura</span>
              <div className="temp-pair">
                {health.cpu.temperatura === null ? (
                  <span title="Abra o LibreHardwareMonitor (com o Remote Web Server ligado) para ver a temperatura da CPU">
                    CPU <strong>indisponível</strong>
                  </span>
                ) : (
                  <span>
                    CPU <strong>{health.cpu.temperatura} °C</strong>
                  </span>
                )}
                <span>
                  GPU <strong>{health.gpu.temperatura === null ? 'indisponível' : `${health.gpu.temperatura} °C`}</strong>
                </span>
              </div>
            </div>
          </div>

          {health.problemas.length === 0 ? (
            <div className="health-status good">
              <CheckIcon size={22} />
              <div>
                <strong>Sistema estável</strong>
                <span>Tudo funcionando normalmente.</span>
              </div>
            </div>
          ) : (
            <div className="health-status warn">
              <AlertIcon size={22} />
              <div>
                <strong>Precisa de atenção</strong>
                {health.problemas.map((problem) => (
                  <span key={problem}>{problem}</span>
                ))}
              </div>
            </div>
          )}

          <p className="health-checked">
            Última verificação: hoje, {checkedAt} · atualiza a cada 5 segundos
          </p>
        </>
      )}
    </section>
  )
}
