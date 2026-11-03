// Cursor da Linnea: antes de cada ação dela na tela, um cursor sai do chat, voa até o alvo, "clica"
// e só então a ação acontece. As ações entram numa fila e rodam uma de cada vez, na ordem em que chegaram.
// O movimento é feito direto no elemento (sem estado do React): é só uma camada de animação por cima do app.

const MOVE_MS = 750 // tempo do voo até o alvo (igual ao transition do CSS)
const CLICK_MS = 280
const HIDE_AFTER_MS = 2200 // some sozinho depois de um tempo parado

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

let cursor = null
let queue = Promise.resolve()
let hideTimer = null

export function setCursorElement(node) {
  cursor = node
}

// Centro do elemento na tela (null se não existe ou está escondido)
function centerOf(selector) {
  const node = selector && document.querySelector(selector)
  const box = node?.getBoundingClientRect()
  if (!box || !box.width || !box.height) return null
  return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
}

// Espera o alvo aparecer (ex.: o quadradinho marcado só existe depois que o mapa carrega)
async function waitFor(selector, timeoutMs) {
  const end = Date.now() + timeoutMs
  for (;;) {
    const point = centerOf(selector)
    if (point || Date.now() >= end) return point
    await sleep(100)
  }
}

function place(point, animate) {
  cursor.style.transition = animate ? '' : 'none'
  cursor.style.transform = `translate(${point.x}px, ${point.y}px)`
  if (!animate) void cursor.offsetWidth // força o navegador a aplicar a posição antes de religar a animação
}

async function flyAndClick(selector, waitMs) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (!cursor || reduceMotion) return
  const target = await waitFor(selector, waitMs)
  if (!target) return
  clearTimeout(hideTimer)
  if (!cursor.classList.contains('visible')) {
    // Aparece saindo do avatar da Linnea no chat (ou do canto esquerdo, se o chat não estiver na tela)
    const avatars = document.querySelectorAll('.agent-avatar')
    const box = avatars[avatars.length - 1]?.getBoundingClientRect()
    place(box?.width ? { x: box.left + box.width / 2, y: box.top + box.height / 2 } : { x: 40, y: window.innerHeight / 2 }, false)
    cursor.classList.add('visible')
  }
  place(target, true)
  await sleep(MOVE_MS)
  cursor.classList.add('clicking')
  await sleep(CLICK_MS)
  cursor.classList.remove('clicking')
}

// Põe uma ação na fila. selector = onde o cursor clica antes (null = roda direto, só respeitando a ordem).
// waitMs = quanto tempo esperar o alvo aparecer na tela.
export function linneaDo(selector, action = () => {}, waitMs = 0) {
  queue = queue.then(async () => {
    try {
      if (selector) await flyAndClick(selector, waitMs)
    } finally {
      action() // a ação sempre acontece, mesmo se o alvo não estiver na tela
      clearTimeout(hideTimer)
      hideTimer = setTimeout(() => cursor?.classList.remove('visible'), HIDE_AFTER_MS)
    }
  })
  return queue
}
