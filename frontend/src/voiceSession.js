import { loginToken } from './api.js'

// Modo conversa por voz: grava o microfone, manda para o backend (/api/voz) e toca a fala da Linnea.
// O backend repassa tudo ao Gemini Live; aqui só cuidamos do áudio.
//
// startVoice({ onCaption, onSpeaking, onUi, onApproval, onEnd }) -> { stop, decide }
//   stop(): encerra a conversa; decide(aprovar): responde ao cartão de permissão
//   onCaption(quem, texto): pedaço da legenda ('voce' ou 'linnea'); quem === 'fim' quando ela termina de falar
//   onSpeaking(volume): chamado quando cada pedaço da fala começa a tocar (0 a 1; a logo e a aura pulsam)
//   onUi(acao): ação dela na tela (destacar card, abrir pasta...), igual às do chat escrito
//   onApproval(acoes): ela quer mexer em arquivos e espera você aprovar ou recusar
//   onEnd(erro): a conversa acabou (erro = mensagem, ou vazio se você encerrou)

// Roda num processo de áudio separado: junta ~100 ms do microfone e converte para PCM 16 bits
const RECORDER = `
class Recorder extends AudioWorkletProcessor {
  constructor() { super(); this.buffer = [] }
  process(inputs) {
    const channel = inputs[0][0]
    if (channel) {
      for (const sample of channel) this.buffer.push(Math.max(-1, Math.min(1, sample)) * 0x7fff)
      if (this.buffer.length >= 1600) {
        this.port.postMessage(Int16Array.from(this.buffer).buffer)
        this.buffer = []
      }
    }
    return true
  }
}
registerProcessor('recorder', Recorder)
`

// Conversa ligada agora (null = desligada). O tour usa para a Linnea ler os balões em voz alta.
let active = null

// Pede para a Linnea ler um texto em voz alta; onDone() é chamado quando ela TERMINA de falar.
// Devolve false se a conversa por voz estiver desligada (aí quem chamou segue sem voz).
export function voiceSpeak(text, onDone) {
  if (!active) return false
  active.speak(text, onDone)
  return true
}

export async function startVoice({ onCaption, onSpeaking, onUi, onApproval, onEnd }) {
  // echoCancellation: o microfone não "ouve" a própria Linnea saindo da caixa de som
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  })
  const micContext = new AudioContext({ sampleRate: 16000 }) // o Gemini quer ouvir em 16 kHz
  const speakerContext = new AudioContext({ sampleRate: 24000 }) // e fala em 24 kHz
  const moduleUrl = URL.createObjectURL(new Blob([RECORDER], { type: 'application/javascript' }))
  await micContext.audioWorklet.addModule(moduleUrl)
  const recorder = new AudioWorkletNode(micContext, 'recorder')
  micContext.createMediaStreamSource(stream).connect(recorder)

  // ?token=: na Linnea na nuvem, a voz também precisa do login
  const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/voz?token=${encodeURIComponent(loginToken())}`)
  ws.binaryType = 'arraybuffer'
  recorder.port.onmessage = (event) => ws.readyState === WebSocket.OPEN && ws.send(event.data)

  // Fila da fala: cada pedaço começa quando o anterior termina.
  // No começo de cada fala, espera 0,25 s antes de tocar: se um pedaço atrasar na internet, não fica buraco (voz travada)
  const CUSHION = 0.25
  let playing = []
  let nextStart = 0
  let lastAudioAt = 0 // quando chegou o último pedaço de fala (para saber se ela está quieta)
  function play(data) {
    lastAudioAt = performance.now()
    const pcm = new Int16Array(data)
    let sum = 0
    for (let i = 0; i < pcm.length; i += 4) sum += (pcm[i] / 0x8000) ** 2 // volume do pedaço (amostra 1 de cada 4 basta)
    const volume = Math.min(1, Math.sqrt(sum / (pcm.length / 4)) * 3)
    const buffer = speakerContext.createBuffer(1, pcm.length, 24000)
    buffer.getChannelData(0).set(Float32Array.from(pcm, (sample) => sample / 0x8000))
    const source = speakerContext.createBufferSource()
    source.buffer = buffer
    source.connect(speakerContext.destination)
    if (nextStart < speakerContext.currentTime) nextStart = speakerContext.currentTime + CUSHION // fila vazia: começa com folga
    source.start(nextStart)
    // O volume vai para a tela na hora em que este pedaço COMEÇA a tocar (ele pode esperar na fila)
    setTimeout(() => onSpeaking(volume), Math.max(0, (nextStart - speakerContext.currentTime) * 1000))
    nextStart += buffer.duration
    playing.push(source)
    source.onended = () => (playing = playing.filter((item) => item !== source))
  }
  // Você falou por cima: ela para na hora
  function silence() {
    playing.forEach((source) => source.stop())
    playing = []
    nextStart = 0
  }

  // Fala pedida pelo tour. Só manda o texto quando ela está quieta há 1,2 s: se mandar enquanto ela fala
  // (ex.: o "Vamos lá!"), o Gemini acha que é alguém falando por cima e corta a fala dela.
  // Depois espera o fim da fala e o áudio acabar de tocar, e avisa.
  let speakDone = null
  let speakWait = null
  function speak(text, onDone) {
    clearInterval(speakWait)
    speakWait = setInterval(() => {
      const quiet = speakerContext.currentTime >= nextStart && performance.now() - lastAudioAt > 1200
      if (!quiet || ws.readyState !== WebSocket.OPEN) return
      clearInterval(speakWait)
      speakDone = onDone
      ws.send(JSON.stringify({ tipo: 'falar', texto: text }))
    }, 200)
  }
  function finishSpeak() {
    if (!speakDone) return
    const done = speakDone
    speakDone = null
    const stillPlaying = Math.max(0, nextStart - speakerContext.currentTime) // o que ainda está na fila para tocar
    setTimeout(done, stillPlaying * 1000 + 500)
  }
  active = { speak }

  let error = ''
  ws.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) {
      play(event.data)
      return
    }
    const message = JSON.parse(event.data)
    if (message.tipo === 'voce' || message.tipo === 'linnea') {
      if (message.tipo === 'voce') {
        // Você falou: o tour para de passar sozinho e espera você clicar em "Próximo"
        clearInterval(speakWait)
        speakDone = null
      }
      onCaption(message.tipo, message.texto)
    } else if (message.tipo === 'interrompido') {
      silence()
      onCaption('fim', '')
    } else if (message.tipo === 'fim_da_fala') {
      onCaption('fim', '')
      finishSpeak()
    }
    else if (message.tipo === 'ui') onUi(message.acao)
    else if (message.tipo === 'aprovacao') onApproval(message.acoes)
    else if (message.tipo === 'erro') error = message.texto
  }

  let stopped = false
  function stop() {
    if (stopped) return
    stopped = true
    active = null
    speakDone = null
    clearInterval(speakWait)
    silence()
    ws.close()
    stream.getTracks().forEach((track) => track.stop()) // desliga o microfone (some o ícone de gravação do navegador)
    micContext.close()
    speakerContext.close()
    URL.revokeObjectURL(moduleUrl)
  }
  ws.onerror = () => (error = error || 'Não consegui conectar à conversa por voz. A API está ligada?')
  ws.onclose = () => {
    stop()
    onEnd(error)
  }
  const decide = (aprovar) => ws.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ tipo: 'decisao', aprovar }))
  return { stop, decide }
}
