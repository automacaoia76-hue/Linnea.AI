import * as THREE from 'three'

// Material do robô holograma: usa as texturas do Meshy (cor, relevo, metal/aspereza) e acrescenta
// - brilho nas linhas de luz da pintura (partes ciano e roxas acendem e pulsam)
// - olhos brilhando e piscando (uma "pálpebra" desce sobre eles quando uBlink vai de 0 a 1)
// - borda iluminada ciano/rosa e uma faixa de scan subindo pelo corpo
// "uniforms" é compartilhado: time, uBlink, rimCyan, rimPink.

// Olhos na pose original (em metros, no espaço da malha), medidos na textura do modelo
const EYE_CENTER_X = 0.034
const EYE_CENTER_Y = 1.559
const EYE_RADIUS = new THREE.Vector2(0.026, 0.015)
const MODEL_HEIGHT = 1.7

export function createHologramMaterial(maps, uniforms) {
  const material = new THREE.MeshStandardMaterial({
    map: maps.color,
    normalMap: maps.normal,
    roughnessMap: maps.metalRough, // glTF: canal verde = aspereza, azul = metal
    metalnessMap: maps.metalRough,
    metalness: 1,
    roughness: 1,
    envMapIntensity: 0.85, // reflexo do metal (menor = metal mais escuro)
    transparent: true, // holograma: o corpo fica levemente translúcido
  })

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)

    shader.vertexShader = 'uniform float time;\nuniform float uGlitch;\nvarying vec3 vPos;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
       vPos = position;
       // Falha de holograma: algumas faixas horizontais do corpo "pulam" para o lado por um instante
       float glitchBand = step(0.82, fract(sin(floor(position.y * 14.0) * 91.7 + floor(time * 18.0)) * 43758.5));
       transformed.x += uGlitch * glitchBand * 0.025;`
    )

    shader.fragmentShader = `
      uniform float time;
      uniform float uBlink;
      uniform float uFlicker;
      uniform float uDark; // 0 = tema claro (visual original), 1 = tema escuro (metal escuro e detalhes coloridos)
      uniform vec3 rimCyan;
      uniform vec3 rimPink;
      varying vec3 vPos;

      // 1 dentro do olho (elipse na frente do rosto), 0 fora
      float eyeMask() {
        vec2 d = vec2(abs(vPos.x) - ${EYE_CENTER_X.toFixed(4)}, vPos.y - ${EYE_CENTER_Y.toFixed(4)});
        d /= vec2(${EYE_RADIUS.x.toFixed(4)}, ${EYE_RADIUS.y.toFixed(4)});
        return (1.0 - smoothstep(0.8, 1.0, length(d))) * step(0.055, vPos.z);
      }
      // Parte do olho coberta pela pálpebra: a borda desce do topo do olho conforme uBlink
      float lidMask() {
        float top = ${(EYE_CENTER_Y + EYE_RADIUS.y).toFixed(4)};
        float lidY = top - uBlink * ${(EYE_RADIUS.y * 2.2).toFixed(4)};
        return eyeMask() * smoothstep(lidY - 0.002, lidY + 0.002, vPos.y);
      }
    ` + shader.fragmentShader
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
         vec3 texel = diffuseColor.rgb;
         // Linhas de luz: partes ciano ou roxas e claras da pintura
         float bright = max(texel.g, texel.b);
         float cyan = smoothstep(0.06, 0.22, (texel.g + texel.b) * 0.5 - texel.r);
         float purple = smoothstep(0.06, 0.2, (texel.r + texel.b) * 0.5 - texel.g);
         float glow = max(cyan, purple * 0.8) * smoothstep(0.35, 0.75, bright);
         // Olho = região do olho E pixel brilhante da pintura (assim não vaza para o rosto)
         float eye = eyeMask() * glow;
         float lid = lidMask();
         // Pálpebra fechada: o olho vira a cor da "pele" metálica do rosto
         diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.45, 0.55), lid * clamp(glow * 3.0, 0.0, 1.0));
         // Só no tema escuro: metal mais escuro, puxado para um azul-grafite (as linhas de luz não escurecem)
         vec3 darkMetal = mix(diffuseColor.rgb * vec3(0.42, 0.45, 0.62), diffuseColor.rgb, glow);
         diffuseColor.rgb = mix(diffuseColor.rgb, darkMetal, uDark);`
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         // As linhas de luz acendem e pulsam (embaixo da pálpebra fechada, apagam)
         float pulse = 0.8 + 0.2 * sin(time * 2.0 + vPos.y * 6.0);
         // Detalhes coloridos: a cor das linhas varia entre ciano, rosa e violeta ao longo do corpo
         float hue = 0.5 + 0.5 * sin(vPos.y * 7.0 + vPos.x * 9.0 + time * 0.7);
         vec3 neon = mix(vec3(0.15, 0.85, 1.0), vec3(1.0, 0.3, 0.8), hue);
         neon = mix(neon, vec3(0.55, 0.35, 1.0), 0.5 + 0.5 * sin(vPos.y * 3.0 - time * 0.5) * 0.6);
         vec3 lightLines = texel * 1.6; // tema claro: as linhas brilham na própria cor da pintura
         vec3 darkLines = mix(texel, neon, 0.85) * 2.6 * (1.0 - eye); // tema escuro: linhas coloridas
         totalEmissiveRadiance += mix(lightLines, darkLines, uDark) * glow * pulse * (1.0 - lid);
         // Olhos com brilho extra quando abertos
         totalEmissiveRadiance += vec3(0.4, 0.9, 1.0) * eye * (1.0 - lid) * 1.2;`
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
         float h = vPos.y / ${MODEL_HEIGHT.toFixed(2)};
         // Borda iluminada (fresnel): ciano de um lado, rosa do outro
         vec3 viewDir = normalize(vViewPosition);
         float fresnel = pow(1.0 - abs(dot(viewDir, normal)), 3.0);
         vec3 rim = mix(rimCyan, rimPink, smoothstep(-0.3, 0.3, vPos.x)) * fresnel * 0.9;
         // Faixa de scan suave subindo pelo corpo
         float band = fract(h * 1.2 - time * 0.22);
         float scan = smoothstep(0.0, 0.015, band) * (1.0 - smoothstep(0.015, 0.08, band));
         gl_FragColor.rgb += rim + rimCyan * scan * 0.25;

         // Holograma: tom ciano, linhas finas de varredura (como numa tela) e oscilação de luz
         gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * vec3(0.8, 0.98, 1.15) + rimCyan * mix(0.06, 0.03, uDark), mix(0.45, 0.3, uDark));
         float scanline = 0.92 + 0.08 * sin(gl_FragCoord.y * 1.6 - time * 6.0);
         gl_FragColor.rgb *= scanline * uFlicker;
         // Centro do corpo um pouco transparente, bordas firmes
         gl_FragColor.a = mix(0.82, 1.0, fresnel) * mix(1.0, scanline, 0.5) * uFlicker;`
      )
  }

  return material
}
