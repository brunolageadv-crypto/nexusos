// Camada de IA do módulo Projetos 3D — reaproveita a config global do Nexus
// (localStorage 'nexus_ai_cfg' = { url, key, model, kind:'gemini'|'openai'|'anthropic', workerUrl })

function getCfg(): any { try { return JSON.parse(localStorage.getItem('nexus_ai_cfg') || '{}') } catch { return {} } }

export function iaConfigurada(): boolean {
  const c = getCfg()
  return !!(c.kind && c.url && c.key)
}

async function geminiDireto(cfg: any, prompt: string): Promise<string> {
  const r = await fetch(`${cfg.url}?key=${cfg.key}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) })
  if (!r.ok) throw new Error(`Gemini direto falhou (HTTP ${r.status})`)
  const d = await r.json()
  if (d?.error) throw new Error(d.error.message)
  return d?.candidates?.[0]?.content?.parts?.[0]?.text || ''
}
async function geminiViaWorker(cfg: any, prompt: string): Promise<string> {
  const model = cfg.model || 'gemini-2.5-flash'
  const r = await fetch(`${cfg.workerUrl}?model=${model}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) })
  if (!r.ok) throw new Error(`Worker falhou (HTTP ${r.status})`)
  const d = await r.json()
  if (d?.error) throw new Error(d.error.message)
  return d?.candidates?.[0]?.content?.parts?.[0]?.text || ''
}

async function callOnce(prompt: string): Promise<string> {
  const cfg = getCfg()
  if (!cfg.kind || !cfg.url || !cfg.key) throw new Error('IA não configurada. Configure o Gemini no Nexus (mesma config do PDF Reader).')
  if (cfg.kind === 'gemini') {
    try { return await geminiDireto(cfg, prompt) }
    catch (err) {
      if (cfg.workerUrl) { try { return await geminiViaWorker(cfg, prompt) } catch (e2: any) { throw new Error(`Direto e Worker falharam. ${e2?.message || ''}`) } }
      throw err
    }
  }
  if (cfg.kind === 'anthropic') {
    const r = await fetch(cfg.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': cfg.key, 'anthropic-version': '2023-06-01' }, body: JSON.stringify({ model: cfg.model || 'claude-haiku-4-5', max_tokens: 900, messages: [{ role: 'user', content: prompt }] }) })
    const d = await r.json(); return (d?.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')
  }
  const r = await fetch(cfg.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key}` }, body: JSON.stringify({ model: cfg.model || 'gpt-4o-mini', temperature: 0.4, messages: [{ role: 'user', content: prompt }] }) })
  const d = await r.json(); return d?.choices?.[0]?.message?.content || ''
}

const transitorio = (m: string) => /(429|500|502|503|504|timeout|network|failed to fetch|temporar|overload|unavailable|exhaust|quota|rate.?limit|resource_exhausted)/i.test(m || '')
const espera = (ms: number) => new Promise(res => setTimeout(res, ms))

export async function callLLM3D(prompt: string, tentativas = 3): Promise<string> {
  let ultimo: any
  for (let i = 0; i < tentativas; i++) {
    try { return await callOnce(prompt) }
    catch (e: any) { ultimo = e; if (!transitorio(e?.message || '') || i === tentativas - 1) break; await espera(800 * (i + 1)) }
  }
  throw ultimo
}

// ─── Prompts ────────────────────────────────────────────────────────────────
interface ContextoImpressora { nome: string; bx: number; by: number; bz: number; bico: number; materiais: string[] }
interface ContextoProjeto {
  nome: string; descricao: string; material: string
  dimsX?: number; dimsY?: number; dimsZ?: number; volume?: number
  altura_camada?: number; infill?: number
}

export function promptPlanejador(p: ContextoProjeto, imp: ContextoImpressora): string {
  const dims = p.dimsX ? `${p.dimsX.toFixed(1)} × ${p.dimsY?.toFixed(1)} × ${p.dimsZ?.toFixed(1)} mm (volume ~${p.volume?.toFixed(1)} cm³)` : 'ainda sem STL analisado'
  return `Você é um especialista em impressão 3D FDM ajudando um iniciante.
Impressora: ${imp.nome}, área de impressão ${imp.bx}×${imp.by}×${imp.bz} mm, bico ${imp.bico} mm, materiais ${imp.materiais.join(', ')}.
Projeto: "${p.nome}". ${p.descricao ? `Descrição: ${p.descricao}.` : ''}
Material escolhido: ${p.material || 'não definido'}. Dimensões do modelo: ${dims}.

Dê um plano de impressão prático e direto, em português, cobrindo:
1. Melhor orientação na mesa (e por quê).
2. Necessidade de suportes (sim/não e onde).
3. Configurações recomendadas: altura de camada, infill (%), paredes/perímetros, velocidade, brim/raft.
4. Temperaturas (bico e mesa) para o material.
5. Riscos prováveis nessa peça (warping, overhangs, primeira camada) e como mitigar.
6. Se a peça não couber na mesa, diga claramente que precisa redimensionar ou dividir.
Seja conciso, use tópicos curtos. Não invente recursos que a impressora não tem.`
}

export function promptTroubleshooting(problema: string, p: ContextoProjeto, imp: ContextoImpressora): string {
  return `Você é um especialista em impressão 3D FDM. Impressora: ${imp.nome} (área ${imp.bx}×${imp.by}×${imp.bz} mm, bico ${imp.bico} mm). Material: ${p.material || 'PLA'}.
Problema relatado pelo usuário (iniciante): "${problema}".
Liste as causas mais prováveis em ordem de probabilidade e, para cada uma, a correção objetiva (configuração ou ação). Em português, tópicos curtos e práticos. No fim, sugira o primeiro ajuste a testar.`
}
