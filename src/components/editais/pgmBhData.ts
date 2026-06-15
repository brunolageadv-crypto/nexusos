export interface Subtopico { id: string; nome: string }
export interface Topico { id: string; nome: string; subtopicos: Subtopico[] }
export interface Disciplina { id: string; nome: string; cor: string; topicos: Topico[] }

/* Edital nº 03/2016 — Procurador Municipal de Belo Horizonte (Cebraspe) */
export const PGM_BH_DISCIPLINAS: Disciplina[] = [

  /* ═══ 1. DIREITO CONSTITUCIONAL ═══ */
  { id:'dc', nome:'Direito Constitucional', cor:'#4f46e5', topicos:[
    { id:'dc1', nome:'Constituição', subtopicos:[
      { id:'dc1.1', nome:'Conceito, objeto, elementos e classificações' },
      { id:'dc1.2', nome:'Supremacia da Constituição' },
      { id:'dc1.3', nome:'Aplicabilidade das normas constitucionais' },
      { id:'dc1.4', nome:'Interpretação das normas constitucionais' },
      { id:'dc1.5', nome:'Jurisprudência aplicada dos tribunais superiores' },
    ]},
    { id:'dc2', nome:'Poder Constituinte', subtopicos:[
      { id:'dc2.1', nome:'Características' },
      { id:'dc2.2', nome:'Poder constituinte originário' },
      { id:'dc2.3', nome:'Poder constituinte derivado' },
    ]},
    { id:'dc3', nome:'Princípios Fundamentais', subtopicos:[
      { id:'dc3.1', nome:'Princípios fundamentais da CF/1988' },
      { id:'dc3.2', nome:'Jurisprudência aplicada dos tribunais superiores' },
    ]},
    { id:'dc4', nome:'Direitos e Garantias Fundamentais', subtopicos:[
      { id:'dc4.1', nome:'Direitos e deveres individuais e coletivos' },
      { id:'dc4.2', nome:'Habeas corpus, mandado de segurança, mandado de injunção e habeas data' },
      { id:'dc4.3', nome:'Direitos sociais' },
      { id:'dc4.4', nome:'Nacionalidade' },
      { id:'dc4.5', nome:'Direitos políticos' },
      { id:'dc4.6', nome:'Partidos políticos' },
      { id:'dc4.7', nome:'Jurisprudência aplicada dos tribunais superiores' },
    ]},
    { id:'dc5', nome:'Organização do Estado', subtopicos:[
      { id:'dc5.1', nome:'Organização político-administrativa' },
      { id:'dc5.2', nome:'Estado federal brasileiro' },
      { id:'dc5.3', nome:'A União' },
      { id:'dc5.4', nome:'Estados federados' },
      { id:'dc5.5', nome:'Municípios' },
      { id:'dc5.6', nome:'O Distrito Federal' },
      { id:'dc5.7', nome:'Territórios' },
      { id:'dc5.8', nome:'Intervenção federal' },
      { id:'dc5.9', nome:'Intervenção dos estados nos municípios' },
      { id:'dc5.10', nome:'Jurisprudência aplicada dos tribunais superiores' },
    ]},
    { id:'dc6', nome:'Administração Pública (Constitucional)', subtopicos:[
      { id:'dc6.1', nome:'Disposições gerais' },
      { id:'dc6.2', nome:'Servidores públicos' },
      { id:'dc6.3', nome:'Militares dos estados, do DF e dos territórios' },
      { id:'dc6.4', nome:'Jurisprudência aplicada dos tribunais superiores' },
    ]},
    { id:'dc7', nome:'Organização dos Poderes', subtopicos:[
      { id:'dc7.1', nome:'Mecanismos de freios e contrapesos' },
      { id:'dc7.2', nome:'Poder Legislativo' },
      { id:'dc7.3', nome:'Poder Executivo' },
      { id:'dc7.4', nome:'Poder Judiciário' },
      { id:'dc7.5', nome:'Jurisprudência aplicada dos tribunais superiores' },
    ]},
    { id:'dc8', nome:'Funções Essenciais à Justiça', subtopicos:[
      { id:'dc8.1', nome:'Ministério Público' },
      { id:'dc8.2', nome:'Advocacia Pública' },
      { id:'dc8.3', nome:'Advocacia e Defensoria Pública' },
      { id:'dc8.4', nome:'Jurisprudência aplicada dos tribunais superiores' },
    ]},
    { id:'dc9', nome:'Controle da Constitucionalidade', subtopicos:[
      { id:'dc9.1', nome:'Sistemas gerais e sistema brasileiro' },
      { id:'dc9.2', nome:'Controle incidental ou concreto' },
      { id:'dc9.3', nome:'Controle abstrato de constitucionalidade' },
      { id:'dc9.4', nome:'Exame in abstractu de proposições legislativas' },
      { id:'dc9.5', nome:'Ação declaratória de constitucionalidade' },
      { id:'dc9.6', nome:'Ação direta de inconstitucionalidade' },
      { id:'dc9.7', nome:'Arguição de descumprimento de preceito fundamental' },
      { id:'dc9.8', nome:'Ação direta de inconstitucionalidade por omissão' },
      { id:'dc9.9', nome:'Ação direta de inconstitucionalidade interventiva' },
      { id:'dc9.10', nome:'Controle concreto e abstrato do direito municipal' },
      { id:'dc9.11', nome:'Jurisprudência aplicada dos tribunais superiores' },
    ]},
    { id:'dc10', nome:'Defesa do Estado e das Instituições Democráticas', subtopicos:[
      { id:'dc10.1', nome:'Jurisprudência aplicada dos tribunais superiores' },
    ]},
    { id:'dc11', nome:'Sistema Tributário Nacional (Constitucional)', subtopicos:[
      { id:'dc11.1', nome:'Princípios gerais' },
      { id:'dc11.2', nome:'Limitações do poder de tributar' },
      { id:'dc11.3', nome:'Impostos da União, dos Estados e dos municípios' },
      { id:'dc11.4', nome:'Repartição das receitas tributárias' },
      { id:'dc11.5', nome:'Jurisprudência aplicada dos tribunais superiores' },
    ]},
    { id:'dc12', nome:'Finanças Públicas (Constitucional)', subtopicos:[
      { id:'dc12.1', nome:'Normas gerais' },
      { id:'dc12.2', nome:'Orçamentos' },
      { id:'dc12.3', nome:'Jurisprudência aplicada dos tribunais superiores' },
    ]},
    { id:'dc13', nome:'Ordem Econômica e Financeira', subtopicos:[
      { id:'dc13.1', nome:'Princípios gerais da atividade econômica' },
      { id:'dc13.2', nome:'Política urbana, agrícola e fundiária e reforma agrária' },
      { id:'dc13.3', nome:'Jurisprudência aplicada dos tribunais superiores' },
    ]},
    { id:'dc14', nome:'Sistema Financeiro Nacional', subtopicos:[
      { id:'dc14.1', nome:'Sistema Financeiro Nacional' },
    ]},
    { id:'dc15', nome:'Ordem Social', subtopicos:[
      { id:'dc15.1', nome:'Ordem social' },
    ]},
    { id:'dc16', nome:'Lei Orgânica do Município de Belo Horizonte', subtopicos:[
      { id:'dc16.1', nome:'Lei Orgânica do Município de Belo Horizonte' },
    ]},
  ]},

  /* ═══ 2. DIREITO ADMINISTRATIVO ═══ */
  { id:'da', nome:'Direito Administrativo', cor:'#059669', topicos:[
    { id:'da1', nome:'Introdução ao Direito Administrativo', subtopicos:[
      { id:'da1.1', nome:'Origem, natureza jurídica e objeto' },
      { id:'da1.2', nome:'Critérios de conceituação do direito administrativo' },
      { id:'da1.3', nome:'Fontes do direito administrativo' },
      { id:'da1.4', nome:'Sistemas administrativos: inglês, francês e brasileiro' },
    ]},
    { id:'da2', nome:'Administração Pública', subtopicos:[
      { id:'da2.1', nome:'Sentido amplo e sentido estrito' },
      { id:'da2.2', nome:'Sentido objetivo e sentido subjetivo' },
      { id:'da2.3', nome:'Princípios expressos e implícitos' },
    ]},
    { id:'da3', nome:'Regime Jurídico-Administrativo', subtopicos:[
      { id:'da3.1', nome:'Conceito' },
      { id:'da3.2', nome:'Supremacia do interesse público e indisponibilidade' },
      { id:'da3.3', nome:'Jurisprudência aplicada dos tribunais superiores' },
    ]},
    { id:'da4', nome:'Organização Administrativa', subtopicos:[
      { id:'da4.1', nome:'Centralização, descentralização, concentração e desconcentração' },
      { id:'da4.2', nome:'Administração direta' },
      { id:'da4.3', nome:'Administração indireta' },
      { id:'da4.4', nome:'Serviços sociais autônomos, entidades de apoio, OS e OSCIP' },
      { id:'da4.5', nome:'Jurisprudência aplicada dos tribunais superiores' },
    ]},
    { id:'da5', nome:'Atos Administrativos', subtopicos:[
      { id:'da5.1', nome:'Conceito' },
      { id:'da5.2', nome:'Fatos da administração, atos da administração e atos administrativos' },
      { id:'da5.3', nome:'Requisitos ou elementos' },
      { id:'da5.4', nome:'Atributos' },
      { id:'da5.5', nome:'Classificação' },
      { id:'da5.6', nome:'Atos administrativos em espécie' },
      { id:'da5.7', nome:'O silêncio no direito administrativo' },
      { id:'da5.8', nome:'Extinção: revogação, anulação e cassação' },
      { id:'da5.9', nome:'Convalidação' },
      { id:'da5.10', nome:'Vinculação e discricionariedade' },
      { id:'da5.11', nome:'Atos nulos, anuláveis e inexistentes' },
      { id:'da5.12', nome:'Decadência administrativa' },
      { id:'da5.13', nome:'Jurisprudência aplicada dos tribunais superiores' },
    ]},
    { id:'da6', nome:'Processo Administrativo', subtopicos:[
      { id:'da6.1', nome:'Lei nº 9.784/1999' },
      { id:'da6.2', nome:'Disposições doutrinárias aplicáveis' },
      { id:'da6.3', nome:'Jurisprudência aplicada dos tribunais superiores' },
    ]},
    { id:'da7', nome:'Poderes e Deveres da Administração Pública', subtopicos:[
      { id:'da7.1', nome:'Poder regulamentar' },
      { id:'da7.2', nome:'Poder hierárquico' },
      { id:'da7.3', nome:'Poder disciplinar' },
      { id:'da7.4', nome:'Poder de polícia' },
      { id:'da7.5', nome:'Dever de agir' },
      { id:'da7.6', nome:'Dever de eficiência' },
      { id:'da7.7', nome:'Dever de probidade' },
      { id:'da7.8', nome:'Dever de prestação de contas' },
      { id:'da7.9', nome:'Uso e abuso do poder' },
      { id:'da7.10', nome:'Jurisprudência aplicada dos tribunais superiores' },
    ]},
    { id:'da8', nome:'Serviços Públicos', subtopicos:[
      { id:'da8.1', nome:'Lei nº 8.987/1995' },
      { id:'da8.2', nome:'Lei nº 11.079/2004 (parceria público-privada)' },
      { id:'da8.3', nome:'Disposições doutrinárias' },
    ]},
    { id:'da9', nome:'Intervenção do Estado na Propriedade', subtopicos:[
      { id:'da9.1', nome:'Conceito' },
      { id:'da9.2', nome:'Fundamento' },
      { id:'da9.3', nome:'Modalidades' },
      { id:'da9.4', nome:'Jurisprudência aplicada dos tribunais superiores' },
    ]},
    { id:'da10', nome:'Licitações', subtopicos:[
      { id:'da10.1', nome:'Lei nº 8.666/1993 e alterações' },
      { id:'da10.2', nome:'Lei nº 10.520/2002 e demais normas do pregão' },
      { id:'da10.3', nome:'Decreto nº 7.892/2013 (Sistema de Registro de Preços)' },
      { id:'da10.4', nome:'Lei nº 12.462/2011 (RDC)' },
      { id:'da10.5', nome:'Fundamentos constitucionais' },
      { id:'da10.6', nome:'Lei Complementar nº 123/2006' },
      { id:'da10.7', nome:'Disposições doutrinárias' },
      { id:'da10.8', nome:'Jurisprudência aplicada dos tribunais superiores' },
    ]},
    { id:'da11', nome:'Contratos Administrativos', subtopicos:[
      { id:'da11.1', nome:'Lei nº 8.666/1993 e alterações' },
      { id:'da11.2', nome:'Decreto nº 6.170/2007 e Portaria Interministerial 507/2011' },
      { id:'da11.3', nome:'Lei nº 11.107/2005 e Decreto nº 6.017/2007 (consórcios públicos)' },
      { id:'da11.4', nome:'Lei nº 13.019/2014 (parcerias com OSC)' },
      { id:'da11.5', nome:'Disposições doutrinárias' },
      { id:'da11.6', nome:'Jurisprudência aplicada dos tribunais superiores' },
    ]},
    { id:'da12', nome:'Controle da Administração Pública', subtopicos:[
      { id:'da12.1', nome:'Conceito' },
      { id:'da12.2', nome:'Classificação das formas de controle' },
      { id:'da12.3', nome:'Controle exercido pela administração pública' },
      { id:'da12.4', nome:'Controle legislativo' },
      { id:'da12.5', nome:'Controle judicial' },
      { id:'da12.6', nome:'Jurisprudência aplicada dos tribunais superiores' },
    ]},
    { id:'da13', nome:'Improbidade Administrativa', subtopicos:[
      { id:'da13.1', nome:'Lei nº 8.429/1992 e alterações' },
      { id:'da13.2', nome:'Disposições doutrinárias aplicáveis' },
      { id:'da13.3', nome:'Jurisprudência aplicada dos tribunais superiores' },
    ]},
    { id:'da14', nome:'Agentes Públicos', subtopicos:[
      { id:'da14.1', nome:'Lei Municipal nº 7.169/1996 (Estatuto dos Servidores de BH)' },
      { id:'da14.2', nome:'Disposições constitucionais aplicáveis' },
      { id:'da14.3', nome:'Disposições doutrinárias' },
      { id:'da14.4', nome:'Jurisprudência aplicada dos tribunais superiores' },
    ]},
    { id:'da15', nome:'Bens Públicos', subtopicos:[
      { id:'da15.1', nome:'Conceito' },
      { id:'da15.2', nome:'Classificação' },
      { id:'da15.3', nome:'Características' },
      { id:'da15.4', nome:'Espécies' },
      { id:'da15.5', nome:'Afetação e desafetação' },
      { id:'da15.6', nome:'Aquisição e alienação' },
      { id:'da15.7', nome:'Uso dos bens públicos por particular' },
      { id:'da15.8', nome:'Jurisprudência aplicada dos tribunais superiores' },
    ]},
    { id:'da16', nome:'Responsabilidade Civil do Estado', subtopicos:[
      { id:'da16.1', nome:'Evolução histórica' },
      { id:'da16.2', nome:'Teorias subjetivas e objetivas' },
      { id:'da16.3', nome:'Responsabilidade civil do Estado no direito brasileiro' },
      { id:'da16.4', nome:'Requisitos para demonstração da responsabilidade' },
      { id:'da16.5', nome:'Causas excludentes e atenuantes' },
      { id:'da16.6', nome:'Reparação do dano' },
      { id:'da16.7', nome:'Direito de regresso' },
      { id:'da16.8', nome:'Responsabilidade primária e subsidiária' },
      { id:'da16.9', nome:'Responsabilidade por atos legislativos' },
      { id:'da16.10', nome:'Responsabilidade por atos judiciais' },
    ]},
  ]},

  /* ═══ 3. DIREITO PROCESSUAL CIVIL ═══ */
  { id:'pc', nome:'Direito Processual Civil', cor:'#d97706', topicos:[
    { id:'pc1', nome:'CPC e Normas Processuais', subtopicos:[
      { id:'pc1.1', nome:'Lei nº 13.105/2015 — Novo CPC' },
      { id:'pc1.2', nome:'Normas processuais civis' },
    ]},
    { id:'pc2', nome:'Jurisdição', subtopicos:[
      { id:'pc2.1', nome:'A jurisdição' },
    ]},
    { id:'pc3', nome:'Ação', subtopicos:[
      { id:'pc3.1', nome:'Conceito, natureza, elementos e características' },
      { id:'pc3.2', nome:'Condições da ação' },
      { id:'pc3.3', nome:'Classificação' },
    ]},
    { id:'pc4', nome:'Pressupostos Processuais', subtopicos:[
      { id:'pc4.1', nome:'Pressupostos processuais' },
    ]},
    { id:'pc5', nome:'Preclusão', subtopicos:[
      { id:'pc5.1', nome:'Preclusão' },
    ]},
    { id:'pc6', nome:'Sujeitos do Processo', subtopicos:[
      { id:'pc6.1', nome:'Capacidade processual e postulatória' },
      { id:'pc6.2', nome:'Deveres das partes e procuradores' },
      { id:'pc6.3', nome:'Procuradores' },
      { id:'pc6.4', nome:'Sucessão das partes e dos procuradores' },
    ]},
    { id:'pc7', nome:'Litisconsórcio', subtopicos:[
      { id:'pc7.1', nome:'Litisconsórcio' },
    ]},
    { id:'pc8', nome:'Intervenção de Terceiros', subtopicos:[
      { id:'pc8.1', nome:'Intervenção de terceiros' },
    ]},
    { id:'pc9', nome:'Poderes, Deveres e Responsabilidade do Juiz', subtopicos:[
      { id:'pc9.1', nome:'Poderes, deveres e responsabilidade do juiz' },
    ]},
    { id:'pc10', nome:'Ministério Público', subtopicos:[
      { id:'pc10.1', nome:'Ministério Público' },
    ]},
    { id:'pc11', nome:'Advocacia Pública', subtopicos:[
      { id:'pc11.1', nome:'Advocacia Pública' },
    ]},
    { id:'pc12', nome:'Defensoria Pública', subtopicos:[
      { id:'pc12.1', nome:'Defensoria pública' },
    ]},
    { id:'pc13', nome:'Atos Processuais', subtopicos:[
      { id:'pc13.1', nome:'Forma dos atos' },
      { id:'pc13.2', nome:'Tempo e lugar' },
      { id:'pc13.3', nome:'Prazos' },
      { id:'pc13.4', nome:'Comunicação dos atos processuais' },
      { id:'pc13.5', nome:'Nulidades' },
      { id:'pc13.6', nome:'Distribuição e registro' },
      { id:'pc13.7', nome:'Valor da causa' },
    ]},
    { id:'pc14', nome:'Tutela Provisória', subtopicos:[
      { id:'pc14.1', nome:'Tutela de urgência' },
      { id:'pc14.2', nome:'Disposições gerais' },
    ]},
    { id:'pc15', nome:'Formação, Suspensão e Extinção do Processo', subtopicos:[
      { id:'pc15.1', nome:'Formação, suspensão e extinção do processo' },
    ]},
    { id:'pc16', nome:'Processo de Conhecimento e Cumprimento de Sentença', subtopicos:[
      { id:'pc16.1', nome:'Procedimento comum' },
      { id:'pc16.2', nome:'Disposições gerais' },
      { id:'pc16.3', nome:'Petição inicial' },
      { id:'pc16.4', nome:'Improcedência liminar do pedido' },
      { id:'pc16.5', nome:'Audiência de conciliação ou de mediação' },
      { id:'pc16.6', nome:'Contestação, reconvenção e revelia' },
      { id:'pc16.7', nome:'Audiência de instrução e julgamento' },
      { id:'pc16.8', nome:'Providências preliminares e de saneamento' },
      { id:'pc16.9', nome:'Julgamento conforme o estado do processo' },
      { id:'pc16.10', nome:'Provas' },
      { id:'pc16.11', nome:'Sentença e coisa julgada' },
      { id:'pc16.12', nome:'Cumprimento da sentença' },
      { id:'pc16.13', nome:'Liquidação' },
    ]},
    { id:'pc17', nome:'Procedimentos Especiais', subtopicos:[
      { id:'pc17.1', nome:'Procedimentos especiais' },
    ]},
    { id:'pc18', nome:'Procedimentos de Jurisdição Voluntária', subtopicos:[
      { id:'pc18.1', nome:'Procedimentos de jurisdição voluntária' },
    ]},
    { id:'pc19', nome:'Processos de Execução', subtopicos:[
      { id:'pc19.1', nome:'Processos de execução' },
    ]},
    { id:'pc20', nome:'Processos nos Tribunais e Recursos', subtopicos:[
      { id:'pc20.1', nome:'Processos nos tribunais e meios de impugnação das decisões judiciais' },
    ]},
    { id:'pc21', nome:'Livro Complementar', subtopicos:[
      { id:'pc21.1', nome:'Livro complementar' },
    ]},
    { id:'pc22', nome:'Disposições Finais e Transitórias', subtopicos:[
      { id:'pc22.1', nome:'Disposições finais e transitórias' },
    ]},
    { id:'pc23', nome:'Mandado de Segurança', subtopicos:[
      { id:'pc23.1', nome:'Mandado de segurança' },
    ]},
    { id:'pc24', nome:'Ação Popular', subtopicos:[
      { id:'pc24.1', nome:'Ação popular' },
    ]},
    { id:'pc25', nome:'Ação Civil Pública', subtopicos:[
      { id:'pc25.1', nome:'Ação civil pública' },
    ]},
    { id:'pc26', nome:'Ação de Improbidade Administrativa', subtopicos:[
      { id:'pc26.1', nome:'Ação de improbidade administrativa' },
    ]},
    { id:'pc27', nome:'Reclamação Constitucional', subtopicos:[
      { id:'pc27.1', nome:'Reclamação constitucional' },
    ]},
    { id:'pc28', nome:'Locação de Imóveis Urbanos', subtopicos:[
      { id:'pc28.1', nome:'Lei nº 8.245/1991 e alterações' },
      { id:'pc28.2', nome:'Procedimentos' },
    ]},
    { id:'pc29', nome:'Jurisprudência dos Tribunais Superiores', subtopicos:[
      { id:'pc29.1', nome:'Jurisprudência dos tribunais superiores' },
    ]},
  ]},

  /* ═══ 4. DIREITO TRIBUTÁRIO ═══ */
  { id:'dt', nome:'Direito Tributário', cor:'#7c3aed', topicos:[
    { id:'dt1', nome:'Sistema Tributário Nacional', subtopicos:[
      { id:'dt1.1', nome:'Princípios do direito tributário' },
      { id:'dt1.2', nome:'Limitações do poder de tributar' },
      { id:'dt1.3', nome:'Repartição das receitas tributárias' },
    ]},
    { id:'dt2', nome:'Tributo', subtopicos:[
      { id:'dt2.1', nome:'Conceito' },
      { id:'dt2.2', nome:'Natureza jurídica' },
      { id:'dt2.3', nome:'Espécies' },
      { id:'dt2.4', nome:'Imposto' },
      { id:'dt2.5', nome:'Taxa' },
      { id:'dt2.6', nome:'Contribuição de melhoria' },
      { id:'dt2.7', nome:'Empréstimo compulsório' },
      { id:'dt2.8', nome:'Contribuições' },
    ]},
    { id:'dt3', nome:'Competência Tributária', subtopicos:[
      { id:'dt3.1', nome:'Classificação' },
      { id:'dt3.2', nome:'Exercício da competência tributária' },
      { id:'dt3.3', nome:'Capacidade tributária ativa' },
      { id:'dt3.4', nome:'Imunidade tributária' },
      { id:'dt3.5', nome:'Distinção entre imunidade, isenção e não incidência' },
      { id:'dt3.6', nome:'Imunidades em espécie' },
    ]},
    { id:'dt4', nome:'Fontes do Direito Tributário', subtopicos:[
      { id:'dt4.1', nome:'Constituição Federal' },
      { id:'dt4.2', nome:'Leis complementares' },
      { id:'dt4.3', nome:'Leis ordinárias e atos equivalentes' },
      { id:'dt4.4', nome:'Tratados internacionais' },
      { id:'dt4.5', nome:'Atos do poder executivo federal com força de lei material' },
      { id:'dt4.6', nome:'Atos exclusivos do poder legislativo' },
      { id:'dt4.7', nome:'Convênios' },
      { id:'dt4.8', nome:'Decretos regulamentares' },
      { id:'dt4.9', nome:'Normas complementares' },
    ]},
    { id:'dt5', nome:'Vigência, Aplicação, Interpretação e Integração', subtopicos:[
      { id:'dt5.1', nome:'Vigência, aplicação, interpretação e integração da legislação tributária' },
    ]},
    { id:'dt6', nome:'Obrigação Tributária', subtopicos:[
      { id:'dt6.1', nome:'Definição e natureza jurídica' },
      { id:'dt6.2', nome:'Obrigação principal e acessória' },
      { id:'dt6.3', nome:'Fato gerador' },
      { id:'dt6.4', nome:'Sujeito ativo' },
      { id:'dt6.5', nome:'Sujeito passivo' },
      { id:'dt6.6', nome:'Solidariedade' },
      { id:'dt6.7', nome:'Capacidade tributária' },
      { id:'dt6.8', nome:'Domicílio tributário' },
      { id:'dt6.9', nome:'Responsabilidade tributária' },
      { id:'dt6.10', nome:'Responsabilidade dos sucessores' },
      { id:'dt6.11', nome:'Responsabilidade de terceiros' },
      { id:'dt6.12', nome:'Responsabilidade por infrações' },
    ]},
    { id:'dt7', nome:'Crédito Tributário', subtopicos:[
      { id:'dt7.1', nome:'Constituição do crédito tributário' },
      { id:'dt7.2', nome:'Lançamento' },
      { id:'dt7.3', nome:'Modalidades de lançamento' },
      { id:'dt7.4', nome:'Suspensão do crédito tributário' },
      { id:'dt7.5', nome:'Extinção do crédito tributário' },
      { id:'dt7.6', nome:'Exclusão do crédito tributário' },
      { id:'dt7.7', nome:'Garantias e privilégios do crédito tributário' },
    ]},
    { id:'dt8', nome:'Administração Tributária', subtopicos:[
      { id:'dt8.1', nome:'Fiscalização' },
      { id:'dt8.2', nome:'Dívida ativa' },
      { id:'dt8.3', nome:'Certidões negativas' },
    ]},
    { id:'dt9', nome:'Impostos da União', subtopicos:[
      { id:'dt9.1', nome:'Importação de produtos estrangeiros' },
      { id:'dt9.2', nome:'Exportação de produtos nacionais ou nacionalizados' },
      { id:'dt9.3', nome:'Renda e proventos de qualquer natureza' },
      { id:'dt9.4', nome:'Produtos industrializados' },
      { id:'dt9.5', nome:'Operações de crédito, câmbio, seguro e títulos/valores mobiliários' },
      { id:'dt9.6', nome:'Propriedade territorial rural' },
      { id:'dt9.7', nome:'Grandes fortunas' },
    ]},
    { id:'dt10', nome:'Impostos dos Estados e do DF', subtopicos:[
      { id:'dt10.1', nome:'Transmissão causa mortis e doação (ITCMD)' },
      { id:'dt10.2', nome:'Circulação de mercadorias e serviços (ICMS)' },
      { id:'dt10.3', nome:'Propriedade de veículos automotores (IPVA)' },
    ]},
    { id:'dt11', nome:'Impostos dos Municípios', subtopicos:[
      { id:'dt11.1', nome:'Propriedade predial e territorial urbana (IPTU)' },
      { id:'dt11.2', nome:'Transmissão inter vivos de bens imóveis (ITBI)' },
      { id:'dt11.3', nome:'Serviços de qualquer natureza (ISS)' },
    ]},
    { id:'dt12', nome:'Processo Administrativo Tributário', subtopicos:[
      { id:'dt12.1', nome:'Princípios básicos' },
      { id:'dt12.2', nome:'Acepções e espécies' },
      { id:'dt12.3', nome:'Determinação e exigência do crédito tributário' },
      { id:'dt12.4', nome:'Representação fiscal para fins penais' },
    ]},
    { id:'dt13', nome:'Processo Judicial Tributário', subtopicos:[
      { id:'dt13.1', nome:'Ação de execução fiscal' },
      { id:'dt13.2', nome:'Lei nº 6.830/1980 (Execução Fiscal)' },
      { id:'dt13.3', nome:'Ação cautelar fiscal' },
      { id:'dt13.4', nome:'Ação declaratória de inexistência de relação jurídico-tributária' },
      { id:'dt13.5', nome:'Ação anulatória de débito fiscal' },
      { id:'dt13.6', nome:'Mandado de segurança' },
      { id:'dt13.7', nome:'Ação de repetição de indébito' },
      { id:'dt13.8', nome:'Ação de consignação em pagamento' },
      { id:'dt13.9', nome:'Ações de controle de constitucionalidade' },
      { id:'dt13.10', nome:'Ação civil pública' },
    ]},
    { id:'dt14', nome:'Microempresa e EPP', subtopicos:[
      { id:'dt14.1', nome:'Lei Complementar nº 123/2006 e alterações' },
    ]},
    { id:'dt15', nome:'Ilícito Tributário', subtopicos:[
      { id:'dt15.1', nome:'Ilícito administrativo tributário' },
      { id:'dt15.2', nome:'Ilícito penal tributário' },
      { id:'dt15.3', nome:'Crimes contra a ordem tributária' },
      { id:'dt15.4', nome:'Lei nº 8.137/1990 e alterações' },
    ]},
  ]},

  /* ═══ 5. DIREITO FINANCEIRO ═══ */
  { id:'df', nome:'Direito Financeiro', cor:'#0891b2', topicos:[
    { id:'df1', nome:'Direito Financeiro', subtopicos:[
      { id:'df1.1', nome:'Conceito e objeto' },
      { id:'df1.2', nome:'Direito financeiro na CF/1988' },
    ]},
    { id:'df2', nome:'Orçamento Público', subtopicos:[
      { id:'df2.1', nome:'Conceito, espécies e natureza jurídica' },
      { id:'df2.2', nome:'Princípios orçamentários' },
      { id:'df2.3', nome:'Leis orçamentárias' },
      { id:'df2.4', nome:'Lei nº 4.320/1964 e alterações' },
      { id:'df2.5', nome:'Fiscalização financeira e orçamentária' },
    ]},
    { id:'df3', nome:'Despesa Pública', subtopicos:[
      { id:'df3.1', nome:'Conceito e classificação de despesa pública' },
      { id:'df3.2', nome:'Disciplina constitucional dos precatórios' },
    ]},
    { id:'df4', nome:'Receita Pública', subtopicos:[
      { id:'df4.1', nome:'Conceito, ingresso e receitas' },
      { id:'df4.2', nome:'Classificação das receitas públicas' },
    ]},
    { id:'df5', nome:'Lei de Responsabilidade Fiscal', subtopicos:[
      { id:'df5.1', nome:'Planejamento' },
      { id:'df5.2', nome:'Receita pública' },
      { id:'df5.3', nome:'Despesa pública' },
      { id:'df5.4', nome:'Transferências voluntárias' },
      { id:'df5.5', nome:'Destinação de recursos públicos ao setor privado' },
      { id:'df5.6', nome:'Dívida e endividamento' },
      { id:'df5.7', nome:'Gestão patrimonial' },
      { id:'df5.8', nome:'Transparência, controle e fiscalização' },
      { id:'df5.9', nome:'Disposições preliminares, finais e transitórias' },
    ]},
    { id:'df6', nome:'Crédito Público', subtopicos:[
      { id:'df6.1', nome:'Conceito e classificação de crédito público' },
      { id:'df6.2', nome:'Natureza jurídica' },
      { id:'df6.3', nome:'Controle, fiscalização e prestação de contas' },
    ]},
    { id:'df7', nome:'Dívida Pública', subtopicos:[
      { id:'df7.1', nome:'Dívida ativa da União de natureza tributária e não tributária' },
    ]},
  ]},

  /* ═══ 6. DIREITO PENAL ═══ */
  { id:'dpe', nome:'Direito Penal', cor:'#991b1b', topicos:[
    { id:'dpe1', nome:'Direito Penal e Poder Punitivo', subtopicos:[
      { id:'dpe1.1', nome:'Teoria do Direito Penal' },
      { id:'dpe1.2', nome:'Política Criminal e Criminologia — noções básicas' },
      { id:'dpe1.3', nome:'Criminalização primária e secundária' },
      { id:'dpe1.4', nome:'Seletividade do sistema penal' },
    ]},
    { id:'dpe2', nome:'Direito Penal de Autor e do Ato', subtopicos:[
      { id:'dpe2.1', nome:'Garantismo Penal' },
      { id:'dpe2.2', nome:'Direito Penal do Inimigo' },
      { id:'dpe2.3', nome:'Dinâmica histórica da legislação penal' },
      { id:'dpe2.4', nome:'Genealogia do pensamento penal' },
      { id:'dpe2.5', nome:'Direito Penal e Filosofia' },
    ]},
    { id:'dpe3', nome:'Funções da Pena', subtopicos:[
      { id:'dpe3.1', nome:'Teorias das funções da pena' },
    ]},
    { id:'dpe4', nome:'Características e Fontes do Direito Penal', subtopicos:[
      { id:'dpe4.1', nome:'Características e fontes do direito penal' },
    ]},
    { id:'dpe5', nome:'Princípios Aplicáveis ao Direito Penal', subtopicos:[
      { id:'dpe5.1', nome:'Princípios aplicáveis ao direito penal' },
    ]},
    { id:'dpe6', nome:'Bem Jurídico-Penal', subtopicos:[
      { id:'dpe6.1', nome:'Teorias do bem jurídico-penal' },
    ]},
    { id:'dpe7', nome:'Aplicação da Lei Penal', subtopicos:[
      { id:'dpe7.1', nome:'A lei penal no tempo e no espaço' },
      { id:'dpe7.2', nome:'Tempo e lugar do crime' },
      { id:'dpe7.3', nome:'Lei penal excepcional, especial e temporária' },
      { id:'dpe7.4', nome:'Territorialidade e extraterritorialidade' },
      { id:'dpe7.5', nome:'Pena cumprida no estrangeiro' },
      { id:'dpe7.6', nome:'Eficácia da sentença estrangeira' },
      { id:'dpe7.7', nome:'Contagem de prazo' },
      { id:'dpe7.8', nome:'Frações não computáveis da pena' },
      { id:'dpe7.9', nome:'Interpretação da lei penal' },
      { id:'dpe7.10', nome:'Analogia' },
      { id:'dpe7.11', nome:'Irretroatividade da lei penal' },
      { id:'dpe7.12', nome:'Conflito aparente de normas penais' },
    ]},
    { id:'dpe8', nome:'Teoria do Delito', subtopicos:[
      { id:'dpe8.1', nome:'Classificação dos crimes' },
      { id:'dpe8.2', nome:'Teoria da ação' },
      { id:'dpe8.3', nome:'Teoria do tipo — fato típico e seus elementos' },
      { id:'dpe8.4', nome:'Relação de causalidade e imputação objetiva' },
      { id:'dpe8.5', nome:'Tipos dolosos de ação' },
      { id:'dpe8.6', nome:'Tipos dos crimes de imprudência' },
      { id:'dpe8.7', nome:'Tipos dos crimes de omissão' },
      { id:'dpe8.8', nome:'Consumação e tentativa' },
    ]},
    { id:'dpe9', nome:'Desistência Voluntária e Arrependimento Eficaz', subtopicos:[
      { id:'dpe9.1', nome:'Desistência voluntária e arrependimento eficaz' },
    ]},
    { id:'dpe10', nome:'Arrependimento Posterior', subtopicos:[
      { id:'dpe10.1', nome:'Arrependimento posterior' },
    ]},
    { id:'dpe11', nome:'Crime Impossível', subtopicos:[
      { id:'dpe11.1', nome:'Crime impossível' },
    ]},
    { id:'dpe12', nome:'Agravação pelo Resultado', subtopicos:[
      { id:'dpe12.1', nome:'Agravação pelo resultado' },
    ]},
    { id:'dpe13', nome:'Erro', subtopicos:[
      { id:'dpe13.1', nome:'Descriminantes putativas' },
      { id:'dpe13.2', nome:'Erro determinado por terceiro' },
      { id:'dpe13.3', nome:'Erro sobre a pessoa' },
      { id:'dpe13.4', nome:'Erro sobre a ilicitude do fato (erro de proibição)' },
    ]},
    { id:'dpe14', nome:'Concurso de Crimes', subtopicos:[
      { id:'dpe14.1', nome:'Concurso de crimes' },
    ]},
    { id:'dpe15', nome:'Ilicitude', subtopicos:[
      { id:'dpe15.1', nome:'Ilicitude' },
    ]},
    { id:'dpe16', nome:'Culpabilidade', subtopicos:[
      { id:'dpe16.1', nome:'Culpabilidade' },
    ]},
    { id:'dpe17', nome:'Concurso de Pessoas', subtopicos:[
      { id:'dpe17.1', nome:'Concurso de pessoas' },
    ]},
    { id:'dpe18', nome:'Penas', subtopicos:[
      { id:'dpe18.1', nome:'Espécies de penas' },
      { id:'dpe18.2', nome:'Cominação das penas' },
      { id:'dpe18.3', nome:'Aplicação da pena' },
      { id:'dpe18.4', nome:'Suspensão condicional da pena' },
      { id:'dpe18.5', nome:'Livramento condicional' },
      { id:'dpe18.6', nome:'Efeitos da condenação' },
      { id:'dpe18.7', nome:'Reabilitação' },
      { id:'dpe18.8', nome:'Execução das penas em espécie e incidentes de execução' },
      { id:'dpe18.9', nome:'Limites das penas' },
    ]},
    { id:'dpe19', nome:'Medidas de Segurança', subtopicos:[
      { id:'dpe19.1', nome:'Execução das medidas de segurança' },
    ]},
    { id:'dpe20', nome:'Ação Penal', subtopicos:[
      { id:'dpe20.1', nome:'Ação penal' },
    ]},
    { id:'dpe21', nome:'Punibilidade e Causas de Extinção', subtopicos:[
      { id:'dpe21.1', nome:'Punibilidade e causas de extinção' },
    ]},
    { id:'dpe22', nome:'Prescrição', subtopicos:[
      { id:'dpe22.1', nome:'Prescrição' },
    ]},
    { id:'dpe23', nome:'Crimes contra a Incolumidade Pública', subtopicos:[
      { id:'dpe23.1', nome:'Crimes contra a incolumidade pública' },
    ]},
    { id:'dpe24', nome:'Crimes contra a Paz Pública', subtopicos:[
      { id:'dpe24.1', nome:'Crimes contra a paz pública' },
    ]},
    { id:'dpe25', nome:'Crimes contra a Fé Pública', subtopicos:[
      { id:'dpe25.1', nome:'Crimes contra a fé pública' },
    ]},
    { id:'dpe26', nome:'Crimes contra a Administração Pública', subtopicos:[
      { id:'dpe26.1', nome:'Crimes contra a administração pública' },
    ]},
    { id:'dpe27', nome:'Legislação Penal Especial', subtopicos:[
      { id:'dpe27.1', nome:'Lei nº 8.072/1990 (delitos hediondos)' },
      { id:'dpe27.2', nome:'Lei nº 7.716/1989 (crimes de preconceito de raça ou cor)' },
      { id:'dpe27.3', nome:'Lei nº 9.455/1997 (crimes de tortura)' },
      { id:'dpe27.4', nome:'Lei nº 12.694/2012 e Lei nº 12.850/2013 (crime organizado)' },
      { id:'dpe27.5', nome:'Lei nº 9.605/1998 (crimes ambientais)' },
      { id:'dpe27.6', nome:'Lei nº 4.898/1965 (abuso de autoridade)' },
      { id:'dpe27.7', nome:'Lei nº 9.613/1998 (lavagem de dinheiro)' },
      { id:'dpe27.8', nome:'Lei nº 8.069/1990 (ECA)' },
    ]},
    { id:'dpe28', nome:'Direito Penal Econômico', subtopicos:[
      { id:'dpe28.1', nome:'Direito penal econômico' },
    ]},
    { id:'dpe29', nome:'Disposições Constitucionais Aplicáveis', subtopicos:[
      { id:'dpe29.1', nome:'Disposições constitucionais aplicáveis ao direito penal' },
    ]},
    { id:'dpe30', nome:'Entendimento dos Tribunais Superiores', subtopicos:[
      { id:'dpe30.1', nome:'Entendimento dos tribunais superiores sobre institutos de direito penal' },
    ]},
  ]},

  /* ═══ 7. DIREITO PROCESSUAL PENAL ═══ */
  { id:'pp', nome:'Direito Processual Penal', cor:'#b45309', topicos:[
    { id:'pp1', nome:'Processo Penal Brasileiro', subtopicos:[
      { id:'pp1.1', nome:'Processo penal brasileiro e processo penal constitucional' },
    ]},
    { id:'pp2', nome:'Sistemas e Princípios Fundamentais', subtopicos:[
      { id:'pp2.1', nome:'Sistemas e princípios fundamentais' },
    ]},
    { id:'pp3', nome:'Aplicação da Lei Processual', subtopicos:[
      { id:'pp3.1', nome:'Aplicação no tempo, no espaço e em relação às pessoas' },
      { id:'pp3.2', nome:'Disposições preliminares do CPP' },
    ]},
    { id:'pp4', nome:'Fase Pré-Processual', subtopicos:[
      { id:'pp4.1', nome:'Inquérito policial' },
    ]},
    { id:'pp5', nome:'Processo, Procedimento e Relação Processual', subtopicos:[
      { id:'pp5.1', nome:'Elementos identificadores da relação processual' },
      { id:'pp5.2', nome:'Formas do procedimento' },
      { id:'pp5.3', nome:'Princípios gerais e informadores do processo' },
      { id:'pp5.4', nome:'Pretensão punitiva' },
      { id:'pp5.5', nome:'Tipos de processo penal' },
    ]},
    { id:'pp6', nome:'Ação Penal', subtopicos:[
      { id:'pp6.1', nome:'Ação penal' },
    ]},
    { id:'pp7', nome:'Ação Civil Ex Delicto', subtopicos:[
      { id:'pp7.1', nome:'Ação civil ex delicto' },
    ]},
    { id:'pp8', nome:'Jurisdição e Competência', subtopicos:[
      { id:'pp8.1', nome:'Jurisdição e competência' },
    ]},
    { id:'pp9', nome:'Questões e Processos Incidentes', subtopicos:[
      { id:'pp9.1', nome:'Questões e processos incidentes' },
    ]},
    { id:'pp10', nome:'Prova', subtopicos:[
      { id:'pp10.1', nome:'Prova' },
      { id:'pp10.2', nome:'Lei nº 9.296/1996 (interceptação telefônica)' },
    ]},
    { id:'pp11', nome:'Sujeitos do Processo', subtopicos:[
      { id:'pp11.1', nome:'Sujeitos do processo' },
    ]},
    { id:'pp12', nome:'Prisão, Medidas Cautelares e Liberdade Provisória', subtopicos:[
      { id:'pp12.1', nome:'Prisão, medidas cautelares e liberdade provisória' },
      { id:'pp12.2', nome:'Lei nº 7.960/1989 (prisão temporária)' },
    ]},
    { id:'pp13', nome:'Citações e Intimações', subtopicos:[
      { id:'pp13.1', nome:'Citações e intimações' },
    ]},
    { id:'pp14', nome:'Atos Processuais e Atos Judiciais', subtopicos:[
      { id:'pp14.1', nome:'Atos processuais e atos judiciais' },
    ]},
    { id:'pp15', nome:'Procedimentos', subtopicos:[
      { id:'pp15.1', nome:'Processo comum' },
      { id:'pp15.2', nome:'Processos especiais' },
      { id:'pp15.3', nome:'Lei nº 8.038/1990 (processos no STJ e STF)' },
      { id:'pp15.4', nome:'Lei nº 9.099/1995 e Lei nº 10.259/2001 (juizados especiais)' },
    ]},
    { id:'pp16', nome:'Prazos', subtopicos:[
      { id:'pp16.1', nome:'Características, princípios e contagem' },
    ]},
    { id:'pp17', nome:'Nulidades', subtopicos:[
      { id:'pp17.1', nome:'Nulidades' },
    ]},
    { id:'pp18', nome:'Recursos em Geral', subtopicos:[
      { id:'pp18.1', nome:'Recursos em geral' },
    ]},
    { id:'pp19', nome:'Habeas Corpus', subtopicos:[
      { id:'pp19.1', nome:'Habeas corpus e seu processo' },
    ]},
    { id:'pp20', nome:'Execução Penal', subtopicos:[
      { id:'pp20.1', nome:'Lei nº 7.210/1984 e alterações (execução penal)' },
    ]},
    { id:'pp21', nome:'Relações Jurisdicionais com Autoridade Estrangeira', subtopicos:[
      { id:'pp21.1', nome:'Relações jurisdicionais com autoridade estrangeira' },
    ]},
    { id:'pp22', nome:'Disposições Gerais do CPP', subtopicos:[
      { id:'pp22.1', nome:'Disposições gerais do Código de Processo Penal' },
    ]},
    { id:'pp23', nome:'Entendimento dos Tribunais Superiores', subtopicos:[
      { id:'pp23.1', nome:'Entendimento dos tribunais superiores sobre institutos de processo penal' },
    ]},
  ]},

  /* ═══ 8. DIREITO DO TRABALHO ═══ */
  { id:'dtr', nome:'Direito do Trabalho', cor:'#4338ca', topicos:[
    { id:'dtr1', nome:'Princípios e Fontes', subtopicos:[
      { id:'dtr1.1', nome:'Princípios e fontes do direito do trabalho' },
    ]},
    { id:'dtr2', nome:'Direitos Constitucionais dos Trabalhadores', subtopicos:[
      { id:'dtr2.1', nome:'Art. 7º da CF/1988' },
    ]},
    { id:'dtr3', nome:'Relação de Trabalho e de Emprego', subtopicos:[
      { id:'dtr3.1', nome:'Requisitos e distinção' },
      { id:'dtr3.2', nome:'Relações de trabalho lato sensu (autônomo, eventual, temporário, avulso)' },
    ]},
    { id:'dtr4', nome:'Sujeitos do Contrato de Trabalho', subtopicos:[
      { id:'dtr4.1', nome:'Empregado e empregador — conceito e caracterização' },
      { id:'dtr4.2', nome:'Poderes do empregador no contrato de trabalho' },
    ]},
    { id:'dtr5', nome:'Grupo Econômico', subtopicos:[
      { id:'dtr5.1', nome:'Sucessão de empregadores' },
      { id:'dtr5.2', nome:'Responsabilidade solidária' },
    ]},
    { id:'dtr6', nome:'Contrato Individual de Trabalho', subtopicos:[
      { id:'dtr6.1', nome:'Conceito, classificação e características' },
    ]},
    { id:'dtr7', nome:'Alteração do Contrato de Trabalho', subtopicos:[
      { id:'dtr7.1', nome:'Alteração unilateral e bilateral' },
      { id:'dtr7.2', nome:'O jus variandi' },
    ]},
    { id:'dtr8', nome:'Suspensão e Interrupção do Contrato', subtopicos:[
      { id:'dtr8.1', nome:'Caracterização e distinção' },
    ]},
    { id:'dtr9', nome:'Rescisão do Contrato de Trabalho', subtopicos:[
      { id:'dtr9.1', nome:'Justa causa' },
      { id:'dtr9.2', nome:'Rescisão indireta' },
      { id:'dtr9.3', nome:'Dispensa arbitrária' },
      { id:'dtr9.4', nome:'Culpa recíproca' },
      { id:'dtr9.5', nome:'Indenização' },
    ]},
    { id:'dtr10', nome:'Aviso Prévio', subtopicos:[
      { id:'dtr10.1', nome:'Aviso prévio' },
    ]},
    { id:'dtr11', nome:'Estabilidade e Garantias Provisórias', subtopicos:[
      { id:'dtr11.1', nome:'Formas de estabilidade' },
      { id:'dtr11.2', nome:'Despedida e reintegração de empregado estável' },
    ]},
    { id:'dtr12', nome:'Duração do Trabalho', subtopicos:[
      { id:'dtr12.1', nome:'Jornada de trabalho' },
      { id:'dtr12.2', nome:'Períodos de descanso' },
      { id:'dtr12.3', nome:'Intervalo para repouso e alimentação' },
      { id:'dtr12.4', nome:'Descanso semanal remunerado' },
      { id:'dtr12.5', nome:'Trabalho noturno e extraordinário' },
      { id:'dtr12.6', nome:'Sistema de compensação de horas' },
    ]},
    { id:'dtr13', nome:'Férias', subtopicos:[
      { id:'dtr13.1', nome:'Direito a férias e sua duração' },
      { id:'dtr13.2', nome:'Concessão e época das férias' },
      { id:'dtr13.3', nome:'Remuneração e abono de férias' },
    ]},
    { id:'dtr14', nome:'Salário e Remuneração', subtopicos:[
      { id:'dtr14.1', nome:'Conceito e distinções' },
      { id:'dtr14.2', nome:'Composição do salário' },
      { id:'dtr14.3', nome:'Modalidades de salário' },
      { id:'dtr14.4', nome:'Formas e meios de pagamento' },
      { id:'dtr14.5', nome:'13º salário' },
    ]},
    { id:'dtr15', nome:'Salário-Mínimo', subtopicos:[
      { id:'dtr15.1', nome:'Irredutibilidade e garantia' },
    ]},
    { id:'dtr16', nome:'Equiparação Salarial', subtopicos:[
      { id:'dtr16.1', nome:'Princípio da igualdade de salário' },
      { id:'dtr16.2', nome:'Desvio de função' },
    ]},
    { id:'dtr17', nome:'FGTS', subtopicos:[
      { id:'dtr17.1', nome:'FGTS' },
    ]},
    { id:'dtr18', nome:'Prescrição e Decadência', subtopicos:[
      { id:'dtr18.1', nome:'Prescrição e decadência' },
    ]},
    { id:'dtr19', nome:'Segurança e Medicina no Trabalho', subtopicos:[
      { id:'dtr19.1', nome:'CIPA' },
      { id:'dtr19.2', nome:'Atividades insalubres ou perigosas' },
    ]},
    { id:'dtr20', nome:'Proteção ao Trabalho do Menor', subtopicos:[
      { id:'dtr20.1', nome:'Proteção ao trabalho do menor' },
    ]},
    { id:'dtr21', nome:'Proteção ao Trabalho da Mulher', subtopicos:[
      { id:'dtr21.1', nome:'Estabilidade da gestante' },
      { id:'dtr21.2', nome:'Licença maternidade' },
    ]},
    { id:'dtr22', nome:'Direito Coletivo do Trabalho', subtopicos:[
      { id:'dtr22.1', nome:'Convenção nº 87 da OIT (liberdade sindical)' },
      { id:'dtr22.2', nome:'Organização sindical' },
      { id:'dtr22.3', nome:'Conceito de categoria' },
      { id:'dtr22.4', nome:'Categoria diferenciada' },
      { id:'dtr22.5', nome:'Convenções e acordos coletivos de trabalho' },
    ]},
    { id:'dtr23', nome:'Direito de Greve e Serviços Essenciais', subtopicos:[
      { id:'dtr23.1', nome:'Direito de greve e serviços essenciais' },
    ]},
    { id:'dtr24', nome:'Comissões de Conciliação Prévia', subtopicos:[
      { id:'dtr24.1', nome:'Comissões de conciliação prévia' },
    ]},
    { id:'dtr25', nome:'Renúncia e Transação', subtopicos:[
      { id:'dtr25.1', nome:'Renúncia e transação' },
    ]},
  ]},

  /* ═══ 9. DIREITO PROCESSUAL DO TRABALHO ═══ */
  { id:'ptr', nome:'Direito Processual do Trabalho', cor:'#3730a3', topicos:[
    { id:'ptr1', nome:'Procedimentos nos Dissídios Individuais', subtopicos:[
      { id:'ptr1.1', nome:'Reclamação' },
      { id:'ptr1.2', nome:'Jus postulandi' },
      { id:'ptr1.3', nome:'Revelia' },
      { id:'ptr1.4', nome:'Exceções' },
      { id:'ptr1.5', nome:'Contestação' },
      { id:'ptr1.6', nome:'Reconvenção' },
      { id:'ptr1.7', nome:'Partes e procuradores' },
      { id:'ptr1.8', nome:'Audiência' },
      { id:'ptr1.9', nome:'Conciliação' },
      { id:'ptr1.10', nome:'Instrução e julgamento' },
      { id:'ptr1.11', nome:'Justiça gratuita' },
    ]},
    { id:'ptr2', nome:'Provas no Processo do Trabalho', subtopicos:[
      { id:'ptr2.1', nome:'Interrogatórios' },
      { id:'ptr2.2', nome:'Confissão e consequências' },
      { id:'ptr2.3', nome:'Documentos' },
      { id:'ptr2.4', nome:'Oportunidade de juntada' },
      { id:'ptr2.5', nome:'Prova técnica' },
      { id:'ptr2.6', nome:'Sistemática da realização das perícias' },
      { id:'ptr2.7', nome:'Testemunhas' },
    ]},
    { id:'ptr3', nome:'Recursos no Processo do Trabalho', subtopicos:[
      { id:'ptr3.1', nome:'Disposições gerais' },
    ]},
    { id:'ptr4', nome:'Processos de Execução', subtopicos:[
      { id:'ptr4.1', nome:'Liquidação' },
      { id:'ptr4.2', nome:'Modalidades da execução' },
      { id:'ptr4.3', nome:'Embargos do executado e impugnação do exequente' },
    ]},
    { id:'ptr5', nome:'Prescrição e Decadência', subtopicos:[
      { id:'ptr5.1', nome:'Prescrição e decadência no processo do trabalho' },
    ]},
    { id:'ptr6', nome:'Competência da Justiça do Trabalho', subtopicos:[
      { id:'ptr6.1', nome:'Competência da justiça do trabalho' },
    ]},
    { id:'ptr7', nome:'Rito Sumaríssimo', subtopicos:[
      { id:'ptr7.1', nome:'Rito sumaríssimo no dissídio individual' },
    ]},
    { id:'ptr8', nome:'Comissão Prévia de Conciliação', subtopicos:[
      { id:'ptr8.1', nome:'Comissão prévia de conciliação nos dissídios individuais' },
    ]},
    { id:'ptr9', nome:'Ação Rescisória', subtopicos:[
      { id:'ptr9.1', nome:'Ação rescisória no processo do trabalho' },
    ]},
    { id:'ptr10', nome:'Mandado de Segurança', subtopicos:[
      { id:'ptr10.1', nome:'Cabimento no processo do trabalho' },
    ]},
    { id:'ptr11', nome:'Dissídios Coletivos', subtopicos:[
      { id:'ptr11.1', nome:'Dissídios coletivos' },
    ]},
    { id:'ptr12', nome:'Jurisprudência do TST', subtopicos:[
      { id:'ptr12.1', nome:'Súmulas e orientações jurisprudenciais' },
    ]},
  ]},

  /* ═══ 10. DIREITO CIVIL ═══ */
  { id:'civ', nome:'Direito Civil', cor:'#dc2626', topicos:[
    { id:'civ1', nome:'LINDB', subtopicos:[
      { id:'civ1.1', nome:'Vigência, aplicação, obrigatoriedade, interpretação e integração das leis' },
      { id:'civ1.2', nome:'Conflito das leis no tempo' },
      { id:'civ1.3', nome:'Eficácia das leis no espaço' },
    ]},
    { id:'civ2', nome:'Pessoas Naturais', subtopicos:[
      { id:'civ2.1', nome:'Conceito' },
      { id:'civ2.2', nome:'Início da personalidade' },
      { id:'civ2.3', nome:'Personalidade' },
      { id:'civ2.4', nome:'Capacidade' },
      { id:'civ2.5', nome:'Direitos da personalidade' },
      { id:'civ2.6', nome:'Nome civil' },
      { id:'civ2.7', nome:'Estado civil' },
      { id:'civ2.8', nome:'Domicílio' },
      { id:'civ2.9', nome:'Ausência' },
    ]},
    { id:'civ3', nome:'Pessoas Jurídicas', subtopicos:[
      { id:'civ3.1', nome:'Disposições gerais' },
      { id:'civ3.2', nome:'Conceito e elementos caracterizadores' },
      { id:'civ3.3', nome:'Constituição' },
      { id:'civ3.4', nome:'Extinção' },
      { id:'civ3.5', nome:'Capacidade e direitos da personalidade' },
      { id:'civ3.6', nome:'Domicílio' },
      { id:'civ3.7', nome:'Sociedades de fato' },
      { id:'civ3.8', nome:'Associações' },
      { id:'civ3.9', nome:'Sociedades' },
      { id:'civ3.10', nome:'Fundações' },
      { id:'civ3.11', nome:'Grupos despersonalizados' },
      { id:'civ3.12', nome:'Desconsideração da personalidade jurídica' },
      { id:'civ3.13', nome:'Responsabilidade da pessoa jurídica e dos sócios' },
    ]},
    { id:'civ4', nome:'Bens', subtopicos:[
      { id:'civ4.1', nome:'Diferentes classes' },
      { id:'civ4.2', nome:'Bens corpóreos e incorpóreos' },
      { id:'civ4.3', nome:'Bens no comércio e fora do comércio' },
    ]},
    { id:'civ5', nome:'Fato Jurídico', subtopicos:[
      { id:'civ5.1', nome:'Fato jurídico' },
    ]},
    { id:'civ6', nome:'Negócio Jurídico', subtopicos:[
      { id:'civ6.1', nome:'Disposições gerais' },
      { id:'civ6.2', nome:'Classificação e interpretação' },
      { id:'civ6.3', nome:'Elementos' },
      { id:'civ6.4', nome:'Representação' },
      { id:'civ6.5', nome:'Condição, termo e encargo' },
      { id:'civ6.6', nome:'Defeitos do negócio jurídico' },
      { id:'civ6.7', nome:'Existência, eficácia, validade, invalidade e nulidade' },
      { id:'civ6.8', nome:'Simulação' },
    ]},
    { id:'civ7', nome:'Atos Jurídicos Lícitos e Ilícitos', subtopicos:[
      { id:'civ7.1', nome:'Atos jurídicos lícitos e ilícitos' },
    ]},
    { id:'civ8', nome:'Prescrição e Decadência', subtopicos:[
      { id:'civ8.1', nome:'Prescrição e decadência' },
    ]},
    { id:'civ9', nome:'Prova do Fato Jurídico', subtopicos:[
      { id:'civ9.1', nome:'Prova do fato jurídico' },
    ]},
    { id:'civ10', nome:'Obrigações', subtopicos:[
      { id:'civ10.1', nome:'Características' },
      { id:'civ10.2', nome:'Elementos' },
      { id:'civ10.3', nome:'Princípios' },
      { id:'civ10.4', nome:'Boa-fé' },
      { id:'civ10.5', nome:'Obrigação complexa (a obrigação como processo)' },
      { id:'civ10.6', nome:'Obrigações de dar' },
      { id:'civ10.7', nome:'Obrigações de fazer e de não fazer' },
      { id:'civ10.8', nome:'Obrigações alternativas e facultativas' },
      { id:'civ10.9', nome:'Obrigações divisíveis e indivisíveis' },
      { id:'civ10.10', nome:'Obrigações solidárias' },
      { id:'civ10.11', nome:'Obrigações civis e naturais, de meio, de resultado e de garantia' },
      { id:'civ10.12', nome:'Obrigações de execução instantânea, diferida e continuada' },
      { id:'civ10.13', nome:'Obrigações puras e simples, condicionais, a termo e modais' },
      { id:'civ10.14', nome:'Obrigações líquidas e ilíquidas' },
      { id:'civ10.15', nome:'Obrigações principais e acessórias' },
      { id:'civ10.16', nome:'Transmissão das obrigações' },
      { id:'civ10.17', nome:'Adimplemento e extinção das obrigações' },
      { id:'civ10.18', nome:'Inadimplemento das obrigações' },
    ]},
    { id:'civ11', nome:'Contratos', subtopicos:[
      { id:'civ11.1', nome:'Princípios' },
      { id:'civ11.2', nome:'Classificação' },
      { id:'civ11.3', nome:'Contratos em geral' },
      { id:'civ11.4', nome:'Disposições gerais' },
      { id:'civ11.5', nome:'Interpretação' },
      { id:'civ11.6', nome:'Extinção' },
      { id:'civ11.7', nome:'Espécies de contratos regulados no Código Civil' },
    ]},
    { id:'civ12', nome:'Atos Unilaterais', subtopicos:[
      { id:'civ12.1', nome:'Atos unilaterais' },
    ]},
    { id:'civ13', nome:'Responsabilidade Civil', subtopicos:[
      { id:'civ13.1', nome:'Responsabilidade civil' },
    ]},
    { id:'civ14', nome:'Preferências e Privilégios Creditórios', subtopicos:[
      { id:'civ14.1', nome:'Preferências e privilégios creditórios' },
    ]},
    { id:'civ15', nome:'Posse', subtopicos:[
      { id:'civ15.1', nome:'Posse' },
    ]},
    { id:'civ16', nome:'Direitos Reais', subtopicos:[
      { id:'civ16.1', nome:'Disposições gerais' },
      { id:'civ16.2', nome:'Propriedade' },
      { id:'civ16.3', nome:'Superfície' },
      { id:'civ16.4', nome:'Servidões' },
      { id:'civ16.5', nome:'Usufruto' },
      { id:'civ16.6', nome:'Uso' },
      { id:'civ16.7', nome:'Habitação' },
      { id:'civ16.8', nome:'Direito do promitente comprador' },
    ]},
    { id:'civ17', nome:'Direitos Reais de Garantia', subtopicos:[
      { id:'civ17.1', nome:'Características' },
      { id:'civ17.2', nome:'Princípios' },
      { id:'civ17.3', nome:'Penhor, hipoteca e anticrese' },
    ]},
    { id:'civ18', nome:'Direito das Sucessões', subtopicos:[
      { id:'civ18.1', nome:'Sucessão em geral' },
      { id:'civ18.2', nome:'Sucessão legítima' },
      { id:'civ18.3', nome:'Sucessão testamentária' },
      { id:'civ18.4', nome:'Inventário e partilha' },
    ]},
    { id:'civ19', nome:'Relações de Consumo (CDC)', subtopicos:[
      { id:'civ19.1', nome:'Lei nº 8.078/1990 e alterações' },
      { id:'civ19.2', nome:'Consumidor' },
      { id:'civ19.3', nome:'Direitos do consumidor' },
      { id:'civ19.4', nome:'Fornecedor, produto e serviço' },
      { id:'civ19.5', nome:'Qualidade de produtos e serviços, prevenção e reparação de danos' },
      { id:'civ19.6', nome:'Práticas comerciais' },
      { id:'civ19.7', nome:'Proteção contratual' },
    ]},
    { id:'civ20', nome:'Parcelamento do Solo Urbano', subtopicos:[
      { id:'civ20.1', nome:'Lei nº 6.766/1979 e alterações' },
    ]},
    { id:'civ21', nome:'Registros Públicos', subtopicos:[
      { id:'civ21.1', nome:'Lei nº 6.015/1973 — noções gerais e princípios' },
      { id:'civ21.2', nome:'Procedimento de dúvida' },
    ]},
    { id:'civ22', nome:'Estatuto do Idoso', subtopicos:[
      { id:'civ22.1', nome:'Lei nº 10.741/2003 e alterações' },
    ]},
    { id:'civ23', nome:'Locação de Imóveis Urbanos', subtopicos:[
      { id:'civ23.1', nome:'Lei nº 8.245/1991 e alterações' },
    ]},
    { id:'civ24', nome:'Direitos Autorais', subtopicos:[
      { id:'civ24.1', nome:'Direitos autorais' },
    ]},
    { id:'civ25', nome:'Estatuto da Criança e do Adolescente', subtopicos:[
      { id:'civ25.1', nome:'Lei nº 8.069/1990 — disposições, direitos fundamentais, prevenção' },
    ]},
  ]},

  /* ═══ 11. DIREITO EMPRESARIAL ═══ */
  { id:'de', nome:'Direito Empresarial', cor:'#0e7490', topicos:[
    { id:'de1', nome:'Fundamentos do Direito Empresarial', subtopicos:[
      { id:'de1.1', nome:'Origem, evolução, autonomia, fontes e características' },
      { id:'de1.2', nome:'Teoria da empresa' },
      { id:'de1.3', nome:'Empresário: conceito, inscrição, capacidade; empresário individual; pequeno empresário' },
      { id:'de1.4', nome:'Lei Complementar nº 123/2006 (ME e EPP)' },
      { id:'de1.5', nome:'Prepostos do empresário' },
      { id:'de1.6', nome:'Nome empresarial, estabelecimento empresarial, escrituração' },
    ]},
    { id:'de2', nome:'Registro de Empresa', subtopicos:[
      { id:'de2.1', nome:'Órgãos de registro de empresa' },
      { id:'de2.2', nome:'Atos de registro de empresa' },
      { id:'de2.3', nome:'Processo decisório do registro de empresa' },
      { id:'de2.4', nome:'Inatividade da empresa' },
      { id:'de2.5', nome:'Empresário irregular' },
      { id:'de2.6', nome:'Lei nº 8.934/1994' },
    ]},
    { id:'de3', nome:'Títulos de Crédito', subtopicos:[
      { id:'de3.1', nome:'Histórico da legislação cambiária' },
      { id:'de3.2', nome:'Conceito, características e princípios' },
      { id:'de3.3', nome:'Classificação: letra de câmbio, nota promissória, cheque, duplicata, endosso e aval' },
      { id:'de3.4', nome:'Títulos comercial, industrial, à exportação, rural, imobiliário, bancário' },
      { id:'de3.5', nome:'Letra de arrendamento mercantil' },
    ]},
    { id:'de4', nome:'Ação Cambial', subtopicos:[
      { id:'de4.1', nome:'Ação de regresso' },
      { id:'de4.2', nome:'Inoponibilidade de exceções' },
      { id:'de4.3', nome:'Responsabilidade patrimonial e fraude à execução' },
      { id:'de4.4', nome:'Embargos do devedor' },
      { id:'de4.5', nome:'Ação de anulação e substituição de título' },
    ]},
    { id:'de5', nome:'Protesto de Títulos', subtopicos:[
      { id:'de5.1', nome:'Legislação, modalidades, procedimentos, efeitos e ações judiciais' },
    ]},
    { id:'de6', nome:'Direito Societário', subtopicos:[
      { id:'de6.1', nome:'Sociedade empresária: conceito, terminologia e ato constitutivo' },
      { id:'de6.2', nome:'Sociedades simples e empresárias' },
      { id:'de6.3', nome:'Personalização da sociedade empresária' },
      { id:'de6.4', nome:'Classificação das sociedades empresárias' },
      { id:'de6.5', nome:'Sociedade irregular' },
      { id:'de6.6', nome:'Desconsideração da personalidade jurídica e desconsideração inversa' },
      { id:'de6.7', nome:'Regime jurídico dos sócios' },
      { id:'de6.8', nome:'Sociedade limitada' },
      { id:'de6.9', nome:'Sociedade anônima e Lei nº 6.404/1976' },
      { id:'de6.10', nome:'Sociedade em nome coletivo, em comandita simples e por ações' },
      { id:'de6.11', nome:'Operações societárias: transformação, incorporação, fusão e cisão' },
      { id:'de6.12', nome:'Coligações, grupos, consórcios e SPE' },
      { id:'de6.13', nome:'Dissolução, liquidação e extinção das sociedades' },
      { id:'de6.14', nome:'Concentração empresarial e defesa da livre concorrência' },
    ]},
    { id:'de7', nome:'Contratos Mercantis', subtopicos:[
      { id:'de7.1', nome:'Compra e venda mercantil' },
      { id:'de7.2', nome:'Comissão mercantil' },
      { id:'de7.3', nome:'Representação comercial' },
      { id:'de7.4', nome:'Concessão mercantil' },
      { id:'de7.5', nome:'Franquia (franchising)' },
      { id:'de7.6', nome:'Contratos bancários próprios e impróprios' },
      { id:'de7.7', nome:'Contrato de seguro' },
      { id:'de7.8', nome:'Contratos intelectuais e de software' },
    ]},
    { id:'de8', nome:'Direito Falimentar', subtopicos:[
      { id:'de8.1', nome:'Lei nº 11.101/2005' },
      { id:'de8.2', nome:'Teoria geral do direito falimentar' },
      { id:'de8.3', nome:'Processo falimentar' },
      { id:'de8.4', nome:'Pessoa e bens do falido' },
      { id:'de8.5', nome:'Regime jurídico dos atos e contratos do falido' },
      { id:'de8.6', nome:'Regime jurídico dos credores do falido' },
      { id:'de8.7', nome:'Recuperação judicial' },
      { id:'de8.8', nome:'Recuperação extrajudicial' },
      { id:'de8.9', nome:'Liquidação extrajudicial de instituições financeiras' },
    ]},
  ]},

  /* ═══ 12. DIREITO URBANÍSTICO ═══ */
  { id:'dur', nome:'Direito Urbanístico', cor:'#0d9488', topicos:[
    { id:'dur1', nome:'Constituição Federal (Urbanístico)', subtopicos:[
      { id:'dur1.1', nome:'Ordenamento territorial' },
      { id:'dur1.2', nome:'Competências urbanísticas' },
      { id:'dur1.3', nome:'Normas gerais' },
      { id:'dur1.4', nome:'Município' },
      { id:'dur1.5', nome:'Política urbana, plano diretor e função social da propriedade urbana' },
      { id:'dur1.6', nome:'Regiões metropolitanas e aglomerados urbanos' },
    ]},
    { id:'dur2', nome:'Direito Urbanístico e Direito à Cidade', subtopicos:[
      { id:'dur2.1', nome:'Autonomia científica' },
      { id:'dur2.2', nome:'Princípios' },
      { id:'dur2.3', nome:'Direito de construir e direito de propriedade' },
      { id:'dur2.4', nome:'Justa distribuição dos benefícios e ônus da urbanização' },
      { id:'dur2.5', nome:'Poder de polícia urbanístico' },
      { id:'dur2.6', nome:'Ordenação e uso e ocupação do solo urbano' },
      { id:'dur2.7', nome:'Licenças urbanísticas' },
      { id:'dur2.8', nome:'Responsabilidade administrativa, infrações e sanções' },
      { id:'dur2.9', nome:'Responsabilidade civil e penal' },
    ]},
    { id:'dur3', nome:'Direito à Moradia', subtopicos:[
      { id:'dur3.1', nome:'Regularização fundiária de interesse social (Lei 11.977/2009; Lei 12.424/2011; MP 2.220/2001)' },
      { id:'dur3.2', nome:'Direito registral imobiliário' },
    ]},
    { id:'dur4', nome:'Parcelamento do Solo Urbano', subtopicos:[
      { id:'dur4.1', nome:'Lei nº 6.766/1979' },
      { id:'dur4.2', nome:'Regularização fundiária urbanística' },
      { id:'dur4.3', nome:'Área de Preservação Permanente urbana' },
    ]},
    { id:'dur5', nome:'Estatuto da Cidade', subtopicos:[
      { id:'dur5.1', nome:'Norma geral' },
      { id:'dur5.2', nome:'Objetivos' },
      { id:'dur5.3', nome:'Diretrizes' },
      { id:'dur5.4', nome:'Instrumentos' },
      { id:'dur5.5', nome:'Gestão democrática das cidades' },
      { id:'dur5.6', nome:'Normas gerais para elaboração do Plano Diretor' },
      { id:'dur5.7', nome:'Disposições gerais' },
    ]},
    { id:'dur6', nome:'Concessão Urbanística', subtopicos:[
      { id:'dur6.1', nome:'Conceito' },
      { id:'dur6.2', nome:'Natureza jurídica' },
      { id:'dur6.3', nome:'Disciplina' },
    ]},
    { id:'dur7', nome:'Desapropriação', subtopicos:[
      { id:'dur7.1', nome:'Conceito' },
      { id:'dur7.2', nome:'Aplicações' },
      { id:'dur7.3', nome:'Justa indenização' },
      { id:'dur7.4', nome:'Recuperação das mais-valias urbanísticas' },
      { id:'dur7.5', nome:'Processo e procedimento judicial e administrativo' },
    ]},
    { id:'dur8', nome:'Proteção do Patrimônio Cultural', subtopicos:[
      { id:'dur8.1', nome:'Instrumentos de tutela de bens culturais materiais e imateriais' },
      { id:'dur8.2', nome:'Competências' },
      { id:'dur8.3', nome:'Tombamento' },
      { id:'dur8.4', nome:'Registro' },
      { id:'dur8.5', nome:'Desenvolvimento urbano e proteção do patrimônio cultural' },
      { id:'dur8.6', nome:'Função social da propriedade pública' },
    ]},
    { id:'dur9', nome:'Tutela da Ordem Jurídico-Urbanística', subtopicos:[
      { id:'dur9.1', nome:'Ação civil pública' },
      { id:'dur9.2', nome:'Ação popular' },
      { id:'dur9.3', nome:'Ações reais' },
      { id:'dur9.4', nome:'Ações possessórias' },
      { id:'dur9.5', nome:'Mecanismos extrajudiciais de conflito' },
      { id:'dur9.6', nome:'Termo de Compromisso' },
      { id:'dur9.7', nome:'Termo de Ajustamento de Conduta' },
      { id:'dur9.8', nome:'Audiências públicas' },
    ]},
  ]},

  /* ═══ 13. DIREITO AMBIENTAL ═══ */
  { id:'dma', nome:'Direito Ambiental', cor:'#16a34a', topicos:[
    { id:'dma1', nome:'Direito Ambiental Constitucional', subtopicos:[
      { id:'dma1.1', nome:'Meio ambiente como direito fundamental' },
      { id:'dma1.2', nome:'Princípios estruturantes do estado de direito ambiental' },
      { id:'dma1.3', nome:'Competências ambientais legislativa e material' },
      { id:'dma1.4', nome:'Deveres ambientais' },
      { id:'dma1.5', nome:'Instrumentos jurisdicionais' },
      { id:'dma1.6', nome:'Função ambiental pública e privada' },
      { id:'dma1.7', nome:'Função social da propriedade' },
      { id:'dma1.8', nome:'Art. 225 da CF/1988' },
    ]},
    { id:'dma2', nome:'Conceito de Meio Ambiente', subtopicos:[
      { id:'dma2.1', nome:'Meio ambiente natural, artificial, cultural e do trabalho' },
      { id:'dma2.2', nome:'Recursos naturais e meio ambiente como bens ambientais' },
      { id:'dma2.3', nome:'Biodiversidade e desenvolvimento sustentável' },
      { id:'dma2.4', nome:'Significado de direitos culturais' },
    ]},
    { id:'dma3', nome:'Princípios de Direito Ambiental', subtopicos:[
      { id:'dma3.1', nome:'Prevenção, precaução, poluidor-pagador e usuário-pagador' },
      { id:'dma3.2', nome:'Cooperação, informação, participação e equidade intergeracional' },
      { id:'dma3.3', nome:'Princípios da tutela do patrimônio cultural' },
    ]},
    { id:'dma4', nome:'Política Nacional de Meio Ambiente', subtopicos:[
      { id:'dma4.1', nome:'Objetivos' },
      { id:'dma4.2', nome:'Instrumentos de proteção (técnicos e econômicos)' },
      { id:'dma4.3', nome:'SISNAMA: estrutura e funcionamento' },
      { id:'dma4.4', nome:'Lei nº 6.938/1981 e alterações' },
      { id:'dma4.5', nome:'Decreto nº 99.274/1990' },
      { id:'dma4.6', nome:'Resolução CONAMA nº 1 (EIA-RIMA)' },
      { id:'dma4.7', nome:'Resolução CONAMA nº 237 (Licenciamento Ambiental)' },
      { id:'dma4.8', nome:'Resolução CONAMA nº 378' },
    ]},
    { id:'dma5', nome:'Recursos Hídricos', subtopicos:[
      { id:'dma5.1', nome:'Lei nº 9.433/1997 e alterações' },
      { id:'dma5.2', nome:'Resolução CNRH nº 16/2001' },
      { id:'dma5.3', nome:'SINGREH' },
    ]},
    { id:'dma6', nome:'Recursos Florestais', subtopicos:[
      { id:'dma6.1', nome:'Lei nº 12.651/2012 e alterações' },
      { id:'dma6.2', nome:'Resoluções CONAMA nº 302/2002 e 303/2002' },
      { id:'dma6.3', nome:'Lei nº 11.284/2006 (gestão de florestas públicas)' },
    ]},
    { id:'dma7', nome:'Espaços Territoriais Especialmente Protegidos', subtopicos:[
      { id:'dma7.1', nome:'Áreas de preservação permanente e reserva legal' },
      { id:'dma7.2', nome:'Lei nº 9.985/2000 (SNUC)' },
    ]},
    { id:'dma8', nome:'Política Urbana (Ambiental)', subtopicos:[
      { id:'dma8.1', nome:'Diretrizes, instrumentos e competência' },
      { id:'dma8.2', nome:'Arts. 182 e 183 da CF/1988' },
      { id:'dma8.3', nome:'Lei nº 10.257/2001 e alterações' },
    ]},
    { id:'dma9', nome:'Responsabilidades', subtopicos:[
      { id:'dma9.1', nome:'Efeito, impacto e dano ambiental' },
      { id:'dma9.2', nome:'Poluição' },
      { id:'dma9.3', nome:'Responsabilidade administrativa, civil e penal' },
      { id:'dma9.4', nome:'Tutela processual: STF, STJ e TJs' },
      { id:'dma9.5', nome:'Papel do Ministério Público na defesa do meio ambiente' },
      { id:'dma9.6', nome:'Crimes ambientais: espécies e sanções' },
      { id:'dma9.7', nome:'Lei nº 9.605/1998 e alterações' },
      { id:'dma9.8', nome:'Decreto nº 6.514/2008' },
    ]},
  ]},

]

export const PGM_BH_TOTAL_DISCIPLINAS = PGM_BH_DISCIPLINAS.length
export const PGM_BH_TOTAL_TOPICOS     = PGM_BH_DISCIPLINAS.reduce((a,d) => a + d.topicos.length, 0)
export const PGM_BH_TOTAL_SUBTOPICOS  = PGM_BH_DISCIPLINAS.reduce(
  (a,d) => a + d.topicos.reduce((b,t) => b + t.subtopicos.length, 0), 0
)
