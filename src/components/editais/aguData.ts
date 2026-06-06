export interface Subtopico {
  id: string
  nome: string
}

export interface Topico {
  id: string
  nome: string
  subtopicos: Subtopico[]
}

export interface Disciplina {
  id: string
  nome: string
  cor: string
  topicos: Topico[]
}

export const AGU_DISCIPLINAS: Disciplina[] = [
  {
    id: 'constitucional',
    nome: 'Direito Constitucional',
    cor: '#534AB7',
    topicos: [
      { id: 'dc1', nome: 'Princípios Fundamentais', subtopicos: [
        { id: 'dc1.1', nome: 'Fundamentos da República' },
        { id: 'dc1.2', nome: 'Objetivos fundamentais' },
        { id: 'dc1.3', nome: 'Princípios das relações internacionais' },
      ]},
      { id: 'dc2', nome: 'Direitos e Garantias Fundamentais', subtopicos: [
        { id: 'dc2.1', nome: 'Direitos individuais e coletivos' },
        { id: 'dc2.2', nome: 'Direitos sociais' },
        { id: 'dc2.3', nome: 'Nacionalidade' },
        { id: 'dc2.4', nome: 'Direitos políticos' },
        { id: 'dc2.5', nome: 'Partidos políticos' },
      ]},
      { id: 'dc3', nome: 'Organização do Estado', subtopicos: [
        { id: 'dc3.1', nome: 'Organização político-administrativa' },
        { id: 'dc3.2', nome: 'União, Estados, DF e Municípios' },
        { id: 'dc3.3', nome: 'Intervenção federal e estadual' },
      ]},
      { id: 'dc4', nome: 'Organização dos Poderes', subtopicos: [
        { id: 'dc4.1', nome: 'Poder Legislativo' },
        { id: 'dc4.2', nome: 'Poder Executivo' },
        { id: 'dc4.3', nome: 'Poder Judiciário' },
        { id: 'dc4.4', nome: 'Funções essenciais à Justiça' },
      ]},
      { id: 'dc5', nome: 'Controle de Constitucionalidade', subtopicos: [
        { id: 'dc5.1', nome: 'Controle difuso e concentrado' },
        { id: 'dc5.2', nome: 'ADI, ADC, ADPF, ADO' },
        { id: 'dc5.3', nome: 'Efeitos das decisões' },
      ]},
      { id: 'dc6', nome: 'Ordem Econômica e Financeira', subtopicos: [
        { id: 'dc6.1', nome: 'Princípios da ordem econômica' },
        { id: 'dc6.2', nome: 'Política urbana, agrícola e financeira' },
      ]},
    ],
  },
  {
    id: 'administrativo',
    nome: 'Direito Administrativo',
    cor: '#0F6E56',
    topicos: [
      { id: 'da1', nome: 'Princípios da Administração Pública', subtopicos: [
        { id: 'da1.1', nome: 'Legalidade, impessoalidade, moralidade, publicidade, eficiência' },
        { id: 'da1.2', nome: 'Princípios implícitos' },
      ]},
      { id: 'da2', nome: 'Atos Administrativos', subtopicos: [
        { id: 'da2.1', nome: 'Conceito, requisitos e classificação' },
        { id: 'da2.2', nome: 'Atributos dos atos administrativos' },
        { id: 'da2.3', nome: 'Extinção dos atos: revogação e anulação' },
      ]},
      { id: 'da3', nome: 'Poderes Administrativos', subtopicos: [
        { id: 'da3.1', nome: 'Poder hierárquico e disciplinar' },
        { id: 'da3.2', nome: 'Poder regulamentar e de polícia' },
        { id: 'da3.3', nome: 'Abuso de poder' },
      ]},
      { id: 'da4', nome: 'Licitações e Contratos (Lei 14.133/2021)', subtopicos: [
        { id: 'da4.1', nome: 'Princípios e modalidades' },
        { id: 'da4.2', nome: 'Dispensa e inexigibilidade' },
        { id: 'da4.3', nome: 'Contratos administrativos' },
        { id: 'da4.4', nome: 'Alteração, rescisão e sanções' },
      ]},
      { id: 'da5', nome: 'Serviços Públicos', subtopicos: [
        { id: 'da5.1', nome: 'Conceito e classificação' },
        { id: 'da5.2', nome: 'Concessão e permissão' },
        { id: 'da5.3', nome: 'Parcerias público-privadas' },
      ]},
      { id: 'da6', nome: 'Bens Públicos', subtopicos: [
        { id: 'da6.1', nome: 'Classificação e regime jurídico' },
        { id: 'da6.2', nome: 'Uso dos bens públicos' },
      ]},
      { id: 'da7', nome: 'Responsabilidade Civil do Estado', subtopicos: [
        { id: 'da7.1', nome: 'Teoria do risco administrativo' },
        { id: 'da7.2', nome: 'Ação regressiva' },
        { id: 'da7.3', nome: 'Responsabilidade por omissão' },
      ]},
      { id: 'da8', nome: 'Improbidade Administrativa (Lei 8.429/1992)', subtopicos: [
        { id: 'da8.1', nome: 'Atos de improbidade e sanções' },
        { id: 'da8.2', nome: 'Alterações da Lei 14.230/2021' },
        { id: 'da8.3', nome: 'Acordo de não persecução cível' },
      ]},
      { id: 'da9', nome: 'Controle da Administração', subtopicos: [
        { id: 'da9.1', nome: 'Controle interno e externo' },
        { id: 'da9.2', nome: 'Controle pelo TCU' },
        { id: 'da9.3', nome: 'Controle judicial' },
      ]},
    ],
  },
  {
    id: 'financeiro',
    nome: 'Direito Financeiro e Econômico',
    cor: '#854F0B',
    topicos: [
      { id: 'df1', nome: 'Orçamento Público', subtopicos: [
        { id: 'df1.1', nome: 'PPA, LDO e LOA' },
        { id: 'df1.2', nome: 'Créditos orçamentários e adicionais' },
        { id: 'df1.3', nome: 'Execução orçamentária' },
      ]},
      { id: 'df2', nome: 'Lei de Responsabilidade Fiscal', subtopicos: [
        { id: 'df2.1', nome: 'Metas fiscais e limites de despesas' },
        { id: 'df2.2', nome: 'Dívida pública e operações de crédito' },
      ]},
      { id: 'df3', nome: 'Direito Econômico', subtopicos: [
        { id: 'df3.1', nome: 'Ordem econômica constitucional' },
        { id: 'df3.2', nome: 'Defesa da concorrência (Lei 12.529/2011)' },
        { id: 'df3.3', nome: 'Regulação econômica e agências reguladoras' },
      ]},
    ],
  },
  {
    id: 'tributario',
    nome: 'Direito Tributário',
    cor: '#993C1D',
    topicos: [
      { id: 'dt1', nome: 'Sistema Tributário Nacional', subtopicos: [
        { id: 'dt1.1', nome: 'Princípios tributários constitucionais' },
        { id: 'dt1.2', nome: 'Limitações ao poder de tributar' },
        { id: 'dt1.3', nome: 'Competência tributária' },
      ]},
      { id: 'dt2', nome: 'Obrigação Tributária', subtopicos: [
        { id: 'dt2.1', nome: 'Fato gerador, sujeitos e base de cálculo' },
        { id: 'dt2.2', nome: 'Crédito tributário e lançamento' },
        { id: 'dt2.3', nome: 'Suspensão, extinção e exclusão' },
      ]},
      { id: 'dt3', nome: 'Administração Tributária', subtopicos: [
        { id: 'dt3.1', nome: 'Fiscalização e dívida ativa' },
        { id: 'dt3.2', nome: 'Certidões negativas' },
      ]},
      { id: 'dt4', nome: 'Tributos em Espécie', subtopicos: [
        { id: 'dt4.1', nome: 'Impostos federais (IR, IPI, IOF, II, IE)' },
        { id: 'dt4.2', nome: 'Contribuições sociais e CIDE' },
        { id: 'dt4.3', nome: 'ICMS e ISS — aspectos gerais' },
      ]},
    ],
  },
  {
    id: 'legislacao_agu',
    nome: 'Legislação AGU e Governança',
    cor: '#185FA5',
    topicos: [
      { id: 'lag1', nome: 'Legislação da AGU', subtopicos: [
        { id: 'lag1.1', nome: 'LC 73/1993 — Lei Orgânica da AGU' },
        { id: 'lag1.2', nome: 'Lei 9.028/1995 e alterações' },
        { id: 'lag1.3', nome: 'Estatuto da OAB — aspectos relevantes' },
      ]},
      { id: 'lag2', nome: 'Gestão de Conflitos e Meios Alternativos', subtopicos: [
        { id: 'lag2.1', nome: 'Câmaras de prevenção e resolução administrativa' },
        { id: 'lag2.2', nome: 'Mediação e conciliação na AGU' },
        { id: 'lag2.3', nome: 'Lei de Mediação (Lei 13.140/2015)' },
      ]},
      { id: 'lag3', nome: 'Governança Pública', subtopicos: [
        { id: 'lag3.1', nome: 'Integridade e compliance público' },
        { id: 'lag3.2', nome: 'Controles internos e gestão de riscos' },
      ]},
    ],
  },
  {
    id: 'ambiental',
    nome: 'Direito Ambiental',
    cor: '#3B6D11',
    topicos: [
      { id: 'dam1', nome: 'Fundamentos do Direito Ambiental', subtopicos: [
        { id: 'dam1.1', nome: 'Princípios ambientais' },
        { id: 'dam1.2', nome: 'Competências ambientais' },
        { id: 'dam1.3', nome: 'SISNAMA e SNUC' },
      ]},
      { id: 'dam2', nome: 'Responsabilidade Ambiental', subtopicos: [
        { id: 'dam2.1', nome: 'Responsabilidade civil, administrativa e penal' },
        { id: 'dam2.2', nome: 'Lei de Crimes Ambientais (Lei 9.605/1998)' },
      ]},
      { id: 'dam3', nome: 'Instrumentos de Proteção Ambiental', subtopicos: [
        { id: 'dam3.1', nome: 'Licenciamento ambiental' },
        { id: 'dam3.2', nome: 'EIA/RIMA' },
        { id: 'dam3.3', nome: 'Código Florestal (Lei 12.651/2012)' },
      ]},
    ],
  },
  {
    id: 'civil',
    nome: 'Direito Civil',
    cor: '#72243E',
    topicos: [
      { id: 'dcv1', nome: 'Parte Geral', subtopicos: [
        { id: 'dcv1.1', nome: 'Pessoas naturais e jurídicas' },
        { id: 'dcv1.2', nome: 'Bens e fatos jurídicos' },
        { id: 'dcv1.3', nome: 'Negócio jurídico e defeitos' },
        { id: 'dcv1.4', nome: 'Prescrição e decadência' },
      ]},
      { id: 'dcv2', nome: 'Obrigações e Contratos', subtopicos: [
        { id: 'dcv2.1', nome: 'Modalidades de obrigações' },
        { id: 'dcv2.2', nome: 'Contratos em geral' },
        { id: 'dcv2.3', nome: 'Contratos em espécie' },
        { id: 'dcv2.4', nome: 'Responsabilidade civil' },
      ]},
      { id: 'dcv3', nome: 'Direitos Reais', subtopicos: [
        { id: 'dcv3.1', nome: 'Posse e propriedade' },
        { id: 'dcv3.2', nome: 'Direitos reais de gozo e garantia' },
        { id: 'dcv3.3', nome: 'Usucapião' },
      ]},
      { id: 'dcv4', nome: 'Família e Sucessões', subtopicos: [
        { id: 'dcv4.1', nome: 'Casamento, união estável e dissolução' },
        { id: 'dcv4.2', nome: 'Alimentos e guarda' },
        { id: 'dcv4.3', nome: 'Sucessão legítima e testamentária' },
      ]},
    ],
  },
  {
    id: 'processual_civil',
    nome: 'Direito Processual Civil',
    cor: '#444441',
    topicos: [
      { id: 'dpc1', nome: 'Parte Geral do CPC', subtopicos: [
        { id: 'dpc1.1', nome: 'Normas fundamentais e jurisdição' },
        { id: 'dpc1.2', nome: 'Competência' },
        { id: 'dpc1.3', nome: 'Partes, procuradores e litisconsórcio' },
        { id: 'dpc1.4', nome: 'Atos processuais e prazos' },
      ]},
      { id: 'dpc2', nome: 'Processo de Conhecimento', subtopicos: [
        { id: 'dpc2.1', nome: 'Petição inicial e resposta' },
        { id: 'dpc2.2', nome: 'Audiências e provas' },
        { id: 'dpc2.3', nome: 'Sentença e coisa julgada' },
      ]},
      { id: 'dpc3', nome: 'Recursos', subtopicos: [
        { id: 'dpc3.1', nome: 'Apelação, agravo e embargos' },
        { id: 'dpc3.2', nome: 'REsp e RE — repercussão geral e IRDR' },
        { id: 'dpc3.3', nome: 'Remessa necessária' },
      ]},
      { id: 'dpc4', nome: 'Processo de Execução e Cautelar', subtopicos: [
        { id: 'dpc4.1', nome: 'Execução por título judicial e extrajudicial' },
        { id: 'dpc4.2', nome: 'Tutelas provisórias' },
        { id: 'dpc4.3', nome: 'Cumprimento de sentença contra a Fazenda' },
      ]},
      { id: 'dpc5', nome: 'Fazenda Pública em Juízo', subtopicos: [
        { id: 'dpc5.1', nome: 'Prerrogativas processuais da Fazenda' },
        { id: 'dpc5.2', nome: 'Precatórios e RPV' },
        { id: 'dpc5.3', nome: 'Ação popular e ACP' },
      ]},
    ],
  },
  {
    id: 'empresarial',
    nome: 'Direito Empresarial',
    cor: '#5F5E5A',
    topicos: [
      { id: 'de1', nome: 'Teoria Geral da Empresa', subtopicos: [
        { id: 'de1.1', nome: 'Empresário e estabelecimento' },
        { id: 'de1.2', nome: 'Registro empresarial' },
      ]},
      { id: 'de2', nome: 'Sociedades Empresárias', subtopicos: [
        { id: 'de2.1', nome: 'Tipos societários e responsabilidade' },
        { id: 'de2.2', nome: 'Sociedade anônima' },
        { id: 'de2.3', nome: 'Desconsideração da personalidade jurídica' },
      ]},
      { id: 'de3', nome: 'Recuperação e Falência', subtopicos: [
        { id: 'de3.1', nome: 'Recuperação judicial e extrajudicial' },
        { id: 'de3.2', nome: 'Falência — processo e efeitos' },
      ]},
    ],
  },
  {
    id: 'internacional',
    nome: 'Direito Internacional Público e Privado',
    cor: '#0C447C',
    topicos: [
      { id: 'di1', nome: 'Direito Internacional Público', subtopicos: [
        { id: 'di1.1', nome: 'Fontes e sujeitos do DIP' },
        { id: 'di1.2', nome: 'Tratados internacionais' },
        { id: 'di1.3', nome: 'Responsabilidade internacional do Estado' },
        { id: 'di1.4', nome: 'Solução pacífica de controvérsias' },
      ]},
      { id: 'di2', nome: 'Direito Internacional Privado', subtopicos: [
        { id: 'di2.1', nome: 'LINDB e conflito de leis' },
        { id: 'di2.2', nome: 'Cooperação jurídica internacional' },
        { id: 'di2.3', nome: 'Homologação de sentença estrangeira' },
      ]},
    ],
  },
  {
    id: 'penal',
    nome: 'Direito Penal e Processual Penal',
    cor: '#A32D2D',
    topicos: [
      { id: 'dp1', nome: 'Direito Penal — Parte Geral', subtopicos: [
        { id: 'dp1.1', nome: 'Princípios penais e lei penal' },
        { id: 'dp1.2', nome: 'Teoria do crime' },
        { id: 'dp1.3', nome: 'Culpabilidade e causas excludentes' },
        { id: 'dp1.4', nome: 'Penas e sua aplicação' },
      ]},
      { id: 'dp2', nome: 'Direito Penal — Parte Especial', subtopicos: [
        { id: 'dp2.1', nome: 'Crimes contra a Administração Pública' },
        { id: 'dp2.2', nome: 'Lei de Improbidade — aspectos penais' },
        { id: 'dp2.3', nome: 'Crimes contra a ordem tributária' },
        { id: 'dp2.4', nome: 'Lavagem de dinheiro (Lei 9.613/1998)' },
      ]},
      { id: 'dp3', nome: 'Direito Processual Penal', subtopicos: [
        { id: 'dp3.1', nome: 'Inquérito policial e ação penal' },
        { id: 'dp3.2', nome: 'Provas e nulidades' },
        { id: 'dp3.3', nome: 'Medidas cautelares pessoais' },
        { id: 'dp3.4', nome: 'Recursos em espécie' },
      ]},
    ],
  },
  {
    id: 'trabalho',
    nome: 'Direito do Trabalho e Processual do Trabalho',
    cor: '#639922',
    topicos: [
      { id: 'dtr1', nome: 'Direito do Trabalho', subtopicos: [
        { id: 'dtr1.1', nome: 'Princípios e fontes do DT' },
        { id: 'dtr1.2', nome: 'Contrato de trabalho' },
        { id: 'dtr1.3', nome: 'Duração do trabalho e salário' },
        { id: 'dtr1.4', nome: 'Rescisão contratual e FGTS' },
      ]},
      { id: 'dtr2', nome: 'Direito Processual do Trabalho', subtopicos: [
        { id: 'dtr2.1', nome: 'Organização da Justiça do Trabalho' },
        { id: 'dtr2.2', nome: 'Processo e recurso trabalhistas' },
        { id: 'dtr2.3', nome: 'Execução trabalhista' },
      ]},
    ],
  },
  {
    id: 'previdenciario',
    nome: 'Direito Previdenciário',
    cor: '#BA7517',
    topicos: [
      { id: 'dpv1', nome: 'Seguridade Social', subtopicos: [
        { id: 'dpv1.1', nome: 'Princípios e custeio da seguridade' },
        { id: 'dpv1.2', nome: 'Contribuições previdenciárias' },
      ]},
      { id: 'dpv2', nome: 'Benefícios Previdenciários', subtopicos: [
        { id: 'dpv2.1', nome: 'Aposentadorias e reforma (EC 103/2019)' },
        { id: 'dpv2.2', nome: 'Auxílios, salário-maternidade e pensão' },
        { id: 'dpv2.3', nome: 'Regime Próprio de Previdência' },
      ]},
    ],
  },
  {
    id: 'raciocinio',
    nome: 'Raciocínio Lógico e Português Jurídico',
    cor: '#7F77DD',
    topicos: [
      { id: 'rl1', nome: 'Raciocínio Lógico', subtopicos: [
        { id: 'rl1.1', nome: 'Proposições e conectivos lógicos' },
        { id: 'rl1.2', nome: 'Argumentação e inferências' },
        { id: 'rl1.3', nome: 'Lógica de predicados' },
      ]},
      { id: 'rl2', nome: 'Português Jurídico', subtopicos: [
        { id: 'rl2.1', nome: 'Interpretação de texto jurídico' },
        { id: 'rl2.2', nome: 'Redação oficial e técnica' },
        { id: 'rl2.3', nome: 'Gramática aplicada ao Direito' },
      ]},
    ],
  },
]

export const TOTAL_SUBTOPICOS = AGU_DISCIPLINAS.reduce(
  (acc, d) => acc + d.topicos.reduce((a, t) => a + t.subtopicos.length, 0), 0
)
