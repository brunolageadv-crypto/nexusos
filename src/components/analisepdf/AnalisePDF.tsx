// @ts-nocheck
/* ════════════════════════════════════════════════════════════════════
   NEXUS · ABA "ANÁLISE DE PDF"
   --------------------------------------------------------------------
   • Coloque este arquivo em: src/components/analisepdf/AnalisePDF.tsx
   • Wire no App.tsx (3 linhas — ver instruções na entrega).
   • Sem dependências novas no package.json: PDF.js, jsPDF e html2canvas
     são carregados sob demanda via CDN (mesmos CDNs já usados no
     MapaMental).
   • @ts-nocheck mantém o motor imperativo (PDF.js / contentEditable)
     fora do type-check estrito do projeto.

   ARQUITETURA
     ┌──────────────────────────────────────────────┬───────────────┐
     │  VISUALIZADOR DE PDF (topo)                   │   ÁRVORE      │
     │  · marcação (highlight / sublinhado)          │   pastas /    │
     │  · zoom · ajustar largura/página              │   subpastas   │
     │  · busca interna (Ctrl+F)                     │   + anotações │
     │  · índice lateral (outline do PDF)            │   (Firestore) │
     ├──────────────────────────────────────────────┤               │
     │  EDITOR DE ANOTAÇÕES (rodapé)                 │               │
     │  · rich text · listas · toggle (active recall)│               │
     │  · exportar PDF                               │               │
     └──────────────────────────────────────────────┴───────────────┘

   PERSISTÊNCIA (Firestore)
     · users/{uid}/pdfFolders/{id}  -> { id, name, parentId }
     · users/{uid}/pdfNotes/{id}    -> { id, folderId, title, html, ... }
     · O PDF NUNCA é salvo (economia de armazenamento). Apenas as
       anotações do editor inferior são persistidas. As marcações sobre
       o PDF vivem somente na sessão atual.
   ════════════════════════════════════════════════════════════════════ */
import { useEffect, useRef, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { collection, doc, onSnapshot, setDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useUid } from '../../hooks/useUid'

/* remove chaves undefined antes de gravar no Firestore (padrão Nexus) */
function clean<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as T
}
const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)

/* ─────────────── carregadores de libs externas (CDN sob demanda) ─────────────── */
const CDN_BASES = [
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174',
  'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build',
  'https://unpkg.com/pdfjs-dist@3.11.174/build',
]
const CDN = {
  jspdf:  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  h2c:    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
}
function loadScript(src: string) {
  return new Promise<void>((res, rej) => {
    if ([...document.scripts].some(s => s.src === src)) return res()
    const s = document.createElement('script'); s.src = src; s.async = true
    s.onload = () => res(); s.onerror = () => rej(new Error('Falha ao carregar ' + src))
    document.head.appendChild(s)
  })
}
async function ensurePdfjs() {
  if (!(window as any).pdfjsLib) {
    let ok = false, lastErr: any
    for (const base of CDN_BASES) {                       // tenta CDNs em ordem (resiliência)
      try { await loadScript(base + '/pdf.min.js'); if ((window as any).pdfjsLib) { (window as any).__pdfBase = base; ok = true; break } }
      catch (e) { lastErr = e }
    }
    if (!ok) throw lastErr || new Error('Não foi possível carregar o leitor de PDF (CDN).')
  }
  const lib = (window as any).pdfjsLib
  const base = (window as any).__pdfBase || CDN_BASES[0]
  try { if (lib && lib.GlobalWorkerOptions && !lib.GlobalWorkerOptions.workerSrc) lib.GlobalWorkerOptions.workerSrc = base + '/pdf.worker.min.js' } catch { }
  return lib
}
async function ensureExportLibs() {
  if (!(window as any).html2canvas) await loadScript(CDN.h2c)
  if (!((window as any).jspdf && (window as any).jspdf.jsPDF)) await loadScript(CDN.jspdf)
}

