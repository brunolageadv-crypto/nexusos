import { useState, useEffect, useCallback, useRef } from 'react'
import type { GameProps } from './Arcade'

// ══════════════════════════════════════════════════════════════════════════════
// LOTE A + B — 10 Jogos Completos
// ══════════════════════════════════════════════════════════════════════════════

// ── 1. SUDOKU ─────────────────────────────────────────────────────────────────
function generateSudoku(): { puzzle: (number|null)[][], solution: number[][] } {
  // Fill diagonal 3x3 boxes first, then solve
  const grid: number[][] = Array.from({length:9}, ()=>Array(9).fill(0))
  function possible(g:number[][], r:number, c:number, n:number) {
    for(let i=0;i<9;i++) if(g[r][i]===n||g[i][c]===n) return false
    const br=Math.floor(r/3)*3, bc=Math.floor(c/3)*3
    for(let i=0;i<3;i++) for(let j=0;j<3;j++) if(g[br+i][bc+j]===n) return false
    return true
  }
  function solve(g:number[][]): boolean {
    for(let r=0;r<9;r++) for(let c=0;c<9;c++) if(g[r][c]===0) {
      const nums=[1,2,3,4,5,6,7,8,9].sort(()=>Math.random()-0.5)
      for(const n of nums) if(possible(g,r,c,n)){ g[r][c]=n; if(solve(g)) return true; g[r][c]=0 }
      return false
    }
    return true
  }
  solve(grid)
  const solution = grid.map(r=>[...r])
  const puzzle: (number|null)[][] = grid.map(r=>[...r] as (number|null)[])
  // Remove ~46 cells for medium difficulty
  let removed = 0
  const positions = Array.from({length:81},(_,i)=>i).sort(()=>Math.random()-0.5)
  for(const pos of positions) {
    if(removed >= 46) break
    const r=Math.floor(pos/9), c=pos%9
    puzzle[r][c] = null; removed++
  }
  return { puzzle, solution }
}

export function GameSudoku({ onEnd, bestScore: _bs }: GameProps) {
  const [{ puzzle, solution }] = useState(generateSudoku)
  const [board, setBoard] = useState<(number|null)[][]>(() => puzzle.map(r=>[...r]))
  const [selected, setSelected] = useState<[number,number]|null>(null)
  const [errors, setErrors] = useState<Set<string>>(new Set())
  const [fixed] = useState<Set<string>>(() => { const s=new Set<string>(); puzzle.forEach((r,i)=>r.forEach((v,j)=>{ if(v!==null) s.add(`${i}-${j}`) })); return s })
  const [won, setWon] = useState(false)
  const [mistakeCount, setMistakeCount] = useState(0)
  const [notes, setNotes] = useState<Map<string,Set<number>>>(new Map())
  const [noteMode, setNoteMode] = useState(false)

  const input = useCallback((n: number) => {
    if (!selected || won) return
    const [r,c] = selected
    if (fixed.has(`${r}-${c}`)) return
    if (noteMode) {
      const key = `${r}-${c}`
      const cur = notes.get(key) || new Set<number>()
      const next = new Set(cur)
      next.has(n) ? next.delete(n) : next.add(n)
      const m = new Map(notes); m.set(key, next); setNotes(m)
      return
    }
    const nb = board.map(row=>[...row]); nb[r][c] = n
    const ne = new Set(errors)
    if (solution[r][c] !== n) { ne.add(`${r}-${c}`); setMistakeCount(m=>m+1) }
    else { ne.delete(`${r}-${c}`) }
    setBoard(nb); setErrors(ne)
    // check win
    if (nb.every((row,ri)=>row.every((v,ci)=>v===solution[ri][ci]))) {
      setWon(true); onEnd('win', Math.max(0, 1000 - mistakeCount*50))
    }
  }, [selected, board, solution, fixed, errors, won, mistakeCount, noteMode, notes, onEnd])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!selected) return
      const n = parseInt(e.key)
      if (n >= 1 && n <= 9) input(n)
      if (e.key === 'Backspace' || e.key === '0') {
        const [r,c] = selected
        if (fixed.has(`${r}-${c}`)) return
        const nb = board.map(row=>[...row]); nb[r][c] = null
        const ne = new Set(errors); ne.delete(`${r}-${c}`)
        setBoard(nb); setErrors(ne)
      }
      if (e.key === 'ArrowUp' && selected[0]>0) setSelected([selected[0]-1,selected[1]])
      if (e.key === 'ArrowDown' && selected[0]<8) setSelected([selected[0]+1,selected[1]])
      if (e.key === 'ArrowLeft' && selected[1]>0) setSelected([selected[0],selected[1]-1])
      if (e.key === 'ArrowRight' && selected[1]<8) setSelected([selected[0],selected[1]+1])
    }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [selected, input, board, errors, fixed])

  const selVal = selected ? board[selected[0]][selected[1]] : null
  const sameNum = (r:number,c:number) => selVal !== null && board[r][c] === selVal

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:12,padding:10}}>
      <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',justifyContent:'center'}}>
        <span style={{padding:'5px 12px',borderRadius:8,background:'rgba(248,113,113,0.1)',border:'1px solid rgba(248,113,113,0.25)',fontSize:'0.75rem',color:'#f87171'}}>❌ Erros: {mistakeCount}</span>
        <button onClick={()=>setNoteMode(v=>!v)} style={{padding:'5px 12px',borderRadius:8,border:`1px solid ${noteMode?'rgba(251,191,36,0.5)':'var(--border)'}`,background:noteMode?'rgba(251,191,36,0.1)':'transparent',color:noteMode?'#fbbf24':'var(--text-muted)',fontSize:'0.72rem',fontWeight:700,cursor:'pointer'}}>✏️ Rascunho {noteMode?'ON':'OFF'}</button>
        {won && <span style={{color:'#34d399',fontWeight:800}}>🎉 Parabéns!</span>}
      </div>

      {/* Board */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(9,1fr)',gap:1,background:'#334155',padding:2,borderRadius:10,border:'2px solid #334155'}}>
        {board.map((row,r)=>row.map((val,c)=>{
          const isFixed = fixed.has(`${r}-${c}`)
          const isErr = errors.has(`${r}-${c}`)
          const isSel = selected?.[0]===r && selected?.[1]===c
          const isSameNum = sameNum(r,c) && !isSel
          const isSameRowCol = selected && (selected[0]===r || selected[1]===c || (Math.floor(selected[0]/3)===Math.floor(r/3)&&Math.floor(selected[1]/3)===Math.floor(c/3)))
          const noteSet = notes.get(`${r}-${c}`)
          const borderR = (c+1)%3===0 && c<8 ? '2px solid #334155' : '1px solid rgba(51,65,85,0.5)'
          const borderB = (r+1)%3===0 && r<8 ? '2px solid #334155' : '1px solid rgba(51,65,85,0.5)'
          return (
            <div key={`${r}-${c}`} onClick={()=>setSelected([r,c])}
              style={{width:44,height:44,background:isErr?'rgba(248,113,113,0.2)':isSel?'rgba(96,165,250,0.25)':isSameNum?'rgba(96,165,250,0.12)':isSameRowCol?'rgba(255,255,255,0.04)':'var(--card-bg)',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',borderRight:borderR,borderBottom:borderB,position:'relative',transition:'background 0.1s'}}>
              {val !== null ? (
                <span style={{fontSize:isFixed?'1rem':'0.95rem',fontWeight:isFixed?900:700,color:isErr?'#f87171':isFixed?'var(--text-primary)':'#60a5fa'}}>{val}</span>
              ) : noteSet?.size ? (
                <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',width:'100%',height:'100%',padding:1,boxSizing:'border-box'}}>
                  {[1,2,3,4,5,6,7,8,9].map(n=>(
                    <span key={n} style={{fontSize:'0.45rem',color:'#94a3b8',textAlign:'center',lineHeight:'14px'}}>{noteSet.has(n)?n:''}</span>
                  ))}
                </div>
              ) : null}
            </div>
          )
        }))}
      </div>

      {/* Number pad */}
      <div style={{display:'flex',gap:6}}>
        {[1,2,3,4,5,6,7,8,9].map(n=>(
          <button key={n} onClick={()=>input(n)}
            style={{width:36,height:36,borderRadius:8,border:'1px solid var(--border-md)',background:'var(--card-bg)',color:'var(--text-primary)',fontWeight:800,fontSize:'0.9rem',cursor:'pointer',transition:'all 0.1s'}}
            onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='rgba(96,165,250,0.12)'}
            onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background='var(--card-bg)'}>
            {n}
          </button>
        ))}
      </div>
      <div style={{fontSize:'0.62rem',color:'var(--text-muted)'}}>Clique na célula e use o teclado ou os botões acima</div>
    </div>
  )
}

