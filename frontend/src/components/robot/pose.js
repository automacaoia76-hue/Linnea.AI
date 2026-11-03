import * as THREE from 'three'

// Funções para "posar" o esqueleto por cima da animação do Mixamo.
// Trabalham com direções no mundo, então não dependem dos eixos internos de cada osso.

const IDENTITY = new THREE.Quaternion()
const _a = new THREE.Vector3()
const _b = new THREE.Vector3()
const _c = new THREE.Vector3()
const _d = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _world = new THREE.Quaternion()
const _parent = new THREE.Quaternion()

// Aplica uma rotação (no espaço do mundo) ao osso e grava como rotação local
function rotateBoneWorld(bone, q) {
  bone.getWorldQuaternion(_world).premultiply(q)
  bone.parent.getWorldQuaternion(_parent)
  bone.quaternion.copy(_parent.invert().multiply(_world))
  bone.updateMatrixWorld(true)
}

// Gira o osso para que o trecho "osso -> filho" aponte para targetDir (amount de 0 a 1)
export function aimBone(bone, child, targetDir, amount = 1) {
  bone.getWorldPosition(_a)
  child.getWorldPosition(_b)
  const current = _b.sub(_a).normalize()
  _q.setFromUnitVectors(current, targetDir)
  _q.slerp(IDENTITY, 1 - amount) // aplica só uma parte da rotação, se amount < 1
  rotateBoneWorld(bone, _q)
}

// Calibração pela pose original do esqueleto: converte uma direção (no referencial do modelo,
// ex.: "para a direita do robô") numa direção "presa" ao osso
export function bindLocalDir(mesh, bone, dir) {
  const i = mesh.skeleton.bones.indexOf(bone)
  const m = new THREE.Matrix4().copy(mesh.skeleton.boneInverses[i]).invert()
  const q = new THREE.Quaternion()
  m.decompose(new THREE.Vector3(), q, new THREE.Vector3())
  return dir.clone().normalize().applyQuaternion(q.invert())
}

// Calibração: converte uma direção do mundo numa direção "presa" ao osso (feito na pose original)
export function toBoneLocal(bone, worldDir) {
  bone.getWorldQuaternion(_world)
  return worldDir.clone().applyQuaternion(_world.invert())
}

// Gira o osso para que uma direção presa a ele (localDir) aponte para targetDir (amount de 0 a 1)
export function aimBoneLocal(bone, localDir, targetDir, amount = 1) {
  bone.getWorldQuaternion(_world)
  _a.copy(localDir).applyQuaternion(_world)
  _q.setFromUnitVectors(_a, targetDir)
  _q.slerp(IDENTITY, 1 - amount)
  rotateBoneWorld(bone, _q)
}

// Gira o osso em torno do próprio eixo (localAxis) até localDir apontar o mais perto possível de targetDir
export function twistToward(bone, localAxis, localDir, targetDir, amount = 1) {
  bone.getWorldQuaternion(_world)
  const axis = _a.copy(localAxis).applyQuaternion(_world).normalize()
  const current = _b.copy(localDir).applyQuaternion(_world)
  // Projeta as duas direções no plano perpendicular ao eixo e mede o ângulo entre elas
  current.addScaledVector(axis, -current.dot(axis)).normalize()
  const target = _c.copy(targetDir).addScaledVector(axis, -targetDir.dot(axis)).normalize()
  const angle = Math.atan2(axis.dot(_d.crossVectors(current, target)), current.dot(target))
  _q.setFromAxisAngle(axis, angle * amount)
  rotateBoneWorld(bone, _q)
}

// IK de dois ossos ("cinemática inversa"): gira ombro e cotovelo para o pulso chegar em "target".
// "pole" diz para que lado o cotovelo dobra; amount mistura com a pose atual (0 = nada, 1 = total).
// maxStretch limita o quanto o braço estica (1 = totalmente reto), para o cotovelo sempre dobrar um pouco.
const _s = new THREE.Vector3()
const _e = new THREE.Vector3()
const _w = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _perp = new THREE.Vector3()
const _elbow = new THREE.Vector3()
const _goal = new THREE.Vector3()

export function reachTo(upper, lower, end, target, pole, amount = 1, maxStretch = 0.82) {
  upper.getWorldPosition(_s)
  lower.getWorldPosition(_e)
  end.getWorldPosition(_w)
  const l1 = _s.distanceTo(_e) // comprimento do braço
  const l2 = _e.distanceTo(_w) // comprimento do antebraço

  // Distância até o alvo (limitada a uma parte do alcance, para o braço não ficar reto)
  _dir.subVectors(target, _s)
  const d = Math.min(Math.max(_dir.length(), 1e-4), (l1 + l2) * maxStretch)
  _dir.normalize()

  // Lei dos cossenos: quanto o cotovelo fica "para fora" da linha ombro -> alvo
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a))
  _perp.copy(pole).addScaledVector(_dir, -pole.dot(_dir)).normalize()
  _elbow.copy(_s).addScaledVector(_dir, a).addScaledVector(_perp, h)
  _goal.copy(_s).addScaledVector(_dir, d)

  // Aponta o braço para o cotovelo calculado e o antebraço para o alvo
  aimBone(upper, lower, _elbow.sub(_s).normalize(), amount)
  lower.getWorldPosition(_e)
  aimBone(lower, end, _goal.sub(_e).normalize(), amount)
}

// Vira a cabeça para olhar um ponto. "forward" é para onde a cabeça olha antes da pose.
export function lookAtPoint(head, target, forward, amount = 1) {
  head.getWorldPosition(_a)
  const gaze = _b.subVectors(target, _a).normalize()
  _q.setFromUnitVectors(forward, gaze)
  _q.slerp(IDENTITY, 1 - amount)
  rotateBoneWorld(head, _q)
}
