export interface Subtopico { id: string; nome: string }
export interface Topico { id: string; nome: string; subtopicos: Subtopico[] }
export interface Disciplina { id: string; nome: string; cor: string; topicos: Topico[] }

export const AGU_DISCIPLINAS: Disciplina[] = [

  /* ═══ 1. DIREITO CONSTITUCIONAL ═══════════════════════════ */
  { id:'dc', nome:'Direito Constitucional', cor:'#4f46e5', topicos:[
    { id:'dc1', nome:'Teoria da Constituição', subtopicos:[
      { id:'dc1.1', nome:'Conceito, classificações e elementos da Constituição' },
      { id:'dc1.2', nome:'Poder constituinte originário e derivado' },
      { id:'dc1.3', nome:'Eficácia e aplicabilidade das normas constitucionais' },
      { id:'dc1.4', nome:'Interpretação e hermenêutica constitucional' },
      { id:'dc1.5', nome:'Mutação constitucional' },
    ]},
    { id:'dc2', nome:'Princípios Fundamentais', subtopicos:[
      { id:'dc2.1', nome:'Fundamentos da República Federativa do Brasil' },
      { id:'dc2.2', nome:'Objetivos fundamentais da República' },
      { id:'dc2.3', nome:'Princípios das relações internacionais' },
    ]},
    { id:'dc3', nome:'Direitos e Garantias Fundamentais', subtopicos:[
      { id:'dc3.1', nome:'Teoria geral dos direitos fundamentais' },
      { id:'dc3.2', nome:'Direitos individuais e coletivos — art. 5º CF' },
      { id:'dc3.3', nome:'Remédios constitucionais: HC, MS, MI, HD, AP' },
      { id:'dc3.4', nome:'Direitos sociais — arts. 6º a 11' },
      { id:'dc3.5', nome:'Nacionalidade' },
      { id:'dc3.6', nome:'Direitos políticos e partidos políticos' },
    ]},
    { id:'dc4', nome:'Organização do Estado', subtopicos:[
      { id:'dc4.1', nome:'Organização político-administrativa e federalismo' },
      { id:'dc4.2', nome:'Competências da União, Estados, DF e Municípios' },
      { id:'dc4.3', nome:'Intervenção federal e estadual' },
      { id:'dc4.4', nome:'Administração pública — princípios e disposições gerais' },
      { id:'dc4.5', nome:'Servidores públicos — disposições constitucionais' },
    ]},
    { id:'dc5', nome:'Organização dos Poderes', subtopicos:[
      { id:'dc5.1', nome:'Poder Legislativo — estrutura e atribuições' },
      { id:'dc5.2', nome:'Processo legislativo' },
      { id:'dc5.3', nome:'Poder Executivo — estrutura e atribuições' },
      { id:'dc5.4', nome:'Poder Judiciário — estrutura e atribuições' },
      { id:'dc5.5', nome:'Funções essenciais à Justiça: MP, AGU, DP, Advocacia' },
    ]},
    { id:'dc6', nome:'Controle de Constitucionalidade', subtopicos:[
      { id:'dc6.1', nome:'Controle difuso e incidental' },
      { id:'dc6.2', nome:'Controle concentrado — ADI, ADC, ADPF, ADO' },
      { id:'dc6.3', nome:'Efeitos das decisões e modulação temporal' },
      { id:'dc6.4', nome:'Arguição de descumprimento de preceito fundamental' },
    ]},
    { id:'dc7', nome:'Ordem Econômica e Financeira', subtopicos:[
      { id:'dc7.1', nome:'Princípios da ordem econômica' },
      { id:'dc7.2', nome:'Exploração de atividade econômica pelo Estado' },
      { id:'dc7.3', nome:'Política urbana, agrícola e reforma agrária' },
      { id:'dc7.4', nome:'Sistema financeiro nacional' },
    ]},
    { id:'dc8', nome:'Ordem Social', subtopicos:[
      { id:'dc8.1', nome:'Seguridade social: saúde, previdência e assistência' },
      { id:'dc8.2', nome:'Educação, cultura e desporto' },
      { id:'dc8.3', nome:'Meio ambiente' },
      { id:'dc8.4', nome:'Família, criança, idoso e índio' },
    ]},
  ]},

  /* ═══ 2. DIREITO ADMINISTRATIVO ════════════════════════════ */
  { id:'da', nome:'Direito Administrativo', cor:'#059669', topicos:[
    { id:'da1', nome:'Princípios da Administração Pública', subtopicos:[
      { id:'da1.1', nome:'Princípios expressos: LIMPE' },
      { id:'da1.2', nome:'Princípio da legalidade e juridicidade' },
      { id:'da1.3', nome:'Princípio da impessoalidade e moralidade' },
      { id:'da1.4', nome:'Princípio da eficiência e publicidade' },
      { id:'da1.5', nome:'Proporcionalidade, razoabilidade e supremacia do interesse público' },
    ]},
    { id:'da2', nome:'Organização Administrativa', subtopicos:[
      { id:'da2.1', nome:'Centralização, descentralização e desconcentração' },
      { id:'da2.2', nome:'Autarquias e fundações públicas' },
      { id:'da2.3', nome:'Empresas públicas e sociedades de economia mista' },
      { id:'da2.4', nome:'Consórcios públicos e convênios' },
      { id:'da2.5', nome:'Agências reguladoras e executivas' },
      { id:'da2.6', nome:'Organizações sociais e OSCIPs' },
    ]},
    { id:'da3', nome:'Poderes Administrativos', subtopicos:[
      { id:'da3.1', nome:'Poder vinculado e discricionário' },
      { id:'da3.2', nome:'Poder hierárquico e disciplinar' },
      { id:'da3.3', nome:'Poder regulamentar' },
      { id:'da3.4', nome:'Poder de polícia' },
      { id:'da3.5', nome:'Abuso de poder: excesso e desvio' },
    ]},
    { id:'da4', nome:'Ato Administrativo', subtopicos:[
      { id:'da4.1', nome:'Conceito, elementos e requisitos de validade' },
      { id:'da4.2', nome:'Classificação e espécies de atos administrativos' },
      { id:'da4.3', nome:'Atributos: presunção, imperatividade, autoexecutoriedade' },
      { id:'da4.4', nome:'Extinção: revogação, anulação, cassação e caducidade' },
      { id:'da4.5', nome:'Convalidação do ato administrativo' },
      { id:'da4.6', nome:'Teoria dos motivos determinantes' },
    ]},
    { id:'da5', nome:'Licitações e Contratos', subtopicos:[
      { id:'da5.1', nome:'Lei nº 14.133/2021 — disposições gerais e princípios' },
      { id:'da5.2', nome:'Modalidades: pregão, concorrência, concurso, leilão, diálogo competitivo' },
      { id:'da5.3', nome:'Dispensa e inexigibilidade de licitação' },
      { id:'da5.4', nome:'Fase preparatória e planejamento da contratação' },
      { id:'da5.5', nome:'Fase externa: edital, habilitação e julgamento' },
      { id:'da5.6', nome:'Contratos administrativos — formalização e execução' },
      { id:'da5.7', nome:'Alterações contratuais e equilíbrio econômico-financeiro' },
      { id:'da5.8', nome:'Sanções administrativas nos contratos' },
      { id:'da5.9', nome:'Gestão e fiscalização de contratos' },
    ]},
    { id:'da6', nome:'Serviços Públicos', subtopicos:[
      { id:'da6.1', nome:'Conceito, classificação e princípios dos serviços públicos' },
      { id:'da6.2', nome:'Concessão e permissão de serviços públicos' },
      { id:'da6.3', nome:'Parceria público-privada (PPP)' },
      { id:'da6.4', nome:'Autorização de serviços públicos' },
    ]},
    { id:'da7', nome:'Servidores Públicos', subtopicos:[
      { id:'da7.1', nome:'Regime Jurídico Único — Lei nº 8.112/1990' },
      { id:'da7.2', nome:'Provimento, vacância, remoção e redistribuição' },
      { id:'da7.3', nome:'Direitos e vantagens do servidor federal' },
      { id:'da7.4', nome:'Regime disciplinar e PAD' },
      { id:'da7.5', nome:'Acumulação de cargos públicos' },
      { id:'da7.6', nome:'Aposentadoria e pensão do servidor federal' },
    ]},
    { id:'da8', nome:'Controle da Administração', subtopicos:[
      { id:'da8.1', nome:'Controle interno e controle externo' },
      { id:'da8.2', nome:'Controle pelo Tribunal de Contas da União' },
      { id:'da8.3', nome:'Controle jurisdicional da Administração' },
      { id:'da8.4', nome:'Processo administrativo federal — Lei nº 9.784/1999' },
    ]},
    { id:'da9', nome:'Responsabilidade do Estado', subtopicos:[
      { id:'da9.1', nome:'Evolução das teorias da responsabilidade estatal' },
      { id:'da9.2', nome:'Responsabilidade objetiva — art. 37, §6º CF' },
      { id:'da9.3', nome:'Responsabilidade por omissão do Estado' },
      { id:'da9.4', nome:'Ação regressiva contra o agente público' },
    ]},
    { id:'da10', nome:'Improbidade Administrativa', subtopicos:[
      { id:'da10.1', nome:'Lei nº 8.429/1992 com alterações da Lei nº 14.230/2021' },
      { id:'da10.2', nome:'Atos de improbidade e sanções aplicáveis' },
      { id:'da10.3', nome:'Procedimento judicial e prescrição' },
      { id:'da10.4', nome:'Acordo de não persecução cível (ANPC)' },
    ]},
    { id:'da11', nome:'Bens Públicos', subtopicos:[
      { id:'da11.1', nome:'Classificação dos bens públicos' },
      { id:'da11.2', nome:'Uso dos bens públicos: uso comum, especial e dominical' },
      { id:'da11.3', nome:'Afetação, desafetação e alienação' },
    ]},
    { id:'da12', nome:'Intervenção do Estado na Propriedade', subtopicos:[
      { id:'da12.1', nome:'Desapropriação — modalidades e procedimento' },
      { id:'da12.2', nome:'Servidão, requisição, ocupação temporária e limitação administrativa' },
      { id:'da12.3', nome:'Tombamento' },
    ]},
  ]},

  /* ═══ 3. DIREITO CIVIL ══════════════════════════════════════ */
  { id:'civ', nome:'Direito Civil', cor:'#dc2626', topicos:[
    { id:'civ1', nome:'Lei de Introdução às Normas do Direito Brasileiro', subtopicos:[
      { id:'civ1.1', nome:'Vigência, revogação e conflito de normas' },
      { id:'civ1.2', nome:'Aplicação da lei no tempo e no espaço' },
      { id:'civ1.3', nome:'Hermenêutica jurídica' },
      { id:'civ1.4', nome:'Segurança jurídica e motivação — arts. 20-30 LINDB' },
    ]},
    { id:'civ2', nome:'Pessoas', subtopicos:[
      { id:'civ2.1', nome:'Pessoa natural — personalidade e capacidade' },
      { id:'civ2.2', nome:'Pessoa jurídica — constituição e extinção' },
      { id:'civ2.3', nome:'Domicílio' },
    ]},
    { id:'civ3', nome:'Fatos Jurídicos', subtopicos:[
      { id:'civ3.1', nome:'Negócio jurídico — planos de existência, validade e eficácia' },
      { id:'civ3.2', nome:'Vícios do negócio jurídico' },
      { id:'civ3.3', nome:'Invalidade do negócio jurídico — nulidade e anulabilidade' },
      { id:'civ3.4', nome:'Prescrição e decadência' },
      { id:'civ3.5', nome:'Prova dos fatos jurídicos' },
    ]},
    { id:'civ4', nome:'Obrigações', subtopicos:[
      { id:'civ4.1', nome:'Modalidades de obrigações (dar, fazer, não fazer, alternativas)' },
      { id:'civ4.2', nome:'Transmissão de obrigações — cessão de crédito e de débito' },
      { id:'civ4.3', nome:'Adimplemento e extinção das obrigações' },
      { id:'civ4.4', nome:'Inadimplemento — mora e perdas e danos' },
    ]},
    { id:'civ5', nome:'Contratos em Geral', subtopicos:[
      { id:'civ5.1', nome:'Princípios contratuais — autonomia, boa-fé, função social' },
      { id:'civ5.2', nome:'Formação, conclusão e extinção do contrato' },
      { id:'civ5.3', nome:'Espécies de contratos: compra e venda, locação, prestação de serviços' },
      { id:'civ5.4', nome:'Contratos bancários e de consumo' },
      { id:'civ5.5', nome:'Revisão contratual por onerosidade excessiva' },
      { id:'civ5.6', nome:'Contratos aleatórios' },
    ]},
    { id:'civ6', nome:'Responsabilidade Civil', subtopicos:[
      { id:'civ6.1', nome:'Pressupostos da responsabilidade subjetiva e objetiva' },
      { id:'civ6.2', nome:'Responsabilidade pelo fato de outrem' },
      { id:'civ6.3', nome:'Dano moral, estético e patrimonial' },
      { id:'civ6.4', nome:'Excludentes de responsabilidade civil' },
    ]},
    { id:'civ7', nome:'Direitos Reais', subtopicos:[
      { id:'civ7.1', nome:'Posse — conceito, classificação e efeitos' },
      { id:'civ7.2', nome:'Propriedade — função social e restrições' },
      { id:'civ7.3', nome:'Usucapião — modalidades' },
      { id:'civ7.4', nome:'Condomínio voluntário e edilício' },
      { id:'civ7.5', nome:'Direitos reais de garantia: penhor, hipoteca, anticrese' },
      { id:'civ7.6', nome:'Superfície, servidão, usufruto e habitação' },
    ]},
    { id:'civ8', nome:'Família e Sucessões', subtopicos:[
      { id:'civ8.1', nome:'Casamento e união estável' },
      { id:'civ8.2', nome:'Regimes de bens' },
      { id:'civ8.3', nome:'Filiação, guarda e alimentos' },
      { id:'civ8.4', nome:'Tutela e curatela' },
      { id:'civ8.5', nome:'Direito das sucessões — herança legítima e testamentária' },
      { id:'civ8.6', nome:'Inventário, partilha e colação' },
    ]},
  ]},

  /* ═══ 4. DIREITO PROCESSUAL CIVIL ══════════════════════════ */
  { id:'pc', nome:'Direito Processual Civil', cor:'#d97706', topicos:[
    { id:'pc1', nome:'Normas Fundamentais e Jurisdição', subtopicos:[
      { id:'pc1.1', nome:'Princípios do processo civil — CPC/2015' },
      { id:'pc1.2', nome:'Jurisdição, ação e defesa' },
      { id:'pc1.3', nome:'Competência: absoluta, relativa e modificação' },
    ]},
    { id:'pc2', nome:'Sujeitos do Processo', subtopicos:[
      { id:'pc2.1', nome:'Capacidade processual e postulatória' },
      { id:'pc2.2', nome:'Litisconsórcio' },
      { id:'pc2.3', nome:'Intervenção de terceiros' },
      { id:'pc2.4', nome:'MP, Fazenda Pública e Defensoria Pública no processo' },
    ]},
    { id:'pc3', nome:'Atos Processuais', subtopicos:[
      { id:'pc3.1', nome:'Forma, tempo e lugar dos atos processuais' },
      { id:'pc3.2', nome:'Citação e intimação' },
      { id:'pc3.3', nome:'Prazos e preclusão' },
      { id:'pc3.4', nome:'Nulidades processuais' },
    ]},
    { id:'pc4', nome:'Tutelas Provisórias', subtopicos:[
      { id:'pc4.1', nome:'Tutela de urgência: cautelar e antecipada' },
      { id:'pc4.2', nome:'Tutela de evidência' },
      { id:'pc4.3', nome:'Tutela antecipada antecedente e estabilização' },
    ]},
    { id:'pc5', nome:'Procedimento Comum', subtopicos:[
      { id:'pc5.1', nome:'Petição inicial e juízo de admissibilidade' },
      { id:'pc5.2', nome:'Resposta do réu: contestação e reconvenção' },
      { id:'pc5.3', nome:'Fase de saneamento e organização do processo' },
      { id:'pc5.4', nome:'Audiências e instrução probatória' },
      { id:'pc5.5', nome:'Sentença e coisa julgada' },
    ]},
    { id:'pc6', nome:'Provas', subtopicos:[
      { id:'pc6.1', nome:'Ônus da prova e distribuição dinâmica' },
      { id:'pc6.2', nome:'Meios de prova: documental, testemunhal, pericial' },
      { id:'pc6.3', nome:'Prova emprestada e prova ilícita' },
    ]},
    { id:'pc7', nome:'Recursos', subtopicos:[
      { id:'pc7.1', nome:'Teoria geral dos recursos — admissibilidade' },
      { id:'pc7.2', nome:'Apelação' },
      { id:'pc7.3', nome:'Agravo de instrumento e agravo interno' },
      { id:'pc7.4', nome:'Embargos de declaração' },
      { id:'pc7.5', nome:'Recurso especial e recurso extraordinário' },
      { id:'pc7.6', nome:'Embargos de divergência' },
    ]},
    { id:'pc8', nome:'Ações Constitucionais e Especiais', subtopicos:[
      { id:'pc8.1', nome:'Mandado de segurança individual e coletivo' },
      { id:'pc8.2', nome:'Ação popular e ação civil pública' },
      { id:'pc8.3', nome:'Ação de improbidade — aspectos processuais' },
      { id:'pc8.4', nome:'Execução contra a Fazenda Pública e precatórios' },
      { id:'pc8.5', nome:'Cumprimento de sentença' },
      { id:'pc8.6', nome:'Execução de títulos extrajudiciais' },
      { id:'pc8.7', nome:'Mandado de injunção e habeas data' },
    ]},
    { id:'pc9', nome:'Processo nos Tribunais e Meios Consensuais', subtopicos:[
      { id:'pc9.1', nome:'IRDR e incidente de assunção de competência' },
      { id:'pc9.2', nome:'Julgamento de casos repetitivos (REsp e RE repetitivos)' },
      { id:'pc9.3', nome:'Mediação e conciliação' },
      { id:'pc9.4', nome:'Negócio processual' },
    ]},
  ]},

  /* ═══ 5. DIREITO TRIBUTÁRIO ════════════════════════════════ */
  { id:'dt', nome:'Direito Tributário', cor:'#7c3aed', topicos:[
    { id:'dt1', nome:'Sistema Tributário Nacional', subtopicos:[
      { id:'dt1.1', nome:'Princípios constitucionais tributários' },
      { id:'dt1.2', nome:'Imunidades tributárias' },
      { id:'dt1.3', nome:'Competência tributária' },
      { id:'dt1.4', nome:'Repartição de receitas tributárias' },
    ]},
    { id:'dt2', nome:'Obrigação e Crédito Tributário', subtopicos:[
      { id:'dt2.1', nome:'Fato gerador, base de cálculo e alíquota' },
      { id:'dt2.2', nome:'Sujeito ativo e passivo, solidariedade e capacidade' },
      { id:'dt2.3', nome:'Lançamento tributário — modalidades' },
      { id:'dt2.4', nome:'Suspensão do crédito tributário' },
      { id:'dt2.5', nome:'Extinção do crédito tributário' },
      { id:'dt2.6', nome:'Exclusão do crédito tributário: isenção e anistia' },
    ]},
    { id:'dt3', nome:'Administração Tributária', subtopicos:[
      { id:'dt3.1', nome:'Fiscalização e dívida ativa' },
      { id:'dt3.2', nome:'Processo administrativo fiscal' },
      { id:'dt3.3', nome:'Execução fiscal — Lei nº 6.830/1980' },
    ]},
    { id:'dt4', nome:'Tributos em Espécie', subtopicos:[
      { id:'dt4.1', nome:'Impostos federais: IR, IPI, IOF, II, IE' },
      { id:'dt4.2', nome:'Contribuições sociais: PIS, COFINS, CSLL, CIDE' },
      { id:'dt4.3', nome:'ICMS e ISS — conflitos de competência' },
      { id:'dt4.4', nome:'Simples Nacional' },
      { id:'dt4.5', nome:'ITR, IPTU e IPVA — noções gerais' },
      { id:'dt4.6', nome:'Taxas e contribuições de melhoria' },
    ]},
    { id:'dt5', nome:'Responsabilidade Tributária', subtopicos:[
      { id:'dt5.1', nome:'Responsabilidade dos sucessores e de terceiros' },
      { id:'dt5.2', nome:'Responsabilidade por infrações e denúncia espontânea' },
      { id:'dt5.3', nome:'Crimes tributários' },
    ]},
  ]},

  /* ═══ 6. DIREITO FINANCEIRO E ORÇAMENTÁRIO ════════════════ */
  { id:'df', nome:'Direito Financeiro e Orçamentário', cor:'#0891b2', topicos:[
    { id:'df1', nome:'Atividade Financeira do Estado', subtopicos:[
      { id:'df1.1', nome:'Receitas públicas — classificação e espécies' },
      { id:'df1.2', nome:'Despesas públicas — empenho, liquidação e pagamento' },
      { id:'df1.3', nome:'Créditos adicionais: suplementares, especiais e extraordinários' },
      { id:'df1.4', nome:'Dívida pública interna e externa' },
    ]},
    { id:'df2', nome:'Orçamento Público', subtopicos:[
      { id:'df2.1', nome:'PPA, LDO e LOA — funções e relações' },
      { id:'df2.2', nome:'Princípios orçamentários' },
      { id:'df2.3', nome:'Ciclo orçamentário e execução' },
      { id:'df2.4', nome:'Lei de Responsabilidade Fiscal — Lei nº 101/2000' },
    ]},
    { id:'df3', nome:'Controle das Finanças Públicas', subtopicos:[
      { id:'df3.1', nome:'Controle interno (CGU) e externo (TCU)' },
      { id:'df3.2', nome:'Transferências voluntárias e convênios' },
      { id:'df3.3', nome:'SIAFI e sistemas de controle fiscal' },
      { id:'df3.4', nome:'Tomada e prestação de contas' },
      { id:'df3.5', nome:'Irregularidades e débito ao erário' },
    ]},
    { id:'df4', nome:'Regime Jurídico das Finanças', subtopicos:[
      { id:'df4.1', nome:'Vedações constitucionais em matéria financeira' },
      { id:'df4.2', nome:'Precatórios — art. 100 CF/1988' },
      { id:'df4.3', nome:'Fundos públicos' },
    ]},
  ]},

  /* ═══ 7. DIREITO INTERNACIONAL ═════════════════════════════ */
  { id:'di', nome:'Direito Internacional', cor:'#be185d', topicos:[
    { id:'di1', nome:'Direito Internacional Público', subtopicos:[
      { id:'di1.1', nome:'Fontes e sujeitos do DIP' },
      { id:'di1.2', nome:'Tratados internacionais — celebração e incorporação ao direito interno' },
      { id:'di1.3', nome:'Organizações internacionais: ONU e OEA' },
      { id:'di1.4', nome:'Responsabilidade internacional do Estado' },
      { id:'di1.5', nome:'Solução de controvérsias internacionais' },
      { id:'di1.6', nome:'Direito diplomático e consular' },
    ]},
    { id:'di2', nome:'Direito Internacional Privado', subtopicos:[
      { id:'di2.1', nome:'Aplicação da lei estrangeira no Brasil — LINDB' },
      { id:'di2.2', nome:'Competência internacional da autoridade brasileira' },
      { id:'di2.3', nome:'Homologação de sentença estrangeira e carta rogatória' },
    ]},
    { id:'di3', nome:'Direitos Humanos', subtopicos:[
      { id:'di3.1', nome:'Sistemas global (ONU) e regional (OEA) de proteção' },
      { id:'di3.2', nome:'Convenção Americana de Direitos Humanos — Pacto de San José' },
      { id:'di3.3', nome:'Corte Interamericana — jurisprudência e execução' },
      { id:'di3.4', nome:'Refugiados e apátridas — Convenção de 1951' },
      { id:'di3.5', nome:'Direito internacional humanitário' },
      { id:'di3.6', nome:'Tribunal Penal Internacional' },
    ]},
    { id:'di4', nome:'Relações Internacionais do Brasil', subtopicos:[
      { id:'di4.1', nome:'MERCOSUL — estrutura e direito comunitário' },
      { id:'di4.2', nome:'OMC e solução de controvérsias comerciais' },
      { id:'di4.3', nome:'Cooperação jurídica internacional e extradição' },
    ]},
  ]},

  /* ═══ 8. DIREITO AMBIENTAL ══════════════════════════════════ */
  { id:'dma', nome:'Direito Ambiental', cor:'#16a34a', topicos:[
    { id:'dma1', nome:'Fundamentos e Princípios', subtopicos:[
      { id:'dma1.1', nome:'Princípios do direito ambiental' },
      { id:'dma1.2', nome:'Política Nacional do Meio Ambiente — Lei nº 6.938/1981' },
      { id:'dma1.3', nome:'Licenciamento ambiental' },
      { id:'dma1.4', nome:'EIA/RIMA — estudo de impacto ambiental' },
    ]},
    { id:'dma2', nome:'Proteção de Bens Ambientais', subtopicos:[
      { id:'dma2.1', nome:'Código Florestal — Lei nº 12.651/2012' },
      { id:'dma2.2', nome:'Unidades de conservação — SNUC' },
      { id:'dma2.3', nome:'Recursos hídricos — Lei nº 9.433/1997' },
      { id:'dma2.4', nome:'Política Nacional de Resíduos Sólidos' },
    ]},
    { id:'dma3', nome:'Responsabilidade Ambiental', subtopicos:[
      { id:'dma3.1', nome:'Responsabilidade civil ambiental — teoria do risco integral' },
      { id:'dma3.2', nome:'Crimes ambientais — Lei nº 9.605/1998' },
      { id:'dma3.3', nome:'Tutela administrativa e sanções ambientais' },
      { id:'dma3.4', nome:'Ação civil pública ambiental' },
      { id:'dma3.5', nome:'Reparação e compensação de dano ambiental' },
    ]},
    { id:'dma4', nome:'Temas Especiais', subtopicos:[
      { id:'dma4.1', nome:'Mudanças climáticas e Política Nacional' },
      { id:'dma4.2', nome:'Patrimônio genético e biodiversidade' },
      { id:'dma4.3', nome:'Compensação ambiental' },
      { id:'dma4.4', nome:'Regularização fundiária e meio ambiente' },
    ]},
  ]},

  /* ═══ 9. DIREITO PREVIDENCIÁRIO ════════════════════════════ */
  { id:'dp', nome:'Direito Previdenciário', cor:'#ea580c', topicos:[
    { id:'dp1', nome:'Seguridade Social', subtopicos:[
      { id:'dp1.1', nome:'Organização e princípios da seguridade social' },
      { id:'dp1.2', nome:'Custeio da seguridade social' },
      { id:'dp1.3', nome:'Contribuições sociais e espécies' },
    ]},
    { id:'dp2', nome:'RGPS — Regime Geral', subtopicos:[
      { id:'dp2.1', nome:'Beneficiários: segurados e dependentes' },
      { id:'dp2.2', nome:'Filiação, inscrição e qualidade de segurado' },
      { id:'dp2.3', nome:'Benefícios em espécie: aposentadorias, auxílios, salários' },
      { id:'dp2.4', nome:'Acidente de trabalho' },
      { id:'dp2.5', nome:'Carência e cálculo de benefícios' },
    ]},
    { id:'dp3', nome:'RPPS — Regime Próprio', subtopicos:[
      { id:'dp3.1', nome:'RPPS dos servidores federais' },
      { id:'dp3.2', nome:'Reforma previdenciária — EC nº 103/2019' },
      { id:'dp3.3', nome:'Aposentadoria do servidor público federal' },
      { id:'dp3.4', nome:'Pensão por morte do servidor' },
      { id:'dp3.5', nome:'Acumulação de proventos e vedações constitucionais' },
    ]},
    { id:'dp4', nome:'Assistência Social', subtopicos:[
      { id:'dp4.1', nome:'LOAS — Lei Orgânica da Assistência Social' },
      { id:'dp4.2', nome:'BPC — Benefício de Prestação Continuada' },
      { id:'dp4.3', nome:'SUAS — Sistema Único de Assistência Social' },
    ]},
  ]},

  /* ═══ 10. DIREITO PENAL ═════════════════════════════════════ */
  { id:'dpe', nome:'Direito Penal', cor:'#991b1b', topicos:[
    { id:'dpe1', nome:'Teoria Geral do Crime', subtopicos:[
      { id:'dpe1.1', nome:'Princípios penais constitucionais' },
      { id:'dpe1.2', nome:'Fato típico: conduta, resultado, nexo e tipicidade' },
      { id:'dpe1.3', nome:'Ilicitude e causas de exclusão' },
      { id:'dpe1.4', nome:'Culpabilidade e imputabilidade penal' },
      { id:'dpe1.5', nome:'Concurso de crimes e concurso de pessoas' },
      { id:'dpe1.6', nome:'Iter criminis — tentativa e desistência' },
    ]},
    { id:'dpe2', nome:'Penas e Consequências', subtopicos:[
      { id:'dpe2.1', nome:'Espécies de penas e dosimetria' },
      { id:'dpe2.2', nome:'Suspensão condicional e livramento condicional' },
      { id:'dpe2.3', nome:'Prescrição penal — espécies e marcos' },
    ]},
    { id:'dpe3', nome:'Crimes em Espécie', subtopicos:[
      { id:'dpe3.1', nome:'Crimes contra a Administração Pública' },
      { id:'dpe3.2', nome:'Crimes de corrupção e lavagem de dinheiro' },
      { id:'dpe3.3', nome:'Lei de Organização Criminosa — Lei nº 12.850/2013' },
      { id:'dpe3.4', nome:'Lei Anticorrupção — Lei nº 12.846/2013' },
      { id:'dpe3.5', nome:'Crimes de responsabilidade' },
      { id:'dpe3.6', nome:'Lei de Abuso de Autoridade — Lei nº 13.869/2019' },
      { id:'dpe3.7', nome:'Colaboração premiada e acordos penais' },
    ]},
  ]},

  /* ═══ 11. DIREITO PROCESSUAL PENAL ════════════════════════ */
  { id:'pp', nome:'Direito Processual Penal', cor:'#b45309', topicos:[
    { id:'pp1', nome:'Princípios e Sujeitos', subtopicos:[
      { id:'pp1.1', nome:'Princípios constitucionais do processo penal' },
      { id:'pp1.2', nome:'Sujeitos processuais e competência penal' },
      { id:'pp1.3', nome:'Ação penal: espécies e condições' },
    ]},
    { id:'pp2', nome:'Inquérito e Medidas Cautelares', subtopicos:[
      { id:'pp2.1', nome:'Inquérito policial' },
      { id:'pp2.2', nome:'Prisão em flagrante, preventiva e temporária' },
      { id:'pp2.3', nome:'Medidas cautelares diversas da prisão' },
      { id:'pp2.4', nome:'Liberdade provisória e fiança' },
    ]},
    { id:'pp3', nome:'Provas no Processo Penal', subtopicos:[
      { id:'pp3.1', nome:'Teoria geral das provas penais' },
      { id:'pp3.2', nome:'Provas em espécie: confissão, testemunho, perícia' },
      { id:'pp3.3', nome:'Prova ilícita e teoria dos frutos da árvore envenenada' },
    ]},
    { id:'pp4', nome:'Procedimentos e Recursos', subtopicos:[
      { id:'pp4.1', nome:'Procedimento ordinário e sumário' },
      { id:'pp4.2', nome:'Tribunal do júri' },
      { id:'pp4.3', nome:'Recursos no processo penal' },
      { id:'pp4.4', nome:'Habeas corpus e revisão criminal' },
    ]},
  ]},

  /* ═══ 12. DIREITO EMPRESARIAL ══════════════════════════════ */
  { id:'de', nome:'Direito Empresarial', cor:'#0e7490', topicos:[
    { id:'de1', nome:'Teoria da Empresa', subtopicos:[
      { id:'de1.1', nome:'Empresário e estabelecimento empresarial' },
      { id:'de1.2', nome:'Obrigações do empresário: registro e escrituração' },
      { id:'de1.3', nome:'Nome empresarial e propriedade intelectual' },
    ]},
    { id:'de2', nome:'Sociedades Empresárias', subtopicos:[
      { id:'de2.1', nome:'Sociedade limitada' },
      { id:'de2.2', nome:'Sociedade anônima — estrutura e funcionamento' },
      { id:'de2.3', nome:'Dissolução, liquidação e transformação societária' },
      { id:'de2.4', nome:'Desconsideração da personalidade jurídica' },
    ]},
    { id:'de3', nome:'Títulos de Crédito', subtopicos:[
      { id:'de3.1', nome:'Princípios e teoria geral dos títulos de crédito' },
      { id:'de3.2', nome:'Nota promissória, duplicata e cheque' },
      { id:'de3.3', nome:'Letra de câmbio' },
    ]},
    { id:'de4', nome:'Recuperação e Falência', subtopicos:[
      { id:'de4.1', nome:'Recuperação judicial — plano e aprovação' },
      { id:'de4.2', nome:'Recuperação extrajudicial' },
      { id:'de4.3', nome:'Falência — processo, arrecadação e efeitos' },
      { id:'de4.4', nome:'Classificação de créditos na falência' },
      { id:'de4.5', nome:'Administrador judicial' },
    ]},
  ]},

  /* ═══ 13. DIREITO DO TRABALHO ══════════════════════════════ */
  { id:'dtr', nome:'Direito do Trabalho', cor:'#4338ca', topicos:[
    { id:'dtr1', nome:'Relação de Emprego', subtopicos:[
      { id:'dtr1.1', nome:'Princípios do direito do trabalho' },
      { id:'dtr1.2', nome:'Empregado, empregador e terceirização' },
      { id:'dtr1.3', nome:'Contrato de trabalho: espécies e rescisão' },
      { id:'dtr1.4', nome:'Remuneração, jornada e descanso' },
    ]},
    { id:'dtr2', nome:'Tutela do Trabalhador', subtopicos:[
      { id:'dtr2.1', nome:'FGTS e seguro-desemprego' },
      { id:'dtr2.2', nome:'Proteção ao trabalho da mulher e do menor' },
      { id:'dtr2.3', nome:'Saúde e segurança do trabalho' },
    ]},
    { id:'dtr3', nome:'Direito Coletivo do Trabalho', subtopicos:[
      { id:'dtr3.1', nome:'Sindicatos e negociação coletiva' },
      { id:'dtr3.2', nome:'Greve e lockout' },
    ]},
    { id:'dtr4', nome:'Processo do Trabalho', subtopicos:[
      { id:'dtr4.1', nome:'Competência da Justiça do Trabalho' },
      { id:'dtr4.2', nome:'Procedimentos, recursos e execução trabalhista' },
      { id:'dtr4.3', nome:'Reforma trabalhista — Lei nº 13.467/2017' },
    ]},
    { id:'dtr5', nome:'Temas Especiais', subtopicos:[
      { id:'dtr5.1', nome:'Trabalho análogo à escravidão' },
      { id:'dtr5.2', nome:'Assédio moral e sexual no trabalho' },
      { id:'dtr5.3', nome:'Teletrabalho e trabalho intermitente' },
      { id:'dtr5.4', nome:'Responsabilidade subsidiária na terceirização' },
    ]},
  ]},

  /* ═══ 14. ADVOCACIA PÚBLICA E ÉTICA ════════════════════════ */
  { id:'ap', nome:'Advocacia Pública e Ética', cor:'#1d4ed8', topicos:[
    { id:'ap1', nome:'Advocacia-Geral da União', subtopicos:[
      { id:'ap1.1', nome:'LC nº 73/1993 — estrutura orgânica da AGU' },
      { id:'ap1.2', nome:'Atribuições do Advogado da União' },
      { id:'ap1.3', nome:'CCAF — Câmara de Conciliação e Arbitragem' },
      { id:'ap1.4', nome:'Enunciados e pareceres da AGU com efeito vinculante' },
      { id:'ap1.5', nome:'Consultoria e assessoramento jurídico' },
    ]},
    { id:'ap2', nome:'Carreira e Estatuto', subtopicos:[
      { id:'ap2.1', nome:'Lei nº 9.028/1995 e alterações' },
      { id:'ap2.2', nome:'Lei nº 11.358/2006 — estrutura de carreira' },
      { id:'ap2.3', nome:'Prerrogativas e impedimentos do Advogado da União' },
      { id:'ap2.4', nome:'Regime disciplinar dos membros da AGU' },
    ]},
    { id:'ap3', nome:'Ética na Advocacia Pública', subtopicos:[
      { id:'ap3.1', nome:'Código de Ética da AGU' },
      { id:'ap3.2', nome:'Conflito de interesses e incompatibilidades' },
      { id:'ap3.3', nome:'Sigilo profissional na advocacia pública' },
    ]},
    { id:'ap4', nome:'Súmulas e Jurisprudência', subtopicos:[
      { id:'ap4.1', nome:'Súmulas vinculantes do STF relevantes para a AGU' },
      { id:'ap4.2', nome:'Jurisprudência do STF e STJ em temas de Fazenda Pública' },
      { id:'ap4.3', nome:'Precedentes obrigatórios e técnica de distinção' },
    ]},
  ]},
]

export const TOTAL_DISCIPLINAS = AGU_DISCIPLINAS.length
export const TOTAL_TOPICOS     = AGU_DISCIPLINAS.reduce((a,d) => a + d.topicos.length, 0)
export const TOTAL_SUBTOPICOS  = AGU_DISCIPLINAS.reduce(
  (a,d) => a + d.topicos.reduce((b,t) => b + t.subtopicos.length, 0), 0
)
