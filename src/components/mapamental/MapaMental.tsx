// @ts-nocheck
/* ════════════════════════════════════════════════════════════════════
   NEXUS · ABA "MAPA MENTAL"  (React + motor vanilla autocontido)
   --------------------------------------------------------------------
   • Coloque este arquivo em:  src/components/mapamental/MapaMental.tsx
   • Wire no App.tsx (3 linhas — ver instruções na entrega).
   • Sem dependências novas: jsPDF e html2canvas são carregados sob
     demanda via CDN só quando você exporta.
   • @ts-nocheck mantém o motor imperativo fora do type-check estrito
     do projeto (pode remover se quiser tipar depois).

   PONTOS DE INTEGRAÇÃO (procure pelos blocos comentados):
     [MÓDULO: STORAGE]  -> trocar load()/save() pelo Firestore do Nexus
     [MÓDULO: EXPORT]   -> exportação de PDF isolada
   ════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef } from 'react'

/* ─────────────────────────── CSS (escopado em .mm-app) ─────────────────────────── */
const MM_CSS = `
.mm-app{
  --mm-font:'Inter',system-ui,-apple-system,sans-serif;
  --mm-mono:ui-monospace,'SF Mono','Cascadia Code',monospace;
  --mm-accent:#7c6cff; --mm-accent-soft:rgba(124,108,255,.16);
  --mm-radius:14px; --mm-sidebar:280px; --mm-tr:.26s cubic-bezier(.4,.16,.2,1);
  position:relative; width:100%; height:100%; min-height:82vh;
  display:flex; font-family:var(--mm-font); color:var(--mm-text);
  border-radius:16px; overflow:hidden; background:var(--mm-bg);
}
.mm-app[data-mm-theme="dark"]{
  --mm-bg:#0c0e16; --mm-canvas:#0a0c14; --mm-dot:rgba(255,255,255,.05);
  --mm-panel:rgba(20,23,36,.82); --mm-panel-solid:#14172a;
  --mm-border:rgba(255,255,255,.08); --mm-border-strong:rgba(255,255,255,.16);
  --mm-text:#e9ebf5; --mm-text-dim:#9aa0bd; --mm-text-faint:#5b6184;
  --mm-hover:rgba(255,255,255,.05); --mm-shadow:0 12px 40px rgba(0,0,0,.45);
}
.mm-app[data-mm-theme="light"]{
  --mm-bg:#eef0f4; --mm-canvas:#f6f7fa; --mm-dot:rgba(20,28,60,.08);
  --mm-panel:rgba(255,255,255,.86); --mm-panel-solid:#fff;
  --mm-border:rgba(20,28,60,.1); --mm-border-strong:rgba(20,28,60,.2);
  --mm-text:#1b1f33; --mm-text-dim:#5a6075; --mm-text-faint:#9aa0b4;
  --mm-hover:rgba(20,28,60,.045); --mm-shadow:0 12px 36px rgba(40,50,90,.16);
}
.mm-app *{ box-sizing:border-box }
@media (prefers-reduced-motion:reduce){ .mm-app{ --mm-tr:0s } }

/* sidebar */
.mm-app .mm-sidebar{ width:var(--mm-sidebar); flex-shrink:0; background:var(--mm-panel-solid); border-right:1px solid var(--mm-border); display:flex; flex-direction:column; transition:margin-left var(--mm-tr) }
.mm-app .mm-sidebar.collapsed{ margin-left:calc(var(--mm-sidebar) * -1) }
.mm-app .mm-side-head{ padding:16px 16px 12px; border-bottom:1px solid var(--mm-border) }
.mm-app .mm-brand{ display:flex; align-items:center; gap:10px }
.mm-app .mm-brand .glyph{ width:26px;height:26px;border-radius:8px;flex-shrink:0;background:linear-gradient(135deg,var(--mm-accent),#4f46e5);position:relative }
.mm-app .mm-brand .glyph::after{ content:'';position:absolute;inset:0;margin:auto;width:7px;height:7px;border-radius:50%;background:#fff;box-shadow:9px -4px 0 -2px rgba(255,255,255,.7),-9px 4px 0 -2px rgba(255,255,255,.7) }
.mm-app .mm-brand h1{ font-size:.92rem;font-weight:800;letter-spacing:-.01em;margin:0 }
.mm-app .mm-brand small{ color:var(--mm-text-faint);font-size:.64rem;font-family:var(--mm-mono);letter-spacing:.06em;text-transform:uppercase }
.mm-app .mm-side-actions{ display:flex;gap:8px;margin-top:12px }
.mm-app .mm-side-actions button{ flex:1;padding:8px;font-size:.72rem;font-weight:600;cursor:pointer;border-radius:9px;border:1px solid var(--mm-border);background:transparent;color:var(--mm-text-dim);transition:var(--mm-tr) }
.mm-app .mm-side-actions button:hover{ background:var(--mm-hover);color:var(--mm-text) }
.mm-app .mm-side-actions button.primary{ background:var(--mm-accent);color:#fff;border-color:transparent }
.mm-app .mm-tree{ flex:1;overflow-y:auto;padding:10px 8px 18px }
.mm-app .mm-tree::-webkit-scrollbar{ width:8px } .mm-app .mm-tree::-webkit-scrollbar-thumb{ background:var(--mm-border-strong);border-radius:8px }
.mm-app .mm-row{ display:flex;align-items:center;gap:7px;padding:7px 8px;border-radius:9px;cursor:pointer;font-size:.8rem;color:var(--mm-text-dim);user-select:none;transition:background var(--mm-tr),color var(--mm-tr) }
.mm-app .mm-row:hover{ background:var(--mm-hover);color:var(--mm-text) }
.mm-app .mm-row.active{ background:var(--mm-accent-soft);color:var(--mm-text);font-weight:600 }
.mm-app .mm-row.drop-target{ outline:2px dashed var(--mm-accent);outline-offset:-2px }
.mm-app .mm-row .twirl{ width:14px;flex-shrink:0;text-align:center;font-size:.7rem;color:var(--mm-text-faint);transition:transform var(--mm-tr) }
.mm-app .mm-row.open > .twirl{ transform:rotate(90deg) }
.mm-app .mm-row .ico{ width:16px;flex-shrink:0;opacity:.85 }
.mm-app .mm-row .lbl{ flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap }
.mm-app .mm-row .chk{ width:15px;height:15px;flex-shrink:0;accent-color:var(--mm-accent);cursor:pointer }
.mm-app .mm-row .mini{ opacity:0;font-size:.68rem;padding:2px 5px;border-radius:6px;color:var(--mm-text-faint);transition:var(--mm-tr) }
.mm-app .mm-row:hover .mini{ opacity:1 } .mm-app .mm-row .mini:hover{ background:var(--mm-border-strong);color:var(--mm-text) }
.mm-app .mm-row input.rename{ flex:1;background:var(--mm-canvas);border:1px solid var(--mm-accent);color:var(--mm-text);border-radius:6px;padding:3px 6px;font:inherit;font-size:.8rem;outline:none }
.mm-app .mm-children{ margin-left:14px;border-left:1px solid var(--mm-border);padding-left:4px }
.mm-app .mm-side-foot{ padding:12px 14px;border-top:1px solid var(--mm-border) }
.mm-app .mm-export-bar{ display:flex;gap:8px }
.mm-app .mm-export-bar button{ flex:1;padding:9px;border-radius:9px;border:1px solid var(--mm-border);cursor:pointer;background:transparent;color:var(--mm-text-dim);font-size:.72rem;font-weight:600;transition:var(--mm-tr) }
.mm-app .mm-export-bar button:hover{ background:var(--mm-hover);color:var(--mm-text) }
.mm-app .mm-export-bar button.go{ background:linear-gradient(135deg,var(--mm-accent),#4f46e5);color:#fff;border-color:transparent }

/* palco / prancheta */
.mm-app .mm-stage{ flex:1;position:relative;overflow:hidden;background:var(--mm-canvas) }
.mm-app .mm-canvas{ position:absolute;inset:0;background-image:radial-gradient(var(--mm-dot) 1.4px,transparent 1.4px);background-size:26px 26px;cursor:grab }
.mm-app .mm-canvas.panning{ cursor:grabbing } .mm-app .mm-canvas.panning .mm-world{ transition:none }
.mm-app .mm-world{ position:absolute;left:0;top:0;width:0;height:0;transform-origin:0 0;transition:transform var(--mm-tr) }
.mm-app .mm-edges{ position:absolute;overflow:visible;left:0;top:0;pointer-events:none }

/* nós */
.mm-app .mm-node{ position:absolute;transform:translate(-50%,-50%);width:max-content;max-width:300px;min-width:38px;min-height:32px;padding:9px 15px;border-radius:var(--mm-radius);line-height:1.32;font-weight:500;display:flex;align-items:center;justify-content:center;text-align:center;white-space:pre-wrap;word-break:break-word;cursor:grab;user-select:none;border:1.5px solid transparent;box-shadow:var(--mm-shadow);transition:left var(--mm-tr),top var(--mm-tr),box-shadow var(--mm-tr),opacity var(--mm-tr);animation:mmBorn .3s cubic-bezier(.34,1.56,.64,1) }
@keyframes mmBorn{ from{ opacity:0;transform:translate(-50%,-50%) scale(.6) } to{ opacity:1 } }
.mm-app .mm-node:hover{ box-shadow:0 16px 44px rgba(0,0,0,.5);z-index:5 }
.mm-app .mm-node.selected{ outline:2.5px solid var(--mm-accent);outline-offset:3px;z-index:6 }
.mm-app .mm-node.root{ font-weight:700 }
.mm-app .mm-label{ white-space:inherit;pointer-events:none }
.mm-app .shape-pill{ border-radius:999px;padding-left:20px;padding-right:20px }
.mm-app .shape-square{ border-radius:0 }
.mm-app .shape-none{ border:none!important;background:transparent!important;box-shadow:none!important;padding:6px 8px }
.mm-app .shape-underline{ border:none!important;background:transparent!important;box-shadow:none!important;border-radius:0;border-bottom:2.5px solid currentColor!important;padding:5px 6px }

/* controles do nó (estilo MindNode) */
.mm-app .mm-ctl{ position:absolute;height:20px;min-width:20px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:.8rem;font-weight:700;cursor:pointer;background:var(--mm-panel-solid);border:1px solid var(--mm-border-strong);color:var(--mm-text-dim);opacity:0;transition:opacity .15s,background .15s;user-select:none;z-index:7 }
.mm-app .mm-add{ right:-28px;top:50%;transform:translateY(-50%) }
.mm-app .mm-fold{ left:-28px;top:50%;transform:translateY(-50%);font-size:.62rem;padding:0 5px;border-radius:11px }
.mm-app .mm-node:hover .mm-fold,.mm-app .mm-node.selected .mm-fold,.mm-app .mm-node.selected .mm-add,.mm-app .mm-node:hover .mm-add{ opacity:1 }
.mm-app .mm-add:hover,.mm-app .mm-fold:hover{ color:#fff;background:var(--mm-accent);border-color:transparent }
.mm-app .mm-resize{ position:absolute;right:-5px;bottom:-5px;width:13px;height:13px;border-radius:4px;background:var(--mm-accent);border:2px solid var(--mm-panel-solid);cursor:nwse-resize;opacity:0;transition:opacity .15s;z-index:7 }
.mm-app .mm-node.selected .mm-resize{ opacity:1 }

/* editor inline */
.mm-app .mm-editor{ position:absolute;transform:translate(-50%,-50%);z-index:40;min-width:120px;max-width:300px;border-radius:var(--mm-radius);border:2px solid var(--mm-accent);background:var(--mm-panel-solid);color:var(--mm-text);box-shadow:0 18px 50px rgba(0,0,0,.5) }
.mm-app .mm-editor textarea{ width:100%;resize:none;border:none;outline:none;background:transparent;color:inherit;font:inherit;line-height:1.35;padding:11px 14px;text-align:center }

/* painéis flutuantes */
.mm-app .mm-float{ position:absolute;z-index:30;background:var(--mm-panel);backdrop-filter:blur(18px);border:1px solid var(--mm-border);border-radius:16px;box-shadow:var(--mm-shadow) }
.mm-app .mm-toolbar{ top:14px;right:14px;padding:8px;display:flex;flex-direction:column;gap:8px }
.mm-app .mm-seg{ display:flex;gap:3px;background:var(--mm-canvas);border-radius:11px;padding:3px }
.mm-app .mm-seg button,.mm-app .mm-icobtn{ border:none;background:transparent;color:var(--mm-text-dim);cursor:pointer;padding:7px 11px;border-radius:9px;font-size:.72rem;font-weight:600;transition:var(--mm-tr);display:flex;align-items:center;gap:6px }
.mm-app .mm-seg button:hover,.mm-app .mm-icobtn:hover{ color:var(--mm-text);background:var(--mm-hover) }
.mm-app .mm-seg button.on{ background:var(--mm-accent);color:#fff }
.mm-app .mm-toolbar .row{ display:flex;gap:8px;align-items:center;justify-content:space-between }
.mm-app .mm-zoom{ display:flex;align-items:center;gap:2px;background:var(--mm-canvas);border-radius:11px;padding:3px }
.mm-app .mm-zoom button{ width:30px;height:30px;border:none;background:transparent;color:var(--mm-text-dim);cursor:pointer;border-radius:8px;font-size:1rem }
.mm-app .mm-zoom button:hover{ background:var(--mm-hover);color:var(--mm-text) }
.mm-app .mm-zoom .lvl{ font-size:.68rem;font-family:var(--mm-mono);color:var(--mm-text-faint);min-width:42px;text-align:center }
.mm-app .mm-topleft{ top:14px;left:14px;padding:7px 8px;display:flex;align-items:center;gap:8px;max-width:46% }
.mm-app .mm-topleft .ham{ width:34px;height:34px;border:none;border-radius:9px;background:transparent;color:var(--mm-text-dim);cursor:pointer;font-size:1.05rem }
.mm-app .mm-topleft .ham:hover{ background:var(--mm-hover);color:var(--mm-text) }
.mm-app .mm-topleft .name{ font-weight:700;font-size:.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis }
.mm-app .mm-topleft .meta{ font-size:.66rem;color:var(--mm-text-faint);font-family:var(--mm-mono) }
.mm-app .mm-style{ bottom:16px;left:50%;transform:translateX(-50%) translateY(20px);padding:12px 14px;display:none;gap:14px;align-items:flex-start;opacity:0;transition:opacity var(--mm-tr),transform var(--mm-tr);flex-wrap:wrap;max-width:92% }
.mm-app .mm-style.show{ display:flex;opacity:1;transform:translateX(-50%) translateY(0) }
.mm-app .mm-grp{ display:flex;flex-direction:column;gap:7px }
.mm-app .mm-grp > label{ font-size:.58rem;text-transform:uppercase;letter-spacing:.08em;color:var(--mm-text-faint);font-weight:700;font-family:var(--mm-mono) }
.mm-app .mm-grp .opts{ display:flex;gap:5px;align-items:center }
.mm-app .mm-pal-tabs{ display:flex;gap:4px;margin-bottom:2px }
.mm-app .mm-pal-tabs button{ font-size:.6rem;padding:3px 7px;border-radius:7px;border:1px solid var(--mm-border);background:transparent;color:var(--mm-text-dim);cursor:pointer;transition:var(--mm-tr) }
.mm-app .mm-pal-tabs button.on{ background:var(--mm-accent);color:#fff;border-color:transparent }
.mm-app .mm-sw{ width:23px;height:23px;border-radius:7px;cursor:pointer;border:2px solid transparent;transition:transform .12s }
.mm-app .mm-sw:hover{ transform:scale(1.12) } .mm-app .mm-sw.on{ border-color:var(--mm-text) }
.mm-app .mm-chip{ border:1px solid var(--mm-border);background:var(--mm-canvas);color:var(--mm-text-dim);border-radius:8px;padding:6px 9px;cursor:pointer;font-size:.7rem;font-weight:600;transition:var(--mm-tr);display:flex;align-items:center;justify-content:center;min-width:32px;min-height:30px }
.mm-app .mm-chip:hover{ color:var(--mm-text);border-color:var(--mm-border-strong) }
.mm-app .mm-chip.on{ border-color:var(--mm-accent);color:var(--mm-text);background:var(--mm-accent-soft) }
.mm-app .mm-font{ background:var(--mm-canvas);border-radius:8px;padding:3px }
.mm-app .mm-font button{ width:26px;height:26px;border:none;background:transparent;color:var(--mm-text-dim);cursor:pointer;border-radius:6px;font-size:1rem }
.mm-app .mm-font button:hover{ background:var(--mm-hover);color:var(--mm-text) }
.mm-app .mm-font .val{ min-width:26px;text-align:center;font-size:.74rem;font-family:var(--mm-mono);color:var(--mm-text) }
.mm-app .mm-sep{ width:1px;align-self:stretch;background:var(--mm-border) }
.mm-app .mm-hint{ bottom:16px;left:14px;padding:8px 12px;font-size:.66rem;color:var(--mm-text-faint);font-family:var(--mm-mono);display:flex;gap:12px;flex-wrap:wrap;max-width:38% }
.mm-app .mm-hint b{ color:var(--mm-text-dim) }
.mm-app .mm-empty{ position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;color:var(--mm-text-faint);text-align:center;pointer-events:none }
.mm-app .mm-empty h2{ font-size:1.1rem;color:var(--mm-text-dim);font-weight:700 }
.mm-app .mm-empty p{ font-size:.82rem;max-width:320px;line-height:1.5 }
.mm-app .mm-empty button{ pointer-events:auto;margin-top:4px;padding:10px 18px;border-radius:10px;border:none;background:var(--mm-accent);color:#fff;font-weight:700;cursor:pointer;font-size:.82rem }
.mm-app .mm-toast{ position:absolute;bottom:74px;left:50%;transform:translateX(-50%) translateY(16px);background:var(--mm-panel-solid);border:1px solid var(--mm-border-strong);color:var(--mm-text);padding:10px 16px;border-radius:11px;font-size:.78rem;box-shadow:var(--mm-shadow);display:flex;align-items:center;gap:14px;opacity:0;pointer-events:none;transition:var(--mm-tr);z-index:50 }
.mm-app .mm-toast.show{ opacity:1;transform:translateX(-50%) translateY(0);pointer-events:auto }
.mm-app .mm-toast button{ background:var(--mm-accent);border:none;color:#fff;padding:5px 12px;border-radius:7px;cursor:pointer;font-weight:700;font-size:.72rem }
.mm-app .mm-context{ position:absolute;z-index:80;background:var(--mm-panel-solid);border:1px solid var(--mm-border-strong);border-radius:10px;box-shadow:var(--mm-shadow);padding:5px;min-width:170px }
.mm-app .mm-context button{ display:flex;width:100%;align-items:center;gap:9px;padding:8px 10px;border:none;background:transparent;color:var(--mm-text);font-size:.8rem;cursor:pointer;border-radius:7px;text-align:left }
.mm-app .mm-context button:hover{ background:var(--mm-hover) }
.mm-app .mm-context button.danger{ color:#f87171 }
.mm-app .mm-context .sep{ height:1px;background:var(--mm-border);margin:4px 6px }
.mm-app .mm-overlay{ position:absolute;inset:0;background:rgba(6,8,14,.72);backdrop-filter:blur(4px);display:none;align-items:center;justify-content:center;z-index:90;flex-direction:column;gap:14px;color:#fff }
.mm-app .mm-overlay.show{ display:flex }
.mm-app .mm-spin{ width:40px;height:40px;border:3px solid rgba(255,255,255,.2);border-top-color:var(--mm-accent);border-radius:50%;animation:mmSpin .8s linear infinite }
@keyframes mmSpin{ to{ transform:rotate(360deg) } }
.mm-app .mm-export-stage{ position:fixed;left:-99999px;top:0 }
@media (max-width:720px){ .mm-app .mm-sidebar{ position:absolute;z-index:60;height:100% } .mm-app .mm-hint{ display:none } }
`

