export interface Subtopico { id: string; nome: string }
export interface Topico { id: string; nome: string; subtopicos: Subtopico[] }
export interface Disciplina { id: string; nome: string; cor: string; topicos: Topico[] }

/* Concurso Público nº 01/2026 — CREA-MG (Fumarc)
   Cargo: Profissional de Nível Superior — Direito
   Inclui as disciplinas jurídicas específicas + Legislação/Sistema Confea/Crea. */
export const CREAMG_DISCIPLINAS: Disciplina[] = [

  /* ═══ 1. DIREITO CIVIL ═══ */
  { id: 'civ', nome: 'Direito Civil', cor: '#4f46e5', topicos: [
    { id: 'civ1', nome: 'Lei de Introdução às Normas do Direito Brasileiro', subtopicos: [
      { id: 'civ1.1', nome: 'Vigência, aplicação, obrigatoriedade, interpretação e integração das leis' },
      { id: 'civ1.2', nome: 'Conflito das leis no tempo' },
      { id: 'civ1.3', nome: 'Eficácia das leis no espaço' },
    ]},
    { id: 'civ2', nome: 'Pessoas Naturais', subtopicos: [
      { id: 'civ2.1', nome: 'Conceito' },
      { id: 'civ2.2', nome: 'Início da pessoa natural' },
      { id: 'civ2.3', nome: 'Personalidade' },
      { id: 'civ2.4', nome: 'Capacidade' },
      { id: 'civ2.5', nome: 'Direitos da personalidade' },
      { id: 'civ2.6', nome: 'Nome civil' },
      { id: 'civ2.7', nome: 'Estado civil' },
      { id: 'civ2.8', nome: 'Domicílio' },
      { id: 'civ2.9', nome: 'Ausência' },
    ]},
    { id: 'civ3', nome: 'Pessoas Jurídicas', subtopicos: [
      { id: 'civ3.1', nome: 'Disposições gerais' },
      { id: 'civ3.2', nome: 'Conceito e elementos caracterizadores' },
      { id: 'civ3.3', nome: 'Constituição' },
      { id: 'civ3.4', nome: 'Extinção' },
      { id: 'civ3.5', nome: 'Capacidade e direitos da personalidade' },
      { id: 'civ3.6', nome: 'Domicílio' },
      { id: 'civ3.7', nome: 'Sociedades de fato' },
      { id: 'civ3.8', nome: 'Associações' },
      { id: 'civ3.9', nome: 'Sociedades' },
      { id: 'civ3.10', nome: 'Fundações' },
      { id: 'civ3.11', nome: 'Grupos despersonalizados' },
      { id: 'civ3.12', nome: 'Desconsideração da personalidade jurídica' },
      { id: 'civ3.13', nome: 'Responsabilidade da pessoa jurídica e dos sócios' },
    ]},
    { id: 'civ4', nome: 'Bens', subtopicos: [
      { id: 'civ4.1', nome: 'Diferentes classes' },
      { id: 'civ4.2', nome: 'Bens corpóreos e incorpóreos' },
      { id: 'civ4.3', nome: 'Bens no comércio e fora do comércio' },
    ]},
    { id: 'civ5', nome: 'Fato Jurídico', subtopicos: [
      { id: 'civ5.1', nome: 'Fato jurídico: conceito e classificação' },
    ]},
    { id: 'civ6', nome: 'Negócio Jurídico', subtopicos: [
      { id: 'civ6.1', nome: 'Disposições gerais' },
      { id: 'civ6.2', nome: 'Classificação e interpretação' },
      { id: 'civ6.3', nome: 'Elementos' },
      { id: 'civ6.4', nome: 'Representação' },
      { id: 'civ6.5', nome: 'Condição, termo e encargo' },
      { id: 'civ6.6', nome: 'Defeitos do negócio jurídico' },
      { id: 'civ6.7', nome: 'Existência, eficácia, validade, invalidade e nulidade do negócio jurídico' },
      { id: 'civ6.8', nome: 'Simulação' },
    ]},
    { id: 'civ7', nome: 'Atos Jurídicos Lícitos e Ilícitos', subtopicos: [
      { id: 'civ7.1', nome: 'Atos jurídicos lícitos e ilícitos' },
    ]},
    { id: 'civ8', nome: 'Prescrição e Decadência', subtopicos: [
      { id: 'civ8.1', nome: 'Prescrição e decadência' },
    ]},
    { id: 'civ9', nome: 'Prova do Fato Jurídico', subtopicos: [
      { id: 'civ9.1', nome: 'Prova do fato jurídico' },
    ]},
    { id: 'civ10', nome: 'Obrigações', subtopicos: [
      { id: 'civ10.1', nome: 'Características' },
      { id: 'civ10.2', nome: 'Elementos' },
      { id: 'civ10.3', nome: 'Princípios' },
      { id: 'civ10.4', nome: 'Boa-fé' },
      { id: 'civ10.5', nome: 'Obrigação complexa (a obrigação como um processo)' },
      { id: 'civ10.6', nome: 'Obrigações de dar' },
      { id: 'civ10.7', nome: 'Obrigações de fazer e de não fazer' },
      { id: 'civ10.8', nome: 'Obrigações alternativas e facultativas' },
      { id: 'civ10.9', nome: 'Obrigações divisíveis e indivisíveis' },
      { id: 'civ10.10', nome: 'Obrigações solidárias' },
      { id: 'civ10.11', nome: 'Obrigações civis e naturais, de meio, de resultado e de garantia' },
      { id: 'civ10.12', nome: 'Obrigações de execução instantânea, diferida e continuada' },
      { id: 'civ10.13', nome: 'Obrigações puras e simples, condicionais, a termo e modais' },
      { id: 'civ10.14', nome: 'Obrigações líquidas e ilíquidas' },
      { id: 'civ10.15', nome: 'Obrigações principais e acessórias' },
      { id: 'civ10.16', nome: 'Transmissão das obrigações' },
      { id: 'civ10.17', nome: 'Adimplemento e extinção das obrigações' },
      { id: 'civ10.18', nome: 'Inadimplemento das obrigações' },
    ]},
    { id: 'civ11', nome: 'Contratos', subtopicos: [
      { id: 'civ11.1', nome: 'Princípios' },
      { id: 'civ11.2', nome: 'Classificação' },
      { id: 'civ11.3', nome: 'Contratos em geral' },
      { id: 'civ11.4', nome: 'Disposições gerais' },
      { id: 'civ11.5', nome: 'Interpretação' },
      { id: 'civ11.6', nome: 'Extinção' },
      { id: 'civ11.7', nome: 'Espécies de contratos regulados no Código Civil' },
    ]},
    { id: 'civ12', nome: 'Atos Unilaterais', subtopicos: [
      { id: 'civ12.1', nome: 'Atos unilaterais' },
    ]},
    { id: 'civ13', nome: 'Locação de Imóveis Urbanos', subtopicos: [
      { id: 'civ13.1', nome: 'Lei nº 8.245/1991 e alterações' },
    ]},
  ]},

  /* ═══ 2. DIREITO PROCESSUAL CIVIL ═══ */
  { id: 'pc', nome: 'Direito Processual Civil', cor: '#7c3aed', topicos: [
    { id: 'pc1', nome: 'Normas Fundamentais e Jurisdição (Lei nº 13.105/2015)', subtopicos: [
      { id: 'pc1.1', nome: 'Normas processuais civis' },
      { id: 'pc1.2', nome: 'Função jurisdicional' },
      { id: 'pc1.3', nome: 'Ação' },
      { id: 'pc1.4', nome: 'Pressupostos processuais' },
      { id: 'pc1.5', nome: 'Preclusão' },
    ]},
    { id: 'pc2', nome: 'Sujeitos do Processo', subtopicos: [
      { id: 'pc2.1', nome: 'Sujeitos do processo' },
      { id: 'pc2.2', nome: 'Litisconsórcio' },
      { id: 'pc2.3', nome: 'Intervenção de terceiros' },
      { id: 'pc2.4', nome: 'Poderes, deveres e responsabilidade do juiz' },
      { id: 'pc2.5', nome: 'Ministério Público' },
      { id: 'pc2.6', nome: 'Advocacia Pública' },
      { id: 'pc2.7', nome: 'Defensoria Pública' },
    ]},
    { id: 'pc3', nome: 'Atos Processuais e Tutela Provisória', subtopicos: [
      { id: 'pc3.1', nome: 'Atos processuais' },
      { id: 'pc3.2', nome: 'Tutela provisória' },
      { id: 'pc3.3', nome: 'Formação, suspensão e extinção do processo' },
    ]},
    { id: 'pc4', nome: 'Processo de Conhecimento e Procedimentos', subtopicos: [
      { id: 'pc4.1', nome: 'Processo de conhecimento e do cumprimento de sentença' },
      { id: 'pc4.2', nome: 'Procedimentos especiais' },
      { id: 'pc4.3', nome: 'Procedimentos de jurisdição voluntária' },
    ]},
    { id: 'pc5', nome: 'Execução e Impugnação das Decisões', subtopicos: [
      { id: 'pc5.1', nome: 'Processos de execução' },
      { id: 'pc5.2', nome: 'Processos nos tribunais e meios de impugnação das decisões judiciais' },
    ]},
  ]},

  /* ═══ 3. DIREITO ADMINISTRATIVO ═══ */
  { id: 'adm', nome: 'Direito Administrativo', cor: '#0891b2', topicos: [
    { id: 'adm1', nome: 'Introdução ao Direito Administrativo', subtopicos: [
      { id: 'adm1.1', nome: 'Origem, natureza jurídica e objeto do direito administrativo' },
      { id: 'adm1.2', nome: 'Critérios adotados para a conceituação do direito administrativo' },
      { id: 'adm1.3', nome: 'Fontes do direito administrativo' },
    ]},
    { id: 'adm2', nome: 'Administração Pública', subtopicos: [
      { id: 'adm2.1', nome: 'Sentido amplo e sentido estrito' },
      { id: 'adm2.2', nome: 'Sentido objetivo e sentido subjetivo' },
    ]},
    { id: 'adm3', nome: 'Regime Jurídico-Administrativo', subtopicos: [
      { id: 'adm3.1', nome: 'Conceito' },
      { id: 'adm3.2', nome: 'Supremacia e indisponibilidade do interesse público' },
      { id: 'adm3.3', nome: 'Princípios expressos e implícitos da Administração Pública' },
      { id: 'adm3.4', nome: 'Jurisprudência aplicada dos tribunais superiores' },
    ]},
    { id: 'adm4', nome: 'Organização Administrativa', subtopicos: [
      { id: 'adm4.1', nome: 'Centralização, descentralização, concentração e desconcentração' },
      { id: 'adm4.2', nome: 'Administração direta' },
      { id: 'adm4.3', nome: 'Administração indireta' },
    ]},
    { id: 'adm5', nome: 'Atos Administrativos', subtopicos: [
      { id: 'adm5.1', nome: 'Conceito' },
      { id: 'adm5.2', nome: 'Fatos da administração, atos da administração e atos administrativos' },
      { id: 'adm5.3', nome: 'Requisitos ou elementos' },
      { id: 'adm5.4', nome: 'Atributos' },
      { id: 'adm5.5', nome: 'Atos administrativos em espécie' },
      { id: 'adm5.6', nome: 'O silêncio no direito administrativo' },
      { id: 'adm5.7', nome: 'Extinção dos atos administrativos: revogação, anulação e cassação' },
      { id: 'adm5.8', nome: 'Convalidação' },
      { id: 'adm5.9', nome: 'Vinculação e discricionariedade' },
      { id: 'adm5.10', nome: 'Atos administrativos nulos, anuláveis e inexistentes' },
      { id: 'adm5.11', nome: 'Decadência administrativa' },
    ]},
    { id: 'adm6', nome: 'Processo Administrativo', subtopicos: [
      { id: 'adm6.1', nome: 'Disposições doutrinárias aplicáveis' },
    ]},
    { id: 'adm7', nome: 'Poderes e Deveres da Administração Pública', subtopicos: [
      { id: 'adm7.1', nome: 'Poder regulamentar' },
      { id: 'adm7.2', nome: 'Poder hierárquico' },
      { id: 'adm7.3', nome: 'Poder disciplinar' },
      { id: 'adm7.4', nome: 'Poder de polícia' },
      { id: 'adm7.5', nome: 'Dever de agir' },
      { id: 'adm7.6', nome: 'Dever de eficiência' },
      { id: 'adm7.7', nome: 'Dever de probidade' },
      { id: 'adm7.8', nome: 'Dever de prestação de contas' },
      { id: 'adm7.9', nome: 'Uso e abuso do poder' },
    ]},
    { id: 'adm8', nome: 'Licitações (Lei nº 14.133/2021)', subtopicos: [
      { id: 'adm8.1', nome: 'Conceito, objeto, finalidades e princípios' },
      { id: 'adm8.2', nome: 'Obrigatoriedade, dispensa, inexigibilidade e vedação' },
      { id: 'adm8.3', nome: 'Modalidades, procedimentos e fases' },
      { id: 'adm8.4', nome: 'Revogação, invalidação, desistência e controle' },
    ]},
    { id: 'adm9', nome: 'Contratos Administrativos', subtopicos: [
      { id: 'adm9.1', nome: 'Legislação pertinente (Decreto nº 6.170/2007 e Portaria Interministerial nº 507/2011)' },
      { id: 'adm9.2', nome: 'Lei nº 11.107/2005 e Lei nº 13.019/2014' },
      { id: 'adm9.3', nome: 'Conceito, características e vigência' },
      { id: 'adm9.4', nome: 'Alterações contratuais' },
      { id: 'adm9.5', nome: 'Execução, inexecução e rescisão' },
      { id: 'adm9.6', nome: 'Convênios e instrumentos congêneres' },
    ]},
    { id: 'adm10', nome: 'Controle da Administração Pública', subtopicos: [
      { id: 'adm10.1', nome: 'Conceito' },
      { id: 'adm10.2', nome: 'Classificação das formas de controle (origem, momento e amplitude)' },
      { id: 'adm10.3', nome: 'Controle exercido pela Administração Pública' },
      { id: 'adm10.4', nome: 'Controle legislativo' },
      { id: 'adm10.5', nome: 'Controle judicial' },
      { id: 'adm10.6', nome: 'Jurisprudência aplicada dos tribunais superiores' },
    ]},
    { id: 'adm11', nome: 'Agentes Públicos', subtopicos: [
      { id: 'adm11.1', nome: 'Legislação pertinente e disposições constitucionais aplicáveis' },
      { id: 'adm11.2', nome: 'Conceito e espécies' },
      { id: 'adm11.3', nome: 'Cargo, emprego e função pública' },
      { id: 'adm11.4', nome: 'Provimento e vacância' },
      { id: 'adm11.5', nome: 'Efetividade, estabilidade e vitaliciedade' },
      { id: 'adm11.6', nome: 'Remuneração, direitos e deveres' },
      { id: 'adm11.7', nome: 'Responsabilidade e processo administrativo disciplinar' },
      { id: 'adm11.8', nome: 'Regime de previdência' },
    ]},
    { id: 'adm12', nome: 'Responsabilidade Civil do Estado', subtopicos: [
      { id: 'adm12.1', nome: 'Evolução histórica' },
      { id: 'adm12.2', nome: 'Teorias subjetivas e objetivas da responsabilidade patrimonial do Estado' },
      { id: 'adm12.3', nome: 'Responsabilidade por ato comissivo e por omissão do Estado' },
      { id: 'adm12.4', nome: 'Requisitos para a demonstração da responsabilidade do Estado' },
      { id: 'adm12.5', nome: 'Causas excludentes e atenuantes' },
      { id: 'adm12.6', nome: 'Reparação do dano e direito de regresso' },
      { id: 'adm12.7', nome: 'Responsabilidade primária e subsidiária' },
      { id: 'adm12.8', nome: 'Responsabilidade por atos legislativos e por atos judiciais' },
    ]},
  ]},

  /* ═══ 4. DIREITO CONSTITUCIONAL ═══ */
  { id: 'con', nome: 'Direito Constitucional', cor: '#059669', topicos: [
    { id: 'con1', nome: 'Teoria da Constituição', subtopicos: [
      { id: 'con1.1', nome: 'Conceito e tipos de Constituição' },
      { id: 'con1.2', nome: 'Teoria da Constituição' },
      { id: 'con1.3', nome: 'Poder Constituinte: modalidades' },
      { id: 'con1.4', nome: 'Interpretação e integração da Constituição' },
      { id: 'con1.5', nome: 'Eficácia das normas constitucionais e infraconstitucionais' },
      { id: 'con1.6', nome: 'Disposições constitucionais transitórias' },
      { id: 'con1.7', nome: 'Princípios fundamentais' },
    ]},
    { id: 'con2', nome: 'Organização do Estado e Competências', subtopicos: [
      { id: 'con2.1', nome: 'Partilha de competências' },
      { id: 'con2.2', nome: 'Constituições Estaduais e Poder Constituinte dos Estados' },
      { id: 'con2.3', nome: 'Poderes do Município e autonomia municipal' },
      { id: 'con2.4', nome: 'Bens da União, dos Estados e dos Municípios' },
      { id: 'con2.5', nome: 'Competências federativas e o Município na Federação' },
      { id: 'con2.6', nome: 'Aplicabilidade dos princípios da CF e da Constituição Estadual frente ao Município' },
    ]},
    { id: 'con3', nome: 'Separação de Poderes e Poder Legislativo', subtopicos: [
      { id: 'con3.1', nome: 'Separação de Poderes, delegação e invasão de competência' },
      { id: 'con3.2', nome: 'Poder Legislativo: composição e atribuições' },
      { id: 'con3.3', nome: 'Iniciativa das leis e tipos normativos' },
      { id: 'con3.4', nome: 'Sanção e veto' },
      { id: 'con3.5', nome: 'Processo legislativo municipal' },
    ]},
    { id: 'con4', nome: 'Finanças Públicas e Controle', subtopicos: [
      { id: 'con4.1', nome: 'Finanças públicas' },
      { id: 'con4.2', nome: 'Orçamento' },
      { id: 'con4.3', nome: 'Fiscalização contábil, financeira, orçamentária, operacional e patrimonial' },
      { id: 'con4.4', nome: 'Tribunais de Contas' },
    ]},
    { id: 'con5', nome: 'Poder Executivo e Poder Judiciário', subtopicos: [
      { id: 'con5.1', nome: 'Poder Executivo: atribuições e competências' },
      { id: 'con5.2', nome: 'Responsabilidade dos agentes políticos' },
      { id: 'con5.3', nome: 'Poder Judiciário: tribunais judiciários e respectivas competências' },
      { id: 'con5.4', nome: 'Poder Judiciário do Estado e competências do Tribunal de Justiça' },
    ]},
    { id: 'con6', nome: 'Direitos e Garantias Fundamentais', subtopicos: [
      { id: 'con6.1', nome: 'Direitos e garantias fundamentais' },
      { id: 'con6.2', nome: 'Habeas corpus' },
      { id: 'con6.3', nome: 'Mandado de segurança individual e coletivo' },
      { id: 'con6.4', nome: 'Mandado de injunção' },
      { id: 'con6.5', nome: 'Habeas data' },
      { id: 'con6.6', nome: 'Ação popular' },
    ]},
    { id: 'con7', nome: 'Controle de Constitucionalidade', subtopicos: [
      { id: 'con7.1', nome: 'Controle de constitucionalidade: modalidades difuso e concentrado' },
      { id: 'con7.2', nome: 'Ação de inconstitucionalidade e inconstitucionalidade por omissão' },
      { id: 'con7.3', nome: 'Ação declaratória de constitucionalidade de lei ou ato normativo federal' },
      { id: 'con7.4', nome: 'Inconstitucionalidade da lei municipal face à Constituição Estadual' },
    ]},
    { id: 'con8', nome: 'Ordem Social e Administração Pública', subtopicos: [
      { id: 'con8.1', nome: 'Direito de propriedade: limitações e desapropriação' },
      { id: 'con8.2', nome: 'A ordem social e os direitos sociais' },
      { id: 'con8.3', nome: 'Seguridade social: saúde, previdência social e assistência social' },
      { id: 'con8.4', nome: 'Administração pública: princípios constitucionais' },
      { id: 'con8.5', nome: 'Regime dos servidores públicos e institutos constitucionais' },
      { id: 'con8.6', nome: 'Responsabilidade da Administração e improbidade administrativa (Lei nº 8.429/1992)' },
      { id: 'con8.7', nome: 'Organização administrativa, licitação e contratos' },
    ]},
  ]},

  /* ═══ 5. DIREITO TRIBUTÁRIO ═══ */
  { id: 'trib', nome: 'Direito Tributário', cor: '#d97706', topicos: [
    { id: 'trib1', nome: 'Execução Fiscal', subtopicos: [
      { id: 'trib1.1', nome: 'Lei nº 6.830/1980' },
    ]},
    { id: 'trib2', nome: 'Obrigação Tributária', subtopicos: [
      { id: 'trib2.1', nome: 'Conceito e natureza jurídica' },
      { id: 'trib2.2', nome: 'Fato gerador da obrigação principal e da obrigação acessória' },
      { id: 'trib2.3', nome: 'Fato gerador e hipótese de incidência' },
      { id: 'trib2.4', nome: 'Sujeito ativo' },
      { id: 'trib2.5', nome: 'Sujeito passivo' },
      { id: 'trib2.6', nome: 'Solidariedade, benefício de ordem e efeitos da solidariedade' },
      { id: 'trib2.7', nome: 'Capacidade tributária' },
      { id: 'trib2.8', nome: 'Domicílio tributário' },
      { id: 'trib2.9', nome: 'Responsabilidade tributária' },
      { id: 'trib2.10', nome: 'Responsabilidade dos sucessores (fusão, transformação, incorporação e continuação da atividade)' },
      { id: 'trib2.11', nome: 'Responsabilidade de terceiros' },
    ]},
    { id: 'trib3', nome: 'Crédito Tributário', subtopicos: [
      { id: 'trib3.1', nome: 'Constituição do crédito tributário' },
      { id: 'trib3.2', nome: 'Lançamento: critérios jurídicos, modalidades e revisão' },
      { id: 'trib3.3', nome: 'Suspensão do crédito tributário' },
      { id: 'trib3.4', nome: 'Extinção: pagamento, compensação, transação, remissão, decadência e prescrição' },
      { id: 'trib3.5', nome: 'Conversão de depósito em renda, pagamento antecipado e consignação em pagamento' },
      { id: 'trib3.6', nome: 'Exclusão do crédito tributário: isenção e anistia' },
      { id: 'trib3.7', nome: 'Distinção entre isenção, não incidência e imunidade' },
    ]},
    { id: 'trib4', nome: 'Administração Tributária', subtopicos: [
      { id: 'trib4.1', nome: 'Fiscalização' },
      { id: 'trib4.2', nome: 'Sigilo comercial, dever de informar e sigilo profissional' },
      { id: 'trib4.3', nome: 'Sigilo fiscal' },
      { id: 'trib4.4', nome: 'Auxílio da força pública' },
      { id: 'trib4.5', nome: 'Excesso de exação' },
      { id: 'trib4.6', nome: 'Dívida ativa' },
      { id: 'trib4.7', nome: 'Certidões negativas' },
    ]},
  ]},

  /* ═══ 6. DIREITO DO TRABALHO E PROCESSUAL DO TRABALHO ═══ */
  { id: 'trab', nome: 'Direito do Trabalho e Processual do Trabalho', cor: '#dc2626', topicos: [
    { id: 'trab1', nome: 'Direito do Trabalho — Fundamentos', subtopicos: [
      { id: 'trab1.1', nome: 'Direito do Trabalho na Constituição Federal de 1988' },
      { id: 'trab1.2', nome: 'Princípios do Direito do Trabalho' },
      { id: 'trab1.3', nome: 'Relação de trabalho e relação de emprego' },
      { id: 'trab1.4', nome: 'Contrato individual do trabalho' },
      { id: 'trab1.5', nome: 'Terceirização no Direito do Trabalho' },
    ]},
    { id: 'trab2', nome: 'Remuneração, Duração e Garantias', subtopicos: [
      { id: 'trab2.1', nome: 'Salário e remuneração' },
      { id: 'trab2.2', nome: 'Férias, FGTS, gratificação de Natal, repouso semanal remunerado e aviso-prévio' },
      { id: 'trab2.3', nome: 'Estabilidade e garantia de emprego' },
      { id: 'trab2.4', nome: 'Meio ambiente do trabalho, medicina e segurança do trabalho e CIPA' },
      { id: 'trab2.5', nome: 'Discriminação no trabalho, assédio moral e assédio sexual' },
      { id: 'trab2.6', nome: 'Proteção do trabalho do menor e da mulher' },
    ]},
    { id: 'trab3', nome: 'Direito Coletivo e Reforma Trabalhista', subtopicos: [
      { id: 'trab3.1', nome: 'Organização sindical' },
      { id: 'trab3.2', nome: 'Convenção e acordo coletivo do trabalho' },
      { id: 'trab3.3', nome: 'Greve e lockout' },
      { id: 'trab3.4', nome: 'Reforma trabalhista (Lei nº 13.467/2017)' },
    ]},
    { id: 'trab4', nome: 'Direito Processual do Trabalho', subtopicos: [
      { id: 'trab4.1', nome: 'Princípios do Processo do Trabalho' },
      { id: 'trab4.2', nome: 'Organização e competência da Justiça do Trabalho' },
      { id: 'trab4.3', nome: 'Dissídios individuais e coletivos do trabalho' },
      { id: 'trab4.4', nome: 'Comissões de Conciliação Prévia' },
      { id: 'trab4.5', nome: 'Ritos trabalhistas' },
      { id: 'trab4.6', nome: 'Sentença normativa' },
      { id: 'trab4.7', nome: 'Sistema recursal trabalhista' },
      { id: 'trab4.8', nome: 'Liquidação e execução trabalhista' },
      { id: 'trab4.9', nome: 'Súmulas do TST e Orientações Jurisprudenciais' },
    ]},
  ]},

  /* ═══ 7. LEGISLAÇÃO E SISTEMA CONFEA/CREA ═══ */
  { id: 'cfc', nome: 'Legislação e Sistema Confea/Crea', cor: '#db2777', topicos: [
    { id: 'cfc1', nome: 'Legislação Profissional — Exercício das Profissões', subtopicos: [
      { id: 'cfc1.1', nome: 'Decreto nº 23.196/1933 (exercício da profissão agronômica)' },
      { id: 'cfc1.2', nome: 'Decreto nº 23.569/1933 (engenheiro, arquiteto e agrimensor)' },
      { id: 'cfc1.3', nome: 'Lei nº 4.076/1962 (profissão de geólogo)' },
      { id: 'cfc1.4', nome: 'Lei nº 4.950-A/1966 (remuneração de profissionais)' },
      { id: 'cfc1.5', nome: 'Lei nº 5.194/1966 (exercício das profissões de engenheiro, arquiteto e agrônomo)' },
      { id: 'cfc1.6', nome: 'Lei nº 6.496/1977 (Anotação de Responsabilidade Técnica — ART)' },
      { id: 'cfc1.7', nome: 'Lei nº 6.619/1978 (altera a Lei nº 5.194/1966)' },
      { id: 'cfc1.8', nome: 'Lei nº 6.838/1980 (prazo prescricional — processo disciplinar)' },
      { id: 'cfc1.9', nome: 'Lei nº 6.839/1980 (registro de empresas em entidades fiscalizadoras)' },
      { id: 'cfc1.10', nome: 'Lei nº 7.410/1985 (Engenharia de Segurança do Trabalho)' },
      { id: 'cfc1.11', nome: 'Lei nº 8.195/1991 (eleições diretas nos Conselhos)' },
      { id: 'cfc1.12', nome: 'Lei nº 12.514/2011 (contribuições devidas aos conselhos profissionais)' },
    ]},
    { id: 'cfc2', nome: 'Legislação Administrativa e Correlata', subtopicos: [
      { id: 'cfc2.1', nome: 'Lei nº 6.830/1980 (execução fiscal da Dívida Ativa)' },
      { id: 'cfc2.2', nome: 'Lei nº 7.347/1985 (ação civil pública)' },
      { id: 'cfc2.3', nome: 'Lei nº 8.429/1992 e Lei nº 14.230/2021 (improbidade administrativa)' },
      { id: 'cfc2.4', nome: 'Lei nº 9.784/1999 (processo administrativo federal)' },
      { id: 'cfc2.5', nome: 'Lei nº 9.873/1999 (prescrição da ação punitiva)' },
      { id: 'cfc2.6', nome: 'Lei nº 10.522/2002 (Cadastro Informativo — Cadin)' },
      { id: 'cfc2.7', nome: 'Lei nº 12.016/2009 (mandado de segurança)' },
      { id: 'cfc2.8', nome: 'Lei nº 13.709/2018 (LGPD)' },
      { id: 'cfc2.9', nome: 'Lei nº 14.133/2021 (Licitações e Contratos Administrativos)' },
    ]},
    { id: 'cfc3', nome: 'Regimento Interno e Resoluções Confea/Crea', subtopicos: [
      { id: 'cfc3.1', nome: 'Regimento Interno do CREA-MG (de 4 de dezembro de 2024, atualizado)' },
      { id: 'cfc3.2', nome: 'Resolução nº 1.002/2002 (Código de Ética Profissional)' },
      { id: 'cfc3.3', nome: 'Resolução nº 1.004/2003 (condução de Processo Ético Disciplinar)' },
      { id: 'cfc3.4', nome: 'Resolução nº 1.008/2004 (processos de infração e aplicação de penalidades)' },
      { id: 'cfc3.5', nome: 'Resolução nº 1.090/2017 (cancelamento de registro por má conduta)' },
    ]},
  ]},

]

export const CREAMG_TOTAL_DISCIPLINAS = CREAMG_DISCIPLINAS.length
export const CREAMG_TOTAL_TOPICOS = CREAMG_DISCIPLINAS.reduce((a, d) => a + d.topicos.length, 0)
export const CREAMG_TOTAL_SUBTOPICOS = CREAMG_DISCIPLINAS.reduce(
  (a, d) => a + d.topicos.reduce((b, t) => b + t.subtopicos.length, 0), 0
)
