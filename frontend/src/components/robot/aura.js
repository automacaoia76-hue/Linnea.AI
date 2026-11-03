import * as THREE from 'three'

// Aura do robô holograma:
// 1. Casca: cópia do corpo um pouco "inflada", que se mexe com o esqueleto e brilha nas bordas
// 2. Halo: brilho suave atrás do robô, pulsando
// 3. Partículas de energia subindo em volta do corpo

// 1. Casca brilhante que segue o corpo (usa a mesma malha e o mesmo esqueleto do robô)
export function createAuraShell(skinnedMesh, uniforms) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      time: uniforms.time,
      uFlicker: uniforms.uFlicker,
      uThickness: { value: 0.014 }, // quanto a casca "incha" para fora do corpo (em metros do modelo)
      colorA: { value: new THREE.Color(0x2f7bff) },
      colorB: { value: new THREE.Color(0xc23cff) },
    },
    vertexShader: `
      #include <common>
      #include <skinning_pars_vertex>
      uniform float uThickness;
      varying vec3 vNormal;
      varying vec3 vView;
      varying float vHeight;
      void main() {
        #include <beginnormal_vertex>
        #include <skinbase_vertex>
        #include <skinnormal_vertex>
        #include <begin_vertex>
        #include <skinning_vertex>
        transformed += normalize(objectNormal) * uThickness; // empurra a superfície para fora
        vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
        vNormal = normalize(normalMatrix * objectNormal);
        vView = -mvPosition.xyz;
        vHeight = position.y;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform float uFlicker;
      uniform vec3 colorA;
      uniform vec3 colorB;
      varying vec3 vNormal;
      varying vec3 vView;
      varying float vHeight;
      void main() {
        // Brilho só nas bordas (onde a superfície "foge" da câmera)
        float fresnel = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.2);
        // Cor ciano -> roxo que ondula subindo pelo corpo
        float wave = 0.5 + 0.5 * sin(vHeight * 5.0 - time * 1.5);
        vec3 color = mix(colorA, colorB, wave);
        float pulse = 0.75 + 0.25 * sin(time * 2.2);
        gl_FragColor = vec4(color, fresnel * 0.85 * pulse * uFlicker);
      }
    `,
    transparent: true,
    depthWrite: false,
  })
  const shell = new THREE.SkinnedMesh(skinnedMesh.geometry, material)
  shell.bind(skinnedMesh.skeleton, skinnedMesh.bindMatrix)
  shell.frustumCulled = false
  shell.renderOrder = 2 // desenha depois do corpo
  return shell
}

function glowTexture(stops) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
  stops.forEach(([offset, color]) => gradient.addColorStop(offset, color))
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, 256, 256)
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  return texture
}

// 2. Halo atrás do robô (um plano com degradê redondo, sempre de frente para a câmera)
// Tem duas versões: clara (tema claro) e colorida saturada (tema escuro)
export function createAuraGlow() {
  const textures = {
    light: glowTexture([
      [0, 'rgba(110, 225, 255, 0.85)'],
      [0.35, 'rgba(140, 115, 255, 0.5)'],
      [0.65, 'rgba(255, 110, 210, 0.2)'],
      [1, 'rgba(255, 110, 210, 0)'],
    ]),
    dark: glowTexture([
      [0, 'rgba(105, 70, 255, 0.6)'],
      [0.35, 'rgba(185, 55, 230, 0.4)'],
      [0.65, 'rgba(40, 120, 255, 0.18)'],
      [1, 'rgba(255, 110, 210, 0)'],
    ]),
  }
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: textures.light, transparent: true, depthWrite: false }))
  halo.userData.textures = textures
  halo.renderOrder = -1 // atrás de tudo
  return halo
}

// Cores da aura em cada tema
const SHELL_COLORS = {
  light: [0x4fe3ff, 0xa86bff], // ciano e lilás
  dark: [0x2f7bff, 0xc23cff], // azul-elétrico e magenta
}

// Cores que dá para escolher nas Configurações (as duas cores da casca; o halo usa as mesmas)
export const AURA_PRESETS = {
  azul: [0x3fa9ff, 0x2f5bff],
  verde: [0x3dffb0, 0x1fc8ff],
  rosa: [0xff6bd5, 0xa86bff],
  dourado: [0xffd36b, 0xff8a3d],
}

const rgba = (hex, alpha) => `rgba(${(hex >> 16) & 255}, ${(hex >> 8) & 255}, ${hex & 255}, ${alpha})`

// Troca as cores do halo e da casca. aura = 'padrao' (segue o tema) ou uma cor de AURA_PRESETS
export function setAuraTheme(halo, shells, theme, aura = 'padrao') {
  const preset = AURA_PRESETS[aura]
  const [colorA, colorB] = preset || SHELL_COLORS[theme]
  if (preset && !halo.userData.textures[aura]) {
    // Halo da cor escolhida (criado na primeira vez e guardado)
    halo.userData.textures[aura] = glowTexture([
      [0, rgba(colorA, 0.75)],
      [0.35, rgba(colorB, 0.45)],
      [0.65, rgba(colorB, 0.18)],
      [1, rgba(colorB, 0)],
    ])
  }
  halo.material.map = halo.userData.textures[preset ? aura : theme]
  halo.material.needsUpdate = true
  shells.forEach((shell) => {
    shell.material.uniforms.colorA.value.set(colorA)
    shell.material.uniforms.colorB.value.set(colorB)
  })
}

// 3. Partículas de energia subindo em volta do corpo
const PARTICLES = 90

export function createEnergyParticles() {
  const positions = new Float32Array(PARTICLES * 3)
  const colors = new Float32Array(PARTICLES * 3)
  const speeds = new Float32Array(PARTICLES)
  const cyan = new THREE.Color(0x6fe6ff)
  const pink = new THREE.Color(0xff7ad9)
  for (let i = 0; i < PARTICLES; i++) {
    const angle = Math.random() * Math.PI * 2
    const radius = 0.7 + Math.random() * 0.8
    positions.set([Math.cos(angle) * radius, 1.5 + Math.random() * 4.5, Math.sin(angle) * radius * 0.6], i * 3)
    colors.set((Math.random() < 0.65 ? cyan : pink).toArray(), i * 3)
    speeds[i] = 0.25 + Math.random() * 0.5
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: 0.09,
      map: glowTexture([
        [0, 'rgba(255,255,255,1)'],
        [0.3, 'rgba(255,255,255,0.7)'],
        [1, 'rgba(255,255,255,0)'],
      ]),
      vertexColors: true,
      transparent: true,
      depthWrite: false,
    })
  )
  points.userData.speeds = speeds
  return points
}

// Sobe as partículas e devolve para baixo quando passam do topo
export function updateEnergyParticles(points, delta) {
  const position = points.geometry.attributes.position
  const speeds = points.userData.speeds
  for (let i = 0; i < PARTICLES; i++) {
    let y = position.getY(i) + speeds[i] * delta
    if (y > 6) y = 1.5
    position.setY(i, y)
  }
  position.needsUpdate = true
}
