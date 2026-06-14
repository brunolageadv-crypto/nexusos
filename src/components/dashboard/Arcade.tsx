import { useState, useEffect, useRef, useCallback } from 'react'

// ─── Storage ──────────────────────────────────────────────────────────────────
const SK = {
  xp: 'arcade_xp', history: 'arcade_history', favs: 'arcade_favs',
  records: 'arcade_records', stats: 'arcade_stats', achievements: 'arcade_ach',
  lastGame: 'arcade_last',
}
function load<T>(key: string, def: T): T {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def } catch { return def }
}
function save(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)) } catch {}
}

// ─── XP / Levels ─────────────────────────────────────────────────────────────
const LEVELS = [0,100,250,500,900,1400,2100,3000,4200,5700,7500,9800,12600,16000,20000,25000,31000,38500,47500,58500]
function getLevel(xp: number) {
  let lv = 1
  for (let i = 1; i < LEVELS.length; i++) { if (xp >= LEVELS[i]) lv = i + 1 }
  return Math.min(lv, LEVELS.length)
}
function xpToNext(xp: number) {
  const lv = getLevel(xp)
  if (lv >= LEVELS.length) return 0
  return LEVELS[lv] - xp
}

// ─── Achievements ─────────────────────────────────────────────────────────────
const ACH_DEFS = [
  { id:'first_win',    icon:'🏆', name:'Primeira Vitória',       desc:'Vença seu primeiro jogo',            check:(s:Stats)=>s.wins>=1 },
  { id:'played10',     icon:'🎮', name:'Dez Partidas',           desc:'Jogue 10 partidas',                  check:(s:Stats)=>s.played>=10 },
  { id:'played50',     icon:'🕹️', name:'Cinquenta Partidas',     desc:'Jogue 50 partidas',                  check:(s:Stats)=>s.played>=50 },
  { id:'played100',    icon:'💯', name:'Centenário',             desc:'Jogue 100 partidas',                 check:(s:Stats)=>s.played>=100 },
  { id:'wins10',       icon:'🥇', name:'Dez Vitórias',           desc:'Vença 10 partidas',                  check:(s:Stats)=>s.wins>=10 },
  { id:'wins50',       icon:'🥈', name:'Cinquenta Vitórias',     desc:'Vença 50 partidas',                  check:(s:Stats)=>s.wins>=50 },
  { id:'hour1',        icon:'⏱️', name:'Uma Hora no Arcade',     desc:'Jogue 1 hora no total',              check:(s:Stats)=>s.timeTotal>=3600 },
  { id:'hour5',        icon:'⌛', name:'Cinco Horas',            desc:'Jogue 5 horas no total',             check:(s:Stats)=>s.timeTotal>=18000 },
  { id:'score1000',    icon:'🎯', name:'Mil Pontos',             desc:'Faça 1.000 pontos em qualquer jogo', check:(s:Stats)=>s.bestScore>=1000 },
  { id:'score10000',   icon:'💎', name:'Dez Mil Pontos',         desc:'Faça 10.000 pontos',                 check:(s:Stats)=>s.bestScore>=10000 },
  { id:'diff25',       icon:'🌍', name:'Explorador',             desc:'Jogue 25 jogos diferentes',          check:(s:Stats)=>s.uniqueGames>=25 },
  { id:'diff50',       icon:'🚀', name:'Aventureiro',            desc:'Jogue 50 jogos diferentes',          check:(s:Stats)=>s.uniqueGames>=50 },
  { id:'streak5',      icon:'🔥', name:'Em Chamas',              desc:'5 vitórias seguidas',                check:(s:Stats)=>s.bestStreak>=5 },
  { id:'streak10',     icon:'⚡', name:'Imparável',              desc:'10 vitórias seguidas',               check:(s:Stats)=>s.bestStreak>=10 },
  { id:'xp1000',       icon:'⭐', name:'Mil XP',                 desc:'Acumule 1.000 XP',                   check:(_:Stats,xp:number)=>xp>=1000 },
  { id:'xp5000',       icon:'🌟', name:'Cinco Mil XP',           desc:'Acumule 5.000 XP',                   check:(_:Stats,xp:number)=>xp>=5000 },
  { id:'level5',       icon:'🎖️', name:'Nível 5',                desc:'Alcance o nível 5',                  check:(_:Stats,xp:number)=>getLevel(xp)>=5 },
  { id:'level10',      icon:'👑', name:'Nível 10',               desc:'Alcance o nível 10',                 check:(_:Stats,xp:number)=>getLevel(xp)>=10 },
  { id:'fav5',         icon:'❤️', name:'Colecionador',           desc:'Favorite 5 jogos',                   check:(s:Stats)=>s.favCount>=5 },
  { id:'comeback',     icon:'💪', name:'Persistência',           desc:'Jogue após uma derrota',             check:(s:Stats)=>s.losses>=1&&s.played>s.losses },
]

// ─── Types ────────────────────────────────────────────────────────────────────
interface HistEntry { gameId:string; gameName:string; date:string; duration:number; result:'win'|'loss'|'draw'|'play'; score:number }
interface Stats { played:number; wins:number; losses:number; draws:number; timeTotal:number; bestStreak:number; currentStreak:number; bestScore:number; uniqueGames:number; favCount:number }
const DEFAULT_STATS: Stats = { played:0, wins:0, losses:0, draws:0, timeTotal:0, bestStreak:0, currentStreak:0, bestScore:0, uniqueGames:0, favCount:0 }

// ─── Game Catalog ─────────────────────────────────────────────────────────────
export interface GameDef {
  id: string; name: string; cat: string; icon: string; desc: string; xpWin:number; xpPlay:number; xpRecord:number;
  component: (props: GameProps) => JSX.Element
}
export interface GameProps { onEnd:(result:'win'|'loss'|'draw'|'play', score:number)=>void; bestScore:number }

// ══════════════════════════════════════════════════════════════════════════════
// GAMES
// ══════════════════════════════════════════════════════════════════════════════

// ── 1. 2048 ───────────────────────────────────────────────────────────────────
function Game2048({ onEnd, bestScore }: GameProps) {
  type Board = number[][]
  function emptyBoard(): Board { return Array.from({length:4}, ()=>[0,0,0,0]) }
  function addRandom(b: Board): Board {
    const empty: [number,number][] = []
    b.forEach((r,i)=>r.forEach((v,j)=>{ if(!v) empty.push([i,j]) }))
    if(!empty.length) return b
    const [r,c] = empty[Math.floor(Math.random()*empty.length)]
    b[r][c] = Math.random()<0.9?2:4; return b
  }
  function init(): Board { let b=emptyBoard(); b=addRandom(b); return addRandom(b) }
  const [board, setBoard] = useState<Board>(init)
  const [score, setScore] = useState(0)
  const [over, setOver] = useState(false)
  const [won, setWon] = useState(false)

  const move = useCallback((dir:'up'|'down'|'left'|'right') => {
    if(over||won) return
    let b = board.map(r=>[...r])
    let gained = 0
    function slideRow(row: number[]): number[] {
      const f = row.filter(v=>v); const res: number[] = []
      for(let i=0;i<f.length;i++) {
        if(f[i]===f[i+1]){ res.push(f[i]*2); gained+=f[i]*2; i++ } else res.push(f[i])
      }
      while(res.length<4) res.push(0); return res
    }
    if(dir==='left') b=b.map(r=>slideRow(r))
    if(dir==='right') b=b.map(r=>slideRow([...r].reverse()).reverse())
    if(dir==='up'||dir==='down') {
      for(let c=0;c<4;c++){
        let col=b.map(r=>r[c]); if(dir==='down') col=col.reverse()
        col=slideRow(col); if(dir==='down') col=col.reverse()
        b.forEach((r,i)=>r[c]=col[i])
      }
    }
    const newScore = score+gained
    setScore(newScore)
    b=addRandom(b)
    if(b.flat().includes(2048)&&!won){ setWon(true); onEnd('win',newScore); return }
    // check over
    const canMove = b.flat().includes(0) || b.some((r,i)=>r.some((v,j)=>(j<3&&v===r[j+1])||(i<3&&v===b[i+1][j])))
    if(!canMove){ setOver(true); onEnd('loss',newScore) }
    setBoard(b)
  }, [board,score,over,won,onEnd])

  useEffect(()=>{
    const h=(e:KeyboardEvent)=>{
      const m:Record<string,string>={'ArrowLeft':'left','ArrowRight':'right','ArrowUp':'up','ArrowDown':'down'}
      if(m[e.key]){ e.preventDefault(); move(m[e.key] as any) }
    }
    window.addEventListener('keydown',h); return()=>window.removeEventListener('keydown',h)
  },[move])

  const colors:Record<number,string>={0:'#cdc1b4',2:'#eee4da',4:'#ede0c8',8:'#f2b179',16:'#f59563',32:'#f67c5f',64:'#f65e3b',128:'#edcf72',256:'#edcc61',512:'#edc850',1024:'#edc53f',2048:'#edc22e'}
  const tc=(v:number)=>v<=4?'#776e65':'#f9f6f2'

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:14,padding:16}}>
      <div style={{display:'flex',justifyContent:'space-between',width:'100%',maxWidth:320}}>
        <div style={{fontSize:'1.2rem',fontWeight:900,color:'var(--text-primary)'}}>2048</div>
        <div style={{display:'flex',gap:10}}>
          <div style={{padding:'6px 14px',borderRadius:8,background:'rgba(96,165,250,0.1)',border:'1px solid rgba(96,165,250,0.25)',textAlign:'center'}}>
            <div style={{fontSize:'0.55rem',color:'var(--text-muted)',textTransform:'uppercase'}}>Score</div>
            <div style={{fontWeight:800,color:'#60a5fa'}}>{score}</div>
          </div>
          <div style={{padding:'6px 14px',borderRadius:8,background:'rgba(96,165,250,0.05)',border:'1px solid var(--border)',textAlign:'center'}}>
            <div style={{fontSize:'0.55rem',color:'var(--text-muted)',textTransform:'uppercase'}}>Melhor</div>
            <div style={{fontWeight:800,color:'var(--text-secondary)'}}>{Math.max(score,bestScore)}</div>
          </div>
        </div>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8,background:'#bbada0',padding:10,borderRadius:12}}>
        {board.flat().map((v,i)=>(
          <div key={i} style={{width:70,height:70,borderRadius:8,background:colors[v]||'#3c3a32',display:'flex',alignItems:'center',justifyContent:'center',fontWeight:900,fontSize:v>=1000?'1rem':v>=100?'1.2rem':'1.4rem',color:tc(v),transition:'all 0.1s'}}>
            {v||''}
          </div>
        ))}
      </div>
      {(over||won)&&(
        <div style={{textAlign:'center'}}>
          <div style={{fontSize:'1.1rem',fontWeight:800,color:won?'#34d399':'#f87171'}}>{won?'🎉 Você ganhou!':'💀 Game Over'}</div>
          <button onClick={()=>{setBoard(init());setScore(0);setOver(false);setWon(false)}}
            style={{marginTop:8,padding:'8px 20px',borderRadius:10,border:'none',background:'linear-gradient(135deg,#1A73E8,#60a5fa)',color:'#fff',fontWeight:800,cursor:'pointer'}}>
            Novo Jogo
          </button>
        </div>
      )}
      <div style={{fontSize:'0.65rem',color:'var(--text-muted)'}}>Use as setas do teclado para mover</div>
    </div>
  )
}

