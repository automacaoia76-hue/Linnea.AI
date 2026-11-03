import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { SparkleIcon, CopyIcon, PieIcon, SendIcon, CheckCheckIcon, MicIcon } from './Icons.jsx'
import MessageText from './MessageText.jsx'
import { resumeAgent, streamMessage } from '../api.js'
import { startVoice } from '../voiceSession.js'
import ApprovalCard from './ApprovalCard.jsx'
import PlanCard from './PlanCard.jsx'
import { robotSignal } from '../robotSignals.js'
import { voiceLevel } from '../voiceLevel.js'
import VoiceOrb from './VoiceOrb.jsx'
import './Chat.css'

const currentTime = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

// Saudação inicial (só no front; a conversa com o agente começa na primeira mensagem)
const initialMessages = [
  {
    id: 1,
    author: 'agent',
    text: 'Oi! Eu posso analisar o espaço do seu computador, achar lixo, duplicados e arquivos grandes. Como posso ajudar?',
    time: currentTime(),
  },
]

// Sugestões embaixo do chat: mudam conforme a tela aberta
const SUGGESTIONS = {
  inicio: [
    { text: 'Executar limpeza rápida', Icon: SparkleIcon, color: 'blue' },
    { text: 'Mostrar arquivos duplicados', Icon: CopyIcon, color: 'pink' },
    { text: 'Analisar espaço em disco', Icon: PieIcon, color: 'sky' },
  ],
  pastas: [
    { text: 'Quais arquivos posso apagar?', Icon: SparkleIcon, color: 'blue' },
    { text: 'Marca os instaladores antigos do Downloads', Icon: CopyIcon, color: 'pink' },
    { text: 'Busca vídeos maiores que 500 MB', Icon: PieIcon, color: 'sky' },
  ],
  relatorios: [
    { text: 'Por que meu disco está tão cheio?', Icon: SparkleIcon, color: 'blue' },
    { text: 'Quando meu disco vai encher?', Icon: PieIcon, color: 'sky' },
    { text: 'Quanto espaço eu já liberei?', Icon: CopyIcon, color: 'pink' },
  ],
  configuracoes: [
    { text: 'Deixa o tema escuro', Icon: SparkleIcon, color: 'blue' },
    { text: 'Muda a aura do robô para dourada', Icon: PieIcon, color: 'sky' },
    { text: 'Considera grande a partir de 250 MB', Icon: CopyIcon, color: 'pink' },
  ],
}

