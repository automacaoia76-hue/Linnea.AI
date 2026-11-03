import './LinneaStatus.css'

// Barra de status no topo: o que a Linnea está fazendo AGORA ("Linnea está olhando Downloads…").
// Usa os passos do raciocínio que o chat já recebe; some quando ela termina.

const TOOL_TEXT = {
  scan_disk: 'analisando o disco',
  rodar_scan: 'rodando um scan novo',
  destacar_card: 'destacando um card',
  abrir_tela: 'abrindo uma tela',
  olhar_pasta: 'olhando {pasta}',
  marcar_arquivos: 'marcando arquivos em {pasta}',
  iniciar_tour: 'começando o tour',
  mover_para_lixeira: 'mandando itens para a Lixeira',
  limpar_lixo: 'limpando o lixo',
  listar_duplicatas: 'procurando duplicatas',
  apagar_duplicatas: 'apagando duplicatas',
  planejar_organizacao_downloads: 'planejando a organização do Downloads',
  organizar_downloads: 'organizando o Downloads',
  desfazer_organizacao: 'desfazendo a organização',
  lembrar: 'anotando na memória',
  buscar_memoria: 'lembrando de conversas antigas',
  mostrar_plano: 'montando o plano',
  buscar_arquivos: 'procurando arquivos',
  mudar_configuracao: 'mudando as configurações',
  ver_configuracao_pc: 'olhando as peças do PC',
  listar_fotos_parecidas: 'comparando as suas fotos',
  listar_pastas_vazias_e_atalhos: 'procurando pastas vazias e atalhos quebrados',
  renomear_arquivos: 'renomeando arquivos',
  desfazer_renomeacao: 'desfazendo a renomeação',
  compactar_em_zip: 'compactando arquivos',
  programas_pesados: 'medindo os programas abertos',
  listar_inicializacao: 'olhando o que abre com o Windows',
  desativar_inicializacao: 'tirando programas da inicialização',
  reativar_inicializacao: 'devolvendo programas à inicialização',
  listar_programas_instalados: 'olhando os programas instalados',
  desinstalar_programa: 'abrindo o desinstalador',
  tamanho_cache_navegadores: 'medindo o cache dos navegadores',
  limpar_cache_navegador: 'limpando o cache do navegador',
}

// "olhar_pasta(caminho=C:\Users\Pichau\Downloads)" -> "Downloads"
function folderName(stepText) {
  const path = stepText.match(/(?:caminho|pasta)=([^,)]*)/)?.[1] || ''
  return path.split(/[\\/]/).filter(Boolean).pop() || 'uma pasta'
}

function statusText(run, scanning) {
  if (run.status === 'waiting') return 'esperando a sua permissão'
  if (run.status === 'thinking') {
    const last = run.steps.at(-1)
    if (last?.kind === 'acao') {
      const tool = last.text.split('(')[0]
      return (TOOL_TEXT[tool] || 'usando uma ferramenta').replace('{pasta}', folderName(last.text))
    }
    if (last?.kind === 'troca') return 'trocando para o modelo reserva'
    return run.writing ? 'escrevendo a resposta' : 'pensando'
  }
  if (scanning) return 'atualizando os números'
  return null
}

// run = último raciocínio da Linnea; scanning = um scan em segundo plano está rodando
export default function LinneaStatus({ run, scanning }) {
  const text = statusText(run, scanning)
  return (
    <div className={`linnea-status ${text ? 'visible' : ''}`} role="status" aria-live="polite">
      {text && (
        <>
          <span className="status-dot" />
          <span>
            Linnea está <strong>{text}</strong>…
          </span>
        </>
      )}
    </div>
  )
}
