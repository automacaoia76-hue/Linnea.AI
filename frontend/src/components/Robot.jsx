import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { createHologramMaterial } from './robot/hologramMaterial.js'
import { aimBoneLocal, bindLocalDir, twistToward, lookAtPoint, reachTo } from './robot/pose.js'
import { createRetargeter } from './robot/retarget.js'
import { curlFingers } from './robot/curlFingers.js'
import { createAuraShell, createAuraGlow, setAuraTheme, createEnergyParticles, updateEnergyParticles } from './robot/aura.js'
import { onRobotSignal } from '../robotSignals.js'
import HealthRing from './HealthRing.jsx'
import {
  createOrbitRing,
  createFileCarousel,
  updateFileCarousel,
  CAROUSEL_RADIUS,
  createLoader,
  createSparkles,
  disposeObject,
} from './robot/props.js'

// Robô holograma da Linnea (modelo do Meshy com esqueleto Mixamo).
// O corpo se mexe igual ao boneco do clarix (animação copiada osso por osso) e, por cima disso,
// a mão direita trabalha num carrossel de arquivos: vai até o arquivo, toca, espera o loading
// e passa o arquivo para o lado. Os olhos piscam de tempos em tempos.

const FRAME_VW = 0.37 // largura do "quadro" do robô (fração da tela); a área do canvas pode ser maior, à esquerda
const FACING = -0.55 // robô em três quartos, virado para a interface (esquerda)
const PROFILE = -1.5 // modo foco (saúde do PC): de perfil, com o fone esquerdo virado para a câmera
const BASE_CAMERA = new THREE.Vector3(-0.05, 3.85, 6.0)
const BASE_TARGET = new THREE.Vector3(-0.05, 3.7, 0)
const FOCUS_OFFSET = new THREE.Vector3(0.1, 0.05, 2.4) // onde a câmera fica em relação à cabeça, no modo foco
const FOCUS_SHIFT = new THREE.Vector3(-0.17, 0.15, 0) // leva a mira da cabeça para o fone (o anel fica bem em cima dele)
const HEAD_RADIUS = 0.6 // clique a menos disso do centro da cabeça conta como clique no fone/cabeça
const DOWN = new THREE.Vector3(0, -1, 0)
const CYCLE = 5 // segundos de um ciclo completo (olhar, tocar, carregar, passar)
// Centro do carrossel no referencial do robô (altura 5): à direita dele, na altura do peito, à frente
const CAROUSEL_LOCAL = new THREE.Vector3(-0.2, 3.45, 0.95)

const POINT_SECONDS = 2.6 // quanto tempo ele fica apontando para um card
const CELEBRATE_SECONDS = 1.8 // duração da comemoração
const POINT_PLANE_Z = 2.6 // plano à frente do robô onde o ponto da tela é projetado (perto da câmera = aponta mais para a frente e a mão não sai da tela)

const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2)
const clamp01 = (x) => Math.min(1, Math.max(0, x))
const progress = (p, start, end) => clamp01((p - start) / (end - start))

// Etapas do ciclo (p vai de 0 a 1):
// 0.00-0.22 mão vai até o arquivo | 0.22-0.30 toque | 0.30-0.62 loading
// 0.62-0.76 mão passa o arquivo para o lado (carrossel gira) | 0.76-1.00 mão volta a descansar
function cycleState(t) {
  const cycle = Math.floor(t / CYCLE)
  const p = (t % CYCLE) / CYCLE
  const reach = p < 0.76 ? easeInOut(progress(p, 0, 0.22)) : 1 - easeInOut(progress(p, 0.76, 1))
  const tap = p > 0.22 && p < 0.3 ? Math.sin(Math.PI * progress(p, 0.22, 0.3)) : 0
  const loading = p > 0.3 && p < 0.62 ? progress(p, 0.3, 0.62) : -1 // -1 = sem loading
  const swipe = p < 0.76 ? easeInOut(progress(p, 0.62, 0.76)) : 1 - easeInOut(progress(p, 0.76, 0.9))
  const turn = cycle + easeInOut(progress(p, 0.64, 0.8))
  return { reach, tap, loading, swipe, turn }
}

// Direção no "jeito do robô" (frente = +Z, esquerda = +X, cima = +Y), convertida para o mundo
function robotDir(root, x, y, z) {
  return new THREE.Vector3(x, y, z).normalize().applyQuaternion(root.quaternion)
}

