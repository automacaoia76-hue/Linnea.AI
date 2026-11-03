import { mbOrGb, shortDate } from '../chartUtils.js'

// Ranking das pastas que mais cresceram na semana (barras horizontais, um tom só).
// folders = [{ name: "Downloads/Jogos", mb, growth, since }] ou null (histórico curto demais)
export default function GrowthRanking({ folders }) {
  const biggest = folders?.[0]?.growth || 1
  return (
    <section className="chart-section">
      <header className="section-header">
        <div>
          <h3>Pastas que mais cresceram</h3>
          <p>{folders?.length ? `Desde ${shortDate(folders[0].since)} (últimos 7 dias)` : 'Nos últimos 7 dias'}</p>
        </div>
      </header>

      {!folders && <p className="section-empty">Preciso de pelo menos 2 scans em dias diferentes para comparar as pastas.</p>}
      {folders && folders.length === 0 && <p className="section-empty">Nenhuma pasta cresceu nesse período. 👍</p>}
      {folders?.length > 0 && (
        <ol className="ranking">
          {folders.map((folder) => (
            <li key={folder.name} title={`${folder.name}: agora com ${mbOrGb(folder.mb)}`}>
              <span className="ranking-name">{folder.name.replace('/', ' › ')}</span>
              <span className="ranking-track">
                <span className="ranking-bar" style={{ width: `${(folder.growth / biggest) * 100}%` }} />
              </span>
              <span className="ranking-value">+{mbOrGb(folder.growth)}</span>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