// ── 2. CONNECT FOUR ───────────────────────────────────────────────────────────
export function GameConnect4({ onEnd, bestScore: _bs }: GameProps) {
  const ROWS=6, COLS=7
  type Cell = null|'P'|'AI'
  const empty = (): Cell[][] => Array.from({length:ROWS},()=>Array(COLS).fill(null))
  const [board, setBoard] = useState<Cell[][]>(empty)
  const [turn, setTurn] = useState<'P'|'AI'>('P')
  const [winner, setWinner] = useState<Cell|'draw'>(null)
  const [winCells, setWinCells] = useState<[number,number][]>([])
  const [hover, setHover] = useState<number|null>(null)

  function checkWin(b:Cell[][], player:Cell): [number,number][]|null {
    const dirs=[[0,1],[1,0],[1,1],[1,-1]]
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) if(b[r][c]===player) {
      for(const [dr,dc] of dirs) {
        const cells:([number,number])[] = [[r,c]]
        for(let k=1;k<4;k++){const nr=r+dr*k,nc=c+dc*k; if(nr<0||nr>=ROWS||nc<0||nc>=COLS||b[nr][nc]!==player) break; cells.push([nr,nc])}
        if(cells.length===4) return cells
      }
    }
    return null
  }

  function drop(col:number, b:Cell[][], player:Cell): Cell[][]|null {
    for(let r=ROWS-1;r>=0;r--) if(!b[r][col]) { const nb=b.map(row=>[...row]) as Cell[][]; nb[r][col]=player; return nb }
    return null
  }

  function aiMove(b:Cell[][]): number {
    // Win if possible
    for(let c=0;c<COLS;c++){const nb=drop(c,b,'AI');if(nb&&checkWin(nb,'AI')) return c}
    // Block player
    for(let c=0;c<COLS;c++){const nb=drop(c,b,'P');if(nb&&checkWin(nb,'P')) return c}
    // Prefer center
    const order=[3,2,4,1,5,0,6]
    for(const c of order) if(b[0][c]===null) return c
    return 0
  }

  const play = useCallback((col:number) => {
    if(winner||turn!=='P') return
    const nb = drop(col, board, 'P'); if(!nb) return
    const w = checkWin(nb,'P')
    if(w){setBoard(nb);setWinner('P');setWinCells(w);onEnd('win',100);return}
    if(nb.every(r=>r.every(c=>c!==null))){setBoard(nb);setWinner('draw');onEnd('draw',50);return}
    setBoard(nb); setTurn('AI')
    setTimeout(()=>{
      const aiCol=aiMove(nb)
      const nb2=drop(aiCol,nb,'AI')!
      const w2=checkWin(nb2,'AI')
      if(w2){setBoard(nb2);setWinner('AI');setWinCells(w2);onEnd('loss',0);return}
      if(nb2.every(r=>r.every(c=>c!==null))){setBoard(nb2);setWinner('draw');onEnd('draw',50);return}
      setBoard(nb2); setTurn('P')
    },400)
  },[board,winner,turn,onEnd])

  const reset=()=>{setBoard(empty());setTurn('P');setWinner(null);setWinCells([])}
  const isWin=(r:number,c:number)=>winCells.some(([wr,wc])=>wr===r&&wc===c)

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:12,padding:10}}>
      <div style={{display:'flex',gap:12,alignItems:'center'}}>
        <span style={{padding:'5px 14px',borderRadius:8,border:`2px solid ${turn==='P'?'rgba(96,165,250,0.5)':'rgba(248,113,113,0.5)'}`,background:turn==='P'?'rgba(96,165,250,0.1)':'rgba(248,113,113,0.1)',fontSize:'0.78rem',fontWeight:700,color:turn==='P'?'#60a5fa':'#f87171'}}>
          {winner?( winner==='P'?'🎉 Você ganhou!':winner==='AI'?'💀 IA venceu!':'🤝 Empate!' ):(turn==='P'?'🔵 Sua vez':'🔴 IA jogando...')}
        </span>
        <button onClick={reset} style={{padding:'5px 12px',borderRadius:8,border:'1px solid var(--border)',background:'transparent',color:'var(--text-muted)',fontSize:'0.72rem',cursor:'pointer'}}>↺ Novo</button>
      </div>

      {/* Column buttons */}
      <div style={{display:'flex',gap:4}}>
        {Array.from({length:COLS},(_,c)=>(
          <button key={c} onClick={()=>play(c)} onMouseEnter={()=>setHover(c)} onMouseLeave={()=>setHover(null)}
            style={{width:52,height:24,borderRadius:6,border:'none',background:hover===c&&!winner&&turn==='P'?'rgba(96,165,250,0.2)':'transparent',cursor:winner||turn==='AI'?'not-allowed':'pointer',color:'#60a5fa',fontSize:'0.9rem',transition:'background 0.1s'}}>
            {hover===c&&!winner&&turn==='P'?'▼':''}
          </button>
        ))}
      </div>

      {/* Board */}
      <div style={{background:'#1e40af',padding:8,borderRadius:14,display:'grid',gridTemplateColumns:`repeat(${COLS},1fr)`,gap:6}}>
        {board.map((row,r)=>row.map((cell,c)=>{
          const win=isWin(r,c)
          return (
            <div key={`${r}-${c}`}
              style={{width:52,height:52,borderRadius:'50%',background:cell==='P'?'#3b82f6':cell==='AI'?'#ef4444':'rgba(15,23,42,0.7)',border:win?'3px solid #fbbf24':'3px solid transparent',boxShadow:win?`0 0 16px #fbbf24`:'inset 0 3px 8px rgba(0,0,0,0.4)',transition:'background 0.2s,box-shadow 0.2s'}}/>
          )
        }))}
      </div>
    </div>
  )
}