// ── 2. Snake ──────────────────────────────────────────────────────────────────
function GameSnake({ onEnd, bestScore }: GameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<{snake:[number,number][];dir:[number,number];food:[number,number];score:number;over:boolean;started:boolean}>({snake:[[10,10]],dir:[1,0],food:[15,15],score:0,over:false,started:false})
  const [score,setScore]=useState(0); const [over,setOver]=useState(false); const [started,setStarted]=useState(false)
  const animRef=useRef<number>()
  const lastRef=useRef(0)

  const randFood=(snake:[number,number][]):[number,number]=>{
    let f:[number,number]; do{ f=[Math.floor(Math.random()*20),Math.floor(Math.random()*20)] }while(snake.some(s=>s[0]===f[0]&&s[1]===f[1])); return f
  }
  const draw=useCallback(()=>{
    const c=canvasRef.current; if(!c)return; const ctx=c.getContext('2d')!
    const s=stateRef.current; const sz=20
    ctx.fillStyle='#1a1b26'; ctx.fillRect(0,0,400,400)
    s.snake.forEach(([x,y],i)=>{ ctx.fillStyle=i===0?'#34d399':'#10b981'; ctx.fillRect(x*sz+1,y*sz+1,sz-2,sz-2); ctx.beginPath(); ctx.arc(x*sz+sz/2,y*sz+sz/2,sz/2-2,0,Math.PI*2); ctx.fill() })
    ctx.fillStyle='#f87171'; ctx.beginPath(); ctx.arc(s.food[0]*sz+sz/2,s.food[1]*sz+sz/2,sz/2-1,0,Math.PI*2); ctx.fill()
  },[])

  const step=useCallback((ts:number)=>{
    const s=stateRef.current; if(s.over||!s.started)return
    if(ts-lastRef.current<130){ animRef.current=requestAnimationFrame(step); return }
    lastRef.current=ts
    const head=[s.snake[0][0]+s.dir[0],s.snake[0][1]+s.dir[1]] as [number,number]
    if(head[0]<0||head[0]>=20||head[1]<0||head[1]>=20||s.snake.some(([x,y])=>x===head[0]&&y===head[1])){
      s.over=true; setOver(true); onEnd('loss',s.score); draw(); return
    }
    const ate=head[0]===s.food[0]&&head[1]===s.food[1]
    s.snake=[head,...s.snake]; if(!ate) s.snake.pop(); else{ s.score+=10; s.food=randFood(s.snake); setScore(s.score) }
    draw(); animRef.current=requestAnimationFrame(step)
  },[draw,onEnd])

  useEffect(()=>{
    draw()
    const h=(e:KeyboardEvent)=>{
      const s=stateRef.current; if(s.over) return
      const m:Record<string,[number,number]>={'ArrowLeft':[-1,0],'ArrowRight':[1,0],'ArrowUp':[0,-1],'ArrowDown':[0,1],'a':[-1,0],'d':[1,0],'w':[0,-1],'s':[0,1]}
      const nd=m[e.key]; if(!nd||(-nd[0]===s.dir[0]&&-nd[1]===s.dir[1]))return
      e.preventDefault()
      if(!s.started){ s.started=true; setStarted(true); animRef.current=requestAnimationFrame(step) }
      s.dir=nd
    }
    window.addEventListener('keydown',h); return()=>{ window.removeEventListener('keydown',h); if(animRef.current) cancelAnimationFrame(animRef.current) }
  },[draw,step])

  function restart(){ stateRef.current={snake:[[10,10]],dir:[1,0],food:randFood([[10,10]]),score:0,over:false,started:false}; setScore(0);setOver(false);setStarted(false);draw() }

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:12}}>
      <div style={{display:'flex',gap:14,alignItems:'center'}}>
        <div style={{padding:'6px 14px',borderRadius:8,background:'rgba(52,211,153,0.1)',border:'1px solid rgba(52,211,153,0.25)'}}>
          <span style={{fontSize:'0.6rem',color:'var(--text-muted)'}}>SCORE </span><span style={{fontWeight:800,color:'#34d399'}}>{score}</span>
        </div>
        <div style={{padding:'6px 14px',borderRadius:8,background:'rgba(255,255,255,0.03)',border:'1px solid var(--border)'}}>
          <span style={{fontSize:'0.6rem',color:'var(--text-muted)'}}>RECORDE </span><span style={{fontWeight:800,color:'var(--text-secondary)'}}>{Math.max(score,bestScore)}</span>
        </div>
      </div>
      <div style={{position:'relative',borderRadius:12,overflow:'hidden',border:'2px solid rgba(52,211,153,0.3)'}}>
        <canvas ref={canvasRef} width={400} height={400}/>
        {!started&&!over&&<div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.5)',backdropFilter:'blur(4px)',flexDirection:'column',gap:8}}>
          <div style={{fontSize:'2rem'}}>🐍</div>
          <div style={{color:'#fff',fontWeight:700}}>Pressione qualquer seta para começar</div>
        </div>}
        {over&&<div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.7)',backdropFilter:'blur(4px)',flexDirection:'column',gap:10}}>
          <div style={{fontSize:'1.3rem',color:'#f87171',fontWeight:800}}>💀 Game Over!</div>
          <div style={{color:'#fff'}}>Score: {score}</div>
          <button onClick={restart} style={{padding:'8px 20px',borderRadius:10,border:'none',background:'linear-gradient(135deg,#34d399,#10b981)',color:'#fff',fontWeight:800,cursor:'pointer'}}>Jogar Novamente</button>
        </div>}
      </div>
      <div style={{fontSize:'0.65rem',color:'var(--text-muted)'}}>WASD ou setas para mover</div>
    </div>
  )
}

// ── 3. Memory Game ────────────────────────────────────────────────────────────
function GameMemory({ onEnd }: GameProps) {
  const EMOJIS = ['🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯','🦁','🐮','🐷','🐸','🐵','🦄']
  function shuffle<T>(a:T[]): T[] { return [...a].sort(()=>Math.random()-0.5) }
  function init(){ return shuffle([...EMOJIS.slice(0,8),...EMOJIS.slice(0,8)]).map((e,i)=>({id:i,val:e,flipped:false,matched:false})) }
  const [cards,setCards]=useState(init)
  const [sel,setSel]=useState<number[]>([])
  const [moves,setMoves]=useState(0); const [matches,setMatches]=useState(0); const [locked,setLocked]=useState(false)

  const flip=(id:number)=>{
    if(locked||cards[id].flipped||cards[id].matched||sel.includes(id)) return
    const nc=[...cards]; nc[id]={...nc[id],flipped:true}
    const ns=[...sel,id]
    if(ns.length===2){
      setMoves(m=>m+1); setLocked(true)
      if(nc[ns[0]].val===nc[ns[1]].val){
        nc[ns[0]]={...nc[ns[0]],matched:true}; nc[ns[1]]={...nc[ns[1]],matched:true}
        const nm=matches+1; setMatches(nm)
        if(nm===8){ setCards(nc); setSel([]); setLocked(false); onEnd('win',Math.max(0,500-moves*10)); return }
        setCards(nc); setSel([]); setLocked(false)
      } else {
        setCards(nc); setSel(ns)
        setTimeout(()=>{ setCards(prev=>prev.map((c,i)=>ns.includes(i)&&!c.matched?{...c,flipped:false}:c)); setSel([]); setLocked(false) },900)
      }
    } else { setCards(nc); setSel(ns) }
  }

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:14,padding:10}}>
      <div style={{display:'flex',gap:14}}>
        <span style={{padding:'5px 12px',borderRadius:8,background:'rgba(167,139,250,0.1)',border:'1px solid rgba(167,139,250,0.25)',fontSize:'0.78rem',color:'#a78bfa'}}>Pares: {matches}/8</span>
        <span style={{padding:'5px 12px',borderRadius:8,background:'rgba(255,255,255,0.03)',border:'1px solid var(--border)',fontSize:'0.78rem',color:'var(--text-muted)'}}>Jogadas: {moves}</span>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:8}}>
        {cards.map(c=>(
          <button key={c.id} onClick={()=>flip(c.id)}
            style={{width:70,height:70,borderRadius:12,border:`2px solid ${c.matched?'rgba(52,211,153,0.5)':c.flipped?'rgba(167,139,250,0.5)':'var(--border-md)'}`,background:c.matched?'rgba(52,211,153,0.1)':c.flipped?'rgba(167,139,250,0.1)':'var(--card-bg)',fontSize:'1.8rem',cursor:c.matched||c.flipped?'default':'pointer',transition:'all 0.2s',transform:c.flipped||c.matched?'rotateY(0)':'rotateY(180deg)'}}>
            {c.flipped||c.matched?c.val:''}
          </button>
        ))}
      </div>
      <button onClick={()=>{setCards(init());setSel([]);setMoves(0);setMatches(0);setLocked(false)}}
        style={{padding:'7px 18px',borderRadius:9,border:'none',background:'rgba(167,139,250,0.15)',color:'#a78bfa',fontWeight:700,cursor:'pointer',fontSize:'0.78rem'}}>
        Reiniciar
      </button>
    </div>
  )
}

// ── 4. Tic Tac Toe ────────────────────────────────────────────────────────────
function GameTicTacToe({ onEnd }: GameProps) {
  const [board,setBoard]=useState<(string|null)[]>(Array(9).fill(null))
  const [xIsNext,setXIsNext]=useState(true); const [done,setDone]=useState(false)
  function winner(b:(string|null)[]){
    const lines=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]]
    for(const [a,b2,c] of lines) if(b[a]&&b[a]===b[b2]&&b[a]===b[c]) return b[a]
    return null
  }
  const click=(i:number)=>{
    if(done||board[i]) return
    const nb=[...board]; nb[i]=xIsNext?'X':'O'
    const w=winner(nb)
    if(w){ setBoard(nb);setDone(true);onEnd(w==='X'?'win':'loss',w==='X'?100:0); return }
    if(nb.every(v=>v)){ setBoard(nb);setDone(true);onEnd('draw',50); return }
    setBoard(nb); setXIsNext(!xIsNext)
    // simple AI
    if(!w){
      setTimeout(()=>{
        const empty=nb.map((v,i)=>v?-1:i).filter(i=>i>=0)
        if(!empty.length) return
        const ai=empty[Math.floor(Math.random()*empty.length)]
        const nb2=[...nb]; nb2[ai]='O'
        const w2=winner(nb2)
        if(w2){ setBoard(nb2);setDone(true);onEnd('loss',0);return }
        if(nb2.every(v=>v)){ setBoard(nb2);setDone(true);onEnd('draw',50);return }
        setBoard(nb2); setXIsNext(true)
      },400)
    }
  }
  const reset=()=>{setBoard(Array(9).fill(null));setXIsNext(true);setDone(false)}
  const w=winner(board); const isDraw=!w&&board.every(v=>v)

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:16,padding:20}}>
      <div style={{fontSize:'0.85rem',color:'var(--text-secondary)',fontWeight:600}}>
        {w?`Vencedor: ${w}`:(isDraw?'Empate!':`Vez de: ${xIsNext?'X (Você)':'O (IA)'}`)}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8}}>
        {board.map((v,i)=>(
          <button key={i} onClick={()=>click(i)}
            style={{width:90,height:90,borderRadius:14,border:`2px solid ${v==='X'?'rgba(96,165,250,0.5)':v==='O'?'rgba(248,113,113,0.5)':'var(--border-md)'}`,background:v?'var(--bg-hover)':'var(--card-bg)',fontSize:'2rem',fontWeight:900,color:v==='X'?'#60a5fa':'#f87171',cursor:done||v?'default':'pointer',transition:'all 0.15s'}}>
            {v}
          </button>
        ))}
      </div>
      <button onClick={reset} style={{padding:'8px 20px',borderRadius:10,border:'none',background:'rgba(96,165,250,0.12)',color:'#60a5fa',fontWeight:800,cursor:'pointer'}}>Nova Partida</button>
    </div>
  )
}