/* ─────────────────────────── CSS escopado (.pdfa-app) ─────────────────────────── */
const PDFA_CSS = `
.pdfa-app{
  --pa-accent: var(--accent, #1A73E8);
  --pa-bg: var(--bg-1, #f6f7fa);
  --pa-panel: var(--card-bg, #fff);
  --pa-border: var(--border, #e8eaed);
  --pa-border-md: var(--border-md, #dadce0);
  --pa-text: var(--text-primary, #202124);
  --pa-dim: var(--text-muted, #5f6368);
  --pa-faint: var(--text-subtle, #9aa0a6);
  --pa-hover: var(--bg-hover, #f1f3f4);
  --pa-shadow: var(--shadow-lg, 0 4px 16px rgba(60,64,67,.14));
  --pa-radius: 12px;
  position:relative; width:100%; height:100%; min-height:84vh;
  display:flex; gap:10px; font-family:var(--font-body,'Inter',sans-serif);
  color:var(--pa-text); background:transparent;
}
.pdfa-app *{ box-sizing:border-box }

/* coluna principal (PDF + editor) */
.pdfa-main{ flex:1; min-width:0; display:flex; flex-direction:column; gap:10px; }

/* ───── barra de ferramentas geral ───── */
.pdfa-bar{ display:flex; align-items:center; gap:8px; flex-wrap:wrap;
  background:var(--pa-panel); border:1px solid var(--pa-border); border-radius:var(--pa-radius);
  padding:8px 10px; box-shadow:var(--shadow-sm,0 1px 3px rgba(60,64,67,.1)); }
.pdfa-bar .sep{ width:1px; height:22px; background:var(--pa-border); margin:0 2px; }
.pdfa-bar .grow{ flex:1 }
.pdfa-btn{ display:inline-flex; align-items:center; gap:6px; cursor:pointer;
  border:1px solid var(--pa-border); background:transparent; color:var(--pa-dim);
  font:inherit; font-size:.78rem; font-weight:600; padding:7px 11px; border-radius:9px;
  transition:.15s; white-space:nowrap; }
.pdfa-btn:hover{ background:var(--pa-hover); color:var(--pa-text); border-color:var(--pa-border-md); }
.pdfa-btn.on{ background:var(--pa-accent); color:#fff; border-color:transparent; }
.pdfa-btn.primary{ background:var(--pa-accent); color:#fff; border-color:transparent; }
.pdfa-btn.primary:hover{ filter:brightness(1.06); color:#fff; }
.pdfa-btn.icon{ padding:7px 9px; }
.pdfa-btn[disabled]{ opacity:.4; cursor:not-allowed; }
.pdfa-title{ font-family:var(--font-display,'DM Sans',sans-serif); font-weight:800;
  font-size:.95rem; letter-spacing:-.01em; display:flex; align-items:center; gap:8px; }
.pdfa-zoom-val{ font-family:var(--font-mono,monospace); font-size:.72rem; color:var(--pa-faint);
  min-width:42px; text-align:center; }

/* swatches de cor de marcação */
.pdfa-swatch{ width:20px; height:20px; border-radius:6px; cursor:pointer; border:2px solid transparent;
  transition:.12s; }
.pdfa-swatch:hover{ transform:scale(1.12); }
.pdfa-swatch.on{ border-color:var(--pa-text); box-shadow:0 0 0 2px var(--pa-panel) inset; }

/* campo de busca */
.pdfa-search{ display:flex; align-items:center; gap:6px; background:var(--input-bg,#fff);
  border:1px solid var(--pa-border-md); border-radius:9px; padding:4px 6px 4px 10px; }
.pdfa-search input{ border:0; background:transparent; color:var(--pa-text); font:inherit;
  font-size:.8rem; outline:none; width:190px; }
.pdfa-search .cnt{ font-family:var(--font-mono,monospace); font-size:.68rem; color:var(--pa-faint);
  white-space:nowrap; }
.pdfa-search button{ border:0; background:transparent; cursor:pointer; color:var(--pa-dim);
  padding:3px 5px; border-radius:6px; font-size:.78rem; }
.pdfa-search button:hover{ background:var(--pa-hover); color:var(--pa-text); }

/* ───── área central com índice + visualizador ───── */
.pdfa-viewer-wrap{ flex:1; min-height:0; display:flex; gap:10px; }
.pdfa-viewer-wrap.collapsed{ display:none; }

/* índice lateral (outline) */
.pdfa-outline{ width:230px; flex-shrink:0; background:var(--pa-panel); border:1px solid var(--pa-border);
  border-radius:var(--pa-radius); display:flex; flex-direction:column; overflow:hidden;
  transition:margin-left .26s cubic-bezier(.4,.16,.2,1); }
.pdfa-outline.hide{ margin-left:calc(-240px - 10px); }
.pdfa-outline h4{ margin:0; padding:11px 13px; font-size:.7rem; font-weight:800; letter-spacing:.06em;
  text-transform:uppercase; color:var(--pa-faint); border-bottom:1px solid var(--pa-border);
  display:flex; align-items:center; justify-content:space-between; }
.pdfa-outline-list{ flex:1; overflow-y:auto; padding:6px; }
.pdfa-out-item{ display:flex; align-items:center; gap:6px; padding:6px 8px; border-radius:8px;
  cursor:pointer; font-size:.78rem; color:var(--pa-dim); line-height:1.3; }
.pdfa-out-item:hover{ background:var(--pa-hover); color:var(--pa-text); }
.pdfa-out-item .tw{ width:12px; flex-shrink:0; font-size:.6rem; color:var(--pa-faint);
  transition:transform .2s; }
.pdfa-out-item.open > .tw{ transform:rotate(90deg); }
.pdfa-out-item .lbl{ flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.pdfa-out-children{ margin-left:12px; border-left:1px solid var(--pa-border); padding-left:3px; }
.pdfa-out-empty{ padding:18px 14px; font-size:.76rem; color:var(--pa-faint); text-align:center; }

/* navegador de páginas (miniaturas / números) */
.pdfa-thumbtabs{ display:flex; gap:3px; }
.pdfa-thumbtabs button{ width:24px; height:22px; border:1px solid var(--pa-border); background:transparent;
  color:var(--pa-dim); border-radius:6px; cursor:pointer; font-size:.72rem; display:flex; align-items:center;
  justify-content:center; padding:0; }
.pdfa-thumbtabs button.on{ background:var(--pa-accent); color:#fff; border-color:transparent; }
.pdfa-thumbs{ display:flex; flex-direction:column; align-items:center; gap:9px; padding:4px 2px; }
.pdfa-thumb{ width:100%; max-width:165px; cursor:pointer; border-radius:9px; padding:5px; border:1px solid transparent;
  transition:.12s; display:flex; flex-direction:column; align-items:center; gap:3px; }
.pdfa-thumb:hover{ background:var(--pa-hover); }
.pdfa-thumb.on{ border-color:var(--pa-accent); background:var(--pa-hover); }
.pdfa-thumb .thumb-canvas{ width:100%; background:#fff; border:1px solid var(--pa-border); border-radius:3px;
  overflow:hidden; box-shadow:0 1px 4px rgba(0,0,0,.12); display:flex; }
.pdfa-thumb canvas{ width:100%; height:auto; display:block; }
.pdfa-thumb .thumb-n{ font:600 .64rem var(--font-mono,monospace); color:var(--pa-faint); }
.pdfa-thumb.on .thumb-n{ color:var(--pa-accent); }
.pdfa-pagenums{ display:grid; grid-template-columns:repeat(auto-fill, minmax(38px,1fr)); gap:5px; padding:4px; }
.pdfa-pn{ height:32px; border:1px solid var(--pa-border); background:transparent; color:var(--pa-dim);
  border-radius:7px; cursor:pointer; font:600 .76rem var(--font-mono,monospace); transition:.12s; }
.pdfa-pn:hover{ background:var(--pa-hover); color:var(--pa-text); }
.pdfa-pn.on{ background:var(--pa-accent); color:#fff; border-color:transparent; }

/* visualizador (scroll de páginas) */
.pdfa-viewer{ flex:1; min-width:0; background:var(--pa-bg); border:1px solid var(--pa-border);
  border-radius:var(--pa-radius); overflow:auto; position:relative; }
.pdfa-pages{ display:flex; flex-direction:column; align-items:center; gap:16px; padding:18px; }
.pdfa-page{ position:relative; background:#fff; box-shadow:var(--pa-shadow); border-radius:2px;
  flex-shrink:0; }
.pdfa-page canvas{ display:block; border-radius:2px; }
.pdfa-page .num{ position:absolute; top:6px; right:8px; font:600 .6rem var(--font-mono,monospace);
  color:rgba(0,0,0,.32); background:rgba(255,255,255,.7); padding:1px 6px; border-radius:6px;
  pointer-events:none; z-index:4; }

/* camada de texto (seleção / busca) */
.pdfa-textlayer{ position:absolute; inset:0; overflow:hidden; line-height:1; z-index:2;
  opacity:1; -webkit-user-select:text; user-select:text; }
.pdfa-textlayer > span{ position:absolute; color:transparent; white-space:pre; cursor:text;
  transform-origin:0 0; }
.pdfa-textlayer ::selection{ background:rgba(26,115,232,.32); }
.pdfa-textlayer .pa-hit{ background:rgba(253,214,99,.55); border-radius:2px; color:transparent; }
.pdfa-textlayer .pa-hit.cur{ background:rgba(242,139,130,.75); box-shadow:0 0 0 1px rgba(242,139,130,.9); }

/* camada de marcações (highlight/underline — sessão) */
.pdfa-marklayer{ position:absolute; inset:0; z-index:1; pointer-events:none; }
.pdfa-marklayer .mk{ position:absolute; border-radius:2px; }

/* estado vazio do visualizador */
.pdfa-empty{ flex:1; display:flex; flex-direction:column; align-items:center; justify-content:center;
  gap:14px; color:var(--pa-faint); text-align:center; padding:40px; }
.pdfa-empty .big{ font-size:2.6rem; opacity:.55; }
.pdfa-empty b{ color:var(--pa-text); font-size:1.02rem; font-weight:700;
  font-family:var(--font-display,'DM Sans',sans-serif); }
.pdfa-empty span{ font-size:.84rem; max-width:340px; line-height:1.5; }

/* divisor arrastável */
.pdfa-divider{ height:8px; flex-shrink:0; cursor:row-resize; display:flex; align-items:center;
  justify-content:center; }
.pdfa-divider::before{ content:''; width:46px; height:4px; border-radius:4px; background:var(--pa-border-md);
  transition:.15s; }
.pdfa-divider:hover::before{ background:var(--pa-accent); width:70px; }

/* ───── editor inferior ───── */
.pdfa-editor-box{ display:flex; flex-direction:column; background:var(--pa-panel);
  border:1px solid var(--pa-border); border-radius:var(--pa-radius); overflow:hidden;
  box-shadow:var(--shadow-sm,0 1px 3px rgba(60,64,67,.1)); min-height:0; }
.pdfa-editor-box.fullnote{ flex:1; }
.pdfa-etoolbar{ display:flex; align-items:center; gap:4px; flex-wrap:wrap; padding:7px 9px;
  border-bottom:1px solid var(--pa-border); background:var(--pa-panel); }
.pdfa-etoolbar .sep{ width:1px; height:20px; background:var(--pa-border); margin:0 3px; }
.pdfa-tbtn{ min-width:30px; height:30px; padding:0 8px; border:1px solid transparent; background:transparent;
  border-radius:8px; cursor:pointer; color:var(--pa-dim); font-size:.84rem; font-weight:700;
  display:inline-flex; align-items:center; justify-content:center; gap:5px; transition:.13s; }
.pdfa-tbtn:hover{ background:var(--pa-hover); color:var(--pa-text); }
.pdfa-tbtn.wide{ font-size:.74rem; font-weight:600; }
.pdfa-note-title{ flex:1; min-width:120px; border:0; background:transparent; outline:none;
  font:700 .92rem var(--font-display,'DM Sans',sans-serif); color:var(--pa-text); padding:0 6px; }
.pdfa-save-state{ font-size:.68rem; color:var(--pa-faint); font-family:var(--font-mono,monospace);
  white-space:nowrap; }

.pdfa-editor{ flex:1; min-height:120px; overflow-y:auto; padding:18px 22px; outline:none;
  font-size:.92rem; line-height:1.65; color:var(--pa-text); }
.pdfa-editor:empty::before{ content:attr(data-ph); color:var(--pa-faint); }
.pdfa-editor h2{ font-family:var(--font-display,'DM Sans',sans-serif); font-size:1.25rem;
  font-weight:800; margin:.9em 0 .35em; }
.pdfa-editor h3{ font-family:var(--font-display,'DM Sans',sans-serif); font-size:1.05rem;
  font-weight:700; margin:.8em 0 .3em; }
.pdfa-editor p{ margin:.4em 0; }
.pdfa-editor ul,.pdfa-editor ol{ margin:.4em 0; padding-left:1.6em; }
.pdfa-editor li{ margin:.18em 0; }
.pdfa-editor blockquote{ margin:.6em 0; padding:.3em 1em; border-left:3px solid var(--pa-accent);
  color:var(--pa-dim); background:var(--surface,rgba(26,115,232,.05)); border-radius:0 8px 8px 0; }
.pdfa-editor a{ color:var(--pa-accent); }
.pdfa-editor hr{ border:0; border-top:1px solid var(--pa-border); margin:1em 0; }

/* toggle list (active recall) */
.pdfa-editor details.pa-toggle{ margin:.5em 0; border:1px solid var(--pa-border-md); border-radius:10px;
  background:var(--pa-bg); overflow:hidden; }
.pdfa-editor details.pa-toggle > summary{ cursor:pointer; padding:9px 12px 9px 30px; position:relative;
  font-weight:600; color:var(--pa-text); list-style:none; user-select:none; }
.pdfa-editor details.pa-toggle > summary::-webkit-details-marker{ display:none; }
.pdfa-editor details.pa-toggle > summary::before{ content:'▸'; position:absolute; left:11px; top:9px;
  color:var(--pa-accent); transition:transform .18s; font-size:.85em; }
.pdfa-editor details.pa-toggle[open] > summary::before{ transform:rotate(90deg); }
.pdfa-editor details.pa-toggle > summary::after{ content:'resposta oculta'; position:absolute; right:12px;
  top:10px; font:600 .62rem var(--font-mono,monospace); color:var(--pa-faint); letter-spacing:.04em;
  text-transform:uppercase; opacity:.8; }
.pdfa-editor details.pa-toggle[open] > summary::after{ content:''; }
.pdfa-editor details.pa-toggle > .pa-toggle-body{ padding:4px 14px 12px 30px; border-top:1px solid var(--pa-border);
  color:var(--pa-text); }
.pdfa-editor mark{ background:rgba(253,214,99,.6); border-radius:3px; padding:0 2px; color:inherit; }

/* ───── árvore (coluna direita) — espelha o Mapa Mental ───── */
.pdfa-side{ width:262px; flex-shrink:0; background:var(--pa-panel); border:1px solid var(--pa-border);
  border-radius:var(--pa-radius); display:flex; flex-direction:column; overflow:hidden;
  transition:margin-right .26s cubic-bezier(.4,.16,.2,1); box-shadow:var(--shadow-sm,0 1px 3px rgba(60,64,67,.1)); }
.pdfa-side.hide{ margin-right:calc(-272px - 10px); }
.pdfa-side-head{ padding:13px 14px; border-bottom:1px solid var(--pa-border); }
.pdfa-side-head .ttl{ font:800 .82rem var(--font-display,'DM Sans',sans-serif); display:flex;
  align-items:center; gap:7px; }
.pdfa-side-head .sub{ font-size:.66rem; color:var(--pa-faint); margin-top:2px; }
.pdfa-side-actions{ display:flex; gap:7px; margin-top:11px; }
.pdfa-side-actions .pdfa-btn{ flex:1; justify-content:center; padding:7px; font-size:.72rem; }
.pdfa-tree{ flex:1; overflow-y:auto; padding:8px 7px 16px; }
.pdfa-row{ display:flex; align-items:center; gap:6px; padding:6px 7px; border-radius:8px; cursor:pointer;
  font-size:.8rem; color:var(--pa-dim); user-select:none; transition:background .15s,color .15s; }
.pdfa-row:hover{ background:var(--pa-hover); color:var(--pa-text); }
.pdfa-row.active{ background:var(--surface,rgba(26,115,232,.08)); color:var(--pa-text); font-weight:600; }
.pdfa-row.drop-target{ outline:2px dashed var(--pa-accent); outline-offset:-2px; }
.pdfa-row .tw{ width:13px; flex-shrink:0; text-align:center; font-size:.62rem; color:var(--pa-faint);
  transition:transform .2s; }
.pdfa-row.open > .tw{ transform:rotate(90deg); }
.pdfa-row .ico{ width:16px; flex-shrink:0; text-align:center; opacity:.9; }
.pdfa-row .lbl{ flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.pdfa-row .mini{ opacity:0; font-size:.72rem; padding:2px 4px; border-radius:6px; color:var(--pa-faint);
  transition:.13s; }
.pdfa-row:hover .mini{ opacity:1; } .pdfa-row .mini:hover{ background:var(--pa-border-md); color:var(--pa-text); }
.pdfa-row input.rename{ flex:1; background:var(--input-bg,#fff); border:1px solid var(--pa-accent);
  color:var(--pa-text); border-radius:6px; padding:2px 6px; font:inherit; font-size:.8rem; outline:none; }
.pdfa-children{ margin-left:13px; border-left:1px solid var(--pa-border); padding-left:4px; }
.pdfa-tree-empty{ padding:20px 12px; font-size:.76rem; color:var(--pa-faint); text-align:center; line-height:1.5; }

/* overlay de progresso (exportação) */
.pdfa-overlay{ position:absolute; inset:0; background:rgba(0,0,0,.45); display:none; align-items:center;
  justify-content:center; z-index:50; backdrop-filter:blur(2px); border-radius:var(--pa-radius); }
.pdfa-overlay.show{ display:flex; }
.pdfa-overlay .card{ background:var(--pa-panel); color:var(--pa-text); padding:18px 26px; border-radius:12px;
  box-shadow:var(--pa-shadow); font-size:.86rem; font-weight:600; display:flex; align-items:center; gap:12px; }
.pdfa-spin{ width:18px; height:18px; border:2.5px solid var(--pa-border); border-top-color:var(--pa-accent);
  border-radius:50%; animation:pdfaSpin .8s linear infinite; }
@keyframes pdfaSpin{ to{ transform:rotate(360deg) } }

/* toast */
.pdfa-toast{ position:absolute; bottom:18px; left:50%; transform:translateX(-50%) translateY(20px);
  background:var(--pa-text); color:var(--pa-panel); padding:10px 16px; border-radius:10px; font-size:.8rem;
  font-weight:600; box-shadow:var(--pa-shadow); opacity:0; pointer-events:none; transition:.25s; z-index:60; }
.pdfa-toast.show{ opacity:1; transform:translateX(-50%) translateY(0); }

/* ════════════════════ MAPA MENTAL TEXTUAL ════════════════════ */
/* paleta por tipo de nó (semântica; legível em claro/escuro) */
.pdfa-app{
  --mm-topico:#1F3864; --mm-subtopico:#2E5AAC; --mm-conceito:#0F766E;
  --mm-definicao:#9333EA; --mm-caracteristica:#0EA5E9; --mm-requisito:#B45309;
  --mm-excecao:#DC2626; --mm-exemplo:#16A34A; --mm-jurisprudencia:#7C3AED;
  --mm-fundamento:#9C5700; --mm-prazo:#DB2777; --mm-nota:#5f6368;
}
/* cursor de captura no visualizador */
.pdfa-viewer.capturing{ cursor:crosshair; }
.pdfa-viewer.capturing .pdfa-textlayer{ -webkit-user-select:none; user-select:none; }
.pdfa-viewer.capturing .pdfa-textlayer > span{ cursor:crosshair; }

/* retângulo de seleção (marquee) */
.pdfa-mm-marquee{ position:fixed; z-index:4980; pointer-events:none; border:1.5px solid var(--pa-accent);
  background:rgba(26,115,232,.16); border-radius:3px; box-shadow:0 0 0 1px rgba(255,255,255,.5) inset; }

/* cabeçalho da árvore (toggle de captura, raiz ativa) */
.pdfa-mm-head{ display:flex; align-items:center; gap:8px; flex-wrap:wrap;
  padding:8px 10px; border-bottom:1px solid var(--pa-border); }
.pdfa-mm-head .grow{ flex:1 }
.pdfa-mm-active{ font-size:.72rem; color:var(--pa-dim); display:flex; align-items:center; gap:6px;
  background:var(--pa-hover); border:1px solid var(--pa-border); border-radius:8px; padding:4px 9px; max-width:300px; }
.pdfa-mm-active b{ color:var(--pa-text); font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

/* lista da árvore */
.pdfa-mm-tree{ flex:1; min-height:0; overflow:auto; padding:8px 6px 14px; }
.pdfa-mm-empty{ display:flex; flex-direction:column; align-items:center; justify-content:center; gap:8px;
  height:100%; color:var(--pa-faint); text-align:center; padding:20px; }
.pdfa-mm-row{ display:flex; align-items:center; gap:7px; padding:5px 8px; border-radius:9px; cursor:pointer;
  transition:background .12s; border:1px solid transparent; }
.pdfa-mm-row:hover{ background:var(--pa-hover); }
.pdfa-mm-row.active{ background:var(--pa-hover); border-color:var(--pa-border-md); }
.pdfa-mm-row.active .pdfa-mm-txt{ font-weight:700; }
.pdfa-mm-badge{ flex:none; min-width:20px; height:18px; padding:0 5px; border-radius:5px; color:#fff;
  font-size:.62rem; font-weight:800; display:inline-flex; align-items:center; justify-content:center; letter-spacing:.02em; }
.pdfa-mm-txt{ flex:1; min-width:0; font-size:.82rem; color:var(--pa-text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.pdfa-mm-pg{ flex:none; font-size:.62rem; color:var(--pa-faint); background:var(--pa-hover);
  border-radius:5px; padding:1px 5px; cursor:pointer; }
.pdfa-mm-pg:hover{ color:var(--pa-accent); }
.pdfa-mm-x{ flex:none; width:20px; height:20px; border:none; background:transparent; color:var(--pa-faint);
  border-radius:6px; cursor:pointer; font-size:.85rem; opacity:0; transition:.12s; }
.pdfa-mm-row:hover .pdfa-mm-x{ opacity:1; }
.pdfa-mm-x:hover{ background:var(--mm-excecao); color:#fff; }
.pdfa-mm-fold{ flex:none; width:16px; text-align:center; color:var(--pa-faint); cursor:pointer; user-select:none; font-size:.7rem; }
.pdfa-mm-rename{ flex:1; min-width:0; font:inherit; font-size:.82rem; border:1px solid var(--pa-accent);
  background:var(--pa-panel); color:var(--pa-text); border-radius:6px; padding:2px 6px; outline:none; }

/* arraste para re-aninhar/reordenar */
.pdfa-mm-row.dragging{ opacity:.45; }
.pdfa-mm-row.drop-into{ background:var(--accent-bg,rgba(26,115,232,.08)); border-color:var(--pa-accent); box-shadow:inset 0 0 0 1px var(--pa-accent); }
.pdfa-mm-row.drop-before{ box-shadow:inset 0 2px 0 0 var(--pa-accent); }
.pdfa-mm-row.drop-after{ box-shadow:inset 0 -2px 0 0 var(--pa-accent); }

/* toolbar da árvore (busca + desfazer/refazer) */
.pdfa-mm-bar{ display:flex; align-items:center; gap:6px; padding:6px 10px; border-bottom:1px solid var(--pa-border); }
.pdfa-mm-bar .find{ flex:1; display:flex; align-items:center; gap:5px; background:var(--pa-hover);
  border:1px solid var(--pa-border); border-radius:8px; padding:3px 8px; }
.pdfa-mm-bar .find input{ flex:1; border:none; background:transparent; outline:none; font:inherit; font-size:.76rem; color:var(--pa-text); }

/* menu de contexto do nó */
.pdfa-mm-ctx{ position:fixed; z-index:5010; background:var(--pa-panel); border:1px solid var(--pa-border-md);
  border-radius:10px; box-shadow:var(--pa-shadow); padding:5px; min-width:178px; }
.pdfa-mm-ctx button{ display:flex; align-items:center; gap:8px; width:100%; border:none; background:transparent;
  color:var(--pa-text); font:inherit; font-size:.76rem; text-align:left; padding:7px 9px; border-radius:7px; cursor:pointer; }
.pdfa-mm-ctx button:hover{ background:var(--pa-hover); }
.pdfa-mm-ctx .div{ height:1px; background:var(--pa-border); margin:4px 2px; }
.pdfa-mm-ctx .types{ display:grid; grid-template-columns:1fr 1fr; gap:3px; padding:4px; }
.pdfa-mm-ctx .types button{ padding:5px 7px; font-size:.72rem; }
.pdfa-mm-ctx .types .dot{ width:10px; height:10px; border-radius:3px; flex:none; }
.pdfa-mm-ctx .ttl{ font-size:.64rem; color:var(--pa-faint); font-weight:700; text-transform:uppercase; letter-spacing:.04em; padding:4px 9px 2px; }

/* menu de classificação (popup junto ao cursor) */
.pdfa-mm-menu{ position:fixed; z-index:5000; background:var(--pa-panel); border:1px solid var(--pa-border-md);
  border-radius:12px; box-shadow:var(--pa-shadow); padding:10px; width:300px; max-width:92vw; }
.pdfa-mm-menu .cap{ font-size:.74rem; color:var(--pa-text); background:var(--pa-hover); border-radius:8px;
  padding:7px 9px; margin-bottom:8px; max-height:64px; overflow:auto; line-height:1.35; }
.pdfa-mm-menu .cap b{ color:var(--pa-accent); }
.pdfa-mm-menu .tgt{ font-size:.68rem; color:var(--pa-dim); margin-bottom:8px; }
.pdfa-mm-menu .tgt b{ color:var(--pa-text); }
.pdfa-mm-grid{ display:grid; grid-template-columns:1fr 1fr; gap:5px; }
.pdfa-mm-opt{ display:flex; align-items:center; gap:7px; border:1px solid var(--pa-border); background:transparent;
  border-radius:8px; padding:6px 8px; cursor:pointer; font:inherit; font-size:.74rem; color:var(--pa-text); text-align:left;
  transition:.12s; }
.pdfa-mm-opt:hover{ background:var(--pa-hover); border-color:var(--pa-border-md); }
.pdfa-mm-opt .dot{ flex:none; width:11px; height:11px; border-radius:3px; }
.pdfa-mm-menu .foot{ display:flex; gap:6px; margin-top:9px; }
.pdfa-mm-menu .foot button{ flex:1; border:1px solid var(--pa-border); background:transparent; color:var(--pa-dim);
  border-radius:8px; padding:6px; cursor:pointer; font:inherit; font-size:.72rem; font-weight:600; }
.pdfa-mm-menu .foot button:hover{ background:var(--pa-hover); }

/* responsivo: some com colunas auxiliares em telas estreitas */
@media (max-width:1080px){
  .pdfa-side{ display:none; } .pdfa-outline{ display:none; }
}
`

