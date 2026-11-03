import './ApprovalCard.css'

// Cartão de permissão: aparece quando a Linnea quer mexer nos arquivos e espera o usuário decidir.
// acoes = [{ nome, args }], status = 'pendente' | 'aprovado' | 'recusado'

// Texto de cada ação, em linguagem simples (e se dá para desfazer ou não)
function describe({ nome, args }) {
  if (nome === 'mover_para_lixeira') {
    const paths = args.caminhos || []
    // Sem extensão no nome = provavelmente uma pasta inteira (ela vai com tudo o que tem dentro)
    const label = (path) => {
      const name = path.split(/[\\/]/).pop()
      return /\.[^.\\/]{1,6}$/.test(name) ? name : `📁 ${name} (pasta inteira)`
    }
    return {
      title: `Mover ${paths.length} ${paths.length === 1 ? 'item' : 'itens'} para a Lixeira`,
      items: paths.map(label),
      note: 'Dá para restaurar depois pela Lixeira do Windows.',
      danger: false,
    }
  }
  if (nome === 'apagar_duplicatas') {
    const files = args.remover || []
    return {
      title: `Apagar ${files.length} ${files.length === 1 ? 'cópia duplicada' : 'cópias duplicadas'}`,
      items: files.map((path) => path.split(/[\\/]/).pop()),
      note: 'Fica 1 cópia de cada arquivo. As extras vão para a Lixeira (dá para restaurar).',
      danger: false,
    }
  }
  if (nome === 'organizar_downloads') {
    const folders = args.categorias || []
    return {
      title: `Organizar a pasta Downloads em ${folders.length} ${folders.length === 1 ? 'subpasta' : 'subpastas'}`,
      items: folders.map((name) => `Downloads\\${name}`),
      note: 'Só os arquivos soltos são movidos. Dá para desfazer depois.',
      danger: false,
    }
  }
  if (nome === 'desfazer_organizacao') {
    return {
      title: 'Desfazer a última organização da pasta Downloads',
      items: [],
      note: 'Os arquivos voltam para onde estavam e as pastas vazias somem.',
      danger: false,
    }
  }
  const fileName = (path) => String(path).split(/[\\/]/).pop()
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
  if (nome === 'renomear_arquivos') {
    const names = args.nomes || []
    return {
      title: `Renomear ${plural(names.length, 'arquivo', 'arquivos')}`,
      items: names.map((n) => `${n.atual} → ${n.novo}`),
      note: 'Dá para desfazer depois.',
      danger: false,
    }
  }
  if (nome === 'desfazer_renomeacao') {
    return { title: 'Desfazer a última renomeação', items: [], note: 'Os arquivos voltam ao nome antigo.', danger: false }
  }
  if (nome === 'compactar_em_zip') {
    const files = args.itens || []
    return {
      title: `Compactar ${plural(files.length, 'arquivo', 'arquivos')} em "${args.nome_zip}"`,
      items: files.map(fileName),
      note: 'O .zip fica na mesma pasta e os originais vão para a Lixeira (dá para restaurar).',
      danger: false,
    }
  }
  if (nome === 'desativar_inicializacao' || nome === 'reativar_inicializacao') {
    const names = args.nomes || []
    const off = nome === 'desativar_inicializacao'
    return {
      title: off ? `Não abrir ${plural(names.length, 'programa', 'programas')} junto com o Windows` : 'Voltar a abrir com o Windows',
      items: names,
      note: off ? 'O programa continua instalado. Dá para reativar depois.' : 'Eles voltam a abrir quando o Windows liga.',
      danger: false,
    }
  }
  if (nome === 'desinstalar_programa') {
    return {
      title: `Desinstalar "${args.nome}"`,
      items: [],
      note: '⚠️ Remove o programa do PC. O desinstalador dele vai abrir para você terminar.',
      danger: true,
    }
  }
  if (nome === 'limpar_cache_navegador') {
    return {
      title: `Limpar o cache: ${(args.navegadores || []).join(', ')}`,
      items: [],
      note: 'Permanente. Não apaga senhas, favoritos nem histórico. Feche o navegador antes.',
      danger: true,
    }
  }
  if (nome === 'limpar_lixo') {
    return {
      title: 'Apagar os temporários e esvaziar a Lixeira',
      items: [],
      note: 'Permanente: não dá para desfazer.',
      danger: true,
    }
  }
  return { title: nome, items: [], note: '', danger: true }
}

export default function ApprovalCard({ acoes, status, onApprove, onReject }) {
  const actions = acoes.map(describe)
  const danger = actions.some((action) => action.danger)

  return (
    <div className={`approval ${danger ? 'danger' : ''} ${status}`}>
      <p className="approval-kicker">A Linnea precisa da sua permissão</p>

      {actions.map((action, i) => (
        <div key={i} className="approval-action">
          <strong>{action.title}</strong>
          {action.items.length > 0 && (
            <ul>
              {action.items.slice(0, 5).map((item) => (
                <li key={item}>{item}</li>
              ))}
              {action.items.length > 5 && <li>… e mais {action.items.length - 5}</li>}
            </ul>
          )}
          {action.note && <span className="approval-note">{action.note}</span>}
        </div>
      ))}

      {status === 'pendente' ? (
        <div className="approval-buttons">
          <button className="approve" onClick={onApprove}>
            Aprovar
          </button>
          <button className="reject" onClick={onReject}>
            Recusar
          </button>
        </div>
      ) : (
        <p className="approval-result">{status === 'aprovado' ? '✓ Você aprovou' : '✕ Você recusou'}</p>
      )}
    </div>
  )
}
