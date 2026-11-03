import { useEffect, useState } from 'react'

// Número que "conta" até o valor novo (ex.: 0 → 217) em vez de aparecer pronto.
// value vem formatado em pt-BR ("217", "2,14", "1.234"). id identifica o número (ex.: o card),
// para lembrar o último valor mostrado: se o card for recriado com o mesmo número, ele não conta de novo.

const DURATION_MS = 900
const lastShown = new Map() // id -> último número mostrado

const parse = (text) => Number(text.replace(/\./g, '').replace(',', '.')) || 0
const decimalsOf = (text) => (text.includes(',') ? text.split(',')[1].length : 0)
const format = (number, decimals) =>
  number.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })

export default function CountUp({ id, value }) {
  const target = parse(value)
  const decimals = decimalsOf(value)
  const start = lastShown.get(id) ?? 0
  const [shown, setShown] = useState(() => format(start, decimals))

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    lastShown.set(id, target)
    if (start === target || reduceMotion) {
      // Sem animação: mostra o valor final já no próximo quadro
      const frame = requestAnimationFrame(() => setShown(value))
      return () => cancelAnimationFrame(frame)
    }
    let frame
    const begin = performance.now()
    const tick = (now) => {
      const progress = Math.min((now - begin) / DURATION_MS, 1)
      const eased = 1 - (1 - progress) ** 3 // começa rápido e desacelera no fim
      setShown(progress < 1 ? format(start + (target - start) * eased, decimals) : value)
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  return shown
}
