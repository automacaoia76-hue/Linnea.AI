import { HomeIcon, FolderIcon, ChartIcon, SettingsIcon, SunIcon, MoonIcon } from './Icons.jsx'
import './Sidebar.css'

const items = [
  { id: 'inicio', label: 'Início', Icon: HomeIcon },
  { id: 'pastas', label: 'Arquivos', Icon: FolderIcon },
  { id: 'relatorios', label: 'Gráficos', Icon: ChartIcon },
  { id: 'configuracoes', label: 'Configurações', Icon: SettingsIcon },
]

// active = tela aberta; setActive troca de tela (quem guarda a tela aberta é o App)
// hide = telas que não aparecem (na nuvem, Arquivos: a lista de arquivos não sai do PC)
export default function Sidebar({ theme, onToggleTheme, active, setActive, hide = [] }) {
  return (
    <nav className="sidebar">
      {items.filter(({ id }) => !hide.includes(id)).map(({ id, label, Icon }) => (
        <button
          key={id}
          className={`sidebar-item ${active === id ? 'active' : ''}`}
          onClick={() => setActive(id)}
          title={label}
          aria-label={label}
        >
          <Icon size={20} />
        </button>
      ))}

      {/* Alternar tema: mostra a lua no claro (vai para o escuro) e o sol no escuro */}
      <button
        className="sidebar-item theme-toggle"
        onClick={onToggleTheme}
        title={theme === 'dark' ? 'Mudar para o modo claro' : 'Mudar para o modo escuro'}
        aria-label={theme === 'dark' ? 'Mudar para o modo claro' : 'Mudar para o modo escuro'}
      >
        {theme === 'dark' ? <SunIcon size={18} /> : <MoonIcon size={18} />}
      </button>
    </nav>
  )
}
