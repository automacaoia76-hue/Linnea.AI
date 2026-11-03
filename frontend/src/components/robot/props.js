import * as THREE from 'three'

// Acessórios em volta do robô: anéis de órbita, cartões de arquivo holográficos e faíscas.

// Anel fino e inclinado dentro de um "suporte" que gira em volta do robô (faz o anel "bambolear")
export function createOrbitRing(radius, color, tiltX, tiltZ) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(radius, 0.008, 8, 200),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false })
  )
  ring.rotation.set(Math.PI / 2 + tiltX, 0, tiltZ)
  const holder = new THREE.Group()
  holder.add(ring)
  return holder
}

// Desenha um cartão holográfico (pasta, imagem ou gráfico) num canvas 2D
function drawCard(type) {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 200
  const ctx = canvas.getContext('2d')

  // Moldura de vidro com borda brilhante
  ctx.shadowColor = 'rgba(120, 220, 255, 0.9)'
  ctx.shadowBlur = 16
  ctx.fillStyle = 'rgba(210, 235, 255, 0.28)'
  ctx.strokeStyle = 'rgba(150, 230, 255, 0.95)'
  ctx.lineWidth = 4
  ctx.beginPath()
  ctx.roundRect(14, 14, 228, 172, 18)
  ctx.fill()
  ctx.stroke()
  ctx.shadowBlur = 8

  if (type === 'folder') {
    // Pasta rosa com a lista de arquivos ao lado
    ctx.fillStyle = 'rgba(255, 140, 200, 0.95)'
    ctx.beginPath()
    ctx.roundRect(40, 62, 90, 70, 8)
    ctx.fill()
    ctx.fillRect(40, 52, 40, 16)
    ctx.fillStyle = 'rgba(200, 240, 255, 0.95)'
    for (let i = 0; i < 4; i++) ctx.fillRect(146, 66 + i * 18, i % 2 ? 50 : 70, 7)
  } else if (type === 'image') {
    ctx.strokeStyle = 'rgba(160, 240, 255, 0.95)'
    ctx.lineWidth = 6
    ctx.strokeRect(64, 46, 128, 108)
    ctx.fillStyle = 'rgba(160, 240, 255, 0.95)'
    ctx.beginPath()
    ctx.moveTo(72, 146)
    ctx.lineTo(110, 98)
    ctx.lineTo(136, 126)
    ctx.lineTo(154, 108)
    ctx.lineTo(184, 146)
    ctx.fill()
    ctx.beginPath()
    ctx.arc(162, 76, 11, 0, Math.PI * 2)
    ctx.fill()
  } else if (type === 'chart') {
    const heights = [30, 52, 44, 74, 96]
    heights.forEach((h, i) => {
      ctx.fillStyle = i < 3 ? 'rgba(255, 150, 210, 0.95)' : 'rgba(190, 140, 255, 0.95)'
      ctx.fillRect(62 + i * 28, 154 - h, 18, h)
    })
  } else if (type === 'doc') {
    // Documento: folha com a ponta dobrada e linhas de texto
    ctx.fillStyle = 'rgba(200, 240, 255, 0.95)'
    ctx.beginPath()
    ctx.moveTo(84, 40)
    ctx.lineTo(150, 40)
    ctx.lineTo(176, 66)
    ctx.lineTo(176, 160)
    ctx.lineTo(84, 160)
    ctx.fill()
    ctx.fillStyle = 'rgba(120, 150, 255, 0.95)'
    for (let i = 0; i < 4; i++) ctx.fillRect(98, 82 + i * 18, i === 3 ? 40 : 62, 6)
  } else {
    // Vídeo: tela com botão de play
    ctx.strokeStyle = 'rgba(255, 150, 210, 0.95)'
    ctx.lineWidth = 6
    ctx.beginPath()
    ctx.roundRect(58, 50, 140, 100, 12)
    ctx.stroke()
    ctx.fillStyle = 'rgba(255, 170, 220, 0.95)'
    ctx.beginPath()
    ctx.moveTo(116, 78)
    ctx.lineTo(146, 100)
    ctx.lineTo(116, 122)
    ctx.fill()
  }

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

// Carrossel de arquivos: cartões num anel que gira acima da palma (o grupo segue a mão a cada quadro)
const CAROUSEL_TYPES = ['folder', 'image', 'chart', 'doc', 'video']
export const CAROUSEL_RADIUS = 0.45

export function createFileCarousel() {
  const group = new THREE.Group()
  CAROUSEL_TYPES.forEach((type) => {
    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(0.42, 0.42 * (200 / 256)),
      new THREE.MeshBasicMaterial({ map: drawCard(type), transparent: true, depthWrite: false, side: THREE.DoubleSide })
    )
    group.add(card)
  })
  return group
}