/* ───────────────────────────── helpers de UI ───────────────────────────── */
function escapeHtml(s = '') {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

/* ───────────────────────── MAPA MENTAL: tipos de nó ───────────────────────── */
/* cada tipo → cor (var CSS), rótulo e sigla (badge) */
const MM_TIPOS = [
  { key: 'topico',        label: 'Tópico',          sigla: 'T',  cor: 'var(--mm-topico)' },
  { key: 'subtopico',     label: 'Subtópico',       sigla: 'S',  cor: 'var(--mm-subtopico)' },
  { key: 'conceito',      label: 'Conceito',        sigla: 'C',  cor: 'var(--mm-conceito)' },
  { key: 'definicao',     label: 'Definição',       sigla: 'D',  cor: 'var(--mm-definicao)' },
  { key: 'caracteristica',label: 'Característica',   sigla: 'Ca', cor: 'var(--mm-caracteristica)' },
  { key: 'requisito',     label: 'Requisito',       sigla: 'R',  cor: 'var(--mm-requisito)' },
  { key: 'excecao',       label: 'Exceção',         sigla: 'Ex', cor: 'var(--mm-excecao)' },
  { key: 'exemplo',       label: 'Exemplo',         sigla: 'E',  cor: 'var(--mm-exemplo)' },
  { key: 'jurisprudencia',label: 'Jurisprudência',  sigla: 'J',  cor: 'var(--mm-jurisprudencia)' },
  { key: 'fundamento',    label: 'Fundamento legal',sigla: 'F',  cor: 'var(--mm-fundamento)' },
  { key: 'prazo',         label: 'Prazo',           sigla: 'P',  cor: 'var(--mm-prazo)' },
  { key: 'nota',          label: 'Nota',            sigla: 'N',  cor: 'var(--mm-nota)' },
] as const
const MM_TIPO = Object.fromEntries(MM_TIPOS.map(t => [t.key, t]))

/* normaliza texto capturado do PDF: tira hifenização de quebra, colapsa espaços */
function mmNormalize(raw: string): string {
  if (!raw) return ''
  let s = raw.replace(/\r/g, '')
  // remove hifenização de quebra de linha:  consti-\ntuição -> constituição
  s = s.replace(/([A-Za-zÀ-ÿ])-\s*\n\s*([a-zà-ÿ])/g, '$1$2')
  // quebras de linha viram espaço, colapsa múltiplos espaços
  s = s.replace(/\s*\n\s*/g, ' ').replace(/[ \t]{2,}/g, ' ').trim()
  return s
}

/* ───────────────────────── MAPA MENTAL: exportadores ───────────────────────── */
type MmNode = any
const mmChildrenOf = (nodes: MmNode[], pid: string | null) => nodes.filter(n => n.paiId === pid).sort((a, b) => a.ordem - b.ordem)
const mmRoots = (nodes: MmNode[]) => mmChildrenOf(nodes, null)

/* rótulo "inteligente" de um nó, conforme o tipo */
function mmLabel(n: MmNode, opts: { incluirPaginas?: boolean } = {}): string {
  const t = (n.texto || '').trim()
  let out = t
  const ctx = n.contexto && n.contexto.trim() && n.contexto.trim() !== t ? n.contexto.trim() : ''
  switch (n.tipo) {
    case 'conceito':
    case 'definicao':
      out = ctx ? `${t}: ${ctx}` : t; break
    case 'jurisprudencia':
      out = `“${t}”`; break
    case 'fundamento':
      out = `Fundamento: ${t}`; break
    case 'prazo':
      out = `Prazo: ${t}`; break
    default:
      out = t
  }
  if (opts.incluirPaginas && n.pagina) out += ` (p. ${n.pagina})`
  return out
}

/* 1) Markdown hierárquico — headings p/ tópico/subtópico, bullets p/ o resto */
function mmExportMarkdown(nodes: MmNode[], opts: any = {}): string {
  const L: string[] = []
  const walk = (pid: string | null, depth: number) => {
    for (const n of mmChildrenOf(nodes, pid)) {
      if (n.tipo === 'topico' || n.tipo === 'subtopico') {
        L.push('#'.repeat(Math.min(depth + 1, 6)) + ' ' + mmLabel(n, opts))
      } else {
        L.push('  '.repeat(Math.max(0, depth)) + '- ' + mmLabel(n, opts))
      }
      walk(n.id, depth + 1)
    }
  }
  walk(null, 0)
  return L.join('\n')
}

/* 2) Markdown com badges de tipo */
function mmExportMarkdownBadges(nodes: MmNode[], opts: any = {}): string {
  const L: string[] = []
  const walk = (pid: string | null, depth: number) => {
    for (const n of mmChildrenOf(nodes, pid)) {
      const tp = MM_TIPO[n.tipo] || MM_TIPO['nota']
      const t = (n.texto || '').trim()
      const ctx = n.contexto && n.contexto.trim() && n.contexto.trim() !== t ? ' → ' + n.contexto.trim() : ''
      const pg = opts.incluirPaginas && n.pagina ? ` (p. ${n.pagina})` : ''
      L.push('   '.repeat(depth) + `[${tp.sigla}] ${t}${ctx}${pg}`)
      walk(n.id, depth + 1)
    }
  }
  walk(null, 0)
  return L.join('\n')
}

/* 3) Texto indentado puro (.txt) com conectores ASCII */
function mmExportTxt(nodes: MmNode[], opts: any = {}): string {
  const L: string[] = []
  const walk = (pid: string | null, prefix: string) => {
    const kids = mmChildrenOf(nodes, pid)
    kids.forEach((n, i) => {
      const last = i === kids.length - 1
      L.push(prefix + (last ? '└─ ' : '├─ ') + mmLabel(n, opts))
      walk(n.id, prefix + (last ? '   ' : '│  '))
    })
  }
  walk(null, '')
  return L.join('\n')
}

/* 4) Outline numerado jurídico (1, 1.1, 1.1.1…) */
function mmExportOutline(nodes: MmNode[], opts: any = {}): string {
  const L: string[] = []
  const walk = (pid: string | null, num: string) => {
    mmChildrenOf(nodes, pid).forEach((n, i) => {
      const cur = num ? `${num}.${i + 1}` : `${i + 1}`
      L.push(`${cur} ${mmLabel(n, opts)}`)
      walk(n.id, cur)
    })
  }
  walk(null, '')
  return L.join('\n')
}

/* 5) JSON (round-trip) */
function mmExportJSON(nodes: MmNode[], pdfNome: string): string {
  return JSON.stringify({ pdfNome, titulo: pdfNome, nos: nodes, atualizadoEm: new Date(Date.now() - 3 * 3600000).toISOString() }, null, 2)
}

/* 6) OPML (MindNode/XMind…) */
function mmExportOPML(nodes: MmNode[], pdfNome: string, opts: any = {}): string {
  const esc = (s = '') => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
  const lines: string[] = []
  const walk = (pid: string | null, indent: string) => {
    for (const n of mmChildrenOf(nodes, pid)) {
      const kids = mmChildrenOf(nodes, n.id)
      const tp = MM_TIPO[n.tipo] || MM_TIPO['nota']
      const txt = esc(`[${tp.sigla}] ${mmLabel(n, opts)}`)
      if (kids.length) { lines.push(`${indent}<outline text="${txt}">`); walk(n.id, indent + '  '); lines.push(`${indent}</outline>`) }
      else lines.push(`${indent}<outline text="${txt}"/>`)
    }
  }
  walk(null, '      ')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0">\n  <head><title>${esc(pdfNome)}</title></head>\n  <body>\n${lines.join('\n')}\n  </body>\n</opml>`
}

/* 7) Anki / Flashcards (TSV  frente \t verso) */
function mmExportAnki(nodes: MmNode[]): string {
  const clean = (s = '') => s.replace(/[\t\n\r]+/g, ' ').trim()
  const path = (n: MmNode): string => {
    const chain: string[] = []
    let cur: MmNode | undefined = nodes.find(x => x.id === n.paiId)
    while (cur) { chain.unshift(cur.texto); cur = nodes.find(x => x.id === cur!.paiId) }
    return chain.join(' › ')
  }
  const cards: string[] = []
  const CONTENT = new Set(['conceito', 'definicao', 'caracteristica', 'requisito', 'excecao', 'exemplo', 'jurisprudencia', 'fundamento', 'prazo'])
  for (const n of nodes) {
    if (!CONTENT.has(n.tipo)) continue
    const tp = MM_TIPO[n.tipo] || MM_TIPO['nota']
    const p = path(n)
    const front = clean(`${p ? p + ' — ' : ''}${tp.label}`)
    const back = clean(n.contexto && n.contexto !== n.texto ? `${n.texto} — ${n.contexto}` : n.texto)
    if (front && back) cards.push(`${front}\t${back}`)
  }
  return cards.join('\n')
}

/* ════════════════════════════════════════════════════════════════════════ */
export default function AnalisePDF() {
  const uid = useUid()
  const rootRef = useRef<HTMLDivElement>(null)

  /* ── persistência (Firestore) ── */
  const [folders, setFolders] = useState<any[]>([])
  const [notes, setNotes] = useState<any[]>([])

  /* ── estado do PDF (somente sessão) ── */
  const [pdfName, setPdfName] = useState<string | null>(null)
  const [numPages, setNumPages] = useState(0)
  const [scale, setScale] = useState(1.15)
  const [outline, setOutline] = useState<any[]>([])
  const [showOutline, setShowOutline] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const [thumbMode, setThumbMode] = useState<'mini' | 'num'>('mini')
  /* assistentes de leitura + controle de páginas lidas */
  const [assist, setAssist] = useState<'none' | 'lupa' | 'mascara' | 'regua' | 'foco'>('none')
  const [cursor, setCursor] = useState<{ x: number; y: number; top: number; left: number; w: number; h: number; inside: boolean }>({ x: 0, y: 0, top: 0, left: 0, w: 0, h: 0, inside: false })
  const [readPages, setReadPages] = useState<Set<number>>(new Set())
  /* ferramenta: copiar trecho selecionado para a nota */
  const [clipMode, setClipMode] = useState(false)
  const [clipBtn, setClipBtn] = useState<{ x: number; y: number; text: string } | null>(null)
  const assistRef = useRef(assist); useEffect(() => { assistRef.current = assist }, [assist])
  const lensRef = useRef<HTMLCanvasElement>(null)
  const moveRaf = useRef(0)
  const [showSide, setShowSide] = useState(true)
  const [pdfCollapsed, setPdfCollapsed] = useState(false)

  /* ── visão do painel inferior: nota (editor) · arvore (mapa textual) · mapa (visual) ── */
  const [bottomView, setBottomView] = useState<'nota' | 'arvore' | 'mapa'>('arvore')

  /* ── Mapa Mental Textual ── */
  const [mmNodes, setMmNodes] = useState<any[]>([])               // lista plana { id, texto, tipo, paiId, ordem, pagina, contexto, colapsado, criadoEm }
  const [mmActiveId, setMmActiveId] = useState<string | null>(null) // nó-pai ativo (novas capturas entram como filho dele)
  const [captureMode, setCaptureMode] = useState(false)            // liga o "mouse de captura" sobre o PDF
  const [mmMenu, setMmMenu] = useState<{ x: number; y: number; text: string; pagina?: number; contexto?: string } | null>(null)
  const [mmBox, setMmBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null) // marquee visual
  const [mmRename, setMmRename] = useState<string | null>(null)   // id do nó em edição inline
  const [mmQuery, setMmQuery] = useState('')                       // busca/filtro na árvore
  const [mmCtx, setMmCtx] = useState<{ x: number; y: number; id: string } | null>(null) // menu de contexto
  const [mmDropTarget, setMmDropTarget] = useState<{ id: string; zone: 'before' | 'into' | 'after' } | null>(null)
  const [mmExportOpen, setMmExportOpen] = useState(false)         // menu Exportar aberto
  const [mmIncluirPag, setMmIncluirPag] = useState(true)          // sufixo "(p. N)" nas exportações
  const [mmZoom, setMmZoom] = useState(1)                          // zoom do mapa visual
  const mmNodesRef = useRef<any[]>([]); useEffect(() => { mmNodesRef.current = mmNodes }, [mmNodes])
  const mmActiveRef = useRef<string | null>(null); useEffect(() => { mmActiveRef.current = mmActiveId }, [mmActiveId])
  const captureModeRef = useRef(false); useEffect(() => { captureModeRef.current = captureMode }, [captureMode])
  const mmDragRef = useRef<{ x0: number; y0: number; active: boolean } | null>(null) // arraste do marquee no PDF
  const mmDragNodeRef = useRef<string | null>(null)               // nó sendo arrastado na árvore
  const mmPast = useRef<string[]>([])                              // histórico p/ desfazer
  const mmFuture = useRef<string[]>([])                            // histórico p/ refazer

  /* ── busca ── */
  const [query, setQuery] = useState('')
  const [hitInfo, setHitInfo] = useState({ cur: 0, total: 0 })

  /* ── editor / nota corrente ── */
  const [noteId, setNoteId] = useState<string | null>(null)
  const [noteTitle, setNoteTitle] = useState('')
  const [noteFolderId, setNoteFolderId] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'dirty' | 'saving' | 'saved'>('idle')
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [splitRatio, setSplitRatio] = useState(0.6)        // fração da altura para o PDF

  /* refs imperativos */
  const pdfDocRef = useRef<any>(null)
  const pdfjsRef = useRef<any>(null)
  const pagesHostRef = useRef<HTMLDivElement>(null)
  const viewerRef = useRef<HTMLDivElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)
  const pageMetaRef = useRef<any[]>([])          // [{pageNum, w, h (escala 1)}]
  const pageElsRef = useRef<Record<number, HTMLElement>>({})
  const renderedScaleRef = useRef<Record<number, number>>({})
  const textCacheRef = useRef<Record<number, any>>({})    // textContent por página
  const marksRef = useRef<Record<number, any[]>>({})      // marcações por página (coord. escala 1)
  const ioRef = useRef<IntersectionObserver | null>(null)
  const visiblePagesRef = useRef<Set<number>>(new Set())
  const hitsRef = useRef<any[]>([])
  const curHitRef = useRef(0)
  const saveTimerRef = useRef<any>(null)
  const scaleRef = useRef(scale)
  scaleRef.current = scale

  /* refs sincronizados — garantem que o autosave sempre grava na MESMA anotação
     (corrige o bug em que cada salvamento criava uma nota nova) */
  const uidRef = useRef(uid); useEffect(() => { uidRef.current = uid }, [uid])
  const notesRef = useRef(notes); useEffect(() => { notesRef.current = notes }, [notes])
  const noteIdRef = useRef<string | null>(noteId); useEffect(() => { noteIdRef.current = noteId }, [noteId])
  const noteTitleRef = useRef(noteTitle); useEffect(() => { noteTitleRef.current = noteTitle }, [noteTitle])
  const noteFolderIdRef = useRef<string | null>(noteFolderId); useEffect(() => { noteFolderIdRef.current = noteFolderId }, [noteFolderId])

  const viewMode = pdfName && !pdfCollapsed ? 'split' : 'note'   // split = PDF+editor | note = editor cheio

  /* injeta CSS uma vez */
  useEffect(() => {
    if (!document.getElementById('pdfa-styles')) {
      const st = document.createElement('style'); st.id = 'pdfa-styles'; st.textContent = PDFA_CSS
      document.head.appendChild(st)
    }
  }, [])

  /* ── assinaturas Firestore ── */
  useEffect(() => {
    if (!uid) return
    const u1 = onSnapshot(collection(db, 'users', uid, 'pdfFolders'),
      s => setFolders(s.docs.map(d => ({ id: d.id, ...d.data() }))))
    const u2 = onSnapshot(collection(db, 'users', uid, 'pdfNotes'),
      s => setNotes(s.docs.map(d => ({ id: d.id, ...d.data() }))))
    return () => { u1(); u2() }
  }, [uid])

  /* ── TOAST ── */
  const toastRef = useRef<HTMLDivElement>(null)
  const toastT = useRef<any>(null)
  const toast = useCallback((msg: string) => {
    const el = toastRef.current; if (!el) return
    el.textContent = msg; el.classList.add('show')
    clearTimeout(toastT.current); toastT.current = setTimeout(() => el.classList.remove('show'), 2600)
  }, [])

  /* ════════════════════ PDF: importar / renderizar ════════════════════ */
  const importPdf = useCallback(async (file: File) => {
    if (!file) return
    try {
      const lib = await ensurePdfjs(); pdfjsRef.current = lib
      const buf = await file.arrayBuffer()
      const task = lib.getDocument({ data: buf })
      const pdf = await task.promise
      // limpa estado anterior
      pdfDocRef.current = pdf
      pageElsRef.current = {}; renderedScaleRef.current = {}; textCacheRef.current = {}
      marksRef.current = {}; hitsRef.current = []; curHitRef.current = 0
      setHitInfo({ cur: 0, total: 0 }); setQuery(''); setCurrentPage(1)
      setNumPages(pdf.numPages); setPdfName(file.name.replace(/\.pdf$/i, '')); setPdfCollapsed(false)

      // metadados (tamanho de cada página em escala 1) para placeholders
      const metas: any[] = []
      for (let i = 1; i <= pdf.numPages; i++) {
        const pg = await pdf.getPage(i)
        const vp = pg.getViewport({ scale: 1 })
        metas.push({ pageNum: i, w: vp.width, h: vp.height })
      }
      pageMetaRef.current = metas

      // outline / índice
      try {
        const ol = await pdf.getOutline()
        setOutline(ol || [])
      } catch { setOutline([]) }

      // monta placeholders e dá fit-width inicial
      requestAnimationFrame(() => { buildPagePlaceholders(); fitWidth() })
      toast('PDF carregado — ' + pdf.numPages + ' páginas')
    } catch (err: any) {
      console.error('[AnalisePDF] erro ao abrir PDF:', err)
      toast('Não foi possível abrir o PDF' + (err?.message ? ': ' + err.message : ''))
    }
  }, [toast])

  /* cria os contêineres de página com a altura correta e liga o observer */
  const buildPagePlaceholders = useCallback(() => {
    const host = pagesHostRef.current; if (!host) return
    host.innerHTML = ''
    pageElsRef.current = {}; renderedScaleRef.current = {}
    const sc = scaleRef.current
    if (ioRef.current) ioRef.current.disconnect()
    ioRef.current = new IntersectionObserver(entries => {
      for (const e of entries) {
        const pn = Number((e.target as HTMLElement).dataset.page)
        if (e.isIntersecting) { visiblePagesRef.current.add(pn); renderPage(pn) }
        else visiblePagesRef.current.delete(pn)
      }
    }, { root: viewerRef.current, rootMargin: '600px 0px' })

    for (const m of pageMetaRef.current) {
      const pageEl = document.createElement('div')
      pageEl.className = 'pdfa-page'; pageEl.dataset.page = String(m.pageNum)
      pageEl.style.width = (m.w * sc) + 'px'; pageEl.style.height = (m.h * sc) + 'px'
      const num = document.createElement('div'); num.className = 'num'; num.textContent = String(m.pageNum)
      pageEl.appendChild(num)
      host.appendChild(pageEl)
      pageElsRef.current[m.pageNum] = pageEl
      ioRef.current.observe(pageEl)
    }
  }, [])

  /* renderiza canvas + camada de texto + marcações de uma página */
  const renderPage = useCallback(async (pn: number) => {
    const pdf = pdfDocRef.current, lib = pdfjsRef.current; if (!pdf || !lib) return
    const sc = scaleRef.current
    if (renderedScaleRef.current[pn] === sc) return            // já renderizada nesta escala
    const pageEl = pageElsRef.current[pn]; if (!pageEl) return
    renderedScaleRef.current[pn] = sc                          // trava p/ evitar corrida
    try {
      const page = await pdf.getPage(pn)
      const vp = page.getViewport({ scale: sc })
      pageEl.style.width = vp.width + 'px'; pageEl.style.height = vp.height + 'px'

      // canvas
      let canvas = pageEl.querySelector('canvas') as HTMLCanvasElement
      if (!canvas) { canvas = document.createElement('canvas'); pageEl.insertBefore(canvas, pageEl.firstChild) }
      const ratio = window.devicePixelRatio || 1
      canvas.width = Math.floor(vp.width * ratio); canvas.height = Math.floor(vp.height * ratio)
      canvas.style.width = vp.width + 'px'; canvas.style.height = vp.height + 'px'
      const ctx = canvas.getContext('2d'); ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
      await page.render({ canvasContext: ctx, viewport: vp }).promise

      // camada de texto
      let tl = pageEl.querySelector('.pdfa-textlayer') as HTMLElement
      if (!tl) { tl = document.createElement('div'); tl.className = 'pdfa-textlayer'; pageEl.appendChild(tl) }
      tl.innerHTML = ''; tl.style.width = vp.width + 'px'; tl.style.height = vp.height + 'px'
      tl.style.setProperty('--scale-factor', String(sc))
      const tc = textCacheRef.current[pn] || await page.getTextContent()
      textCacheRef.current[pn] = tc
      try {
        const t = lib.renderTextLayer({ textContentSource: tc, container: tl, viewport: vp, textDivs: [] })
        await (t.promise || t)
      } catch {
        try { const t2 = lib.renderTextLayer({ textContent: tc, container: tl, viewport: vp, textDivs: [] }); await (t2.promise || t2) }
        catch (e) { /* sem camada de texto p/ esta versão */ }
      }
      // re-aplica busca nas spans recém criadas
      applySearchToPage(pn)
      // camada de marcações
      drawMarks(pn)
    } catch (err) {
      renderedScaleRef.current[pn] = -1   // libera p/ tentar de novo
      console.warn('[AnalisePDF] render página', pn, err)
    }
  }, [])

  /* redesenha marcações de uma página (coordenadas guardadas em escala 1) */
  const drawMarks = useCallback((pn: number) => {
    const pageEl = pageElsRef.current[pn]; if (!pageEl) return
    let ml = pageEl.querySelector('.pdfa-marklayer') as HTMLElement
    if (!ml) { ml = document.createElement('div'); ml.className = 'pdfa-marklayer'; pageEl.appendChild(ml) }
    ml.innerHTML = ''
    const sc = scaleRef.current
    for (const mk of (marksRef.current[pn] || [])) {
      const d = document.createElement('div'); d.className = 'mk'
      d.style.left = (mk.x * sc) + 'px'; d.style.top = (mk.y * sc) + 'px'
      d.style.width = (mk.w * sc) + 'px'; d.style.height = (mk.h * sc) + 'px'
      if (mk.type === 'underline') {
        d.style.background = 'transparent'
        d.style.borderBottom = Math.max(2, 2.2 * sc) + 'px solid ' + mk.color
      } else {
        d.style.background = mk.color; d.style.opacity = '0.4'; d.style.mixBlendMode = 'multiply'
      }
      ml.appendChild(d)
    }
  }, [])

  /* ── zoom / enquadramento ── */
  const applyScale = useCallback((next: number) => {
    const sc = Math.min(3.2, Math.max(0.4, next))
    scaleRef.current = sc; setScale(sc)
    // redimensiona placeholders e re-renderiza páginas visíveis
    for (const m of pageMetaRef.current) {
      const el = pageElsRef.current[m.pageNum]
      if (el) { el.style.width = (m.w * sc) + 'px'; el.style.height = (m.h * sc) + 'px' }
      renderedScaleRef.current[m.pageNum] = renderedScaleRef.current[m.pageNum] === sc ? sc : -1
    }
    requestAnimationFrame(() => { visiblePagesRef.current.forEach(pn => renderPage(pn)) })
  }, [renderPage])

  const fitWidth = useCallback(() => {
    const vw = viewerRef.current?.clientWidth || 800
    const pw = pageMetaRef.current[0]?.w || 600
    applyScale((vw - 56) / pw)
  }, [applyScale])
  const fitPage = useCallback(() => {
    const vw = viewerRef.current?.clientWidth || 800, vh = viewerRef.current?.clientHeight || 600
    const m = pageMetaRef.current[0]; if (!m) return
    applyScale(Math.min((vw - 56) / m.w, (vh - 56) / m.h))
  }, [applyScale])

  /* ════════════════════ busca interna ════════════════════ */
  const applySearchToPage = useCallback((pn: number) => {
    const pageEl = pageElsRef.current[pn]; if (!pageEl) return
    const tl = pageEl.querySelector('.pdfa-textlayer'); if (!tl) return
    const q = query.trim().toLowerCase()
    tl.querySelectorAll('span.pa-hit').forEach((s: any) => s.classList.remove('pa-hit', 'cur'))
    if (!q) return
    tl.querySelectorAll('span').forEach((s: any) => {
      if (s.textContent && s.textContent.toLowerCase().includes(q)) s.classList.add('pa-hit')
    })
    // marca o hit corrente se estiver nesta página
    const cur = hitsRef.current[curHitRef.current]
    if (cur && cur.page === pn) {
      const spans = tl.querySelectorAll('span.pa-hit')
      const s = spans[cur.localIdx]; if (s) s.classList.add('cur')
    }
  }, [query])

  const runSearch = useCallback(async (q: string) => {
    const pdf = pdfDocRef.current; if (!pdf) return
    const needle = q.trim().toLowerCase()
    hitsRef.current = []; curHitRef.current = 0
    if (!needle) { setHitInfo({ cur: 0, total: 0 }); Object.keys(pageElsRef.current).forEach(pn => applySearchToPage(Number(pn))); return }
    // varre o texto de todas as páginas (usa cache, busca o que faltar)
    for (let pn = 1; pn <= pdf.numPages; pn++) {
      let tc = textCacheRef.current[pn]
      if (!tc) { try { const pg = await pdf.getPage(pn); tc = await pg.getTextContent(); textCacheRef.current[pn] = tc } catch { continue } }
      let local = 0
      tc.items.forEach((it: any) => {
        if (it.str && it.str.toLowerCase().includes(needle)) { hitsRef.current.push({ page: pn, localIdx: local }); local++ }
        else if (it.str && it.str.trim()) { /* spans sem hit não entram no índice local de hits */ }
      })
      // localIdx precisa bater com a ordem das spans .pa-hit (somente spans que casam)
    }
    setHitInfo({ cur: hitsRef.current.length ? 1 : 0, total: hitsRef.current.length })
    Object.keys(pageElsRef.current).forEach(pn => applySearchToPage(Number(pn)))
    if (hitsRef.current.length) gotoHit(0)
  }, [applySearchToPage])

  const gotoHit = useCallback((idx: number) => {
    const hits = hitsRef.current; if (!hits.length) return
    const i = ((idx % hits.length) + hits.length) % hits.length
    curHitRef.current = i; setHitInfo({ cur: i + 1, total: hits.length })
    const hit = hits[i]
    const pageEl = pageElsRef.current[hit.page]
    if (pageEl) {
      pageEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
      // garante render e marca o hit atual
      renderPage(hit.page).then(() => {
        Object.keys(pageElsRef.current).forEach(pn => applySearchToPage(Number(pn)))
        const tl = pageEl.querySelector('.pdfa-textlayer')
        const s = tl?.querySelectorAll('span.pa-hit')[hit.localIdx]
        if (s) { s.scrollIntoView({ behavior: 'smooth', block: 'center' }) }
      })
    }
  }, [renderPage, applySearchToPage])

  /* dispara busca ao digitar (debounce curto) */
  useEffect(() => {
    const t = setTimeout(() => runSearch(query), 280)
    return () => clearTimeout(t)
  }, [query, runSearch])

  /* ════════════════════ navegação por página (miniaturas / números) ════════════════════ */
  const gotoPage = useCallback((pn: number) => {
    const el = pageElsRef.current[pn]
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); renderPage(pn); setCurrentPage(pn) }
  }, [renderPage])

  /* mantém a "página atual" sincronizada com o scroll (destaca a miniatura) */
  useEffect(() => {
    const v = viewerRef.current; if (!v) return
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        const vTop = v.getBoundingClientRect().top
        let best = 1, bestD = Infinity
        for (const m of pageMetaRef.current) {
          const el = pageElsRef.current[m.pageNum]; if (!el) continue
          const d = Math.abs(el.getBoundingClientRect().top - vTop)
          if (d < bestD) { bestD = d; best = m.pageNum }
        }
        setCurrentPage(best)
      })
    }
    v.addEventListener('scroll', onScroll, { passive: true })
    return () => { v.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [pdfName])

  /* ════════════════════ controle de páginas lidas (por PDF, em localStorage) ════════════════════ */
  useEffect(() => {
    if (!pdfName) { setReadPages(new Set()); return }
    try { const r = localStorage.getItem('nexus_pdfread_' + pdfName); setReadPages(new Set(r ? JSON.parse(r) : [])) }
    catch { setReadPages(new Set()) }
  }, [pdfName])
  const toggleRead = useCallback((pn: number) => {
    setReadPages(prev => {
      const n = new Set(prev); n.has(pn) ? n.delete(pn) : n.add(pn)
      if (pdfName) { try { localStorage.setItem('nexus_pdfread_' + pdfName, JSON.stringify([...n])) } catch { } }
      return n
    })
  }, [pdfName])

  /* ════════════════════ assistentes de leitura (lupa / máscara / régua / foco) ════════════════════ */
  const onViewerMove = useCallback((e: React.MouseEvent) => {
    if (assistRef.current === 'none') return
    const cx = e.clientX, cy = e.clientY
    if (moveRaf.current) return
    moveRaf.current = requestAnimationFrame(() => {
      moveRaf.current = 0
      const v = viewerRef.current; if (!v) return
      const r = v.getBoundingClientRect()
      setCursor({ x: cx, y: cy, top: r.top, left: r.left, w: r.width, h: r.height, inside: true })
    })
  }, [])
  const onViewerLeave = useCallback(() => setCursor(c => ({ ...c, inside: false })), [])

  /* desenha a lupa a partir do canvas da página sob o cursor */
  useEffect(() => {
    if (assist !== 'lupa' || !cursor.inside) return
    const cv = lensRef.current; if (!cv) return
    const LENS = 170, ZOOM = 2.3, ratio = window.devicePixelRatio || 1
    const ctx = cv.getContext('2d'); if (!ctx) return
    if (cv.width !== LENS * ratio) { cv.width = LENS * ratio; cv.height = LENS * ratio }
    ctx.clearRect(0, 0, cv.width, cv.height)
    const el = document.elementFromPoint(cursor.x, cursor.y) as HTMLElement | null
    const src = (el ? (el.tagName === 'CANVAS' ? el : el.closest('.pdfa-page')?.querySelector('canvas')) : null) as HTMLCanvasElement | null
    if (!src) return
    const r = src.getBoundingClientRect()
    const dppx = src.width / r.width, dppy = src.height / r.height
    const regionCss = LENS / ZOOM
    const sw = regionCss * dppx, sh = regionCss * dppy
    const sx = (cursor.x - r.left) * dppx - sw / 2
    const sy = (cursor.y - r.top) * dppy - sh / 2
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height)
    try { ctx.drawImage(src, sx, sy, sw, sh, 0, 0, cv.width, cv.height) } catch { }
  }, [assist, cursor])

  /* ════════════════════ índice lateral (outline) ════════════════════ */
  const gotoDest = useCallback(async (dest: any) => {
    const pdf = pdfDocRef.current; if (!pdf || !dest) return
    try {
      const explicit = typeof dest === 'string' ? await pdf.getDestination(dest) : dest
      if (!explicit) return
      const ref = explicit[0]
      const pageIndex = await pdf.getPageIndex(ref)
      const pageEl = pageElsRef.current[pageIndex + 1]
      if (pageEl) { pageEl.scrollIntoView({ behavior: 'smooth', block: 'start' }); renderPage(pageIndex + 1) }
    } catch (e) { console.warn('dest', e) }
  }, [renderPage])

  /* ════════════════════ EDITOR ════════════════════ */
  const focusEditor = () => editorRef.current?.focus()
  const exec = useCallback((cmd: string, val?: string) => {
    focusEditor(); document.execCommand(cmd, false, val); markDirty()
  }, [])

  const insertToggle = useCallback(() => {
    focusEditor()
    const html = '<details class="pa-toggle" open><summary>Pergunta…</summary>' +
      '<div class="pa-toggle-body">Resposta…</div></details><p><br></p>'
    document.execCommand('insertHTML', false, html); markDirty()
  }, [])

  const setBlock = useCallback((tag: string) => { focusEditor(); document.execCommand('formatBlock', false, tag); markDirty() }, [])

  /* ── salvar / autosave ──
     persistNote lê tudo de refs, então sempre grava na anotação corrente e
     cria UM id só (na primeira vez), reaproveitando-o nos salvamentos seguintes */
  const saveSnapshot = useCallback(async (id: string, title: string, folderId: string | null, html: string, createdAt?: number) => {
    const u = uidRef.current; if (!u) return
    await setDoc(doc(db, 'users', u, 'pdfNotes', id), clean({
      id, folderId: folderId ?? null,
      title: title || 'Sem título',
      html,
      createdAt: createdAt ?? Date.now(),
      updatedAt: Date.now(),
    }), { merge: true })
  }, [])

  const persistNote = useCallback(async () => {
    const u = uidRef.current; if (!u) return
    const html = editorRef.current?.innerHTML || ''
    const plain = (editorRef.current?.textContent || '').trim()
    const title = (noteTitleRef.current || '').trim()
    if (!title && !plain) { setSaveState('idle'); return }     // nada digitado ainda
    let id = noteIdRef.current
    if (!id) { id = newId(); noteIdRef.current = id; setNoteId(id) }   // cria UMA vez
    setSaveState('saving')
    const createdAt = notesRef.current.find(n => n.id === id)?.createdAt
    try {
      await saveSnapshot(id, title, noteFolderIdRef.current, html, createdAt)
      setSaveState('saved'); setTimeout(() => setSaveState(s => (s === 'saved' ? 'idle' : s)), 1500)
    } catch (e) { console.error(e); setSaveState('dirty'); toast('Erro ao salvar anotação') }
  }, [saveSnapshot, toast])

  const markDirty = useCallback(() => {
    setSaveState('dirty')
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => { void persistNote() }, 1000)
  }, [persistNote])

  /* grava a anotação atual antes de sair dela (sem perder edição, sem criar duplicatas) */
  const flushPending = useCallback(() => {
    clearTimeout(saveTimerRef.current)
    const html = editorRef.current?.innerHTML || ''
    const plain = (editorRef.current?.textContent || '').trim()
    const title = (noteTitleRef.current || '').trim()
    if (!title && !plain) return
    let id = noteIdRef.current
    if (!id) { id = newId(); noteIdRef.current = id }
    const createdAt = notesRef.current.find(n => n.id === id)?.createdAt
    void saveSnapshot(id, title, noteFolderIdRef.current, html, createdAt)
  }, [saveSnapshot])

  /* ════════════════════ copiar trecho do PDF → editor ════════════════════ */
  const insertExcerptToEditor = useCallback((text: string) => {
    const ed = editorRef.current; if (!ed) return
    const t = (text || '').replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, '\n').trim()
    if (!t) return
    window.getSelection()?.removeAllRanges()          // limpa a seleção feita no PDF
    const p = document.createElement('p')             // texto comum, editável normalmente
    p.textContent = t
    ed.appendChild(p)
    ed.scrollTop = ed.scrollHeight
    // posiciona o cursor ao final do trecho inserido, para continuar escrevendo
    ed.focus()
    const range = document.createRange()
    range.selectNodeContents(p); range.collapse(false)
    const sel = window.getSelection()
    sel?.removeAllRanges(); sel?.addRange(range)
    markDirty()
    toast('Trecho copiado para a nota')
  }, [markDirty, toast])

  const getViewerSelection = useCallback(() => {
    const sel = window.getSelection(); if (!sel || sel.isCollapsed || !sel.rangeCount) return null
    const v = viewerRef.current; if (!v) return null
    const range = sel.getRangeAt(0)
    if (!v.contains(range.commonAncestorContainer)) return null     // seleção precisa estar no PDF
    const text = sel.toString(); if (!text.trim()) return null
    return { text, rect: range.getBoundingClientRect() }
  }, [])

  const onViewerMouseUp = useCallback(() => {
    if (!clipMode) return
    setTimeout(() => {
      const s = getViewerSelection()
      if (s) setClipBtn({ x: s.rect.left + s.rect.width / 2, y: s.rect.top, text: s.text })
      else setClipBtn(null)
    }, 10)
  }, [clipMode, getViewerSelection])

  const onViewerContextMenu = useCallback((e: React.MouseEvent) => {
    if (!clipMode) return
    const s = getViewerSelection()
    if (s) { e.preventDefault(); insertExcerptToEditor(s.text); setClipBtn(null) }
  }, [clipMode, getViewerSelection, insertExcerptToEditor])

  /* ════════════════════ MAPA MENTAL TEXTUAL: captura + persistência ════════════════════ */
  const MM_LS_KEY = 'nexus_pdfmapa_v1'

  /* página de origem a partir de um nó/elemento do DOM (sobe até .pdfa-page) */
  const mmPageOf = (node: Node | null): number | undefined => {
    let el: HTMLElement | null = (node && node.nodeType === 3 ? (node as Text).parentElement : (node as HTMLElement)) || null
    while (el && !el.classList?.contains('pdfa-page')) el = el.parentElement
    return el ? Number((el as HTMLElement).dataset.page) : undefined
  }

  /* junta palavras na ordem de leitura, removendo hifenização de quebra de linha */
  const mmJoinWords = (arr: string[]): string => {
    const merged: string[] = []
    for (let i = 0; i < arr.length; i++) {
      if (arr[i].endsWith('-') && i + 1 < arr.length && /^[a-zà-ÿ]/.test(arr[i + 1])) { merged.push(arr[i].slice(0, -1) + arr[i + 1]); i++ }
      else merged.push(arr[i])
    }
    return mmNormalize(merged.join(' '))
  }

  /* coleta o texto cujas PALAVRAS estão dentro do retângulo (geometria pura, sem seleção nativa) */
  const mmCollectInRect = (box: { left: number; top: number; right: number; bottom: number }, mode: 'center' | 'point' = 'center') => {
    const words: { page: number; top: number; left: number; word: string }[] = []
    const hit = (rect: DOMRect) => {
      if (mode === 'point') return box.left >= rect.left && box.left <= rect.right && box.top >= rect.top && box.top <= rect.bottom
      const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2
      return cx >= box.left && cx <= box.right && cy >= box.top && cy <= box.bottom
    }
    for (const key of Object.keys(pageElsRef.current)) {
      const pn = Number(key); const pageEl = pageElsRef.current[pn]; if (!pageEl) continue
      const pr = pageEl.getBoundingClientRect()
      if (pr.right < box.left || pr.left > box.right || pr.bottom < box.top || pr.top > box.bottom) continue
      const tl = pageEl.querySelector('.pdfa-textlayer'); if (!tl) continue
      tl.querySelectorAll('span').forEach((span: any) => {
        const sr = span.getBoundingClientRect()
        if (sr.right < box.left || sr.left > box.right || sr.bottom < box.top || sr.top > box.bottom) return
        const node = span.firstChild
        if (!node || node.nodeType !== 3) {
          if (hit(sr)) { const t = (span.textContent || '').trim(); if (t) words.push({ page: pn, top: sr.top, left: sr.left, word: t }) }
          return
        }
        const text = node.textContent || ''
        const re = /\S+/g; let m: RegExpExecArray | null
        while ((m = re.exec(text))) {
          const r = document.createRange()
          try { r.setStart(node, m.index); r.setEnd(node, m.index + m[0].length) } catch { continue }
          const rect = r.getBoundingClientRect()
          if (!rect.width && !rect.height) continue
          if (hit(rect)) words.push({ page: pn, top: rect.top, left: rect.left, word: m[0] })
        }
      })
    }
    words.sort((a, b) => Math.abs(a.top - b.top) > 4 ? a.top - b.top : a.left - b.left)
    return words
  }

  /* abre o menu de classificação junto ao cursor */
  const mmOpenMenu = useCallback((x: number, y: number, text: string, pagina?: number, contexto?: string) => {
    const t = mmNormalize(text); if (!t) { toast('Nada dentro do retângulo'); return }
    const mx = Math.max(8, Math.min(x, window.innerWidth - 312))
    const my = Math.max(8, Math.min(y, window.innerHeight - 370))
    setMmMenu({ x: mx, y: my, text: t, pagina, contexto })
  }, [toast])

  /* ── marquee (retângulo de seleção sobre o PDF) ── */
  const mmOnDown = useCallback((e: React.MouseEvent) => {
    if (!captureModeRef.current || e.button !== 0) return
    e.preventDefault()                                   // impede a seleção nativa (origem do "pega demais")
    window.getSelection()?.removeAllRanges()
    mmDragRef.current = { x0: e.clientX, y0: e.clientY, active: true }
    setMmBox({ left: e.clientX, top: e.clientY, width: 0, height: 0 })
  }, [])
  const mmOnMove = useCallback((e: React.MouseEvent) => {
    const d = mmDragRef.current; if (!d || !d.active) return
    setMmBox({ left: Math.min(d.x0, e.clientX), top: Math.min(d.y0, e.clientY), width: Math.abs(e.clientX - d.x0), height: Math.abs(e.clientY - d.y0) })
  }, [])
  const mmOnUp = useCallback((e: React.MouseEvent) => {
    const d = mmDragRef.current; mmDragRef.current = null
    if (!d || !d.active) return
    setMmBox(null)
    const left = Math.min(d.x0, e.clientX), top = Math.min(d.y0, e.clientY)
    const right = Math.max(d.x0, e.clientX), bottom = Math.max(d.y0, e.clientY)
    let words
    if ((right - left) < 4 && (bottom - top) < 4) {       // clique simples → palavra sob o ponto
      words = mmCollectInRect({ left: e.clientX, top: e.clientY, right: e.clientX, bottom: e.clientY }, 'point')
    } else {                                              // retângulo → tudo dentro
      words = mmCollectInRect({ left, top, right, bottom }, 'center')
    }
    if (!words.length) { toast('Nada dentro do retângulo — desenhe sobre o texto'); return }
    const text = mmJoinWords(words.map(w => w.word))
    mmOpenMenu(e.clientX, e.clientY, text, words[0].page, words.length > 1 ? text : undefined)
  }, [mmOpenMenu, toast])

  /* ── histórico (desfazer/refazer) ── */
  const mmSnapshot = useCallback(() => {
    mmPast.current.push(JSON.stringify(mmNodesRef.current))
    if (mmPast.current.length > 80) mmPast.current.shift()
    mmFuture.current = []
  }, [])
  const mmUndo = useCallback(() => {
    if (!mmPast.current.length) { toast('Nada para desfazer'); return }
    mmFuture.current.push(JSON.stringify(mmNodesRef.current))
    setMmNodes(JSON.parse(mmPast.current.pop() as string))
  }, [toast])
  const mmRedo = useCallback(() => {
    if (!mmFuture.current.length) { toast('Nada para refazer'); return }
    mmPast.current.push(JSON.stringify(mmNodesRef.current))
    setMmNodes(JSON.parse(mmFuture.current.pop() as string))
  }, [toast])

  /* adiciona um nó do tipo escolhido, como filho do nó ativo; o novo vira o ativo */
  const mmAddNode = useCallback((tipo: string) => {
    const menu = mmMenu; if (!menu) return
    mmSnapshot()
    const paiId = mmActiveRef.current
    const irmaos = mmNodesRef.current.filter(n => n.paiId === paiId)
    const node = {
      id: newId(), texto: menu.text, tipo, paiId, ordem: irmaos.length,
      pagina: menu.pagina, contexto: menu.contexto, colapsado: false,
      criadoEm: new Date(Date.now() - 3 * 3600000).toISOString(),
    }
    setMmNodes(prev => [...prev, node])
    setMmActiveId(node.id)
    setMmMenu(null)
    toast((MM_TIPO[tipo]?.label || 'Nó') + ' adicionado')
  }, [mmMenu, mmSnapshot, toast])

  /* exclui um nó e toda a subárvore abaixo dele */
  const mmDeleteNode = useCallback((id: string) => {
    mmSnapshot()
    setMmNodes(prev => {
      const kill = new Set<string>([id]); let changed = true
      while (changed) { changed = false; for (const n of prev) if (n.paiId && kill.has(n.paiId) && !kill.has(n.id)) { kill.add(n.id); changed = true } }
      return prev.filter(n => !kill.has(n.id))
    })
    setMmActiveId(a => (a === id ? null : a)); setMmCtx(null)
  }, [mmSnapshot])

  const mmToggleCollapse = useCallback((id: string) => {
    setMmNodes(prev => prev.map(n => n.id === id ? { ...n, colapsado: !n.colapsado } : n))
  }, [])

  /* troca o tipo de um nó */
  const mmSetType = useCallback((id: string, tipo: string) => {
    mmSnapshot()
    setMmNodes(prev => prev.map(n => n.id === id ? { ...n, tipo } : n)); setMmCtx(null)
  }, [mmSnapshot])

  /* renomear inline (commit) */
  const mmRenameCommit = useCallback((id: string, val: string) => {
    const t = mmNormalize(val)
    if (t) { mmSnapshot(); setMmNodes(prev => prev.map(n => n.id === id ? { ...n, texto: t } : n)) }
    setMmRename(null)
  }, [mmSnapshot])

  /* adiciona um filho manual (entra em modo de renomear) */
  const mmAddChild = useCallback((pid: string | null) => {
    mmSnapshot()
    const id = newId()
    const irmaos = mmNodesRef.current.filter(n => n.paiId === pid)
    setMmNodes(prev => [...prev, { id, texto: 'Novo nó', tipo: 'nota', paiId: pid, ordem: irmaos.length, colapsado: false, criadoEm: new Date(Date.now() - 3 * 3600000).toISOString() }])
    setMmActiveId(pid); setMmCtx(null); setMmRename(id)
  }, [mmSnapshot])

  /* mover (drag-and-drop): re-aninhar (into) ou reordenar entre irmãos (before/after) */
  const mmMove = useCallback((dragId: string, targetId: string, zone: 'before' | 'into' | 'after') => {
    if (dragId === targetId) return
    const nodes = mmNodesRef.current
    // impede soltar dentro da própria subárvore (ciclo)
    const isDesc = (ancestor: string, id: string): boolean => {
      let cur = nodes.find(n => n.id === id)
      while (cur) { if (cur.paiId === ancestor) return true; cur = nodes.find(n => n.id === cur!.paiId) }
      return false
    }
    if (isDesc(dragId, targetId)) { toast('Não dá para soltar dentro do próprio ramo'); return }
    mmSnapshot()
    setMmNodes(prev => {
      const arr = prev.map(n => ({ ...n }))
      const drag = arr.find(n => n.id === dragId); const target = arr.find(n => n.id === targetId)
      if (!drag || !target) return prev
      if (zone === 'into') {
        drag.paiId = targetId
        const sibs = arr.filter(n => n.paiId === targetId && n.id !== dragId)
        drag.ordem = sibs.length
        target.colapsado = false
      } else {
        drag.paiId = target.paiId
        const sibs = arr.filter(n => n.paiId === target.paiId && n.id !== dragId).sort((a, b) => a.ordem - b.ordem)
        const idx = sibs.findIndex(n => n.id === targetId)
        sibs.splice(zone === 'before' ? idx : idx + 1, 0, drag)
        sibs.forEach((n, i) => { n.ordem = i })
      }
      return arr
    })
  }, [mmSnapshot, toast])

  /* "voltar à origem": rola o PDF até a página do nó */
  const mmGotoPage = useCallback((pn?: number) => {
    if (!pn) return
    const el = pageElsRef.current[pn]
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); renderPage(pn); setCurrentPage(pn) }
  }, [renderPage])

  /* ── exportação (Etapa 4) ── */
  const mmDownload = useCallback((filename: string, content: string, mime = 'text/plain;charset=utf-8') => {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = filename
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1500)
  }, [])

  const mmDoExport = useCallback((fmt: string) => {
    const nodes = mmNodesRef.current
    if (!nodes.length) { toast('Mapa vazio'); return }
    const base = (pdfName || 'mapa').replace(/[^\w\-]+/g, '_').slice(0, 40)
    const opts = { incluirPaginas: mmIncluirPag }
    setMmExportOpen(false)
    switch (fmt) {
      case 'md':       mmDownload(`${base}_mapa.md`, mmExportMarkdown(nodes, opts), 'text/markdown'); break
      case 'mdbadge':  mmDownload(`${base}_mapa_badges.md`, mmExportMarkdownBadges(nodes, opts), 'text/markdown'); break
      case 'txt':      mmDownload(`${base}_mapa.txt`, mmExportTxt(nodes, opts)); break
      case 'outline':  mmDownload(`${base}_outline.txt`, mmExportOutline(nodes, opts)); break
      case 'json':     mmDownload(`${base}_mapa.json`, mmExportJSON(nodes, pdfName || 'mapa'), 'application/json'); break
      case 'opml':     mmDownload(`${base}_mapa.opml`, mmExportOPML(nodes, pdfName || 'mapa', opts), 'text/x-opml'); break
      case 'anki':     mmDownload(`${base}_anki.tsv`, mmExportAnki(nodes), 'text/tab-separated-values'); break
      case 'copy':
        navigator.clipboard?.writeText(mmExportMarkdown(nodes, opts)).then(() => toast('Markdown copiado'), () => toast('Não foi possível copiar'))
        break
      default: break
    }
    if (fmt !== 'copy') toast('Exportado: ' + fmt.toUpperCase())
  }, [pdfName, mmIncluirPag, mmDownload, toast])

  /* PDF visual do mapa (Etapa 5) — reaproveita jsPDF + html2canvas */
  const mmMapRef = useRef<HTMLDivElement>(null)
  const mmExportMapaPDF = useCallback(async () => {
    if (!mmNodesRef.current.length) { toast('Mapa vazio'); return }
    const stage = mmMapRef.current; if (!stage) return
    const ov = rootRef.current?.querySelector('.pdfa-overlay') as HTMLElement
    ov?.classList.add('show')
    try {
      await ensureExportLibs()
      const { jsPDF } = (window as any).jspdf
      const canvas = await (window as any).html2canvas(stage, { backgroundColor: '#ffffff', scale: 2 })
      const img = canvas.toDataURL('image/png')
      const landscape = canvas.width >= canvas.height
      const pdf = new jsPDF({ orientation: landscape ? 'landscape' : 'portrait', unit: 'pt', format: 'a4' })
      const pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight()
      const margin = 24
      const ratio = Math.min((pw - margin * 2) / canvas.width, (ph - margin * 2) / canvas.height)
      const w = canvas.width * ratio, h = canvas.height * ratio
      pdf.addImage(img, 'PNG', (pw - w) / 2, (ph - h) / 2, w, h)
      pdf.save(`${(pdfName || 'mapa').replace(/[^\w\-]+/g, '_').slice(0, 40)}_mapa.pdf`)
      toast('PDF do mapa gerado')
    } catch (err) { console.error(err); toast('Falha ao gerar o PDF') }
    finally { ov?.classList.remove('show') }
  }, [pdfName, toast])

  /* restaura o mapa salvo ao abrir/identificar o PDF (por nome) */
  useEffect(() => {
    if (!pdfName) return
    try {
      const all = JSON.parse(localStorage.getItem(MM_LS_KEY) || '{}')
      setMmNodes(all[pdfName]?.nos || [])
    } catch { setMmNodes([]) }
    setMmActiveId(null); mmPast.current = []; mmFuture.current = []
  }, [pdfName])

  /* auto-save (debounce ~800ms) no localStorage, por PDF */
  const mmSaveTimer = useRef<any>(null)
  useEffect(() => {
    if (!pdfName) return
    if (mmSaveTimer.current) clearTimeout(mmSaveTimer.current)
    mmSaveTimer.current = setTimeout(() => {
      try {
        const all = JSON.parse(localStorage.getItem(MM_LS_KEY) || '{}')
        all[pdfName] = { nos: mmNodes, atualizadoEm: new Date(Date.now() - 3 * 3600000).toISOString() }
        localStorage.setItem(MM_LS_KEY, JSON.stringify(all))
      } catch { }
    }, 800)
    return () => { if (mmSaveTimer.current) clearTimeout(mmSaveTimer.current) }
  }, [mmNodes, pdfName])

  /* teclado: Esc fecha menus/renome; Ctrl+Z/Y desfaz/refaz na árvore */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setMmMenu(null); setMmCtx(null); setMmRename(null); return }
      const tag = (e.target as HTMLElement)?.tagName
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable
      if (bottomView === 'arvore' && (e.ctrlKey || e.metaKey) && !typing) {
        const k = e.key.toLowerCase()
        if (k === 'z' && !e.shiftKey) { e.preventDefault(); mmUndo() }
        else if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); mmRedo() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [bottomView, mmUndo, mmRedo])

  const newNote = useCallback((folderId: string | null = null) => {
    flushPending()
    noteIdRef.current = null; noteTitleRef.current = ''; noteFolderIdRef.current = folderId
    setNoteId(null); setNoteTitle(''); setNoteFolderId(folderId)
    if (editorRef.current) editorRef.current.innerHTML = ''
    setSaveState('idle'); setPdfCollapsed(false)
    setTimeout(focusEditor, 60)
  }, [flushPending])

  const openNote = useCallback((n: any) => {
    flushPending()
    noteIdRef.current = n.id; noteTitleRef.current = n.title || ''; noteFolderIdRef.current = n.folderId ?? null
    setNoteId(n.id); setNoteTitle(n.title || ''); setNoteFolderId(n.folderId ?? null)
    if (editorRef.current) editorRef.current.innerHTML = n.html || ''
    setSaveState('idle')
    setPdfCollapsed(true)   // sem PDF salvo -> editor ocupa a página inteira
  }, [flushPending])

  const deleteNote = useCallback(async (n: any) => {
    const u = uidRef.current; if (!u) return
    if (!confirm('Excluir a anotação "' + (n.title || 'Sem título') + '"?')) return
    await deleteDoc(doc(db, 'users', u, 'pdfNotes', n.id))
    if (noteIdRef.current === n.id) {   // limpa sem regravar a nota excluída
      clearTimeout(saveTimerRef.current)
      noteIdRef.current = null; noteTitleRef.current = ''
      if (editorRef.current) editorRef.current.innerHTML = ''
      setNoteId(null); setNoteTitle(''); setSaveState('idle')
    }
    toast('Anotação excluída')
  }, [toast])

  /* exportar anotação atual para PDF */
  const exportNotePdf = useCallback(async () => {
    const html = editorRef.current?.innerHTML?.trim()
    if (!html) { toast('Nada para exportar'); return }
    const ov = rootRef.current?.querySelector('.pdfa-overlay') as HTMLElement
    ov?.classList.add('show')
    try {
      await ensureExportLibs()
      const { jsPDF } = (window as any).jspdf
      // monta um container limpo e legível para o PDF (com todos os toggles abertos)
      const wrap = document.createElement('div')
      wrap.style.cssText = 'position:fixed;left:-9999px;top:0;width:720px;padding:48px 56px;background:#fff;' +
        'color:#202124;font-family:Inter,Arial,sans-serif;font-size:15px;line-height:1.7;'
      const titleEl = document.createElement('h1')
      titleEl.textContent = noteTitle.trim() || 'Anotações'
      titleEl.style.cssText = 'font-family:"DM Sans",Arial,sans-serif;font-size:24px;margin:0 0 18px;font-weight:800;'
      wrap.appendChild(titleEl)
      const body = document.createElement('div'); body.innerHTML = html; wrap.appendChild(body)
      // estilos inline mínimos para o html2canvas
      body.querySelectorAll('details').forEach((d: any) => { d.open = true; d.style.border = '1px solid #dadce0'; d.style.borderRadius = '8px'; d.style.margin = '8px 0'; d.style.padding = '8px 12px' })
      body.querySelectorAll('summary').forEach((s: any) => { s.style.fontWeight = '700'; s.style.listStyle = 'none' })
      body.querySelectorAll('.pa-toggle-body').forEach((b: any) => { b.style.marginTop = '6px'; b.style.color = '#3c4043' })
      body.querySelectorAll('mark').forEach((mk: any) => { mk.style.background = '#fdf0b5'; mk.style.padding = '0 2px' })
      body.querySelectorAll('blockquote').forEach((q: any) => { q.style.borderLeft = '3px solid #1A73E8'; q.style.paddingLeft = '12px'; q.style.color = '#5f6368'; q.style.margin = '8px 0' })
      document.body.appendChild(wrap)

      const pdf = new jsPDF({ unit: 'pt', format: 'a4' })
      await pdf.html(wrap, {
        margin: [40, 40, 48, 40], autoPaging: 'text',
        html2canvas: { scale: 0.82, useCORS: true, backgroundColor: '#ffffff' },
        width: 515, windowWidth: 720,
      })
      pdf.save((noteTitle.trim() || 'anotacoes').replace(/[^\w\-]+/g, '_').slice(0, 60) + '.pdf')
      document.body.removeChild(wrap)
      toast('PDF exportado')
    } catch (e) {
      console.error('[AnalisePDF] export', e); toast('Falha ao exportar PDF')
    } finally { ov?.classList.remove('show') }
  }, [noteTitle, toast])

  /* ════════════════════ árvore (coluna direita) ════════════════════ */
  const persistFolder = useCallback(async (f: any) => {
    if (!uid) return
    await setDoc(doc(db, 'users', uid, 'pdfFolders', f.id), clean(f), { merge: true })
  }, [uid])

  const addFolder = useCallback((parentId: string | null = null) => {
    const f = { id: newId(), name: 'Nova pasta', parentId: parentId ?? null }
    if (parentId) setExpanded(e => ({ ...e, [parentId]: true }))
    void persistFolder(f)
  }, [persistFolder])

  const renameFolder = useCallback((f: any, name: string) => {
    void persistFolder({ ...f, name: name || f.name })
  }, [persistFolder])

  const deleteFolder = useCallback(async (f: any) => {
    if (!uid) return
    // coleta descendentes
    const all = new Set<string>([f.id])
    let added = true
    while (added) { added = false; folders.forEach(x => { if (x.parentId && all.has(x.parentId) && !all.has(x.id)) { all.add(x.id); added = true } }) }
    const affectedNotes = notes.filter(n => n.folderId && all.has(n.folderId))
    if (!confirm('Excluir a pasta "' + f.name + '"' + (affectedNotes.length ? ' e ' + affectedNotes.length + ' anotação(ões) dentro dela' : '') + '?')) return
    for (const id of all) await deleteDoc(doc(db, 'users', uid, 'pdfFolders', id))
    for (const n of affectedNotes) await deleteDoc(doc(db, 'users', uid, 'pdfNotes', n.id))
    if (affectedNotes.some(n => n.id === noteIdRef.current)) {   // se a nota aberta foi excluída, limpa sem regravar
      clearTimeout(saveTimerRef.current)
      noteIdRef.current = null; noteTitleRef.current = ''
      if (editorRef.current) editorRef.current.innerHTML = ''
      setNoteId(null); setNoteTitle(''); setSaveState('idle')
    }
    toast('Pasta excluída')
  }, [uid, folders, notes, toast])

  const moveItem = useCallback(async (drag: any, targetFolderId: string | null) => {
    if (!uid || !drag) return
    if (drag.type === 'note') {
      const n = notes.find(x => x.id === drag.id); if (!n) return
      await setDoc(doc(db, 'users', uid, 'pdfNotes', n.id), { folderId: targetFolderId ?? null }, { merge: true })
      if (noteId === n.id) { noteFolderIdRef.current = targetFolderId ?? null; setNoteFolderId(targetFolderId ?? null) }
    } else if (drag.type === 'folder') {
      if (drag.id === targetFolderId) return
      // evita mover pasta p/ dentro de si mesma
      let p = targetFolderId, guard = 0
      while (p && guard++ < 100) { if (p === drag.id) return; p = folders.find(x => x.id === p)?.parentId ?? null }
      await setDoc(doc(db, 'users', uid, 'pdfFolders', drag.id), { parentId: targetFolderId ?? null }, { merge: true })
    }
  }, [uid, notes, folders, noteId])

  /* ── atalhos de teclado (escopados na aba) ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!rootRef.current?.isConnected) return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        const inEditor = editorRef.current?.contains(document.activeElement)
        if (pdfName && !inEditor) { e.preventDefault(); (rootRef.current.querySelector('.pdfa-search input') as HTMLInputElement)?.focus() }
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        const inEditor = editorRef.current?.contains(document.activeElement)
        if (inEditor) { e.preventDefault(); void persistNote() }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [pdfName, persistNote])

  /* ── divisor arrastável (altura PDF x editor) ── */
  const startDividerDrag = useCallback((e: React.PointerEvent) => {
    e.preventDefault()
    const main = rootRef.current?.querySelector('.pdfa-main') as HTMLElement; if (!main) return
    const rect = main.getBoundingClientRect()
    const move = (ev: PointerEvent) => {
      const r = Math.min(0.82, Math.max(0.2, (ev.clientY - rect.top) / rect.height))
      setSplitRatio(r)
    }
    const up = () => { document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', up) }
    document.addEventListener('pointermove', move); document.addEventListener('pointerup', up)
  }, [])

  /* cleanup geral */
  useEffect(() => () => {
    if (ioRef.current) ioRef.current.disconnect()
    clearTimeout(saveTimerRef.current); clearTimeout(toastT.current)
  }, [])

  /* ─────────────────────────── render ─────────────────────────── */
  return (
    <div className="pdfa-app" ref={rootRef}>
      {/* ════ COLUNA PRINCIPAL ════ */}
      <div className="pdfa-main">

        {/* barra superior do PDF */}
        <div className="pdfa-bar">
          <span className="pdfa-title">📄 {pdfName || 'Análise de PDF'}</span>
          <button className="pdfa-btn icon" title={showOutline ? 'Ocultar páginas' : 'Mostrar páginas'}
            onClick={() => setShowOutline(v => !v)} disabled={!pdfName}>▦</button>

          <label className="pdfa-btn primary" style={{ cursor: 'pointer' }}>
            ⤓ Importar PDF
            <input type="file" accept="application/pdf" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) importPdf(f); e.currentTarget.value = '' }} />
          </label>

          {pdfName && <>
            <span className="sep" />
            {/* zoom */}
            <button className="pdfa-btn icon" onClick={() => applyScale(scale / 1.15)} title="Reduzir">−</button>
            <span className="pdfa-zoom-val">{Math.round(scale * 100)}%</span>
            <button className="pdfa-btn icon" onClick={() => applyScale(scale * 1.15)} title="Ampliar">+</button>
            <button className="pdfa-btn" onClick={fitWidth} title="Ajustar à largura">↔ Largura</button>
            <button className="pdfa-btn" onClick={fitPage} title="Ajustar à página">⤢ Página</button>

            <span className="sep" />
            {/* assistentes de leitura */}
            <button className={'pdfa-btn icon' + (assist === 'lupa' ? ' on' : '')} onClick={() => setAssist(a => a === 'lupa' ? 'none' : 'lupa')} title="Lupa — amplia a região sob o cursor">🔎</button>
            <button className={'pdfa-btn icon' + (assist === 'mascara' ? ' on' : '')} onClick={() => setAssist(a => a === 'mascara' ? 'none' : 'mascara')} title="Máscara — isola a linha em leitura">▤</button>
            <button className={'pdfa-btn icon' + (assist === 'regua' ? ' on' : '')} onClick={() => setAssist(a => a === 'regua' ? 'none' : 'regua')} title="Régua — guia horizontal de leitura">▬</button>
            <button className={'pdfa-btn icon' + (assist === 'foco' ? ' on' : '')} onClick={() => setAssist(a => a === 'foco' ? 'none' : 'foco')} title="Foco — destaca o entorno do cursor">◎</button>
            <button className={'pdfa-btn' + (clipMode ? ' on' : '')} onClick={() => { setClipMode(v => !v); setClipBtn(null) }}
              title="Trecho → nota: selecione o texto no PDF e clique em OK (ou clique com o botão direito) para copiar para o editor">✂ Trecho → nota</button>

            <span className="sep" />
            {/* página lida */}
            <button className={'pdfa-btn' + (readPages.has(currentPage) ? ' on' : '')} onClick={() => toggleRead(currentPage)}
              title="Marcar/desmarcar a página atual como lida">
              {readPages.has(currentPage) ? '✓ Lida' : '○ Marcar lida'}{numPages ? ` · ${readPages.size}/${numPages}` : ''}
            </button>

            <span className="sep" />
            {/* busca */}
            <div className="pdfa-search">
              <span style={{ color: 'var(--pa-faint)', fontSize: '.8rem' }}>🔍</span>
              <input placeholder="Buscar no PDF  (Ctrl+F)" value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); gotoHit(curHitRef.current + (e.shiftKey ? -1 : 1)) } }} />
              {query && <span className="cnt">{hitInfo.total ? `${hitInfo.cur}/${hitInfo.total}` : '0'}</span>}
              <button onClick={() => gotoHit(curHitRef.current - 1)} title="Anterior (Shift+Enter)">↑</button>
              <button onClick={() => gotoHit(curHitRef.current + 1)} title="Próximo (Enter)">↓</button>
            </div>
            <span className="grow" />
            <button className="pdfa-btn" onClick={() => setPdfCollapsed(v => !v)}
              title={pdfCollapsed ? 'Mostrar PDF' : 'Editor em tela cheia'}>
              {pdfCollapsed ? '▣ Ver PDF' : '⤡ Tela cheia (editor)'}
            </button>
          </>}

          <span className="grow" />
          <button className="pdfa-btn icon" title={showSide ? 'Ocultar pastas' : 'Mostrar pastas'}
            onClick={() => setShowSide(v => !v)}>🗂</button>
        </div>

        {/* área PDF (índice + visualizador) — escondida em modo nota */}
        <div className={'pdfa-viewer-wrap' + (viewMode === 'note' ? ' collapsed' : '')}
          style={{ flex: `0 0 calc(${Math.round(splitRatio * 100)}% - 9px)` }}>
          {/* navegador de páginas (miniaturas ou números) */}
          <div className={'pdfa-outline' + (showOutline ? '' : ' hide')}>
            <h4>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Páginas <span style={{ color: 'var(--pa-faint)', fontWeight: 600 }}>{numPages || ''}{readPages.size ? ` · ${readPages.size} lida(s)` : ''}</span></span>
              <span className="pdfa-thumbtabs">
                <button className={thumbMode === 'mini' ? 'on' : ''} onClick={() => setThumbMode('mini')} title="Miniaturas">▦</button>
                <button className={thumbMode === 'num' ? 'on' : ''} onClick={() => setThumbMode('num')} title="Números das páginas">#</button>
              </span>
            </h4>
            <div className="pdfa-outline-list">
              {!pdfName
                ? <div className="pdfa-out-empty">Importe um PDF para navegar pelas páginas.</div>
                : thumbMode === 'mini'
                  ? <PageThumbs key={pdfName} pdfDocRef={pdfDocRef} pdfjsRef={pdfjsRef} meta={pageMetaRef.current} numPages={numPages} current={currentPage} onGoto={gotoPage} read={readPages} onToggleRead={toggleRead} />
                  : <PageNumbers numPages={numPages} current={currentPage} onGoto={gotoPage} read={readPages} onToggleRead={toggleRead} />}
            </div>
          </div>
          {/* visualizador */}
          <div className={'pdfa-viewer' + (captureMode ? ' capturing' : '')} ref={viewerRef}
            onMouseMove={(e) => { onViewerMove(e); if (captureMode) mmOnMove(e) }} onMouseLeave={onViewerLeave}
            onMouseDown={(e) => { setClipBtn(null); if (captureMode) mmOnDown(e) }}
            onMouseUp={(e) => { onViewerMouseUp(); if (captureMode) mmOnUp(e) }} onContextMenu={onViewerContextMenu}>
            {pdfName
              ? <div className="pdfa-pages" ref={pagesHostRef} />
              : <div className="pdfa-empty">
                  <div className="big">📄</div>
                  <b>Importe um PDF para começar</b>
                  <span>O documento abre aqui em cima e você faz as anotações logo abaixo.
                    O PDF não é salvo (economia de espaço) — apenas as suas anotações ficam guardadas.</span>
                  <label className="pdfa-btn primary" style={{ cursor: 'pointer' }}>
                    ⤓ Escolher arquivo
                    <input type="file" accept="application/pdf" style={{ display: 'none' }}
                      onChange={e => { const f = e.target.files?.[0]; if (f) importPdf(f); e.currentTarget.value = '' }} />
                  </label>
                </div>}
          </div>
        </div>

        {/* ════ overlay dos assistentes de leitura (lupa / máscara / régua / foco) ════ */}
        {assist !== 'none' && cursor.inside && createPortal(
          <div style={{ position: 'fixed', left: cursor.left, top: cursor.top, width: cursor.w, height: cursor.h, pointerEvents: 'none', overflow: 'hidden', zIndex: 60 }}>
            {(() => {
              const lx = cursor.x - cursor.left, ly = cursor.y - cursor.top
              const ACC = 'var(--pa-accent)'
              if (assist === 'regua') return (
                <>
                  <div style={{ position: 'absolute', left: 0, right: 0, top: ly - 15, height: 30, background: 'linear-gradient(rgba(99,102,241,0.12), rgba(99,102,241,0))' }} />
                  <div style={{ position: 'absolute', left: 0, right: 0, top: ly - 1, height: 2, background: ACC, boxShadow: '0 1px 4px rgba(0,0,0,0.25)' }} />
                </>
              )
              if (assist === 'mascara') {
                const STRIP = 66
                return (
                  <>
                    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: Math.max(0, ly - STRIP / 2), background: 'rgba(15,23,42,0.64)' }} />
                    <div style={{ position: 'absolute', left: 0, right: 0, top: ly + STRIP / 2, bottom: 0, background: 'rgba(15,23,42,0.64)' }} />
                    <div style={{ position: 'absolute', left: 0, right: 0, top: ly - STRIP / 2, height: STRIP, borderTop: `1px solid ${ACC}`, borderBottom: `1px solid ${ACC}` }} />
                  </>
                )
              }
              if (assist === 'foco') {
                const R = 120
                return <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(circle ${R}px at ${lx}px ${ly}px, rgba(0,0,0,0) 0, rgba(0,0,0,0) ${R}px, rgba(15,23,42,0.58) ${R + 64}px)` }} />
              }
              if (assist === 'lupa') return (
                <canvas ref={lensRef} style={{ position: 'absolute', left: lx - 85, top: ly - 85, width: 170, height: 170, borderRadius: '50%', border: '3px solid var(--pa-accent)', boxShadow: '0 10px 28px rgba(0,0,0,0.4)', background: '#fff' }} />
              )
              return null
            })()}
          </div>,
          document.body
        )}

        {/* botão flutuante "OK / copiar trecho" (modo Trecho → nota) */}
        {clipMode && clipBtn && createPortal(
          <button
            onMouseDown={e => { e.preventDefault(); e.stopPropagation() }}
            onClick={() => { insertExcerptToEditor(clipBtn.text); setClipBtn(null) }}
            style={{ position: 'fixed', left: Math.max(8, clipBtn.x - 70), top: Math.max(8, clipBtn.y - 42), zIndex: 4000, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 9, border: 'none', background: 'var(--pa-accent, #1A73E8)', color: '#fff', fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', boxShadow: '0 8px 22px rgba(0,0,0,0.32)' }}
            title="Copiar o trecho selecionado para a nota">
            ✓ Copiar para a nota
          </button>,
          document.body
        )}

        {/* ── menu de classificação do Mapa Mental (escolha do nível/tipo) ── */}
        {mmMenu && createPortal(
          <>
            <div onMouseDown={() => setMmMenu(null)}
              style={{ position: 'fixed', inset: 0, zIndex: 4990, background: 'transparent' }} />
            <div className="pdfa-mm-menu" style={{ left: mmMenu.x, top: mmMenu.y }}
              onMouseDown={e => e.stopPropagation()}>
              <div className="cap"><b>“</b>{mmMenu.text}<b>”</b></div>
              <div className="tgt">
                {(() => { const a = mmNodes.find(n => n.id === mmActiveId); return a ? <>Entra como filho de <b>{a.texto}</b></> : <>Entra como <b>tópico (raiz)</b></> })()}
                {mmMenu.pagina ? <> · pág. {mmMenu.pagina}</> : null}
              </div>
              <div className="pdfa-mm-grid">
                {MM_TIPOS.map(t => (
                  <button key={t.key} className="pdfa-mm-opt" onClick={() => mmAddNode(t.key)} title={'Classificar como ' + t.label}>
                    <span className="dot" style={{ background: t.cor }} />{t.label}
                  </button>
                ))}
              </div>
              <div className="foot">
                <button onClick={() => setMmMenu(null)}>Cancelar (Esc)</button>
              </div>
            </div>
          </>,
          document.body
        )}

        {/* ── retângulo de seleção (marquee) sobre o PDF ── */}
        {mmBox && createPortal(
          <div className="pdfa-mm-marquee" style={{ left: mmBox.left, top: mmBox.top, width: mmBox.width, height: mmBox.height }} />,
          document.body
        )}

        {/* ── menu de contexto de um nó da árvore ── */}
        {mmCtx && createPortal(
          <>
            <div onMouseDown={() => setMmCtx(null)} onContextMenu={e => { e.preventDefault(); setMmCtx(null) }}
              style={{ position: 'fixed', inset: 0, zIndex: 5005, background: 'transparent' }} />
            <div className="pdfa-mm-ctx" style={{ left: mmCtx.x, top: mmCtx.y }} onMouseDown={e => e.stopPropagation()}>
              <button onClick={() => { setMmRename(mmCtx.id); setMmCtx(null) }}>✎ Renomear</button>
              <button onClick={() => { mmAddChild(mmCtx.id) }}>＋ Adicionar filho</button>
              <button onClick={() => { setMmActiveId(mmCtx.id); setMmCtx(null) }}>◎ Tornar nó-pai ativo</button>
              <div className="div" />
              <div className="ttl">Trocar tipo</div>
              <div className="types">
                {MM_TIPOS.map(t => (
                  <button key={t.key} onClick={() => mmSetType(mmCtx.id, t.key)} title={t.label}>
                    <span className="dot" style={{ background: t.cor }} />{t.sigla}
                  </button>
                ))}
              </div>
              <div className="div" />
              <button onClick={() => mmDeleteNode(mmCtx.id)} style={{ color: 'var(--mm-excecao)' }}>🗑 Excluir (e filhos)</button>
            </div>
          </>,
          document.body
        )}

        {/* divisor (só no modo split) */}
        {viewMode === 'split' && <div className="pdfa-divider" onPointerDown={startDividerDrag} title="Arraste para redimensionar" />}

        {/* EDITOR */}
        <div className={'pdfa-editor-box' + (viewMode === 'note' ? ' fullnote' : '')}
          style={viewMode === 'split' ? { flex: 1 } : undefined}>
          {/* ── seletor de visão do painel inferior (Árvore · Mapa · Nota) ── */}
          <div className="pdfa-mm-tabs" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderBottom: '1px solid var(--pa-border)' }}>
            <button className={'pdfa-btn' + (bottomView === 'arvore' ? ' on' : '')} onClick={() => setBottomView('arvore')} title="Mapa mental textual — árvore de captura">🌲 Árvore</button>
            <button className={'pdfa-btn' + (bottomView === 'mapa' ? ' on' : '')} onClick={() => setBottomView('mapa')} title="Mapa mental visual">🗺 Mapa</button>
            <span className="sep" />
            <button className={'pdfa-btn' + (bottomView === 'nota' ? ' on' : '')} onClick={() => setBottomView('nota')} title="Editor de anotações">✍ Nota</button>
            <span className="grow" style={{ flex: 1 }} />
            <span style={{ fontSize: '.72rem', color: 'var(--pa-faint)', fontWeight: 600 }}>
              {bottomView === 'nota' ? 'Anotações (rich text)' : bottomView === 'arvore' ? 'Captura de palavras-chave do PDF' : 'Visualização do mapa'}
            </span>
          </div>

          {/* ── NOTA (editor rich-text existente) ── */}
          {bottomView === 'nota' && <>
          <div className="pdfa-etoolbar">
            <input className="pdfa-note-title" placeholder="Título da anotação…" value={noteTitle}
              onChange={e => { noteTitleRef.current = e.target.value; setNoteTitle(e.target.value); markDirty() }} />
            <span className="sep" />
            <button className="pdfa-tbtn" onMouseDown={e => e.preventDefault()} onClick={() => exec('bold')} title="Negrito (Ctrl+B)" style={{ fontWeight: 800 }}>B</button>
            <button className="pdfa-tbtn" onMouseDown={e => e.preventDefault()} onClick={() => exec('italic')} title="Itálico (Ctrl+I)" style={{ fontStyle: 'italic' }}>I</button>
            <button className="pdfa-tbtn" onMouseDown={e => e.preventDefault()} onClick={() => exec('underline')} title="Sublinhado" style={{ textDecoration: 'underline' }}>U</button>
            <button className="pdfa-tbtn" onMouseDown={e => e.preventDefault()} onClick={() => exec('hiliteColor', '#FDD663')} title="Realçar texto">🖍</button>
            <span className="sep" />
            <button className="pdfa-tbtn wide" onMouseDown={e => e.preventDefault()} onClick={() => setBlock('H2')} title="Título">H2</button>
            <button className="pdfa-tbtn wide" onMouseDown={e => e.preventDefault()} onClick={() => setBlock('H3')} title="Subtítulo">H3</button>
            <button className="pdfa-tbtn" onMouseDown={e => e.preventDefault()} onClick={() => setBlock('BLOCKQUOTE')} title="Citação">❝</button>
            <span className="sep" />
            <button className="pdfa-tbtn" onMouseDown={e => e.preventDefault()} onClick={() => exec('insertUnorderedList')} title="Lista com marcadores">• ⃪</button>
            <button className="pdfa-tbtn" onMouseDown={e => e.preventDefault()} onClick={() => exec('insertOrderedList')} title="Lista numerada">1.</button>
            <button className="pdfa-tbtn wide" onMouseDown={e => e.preventDefault()} onClick={insertToggle} title="Lista retrátil (active recall)">▸ Toggle</button>
            <span className="sep" />
            <button className="pdfa-tbtn" onMouseDown={e => e.preventDefault()} onClick={() => exec('removeFormat')} title="Limpar formatação">⌫</button>
            <span className="grow" style={{ flex: 1 }} />
            <span className="pdfa-save-state">
              {saveState === 'saving' ? 'salvando…' : saveState === 'saved' ? '✓ salvo' : saveState === 'dirty' ? '• não salvo' : ''}
            </span>
            <button className="pdfa-tbtn wide" onClick={() => persistNote()} title="Salvar agora (Ctrl+S)">💾 Salvar</button>
            <button className="pdfa-tbtn wide" onClick={exportNotePdf} title="Exportar anotações em PDF">⤓ PDF</button>
          </div>
          <div className="pdfa-editor" ref={editorRef} contentEditable suppressContentEditableWarning
            data-ph="Escreva suas anotações, perguntas e respostas aqui. Use o botão ▸ Toggle para esconder respostas (active recall)…"
            onInput={markDirty}
            onKeyDown={e => {
              // Tab dentro de listas indenta em vez de sair do editor
              if (e.key === 'Tab') { e.preventDefault(); document.execCommand(e.shiftKey ? 'outdent' : 'indent') }
            }} />
          </>}

          {/* ── ÁRVORE (Mapa Mental Textual) ── */}
          {bottomView === 'arvore' && (() => {
            const childrenOf = (pid: string | null) => mmNodes.filter(n => n.paiId === pid).sort((a, b) => a.ordem - b.ordem)
            // filtro de busca: mantém os nós que casam + seus ancestrais
            const q = mmQuery.trim().toLowerCase()
            let visible: Set<string> | null = null
            if (q) {
              visible = new Set<string>()
              for (const n of mmNodes) {
                if ((n.texto || '').toLowerCase().includes(q)) {
                  let cur: any = n
                  while (cur) { visible.add(cur.id); cur = mmNodes.find(x => x.id === cur.paiId) }
                }
              }
            }
            const rows: any[] = []
            const walk = (pid: string | null, depth: number) => {
              for (const n of childrenOf(pid)) {
                if (visible && !visible.has(n.id)) continue
                const kids = childrenOf(n.id)
                rows.push({ n, depth, hasKids: kids.length > 0 })
                if (!n.colapsado || q) walk(n.id, depth + 1)
              }
            }
            walk(null, 0)
            const ativo = mmNodes.find(n => n.id === mmActiveId)
            return (
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <div className="pdfa-mm-head">
                  <button className={'pdfa-btn' + (captureMode ? ' on' : '')} disabled={!pdfName}
                    onClick={() => { setCaptureMode(v => !v); if (clipMode) setClipMode(false); window.getSelection()?.removeAllRanges() }}
                    title="Liga o mouse de captura: arraste um retângulo sobre o texto (ou clique numa palavra)">
                    {captureMode ? '🖱️ Capturando…' : '🖱️ Ativar captura'}
                  </button>
                  <div className="pdfa-mm-active" title="Novas capturas entram como filho deste nó. Clique num nó da árvore para trocar.">
                    {ativo ? <>→ filho de <b>{ativo.texto}</b></> : <>→ como <b>tópico (raiz)</b></>}
                  </div>
                  {mmActiveId && <button className="pdfa-btn icon" onClick={() => setMmActiveId(null)} title="Voltar a capturar na raiz">⤴ Raiz</button>}
                  <span className="grow" />
                  {mmNodes.length > 0 && <button className="pdfa-btn icon" title="Limpar todo o mapa"
                    onClick={() => { if (confirm('Apagar todo o mapa mental deste PDF?')) { mmSnapshot(); setMmNodes([]); setMmActiveId(null) } }}>🗑</button>}
                </div>
                <div className="pdfa-mm-bar">
                  <div className="find">
                    <span style={{ color: 'var(--pa-faint)', fontSize: '.8rem' }}>🔍</span>
                    <input placeholder="Buscar nó…" value={mmQuery} onChange={e => setMmQuery(e.target.value)} />
                    {mmQuery && <span style={{ cursor: 'pointer', color: 'var(--pa-faint)' }} onClick={() => setMmQuery('')}>✕</span>}
                  </div>
                  <button className="pdfa-btn icon" onClick={mmUndo} title="Desfazer (Ctrl+Z)">↶</button>
                  <button className="pdfa-btn icon" onClick={mmRedo} title="Refazer (Ctrl+Y)">↷</button>
                  <button className="pdfa-btn icon" onClick={() => mmAddChild(null)} disabled={!pdfName} title="Novo tópico manual (raiz)">＋</button>
                  <div style={{ position: 'relative' }}>
                    <button className={'pdfa-btn' + (mmExportOpen ? ' on' : '')} disabled={mmNodes.length === 0}
                      onClick={() => setMmExportOpen(v => !v)} title="Exportar o mapa">⤓ Exportar</button>
                    {mmExportOpen && (
                      <div className="pdfa-mm-ctx" style={{ position: 'absolute', right: 0, top: '110%', left: 'auto' }} onMouseLeave={() => setMmExportOpen(false)}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '5px 9px', fontSize: '.74rem', color: 'var(--pa-dim)', cursor: 'pointer' }}>
                          <input type="checkbox" checked={mmIncluirPag} onChange={e => setMmIncluirPag(e.target.checked)} /> incluir páginas (p. N)
                        </label>
                        <div className="div" />
                        <button onClick={() => mmDoExport('md')}>⬇ Markdown hierárquico</button>
                        <button onClick={() => mmDoExport('mdbadge')}>⬇ Markdown com badges</button>
                        <button onClick={() => mmDoExport('txt')}>⬇ Texto indentado (.txt)</button>
                        <button onClick={() => mmDoExport('outline')}>⬇ Outline numerado</button>
                        <button onClick={() => mmDoExport('json')}>⬇ JSON (round-trip)</button>
                        <button onClick={() => mmDoExport('opml')}>⬇ OPML (MindNode/XMind)</button>
                        <button onClick={() => mmDoExport('anki')}>⬇ Anki / Flashcards (TSV)</button>
                        <button onClick={mmExportMapaPDF}>⬇ PDF visual do mapa</button>
                        <div className="div" />
                        <button onClick={() => mmDoExport('copy')}>📋 Copiar Markdown</button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="pdfa-mm-tree"
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); const d = mmDragNodeRef.current; mmDragNodeRef.current = null; setMmDropTarget(null); /* solto no vazio = vira raiz no fim */ if (d) { const tops = mmNodesRef.current.filter(n => n.paiId === null); if (tops.length) mmMove(d, tops[tops.length - 1].id, 'after') } }}>
                  {rows.length === 0
                    ? <div className="pdfa-mm-empty">
                        <div style={{ fontSize: 30 }}>🌲</div>
                        <b style={{ color: 'var(--pa-dim)' }}>{q ? 'Nada encontrado' : 'Mapa vazio'}</b>
                        <span style={{ fontSize: '.8rem', maxWidth: 420, lineHeight: 1.5 }}>
                          {q ? 'Tente outro termo.' : pdfName ? <>Clique em <b>🖱️ Ativar captura</b> e <b>arraste um retângulo</b> sobre o texto do PDF. Escolha o tipo no menu que abre.</> : 'Importe um PDF para começar a capturar.'}
                        </span>
                      </div>
                    : rows.map(({ n, depth, hasKids }) => {
                        const tp = MM_TIPO[n.tipo] || MM_TIPO['nota']
                        const dt = mmDropTarget && mmDropTarget.id === n.id ? mmDropTarget.zone : null
                        return (
                          <div key={n.id}
                            className={'pdfa-mm-row' + (n.id === mmActiveId ? ' active' : '') + (dt ? ' drop-' + dt : '')}
                            style={{ marginLeft: depth * 16 }}
                            draggable={mmRename !== n.id}
                            onDragStart={(e) => { mmDragNodeRef.current = n.id; e.dataTransfer.effectAllowed = 'move' }}
                            onDragEnd={() => { mmDragNodeRef.current = null; setMmDropTarget(null) }}
                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); if (mmDragNodeRef.current === n.id) return; const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); const rel = (e.clientY - r.top) / r.height; const zone = rel < 0.28 ? 'before' : rel > 0.72 ? 'after' : 'into'; setMmDropTarget({ id: n.id, zone }) }}
                            onDrop={(e) => { e.preventDefault(); e.stopPropagation(); const d = mmDragNodeRef.current; mmDragNodeRef.current = null; const zone = (mmDropTarget && mmDropTarget.id === n.id ? mmDropTarget.zone : 'into'); setMmDropTarget(null); if (d) mmMove(d, n.id, zone) }}
                            onClick={() => { if (mmRename !== n.id) setMmActiveId(n.id) }}
                            onContextMenu={(e) => { e.preventDefault(); setMmCtx({ x: Math.min(e.clientX, window.innerWidth - 200), y: Math.min(e.clientY, window.innerHeight - 330), id: n.id }) }}
                            title="Clique = nó-pai ativo · 2 cliques = renomear · arraste = re-aninhar · botão direito = menu">
                            <span className="pdfa-mm-fold" onClick={(e) => { e.stopPropagation(); if (hasKids) mmToggleCollapse(n.id) }}>
                              {hasKids ? (n.colapsado ? '▸' : '▾') : '•'}
                            </span>
                            <span className="pdfa-mm-badge" style={{ background: tp.cor }} title={tp.label}>{tp.sigla}</span>
                            {mmRename === n.id
                              ? <input className="pdfa-mm-rename" autoFocus defaultValue={n.texto}
                                  onClick={e => e.stopPropagation()}
                                  onBlur={e => mmRenameCommit(n.id, (e.target as HTMLInputElement).value)}
                                  onKeyDown={e => { if (e.key === 'Enter') mmRenameCommit(n.id, (e.target as HTMLInputElement).value); else if (e.key === 'Escape') setMmRename(null) }} />
                              : <span className="pdfa-mm-txt" onDoubleClick={(e) => { e.stopPropagation(); setMmRename(n.id) }}>{n.texto}</span>}
                            {n.pagina && <span className="pdfa-mm-pg" onClick={(e) => { e.stopPropagation(); mmGotoPage(n.pagina) }} title="Voltar à origem (página no PDF)">p.{n.pagina}</span>}
                            <button className="pdfa-mm-x" onClick={(e) => { e.stopPropagation(); mmDeleteNode(n.id) }} title="Excluir nó (e filhos)">×</button>
                          </div>
                        )
                      })}
                </div>
              </div>
            )
          })()}

          {/* ── MAPA (visual) — scaffold; conteúdo na Etapa 5 ── */}
          {bottomView === 'mapa' && (() => {
            // layout horizontal (raiz à esquerda) respeitando colapso
            const BW = 172, BH = 30, COL = BW + 56, ROW = 40, PAD = 24
            const pos: Record<string, { x: number; y: number; n: any }> = {}
            const edges: { from: string; to: string }[] = []
            let leaf = 0, maxDepth = 0
            const layout = (pid: string | null, depth: number): number => {
              const kids = mmChildrenOf(mmNodes, pid)
              if (depth > maxDepth) maxDepth = depth
              if (!kids.length) return -1
              const ys: number[] = []
              for (const n of kids) {
                let y: number
                const hasKids = mmChildrenOf(mmNodes, n.id).length > 0
                if (n.colapsado || !hasKids) { y = leaf * ROW; leaf++ }
                else { y = layout(n.id, depth + 1) }
                pos[n.id] = { x: depth * COL, y, n }
                if (pid) edges.push({ from: pid, to: n.id })
                ys.push(y)
              }
              return ys.reduce((a, b) => a + b, 0) / ys.length
            }
            layout(null, 0)
            const ids = Object.keys(pos)
            const W = (maxDepth + 1) * COL + PAD * 2
            const H = Math.max(leaf, 1) * ROW + PAD * 2
            return (
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                <div className="pdfa-mm-bar">
                  <span style={{ fontSize: '.74rem', color: 'var(--pa-dim)', fontWeight: 700 }}>🗺 Mapa visual</span>
                  <span className="grow" style={{ flex: 1 }} />
                  <button className="pdfa-btn icon" onClick={() => setMmZoom(z => Math.max(0.4, +(z - 0.1).toFixed(2)))} title="Diminuir">－</button>
                  <span style={{ fontSize: '.72rem', color: 'var(--pa-faint)', minWidth: 38, textAlign: 'center' }}>{Math.round(mmZoom * 100)}%</span>
                  <button className="pdfa-btn icon" onClick={() => setMmZoom(z => Math.min(2.5, +(z + 0.1).toFixed(2)))} title="Aumentar">＋</button>
                  <button className="pdfa-btn icon" onClick={() => setMmZoom(1)} title="100%">⟳</button>
                  <button className="pdfa-btn" onClick={mmExportMapaPDF} disabled={ids.length === 0} title="Exportar o mapa em PDF">⤓ PDF</button>
                </div>
                <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: 'var(--pa-bg)' }}>
                  {ids.length === 0
                    ? <div className="pdfa-mm-empty" style={{ height: '100%' }}>
                        <div style={{ fontSize: 30 }}>🗺</div>
                        <b style={{ color: 'var(--pa-dim)' }}>Mapa vazio</b>
                        <span style={{ fontSize: '.8rem' }}>Capture nós na aba 🌲 Árvore para ver o mapa aqui.</span>
                      </div>
                    : <div ref={mmMapRef} style={{ width: W * mmZoom, height: H * mmZoom, background: '#ffffff', position: 'relative' }}>
                        <svg viewBox={`0 0 ${W} ${H}`} width={W * mmZoom} height={H * mmZoom} xmlns="http://www.w3.org/2000/svg">
                          {edges.map((e, i) => {
                            const a = pos[e.from], b = pos[e.to]; if (!a || !b) return null
                            const x1 = a.x + BW + PAD, y1 = a.y + BH / 2 + PAD
                            const x2 = b.x + PAD, y2 = b.y + BH / 2 + PAD
                            const mx = (x1 + x2) / 2
                            return <path key={i} d={`M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`} fill="none" stroke="#c9ccd1" strokeWidth={1.4} />
                          })}
                          {ids.map(id => {
                            const p = pos[id]; const tp = MM_TIPO[p.n.tipo] || MM_TIPO['nota']
                            const x = p.x + PAD, y = p.y + PAD
                            const label = (p.n.texto || '').length > 26 ? (p.n.texto || '').slice(0, 25) + '…' : p.n.texto
                            return (
                              <g key={id} style={{ cursor: 'pointer' }} onClick={() => { setBottomView('arvore'); setMmActiveId(id) }}>
                                <rect x={x} y={y} width={BW} height={BH} rx={7} fill={tp.cor} />
                                <text x={x + 9} y={y + 13} fill="#fff" fontSize={9} fontWeight={800} fontFamily="Arial">{tp.sigla}</text>
                                <text x={x + 9} y={y + 23} fill="#fff" fontSize={10.5} fontFamily="Arial">{label}</text>
                                {mmIncluirPag && p.n.pagina ? <text x={x + BW - 6} y={y + 11} fill="rgba(255,255,255,.85)" fontSize={8} textAnchor="end" fontFamily="Arial">p.{p.n.pagina}</text> : null}
                              </g>
                            )
                          })}
                        </svg>
                      </div>}
                </div>
              </div>
            )
          })()}
        </div>
      </div>

      {/* ════ COLUNA DIREITA: PASTAS / ANOTAÇÕES ════ */}
      <div className={'pdfa-side' + (showSide ? '' : ' hide')}>
        <div className="pdfa-side-head">
          <div className="ttl">🗂 Anotações</div>
          <div className="sub">Organize em pastas — só as anotações são salvas</div>
          <div className="pdfa-side-actions">
            <button className="pdfa-btn primary" onClick={() => newNote(noteFolderId)}>＋ Anotação</button>
            <button className="pdfa-btn" onClick={() => addFolder(null)}>＋ Pasta</button>
          </div>
        </div>
        <div className="pdfa-tree"
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const d = dragRef.current; dragRef.current = null; if (d) void moveItem(d, null) }}>
          {folders.length === 0 && notes.filter(n => !n.folderId).length === 0
            ? <div className="pdfa-tree-empty">Nenhuma anotação ainda.<br />Crie uma pasta ou comece a escrever abaixo — ela aparece aqui ao salvar.</div>
            : <FolderTree
                parentId={null} folders={folders} notes={notes} expanded={expanded}
                activeNoteId={noteId}
                onToggle={(id) => setExpanded(e => ({ ...e, [id]: !e[id] }))}
                onOpenNote={openNote} onDeleteNote={deleteNote}
                onAddFolder={addFolder} onRenameFolder={renameFolder} onDeleteFolder={deleteFolder}
                onNewNoteIn={(fid) => newNote(fid)}
                onRenameNote={async (n, title) => { if (uid) await setDoc(doc(db, 'users', uid, 'pdfNotes', n.id), { title: title || n.title }, { merge: true }) }}
                onDragStart={(payload) => { dragRef.current = payload }}
                onDropInto={(fid) => { const d = dragRef.current; dragRef.current = null; if (d) void moveItem(d, fid) }}
              />}
        </div>
      </div>

      {/* overlay de exportação + toast */}
      <div className="pdfa-overlay"><div className="card"><span className="pdfa-spin" /> Gerando PDF…</div></div>
      <div className="pdfa-toast" ref={toastRef} />
    </div>
  )
}

/* dragRef compartilhado (fora do componente para sobreviver a re-renders) */
const dragRef = { current: null as any }

/* ───────────────────────── miniaturas de páginas (lazy) ───────────────────────── */
function PageThumbs({ pdfDocRef, pdfjsRef, meta, numPages, current, onGoto, read, onToggleRead }: any) {
  const hostRef = useRef<HTMLDivElement>(null)
  const doneRef = useRef<Record<number, boolean>>({})
  useEffect(() => {
    const host = hostRef.current; if (!host || !numPages) return
    const io = new IntersectionObserver(entries => {
      entries.forEach(async e => {
        if (!e.isIntersecting) return
        const pn = Number((e.target as HTMLElement).dataset.p)
        if (doneRef.current[pn]) return
        doneRef.current[pn] = true
        const pdf = pdfDocRef.current; if (!pdf) { doneRef.current[pn] = false; return }
        try {
          const page = await pdf.getPage(pn)
          const vp0 = page.getViewport({ scale: 1 })
          const vp = page.getViewport({ scale: 158 / vp0.width })
          const cv = (e.target as HTMLElement).querySelector('canvas') as HTMLCanvasElement
          if (!cv) return
          const ratio = window.devicePixelRatio || 1
          cv.width = Math.floor(vp.width * ratio); cv.height = Math.floor(vp.height * ratio)
          cv.style.width = '100%'; cv.style.height = 'auto'
          const ctx = cv.getContext('2d'); ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
          await page.render({ canvasContext: ctx, viewport: vp }).promise
        } catch { doneRef.current[pn] = false }
      })
    }, { root: host, rootMargin: '400px 0px' })
    host.querySelectorAll('[data-p]').forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [numPages])
  /* rola a miniatura ativa para a vista */
  useEffect(() => {
    const host = hostRef.current; if (!host) return
    const el = host.querySelector(`[data-p="${current}"]`) as HTMLElement
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [current])
  return (
    <div className="pdfa-thumbs" ref={hostRef}>
      {Array.from({ length: numPages }, (_, i) => i + 1).map(pn => {
        const m = (meta || []).find((x: any) => x.pageNum === pn)
        const ar = m ? (m.h / m.w) : 1.414
        const lida = read?.has(pn)
        return (
          <div key={pn} data-p={pn} className={'pdfa-thumb' + (current === pn ? ' on' : '') + (lida ? ' read' : '')} onClick={() => onGoto(pn)} style={{ position: 'relative' }}>
            <div className="thumb-canvas" style={{ aspectRatio: `1 / ${ar.toFixed(3)}`, boxShadow: lida ? '0 0 0 2px #16a34a' : undefined }}><canvas /></div>
            <button onClick={e => { e.stopPropagation(); onToggleRead?.(pn) }} title={lida ? 'Marcar como não lida' : 'Marcar como lida'}
              style={{ position: 'absolute', top: 7, right: 9, width: 18, height: 18, borderRadius: '50%', border: `1.5px solid ${lida ? '#16a34a' : 'var(--pa-border-md)'}`, background: lida ? '#16a34a' : 'var(--pa-bg)', color: '#fff', fontSize: '0.6rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, padding: 0 }}>
              {lida ? '✓' : ''}
            </button>
            <span className="thumb-n" style={lida ? { color: '#16a34a' } : undefined}>{pn}{lida ? ' · lida' : ''}</span>
          </div>
        )
      })}
    </div>
  )
}

/* ───────────────────────── lista corrida de números de página ───────────────────────── */
function PageNumbers({ numPages, current, onGoto, read, onToggleRead }: any) {
  return (
    <div className="pdfa-pagenums">
      {Array.from({ length: numPages }, (_, i) => i + 1).map(pn => {
        const lida = read?.has(pn)
        return (
          <button key={pn} className={'pdfa-pn' + (current === pn ? ' on' : '') + (lida ? ' read' : '')}
            onClick={() => onGoto(pn)}
            onContextMenu={e => { e.preventDefault(); onToggleRead?.(pn) }}
            title={lida ? 'Lida — clique p/ ir · clique direito p/ desmarcar' : 'Clique p/ ir · clique direito p/ marcar lida'}
            style={lida ? { background: '#16a34a', borderColor: 'transparent', color: '#fff' } : undefined}>
            {lida ? '✓' : pn}
          </button>
        )
      })}
    </div>
  )
}

/* ───────────────────────── índice (outline) recursivo ───────────────────────── */
function OutlineTree({ items, onGo, depth = 0 }: any) {
  const [open, setOpen] = useState<Record<number, boolean>>({})
  return (
    <>
      {items.map((it: any, i: number) => {
        const hasKids = it.items && it.items.length
        const isOpen = open[i] ?? depth < 1
        return (
          <div key={i}>
            <div className={'pdfa-out-item' + (isOpen ? ' open' : '')}
              onClick={() => { if (hasKids) setOpen(o => ({ ...o, [i]: !isOpen })); onGo(it.dest) }}>
              <span className="tw" style={{ visibility: hasKids ? 'visible' : 'hidden' }}>▶</span>
              <span className="lbl" title={it.title}>{it.title || '—'}</span>
            </div>
            {hasKids && isOpen && <div className="pdfa-out-children"><OutlineTree items={it.items} onGo={onGo} depth={depth + 1} /></div>}
          </div>
        )
      })}
    </>
  )
}

/* ───────────────────────── árvore de pastas/anotações ───────────────────────── */
function FolderTree(props: any) {
  const { parentId, folders, notes, expanded, activeNoteId, onToggle, onOpenNote, onDeleteNote,
    onAddFolder, onRenameFolder, onDeleteFolder, onNewNoteIn, onRenameNote, onDragStart, onDropInto } = props
  const subFolders = folders.filter((f: any) => (f.parentId ?? null) === parentId).sort((a: any, b: any) => a.name.localeCompare(b.name))
  const subNotes = notes.filter((n: any) => (n.folderId ?? null) === parentId).sort((a: any, b: any) => (a.title || '').localeCompare(b.title || ''))
  return (
    <>
      {subFolders.map((f: any) => (
        <FolderRow key={f.id} folder={f} {...props} />
      ))}
      {subNotes.map((n: any) => (
        <NoteRow key={n.id} note={n} active={n.id === activeNoteId}
          onOpen={() => onOpenNote(n)} onDelete={() => onDeleteNote(n)}
          onRename={(t: string) => onRenameNote(n, t)}
          onDragStart={() => onDragStart({ type: 'note', id: n.id })} />
      ))}
    </>
  )
}

function FolderRow(props: any) {
  const { folder: f, expanded, onToggle, onAddFolder, onRenameFolder, onDeleteFolder, onNewNoteIn, onDropInto, onDragStart } = props
  const open = !!expanded[f.id]
  const [renaming, setRenaming] = useState(false)
  const [dropHover, setDropHover] = useState(false)
  return (
    <div>
      <div className={'pdfa-row' + (open ? ' open' : '') + (dropHover ? ' drop-target' : '')}
        draggable={!renaming}
        onDragStart={e => { e.stopPropagation(); onDragStart({ type: 'folder', id: f.id }) }}
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDropHover(true) }}
        onDragLeave={() => setDropHover(false)}
        onDrop={e => { e.preventDefault(); e.stopPropagation(); setDropHover(false); onDropInto(f.id) }}
        onClick={() => !renaming && onToggle(f.id)}>
        <span className="tw">▶</span>
        <span className="ico">📁</span>
        {renaming
          ? <input className="rename" autoFocus defaultValue={f.name}
              onClick={e => e.stopPropagation()}
              onBlur={e => { onRenameFolder(f, e.target.value.trim()); setRenaming(false) }}
              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(false) }} />
          : <span className="lbl">{f.name}</span>}
        <span className="mini" title="Nova anotação aqui" onClick={e => { e.stopPropagation(); onNewNoteIn(f.id) }}>＋▤</span>
        <span className="mini" title="Nova subpasta" onClick={e => { e.stopPropagation(); onAddFolder(f.id) }}>＋📁</span>
        <span className="mini" title="Renomear" onClick={e => { e.stopPropagation(); setRenaming(true) }}>✎</span>
        <span className="mini" title="Excluir" onClick={e => { e.stopPropagation(); onDeleteFolder(f) }}>🗑</span>
      </div>
      {open && <div className="pdfa-children"><FolderTree {...props} parentId={f.id} /></div>}
    </div>
  )
}

function NoteRow({ note, active, onOpen, onDelete, onRename, onDragStart }: any) {
  const [renaming, setRenaming] = useState(false)
  return (
    <div className={'pdfa-row' + (active ? ' active' : '')}
      draggable={!renaming}
      onDragStart={e => { e.stopPropagation(); onDragStart() }}
      onClick={() => !renaming && onOpen()}>
      <span className="tw" style={{ visibility: 'hidden' }}>▶</span>
      <span className="ico">📝</span>
      {renaming
        ? <input className="rename" autoFocus defaultValue={note.title}
            onClick={e => e.stopPropagation()}
            onBlur={e => { onRename(e.target.value.trim()); setRenaming(false) }}
            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setRenaming(false) }} />
        : <span className="lbl">{note.title || 'Sem título'}</span>}
      <span className="mini" title="Renomear" onClick={e => { e.stopPropagation(); setRenaming(true) }}>✎</span>
      <span className="mini" title="Excluir" onClick={e => { e.stopPropagation(); onDelete() }}>🗑</span>
    </div>
  )
}
