// Funções de formatação usadas pelos cards e pela tabela (padrão brasileiro: vírgula decimal)

// Tamanho em MB -> "12,2 GB" ou "187 MB"
export function formatSize(mb) {
  if (mb >= 1024) return `${(mb / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GB`
  return `${Math.round(mb).toLocaleString('pt-BR')} MB`
}

// Tamanho em GB -> { value, unit } para os números grandes dos cards (menos de 1 GB vira MB)
export function sizeParts(gb) {
  if (gb < 1) return { value: Math.round(gb * 1024).toLocaleString('pt-BR'), unit: 'MB' }
  return { value: gb.toLocaleString('pt-BR', { maximumFractionDigits: gb >= 100 ? 0 : 2 }), unit: 'GB' }
}

// Data ISO -> "Hoje 08:34", "Ontem 17:42" ou só a data para dias mais antigos ("23/07", "29/09/25")
export function formatDate(iso) {
  if (!iso) return '—'
  const date = new Date(iso)
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  const days = Math.floor((new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) / 86400000)
  if (days === 0) return `Hoje ${time}`
  if (days === 1) return `Ontem ${time}`
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: sameYear ? undefined : '2-digit' })
}