// ── 5. Breakout ───────────────────────────────────────────────────────────────
function GameBreakout({ onEnd, bestScore }: GameProps) {
  const canvasRef=useRef<HTMLCanvasElement>(null)
  const st=useRef({ball:{x:200,y:300,dx:3,dy:-3},paddle:{x:150,w:100},bricks:[] as {x:number,y:number,alive:boolean}[],score:0,over:false,won:false,started:false,lives:3})
  const animRef=useRef<number>(); const [ui,setUi]=useState({score:0,over:false,won:false,started:false,lives:3})

  function initBricks(){ return Array.from({length:5},(_,r)=>Array.from({length:8},(_,c)=>({x:c*50+5,y:r*22+40,alive:true}))).flat() }
  useEffect(()=>{ st.current.bricks=initBricks() },[])

  const loop=useCallback(()=>{
    const c=canvasRef.current; if(!c) return; const ctx=c.getContext('2d')!
    const s=st.current; if(s.over||s.won) return
    ctx.fillStyle='#0f0f1a'; ctx.fillRect(0,0,400,500)
    // paddle
    ctx.fillStyle='#60a5fa'; ctx.beginPath(); ctx.roundRect(s.paddle.x,470,s.paddle.w,12,6); ctx.fill()
    // ball
    ctx.fillStyle='#f472b6'; ctx.beginPath(); ctx.arc(s.ball.x,s.ball.y,8,0,Math.PI*2); ctx.fill()
    // bricks
    const cols=['#f87171','#fb923c','#fbbf24','#34d399','#60a5fa']
    s.bricks.forEach((b,i)=>{ if(!b.alive) return; ctx.fillStyle=cols[Math.floor(i/8)%5]; ctx.beginPath(); ctx.roundRect(b.x,b.y,45,18,4); ctx.fill() })
    // lives
    ctx.fillStyle='#fff'; ctx.font='12px monospace'; ctx.fillText(`❤ ${s.lives}  Score: ${s.score}`,8,20)
    // move ball
    s.ball.x+=s.ball.dx; s.ball.y+=s.ball.dy
    if(s.ball.x<8||s.ball.x>392) s.ball.dx*=-1
    if(s.ball.y<8) s.ball.dy*=-1
    if(s.ball.y>480){ s.lives--; if(s.lives<=0){ s.over=true; setUi({...ui,over:true,score:s.score,started:true,won:false,lives:0}); onEnd('loss',s.score); return } s.ball={x:200,y:300,dx:3,dy:-3} }
    if(s.ball.y>462&&s.ball.y<482&&s.ball.x>s.paddle.x&&s.ball.x<s.paddle.x+s.paddle.w){ s.ball.dy=-Math.abs(s.ball.dy); s.ball.dx+=(s.ball.x-s.paddle.x-s.paddle.w/2)*0.05 }
    s.bricks.forEach(b=>{ if(!b.alive) return; if(s.ball.x>b.x&&s.ball.x<b.x+45&&s.ball.y>b.y&&s.ball.y<b.y+18){ b.alive=false; s.ball.dy*=-1; s.score+=10; setUi(u=>({...u,score:s.score})) } })
    if(s.bricks.every(b=>!b.alive)){ s.won=true; setUi({...ui,won:true,score:s.score,started:true,over:false,lives:s.lives}); onEnd('win',s.score); return }
    animRef.current=requestAnimationFrame(loop)
  },[onEnd,ui])

  const start=useCallback(()=>{ if(st.current.started) return; st.current.started=true; setUi(u=>({...u,started:true})); animRef.current=requestAnimationFrame(loop) },[loop])

  useEffect(()=>{
    const h=(e:KeyboardEvent)=>{ const s=st.current; if(e.key==='ArrowLeft') s.paddle.x=Math.max(0,s.paddle.x-18); if(e.key==='ArrowRight') s.paddle.x=Math.min(300,s.paddle.x+18); if(!s.started) start(); e.preventDefault() }
    const m=(e:MouseEvent)=>{ const c=canvasRef.current; if(!c) return; const rect=c.getBoundingClientRect(); st.current.paddle.x=Math.min(300,Math.max(0,e.clientX-rect.left-50)); if(!st.current.started) start() }
    window.addEventListener('keydown',h); canvasRef.current?.addEventListener('mousemove',m)
    return()=>{ window.removeEventListener('keydown',h); canvasRef.current?.removeEventListener('mousemove',m); if(animRef.current) cancelAnimationFrame(animRef.current) }
  },[start])

  function restart(){ st.current={ball:{x:200,y:300,dx:3,dy:-3},paddle:{x:150,w:100},bricks:initBricks(),score:0,over:false,won:false,started:false,lives:3}; setUi({score:0,over:false,won:false,started:false,lives:3}) }

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:10}}>
      <div style={{display:'flex',gap:12}}>
        <span style={{padding:'5px 12px',borderRadius:8,background:'rgba(244,114,182,0.1)',border:'1px solid rgba(244,114,182,0.25)',fontSize:'0.78rem',color:'#f472b6'}}>Score: {ui.score}</span>
        <span style={{padding:'5px 12px',borderRadius:8,background:'rgba(255,255,255,0.03)',border:'1px solid var(--border)',fontSize:'0.78rem',color:'var(--text-muted)'}}>Recorde: {Math.max(ui.score,bestScore)}</span>
      </div>
      <div style={{position:'relative',borderRadius:12,overflow:'hidden',border:'2px solid rgba(244,114,182,0.3)'}}>
        <canvas ref={canvasRef} width={400} height={500}/>
        {!ui.started&&<div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.6)',flexDirection:'column',gap:8}}>
          <div style={{fontSize:'2rem'}}>🧱</div><div style={{color:'#fff',fontWeight:700}}>Mova o mouse ou setas para começar</div>
        </div>}
        {(ui.over||ui.won)&&<div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.7)',backdropFilter:'blur(4px)',flexDirection:'column',gap:10}}>
          <div style={{fontSize:'1.3rem',color:ui.won?'#34d399':'#f87171',fontWeight:800}}>{ui.won?'🎉 Você ganhou!':'💀 Game Over!'}</div>
          <button onClick={restart} style={{padding:'8px 20px',borderRadius:10,border:'none',background:'linear-gradient(135deg,#f472b6,#a855f7)',color:'#fff',fontWeight:800,cursor:'pointer'}}>Jogar Novamente</button>
        </div>}
      </div>
    </div>
  )
}

// ── 6. Minesweeper ────────────────────────────────────────────────────────────
function GameMinesweeper({ onEnd }: GameProps) {
  const R=9,C=9,MINES=10
  type Cell={mine:boolean;rev:boolean;flag:boolean;adj:number}
  function init():Cell[][]{return Array.from({length:R},()=>Array.from({length:C},()=>({mine:false,rev:false,flag:false,adj:0})))}
  function plant(grid:Cell[][],sr:number,sc:number){
    let placed=0; while(placed<MINES){const r=Math.floor(Math.random()*R),c=Math.floor(Math.random()*C); if(!grid[r][c].mine&&!(r===sr&&c===sc)){grid[r][c].mine=true;placed++}}
    for(let r=0;r<R;r++) for(let c=0;c<C;c++) if(!grid[r][c].mine){let a=0;for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++){const nr=r+dr,nc=c+dc; if(nr>=0&&nr<R&&nc>=0&&nc<C&&grid[nr][nc].mine) a++} grid[r][c].adj=a}
  }
  const [grid,setGrid]=useState<Cell[][]>(init); const [planted,setPlanted]=useState(false); const [over,setOver]=useState(false); const [won,setWon]=useState(false); const [flags,setFlags]=useState(0)

  function reveal(grid:Cell[][],r:number,c:number){
    if(r<0||r>=R||c<0||c>=C||grid[r][c].rev||grid[r][c].flag) return
    grid[r][c].rev=true
    if(grid[r][c].adj===0&&!grid[r][c].mine) for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++) reveal(grid,r+dr,c+dc)
  }
  const click=(r:number,c:number)=>{
    if(over||won||grid[r][c].flag||grid[r][c].rev) return
    const ng=grid.map(row=>row.map(cell=>({...cell})))
    if(!planted){ plant(ng,r,c); setPlanted(true) }
    if(ng[r][c].mine){ ng[r][c].rev=true; setGrid(ng); setOver(true); onEnd('loss',0); return }
    reveal(ng,r,c)
    const safe=R*C-MINES; const revealed=ng.flat().filter(c=>c.rev&&!c.mine).length
    if(revealed===safe){ setGrid(ng); setWon(true); onEnd('win',500); return }
    setGrid(ng)
  }
  const rclick=(e:React.MouseEvent,r:number,c:number)=>{ e.preventDefault(); if(over||won||grid[r][c].rev) return; const ng=grid.map(row=>row.map(c=>({...c}))); ng[r][c].flag=!ng[r][c].flag; setFlags(ng.flat().filter(c=>c.flag).length); setGrid(ng) }
  const reset=()=>{setGrid(init());setPlanted(false);setOver(false);setWon(false);setFlags(0)}

  const colors=['','#3b82f6','#22c55e','#ef4444','#7c3aed','#dc2626','#0891b2','#000','#6b7280']

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:12,padding:10}}>
      <div style={{display:'flex',gap:12,alignItems:'center'}}>
        <span style={{padding:'5px 12px',borderRadius:8,background:'rgba(248,113,113,0.1)',border:'1px solid rgba(248,113,113,0.25)',fontSize:'0.78rem',color:'#f87171'}}>💣 {MINES-flags}</span>
        <span style={{padding:'5px 12px',borderRadius:8,background:won?'rgba(52,211,153,0.1)':over?'rgba(248,113,113,0.1)':'rgba(255,255,255,0.03)',border:'1px solid var(--border)',fontSize:'0.78rem',color:won?'#34d399':over?'#f87171':'var(--text-muted)'}}>{won?'😎 Vitória!':over?'💥 Boom!':'😐 Jogando'}</span>
        <button onClick={reset} style={{padding:'5px 10px',borderRadius:8,border:'none',background:'rgba(255,255,255,0.06)',color:'var(--text-muted)',cursor:'pointer',fontSize:'0.75rem'}}>Reset</button>
      </div>
      <div style={{display:'grid',gridTemplateColumns:`repeat(${C},1fr)`,gap:2}}>
        {grid.map((row,r)=>row.map((cell,c)=>(
          <button key={`${r}-${c}`} onClick={()=>click(r,c)} onContextMenu={e=>rclick(e,r,c)}
            style={{width:36,height:36,borderRadius:6,border:`1px solid ${cell.rev?(cell.mine?'rgba(248,113,113,0.4)':'var(--border)'):cell.flag?'rgba(251,191,36,0.4)':'var(--border-md)'}`,background:cell.rev?(cell.mine?'rgba(248,113,113,0.2)':'var(--bg-hover)'):'var(--card-bg)',fontSize:cell.rev&&!cell.mine&&cell.adj?'0.78rem':cell.flag?'0.9rem':'0.9rem',fontWeight:700,color:cell.rev&&cell.adj?colors[cell.adj]:'inherit',cursor:cell.rev?'default':'pointer'}}>
            {cell.flag&&!cell.rev?'🚩':cell.rev?(cell.mine?'💣':cell.adj||''):''}
          </button>
        )))}
      </div>
      <div style={{fontSize:'0.62rem',color:'var(--text-muted)'}}>Clique direito para bandeira</div>
    </div>
  )
}

