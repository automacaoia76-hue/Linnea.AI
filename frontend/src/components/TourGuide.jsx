import { useEffect, useRef, useState } from 'react'
import { linneaDo } from '../linneaCursor.js'
import { voiceSpeak } from '../voiceSession.js'
import './TourGuide.css'

// Tour guiado: a Linnea passa por cada parte do app. Em cada parada, o cursor dela voa até a peça,
// o resto da tela escurece e um balão explica. O roteiro fica aqui no app (não gasta API).
// Com a conversa por voz ligada (🎤), ela lê o texto do balão e passa para a próxima parada sozinha.

const SCREEN_ICON = { inicio: 'Início', pastas: 'Arquivos', relatorios: 'Gráficos' } // aria-label do ícone de cada tela

const STEPS = [
  {
    tela: 'inicio',
    alvo: '.chat',
    titulo: 'Aqui a gente conversa',
    texto: 'Me peça para analisar o PC, limpar o lixo, achar duplicatas ou explicar um arquivo. Antes de mexer em qualquer coisa, eu peço a sua permissão.',
  },
  {
    tela: 'inicio',
    alvo: '.metric-cards',
    titulo: 'A saúde do seu PC',
    texto: 'Estes 4 cards mostram o disco, o lixo, as duplicatas e os arquivos grandes. Quando eu falo de um deles, ele acende.',
  },
  {
    tela: 'inicio',
    alvo: '.reasoning',
    titulo: 'Meu raciocínio, ao vivo',
    texto: 'Aqui você vê o que eu penso, qual ferramenta eu uso e o que ela respondeu: é o loop ReAct funcionando.',
  },
  {
    tela: 'inicio',
    alvo: '.files',
    titulo: 'Os maiores arquivos',
    texto: 'Os arquivos que mais ocupam espaço no seu PC ficam nesta tabela.',
  },
  {
    tela: 'pastas',
    alvo: '.folder-map',
    titulo: 'Mapa do disco',
    texto: 'Cada quadradinho tem o tamanho da pasta ou do arquivo. Clique para entrar numa pasta; marque itens para mandar para a Lixeira ou para me perguntar o que são.',
  },
  {
    tela: 'relatorios',
    alvo: '.charts',
    titulo: 'Gráficos do disco',
    texto: 'Aqui você acompanha o espaço livre dia a dia, vê do que o disco é feito, quanto já liberou e quando ele deve encher. Dá até para baixar um relatório do mês em PDF.',
  },
  {
    tela: 'inicio',
    alvo: '.theme-toggle',
    titulo: 'Claro ou escuro',
    texto: 'Este botão troca o tema do app. Pronto, esse é o tour! Quando precisar, é só me chamar.',
  },
]

const BUBBLE_W = 300
const GAP = 16

// Posição do balão: ao lado da peça (direita, senão esquerda), sem sair da tela
function bubblePosition(rect) {
  if (!rect) return { left: (window.innerWidth - BUBBLE_W) / 2, top: window.innerHeight / 2 - 100 }
  let left = rect.right + GAP
  if (left + BUBBLE_W > window.innerWidth - GAP) left = rect.left - BUBBLE_W - GAP
  if (left < GAP) left = GAP
  const top = Math.min(Math.max(rect.top, GAP), window.innerHeight - 230)
  return { left, top }
}

// screen = tela aberta agora; openScreen(id) troca de tela; onEnd() fecha o tour
export default function TourGuide({ screen, openScreen, onEnd }) {
  const [current, setCurrent] = useState(null) // parada na tela: { index, rect } (null = o cursor está indo)
  const started = useRef(false)
  const spoken = useRef(-1) // parada que ela está lendo em voz alta (-1 = nenhuma)

  // Vai para uma parada: se for em outra tela, o cursor clica no ícone dela antes; depois voa até a peça
  function go(index) {
    const step = STEPS[index]
    if (step.tela !== screen) linneaDo(`[aria-label="${SCREEN_ICON[step.tela]}"]`, () => openScreen(step.tela))
    linneaDo(
      step.alvo,
      () => {
        const box = document.querySelector(step.alvo)?.getBoundingClientRect()
        setCurrent({ index, rect: box?.width ? box : null }) // peça fora da tela: o balão aparece no meio
      },
      2500,
    )
  }

  // Começa assim que o tour abre (o ref evita começar duas vezes no modo de desenvolvimento do React)
  useEffect(() => {
    if (started.current) return
    started.current = true
    go(0)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Parada nova na tela: com a voz ligada, ela lê o balão e, quando termina, vai para a próxima
  useEffect(() => {
    if (!current) return
    const index = current.index
    spoken.current = index
    voiceSpeak(STEPS[index].texto, () => spoken.current === index && next()) // se você já clicou em "Próximo", não pula de novo
  }, [current?.index]) // eslint-disable-line react-hooks/exhaustive-deps

  function next() {
    const index = current.index
    spoken.current = -1
    setCurrent(null)
    if (index + 1 < STEPS.length) go(index + 1)
    else onEnd()
  }

  function close() {
    spoken.current = -1
    setCurrent(null)
    if (screen !== 'inicio') openScreen('inicio')
    onEnd()
  }

  if (!current) return null
  const step = STEPS[current.index]
  const last = current.index === STEPS.length - 1
  const pad = 8 // folga do recorte em volta da peça

  return (
    <>
      {/* Recorte iluminado em volta da peça; a sombra gigante escurece o resto da tela */}
      {current.rect ? (
        <div
          className="tour-spotlight"
          style={{
            left: current.rect.left - pad,
            top: current.rect.top - pad,
            width: current.rect.width + pad * 2,
            height: current.rect.height + pad * 2,
          }}
        />
      ) : (
        <div className="tour-dim" />
      )}

      <div
        className="tour-bubble glass"
        role="dialog"
        aria-label={`Tour: ${step.titulo}`}
        style={bubblePosition(current.rect)}
        onKeyDown={(event) => event.key === 'Escape' && close()}
      >
        <span className="tour-count">
          Tour · {current.index + 1} de {STEPS.length}
        </span>
        <strong>{step.titulo}</strong>
        <p>{step.texto}</p>
        <div className="tour-buttons">
          <button className="tour-skip" onClick={close}>
            Sair
          </button>
          <button className="tour-next" onClick={next} autoFocus>
            {last ? 'Concluir' : 'Próximo'}
          </button>
        </div>
      </div>
    </>
  )
}
