export interface Subtopico { id: string; nome: string }
export interface Topico { id: string; nome: string; subtopicos: Subtopico[] }
export interface Disciplina { id: string; nome: string; cor: string; topicos: Topico[] }

/* Edital nº 5/2019 — Procurador do Município de Curitiba (UFPR / Núcleo de Concursos) */
export const PGM_CWB_DISCIPLINAS: Disciplina[] = [

  /* ═══ 1. DIREITO CONSTITUCIONAL ═══ */
  { id:'dc', nome:'Direito Constitucional', cor:'#4f46e5', topicos:[
    { id:'dc1', nome:'Constituição', subtopicos:[
      { id:'dc1.1', nome:'Conceito e classificação' },
      { id:'dc1.2', nome:'Normas constitucionais — aplicabilidade e eficácia' },
      { id:'dc1.3', nome:'Disposições Constitucionais Transitórias' },
      { id:'dc1.4', nome:'Supremacia da Constituição' },
      { id:'dc1.5', nome:'Constitucionalização, desconstitucionalização, recepção e repristinação' },
      { id:'dc1.6', nome:'Hermenêutica e interpretação constitucional' },
      { id:'dc1.7', nome:'Teoria da Constituição' },
      { id:'dc1.8', nome:'Constitucionalismo e neoconstitucionalismo' },
    ]},
    { id:'dc2', nome:'Poder Constituinte', subtopicos:[
      { id:'dc2.1', nome:'Poder constituinte originário e derivado' },
      { id:'dc2.2', nome:'Reforma e revisão constitucional' },
      { id:'dc2.3', nome:'Poder constituinte decorrente' },
    ]},
    { id:'dc3', nome:'Controle de Constitucionalidade', subtopicos:[
      { id:'dc3.1', nome:'Sistema brasileiro — evolução' },
      { id:'dc3.2', nome:'Normas constitucionais/inconstitucionais' },
      { id:'dc3.3', nome:'Ação direta de inconstitucionalidade' },
      { id:'dc3.4', nome:'Ação declaratória de constitucionalidade' },
      { id:'dc3.5', nome:'ADI por omissão' },
      { id:'dc3.6', nome:'Arguição de descumprimento de preceito fundamental' },
    ]},
    { id:'dc4', nome:'Súmulas Vinculantes', subtopicos:[
      { id:'dc4.1', nome:'Súmulas vinculantes' },
      { id:'dc4.2', nome:'Técnicas de decisão no controle de constitucionalidade' },
    ]},
    { id:'dc5', nome:'Direitos e Garantias Fundamentais', subtopicos:[
      { id:'dc5.1', nome:'Direitos individuais e coletivos' },
      { id:'dc5.2', nome:'Princípio da legalidade' },
      { id:'dc5.3', nome:'Princípio da isonomia' },
      { id:'dc5.4', nome:'Regime constitucional da propriedade e desapropriação' },
      { id:'dc5.5', nome:'Habeas corpus' },
      { id:'dc5.6', nome:'Mandado de segurança' },
      { id:'dc5.7', nome:'Mandado de injunção' },
      { id:'dc5.8', nome:'Habeas data' },
      { id:'dc5.9', nome:'Ação popular' },
      { id:'dc5.10', nome:'Ação civil pública' },
      { id:'dc5.11', nome:'Direitos sociais e sua efetivação' },
      { id:'dc5.12', nome:'Reserva do possível' },
    ]},
    { id:'dc6', nome:'Estado Federal', subtopicos:[
      { id:'dc6.1', nome:'Conceito e federação brasileira' },
      { id:'dc6.2', nome:'Características' },
      { id:'dc6.3', nome:'Integrantes da federação: bens e repartição de competência' },
    ]},
    { id:'dc7', nome:'Estado-Membro', subtopicos:[
      { id:'dc7.1', nome:'Autonomia e competências' },
      { id:'dc7.2', nome:'Criação, reformulação e extinção' },
      { id:'dc7.3', nome:'Poder constituinte estadual' },
    ]},
    { id:'dc8', nome:'Município', subtopicos:[
      { id:'dc8.1', nome:'Autonomia e competências' },
      { id:'dc8.2', nome:'Criação, reformulação e extinção' },
      { id:'dc8.3', nome:'Lei Orgânica do Município de Curitiba' },
    ]},
    { id:'dc9', nome:'Intervenção', subtopicos:[
      { id:'dc9.1', nome:'Intervenção federal' },
      { id:'dc9.2', nome:'Intervenção estadual' },
    ]},
    { id:'dc10', nome:'Organização dos Poderes', subtopicos:[
      { id:'dc10.1', nome:'Mecanismo de freios e contrapesos' },
    ]},
    { id:'dc11', nome:'Poder Legislativo', subtopicos:[
      { id:'dc11.1', nome:'Organização e atribuições' },
      { id:'dc11.2', nome:'Processo legislativo e iniciativa' },
      { id:'dc11.3', nome:'Comissões parlamentares' },
      { id:'dc11.4', nome:'Imunidades e incompatibilidades parlamentares' },
      { id:'dc11.5', nome:'Orçamento e fiscalização orçamentária e financeira' },
      { id:'dc11.6', nome:'Tribunal de Contas' },
    ]},
    { id:'dc12', nome:'Poder Executivo', subtopicos:[
      { id:'dc12.1', nome:'Organização e atribuições' },
      { id:'dc12.2', nome:'Poder regulamentar' },
      { id:'dc12.3', nome:'Medidas provisórias' },
      { id:'dc12.4', nome:'Crimes de responsabilidade' },
    ]},
    { id:'dc13', nome:'Poder Judiciário', subtopicos:[
      { id:'dc13.1', nome:'Organização' },
      { id:'dc13.2', nome:'Justiça federal e estadual e justiça especial' },
      { id:'dc13.3', nome:'Competência' },
      { id:'dc13.4', nome:'Conselho Nacional de Justiça' },
    ]},
    { id:'dc14', nome:'Funções Essenciais à Justiça', subtopicos:[
      { id:'dc14.1', nome:'Ministério Público' },
      { id:'dc14.2', nome:'Advocacia' },
      { id:'dc14.3', nome:'Advocacia-Geral da União' },
      { id:'dc14.4', nome:'Procuradoria-Geral do Município de Curitiba e atribuições' },
    ]},
    { id:'dc15', nome:'Administração Pública (Constitucional)', subtopicos:[
      { id:'dc15.1', nome:'Princípios constitucionais' },
    ]},
    { id:'dc16', nome:'Servidores Públicos Civis', subtopicos:[
      { id:'dc16.1', nome:'Princípios constitucionais' },
      { id:'dc16.2', nome:'Teto remuneratório constitucional' },
    ]},
    { id:'dc17', nome:'Nacionalidade e Direitos Políticos', subtopicos:[
      { id:'dc17.1', nome:'Nacionalidade' },
      { id:'dc17.2', nome:'Partidos políticos' },
      { id:'dc17.3', nome:'Sistema eleitoral' },
      { id:'dc17.4', nome:'Justiça eleitoral' },
      { id:'dc17.5', nome:'Suspensão e perda dos direitos políticos' },
    ]},
    { id:'dc18', nome:'Tributação e Orçamento', subtopicos:[
      { id:'dc18.1', nome:'Sistema tributário nacional e princípios gerais' },
      { id:'dc18.2', nome:'Limitações do poder de tributar' },
      { id:'dc18.3', nome:'Impostos da União, dos Estados/DF e dos municípios' },
      { id:'dc18.4', nome:'Repartição das receitas tributárias' },
      { id:'dc18.5', nome:'Finanças públicas e orçamentos' },
    ]},
    { id:'dc19', nome:'Ordem Econômica e Financeira', subtopicos:[
      { id:'dc19.1', nome:'Princípios gerais da atividade econômica' },
      { id:'dc19.2', nome:'Política urbana' },
      { id:'dc19.3', nome:'Política agrícola e fundiária e reforma agrária' },
      { id:'dc19.4', nome:'Sistema financeiro nacional' },
    ]},
    { id:'dc20', nome:'Ordem Social', subtopicos:[
      { id:'dc20.1', nome:'Seguridade social' },
      { id:'dc20.2', nome:'Saúde' },
      { id:'dc20.3', nome:'Previdência social' },
      { id:'dc20.4', nome:'Assistência social' },
    ]},
    { id:'dc21', nome:'Educação, Cultura e Demais Temas Sociais', subtopicos:[
      { id:'dc21.1', nome:'Educação, cultura e desporto' },
      { id:'dc21.2', nome:'Ciência e tecnologia' },
      { id:'dc21.3', nome:'Comunicação social' },
      { id:'dc21.4', nome:'Meio ambiente' },
      { id:'dc21.5', nome:'Família, criança, adolescente e idoso' },
      { id:'dc21.6', nome:'Índios' },
    ]},
  ]},

  /* ═══ 2. DIREITO ADMINISTRATIVO ═══ */
  { id:'da', nome:'Direito Administrativo', cor:'#059669', topicos:[
    { id:'da1', nome:'Administração Pública e Direito Administrativo', subtopicos:[
      { id:'da1.1', nome:'Noção e objeto' },
      { id:'da1.2', nome:'Princípios informadores' },
      { id:'da1.3', nome:'Regime jurídico-administrativo' },
      { id:'da1.4', nome:'Fontes do direito administrativo' },
    ]},
    { id:'da2', nome:'Administração Direta e Indireta', subtopicos:[
      { id:'da2.1', nome:'Órgãos e pessoas jurídicas' },
      { id:'da2.2', nome:'Autarquias e autarquias especiais' },
      { id:'da2.3', nome:'Agências reguladoras e executivas' },
      { id:'da2.4', nome:'Fundações públicas e estatais' },
      { id:'da2.5', nome:'Sociedades de economia mista e empresas públicas' },
      { id:'da2.6', nome:'Entidades paraestatais e terceiro setor' },
      { id:'da2.7', nome:'Consórcios públicos e convênios de cooperação' },
    ]},
    { id:'da3', nome:'Advocacia Pública', subtopicos:[
      { id:'da3.1', nome:'Preceitos constitucionais' },
      { id:'da3.2', nome:'Procuradoria-Geral do Município de Curitiba — atribuições e competência' },
      { id:'da3.3', nome:'Lei Orgânica do Município' },
      { id:'da3.4', nome:'Lei Municipal nº 11.001/2004' },
    ]},
    { id:'da4', nome:'Atos e Fatos Administrativos', subtopicos:[
      { id:'da4.1', nome:'Classificação dos atos administrativos' },
      { id:'da4.2', nome:'Elementos e requisitos' },
      { id:'da4.3', nome:'Vinculação e discricionariedade' },
    ]},
    { id:'da5', nome:'Perfeição, Validade e Eficácia', subtopicos:[
      { id:'da5.1', nome:'Atributos do ato administrativo' },
      { id:'da5.2', nome:'Teoria dos motivos determinantes' },
    ]},
    { id:'da6', nome:'Defeitos e Desfazimento do Ato', subtopicos:[
      { id:'da6.1', nome:'Defeitos do ato administrativo' },
      { id:'da6.2', nome:'Revogação e anulação' },
      { id:'da6.3', nome:'Convalidação e confirmação' },
    ]},
    { id:'da7', nome:'Contratos Administrativos', subtopicos:[
      { id:'da7.1', nome:'Conceito e caracteres jurídicos' },
      { id:'da7.2', nome:'Espécies de contratos' },
      { id:'da7.3', nome:'Convênios e contratos de gestão' },
      { id:'da7.4', nome:'Legislação federal e Lei Municipal 9.226/97' },
      { id:'da7.5', nome:'Termos de parceria e Lei 13.019/2014' },
      { id:'da7.6', nome:'Concessões' },
      { id:'da7.7', nome:'Parcerias público-privadas (Lei Municipal 11.929/2006)' },
    ]},
    { id:'da8', nome:'Formação dos Contratos e Licitação', subtopicos:[
      { id:'da8.1', nome:'Conceito, fundamentos, modalidades e procedimentos' },
      { id:'da8.2', nome:'Pregão' },
      { id:'da8.3', nome:'Licitação em concessões, permissões e PPP' },
      { id:'da8.4', nome:'Regime Diferenciado de Contratações (RDC)' },
    ]},
    { id:'da9', nome:'Execução dos Contratos', subtopicos:[
      { id:'da9.1', nome:'Força maior, imprevisão e fato do príncipe' },
      { id:'da9.2', nome:'Extinção dos contratos administrativos' },
    ]},
    { id:'da10', nome:'Atividade Administrativa de Fomento', subtopicos:[
      { id:'da10.1', nome:'Conceito e modalidades' },
      { id:'da10.2', nome:'Hipóteses e limites' },
    ]},
    { id:'da11', nome:'Poder de Polícia', subtopicos:[
      { id:'da11.1', nome:'Conceito e setores de atuação' },
      { id:'da11.2', nome:'Polícia administrativa e judiciária' },
      { id:'da11.3', nome:'Liberdades públicas e poder de polícia' },
    ]},
    { id:'da12', nome:'Serviço Público', subtopicos:[
      { id:'da12.1', nome:'Conceito e caracteres jurídicos' },
      { id:'da12.2', nome:'Classificação' },
      { id:'da12.3', nome:'Garantias dos administrados' },
      { id:'da12.4', nome:'Serviços da União, dos Estados e dos Municípios' },
    ]},
    { id:'da13', nome:'Bens Públicos', subtopicos:[
      { id:'da13.1', nome:'Classificação e caracteres jurídicos' },
      { id:'da13.2', nome:'Vias públicas e alinhamentos' },
    ]},
    { id:'da14', nome:'Utilização e Ocupação de Bens Públicos', subtopicos:[
      { id:'da14.1', nome:'Permissão e concessão de uso' },
      { id:'da14.2', nome:'Aforamento' },
      { id:'da14.3', nome:'Concessão de domínio pleno' },
    ]},
    { id:'da15', nome:'Intervenção na Propriedade Privada', subtopicos:[
      { id:'da15.1', nome:'Limitações administrativas' },
      { id:'da15.2', nome:'Tombamento' },
      { id:'da15.3', nome:'Servidões administrativas' },
      { id:'da15.4', nome:'Requisição e ocupação temporária' },
      { id:'da15.5', nome:'Estatuto da Cidade' },
    ]},
    { id:'da16', nome:'Desapropriação por Utilidade Pública', subtopicos:[
      { id:'da16.1', nome:'Conceito e fundamentos' },
      { id:'da16.2', nome:'Processo administrativo e judicial' },
      { id:'da16.3', nome:'Indenização' },
      { id:'da16.4', nome:'Desapropriação por zona e direito de extensão' },
      { id:'da16.5', nome:'Tredestinação e retrocessão' },
    ]},
    { id:'da17', nome:'Desapropriação por Interesse Social', subtopicos:[
      { id:'da17.1', nome:'Conceito e fundamentos' },
      { id:'da17.2', nome:'Desapropriação para reforma agrária' },
      { id:'da17.3', nome:'Requisitos' },
      { id:'da17.4', nome:'Processo administrativo e judicial e indenização' },
    ]},
    { id:'da18', nome:'Controle da Administração Pública', subtopicos:[
      { id:'da18.1', nome:'Tipos e formas de controle' },
      { id:'da18.2', nome:'Controle administrativo e legislativo' },
      { id:'da18.3', nome:'Tribunal de Contas' },
      { id:'da18.4', nome:'Controle jurisdicional' },
    ]},
    { id:'da19', nome:'Responsabilidade Extracontratual do Estado', subtopicos:[
      { id:'da19.1', nome:'Evolução da responsabilização estatal' },
      { id:'da19.2', nome:'Teorias subjetivas e objetivas' },
      { id:'da19.3', nome:'Direito brasileiro' },
      { id:'da19.4', nome:'Ação regressiva contra o servidor' },
    ]},
    { id:'da20', nome:'Servidores Públicos', subtopicos:[
      { id:'da20.1', nome:'Cargo, emprego e função pública' },
      { id:'da20.2', nome:'Regime constitucional do servidor' },
      { id:'da20.3', nome:'Limites de despesas na LRF' },
      { id:'da20.4', nome:'Responsabilidade do servidor' },
      { id:'da20.5', nome:'Estatuto de Curitiba (Lei Municipal 1.656/1958)' },
      { id:'da20.6', nome:'Subsídio dos agentes políticos' },
    ]},
    { id:'da21', nome:'Processo e Procedimento Administrativo', subtopicos:[
      { id:'da21.1', nome:'Garantias constitucionais' },
      { id:'da21.2', nome:'Instância administrativa, representação e reclamação' },
      { id:'da21.3', nome:'Recursos administrativos e prescrição' },
      { id:'da21.4', nome:'Lei federal de processo administrativo e LINDB' },
      { id:'da21.5', nome:'Autocomposição, mediação, arbitragem e conciliação' },
      { id:'da21.6', nome:'Compromisso de Ajustamento de Conduta' },
    ]},
    { id:'da22', nome:'Lei Anticorrupção', subtopicos:[
      { id:'da22.1', nome:'Lei Federal nº 12.846/2013' },
    ]},
    { id:'da23', nome:'Assistência Social', subtopicos:[
      { id:'da23.1', nome:'Sistema Único' },
      { id:'da23.2', nome:'Lei Orgânica (Lei Federal nº 8.742/1993)' },
    ]},
    { id:'da24', nome:'Improbidade Administrativa', subtopicos:[
      { id:'da24.1', nome:'Lei Federal nº 8.429/1992' },
      { id:'da24.2', nome:'Decreto-Lei nº 201/1967' },
    ]},
    { id:'da25', nome:'Sistema Único de Saúde', subtopicos:[
      { id:'da25.1', nome:'Lei nº 8.080/1990 e Lei nº 8.142/1990' },
      { id:'da25.2', nome:'Dispensação de medicamentos e responsabilidade dos entes' },
    ]},
    { id:'da26', nome:'Legislação Municipal de Curitiba (Administrativo)', subtopicos:[
      { id:'da26.1', nome:'Lei Municipal nº 7.671/1991 e alterações' },
    ]},
  ]},

  /* ═══ 3. DIREITO URBANÍSTICO ═══ */
  { id:'dur', nome:'Direito Urbanístico', cor:'#0d9488', topicos:[
    { id:'dur1', nome:'Constituição Federal (Urbanístico)', subtopicos:[
      { id:'dur1.1', nome:'Ordenamento territorial e competências urbanísticas' },
      { id:'dur1.2', nome:'Normas gerais e município' },
      { id:'dur1.3', nome:'Política urbana, plano diretor e função social da propriedade' },
      { id:'dur1.4', nome:'Regiões metropolitanas e aglomerados urbanos' },
    ]},
    { id:'dur2', nome:'Direito Urbanístico e Direito à Cidade', subtopicos:[
      { id:'dur2.1', nome:'Função social da cidade e autonomia científica' },
      { id:'dur2.2', nome:'Princípios' },
      { id:'dur2.3', nome:'Direito de construir e direito de propriedade' },
      { id:'dur2.4', nome:'Uso e ocupação do solo urbano e zoneamento' },
      { id:'dur2.5', nome:'Licenças urbanísticas' },
      { id:'dur2.6', nome:'Responsabilidade administrativa, civil e penal' },
    ]},
    { id:'dur3', nome:'Direito à Moradia', subtopicos:[
      { id:'dur3.1', nome:'Regularização fundiária de interesse social (Lei 11.977/2009; Lei 12.424/2011; MP 2.220/2011; Lei 13.465/2017)' },
      { id:'dur3.2', nome:'Direito registral imobiliário' },
    ]},
    { id:'dur4', nome:'Parcelamento do Solo Urbano', subtopicos:[
      { id:'dur4.1', nome:'Loteamento, desmembramento e arruamento' },
      { id:'dur4.2', nome:'Lei Municipal 2.942/1966 e Lei Municipal 9.460/1998' },
      { id:'dur4.3', nome:'Lei nº 6.766/1979 e regularização fundiária' },
      { id:'dur4.4', nome:'Área de Preservação Permanente urbana' },
    ]},
    { id:'dur5', nome:'Estatuto da Cidade', subtopicos:[
      { id:'dur5.1', nome:'Norma geral, objetivos e diretrizes' },
      { id:'dur5.2', nome:'Instrumentos da política urbana' },
      { id:'dur5.3', nome:'Gestão democrática das cidades' },
      { id:'dur5.4', nome:'Normas para elaboração do Plano Diretor' },
    ]},
    { id:'dur6', nome:'Desapropriação e Procedimento', subtopicos:[
      { id:'dur6.1', nome:'Conceito, aplicações e justa indenização' },
      { id:'dur6.2', nome:'Recuperação das mais-valias urbanísticas' },
      { id:'dur6.3', nome:'Procedimento judicial e administrativo' },
    ]},
    { id:'dur7', nome:'Proteção do Patrimônio Cultural', subtopicos:[
      { id:'dur7.1', nome:'Instrumentos de tutela de bens materiais e imateriais' },
      { id:'dur7.2', nome:'Competências' },
      { id:'dur7.3', nome:'Tombamento e registro' },
      { id:'dur7.4', nome:'Função social da propriedade pública' },
    ]},
    { id:'dur8', nome:'Tutela da Ordem Jurídico-Urbanística', subtopicos:[
      { id:'dur8.1', nome:'Ação civil pública e ação popular' },
      { id:'dur8.2', nome:'Ações reais e possessórias' },
      { id:'dur8.3', nome:'Mecanismos extrajudiciais, Termo de Compromisso e TAC' },
      { id:'dur8.4', nome:'Audiências públicas' },
    ]},
    { id:'dur9', nome:'Leis Curitibanas (Urbanístico)', subtopicos:[
      { id:'dur9.1', nome:'Lei 11.095/2004 (Código de Posturas)' },
      { id:'dur9.2', nome:'Lei 14.771/2015 (Plano Diretor)' },
      { id:'dur9.3', nome:'Lei 9.800/2000 (Zoneamento, Uso e Ocupação)' },
      { id:'dur9.4', nome:'Lei 9.802/2000 (Habitação de Interesse Social)' },
      { id:'dur9.5', nome:'Lei 9.803/2000 (Transferência do Potencial Construtivo)' },
      { id:'dur9.6', nome:'Lei 14.794/2016 (Patrimônio Cultural)' },
    ]},
  ]},

  /* ═══ 4. DIREITO AMBIENTAL ═══ */
  { id:'dma', nome:'Direito Ambiental', cor:'#16a34a', topicos:[
    { id:'dma1', nome:'Direito Ambiental Constitucional', subtopicos:[
      { id:'dma1.1', nome:'Meio ambiente como direito fundamental' },
      { id:'dma1.2', nome:'Princípios estruturantes' },
      { id:'dma1.3', nome:'Competências legislativa e material' },
      { id:'dma1.4', nome:'Deveres ambientais e instrumentos jurisdicionais' },
      { id:'dma1.5', nome:'Função ambiental pública e privada e função social da propriedade' },
      { id:'dma1.6', nome:'Bens ambientais e propedêutica' },
    ]},
    { id:'dma2', nome:'Conceito de Meio Ambiente', subtopicos:[
      { id:'dma2.1', nome:'Meio ambiente natural, artificial, cultural e do trabalho' },
      { id:'dma2.2', nome:'Recursos naturais e bens ambientais' },
      { id:'dma2.3', nome:'Biodiversidade e desenvolvimento sustentável' },
      { id:'dma2.4', nome:'Significado de direitos culturais' },
    ]},
    { id:'dma3', nome:'Princípios de Direito Ambiental', subtopicos:[
      { id:'dma3.1', nome:'Prevenção, precaução, poluidor-pagador e usuário-pagador' },
      { id:'dma3.2', nome:'Cooperação, informação, participação e equidade intergeracional' },
      { id:'dma3.3', nome:'Princípios da tutela do patrimônio cultural' },
    ]},
    { id:'dma4', nome:'Política Nacional de Meio Ambiente', subtopicos:[
      { id:'dma4.1', nome:'Objetivos e instrumentos' },
      { id:'dma4.2', nome:'SISNAMA' },
      { id:'dma4.3', nome:'Lei 6.938/1981 e Decreto 99.274/1990' },
      { id:'dma4.4', nome:'Resolução CONAMA 1 (EIA-RIMA)' },
      { id:'dma4.5', nome:'Resolução CONAMA 237 (Licenciamento)' },
      { id:'dma4.6', nome:'Resolução CONAMA 378' },
    ]},
    { id:'dma5', nome:'Recursos Hídricos', subtopicos:[
      { id:'dma5.1', nome:'Lei nº 9.433/1997' },
      { id:'dma5.2', nome:'Resolução CNRH 16/2001' },
      { id:'dma5.3', nome:'SINGREH' },
    ]},
    { id:'dma6', nome:'Recursos Florestais', subtopicos:[
      { id:'dma6.1', nome:'Lei nº 12.651/2012' },
      { id:'dma6.2', nome:'Resoluções CONAMA 302/2002 e 303/2002' },
      { id:'dma6.3', nome:'Lei nº 11.284/2006' },
    ]},
    { id:'dma7', nome:'Saneamento Básico', subtopicos:[
      { id:'dma7.1', nome:'Lei nº 11.445/2007' },
      { id:'dma7.2', nome:'Princípios e titularidade' },
      { id:'dma7.3', nome:'Prestação, regulação e controle social' },
    ]},
    { id:'dma8', nome:'Política Nacional de Resíduos Sólidos', subtopicos:[
      { id:'dma8.1', nome:'Lei nº 12.305/2010' },
      { id:'dma8.2', nome:'Princípios e objetivos' },
      { id:'dma8.3', nome:'Instrumentos e diretrizes' },
    ]},
    { id:'dma9', nome:'Espaços Territoriais Especialmente Protegidos', subtopicos:[
      { id:'dma9.1', nome:'Áreas de preservação permanente e reserva legal' },
      { id:'dma9.2', nome:'Lei nº 9.985/2000 (SNUC)' },
    ]},
    { id:'dma10', nome:'Política Urbana (Ambiental)', subtopicos:[
      { id:'dma10.1', nome:'Arts. 182 e 183 da CF e Lei 10.257/2001' },
      { id:'dma10.2', nome:'Zoneamento ambiental e proteção de manancial' },
      { id:'dma10.3', nome:'Poluição sonora, hídrica, atmosférica, visual e do solo' },
      { id:'dma10.4', nome:'Resíduos sólidos e arborização urbana' },
    ]},
    { id:'dma11', nome:'Responsabilidades', subtopicos:[
      { id:'dma11.1', nome:'Efeito, impacto e dano ambiental' },
      { id:'dma11.2', nome:'Poluição' },
      { id:'dma11.3', nome:'Responsabilidade administrativa, civil e penal' },
      { id:'dma11.4', nome:'Tutela processual e papel do MP' },
      { id:'dma11.5', nome:'Crimes ambientais' },
      { id:'dma11.6', nome:'Lei 9.605/1998 e Decreto 6.514/2008' },
    ]},
    { id:'dma12', nome:'Leis Curitibanas (Ambiental)', subtopicos:[
      { id:'dma12.1', nome:'Lei 9.806/2000 (Código Florestal Municipal)' },
      { id:'dma12.2', nome:'Lei 9.804/2000 (Unidades de Conservação)' },
      { id:'dma12.3', nome:'Lei 14.587/2015 (RPPNM)' },
      { id:'dma12.4', nome:'Lei 7.833/1991 (Proteção do Meio Ambiente)' },
    ]},
  ]},

  /* ═══ 5. DIREITO TRIBUTÁRIO, PROCESSUAL TRIBUTÁRIO E FINANCEIRO ═══ */
  { id:'dt', nome:'Direito Tributário, Processual Tributário e Financeiro', cor:'#7c3aed', topicos:[
    { id:'dt1', nome:'Sistema Tributário Nacional', subtopicos:[
      { id:'dt1.1', nome:'Sistema jurídico e princípios constitucionais' },
      { id:'dt1.2', nome:'Imunidades: conceito, espécies, natureza e alcance' },
      { id:'dt1.3', nome:'Distinção entre imunidade, isenção e não incidência' },
    ]},
    { id:'dt2', nome:'Competência Tributária', subtopicos:[
      { id:'dt2.1', nome:'Competência da União, Estados, DF e Municípios' },
      { id:'dt2.2', nome:'Conflito de competência' },
    ]},
    { id:'dt3', nome:'Direito Tributário e Fontes', subtopicos:[
      { id:'dt3.1', nome:'Conceito e autonomia' },
      { id:'dt3.2', nome:'Fontes do direito tributário' },
      { id:'dt3.3', nome:'Instrumentos introdutórios de normas' },
      { id:'dt3.4', nome:'Vigência, aplicação, interpretação e integração' },
      { id:'dt3.5', nome:'Normas gerais e complementares' },
    ]},
    { id:'dt4', nome:'Tributo', subtopicos:[
      { id:'dt4.1', nome:'Conceitos e natureza jurídica' },
      { id:'dt4.2', nome:'Classificações' },
      { id:'dt4.3', nome:'Espécies tributárias' },
      { id:'dt4.4', nome:'Funções dos tributos' },
    ]},
    { id:'dt5', nome:'Repartição de Receitas Tributárias', subtopicos:[
      { id:'dt5.1', nome:'Repartição das receitas tributárias' },
    ]},
    { id:'dt6', nome:'Norma Jurídica Tributária', subtopicos:[
      { id:'dt6.1', nome:'Regra-matriz de incidência' },
      { id:'dt6.2', nome:'Fato jurídico tributário' },
      { id:'dt6.3', nome:'Hipótese de incidência e consequência' },
      { id:'dt6.4', nome:'Relação jurídica tributária' },
    ]},
    { id:'dt7', nome:'Obrigação Tributária', subtopicos:[
      { id:'dt7.1', nome:'Conceito, natureza e espécies' },
      { id:'dt7.2', nome:'Responsabilidade tributária e substituição' },
      { id:'dt7.3', nome:'Solidariedade' },
      { id:'dt7.4', nome:'Capacidade e domicílio tributário' },
      { id:'dt7.5', nome:'Responsabilidade de sucessores, terceiros e sócios' },
      { id:'dt7.6', nome:'Denúncia espontânea' },
    ]},
    { id:'dt8', nome:'Crédito Tributário', subtopicos:[
      { id:'dt8.1', nome:'Conceito e constituição' },
      { id:'dt8.2', nome:'Lançamento: natureza e modalidades' },
      { id:'dt8.3', nome:'Suspensão da exigibilidade' },
      { id:'dt8.4', nome:'Extinção e exclusão do crédito' },
      { id:'dt8.5', nome:'Garantias e privilégios' },
      { id:'dt8.6', nome:'Infrações e sanções, fraude à execução' },
    ]},
    { id:'dt9', nome:'IPTU', subtopicos:[
      { id:'dt9.1', nome:'Regra-matriz de incidência' },
      { id:'dt9.2', nome:'Hipótese e consequência tributária' },
      { id:'dt9.3', nome:'Isenção e imunidade' },
      { id:'dt9.4', nome:'Lançamento' },
    ]},
    { id:'dt10', nome:'ISS', subtopicos:[
      { id:'dt10.1', nome:'Decreto-Lei 406/68 e LC 116/2003' },
      { id:'dt10.2', nome:'Regra-matriz de incidência' },
      { id:'dt10.3', nome:'Isenção e imunidade' },
      { id:'dt10.4', nome:'Lançamento' },
    ]},
    { id:'dt11', nome:'ITBI', subtopicos:[
      { id:'dt11.1', nome:'Regra-matriz de incidência' },
      { id:'dt11.2', nome:'Hipótese e consequência' },
      { id:'dt11.3', nome:'Isenção e imunidade' },
      { id:'dt11.4', nome:'Lançamento' },
    ]},
    { id:'dt12', nome:'Contribuição de Melhoria', subtopicos:[
      { id:'dt12.1', nome:'Regra-matriz de incidência' },
      { id:'dt12.2', nome:'Hipótese e consequência' },
      { id:'dt12.3', nome:'Isenção' },
      { id:'dt12.4', nome:'Lançamento' },
    ]},
    { id:'dt13', nome:'Contribuição de Iluminação Pública', subtopicos:[
      { id:'dt13.1', nome:'Regra-matriz de incidência' },
      { id:'dt13.2', nome:'Hipótese e consequência' },
      { id:'dt13.3', nome:'Isenção' },
      { id:'dt13.4', nome:'Lançamento' },
    ]},
    { id:'dt14', nome:'Taxas Municipais', subtopicos:[
      { id:'dt14.1', nome:'Serviços públicos e poder de polícia' },
      { id:'dt14.2', nome:'Regra-matriz de incidência' },
      { id:'dt14.3', nome:'Isenção' },
      { id:'dt14.4', nome:'Lançamento' },
    ]},
    { id:'dt15', nome:'Imposto Territorial Rural', subtopicos:[
      { id:'dt15.1', nome:'Regra-matriz de incidência' },
      { id:'dt15.2', nome:'Hipótese e consequência' },
      { id:'dt15.3', nome:'Isenção e imunidade' },
      { id:'dt15.4', nome:'Lançamento e capacidade tributária ativa' },
    ]},
    { id:'dt16', nome:'Processo Administrativo Fiscal', subtopicos:[
      { id:'dt16.1', nome:'Federal e municipal' },
      { id:'dt16.2', nome:'Infrações e sanções tributárias' },
      { id:'dt16.3', nome:'Garantias, privilégios e dever de sigilo' },
      { id:'dt16.4', nome:'Dívida ativa e certidões' },
    ]},
    { id:'dt17', nome:'Processo Judicial Tributário', subtopicos:[
      { id:'dt17.1', nome:'Princípios aplicáveis' },
      { id:'dt17.2', nome:'Execução fiscal e cautelar fiscal' },
      { id:'dt17.3', nome:'Defesas do contribuinte e embargos' },
      { id:'dt17.4', nome:'Exceção de pré-executividade' },
      { id:'dt17.5', nome:'Ações declaratória, anulatória, repetição e consignação' },
      { id:'dt17.6', nome:'Mandado de segurança e tutela antecipada' },
      { id:'dt17.7', nome:'Ações coletivas e controle judicial' },
    ]},
    { id:'dt18', nome:'Finanças Públicas', subtopicos:[
      { id:'dt18.1', nome:'Normas gerais, receitas, despesas, orçamento e dívida pública' },
    ]},
    { id:'dt19', nome:'Leis Orçamentárias', subtopicos:[
      { id:'dt19.1', nome:'Plano plurianual' },
      { id:'dt19.2', nome:'Lei de Diretrizes Orçamentárias' },
      { id:'dt19.3', nome:'Lei do Orçamento' },
    ]},
    { id:'dt20', nome:'Lei nº 4.320/1964', subtopicos:[
      { id:'dt20.1', nome:'Lei Federal nº 4.320/1964' },
    ]},
    { id:'dt21', nome:'Lei de Responsabilidade Fiscal', subtopicos:[
      { id:'dt21.1', nome:'Lei Complementar Federal nº 101/2000' },
    ]},
    { id:'dt22', nome:'Estatuto da ME e EPP', subtopicos:[
      { id:'dt22.1', nome:'Lei Complementar Federal nº 123/2006' },
    ]},
    { id:'dt23', nome:'Gestão Fiscal e Orçamentária', subtopicos:[
      { id:'dt23.1', nome:'Planejamento, execução e cumprimento de metas' },
      { id:'dt23.2', nome:'Receita e despesa pública' },
      { id:'dt23.3', nome:'Transferências voluntárias e recursos ao setor privado' },
      { id:'dt23.4', nome:'Dívida e endividamento' },
      { id:'dt23.5', nome:'Gestão patrimonial, transparência e fiscalização' },
    ]},
    { id:'dt24', nome:'Precatórios', subtopicos:[
      { id:'dt24.1', nome:'Obrigações de pequeno valor' },
      { id:'dt24.2', nome:'Regimes anterior e posterior à EC 62/2009' },
    ]},
    { id:'dt25', nome:'Responsabilidade Fiscal e PPP', subtopicos:[
      { id:'dt25.1', nome:'Crimes de responsabilidade fiscal' },
      { id:'dt25.2', nome:'Parcerias público-privadas' },
      { id:'dt25.3', nome:'Restrições orçamentárias, contraprestação e limites' },
      { id:'dt25.4', nome:'Fundo garantidor' },
    ]},
    { id:'dt26', nome:'Leis Municipais (Tributário/Financeiro)', subtopicos:[
      { id:'dt26.1', nome:'LC 40/2001 e alterações' },
      { id:'dt26.2', nome:'LC 71/2009 e LC 48/2003' },
      { id:'dt26.3', nome:'LC 101/2017 e LC 108/2017' },
      { id:'dt26.4', nome:'Lei 14.064/2012' },
    ]},
  ]},

  /* ═══ 6. DIREITO PROCESSUAL CIVIL ═══ */
  { id:'pc', nome:'Direito Processual Civil', cor:'#d97706', topicos:[
    { id:'pc1', nome:'Direito Processual Civil e Codificações', subtopicos:[
      { id:'pc1.1', nome:'Relação com os demais ramos e divisão' },
      { id:'pc1.2', nome:'Perfil histórico' },
      { id:'pc1.3', nome:'Codificações brasileiras' },
    ]},
    { id:'pc2', nome:'Norma Processual', subtopicos:[
      { id:'pc2.1', nome:'Características' },
      { id:'pc2.2', nome:'Norma processual e material' },
      { id:'pc2.3', nome:'Lei processual no tempo e no espaço' },
    ]},
    { id:'pc3', nome:'Jurisdição', subtopicos:[
      { id:'pc3.1', nome:'Funções do Estado e características' },
      { id:'pc3.2', nome:'Limites' },
      { id:'pc3.3', nome:'Jurisdição voluntária' },
    ]},
    { id:'pc4', nome:'Competência', subtopicos:[
      { id:'pc4.1', nome:'Critérios de dividir a competência' },
      { id:'pc4.2', nome:'Competência absoluta e relativa' },
      { id:'pc4.3', nome:'Modificações da competência' },
    ]},
    { id:'pc5', nome:'Ação', subtopicos:[
      { id:'pc5.1', nome:'Natureza jurídica' },
      { id:'pc5.2', nome:'Classificação das ações' },
    ]},
    { id:'pc6', nome:'Processo', subtopicos:[
      { id:'pc6.1', nome:'Natureza jurídica e relação jurídica processual' },
      { id:'pc6.2', nome:'Tipos de processo' },
      { id:'pc6.3', nome:'Pressupostos processuais' },
    ]},
    { id:'pc7', nome:'Sujeitos do Processo', subtopicos:[
      { id:'pc7.1', nome:'Capacidade processual do juiz e das partes' },
      { id:'pc7.2', nome:'Abstenção e recusa do juiz' },
      { id:'pc7.3', nome:'Substituição processual e sucessão das partes' },
      { id:'pc7.4', nome:'Assistência judiciária' },
    ]},
    { id:'pc8', nome:'Litisconsórcio e Intervenção de Terceiros', subtopicos:[
      { id:'pc8.1', nome:'Litisconsórcio' },
      { id:'pc8.2', nome:'Intervenção de terceiros' },
    ]},
    { id:'pc9', nome:'Atos Processuais', subtopicos:[
      { id:'pc9.1', nome:'Atos das partes e do juiz' },
      { id:'pc9.2', nome:'Forma dos atos processuais' },
      { id:'pc9.3', nome:'Nulidade' },
    ]},
    { id:'pc10', nome:'Lugar, Tempo e Prazos', subtopicos:[
      { id:'pc10.1', nome:'Lugar da prática dos atos e cooperação jurisdicional' },
      { id:'pc10.2', nome:'Tempo da prática dos atos' },
      { id:'pc10.3', nome:'Prazos processuais' },
      { id:'pc10.4', nome:'Impulso processual e preclusão' },
    ]},
    { id:'pc11', nome:'Processo e Procedimento', subtopicos:[
      { id:'pc11.1', nome:'Processo e procedimento' },
    ]},
    { id:'pc12', nome:'Tutela Jurisdicional', subtopicos:[
      { id:'pc12.1', nome:'Técnicas de tutela jurisdicional' },
      { id:'pc12.2', nome:'Tutelas provisórias' },
    ]},
    { id:'pc13', nome:'Procedimento Comum', subtopicos:[
      { id:'pc13.1', nome:'Fases e respectivos atos' },
    ]},
    { id:'pc14', nome:'Instrução Probatória', subtopicos:[
      { id:'pc14.1', nome:'Conceito e objeto da prova' },
      { id:'pc14.2', nome:'Ônus da prova e carga dinâmica' },
      { id:'pc14.3', nome:'Procedimento probatório' },
      { id:'pc14.4', nome:'Antecipação da prova e prova emprestada' },
      { id:'pc14.5', nome:'Posição do juiz na apreciação da prova' },
    ]},
    { id:'pc15', nome:'Provas em Espécie', subtopicos:[
      { id:'pc15.1', nome:'Provas típicas e atípicas' },
      { id:'pc15.2', nome:'Incidente de falsidade de prova' },
    ]},
    { id:'pc16', nome:'Sentença', subtopicos:[
      { id:'pc16.1', nome:'Conceito e requisitos' },
      { id:'pc16.2', nome:'Sentenças de procedência e improcedência' },
      { id:'pc16.3', nome:'Publicação, vícios e correções' },
    ]},
    { id:'pc17', nome:'Recursos', subtopicos:[
      { id:'pc17.1', nome:'Princípios gerais' },
      { id:'pc17.2', nome:'Pressupostos objetivos e subjetivos de admissibilidade' },
      { id:'pc17.3', nome:'Efeitos recursais' },
      { id:'pc17.4', nome:'Procedimento de julgamento e extinção' },
      { id:'pc17.5', nome:'Remessa necessária' },
    ]},
    { id:'pc18', nome:'Meios de Impugnação', subtopicos:[
      { id:'pc18.1', nome:'Recursos em espécie e sucedâneos' },
      { id:'pc18.2', nome:'Ações autônomas de impugnação' },
      { id:'pc18.3', nome:'Ação rescisória' },
      { id:'pc18.4', nome:'Querela nullitatis insanabilis' },
      { id:'pc18.5', nome:'Ação anulatória' },
    ]},
    { id:'pc19', nome:'Coisa Julgada', subtopicos:[
      { id:'pc19.1', nome:'Coisa julgada e preclusão' },
      { id:'pc19.2', nome:'Coisa julgada formal e material' },
      { id:'pc19.3', nome:'Limites objetivos e subjetivos' },
      { id:'pc19.4', nome:'Cláusula rebus sic stantibus' },
      { id:'pc19.5', nome:'Relativização da coisa julgada' },
    ]},
    { id:'pc20', nome:'Processos nos Tribunais', subtopicos:[
      { id:'pc20.1', nome:'Incidente de arguição de inconstitucionalidade' },
      { id:'pc20.2', nome:'Incidente de assunção de competência' },
      { id:'pc20.3', nome:'IRDR' },
    ]},
    { id:'pc21', nome:'Processo de Execução', subtopicos:[
      { id:'pc21.1', nome:'Execução e cumprimento de sentença' },
      { id:'pc21.2', nome:'Princípios e pressupostos da execução' },
    ]},
    { id:'pc22', nome:'Título Executivo e Liquidação', subtopicos:[
      { id:'pc22.1', nome:'Título executivo' },
      { id:'pc22.2', nome:'Liquidação de sentença' },
      { id:'pc22.3', nome:'Execução provisória e definitiva' },
    ]},
    { id:'pc23', nome:'Responsabilidade Patrimonial', subtopicos:[
      { id:'pc23.1', nome:'Responsabilidade objetiva e subjetiva' },
      { id:'pc23.2', nome:'Bens e pessoas sujeitas à execução' },
      { id:'pc23.3', nome:'Fraude à execução e fraude contra credores' },
    ]},
    { id:'pc24', nome:'Execução de Coisa Certa', subtopicos:[
      { id:'pc24.1', nome:'Execução de coisa certa ou em espécie' },
      { id:'pc24.2', nome:'Execução das obrigações de fazer e não fazer' },
    ]},
    { id:'pc25', nome:'Execução contra Devedor Solvente', subtopicos:[
      { id:'pc25.1', nome:'Procedimento' },
    ]},
    { id:'pc26', nome:'Execução contra Devedor Insolvente', subtopicos:[
      { id:'pc26.1', nome:'Procedimento' },
    ]},
    { id:'pc27', nome:'Defesas do Executado', subtopicos:[
      { id:'pc27.1', nome:'Embargos do devedor e impugnação' },
      { id:'pc27.2', nome:'Exceção de pré-executividade e ações heterotópicas' },
      { id:'pc27.3', nome:'Natureza jurídica, cabimento e procedimento' },
    ]},
    { id:'pc28', nome:'Embargos de Terceiro', subtopicos:[
      { id:'pc28.1', nome:'Natureza jurídica' },
      { id:'pc28.2', nome:'Legitimidade para embargar' },
      { id:'pc28.3', nome:'Procedimento' },
    ]},
    { id:'pc29', nome:'Ações Constitucionais Individuais', subtopicos:[
      { id:'pc29.1', nome:'Mandado de segurança' },
      { id:'pc29.2', nome:'Mandado de injunção' },
      { id:'pc29.3', nome:'Habeas data' },
      { id:'pc29.4', nome:'Reclamação constitucional' },
    ]},
    { id:'pc30', nome:'Ações Constitucionais Coletivas', subtopicos:[
      { id:'pc30.1', nome:'Ação popular' },
      { id:'pc30.2', nome:'Ação civil pública' },
      { id:'pc30.3', nome:'Mandado de segurança coletivo' },
      { id:'pc30.4', nome:'Ação de improbidade administrativa' },
    ]},
    { id:'pc31', nome:'Procedimentos Especiais', subtopicos:[
      { id:'pc31.1', nome:'Procedimentos especiais' },
    ]},
    { id:'pc32', nome:'Lei de Execução Fiscal', subtopicos:[
      { id:'pc32.1', nome:'Lei nº 6.830/1980' },
    ]},
    { id:'pc33', nome:'Suspensão de Decisões contra o Poder Público', subtopicos:[
      { id:'pc33.1', nome:'Suspensão de segurança' },
      { id:'pc33.2', nome:'Suspensão de cautelar' },
      { id:'pc33.3', nome:'Suspensão de tutela antecipada' },
    ]},
    { id:'pc34', nome:'Prerrogativas da Fazenda Pública', subtopicos:[
      { id:'pc34.1', nome:'Intervenção das pessoas jurídicas de direito público' },
      { id:'pc34.2', nome:'Juizados especiais da Fazenda Pública' },
      { id:'pc34.3', nome:'Representação judicial dos entes públicos' },
    ]},
    { id:'pc35', nome:'Meios Alternativos de Solução de Conflito', subtopicos:[
      { id:'pc35.1', nome:'Conciliação, mediação e arbitragem' },
      { id:'pc35.2', nome:'Aplicação no âmbito da Fazenda Pública' },
    ]},
    { id:'pc36', nome:'Precatórios', subtopicos:[
      { id:'pc36.1', nome:'Sistema de pagamento de precatórios' },
      { id:'pc36.2', nome:'Obrigações de pequeno valor' },
      { id:'pc36.3', nome:'Lei Municipal nº 10.235/2001' },
    ]},
  ]},

  /* ═══ 7. DIREITO CIVIL ═══ */
  { id:'civ', nome:'Direito Civil', cor:'#dc2626', topicos:[
    { id:'civ1', nome:'Norma Jurídica', subtopicos:[
      { id:'civ1.1', nome:'Vigência, validade, eficácia e aplicação' },
      { id:'civ1.2', nome:'Hierarquia e revogação' },
      { id:'civ1.3', nome:'Fontes do direito' },
      { id:'civ1.4', nome:'Interpretação das leis' },
      { id:'civ1.5', nome:'Conflito intertemporal e interespacial' },
    ]},
    { id:'civ2', nome:'Direito Subjetivo', subtopicos:[
      { id:'civ2.1', nome:'Direito potestativo, faculdade, poder e interesse legítimo' },
      { id:'civ2.2', nome:'Status, ônus e sujeição' },
      { id:'civ2.3', nome:'Direito adquirido e expectativa de direito' },
    ]},
    { id:'civ3', nome:'Pessoa Natural', subtopicos:[
      { id:'civ3.1', nome:'Personalidade: conceito, início e fim' },
      { id:'civ3.2', nome:'Capacidade de direito e de fato' },
      { id:'civ3.3', nome:'Incapacidade absoluta e relativa' },
      { id:'civ3.4', nome:'Capacidade e legitimação' },
      { id:'civ3.5', nome:'Direitos da personalidade' },
    ]},
    { id:'civ4', nome:'Pessoa Jurídica de Direito Privado', subtopicos:[
      { id:'civ4.1', nome:'Noção e classificação' },
      { id:'civ4.2', nome:'Aquisição da personalidade' },
      { id:'civ4.3', nome:'Capacidade e representação' },
      { id:'civ4.4', nome:'Extinção' },
      { id:'civ4.5', nome:'Desconsideração da personalidade jurídica' },
    ]},
    { id:'civ5', nome:'Domicílio', subtopicos:[
      { id:'civ5.1', nome:'Classificação' },
      { id:'civ5.2', nome:'Domicílio da pessoa natural' },
      { id:'civ5.3', nome:'Domicílio da pessoa jurídica' },
    ]},
    { id:'civ6', nome:'Bens', subtopicos:[
      { id:'civ6.1', nome:'Classificação' },
      { id:'civ6.2', nome:'Bens públicos: espécies e garantias' },
      { id:'civ6.3', nome:'Bem de família' },
    ]},
    { id:'civ7', nome:'Teoria Geral do Fato Jurídico', subtopicos:[
      { id:'civ7.1', nome:'Classificação' },
      { id:'civ7.2', nome:'Aquisição, modificação, perda e extinção de direitos' },
    ]},
    { id:'civ8', nome:'Vícios dos Atos e Negócios Jurídicos', subtopicos:[
      { id:'civ8.1', nome:'Vícios ou defeitos dos atos e negócios jurídicos' },
    ]},
    { id:'civ9', nome:'Elementos Acidentais', subtopicos:[
      { id:'civ9.1', nome:'Condição' },
      { id:'civ9.2', nome:'Termo' },
      { id:'civ9.3', nome:'Encargo' },
    ]},
    { id:'civ10', nome:'Invalidade dos Atos e Negócios', subtopicos:[
      { id:'civ10.1', nome:'Inexistência, nulidade e anulabilidade' },
      { id:'civ10.2', nome:'Ineficácia' },
      { id:'civ10.3', nome:'Efeitos da declaração de nulidade e anulabilidade' },
    ]},
    { id:'civ11', nome:'Prescrição e Decadência', subtopicos:[
      { id:'civ11.1', nome:'Conceito e fundamentos' },
      { id:'civ11.2', nome:'Decadência e caducidade' },
      { id:'civ11.3', nome:'Causas que impedem, suspendem e interrompem' },
      { id:'civ11.4', nome:'Prazos de prescrição e decadência' },
      { id:'civ11.5', nome:'Prescrição e a Fazenda Pública' },
    ]},
    { id:'civ12', nome:'Obrigação', subtopicos:[
      { id:'civ12.1', nome:'Elementos constitutivos da relação obrigacional' },
      { id:'civ12.2', nome:'Distinção entre direitos obrigacionais e reais' },
      { id:'civ12.3', nome:'Fontes das obrigações' },
    ]},
    { id:'civ13', nome:'Modalidades de Obrigação', subtopicos:[
      { id:'civ13.1', nome:'Obrigações solidárias' },
      { id:'civ13.2', nome:'Solidariedade ativa e passiva' },
      { id:'civ13.3', nome:'Obrigações pecuniárias e correção monetária' },
      { id:'civ13.4', nome:'Dívidas de dinheiro e de valor' },
    ]},
    { id:'civ14', nome:'Transmissão e Cumprimento', subtopicos:[
      { id:'civ14.1', nome:'Transmissão das obrigações' },
      { id:'civ14.2', nome:'Cumprimento e adimplemento' },
      { id:'civ14.3', nome:'Extinção das obrigações' },
    ]},
    { id:'civ15', nome:'Inadimplemento', subtopicos:[
      { id:'civ15.1', nome:'Teoria do inadimplemento' },
      { id:'civ15.2', nome:'Impossibilidade da prestação' },
      { id:'civ15.3', nome:'Mora' },
      { id:'civ15.4', nome:'Perdas e danos e juros legais' },
      { id:'civ15.5', nome:'Cláusula penal e arras' },
    ]},
    { id:'civ16', nome:'Impossibilidade Superveniente', subtopicos:[
      { id:'civ16.1', nome:'Caso fortuito e força maior' },
      { id:'civ16.2', nome:'Onerosidade excessiva' },
      { id:'civ16.3', nome:'Teoria da imprevisão' },
    ]},
    { id:'civ17', nome:'Responsabilidade Civil', subtopicos:[
      { id:'civ17.1', nome:'Elementos ou pressupostos' },
      { id:'civ17.2', nome:'Dano material e moral' },
      { id:'civ17.3', nome:'Responsabilidade por fato alheio' },
      { id:'civ17.4', nome:'Dever de indenizar e danos abrangidos' },
      { id:'civ17.5', nome:'Formas de indenização' },
    ]},
    { id:'civ18', nome:'Responsabilidade Objetiva', subtopicos:[
      { id:'civ18.1', nome:'Teoria do risco' },
      { id:'civ18.2', nome:'Responsabilidade objetiva no direito brasileiro' },
    ]},
    { id:'civ19', nome:'Contratos', subtopicos:[
      { id:'civ19.1', nome:'Transformações e dirigismo contratual' },
      { id:'civ19.2', nome:'Contrato de adesão e princípios' },
      { id:'civ19.3', nome:'Disposições gerais' },
      { id:'civ19.4', nome:'Responsabilidade pré e pós-contratual' },
      { id:'civ19.5', nome:'Extinção' },
      { id:'civ19.6', nome:'Boa-fé objetiva' },
    ]},
    { id:'civ20', nome:'Espécies Contratuais', subtopicos:[
      { id:'civ20.1', nome:'Compra e venda e promessa de compra e venda' },
      { id:'civ20.2', nome:'Doação' },
      { id:'civ20.3', nome:'Mandato' },
      { id:'civ20.4', nome:'Fiança' },
      { id:'civ20.5', nome:'Transação' },
    ]},
    { id:'civ21', nome:'Atos Unilaterais', subtopicos:[
      { id:'civ21.1', nome:'Promessa de recompensa' },
      { id:'civ21.2', nome:'Gestão de negócios' },
      { id:'civ21.3', nome:'Pagamento indevido' },
      { id:'civ21.4', nome:'Enriquecimento sem causa' },
    ]},
    { id:'civ22', nome:'Direito das Coisas', subtopicos:[
      { id:'civ22.1', nome:'Conceito e características' },
      { id:'civ22.2', nome:'Espécies' },
      { id:'civ22.3', nome:'Obrigações propter rem' },
    ]},
    { id:'civ23', nome:'Posse', subtopicos:[
      { id:'civ23.1', nome:'Conceito e teorias' },
      { id:'civ23.2', nome:'Posse e detenção' },
      { id:'civ23.3', nome:'Classificação e caráter da posse' },
      { id:'civ23.4', nome:'Posse dos bens públicos' },
      { id:'civ23.5', nome:'Proteção possessória' },
    ]},
    { id:'civ24', nome:'Aquisição, Efeitos e Perda da Posse', subtopicos:[
      { id:'civ24.1', nome:'Aquisição da posse' },
      { id:'civ24.2', nome:'Efeitos da posse' },
      { id:'civ24.3', nome:'Perda da posse' },
    ]},
    { id:'civ25', nome:'Direito de Propriedade', subtopicos:[
      { id:'civ25.1', nome:'Fundamentos, conceito e elementos' },
      { id:'civ25.2', nome:'Extensão e restrições' },
      { id:'civ25.3', nome:'Função social da propriedade' },
      { id:'civ25.4', nome:'Reforma agrária' },
    ]},
    { id:'civ26', nome:'Propriedade Imóvel', subtopicos:[
      { id:'civ26.1', nome:'Registro imobiliário e seus efeitos' },
      { id:'civ26.2', nome:'Acessão' },
      { id:'civ26.3', nome:'Usucapião' },
      { id:'civ26.4', nome:'Herança' },
    ]},
    { id:'civ27', nome:'Usucapião', subtopicos:[
      { id:'civ27.1', nome:'Modalidades' },
    ]},
    { id:'civ28', nome:'Perda da Propriedade Imóvel', subtopicos:[
      { id:'civ28.1', nome:'Diversas formas' },
      { id:'civ28.2', nome:'Desapropriação' },
    ]},
    { id:'civ29', nome:'Condomínio', subtopicos:[
      { id:'civ29.1', nome:'Diversas espécies' },
      { id:'civ29.2', nome:'Condomínio em prédios divididos em unidades autônomas' },
    ]},
    { id:'civ30', nome:'Servidões Prediais', subtopicos:[
      { id:'civ30.1', nome:'Conceito e classificação' },
      { id:'civ30.2', nome:'Disciplina jurídica' },
      { id:'civ30.3', nome:'Extinção' },
    ]},
    { id:'civ31', nome:'Usufruto', subtopicos:[
      { id:'civ31.1', nome:'Noção' },
      { id:'civ31.2', nome:'Disciplina jurídica' },
      { id:'civ31.3', nome:'Extinção' },
    ]},
    { id:'civ32', nome:'Hipoteca', subtopicos:[
      { id:'civ32.1', nome:'Conceito e classificação' },
      { id:'civ32.2', nome:'Constituição e efeitos' },
      { id:'civ32.3', nome:'Extinção' },
      { id:'civ32.4', nome:'Hipoteca cedular' },
    ]},
    { id:'civ33', nome:'Propriedade Resolúvel e Fiduciária', subtopicos:[
      { id:'civ33.1', nome:'Propriedade resolúvel' },
      { id:'civ33.2', nome:'Propriedade fiduciária' },
      { id:'civ33.3', nome:'Superfície' },
    ]},
    { id:'civ34', nome:'Empresário Individual e Coletivo', subtopicos:[
      { id:'civ34.1', nome:'Conceito' },
      { id:'civ34.2', nome:'Obrigações e prerrogativas' },
      { id:'civ34.3', nome:'Proibições e limitações ao exercício da atividade' },
    ]},
    { id:'civ35', nome:'Abuso do Poder Econômico', subtopicos:[
      { id:'civ35.1', nome:'Práticas comerciais restritivas à livre concorrência' },
      { id:'civ35.2', nome:'Aumento arbitrário de lucros' },
      { id:'civ35.3', nome:'Dominação de mercado' },
      { id:'civ35.4', nome:'CADE' },
    ]},
    { id:'civ36', nome:'Estabelecimento Empresarial', subtopicos:[
      { id:'civ36.1', nome:'Noção e elementos' },
      { id:'civ36.2', nome:'Trespasse e desapropriação' },
      { id:'civ36.3', nome:'Nome empresarial e título de estabelecimento' },
      { id:'civ36.4', nome:'Marcas' },
    ]},
    { id:'civ37', nome:'Sociedades Empresárias', subtopicos:[
      { id:'civ37.1', nome:'Conceito e natureza do ato constitutivo' },
      { id:'civ37.2', nome:'Classificação e responsabilidade dos sócios' },
      { id:'civ37.3', nome:'Personalidade jurídica e desconsideração' },
      { id:'civ37.4', nome:'Sociedades unipessoais' },
      { id:'civ37.5', nome:'Operações societárias e grupos' },
    ]},
    { id:'civ38', nome:'Sociedade Simples', subtopicos:[
      { id:'civ38.1', nome:'Disciplina jurídica' },
    ]},
    { id:'civ39', nome:'Sociedade Limitada', subtopicos:[
      { id:'civ39.1', nome:'Conceito, características e natureza' },
      { id:'civ39.2', nome:'Quotas sociais' },
      { id:'civ39.3', nome:'Responsabilidade dos sócios e administradores' },
      { id:'civ39.4', nome:'Dissolução, retirada e exclusão de sócio' },
      { id:'civ39.5', nome:'Aplicação das regras da S.A.' },
    ]},
    { id:'civ40', nome:'Sociedade Anônima', subtopicos:[
      { id:'civ40.1', nome:'Constituição e espécies' },
      { id:'civ40.2', nome:'Capital social' },
      { id:'civ40.3', nome:'Títulos de emissão' },
      { id:'civ40.4', nome:'Direitos dos acionistas e do controlador' },
      { id:'civ40.5', nome:'Responsabilidade dos administradores' },
      { id:'civ40.6', nome:'Sociedade de economia mista' },
    ]},
    { id:'civ41', nome:'Falência', subtopicos:[
      { id:'civ41.1', nome:'Legitimidade ativa e passiva' },
      { id:'civ41.2', nome:'Efeitos em relação a contratos, falido, administradores e sócios' },
      { id:'civ41.3', nome:'Administração da falência' },
      { id:'civ41.4', nome:'Atos ineficazes e revogáveis' },
      { id:'civ41.5', nome:'Pedido de restituição e embargos de terceiro' },
    ]},
    { id:'civ42', nome:'Classificação de Créditos na Falência', subtopicos:[
      { id:'civ42.1', nome:'Créditos inexigíveis e incólumes' },
      { id:'civ42.2', nome:'Realização do ativo e pagamento do passivo' },
    ]},
    { id:'civ43', nome:'Recuperação Judicial', subtopicos:[
      { id:'civ43.1', nome:'Legitimidade ativa e efeitos' },
      { id:'civ43.2', nome:'Requisitos, pedido e processamento' },
      { id:'civ43.3', nome:'Plano e procedimento' },
      { id:'civ43.4', nome:'Convolação em falência' },
      { id:'civ43.5', nome:'Recuperação extrajudicial e órgãos da recuperação' },
    ]},
    { id:'civ44', nome:'LINDB', subtopicos:[
      { id:'civ44.1', nome:'Lei nº 13.655/2018 — Lei de Introdução às Normas do Direito Brasileiro' },
    ]},
  ]},

  /* ═══ 8. DIREITO DO TRABALHO E PROCESSUAL DO TRABALHO ═══ */
  { id:'dtr', nome:'Direito do Trabalho e Processual do Trabalho', cor:'#4338ca', topicos:[
    { id:'dtr1', nome:'Direito do Trabalho', subtopicos:[
      { id:'dtr1.1', nome:'Princípios e fontes' },
      { id:'dtr1.2', nome:'Aspectos constitucionais' },
      { id:'dtr1.3', nome:'Interpretação e aplicação' },
      { id:'dtr1.4', nome:'Renúncia e transação' },
      { id:'dtr1.5', nome:'Direito do trabalho na administração pública' },
    ]},
    { id:'dtr2', nome:'Relação de Trabalho e de Emprego', subtopicos:[
      { id:'dtr2.1', nome:'Empregador e empregado' },
      { id:'dtr2.2', nome:'Regime celetista na administração pública' },
    ]},
    { id:'dtr3', nome:'Regimes Jurídicos Funcionais', subtopicos:[
      { id:'dtr3.1', nome:'Regime estatutário' },
      { id:'dtr3.2', nome:'Regime trabalhista' },
      { id:'dtr3.3', nome:'Contrato temporário' },
    ]},
    { id:'dtr4', nome:'Contrato de Trabalho', subtopicos:[
      { id:'dtr4.1', nome:'Noção, caracterização e modalidades' },
      { id:'dtr4.2', nome:'Efeitos, poderes e elementos' },
      { id:'dtr4.3', nome:'Nulidades' },
      { id:'dtr4.4', nome:'Formação, alteração, suspensão e interrupção' },
      { id:'dtr4.5', nome:'Contratos com o Estado e responsabilidade' },
    ]},
    { id:'dtr5', nome:'Sujeitos do Contrato de Trabalho', subtopicos:[
      { id:'dtr5.1', nome:'Empregado e empregador' },
      { id:'dtr5.2', nome:'Poderes do empregador' },
      { id:'dtr5.3', nome:'Grupo econômico e sucessão de empregadores' },
      { id:'dtr5.4', nome:'Responsabilidade do sócio retirante' },
    ]},
    { id:'dtr6', nome:'Salário e Remuneração', subtopicos:[
      { id:'dtr6.1', nome:'Proteção' },
      { id:'dtr6.2', nome:'Equiparação' },
      { id:'dtr6.3', nome:'Desvio de função' },
    ]},
    { id:'dtr7', nome:'Extinção do Contrato', subtopicos:[
      { id:'dtr7.1', nome:'Causas, modalidades e efeitos' },
      { id:'dtr7.2', nome:'Justa causa' },
      { id:'dtr7.3', nome:'Estabilidade e garantia do emprego' },
      { id:'dtr7.4', nome:'FGTS, aviso prévio e multas' },
    ]},
    { id:'dtr8', nome:'Estabilidade e Proteção contra Despedida', subtopicos:[
      { id:'dtr8.1', nome:'Estabilidade e proteção contra despedida arbitrária' },
      { id:'dtr8.2', nome:'FGTS' },
      { id:'dtr8.3', nome:'Garantias provisórias de emprego' },
    ]},
    { id:'dtr9', nome:'Terceirização', subtopicos:[
      { id:'dtr9.1', nome:'Responsabilidade da administração pública na terceirização' },
    ]},
    { id:'dtr10', nome:'Duração do Trabalho', subtopicos:[
      { id:'dtr10.1', nome:'Horário e jornada' },
      { id:'dtr10.2', nome:'Horas extras e jornadas especiais' },
      { id:'dtr10.3', nome:'Intervalos' },
      { id:'dtr10.4', nome:'Regime de compensação' },
    ]},
    { id:'dtr11', nome:'Repousos Remunerados e Férias', subtopicos:[
      { id:'dtr11.1', nome:'Repousos remunerados em geral' },
      { id:'dtr11.2', nome:'Férias' },
    ]},
    { id:'dtr12', nome:'Segurança e Medicina do Trabalho', subtopicos:[
      { id:'dtr12.1', nome:'Trabalho insalubre e perigoso' },
      { id:'dtr12.2', nome:'Ergonomia e meio ambiente de trabalho' },
      { id:'dtr12.3', nome:'Proteção do trabalho da mulher e à maternidade' },
      { id:'dtr12.4', nome:'Proteção do trabalho do menor' },
    ]},
    { id:'dtr13', nome:'Responsabilidade Civil-Trabalhista', subtopicos:[
      { id:'dtr13.1', nome:'Acidente de trabalho' },
      { id:'dtr13.2', nome:'Assédio' },
      { id:'dtr13.3', nome:'Dano material, moral e estético' },
      { id:'dtr13.4', nome:'Dano coletivo' },
    ]},
    { id:'dtr14', nome:'Prescrição e Decadência (Trabalho)', subtopicos:[
      { id:'dtr14.1', nome:'Prescrição e decadência' },
    ]},
    { id:'dtr15', nome:'Direito Coletivo do Trabalho', subtopicos:[
      { id:'dtr15.1', nome:'Conflitos coletivos' },
      { id:'dtr15.2', nome:'Acordos e convenções coletivas' },
      { id:'dtr15.3', nome:'Arbitragem e mediação' },
    ]},
    { id:'dtr16', nome:'Organização Sindical', subtopicos:[
      { id:'dtr16.1', nome:'Princípios e unicidade sindical' },
      { id:'dtr16.2', nome:'Receitas sindicais' },
      { id:'dtr16.3', nome:'Sindicalização dos servidores públicos' },
    ]},
    { id:'dtr17', nome:'Direito de Greve', subtopicos:[
      { id:'dtr17.1', nome:'Direito de greve' },
      { id:'dtr17.2', nome:'Greve do servidor público' },
    ]},
    { id:'dtr18', nome:'Direito Processual do Trabalho', subtopicos:[
      { id:'dtr18.1', nome:'Princípios e fontes' },
      { id:'dtr18.2', nome:'Interpretação e aplicação' },
    ]},
    { id:'dtr19', nome:'Organização da Justiça do Trabalho', subtopicos:[
      { id:'dtr19.1', nome:'Composição e funcionamento' },
      { id:'dtr19.2', nome:'Comissões de conciliação prévia' },
    ]},
    { id:'dtr20', nome:'Competência da Justiça do Trabalho', subtopicos:[
      { id:'dtr20.1', nome:'Competência material e territorial' },
      { id:'dtr20.2', nome:'Ações acidentárias e servidores públicos' },
    ]},
    { id:'dtr21', nome:'Dissídio Coletivo', subtopicos:[
      { id:'dtr21.1', nome:'Processo, procedimento e competência' },
      { id:'dtr21.2', nome:'Limites do poder normativo' },
      { id:'dtr21.3', nome:'Efeitos da sentença normativa' },
    ]},
    { id:'dtr22', nome:'Atos Processuais e Ritos', subtopicos:[
      { id:'dtr22.1', nome:'Reclamação e jus postulandi' },
      { id:'dtr22.2', nome:'Revelia, exceções, contestação e reconvenção' },
      { id:'dtr22.3', nome:'Audiência, conciliação e instrução' },
      { id:'dtr22.4', nome:'Despesas processuais e honorários advocatícios' },
    ]},
    { id:'dtr23', nome:'Provas (Trabalho)', subtopicos:[
      { id:'dtr23.1', nome:'Teoria geral e ônus probatório' },
      { id:'dtr23.2', nome:'Provas em espécie' },
    ]},
    { id:'dtr24', nome:'Invalidades Processuais', subtopicos:[
      { id:'dtr24.1', nome:'Invalidades processuais' },
    ]},
    { id:'dtr25', nome:'Tutelas Diferenciadas', subtopicos:[
      { id:'dtr25.1', nome:'Antecipação' },
      { id:'dtr25.2', nome:'Cautelares' },
    ]},
    { id:'dtr26', nome:'Liquidação de Sentença (Trabalho)', subtopicos:[
      { id:'dtr26.1', nome:'Liquidação de sentença' },
    ]},
    { id:'dtr27', nome:'Execução (Trabalho)', subtopicos:[
      { id:'dtr27.1', nome:'Espécies e procedimentos' },
      { id:'dtr27.2', nome:'Execução contra a Fazenda Pública' },
    ]},
    { id:'dtr28', nome:'Recursos (Trabalho)', subtopicos:[
      { id:'dtr28.1', nome:'Aspectos gerais e admissibilidade' },
      { id:'dtr28.2', nome:'Espécies' },
    ]},
    { id:'dtr29', nome:'Ação Rescisória (Trabalho)', subtopicos:[
      { id:'dtr29.1', nome:'Ação rescisória' },
    ]},
    { id:'dtr30', nome:'Ações Constitucionais (Trabalho)', subtopicos:[
      { id:'dtr30.1', nome:'Mandado de segurança' },
      { id:'dtr30.2', nome:'Ação civil pública e ações coletivas' },
      { id:'dtr30.3', nome:'Habeas corpus' },
    ]},
    { id:'dtr31', nome:'Ente Estatal na Justiça do Trabalho', subtopicos:[
      { id:'dtr31.1', nome:'Responsabilidade solidária e subsidiária' },
      { id:'dtr31.2', nome:'Prerrogativas da Fazenda Pública' },
    ]},
    { id:'dtr32', nome:'Ministério Público do Trabalho', subtopicos:[
      { id:'dtr32.1', nome:'Ministério Público do Trabalho' },
    ]},
    { id:'dtr33', nome:'Jurisprudência do TST', subtopicos:[
      { id:'dtr33.1', nome:'Súmulas, enunciados e orientações jurisprudenciais' },
    ]},
    { id:'dtr34', nome:'Precatórios (Trabalho)', subtopicos:[
      { id:'dtr34.1', nome:'Obrigações de pequeno valor' },
      { id:'dtr34.2', nome:'Lei Municipal nº 10.235/2001' },
    ]},
  ]},

  /* ═══ 9. DIREITO PREVIDENCIÁRIO ═══ */
  { id:'dpr', nome:'Direito Previdenciário', cor:'#ea580c', topicos:[
    { id:'dpr1', nome:'Previdência Social', subtopicos:[
      { id:'dpr1.1', nome:'Noção e fundamentos' },
      { id:'dpr1.2', nome:'Evolução histórica nas constituições' },
      { id:'dpr1.3', nome:'Modelos contributivos e não contributivos' },
      { id:'dpr1.4', nome:'Direitos sociais na CF/1988' },
      { id:'dpr1.5', nome:'Lei nº 8.212/1991 e Lei nº 8.213/1991' },
    ]},
    { id:'dpr2', nome:'Princípios do Direito Previdenciário', subtopicos:[
      { id:'dpr2.1', nome:'Fontes' },
      { id:'dpr2.2', nome:'Vigência e eficácia no tempo e no espaço' },
      { id:'dpr2.3', nome:'Competência legislativa' },
      { id:'dpr2.4', nome:'Prescrição em matéria previdenciária' },
      { id:'dpr2.5', nome:'Regimes geral, próprios e complementar' },
    ]},
    { id:'dpr3', nome:'Previdência dos Agentes Públicos', subtopicos:[
      { id:'dpr3.1', nome:'Servidores efetivos, estabilizados e empregados públicos' },
      { id:'dpr3.2', nome:'Temporários, comissionados e eletivos' },
      { id:'dpr3.3', nome:'Militares e integrantes dos Poderes e Tribunais' },
      { id:'dpr3.4', nome:'Notários e registradores' },
      { id:'dpr3.5', nome:'Servidores públicos e previdência complementar' },
    ]},
    { id:'dpr4', nome:'Disciplina Constitucional e Reformas', subtopicos:[
      { id:'dpr4.1', nome:'Direito adquirido e expectativa de direito' },
      { id:'dpr4.2', nome:'EC 20/1998, 41/2003, 47/2005 e 70/2012' },
      { id:'dpr4.3', nome:'Normas gerais dos RPPS (Lei 9.717/1998, Lei 10.887/2004, ON 02/2009)' },
      { id:'dpr4.4', nome:'Órgão gestor único e previdência complementar' },
    ]},
    { id:'dpr5', nome:'Regimes Próprios dos Servidores Efetivos', subtopicos:[
      { id:'dpr5.1', nome:'Regras constitucionais permanentes' },
      { id:'dpr5.2', nome:'Contributividade e solidariedade' },
      { id:'dpr5.3', nome:'Compulsoriedade' },
      { id:'dpr5.4', nome:'Aplicabilidade subsidiária do RGPS' },
      { id:'dpr5.5', nome:'Contagem de tempo e contagem recíproca' },
      { id:'dpr5.6', nome:'Correspondência entre benefício e custeio' },
      { id:'dpr5.7', nome:'Unidade de regime e fundos de previdência' },
    ]},
    { id:'dpr6', nome:'Custeio do Regime Próprio', subtopicos:[
      { id:'dpr6.1', nome:'Contribuição de ativos, inativos e pensionistas' },
      { id:'dpr6.2', nome:'Imunidade e isenção' },
      { id:'dpr6.3', nome:'Alíquotas e progressividade' },
      { id:'dpr6.4', nome:'Contribuição dos militares' },
      { id:'dpr6.5', nome:'Contribuição do ente público' },
    ]},
    { id:'dpr7', nome:'Benefícios do Regime Próprio', subtopicos:[
      { id:'dpr7.1', nome:'Paridade e integralidade' },
      { id:'dpr7.2', nome:'Aposentadorias: modalidades, critérios e cálculo' },
      { id:'dpr7.3', nome:'Aposentadorias especiais' },
      { id:'dpr7.4', nome:'Aposentadoria especial dos professores' },
      { id:'dpr7.5', nome:'Pensão: fato gerador, cálculo e beneficiários' },
      { id:'dpr7.6', nome:'Cumulação de aposentadorias e pensões' },
      { id:'dpr7.7', nome:'Teto, reajustamento e abono de permanência' },
    ]},
    { id:'dpr8', nome:'Regramento Previdenciário de Curitiba', subtopicos:[
      { id:'dpr8.1', nome:'Concessão de benefícios e contribuições' },
      { id:'dpr8.2', nome:'Contribuição patronal do Município' },
      { id:'dpr8.3', nome:'Leis Municipais 9.626/1999, 10.817/2003, 12.072/2006 e 15.042/2017' },
      { id:'dpr8.4', nome:'Decreto Municipal nº 953/2004' },
    ]},
    { id:'dpr9', nome:'Previdência Complementar', subtopicos:[
      { id:'dpr9.1', nome:'Lei nº 12.618/2012' },
      { id:'dpr9.2', nome:'CuritibaPrev — Lei nº 15.072/2017' },
    ]},
  ]},

]

export const PGM_CWB_TOTAL_DISCIPLINAS = PGM_CWB_DISCIPLINAS.length
export const PGM_CWB_TOTAL_TOPICOS     = PGM_CWB_DISCIPLINAS.reduce((a,d) => a + d.topicos.length, 0)
export const PGM_CWB_TOTAL_SUBTOPICOS  = PGM_CWB_DISCIPLINAS.reduce(
  (a,d) => a + d.topicos.reduce((b,t) => b + t.subtopicos.length, 0), 0
)