// ── 7. Simon Says ─────────────────────────────────────────────────────────────
function GameSimon({ onEnd, bestScore }: GameProps) {
  const COLS=['#f87171','#34d399','#60a5fa','#fbbf24']
  const [seq,setSeq]=useState<number[]>([]); const [input,setInput]=useState<number[]>([]); const [showing,setShowing]=useState(false); const [active,setActive]=useState<number|null>(null); const [score,setScore]=useState(0); const [over,setOver]=useState(false)

  const showSeq=useCallback(async(s:number[])=>{
    setShowing(true); setInput([])
    for(const c of s){ await new Promise(r=>setTimeout(r,300)); setActive(c); await new Promise(r=>setTimeout(r,500)); setActive(null); await new Promise(r=>setTimeout(r,200)) }
    setShowing(false)
  },[])

  const startRound=useCallback(async(prev:number[])=>{ const ns=[...prev,Math.floor(Math.random()*4)]; setSeq(ns); setScore(ns.length-1); await showSeq(ns) },[showSeq])

  const press=(c:number)=>{
    if(showing||over) return
    const ni=[...input,c]
    if(ni[ni.length-1]!==seq[ni.length-1]){ setOver(true); onEnd(score>0?'play':'loss',score*10); return }
    if(ni.length===seq.length){ setInput([]); setTimeout(()=>startRound(seq),600) } else setInput(ni)
  }

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:18,padding:20}}>
      <div style={{display:'flex',gap:12}}>
        <span style={{padding:'5px 12px',borderRadius:8,background:'rgba(167,139,250,0.1)',border:'1px solid rgba(167,139,250,0.25)',fontSize:'0.78rem',color:'#a78bfa'}}>Nível: {score}</span>
        <span style={{padding:'5px 12px',borderRadius:8,background:'rgba(255,255,255,0.03)',border:'1px solid var(--border)',fontSize:'0.78rem',color:'var(--text-muted)'}}>Recorde: {Math.max(score,bestScore)}</span>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}}>
        {COLS.map((col,i)=>(
          <button key={i} onClick={()=>press(i)}
            style={{width:120,height:120,borderRadius:20,border:`3px solid ${col}`,background:active===i?col:`${col}22`,cursor:showing||over?'not-allowed':'pointer',transition:'all 0.1s',transform:active===i?'scale(1.05)':'scale(1)',boxShadow:active===i?`0 0 30px ${col}80`:'none'}}/>
        ))}
      </div>
      {over&&<div style={{textAlign:'center'}}>
        <div style={{color:'#f87171',fontWeight:800}}>Sequência errada! Nível {score}</div>
        <button onClick={()=>{setSeq([]);setInput([]);setScore(0);setOver(false);setShowing(false);startRound([])}} style={{marginTop:8,padding:'8px 20px',borderRadius:10,border:'none',background:'linear-gradient(135deg,#a78bfa,#7c3aed)',color:'#fff',fontWeight:800,cursor:'pointer'}}>Jogar Novamente</button>
      </div>}
      {seq.length===0&&!over&&<button onClick={()=>startRound([])} style={{padding:'10px 28px',borderRadius:12,border:'none',background:'linear-gradient(135deg,#a78bfa,#7c3aed)',color:'#fff',fontWeight:800,cursor:'pointer',fontSize:'0.9rem'}}>▶ Iniciar</button>}
      {showing&&<div style={{color:'var(--text-muted)',fontSize:'0.75rem'}}>Observe a sequência...</div>}
      {!showing&&!over&&seq.length>0&&<div style={{color:'var(--text-muted)',fontSize:'0.75rem'}}>Sua vez! ({input.length}/{seq.length})</div>}
    </div>
  )
}

// ── 8. Word Guess (Forca) ─────────────────────────────────────────────────────
function GameForca({ onEnd }: GameProps) {
  const WORDS=['CONSTITUIÇÃO','ADVOCACIA','JUDICIÁRIO','PROCESSO','RECURSO','SENTENÇA','ACÓRDÃO','MANDATO','PARECER','HABEAS','LIMINAR','TUTELA','AGRAVO','EMBARGOS','PRECATÓRIO','DECRETO','PORTARIA','REGULAMENTO','IMPROBIDADE','LICITAÇÃO','CONCURSO','SERVIDOR','MINISTÉRIO','TRIBUNAL','SUPREMO']
  const [word]=useState(()=>WORDS[Math.floor(Math.random()*WORDS.length)])
  const [guessed,setGuessed]=useState<string[]>([]); const [errors,setErrors]=useState(0); const [done,setDone]=useState(false)
  const MAX=6
  const won=word.split('').every(l=>guessed.includes(l))
  const over=errors>=MAX

  const guess=(l:string)=>{
    if(done||guessed.includes(l)) return
    const ng=[...guessed,l]; setGuessed(ng)
    if(!word.includes(l)) { const ne=errors+1; setErrors(ne); if(ne>=MAX){ setDone(true); onEnd('loss',0) } }
    else if(word.split('').every(c=>ng.includes(c))){ setDone(true); onEnd('win',200) }
  }

  const hangParts=[
    ()=><circle cx="200" cy="60" r="20" fill="none" stroke="#f87171" strokeWidth="3"/>,
    ()=><line x1="200" y1="80" x2="200" y2="160" stroke="#f87171" strokeWidth="3"/>,
    ()=><line x1="200" y1="100" x2="160" y2="140" stroke="#f87171" strokeWidth="3"/>,
    ()=><line x1="200" y1="100" x2="240" y2="140" stroke="#f87171" strokeWidth="3"/>,
    ()=><line x1="200" y1="160" x2="160" y2="200" stroke="#f87171" strokeWidth="3"/>,
    ()=><line x1="200" y1="160" x2="240" y2="200" stroke="#f87171" strokeWidth="3"/>,
  ]
  const letters='ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:14,padding:10}}>
      <svg width="400" height="220" style={{borderRadius:12,background:'var(--card-bg)',border:'1px solid var(--border)'}}>
        <line x1="50" y1="210" x2="350" y2="210" stroke="var(--text-muted)" strokeWidth="3"/>
        <line x1="150" y1="210" x2="150" y2="20" stroke="var(--text-muted)" strokeWidth="3"/>
        <line x1="150" y1="20" x2="200" y2="20" stroke="var(--text-muted)" strokeWidth="3"/>
        <line x1="200" y1="20" x2="200" y2="40" stroke="var(--text-muted)" strokeWidth="3"/>
        {hangParts.slice(0,errors).map((P,i)=><P key={i}/>)}
      </svg>
      <div style={{display:'flex',gap:6,flexWrap:'wrap',justifyContent:'center'}}>
        {word.split('').map((l,i)=>(
          <div key={i} style={{width:32,height:36,borderBottom:`3px solid ${guessed.includes(l)||over?'var(--text-primary)':'#60a5fa'}`,display:'flex',alignItems:'flex-end',justifyContent:'center',paddingBottom:2}}>
            <span style={{fontFamily:'monospace',fontWeight:800,fontSize:'1.1rem',color:over&&!guessed.includes(l)?'#f87171':'var(--text-primary)'}}>{guessed.includes(l)||over?l:''}</span>
          </div>
        ))}
      </div>
      <div style={{fontSize:'0.7rem',color:'#f87171'}}>{errors}/{MAX} erros</div>
      <div style={{display:'flex',flexWrap:'wrap',gap:4,justifyContent:'center',maxWidth:340}}>
        {letters.map(l=>(
          <button key={l} onClick={()=>guess(l)} disabled={done||guessed.includes(l)}
            style={{width:30,height:30,borderRadius:6,border:`1px solid ${guessed.includes(l)?(word.includes(l)?'rgba(52,211,153,0.5)':'rgba(248,113,113,0.4)'):'var(--border-md)'}`,background:guessed.includes(l)?(word.includes(l)?'rgba(52,211,153,0.12)':'rgba(248,113,113,0.08)'):'var(--card-bg)',color:guessed.includes(l)?(word.includes(l)?'#34d399':'#f87171'):'var(--text-primary)',fontSize:'0.72rem',fontWeight:700,cursor:done||guessed.includes(l)?'not-allowed':'pointer'}}>
            {l}
          </button>
        ))}
      </div>
      {(won||over)&&<div style={{textAlign:'center'}}>
        <div style={{color:won?'#34d399':'#f87171',fontWeight:800}}>{won?'🎉 Acertou!':'💀 Era: '+word}</div>
      </div>}
    </div>
  )
}

// ── 9. Reaction Test ─────────────────────────────────────────────────────────
function GameReaction({ onEnd, bestScore }: GameProps) {
  const [phase,setPhase]=useState<'wait'|'ready'|'go'|'result'>('wait')
  const [time,setTime]=useState<number|null>(null); const [best,setBest]=useState(bestScore||9999)
  const t=useRef<ReturnType<typeof setTimeout>>()

  const start=()=>{
    if(phase==='go'){ const ms=Date.now()-goTime.current; setTime(ms); const nb=Math.min(ms,best); setBest(nb); setPhase('result'); onEnd(ms<300?'win':ms<500?'play':'loss',Math.max(0,1000-ms)); return }
    if(phase==='wait'||phase==='result'){ setPhase('ready'); t.current=setTimeout(()=>{ setPhase('go'); goTime.current=Date.now() },1500+Math.random()*3000) }
    if(phase==='ready'){ clearTimeout(t.current); setPhase('result'); setTime(-1) }
  }
  const goTime=useRef(0)

  const bg=phase==='go'?'#34d399':phase==='ready'?'#f87171':phase==='result'?'#1a1b26':'#1a1b26'
  const msg=phase==='wait'?'Clique para começar':phase==='ready'?'Aguarde...':phase==='go'?'CLIQUE AGORA!':time===-1?'Muito cedo! Tente de novo':time!==null?`${time}ms!`:''

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:16,padding:20}}>
      <div style={{display:'flex',gap:12}}>
        {time!==null&&time>0&&<span style={{padding:'5px 14px',borderRadius:8,background:`rgba(${time<300?'52,211,153':time<500?'251,191,36':'248,113,113'},0.12)`,border:`1px solid rgba(${time<300?'52,211,153':time<500?'251,191,36':'248,113,113'},0.3)`,fontSize:'0.82rem',fontWeight:800,color:time<300?'#34d399':time<500?'#fbbf24':'#f87171'}}>{time}ms</span>}
        <span style={{padding:'5px 14px',borderRadius:8,background:'rgba(255,255,255,0.03)',border:'1px solid var(--border)',fontSize:'0.78rem',color:'var(--text-muted)'}}>Melhor: {best<9999?best+'ms':'—'}</span>
      </div>
      <div onClick={start} style={{width:320,height:280,borderRadius:24,background:bg,display:'flex',alignItems:'center',justifyContent:'center',cursor:'pointer',transition:'background 0.3s',border:`2px solid ${phase==='go'?'rgba(52,211,153,0.5)':phase==='ready'?'rgba(248,113,113,0.5)':'var(--border)'}`,boxShadow:phase==='go'?'0 0 40px rgba(52,211,153,0.3)':phase==='ready'?'0 0 40px rgba(248,113,113,0.3)':'none'}}>
        <span style={{color:'#fff',fontWeight:900,fontSize:'1.3rem',textAlign:'center',padding:20}}>{msg}</span>
      </div>
      {phase==='result'&&<button onClick={()=>setPhase('wait')} style={{padding:'8px 24px',borderRadius:10,border:'none',background:'linear-gradient(135deg,#1A73E8,#60a5fa)',color:'#fff',fontWeight:800,cursor:'pointer'}}>Tentar Novamente</button>}
    </div>
  )
}

