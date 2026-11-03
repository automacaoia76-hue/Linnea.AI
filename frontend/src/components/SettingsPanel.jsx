import { useEffect, useState } from 'react'
import { getMemory, getSettings, saveSettings } from '../api.js'
import { AURA_PRESETS } from './robot/aura.js'
import { SunIcon, MoonIcon } from './Icons.jsx'
import './SettingsPanel.css'

// Tela Configurações. Tema e cor da aura ficam no navegador (são coisas da tela);
// o resto fica no backend, porque a Linnea e os scans usam (data/config.json).

const css = (hex) => `#${hex.toString(16).padStart(6, '0')}`
const AURAS = [
  { id: 'padrao', label: 'Padrão', colors: ['#4fe3ff', '#a86bff'] }, // segue o tema
  ...Object.entries(AURA_PRESETS).map(([id, [a, b]]) => ({
    id,
    label: id[0].toUpperCase() + id.slice(1),
    colors: [css(a), css(b)],
  })),
]
const LARGE_SIZES = [50, 100, 250, 500, 1000]
const sizeLabel = (mb) => (mb >= 1000 ? `${mb / 1000} GB` : `${mb} MB`)
const FOLDERS = ['Downloads', 'Documentos', 'Imagens', 'Vídeos', 'Música', 'Área de Trabalho']
const PERSONALITIES = [
  { id: 'padrao', label: 'Padrão' },
  { id: 'formal', label: 'Formal' },
  { id: 'divertida', label: 'Divertida' },
  { id: 'direta', label: 'Direta' },
]
// Vozes do Gemini Live para o modo conversa (o nome é o da voz no Gemini; ao lado, o jeito dela)
const VOICES = [
  { id: 'Kore', label: 'Kore · firme' },
  { id: 'Aoede', label: 'Aoede · leve' },
  { id: 'Leda', label: 'Leda · jovem' },
  { id: 'Zephyr', label: 'Zephyr · animada' },
  { id: 'Sulafat', label: 'Sulafat · acolhedora' },
  { id: 'Despina', label: 'Despina · suave' },
  { id: 'Puck', label: 'Puck · masculina, animada' },
  { id: 'Charon', label: 'Charon · masculina, calma' },
]
// Modo da tela: o leve tira o robô 3D e o fundo animado (para PC fraco; o celular já usa sozinho)
const SCREEN_MODES = [
  { id: 'auto', label: 'Automático' },
  { id: 'completo', label: 'Completo' },
  { id: 'leve', label: 'Leve' },
]
const CARE = [
  { id: 'sempre_pedir', label: 'Sempre pedir permissão' },
  { id: 'lixo_sozinha', label: 'Pode limpar o lixo sozinha' },
]

