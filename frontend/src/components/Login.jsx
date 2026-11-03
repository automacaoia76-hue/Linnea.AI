import { useState } from 'react'
import { login } from '../api.js'
import './Login.css'

// Tela de login da Linnea na nuvem (celular, PC da empresa). Só aparece online; no PC o app abre direto.
// onDone(): entrou com sucesso
export default function Login({ onDone }) {
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await login(email.trim(), senha)
      onDone()
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card glass" onSubmit={handleSubmit}>
        <img className="login-logo" src="/logo.png" alt="" />
        <h1>
          <span className="gradient-text">Linnea.AI</span>
        </h1>
        <p>Entre para falar com a Linnea sobre o seu PC.</p>

        <label>
          E-mail
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Senha
          <input type="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
        </label>

        {error && <p className="login-error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