// ── 10. Math Quiz ─────────────────────────────────────────────────────────────
function GameMathQuiz({ onEnd, bestScore }: GameProps) {
  function newQ(){ const ops=['+','-','×','÷']; const op=ops[Math.floor(Math.random()*4)]; let a=Math.floor(Math.random()*20)+1,b=Math.floor(Math.random()*12)+1,ans:number; if(op==='÷'){b=Math.floor(Math.random()*10)+1;a=b*(Math.floor(Math.random()*9)+1);ans=a/b}else if(op==='×'){a=Math.floor(Math.random()*12)+1;b=Math.floor(Math.random()*12)+1;ans=a*b}else if(op==='+'){ans=a+b}else{if(a<b)[a,b]=[b,a];ans=a-b}; return{a,b,op,ans} }
  const [q,setQ]=useState(newQ); const [input,setInput]=useState(''); const [score,setScore]=useState(0); const [round,setRound]=useState(1); const [feedback,setFeedback]=useState<'correct'|'wrong'|null>(null); const [done,setDone]=useState(false); const TOTAL=10

  const submit=()=>{
    if(!input.trim()||done) return
    const correct=parseInt(input)===q.ans
    const ns=score+(correct?10:0)
    setFeedback(correct?'correct':'wrong')
    setTimeout(()=>{
      setFeedback(null); setInput('')
      if(round>=TOTAL){ setDone(true); onEnd(ns>=70?'win':'loss',ns); return }
      setQ(newQ()); setRound(r=>r+1); setScore(ns)
    },600)
  }

  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:16,padding:20}}>
      <div style={{display:'flex',gap:12}}>
        <span style={{padding:'5px 12px',borderRadius:8,background:'rgba(251,191,36,0.1)',border:'1px solid rgba(251,191,36,0.25)',fontSize:'0.78rem',color:'#fbbf24'}}>Score: {score}</span>
        <span style={{padding:'5px 12px',borderRadius:8,background:'rgba(255,255,255,0.03)',border:'1px solid var(--border)',fontSize:'0.78rem',color:'var(--text-muted)'}}>Rodada: {round}/{TOTAL}</span>
        <span style={{padding:'5px 12px',borderRadius:8,background:'rgba(255,255,255,0.03)',border:'1px solid var(--border)',fontSize:'0.78rem',color:'var(--text-muted)'}}>Recorde: {Math.max(score,bestScore)}</span>
      </div>
      <div style={{width:280,padding:'32px 28px',borderRadius:20,border:`2px solid ${feedback==='correct'?'rgba(52,211,153,0.5)':feedback==='wrong'?'rgba(248,113,113,0.5)':'rgba(251,191,36,0.25)'}`,background:feedback==='correct'?'rgba(52,211,153,0.07)':feedback==='wrong'?'rgba(248,113,113,0.07)':'rgba(251,191,36,0.05)',textAlign:'center',transition:'all 0.2s'}}>
        <div style={{fontFamily:'monospace',fontWeight:900,fontSize:'2rem',color:'var(--text-primary)',marginBottom:16}}>{q.a} {q.op} {q.b} = ?</div>
        <input type="number" value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()}
          autoFocus style={{width:'100%',padding:'10px',borderRadius:10,border:'2px solid var(--border-md)',background:'var(--card-bg)',color:'var(--text-primary)',fontSize:'1.2rem',fontWeight:800,textAlign:'center',outline:'none',boxSizing:'border-box'}}/>
      </div>
      <button onClick={submit} disabled={!input.trim()||done} style={{padding:'10px 32px',borderRadius:12,border:'none',background:input.trim()&&!done?'linear-gradient(135deg,#fbbf24,#f59e0b)':'rgba(255,255,255,0.06)',color:input.trim()&&!done?'#fff':'var(--text-muted)',fontWeight:800,cursor:input.trim()&&!done?'pointer':'not-allowed',fontSize:'0.9rem'}}>Confirmar</button>
      {done&&<div style={{color:'#34d399',fontWeight:800,fontSize:'1rem'}}>🎉 Resultado: {score}/{TOTAL*10} pontos</div>}
    </div>
  )
}

// ── More games as stubs with playable core ─────────────────────────────────────
function GamePong({ onEnd, bestScore: _bestScore }: GameProps) {
  const canvasRef=useRef<HTMLCanvasElement>(null)
  const st=useRef({ball:{x:200,y:150,dx:3,dy:2},p1:{y:120},p2:{y:120},s1:0,s2:0,over:false,ai:true})
  const animRef=useRef<number>(); const [ui,setUi]=useState({s1:0,s2:0,over:false,winner:''})

  const loop=useCallback(()=>{
    const c=canvasRef.current; if(!c) return; const ctx=c.getContext('2d')!
    const s=st.current; if(s.over) return
    ctx.fillStyle='#0f0f1a'; ctx.fillRect(0,0,400,300)
    ctx.setLineDash([6,6]); ctx.strokeStyle='rgba(255,255,255,0.15)'; ctx.beginPath(); ctx.moveTo(200,0); ctx.lineTo(200,300); ctx.stroke(); ctx.setLineDash([])
    ctx.fillStyle='#60a5fa'; ctx.fillRect(10,s.p1.y,10,60); ctx.fillStyle='#f87171'; ctx.fillRect(380,s.p2.y,10,60)
    ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(s.ball.x,s.ball.y,7,0,Math.PI*2); ctx.fill()
    ctx.fillStyle='rgba(255,255,255,0.8)'; ctx.font='bold 24px monospace'; ctx.textAlign='center'; ctx.fillText(`${s.s1}  ${s.s2}`,200,25); ctx.textAlign='start'
    s.ball.x+=s.ball.dx; s.ball.y+=s.ball.dy
    if(s.ball.y<7||s.ball.y>293) s.ball.dy*=-1
    if(s.ball.x<27&&s.ball.y>s.p1.y&&s.ball.y<s.p1.y+60) s.ball.dx=Math.abs(s.ball.dx)
    if(s.ball.x>373&&s.ball.y>s.p2.y&&s.ball.y<s.p2.y+60) s.ball.dx=-Math.abs(s.ball.dx)
    if(s.ball.x<0){s.s2++;setUi(u=>({...u,s2:s.s2})); if(s.s2>=5){s.over=true;setUi({s1:s.s1,s2:s.s2,over:true,winner:'IA'});onEnd('loss',s.s1*20);return}; s.ball={x:200,y:150,dx:-3,dy:2}}
    if(s.ball.x>400){s.s1++;setUi(u=>({...u,s1:s.s1})); if(s.s1>=5){s.over=true;setUi({s1:s.s1,s2:s.s2,over:true,winner:'Você'});onEnd('win',s.s1*20);return}; s.ball={x:200,y:150,dx:3,dy:2}}
    if(s.ai) s.p2.y+=(s.ball.y-s.p2.y-30)*0.06
    s.p2.y=Math.max(0,Math.min(240,s.p2.y))
    animRef.current=requestAnimationFrame(loop)
  },[onEnd])

  useEffect(()=>{
    animRef.current=requestAnimationFrame(loop)
    const h=(e:KeyboardEvent)=>{const s=st.current; if(e.key==='w'||e.key==='ArrowUp'){e.preventDefault();s.p1.y=Math.max(0,s.p1.y-18)}; if(e.key==='s'||e.key==='ArrowDown'){e.preventDefault();s.p1.y=Math.min(240,s.p1.y+18)}}
    const m=(e:MouseEvent)=>{const c=canvasRef.current;if(!c)return;const r=c.getBoundingClientRect();st.current.p1.y=Math.min(240,Math.max(0,e.clientY-r.top-30))}
    window.addEventListener('keydown',h); canvasRef.current?.addEventListener('mousemove',m)
    return()=>{window.removeEventListener('keydown',h);canvasRef.current?.removeEventListener('mousemove',m);if(animRef.current)cancelAnimationFrame(animRef.current)}
  },[loop])

  function restart(){st.current={ball:{x:200,y:150,dx:3,dy:2},p1:{y:120},p2:{y:120},s1:0,s2:0,over:false,ai:true};setUi({s1:0,s2:0,over:false,winner:''});animRef.current=requestAnimationFrame(loop)}

  return(
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:12}}>
      <div style={{position:'relative',borderRadius:12,overflow:'hidden',border:'2px solid rgba(96,165,250,0.3)'}}>
        <canvas ref={canvasRef} width={400} height={300}/>
        {ui.over&&<div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(0,0,0,0.7)',backdropFilter:'blur(4px)',flexDirection:'column',gap:10}}>
          <div style={{color:ui.winner==='Você'?'#34d399':'#f87171',fontWeight:800,fontSize:'1.2rem'}}>{ui.winner==='Você'?'🎉 Você ganhou!':'💀 IA venceu!'}</div>
          <button onClick={restart} style={{padding:'8px 20px',borderRadius:10,border:'none',background:'linear-gradient(135deg,#60a5fa,#1A73E8)',color:'#fff',fontWeight:800,cursor:'pointer'}}>Jogar Novamente</button>
        </div>}
      </div>
      <div style={{fontSize:'0.65rem',color:'var(--text-muted)'}}>Mova o mouse ou W/S para mover sua raquete (azul)</div>
    </div>
  )
}

// Placeholder for remaining games
function GamePlaceholder({ name, icon, onEnd }: { name:string;icon:string } & GameProps) {
  const [score,setScore]=useState(0); const [playing,setPlaying]=useState(false); const [time,setTime]=useState(0)
  useEffect(()=>{ if(!playing) return; const i=setInterval(()=>setTime(t=>t+1),1000); return()=>clearInterval(i) },[playing])
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:20,padding:40,textAlign:'center'}}>
      <div style={{fontSize:'4rem'}}>{icon}</div>
      <div style={{fontWeight:900,fontSize:'1.2rem',color:'var(--text-primary)'}}>{name}</div>
      <div style={{fontSize:'0.78rem',color:'var(--text-muted)',maxWidth:280}}>Este jogo está em desenvolvimento. Clique em Jogar para simular uma partida e ganhar XP!</div>
      {!playing?<button onClick={()=>setPlaying(true)} style={{padding:'12px 32px',borderRadius:14,border:'none',background:'linear-gradient(135deg,#1A73E8,#60a5fa)',color:'#fff',fontWeight:800,fontSize:'0.9rem',cursor:'pointer'}}>▶ Jogar</button>
      :<div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:12}}>
        <div style={{padding:'16px 24px',borderRadius:14,background:'rgba(96,165,250,0.08)',border:'1px solid rgba(96,165,250,0.2)'}}>
          <div style={{fontSize:'0.6rem',color:'var(--text-muted)'}}>TEMPO JOGANDO</div>
          <div style={{fontFamily:'monospace',fontWeight:800,fontSize:'1.4rem',color:'#60a5fa'}}>{String(Math.floor(time/60)).padStart(2,'0')}:{String(time%60).padStart(2,'0')}</div>
        </div>
        <input type="number" placeholder="Sua pontuação" value={score||''} onChange={e=>setScore(Number(e.target.value))} style={{padding:'8px 16px',borderRadius:10,border:'1px solid var(--border-md)',background:'var(--card-bg)',color:'var(--text-primary)',textAlign:'center',fontSize:'1rem',fontWeight:700,width:140}}/>
        <div style={{display:'flex',gap:10}}>
          <button onClick={()=>onEnd('win',score)} style={{padding:'8px 20px',borderRadius:10,border:'none',background:'rgba(52,211,153,0.15)',color:'#34d399',fontWeight:800,cursor:'pointer'}}>✅ Venci</button>
          <button onClick={()=>onEnd('play',score)} style={{padding:'8px 20px',borderRadius:10,border:'none',background:'rgba(96,165,250,0.12)',color:'#60a5fa',fontWeight:800,cursor:'pointer'}}>⏹ Encerrar</button>
          <button onClick={()=>onEnd('loss',0)} style={{padding:'8px 20px',borderRadius:10,border:'none',background:'rgba(248,113,113,0.1)',color:'#f87171',fontWeight:800,cursor:'pointer'}}>❌ Perdi</button>
        </div>
      </div>}
    </div>
  )
}

