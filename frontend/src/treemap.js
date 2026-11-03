// Treemap "squarified": divide um retângulo em quadradinhos com área proporcional ao tamanho de cada item,
// tentando deixá-los o mais "quadrados" possível (fica mais fácil de ler do que tiras finas).
// items: [{ ..., value }] do maior para o menor. Devolve os mesmos itens com { x, y, w, h } em pixels.

export function squarify(items, width, height) {
  const total = items.reduce((sum, item) => sum + item.value, 0)
  if (!total || !width || !height) return []
  const scale = (width * height) / total
  const nodes = items.map((item) => ({ item, area: item.value * scale }))

  const result = []
  let rect = { x: 0, y: 0, w: width, h: height }
  let row = []
  let i = 0
  while (i < nodes.length) {
    const side = Math.min(rect.w, rect.h)
    // Coloca o próximo item na linha atual enquanto isso não piorar o formato dos quadradinhos
    if (row.length === 0 || worst([...row, nodes[i]], side) <= worst(row, side)) {
      row.push(nodes[i])
      i++
    } else {
      rect = layoutRow(row, rect, result)
      row = []
    }
  }
  if (row.length) layoutRow(row, rect, result)
  return result
}

// Pior proporção (lado maior / lado menor) dos quadradinhos de uma linha
function worst(row, side) {
  const sum = row.reduce((s, n) => s + n.area, 0)
  const max = Math.max(...row.map((n) => n.area))
  const min = Math.min(...row.map((n) => n.area))
  return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min))
}

// Desenha uma linha ao longo do lado menor e devolve o espaço que sobrou
function layoutRow(row, rect, result) {
  const sum = row.reduce((s, n) => s + n.area, 0)
  if (rect.w >= rect.h) {
    const colW = sum / rect.h // coluna na esquerda
    let y = rect.y
    for (const n of row) {
      const h = n.area / colW
      result.push({ ...n.item, x: rect.x, y, w: colW, h })
      y += h
    }
    return { x: rect.x + colW, y: rect.y, w: rect.w - colW, h: rect.h }
  }
  const rowH = sum / rect.w // linha no topo
  let x = rect.x
  for (const n of row) {
    const w = n.area / rowH
    result.push({ ...n.item, x, y: rect.y, w, h: rowH })
    x += w
  }
  return { x: rect.x, y: rect.y + rowH, w: rect.w, h: rect.h - rowH }
}
