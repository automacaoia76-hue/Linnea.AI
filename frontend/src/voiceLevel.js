// Volume da fala da Linnea (0 a 1), para a logo do modo voz pulsar no ritmo. Mesmo esquema do robotSignals.js.
const listeners = new Set()

export function voiceLevel(volume) {
  listeners.forEach((listener) => listener(volume))
}

// Devolve uma função que para de ouvir
export function onVoiceLevel(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
