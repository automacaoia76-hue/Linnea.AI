import { useEffect, useRef, useState } from 'react'
import Background from './components/Background.jsx'
import Robot from './components/Robot.jsx'
import Sidebar from './components/Sidebar.jsx'
import Chat from './components/Chat.jsx'
import DeviceStatus from './components/DeviceStatus.jsx'
import MetricCards from './components/MetricCards.jsx'
import ReasoningPanel from './components/ReasoningPanel.jsx'
import StartScan from './components/StartScan.jsx'
import FilesTable from './components/FilesTable.jsx'
import FolderMap from './components/FolderMap.jsx'
import ChartsScreen from './components/ChartsScreen.jsx'
import { SparkleIcon } from './components/Icons.jsx'
import { getPcHealth, getServerInfo, loginToken, runScan } from './api.js'
import Login from './components/Login.jsx'
import { linneaDo } from './linneaCursor.js'
import LinneaCursor from './components/LinneaCursor.jsx'
import TourGuide from './components/TourGuide.jsx'
import LinneaStatus from './components/LinneaStatus.jsx'
import SettingsPanel from './components/SettingsPanel.jsx'
import LinneaToast from './components/LinneaToast.jsx'
import BeforeAfter from './components/BeforeAfter.jsx'
import PcHealth from './components/PcHealth.jsx'
import { robotSignal } from './robotSignals.js'
import './App.css'
import './mobile.css'

// Nome da tela no backend -> id da tela no app, e o rótulo do ícone de cada tela na barra lateral
const SCREENS = { inicio: 'inicio', arquivos: 'pastas', graficos: 'relatorios', configuracoes: 'configuracoes' }
const ICONS = { inicio: 'Início', pastas: 'Arquivos', relatorios: 'Gráficos', configuracoes: 'Configurações' }
const screenIcon = (id) => `[aria-label="${ICONS[id]}"]`
const gbText = (gb) => (gb < 1 ? `${Math.round(gb * 1024)} MB` : `${gb.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GB`)

