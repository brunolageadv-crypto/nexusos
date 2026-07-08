# Nexus Links — Conexões estilo Obsidian no PDF Reader

Camada de **edição avançada** adicionada ao PDF Reader do NexusOS, inspirada no
Obsidian. Tudo autocontido em `NexusLinks.tsx` (zero dependências novas — só React
+ SVG/Canvas) e ligado ao `PDFReader.tsx` existente com edições mínimas.

## O que foi entregue

### 1. Links `[[wiki]]` + Backlinks
- Digite `[[` no editor de notas ("Palavras Destacadas") para abrir o
  **autocompletar**. Sugere todos os documentos pelo título.
- Também aceita alvos especiais:
  - `[[página 42]]` → link para uma página do PDF (clique salta para a página).
  - `[[https://...]]` → link externo (abre em nova aba).
- Navegação pelo popup: `↑` `↓` para escolher, `Enter`/`Tab` para inserir, `Esc` fecha.
- Links viram elementos clicáveis dentro do editor. Clicar num link de documento
  **abre** o documento; num link de página, **salta** no PDF.
- **Painel de Conexões** (botão `🔗 Conexões → 📎 Backlinks`):
  - **Links de saída**: o que o documento atual referencia.
  - **Backlinks**: quais documentos citam o documento atual (bidirecional).
  - **Contador de referências** (`🔗N`) por documento.

### 2. Grafo de Conectores (`🔗 Conexões → 🕸 Grafo`, ou `Ctrl+G`)
- Grafo *force-directed* renderizado em **SVG puro** (sem D3/vis.js).
- Cada documento é um **nó**; o **tamanho** é proporcional ao nº de conexões e a
  **cor** vem da cor da pasta.
- Escopos: **Global** (todas as notas) e **Local** (nó atual + vizinhos).
- Interação: **scroll** = zoom · **arrastar o fundo** = pan · **arrastar um nó** =
  reposiciona/fixa · **clique** = modo foco (destaca o nó e suas ligações) ·
  **duplo-clique** = abre o documento.
- **Filtro** por título (realça os que casam, esmaece o resto).
- **Linhas contínuas** = conexão interna (mesma pasta) · **tracejadas** = externa
  (pasta diferente). A **espessura** cresce com a força (nº de citações).
- **Exportar** o grafo como **PNG** e **SVG**.
- Tooltip por nó (título + nº de conexões) e legenda no canto.

### 3. Modos de Visualização + Expandir/Recolher (no painel de Conexões)
- **Compacto** (só títulos) · **Detalhado** (título + preview de 3 linhas) ·
  **Completo** (conteúdo renderizado).
- Alterna com `Ctrl+M` (cicla os três modos).
- **Expandir todos** (`▼`) / **Recolher todos** (`▶`) das pastas.
- O modo escolhido é **lembrado** entre sessões (localStorage).

## Atalhos de teclado
| Atalho | Ação |
|---|---|
| `[[` | Abre o autocompletar de links no editor |
| `Ctrl+L` | Insere um link no cursor |
| `Ctrl+G` | Abre/fecha o grafo de conectores |
| `Ctrl+M` | Cicla os modos de visualização (painel de Conexões) |
| `↑ ↓ Enter Tab Esc` | Navegação do popup de autocompletar |

## Como os dados funcionam (sem migração)
Nada muda no modelo do Firestore. Os links são gravados **dentro do HTML da nota**
como `<a class="nx-wikilink" data-doc="ID">[[Título]]</a>`, então continuam sendo
salvos pelo autosave já existente (`users/{uid}/pdfReaderDocs/{id}.html`).
O grafo e os backlinks são **derivados em tempo real** desse HTML — nenhuma coleção
nova, nenhuma escrita extra.

Links digitados à mão como texto puro `[[Título]]` também são reconhecidos
(casados por título) no grafo e nos backlinks.

## Arquivos
- `NexusLinks.tsx` — **novo**. Todo o recurso: `useWikiLinks` (hook do editor),
  `ConexoesPanel` (painel/backlinks/modos), `GrafoConectores` (grafo SVG) e
  utilitários (`extrairLinks`, `construirGrafo`, `calcularBacklinks`, `WIKILINK_CSS`).
- `PDFReader.tsx` — **editado** (aditivo): import do módulo; estado
  `grafoOpen`/`conexoesOpen`; hook `useWikiLinks`; menu suspenso **🔗 Conexões** na
  barra do editor; atalhos `Ctrl+G`/`Ctrl+L`; render do painel, do grafo e do
  overlay de autocomplete; injeção do CSS dos links.

## Notas técnicas
- Zero dependências novas: mantém o `package.json` intacto.
- O grafo usa uma simulação de forças própria (repulsão O(n²) + molas nas arestas +
  força de centro), com ~480 iterações e resfriamento; adequado para centenas de nós.
- Ambos os arquivos usam `@ts-nocheck` (padrão do módulo), coerente com o restante
  do PDF Reader. Verificado com parsing TS+JSX (esbuild) sem erros.