/* ─────────────────────────── Estrutura (injetada no .mm-app) ─────────────────────────── */
const MM_HTML = `
<aside class="mm-sidebar" data-mm="sidebar">
  <div class="mm-side-head">
    <div class="mm-brand"><div class="glyph"></div><div><h1>Mapa Mental</h1><small>Nexus</small></div></div>
    <div class="mm-side-actions">
      <button data-mm="newFolder">＋ Pasta</button>
      <button class="primary" data-mm="newMap">＋ Mapa</button>
    </div>
  </div>
  <div class="mm-tree" data-mm="tree"></div>
  <div class="mm-side-foot"><div class="mm-export-bar">
    <button data-mm="exportActive" title="Exporta o mapa aberto em 1 página">⤓ Mapa atual</button>
    <button class="go" data-mm="exportSelected" title="Exporta os mapas marcados (1 por página)">⤓ Selecionados</button>
  </div></div>
</aside>
<main class="mm-stage">
  <div class="mm-canvas" data-mm="canvas"><div class="mm-world" data-mm="world"><svg class="mm-edges" data-mm="edges"></svg></div></div>
  <div class="mm-empty" data-mm="empty" style="display:none">
    <h2>Nenhum mapa aberto</h2><p>Crie um mapa na barra lateral para começar a pensar em forma de árvore.</p>
    <button data-mm="emptyCreate">Criar primeiro mapa</button>
  </div>
  <div class="mm-float mm-topleft">
    <button class="ham" data-mm="ham" title="Ocultar/mostrar barra lateral">☰</button>
    <span class="name" data-mm="name">—</span><span class="meta" data-mm="meta"></span>
  </div>
  <div class="mm-float mm-toolbar">
    <div class="mm-seg" data-mm="layoutSeg">
      <button data-layout="radial" class="on">Radial</button>
      <button data-layout="horizontal">Horizontal</button>
      <button data-layout="vertical">Vertical</button>
    </div>
    <div class="row">
      <div class="mm-zoom"><button data-mm="zoomOut">−</button><span class="lvl" data-mm="zoomLvl">100%</span><button data-mm="zoomIn">＋</button></div>
      <button class="mm-icobtn" data-mm="fit" title="Ajustar à tela">⤢</button>
      <button class="mm-icobtn" data-mm="auto" title="Reorganizar (limpar arrastes)">⟲</button>
      <button class="mm-icobtn" data-mm="theme" title="Alternar tema">◐</button>
    </div>
  </div>
  <div class="mm-float mm-style" data-mm="stylePanel">
    <div class="mm-grp"><label>Cor</label><div class="mm-pal-tabs" data-mm="palTabs"></div><div class="opts" data-mm="swatches"></div></div>
    <div class="mm-sep"></div>
    <div class="mm-grp"><label>Fonte</label><div class="opts mm-font"><button data-fs="-1">−</button><span class="val" data-mm="fontVal">10</span><button data-fs="1">＋</button></div></div>
    <div class="mm-sep"></div>
    <div class="mm-grp"><label>Preenchimento</label><div class="opts" data-mm="fillOpts">
      <button class="mm-chip" data-fill="solid">Sólido</button>
      <button class="mm-chip" data-fill="white">Branco</button>
      <button class="mm-chip" data-fill="transparent">Transp.</button>
    </div></div>
    <div class="mm-sep"></div>
    <div class="mm-grp"><label>Formato</label><div class="opts" data-mm="shapeOpts">
      <button class="mm-chip" data-shape="rounded">▢</button>
      <button class="mm-chip" data-shape="pill">⬭</button>
      <button class="mm-chip" data-shape="square">◻</button>
      <button class="mm-chip" data-shape="none">T</button>
      <button class="mm-chip" data-shape="underline">U̲</button>
    </div></div>
    <div class="mm-sep"></div>
    <div class="mm-grp"><label>Linha</label><div class="opts" data-mm="lineOpts">
      <button class="mm-chip" data-line="curved">∿</button>
      <button class="mm-chip" data-line="straight">╱</button>
      <button class="mm-chip" data-line="angular">⌐</button>
    </div></div>
  </div>
  <div class="mm-float mm-hint">
    <span><b>Tab</b> filho</span><span><b>Enter</b> editar</span><span><b>↑↓←→</b> navegar</span>
    <span><b>arraste</b> mover</span><span><b>Del</b> remover</span><span><b>Ctrl+Z</b> desfazer</span>
  </div>
  <div class="mm-toast" data-mm="toast"><span data-mm="toastMsg"></span><button data-mm="toastAction" style="display:none"></button></div>
  <div class="mm-context" data-mm="context" style="display:none"></div>
</main>
<div class="mm-overlay" data-mm="overlay"><div class="mm-spin"></div><div data-mm="overlayMsg">Gerando PDF…</div></div>
<div class="mm-export-stage" data-mm="exportStage"></div>
`

