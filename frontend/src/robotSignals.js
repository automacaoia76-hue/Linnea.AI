// Canal de sinais para o robô 3D: o app avisa ("a Linnea escreveu uma palavra", "aponte para este card",
// "comemore", "fique preocupado") e o robô reage dentro da animação dele. É só uma lista de funções ouvintes.
//   word                 -> a aura pulsa (uma vez por pedaço de texto que chega)
//   point  { x, y }      -> vira a cabeça e aponta com o braço para esse ponto da tela (em pixels)
//   celebrate            -> comemora (pulinho, brilho e faíscas mais rápidas)
//   worried              -> pisca rápido por alguns segundos (achou muito lixo)

const listeners = new Set()

export function robotSignal(name, data) {
  listeners.forEach((listener) => listener(name, data))
}

// Devolve uma função que para de ouvir
export function onRobotSignal(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
