import { Fragment, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getFileList, getFolderMap, moveToTrash, previewUrl, reviewLabels } from '../api.js'
import { formatDate, formatSize } from '../format.js'
import { squarify } from '../treemap.js'
import { FolderIcon } from './Icons.jsx'
import './FolderMap.css'

// Tela Arquivos. Abas: Mapa (quadradinhos do tamanho de cada item) e listas prontas (Grandes, Antigos,
// Downloads, Duplicados), mais a aba Busca com os resultados da Linnea.
// Clicar num arquivo marca; a barra de baixo manda os marcados para a Lixeira, pergunta à Linnea ou abre a prévia.
// Também dá para arrastar um arquivo até o robô, que "come" o arquivo (vai para a Lixeira, depois de confirmar).

const GAP = 3 // espaço entre os quadradinhos, em pixels
const TABS = [
  { id: 'mapa', label: 'Mapa' },
  { id: 'grandes', label: 'Grandes' },
  { id: 'antigos', label: 'Antigos' },
  { id: 'downloads', label: 'Downloads' },
  { id: 'duplicados', label: 'Duplicados' },
]
const HINTS = {
  grandes: 'Os maiores arquivos acima do tamanho escolhido nas Configurações',
  antigos: 'Arquivos que não mudam há mais de 1 ano',
  downloads: 'Tudo o que está na pasta Downloads',
  duplicados: 'Cópias extras de arquivos repetidos (a cópia original fica)',
  busca: 'Resultado da busca da Linnea',
}
const PREVIEWABLE = /\.(jpe?g|png|gif|webp|bmp|pdf|mp4|webm|mov|mp3|wav|m4a|ogg|txt)$/i

// Cor conforme o tipo
function tileColor(item) {
  if (item.tipo === 'pasta') return 'blue'
  if (item.tipo === 'outros') return 'gray'
  if (/Vídeo|Áudio/.test(item.tipo)) return 'purple'
  if (/Imagem|PDF|Documento|Planilha|Apresentação|Photoshop/.test(item.tipo)) return 'pink'
  if (/ZIP|RAR|7Z|Instala|Imagem de disco/.test(item.tipo)) return 'green'
  return 'gray'
}

const LABEL_COLOR = {
  'seguro apagar': 'green',
  'instalador antigo': 'purple',
  'pode ser importante': 'pink',
  'sem uso há 1 ano+': 'blue',
}

