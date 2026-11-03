import { useEffect, useRef } from 'react'
import { onVoiceLevel } from '../voiceLevel.js'
import './VoiceOrb.css'

// Modo voz: a logo da Linnea grande, "respirando" enquanto ouve e pulsando no ritmo da voz quando ela fala.
// A conversa (legendas, cartões de aprovação) continua no chat, que fica no canto direito (CSS body.voice-mode).
// connecting = ainda ligando o microfone; onMinimize = ver o app sem encerrar; onStop = encerrar a conversa
export default function VoiceOrb({ connecting, onMinimize, onStop }) {
  const ref = useRef(null)

  // O volume entra numa variável CSS (--nivel) a cada quadro, sem redesenhar o React; ele cai devagar sozinho
  useEffect(() => {
    let level = 0
    let frame
    const stopListening = onVoiceLevel((volume) => {
      level = Math.max(level, volume)
    })
    const tick = () => {
      level *= 0.9
      const element = ref.current
      if (element) {
        element.style.setProperty('--nivel', level.toFixed(3))
        element.dataset.falando = level > 0.06 ? 'sim' : 'nao'
      }
      frame = requestAnimationFrame(tick)
    }
    tick()
    return () => {
      stopListening()
      cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <section className="voice-orb" ref={ref} aria-label="Conversa por voz com a Linnea">
      <div className="orb">
        <div className="orb-halo" />
        <img className="orb-logo" src="/logo.png" alt="" />
      </div>
      <p className="orb-status" aria-live="polite">
        {connecting ? (
          'Ligando o microfone…'
        ) : (
          <>
            <span className="when-listening">Pode falar, estou ouvindo…</span>
            <span className="when-speaking">Linnea falando…</span>
          </>
        )}
      </p>
      <div className="orb-buttons">
        <button onClick={onMinimize}>Ver o app</button>
        <button className="orb-stop" onClick={onStop}>
          Encerrar
        </button>
      </div>
    </section>
  )
}
