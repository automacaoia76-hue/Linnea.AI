import * as THREE from 'three'

// O modelo do Meshy não tem ossos nos dedos, então dobramos os dedos direto na malha (uma vez, ao carregar).
// Pegamos os vértices que pertencem ao osso da mão e ficam além dos nós dos dedos, e giramos em direção
// à palma: quanto mais perto da ponta, maior o giro. A animação deforma a malha já com os dedos curvados.

const _v = new THREE.Vector3()
const _rel = new THREE.Vector3()
const _q = new THREE.Quaternion()

// Posição de um osso na pose original, no mesmo espaço dos vértices da malha
function bindPosition(mesh, bone) {
  const i = mesh.skeleton.bones.indexOf(bone)
  const m = new THREE.Matrix4().copy(mesh.skeleton.boneInverses[i]).invert()
  return new THREE.Vector3().setFromMatrixPosition(m)
}

// maxAngle: giro na ponta dos dedos, em radianos. knuckle: onde ficam os nós dos dedos (0 = pulso, 1 = ponta)
// palm: para onde a palma está virada na pose original (na pose em T, para baixo)
export function curlFingers(mesh, handBone, forearmBone, { maxAngle = 0.65, knuckle = 0.42, palm = new THREE.Vector3(0, -1, 0) } = {}) {
  const geometry = mesh.geometry
  const position = geometry.attributes.position
  const normal = geometry.attributes.normal
  const skinIndex = geometry.attributes.skinIndex
  const skinWeight = geometry.attributes.skinWeight
  const handIndex = mesh.skeleton.bones.indexOf(handBone)

  const wrist = bindPosition(mesh, handBone)
  const fingers = wrist.clone().sub(bindPosition(mesh, forearmBone)).normalize() // direção pulso -> dedos
  const axis = new THREE.Vector3().crossVectors(fingers, palm).normalize() // eixo dos nós dos dedos

  // Vértices onde o osso da mão manda mais (peso > 0.5)
  const handVertices = []
  for (let i = 0; i < position.count; i++) {
    for (let k = 0; k < 4; k++) {
      if (skinIndex.getComponent(i, k) === handIndex && skinWeight.getComponent(i, k) > 0.5) {
        handVertices.push(i)
        break
      }
    }
  }

  // Comprimento da mão: o vértice mais distante do pulso na direção dos dedos
  let length = 0
  for (const i of handVertices) length = Math.max(length, _rel.fromBufferAttribute(position, i).sub(wrist).dot(fingers))
  const start = length * knuckle
  const pivot = wrist.clone().addScaledVector(fingers, start)

  for (const i of handVertices) {
    _rel.fromBufferAttribute(position, i).sub(wrist)
    const along = _rel.dot(fingers)
    if (along <= start) continue
    const t = (along - start) / (length - start) // 0 nos nós, 1 na ponta
    _q.setFromAxisAngle(axis, maxAngle * t * t) // curva mais forte perto da ponta
    _v.fromBufferAttribute(position, i).sub(pivot).applyQuaternion(_q).add(pivot)
    position.setXYZ(i, _v.x, _v.y, _v.z)
    _v.fromBufferAttribute(normal, i).applyQuaternion(_q)
    normal.setXYZ(i, _v.x, _v.y, _v.z)
  }
  position.needsUpdate = true
  normal.needsUpdate = true
  return handVertices.length
}
