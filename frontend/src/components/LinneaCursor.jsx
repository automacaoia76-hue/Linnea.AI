import { setCursorElement } from '../linneaCursor.js'
import './LinneaCursor.css'

// O cursor da Linnea (quem move é o linneaCursor.js). Fica por cima de tudo e não bloqueia cliques.
export default function LinneaCursor() {
  return (
    <div className="linnea-cursor" ref={setCursorElement} aria-hidden="true">
      <span className="cursor-ripple" />
      <svg width="30" height="30" viewBox="0 0 24 24">
        <defs>
          <linearGradient id="linnea-cursor-fill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4f9dff" />
            <stop offset="60%" stopColor="#8f6bff" />
            <stop offset="100%" stopColor="#e46bd8" />
          </linearGradient>
        </defs>
        <path d="M3 2 L20 11 L12.5 13 L9 21 Z" fill="url(#linnea-cursor-fill)" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
      <span className="cursor-label">Linnea</span>
    </div>
  )
}