// Tema inicial: o que a pessoa escolheu da última vez; se nunca escolheu, segue o sistema
function initialTheme() {
  try {
    const saved = localStorage.getItem('theme')
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    // sem acesso ao armazenamento (ex.: janela anônima): segue o sistema
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

// Cor da aura do robô escolhida nas Configurações ('padrao' = segue o tema)
function initialAura() {
  try {
    return localStorage.getItem('aura') || 'padrao'
  } catch {
    return 'padrao' // sem acesso ao armazenamento: usa a padrão
  }
}

// Modo da tela escolhido nas Configurações: 'auto' (leve só no celular), 'completo' ou 'leve' (para PC fraco)
function initialScreenMode() {
  try {
    return localStorage.getItem('tela') || 'auto'
  } catch {
    return 'auto'
  }
}

// Celular (tela estreita): o modo automático fica leve; no PC ele é sempre o completo
const PHONE = '(max-width: 768px)'

// "2026-10-04T23:10:47" -> "04/10 às 23:10"
const shortDate = (iso) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)} às ${iso.slice(11, 16)}` : 'ainda sem retrato')

function App() {
  // Linnea na nuvem (celular, PC da empresa): { nuvem, retrato_de }; no PC, nuvem = false e nada muda
  const [cloud, setCloud] = useState(null)
  const [needLogin, setNeedLogin] = useState(false)
  const [screenMode, setScreenMode] = useState(initialScreenMode)
  const [phone, setPhone] = useState(() => window.matchMedia(PHONE).matches)
  // Leve: sem o robô 3D e sem o fundo animado (o que mais pesa); o resto do app é igual
  const lite = screenMode === 'leve' || (screenMode === 'auto' && phone)
  const [theme, setTheme] = useState(initialTheme)
  const [aura, setAura] = useState(initialAura)
  const [screen, setScreen] = useState('inicio') // tela aberta na barra lateral
  const [scan, setScan] = useState(null) // resultado do scan (null = mostra a tela de Start scan)
  // Último raciocínio da Linnea (o chat atualiza; o painel mostra)
  const [agentRun, setAgentRun] = useState({ id: 0, status: 'idle', steps: [], model: '' })
  const [highlight, setHighlight] = useState(null) // card que a Linnea destacou: { alvo, key }
  const [agentScanning, setAgentScanning] = useState(false) // true enquanto a Linnea roda um scan novo
  const [ask, setAsk] = useState(null) // pergunta vinda de outra tela, esperando o chat enviar: { text, key }
  const [mapPath, setMapPath] = useState('') // pasta em que o mapa abre ('' = pastas pessoais)
  const [mapMarked, setMapMarked] = useState([]) // caminhos que a Linnea deixou marcados no mapa
  const [mapResults, setMapResults] = useState(null) // resultados da busca da Linnea (abre a aba Busca)
  const [mapKey, setMapKey] = useState(0) // muda para o mapa recomeçar na pasta escolhida
  const [tourKey, setTourKey] = useState(0) // tour guiado aberto (0 = fechado; muda a cada tour novo)
  const [toast, setToast] = useState(null) // aviso da Linnea no canto: { text, key }
  const lastScan = useRef(null) // scan anterior, para comparar com o novo (lixo novo, espaço liberado)
  const [beforeAfter, setBeforeAfter] = useState(null) // card "antes e depois" da limpeza: { before, after, key }
  const [health, setHealth] = useState(null) // saúde do PC (tela do fone do robô), atualizada a cada 5 s

  // Abre uma tela; na tela Arquivos, o mapa começa na pasta pedida, com os itens pedidos já marcados
  // (results = resultados de uma busca da Linnea: a tela abre na aba Busca)
  function openScreen(id, path = '', marked = [], results = null) {
    setMapPath(path)
    setMapMarked(marked)
    setMapResults(results)
    setMapKey((key) => key + 1)
    setScreen(id)
  }

  // Ações da Linnea na tela: o cursor dela voa até o alvo e "clica" antes de cada uma (ver linneaCursor.js)
  function handleUiAction(action) {
    const apply = () => applyUiAction(action)
    if (action.acao === 'destacar') linneaDo(`[data-linnea="card-${action.alvo}"]`, apply)
    else if (action.acao === 'abrir_tela') linneaDo(screenIcon(SCREENS[action.tela]), apply)
    else if (action.acao === 'marcar') {
      linneaDo(screenIcon('pastas'), apply)
      linneaDo('.tile.selected', undefined, 3000) // depois vai até o primeiro item que ela marcou
    } else if (action.acao === 'busca') linneaDo(screenIcon('pastas'), () => openScreen('pastas', '', [], action.itens))
    else if (action.acao === 'configurar') {
      // Abre as Configurações e clica em cada botão que ela mudou, como uma pessoa faria
      linneaDo(screenIcon('configuracoes'), () => openScreen('configuracoes'))
      if (action.tema) linneaDo(`[data-setting="tema-${action.tema}"]`, () => setTheme(action.tema === 'escuro' ? 'dark' : 'light'), 2000)
      if (action.aura) linneaDo(`[data-setting="aura-${action.aura}"]`, () => setAura(action.aura), 2000)
      if (action.arquivo_grande_mb) linneaDo(`[data-setting="grande-${action.arquivo_grande_mb}"]`, undefined, 2000) // já salvo no backend
    } else if (action.acao === 'tour') linneaDo(null, () => setTourKey(Date.now()))
    else if (action.acao === 'scan_iniciado') linneaDo('[data-linnea="card-disco"]', apply)
    else linneaDo(null, apply) // sem alvo: só respeita a ordem da fila
  }

  // Executor das ações na tela (a Linnea decide no backend; aqui só aplicamos)
  function applyUiAction(action) {
    if (action.acao === 'destacar') {
      setHighlight({ alvo: action.alvo, key: Date.now() })
      // O robô vira e aponta para o card (se o card estiver na tela)
      const box = document.querySelector(`[data-linnea="card-${action.alvo}"]`)?.getBoundingClientRect()
      if (box?.width) robotSignal('point', { x: box.left + box.width / 2, y: box.top + box.height / 2 })
    }
    if (action.acao === 'abrir_tela') openScreen(SCREENS[action.tela], action.pasta)
    if (action.acao === 'marcar') openScreen('pastas', action.pasta, action.caminhos)
    if (action.acao === 'scan_iniciado') setAgentScanning(true)
    if (action.acao === 'scan_concluido') {
      receiveScan(action.scan)
      setAgentScanning(false)
    }
    // Ela apagou ou moveu arquivos: o robô comemora e o scan roda de novo em segundo plano para os números ficarem certos
    if (['arquivos_removidos', 'lixo_limpo', 'downloads_organizados'].includes(action.acao)) {
      if (action.acao !== 'downloads_organizados') robotSignal('celebrate')
      setAgentScanning(true)
      runScan()
        .then(receiveScan)
        .catch(() => {}) // se falhar, os números antigos continuam na tela
        .finally(() => setAgentScanning(false))
    }
  }

  // Scan novo chegou (botão Start scan, Linnea ou scan em segundo plano): atualiza a tela e avisa o que mudou
  function receiveScan(result) {
    const previous = lastScan.current
    lastScan.current = result
    setScan(result)
    setHighlight({ alvo: 'todos', key: Date.now() }) // todos os cards acendem com os números novos
    const junk = result.lixo.tamanho_gb
    if (junk >= 1) robotSignal('worried') // muito lixo: o robô pisca rápido, "preocupado"
    let text = null
    if (!previous) {
      text = `Terminei a análise: ${gbText(junk)} de lixo e ${result.arquivos_grandes.quantidade} arquivos grandes.`
    } else {
      const freed = previous.disco.usado_gb - result.disco.usado_gb
      const newJunk = junk - previous.lixo.tamanho_gb
      if (freed >= 0.1) {
        // Liberou espaço: em vez do aviso simples, mostra o "antes e depois" do disco
        setToast(null)
        return setBeforeAfter({ before: previous.disco, after: result.disco, key: Date.now() })
      }
      if (newJunk >= 0.1) text = `Achei ${gbText(newJunk)} de lixo novo 👀`
    }
    if (text) setToast({ text, key: Date.now() })
  }

  // "Perguntar à Linnea" na tela Arquivos: o chat envia a pergunta
  // (se o scan ainda não foi feito, não há chat na tela: volta para o início, e ela sai depois do scan)
  function askLinnea(text) {
    setAsk({ text, key: Date.now() })
    if (!scan) setScreen('inicio')
  }

  // Robô em modo "procurando" enquanto a Linnea executa uma ferramenta
  const lastStep = agentRun.steps.at(-1)
  const robotBusy = agentScanning || (agentRun.status === 'thinking' && lastStep?.kind === 'acao')
  // Luz de scanner nos cards: durante um scan novo ou enquanto ela analisa o disco pelo chat
  const cardsScanning = agentScanning || (agentRun.status === 'thinking' && lastStep?.text.startsWith('scan_disk'))

  // Tela do fone do robô: abre e fecha (clicar no fone, no card "Meu PC" ou em Voltar)
  function toggleHealth() {
    if (screen === 'saude') openScreen('inicio')
    else {
      setHealth(null) // o anel começa em "verificando"
      openScreen('saude')
    }
  }

  // Enquanto a tela de saúde está aberta, lê o PC a cada 5 segundos (o primeiro resultado espera a câmera chegar)
  useEffect(() => {
    if (screen !== 'saude') return
    let open = true
    const load = () => getPcHealth().then((result) => open && setHealth(result)).catch(() => {})
    const first = setTimeout(load, 1200)
    const timer = setInterval(load, 5000)
    return () => {
      open = false
      clearTimeout(first)
      clearInterval(timer)
    }
  }, [screen])

  // Aplica o tema no <html> (o CSS troca as cores por ele) e lembra a escolha
  useEffect(() => {
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('theme', theme)
    } catch {
      // sem acesso ao armazenamento: o tema só não fica salvo
    }
  }, [theme])

  // Lembra a cor da aura escolhida
  useEffect(() => {
    try {
      localStorage.setItem('aura', aura)
    } catch {
      // sem acesso ao armazenamento: a cor só não fica salva
    }
  }, [aura])

  // Descobre se é a Linnea na nuvem (pede login) e, lá, confere a cada minuto de quando é o retrato do PC
  useEffect(() => {
    const load = () =>
      getServerInfo()
        .then((info) => {
          setCloud(info)
          if (info.nuvem && !loginToken()) setNeedLogin(true)
        })
        .catch(() => {})
    load()
    const timer = setInterval(load, 60000)
    const askLogin = () => setNeedLogin(true) // o login venceu (api.js avisa)
    window.addEventListener('linnea-login', askLogin)
    return () => {
      clearInterval(timer)
      window.removeEventListener('linnea-login', askLogin)
    }
  }, [])

  // Celular deitado/em pé, janela redimensionada: o layout de celular liga e desliga sozinho
  useEffect(() => {
    const query = window.matchMedia(PHONE)
    const update = () => setPhone(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  // Lembra o modo da tela e marca o <body> (o CSS do modo leve troca o fundo animado por um fixo)
  useEffect(() => {
    document.body.classList.toggle('lite', lite)
    try {
      localStorage.setItem('tela', screenMode)
    } catch {
      // sem acesso ao armazenamento: o modo só não fica salvo
    }
  }, [lite, screenMode])

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark')

  // key: quando muda, o mapa recomeça do zero na pasta mapPath
  const folderMap = (
    <FolderMap
      key={mapKey}
      initialPath={mapPath}
      initialMarked={mapMarked}
      initialView={mapResults ? 'busca' : 'mapa'}
      initialResults={mapResults || []}
      withChat={Boolean(scan)}
      onRemoved={() => applyUiAction({ acao: 'arquivos_removidos' })}
      onAsk={askLinnea}
    />
  )
  // Tela aberta no lugar dos cards (null = tela inicial)
  const panels = {
    pastas: folderMap,
    relatorios: <ChartsScreen withChat={Boolean(scan)} />,
    saude: <PcHealth health={health} onBack={toggleHealth} />,
    configuracoes: (
      <SettingsPanel
        theme={theme}
        setTheme={setTheme}
        aura={aura}
        setAura={setAura}
        screenMode={screenMode}
        setScreenMode={setScreenMode}
        withChat={Boolean(scan)}
      />
    ),
  }
  const panel = panels[screen] || null

  if (needLogin) {
    return (
      <>
        {!lite && <Background theme={theme} />}
        <Login onDone={() => setNeedLogin(false)} />
      </>
    )
  }

  return (
    <>
      {!lite && <Background theme={theme} />}
      {!lite && <Robot theme={theme} busy={robotBusy} aura={aura} focus={screen === 'saude'} onHeadClick={toggleHealth} health={health} />}
      <LinneaCursor />
      {toast && <LinneaToast key={toast.key} text={toast.text} onClose={() => setToast(null)} />}
      {beforeAfter && (
        <BeforeAfter key={beforeAfter.key} before={beforeAfter.before} after={beforeAfter.after} onClose={() => setBeforeAfter(null)} />
      )}
      {tourKey > 0 && <TourGuide key={tourKey} screen={screen} openScreen={openScreen} onEnd={() => setTourKey(0)} />}

      <div className={`app screen-${screen}`}>
        <header className="topbar">
          <img className="logo" src="/logo.png" alt="" />
          <span>Linnea.AI</span>
          {cloud?.nuvem && (
            <span className="cloud-chip" title="Na nuvem a Linnea vê o último retrato que o seu PC enviou">
              ☁ Retrato do PC: {shortDate(cloud.retrato_de)}
            </span>
          )}
          <LinneaStatus run={agentRun} scanning={agentScanning} />
        </header>

        <Sidebar theme={theme} onToggleTheme={toggleTheme} active={screen} setActive={openScreen} hide={cloud?.nuvem ? ['pastas'] : []} />

        {!scan ? (
          panel || <StartScan onDone={receiveScan} />
        ) : (
          <>
            {/* O chat fica sempre na tela: a Linnea conversa enquanto você navega pelos arquivos */}
            <div className="left-column">
              <Chat screen={screen} onRunChange={setAgentRun} onUiAction={handleUiAction} ask={ask} onAskHandled={() => setAsk(null)} />
              <DeviceStatus onOpenHealth={toggleHealth} />
            </div>

            {panel}

            {/* A coluna da direita só fica escondida (e não é desmontada) enquanto outra tela está aberta */}
            <div className="right-column" hidden={Boolean(panel)}>
              <MetricCards scan={scan} highlight={highlight} updating={cardsScanning} />
              {/* Plano do agente: a Linnea analisa, mostra um plano e executa quando você mandar */}
              {!cloud?.nuvem && ( // o plano mexe em arquivos: só no app do PC
                <button className="plan-launch" onClick={() => askLinnea('Executar o plano do agente')} disabled={agentRun.status === 'thinking'}>
                  <SparkleIcon size={15} /> Executar plano do agente
                </button>
              )}
              <ReasoningPanel run={agentRun} />
              <FilesTable files={scan.maiores_arquivos} scannedAt={scan.feito_em} />
            </div>
          </>
        )}
      </div>
    </>
  )
}

export default App
