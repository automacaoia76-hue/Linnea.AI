// Funções que conversam com o backend (FastAPI). Os componentes usam só isto, sem fetch direto.

// ---------- Login (só na Linnea na nuvem; no PC o app não pede login) ----------
const LOGIN_KEY = 'linnea-login' // { token, renovar } guardados neste navegador

function savedLogin() {
  try {
    return JSON.parse(localStorage.getItem(LOGIN_KEY)) || null
  } catch {
    return null
  }
}

function saveLogin(tokens) {
  try {
    if (tokens) localStorage.setItem(LOGIN_KEY, JSON.stringify(tokens))
    else localStorage.removeItem(LOGIN_KEY)
  } catch {
    // sem acesso ao armazenamento: o login vale só até fechar a página
  }
}

export const loginToken = () => savedLogin()?.token || ''

// O token vence em ~1 hora: pede um novo com o código de renovação, sem você digitar a senha
async function renewLogin() {
  const code = savedLogin()?.renovar
  if (!code) return false
  const response = await fetch('/api/login/renovar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ renovar: code }),
  }).catch(() => null)
  if (!response?.ok) {
    saveLogin(null)
    return false
  }
  saveLogin(await response.json())
  return true
}

// fetch com o token do login. Se o servidor recusar (401), renova uma vez; se não der, avisa o app para pedir login
async function apiFetch(url, options = {}) {
  const send = () =>
    fetch(url, { ...options, headers: { ...options.headers, ...(loginToken() && { Authorization: `Bearer ${loginToken()}` }) } })
  let response = await send()
  if (response.status === 401 && (await renewLogin())) response = await send()
  if (response.status === 401) window.dispatchEvent(new Event('linnea-login'))
  return response
}

// Entra com e-mail e senha (a conta do Supabase). Lança um erro com a mensagem se não der.
export async function login(email, senha) {
  let response
  try {
    response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha }),
    })
  } catch {
    throw new Error('Não consegui falar com o servidor. Tente de novo.')
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.detail || 'Não deu para entrar.')
  saveLogin(data)
}

export const logout = () => saveLogin(null)

// Informações do servidor: { nuvem, retrato_de } (nuvem = true na Linnea online, que pede login)
export async function getServerInfo() {
  const response = await fetch('/api/health')
  return response.json()
}

// Manda uma mensagem para a Linnea e devolve { reply, tools_used, model, steps }.
// thread_id identifica a conversa: é por ele que o agente lembra do que já foi dito.
export async function sendMessage(message, threadId) {
  let response
  try {
    response = await apiFetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, thread_id: threadId }),
    })
  } catch {
    throw new Error('Não consegui falar com o servidor. Ele está ligado?')
  }

  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.detail || 'Algo deu errado. Tente de novo.')
  return data
}

// Lê uma resposta "ao vivo" (SSE) do backend e chama uma função para cada evento:
// onToken(texto), onStep({ kind, text }), onSwitch(modelo), onUi(ação na tela),
// onApproval({ acoes }) — a Linnea pausou pedindo permissão —, onDone({ model, tools_used }).
// Se der erro, lança uma exceção com uma mensagem amigável.
async function readAgentStream(url, body, handlers) {
  let response
  try {
    response = await apiFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error('Não consegui falar com o servidor. Ele está ligado?')
  }
  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.detail || 'Algo deu errado. Tente de novo.')
  }

  // Lê o fluxo conforme ele chega. Cada evento SSE vem assim: "event: nome\ndata: {...}\n\n"
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader()
  let buffer = ''
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += value
    const events = buffer.split('\n\n')
    buffer = events.pop() // o último pode estar pela metade: espera o resto chegar
    for (const raw of events) {
      const name = raw.match(/^event: (.*)$/m)?.[1]
      const data = JSON.parse(raw.match(/^data: (.*)$/m)?.[1] || '{}')
      if (name === 'token') handlers.onToken(data.text)
      else if (name === 'step') handlers.onStep(data)
      else if (name === 'switch') handlers.onSwitch(data.model)
      else if (name === 'ui') handlers.onUi(data)
      else if (name === 'approval') handlers.onApproval(data)
      else if (name === 'done') handlers.onDone(data)
      else if (name === 'error') throw new Error(data.detail)
    }
  }
}

// Manda uma mensagem nova para a Linnea (resposta ao vivo)
export function streamMessage(message, threadId, handlers) {
  return readAgentStream('/api/chat/stream', { message, thread_id: threadId }, handlers)
}