// ask: pergunta vinda de outra tela (ex.: "Perguntar à Linnea" no mapa); o chat envia sozinho e avisa com onAskHandled
// screen: tela aberta (as sugestões mudam conforme ela)
export default function Chat({ screen = 'inicio', onRunChange, onUiAction, ask, onAskHandled }) {
  const [messages, setMessages] = useState(initialMessages)
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false) // true enquanto espera a resposta da Linnea
  const [pendingApproval, setPendingApproval] = useState(false) // true enquanto um pedido de permissão espera resposta
  const [threadId] = useState(() => crypto.randomUUID()) // id desta conversa (a memória do agente usa)
  const listRef = useRef(null)
  const nextId = useRef(initialMessages.length + 1)
  // Plano do agente em execução: id da mensagem com o cartão e a ferramenta do passo que está sendo feito
  const activePlan = useRef(null)
  const planTool = useRef(null)
  const planTodo = useRef([]) // ferramentas dos passos que ainda faltam
  const sentAsk = useRef(null) // key da última pergunta vinda de outra tela que já foi enviada
  // Conversa por voz: ligada/desligada, a função que encerra e as mensagens que estão recebendo a legenda agora
  const [voice, setVoice] = useState('off') // 'off' | 'connecting' | 'on'
  const stopVoice = useRef(null)
  const voiceControls = useRef(null) // { stop, decide } da conversa ligada
  const voiceUserId = useRef(null)
  const voiceAgentId = useRef(null)
  // Modo voz (a logo em tela cheia e o chat no canto direito); voiceMin = você foi "Ver o app" com a conversa ligada
  const [voiceMin, setVoiceMin] = useState(false)
  const voiceScreen = voice !== 'off' && !voiceMin

  // A classe no <body> esconde o resto do app e leva o chat para a direita (VoiceOrb.css)
  useEffect(() => {
    document.body.classList.toggle('voice-mode', voiceScreen)
    return () => document.body.classList.remove('voice-mode')
  }, [voiceScreen])

  // Fechou a tela com a conversa ligada: desliga o microfone
  useEffect(() => () => stopVoice.current?.(), [])

  // Sempre rola para a mensagem mais nova
  useEffect(() => {
    listRef.current.scrollTop = listRef.current.scrollHeight
  }, [messages, thinking])

  function addMessage(author, text, extra = {}) {
    const id = nextId.current++
    setMessages((previous) => [...previous, { id, author, text, time: currentTime(), ...extra }])
    return id
  }

  // Altera uma mensagem já na tela (usado para ir completando a resposta enquanto ela chega)
  function updateMessage(id, change) {
    setMessages((previous) => previous.map((m) => (m.id === id ? { ...m, ...change(m) } : m)))
  }

  // writing: a Linnea está escrevendo a resposta (a barra de status mostra); volta a false a cada passo novo
  const addStep = (step) => onRunChange((run) => ({ ...run, steps: [...run.steps, step], writing: false }))

  // Roda o agente ao vivo (mensagem nova ou retomada depois da permissão), preenchendo a resposta replyId
  async function runAgent(start, replyId) {
    setThinking(true)
    let waitingApproval = false
    try {
      await start({
        onToken: (piece) => {
          updateMessage(replyId, (m) => ({ text: m.text + piece }))
          onRunChange((run) => (run.writing ? run : { ...run, writing: true })) // mesmo objeto = o React não redesenha
          robotSignal('word') // a aura do robô pulsa com cada pedaço de texto
        },
        onStep: (step) => {
          if (activePlan.current) followPlan(step)
          // Depois de cada ação, o texto que vier começa num parágrafo novo (nada do que ela escreveu se perde)
          if (step.kind === 'acao') {
            updateMessage(replyId, (m) => ({ text: m.text && !m.text.endsWith('\n\n') ? m.text + '\n\n' : m.text }))
          }
          if (step.text.startsWith('scan_disk')) updateMessage(replyId, () => ({ usedScan: true }))
          addStep(step)
        },
        onUi: (action) => {
          if (action.acao === 'plano') {
            const passos = action.passos.map((step) => ({ ...step, estado: 'pendente' }))
            updateMessage(replyId, () => ({ plan: { passos, status: 'pendente' } }))
          }
          // Ação da Linnea na tela: registra na mensagem ("↳ destaquei o card Lixo") e manda o app executar
          updateMessage(replyId, (m) => ({ actions: [...(m.actions || []), action.descricao] }))
          onUiAction(action)
        },
        onSwitch: (model) => addStep({ kind: 'troca', text: `modelo principal ocupado, usando ${model}` }),
        onApproval: ({ acoes }) => {
          // A Linnea pausou: mostra o cartão "Aprovar / Recusar" na resposta dela
          waitingApproval = true
          updateMessage(replyId, () => ({ approval: { acoes, status: 'pendente' } }))
          setPendingApproval(true)
          addStep({ kind: 'permissao', text: 'aguardando a sua aprovação' })
        },
        onDone: ({ model }) => {
          onRunChange((run) => ({ ...run, status: waitingApproval ? 'waiting' : 'done', model }))
          if (activePlan.current && !waitingApproval) {
            updateMessage(activePlan.current, (m) => ({ plan: { ...m.plan, status: 'concluido' } }))
            activePlan.current = null
          }
        },
      })
    } catch (error) {
      updateMessage(replyId, () => ({ text: error.message, isError: true }))
      onRunChange((run) => ({ ...run, status: 'error' }))
    } finally {
      setThinking(false)
    }
  }

  function sendMessage(text) {
    const clean = text.trim()
    if (!clean || thinking || pendingApproval) return
    addMessage('user', clean)
    setInput('')
    onRunChange((run) => ({ id: run.id + 1, status: 'thinking', steps: [], model: '' }))
    const replyId = addMessage('agent', '') // resposta vazia, vai sendo preenchida palavra por palavra
    runAgent((handlers) => streamMessage(clean, threadId, handlers), replyId)
  }

  // Clique em "Aprovar" ou "Recusar" no cartão de permissão: a Linnea continua de onde parou
  // Muda o estado de um passo do plano (o primeiro que usa essa ferramenta e ainda não terminou)
  function markPlanStep(tool, estado) {
    updateMessage(activePlan.current, (m) => {
      const index = m.plan.passos.findIndex((step) => step.ferramenta === tool && ['pendente', 'fazendo'].includes(step.estado))
      if (index < 0) return {}
      const passos = m.plan.passos.map((step, i) => (i === index ? { ...step, estado } : step))
      return { plan: { ...m.plan, passos } }
    })
  }

  function followPlan(step) {
    if (step.kind === 'acao') {
      const tool = step.text.split('(')[0]
      const index = planTodo.current.indexOf(tool)
      if (index < 0) return // ferramenta de apoio (ex.: olhar_pasta), não é um passo do plano
      planTodo.current.splice(index, 1)
      planTool.current = tool
      markPlanStep(tool, 'fazendo')
    } else if (step.kind === 'resultado' && planTool.current) {
      markPlanStep(planTool.current, /recusou/i.test(step.text) ? 'pulado' : 'feito')
      planTool.current = null
    }
  }

  // Botões do cartão do plano
  function runPlan(messageId, plan) {
    activePlan.current = messageId
    planTodo.current = plan.passos.map((step) => step.ferramenta)
    updateMessage(messageId, (m) => ({ plan: { ...m.plan, status: 'executando' } }))
    sendMessage('Pode executar o plano.')
  }

  function cancelPlan(messageId) {
    updateMessage(messageId, (m) => ({ plan: { ...m.plan, status: 'recusado' } }))
  }

  function decide(messageId, approve) {
    updateMessage(messageId, (m) => ({ approval: { ...m.approval, status: approve ? 'aprovado' : 'recusado' } }))
    setPendingApproval(false)
    onRunChange((run) => ({ ...run, status: 'thinking' }))
    addStep({ kind: 'permissao', text: approve ? 'você aprovou' : 'você recusou' })
    const replyId = addMessage('agent', '')
    runAgent((handlers) => resumeAgent(threadId, approve, handlers), replyId)
  }

  // Envia a pergunta que veio de outra tela assim que a Linnea estiver livre.
  // Fica num efeito de propósito: a pergunta pode ter que esperar a resposta atual terminar.
  useEffect(() => {
    if (!ask || thinking || pendingApproval || sentAsk.current === ask.key) return
    sentAsk.current = ask.key // nunca envia a mesma pergunta duas vezes
    // oxlint-disable-next-line react/set-state-in-effect
    sendMessage(ask.text)
    onAskHandled()
  }, [ask, thinking, pendingApproval]) // eslint-disable-line react-hooks/exhaustive-deps

  // Legenda da conversa por voz: cada fala vira uma mensagem no chat, preenchida enquanto a pessoa fala
  function addCaption(who, text) {
    if (who === 'fim') {
      voiceUserId.current = null
      voiceAgentId.current = null
      return
    }
    const ref = who === 'voce' ? voiceUserId : voiceAgentId
    if (who === 'linnea') voiceUserId.current = null // ela começou a responder: sua fala terminou
    if (ref.current === null) ref.current = addMessage(who === 'voce' ? 'user' : 'agent', '', { voice: true })
    updateMessage(ref.current, (m) => ({ text: (m.text + text).trimStart() }))
  }

  // Mensagem da Linnea que está recebendo a fala agora (cria uma se ainda não houver)
  function voiceReply() {
    if (voiceAgentId.current === null) voiceAgentId.current = addMessage('agent', '', { voice: true })
    return voiceAgentId.current
  }

  // Resposta ao cartão de permissão que apareceu na conversa por voz
  function decideVoice(messageId, approve) {
    updateMessage(messageId, (m) => ({ approval: { ...m.approval, status: approve ? 'aprovado' : 'recusado' } }))
    voiceControls.current?.decide(approve)
  }

  async function toggleVoice() {
    if (voice !== 'off') {
      stopVoice.current?.()
      return
    }
    setVoice('connecting')
    setVoiceMin(false)
    try {
      voiceControls.current = await startVoice({
        onCaption: addCaption,
        onSpeaking: (volume) => {
          robotSignal('word') // a aura do robô pulsa
          voiceLevel(volume) // e a logo do modo voz também
        },
        // Ação na tela: mesma linha "↳ abri a pasta Downloads" do chat escrito, e o app executa
        onUi: (action) => {
          updateMessage(voiceReply(), (m) => ({ actions: [...(m.actions || []), action.descricao] }))
          onUiAction(action)
          if (action.acao !== 'memoria') setVoiceMin(true) // ela mexeu na tela (abriu algo, tour...): mostra o app
        },
        // Cartão "Aprovar / Recusar"; o que ela falar depois vai para uma mensagem nova, embaixo do cartão
        onApproval: (acoes) => {
          addMessage('agent', '', { voice: true, approval: { acoes, status: 'pendente' } })
          voiceAgentId.current = null
        },
        onEnd: (error) => {
          voiceControls.current = null
          stopVoice.current = null
          addCaption('fim', '')
          setVoice('off')
          setVoiceMin(false)
          if (error) addMessage('agent', error, { isError: true })
        },
      })
      stopVoice.current = voiceControls.current.stop
      setVoice('on')
    } catch {
      setVoice('off')
      addMessage('agent', 'Não consegui usar o microfone. Confira se o navegador tem permissão para usá-lo.', { isError: true })
    }
  }

  function handleSubmit(event) {
    event.preventDefault() // evita recarregar a página
    sendMessage(input)
  }

  return (
    <section className="chat glass">
      <header className="chat-header">
        <h1>
          Olá! Eu sou a <span className="gradient-text">Linnea.</span>
        </h1>
        <p>Seu agente de limpeza e performance.</p>
      </header>

      <div className="chat-messages" ref={listRef}>
        {messages.map((message) =>
          // (no modo voz, a ação pode chegar numa mensagem sem fala: mostra mesmo assim, com a linha "↳ ...")
          !message.text && !message.approval && !(message.voice && message.actions) ? null : message.author === 'user' ? (
            <div key={message.id} className="bubble bubble-user">
              <p>{message.text}</p>
              <span className="bubble-time">
                {message.time} <CheckCheckIcon size={15} className="read-check" />
              </span>
            </div>
          ) : (
            <div key={message.id} className="agent-row">
              <div className="agent-avatar">
                <SparkleIcon size={20} />
              </div>
              <div className={`bubble bubble-agent ${message.isError ? 'bubble-error' : ''}`}>
                {message.usedScan && <span className="tool-tag">Analisei o seu disco</span>}
                {message.actions?.map((action, i) => (
                  <span key={i} className="action-line">↳ {action}</span>
                ))}
                <MessageText text={message.text} />
                {message.plan && (
                  <PlanCard
                    plan={message.plan}
                    onRun={() => runPlan(message.id, message.plan)}
                    onCancel={() => cancelPlan(message.id)}
                    disabled={thinking || pendingApproval}
                  />
                )}
                {message.approval && (
                  <ApprovalCard
                    {...message.approval}
                    onApprove={() => (message.voice ? decideVoice(message.id, true) : decide(message.id, true))}
                    onReject={() => (message.voice ? decideVoice(message.id, false) : decide(message.id, false))}
                  />
                )}
                <span className="bubble-time">{message.time}</span>
              </div>
            </div>
          )
        )}

        {/* Pontinhos só até a primeira palavra chegar */}
        {thinking && !messages[messages.length - 1].text && (
          <div className="agent-row">
            <div className="agent-avatar">
              <SparkleIcon size={20} />
            </div>
            <div className="bubble bubble-agent typing" aria-label="Linnea está pensando">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
      </div>

      <ul className="chat-suggestions">
        {(SUGGESTIONS[screen] || SUGGESTIONS.inicio).map(({ text, Icon, color }) => (
          <li key={text}>
            <button onClick={() => sendMessage(text)} disabled={thinking || pendingApproval}>
              <span className={`suggestion-icon ${color}`}>
                <Icon size={17} />
              </span>
              <span className="suggestion-text">{text}</span>
            </button>
          </li>
        ))}
      </ul>

      <form className="chat-input" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder={
            voice === 'on'
              ? 'Pode falar, estou ouvindo…'
              : pendingApproval
                ? 'Responda o pedido de permissão acima…'
                : 'Pergunte algo para a Linnea...'
          }
          value={input}
          onChange={(event) => setInput(event.target.value)}
        />
        <button
          type="button"
          className={`mic-button ${voice}`}
          aria-label={voice === 'off' ? 'Conversar por voz' : 'Encerrar conversa por voz'}
          aria-pressed={voice !== 'off'}
          title={voice === 'off' ? 'Conversar por voz' : 'Encerrar conversa por voz'}
          onClick={toggleVoice}
        >
          <MicIcon size={18} />
        </button>
        <button type="submit" aria-label="Enviar" disabled={thinking || pendingApproval}>
          <SendIcon size={18} />
        </button>
      </form>

      {voiceScreen &&
        createPortal(<VoiceOrb connecting={voice === 'connecting'} onMinimize={() => setVoiceMin(true)} onStop={toggleVoice} />, document.body)}
      {voice !== 'off' &&
        voiceMin &&
        createPortal(
          <button className="voice-return" onClick={() => setVoiceMin(false)}>
            <img src="/logo.png" alt="" /> Voltar para a voz
          </button>,
          document.body,
        )}
    </section>
  )
}
