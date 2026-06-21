// SimilaridadeEditais.tsx — painel de análise de similaridade entre editais
// DESTINO: src/components/editais/SimilaridadeEditais.tsx
import { useSimilaridade } from './similaridade'

function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ background: 'var(--card-bg,#1a1b26)', border: '1px solid var(--border-md)', borderRadius: 14, padding: 16, ...style }}>{children}</div>
}

export default function SimilaridadeEditais({ onVoltar }: { onVoltar?: () => void }) {
  const { editais, stats, grupos, syncOn, setSyncOn, confirmar, rejeitar } = useSimilaridade()
  const candidatos = grupos.candidatos.slice(0, 40)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1100 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        {onVoltar && <button onClick={onVoltar} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border-md)', background: 'var(--surface)', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.8rem' }}>← Voltar</button>}
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-primary)' }}>🔗 Similaridade entre editais</div>
          <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Conteúdos repetidos entre os concursos e sincronização do progresso.</div>
        </div>
        <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.78rem', fontWeight: 700, color: syncOn ? '#10b981' : 'var(--text-muted)', cursor: 'pointer' }}>
          <input type="checkbox" checked={syncOn} onChange={e => setSyncOn(e.target.checked)} />
          Sincronizar progresso entre editais {syncOn ? '(ligado)' : '(desligado)'}
        </label>
      </div>

      {/* resumo geral */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
        {[
          { l: 'Editais', v: editais.length, c: 'var(--text-primary)' },
          { l: 'Subtópicos (total)', v: stats.totalSub, c: 'var(--text-primary)' },
          { l: 'Conteúdos únicos', v: stats.totalGrupos, c: '#60a5fa' },
          { l: 'Compartilhados (≥2)', v: stats.gruposCompartilhados, c: '#10b981' },
        ].map(k => (
          <Card key={k.l} style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.8rem', color: k.c, lineHeight: 1 }}>{k.v}</div>
            <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginTop: 4 }}>{k.l}</div>
          </Card>
        ))}
      </div>

      {/* por edital */}
      <Card>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-primary)', marginBottom: 12 }}>Por edital — exclusivo vs compartilhado</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {stats.porEdital.map(e => {
            const pctComp = e.total ? Math.round((e.compartilhados / e.total) * 100) : 0
            return (
              <div key={e.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: 4 }}>
                  <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}><span style={{ display: 'inline-block', width: 9, height: 9, borderRadius: 2, background: e.cor, marginRight: 6 }} />{e.nome}</span>
                  <span style={{ color: 'var(--text-muted)' }}>{e.compartilhados} compart. · {e.exclusivos} exclusivos · {e.total} total</span>
                </div>
                <div style={{ display: 'flex', height: 10, borderRadius: 6, overflow: 'hidden', background: 'var(--surface,rgba(125,125,125,0.08))' }}>
                  <div title={`${pctComp}% compartilhado`} style={{ width: `${pctComp}%`, background: '#10b981' }} />
                  <div style={{ flex: 1, background: e.cor, opacity: 0.5 }} />
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* matriz de pares */}
      <Card>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-primary)', marginBottom: 12 }}>Quanto de um já está no outro</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {stats.pares.filter(p => p.aId < p.bId).map(p => {
            const inverso = stats.pares.find(x => x.aId === p.bId && x.bId === p.aId)
            return (
              <div key={p.aId + p.bId} style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: '0.78rem', padding: '8px 10px', borderRadius: 10, background: 'var(--surface,rgba(125,125,125,0.05))', border: '1px solid var(--border-md)' }}>
                <span style={{ flex: 1, color: 'var(--text-secondary)' }}><b style={{ color: 'var(--text-primary)' }}>{p.comuns}</b> subtópicos em comum</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{p.aNome.split('—')[0].trim()} ↔ {p.bNome.split('—')[0].trim()}</span>
                <span style={{ fontWeight: 800, color: '#10b981', minWidth: 110, textAlign: 'right' }}>{p.pct}% / {inverso ? inverso.pct : 0}%</span>
              </div>
            )
          })}
        </div>
        <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 8 }}>Ex.: "62% / 48%" = 62% do 1º edital está no 2º, e 48% do 2º está no 1º.</div>
      </Card>

      {/* candidatos aproximados a confirmar */}
      <Card>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-primary)', marginBottom: 4 }}>Pares parecidos para confirmar ({grupos.candidatos.length})</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 12 }}>Nomes diferentes mas muito parecidos. Confirme os que são o <b>mesmo conteúdo</b> — só os confirmados entram na sincronização.</div>
        {candidatos.length === 0
          ? <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Nada pendente. Conteúdos com nome idêntico já são casados automaticamente.</div>
          : <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {candidatos.map(c => (
              <div key={c.a + c.b} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, background: 'var(--surface,rgba(125,125,125,0.05))', border: '1px solid var(--border-md)' }}>
                <span style={{ fontSize: '0.66rem', fontWeight: 800, color: '#f59e0b', minWidth: 38 }}>{Math.round(c.score * 100)}%</span>
                <span style={{ flex: 1, fontSize: '0.76rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  <span style={{ color: 'var(--text-primary)' }}>{c.exA}</span>
                  <span style={{ color: 'var(--text-muted)' }}> ≈ </span>
                  <span style={{ color: 'var(--text-primary)' }}>{c.exB}</span>
                </span>
                <button onClick={() => confirmar(c.a, c.b)} style={{ padding: '5px 12px', borderRadius: 8, border: 'none', background: '#10b981', color: '#fff', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer' }}>✓ É o mesmo</button>
                <button onClick={() => rejeitar(c.a, c.b)} style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border-md)', background: 'transparent', color: 'var(--text-muted)', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer' }}>✕ Diferente</button>
              </div>
            ))}
          </div>}
      </Card>
    </div>
  )
}
