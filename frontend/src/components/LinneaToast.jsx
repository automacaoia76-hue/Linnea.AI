import { useEffect } from 'react'
import { SparkleIcon } from './Icons.jsx'
import './LinneaToast.css'

// Aviso da Linnea no canto da tela (ex.: "Achei 2 GB de lixo novo 👀"), que some sozinho depois de alguns segundos
export default function LinneaToast({ text, onClose }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 7000)
    return () => clearTimeout(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="linnea-toast glass" role="status" aria-live="polite">
      <span className="toast-avatar">
        <SparkleIcon size={16} />
      </span>
      <div className="toast-body">
        <strong>Linnea</strong>
        <span>{text}</span>
      </div>
      <button className="toast-close" onClick={onClose} aria-label="Fechar aviso">
        ✕
      </button>
    </div>
  )
}