// ─── Game Catalog ─────────────────────────────────────────────────────────────
function makeStub(id:string,name:string,cat:string,icon:string,desc:string): GameDef {
  return { id,name,cat,icon,desc,xpWin:50,xpPlay:10,xpRecord:25,
    component:(p:GameProps)=><GamePlaceholder name={name} icon={icon} {...p}/>
  }
}

export const GAMES: GameDef[] = [
  // Fully playable
  { id:'2048',name:'2048',cat:'Puzzle',icon:'🔢',desc:'Some os blocos até chegar em 2048',xpWin:80,xpPlay:15,xpRecord:30,component:(p)=><Game2048 {...p}/> },
  { id:'snake',name:'Snake',cat:'Arcade',icon:'🐍',desc:'Coma a comida sem bater nas paredes',xpWin:60,xpPlay:12,xpRecord:25,component:(p)=><GameSnake {...p}/> },
  { id:'memory',name:'Jogo da Memória',cat:'Memória',icon:'🧠',desc:'Encontre todos os pares de cartas',xpWin:50,xpPlay:10,xpRecord:20,component:(p)=><GameMemory {...p}/> },
  { id:'tictactoe',name:'Tic Tac Toe',cat:'Casual',icon:'⭕',desc:'Jogue Velha contra a IA',xpWin:40,xpPlay:8,xpRecord:15,component:(p)=><GameTicTacToe {...p}/> },
  { id:'breakout',name:'Breakout',cat:'Arcade',icon:'🧱',desc:'Destrua todos os blocos com a bola',xpWin:70,xpPlay:12,xpRecord:28,component:(p)=><GameBreakout {...p}/> },
  { id:'minesweeper',name:'Campo Minado',cat:'Estratégia',icon:'💣',desc:'Encontre todas as minas sem explodir',xpWin:80,xpPlay:15,xpRecord:35,component:(p)=><GameMinesweeper {...p}/> },
  { id:'simon',name:'Simon Says',cat:'Memória',icon:'🔴',desc:'Repita a sequência de cores',xpWin:60,xpPlay:12,xpRecord:25,component:(p)=><GameSimon {...p}/> },
  { id:'forca',name:'Forca',cat:'Palavras',icon:'🔤',desc:'Adivinhe a palavra jurídica',xpWin:50,xpPlay:10,xpRecord:20,component:(p)=><GameForca {...p}/> },
  { id:'reaction',name:'Teste de Reação',cat:'Reflexo',icon:'⚡',desc:'Clique o mais rápido possível',xpWin:40,xpPlay:8,xpRecord:15,component:(p)=><GameReaction {...p}/> },
  { id:'mathquiz',name:'Quiz Matemático',cat:'Matemática',icon:'🧮',desc:'Resolva 10 cálculos rápidos',xpWin:60,xpPlay:12,xpRecord:25,component:(p)=><GameMathQuiz {...p}/> },
  { id:'pong',name:'Pong',cat:'Arcade',icon:'🏓',desc:'Pingue-pongue clássico contra a IA',xpWin:50,xpPlay:10,xpRecord:20,component:(p)=><GamePong {...p}/> },
  // Stubs — development
  ...([
    ['puzzle_slide','Quebra-cabeça Deslizante','Puzzle','🎴','Deslize as peças para completar a imagem'],
    ['sudoku','Sudoku','Puzzle','🔢','Preencha a grade com números 1-9'],
    ['nonogram','Nonogram','Puzzle','📋','Pinte as células baseado nas pistas'],
    ['hanoi','Torres de Hanói','Puzzle','🗼','Mova todos os discos para outro pino'],
    ['pipes','Pipe Puzzle','Puzzle','🔧','Conecte os canos para passar a água'],
    ['tangram','Tangram','Puzzle','⬟','Monte as formas com as peças'],
    ['jigsaw','Jigsaw Puzzle','Puzzle','🧩','Monte o quebra-cabeça de imagens'],
    ['match_pair','Match Pair','Puzzle','🃏','Combine os pares de cartas'],
    ['seq_memory','Memória por Sequência','Memória','🔢','Memorize e repita a sequência de números'],
    ['num_memory','Memória Numérica','Memória','🔟','Memorize a sequência numérica'],
    ['visual_memory','Memória Visual','Memória','👁','Memorize a posição dos objetos'],
    ['color_memory','Memória de Cores','Memória','🎨','Memorize a sequência de cores'],
    ['damas','Damas','Estratégia','♟','Jogue damas contra a IA'],
    ['chess','Xadrez Simplificado','Estratégia','♚','Versão simplificada do xadrez'],
    ['othello','Othello','Estratégia','⚫','Domine o tabuleiro com suas peças'],
    ['connect4','Connect Four','Estratégia','🔴','Conecte quatro peças seguidas'],
    ['gomoku','Gomoku','Estratégia','⬤','Faça 5 em linha no tabuleiro'],
    ['hex','Hex','Estratégia','🔷','Conecte os dois lados do tabuleiro'],
    ['nim','Nim','Estratégia','🪨','Remova pedras estrategicamente'],
    ['mancala','Mancala','Estratégia','🫙','Colete mais pedras que o adversário'],
    ['mastermind','Mastermind','Lógica','🎯','Descubra o código secreto'],
    ['secret_code','Código Secreto','Lógica','🔐','Quebre o código numérico'],
    ['maze','Labirinto','Lógica','🌀','Encontre a saída do labirinto'],
    ['switches','Desafio de Interruptores','Lógica','💡','Ligue todas as lâmpadas'],
    ['num_cubes','Cubos Numéricos','Lógica','🎲','Complete as sequências de cubos'],
    ['logic_seq','Sequências Lógicas','Lógica','🔣','Descubra o padrão da sequência'],
    ['patience','Paciência','Cartas','🃏','Clássico paciência solitário'],
    ['freecell','FreeCell','Cartas','🗂','Organize as cartas nas células livres'],
    ['spider','Spider Solitaire','Cartas','🕷','Solitário Spider com 2 naipes'],
    ['pyramid','Pyramid','Cartas','🔺','Some 13 com pares de cartas'],
    ['tripeaks','TriPeaks','Cartas','⛰','Colete as cartas das três pirâmides'],
    ['asteroids','Asteroids','Arcade','☄','Destrua os asteroides com sua nave'],
    ['space_shooter','Space Shooter','Arcade','🚀','Destrua as naves inimigas'],
    ['flappy','Flappy Bird','Arcade','🐦','Passe pelos canos sem cair'],
    ['helicopter','Helicopter Game','Arcade','🚁','Pilote o helicóptero pelos obstáculos'],
    ['quick_click','Clique Rápido','Reflexo','🖱','Clique nos alvos o mais rápido possível'],
    ['aim','Mira Alvo','Reflexo','🎯','Acerte os alvos em movimento'],
    ['visual_reflex','Reflexo Visual','Reflexo','👀','Reaja às mudanças visuais'],
    ['word_search','Caça-Palavras','Palavras','🔍','Encontre as palavras escondidas'],
    ['anagram','Anagrama','Palavras','🔀','Forme palavras com as letras embaralhadas'],
    ['hidden_word','Palavra Oculta','Palavras','🔑','Descubra a palavra oculta pelas dicas'],
    ['crossword','Palavra Cruzada','Palavras','📰','Complete a palavra cruzada'],
    ['equations','Equações','Matemática','➗','Resolva as equações matemáticas'],
    ['num_seq','Sequências Numéricas','Matemática','📈','Complete a sequência de números'],
    ['fast_ops','Operações Rápidas','Matemática','⚡','Calcule o mais rápido possível'],
    ['connect_dots','Connect Dots','Casual','⬛','Conecte os pontos para fazer quadrados'],
    ['color_match','Color Match','Casual','🎨','Combine as cores corretamente'],
    ['bubble_pop','Bubble Pop','Casual','🫧','Estoure as bolhas coloridas'],
    ['stack_blocks','Stack Blocks','Casual','📦','Empilhe os blocos com precisão'],
    ['merge','Merge Game','Casual','🔮','Junte os elementos iguais'],
  ] as [string,string,string,string,string][]).map(([id,name,cat,icon,desc])=>makeStub(id,name,cat,icon,desc))
]

const CATS = ['Todos', ...Array.from(new Set(GAMES.map(g => g.cat)))]