// ── 3. DAMAS ──────────────────────────────────────────────────────────────────
export function GameDamas({ onEnd, bestScore: _bs }: GameProps) {
  type Piece = {player:'P'|'AI'; king:boolean}
  type Board = (Piece|null)[][]

  function initBoard(): Board {
    return Array.from({length:8},(_,r)=>Array.from({length:8},(_,c)=>{
      if((r+c)%2===1){
        if(r<3) return {player:'AI' as const,king:false}
        if(r>4) return {player:'P' as const,king:false}
      }
      return null
    }))
  }

  const [board, setBoard] = useState<Board>(initBoard)
  const [selected, setSelected] = useState<[number,number]|null>(null)
  const [moves, setMoves] = useState<[number,number][]>([])
  const [turn, setTurn] = useState<'P'|'AI'>('P')
  const [status, setStatus] = useState<'playing'|'win'|'loss'>('playing')

  function getMoves(b:Board, r:number, c:number): [number,number][] {
    const p=b[r][c]; if(!p) return []
    const dirs=p.player==='P'?[[-1,-1],[-1,1]]:(p.king?[[-1,-1],[-1,1],[1,-1],[1,1]]:[[1,-1],[1,1]])
    if(p.king) dirs.push(...(p.player==='P'?[[1,-1],[1,1]]:[[-1,-1],[-1,1]]))
    const result:[number,number][]=[]
    for(const [dr,dc] of dirs){
      const nr=r+dr,nc=c+dc
      if(nr<0||nr>7||nc<0||nc>7) continue
      if(!b[nr][nc]){result.push([nr,nc]); continue}
      if(b[nr][nc]!.player!==p.player){const jr=nr+dr,jc=nc+dc; if(jr>=0&&jr<=7&&jc>=0&&jc<=7&&!b[jr][jc]) result.push([jr,jc])}
    }
    return result
  }

  function applyMove(b:Board,fr:number,fc:number,tr:number,tc:number):Board {
    const nb=b.map(row=>row.map(c=>c?{...c}:null))
    const p=nb[fr][fc]!; nb[tr][tc]=p; nb[fr][fc]=null
    if(Math.abs(tr-fr)===2){nb[Math.floor((fr+tr)/2)][Math.floor((fc+tc)/2)]=null}
    if(p.player==='P'&&tr===0) p.king=true
    if(p.player==='AI'&&tr===7) p.king=true
    return nb
  }

  const clickCell=(r:number,c:number)=>{
    if(turn!=='P'||status!=='playing') return
    if(selected){
      if(moves.some(([mr,mc])=>mr===r&&mc===c)){
        const nb=applyMove(board,selected[0],selected[1],r,c)
        const aiPieces=nb.flat().filter(p=>p?.player==='AI').length
        if(aiPieces===0){setBoard(nb);setStatus('win');onEnd('win',200);return}
        setBoard(nb);setSelected(null);setMoves([]);setTurn('AI')
        setTimeout(()=>doAI(nb),500)
        return
      }
      setSelected(null);setMoves([])
    }
    if(b[r]?.[c]?.player==='P'){
      const m=getMoves(board,r,c)
      setSelected([r,c]);setMoves(m)
    }
    function b(){ return board }
    if(board[r]?.[c]?.player==='P'){const m=getMoves(board,r,c);setSelected([r,c]);setMoves(m)}
  }

  function doAI(b:Board){
    const pieces:[number,number][]=[]
    b.forEach((row,r)=>row.forEach((p,c)=>{if(p?.player==='AI') pieces.push([r,c])}))
    const allMoves:[number,number,number,number][]=[]
    pieces.forEach(([r,c])=>getMoves(b,r,c).forEach(([tr,tc])=>allMoves.push([r,c,tr,tc])))
    if(!allMoves.length){setStatus('win');onEnd('win',200);return}
    // Prefer captures
    const captures=allMoves.filter(([fr,fc,tr,tc])=>Math.abs(tr-fr)===2)
    const mv=captures.length?captures[Math.floor(Math.random()*captures.length)]:allMoves[Math.floor(Math.random()*allMoves.length)]
    const nb=applyMove(b,mv[0],mv[1],mv[2],mv[3])
    const pPieces=nb.flat().filter(p=>p?.player==='P').length
    if(!pPieces){setBoard(nb);setStatus('loss');onEnd('loss',0);return}
    setBoard(nb);setTurn('P')
  }

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:12,padding:10}}>
      <div style={{display:'flex',gap:12,alignItems:'center'}}>
        <span style={{padding:'5px 14px',borderRadius:8,border:'1px solid var(--border)',fontSize:'0.75rem',fontWeight:600,color:status==='win'?'#34d399':status==='loss'?'#f87171':'var(--text-secondary)'}}>
          {status==='win'?'🎉 Você ganhou!':status==='loss'?'💀 IA venceu!':(turn==='P'?'⚪ Sua vez (brancas)':'⚫ IA jogando...')}
        </span>
        <button onClick={()=>{setBoard(initBoard());setSelected(null);setMoves([]);setTurn('P');setStatus('playing')}} style={{padding:'5px 12px',borderRadius:8,border:'1px solid var(--border)',background:'transparent',color:'var(--text-muted)',fontSize:'0.72rem',cursor:'pointer'}}>↺ Novo</button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(8,1fr)',gap:0,border:'2px solid #334155',borderRadius:8,overflow:'hidden'}}>
        {board.map((row,r)=>row.map((piece,c)=>{
          const dark=(r+c)%2===1
          const isSel=selected?.[0]===r&&selected?.[1]===c
          const isMove=moves.some(([mr,mc])=>mr===r&&mc===c)
          return (
            <div key={`${r}-${c}`} onClick={()=>clickCell(r,c)}
              style={{width:52,height:52,background:isMove?'rgba(96,165,250,0.35)':isSel?'rgba(251,191,36,0.3)':dark?'#374151':'#e5e7eb',display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',position:'relative'}}>
              {isMove&&<div style={{width:16,height:16,borderRadius:'50%',background:'rgba(96,165,250,0.6)',border:'2px solid #60a5fa'}}/>}
              {piece&&(
                <div style={{width:40,height:40,borderRadius:'50%',background:piece.player==='P'?'#e5e7eb':'#1f2937',border:`3px solid ${isSel?'#fbbf24':piece.player==='P'?'#9ca3af':'#6b7280'}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1rem',boxShadow:'0 2px 6px rgba(0,0,0,0.3)'}}>
                  {piece.king?'👑':''}
                </div>
              )}
            </div>
          )
        }))}
      </div>
      <div style={{fontSize:'0.62rem',color:'var(--text-muted)'}}>Clique na peça branca e depois no destino</div>
    </div>
  )
}

// ── 4. MASTERMIND ─────────────────────────────────────────────────────────────
export function GameMastermind({ onEnd, bestScore: _bs }: GameProps) {
  const COLORS=['🔴','🟡','🟢','🔵','🟣','🟠']
  const CODE_LEN=4, MAX_TRIES=10
  const [secret]=useState(()=>Array.from({length:CODE_LEN},()=>COLORS[Math.floor(Math.random()*COLORS.length)]))
  const [guesses,setGuesses]=useState<{guess:string[];blacks:number;whites:number}[]>([])
  const [current,setCurrent]=useState<string[]>([])
  const [won,setWon]=useState(false); const [lost,setLost]=useState(false)

  function evaluate(guess:string[]){
    let blacks=0,whites=0
    const sc=[...secret],gc=[...guess]
    for(let i=0;i<CODE_LEN;i++) if(gc[i]===sc[i]){blacks++;sc[i]='x';gc[i]='y'}
    for(let i=0;i<CODE_LEN;i++) if(gc[i]!=='y'){const idx=sc.indexOf(gc[i]);if(idx>=0){whites++;sc[idx]='x'}}
    return {blacks,whites}
  }

  const submit=()=>{
    if(current.length!==CODE_LEN) return
    const {blacks,whites}=evaluate(current)
    const ng=[...guesses,{guess:current,blacks,whites}]
    setGuesses(ng); setCurrent([])
    if(blacks===CODE_LEN){setWon(true);onEnd('win',Math.max(0,500-(ng.length-1)*40));return}
    if(ng.length>=MAX_TRIES){setLost(true);onEnd('loss',0)}
  }

  const addColor=(c:string)=>{ if(current.length<CODE_LEN&&!won&&!lost) setCurrent(p=>[...p,c]) }
  const remove=()=>setCurrent(p=>p.slice(0,-1))

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:12,padding:12}}>
      <div style={{fontSize:'0.8rem',color:'var(--text-secondary)',fontWeight:600}}>
        {won?'🎉 Descobriu o código!':lost?`💀 Era: ${secret.join(' ')}`:`Tentativa ${guesses.length+1}/${MAX_TRIES}`}
      </div>

      {/* History */}
      <div style={{display:'flex',flexDirection:'column',gap:5,maxHeight:280,overflowY:'auto',width:'100%',maxWidth:360}}>
        {guesses.map((g,i)=>(
          <div key={i} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 14px',borderRadius:10,background:'var(--card-bg)',border:'1px solid var(--border)'}}>
            <span style={{fontSize:'0.65rem',color:'var(--text-muted)',fontFamily:'monospace',width:20}}>{i+1}.</span>
            <div style={{display:'flex',gap:4,flex:1}}>
              {g.guess.map((c,j)=><span key={j} style={{fontSize:'1.2rem'}}>{c}</span>)}
            </div>
            <div style={{display:'flex',gap:6,fontSize:'0.72rem',fontWeight:700}}>
              <span style={{color:'#1f2937',background:'#f1f5f9',padding:'2px 8px',borderRadius:6}}>⚫{g.blacks}</span>
              <span style={{color:'#1f2937',background:'#fef3c7',padding:'2px 8px',borderRadius:6}}>⚪{g.whites}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Current guess */}
      <div style={{display:'flex',gap:8,padding:'12px 16px',borderRadius:12,background:'rgba(96,165,250,0.06)',border:'1px solid rgba(96,165,250,0.2)',minWidth:200,justifyContent:'center'}}>
        {Array.from({length:CODE_LEN},(_,i)=>(
          <div key={i} style={{width:44,height:44,borderRadius:10,border:`2px solid ${current[i]?'rgba(96,165,250,0.4)':'var(--border-md)'}`,background:current[i]?'rgba(255,255,255,0.04)':'var(--bg-hover)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'1.4rem'}}>
            {current[i]||''}
          </div>
        ))}
      </div>

      {/* Color palette */}
      <div style={{display:'flex',gap:8}}>
        {COLORS.map(c=>(
          <button key={c} onClick={()=>addColor(c)} disabled={won||lost||current.length>=CODE_LEN}
            style={{width:44,height:44,borderRadius:10,border:'2px solid var(--border)',background:'var(--card-bg)',fontSize:'1.3rem',cursor:'pointer',transition:'transform 0.1s'}}
            onMouseEnter={e=>(e.currentTarget as HTMLElement).style.transform='scale(1.15)'}
            onMouseLeave={e=>(e.currentTarget as HTMLElement).style.transform='scale(1)'}>
            {c}
          </button>
        ))}
      </div>

      <div style={{display:'flex',gap:8}}>
        <button onClick={remove} style={{padding:'8px 16px',borderRadius:9,border:'1px solid var(--border)',background:'transparent',color:'var(--text-muted)',cursor:'pointer',fontSize:'0.8rem'}}>← Apagar</button>
        <button onClick={submit} disabled={current.length!==CODE_LEN||won||lost}
          style={{padding:'8px 20px',borderRadius:9,border:'none',background:current.length===CODE_LEN&&!won&&!lost?'linear-gradient(135deg,#7c3aed,#a855f7)':'rgba(255,255,255,0.06)',color:current.length===CODE_LEN&&!won&&!lost?'#fff':'var(--text-muted)',fontWeight:800,cursor:current.length===CODE_LEN&&!won&&!lost?'pointer':'not-allowed',fontSize:'0.85rem'}}>
          ✓ Confirmar
        </button>
      </div>
      <div style={{fontSize:'0.62rem',color:'var(--text-muted)'}}>⚫ = cor e posição certa · ⚪ = cor certa, posição errada</div>
    </div>
  )
}

// ── 5. LABIRINTO ──────────────────────────────────────────────────────────────
function generateMaze(rows:number,cols:number){
  const visited=Array.from({length:rows},()=>Array(cols).fill(false))
  const walls={h:Array.from({length:rows+1},()=>Array(cols).fill(true)),v:Array.from({length:rows},()=>Array(cols+1).fill(true))}
  function dfs(r:number,c:number){
    visited[r][c]=true
    const dirs=[[0,1],[1,0],[0,-1],[-1,0]].sort(()=>Math.random()-0.5)
    for(const [dr,dc] of dirs){
      const nr=r+dr,nc=c+dc
      if(nr>=0&&nr<rows&&nc>=0&&nc<cols&&!visited[nr][nc]){
        if(dc===1) walls.v[r][c+1]=false
        else if(dc===-1) walls.v[r][c]=false
        else if(dr===1) walls.h[r+1][c]=false
        else walls.h[r][c]=false
        dfs(nr,nc)
      }
    }
  }
  dfs(0,0); walls.h[0][0]=false; walls.h[rows][cols-1]=false
  return walls
}

export function GameMaze({ onEnd, bestScore }: GameProps) {
  const ROWS=15,COLS=15,CELL=28
  const [maze]=useState(()=>generateMaze(ROWS,COLS))
  const [pos,setPos]=useState<[number,number]>([0,0])
  const [steps,setSteps]=useState(0); const [won,setWon]=useState(false)
  const [startTime]=useState(Date.now())
  const [elapsed,setElapsed]=useState(0)

  useEffect(()=>{
    if(won) return
    const i=setInterval(()=>setElapsed(Math.floor((Date.now()-startTime)/1000)),1000)
    return()=>clearInterval(i)
  },[won,startTime])

  const move=useCallback((dr:number,dc:number)=>{
    if(won) return
    const [r,c]=pos; const nr=r+dr,nc=c+dc
    if(nr<0||nr>=ROWS||nc<0||nc>=COLS) return
    // Check wall
    if(dc===1&&maze.v[r][c+1]) return
    if(dc===-1&&maze.v[r][c]) return
    if(dr===1&&maze.h[r+1][c]) return
    if(dr===-1&&maze.h[r][c]) return
    const ns=steps+1; setSteps(ns); setPos([nr,nc])
    if(nr===ROWS-1&&nc===COLS-1){setWon(true);onEnd('win',Math.max(100,1000-ns));return}
  },[pos,maze,won,steps,onEnd])

  useEffect(()=>{
    const h=(e:KeyboardEvent)=>{
      const m:Record<string,[number,number]>={'ArrowUp':[-1,0],'ArrowDown':[1,0],'ArrowLeft':[0,-1],'ArrowRight':[0,1],'w':[-1,0],'s':[1,0],'a':[0,-1],'d':[0,1]}
      if(m[e.key]){e.preventDefault();move(...m[e.key])}
    }
    window.addEventListener('keydown',h); return()=>window.removeEventListener('keydown',h)
  },[move])

  const W=COLS*CELL+2, H=ROWS*CELL+2

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:12}}>
      <div style={{display:'flex',gap:12}}>
        <span style={{padding:'5px 12px',borderRadius:8,background:'rgba(167,139,250,0.1)',border:'1px solid rgba(167,139,250,0.25)',fontSize:'0.75rem',color:'#a78bfa'}}>👣 {steps} passos</span>
        <span style={{padding:'5px 12px',borderRadius:8,background:'rgba(255,255,255,0.03)',border:'1px solid var(--border)',fontSize:'0.75rem',color:'var(--text-muted)'}}>⏱ {elapsed}s</span>
        {bestScore>0&&<span style={{padding:'5px 12px',borderRadius:8,background:'rgba(251,191,36,0.08)',border:'1px solid rgba(251,191,36,0.2)',fontSize:'0.75rem',color:'#fbbf24'}}>🏆 Recorde: {bestScore}</span>}
      </div>
      <svg width={W} height={H} style={{borderRadius:8,border:'1px solid var(--border)'}}>
        <rect width={W} height={H} fill="#0f0f1a"/>
        {/* Draw walls */}
        {Array.from({length:ROWS+1},(_,r)=>Array.from({length:COLS},(_,c)=>
          maze.h[r][c]&&<line key={`h${r}${c}`} x1={c*CELL+1} y1={r*CELL+1} x2={(c+1)*CELL+1} y2={r*CELL+1} stroke="#334155" strokeWidth={2}/>
        ))}
        {Array.from({length:ROWS},(_,r)=>Array.from({length:COLS+1},(_,c)=>
          maze.v[r][c]&&<line key={`v${r}${c}`} x1={c*CELL+1} y1={r*CELL+1} x2={c*CELL+1} y2={(r+1)*CELL+1} stroke="#334155" strokeWidth={2}/>
        ))}
        {/* Exit */}
        <rect x={(COLS-1)*CELL+4} y={(ROWS-1)*CELL+4} width={CELL-6} height={CELL-6} rx={4} fill="rgba(52,211,153,0.3)" stroke="#34d399" strokeWidth={1.5}/>
        <text x={(COLS-1)*CELL+CELL/2+1} y={(ROWS-1)*CELL+CELL/2+5} textAnchor="middle" fill="#34d399" fontSize={12}>★</text>
        {/* Player */}
        <circle cx={pos[1]*CELL+CELL/2+1} cy={pos[0]*CELL+CELL/2+1} r={CELL/2-4} fill="#60a5fa" opacity={0.9}/>
        <circle cx={pos[1]*CELL+CELL/2+1} cy={pos[0]*CELL+CELL/2+1} r={CELL/2-7} fill="#93c5fd" opacity={0.7}/>
      </svg>
      {won&&<div style={{color:'#34d399',fontWeight:800,fontSize:'1rem'}}>🎉 Saída encontrada em {steps} passos!</div>}
      <div style={{display:'flex',gap:4,flexDirection:'column',alignItems:'center'}}>
        <button onClick={()=>move(-1,0)} style={{width:36,height:36,borderRadius:8,border:'1px solid var(--border-md)',background:'var(--card-bg)',cursor:'pointer',color:'var(--text-primary)',fontSize:'0.9rem'}}>▲</button>
        <div style={{display:'flex',gap:4}}>
          <button onClick={()=>move(0,-1)} style={{width:36,height:36,borderRadius:8,border:'1px solid var(--border-md)',background:'var(--card-bg)',cursor:'pointer',color:'var(--text-primary)',fontSize:'0.9rem'}}>◀</button>
          <button onClick={()=>move(1,0)} style={{width:36,height:36,borderRadius:8,border:'1px solid var(--border-md)',background:'var(--card-bg)',cursor:'pointer',color:'var(--text-primary)',fontSize:'0.9rem'}}>▼</button>
          <button onClick={()=>move(0,1)} style={{width:36,height:36,borderRadius:8,border:'1px solid var(--border-md)',background:'var(--card-bg)',cursor:'pointer',color:'var(--text-primary)',fontSize:'0.9rem'}}>▶</button>
        </div>
      </div>
      <div style={{fontSize:'0.62rem',color:'var(--text-muted)'}}>WASD ou setas do teclado para mover</div>
    </div>
  )
}

// ── 6. TORRES DE HANÓI ───────────────────────────────────────────────────────
export function GameHanoi({ onEnd, bestScore: _bs }: GameProps) {
  const N=5
  const [pegs,setPegs]=useState<number[][]>([Array.from({length:N},(_,i)=>N-i),[],[]])
  const [sel,setSel]=useState<number|null>(null)
  const [moves,setMoves]=useState(0); const [won,setWon]=useState(false)

  const click=(peg:number)=>{
    if(won) return
    if(sel===null){
      if(pegs[peg].length) setSel(peg)
    } else {
      if(sel===peg){setSel(null);return}
      const from=pegs[sel],to=pegs[peg]
      if(to.length&&to[to.length-1]<from[from.length-1]){setSel(null);return}
      const np=pegs.map(p=>[...p])
      np[peg].push(np[sel].pop()!)
      const nm=moves+1; setMoves(nm)
      setSel(null); setPegs(np)
      if(np[2].length===N){setWon(true);onEnd('win',Math.max(0,500-nm+Math.pow(2,N)-1))}
    }
  }

  const maxH=N*36+20
  const optimal=Math.pow(2,N)-1

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:14,padding:16}}>
      <div style={{display:'flex',gap:12}}>
        <span style={{padding:'5px 12px',borderRadius:8,background:'rgba(96,165,250,0.1)',border:'1px solid rgba(96,165,250,0.25)',fontSize:'0.75rem',color:'#60a5fa'}}>Movimentos: {moves}</span>
        <span style={{padding:'5px 12px',borderRadius:8,background:'rgba(255,255,255,0.03)',border:'1px solid var(--border)',fontSize:'0.75rem',color:'var(--text-muted)'}}>Ótimo: {optimal}</span>
        {won&&<span style={{color:'#34d399',fontWeight:800}}>🎉 Resolvido!</span>}
      </div>

      <div style={{display:'flex',gap:20,alignItems:'flex-end',height:maxH+50,position:'relative'}}>
        {pegs.map((peg,pi)=>{
          const isSel=sel===pi
          return(
            <div key={pi} onClick={()=>click(pi)}
              style={{width:120,height:maxH+40,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'flex-end',cursor:'pointer',position:'relative'}}>
              {/* Peg pole */}
              <div style={{position:'absolute',bottom:20,width:8,height:maxH,background:isSel?'#60a5fa':'#475569',borderRadius:4,zIndex:0,transition:'background 0.2s'}}/>
              {/* Base */}
              <div style={{width:110,height:14,background:isSel?'rgba(96,165,250,0.3)':'rgba(71,85,105,0.5)',borderRadius:7,zIndex:1,border:isSel?'2px solid #60a5fa':'2px solid transparent',transition:'all 0.2s'}}/>
              {/* Discs */}
              {peg.map((disc,di)=>{
                const w=disc*18+20
                const colors=['#f87171','#fb923c','#fbbf24','#34d399','#60a5fa']
                return(
                  <div key={di} style={{position:'absolute',bottom:14+di*30,width:w,height:26,borderRadius:13,background:colors[(disc-1)%5],border:'2px solid rgba(255,255,255,0.15)',zIndex:2,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.65rem',fontWeight:800,color:'rgba(255,255,255,0.8)',boxShadow:'0 2px 8px rgba(0,0,0,0.3)',transition:'all 0.2s'}}>
                    {disc}
                  </div>
                )
              })}
              <div style={{marginTop:6,fontSize:'0.65rem',color:isSel?'#60a5fa':'var(--text-muted)',fontWeight:isSel?700:400,zIndex:3}}>Pino {pi+1}</div>
            </div>
          )
        })}
      </div>
      <div style={{fontSize:'0.65rem',color:'var(--text-muted)',textAlign:'center',maxWidth:320}}>
        Clique num pino para selecionar, depois no destino. Mova todos os discos para o pino 3.
        {sel!==null&&<span style={{color:'#60a5fa'}}> Pino {sel+1} selecionado.</span>}
      </div>
    </div>
  )
}

// ── 7. QUEBRA-CABEÇA DESLIZANTE (15-puzzle) ──────────────────────────────────
export function GamePuzzleSlide({ onEnd, bestScore }: GameProps) {
  const N=4
  function initPuzzle(){
    let tiles=Array.from({length:N*N},(_,i)=>i)
    // shuffle with even permutation
    for(let i=tiles.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[tiles[i],tiles[j]]=[tiles[j],tiles[i]]}
    // Ensure solvable
    let inv=0; for(let i=0;i<tiles.length;i++) for(let j=i+1;j<tiles.length;j++) if(tiles[i]&&tiles[j]&&tiles[i]>tiles[j]) inv++
    const blankRow=Math.floor(tiles.indexOf(0)/N)
    if((inv%2===0)!==(blankRow%2===1)){const a=tiles.findIndex(t=>t!==0),b=a+1<tiles.length&&tiles[a+1]!==0?a+1:a+2;[tiles[a],tiles[b]]=[tiles[b],tiles[a]]}
    return tiles
  }
  const [tiles,setTiles]=useState(initPuzzle)
  const [moves,setMoves]=useState(0); const [won,setWon]=useState(false)

  const click=(i:number)=>{
    if(won) return
    const blank=tiles.indexOf(0)
    const [r,c]=[Math.floor(i/N),i%N],[br,bc]=[Math.floor(blank/N),blank%N]
    if(!(Math.abs(r-br)===1&&c===bc||Math.abs(c-bc)===1&&r===br)) return
    const nt=[...tiles];[nt[i],nt[blank]]=[nt[blank],nt[i]]
    const nm=moves+1; setMoves(nm); setTiles(nt)
    if(nt.every((v,i)=>v===i)){setWon(true);onEnd('win',Math.max(0,1000-nm*3))}
  }

  const goal=Array.from({length:N*N},(_,i)=>i)

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:12,padding:16}}>
      <div style={{display:'flex',gap:12}}>
        <span style={{padding:'5px 12px',borderRadius:8,background:'rgba(96,165,250,0.1)',border:'1px solid rgba(96,165,250,0.25)',fontSize:'0.75rem',color:'#60a5fa'}}>Movimentos: {moves}</span>
        {bestScore>0&&<span style={{padding:'5px 12px',borderRadius:8,background:'rgba(251,191,36,0.08)',border:'1px solid rgba(251,191,36,0.2)',fontSize:'0.75rem',color:'#fbbf24'}}>🏆 Recorde: {bestScore}</span>}
        {won&&<span style={{color:'#34d399',fontWeight:800}}>🎉 Parabéns!</span>}
      </div>
      <div style={{display:'grid',gridTemplateColumns:`repeat(${N},1fr)`,gap:5,background:'#1e293b',padding:8,borderRadius:14}}>
        {tiles.map((v,i)=>{
          const correct=v===goal[i]
          return(
            <div key={i} onClick={()=>click(i)}
              style={{width:72,height:72,borderRadius:10,background:v===0?'transparent':correct&&won?'rgba(52,211,153,0.2)':'var(--card-bg)',border:`2px solid ${v===0?'transparent':correct&&won?'rgba(52,211,153,0.5)':'var(--border-md)'}`,display:'flex',alignItems:'center',justifyContent:'center',cursor:v===0?'default':'pointer',fontFamily:'var(--font-display)',fontWeight:900,fontSize:'1.4rem',color:correct&&won?'#34d399':'var(--text-primary)',transition:'all 0.15s',boxShadow:v===0?'none':'0 2px 8px rgba(0,0,0,0.2)'}}>
              {v||''}
            </div>
          )
        })}
      </div>
      <button onClick={()=>{setTiles(initPuzzle());setMoves(0);setWon(false)}} style={{padding:'7px 18px',borderRadius:9,border:'none',background:'rgba(96,165,250,0.12)',color:'#60a5fa',fontWeight:700,cursor:'pointer',fontSize:'0.78rem'}}>↺ Embaralhar</button>
      <div style={{fontSize:'0.62rem',color:'var(--text-muted)'}}>Organize os números de 0 a 15 em ordem</div>
    </div>
  )
}

// ── 8. SEQUÊNCIAS LÓGICAS ────────────────────────────────────────────────────
export function GameLogicSeq({ onEnd, bestScore }: GameProps) {
  type SeqType='arith'|'geo'|'fib'|'square'|'prime'|'alt'
  function genSeq():{seq:(number|'?')[],answer:number,rule:string}{
    const type:SeqType=['arith','geo','fib','square','prime','alt'][Math.floor(Math.random()*6)] as SeqType
    let full:number[]=[]
    if(type==='arith'){const s=Math.floor(Math.random()*10)+1,d=Math.floor(Math.random()*8)+2;full=Array.from({length:7},(_,i)=>s+d*i)}
    else if(type==='geo'){const s=Math.floor(Math.random()*3)+1,r=Math.floor(Math.random()*3)+2;full=Array.from({length:6},(_,i)=>s*Math.pow(r,i))}
    else if(type==='fib'){const a=Math.floor(Math.random()*5)+1,b=Math.floor(Math.random()*5)+1;full=[a,b];for(let i=2;i<7;i++) full.push(full[i-1]+full[i-2])}
    else if(type==='square'){const s=Math.floor(Math.random()*3)+1;full=Array.from({length:6},(_,i)=>Math.pow(s+i,2))}
    else if(type==='prime'){const primes=[2,3,5,7,11,13,17,19,23,29,31];const s=Math.floor(Math.random()*5);full=primes.slice(s,s+6)}
    else{const a=Math.floor(Math.random()*10)+1,b=Math.floor(Math.random()*10)+11;full=Array.from({length:7},(_,i)=>i%2===0?a:b)}
    const ansIdx=Math.floor(full.length/2)+1+Math.floor(Math.random()*2)
    const answer=full[ansIdx]
    const seq=[...full] as (number|'?')[]; seq[ansIdx]='?'
    const rules={arith:'Progressão Aritmética',geo:'Progressão Geométrica',fib:'Sequência de Fibonacci',square:'Quadrados Perfeitos',prime:'Números Primos',alt:'Sequência Alternada'}
    return{seq:seq.slice(0,Math.min(full.length,7)),answer,rule:rules[type]}
  }
  const [q,setQ]=useState(genSeq); const [input,setInput]=useState(''); const [score,setScore]=useState(0); const [round,setRound]=useState(1); const [feedback,setFeedback]=useState<'ok'|'err'|null>(null); const [done,setDone]=useState(false); const ROUNDS=8

  const submit=()=>{
    if(done||!input.trim()) return
    const ok=parseInt(input)===q.answer
    const ns=score+(ok?15:0)
    setFeedback(ok?'ok':'err')
    setTimeout(()=>{
      setFeedback(null); setInput('')
      if(round>=ROUNDS){setDone(true);onEnd(ns>=80?'win':'play',ns);return}
      setQ(genSeq()); setRound(r=>r+1); setScore(ns)
    },800)
  }

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:16,padding:20}}>
      <div style={{display:'flex',gap:12}}>
        <span style={{padding:'5px 12px',borderRadius:8,background:'rgba(167,139,250,0.1)',border:'1px solid rgba(167,139,250,0.25)',fontSize:'0.75rem',color:'#a78bfa'}}>Score: {score}</span>
        <span style={{padding:'5px 12px',borderRadius:8,background:'rgba(255,255,255,0.03)',border:'1px solid var(--border)',fontSize:'0.75rem',color:'var(--text-muted)'}}>Rodada: {round}/{ROUNDS}</span>
        {bestScore>0&&<span style={{padding:'5px 12px',borderRadius:8,background:'rgba(251,191,36,0.08)',border:'1px solid rgba(251,191,36,0.2)',fontSize:'0.75rem',color:'#fbbf24'}}>🏆 {bestScore}</span>}
      </div>
      <div style={{fontSize:'0.68rem',color:'#a78bfa',fontFamily:'var(--font-mono)',textTransform:'uppercase',letterSpacing:'0.1em'}}>{q.rule}</div>
      <div style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',justifyContent:'center',padding:'20px 24px',borderRadius:16,background:'rgba(167,139,250,0.06)',border:`2px solid ${feedback==='ok'?'rgba(52,211,153,0.4)':feedback==='err'?'rgba(248,113,113,0.4)':'rgba(167,139,250,0.2)'}`,transition:'border-color 0.2s'}}>
        {q.seq.map((v,i)=>(
          <div key={i} style={{padding:'10px 14px',borderRadius:10,background:v==='?'?'rgba(167,139,250,0.15)':'var(--card-bg)',border:`2px solid ${v==='?'?'rgba(167,139,250,0.5)':'var(--border)'}`,fontFamily:'monospace',fontWeight:800,fontSize:'1.1rem',color:v==='?'?'#a78bfa':'var(--text-primary)',minWidth:44,textAlign:'center'}}>
            {v}
          </div>
        ))}
      </div>
      <div style={{display:'flex',gap:8,alignItems:'center'}}>
        <input type="number" value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()}
          placeholder="Resposta" autoFocus
          style={{padding:'10px 16px',borderRadius:10,border:'2px solid var(--border-md)',background:'var(--card-bg)',color:'var(--text-primary)',fontSize:'1.1rem',fontWeight:800,textAlign:'center',outline:'none',width:120}}/>
        <button onClick={submit} disabled={!input.trim()||done}
          style={{padding:'10px 20px',borderRadius:10,border:'none',background:input.trim()&&!done?'linear-gradient(135deg,#7c3aed,#a855f7)':'rgba(255,255,255,0.06)',color:input.trim()&&!done?'#fff':'var(--text-muted)',fontWeight:800,cursor:input.trim()&&!done?'pointer':'not-allowed'}}>
          ✓
        </button>
      </div>
      {feedback==='err'&&<div style={{color:'#f87171',fontWeight:700,fontSize:'0.85rem'}}>❌ Era: {q.answer}</div>}
      {done&&<div style={{color:'#34d399',fontWeight:800}}>🎉 Resultado: {score}/{ROUNDS*15} pontos</div>}
    </div>
  )
}

// ── 9. PACIÊNCIA (Klondike Solitaire) ────────────────────────────────────────
type Card={suit:string;rank:number;faceUp:boolean}
const SUITS=['♠','♥','♦','♣'], RANKS=Array.from({length:13},(_,i)=>i+1)
const rankStr=(r:number)=>['A','2','3','4','5','6','7','8','9','10','J','Q','K'][r-1]
const isRed=(s:string)=>s==='♥'||s==='♦'

export function GamePatience({ onEnd, bestScore: _bs }: GameProps) {
  function initGame(){
    const deck:Card[]=[]
    for(const s of SUITS) for(const r of RANKS) deck.push({suit:s,rank:r,faceUp:false})
    for(let i=deck.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]]}
    const tableau:Card[][]=Array.from({length:7},()=>[])
    let idx=0
    for(let c=0;c<7;c++){for(let r=0;r<=c;r++){tableau[c].push({...deck[idx++],faceUp:r===c})}}
    const stock=deck.slice(idx).map(c=>({...c,faceUp:false}))
    const waste:Card[]=[]
    const found:Card[][]=[[],[],[],[]]
    return{tableau,stock,waste,found}
  }

  const [g,setG]=useState(initGame)
  const [sel,setSel]=useState<{from:'tableau'|'waste';col?:number;cardIdx?:number}|null>(null)
  const [moves,setMoves]=useState(0); const [won,setWon]=useState(false)

  function canPlaceOnFound(card:Card,pile:Card[]):boolean{
    if(!pile.length) return card.rank===1
    const top=pile[pile.length-1]
    return top.suit===card.suit&&card.rank===top.rank+1
  }
  function canPlaceOnTab(card:Card,pile:Card[]):boolean{
    if(!pile.length) return card.rank===13
    const top=pile[pile.length-1]
    return top.faceUp&&isRed(top.suit)!==isRed(card.suit)&&card.rank===top.rank-1
  }

  const clickStock=()=>{
    const ng={...g,stock:[...g.stock],waste:[...g.waste]}
    if(ng.stock.length===0){ng.stock=ng.waste.reverse().map(c=>({...c,faceUp:false}));ng.waste=[];setG(ng);return}
    const card={...ng.stock.pop()!,faceUp:true}; ng.waste.push(card); setG(ng)
  }

  const clickWaste=()=>{
    if(!g.waste.length) return
    const card=g.waste[g.waste.length-1]
    // Try to auto-place on foundation
    for(let fi=0;fi<4;fi++){if(canPlaceOnFound(card,g.found[fi])){const ng={...g,waste:g.waste.slice(0,-1),found:g.found.map((f,i)=>i===fi?[...f,card]:f)};setG(ng);setMoves(m=>m+1);if(ng.found.every(f=>f.length===13)){setWon(true);onEnd('win',500)};return}}
    setSel({from:'waste'})
  }

  const clickTab=(col:number,cardIdx:number)=>{
    const pile=g.tableau[col]; const card=pile[cardIdx]
    if(!card?.faceUp){
      if(cardIdx===pile.length-1){const ng={...g,tableau:g.tableau.map((p,i)=>i===col?p.map((c,ci)=>ci===cardIdx?{...c,faceUp:true}:c):p)};setG(ng);setMoves(m=>m+1)};return
    }
    if(!sel){setSel({from:'tableau',col,cardIdx});return}
    // Move cards
    let moved:Card[]=[]
    let srcPile:Card[]
    if(sel.from==='waste'){moved=[g.waste[g.waste.length-1]];srcPile=g.waste.slice(0,-1)}
    else{moved=g.tableau[sel.col!].slice(sel.cardIdx!);srcPile=g.tableau[sel.col!].slice(0,sel.cardIdx!)}
    if(!canPlaceOnTab(moved[0],pile.slice(0,cardIdx+1))&&!(cardIdx===pile.length-1&&canPlaceOnTab(moved[0],pile))){setSel(null);return}
    const destCards=cardIdx===pile.length-1?[...pile,...moved]:[...pile.slice(0,cardIdx+1),...moved]
    const ng={...g,tableau:g.tableau.map((p,i)=>{
      if(sel.from==='tableau'&&i===sel.col!) return [...srcPile,...(srcPile.length>0&&srcPile[srcPile.length-1]&&!srcPile[srcPile.length-1].faceUp?[{...srcPile[srcPile.length-1],faceUp:true}]:[])].slice(0,sel.cardIdx!)
      if(i===col) return destCards
      return p
    }),waste:sel.from==='waste'?srcPile:g.waste}
    // Fix src pile last card
    if(sel.from==='tableau'){ng.tableau[sel.col!]=srcPile.length>0?srcPile.map((c,i)=>i===srcPile.length-1?{...c,faceUp:true}:c):[]}
    setG(ng); setSel(null); setMoves(m=>m+1)
  }

  const clickFound=(fi:number)=>{
    if(sel?.from==='waste'){
      const card=g.waste[g.waste.length-1]
      if(!canPlaceOnFound(card,g.found[fi])) return
      const ng={...g,waste:g.waste.slice(0,-1),found:g.found.map((f,i)=>i===fi?[...f,card]:f)}
      setG(ng);setSel(null);setMoves(m=>m+1)
      if(ng.found.every(f=>f.length===13)){setWon(true);onEnd('win',500)}
    }
  }

  const cardColor=(c:Card)=>isRed(c.suit)?'#ef4444':'var(--text-primary)'

  return (
    <div style={{display:'flex',flexDirection:'column',gap:10,padding:10,minWidth:600,userSelect:'none'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <span style={{fontSize:'0.72rem',color:'var(--text-muted)'}}>Movimentos: {moves}</span>
        {won&&<span style={{color:'#34d399',fontWeight:800,fontSize:'0.9rem'}}>🎉 Você ganhou!</span>}
        <button onClick={()=>{setG(initGame());setMoves(0);setWon(false);setSel(null)}} style={{padding:'4px 12px',borderRadius:7,border:'1px solid var(--border)',background:'transparent',color:'var(--text-muted)',fontSize:'0.7rem',cursor:'pointer'}}>↺ Novo</button>
      </div>

      {/* Top row: stock, waste, foundations */}
      <div style={{display:'flex',gap:8,alignItems:'flex-start'}}>
        {/* Stock */}
        <div onClick={clickStock} style={{width:52,height:72,borderRadius:7,border:'2px solid var(--border-md)',background:g.stock.length?'#1e40af':'transparent',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:'0.9rem'}}>
          {g.stock.length?'🂠':' ↺'}
        </div>
        {/* Waste */}
        <div onClick={clickWaste} style={{width:52,height:72,borderRadius:7,border:`2px solid ${sel?.from==='waste'?'rgba(251,191,36,0.6)':'var(--border-md)'}`,background:'var(--card-bg)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',position:'relative'}}>
          {g.waste.length>0&&<span style={{fontSize:'0.85rem',fontWeight:800,color:cardColor(g.waste[g.waste.length-1])}}>{rankStr(g.waste[g.waste.length-1].rank)}{g.waste[g.waste.length-1].suit}</span>}
        </div>
        <div style={{flex:1}}/>
        {/* Foundations */}
        {g.found.map((pile,fi)=>(
          <div key={fi} onClick={()=>clickFound(fi)} style={{width:52,height:72,borderRadius:7,border:'2px solid var(--border-md)',background:'rgba(52,211,153,0.05)',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.85rem',fontWeight:800,color:pile.length?cardColor(pile[pile.length-1]):'rgba(52,211,153,0.3)'}}>
            {pile.length?`${rankStr(pile[pile.length-1].rank)}${pile[pile.length-1].suit}`:SUITS[fi]}
          </div>
        ))}
      </div>

      {/* Tableau */}
      <div style={{display:'flex',gap:6,alignItems:'flex-start'}}>
        {g.tableau.map((pile,col)=>(
          <div key={col} style={{width:52,minHeight:80,position:'relative'}}>
            {pile.length===0?
              <div onClick={()=>{if(sel) clickTab(col,0)}} style={{width:52,height:72,borderRadius:7,border:'2px dashed var(--border)',cursor:'pointer'}}/>
            :pile.map((card,ci)=>{
              const isSel=sel?.from==='tableau'&&sel.col===col&&sel.cardIdx===ci
              const isSelGrp=sel?.from==='tableau'&&sel.col===col&&ci>=sel.cardIdx!
              return(
                <div key={ci} onClick={()=>clickTab(col,ci)}
                  style={{position:'absolute',top:ci===0?0:ci*20,width:50,height:70,borderRadius:7,border:`2px solid ${isSel?'#fbbf24':isSelGrp?'rgba(251,191,36,0.5)':'var(--border-md)'}`,background:card.faceUp?'var(--card-bg)':'#1e40af',cursor:'pointer',display:'flex',alignItems:'flex-start',justifyContent:'flex-start',padding:'4px 5px',boxSizing:'border-box',zIndex:ci,boxShadow:'0 1px 4px rgba(0,0,0,0.2)'}}>
                  {card.faceUp&&<span style={{fontSize:'0.72rem',fontWeight:800,color:cardColor(card),lineHeight:1}}>{rankStr(card.rank)}{card.suit}</span>}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 10. CAÇA-PALAVRAS ─────────────────────────────────────────────────────────
const WORD_LIST=['CONSTITUICAO','ADVOCACIA','PROCESSO','RECURSO','SENTENCA','DECRETO','PORTARIA','TRIBUNAL','SUPREMO','LIMINAR','AGRAVO','TUTELA']

export function GameWordSearch({ onEnd, bestScore: _bs }: GameProps) {
  const SIZE=12
  function buildGrid(){
    const words=WORD_LIST.slice(0,7).map(w=>w.replace(/[ÇÃÉÍÓÚÀÂÊÔÕÜ]/g,c=>({Ç:'C',Ã:'A',É:'E',Í:'I',Ó:'O',Ú:'U',À:'A',Â:'A',Ê:'E',Ô:'O',Õ:'O',Ü:'U'}[c]||c)))
    const grid:string[][]=Array.from({length:SIZE},()=>Array(SIZE).fill(''))
    const placed:{ word:string; cells:[number,number][] }[]=[]
    const dirs=[[0,1],[1,0],[1,1],[0,-1],[-1,0],[-1,-1],[1,-1],[-1,1]]
    for(const word of words){
      let ok=false; let tries=0
      while(!ok&&tries<200){
        tries++
        const [dr,dc]=dirs[Math.floor(Math.random()*dirs.length)]
        const r=Math.floor(Math.random()*SIZE), c=Math.floor(Math.random()*SIZE)
        const cells:[number,number][]=[]
        let valid=true
        for(let i=0;i<word.length;i++){
          const nr=r+dr*i,nc=c+dc*i
          if(nr<0||nr>=SIZE||nc<0||nc>=SIZE){valid=false;break}
          if(grid[nr][nc]&&grid[nr][nc]!==word[i]){valid=false;break}
          cells.push([nr,nc])
        }
        if(valid){cells.forEach(([nr,nc],i)=>grid[nr][nc]=word[i]);placed.push({word,cells});ok=true}
      }
    }
    // Fill blanks
    const letters='ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    for(let r=0;r<SIZE;r++) for(let c=0;c<SIZE;c++) if(!grid[r][c]) grid[r][c]=letters[Math.floor(Math.random()*letters.length)]
    return{grid,placed,words:placed.map(p=>p.word)}
  }

  const [{grid,placed,words}]=useState(buildGrid)
  const [found,setFound]=useState<string[]>([])
  const [sel,setSel]=useState<[number,number][]>([])
  const [dragging,setDragging]=useState(false)
  const [won,setWon]=useState(false)
  const [highlight,setHighlight]=useState<Set<string>>(new Set())

  // Build highlight set from found words
  useEffect(()=>{
    const s=new Set<string>()
    placed.filter(p=>found.includes(p.word)).forEach(p=>p.cells.forEach(([r,c])=>s.add(`${r}-${c}`)))
    setHighlight(s)
  },[found,placed])

  const startSel=(r:number,c:number)=>{setDragging(true);setSel([[r,c]])}
  const extSel=(r:number,c:number)=>{
    if(!dragging||!sel.length) return
    const [sr,sc]=sel[0]
    const dr=r-sr,dc=c-sc; const len=Math.max(Math.abs(dr),Math.abs(dc))
    if(len===0){setSel([[r,c]]);return}
    const ndr=Math.sign(dr),ndc=Math.sign(dc)
    if(dr!==0&&dc!==0&&Math.abs(dr)!==Math.abs(dc)) return
    const cells:[number,number][]=Array.from({length:len+1},(_,i)=>[sr+ndr*i,sc+ndc*i])
    setSel(cells)
  }
  const endSel=()=>{
    setDragging(false)
    const selStr=sel.map(([r,c])=>grid[r][c]).join('')
    const selStrRev=[...selStr].reverse().join('')
    const match=placed.find(p=>p.word===selStr||p.word===selStrRev)
    if(match&&!found.includes(match.word)){
      const nf=[...found,match.word]; setFound(nf)
      if(nf.length===words.length){setWon(true);onEnd('win',nf.length*50)}
    }
    setSel([])
  }

  const selSet=new Set(sel.map(([r,c])=>`${r}-${c}`))

  return (
    <div style={{display:'flex',gap:16,padding:10,flexWrap:'wrap',justifyContent:'center'}}>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        <div style={{fontSize:'0.65rem',color:'var(--text-muted)',fontFamily:'var(--font-mono)',textTransform:'uppercase',letterSpacing:'0.08em'}}>
          {found.length}/{words.length} palavras encontradas {won&&'🎉'}
        </div>
        <div onMouseLeave={endSel}
          style={{display:'grid',gridTemplateColumns:`repeat(${SIZE},1fr)`,gap:1,background:'var(--border)',borderRadius:8,padding:1,userSelect:'none'}}>
          {grid.map((row,r)=>row.map((letter,c)=>{
            const key=`${r}-${c}`
            const isH=highlight.has(key); const isS=selSet.has(key)
            return(
              <div key={key}
                onMouseDown={()=>startSel(r,c)} onMouseEnter={()=>extSel(r,c)} onMouseUp={endSel}
                style={{width:30,height:30,background:isH?'rgba(52,211,153,0.25)':isS?'rgba(251,191,36,0.3)':'var(--card-bg)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'0.7rem',fontWeight:isH||isS?800:500,color:isH?'#34d399':isS?'#fbbf24':'var(--text-primary)',cursor:'default',transition:'background 0.1s',borderRadius:3}}>
                {letter}
              </div>
            )
          }))}
        </div>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:6,minWidth:120}}>
        <div style={{fontSize:'0.65rem',color:'var(--text-muted)',fontFamily:'var(--font-mono)',textTransform:'uppercase',marginBottom:4}}>Palavras</div>
        {words.map(w=>(
          <div key={w} style={{fontSize:'0.72rem',fontWeight:found.includes(w)?700:500,color:found.includes(w)?'#34d399':'var(--text-secondary)',textDecoration:found.includes(w)?'line-through':'none',transition:'all 0.2s'}}>
            {found.includes(w)?'✅':' ●'} {w}
          </div>
        ))}
      </div>
    </div>
  )
}