// Botão liga/desliga
function Toggle({ on, onChange, label, setting }) {
  return (
    <button className={`toggle ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={label} data-setting={setting} onClick={() => onChange(!on)}>
      <span className="toggle-knob" />
    </button>
  )
}

export default function SettingsPanel({ theme, setTheme, aura, setAura, screenMode, setScreenMode, withChat = false }) {
  const [settings, setSettings] = useState(null) // configurações do backend (null = carregando)
  const [message, setMessage] = useState('')
  const [newPath, setNewPath] = useState('')
  const [memory, setMemory] = useState(null) // memória da Linnea (Obsidian): { pasta, fatos }

  useEffect(() => {
    getSettings()
      .then(setSettings)
      .catch((err) => setMessage(err.message))
    getMemory()
      .then(setMemory)
      .catch(() => {}) // sem memória: a seção mostra "carregando"
  }, [])

  // Salva só o que mudou no backend e mostra o resultado
  async function save(changes, okText = '✓ Salvo.') {
    try {
      setSettings(await saveSettings(changes))
      setMessage(okText)
      return true
    } catch (err) {
      setMessage(err.message)
      return false
    }
  }

  function toggleFolder(name) {
    const blocked = settings.pastas_proibidas
    save(
      { pastas_proibidas: blocked.includes(name) ? blocked.filter((f) => f !== name) : [...blocked, name] },
      '✓ Salvo. Vale a partir do próximo scan.',
    )
  }

  async function addProtected(event) {
    event.preventDefault()
    if (!newPath.trim()) return
    if (await save({ nunca_apagar: [...settings.nunca_apagar, newPath] }, '✓ Protegido. Nada aí dentro vai para a Lixeira.')) setNewPath('')
  }

  const ready = settings !== null
  const lastAuto = settings?.ultima_limpeza_auto

  return (
    <section className={`settings glass ${withChat ? 'with-chat' : ''}`}>
      <header className="settings-header">
        <h2>Configurações</h2>
        <p>Deixe o app do seu jeito</p>
      </header>

      <div className="settings-group">
        <h3>Aparência</h3>

        <div className="setting">
          <div className="setting-text">
            <strong>Tema</strong>
            <span>Claro ou escuro</span>
          </div>
          <div className="segmented" role="group" aria-label="Tema">
            <button data-setting="tema-claro" aria-pressed={theme === 'light'} onClick={() => setTheme('light')}>
              <SunIcon size={14} /> Claro
            </button>
            <button data-setting="tema-escuro" aria-pressed={theme === 'dark'} onClick={() => setTheme('dark')}>
              <MoonIcon size={14} /> Escuro
            </button>
          </div>
        </div>

        <div className="setting">
          <div className="setting-text">
            <strong>Modo da tela</strong>
            <span>Leve: sem o robô 3D e sem o fundo animado, para PC fraco. Automático: completo no PC e leve no celular.</span>
          </div>
          <div className="segmented" role="group" aria-label="Modo da tela">
            {SCREEN_MODES.map((option) => (
              <button key={option.id} data-setting={`tela-${option.id}`} aria-pressed={screenMode === option.id} onClick={() => setScreenMode(option.id)}>
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="setting">
          <div className="setting-text">
            <strong>Cor da aura do robô</strong>
            <span>"Padrão" muda junto com o tema</span>
          </div>
          <div className="swatches" role="group" aria-label="Cor da aura">
            {AURAS.map((option) => (
              <button
                key={option.id}
                data-setting={`aura-${option.id}`}
                className="swatch"
                aria-pressed={aura === option.id}
                onClick={() => setAura(option.id)}
                title={option.label}
              >
                <span className="swatch-dot" style={{ background: `linear-gradient(135deg, ${option.colors[0]}, ${option.colors[1]})` }} />
                <span className="swatch-label">{option.label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="settings-group">
        <h3>A Linnea</h3>

        <div className="setting">
          <div className="setting-text">
            <strong>Personalidade</strong>
            <span>O jeito de ela escrever as respostas</span>
          </div>
          <div className="segmented" role="group" aria-label="Personalidade">
            {PERSONALITIES.map((option) => (
              <button
                key={option.id}
                data-setting={`personalidade-${option.id}`}
                aria-pressed={settings?.personalidade === option.id}
                onClick={() => save({ personalidade: option.id }, '✓ Salvo. Vale a partir da próxima mensagem.')}
                disabled={!ready}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="setting">
          <div className="setting-text">
            <strong>Voz</strong>
            <span>Como ela fala no modo conversa (o 🎤 do chat)</span>
          </div>
          <div className="segmented voices" role="group" aria-label="Voz">
            {VOICES.map((option) => (
              <button
                key={option.id}
                data-setting={`voz-${option.id}`}
                aria-pressed={settings?.voz === option.id}
                onClick={() => save({ voz: option.id }, '✓ Salvo. Vale a partir da próxima conversa por voz.')}
                disabled={!ready}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="setting">
          <div className="setting-text">
            <strong>Nível de cuidado</strong>
            <span>Apagar arquivos, duplicatas e organizar pastas sempre pede permissão. Limpar o lixo também esvazia a Lixeira (permanente).</span>
          </div>
          <div className="segmented" role="group" aria-label="Nível de cuidado">
            {CARE.map((option) => (
              <button
                key={option.id}
                data-setting={`cuidado-${option.id}`}
                aria-pressed={settings?.cuidado === option.id}
                onClick={() => save({ cuidado: option.id })}
                disabled={!ready}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="setting">
          <div className="setting-text">
            <strong>Memória</strong>
            <span>
              O que ela aprendeu nas conversas sobre você e o seu PC (arquivo "Memória" no Obsidian).
              {memory && ` ${memory.fatos.length} ${memory.fatos.length === 1 ? 'anotação' : 'anotações'}.`}
            </span>
          </div>
          {memory && memory.fatos.length === 0 && <p className="memory-empty">Ainda não anotou nada. Converse com ela sobre você e o seu PC!</p>}
          {memory && memory.fatos.length > 0 && (
            <ul className="memory-list">
              {memory.fatos.map((fact) => (
                <li key={fact}>🧠 {fact}</li>
              ))}
            </ul>
          )}
          {memory && (
            <p className="memory-path">
              Para ler e editar no Obsidian: <strong>Open folder as vault</strong> → <code>{memory.pasta.replace(/[\\/]Linnea$/, '')}</code>
            </p>
          )}
        </div>
      </div>

      <div className="settings-group">
        <h3>Análise</h3>

        <div className="setting">
          <div className="setting-text">
            <strong>Arquivo grande a partir de</strong>
            <span>Usado no card "Arquivos grandes" e pela Linnea</span>
          </div>
          <div className="segmented" role="group" aria-label="Tamanho de arquivo grande">
            {LARGE_SIZES.map((mb) => (
              <button
                key={mb}
                data-setting={`grande-${mb}`}
                aria-pressed={settings?.arquivo_grande_mb === mb}
                onClick={() => save({ arquivo_grande_mb: mb }, '✓ Salvo. Vale a partir do próximo scan.')}
                disabled={!ready}
              >
                {sizeLabel(mb)}
              </button>
            ))}
          </div>
        </div>

        <div className="setting">
          <div className="setting-text">
            <strong>Pastas que a Linnea pode analisar</strong>
            <span>Desligada = proibida: fica fora dos scans, do mapa e das listas, e nada dela é apagado</span>
          </div>
          <div className="chips" role="group" aria-label="Pastas permitidas">
            {FOLDERS.map((name) => {
              const allowed = ready && !settings.pastas_proibidas.includes(name)
              return (
                <button key={name} className="chip" data-setting={`pasta-${name}`} aria-pressed={allowed} onClick={() => toggleFolder(name)} disabled={!ready}>
                  {allowed ? '✓' : '⊘'} {name}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div className="settings-group">
        <h3>Proteção e automático</h3>

        <div className="setting">
          <div className="setting-text">
            <strong>Nunca apagar</strong>
            <span>Pastas ou arquivos protegidos: nem a Linnea, nem o mapa, nem o robô mandam para a Lixeira</span>
          </div>
          {ready && settings.nunca_apagar.length > 0 && (
            <ul className="protected-list">
              {settings.nunca_apagar.map((path) => (
                <li key={path}>
                  <span title={path}>🛡 {path}</span>
                  <button
                    onClick={() => save({ nunca_apagar: settings.nunca_apagar.filter((p) => p !== path) }, '✓ Removido da proteção.')}
                    aria-label={`Tirar ${path} da proteção`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form className="protected-add" onSubmit={addProtected}>
            <input
              type="text"
              value={newPath}
              onChange={(event) => setNewPath(event.target.value)}
              placeholder="Cole o caminho, ex.: C:\Users\Pichau\Documents\Faculdade"
              aria-label="Caminho para proteger"
              disabled={!ready}
            />
            <button type="submit" className="map-btn ask" disabled={!ready || !newPath.trim()}>
              Proteger
            </button>
          </form>
        </div>

        <div className="setting">
          <div className="setting-text">
            <strong>Limpeza automática semanal</strong>
            <span>
              Uma vez por semana, apaga sozinha os temporários com mais de 7 dias (a Lixeira não é esvaziada).{' '}
              {lastAuto ? `Última: ${new Date(lastAuto).toLocaleString('pt-BR')}.` : 'Ainda não rodou.'}
            </span>
          </div>
          <label className="toggle-row">
            <Toggle
              on={Boolean(settings?.limpeza_semanal)}
              onChange={(on) => save({ limpeza_semanal: on }, on ? '✓ Ligada. A primeira limpeza roda em até 1 hora.' : '✓ Desligada.')}
              label="Limpeza automática semanal"
              setting="limpeza-semanal"
            />
            {settings?.limpeza_semanal ? 'Ligada' : 'Desligada'}
          </label>
        </div>

        <div className="setting">
          <div className="setting-text">
            <strong>Aviso do Windows com o disco cheio</strong>
            <span>Uma notificação no canto do Windows quando o disco C: passar de 90% (no máximo uma por dia).</span>
          </div>
          <label className="toggle-row">
            <Toggle
              on={Boolean(settings?.avisar_disco_cheio)}
              onChange={(on) => save({ avisar_disco_cheio: on }, on ? '✓ Ligado.' : '✓ Desligado.')}
              label="Aviso do Windows com o disco cheio"
              setting="aviso-disco"
            />
            {settings?.avisar_disco_cheio ? 'Ligado' : 'Desligado'}
          </label>
        </div>
      </div>

      {message && <p className={`settings-message ${message.startsWith('✓') ? '' : 'error'}`}>{message}</p>}
    </section>
  )
}
