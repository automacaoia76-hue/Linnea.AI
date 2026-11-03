// Contas e formatos da tela Gráficos

export const gb = (value) => `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} GB`
export const mbOrGb = (mb) => (mb >= 1024 ? gb(mb / 1024) : `${Math.round(mb).toLocaleString('pt-BR')} MB`)

// "2026-10-04" -> data local (sem o fuso empurrar para o dia anterior)
export function parseDay(iso) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const shortDate = (iso) => parseDay(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
export const dayKey = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const DAY_MS = 86400000

// Previsão de quando o disco enche: reta que melhor passa pelos pontos (regressão linear) do espaço livre.
// null = histórico curto demais (precisa de 2 dias diferentes)
export function forecast(days) {
  if (days.length < 2) return null
  const xs = days.map((d) => parseDay(d.data).getTime() / DAY_MS)
  const ys = days.map((d) => d.livre_gb)
  if (xs.at(-1) - xs[0] < 1) return null
  const mx = xs.reduce((a, b) => a + b) / xs.length
  const my = ys.reduce((a, b) => a + b) / ys.length
  const slope =
    xs.reduce((sum, x, i) => sum + (x - mx) * (ys[i] - my), 0) / xs.reduce((sum, x) => sum + (x - mx) ** 2, 0)
  if (slope >= -0.01) return { perDay: slope, growing: true } // espaço livre estável ou aumentando
  const daysLeft = Math.max(Math.round(ys.at(-1) / -slope), 0)
  return { perDay: slope, daysLeft, date: new Date(parseDay(days.at(-1).data).getTime() + daysLeft * DAY_MS) }
}

// Pastas que mais cresceram nos últimos 7 dias (compara o último scan com o mais antigo da semana).
// null = ainda não há dois scans com o tamanho das pastas
export function folderGrowth(days, limit = 5) {
  const withFolders = days.filter((d) => d.pastas)
  const latest = withFolders.at(-1)
  if (!latest) return null
  const weekAgo = parseDay(latest.data).getTime() - 7 * DAY_MS
  const base = withFolders.find((d) => d !== latest && parseDay(d.data).getTime() >= weekAgo)
  if (!base) return null
  return Object.entries(latest.pastas)
    .filter(([name]) => name.includes('/')) // só as pastas de dentro (Downloads/Jogos), não a pessoal inteira
    .map(([name, mb]) => ({ name, mb, growth: mb - (base.pastas[name] || 0) }))
    .filter((folder) => folder.growth >= 1)
    .sort((a, b) => b.growth - a.growth)
    .slice(0, limit)
    .map((folder) => ({ ...folder, since: base.data }))
}
