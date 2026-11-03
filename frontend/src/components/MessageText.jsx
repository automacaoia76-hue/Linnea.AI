// Mostra o texto da Linnea com a formatação que ela usa (Markdown simples):
// títulos (###), **negrito**, `código`, listas, tabelas e linhas separadoras (---, que ignoramos).
// Monta elementos React (sem HTML cru, mais seguro).

function inline(text) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>
    if (part.startsWith('`') && part.endsWith('`')) return <code key={i}>{part.slice(1, -1)}</code>
    return part
  })
}

export default function MessageText({ text }) {
  const blocks = []
  let list = null
  let table = null

  text.split('\n').forEach((line, i) => {
    const trimmed = line.trim()

    // Tabela: linhas que começam com "|". A linha "|---|---|" só separa o cabeçalho, então pulamos.
    if (trimmed.startsWith('|')) {
      list = null
      if (/^\|[\s:|-]+\|$/.test(trimmed)) return
      const cells = trimmed.slice(1, -1).split('|').map((cell) => cell.trim())
      if (cells.every((cell) => !cell)) return
      if (!table) {
        table = []
        blocks.push(
          <table key={`t${i}`}>
            <tbody>{table}</tbody>
          </table>
        )
      }
      table.push(
        <tr key={i}>
          {cells.map((cell, c) => (
            <td key={c}>{inline(cell)}</td>
          ))}
        </tr>
      )
      return
    }
    table = null

    const item = line.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)/)
    if (item) {
      if (!list) {
        list = []
        blocks.push(<ul key={`l${i}`}>{list}</ul>)
      }
      list.push(<li key={i}>{inline(item[1])}</li>)
      return
    }
    list = null

    if (/^-{3,}$/.test(trimmed)) return // linha separadora
    const heading = trimmed.match(/^#{1,6}\s+(.*)/)
    if (heading) blocks.push(<h4 key={i}>{inline(heading[1])}</h4>)
    else if (trimmed) blocks.push(<p key={i}>{inline(line)}</p>)
  })

  return <div className="message-text">{blocks}</div>
}