// ─── Main Arcade Component ────────────────────────────────────────────────────
export default function Arcade() {
  // Persistence
  const [xp, setXpState] = useState(() => load<number>(SK.xp, 0))
  const [history, setHistory] = useState<HistEntry[]>(() => load(SK.history, []))
  const [favs, setFavs] = useState<string[]>(() => load(SK.favs, []))
  const [records, setRecords] = useState<Record<string,number>>(() => load(SK.records, {}))
  const [stats, setStats] = useState<Stats>(() => load(SK.stats, DEFAULT_STATS))
  const [achievements, setAchievements] = useState<string[]>(() => load(SK.achievements, []))
  const [lastGame, setLastGame] = useState<string>(() => load(SK.lastGame, ''))

  // UI
  const [open, setOpen] = useState(false)
  const [view, setView] = useState<'menu'|'game'|'history'|'achievements'|'stats'|'favs'>('menu')
  const [catFilter, setCatFilter] = useState('Todos')
  const [searchQ, setSearchQ] = useState('')
  const [activeGame, setActiveGame] = useState<GameDef | null>(null)
  const [sessionStart, setSessionStart] = useState(0)
  const [toastMsg, setToastMsg] = useState('')
  const [newAchs, setNewAchs] = useState<string[]>([])

  // Drag
  const modalRef = useRef<HTMLDivElement>(null)
  const dragState = useRef({dragging:false,ox:0,oy:0,x:80,y:40})
  const [pos, setPos] = useState({x:80,y:40})
  const [size] = useState({w:1100,h:700})

  function onMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('.no-drag')) return
    dragState.current.dragging = true
    dragState.current.ox = e.clientX - dragState.current.x
    dragState.current.oy = e.clientY - dragState.current.y
  }
  useEffect(() => {
    const mm = (e: MouseEvent) => { if (!dragState.current.dragging) return; const nx=e.clientX-dragState.current.ox, ny=e.clientY-dragState.current.oy; dragState.current.x=nx; dragState.current.y=ny; setPos({x:nx,y:ny}) }
    const mu = () => { dragState.current.dragging=false }
    window.addEventListener('mousemove',mm); window.addEventListener('mouseup',mu)
    return () => { window.removeEventListener('mousemove',mm); window.removeEventListener('mouseup',mu) }
  }, [])

  // ESC to close
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') { if (activeGame) { setActiveGame(null); setView('menu') } else setOpen(false) } }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [activeGame])

  const addXp = useCallback((amount: number) => {
    setXpState(prev => { const n = prev + amount; save(SK.xp, n); return n })
  }, [])

  function showToast(msg: string) { setToastMsg(msg); setTimeout(() => setToastMsg(''), 2800) }

  function checkAchievements(ns: Stats, nxp: number) {
    const newOnes: string[] = []
    ACH_DEFS.forEach(a => {
      if (!achievements.includes(a.id) && a.check(ns, nxp)) { newOnes.push(a.id) }
    })
    if (newOnes.length) {
      const all = [...achievements, ...newOnes]
      setAchievements(all); save(SK.achievements, all)
      setNewAchs(newOnes); setTimeout(() => setNewAchs([]), 4000)
      newOnes.forEach(id => { const a = ACH_DEFS.find(x => x.id === id)!; showToast(`🏆 ${a.name}`) })
    }
  }

  function updateStats(result: 'win'|'loss'|'draw'|'play', score: number, gameId: string, duration: number) {
    setStats(prev => {
      const u = {...prev}
      u.played++; u.timeTotal += duration; u.bestScore = Math.max(u.bestScore, score)
      if (result === 'win') { u.wins++; u.currentStreak++; u.bestStreak = Math.max(u.bestStreak, u.currentStreak) }
      else if (result === 'loss') { u.losses++; u.currentStreak = 0 }
      else if (result === 'draw') u.draws++
      const known = new Set(history.map(h => h.gameId))
      if (!known.has(gameId)) u.uniqueGames++
      u.favCount = favs.length
      save(SK.stats, u)
      const nxp = xp + (result==='win'?activeGame!.xpWin:result==='play'||result==='draw'?activeGame!.xpPlay/2:activeGame!.xpPlay) + (score > (records[gameId]||0) ? activeGame!.xpRecord : 0)
      checkAchievements(u, nxp)
      return u
    })
  }

  function onGameEnd(result: 'win'|'loss'|'draw'|'play', score: number) {
    if (!activeGame) return
    const duration = Math.floor((Date.now() - sessionStart) / 1000)
    const isRecord = score > (records[activeGame.id] || 0)
    let xpGained = result === 'win' ? activeGame.xpWin : activeGame.xpPlay
    if (isRecord && score > 0) xpGained += activeGame.xpRecord
    addXp(xpGained)
    if (isRecord && score > 0) { const nr = {...records, [activeGame.id]: score}; setRecords(nr); save(SK.records, nr) }
    const entry: HistEntry = { gameId: activeGame.id, gameName: activeGame.name, date: new Date().toLocaleString('pt-BR'), duration, result, score }
    const nh = [entry, ...history].slice(0, 50); setHistory(nh); save(SK.history, nh)
    setLastGame(activeGame.name); save(SK.lastGame, activeGame.name)
    updateStats(result, score, activeGame.id, duration)
    const msgs = {win:'🎉 Vitória!', loss:'💀 Derrota!', draw:'🤝 Empate!', play:'⏹ Jogo encerrado'}
    showToast(`${msgs[result]} +${xpGained}XP${isRecord&&score>0?' 🎯 Novo recorde!':''}`)
  }

  function launchGame(g: GameDef) { setActiveGame(g); setSessionStart(Date.now()); setView('game') }

  function shuffleGame() {
    const pool = GAMES.filter(g => g.id !== activeGame?.id); launchGame(pool[Math.floor(Math.random() * pool.length)])
  }

  const [skipList, setSkipList] = useState<string[]>([])
  const [shuffleCandidate, setShuffleCandidate] = useState<GameDef | null>(null)
  function doShuffle() {
    const pool = GAMES.filter(g => !skipList.includes(g.id)); if (!pool.length) { setSkipList([]); return }
    setShuffleCandidate(pool[Math.floor(Math.random() * pool.length)])
  }
  function skipShuffle() { if (!shuffleCandidate) return; setSkipList(p => [...p, shuffleCandidate.id]); setShuffleCandidate(null); setTimeout(doShuffle, 100) }

  function toggleFav(id: string) { const nf = favs.includes(id) ? favs.filter(f => f !== id) : [...favs, id]; setFavs(nf); save(SK.favs, nf) }

  function resetArcade() {
    if (!window.confirm('Resetar TUDO? XP, histórico, favoritos e recordes serão apagados!')) return
    setXpState(0); setHistory([]); setFavs([]); setRecords({}); setStats(DEFAULT_STATS); setAchievements([]); setLastGame('')
    Object.values(SK).forEach(k => localStorage.removeItem(k)); showToast('🔄 Arcade resetado')
  }

  const lv = getLevel(xp); const lvPct = LEVELS[lv] ? Math.round(((xp - LEVELS[lv-1]) / (LEVELS[lv] - LEVELS[lv-1])) * 100) : 100
  const filtered = GAMES.filter(g => (catFilter === 'Todos' || g.cat === catFilter) && (searchQ === '' || g.name.toLowerCase().includes(searchQ.toLowerCase())))
  const favGames = GAMES.filter(g => favs.includes(g.id))

  // ── Card ──────────────────────────────────────────────────────────────────
  if (!open) return (
    <div onClick={() => setOpen(true)}
      style={{ gridColumn: 'span 2', padding: '18px 22px', borderRadius: 16, border: '1px solid rgba(124,58,237,0.3)', background: 'linear-gradient(135deg,rgba(124,58,237,0.08),rgba(167,139,250,0.05),transparent)', cursor: 'pointer', transition: 'all 0.2s', userSelect: 'none' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform='translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow='0 8px 28px rgba(124,58,237,0.2)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform='translateY(0)'; (e.currentTarget as HTMLElement).style.boxShadow='none' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em', fontFamily: 'var(--font-mono)', marginBottom: 5, display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: '0.45rem', opacity: 0.5 }}>⠿</span> 🎮 ARCADE
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1.6rem', color: '#a78bfa', lineHeight: 1 }}>{GAMES.length}</div>
          <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2 }}>jogos disponíveis</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '0.95rem', color: '#c084fc' }}>Nível {lv}</div>
          <div style={{ fontSize: '0.65rem', color: '#a78bfa', fontFamily: 'var(--font-mono)' }}>{xp.toLocaleString()} XP</div>
        </div>
      </div>
      <div style={{ height: 5, borderRadius: 3, background: 'var(--border-md)', overflow: 'hidden', marginBottom: 12 }}>
        <div style={{ height: '100%', width: `${lvPct}%`, background: 'linear-gradient(90deg,#7c3aed,#a78bfa)', borderRadius: 3, transition: 'width 0.6s', boxShadow: '0 0 8px rgba(124,58,237,0.5)' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 14 }}>
        {[['🏆', stats.wins, 'Vitórias'], ['🎮', stats.played, 'Partidas'], ['❤️', favs.length, 'Favoritos']].map(([ic,v,l]) => (
          <div key={String(l)} style={{ padding: '8px', borderRadius: 10, background: 'rgba(124,58,237,0.06)', border: '1px solid rgba(124,58,237,0.15)', textAlign: 'center' }}>
            <div style={{ fontSize: '0.9rem' }}>{ic}</div>
            <div style={{ fontWeight: 800, fontSize: '0.9rem', color: '#a78bfa' }}>{v}</div>
            <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{l}</div>
          </div>
        ))}
      </div>
      {lastGame && <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginBottom: 10 }}>Último: <span style={{ color: '#a78bfa', fontWeight: 600 }}>{lastGame}</span></div>}
      <div style={{ padding: '10px 16px', borderRadius: 12, background: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: '#fff', textAlign: 'center', fontWeight: 800, fontSize: '0.85rem', boxShadow: '0 4px 16px rgba(124,58,237,0.4)' }}>
        ▶ Abrir Arcade
      </div>
    </div>
  )

  // ── Modal ─────────────────────────────────────────────────────────────────
  return (
    <>
      <div onClick={() => setOpen(true)}
        style={{ gridColumn: 'span 2', padding: '18px 22px', borderRadius: 16, border: '1px solid rgba(124,58,237,0.3)', background: 'linear-gradient(135deg,rgba(124,58,237,0.08),rgba(167,139,250,0.05),transparent)', cursor: 'pointer', opacity: 0.7 }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity='1'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity='0.7'}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '1.2rem' }}>🎮</span>
          <span style={{ fontWeight: 700, color: '#a78bfa' }}>ARCADE — Nível {lv} · {xp.toLocaleString()} XP</span>
        </div>
      </div>

      {/* Backdrop */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 9990, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }} onClick={() => { setOpen(false); setActiveGame(null); setView('menu') }} />

      {/* Modal */}
      <div ref={modalRef}
        style={{ position: 'fixed', left: pos.x, top: pos.y, width: size.w, height: size.h, zIndex: 9991, background: 'var(--bg-2,#1a1b26)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 20, display: 'flex', flexDirection: 'column', boxShadow: '0 40px 100px rgba(0,0,0,0.7)', overflow: 'hidden', userSelect: 'none' }}>

        {/* Title bar (draggable) */}
        <div onMouseDown={onMouseDown}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 20px', background: 'linear-gradient(135deg,rgba(124,58,237,0.15),rgba(167,139,250,0.08))', borderBottom: '1px solid rgba(124,58,237,0.2)', cursor: 'grab', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: '1.2rem' }}>🎮</span>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 900, fontSize: '1rem', color: '#a78bfa', lineHeight: 1 }}>ARCADE</div>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>Nível {lv} · {xp.toLocaleString()} XP · {xpToNext(xp)} para próx. nível</div>
            </div>
            {/* XP bar */}
            <div style={{ width: 120, height: 6, borderRadius: 3, background: 'rgba(124,58,237,0.2)', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${lvPct}%`, background: 'linear-gradient(90deg,#7c3aed,#a78bfa)', borderRadius: 3 }} />
            </div>
          </div>
          <div className="no-drag" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {activeGame && <button onClick={() => { setActiveGame(null); setView('menu') }} style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(124,58,237,0.3)', background: 'rgba(124,58,237,0.1)', color: '#a78bfa', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>← Menu</button>}
            <button onClick={doShuffle} style={{ padding: '5px 12px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: '#fff', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>🎲 Sortear</button>
            <button onClick={() => { setOpen(false); setActiveGame(null); setView('menu') }} style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'rgba(248,113,113,0.15)', color: '#f87171', fontWeight: 900, cursor: 'pointer', fontSize: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
          </div>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Sidebar */}
          <div style={{ width: 190, borderRight: '1px solid rgba(124,58,237,0.15)', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0, overflowY: 'auto' }}>
            {([['menu','🎮','Todos os Jogos'],['favs','⭐','Favoritos'],['history','📜','Histórico'],['achievements','🏆','Conquistas'],['stats','📊','Estatísticas']] as const).map(([v,ic,lb])=>(
              <button key={v} onClick={() => { setView(v); setActiveGame(null) }}
                className="no-drag"
                style={{ padding: '9px 12px', borderRadius: 10, border: `1px solid ${view===v?'rgba(124,58,237,0.4)':'transparent'}`, background: view===v?'rgba(124,58,237,0.12)':'transparent', color: view===v?'#a78bfa':'var(--text-muted)', fontWeight: view===v?700:400, fontSize: '0.78rem', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.15s' }}>
                {ic} {lb}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <button onClick={resetArcade} className="no-drag" style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid rgba(248,113,113,0.2)', background: 'transparent', color: 'rgba(248,113,113,0.6)', fontSize: '0.65rem', cursor: 'pointer', textAlign: 'left' }}>🔄 Resetar Arcade</button>
          </div>

          {/* Content */}
          <div className="no-drag" style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>

            {/* ── Shuffle candidate ── */}
            {shuffleCandidate && (
              <div style={{ margin: 16, padding: '16px 20px', borderRadius: 16, background: 'linear-gradient(135deg,rgba(124,58,237,0.12),rgba(167,139,250,0.06))', border: '1px solid rgba(124,58,237,0.3)', display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{ fontSize: '2rem' }}>{shuffleCandidate.icon}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.09em', marginBottom: 2 }}>🎲 Jogo Sorteado</div>
                  <div style={{ fontWeight: 800, fontSize: '1rem', color: '#a78bfa' }}>{shuffleCandidate.name}</div>
                  <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{shuffleCandidate.cat} · +{shuffleCandidate.xpWin}XP vitória</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { launchGame(shuffleCandidate); setShuffleCandidate(null) }} style={{ padding: '8px 18px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>▶ Jogar</button>
                  <button onClick={skipShuffle} style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid rgba(124,58,237,0.3)', background: 'transparent', color: '#a78bfa', fontWeight: 700, cursor: 'pointer' }}>Pular</button>
                </div>
              </div>
            )}

            {/* ── VIEW: GAME ── */}
            {view === 'game' && activeGame && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', padding: '16px', overflowY: 'auto' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', maxWidth: 600, marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: '1.5rem' }}>{activeGame.icon}</span>
                    <div>
                      <div style={{ fontWeight: 800, color: 'var(--text-primary)' }}>{activeGame.name}</div>
                      <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{activeGame.cat} · Recorde: {records[activeGame.id] || 0}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => toggleFav(activeGame.id)} style={{ padding: '6px 12px', borderRadius: 8, border: `1px solid ${favs.includes(activeGame.id)?'rgba(251,191,36,0.4)':'var(--border)'}`, background: favs.includes(activeGame.id)?'rgba(251,191,36,0.1)':'transparent', color: favs.includes(activeGame.id)?'#fbbf24':'var(--text-muted)', cursor: 'pointer', fontSize: '0.85rem' }}>
                      {favs.includes(activeGame.id)?'⭐':'☆'} Fav
                    </button>
                    <button onClick={shuffleGame} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: 'rgba(124,58,237,0.12)', color: '#a78bfa', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>🎲 Outro</button>
                  </div>
                </div>
                <div style={{ width: '100%', maxWidth: 600 }}>
                  <activeGame.component onEnd={onGameEnd} bestScore={records[activeGame.id] || 0} />
                </div>
              </div>
            )}

            {/* ── VIEW: MENU (game grid) ── */}
            {view === 'menu' && (
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Search + cats */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="🔍 Buscar jogo..."
                    style={{ padding: '7px 12px', borderRadius: 9, border: '1px solid var(--border-md)', background: 'var(--card-bg)', color: 'var(--text-primary)', fontSize: '0.78rem', outline: 'none', width: 180 }} />
                  {CATS.map(c => (
                    <button key={c} onClick={() => setCatFilter(c)}
                      style={{ padding: '5px 12px', borderRadius: 20, border: `1px solid ${catFilter===c?'rgba(124,58,237,0.5)':'var(--border)'}`, background: catFilter===c?'rgba(124,58,237,0.12)':'transparent', color: catFilter===c?'#a78bfa':'var(--text-muted)', fontSize: '0.68rem', fontWeight: catFilter===c?700:400, cursor: 'pointer' }}>
                      {c}
                    </button>
                  ))}
                </div>
                {/* Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10 }}>
                  {filtered.map(g => (
                    <div key={g.id} style={{ borderRadius: 12, border: `1px solid ${favs.includes(g.id)?'rgba(251,191,36,0.25)':'var(--border)'}`, background: 'var(--card-bg)', overflow: 'hidden', transition: 'all 0.18s', cursor: 'pointer' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform='translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow='0 6px 20px rgba(0,0,0,0.15)'; (e.currentTarget as HTMLElement).style.borderColor='rgba(124,58,237,0.4)' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform=''; (e.currentTarget as HTMLElement).style.boxShadow=''; (e.currentTarget as HTMLElement).style.borderColor=favs.includes(g.id)?'rgba(251,191,36,0.25)':'var(--border)' }}>
                      <div onClick={() => launchGame(g)} style={{ padding: '14px 12px 8px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                          <span style={{ fontSize: '1.6rem' }}>{g.icon}</span>
                          <button onClick={e => { e.stopPropagation(); toggleFav(g.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', color: favs.includes(g.id)?'#fbbf24':'var(--text-muted)', padding: 0 }}>{favs.includes(g.id)?'⭐':'☆'}</button>
                        </div>
                        <div style={{ fontWeight: 700, fontSize: '0.75rem', color: 'var(--text-primary)', lineHeight: 1.2 }}>{g.name}</div>
                        <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', lineHeight: 1.3 }}>{g.desc}</div>
                      </div>
                      <div style={{ padding: '6px 10px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.58rem', color: '#a78bfa', fontFamily: 'var(--font-mono)' }}>+{g.xpWin}XP</span>
                        {records[g.id] > 0 && <span style={{ fontSize: '0.58rem', color: '#fbbf24' }}>🏆{records[g.id]}</span>}
                        <button onClick={() => launchGame(g)} style={{ padding: '4px 10px', borderRadius: 7, border: 'none', background: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: '#fff', fontSize: '0.65rem', fontWeight: 800, cursor: 'pointer' }}>▶</button>
                      </div>
                    </div>
                  ))}
                </div>
                {filtered.length === 0 && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Nenhum jogo encontrado</div>}
              </div>
            )}

            {/* ── VIEW: FAVS ── */}
            {view === 'favs' && (
              <div style={{ padding: 16 }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 14 }}>{favGames.length} jogo(s) favoritado(s)</div>
                {favGames.length === 0 ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>⭐ Favorite jogos clicando na estrela</div>
                : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(140px,1fr))', gap: 10 }}>
                  {favGames.map(g => (
                    <div key={g.id} onClick={() => launchGame(g)} style={{ padding: '14px 12px', borderRadius: 12, border: '1px solid rgba(251,191,36,0.3)', background: 'rgba(251,191,36,0.05)', cursor: 'pointer', transition: 'all 0.15s' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.background='rgba(251,191,36,0.1)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.background='rgba(251,191,36,0.05)'}>
                      <div style={{ fontSize: '1.6rem', marginBottom: 6 }}>{g.icon}</div>
                      <div style={{ fontWeight: 700, fontSize: '0.78rem', color: 'var(--text-primary)' }}>{g.name}</div>
                      <div style={{ fontSize: '0.62rem', color: '#fbbf24', marginTop: 3 }}>⭐ Favorito</div>
                    </div>
                  ))}
                </div>}
              </div>
            )}

            {/* ── VIEW: HISTORY ── */}
            {view === 'history' && (
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 8 }}>Últimas {history.length} partidas</div>
                {history.length === 0 ? <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Nenhuma partida jogada ainda</div>
                : history.map((h, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, background: 'var(--card-bg)', border: '1px solid var(--border)' }}>
                    <span style={{ fontSize: '1.1rem' }}>{GAMES.find(g=>g.id===h.gameId)?.icon||'🎮'}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-primary)' }}>{h.gameName}</div>
                      <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>{h.date} · {Math.floor(h.duration/60)}m{h.duration%60}s</div>
                    </div>
                    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: '0.65rem', fontWeight: 700, background: h.result==='win'?'rgba(52,211,153,0.12)':h.result==='loss'?'rgba(248,113,113,0.1)':'rgba(96,165,250,0.1)', color: h.result==='win'?'#34d399':h.result==='loss'?'#f87171':'#60a5fa' }}>
                      {h.result==='win'?'✅ Vitória':h.result==='loss'?'❌ Derrota':h.result==='draw'?'🤝 Empate':'⏹ Jogou'}
                    </span>
                    {h.score > 0 && <span style={{ fontSize: '0.72rem', color: '#fbbf24', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>{h.score}pts</span>}
                  </div>
                ))}
              </div>
            )}

            {/* ── VIEW: ACHIEVEMENTS ── */}
            {view === 'achievements' && (
              <div style={{ padding: 16 }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginBottom: 14 }}>{achievements.length}/{ACH_DEFS.length} conquistas desbloqueadas</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 10 }}>
                  {ACH_DEFS.map(a => {
                    const unlocked = achievements.includes(a.id)
                    return (
                      <div key={a.id} style={{ padding: '12px 14px', borderRadius: 12, border: `1px solid ${unlocked?'rgba(251,191,36,0.35)':'var(--border)'}`, background: unlocked?'rgba(251,191,36,0.06)':'var(--card-bg)', opacity: unlocked?1:0.5, transition: 'all 0.2s' }}>
                        <div style={{ fontSize: '1.5rem', marginBottom: 6 }}>{a.icon}</div>
                        <div style={{ fontWeight: 700, fontSize: '0.78rem', color: unlocked?'var(--text-primary)':'var(--text-muted)', marginBottom: 3 }}>{a.name}</div>
                        <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>{a.desc}</div>
                        {unlocked && <div style={{ fontSize: '0.6rem', color: '#fbbf24', marginTop: 5, fontWeight: 700 }}>✅ Desbloqueado</div>}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── VIEW: STATS ── */}
            {view === 'stats' && (
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 10 }}>
                  {[
                    ['🎮','Partidas',stats.played,'#60a5fa'],['🏆','Vitórias',stats.wins,'#34d399'],['💀','Derrotas',stats.losses,'#f87171'],
                    ['🤝','Empates',stats.draws,'#94a3b8'],['⏱','Tempo Total',`${Math.floor(stats.timeTotal/3600)}h${Math.floor((stats.timeTotal%3600)/60)}m`,'#fbbf24'],
                    ['🎯','Melhor Score',stats.bestScore,'#f472b6'],['🔥','Melhor Seq.',stats.bestStreak,'#fb923c'],['🌍','Jogos Únicos',stats.uniqueGames,'#a78bfa'],
                    ['⭐','Total XP',xp.toLocaleString(),'#c084fc'],['👑','Nível',lv,'#7c3aed'],
                  ].map(([ic,lb,v,cor]) => (
                    <div key={String(lb)} style={{ padding: '14px', borderRadius: 12, background: 'var(--card-bg)', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '1rem', marginBottom: 4 }}>{ic}</div>
                      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: '1.1rem', color: String(cor), lineHeight: 1 }}>{v}</div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{lb}</div>
                    </div>
                  ))}
                </div>
                {/* Top records */}
                {Object.keys(records).length > 0 && (
                  <div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10, fontFamily: 'var(--font-mono)' }}>🏅 Recordes Pessoais</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {Object.entries(records).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([gid,sc]) => {
                        const g = GAMES.find(x => x.id === gid)
                        return g ? (
                          <div key={gid} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', borderRadius: 10, background: 'var(--card-bg)', border: '1px solid var(--border)' }}>
                            <span>{g.icon}</span>
                            <span style={{ flex: 1, fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)' }}>{g.name}</span>
                            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 800, color: '#fbbf24', fontSize: '0.85rem' }}>{sc.toLocaleString()}</span>
                          </div>
                        ) : null
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toastMsg && (
        <div style={{ position: 'fixed', bottom: 30, right: 30, zIndex: 9999, padding: '12px 20px', borderRadius: 14, background: 'linear-gradient(135deg,#7c3aed,#a855f7)', color: '#fff', fontWeight: 700, fontSize: '0.85rem', boxShadow: '0 8px 24px rgba(124,58,237,0.5)', animation: 'slideIn 0.3s ease' }}>
          {toastMsg}
        </div>
      )}

      {/* Achievement notifications */}
      {newAchs.length > 0 && newAchs.map((id, i) => {
        const a = ACH_DEFS.find(x => x.id === id)!
        return (
          <div key={id} style={{ position: 'fixed', bottom: 30 + i * 70, left: 30, zIndex: 9999, padding: '12px 18px', borderRadius: 14, background: 'linear-gradient(135deg,rgba(251,191,36,0.95),rgba(245,158,11,0.95))', color: '#fff', fontWeight: 700, fontSize: '0.8rem', boxShadow: '0 8px 24px rgba(251,191,36,0.4)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.4rem' }}>{a.icon}</span>
            <div><div style={{ fontSize: '0.6rem', opacity: 0.85, textTransform: 'uppercase' }}>Conquista!</div><div>{a.name}</div></div>
          </div>
        )
      })}

      <style>{`@keyframes slideIn{from{transform:translateX(20px);opacity:0}to{transform:translateX(0);opacity:1}}`}</style>
    </>
  )
}