// Posiciona os cartões no anel. "turn" é quantos cartões o anel já girou (pode ser fracionário).
// O cartão da frente (virado para a câmera) fica maior e aceso; os de trás, menores e apagados.
export function updateFileCarousel(group, turn, time) {
  const step = (Math.PI * 2) / group.children.length
  group.children.forEach((card, i) => {
    const angle = (i - turn) * step
    const front = (Math.cos(angle) + 1) / 2 // 1 = na frente, 0 = atrás
    card.position.set(Math.sin(angle) * CAROUSEL_RADIUS, Math.sin(time * 1.5 + i) * 0.03, Math.cos(angle) * CAROUSEL_RADIUS * 0.6)
    card.rotation.y = angle * 0.5 // cada cartão vira um pouco acompanhando o anel
    card.scale.setScalar(0.7 + 0.35 * front)
    card.material.opacity = 0.2 + 0.8 * front
  })
}

// Anel de "carregando" que aparece sobre o arquivo clicado (gira no loop do robô)
export function createLoader() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createLinearGradient(0, 0, 128, 128)
  gradient.addColorStop(0, 'rgba(110, 230, 255, 1)')
  gradient.addColorStop(1, 'rgba(255, 110, 210, 1)')
  ctx.shadowColor = 'rgba(120, 220, 255, 0.9)'
  ctx.shadowBlur = 10
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)' // trilho apagado
  ctx.lineWidth = 12
  ctx.beginPath()
  ctx.arc(64, 64, 44, 0, Math.PI * 2)
  ctx.stroke()
  ctx.strokeStyle = gradient // arco colorido (3/4 de volta)
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(64, 64, 44, 0, Math.PI * 1.5)
  ctx.stroke()

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  const loader = new THREE.Mesh(
    new THREE.PlaneGeometry(0.2, 0.2),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false })
  )
  loader.renderOrder = 10 // sempre por cima do cartão
  loader.visible = false
  return loader
}

// Brilho que sai da palma, como um projetor de holograma (rosa no centro, ciano nas bordas)
export function createPalmGlow() {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 128
  const ctx = canvas.getContext('2d')
  const glow = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
  glow.addColorStop(0, 'rgba(255, 170, 230, 0.95)')
  glow.addColorStop(0.35, 'rgba(240, 110, 220, 0.5)')
  glow.addColorStop(0.7, 'rgba(110, 200, 255, 0.18)')
  glow.addColorStop(1, 'rgba(110, 200, 255, 0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, 128, 128)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }))
}

// Faíscas: pontinhos de luz espalhados em volta do robô
export function createSparkles(count = 70) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const ctx = canvas.getContext('2d')
  const glow = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  glow.addColorStop(0, 'rgba(255,255,255,1)')
  glow.addColorStop(0.3, 'rgba(180,230,255,0.8)')
  glow.addColorStop(1, 'rgba(180,230,255,0)')
  ctx.fillStyle = glow
  ctx.fillRect(0, 0, 64, 64)

  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 3.2
    positions[i * 3 + 1] = 2.4 + Math.random() * 3
    positions[i * 3 + 2] = (Math.random() - 0.5) * 2
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({ size: 0.07, map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false })
  )
}

// Libera da memória da placa de vídeo tudo que foi criado aqui
export function disposeObject(object) {
  object.traverse((o) => {
    o.geometry?.dispose()
    o.material?.map?.dispose()
    o.material?.dispose()
  })
}