/* ════════════════════════════════════════════════════════════════════
   MOTOR — roda escopado dentro do container (root). Tudo aqui é vanilla.
   ════════════════════════════════════════════════════════════════════ */
function mountMapaMental(root: HTMLElement){
  root.innerHTML = MM_HTML
  const $  = (s: string) => root.querySelector(s) as HTMLElement
  const q  = (n: string) => root.querySelector('[data-mm="'+n+'"]') as HTMLElement
  const SVGNS = 'http://www.w3.org/2000/svg'
  const uid = () => 'n' + Math.random().toString(36).slice(2,9) + Date.now().toString(36).slice(-3)
  const clamp = (v,a,b) => Math.max(a, Math.min(b, v))
  const readable = (hex) => { const c=hex.replace('#',''); const r=parseInt(c.substr(0,2),16),g=parseInt(c.substr(2,2),16),b=parseInt(c.substr(4,2),16); return (0.299*r+0.587*g+0.114*b)/255>0.6?'#0b0d14':'#ffffff' }
  const escapeHtml = (s) => (s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))
  const slug = (s) => (s||'mapa').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')

  const PALETTES = {
    minimal:['#111827','#374151','#6b7280','#4f46e5','#0ea5e9','#10b981'],
    pastel :['#f9a8d4','#c4b5fd','#a7f3d0','#bae6fd','#fde68a','#fdba74'],
    neon   :['#22d3ee','#a3e635','#f472b6','#fb923c','#818cf8','#34d399'],
    dark   :['#1e293b','#312e81','#3f3f46','#7f1d1d','#064e3b','#155e75'],
  }
  const PAL_LABELS = { minimal:'Mínima', pastel:'Pastel', neon:'Neon', dark:'Escura' }
  const baseStyle = (color='#4f46e5', fontSize=10) => ({ palette:'minimal', color, fill:'solid', shape:'rounded', line:'curved', fontSize })

  /* ── [MÓDULO: STORAGE] ── troque load()/save() para integrar ao Nexus ──
     O estado é um JSON limpo (sem posições — recalculadas em runtime).
     Ex. Firestore:
       async load(){ const s=await getDoc(doc(db,`users/${uid}/apps/mapamental`)); return s.exists()?s.data().state:null }
       save(d){ setDoc(doc(db,`users/${uid}/apps/mapamental`), { state: clean(d) }, {merge:true}) }
     -------------------------------------------------------------------- */
  const STORAGE_KEY = 'nexus_mapamental_v1'
  const Storage = {
    load(){ try{ const r=localStorage.getItem(STORAGE_KEY); return r?JSON.parse(r):null }catch(e){ return null } },
    save(d){ try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(d)) }catch(e){} }
  }
  let _t=null; const save=()=>Storage.save(state); const saveDebounced=()=>{ clearTimeout(_t); _t=setTimeout(save,600) }

  function seed(){
    const f=uid(),m=uid(),r=uid(),a=uid(),b=uid(),c=uid()
    return { version:2, theme:'dark',
      folders:{ [f]:{id:f,name:'Estudos',parentId:null} },
      maps:{ [m]:{ id:m,name:'Mapa de exemplo',folderId:f,layout:'radial',rootId:r,view:null,
        nodes:{
          [r]:{id:r,text:'Direito Constitucional',parentId:null,children:[a,b,c],style:baseStyle('#4f46e5',12)},
          [a]:{id:a,text:'Princípios Fundamentais',parentId:r,children:[],style:baseStyle('#10b981')},
          [b]:{id:b,text:'Direitos e Garantias',parentId:r,children:[],style:baseStyle('#0ea5e9')},
          [c]:{id:c,text:'Organização do Estado',parentId:r,children:[],style:baseStyle('#f59e0b')},
        } } },
      activeMapId:m, ui:{ expanded:{[f]:true}, exportSel:{} } }
  }
  let state = Storage.load() || seed()
  if(!state.ui) state.ui={expanded:{},exportSel:{}}
  if(!state.ui.exportSel) state.ui.exportSel={}
  if(!state.ui.expanded) state.ui.expanded={}

  /* refs voláteis */
  let elsById={}, positions={}, currentSizes={}, selectedSet=[], editingId=null, paletteTab='minimal'
  const history=[]
  const canvas=q('canvas'), world=q('world'), edgesSvg=q('edges')

  const activeMap = () => state.maps[state.activeMapId] || null
  function view(){ const m=activeMap(); if(!m) return {zoom:1,panX:0,panY:0}; if(!m.view) m.view={zoom:1,panX:canvas.clientWidth/2,panY:canvas.clientHeight/2}; return m.view }
  const primarySelected = () => selectedSet[selectedSet.length-1] || null
  const kids = (m,id) => m.nodes[id].collapsed ? [] : m.nodes[id].children
  function countDesc(m,id){ let n=0; (function r(x){ m.nodes[x].children.forEach(c=>{ n++; r(c) }) })(id); return n }

  function pushHistory(){ const m=activeMap(); if(!m) return; history.push(JSON.stringify(m)); if(history.length>60) history.shift() }
  function undo(){ if(!history.length) return toast('Nada para desfazer'); const snap=JSON.parse(history.pop()); state.maps[snap.id]=snap; if(state.activeMapId===snap.id){ selectedSet=selectedSet.filter(id=>snap.nodes[id]); world.querySelectorAll('.mm-node').forEach(e=>e.remove()); elsById={}; render() } renderTree(); save(); toast('Ação desfeita') }

  /* ── mutações da árvore ── */
  function addChild(parentId){
    const m=activeMap(); const parent=m.nodes[parentId]; if(!parent) return
    pushHistory()
    if(parent.collapsed){ parent.collapsed=false }
    const id=uid(); const inh={...parent.style}
    const pal=PALETTES[inh.palette]||PALETTES.minimal
    inh.color=pal[(parent.children.length+1)%pal.length]; inh.fontSize=10; delete inh.width
    m.nodes[id]={id,text:'',parentId,children:[],style:inh}
    parent.children.push(id)
    render(); selectOnly(id); openEditor(id); save()
  }
  function deleteSubtree(id){ const m=activeMap(); const n=m.nodes[id]; if(!n||id===m.rootId) return false
    const acc=[]; (function col(x){ acc.push(x); m.nodes[x].children.forEach(col) })(id)
    const p=m.nodes[n.parentId]; if(p) p.children=p.children.filter(c=>c!==id)
    acc.forEach(x=>{ delete m.nodes[x]; if(elsById[x]){ elsById[x].remove(); delete elsById[x] } })
    selectOnly(n.parentId); return true }
  function requestDelete(id){ const m=activeMap(); if(id===m.rootId) return toast('O nó raiz não pode ser removido'); pushHistory(); deleteSubtree(id); render(); save(); toast('Nó removido',{label:'Desfazer',action:undo}) }
  function toggleCollapse(id){ const m=activeMap(); const n=m.nodes[id]; if(!n.children.length) return; pushHistory(); n.collapsed=!n.collapsed; render(); save() }

  /* ── motor de layout (raiz em 0,0; recalculado sempre) ── */
  const GAP_MAIN=72, GAP_CROSS=26
  function computeLayout(m,sizes){
    const pos={}
    if(m.layout==='radial') radialLayout(m,sizes,pos)
    else { const axis=m.layout==='vertical'?'v':'h'; tidyTree(m,sizes,pos,m.rootId,axis,+1); const rx=pos[m.rootId].x,ry=pos[m.rootId].y; for(const id in pos){ pos[id].x-=rx; pos[id].y-=ry } }
    applyOffsets(m,pos); return pos
  }
  function applyOffsets(m,pos){ (function walk(id,ax,ay){ const o=m.nodes[id].offset; const nx=ax+(o?o.dx:0), ny=ay+(o?o.dy:0); if(pos[id]){ pos[id].x+=nx; pos[id].y+=ny } kids(m,id).forEach(c=>{ if(pos[c]) walk(c,nx,ny) }) })(m.rootId,0,0) }
  function tidyTree(m,sizes,pos,rootId,axis,dir){
    const mainOf=id=>axis==='h'?sizes[id].w:sizes[id].h, crossOf=id=>axis==='h'?sizes[id].h:sizes[id].w
    const lvl=[]; (function d(id,k){ lvl[k]=Math.max(lvl[k]||0,mainOf(id)); kids(m,id).forEach(c=>d(c,k+1)) })(rootId,0)
    const along=[0]; for(let k=1;k<lvl.length;k++) along[k]=along[k-1]+lvl[k-1]+GAP_MAIN
    let cur=0; const cr={}
    ;(function place(id){ const ks=kids(m,id); if(!ks.length){ cr[id]=cur+crossOf(id)/2; cur+=crossOf(id)+GAP_CROSS } else { ks.forEach(place); cr[id]=(cr[ks[0]]+cr[ks[ks.length-1]])/2 } })(rootId)
    ;(function w(id,k){ const a=dir*along[k]; pos[id]=axis==='h'?{x:a,y:cr[id]}:{x:cr[id],y:a}; kids(m,id).forEach(c=>w(c,k+1)) })(rootId,0)
  }
  function tidyLocal(m,sizes,rootId,out,dir){
    const lvl=[]; (function d(id,k){ lvl[k]=Math.max(lvl[k]||0,sizes[id].w); kids(m,id).forEach(c=>d(c,k+1)) })(rootId,0)
    const along=[0]; for(let k=1;k<lvl.length;k++) along[k]=along[k-1]+lvl[k-1]+GAP_MAIN
    let cur=0; const cr={}
    ;(function place(id){ const ks=kids(m,id); if(!ks.length){ cr[id]=cur+sizes[id].h/2; cur+=sizes[id].h+GAP_CROSS } else { ks.forEach(place); cr[id]=(cr[ks[0]]+cr[ks[ks.length-1]])/2 } })(rootId)
    ;(function w(id,k){ out[id]={x:dir*along[k],y:cr[id]}; kids(m,id).forEach(c=>w(c,k+1)) })(rootId,0)
  }
  function radialLayout(m,sizes,pos){
    const root=m.rootId; pos[root]={x:0,y:0}; const ks=kids(m,root)
    layoutForest(m,sizes,pos,ks.filter((_,i)=>i%2===0),+1,sizes[root])
    layoutForest(m,sizes,pos,ks.filter((_,i)=>i%2===1),-1,sizes[root])
  }
  function layoutForest(m,sizes,pos,childIds,dir,rootSize){
    if(!childIds.length) return
    const GAP_SIDE=64,GAP_SIB=30, xBase=dir*(rootSize.w/2+GAP_SIDE)
    const blocks=childIds.map(cid=>{ const local={}; tidyLocal(m,sizes,cid,local,dir); let mn=Infinity,mx=-Infinity; for(const id in local){ mn=Math.min(mn,local[id].y); mx=Math.max(mx,local[id].y) } return {local,mn,h:(mx-mn)||0} })
    const totalH=blocks.reduce((a,b)=>a+b.h,0)+GAP_SIB*Math.max(0,blocks.length-1)
    let y=-totalH/2
    blocks.forEach(b=>{ const sh=y-b.mn; for(const id in b.local) pos[id]={x:xBase+b.local[id].x,y:b.local[id].y+sh}; y+=b.h+GAP_SIB })
  }

  /* ── conexões (SVG) ── */
  function anchorPair(p,c,ps,cs){ const dx=c.x-p.x,dy=c.y-p.y; let from,to
    if(Math.abs(dx)>=Math.abs(dy)){ from={x:p.x+Math.sign(dx||1)*ps.w/2,y:p.y}; to={x:c.x-Math.sign(dx||1)*cs.w/2,y:c.y} }
    else { from={x:p.x,y:p.y+Math.sign(dy||1)*ps.h/2}; to={x:c.x,y:c.y-Math.sign(dy||1)*cs.h/2} } return {from,to,dx,dy} }
  function edgeD(from,to,dx,dy,line){ const h=Math.abs(dx)>=Math.abs(dy)
    if(line==='straight') return `M ${from.x} ${from.y} L ${to.x} ${to.y}`
    if(line==='angular'){ if(h){ const mx=(from.x+to.x)/2; return `M ${from.x} ${from.y} L ${mx} ${from.y} L ${mx} ${to.y} L ${to.x} ${to.y}` } const my=(from.y+to.y)/2; return `M ${from.x} ${from.y} L ${from.x} ${my} L ${to.x} ${my} L ${to.x} ${to.y}` }
    if(h){ const c1=from.x+(to.x-from.x)*.5, c2=to.x-(to.x-from.x)*.5; return `M ${from.x} ${from.y} C ${c1} ${from.y} ${c2} ${to.y} ${to.x} ${to.y}` }
    const d1=from.y+(to.y-from.y)*.5, d2=to.y-(to.y-from.y)*.5; return `M ${from.x} ${from.y} C ${from.x} ${d1} ${to.x} ${d2} ${to.x} ${to.y}` }
  function drawEdges(svg,m,pos,sizes){ while(svg.firstChild) svg.removeChild(svg.firstChild)
    for(const id in m.nodes){ if(id===m.rootId) continue; const n=m.nodes[id],pid=n.parentId; if(!pos[pid]||!pos[id]) continue
      const a=anchorPair(pos[pid],pos[id],sizes[pid],sizes[id]); const path=document.createElementNS(SVGNS,'path')
      path.setAttribute('d',edgeD(a.from,a.to,a.dx,a.dy,n.style.line)); path.setAttribute('fill','none')
      path.setAttribute('stroke',n.style.color); path.setAttribute('stroke-width','2.2'); path.setAttribute('stroke-linecap','round'); path.setAttribute('stroke-linejoin','round'); path.setAttribute('opacity','0.7')
      svg.appendChild(path) } }

  /* ── nós (criação / estilo) ── */
  function styleNodeEl(el,n,isRoot){ const s=n.style,col=s.color
    el.className='mm-node shape-'+s.shape+(isRoot?' root':'')
    el.style.fontSize=(s.fontSize||10)+'px'
    if(s.width){ el.style.width=s.width+'px'; el.style.maxWidth='none' } else { el.style.width=''; el.style.maxWidth='' }
    if(s.shape==='none'){ el.style.background='transparent'; el.style.color=col; el.style.borderColor='transparent' }
    else if(s.shape==='underline'){ el.style.background='transparent'; el.style.color=col; el.style.borderColor='transparent' }
    else if(s.fill==='solid'){ el.style.background=col; el.style.color=readable(col); el.style.borderColor='transparent' }
    else if(s.fill==='white'){ el.style.background='#ffffff'; el.style.color=col; el.style.borderColor=col }
    else { el.style.background='transparent'; el.style.color=col; el.style.borderColor=col }
    if(selectedSet.includes(n.id)) el.classList.add('selected') }
  function setNodeText(el,t){ const lab=el.querySelector('.mm-label'); if(lab) lab.textContent=(t&&t.length)?t:'Sem título' }
  function makeNodeEl(n,isRoot){ const el=document.createElement('div'); el.dataset.id=n.id
    const lab=document.createElement('span'); lab.className='mm-label'; el.appendChild(lab)
    const add=document.createElement('div'); add.className='mm-ctl mm-add'; add.textContent='+'; el.appendChild(add)
    const fold=document.createElement('div'); fold.className='mm-ctl mm-fold'; el.appendChild(fold)
    const rz=document.createElement('div'); rz.className='mm-resize'; el.appendChild(rz)
    styleNodeEl(el,n,isRoot); setNodeText(el,n.text); return el }
  function updateControls(el,n){ const fold=el.querySelector('.mm-fold')
    if(n.children.length){ fold.style.display='flex'; fold.textContent=n.collapsed?('+'+countDesc(activeMap(),n.id)):'–' } else fold.style.display='none' }

  function render(){ const m=activeMap(); if(!m){ showEmpty(true); return } showEmpty(false)
    for(const id in elsById){ if(!m.nodes[id]){ elsById[id].remove(); delete elsById[id] } }
    for(const id in m.nodes){ let el=elsById[id]
      if(!el){ el=makeNodeEl(m.nodes[id],id===m.rootId); bindNodeEvents(el,id); world.appendChild(el); elsById[id]=el }
      else { styleNodeEl(el,m.nodes[id],id===m.rootId); setNodeText(el,m.nodes[id].text) }
      updateControls(el,m.nodes[id]) }
    relayout(); updateSelection() }
  function relayout(){ const m=activeMap(); if(!m) return
    for(const id in elsById) elsById[id].style.display=''
    const sizes={}; for(const id in elsById) sizes[id]={w:elsById[id].offsetWidth,h:elsById[id].offsetHeight}
    currentSizes=sizes; positions=computeLayout(m,sizes)
    for(const id in elsById){ const p=positions[id]; if(p){ elsById[id].style.left=p.x+'px'; elsById[id].style.top=p.y+'px' } else elsById[id].style.display='none' }
    drawEdges(edgesSvg,m,positions,sizes) }

  /* ── seleção ── */
  function selectOnly(id){ selectedSet=id?[id]:[]; updateSelection() }
  function toggleSelect(id){ const i=selectedSet.indexOf(id); i<0?selectedSet.push(id):selectedSet.splice(i,1); updateSelection() }
  function clearSelection(){ if(editingId) return; selectedSet=[]; updateSelection() }
  function updateSelection(){ for(const id in elsById) elsById[id].classList.toggle('selected',selectedSet.includes(id))
    const panel=q('stylePanel'); if(selectedSet.length){ panel.classList.add('show'); syncStyleControls() } else panel.classList.remove('show') }

  /* ── arraste de nó (move o ramo, estilo MindNode) ── */
  function startNodeDrag(e,id){ const m=activeMap(); const n=m.nodes[id]; const v=view(); const sx=e.clientX,sy=e.clientY
    const start={dx:n.offset?n.offset.dx:0,dy:n.offset?n.offset.dy:0}; let moved=false,snap=false
    const move=(ev)=>{ const ddx=(ev.clientX-sx)/v.zoom, ddy=(ev.clientY-sy)/v.zoom
      if(!moved && Math.hypot(ev.clientX-sx,ev.clientY-sy)>4){ moved=true; if(!snap){ pushHistory(); snap=true } canvas.classList.add('panning') }
      if(moved){ n.offset={dx:start.dx+ddx,dy:start.dy+ddy}; relayout() } }
    const up=(ev)=>{ document.removeEventListener('pointermove',move); document.removeEventListener('pointerup',up); canvas.classList.remove('panning')
      if(!moved){ ev.shiftKey?toggleSelect(id):selectOnly(id) } else { if(n.offset && Math.abs(n.offset.dx)<0.5 && Math.abs(n.offset.dy)<0.5) delete n.offset; save() } }
    document.addEventListener('pointermove',move); document.addEventListener('pointerup',up) }

  /* ── redimensionar a caixa pelo mouse (texto reflui) ── */
  function startResize(e,id){ e.stopPropagation(); e.preventDefault(); const m=activeMap(); const n=m.nodes[id]; const v=view()
    const sx=e.clientX; const startW=n.style.width||elsById[id].offsetWidth; pushHistory()
    const move=(ev)=>{ const w=clamp(startW+(ev.clientX-sx)/v.zoom,70,620); n.style.width=Math.round(w); elsById[id].style.width=n.style.width+'px'; elsById[id].style.maxWidth='none'; relayout() }
    const up=()=>{ document.removeEventListener('pointermove',move); document.removeEventListener('pointerup',up); save() }
    document.addEventListener('pointermove',move); document.addEventListener('pointerup',up) }

  function bindNodeEvents(el,id){
    el.addEventListener('pointerdown',e=>{ if(e.button!==0) return; hideContext()
      if(e.target.closest('.mm-resize')) return startResize(e,id)
      if(e.target.closest('.mm-add')){ e.stopPropagation(); selectOnly(id); addChild(id); return }
      if(e.target.closest('.mm-fold')){ e.stopPropagation(); toggleCollapse(id); return }
      e.stopPropagation(); startNodeDrag(e,id) })
    el.addEventListener('dblclick',e=>{ e.stopPropagation(); selectOnly(id); openEditor(id) })
    el.addEventListener('contextmenu',e=>{ e.preventDefault(); e.stopPropagation(); selectOnly(id); showContext(e.clientX,e.clientY,id) }) }

  /* ── edição inline ── */
  function openEditor(id){ const m=activeMap(); const n=m.nodes[id]; if(!n) return; closeEditor()
    editingId=id; const wrap=document.createElement('div'); wrap.className='mm-editor'
    wrap.style.left=positions[id].x+'px'; wrap.style.top=positions[id].y+'px'
    wrap.style.width=Math.max(140,(n.style.width||currentSizes[id]?.w||140))+'px'
    const ta=document.createElement('textarea'); ta.rows=1; ta.value=n.text; ta.style.fontSize=(n.style.fontSize||10)+'px'
    wrap.appendChild(ta); world.appendChild(wrap)
    const grow=()=>{ ta.style.height='auto'; ta.style.height=ta.scrollHeight+'px' }
    ta.addEventListener('input',grow); requestAnimationFrame(()=>{ ta.focus(); ta.select(); grow() })
    ta.addEventListener('keydown',e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); commitEditor(ta.value) }
      else if(e.key==='Escape'){ e.preventDefault(); closeEditor(); selectOnly(id) }
      else if(e.key==='Tab'){ e.preventDefault(); commitEditor(ta.value); addChild(id) } })
    ta.addEventListener('blur',()=>{ if(editingId===id) commitEditor(ta.value) }) }
  function commitEditor(val){ const id=editingId; if(!id) return; const m=activeMap(); const n=m.nodes[id]; const v=(val||'').trim()
    if(n&&n.text!==v){ pushHistory(); n.text=v } closeEditor(); render(); selectOnly(id); save() }
  function closeEditor(){ const e=root.querySelector('.mm-editor'); if(e) e.remove(); editingId=null }

  /* ── navegação por setas (geométrica) ── */
  function navigate(dir){ const cur=primarySelected(); const m=activeMap(); if(!cur||!m||!positions[cur]) return
    const p=positions[cur]; let best=null,bs=Infinity
    for(const id in m.nodes){ if(id===cur) continue; const Q=positions[id]; if(!Q) continue; const dx=Q.x-p.x,dy=Q.y-p.y; let al,cr,ok=false
      if(dir==='left'){ ok=dx<-4; al=-dx; cr=Math.abs(dy) } if(dir==='right'){ ok=dx>4; al=dx; cr=Math.abs(dy) }
      if(dir==='up'){ ok=dy<-4; al=-dy; cr=Math.abs(dx) } if(dir==='down'){ ok=dy>4; al=dy; cr=Math.abs(dx) }
      if(!ok) continue; const sc=al+cr*2.2; if(sc<bs){ bs=sc; best=id } }
    if(best){ selectOnly(best); ensureVisible(best) } }
  function ensureVisible(id){ const v=view(); const p=positions[id]; if(!p) return; const sx=p.x*v.zoom+v.panX, sy=p.y*v.zoom+v.panY
    const M=90,W=canvas.clientWidth,H=canvas.clientHeight
    if(sx<M) v.panX+=(M-sx); else if(sx>W-M) v.panX-=(sx-(W-M)); if(sy<M) v.panY+=(M-sy); else if(sy>H-M) v.panY-=(sy-(H-M)); applyTransform(); saveDebounced() }

  /* ── pan + zoom ── */
  let panning=false,sX=0,sY=0,sPX=0,sPY=0
  function applyTransform(){ const v=view(); world.style.transform=`translate(${v.panX}px,${v.panY}px) scale(${v.zoom})`; q('zoomLvl').textContent=Math.round(v.zoom*100)+'%' }
  canvas.addEventListener('pointerdown',e=>{ if(e.target.closest('.mm-node')||e.target.closest('.mm-editor')) return; hideContext(); clearSelection()
    panning=true; canvas.classList.add('panning'); sX=e.clientX; sY=e.clientY; const v=view(); sPX=v.panX; sPY=v.panY; canvas.setPointerCapture(e.pointerId) })
  canvas.addEventListener('pointermove',e=>{ if(!panning) return; const v=view(); v.panX=sPX+(e.clientX-sX); v.panY=sPY+(e.clientY-sY); applyTransform() })
  canvas.addEventListener('pointerup',()=>{ if(panning){ panning=false; canvas.classList.remove('panning'); saveDebounced() } })
  canvas.addEventListener('wheel',e=>{ e.preventDefault(); const v=view(); const r=canvas.getBoundingClientRect(); const mx=e.clientX-r.left,my=e.clientY-r.top
    const f=e.deltaY<0?1.12:1/1.12; const nz=clamp(v.zoom*f,0.2,2.6); v.panX=mx-(mx-v.panX)*(nz/v.zoom); v.panY=my-(my-v.panY)*(nz/v.zoom); v.zoom=nz; applyTransform(); saveDebounced() },{passive:false})
  function setZoom(z){ const v=view(); const W=canvas.clientWidth/2,H=canvas.clientHeight/2; const nz=clamp(z,0.2,2.6); v.panX=W-(W-v.panX)*(nz/v.zoom); v.panY=H-(H-v.panY)*(nz/v.zoom); v.zoom=nz; applyTransform(); saveDebounced() }
  function fit(){ const m=activeMap(); if(!m||!Object.keys(positions).length) return; let mnX=Infinity,mnY=Infinity,mxX=-Infinity,mxY=-Infinity
    for(const id in positions){ const p=positions[id],s=currentSizes[id]; mnX=Math.min(mnX,p.x-s.w/2); mxX=Math.max(mxX,p.x+s.w/2); mnY=Math.min(mnY,p.y-s.h/2); mxY=Math.max(mxY,p.y+s.h/2) }
    const W=canvas.clientWidth,H=canvas.clientHeight,bw=(mxX-mnX)||1,bh=(mxY-mnY)||1; const v=view(); v.zoom=clamp(Math.min((W-140)/bw,(H-180)/bh),0.2,1.6)
    v.panX=W/2-((mnX+mxX)/2)*v.zoom; v.panY=H/2-((mnY+mxY)/2)*v.zoom; applyTransform(); saveDebounced() }
  function autoArrange(){ const m=activeMap(); if(!m) return; pushHistory(); for(const id in m.nodes) delete m.nodes[id].offset; render(); fit(); save(); toast('Layout reorganizado') }

  /* ── painel de estilo ── */
  function buildPaletteTabs(){ const host=q('palTabs'); host.innerHTML=''
    Object.keys(PALETTES).forEach(key=>{ const b=document.createElement('button'); b.textContent=PAL_LABELS[key]; b.dataset.pal=key
      b.addEventListener('click',()=>{ paletteTab=key; renderSwatches(); syncStyleControls() }); host.appendChild(b) }) }
  function renderSwatches(){ const host=q('swatches'); host.innerHTML=''
    (PALETTES[paletteTab]||PALETTES.minimal).forEach(col=>{ const s=document.createElement('div'); s.className='mm-sw'; s.style.background=col; s.dataset.col=col; s.addEventListener('click',()=>setStyle('color',col)); host.appendChild(s) }) }
  function setStyle(prop,val){ if(!selectedSet.length) return; const m=activeMap(); pushHistory()
    selectedSet.forEach(id=>{ const n=m.nodes[id]; if(!n) return; n.style[prop]=val; if(prop==='color') n.style.palette=paletteTab }); render(); save(); syncStyleControls() }
  function setFont(delta){ if(!selectedSet.length) return; const m=activeMap(); pushHistory()
    selectedSet.forEach(id=>{ const n=m.nodes[id]; if(!n) return; n.style.fontSize=clamp((n.style.fontSize||10)+delta,7,15) }); render(); save(); syncStyleControls() }
  function syncStyleControls(){ const id=primarySelected(); const m=activeMap(); if(!id||!m||!m.nodes[id]) return; const s=m.nodes[id].style
    paletteTab=s.palette||paletteTab
    q('palTabs').querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.pal===paletteTab)); renderSwatches()
    q('swatches').querySelectorAll('.mm-sw').forEach(sw=>sw.classList.toggle('on',sw.dataset.col===s.color))
    q('fontVal').textContent=(s.fontSize||10)
    q('fillOpts').querySelectorAll('.mm-chip').forEach(c=>c.classList.toggle('on',c.dataset.fill===s.fill))
    q('shapeOpts').querySelectorAll('.mm-chip').forEach(c=>c.classList.toggle('on',c.dataset.shape===s.shape))
    q('lineOpts').querySelectorAll('.mm-chip').forEach(c=>c.classList.toggle('on',c.dataset.line===s.line)) }

  /* ── menu de contexto ── */
  function hideContext(){ const c=q('context'); c.style.display='none'; c.innerHTML='' }
  function showContext(cx,cy,id){ const m=activeMap(); const n=m.nodes[id]; const c=q('context'); c.innerHTML=''
    const rect=root.getBoundingClientRect()
    const item=(label,fn,danger)=>{ const b=document.createElement('button'); if(danger) b.className='danger'; b.textContent=label; b.addEventListener('click',()=>{ hideContext(); fn() }); c.appendChild(b) }
    const sep=()=>{ const d=document.createElement('div'); d.className='sep'; c.appendChild(d) }
    item('Adicionar filho  (Tab)',()=>addChild(id))
    item('Editar texto  (Enter)',()=>openEditor(id))
    if(n.children.length) item(n.collapsed?'Expandir ramo':'Recolher ramo',()=>toggleCollapse(id))
    if(n.offset){ item('Soltar posição manual',()=>{ pushHistory(); delete n.offset; render(); save() }) }
    if(id!==m.rootId){ sep(); item('Remover  (Del)',()=>requestDelete(id),true) }
    c.style.display='block'; c.style.left=(cx-rect.left)+'px'; c.style.top=(cy-rect.top)+'px'
    requestAnimationFrame(()=>{ const cr=c.getBoundingClientRect(); if(cr.right>rect.right) c.style.left=(cx-rect.left-cr.width)+'px'; if(cr.bottom>rect.bottom) c.style.top=(cy-rect.top-cr.height)+'px' }) }

  /* ── sidebar: pastas, mapas, DnD, checkboxes ── */
  let dragItem=null
  function descendantsOf(fid){ const out=new Set(); (function rec(p){ for(const id in state.folders){ if(state.folders[id].parentId===p){ out.add(id); rec(id) } } })(fid); return out }
  function mapsInFolderDeep(fid){ const set=new Set([fid,...descendantsOf(fid)]); return Object.values(state.maps).filter(mp=>set.has(mp.folderId)) }
  function renderTree(){ const tree=q('tree'); tree.innerHTML=''; renderFolderContents(null,tree)
    tree.ondragover=e=>{ e.preventDefault() }; tree.ondrop=e=>{ e.preventDefault(); handleDrop(null) } }
  function renderFolderContents(parentId,container){
    Object.values(state.folders).filter(f=>f.parentId===parentId).sort((a,b)=>a.name.localeCompare(b.name)).forEach(f=>container.appendChild(folderRow(f)))
    Object.values(state.maps).filter(mp=>mp.folderId===parentId).sort((a,b)=>a.name.localeCompare(b.name)).forEach(mp=>container.appendChild(mapRow(mp))) }
  function folderRow(f){ const open=!!state.ui.expanded[f.id]; const row=document.createElement('div'); row.className='mm-row'+(open?' open':'')
    row.innerHTML=`<span class="twirl">▶</span><span class="ico">📁</span><span class="lbl">${escapeHtml(f.name)}</span><input type="checkbox" class="chk"><span class="mini" data-act="addmap">＋▢</span><span class="mini" data-act="addsub">＋📁</span><span class="mini" data-act="ren">✎</span><span class="mini" data-act="del">🗑</span>`
    row.addEventListener('click',e=>{ if(e.target.closest('.mini')||e.target.closest('.chk')) return; state.ui.expanded[f.id]=!state.ui.expanded[f.id]; save(); renderTree() })
    const chk=row.querySelector('.chk'); const deep=mapsInFolderDeep(f.id); chk.checked=deep.length>0&&deep.every(mp=>state.ui.exportSel[mp.id])
    chk.addEventListener('click',e=>{ e.stopPropagation(); deep.forEach(mp=>state.ui.exportSel[mp.id]=chk.checked); save(); renderTree() })
    row.querySelectorAll('.mini').forEach(b=>b.addEventListener('click',e=>{ e.stopPropagation(); const act=b.dataset.act
      if(act==='addmap') createMap(f.id)
      if(act==='addsub'){ const id=uid(); state.folders[id]={id,name:'Nova pasta',parentId:f.id}; state.ui.expanded[f.id]=true; save(); renderTree() }
      if(act==='ren') inlineRename(row,f.name,v=>{ f.name=v||f.name; save(); renderTree() })
      if(act==='del'){ if(confirm(`Excluir a pasta "${f.name}" e TODO o seu conteúdo?`)) deleteFolder(f.id) } }))
    row.draggable=true
    row.addEventListener('dragstart',e=>{ e.stopPropagation(); dragItem={type:'folder',id:f.id} })
    row.addEventListener('dragover',e=>{ e.preventDefault(); e.stopPropagation(); row.classList.add('drop-target') })
    row.addEventListener('dragleave',()=>row.classList.remove('drop-target'))
    row.addEventListener('drop',e=>{ e.preventDefault(); e.stopPropagation(); row.classList.remove('drop-target'); handleDrop(f.id) })
    const holder=document.createElement('div'); holder.appendChild(row)
    if(open){ const kidsEl=document.createElement('div'); kidsEl.className='mm-children'; renderFolderContents(f.id,kidsEl); holder.appendChild(kidsEl) } return holder }
  function mapRow(mp){ const row=document.createElement('div'); row.className='mm-row'+(mp.id===state.activeMapId?' active':'')
    row.innerHTML=`<span class="twirl" style="visibility:hidden">▶</span><span class="ico">🧠</span><span class="lbl">${escapeHtml(mp.name)}</span><input type="checkbox" class="chk"><span class="mini" data-act="ren">✎</span><span class="mini" data-act="del">🗑</span>`
    row.addEventListener('click',e=>{ if(e.target.closest('.mini')||e.target.closest('.chk')) return; setActive(mp.id) })
    row.addEventListener('dblclick',e=>{ if(e.target.closest('.mini')) return; inlineRename(row,mp.name,v=>{ mp.name=v||mp.name; save(); renderTree(); renderHeader() }) })
    const chk=row.querySelector('.chk'); chk.checked=!!state.ui.exportSel[mp.id]
    chk.addEventListener('click',e=>{ e.stopPropagation(); state.ui.exportSel[mp.id]=chk.checked; save(); renderTree() })
    row.querySelectorAll('.mini').forEach(b=>b.addEventListener('click',e=>{ e.stopPropagation()
      if(b.dataset.act==='ren') inlineRename(row,mp.name,v=>{ mp.name=v||mp.name; save(); renderTree(); renderHeader() })
      if(b.dataset.act==='del'){ if(confirm(`Excluir o mapa "${mp.name}"?`)) deleteMap(mp.id) } }))
    row.draggable=true; row.addEventListener('dragstart',e=>{ e.stopPropagation(); dragItem={type:'map',id:mp.id} }); return row }
  function inlineRename(row,current,done){ const lbl=row.querySelector('.lbl'); const inp=document.createElement('input'); inp.className='rename'; inp.value=current
    lbl.replaceWith(inp); inp.focus(); inp.select(); const fin=()=>done(inp.value.trim())
    inp.addEventListener('keydown',e=>{ if(e.key==='Enter') fin(); if(e.key==='Escape') renderTree() }); inp.addEventListener('blur',fin) }
  function handleDrop(target){ if(!dragItem) return
    if(dragItem.type==='map') state.maps[dragItem.id].folderId=target
    else if(dragItem.type==='folder'){ if(dragItem.id===target) return; if(target&&descendantsOf(dragItem.id).has(target)) return toast('Não dá para mover uma pasta para dentro dela mesma'); state.folders[dragItem.id].parentId=target }
    dragItem=null; save(); renderTree() }
  function deleteFolder(fid){ const all=new Set([fid,...descendantsOf(fid)])
    Object.values(state.maps).forEach(mp=>{ if(all.has(mp.folderId)){ if(mp.id===state.activeMapId) state.activeMapId=null; delete state.maps[mp.id] } })
    all.forEach(id=>delete state.folders[id]); if(!state.activeMapId){ const first=Object.keys(state.maps)[0]; if(first){ setActive(first); return } }
    save(); renderTree(); if(!activeMap()){ showEmpty(true); renderHeader() } }

  /* ── CRUD de mapas + troca de mapa ── */
  function createMap(folderId=null){ const m=uid(),r=uid()
    state.maps[m]={id:m,name:'Novo mapa',folderId,layout:'radial',rootId:r,view:null,nodes:{[r]:{id:r,text:'Ideia central',parentId:null,children:[],style:baseStyle('#4f46e5',12)}}}
    if(folderId) state.ui.expanded[folderId]=true; save(); renderTree(); setActive(m) }
  function deleteMap(id){ delete state.maps[id]; delete state.ui.exportSel[id]
    if(state.activeMapId===id){ const first=Object.keys(state.maps)[0]; state.activeMapId=first||null } save(); renderTree()
    const m=activeMap(); if(m) setActive(m.id); else { showEmpty(true); renderHeader(); world.querySelectorAll('.mm-node,.mm-editor').forEach(e=>e.remove()); elsById={} } }
  function setActive(id){ state.activeMapId=id; selectedSet=[]; editingId=null
    world.querySelectorAll('.mm-node,.mm-editor').forEach(e=>e.remove()); elsById={}
    renderTree(); renderHeader(); const m=activeMap(); if(!m){ showEmpty(true); return } showEmpty(false)
    syncLayoutSeg(); render(); if(m.view) applyTransform(); else { applyTransform(); fit() } save() }
  function renderHeader(){ const m=activeMap(); q('name').textContent=m?m.name:'—'; q('meta').textContent=m?(Object.keys(m.nodes).length+' nós'):'' }
  function showEmpty(v){ q('empty').style.display=v?'flex':'none' }
  function syncLayoutSeg(){ const m=activeMap(); if(!m) return; q('layoutSeg').querySelectorAll('button').forEach(b=>b.classList.toggle('on',b.dataset.layout===m.layout)) }

  /* ── toolbar / sidebar / painel: listeners ── */
  q('layoutSeg').addEventListener('click',e=>{ const b=e.target.closest('[data-layout]'); if(!b) return; const m=activeMap(); if(!m) return; m.layout=b.dataset.layout; syncLayoutSeg(); render(); fit(); save() })
  q('theme').addEventListener('click',()=>{ state.theme=state.theme==='dark'?'light':'dark'; root.setAttribute('data-mm-theme',state.theme); save() })
  q('zoomIn').addEventListener('click',()=>setZoom(view().zoom*1.15))
  q('zoomOut').addEventListener('click',()=>setZoom(view().zoom/1.15))
  q('fit').addEventListener('click',fit)
  q('auto').addEventListener('click',autoArrange)
  q('ham').addEventListener('click',()=>q('sidebar').classList.toggle('collapsed'))
  q('newMap').addEventListener('click',()=>createMap(null))
  q('emptyCreate').addEventListener('click',()=>createMap(null))
  q('newFolder').addEventListener('click',()=>{ const id=uid(); state.folders[id]={id,name:'Nova pasta',parentId:null}; save(); renderTree() })
  q('fillOpts').addEventListener('click',e=>{ const b=e.target.closest('[data-fill]'); if(b) setStyle('fill',b.dataset.fill) })
  q('shapeOpts').addEventListener('click',e=>{ const b=e.target.closest('[data-shape]'); if(b) setStyle('shape',b.dataset.shape) })
  q('lineOpts').addEventListener('click',e=>{ const b=e.target.closest('[data-line]'); if(b) setStyle('line',b.dataset.line) })
  root.querySelector('.mm-font').addEventListener('click',e=>{ const b=e.target.closest('[data-fs]'); if(b) setFont(parseInt(b.dataset.fs,10)) })
  root.addEventListener('pointerdown',e=>{ if(!e.target.closest('.mm-context')) hideContext() },true)

  /* ── teclado (escopado: só enquanto a aba está montada) ── */
  function onKey(e){ const ae=document.activeElement; if(ae&&(ae.tagName==='TEXTAREA'||ae.tagName==='INPUT')) return; if(!root.isConnected||!activeMap()) return
    const sel=primarySelected()
    if(e.key==='Tab'){ e.preventDefault(); if(sel) addChild(sel) }
    else if(e.key==='Enter'){ e.preventDefault(); if(sel) openEditor(sel) }
    else if(e.key==='Delete'||e.key==='Backspace'){ e.preventDefault(); if(sel) requestDelete(sel) }
    else if(e.key.startsWith('Arrow')){ e.preventDefault(); if(sel) navigate(e.key.replace('Arrow','').toLowerCase()); else selectOnly(activeMap().rootId) }
    else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){ e.preventDefault(); undo() } }
  document.addEventListener('keydown',onKey)

  /* ── toast ── */
  let toastTimer=null
  function toast(msg,opts){ const t=q('toast'),btn=q('toastAction'); q('toastMsg').textContent=msg
    if(opts&&opts.action){ btn.style.display=''; btn.textContent=opts.label||'Desfazer'; btn.onclick=()=>{ opts.action(); hideToast() } } else btn.style.display='none'
    t.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(hideToast,4200) }
  function hideToast(){ q('toast').classList.remove('show') }

  /* ── [MÓDULO: EXPORT] ── PDF isolado (jsPDF + html2canvas via CDN sob demanda) ── */
  function loadScript(src){ return new Promise((res,rej)=>{ if([...document.scripts].some(s=>s.src===src)) return res(true); const s=document.createElement('script'); s.src=src; s.onload=()=>res(true); s.onerror=rej; document.head.appendChild(s) }) }
  async function ensureLibs(){ if(!window.html2canvas) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'); if(!(window.jspdf&&window.jspdf.jsPDF)) await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js') }
  async function renderMapToCanvas(mapId){ const m=state.maps[mapId]; const stage=q('exportStage'); stage.innerHTML=''
    const surface=document.createElement('div'); surface.style.position='relative'
    const cs=getComputedStyle(root); const bg=cs.getPropertyValue('--mm-canvas').trim()||'#0a0c14'; const dot=cs.getPropertyValue('--mm-dot').trim()||'rgba(255,255,255,.05)'
    surface.style.background=bg; surface.style.backgroundImage='radial-gradient('+dot+' 1.4px,transparent 1.4px)'; surface.style.backgroundSize='26px 26px'
    surface.className='mm-app'; surface.setAttribute('data-mm-theme',state.theme)   // herda tokens do tema
    const sub=document.createElement('div'); sub.style.position='relative'; surface.appendChild(sub)
    const svg=document.createElementNS(SVGNS,'svg'); svg.setAttribute('class','mm-edges'); svg.style.position='absolute'; svg.style.left='0'; svg.style.top='0'; svg.style.overflow='visible'; sub.appendChild(svg)
    stage.appendChild(surface)
    const els={}; for(const id in m.nodes){ const el=makeNodeEl(m.nodes[id],id===m.rootId); el.style.animation='none'; el.querySelectorAll('.mm-ctl,.mm-resize').forEach(c=>c.remove()); els[id]=el; sub.appendChild(el) }
    const sizes={}; for(const id in els) sizes[id]={w:els[id].offsetWidth,h:els[id].offsetHeight}
    const pos=computeLayout(m,sizes)
    for(const id in els){ if(!pos[id]){ els[id].remove(); delete els[id] } }
    let mnX=Infinity,mnY=Infinity,mxX=-Infinity,mxY=-Infinity
    for(const id in pos){ const p=pos[id],s=sizes[id]; mnX=Math.min(mnX,p.x-s.w/2); mxX=Math.max(mxX,p.x+s.w/2); mnY=Math.min(mnY,p.y-s.h/2); mxY=Math.max(mxY,p.y+s.h/2) }
    const PAD=64,offX=PAD-mnX,offY=PAD-mnY; const W=(mxX-mnX)+PAD*2,H=(mxY-mnY)+PAD*2
    surface.style.width=W+'px'; surface.style.height=H+'px'; sub.style.width=W+'px'; sub.style.height=H+'px'
    const sp={}; for(const id in pos){ sp[id]={x:pos[id].x+offX,y:pos[id].y+offY}; els[id].style.left=sp[id].x+'px'; els[id].style.top=sp[id].y+'px' }
    drawEdges(svg,m,sp,sizes)
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))
    const canvasEl=await window.html2canvas(surface,{backgroundColor:bg,scale:2,logging:false,useCORS:true})
    stage.innerHTML=''; return canvasEl }
  async function exportMapsToPDF(ids,filename){ ids=ids.filter(id=>state.maps[id]); if(!ids.length) return toast('Selecione ao menos um mapa')
    const ov=q('overlay'); ov.classList.add('show')
    try{ await ensureLibs(); const { jsPDF }=window.jspdf; let pdf=null
      for(let i=0;i<ids.length;i++){ q('overlayMsg').textContent=`Renderizando ${i+1} de ${ids.length}…`; const cv=await renderMapToCanvas(ids[i])
        const orient=cv.width>=cv.height?'l':'p'; if(!pdf) pdf=new jsPDF({orientation:orient,unit:'pt',format:'a4'}); else pdf.addPage('a4',orient)
        const pw=pdf.internal.pageSize.getWidth(),ph=pdf.internal.pageSize.getHeight(),M=22; const sc=Math.min((pw-2*M)/cv.width,(ph-2*M)/cv.height)
        const dw=cv.width*sc,dh=cv.height*sc; pdf.addImage(cv.toDataURL('image/png'),'PNG',(pw-dw)/2,(ph-dh)/2,dw,dh,undefined,'FAST') }
      pdf.save((filename||'mapas-mentais')+'.pdf'); toast(ids.length>1?`${ids.length} mapas exportados`:'Mapa exportado')
    }catch(err){ console.error(err); toast('Falha ao gerar PDF') } finally{ ov.classList.remove('show') } }
  q('exportActive').addEventListener('click',()=>{ const m=activeMap(); if(m) exportMapsToPDF([m.id],slug(m.name)); else toast('Nenhum mapa aberto') })
  q('exportSelected').addEventListener('click',()=>{ const ids=Object.keys(state.ui.exportSel).filter(id=>state.ui.exportSel[id]&&state.maps[id]); exportMapsToPDF(ids.length?ids:(activeMap()?[activeMap().id]:[]),'mapas-mentais') })

  /* ── init ── */
  root.setAttribute('data-mm-theme',state.theme||'dark')
  buildPaletteTabs(); renderSwatches(); renderTree(); renderHeader()
  const m0=activeMap(); if(m0){ syncLayoutSeg(); render(); applyTransform(); if(!m0.view) fit() } else showEmpty(true)

  /* cleanup (chamado no unmount React) */
  return function cleanup(){ document.removeEventListener('keydown',onKey); clearTimeout(_t); clearTimeout(toastTimer); root.innerHTML='' }
}

/* ─────────────────────────── Componente React ─────────────────────────── */
export default function MapaMental(){
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // injeta o CSS uma única vez
    if(!document.getElementById('mm-styles')){
      const st = document.createElement('style'); st.id='mm-styles'; st.textContent = MM_CSS; document.head.appendChild(st)
    }
    const el = ref.current
    if(!el) return
    const cleanup = mountMapaMental(el)
    return cleanup
  }, [])
  return <div ref={ref} className="mm-app" />
}