// aura = cor da aura escolhida nas Configurações ('padrao' = segue o tema)
// focus = modo saúde do PC (vira de perfil e a câmera entra no fone); onHeadClick = clicou na cabeça/fone
// health = dados da saúde do PC (o anel em cima do fone mostra a nota)
export default function Robot({ theme, busy, aura = 'padrao', focus = false, onHeadClick, health }) {
  const mountRef = useRef(null)
  const themeRef = useRef(theme) // tema atual, lido pelo 3D quando termina de carregar
  const auraRef = useRef(aura) // cor da aura atual (idem)
  const applyThemeRef = useRef(null) // função (criada lá dentro) que troca o visual do robô
  const busyRef = useRef(false) // true enquanto a Linnea executa uma ferramenta (robô no modo "procurando")
  const focusRef = useRef(focus)
  const headClickRef = useRef(onHeadClick)

  useEffect(() => {
    focusRef.current = focus
    headClickRef.current = onHeadClick
  }, [focus, onHeadClick])

  useEffect(() => {
    busyRef.current = busy
  }, [busy])

  useEffect(() => {
    themeRef.current = theme
    auraRef.current = aura
    applyThemeRef.current?.(theme)
  }, [theme, aura])

  useEffect(() => {
    const mount = mountRef.current

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(mount.clientWidth, mount.clientHeight)
    renderer.toneMapping = THREE.ACESFilmicToneMapping // cores mais ricas no brilho
    renderer.toneMappingExposure = 1.0
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const pmrem = new THREE.PMREMGenerator(renderer)
    const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = environment // reflexos do metal

    // Enquadra do quadril para cima (câmera mais perto = robô maior na tela)
    const camera = new THREE.PerspectiveCamera(35, mount.clientWidth / mount.clientHeight, 0.1, 100)
    camera.position.copy(BASE_CAMERA)
    camera.lookAt(BASE_TARGET)

    scene.add(new THREE.AmbientLight(0xffffff, 0.5))
    const key = new THREE.DirectionalLight(0xffffff, 1.6)
    key.position.set(3, 5, 6)
    scene.add(key)
    const backCyan = new THREE.DirectionalLight(0x66ddff, 2) // luz de contorno ciano por trás
    backCyan.position.set(-4, 4, -5)
    scene.add(backCyan)
    const backPink = new THREE.DirectionalLight(0xff77cc, 1.4) // e rosa do outro lado
    backPink.position.set(5, 3, -4)
    scene.add(backPink)

    const uniforms = {
      time: { value: 0 },
      uBlink: { value: 0 }, // 0 = olhos abertos, 1 = fechados
      uFlicker: { value: 1 }, // oscilação de luz do holograma (1 = normal)
      uGlitch: { value: 0 }, // falha rápida que desloca faixas do corpo (0 = sem falha)
      uDark: { value: 0 }, // 0 = visual do tema claro, 1 = visual do tema escuro
      rimCyan: { value: new THREE.Color(0x59d8ff) },
      rimPink: { value: new THREE.Color(0xff6ad5) },
    }

    // "root" guarda o robô, os anéis e as faíscas, para flutuarem e girarem juntos
    const root = new THREE.Group()
    root.rotation.y = FACING
    scene.add(root)

    const rings = [createOrbitRing(1.0, 0xff8ad8, 0.35, 0.12), createOrbitRing(1.2, 0x7fdcff, -0.28, -0.1)]
    rings.forEach((ring) => {
      ring.position.y = 2.9
      root.add(ring)
    })
    const sparkles = createSparkles()
    root.add(sparkles)
    // Aura: halo atrás do peito e partículas de energia subindo
    const halo = createAuraGlow()
    halo.position.set(0, 3.5, -0.6)
    halo.scale.set(4.2, 4.6, 1)
    root.add(halo)
    const particles = createEnergyParticles()
    root.add(particles)
    const carousel = createFileCarousel()
    scene.add(carousel)
    const loader = createLoader()
    scene.add(loader)

    // Texturas reduzidas para 2048 px (as originais tinham 4096 px e 47 MB)
    const textureLoader = new THREE.TextureLoader()
    const loadTexture = (name, srgb) => {
      const texture = textureLoader.load(`/holo-${name}.jpg`)
      texture.flipY = false // padrão das texturas em arquivos GLB
      if (srgb) texture.colorSpace = THREE.SRGBColorSpace
      return texture
    }
    const maps = { color: loadTexture('cor', true), normal: loadTexture('normal'), metalRough: loadTexture('metal-aspereza') }

    let model = null
    const robotMaterials = []
    const shells = []

    // Visual por tema: no claro, metal claro e aura clara; no escuro, metal escuro, detalhes e aura coloridos
    function applyTheme(currentTheme) {
      const dark = currentTheme === 'dark'
      uniforms.uDark.value = dark ? 1 : 0
      renderer.toneMappingExposure = dark ? 1.0 : 1.1
      robotMaterials.forEach((material) => (material.envMapIntensity = dark ? 0.85 : 1.2))
      setAuraTheme(halo, shells, dark ? 'dark' : 'light', auraRef.current)
    }
    applyTheme(themeRef.current)
    applyThemeRef.current = applyTheme
    let bones = null
    let axes = null
    let retarget = null
    let clarixMixer = null
    let clarixModel = null

    const draco = new DRACOLoader()
    draco.setDecoderPath('/draco/')
    const gltfLoader = new GLTFLoader()
    gltfLoader.setDRACOLoader(draco)

    // Carrega o robô e o boneco do clarix (este fica invisível, só "dirige" o movimento)
    Promise.all([gltfLoader.loadAsync('/robo-holo.glb'), gltfLoader.loadAsync('/model.glb')]).then(([robot, clarix]) => {
      model = robot.scene
      const bone = (name) => model.getObjectByName(name)
      bones = {
        arm: bone('mixamorigRightArm'),
        forearm: bone('mixamorigRightForeArm'),
        hand: bone('mixamorigRightHand'),
        leftForearm: bone('mixamorigLeftForeArm'),
        leftHand: bone('mixamorigLeftHand'),
        head: bone('mixamorigHead'),
        headFront: bone('headfront'), // osso extra do Meshy na frente do rosto: mostra para onde ele olha
      }

      model.traverse((child) => {
        if (!child.isSkinnedMesh) return
        child.material.dispose()
        child.material = createHologramMaterial(maps, uniforms)
        robotMaterials.push(child.material)
        child.frustumCulled = false
        // Dedos levemente dobrados (o modelo não tem ossos nos dedos)
        curlFingers(child, bones.hand, bones.forearm, { maxAngle: 0.5 })
        curlFingers(child, bones.leftHand, bones.leftForearm, { maxAngle: 0.5 })
        // Direções da mão direita na pose em T: dedos para a direita do robô (-X), palma para baixo
        axes = { fingers: bindLocalDir(child, bones.hand, new THREE.Vector3(-1, 0, 0)), palm: bindLocalDir(child, bones.hand, DOWN) }
        // Aura que acompanha o corpo (mesma malha e mesmo esqueleto, um pouco maior)
        const shell = createAuraShell(child, uniforms)
        shells.push(shell)
        child.parent.add(shell)
      })
      applyTheme(themeRef.current)

      // Altura de 5 unidades, pés no chão (y = 0) e centralizado
      const size = new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3())
      model.scale.setScalar(5 / size.y)
      const box = new THREE.Box3().setFromObject(model)
      const center = box.getCenter(new THREE.Vector3())
      model.position.set(-center.x, -box.min.y, -center.z)
      root.add(model)

      clarixModel = clarix.scene
      retarget = createRetargeter(clarixModel, model)
      clarixMixer = new THREE.AnimationMixer(clarixModel)
      clarixMixer.clipAction(clarix.animations[0]).play()
    })

    const cardPos = new THREE.Vector3()
    const shoulder = new THREE.Vector3()
    const wristTarget = new THREE.Vector3()
    const wristPos = new THREE.Vector3()
    const fingerDir = new THREE.Vector3()
    const headPos = new THREE.Vector3()
    const gaze = new THREE.Vector3()
    const lookTarget = new THREE.Vector3()

    // Mão direita indo até o arquivo da frente, tocando e passando para o lado.
    // "reach" mistura com o movimento do clarix: 0 = só clarix, 1 = só a mão no arquivo.
    function poseRightHand({ reach, tap, swipe }) {
      if (reach <= 0) return
      bones.arm.getWorldPosition(shoulder)
      // Pulso para um pouco antes do arquivo (do lado do robô), avança no toque e varre para fora no "passar"
      wristTarget.subVectors(shoulder, cardPos).normalize().multiplyScalar(0.42 - 0.12 * tap).add(cardPos)
      wristTarget.y -= 0.1
      wristTarget.addScaledVector(robotDir(root, -1, 0, 0.3), 0.55 * swipe)
      reachTo(bones.arm, bones.forearm, bones.hand, wristTarget, robotDir(root, -0.5, -0.85, -0.2), reach)
      // Dedos apontando para o arquivo, palma virada para baixo
      bones.hand.getWorldPosition(wristPos)
      fingerDir.subVectors(cardPos, wristPos).normalize()
      aimBoneLocal(bones.hand, axes.fingers, fingerDir, reach)
      twistToward(bones.hand, axes.fingers, axes.palm, DOWN, reach)
    }

    // Loading girando sobre o arquivo tocado; o arquivo fica mais apagado enquanto carrega
    function updateLoader(card, loading, delta) {
      loader.visible = loading >= 0
      if (!loader.visible) return
      loader.position.copy(carousel.position).add(card.position)
      loader.position.z += 0.02
      loader.scale.copy(card.scale)
      loader.rotation.z -= delta * 7
      loader.material.opacity = Math.min(1, loading * 6, (1 - loading) * 6)
      card.material.opacity *= 0.55
    }

    // ---- Reações aos sinais do app (ver robotSignals.js) ----
    let wordEnergy = 0 // sobe a cada pedaço de texto da Linnea e vai baixando: a aura pulsa junto
    let worriedUntil = -1 // até quando pisca rápido ("preocupado" com muito lixo)
    let celebrateStart = -10 // quando começou a comemoração
    let pointStart = -10 // quando começou a apontar
    const pointTarget = new THREE.Vector3()

    // Ponto da tela (pixels) -> ponto 3D num plano à frente do robô (o card fica fora do canvas, à esquerda)
    function screenToWorld(x, y) {
      const box = renderer.domElement.getBoundingClientRect()
      const ndc = new THREE.Vector3(((x - box.left) / box.width) * 2 - 1, -((y - box.top) / box.height) * 2 + 1, 0.5)
      const dir = ndc.unproject(camera).sub(camera.position).normalize()
      const distance = (POINT_PLANE_Z - camera.position.z) / dir.z
      pointTarget.copy(camera.position).addScaledVector(dir, distance)
      pointTarget.y = Math.min(Math.max(pointTarget.y, 2.6), 5) // não aponta para o chão nem para o teto
    }

    const stopListening = onRobotSignal((name, data) => {
      const now = uniforms.time.value
      if (name === 'word') wordEnergy = Math.min(1, wordEnergy + 0.3)
      if (name === 'worried') worriedUntil = now + 8
      if (name === 'celebrate') celebrateStart = now
      if (name === 'point') {
        screenToWorld(data.x, data.y)
        pointStart = now
      }
    })

    // Quanto ele está apontando agora (0 a 1): sobe rápido, segura e baixa no fim
    function pointAmount(t) {
      const since = t - pointStart
      if (since < 0 || since > POINT_SECONDS) return 0
      return easeInOut(Math.min(since / 0.35, 1, (POINT_SECONDS - since) / 0.5))
    }

    // Braço direito esticado na direção do ponto, dedos apontando para ele
    const armTarget = new THREE.Vector3()
    function poseRightHandPointing(amount) {
      bones.arm.getWorldPosition(shoulder)
      armTarget.subVectors(pointTarget, shoulder).normalize().multiplyScalar(3).add(shoulder) // longe: o braço estica
      reachTo(bones.arm, bones.forearm, bones.hand, armTarget, robotDir(root, 0, -1, -0.3), amount, 0.88)
      bones.hand.getWorldPosition(wristPos)
      fingerDir.subVectors(pointTarget, wristPos).normalize()
      aimBoneLocal(bones.hand, axes.fingers, fingerDir, amount)
    }

    // Piscar: a cada 2,5 a 5 segundos os olhos fecham e abrem em 0,16 s (preocupado: a cada 0,5 a 1,1 s)
    let nextBlink = 2
    function updateBlink(t) {
      const since = t - nextBlink
      if (since > 0.16) nextBlink = t + (t < worriedUntil ? 0.5 + Math.random() * 0.6 : 2.5 + Math.random() * 2.5)
      uniforms.uBlink.value = since > 0 && since < 0.16 ? Math.sin(Math.PI * (since / 0.16)) : 0
    }

    // Holograma "instável": oscila de leve o tempo todo e, a cada 3 a 7 s, dá uma falha rápida
    let nextGlitch = 4
    function updateHologram(t) {
      const since = t - nextGlitch
      if (since > 0.22) nextGlitch = t + 3 + Math.random() * 4
      const glitching = since > 0 && since < 0.22
      uniforms.uGlitch.value = glitching ? 1 : 0
      uniforms.uFlicker.value = (glitching ? 0.7 + 0.3 * Math.random() : 1) * (0.96 + 0.04 * Math.sin(t * 23))
      halo.material.opacity = (0.75 + 0.25 * Math.sin(t * 1.6)) * (1 + 0.35 * (speed - 1) / 1.4) // halo pulsando (mais forte trabalhando)
    }

    // ---- Modo foco (saúde do PC) e clique na cabeça ----
    let focusAmount = 0 // 0 = normal, 1 = de perfil com a câmera no fone (vai mudando aos poucos)
    const focusPoint = new THREE.Vector3()
    const cameraGoal = new THREE.Vector3()
    const focusCamera = new THREE.Vector3()
    const targetGoal = new THREE.Vector3()
    const raycaster = new THREE.Raycaster()
    const pointer = new THREE.Vector2()
    const headCenter = new THREE.Vector3()

    function hitsHead(event) {
      if (!model || !bones) return false
      const box = renderer.domElement.getBoundingClientRect()
      pointer.set(((event.clientX - box.left) / box.width) * 2 - 1, -((event.clientY - box.top) / box.height) * 2 + 1)
      raycaster.setFromCamera(pointer, camera)
      const hit = raycaster.intersectObject(model, true)[0]
      if (!hit) return false
      bones.head.getWorldPosition(headCenter)
      headCenter.y += 0.2 // o osso fica na base da cabeça; o centro (e os fones) ficam um pouco acima
      return hit.point.distanceTo(headCenter) < HEAD_RADIUS
    }

    let lastHover = 0
    const onPointerMove = (event) => {
      const now = performance.now()
      if (now - lastHover < 120) return // não precisa testar a cada pixel que o mouse anda
      lastHover = now
      const over = hitsHead(event)
      renderer.domElement.style.cursor = over ? 'pointer' : ''
      renderer.domElement.title = over ? (focusRef.current ? 'Clique para voltar' : 'Clique no fone para ver a saúde do PC') : ''
    }
    const onClick = (event) => {
      if (hitsHead(event)) headClickRef.current?.()
    }
    renderer.domElement.addEventListener('pointermove', onPointerMove)
    renderer.domElement.addEventListener('click', onClick)

    // A área do robô é mais larga que o "quadro" dele (37% da tela): a sobra fica toda à esquerda, para os arquivos
    // do carrossel não serem cortados. O view offset desenha só a parte da esquerda a mais, sem mudar o robô de lugar.
    const onResize = () => {
      const width = mount.clientWidth
      const height = mount.clientHeight
      renderer.setSize(width, height)
      const extra = Math.max(0, width - window.innerWidth * FRAME_VW)
      if (extra > 0) camera.setViewOffset(width + extra, height, 0, 0, width, height)
      else {
        camera.clearViewOffset()
        camera.aspect = width / height
      }
      camera.updateProjectionMatrix()
    }
    onResize()
    // Observa a própria área (e não só a janela): no modo foco ela volta a ter o tamanho do quadro
    const resizeObserver = new ResizeObserver(onResize)
    resizeObserver.observe(mount)

    let speed = 1 // ritmo atual da animação (1 = normal; sobe no modo "procurando")
    let workTime = 0 // relógio do ciclo dos arquivos, que anda no ritmo atual
    const timer = new THREE.Timer()
    timer.connect(document)
    renderer.setAnimationLoop((time) => {
      timer.update(time)
      const delta = timer.getDelta()
      const t = (uniforms.time.value += delta)
      // Modo "procurando": acelera aos poucos até 2,4x enquanto trabalha e volta ao normal depois
      speed += ((busyRef.current ? 2.4 : 1) - speed) * Math.min(1, delta * 3)
      workTime += delta * speed

      // Comemoração: pulinhos que vão diminuindo, anéis e partículas mais rápidos
      const celebrating = t - celebrateStart < CELEBRATE_SECONDS
      const party = celebrating ? 1 - (t - celebrateStart) / CELEBRATE_SECONDS : 0
      const hop = celebrating ? Math.abs(Math.sin((t - celebrateStart) * Math.PI * 2.5)) * 0.28 * party : 0

      root.position.y = Math.sin(t) * 0.06 + hop // flutua de leve (e pula comemorando)
      // Modo foco: vira de perfil aos poucos (e volta ao normal quando sai)
      focusAmount += ((focusRef.current ? 1 : 0) - focusAmount) * Math.min(1, delta * 2.2)
      const focused = easeInOut(clamp01(focusAmount))
      root.rotation.y = FACING + (PROFILE - FACING) * focused
      rings[0].rotation.y += delta * 0.25 * speed * (1 + 4 * party)
      rings[1].rotation.y -= delta * 0.18 * speed * (1 + 4 * party)
      sparkles.rotation.y += delta * 0.05 * speed * (1 + 6 * party)
      updateBlink(t)
      updateHologram(t)
      updateEnergyParticles(particles, delta * speed * (1 + 2 * party))

      // A aura pulsa com as palavras da Linnea (e brilha mais comemorando)
      wordEnergy *= Math.exp(-delta * 4)
      const glow = Math.max(wordEnergy, party)
      halo.material.opacity *= (1 + 0.9 * glow) * (1 - 0.85 * focused) // no zoom do fone, o halo quase some
      halo.scale.set(4.2 * (1 + 0.08 * glow), 4.6 * (1 + 0.08 * glow), 1)
      uniforms.uFlicker.value *= 1 + 0.35 * glow

      if (retarget) {
        clarixMixer.update(delta) // anima o boneco invisível do clarix...
        retarget() // ...e copia o movimento dele para o nosso robô

        const state = cycleState(workTime) // ciclo dos arquivos no ritmo atual (mais rápido trabalhando)
        root.updateMatrixWorld(true)
        carousel.position.copy(CAROUSEL_LOCAL).applyQuaternion(root.quaternion).add(root.position)
        updateFileCarousel(carousel, state.turn, t)
        carousel.visible = focused < 0.15 // no modo foco, os arquivos somem

        // Mão e cabeça miram a POSIÇÃO da frente do carrossel, que é fixa.
        // (Mirar o cartão em si fazia tudo pular quando o cartão da frente trocava no meio do giro.)
        cardPos.copy(carousel.position)
        cardPos.z += CAROUSEL_RADIUS * 0.6
        // Apontando para um card: a mão sai do carrossel e o braço estica na direção do card
        const pointing = pointAmount(t)
        poseRightHand({ ...state, reach: state.reach * (1 - pointing) * (1 - focused) })
        if (pointing > 0) poseRightHandPointing(pointing)

        // Loading sobre o cartão que está na frente (durante o loading o carrossel está parado)
        const count = carousel.children.length
        const card = carousel.children[((Math.round(state.turn) % count) + count) % count]
        updateLoader(card, focused < 0.15 ? state.loading : -1, delta)

        // Cabeça olhando para os arquivos (ou virando para o card que ela está apontando)
        bones.head.getWorldPosition(headPos)
        bones.headFront.getWorldPosition(gaze).sub(headPos).normalize()
        lookAtPoint(bones.head, pointing > 0 ? lookTarget.lerpVectors(cardPos, pointTarget, pointing) : cardPos, gaze, 0.75 * (1 - focused))

        // Câmera: no modo foco, chega perto da cabeça (o fone fica no meio da tela, onde aparece o anel)
        bones.head.getWorldPosition(focusPoint)
        focusPoint.y += 0.2
        focusPoint.add(FOCUS_SHIFT)
        targetGoal.lerpVectors(BASE_TARGET, focusPoint, focused)
        focusCamera.copy(focusPoint).add(FOCUS_OFFSET)
        cameraGoal.lerpVectors(BASE_CAMERA, focusCamera, focused)
        camera.position.copy(cameraGoal)
        camera.lookAt(targetGoal)
      }
      renderer.render(scene, camera)
    })

    // Limpeza: roda quando o componente sai da tela
    return () => {
      stopListening()
      renderer.setAnimationLoop(null)
      applyThemeRef.current = null
      timer.dispose()
      resizeObserver.disconnect()
      renderer.domElement.removeEventListener('pointermove', onPointerMove)
      renderer.domElement.removeEventListener('click', onClick)
      if (model) disposeObject(model)
      if (clarixModel) disposeObject(clarixModel)
      disposeObject(root)
      disposeObject(carousel)
      disposeObject(loader)
      Object.values(maps).forEach((texture) => texture.dispose())
      draco.dispose()
      environment.dispose()
      pmrem.dispose()
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [])

  return (
    <div className={`robot aura-${aura} ${focus ? 'focus' : ''}`}>
      <div ref={mountRef} className="robot-canvas" />
      {focus && <HealthRing health={health} />}
    </div>
  )
}