// ai = etiqueta revisada pela Linnea (mostra ✦ e o motivo ao passar o mouse)
function Label({ text, ai, reason }) {
  if (!text) return null
  return (
    <span className={`file-label ${LABEL_COLOR[text]}`} title={reason || undefined}>
      {ai && '✦ '}
      {text}
    </span>
  )
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

// onRemoved: avisa o App que arquivos foram apagados (ele refaz o scan da tela inicial)
// onAsk(texto): manda uma pergunta para a Linnea no chat
// initialPath: pasta em que o mapa começa; initialMarked: caminhos que já começam marcados (a Linnea escolhe)
// initialView / initialResults: aba que abre primeiro e os resultados da busca da Linnea
// withChat: o chat está ao lado (painel mais estreito)
export default function FolderMap({
  onRemoved,
  onAsk,
  initialPath = '',
  initialMarked = [],
  initialView = 'mapa',
  initialResults = [],
  withChat = false,
}) {
  const [view, setView] = useState(initialView)
  const [path, setPath] = useState(initialPath) // '' = as pastas pessoais
  const [reload, setReload] = useState(0) // muda para buscar de novo (depois de apagar)
  const [data, setData] = useState(null) // itens da pasta aberta no mapa
  const [lists, setLists] = useState({}) // itens de cada aba de lista: { grandes: {...}, ... }
  const [results, setResults] = useState(initialResults) // aba Busca
  const [loading, setLoading] = useState(initialView !== 'busca') // a aba Busca já chega com os resultados
  const [error, setError] = useState('')
  const [size, setSize] = useState({ w: 0, h: 0 })
  // Caminhos marcados: { caminho: true }. Guardar só o caminho deixa marcar antes de a lista terminar de carregar.
  const [selected, setSelected] = useState(() => Object.fromEntries(initialMarked.map((p) => [p, true])))
  const [confirming, setConfirming] = useState(false) // mostrando o "Mandar para a Lixeira? Sim / Cancelar"
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('') // resultado da última ida para a Lixeira
  const [preview, setPreview] = useState(null) // arquivo aberto na prévia
  const [search, setSearch] = useState('')
  const [dragging, setDragging] = useState(false) // arrastando um arquivo (mostra o alvo em cima do robô)
  const [eating, setEating] = useState(null) // { items, stage: 'confirm' | 'eating' } — o robô vai comer
  const [reviewing, setReviewing] = useState(false) // a Linnea revisando as etiquetas com IA
  const dragItems = useRef([])
  const areaRef = useRef(null)
  // Quando a Linnea abre uma pasta, o caminho aparece sendo digitado letra por letra na trilha
  const [typing, setTyping] = useState(initialPath ? '' : null)

  const isList = view !== 'mapa'

  useEffect(() => {
    if (!initialPath) return
    const step = Math.max(12, 900 / initialPath.length) // o caminho inteiro em uns 0,9 s
    let count = 0
    const timer = setInterval(() => {
      count += 1
      setTyping(initialPath.slice(0, count))
      if (count >= initialPath.length) {
        clearInterval(timer)
        setTimeout(() => setTyping(null), 450) // deixa o caminho completo um instante na tela
      }
    }, step)
    return () => clearInterval(timer)
  }, [initialPath])
  // No mapa, as pastas pessoais em si (Downloads, Documentos...) nunca vão para a Lixeira
  const canMark = isList || path !== ''

  // Mapa: busca os itens da pasta sempre que o caminho muda (ou quando pedimos para recarregar)
  useEffect(() => {
    if (view !== 'mapa') return
    let current = true // se o usuário trocar de pasta antes de terminar, ignora a resposta velha
    getFolderMap(path)
      .then((result) => current && setData(result))
      .catch((err) => current && setError(err.message))
      .finally(() => current && setLoading(false))
    return () => {
      current = false
    }
  }, [view, path, reload])

  // Abas de lista: busca a lista da aba aberta
  useEffect(() => {
    if (view === 'mapa' || view === 'busca') return
    let current = true
    getFileList(view)
      .then((result) => current && setLists((prev) => ({ ...prev, [view]: result })))
      .catch((err) => current && setError(err.message))
      .finally(() => current && setLoading(false))
    return () => {
      current = false
    }
  }, [view, reload])

  // Mede a área do mapa (e mede de novo se a janela mudar de tamanho)
  useEffect(() => {
    if (!areaRef.current) return
    const observer = new ResizeObserver(([entry]) => {
      setSize({ w: entry.contentRect.width, h: entry.contentRect.height })
    })
    observer.observe(areaRef.current)
    return () => observer.disconnect()
  }, [view])

  function clearSelection() {
    setSelected({})
    setConfirming(false)
    setMessage('')
    setPreview(null)
  }

  function switchView(id) {
    if (id === view) return
    setLoading(id !== 'busca' && !(id === 'mapa' && data))
    setError('')
    clearSelection()
    setView(id)
  }

  // Abre uma pasta no mapa ('' = volta para as pastas pessoais). As marcações são só da pasta aberta.
  function open(newPath) {
    if (newPath === path) return
    setLoading(true)
    setError('')
    clearSelection()
    setPath(newPath)
  }

  function toggle(item) {
    if (!canMark || item.tipo === 'outros') return
    setSelected((prev) => {
      const next = { ...prev }
      if (next[item.caminho]) delete next[item.caminho]
      else next[item.caminho] = true
      return next
    })
    setConfirming(false)
    setMessage('')
  }

  function handleTileClick(event, tile) {
    if (tile.tipo === 'pasta' && !event.ctrlKey && !event.metaKey) open(tile.caminho)
    else toggle(tile)
  }

  function handleRightClick(event, item) {
    event.preventDefault() // não abre o menu do navegador
    toggle(item)
  }

  // Manda para a Lixeira e atualiza a tela. Devolve true se algo foi movido.
  async function trash(paths) {
    const result = await moveToTrash(paths)
    let text = `✓ ${plural(result.movidos.length, 'item foi', 'itens foram')} para a Lixeira · ${formatSize(result.liberado_mb)} liberados`
    if (result.recusados.length) text += ` · ${plural(result.recusados.length, 'não pôde', 'não puderam')} ser movido(s)`
    setMessage(text)
    setSelected({})
    setPreview(null)
    // Busca: não dá para refazer a busca, então tira da lista o que foi movido
    const refused = (p) => result.recusados.some((r) => r.startsWith(p))
    setResults((prev) => prev.filter((item) => !paths.includes(item.caminho) || refused(item.caminho)))
    if (view !== 'busca') {
      setLoading(true)
      setReload((n) => n + 1)
    }
    if (result.movidos.length) onRemoved?.()
    return result.movidos.length > 0
  }

  async function sendToTrash(event) {
    flyToTrash(marked.map((item) => item.caminho), event.currentTarget)
    setBusy(true)
    try {
      await trash(marked.map((item) => item.caminho))
    } catch (err) {
      setMessage(err.message)
    } finally {
      setBusy(false)
      setConfirming(false)
    }
  }

  // Monta a pergunta com nome, tipo, tamanho e caminho (o caminho deixa a Linnea olhar a pasta ou apagar, se pedirem)
  function askLinnea() {
    const list = marked
      .map((item) => `"${item.nome}" (${item.tipo}, ${formatSize(item.tamanho_mb)}, em ${item.caminho})`)
      .join('; ')
    const many = marked.length > 1
    onAsk(`O que ${many ? 'são estes itens' : 'é'}: ${list}? Posso apagar com segurança?`)
  }

  // Busca em linguagem natural: quem transforma o pedido em filtros é a Linnea (ferramenta buscar_arquivos)
  function handleSearch(event) {
    event.preventDefault()
    const text = search.trim()
    if (!text) return
    onAsk(`Busque nos meus arquivos: ${text}`)
    setSearch('')
  }

  // Etiquetas revisadas pela IA: a Linnea olha os arquivos da lista e escolhe a etiqueta de cada um (1 chamada à IA)
  async function reviewWithAi() {
    setReviewing(true)
    try {
      const answer = await reviewLabels(items.slice(0, 50))
      const byPath = Object.fromEntries(answer.map((a) => [a.caminho, a]))
      const update = (list) =>
        list.map((item) => (byPath[item.caminho] ? { ...item, etiqueta: byPath[item.caminho].etiqueta, motivo: byPath[item.caminho].motivo, revisado: true } : item))
      if (view === 'busca') setResults(update)
      else setLists((prev) => ({ ...prev, [view]: { ...prev[view], itens: update(prev[view].itens) } }))
      setMessage(`✓ A Linnea revisou ${answer.length} etiqueta(s). Passe o mouse numa etiqueta ✦ para ver o motivo.`)
    } catch (err) {
      setMessage(err.message)
    } finally {
      setReviewing(false)
    }
  }

  // ---- Arrastar até o robô ----
  function handleDragStart(event, item) {
    if (!canMark || item.tipo === 'outros') return event.preventDefault()
    // Arrastando um item marcado: leva todos os marcados juntos
    dragItems.current = selected[item.caminho] ? marked : [item]
    event.dataTransfer.setData('text/plain', item.caminho)
    event.dataTransfer.effectAllowed = 'move'
    setDragging(true)
  }

  function handleDrop(event) {
    event.preventDefault()
    setDragging(false)
    if (dragItems.current.length) setEating({ items: dragItems.current, stage: 'confirm' })
  }

  async function feedRobot() {
    const items = eating.items
    setEating({ items, stage: 'eating' }) // animação do arquivo "entrando" no robô
    try {
      await Promise.all([trash(items.map((item) => item.caminho)), new Promise((r) => setTimeout(r, 900))])
    } catch (err) {
      setMessage(err.message)
    } finally {
      setEating(null)
    }
  }

  // Itens da aba aberta
  const listData = view === 'busca' ? { itens: results } : lists[view]
  const viewItems = (isList ? listData?.itens : data?.itens) || []
  // No mapa, item de 0 MB não vira quadradinho; na lista ele aparece normalmente
  const items = isList ? viewItems : viewItems.filter((item) => item.tamanho_mb > 0)
  const tiles = view === 'mapa' ? squarify(items.map((item) => ({ ...item, value: item.tamanho_mb })), size.w, size.h) : []
  const totalMb = items.reduce((sum, item) => sum + item.tamanho_mb, 0)
  // Itens marcados que estão na aba aberta (só eles vão para a Lixeira ou para a pergunta)
  const marked = viewItems.filter((item) => selected[item.caminho])
  const markedMb = marked.reduce((sum, item) => sum + item.tamanho_mb, 0)
  const onlyFile = marked.length === 1 && PREVIEWABLE.test(marked[0].nome) ? marked[0] : null
  const tabs = view === 'busca' || results.length ? [...TABS, { id: 'busca', label: `Busca (${results.length})` }] : TABS

  return (
    <section className={`folder-map glass ${withChat ? 'with-chat' : ''}`}>
      <div className="map-tabs" role="tablist" aria-label="Visões dos arquivos">
        {tabs.map((tab) => (
          <button key={tab.id} role="tab" aria-selected={view === tab.id} onClick={() => switchView(tab.id)}>
            {tab.label}
          </button>
        ))}
      </div>

      <form className="map-search" onSubmit={handleSearch}>
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder='Peça à Linnea: "vídeos do ano passado maiores que 1 GB"'
          aria-label="Buscar arquivos com a Linnea"
        />
        <button type="submit" className="map-btn ask" disabled={!search.trim()}>
          ✦ Buscar
        </button>
      </form>

      <header className="map-header">
        {typing !== null ? (
          <span className="map-typing" aria-label={`Abrindo ${initialPath}`}>
            {typing}
            <span className="typing-caret" />
          </span>
        ) : view === 'mapa' ? (
          <nav className="map-trail" aria-label="Pastas">
            <button onClick={() => open('')}>Pastas pessoais</button>
            {data?.trilha.map((step) => (
              <Fragment key={step.caminho}>
                <span className="map-sep">›</span>
                <button onClick={() => open(step.caminho)}>{step.nome}</button>
              </Fragment>
            ))}
          </nav>
        ) : (
          <span className="map-hint">
            {HINTS[view]}
            <button className="map-btn ask review-btn" onClick={reviewWithAi} disabled={reviewing || loading || items.length === 0}>
              {reviewing ? 'Revisando…' : '✦ Revisar etiquetas com a Linnea'}
            </button>
          </span>
        )}
        <span className="map-total">{formatSize(totalMb)}</span>
      </header>

      {/* map-body: a prévia fica por cima da área (fora dela, para não rolar junto com a lista) */}
      <div className="map-body">
        <div className={`map-area ${loading ? 'loading' : ''} ${isList ? 'list' : ''}`} ref={view === 'mapa' ? areaRef : null}>
          {view === 'mapa' &&
            tiles.map((tile) => {
              const isFolder = tile.tipo === 'pasta'
              const isSelected = Boolean(selected[tile.caminho])
              const Tag = tile.tipo === 'outros' ? 'div' : 'button'
              const showLabel = tile.w > 70 && tile.h > 40
              const hint = isFolder ? ' · clique para abrir' : canMark && tile.tipo !== 'outros' ? ` · clique para ${isSelected ? 'desmarcar' : 'marcar'}` : ''
              return (
                <Tag
                  key={tile.caminho ?? tile.nome}
                  data-path={tile.caminho}
                  className={`tile ${tileColor(tile)} ${Tag === 'button' ? 'clickable' : ''} ${showLabel ? '' : 'small'} ${isSelected ? 'selected' : ''}`}
                  style={{ left: tile.x + GAP / 2, top: tile.y + GAP / 2, width: tile.w - GAP, height: tile.h - GAP }}
                  onClick={Tag === 'button' ? (event) => handleTileClick(event, tile) : undefined}
                  onContextMenu={Tag === 'button' ? (event) => handleRightClick(event, tile) : undefined}
                  draggable={canMark && Tag === 'button'}
                  onDragStart={(event) => handleDragStart(event, tile)}
                  onDragEnd={() => setDragging(false)}
                  title={`${tile.nome} · ${formatSize(tile.tamanho_mb)}${tile.etiqueta ? ` · ${tile.etiqueta}` : ''}${hint}`}
                  aria-pressed={canMark && Tag === 'button' ? isSelected : undefined}
                >
                  {isSelected && showLabel && <span className="tile-check">✓</span>}
                  {showLabel && (
                    <>
                      {tile.etiqueta && tile.h > 64 && <Label text={tile.etiqueta} />}
                      <span className="tile-name">
                        {isFolder && <FolderIcon size={12} />}
                        {tile.nome}
                      </span>
                      <span className="tile-size">{formatSize(tile.tamanho_mb)}</span>
                    </>
                  )}
                </Tag>
              )
            })}

          {isList &&
            items.map((item) => {
              const isSelected = Boolean(selected[item.caminho])
              return (
                <div
                  key={item.caminho}
                  data-path={item.caminho}
                  className={`file-row ${isSelected ? 'selected' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={isSelected}
                  onClick={() => toggle(item)}
                  onKeyDown={(event) => (event.key === 'Enter' || event.key === ' ') && (event.preventDefault(), toggle(item))}
                  onContextMenu={(event) => handleRightClick(event, item)}
                  draggable
                  onDragStart={(event) => handleDragStart(event, item)}
                  onDragEnd={() => setDragging(false)}
                  title={`${item.caminho}${isSelected ? ' · clique para desmarcar' : ' · clique para marcar'}`}
                >
                  <span className={`row-check ${tileColor(item)}`}>{isSelected ? '✓' : ''}</span>
                  <span className="row-name">
                    <span className="row-title">{item.nome}</span>
                    <Label text={item.etiqueta} ai={item.revisado} reason={item.motivo} />
                  </span>
                  <span className="row-size">{formatSize(item.tamanho_mb)}</span>
                  <span className="row-date">{formatDate(item.modificado)}</span>
                  {PREVIEWABLE.test(item.nome) ? (
                    <button
                      className="row-preview"
                      onClick={(event) => {
                        event.stopPropagation() // olhar não marca o arquivo
                        setPreview(item)
                      }}
                      aria-label={`Ver prévia de ${item.nome}`}
                      title="Ver prévia"
                    >
                      👁
                    </button>
                  ) : (
                    <span className="row-preview" />
                  )}
                </div>
              )
            })}

          {loading && <p className="map-status">{isList ? 'Procurando os arquivos…' : 'Medindo as pastas…'}</p>}
          {!loading && error && <p className="map-status">{error}</p>}
          {!loading && !error && items.length === 0 && (
            <p className="map-status">{isList ? 'Nenhum arquivo aqui.' : 'Esta pasta está vazia.'}</p>
          )}
        </div>

        {/* Prévia do arquivo, por cima da lista/mapa */}
        {preview && (
          <div className="file-preview">
            <header>
              <div>
                <strong>{preview.nome}</strong>
                <span>
                  {preview.tipo} · {formatSize(preview.tamanho_mb)} <Label text={preview.etiqueta} />
                </span>
              </div>
              <button className="map-btn" onClick={() => toggle(preview)}>
                {selected[preview.caminho] ? 'Desmarcar' : 'Marcar'}
              </button>
              <button className="map-btn" onClick={() => setPreview(null)} aria-label="Fechar prévia">
                ✕
              </button>
            </header>
            <PreviewBody item={preview} />
          </div>
        )}
      </div>

      <footer className="map-footer">
        {marked.length > 0 ? (
          <div className="map-selection">
            <span>
              <strong>{plural(marked.length, 'item marcado', 'itens marcados')}</strong> · {formatSize(markedMb)}
            </span>
            {confirming ? (
              <>
                <span className="map-confirm">Mandar para a Lixeira? Dá para restaurar depois.</span>
                <button className="map-btn danger" onClick={(event) => sendToTrash(event)} disabled={busy}>
                  {busy ? 'Movendo…' : 'Sim, mandar'}
                </button>
                <button className="map-btn" onClick={() => setConfirming(false)} disabled={busy}>
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <button className="map-btn" onClick={() => setSelected({})}>
                  Desmarcar
                </button>
                {onlyFile && (
                  <button className="map-btn" onClick={() => setPreview(onlyFile)}>
                    👁 Ver
                  </button>
                )}
                <button className="map-btn ask" onClick={askLinnea}>
                  ✦ Perguntar à Linnea
                </button>
                <button className="map-btn danger" onClick={() => setConfirming(true)}>
                  🗑 Mandar para a Lixeira
                </button>
              </>
            )}
          </div>
        ) : (
          <>
            <span className={message ? 'map-message' : ''}>
              {message ||
                (view === 'mapa' && !canMark
                  ? 'Clique numa pasta para entrar nela'
                  : 'Clique para marcar · arraste um arquivo até o robô para ele "comer"')}
            </span>
            {(isList ? listData?.parcial : data?.parcial) && <span>Busca incompleta: tem arquivo demais</span>}
          </>
        )}
      </footer>

      {/* Alvo em cima do robô (aparece só enquanto arrasta) e a confirmação de "comer".
          Vai direto no body: dentro do painel de vidro, o position: fixed ficaria preso ao painel. */}
      {(dragging || eating) &&
        createPortal(
          <div
            className={`robot-drop ${dragging ? 'dragging' : ''}`}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
          >
            {dragging && <div className="drop-ring">Solte aqui para a Linnea comer 😋</div>}
            {eating?.stage === 'confirm' && (
              <div className="drop-confirm glass">
                <strong>Mandar {eating.items.length === 1 ? `"${eating.items[0].nome}"` : plural(eating.items.length, 'item', 'itens')} para a Lixeira?</strong>
                <span>{formatSize(eating.items.reduce((sum, item) => sum + item.tamanho_mb, 0))} · dá para restaurar depois</span>
                <div>
                  <button className="map-btn" onClick={() => setEating(null)}>
                    Não
                  </button>
                  <button className="map-btn danger" onClick={feedRobot}>
                    Sim, pode comer
                  </button>
                </div>
              </div>
            )}
            {eating?.stage === 'eating' && (
              <div className="drop-eaten">{eating.items.length === 1 ? eating.items[0].nome : plural(eating.items.length, 'item', 'itens')}</div>
            )}
          </div>,
          document.body,
        )}
    </section>
  )
}

// Conteúdo da prévia conforme o tipo do arquivo
function PreviewBody({ item }) {
  const src = previewUrl(item.caminho)
  const ext = item.nome.split('.').pop().toLowerCase()
  if (['mp4', 'webm', 'mov'].includes(ext)) return <video className="preview-media" src={src} controls />
  if (['mp3', 'wav', 'm4a', 'ogg'].includes(ext)) return <audio className="preview-audio" src={src} controls />
  if (['pdf', 'txt'].includes(ext)) return <iframe className="preview-media" src={src} title={`Prévia de ${item.nome}`} />
  return <img className="preview-media" src={src} alt={item.nome} />
}

// Animação: cada item marcado encolhe e "voa" até o botão da Lixeira (uma cópia voa; o original some quando a lista recarrega)
function flyToTrash(paths, target) {
  if (!target || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const to = target.getBoundingClientRect()
  document.querySelectorAll('[data-path]').forEach((node) => {
    if (!paths.includes(node.dataset.path)) return
    const from = node.getBoundingClientRect()
    if (!from.width) return
    const ghost = node.cloneNode(true)
    Object.assign(ghost.style, {
      position: 'fixed',
      left: `${from.left}px`,
      top: `${from.top}px`,
      width: `${from.width}px`,
      height: `${from.height}px`,
      margin: '0',
      zIndex: '40',
      pointerEvents: 'none',
    })
    document.body.appendChild(ghost)
    const dx = to.left + to.width / 2 - (from.left + from.width / 2)
    const dy = to.top + to.height / 2 - (from.top + from.height / 2)
    ghost
      .animate(
        [
          { transform: 'translate(0, 0) scale(1)', opacity: 1 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.05) rotate(10deg)`, opacity: 0.3 },
        ],
        { duration: 650, easing: 'cubic-bezier(0.5, 0, 0.75, 0)' },
      )
      .finished.then(() => ghost.remove())
  })
}