// Responde a um pedido de permissão (approve = true: Aprovar; false: Recusar) e continua a resposta ao vivo
export function resumeAgent(threadId, approve, handlers) {
  return readAgentStream('/api/chat/resume', { thread_id: threadId, approve }, handlers)
}

// Tela Arquivos: tamanho de cada item de uma pasta pessoal (sem caminho = as pastas pessoais)
export async function getFolderMap(path = '') {
  let response
  try {
    response = await apiFetch(`/api/pastas?caminho=${encodeURIComponent(path)}`)
  } catch {
    throw new Error('Não consegui falar com o servidor. Ele está ligado?')
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.detail || 'Não consegui abrir essa pasta.')
  return data
}

// Tela Configurações: opções que o backend usa ({ arquivo_grande_mb })
export async function getSettings() {
  let response
  try {
    response = await apiFetch('/api/config')
  } catch {
    throw new Error('Não consegui falar com o servidor. Ele está ligado?')
  }
  if (!response.ok) throw new Error('Não consegui carregar as configurações.')
  return response.json()
}

export async function saveSettings(settings) {
  let response
  try {
    response = await apiFetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    })
  } catch {
    throw new Error('Não consegui falar com o servidor. Ele está ligado?')
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(typeof data.detail === 'string' ? data.detail : 'Não consegui salvar.')
  return data
}

// Busca simples de JSON (usada pelas funções da tela Gráficos)
async function getJson(url, errorText, options) {
  let response
  try {
    response = await apiFetch(url, options)
  } catch {
    throw new Error('Não consegui falar com o servidor. Ele está ligado?')
  }
  if (!response.ok) throw new Error(errorText)
  return response.json()
}

// Tela Gráficos: do que o disco é feito / limpezas registradas / relatório do mês (1 chamada à IA)
export const getComposition = () => getJson('/api/composicao', 'Não consegui medir o disco.')
export const getCleanups = () => getJson('/api/limpezas', 'Não consegui carregar as limpezas.')
export const getMemory = () => getJson('/api/memoria', 'Não consegui ler a memória.')
export const getPcHealth = () => getJson('/api/saude', 'Não consegui ler o PC.')
// Tela Arquivos: a Linnea revisa as etiquetas dos arquivos com IA (1 chamada ao modelo)
export const reviewLabels = (items) =>
  getJson('/api/etiquetas-ia', 'A Linnea não conseguiu revisar agora.', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ itens: items }),
  })
export const getReport = () => getJson('/api/relatorio', 'Não consegui montar o relatório.', { method: 'POST' })

// Tela Gráficos: um resumo do disco por dia, do mais antigo para o mais novo
export async function getHistory() {
  let response
  try {
    response = await apiFetch('/api/historico')
  } catch {
    throw new Error('Não consegui falar com o servidor. Ele está ligado?')
  }
  if (!response.ok) throw new Error('Não consegui carregar o histórico.')
  return response.json()
}

// Tela Arquivos: abas Grandes, Antigos, Downloads e Duplicados. Devolve { filtro, itens, parcial }
export async function getFileList(filter) {
  let response
  try {
    response = await apiFetch(`/api/arquivos?filtro=${encodeURIComponent(filter)}`)
  } catch {
    throw new Error('Não consegui falar com o servidor. Ele está ligado?')
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.detail || 'Não consegui carregar a lista.')
  return data
}

// Endereço da prévia de um arquivo (o backend só entrega arquivos das pastas pessoais)
export const previewUrl = (path) => `/api/arquivo?caminho=${encodeURIComponent(path)}`

// Tela Arquivos: manda os itens marcados para a Lixeira. Devolve { movidos, recusados, liberado_mb }
export async function moveToTrash(paths) {
  let response
  try {
    response = await apiFetch('/api/lixeira', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ caminhos: paths }),
    })
  } catch {
    throw new Error('Não consegui falar com o servidor. Ele está ligado?')
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.detail || 'Não consegui mandar para a Lixeira.')
  return data
}

// Botão "Start scan": o backend analisa os arquivos, salva o resultado em JSON e devolve aqui
export async function runScan() {
  let response
  try {
    response = await apiFetch('/api/scan', { method: 'POST' })
  } catch {
    throw new Error('Não consegui falar com o servidor. Ele está ligado?')
  }
  if (!response.ok) throw new Error('O scan falhou. Tente de novo.')
  return response.json()
}
