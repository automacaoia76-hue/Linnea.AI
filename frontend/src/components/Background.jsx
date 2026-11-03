import { useEffect, useRef } from 'react'
import * as THREE from 'three'

// Fundo de pontinhos animados, extraído do clarix.
// O desenho é feito por um shader (código que roda na placa de vídeo) num plano que cobre a tela.

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // Prende o plano na tela, ignorando a câmera
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`

const fragmentShader = `
  uniform float time;
  uniform vec2 mouse;
  uniform vec3 bgColor;
  uniform vec2 resolution;
  uniform vec3 colorCyan;
  uniform vec3 colorBlue;
  uniform vec3 colorHotPink;
  uniform vec3 colorPeach;
  uniform float uDark; // 0 = tema claro, 1 = tema escuro
  varying vec2 vUv;

  mat2 rotate2d(float _angle){
    return mat2(cos(_angle), -sin(_angle), sin(_angle), cos(_angle));
  }

  void main() {
    float pixelSize = 15.0;
    vec2 screenUv = vUv;
    float aspect = resolution.x / resolution.y;
    vec2 aspectUv = vec2(screenUv.x * aspect, screenUv.y);

    vec2 gridUv = aspectUv * (resolution.y / pixelSize);
    vec2 localUv = fract(gridUv) - 0.5;

    // 1. Cores do fundo (ondas azul -> ciano -> rosa)
    float wave1 = sin(aspectUv.x * 4.0 - time * 0.8);
    float wave2 = cos(aspectUv.y * 3.0 + time * 0.6);
    float combinedWave = smoothstep(-0.8, 0.8, (wave1 + wave2) * 0.5);
    float wavePeach = sin(aspectUv.y * 3.0 - aspectUv.x * 2.0 + time * 0.9) * 0.5 + 0.5;

    // No escuro, o rosa e o vermelho dão lugar a roxo e violeta (como na referência escura)
    vec3 hotPink = mix(colorHotPink, vec3(0.62, 0.22, 1.0), uDark * 0.7);
    vec3 peach = mix(colorPeach, vec3(0.38, 0.3, 1.0), uDark);
    vec3 mixColor = mix(colorBlue, colorCyan, combinedWave);
    vec3 pinkTransition = mix(mixColor, hotPink, smoothstep(0.1, 0.7, wavePeach));
    mixColor = mix(pinkTransition, peach, smoothstep(0.5, 1.0, wavePeach));
    // No claro os pontinhos são clarinhos; no escuro ficam mais saturados, para brilhar no azul-marinho
    vec3 lightGridColor = mix(mixColor, vec3(1.0), mix(0.6, 0.12, uDark));

    // 2. Grade de quadradinhos que "respiram"
    float boxSize = 0.3 + sin(time * 2.0 + gridUv.x * 0.2 + gridUv.y * 0.2) * 0.1;
    float radius = 0.12;
    float d = length(max(abs(localUv) - (boxSize - radius), 0.0)) - radius;
    float alpha = smoothstep(0.05, 0.0, d);

    // 3. Nuvens orgânicas que mostram/escondem os pontinhos (reagem ao mouse)
    vec2 radialCenter = mix(vec2(0.5, 0.5), mouse, 0.3);
    float radialMask = smoothstep(0.7, 0.1, distance(screenUv, radialCenter));

    vec2 p = aspectUv * 3.0;
    vec2 mouseAspect = vec2(mouse.x * aspect, mouse.y);
    float mouseDist = distance(aspectUv, mouseAspect);

    float noise = 0.0;
    noise += sin(p.x + time * 0.4) * sin(p.y + time * 0.3);
    p *= rotate2d(1.1);
    noise += sin(p.x * 1.5 - time * 0.5) * sin(p.y * 1.5 + time * 0.2);
    p *= rotate2d(2.3);
    noise += sin(p.x * 2.0 + time * 0.3) * sin(p.y * 2.0 - time * 0.4);
    noise += cos(mouseDist * 12.0 - time * 3.0) * smoothstep(0.6, 0.0, mouseDist) * 1.2;

    float blobMask = smoothstep(0.0, 1.5, noise);
    float cursorHighlight = smoothstep(0.2, 0.0, mouseDist);

    float finalMask = clamp((radialMask * blobMask) + (cursorHighlight * 0.5), 0.0, 1.0);
    float finalAlpha = alpha * finalMask * mix(0.85, 0.7, uDark);

    vec3 finalColor = mix(bgColor, lightGridColor, finalAlpha);
    gl_FragColor = vec4(finalColor, 1.0);
  }
`

const LIGHT_BG = new THREE.Color(0xf6fafe)
const DARK_BG = new THREE.Color(0x060a1c)

export default function Background({ theme }) {
  const mountRef = useRef(null)
  const darkRef = useRef(0) // tema desejado (0 claro, 1 escuro); o loop faz a transição suave

  useEffect(() => {
    darkRef.current = theme === 'dark' ? 1 : 0
  }, [theme])

  useEffect(() => {
    const mount = mountRef.current

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(window.innerWidth, window.innerHeight)
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.Camera() // o shader ignora a câmera, mas o render exige uma

    const uniforms = {
      time: { value: 0 },
      mouse: { value: new THREE.Vector2(0.5, 0.5) },
      resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
      bgColor: { value: LIGHT_BG.clone() },
      uDark: { value: 0 },
      colorCyan: { value: new THREE.Color(0x00aaff) },
      colorBlue: { value: new THREE.Color(0x0091ff) },
      colorHotPink: { value: new THREE.Color(0xff0099) },
      colorPeach: { value: new THREE.Color(0xff0000) },
    }

    const geometry = new THREE.PlaneGeometry(2, 2)
    const material = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      depthWrite: false,
      depthTest: false,
    })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.frustumCulled = false
    scene.add(mesh)

    // O mouse "empurra" as nuvens de pontinhos (com atraso suave)
    const targetMouse = new THREE.Vector2(0.5, 0.5)
    const onMouseMove = (event) => {
      targetMouse.set(event.clientX / window.innerWidth, 1 - event.clientY / window.innerHeight)
    }
    const onResize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight)
      uniforms.resolution.value.set(window.innerWidth, window.innerHeight)
    }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('resize', onResize)

    const timer = new THREE.Timer()
    timer.connect(document)
    renderer.setAnimationLoop((time) => {
      timer.update(time)
      const delta = timer.getDelta()
      uniforms.time.value += delta
      uniforms.mouse.value.lerp(targetMouse, delta * 3.0)
      // Transição suave entre os temas
      uniforms.uDark.value += (darkRef.current - uniforms.uDark.value) * Math.min(1, delta * 4)
      uniforms.bgColor.value.lerpColors(LIGHT_BG, DARK_BG, uniforms.uDark.value)
      renderer.render(scene, camera)
    })

    // Limpeza: roda quando o componente sai da tela
    return () => {
      renderer.setAnimationLoop(null)
      timer.dispose()
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('resize', onResize)
      geometry.dispose()
      material.dispose()
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [])

  return <div ref={mountRef} className="background" />
}
