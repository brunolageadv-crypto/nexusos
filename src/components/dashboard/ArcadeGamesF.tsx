import { useState, useEffect, useCallback, useRef } from 'react'
import type { GameProps } from './Arcade'

function SBar({ items }: { items: { l: string; v: string | number; c: string }[] }) {
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 6 }}>
      {items.map(it => (
        <span key={it.l} style={{ padding: '4px 11px', borderRadius: 8, background: `rgba(${it.c},0.1)`, border: `1px solid rgba(${it.c},0.3)`, fontSize: '0.72rem', fontWeight: 700, color: `rgb(${it.c})` }}>
          {it.l}{it.v !== '' ? ': ' + it.v : ''}
        </span>
      ))}
    </div>
  )
}
function RBtn({ onClick, label = '↺ Novo', color = '#60a5fa' }: { onClick: () => void; label?: string; color?: string }) {
  return <button onClick={onClick} style={{ padding: '7px 18px', borderRadius: 10, border: 'none', background: `linear-gradient(135deg,${color},${color}88)`, color: '#fff', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer' }}>{label}</button>
}

// ══════════════════════════════════════════════════════════════════════════════
// 1. NONOGRAM (Picross) 5×5
// ══════════════════════════════════════════════════════════════════════════════
export function GameNonogram({ onEnd, bestScore: _bs }: GameProps) {
  const N = 7
  const PUZZLES = [
    // Each puzzle: solution grid (1=filled)
    [[1,1,1,1,1,1,1],[1,0,0,0,0,0,1],[1,0,1,1,1,0,1],[1,0,1,0,1,0,1],[1,0,1,1,1,0,1],[1,0,0,0,0,0,1],[1,1,1,1,1,1,1]],
    [[0,0,1,1,1,0,0],[0,1,0,0,0,1,0],[1,0,0,0,0,0,1],[1,0,0,0,0,0,1],[1,0,0,0,0,0,1],[0,1,0,0,0,1,0],[0,0,1,1,1,0,0]],
    [[0,1,1,1,1,1,0],[1,1,0,0,0,1,1],[1,0,0,0,0,0,1],[1,0,0,1,0,0,1],[1,0,0,0,0,0,1],[1,1,0,0,0,1,1],[0,1,1,1,1,1,0]],
    [[1,0,0,0,0,0,1],[1,1,0,0,0,1,1],[1,0,1,0,1,0,1],[1,0,0,1,0,0,1],[1,0,1,0,1,0,1],[1,1,0,0,0,1,1],[1,0,0,0,0,0,1]],
  ]
  const [pidx] = useState(() => Math.floor(Math.random() * PUZZLES.length))
  const sol = PUZZLES[pidx]

  function clueRow(r: number): number[] {
    const clues: number[] = []; let cnt = 0
    for (let c = 0; c < N; c++) { if (sol[r][c]) cnt++; else if (cnt) { clues.push(cnt); cnt = 0 } }
    if (cnt) clues.push(cnt)
    return clues.length ? clues : [0]
  }
  function clueCol(c: number): number[] {
    const clues: number[] = []; let cnt = 0
    for (let r = 0; r < N; r++) { if (sol[r][c]) cnt++; else if (cnt) { clues.push(cnt); cnt = 0 } }
    if (cnt) clues.push(cnt)
    return clues.length ? clues : [0]
  }

  const [grid, setGrid] = useState<(0|1|2)[][]>(() => Array.from({length:N},()=>Array(N).fill(0)))
  const [won, setWon] = useState(false)
  const [mistakes, setMistakes] = useState(0)

  function toggle(r: number, c: number) {
    if (won) return
    const ng = grid.map(row=>[...row]) as (0|1|2)[][]
    if (ng[r][c] === 0) {
      ng[r][c] = 1
      if (!sol[r][c]) { ng[r][c] = 2; setMistakes(m=>m+1) }
    } else { ng[r][c] = 0 }
    setGrid(ng)
    if (ng.every((row,ri)=>row.every((v,ci)=>(v===1)===!!sol[ri][ci]))) { setWon(true); onEnd('win', Math.max(0,500-mistakes*30)) }
  }

  const CELL = 38
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:12,padding:10}}>
      <SBar items={[{l:'Erros',v:mistakes,c:'248,113,113'},{l:won?'🎉 Resolvido!':'Preencha o padrão',v:'',c:won?'52,211,153':'96,165,250'}]} />
      <div style={{display:'flex'}}>
        {/* Col clues */}
        <div style={{width:60,flexShrink:0}}/>
        <div style={{display:'flex',gap:2,marginBottom:2}}>
          {Array.from({length:N},(_,c)=>(
            <div key={c} style={{width:CELL,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-end',minHeight:40,gap:1}}>
              {clueCol(c).map((n,i)=><span key={i} style={{fontSize:'0.65rem',fontWeight:700,color:'var(--text-secondary)',lineHeight:1.2}}>{n}</span>)}
            </div>
          ))}
        </div>
      </div>
      <div style={{display:'flex'}}>
        {/* Row clues */}
        <div style={{display:'flex',flexDirection:'column',gap:2,marginRight:4}}>
          {Array.from({length:N},(_,r)=>(
            <div key={r} style={{height:CELL,display:'flex',alignItems:'center',justifyContent:'flex-end',gap:3,minWidth:55}}>
              {clueRow(r).map((n,i)=><span key={i} style={{fontSize:'0.65rem',fontWeight:700,color:'var(--text-secondary)'}}>{n}</span>)}
            </div>
          ))}
        </div>
        {/* Grid */}
        <div style={{display:'grid',gridTemplateColumns:`repeat(${N},${CELL}px)`,gap:2}}>
          {grid.map((row,r)=>row.map((cell,c)=>(
            <div key={`${r}-${c}`} onClick={()=>toggle(r,c)}
              style={{width:CELL,height:CELL,borderRadius:6,background:cell===1?'#60a5fa':cell===2?'rgba(248,113,113,0.3)':'var(--card-bg)',border:`1px solid ${(c+1)%3===0&&c<N-1?'var(--text-muted)':r>0&&(r)%3===0?'var(--text-muted)':'var(--border-md)'}`,cursor:'pointer',transition:'background 0.1s',display:'flex',alignItems:'center',justifyContent:'center'}}>
              {cell===2&&<span style={{color:'#f87171',fontSize:'0.8rem'}}>✗</span>}
            </div>
          )))}
        </div>
      </div>
      <div style={{fontSize:'0.62rem',color:'var(--text-muted)'}}>Clique para preencher · Os números indicam grupos consecutivos preenchidos</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 2. PIPE PUZZLE
// ══════════════════════════════════════════════════════════════════════════════
type PipeType = 'straight'|'curve'|'tee'|'cross'|'end'|'empty'
type PipeDir = 'N'|'S'|'E'|'W'
const PIPE_CONNECTIONS: Record<PipeType, Record<number, PipeDir[]>> = {
  straight: {0:['N','S'], 1:['E','W']},
  curve:    {0:['N','E'], 1:['E','S'], 2:['S','W'], 3:['W','N']},
  tee:      {0:['N','E','W'], 1:['N','E','S'], 2:['E','S','W'], 3:['N','S','W']},
  cross:    {0:['N','E','S','W']},
  end:      {0:['N'], 1:['E'], 2:['S'], 3:['W']},
  empty:    {0:[]},
}
const OPPOSITE: Record<PipeDir,PipeDir> = {N:'S',S:'N',E:'W',W:'E'}

export function GamePipe({ onEnd, bestScore: _bs }: GameProps) {
  const N = 6
  type Cell = { type: PipeType; rot: number }

  function genPuzzle(): Cell[][] {
    // Start with a solved grid, then randomize rotations
    const types: PipeType[] = ['straight','straight','curve','curve','curve','tee','end','end']
    const g: Cell[][] = Array.from({length:N},()=>Array.from({length:N},()=>({
      type: types[Math.floor(Math.random()*types.length)], rot: Math.floor(Math.random()*4)
    })))
    // Ensure source and sink
    g[0][0] = {type:'end', rot:2}  // source: opens South
    g[N-1][N-1] = {type:'end', rot:0} // sink: opens North
    return g
  }

  const [grid, setGrid] = useState<Cell[][]>(genPuzzle)
  const [solved, setSolved] = useState(false)
  const [rotations, setRotations] = useState(0)

  function getConns(cell: Cell): PipeDir[] {
    const rots = PIPE_CONNECTIONS[cell.type]
    const maxRot = Object.keys(rots).length
    return rots[cell.rot % maxRot] || []
  }

  function rotate(r: number, c: number) {
    if (solved) return
    const ng = grid.map(row=>row.map(c=>({...c})))
    ng[r][c].rot = (ng[r][c].rot+1) % 4
    setGrid(ng); setRotations(n=>n+1)
    // Check if solved: BFS from source
    const visited = new Set<string>()
    const queue: [number,number][] = [[0,0]]
    visited.add('0,0')
    const dirs: Record<PipeDir,[number,number]> = {N:[-1,0],S:[1,0],E:[0,1],W:[0,-1]}
    while (queue.length) {
      const [cr,cc] = queue.shift()!
      const conns = getConns(ng[cr][cc])
      for (const d of conns) {
        const [dr,dc] = dirs[d]; const nr=cr+dr,nc=cc+dc
        if (nr<0||nr>=N||nc<0||nc>=N) continue
        if (visited.has(`${nr},${nc}`)) continue
        const neighConns = getConns(ng[nr][nc])
        if (neighConns.includes(OPPOSITE[d])) { visited.add(`${nr},${nc}`); queue.push([nr,nc]) }
      }
    }
    if (visited.has(`${N-1},${N-1}`)) { setSolved(true); onEnd('win', Math.max(0,500-rotations)) }
  }

  function drawPipe(cell: Cell, isConnected: boolean): React.ReactNode {
    const conns = getConns(cell)
    const C = 28, c2 = C/2
    const col = isConnected ? '#34d399' : '#60a5fa'
    return (
      <svg width={C} height={C} style={{display:'block'}}>
        {conns.includes('N')&&<line x1={c2} y1={0} x2={c2} y2={c2} stroke={col} strokeWidth={4} strokeLinecap="round"/>}
        {conns.includes('S')&&<line x1={c2} y1={c2} x2={c2} y2={C} stroke={col} strokeWidth={4} strokeLinecap="round"/>}
        {conns.includes('E')&&<line x1={c2} y1={c2} x2={C} y2={c2} stroke={col} strokeWidth={4} strokeLinecap="round"/>}
        {conns.includes('W')&&<line x1={0} y1={c2} x2={c2} y2={c2} stroke={col} strokeWidth={4} strokeLinecap="round"/>}
        <circle cx={c2} cy={c2} r={3} fill={col}/>
      </svg>
    )
  }

  // BFS to find connected cells
  const connected = new Set<string>()
  const q2: [number,number][] = [[0,0]]; connected.add('0,0')
  const dirs2: Record<PipeDir,[number,number]> = {N:[-1,0],S:[1,0],E:[0,1],W:[0,-1]}
  while (q2.length) {
    const [cr,cc] = q2.shift()!
    const conns = getConns(grid[cr][cc])
    for (const d of conns) {
      const [dr,dc] = dirs2[d]; const nr=cr+dr,nc=cc+dc
      if (nr<0||nr>=N||nc<0||nc>=N||connected.has(`${nr},${nc}`)) continue
      if (getConns(grid[nr][nc]).includes(OPPOSITE[d])) { connected.add(`${nr},${nc}`); q2.push([nr,nc]) }
    }
  }

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:12,padding:14}}>
      <SBar items={[{l:'Rotações',v:rotations,c:'96,165,250'},{l:solved?'🎉 Conectado!':'Conecte a fonte ao destino',v:'',c:solved?'52,211,153':'167,139,250'}]} />
      <div style={{display:'grid',gridTemplateColumns:`repeat(${N},1fr)`,gap:3,background:'#1e293b',padding:8,borderRadius:14}}>
        {grid.map((row,r)=>row.map((cell,c)=>{
          const isConn = connected.has(`${r},${c}`)
          const isStart = r===0&&c===0, isEnd = r===N-1&&c===N-1
          return (
            <div key={`${r}-${c}`} onClick={()=>rotate(r,c)}
              style={{width:42,height:42,borderRadius:8,background:isStart?'rgba(52,211,153,0.15)':isEnd?'rgba(251,191,36,0.15)':isConn?'rgba(96,165,250,0.1)':'rgba(255,255,255,0.03)',border:`1px solid ${isStart?'rgba(52,211,153,0.4)':isEnd?'rgba(251,191,36,0.4)':isConn?'rgba(96,165,250,0.3)':'rgba(255,255,255,0.08)'}`,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',transition:'all 0.15s'}}>
              {drawPipe(cell, isConn)}
              {isStart&&<span style={{position:'absolute',fontSize:'0.55rem',color:'#34d399',top:2,left:3}}>S</span>}
              {isEnd&&<span style={{position:'absolute',fontSize:'0.55rem',color:'#fbbf24',bottom:2,right:3}}>E</span>}
            </div>
          )
        }))}
      </div>
      <div style={{display:'flex',gap:10}}>
        <RBtn onClick={()=>{setGrid(genPuzzle());setSolved(false);setRotations(0)}} label="↺ Novo" color="#60a5fa"/>
      </div>
      <div style={{fontSize:'0.62rem',color:'var(--text-muted)'}}>Clique para girar · Verde = conectado · S = fonte · E = destino</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 3. MATCH PAIR (combinações temáticas)
// ══════════════════════════════════════════════════════════════════════════════
export function GameMatchPair({ onEnd, bestScore: _bs }: GameProps) {
  const PAIRS = [
    ['Constituição','1988'],['Habeas Corpus','Liberdade'],['Mandado','Segurança'],
    ['Ação','Recurso'],['Juiz','Sentença'],['MP','Promotor'],['STF','Supremo'],
    ['AGU','União'],['TCU','Contas'],['CNJ','Judiciário'],
    ['ADPF','Fundamental'],['ADI','Inconstitucional'],
  ]
  function shuffle<T>(a:T[]):T[]{return [...a].sort(()=>Math.random()-0.5)}

  function init(){
    const chosen = shuffle(PAIRS).slice(0,6)
    return shuffle([...chosen.map((p,i)=>({id:`a${i}`,text:p[0],pair:i,flipped:false,matched:false})),
                    ...chosen.map((p,i)=>({id:`b${i}`,text:p[1],pair:i,flipped:false,matched:false}))])
  }

  const [cards,setCards]=useState(init)
  const [sel,setSel]=useState<string[]>([])
  const [locked,setLocked]=useState(false)
  const [moves,setMoves]=useState(0)
  const [matches,setMatches]=useState(0)

  function click(id:string){
    if(locked||sel.includes(id)) return
    const c=cards.find(c=>c.id===id)!
    if(c.matched||c.flipped) return
    const nc=cards.map(x=>x.id===id?{...x,flipped:true}:x)
    const ns=[...sel,id]
    if(ns.length===2){
      setLocked(true); setMoves(m=>m+1)
      const [a,b]=[nc.find(c=>c.id===ns[0])!,nc.find(c=>c.id===ns[1])!]
      if(a.pair===b.pair){
        const mc=nc.map(x=>ns.includes(x.id)?{...x,matched:true}:x)
        const nm=matches+1; setMatches(nm); setCards(mc); setSel([]); setLocked(false)
        if(nm===6){onEnd('win',Math.max(0,400-moves*15))}
      } else {
        setCards(nc); setSel(ns)
        setTimeout(()=>{setCards(prev=>prev.map(x=>ns.includes(x.id)&&!x.matched?{...x,flipped:false}:x));setSel([]);setLocked(false)},900)
      }
    } else {setCards(nc);setSel(ns)}
  }

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:12,padding:12}}>
      <SBar items={[{l:'Pares',v:`${matches}/6`,c:'52,211,153'},{l:'Jogadas',v:moves,c:'96,165,250'},{l:matches===6?'🎉 Completo!':'Combine os pares',v:'',c:matches===6?'52,211,153':'167,139,250'}]} />
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,maxWidth:440}}>
        {cards.map(c=>(
          <button key={c.id} onClick={()=>click(c.id)}
            style={{height:62,borderRadius:12,border:`2px solid ${c.matched?'rgba(52,211,153,0.5)':c.flipped?'rgba(96,165,250,0.5)':'var(--border-md)'}`,background:c.matched?'rgba(52,211,153,0.1)':c.flipped?'rgba(96,165,250,0.1)':'var(--card-bg)',cursor:c.matched||c.flipped?'default':'pointer',padding:'6px 8px',transition:'all 0.2s',fontSize:'0.72rem',fontWeight:c.flipped||c.matched?700:400,color:c.matched?'#34d399':c.flipped?'#60a5fa':'var(--text-muted)',lineHeight:1.3}}>
            {c.flipped||c.matched?c.text:'?'}
          </button>
        ))}
      </div>
      {matches===6&&<RBtn onClick={()=>{setCards(init());setSel([]);setMoves(0);setMatches(0);setLocked(false)}} color="#34d399"/>}
      <div style={{fontSize:'0.62rem',color:'var(--text-muted)'}}>Encontre os 6 pares de conceitos jurídicos</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 4. DESAFIO DE INTERRUPTORES
// ══════════════════════════════════════════════════════════════════════════════
export function GameSwitches({ onEnd, bestScore: _bs }: GameProps) {
  const PUZZLES_SW = [
    { n:6, target:[1,1,1,1,1,1], rules:[[0,1],[1,2],[2,3],[3,4],[4,5],[5,0]], desc:'Cada switch liga/desliga o vizinho' },
    { n:5, target:[1,1,1,1,1], rules:[[0,2],[1,3],[2,4],[3,0],[4,1]], desc:'Padrão em salto de 2' },
    { n:4, target:[1,1,1,1], rules:[[0,1,3],[1,0,2],[2,1,3],[3,0,2]], desc:'Switches conectados em X' },
    { n:6, target:[1,0,1,0,1,0], rules:[[0,1],[1,0,2],[2,1,3],[3,2,4],[4,3,5],[5,4]], desc:'Padrão alternado' },
  ]
  const [pidx]=useState(()=>Math.floor(Math.random()*PUZZLES_SW.length))
  const puzzle=PUZZLES_SW[pidx]
  const [state,setState]=useState(()=>Array(puzzle.n).fill(0))
  const [moves2,setMoves2]=useState(0)
  const [won,setWon]=useState(false)

  function toggle2(idx:number){
    if(won) return
    const ns=[...state]; ns[idx]=ns[idx]?0:1
    // Toggle connected
    for(const t of puzzle.rules[idx]){ns[t]=ns[t]?0:1}
    setMoves2(m=>m+1); setState(ns)
    if(ns.every((v,i)=>v===puzzle.target[i])){setWon(true);onEnd('win',Math.max(0,300-moves2*20))}
  }

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:16,padding:20}}>
      <SBar items={[{l:'Movimentos',v:moves2,c:'96,165,250'},{l:won?'🎉 Resolvido!':'Acenda todas as lâmpadas',v:'',c:won?'52,211,153':'251,191,36'}]} />
      <div style={{fontSize:'0.72rem',color:'var(--text-muted)',textAlign:'center',maxWidth:320}}>{puzzle.desc}</div>

      {/* Target */}
      <div style={{display:'flex',gap:8,alignItems:'center'}}>
        <span style={{fontSize:'0.6rem',color:'var(--text-muted)',fontFamily:'monospace',textTransform:'uppercase',letterSpacing:'0.08em'}}>Meta:</span>
        {puzzle.target.map((v,i)=>(
          <div key={i} style={{width:28,height:28,borderRadius:'50%',background:v?'rgba(251,191,36,0.2)':'rgba(255,255,255,0.05)',border:`2px solid ${v?'rgba(251,191,36,0.5)':'var(--border)'}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.9rem'}}>{v?'💡':'⚫'}</div>
        ))}
      </div>

      {/* Switches */}
      <div style={{display:'flex',gap:12,flexWrap:'wrap',justifyContent:'center'}}>
        {state.map((v,i)=>(
          <div key={i} style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8}}>
            <div style={{width:48,height:48,borderRadius:'50%',background:v?'rgba(251,191,36,0.2)':'rgba(255,255,255,0.04)',border:`3px solid ${v?'rgba(251,191,36,0.6)':'var(--border)'}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.4rem',transition:'all 0.2s',boxShadow:v?'0 0 16px rgba(251,191,36,0.4)':'none'}}>
              {v?'💡':'⚫'}
            </div>
            <button onClick={()=>toggle2(i)} disabled={won}
              style={{width:44,height:24,borderRadius:12,border:`2px solid ${v?'rgba(251,191,36,0.5)':'var(--border)'}`,background:v?'rgba(251,191,36,0.15)':'var(--card-bg)',cursor:won?'not-allowed':'pointer',transition:'all 0.2s',fontSize:'0.65rem',fontWeight:700,color:v?'#fbbf24':'var(--text-muted)'}}>
              {v?'ON':'OFF'}
            </button>
            <span style={{fontSize:'0.6rem',color:'var(--text-muted)'}}>S{i+1}</span>
          </div>
        ))}
      </div>

      <div style={{display:'flex',gap:10}}>
        <RBtn onClick={()=>{setState(Array(puzzle.n).fill(0));setMoves2(0);setWon(false)}} label="↺ Reset" color="#60a5fa"/>
      </div>
      <div style={{fontSize:'0.62rem',color:'var(--text-muted)',textAlign:'center',maxWidth:320}}>
        Cada interruptor afeta outros além dele mesmo. Alcance o padrão meta acima.
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 5. CUBOS NUMÉRICOS (Number Crunching Grid)
// ══════════════════════════════════════════════════════════════════════════════
export function GameNumCubes({ onEnd, bestScore }: GameProps) {
  const SZ=4
  function gen(){
    const target=Math.floor(Math.random()*20)+10
    const g=Array.from({length:SZ},()=>Array.from({length:SZ},()=>Math.floor(Math.random()*9)+1))
    return {grid:g,target,sel:new Set<string>(),op:'+' as '+'|'×'}
  }
  const [q,setQ]=useState(gen)
  const [score,setScore]=useState(0)
  const [round,setRound]=useState(1)
  const [sel,setSel]=useState<Set<string>>(new Set())
  const [feedback,setFeedback]=useState<'ok'|'err'|null>(null)
  const [done,setDone]=useState(false)
  const TOTAL=8

  function toggle3(r:number,c:number){
    if(done||feedback) return
    const key=`${r},${c}`
    const ns=new Set(sel)
    ns.has(key)?ns.delete(key):ns.add(key)
    setSel(ns)
  }

  function calc():number{
    const vals=[...sel].map(k=>{const[r,c]=k.split(',').map(Number);return q.grid[r][c]})
    if(!vals.length) return 0
    return q.op==='+'?vals.reduce((a,b)=>a+b,0):vals.reduce((a,b)=>a*b,1)
  }

  function submit2(){
    if(!sel.size||done||feedback) return
    const ok=calc()===q.target
    setFeedback(ok?'ok':'err')
    const ns=score+(ok?15:0)
    setTimeout(()=>{
      setFeedback(null); setSel(new Set())
      const nr=round+1
      if(nr>TOTAL){setDone(true);onEnd(ns>=80?'win':'play',ns);return}
      setRound(nr); setScore(ns); setQ(gen())
    },700)
  }

  const cv=calc()

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:14,padding:16}}>
      <SBar items={[
        {l:'Score',v:score,c:'96,165,250'},
        {l:`${round}/${TOTAL}`,v:'',c:'251,191,36'},
        {l:'Recorde',v:Math.max(score,bestScore),c:'52,211,153'},
      ]}/>
      <div style={{display:'flex',gap:12,alignItems:'center'}}>
        <div style={{padding:'10px 20px',borderRadius:12,background:'rgba(96,165,250,0.08)',border:'1px solid rgba(96,165,250,0.25)',textAlign:'center'}}>
          <div style={{fontSize:'0.6rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Alvo ({q.op})</div>
          <div style={{fontFamily:'monospace',fontWeight:900,fontSize:'1.6rem',color:'#60a5fa'}}>{q.target}</div>
        </div>
        <div style={{padding:'10px 20px',borderRadius:12,background:`rgba(${feedback==='ok'?'52,211,153':feedback==='err'?'248,113,113':'255,255,255'},0.06)`,border:`1px solid rgba(${feedback==='ok'?'52,211,153':feedback==='err'?'248,113,113':'255,255,255'},0.15)`,textAlign:'center',transition:'all 0.2s'}}>
          <div style={{fontSize:'0.6rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>Atual</div>
          <div style={{fontFamily:'monospace',fontWeight:900,fontSize:'1.6rem',color:feedback==='ok'?'#34d399':feedback==='err'?'#f87171':'var(--text-primary)'}}>{cv||'—'}</div>
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:`repeat(${SZ},1fr)`,gap:6}}>
        {q.grid.map((row,r)=>row.map((v,c)=>{
          const key=`${r},${c}`;const isSel=sel.has(key)
          return (
            <div key={key} onClick={()=>toggle3(r,c)}
              style={{width:58,height:58,borderRadius:12,background:isSel?'rgba(96,165,250,0.2)':'var(--card-bg)',border:`2px solid ${isSel?'#60a5fa':'var(--border-md)'}`,display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'monospace',fontWeight:900,fontSize:'1.3rem',color:isSel?'#60a5fa':'var(--text-primary)',cursor:'pointer',transition:'all 0.15s',boxShadow:isSel?'0 0 10px rgba(96,165,250,0.3)':'none'}}>
              {v}
            </div>
          )
        }))}
      </div>
      <div style={{display:'flex',gap:10,alignItems:'center'}}>
        <button onClick={()=>setQ(q2=>({...q2,op:q2.op==='+'?'×':'+'}))}
          style={{padding:'7px 14px',borderRadius:9,border:'1px solid var(--border-md)',background:'var(--card-bg)',color:'var(--text-primary)',fontWeight:800,fontSize:'1rem',cursor:'pointer'}}>
          {q.op}
        </button>
        <button onClick={()=>setSel(new Set())} style={{padding:'7px 14px',borderRadius:9,border:'1px solid var(--border)',background:'transparent',color:'var(--text-muted)',cursor:'pointer',fontSize:'0.8rem'}}>Limpar</button>
        <button onClick={submit2} disabled={!sel.size||!!feedback||done}
          style={{padding:'8px 22px',borderRadius:10,border:'none',background:sel.size&&!feedback&&!done?'linear-gradient(135deg,#60a5fa,#1A73E8)':'rgba(255,255,255,0.06)',color:'#fff',fontWeight:800,cursor:sel.size&&!feedback&&!done?'pointer':'not-allowed'}}>✓</button>
      </div>
      {done&&<div style={{color:'#34d399',fontWeight:800}}>🎉 {score}/{TOTAL*15} pontos</div>}
      <div style={{fontSize:'0.62rem',color:'var(--text-muted)'}}>Selecione cubos · Botão alterna + / × · Resultado deve igualar o alvo</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 6. FREECELL
// ══════════════════════════════════════════════════════════════════════════════
type FCCard={suit:string;rank:number}
const SUITS_FC=['♠','♥','♦','♣']
const isRed_FC=(s:string)=>s==='♥'||s==='♦'
const rankStr_FC=(r:number)=>['A','2','3','4','5','6','7','8','9','10','J','Q','K'][r-1]

export function GameFreeCell({ onEnd, bestScore: _bs }: GameProps) {
  function initFC(){
    const deck:FCCard[]=[]
    for(const s of SUITS_FC) for(let r=1;r<=13;r++) deck.push({suit:s,rank:r})
    for(let i=deck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]]}
    const cols:FCCard[][]=Array.from({length:8},()=>[])
    deck.forEach((c,i)=>cols[i%8].push(c))
    return{cols,free:[null,null,null,null] as (FCCard|null)[],found:[[],[],[],[]] as FCCard[][]}
  }

  const [g,setG]=useState(initFC)
  const [sel,setSel]=useState<{from:'col'|'free';idx:number;card:FCCard}|null>(null)
  const [moves3,setMoves3]=useState(0)
  const [won,setWon]=useState(false)

  function canFoundation(card:FCCard,pile:FCCard[]){return pile.length===0?card.rank===1:pile[pile.length-1].suit===card.suit&&card.rank===pile[pile.length-1].rank+1}
  function canCol(card:FCCard,col:FCCard[]){return col.length===0||( isRed_FC(col[col.length-1].suit)!==isRed_FC(card.suit)&&card.rank===col[col.length-1].rank-1)}

  function clickFree(i:number){
    if(won) return
    if(sel){
      if(g.free[i]===null){
        const ng={...g,free:[...g.free] as (FCCard|null)[],cols:g.cols.map(c=>[...c])}
        ng.free[i]=sel.card
        if(sel.from==='col') ng.cols[sel.idx]=ng.cols[sel.idx].slice(0,-1)
        else ng.free[sel.idx]=null
        setSel(null); setG(ng); setMoves3(m=>m+1)
      } else setSel(null)
    } else {
      if(g.free[i]) setSel({from:'free',idx:i,card:g.free[i]!})
    }
  }

  function clickFound(i:number){
    if(!sel||won) return
    if(canFoundation(sel.card,g.found[i])){
      const ng={...g,free:[...g.free] as (FCCard|null)[],cols:g.cols.map(c=>[...c]),found:g.found.map(f=>[...f])}
      ng.found[i].push(sel.card)
      if(sel.from==='col') ng.cols[sel.idx]=ng.cols[sel.idx].slice(0,-1)
      else ng.free[sel.idx]=null
      setSel(null); setG(ng); setMoves3(m=>m+1)
      if(ng.found.every(f=>f.length===13)){setWon(true);onEnd('win',500)}
    } else setSel(null)
  }

  function clickCol(ci:number){
    if(won) return
    const col=g.cols[ci]
    if(sel){
      const top=col[col.length-1]
      if(!top||canCol(sel.card,col)){
        const ng={...g,free:[...g.free] as (FCCard|null)[],cols:g.cols.map(c=>[...c])}
        ng.cols[ci].push(sel.card)
        if(sel.from==='col') ng.cols[sel.idx]=ng.cols[sel.idx].slice(0,-1)
        else ng.free[sel.idx]=null
        setSel(null); setG(ng); setMoves3(m=>m+1)
      } else setSel({from:'col',idx:ci,card:top})
    } else {
      if(col.length) setSel({from:'col',idx:ci,card:col[col.length-1]})
    }
  }

  const cc=(c:FCCard)=>({color:isRed_FC(c.suit)?'#ef4444':'var(--text-primary)'})
  const cardEl=(c:FCCard|null,isSel=false)=>c?(
    <div style={{padding:'3px 5px',borderRadius:7,background:'var(--card-bg)',border:`2px solid ${isSel?'#fbbf24':'var(--border-md)'}`,fontSize:'0.72rem',fontWeight:800,...cc(c),minWidth:42,textAlign:'center',cursor:'pointer'}}>
      {rankStr_FC(c.rank)}{c.suit}
    </div>
  ):(
    <div style={{padding:'3px 5px',borderRadius:7,background:'rgba(255,255,255,0.02)',border:'1px dashed var(--border)',minWidth:42,height:28}}/>
  )

  return (
    <div style={{display:'flex',flexDirection:'column',gap:8,padding:10,minWidth:560,userSelect:'none'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{fontSize:'0.72rem',color:'var(--text-muted)'}}>Jogadas: {moves3}</span>
        {won&&<span style={{color:'#34d399',fontWeight:800}}>🎉 Vitória!</span>}
        {sel&&<span style={{fontSize:'0.72rem',color:'#fbbf24'}}>Selecionado: {rankStr_FC(sel.card.rank)}{sel.card.suit}</span>}
        <button onClick={()=>{setG(initFC());setMoves3(0);setSel(null);setWon(false)}} style={{padding:'4px 10px',borderRadius:7,border:'1px solid var(--border)',background:'transparent',color:'var(--text-muted)',fontSize:'0.7rem',cursor:'pointer'}}>↺</button>
      </div>
      {/* Free cells + Foundations */}
      <div style={{display:'flex',gap:8,justifyContent:'space-between'}}>
        <div style={{display:'flex',gap:6}}>{g.free.map((c,i)=><div key={i} onClick={()=>clickFree(i)}>{cardEl(c,sel?.from==='free'&&sel.idx===i)}</div>)}</div>
        <div style={{display:'flex',gap:6}}>{g.found.map((pile,i)=>(
          <div key={i} onClick={()=>clickFound(i)} style={{padding:'3px 5px',borderRadius:7,background:'rgba(52,211,153,0.05)',border:'1px solid rgba(52,211,153,0.25)',minWidth:42,height:28,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',fontSize:'0.72rem',fontWeight:800}}>
            {pile.length?<span style={{...cc(pile[pile.length-1])}}>{rankStr_FC(pile[pile.length-1].rank)}{pile[pile.length-1].suit}</span>:<span style={{color:'rgba(52,211,153,0.4)'}}>{SUITS_FC[i]}</span>}
          </div>
        ))}</div>
      </div>
      {/* Columns */}
      <div style={{display:'flex',gap:6,alignItems:'flex-start'}}>
        {g.cols.map((col,ci)=>(
          <div key={ci} style={{display:'flex',flexDirection:'column',gap:2,minWidth:52,minHeight:40}}>
            {col.length===0?<div onClick={()=>clickCol(ci)} style={{width:52,height:36,borderRadius:7,border:'1px dashed var(--border)',cursor:'pointer'}}/>
            :col.map((card,ri)=>(
              <div key={ri} onClick={()=>ri===col.length-1?clickCol(ci):undefined}
                style={{padding:'3px 5px',borderRadius:7,background:'var(--card-bg)',border:`2px solid ${sel?.from==='col'&&sel.idx===ci&&ri===col.length-1?'#fbbf24':'var(--border-md)'}`,fontSize:'0.72rem',fontWeight:800,...cc(card),cursor:ri===col.length-1?'pointer':'default',opacity:ri<col.length-1?0.8:1}}>
                {rankStr_FC(card.rank)}{card.suit}
              </div>
            ))}
          </div>
        ))}
      </div>
      <div style={{fontSize:'0.6rem',color:'var(--text-muted)'}}>Clique para selecionar · Clique no destino · Vermelho em preto, decrescente</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 7. PYRAMID SOLITAIRE
// ══════════════════════════════════════════════════════════════════════════════
export function GamePyramid({ onEnd, bestScore: _bs }: GameProps) {
  type PyCard={suit:string;rank:number;id:number}
  function initPyr(){
    const deck:PyCard[]=[]
    let id=0
    for(const s of SUITS_FC) for(let r=1;r<=13;r++) deck.push({suit:s,rank:r,id:id++})
    for(let i=deck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]]}
    // 7 rows: 1,2,3,4,5,6,7 = 28 cards
    const pyr:PyCard[][]=[]
    let idx=0; for(let r=1;r<=7;r++){pyr.push(deck.slice(idx,idx+r));idx+=r}
    const stock=deck.slice(28); const waste:PyCard[]=[]
    return{pyr,stock,waste,removed:new Set<number>()}
  }

  const [g,setG]=useState(initPyr)
  const [sel2,setSel2]=useState<PyCard|null>(null)
  const [score4,setScore4]=useState(0)
  const [won2,setWon2]=useState(false)

  function isAvailable(pyr:PyCard[][],card:PyCard):boolean{
    for(let r=0;r<pyr.length-1;r++) for(let c=0;c<pyr[r].length;c++) if(pyr[r][c].id===card.id) return !pyr[r+1][c]||!pyr[r+1][c+1]||(g.removed.has(pyr[r+1][c].id)&&g.removed.has(pyr[r+1][c+1].id))
    return true // last row or waste
  }

  function clickCard(card:PyCard){
    if(won2||g.removed.has(card.id)) return
    if(sel2){
      if(sel2.id===card.id){setSel2(null);return}
      if(sel2.rank+card.rank===13){
        const ng={...g,removed:new Set([...g.removed,sel2.id,card.id])}
        const ns=score4+10; setScore4(ns); setSel2(null); setG(ng)
        if(ng.pyr.flat().every(c=>ng.removed.has(c.id))){setWon2(true);onEnd('win',ns)}
      } else setSel2(card)
    } else setSel2(card)
  }

  function clickStock(){
    if(!g.stock.length) return
    const ng={...g,stock:[...g.stock],waste:[...g.waste]}
    ng.waste.push(ng.stock.pop()!); setG(ng)
  }

  function isKing(card:PyCard){return card.rank===13}

  function removeKing(card:PyCard){
    if(!isKing(card)||g.removed.has(card.id)) return
    const ng={...g,removed:new Set([...g.removed,card.id])}
    setScore4(s=>s+10); setG(ng)
    if(ng.pyr.flat().every(c=>ng.removed.has(c.id))){setWon2(true);onEnd('win',score4+10)}
  }

  const rv_=(r:number)=>r===1?'A':r===11?'J':r===12?'Q':r===13?'K':String(r)
  const cardStyle=(card:PyCard,avail:boolean,isSel:boolean)=>({
    width:36,height:46,borderRadius:6,background:g.removed.has(card.id)?'transparent':isSel?'rgba(251,191,36,0.2)':'var(--card-bg)',
    border:g.removed.has(card.id)?'none':`2px solid ${isSel?'#fbbf24':avail?'rgba(96,165,250,0.4)':'var(--border)'}`,
    color:isRed_FC(card.suit)?'#ef4444':'var(--text-primary)',fontSize:'0.65rem',fontWeight:800,
    display:'flex',alignItems:'center',justifyContent:'center',cursor:avail&&!g.removed.has(card.id)?'pointer':'default',
    opacity:avail?1:0.5,transition:'all 0.15s'
  })

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:10,padding:12,userSelect:'none'}}>
      <SBar items={[{l:'Score',v:score4,c:'96,165,250'},{l:won2?'🎉 Vitória!':'Some 13',v:'',c:won2?'52,211,153':'251,191,36'},{l:sel2?`Sel: ${rv_(sel2.rank)}${sel2.suit}`:'Clique 2 cartas',v:'',c:'167,139,250'}]}/>
      {/* Pyramid */}
      <div style={{display:'flex',flexDirection:'column',gap:4,alignItems:'center'}}>
        {g.pyr.map((row,ri)=>(
          <div key={ri} style={{display:'flex',gap:4}}>
            {row.map(card=>{
              const avail=!g.removed.has(card.id)&&isAvailable(g.pyr,card)
              const isSel=sel2?.id===card.id
              return(
                <div key={card.id} onClick={()=>isKing(card)?removeKing(card):clickCard(card)}
                  style={cardStyle(card,avail,isSel) as React.CSSProperties}>
                  {!g.removed.has(card.id)&&<>{rv_(card.rank)}{card.suit}</>}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      {/* Stock & Waste */}
      <div style={{display:'flex',gap:10,marginTop:4}}>
        <div onClick={clickStock} style={{width:36,height:46,borderRadius:6,background:g.stock.length?'#1e40af':'rgba(255,255,255,0.03)',border:'2px solid rgba(96,165,250,0.3)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:'0.75rem'}}>
          {g.stock.length?'🂠':' '}
        </div>
        {g.waste.length>0&&(()=>{const c=g.waste[g.waste.length-1];const avail=!g.removed.has(c.id);const isSel=sel2?.id===c.id;return(
          <div onClick={()=>isKing(c)?removeKing(c):clickCard(c)} style={cardStyle(c,avail,isSel) as React.CSSProperties}>
            {!g.removed.has(c.id)&&<>{rv_(c.rank)}{c.suit}</>}
          </div>
        )})()}
        <button onClick={()=>{setG(initPyr());setScore4(0);setSel2(null);setWon2(false)}} style={{padding:'4px 10px',borderRadius:7,border:'1px solid var(--border)',background:'transparent',color:'var(--text-muted)',fontSize:'0.7rem',cursor:'pointer'}}>↺</button>
      </div>
      <div style={{fontSize:'0.6rem',color:'var(--text-muted)'}}>Combine cartas que somem 13 · Reis removem sozinhos · Cartas mais claras = disponíveis</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 8. TRIPEAKS SOLITAIRE
// ══════════════════════════════════════════════════════════════════════════════
export function GameTriPeaks({ onEnd, bestScore: _bs }: GameProps) {
  type TPCard={suit:string;rank:number;id:number;faceUp:boolean}
  function initTP(){
    const deck:TPCard[]=[]
    let id=0; for(const s of SUITS_FC) for(let r=1;r<=13;r++) deck.push({suit:s,rank:r,id:id++,faceUp:false})
    for(let i=deck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]]}
    // TriPeaks: 3 peaks of 1+2+3+row4=18 top cards + row 10 = 28 total, rest = stock
    // Simplified layout: 4 rows
    const layout:TPCard[][]=[]
    let idx=0
    // Row 0: peaks (3 cards, spread)
    layout.push([deck[idx++],deck[idx++],deck[idx++]])
    // Row 1: 6 cards
    layout.push(deck.slice(idx,idx+=6))
    // Row 2: 9 cards
    layout.push(deck.slice(idx,idx+=9))
    // Row 3: 10 cards (bottom, all face up)
    layout.push(deck.slice(idx,idx+=10))
    layout[3].forEach(c=>c.faceUp=true)
    layout[0].forEach(c=>c.faceUp=true)
    return{layout,stock:deck.slice(idx).map(c=>({...c,faceUp:false})),waste:[] as TPCard[],removed:new Set<number>(),combo:0}
  }

  const [g,setG]=useState(initTP)
  const [score5,setScore5]=useState(0)
  const [won3,setWon3]=useState(false)

  function isAvail(card:TPCard):boolean{
    if(!card.faceUp||g.removed.has(card.id)) return false
    // Check row below covers this card
    for(let r=0;r<g.layout.length-1;r++) for(let c=0;c<g.layout[r].length;c++){
      if(g.layout[r][c].id===card.id){
        // Cards below: layout[r+1][c] and layout[r+1][c+1] (approximate)
        const b1=g.layout[r+1]?.[c], b2=g.layout[r+1]?.[c+1]
        if(b1&&!g.removed.has(b1.id)) return false
        if(b2&&!g.removed.has(b2.id)) return false
        return true
      }
    }
    return true // bottom row
  }

  function canPlay(card:TPCard):boolean{
    if(!g.waste.length) return false
    const top=g.waste[g.waste.length-1]
    return Math.abs(card.rank-top.rank)===1||(top.rank===1&&card.rank===13)||(top.rank===13&&card.rank===1)
  }

  function clickCard(card:TPCard){
    if(won3||g.removed.has(card.id)||!isAvail(card)||!canPlay(card)) return
    const ng={...g,removed:new Set([...g.removed,card.id]),waste:[...g.waste,card],combo:g.combo+1}
    const ns=score5+5*ng.combo; setScore5(ns); setG(ng)
    const total=g.layout.flat().length
    if(ng.removed.size===total){setWon3(true);onEnd('win',ns)}
  }

  function clickStock2(){
    if(!g.stock.length) return
    const ns2={...g,stock:[...g.stock],waste:[...g.waste],combo:0}
    const card={...ns2.stock.pop()!,faceUp:true}; ns2.waste.push(card); setG(ns2)
  }

  const rv2=(r:number)=>r===1?'A':r===11?'J':r===12?'Q':r===13?'K':String(r)

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:8,padding:10,userSelect:'none'}}>
      <SBar items={[{l:'Score',v:score5,c:'96,165,250'},{l:`Combo x${g.combo}`,v:'',c:'251,191,36'},{l:won3?'🎉 Vitória!':'Remova todas',v:'',c:won3?'52,211,153':'167,139,250'}]}/>
      {/* Layout */}
      <div style={{display:'flex',flexDirection:'column',gap:3,alignItems:'center'}}>
        {g.layout.map((row,ri)=>(
          <div key={ri} style={{display:'flex',gap:3}}>
            {row.map(card=>{
              const avail=isAvail(card); const playable=avail&&canPlay(card)
              const removed=g.removed.has(card.id)
              return(
                <div key={card.id} onClick={()=>clickCard(card)}
                  style={{width:34,height:44,borderRadius:6,background:removed?'transparent':card.faceUp?'var(--card-bg)':'#1e3a8a',border:removed?'none':`2px solid ${playable?'rgba(251,191,36,0.6)':avail?'rgba(96,165,250,0.35)':'var(--border)'}`,display:'flex',alignItems:'center',justifyContent:'center',cursor:playable?'pointer':'default',fontSize:'0.65rem',fontWeight:800,color:isRed_FC(card.suit)?'#ef4444':'var(--text-primary)',opacity:avail?1:removed?0:0.6,transition:'all 0.15s'}}>
                  {!removed&&card.faceUp&&<>{rv2(card.rank)}{card.suit}</>}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      {/* Stock & Waste */}
      <div style={{display:'flex',gap:10,marginTop:4,alignItems:'center'}}>
        <div onClick={clickStock2} style={{width:34,height:44,borderRadius:6,background:g.stock.length?'#1e40af':'rgba(255,255,255,0.03)',border:'2px solid rgba(96,165,250,0.3)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'rgba(255,255,255,0.6)',fontSize:'0.75rem'}}>
          {g.stock.length?'🂠':' '}
        </div>
        <span style={{color:'var(--text-muted)',fontSize:'0.75rem'}}>→</span>
        {g.waste.length>0&&(()=>{const c=g.waste[g.waste.length-1];return(
          <div style={{width:34,height:44,borderRadius:6,background:'var(--card-bg)',border:'2px solid rgba(251,191,36,0.4)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.65rem',fontWeight:800,color:isRed_FC(c.suit)?'#ef4444':'var(--text-primary)'}}>
            {rv2(c.rank)}{c.suit}
          </div>
        )})()}
        <button onClick={()=>{setG(initTP());setScore5(0);setWon3(false)}} style={{padding:'4px 10px',borderRadius:7,border:'1px solid var(--border)',background:'transparent',color:'var(--text-muted)',fontSize:'0.7rem',cursor:'pointer'}}>↺</button>
      </div>
      <div style={{fontSize:'0.6rem',color:'var(--text-muted)'}}>Clique em cartas +1/-1 do topo do monte · Combo multiplica pontos</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 9. SPIDER SOLITAIRE (1 suit simplified)
// ══════════════════════════════════════════════════════════════════════════════
export function GameSpider({ onEnd, bestScore: _bs }: GameProps) {
  type SpCard={rank:number;faceUp:boolean;id:number}
  function initSp(){
    // 1 suit, 2 decks = 104 cards, ranks 1-13 × 8
    const deck:SpCard[]=[]
    let id=0; for(let d=0;d<8;d++) for(let r=1;r<=13;r++) deck.push({rank:r,faceUp:false,id:id++})
    for(let i=deck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]]}
    const cols:SpCard[][]=Array.from({length:10},(_,i)=>{const sz=i<4?6:5;return deck.splice(0,sz)})
    cols.forEach(col=>col[col.length-1].faceUp=true)
    return{cols,stock:deck,completed:0}
  }

  const [g,setG]=useState(initSp)
  const [sel3,setSel3]=useState<{col:number;from:number}|null>(null)
  const [moves4,setMoves4]=useState(0)
  const [won4,setWon4]=useState(false)

  function canPlace(card:SpCard,col:SpCard[]):boolean{
    if(!col.length) return true
    const top=col[col.length-1]
    return top.faceUp&&card.rank===top.rank-1
  }

  function checkComplete(col:SpCard[]):boolean{
    if(col.length<13) return false
    const last=col.slice(-13)
    return last.every((c,i)=>c.faceUp&&c.rank===13-i)
  }

  function clickCol2(ci:number,ri:number){
    if(won4) return
    const col=g.cols[ci]
    if(sel3){
      const{col:sc,from:sf}=sel3
      if(sc===ci){setSel3(null);return}
      const moving=g.cols[sc].slice(sf)
      if(canPlace(moving[0],col.slice(0,ri===-1?undefined:ri+1))||col.length===0){
        const ng={...g,cols:g.cols.map(c=>[...c])}
        const m=ng.cols[sc].splice(sf)
        ng.cols[ci].push(...m)
        if(ng.cols[sc].length) ng.cols[sc][ng.cols[sc].length-1].faceUp=true
        // Check complete sequence
        if(checkComplete(ng.cols[ci])){ng.cols[ci]=ng.cols[ci].slice(0,-13);ng.completed=g.completed+1;if(ng.completed>=8){setG(ng);setWon4(true);onEnd('win',ng.completed*100);return}}
        setSel3(null); setG(ng); setMoves4(m2=>m2+1)
      } else {
        if(col[ri]?.faceUp) setSel3({col:ci,from:ri})
        else setSel3(null)
      }
    } else {
      if(col[ri]?.faceUp) setSel3({col:ci,from:ri})
    }
  }

  function deal(){
    if(g.stock.length<10||won4) return
    const ng={...g,cols:g.cols.map(c=>[...c]),stock:[...g.stock]}
    ng.cols.forEach(col=>{const c={...ng.stock.pop()!,faceUp:true};col.push(c)})
    setG(ng); setMoves4(m=>m+1)
  }

  const rv3=(r:number)=>r===1?'A':r===11?'J':r===12?'Q':r===13?'K':String(r)

  return (
    <div style={{display:'flex',flexDirection:'column',gap:8,padding:8,minWidth:600,userSelect:'none'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{fontSize:'0.7rem',color:'var(--text-muted)'}}>Movimentos: {moves4} · Séries: {g.completed}/8</span>
        {won4&&<span style={{color:'#34d399',fontWeight:800}}>🎉 Vitória!</span>}
        <div style={{display:'flex',gap:6}}>
          <button onClick={deal} disabled={g.stock.length<10||won4} style={{padding:'4px 10px',borderRadius:7,border:'1px solid rgba(96,165,250,0.3)',background:'rgba(96,165,250,0.08)',color:'#60a5fa',fontSize:'0.7rem',cursor:'pointer',fontWeight:700}}>
            Distribuir ({g.stock.length/10})
          </button>
          <button onClick={()=>{setG(initSp());setMoves4(0);setSel3(null);setWon4(false)}} style={{padding:'4px 10px',borderRadius:7,border:'1px solid var(--border)',background:'transparent',color:'var(--text-muted)',fontSize:'0.7rem',cursor:'pointer'}}>↺</button>
        </div>
      </div>
      <div style={{display:'flex',gap:4,alignItems:'flex-start',overflowX:'auto'}}>
        {g.cols.map((col,ci)=>(
          <div key={ci} style={{display:'flex',flexDirection:'column',gap:1,minWidth:52}}>
            {col.length===0?
              <div onClick={()=>clickCol2(ci,-1)} style={{width:50,height:66,borderRadius:7,border:'1px dashed var(--border)',cursor:'pointer'}}/>
            :col.map((card,ri)=>{
              const isSel3=sel3?.col===ci&&ri>=sel3.from
              return(
                <div key={card.id} onClick={()=>clickCol2(ci,ri)}
                  style={{width:50,height:ri===col.length-1?66:18,borderRadius:ri===col.length-1?7:4,background:card.faceUp?'var(--card-bg)':'#1e40af',border:`1px solid ${isSel3?'#fbbf24':card.faceUp?'var(--border-md)':'rgba(30,64,175,0.5)'}`,display:'flex',alignItems:'flex-start',justifyContent:'flex-start',padding:'2px 4px',fontSize:'0.7rem',fontWeight:800,color:'var(--text-primary)',cursor:card.faceUp?'pointer':'default',flexShrink:0,transition:'border-color 0.1s'}}>
                  {card.faceUp&&<>{rv3(card.rank)}♠</>}
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <div style={{fontSize:'0.6rem',color:'var(--text-muted)'}}>1 naipe · Ordene K→A para completar · Clique para selecionar, clique no destino</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 10. PALAVRA CRUZADA (mini 7×7)
// ══════════════════════════════════════════════════════════════════════════════
export function GameCrossword({ onEnd, bestScore: _bs }: GameProps) {
  const PUZZLE = {
    grid: [
      ['#','#','C','#','#','#','#'],
      ['P','R','O','C','E','S','S'],
      ['#','#','N','#','#','#','U'],
      ['L','I','S','T','A','#','P'],
      ['#','#','T','#','G','#','R'],
      ['N','O','I','T','R','E','M'],  // 'NOTIRE' → NOITREM → backward? simplified
      ['#','#','T','#','A','#','O'],
    ],
    clues: {
      across: [
        {n:1,r:1,c:0,answer:'PROCESSO',clue:'Ação judicial em andamento'},
        {n:2,r:3,c:0,answer:'LISTA',clue:'Relação de itens'},
        {n:3,r:5,c:0,answer:'NOITREM',clue:'Conjunto de normas (anag.)'},
      ],
      down: [
        {n:4,r:0,c:2,answer:'CONSTIT',clue:'___ uição federal'},
        {n:5,r:1,c:6,answer:'SUPREMO',clue:'Tribunal maior'},
        {n:6,r:3,c:4,answer:'AGRAVO',clue:'Tipo de recurso'},
      ]
    }
  }

  // Simplified version with a fixed mini crossword
  const FIXED = {
    words: [
      {word:'RECURSO', r:0, c:0, dir:'h', clue:'1→ Meio de impugnação de decisão'},
      {word:'REACAO', r:0, c:0, dir:'v', clue:'1↓ Resposta a estímulo'},
      {word:'TUTELA', r:2, c:0, dir:'h', clue:'3→ Proteção jurisdicional'},
      {word:'CURADOR', r:0, c:5, dir:'v', clue:'5↓ Responsável por incapaz'},
      {word:'AGRAVO', r:4, c:0, dir:'h', clue:'5→ Recurso interlocutório'},
      {word:'NORMA', r:0, c:1, dir:'v', clue:'2↓ Regra jurídica'},
    ]
  }

  const N2 = 8
  type CWCell = {letter:string; black:boolean; clueNum?:number}

  const [grid2] = useState<CWCell[][]>(()=>{
    const g:CWCell[][]=Array.from({length:N2},()=>Array.from({length:N2},()=>({letter:'',black:true})))
    FIXED.words.forEach(w=>{
      for(let i=0;i<w.word.length;i++){
        const r=w.dir==='h'?w.r:w.r+i
        const c=w.dir==='h'?w.c+i:w.c
        if(r<N2&&c<N2) g[r][c]={letter:w.word[i],black:false}
      }
    })
    return g
  })

  const [input2,setInput2]=useState<string[][]>(()=>Array.from({length:N2},()=>Array(N2).fill('')))
  const [sel4,setSel4]=useState<[number,number]|null>(null)
  const [won5,setWon5]=useState(false)
  const [checks,setChecks]=useState(0)

  function check(){
    let allOk=true
    grid2.forEach((row,r)=>row.forEach((cell,c)=>{if(!cell.black&&input2[r][c].toUpperCase()!==cell.letter) allOk=false}))
    setChecks(n=>n+1)
    if(allOk){setWon5(true);onEnd('win',Math.max(0,300-checks*20))}
    return allOk
  }

  function typeAt(r:number,c:number,v:string){
    if(grid2[r][c].black) return
    const ni=input2.map(row=>[...row]); ni[r][c]=v.toUpperCase().slice(-1); setInput2(ni)
  }

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:12,padding:12}}>
      <SBar items={[{l:won5?'🎉 Correto!':'Preencha a cruzada',v:'',c:won5?'52,211,153':'96,165,250'},{l:'Verificações',v:checks,c:'251,191,36'}]}/>
      <div style={{display:'grid',gridTemplateColumns:`repeat(${N2},1fr)`,gap:2}}>
        {grid2.map((row,r)=>row.map((cell,c)=>(
          <div key={`${r}-${c}`} style={{position:'relative'}}>
            {cell.black?(
              <div style={{width:38,height:38,background:'var(--text-primary)',borderRadius:3,opacity:0.15}}/>
            ):(
              <input
                maxLength={1} value={input2[r][c]} onChange={e=>typeAt(r,c,e.target.value)}
                onClick={()=>setSel4([r,c])}
                style={{width:38,height:38,borderRadius:4,border:`2px solid ${sel4?.[0]===r&&sel4?.[1]===c?'#60a5fa':'var(--border-md)'}`,background:input2[r][c]&&input2[r][c]===cell.letter?'rgba(52,211,153,0.1)':'var(--card-bg)',color:'var(--text-primary)',textAlign:'center',fontFamily:'monospace',fontWeight:800,fontSize:'0.85rem',outline:'none',cursor:'pointer',textTransform:'uppercase'}}
              />
            )}
          </div>
        )))}
      </div>
      {/* Clues */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,width:'100%',maxWidth:440,fontSize:'0.65rem',color:'var(--text-muted)'}}>
        {FIXED.words.map((w,i)=>(
          <div key={i} style={{padding:'4px 8px',borderRadius:7,background:'var(--card-bg)',border:'1px solid var(--border)'}}>{w.clue}</div>
        ))}
      </div>
      <div style={{display:'flex',gap:8}}>
        <button onClick={check} style={{padding:'8px 20px',borderRadius:10,border:'none',background:'linear-gradient(135deg,#60a5fa,#1A73E8)',color:'#fff',fontWeight:800,cursor:'pointer',fontSize:'0.82rem'}}>✓ Verificar</button>
        <button onClick={()=>{setInput2(Array.from({length:N2},()=>Array(N2).fill('')));setSel4(null);setWon5(false)}} style={{padding:'8px 14px',borderRadius:10,border:'1px solid var(--border)',background:'transparent',color:'var(--text-muted)',cursor:'pointer',fontSize:'0.78rem'}}>↺</button>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 11. JIGSAW PUZZLE (número — ordene os blocos)
// ══════════════════════════════════════════════════════════════════════════════
export function GameJigsaw({ onEnd, bestScore: _bs }: GameProps) {
  const N3 = 4
  function shuffle2<T>(a:T[]):T[]{return [...a].sort(()=>Math.random()-0.5)}
  const IMAGES = [
    ['🌟','⭐','✨','💫','🌙','☀️','🌈','🌊','🏔️','🌺','🦋','🐬','🌴','🦁','🎯','🎨'],
    ['🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔶','🔷','🔸','🔹','🟥','🟦','🟩'],
  ]
  const [imgIdx]=useState(()=>Math.floor(Math.random()*IMAGES.length))
  const [pieces,setPieces]=useState(()=>shuffle2(IMAGES[imgIdx].map((em,i)=>({id:i,emoji:em,correct:i}))))
  const [sel5,setSel5]=useState<number|null>(null)
  const [moves5,setMoves5]=useState(0)
  const [won6,setWon6]=useState(false)

  function click5(pos:number){
    if(won6) return
    if(sel5===null){setSel5(pos);return}
    if(sel5===pos){setSel5(null);return}
    const np=[...pieces];[np[sel5],np[pos]]=[np[pos],np[sel5]]
    const nm=moves5+1; setMoves5(nm); setSel5(null); setPieces(np)
    if(np.every((p,i)=>p.id===i)){setWon6(true);onEnd('win',Math.max(0,500-nm*10))}
  }

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:14,padding:16}}>
      <SBar items={[{l:'Movimentos',v:moves5,c:'96,165,250'},{l:won6?'🎉 Completo!':'Ordene as peças',v:'',c:won6?'52,211,153':'167,139,250'},{l:'Recorde',v:_bs,c:'251,191,36'}]}/>
      <div style={{display:'grid',gridTemplateColumns:`repeat(${N3},1fr)`,gap:4,background:'#1e293b',padding:6,borderRadius:14}}>
        {pieces.map((p,pos)=>(
          <div key={pos} onClick={()=>click5(pos)}
            style={{width:68,height:68,borderRadius:10,background:p.id===pos?(won6?'rgba(52,211,153,0.15)':'rgba(96,165,250,0.08)'):sel5===pos?'rgba(251,191,36,0.12)':'var(--card-bg)',border:`2px solid ${p.id===pos?(won6?'rgba(52,211,153,0.5)':'rgba(96,165,250,0.3)'):sel5===pos?'rgba(251,191,36,0.6)':'var(--border-md)'}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.8rem',cursor:'pointer',transition:'all 0.15s',boxShadow:sel5===pos?'0 0 14px rgba(251,191,36,0.3)':'none'}}>
            {p.emoji}
          </div>
        ))}
      </div>
      {/* Reference */}
      <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
        <div style={{fontSize:'0.6rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.08em'}}>Ordem correta</div>
        <div style={{display:'grid',gridTemplateColumns:`repeat(${N3},1fr)`,gap:2,opacity:0.4}}>
          {IMAGES[imgIdx].map((em,i)=>(
            <div key={i} style={{width:30,height:30,borderRadius:5,background:'var(--card-bg)',border:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.9rem'}}>{em}</div>
          ))}
        </div>
      </div>
      <RBtn onClick={()=>{setPieces(shuffle2(IMAGES[imgIdx].map((em,i)=>({id:i,emoji:em,correct:i}))));setMoves5(0);setSel5(null);setWon6(false)}}/>
      <div style={{fontSize:'0.62rem',color:'var(--text-muted)'}}>Clique em duas peças para trocá-las · Recrie a imagem de referência</div>
    </div>
  )
}

// ══════════════════════════════════════════════════════════════════════════════
// 12. TANGRAM (forma geométrica — reconhecimento)
// ══════════════════════════════════════════════════════════════════════════════
export function GameTangram({ onEnd, bestScore: _bs }: GameProps) {
  const SHAPES_TG = [
    {name:'Quadrado',svg:'M10,10 L90,10 L90,90 L10,90 Z',desc:'4 lados iguais, 4 ângulos retos'},
    {name:'Triângulo',svg:'M50,10 L90,90 L10,90 Z',desc:'3 lados, 3 ângulos'},
    {name:'Retângulo',svg:'M5,25 L95,25 L95,75 L5,75 Z',desc:'4 ângulos retos, lados opostos iguais'},
    {name:'Losango',svg:'M50,10 L90,50 L50,90 L10,50 Z',desc:'4 lados iguais, ângulos oblíquos'},
    {name:'Trapézio',svg:'M20,25 L80,25 L95,75 L5,75 Z',desc:'1 par de lados paralelos'},
    {name:'Paralelogramo',svg:'M20,25 L90,25 L80,75 L10,75 Z',desc:'2 pares de lados paralelos'},
    {name:'Hexágono',svg:'M50,10 L85,30 L85,70 L50,90 L15,70 L15,30 Z',desc:'6 lados iguais'},
    {name:'Pentágono',svg:'M50,10 L90,38 L75,82 L25,82 L10,38 Z',desc:'5 lados e 5 ângulos'},
  ]

  const [qIdx,setQIdx]=useState(()=>Math.floor(Math.random()*SHAPES_TG.length))
  const [opts,setOpts]=useState(()=>{
    const all=[...SHAPES_TG]; const q=all[Math.floor(Math.random()*all.length)]
    const others=all.filter(s=>s.name!==q.name).sort(()=>Math.random()-0.5).slice(0,3)
    return [q,...others].sort(()=>Math.random()-0.5).map(s=>s.name)
  })
  const [score6,setScore6]=useState(0)
  const [round2,setRound2]=useState(1)
  const [feedback6,setFeedback6]=useState<'ok'|'err'|null>(null)
  const [done2,setDone2]=useState(false)
  const TOTAL2=8

  function nextQ(ns:number,nr:number){
    const qi=Math.floor(Math.random()*SHAPES_TG.length)
    setQIdx(qi)
    const all=[...SHAPES_TG]; const q=all[qi]
    const others=all.filter(s=>s.name!==q.name).sort(()=>Math.random()-0.5).slice(0,3)
    setOpts([q,...others].sort(()=>Math.random()-0.5).map(s=>s.name))
    setFeedback6(null); setRound2(nr); setScore6(ns)
  }

  function answer2(name:string){
    if(feedback6||done2) return
    const ok=name===SHAPES_TG[qIdx].name
    const ns=score6+(ok?15:0); setFeedback6(ok?'ok':'err')
    setTimeout(()=>{
      const nr=round2+1
      if(nr>TOTAL2){setDone2(true);onEnd(ns>=80?'win':'play',ns);return}
      nextQ(ns,nr)
    },700)
  }

  const cur=SHAPES_TG[qIdx]

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:14,padding:16}}>
      <SBar items={[{l:'Score',v:score6,c:'96,165,250'},{l:`${round2}/${TOTAL2}`,v:'',c:'251,191,36'},{l:'Recorde',v:_bs,c:'52,211,153'}]}/>
      <div style={{padding:'8px 16px',borderRadius:12,background:'rgba(96,165,250,0.06)',border:`2px solid rgba(${feedback6==='ok'?'52,211,153':feedback6==='err'?'248,113,113':'96,165,250'},0.3)`,transition:'border-color 0.2s'}}>
        <svg viewBox="0 0 100 100" width={160} height={160}>
          <path d={cur.svg} fill="rgba(96,165,250,0.2)" stroke="#60a5fa" strokeWidth="2.5" strokeLinejoin="round"/>
        </svg>
      </div>
      <div style={{fontSize:'0.72rem',color:'var(--text-muted)',textAlign:'center',maxWidth:260}}>{cur.desc}</div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,width:'100%',maxWidth:320}}>
        {opts.map(name=>(
          <button key={name} onClick={()=>answer2(name)} disabled={!!feedback6||done2}
            style={{padding:'12px',borderRadius:12,border:`2px solid ${feedback6?name===cur.name?'rgba(52,211,153,0.5)':'var(--border)':'var(--border-md)'}`,background:feedback6&&name===cur.name?'rgba(52,211,153,0.1)':'var(--card-bg)',color:feedback6&&name===cur.name?'#34d399':'var(--text-primary)',fontWeight:700,fontSize:'0.82rem',cursor:feedback6?'default':'pointer',transition:'all 0.15s'}}>
            {name}
          </button>
        ))}
      </div>
      {done2&&<div style={{color:'#34d399',fontWeight:800}}>🎉 {score6}/{TOTAL2*15} pontos</div>}
    </div>
  )
}
