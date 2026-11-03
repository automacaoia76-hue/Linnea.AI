import * as THREE from 'three'

// "Retargeting": copia a animação de um personagem (origem) para outro (destino).
// Os dois usam ossos com os mesmos nomes (padrão Mixamo), mas com tamanhos e eixos diferentes.
// Por isso não copiamos os números da animação: para cada osso, medimos quanto ele GIROU em
// relação à pose original (pose em T) na origem, e aplicamos o mesmo giro no destino.

const _m = new THREE.Matrix4()
const _q = new THREE.Quaternion()
const _rootQ = new THREE.Quaternion()
const _parentQ = new THREE.Quaternion()
const _pos = new THREE.Vector3()
const _scale = new THREE.Vector3()

// Pose original (de quando o modelo foi "amarrado" ao esqueleto).
// Num arquivo GLB, essas matrizes já estão no referencial da cena do próprio modelo (a raiz).
function bindPose(skinnedMesh) {
  const pose = {}
  skinnedMesh.skeleton.bones.forEach((bone, i) => {
    _m.copy(skinnedMesh.skeleton.boneInverses[i]).invert()
    const position = new THREE.Vector3()
    const quaternion = new THREE.Quaternion()
    _m.decompose(position, quaternion, _scale)
    pose[bone.name] = { position, quaternion }
  })
  return pose
}

function findSkinnedMesh(root) {
  let found = null
  root.traverse((o) => {
    if (!found && o.isSkinnedMesh) found = o
  })
  return found
}

export function createRetargeter(sourceRoot, targetRoot) {
  const sourcePose = bindPose(findSkinnedMesh(sourceRoot))
  const targetMesh = findSkinnedMesh(targetRoot)
  const targetPose = bindPose(targetMesh)

  // Ossos que existem nos dois, na ordem pai -> filho (o pai precisa estar pronto antes do filho)
  const pairs = []
  targetMesh.skeleton.bones[0].traverse((bone) => {
    const source = sourceRoot.getObjectByName(bone.name)
    if (bone.isBone && source && sourcePose[bone.name] && targetPose[bone.name]) pairs.push({ bone, source })
  })

  const hips = pairs[0] // o primeiro da lista é o quadril (raiz do esqueleto)
  const heightRatio = targetPose[hips.bone.name].position.y / sourcePose[hips.source.name].position.y

  const current = new THREE.Quaternion()
  const delta = new THREE.Quaternion()
  const restInverse = new THREE.Quaternion()

  // Rotação do osso relativa à raiz do próprio modelo
  function relativeRotation(bone, root, out) {
    root.getWorldQuaternion(_rootQ)
    return bone.getWorldQuaternion(out).premultiply(_rootQ.invert())
  }

  // Chamar a cada quadro, depois de atualizar a animação da origem
  return function apply() {
    sourceRoot.updateMatrixWorld(true)
    targetRoot.updateMatrixWorld(true)

    for (const { bone, source } of pairs) {
      // Quanto a origem girou desde a pose original
      relativeRotation(source, sourceRoot, current)
      restInverse.copy(sourcePose[source.name].quaternion).invert()
      delta.multiplyQuaternions(current, restInverse)

      // Mesmo giro aplicado à pose original do destino, convertido para a rotação local do osso
      _q.multiplyQuaternions(delta, targetPose[bone.name].quaternion)
      targetRoot.getWorldQuaternion(_rootQ)
      _q.premultiply(_rootQ)
      bone.parent.getWorldQuaternion(_parentQ)
      bone.quaternion.copy(_parentQ.invert().multiply(_q))
      bone.updateMatrixWorld(true)
    }

    // Quadril: copia o sobe/desce e o balanço, ajustado à altura do destino
    sourceRoot.worldToLocal(hips.source.getWorldPosition(_pos))
    _pos.sub(sourcePose[hips.source.name].position).multiplyScalar(heightRatio)
    _pos.add(targetPose[hips.bone.name].position)
    targetRoot.localToWorld(_pos)
    hips.bone.position.copy(hips.bone.parent.worldToLocal(_pos))
    hips.bone.updateMatrixWorld(true)
  }
}
