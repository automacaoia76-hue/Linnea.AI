import { formatDate, formatSize } from '../format.js'
import './FilesTable.css'

// Tabela com os maiores arquivos encontrados no scan (Nome, Tamanho, Tipo, Modificado)

// Cor do ícone de arquivo conforme o tipo
function typeColor(type) {
  if (/Vídeo/.test(type)) return 'blue'
  if (/PDF|Documento|Planilha|Apresentação/.test(type)) return 'pink'
  if (/ZIP|RAR|7Z/.test(type)) return 'green'
  if (/Instala|Imagem de disco/.test(type)) return 'purple'
  return 'gray'
}

function FileIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
    </svg>
  )
}

export default function FilesTable({ files, scannedAt }) {
  const shown = files.slice(0, 6)
  const totalMb = shown.reduce((sum, f) => sum + f.tamanho_mb, 0)

  return (
    <section className="files glass">
      <table>
        <thead>
          <tr>
            <th>Nome</th>
            <th className="num">Tamanho</th>
            <th>Tipo</th>
            <th className="num">Modificado</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((file, i) => (
            <tr key={file.caminho} className={i === 0 ? 'top' : ''} title={file.caminho}>
              <td>
                <div className="file-cell">
                  <span className={`file-icon ${typeColor(file.tipo)}`}>
                    <FileIcon />
                  </span>
                  <span className="file-name">{file.nome}</span>
                </div>
              </td>
              <td className="num">{formatSize(file.tamanho_mb)}</td>
              <td className="file-type">{file.tipo}</td>
              <td className="num">{formatDate(file.modificado)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <footer>
        <span>
          {shown.length} itens · scan {formatDate(scannedAt)}
        </span>
        <span className="files-total">{formatSize(totalMb)} nos maiores arquivos</span>
      </footer>
    </section>
  )
}
