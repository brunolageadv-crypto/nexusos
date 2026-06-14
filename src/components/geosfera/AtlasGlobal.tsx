import { useState, useEffect, useRef, useCallback } from 'react'

// ─── World base paths (Natural Earth 110m, public domain, simplified) ─────────
const WORLD_PATHS: {n:string;d:string}[] = [
  {n:'Afghanistan',d:'M670,151L709,147L678,168L669,167L670,151Z'},
  {n:'Angola',d:'M545,266L566,280L564,299L533,298L534,267L545,266Z'},
  {n:'Albania',d:'M557,134L556,140L557,134Z'},
  {n:'United Arab Emirates',d:'M643,183L656,179L653,188L643,183Z'},
  {n:'Argentina',d:'M318,403L309,396L318,403Z M320,311L340,320L337,325L351,325L340,334L342,353L319,364L311,395L300,394L304,337L320,311Z'},
  {n:'Armenia',d:'M621,136L629,142L621,136Z'},
  {n:'Antarctica',d:'M335,472L316,473L335,472Z M58,471L45,468L58,471Z M375,467L380,472L350,474L375,467Z M163,454L170,454L163,454Z M225,450L216,450L225,450Z M310,447L292,449L305,441L310,447Z M337,428L318,439L331,455L285,463L295,466L283,470L338,481L421,473L402,467L481,447L607,444L651,433L691,439L694,451L744,434L875,431L976,449L954,462L964,469L944,475L1000,485L0,485L102,486L73,482L64,475L93,473L60,464L97,459L309,453L313,436L337,428Z'},
  {n:'Australia',d:'M904,363L911,370L904,363Z M899,288L925,322L917,354L891,356L880,348L883,341L878,347L865,337L820,345L817,310L868,281L879,283L876,292L889,299L895,281L899,288Z'},
  {n:'Austria',d:'M547,116L526,119L547,116Z'},
  {n:'Azerbaijan',d:'M632,136L640,138L636,144L627,139L632,136Z'},
  {n:'Burundi',d:'M581,262L585,257L581,262Z'},
  {n:'Belgium',d:'M509,107L517,111L509,107Z'},
  {n:'Benin',d:'M507,233L502,221L508,216L507,233Z'},
  {n:'Burkina Faso',d:'M492,223L485,217L501,209L506,217L492,223Z'},
  {n:'Bangladesh',d:'M757,189L747,189L746,177L757,189Z'},
  {n:'Bulgaria',d:'M563,127L579,129L564,135L563,127Z'},
  {n:'Bosnia and Herzegovina',d:'M553,125L552,132L544,126L553,125Z'},
  {n:'Belarus',d:'M565,100L578,94L591,102L565,107L565,100Z'},
  {n:'Bolivia',d:'M325,311L312,314L307,280L319,277L338,295L339,305L325,311Z'},
  {n:'Brazil',d:'M340,334L351,323L339,311L338,295L319,277L304,281L294,271L306,262L306,245L318,248L320,239L333,235L336,246L357,238L360,250L404,270L386,311L368,319L352,344L340,334Z'},
  {n:'Bhutan',d:'M755,173L747,175L755,173Z'},
  {n:'Botswana',d:'M571,301L582,311L558,325L558,301L571,301Z'},
  {n:'Central African Republic',d:'M542,229L564,219L576,235L544,244L542,229Z'},
  {n:'Canada',d:'M328,114L321,111L328,114Z M157,115L143,109L157,115Z M344,109L353,120L335,118L344,109Z M131,100L136,105L131,100Z M273,76L267,77L273,76Z M263,68L277,73L258,73L263,68Z M234,58L223,57L234,58Z M248,57L257,63L270,57L274,64L237,86L271,97L278,108L287,93L285,76L312,88L321,82L345,102L302,120L319,113L321,122L332,119L318,129L310,118L270,134L271,124L255,116L158,114L124,84L108,82L108,56L233,63L236,50L248,57Z M183,47L219,57L177,58L188,55L168,51L183,47Z M210,46L203,46L210,46Z M288,47L275,46L288,47Z M260,47L328,64L311,66L316,78L284,72L297,62L254,54L249,49L260,47Z M221,45L231,51L215,49L221,45Z M241,48L233,46L241,48Z M165,52L150,50L153,44L173,44L165,52Z M240,42L231,42L240,42Z M226,37L215,40L226,37Z M199,38L173,41L199,38Z M237,36L278,42L237,36Z M177,34L159,39L177,34Z M239,35L232,34L239,35Z M194,34L185,34L194,34Z M195,32L187,32L195,32Z M234,33L226,31L234,33Z M222,32L207,30L222,32Z M258,29L231,27L258,29Z M310,19L328,21L276,38L251,38L264,35L259,27L273,26L246,23L310,19Z'},
  {n:'Switzerland',d:'M527,118L517,121L527,118Z'},
  {n:'Chile',d:'M309,396L311,404L293,397L309,396Z M311,310L296,387L310,395L302,400L292,395L290,380L298,368L305,301L311,310Z'},
  {n:'China',d:'M855,112L875,115L872,122L863,132L826,142L840,146L831,153L838,172L807,193L793,185L776,189L767,168L747,174L721,164L705,140L744,113L768,131L792,134L832,120L821,116L836,102L855,112Z'},
  {n:'Ivory Coast',d:'M492,236L479,238L477,222L492,223L492,236Z'},
  {n:'Cameroon',d:'M536,244L524,237L540,214L544,245L536,244Z'},
  {n:'Democratic Republic of the Congo',d:'M586,240L582,287L562,281L560,270L534,267L554,236L586,240Z'},
  {n:'Republic of the Congo',d:'M536,263L536,244L551,240L536,263Z'},
  {n:'Colombia',d:'M291,250L281,245L284,229L302,216L296,225L313,233L314,247L306,245L306,262L291,250Z'},
  {n:'Costa Rica',d:'M270,227L261,220L270,227Z'},
  {n:'Cuba',d:'M271,186L294,194L264,189L271,186Z'},
  {n:'Czech Republic',d:'M547,115L534,110L547,115Z'},
  {n:'Germany',d:'M528,97L540,102L536,118L517,113L528,97Z'},
  {n:'Djibouti',d:'M620,215L616,219L620,215Z'},
  {n:'Denmark',d:'M530,93L523,96L530,93Z'},
  {n:'Dominican Republic',d:'M301,195L310,198L301,195Z'},
  {n:'Algeria',d:'M533,185L509,197L476,170L496,160L497,151L523,147L533,185Z'},
  {n:'Ecuador',d:'M277,259L278,248L291,250L277,259Z'},
  {n:'Egypt',d:'M597,168L590,167L602,189L569,189L570,162L597,168Z'},
  {n:'Eritrea',d:'M618,215L601,210L602,203L618,215Z'},
  {n:'Spain',d:'M475,134L508,134L485,150L481,134L475,134Z'},
  {n:'Estonia',d:'M568,89L578,85L568,89Z'},
  {n:'Ethiopia',d:'M605,208L633,228L625,236L606,240L592,228L605,208Z'},
  {n:'Finland',d:'M579,58L586,77L559,81L571,69L557,58L579,58Z'},
  {n:'Falkland Islands',d:'M330,394L340,393L330,394Z'},
  {n:'France',d:'M354,243L350,234L354,243Z M510,110L522,114L521,129L496,130L487,115L510,110Z'},
  {n:'Gabon',d:'M531,261L525,252L536,244L540,256L531,261Z'},
  {n:'England',d:'M492,87L504,108L485,111L492,100L483,92L492,87Z'},
  {n:'Georgia',d:'M615,135L630,136L615,135Z'},
  {n:'Ghana',d:'M503,234L492,236L492,220L500,219L503,234Z'},
  {n:'Guinea',d:'M477,229L458,219L475,216L477,229Z'},
  {n:'Gambia',d:'M453,213L462,212L453,213Z'},
  {n:'Guinea Bissau',d:'M458,219L454,216L462,215L458,219Z'},
  {n:'Equatorial Guinea',d:'M526,247L531,244L526,247Z'},
  {n:'Greece',d:'M566,151L573,152L566,151Z M574,135L560,148L558,137L574,135Z'},
  {n:'Greenland',d:'M370,20L466,24L444,27L451,27L440,37L446,44L427,55L438,55L389,68L376,83L357,73L350,63L359,56L348,57L357,54L337,40L296,33L370,20Z'},
  {n:'Guatemala',d:'M250,212L244,208L252,201L250,212Z'},
  {n:'Guyana',d:'M334,227L343,245L334,245L334,227Z'},
  {n:'Honduras',d:'M257,214L255,206L269,208L257,214Z'},
  {n:'Croatia',d:'M552,122L544,126L551,132L538,125L552,122Z'},
  {n:'Haiti',d:'M297,195L301,200L297,195Z'},
  {n:'Hungary',d:'M545,120L563,117L545,120Z'},
  {n:'Indonesia',d:'M841,272L833,274L841,272Z M802,269L821,273L802,269Z M862,259L855,259L862,259Z M873,253L892,257L892,275L869,261L863,253L873,253Z M848,246L834,249L843,252L842,265L836,257L832,265L833,248L848,246Z M857,247L856,252L857,247Z M827,245L823,261L803,251L822,238L827,245Z M794,266L765,235L788,250L794,266Z'},
  {n:'India',d:'M716,151L731,174L771,173L757,189L746,177L747,190L723,206L715,228L702,191L689,184L709,160L705,155L716,151Z'},
  {n:'Ireland',d:'M483,100L472,106L483,100Z'},
  {n:'Iran',d:'M650,147L670,149L671,180L643,173L626,156L624,140L650,147Z'},
  {n:'Iraq',d:'M626,150L635,167L609,161L618,147L626,150Z'},
  {n:'Iceland',d:'M460,65L448,74L432,68L460,65Z'},
  {n:'Israel',d:'M599,159L597,168L599,159Z'},
  {n:'Italy',d:'M543,144L535,146L543,144Z M526,136L524,142L526,136Z M534,120L551,138L545,144L519,127L534,120Z'},
  {n:'Jordan',d:'M599,160L609,161L600,169L599,160Z'},
  {n:'Japan',d:'M874,155L868,158L874,155Z M892,147L862,163L890,136L892,147Z M900,127L889,135L894,123L900,127Z'},
  {n:'Kazakhstan',d:'M697,133L690,137L663,123L655,135L646,134L640,126L647,120L629,116L641,106L670,109L671,100L714,99L743,113L722,125L723,132L697,133Z'},
  {n:'Kenya',d:'M614,252L609,263L594,253L594,238L616,239L614,252Z'},
  {n:'Kyrgyzstan',d:'M697,133L723,132L699,141L693,140L703,136L697,133Z'},
  {n:'Cambodia',d:'M787,220L786,210L798,211L787,220Z'},
  {n:'South Korea',d:'M857,143L860,151L851,154L857,143Z'},
  {n:'Laos',d:'M792,210L789,199L781,201L782,188L798,206L792,210Z'},
  {n:'Liberia',d:'M479,238L472,227L479,238Z'},
  {n:'Libya',d:'M541,186L526,178L532,158L553,166L569,161L569,194L541,186Z'},
  {n:'Sri Lanka',d:'M727,229L723,233L723,223L727,229Z'},
  {n:'Lesotho',d:'M580,330L575,333L580,330Z'},
  {n:'Lithuania',d:'M563,99L558,94L574,96L563,99Z'},
  {n:'Latvia',d:'M558,94L578,94L558,94Z'},
  {n:'Morocco',d:'M486,151L496,160L453,190L486,151Z'},
  {n:'Moldova',d:'M574,116L583,121L574,116Z'},
  {n:'Madagascar',d:'M638,285L626,321L622,298L638,285Z'},
  {n:'Mexico',d:'M230,178L234,198L259,192L244,210L228,205L208,196L186,163L194,187L175,160L204,162L230,178Z'},
  {n:'Macedonia',d:'M557,134L564,135L557,134Z'},
  {n:'Mali',d:'M466,209L485,207L482,181L512,197L510,207L483,222L466,209Z'},
  {n:'Myanmar',d:'M777,194L774,222L770,203L762,205L756,190L772,171L777,194Z'},
  {n:'Mongolia',d:'M744,113L775,105L824,111L822,117L833,119L792,134L768,131L744,113Z'},
  {n:'Mozambique',d:'M596,282L612,279L613,291L589,324L591,296L584,291L597,297L596,282Z'},
  {n:'Mauritania',d:'M466,209L454,205L453,192L464,191L476,174L486,181L485,205L466,209Z'},
  {n:'Malawi',d:'M596,282L597,297L591,288L591,276L596,282Z'},
  {n:'Malaysia',d:'M781,233L790,246L781,233Z M829,238L805,246L824,231L829,238Z'},
  {n:'Namibia',d:'M545,329L533,298L570,299L558,301L555,329L545,329Z'},
  {n:'New Caledonia',d:'M960,309L956,306L960,309Z'},
  {n:'Niger',d:'M506,217L501,209L512,197L541,186L539,215L506,217Z'},
  {n:'Nigeria',d:'M524,237L507,233L511,212L537,212L524,237Z'},
  {n:'Nicaragua',d:'M262,219L256,214L269,208L262,219Z'},
  {n:'Netherlands',d:'M517,101L517,109L509,107L517,101Z'},
  {n:'Norway',d:'M578,52L586,57L550,60L531,87L516,87L514,78L541,62L578,52Z M569,34L558,34L569,34Z M551,29L560,31L544,37L529,29L551,29Z M571,27L548,27L571,27Z'},
  {n:'Nepal',d:'M745,173L722,170L745,173Z'},
  {n:'New Zealand',d:'M981,364L981,372L963,378L981,364Z M985,350L996,355L987,366L985,350Z'},
  {n:'Oman',d:'M664,191L648,204L655,181L664,191Z'},
  {n:'Pakistan',d:'M709,147L716,151L705,155L709,160L693,175L697,182L671,180L676,176L669,167L684,167L709,147Z'},
  {n:'Panama',d:'M284,230L270,224L284,230Z'},
  {n:'Peru',d:'M307,299L289,291L274,267L291,250L305,258L294,271L309,285L307,299Z'},
  {n:'Philippines',d:'M851,227L848,234L839,230L851,227Z M829,224L832,218L829,224Z M849,216L847,222L849,216Z M837,199L845,215L834,208L837,199Z'},
  {n:'Papua New Guinea',d:'M933,269L929,264L933,269Z M922,265L912,266L922,265Z M909,271L919,279L902,271L892,275L892,257L909,271Z M925,262L919,258L925,262Z'},
  {n:'Poland',d:'M542,108L539,101L549,98L565,99L567,109L542,108Z'},
  {n:'North Korea',d:'M863,132L846,144L863,132Z'},
  {n:'Portugal',d:'M475,134L482,135L478,148L475,134Z'},
  {n:'Paraguay',d:'M326,312L338,305L348,324L337,325L326,312Z'},
  {n:'Romania',d:'M563,117L582,125L564,128L556,122L563,117Z'},
  {n:'Russia',d:'M899,109L895,122L894,102L899,109Z M563,99L555,99L563,99Z M14,65L28,67L20,72L0,70L0,58L14,65Z M899,47L889,46L899,47Z M919,41L906,41L919,41Z M903,40L880,41L903,40Z M660,54L643,51L655,41L691,37L662,44L654,49L660,54Z M797,36L817,39L804,44L853,46L865,53L890,48L1000,58L1000,70L993,71L998,77L954,84L936,108L933,92L957,76L895,86L875,98L893,105L871,131L863,133L864,125L875,115L864,117L843,102L827,112L775,105L743,113L692,96L671,100L670,109L632,110L633,136L602,124L611,112L588,105L576,90L588,75L579,58L614,63L592,65L603,73L622,66L621,60L690,61L685,53L694,47L702,49L701,66L707,48L797,36Z M792,32L776,34L792,32Z M642,26L625,26L642,26Z M778,31L753,27L778,31Z'},
  {n:'Rwanda',d:'M584,253L581,258L584,253Z'},
  {n:'Western Sahara',d:'M476,175L464,191L453,192L476,175Z'},
  {n:'Saudi Arabia',d:'M619,205L596,172L603,162L634,171L655,189L619,205Z'},
  {n:'Sudan',d:'M594,224L591,216L565,225L569,189L602,189L607,200L594,224Z'},
  {n:'South Sudan',d:'M594,224L598,235L589,240L566,226L591,216L594,224Z'},
  {n:'Senegal',d:'M454,212L460,204L468,215L454,212Z'},
  {n:'Sierra Leone',d:'M468,231L467,222L468,231Z'},
  {n:'El Salvador',d:'M256,213L250,212L256,213Z'},
  {n:'Somaliland',d:'M636,224L618,221L636,224Z'},
  {n:'Somalia',d:'M638,218L635,235L616,255L614,242L638,218Z'},
  {n:'Republic of Serbia',d:'M558,124L562,132L553,129L558,124Z'},
  {n:'Suriname',d:'M341,233L350,234L349,244L341,233Z'},
  {n:'Slovakia',d:'M552,113L563,114L552,113Z'},
  {n:'Slovenia',d:'M538,121L546,121L538,121Z'},
  {n:'Sweden',d:'M562,67L536,96L535,72L556,58L565,61L562,67Z'},
  {n:'Syria',d:'M608,157L599,159L602,148L618,147L608,157Z'},
  {n:'Chad',d:'M540,214L541,186L566,196L558,224L542,229L540,214Z'},
  {n:'Togo',d:'M505,233L500,219L505,233Z'},
  {n:'Thailand',d:'M785,216L778,213L775,222L783,234L773,228L773,195L791,202L785,216Z'},
  {n:'Tajikistan',d:'M697,138L708,146L688,147L697,138Z'},
  {n:'Turkmenistan',d:'M670,151L650,147L646,134L663,131L685,145L670,151Z'},
  {n:'East Timor',d:'M847,275L854,273L847,275Z'},
  {n:'Tunisia',d:'M526,166L526,146L526,166Z'},
  {n:'Turkey',d:'M603,135L621,136L623,147L573,144L581,136L603,135Z'},
  {n:'Taiwan',d:'M838,182L835,189L838,182Z'},
  {n:'United Republic of Tanzania',d:'M594,253L609,263L610,280L596,282L582,268L584,253L594,253Z'},
  {n:'Uganda',d:'M589,253L582,254L586,240L594,238L589,253Z'},
  {n:'Ukraine',d:'M588,105L611,112L601,125L561,115L565,107L588,105Z'},
  {n:'Uruguay',d:'M340,334L351,346L338,344L340,334Z'},
  {n:'USA',d:'M237,113L266,121L270,134L312,119L314,126L288,141L290,151L274,163L276,180L266,166L237,168L229,178L204,162L175,160L154,138L159,114L237,113Z M23,73L31,74L23,73Z M69,52L108,56L108,82L139,96L104,83L79,86L82,80L42,99L64,86L41,82L53,70L33,68L51,66L37,60L69,52Z'},
  {n:'Uzbekistan',d:'M685,146L663,131L655,135L655,125L690,137L698,133L703,136L685,146Z'},
  {n:'Venezuela',d:'M302,217L301,225L306,216L328,220L332,236L316,248L313,233L296,225L302,217Z'},
  {n:'Vietnam',d:'M800,190L794,197L803,218L792,226L799,208L784,188L800,190Z'},
  {n:'Yemen',d:'M648,204L623,215L618,208L636,198L648,204Z'},
  {n:'South Africa',d:'M588,331L554,347L545,329L583,311L588,331Z'},
  {n:'Zambia',d:'M591,276L592,289L575,300L561,295L566,280L582,287L580,274L591,276Z'},
  {n:'Zimbabwe',d:'M587,312L570,299L591,296L587,312Z'},
]

// ─── Coordinate helpers ───────────────────────────────────────────────────────
function lx(lon: number) { return ((lon + 180) / 360) * 1000 }
function ly(lat: number) { return ((90 - lat) / 180) * 500 }

// ─── Country highlight shapes ─────────────────────────────────────────────────
const HIGHLIGHTS: Record<string,[number,number][]> = {
  CN: [[73,40],[80,50],[90,52],[100,52],[110,52],[120,52],[128,48],[134,46],[135,43],[130,32],[122,28],[118,22],[110,20],[100,22],[96,28],[90,28],[84,32],[78,36],[73,40]],
  IN: [[66,36],[74,34],[80,30],[88,26],[92,22],[88,10],[80,8],[76,8],[72,20],[68,22],[66,28],[66,36]],
  US: [[-124,48],[-116,49],[-104,49],[-97,49],[-87,47],[-83,45],[-76,44],[-72,41],[-70,42],[-67,44],[-67,47],[-74,40],[-77,35],[-80,32],[-81,25],[-82,24],[-88,30],[-90,29],[-97,26],[-100,28],[-104,29],[-107,32],[-111,31],[-117,32],[-120,34],[-122,37],[-124,40],[-124,48]],
  ID: [[96,6],[105,-6],[110,-8],[116,-8],[108,-8],[102,-2],[98,4],[96,6]],
  PK: [[60,36],[70,38],[76,36],[74,32],[70,28],[64,26],[60,24],[56,26],[60,30],[60,36]],
  BR: [[-73,-10],[-70,-4],[-68,-2],[-60,0],[-52,4],[-50,1],[-44,2],[-37,-5],[-35,-9],[-35,-12],[-38,-14],[-38,-18],[-40,-22],[-43,-23],[-48,-27],[-52,-33],[-53,-34],[-58,-28],[-58,-24],[-57,-20],[-58,-16],[-60,-14],[-62,-12],[-64,-12],[-66,-10],[-68,-12],[-70,-11],[-73,-10]],
  NG: [[2,14],[14,14],[14,6],[4,6],[2,8],[2,14]],
  BD: [[88,26],[92,26],[92,22],[88,22],[88,26]],
  RU: [[32,68],[55,68],[70,70],[90,74],[110,74],[130,70],[148,60],[136,46],[132,44],[128,48],[110,52],[90,54],[75,55],[55,58],[40,64],[32,68]],
  ET: [[33,15],[42,15],[44,12],[44,8],[38,4],[33,8],[33,15]],
  MX: [[-117,32],[-111,31],[-104,29],[-100,28],[-97,26],[-90,18],[-87,16],[-89,16],[-92,18],[-97,20],[-104,19],[-109,24],[-117,32]],
  JP: [[130,32],[136,34],[140,40],[142,44],[140,44],[138,36],[134,34],[130,32]],
  PH: [[118,18],[122,18],[124,12],[122,8],[118,10],[118,18]],
  EG: [[25,32],[35,32],[35,22],[25,22],[25,32]],
  CD: [[12,5],[30,5],[32,0],[30,-5],[28,-8],[24,-8],[18,-6],[12,-4],[12,0],[12,5]],
  VN: [[102,23],[106,22],[108,16],[108,10],[104,10],[102,12],[100,22],[102,23]],
  IR: [[44,38],[58,38],[62,26],[56,24],[50,24],[44,28],[44,38]],
  TR: [[26,42],[36,42],[44,40],[48,38],[44,36],[36,36],[28,37],[26,40],[26,42]],
  DE: [[6,55],[15,55],[15,47],[6,47],[6,55]],
  TH: [[98,20],[102,18],[104,14],[100,6],[98,8],[98,16],[98,20]],
  GB: [[-6,58],[0,58],[2,52],[1,51],[-2,50],[-5,50],[-5,52],[-3,54],[-2,56],[-4,56],[-6,58]],
  FR: [[-5,51],[8,51],[8,43],[-2,43],[-5,47],[-5,51]],
  TZ: [[30,-1],[40,-1],[40,-12],[36,-12],[30,-8],[30,-1]],
  ZA: [[17,-22],[32,-22],[32,-26],[30,-30],[28,-34],[26,-34],[18,-34],[17,-30],[17,-22]],
  MM: [[92,28],[100,26],[100,16],[98,14],[94,16],[92,20],[92,28]],
  KR: [[126,38],[130,38],[130,34],[126,34],[126,38]],
  CO: [[-78,10],[-72,12],[-67,6],[-67,2],[-70,0],[-78,-2],[-78,4],[-78,10]],
  KE: [[34,4],[42,4],[42,-2],[38,-4],[34,-2],[34,4]],
  ES: [[-9,44],[4,44],[3,40],[0,38],[-2,37],[-7,38],[-9,38],[-9,44]],
  AR: [[-73,-22],[-58,-22],[-53,-33],[-57,-38],[-62,-38],[-65,-40],[-68,-44],[-71,-52],[-68,-54],[-65,-55],[-60,-51],[-58,-36],[-62,-28],[-65,-22],[-68,-21],[-73,-22]],
  UG: [[30,4],[34,4],[34,0],[30,0],[30,4]],
  UA: [[22,52],[38,52],[40,46],[36,46],[32,46],[28,48],[24,48],[22,50],[22,52]],
  IQ: [[38,38],[48,38],[48,30],[44,28],[38,30],[38,38]],
  CA: [[-140,60],[-100,60],[-80,62],[-60,48],[-52,46],[-55,50],[-60,55],[-64,60],[-68,63],[-75,63],[-80,62],[-85,55],[-90,60],[-100,58],[-120,58],[-130,55],[-135,58],[-140,60]],
  PE: [[-82,-2],[-68,0],[-68,-18],[-72,-14],[-75,-8],[-82,-2]],
  VE: [[-73,11],[-60,9],[-60,4],[-67,2],[-72,5],[-73,9],[-73,11]],
  MA: [[-6,36],[0,36],[0,28],[-14,28],[-14,32],[-6,36]],
  SA: [[36,30],[50,28],[56,22],[50,12],[42,12],[38,18],[36,24],[36,30]],
  MY: [[100,6],[116,6],[116,2],[100,2],[100,6]],
  GH: [[-3,11],[1,11],[1,5],[-3,5],[-3,11]],
  MZ: [[32,-10],[40,-12],[38,-18],[36,-24],[34,-26],[32,-24],[32,-10]],
  AU: [[114,-22],[150,-24],[154,-38],[144,-38],[136,-36],[114,-28],[114,-22]],
  NP: [[80,30],[88,30],[88,26],[80,26],[80,30]],
  IT: [[7,44],[16,40],[16,38],[12,36],[8,40],[7,44]],
  PL: [[14,54],[24,54],[24,49],[14,49],[14,54]],
  MG: [[44,-12],[50,-14],[50,-26],[46,-26],[44,-22],[44,-12]],
  CM: [[8,12],[16,12],[16,4],[8,4],[8,12]],
  KP: [[124,42],[130,42],[130,38],[126,38],[124,40],[124,42]],
  CI: [[-8,10],[0,10],[0,4],[-8,4],[-8,10]],
}

interface Country {
  id:string; name:string; capital:string; continent:string
  population:number; area:number; language:string; currency:string
  utcOffset:number; flag:string; capLat:number; capLon:number
}

const COUNTRIES: Country[] = [
  {id:'CN',name:'China',capital:'Pequim',continent:'Ásia',population:1412,area:9597,language:'Mandarim',currency:'Yuan (¥)',utcOffset:8,flag:'🇨🇳',capLat:39.9,capLon:116.4},
  {id:'IN',name:'Índia',capital:'Nova Delhi',continent:'Ásia',population:1408,area:3287,language:'Hindi/Inglês',currency:'Rúpia (₹)',utcOffset:5.5,flag:'🇮🇳',capLat:28.6,capLon:77.2},
  {id:'US',name:'EUA',capital:'Washington D.C.',continent:'América do Norte',population:334,area:9834,language:'Inglês',currency:'Dólar ($)',utcOffset:-5,flag:'🇺🇸',capLat:38.9,capLon:-77.0},
  {id:'ID',name:'Indonésia',capital:'Jacarta',continent:'Ásia',population:277,area:1905,language:'Indonésio',currency:'Rúpia (Rp)',utcOffset:7,flag:'🇮🇩',capLat:-6.2,capLon:106.8},
  {id:'PK',name:'Paquistão',capital:'Islamabad',continent:'Ásia',population:231,area:881,language:'Urdu',currency:'Rúpia Paquistanesa',utcOffset:5,flag:'🇵🇰',capLat:33.7,capLon:73.1},
  {id:'BR',name:'Brasil',capital:'Brasília',continent:'América do Sul',population:215,area:8516,language:'Português',currency:'Real (R$)',utcOffset:-3,flag:'🇧🇷',capLat:-15.8,capLon:-47.9},
  {id:'NG',name:'Nigéria',capital:'Abuja',continent:'África',population:218,area:924,language:'Inglês',currency:'Naira (₦)',utcOffset:1,flag:'🇳🇬',capLat:9.1,capLon:7.2},
  {id:'BD',name:'Bangladesh',capital:'Dhaka',continent:'Ásia',population:170,area:148,language:'Bengalês',currency:'Taka (৳)',utcOffset:6,flag:'🇧🇩',capLat:23.7,capLon:90.4},
  {id:'RU',name:'Rússia',capital:'Moscou',continent:'Europa/Ásia',population:145,area:17098,language:'Russo',currency:'Rublo (₽)',utcOffset:3,flag:'🇷🇺',capLat:55.8,capLon:37.6},
  {id:'ET',name:'Etiópia',capital:'Adis Abeba',continent:'África',population:123,area:1104,language:'Amárico',currency:'Birr',utcOffset:3,flag:'🇪🇹',capLat:9.0,capLon:38.7},
  {id:'MX',name:'México',capital:'Cidade do México',continent:'América do Norte',population:129,area:1964,language:'Espanhol',currency:'Peso (MXN)',utcOffset:-6,flag:'🇲🇽',capLat:19.4,capLon:-99.1},
  {id:'JP',name:'Japão',capital:'Tóquio',continent:'Ásia',population:125,area:378,language:'Japonês',currency:'Iene (¥)',utcOffset:9,flag:'🇯🇵',capLat:35.7,capLon:139.7},
  {id:'PH',name:'Filipinas',capital:'Manila',continent:'Ásia',population:115,area:300,language:'Filipino/Inglês',currency:'Peso Filipino',utcOffset:8,flag:'🇵🇭',capLat:14.6,capLon:120.9},
  {id:'EG',name:'Egito',capital:'Cairo',continent:'África',population:106,area:1002,language:'Árabe',currency:'Libra Egípcia',utcOffset:2,flag:'🇪🇬',capLat:30.0,capLon:31.2},
  {id:'CD',name:'Congo',capital:'Kinshasa',continent:'África',population:102,area:2345,language:'Francês',currency:'Franco Congolês',utcOffset:1,flag:'🇨🇩',capLat:-4.3,capLon:15.3},
  {id:'VN',name:'Vietnã',capital:'Hanói',continent:'Ásia',population:98,area:331,language:'Vietnamita',currency:'Dong (₫)',utcOffset:7,flag:'🇻🇳',capLat:21.0,capLon:105.8},
  {id:'IR',name:'Irã',capital:'Teerã',continent:'Ásia',population:87,area:1745,language:'Persa',currency:'Rial Iraniano',utcOffset:3.5,flag:'🇮🇷',capLat:35.7,capLon:51.4},
  {id:'TR',name:'Turquia',capital:'Ancara',continent:'Europa/Ásia',population:85,area:785,language:'Turco',currency:'Lira (₺)',utcOffset:3,flag:'🇹🇷',capLat:39.9,capLon:32.9},
  {id:'DE',name:'Alemanha',capital:'Berlim',continent:'Europa',population:83,area:358,language:'Alemão',currency:'Euro (€)',utcOffset:1,flag:'🇩🇪',capLat:52.5,capLon:13.4},
  {id:'TH',name:'Tailândia',capital:'Bangcoc',continent:'Ásia',population:72,area:513,language:'Tailandês',currency:'Baht (฿)',utcOffset:7,flag:'🇹🇭',capLat:13.8,capLon:100.5},
  {id:'GB',name:'Reino Unido',capital:'Londres',continent:'Europa',population:68,area:242,language:'Inglês',currency:'Libra (£)',utcOffset:0,flag:'🇬🇧',capLat:51.5,capLon:-0.1},
  {id:'FR',name:'França',capital:'Paris',continent:'Europa',population:68,area:551,language:'Francês',currency:'Euro (€)',utcOffset:1,flag:'🇫🇷',capLat:48.9,capLon:2.3},
  {id:'TZ',name:'Tanzânia',capital:'Dodoma',continent:'África',population:65,area:945,language:'Suaíle',currency:'Shilling Tanzaniano',utcOffset:3,flag:'🇹🇿',capLat:-6.2,capLon:35.7},
  {id:'ZA',name:'África do Sul',capital:'Pretória',continent:'África',population:60,area:1219,language:'11 idiomas',currency:'Rand (R)',utcOffset:2,flag:'🇿🇦',capLat:-25.7,capLon:28.2},
  {id:'MM',name:'Mianmar',capital:'Naypyidaw',continent:'Ásia',population:55,area:677,language:'Birmanês',currency:'Kyat (K)',utcOffset:6.5,flag:'🇲🇲',capLat:19.7,capLon:96.1},
  {id:'KR',name:'Coreia do Sul',capital:'Seul',continent:'Ásia',population:52,area:100,language:'Coreano',currency:'Won (₩)',utcOffset:9,flag:'🇰🇷',capLat:37.6,capLon:126.9},
  {id:'CO',name:'Colômbia',capital:'Bogotá',continent:'América do Sul',population:52,area:1142,language:'Espanhol',currency:'Peso Colombiano',utcOffset:-5,flag:'🇨🇴',capLat:4.7,capLon:-74.1},
  {id:'KE',name:'Quênia',capital:'Nairóbi',continent:'África',population:55,area:580,language:'Suaíle/Inglês',currency:'Shilling Queniano',utcOffset:3,flag:'🇰🇪',capLat:-1.3,capLon:36.8},
  {id:'ES',name:'Espanha',capital:'Madri',continent:'Europa',population:47,area:506,language:'Espanhol',currency:'Euro (€)',utcOffset:1,flag:'🇪🇸',capLat:40.4,capLon:-3.7},
  {id:'AR',name:'Argentina',capital:'Buenos Aires',continent:'América do Sul',population:46,area:2780,language:'Espanhol',currency:'Peso Argentino',utcOffset:-3,flag:'🇦🇷',capLat:-34.6,capLon:-58.4},
  {id:'UG',name:'Uganda',capital:'Kampala',continent:'África',population:48,area:241,language:'Inglês/Suaíle',currency:'Shilling Ugandês',utcOffset:3,flag:'🇺🇬',capLat:0.3,capLon:32.6},
  {id:'UA',name:'Ucrânia',capital:'Kiev',continent:'Europa',population:44,area:604,language:'Ucraniano',currency:'Hryvnia (₴)',utcOffset:2,flag:'🇺🇦',capLat:50.4,capLon:30.5},
  {id:'IQ',name:'Iraque',capital:'Bagdá',continent:'Ásia',population:42,area:438,language:'Árabe/Curdo',currency:'Dinar Iraquiano',utcOffset:3,flag:'🇮🇶',capLat:33.3,capLon:44.4},
  {id:'CA',name:'Canadá',capital:'Ottawa',continent:'América do Norte',population:38,area:9985,language:'Inglês/Francês',currency:'Dólar Canadense',utcOffset:-5,flag:'🇨🇦',capLat:45.4,capLon:-75.7},
  {id:'PE',name:'Peru',capital:'Lima',continent:'América do Sul',population:33,area:1285,language:'Espanhol',currency:'Sol Peruano',utcOffset:-5,flag:'🇵🇪',capLat:-12.1,capLon:-77.0},
  {id:'VE',name:'Venezuela',capital:'Caracas',continent:'América do Sul',population:30,area:912,language:'Espanhol',currency:'Bolívar',utcOffset:-4,flag:'🇻🇪',capLat:10.5,capLon:-66.9},
  {id:'MA',name:'Marrocos',capital:'Rabat',continent:'África',population:37,area:447,language:'Árabe/Berbere',currency:'Dirham',utcOffset:1,flag:'🇲🇦',capLat:34.0,capLon:-6.8},
  {id:'SA',name:'Arábia Saudita',capital:'Riade',continent:'Ásia',population:35,area:2150,language:'Árabe',currency:'Riyal (SR)',utcOffset:3,flag:'🇸🇦',capLat:24.7,capLon:46.7},
  {id:'MY',name:'Malásia',capital:'Kuala Lumpur',continent:'Ásia',population:33,area:330,language:'Malaio',currency:'Ringgit (RM)',utcOffset:8,flag:'🇲🇾',capLat:3.2,capLon:101.7},
  {id:'GH',name:'Gana',capital:'Acra',continent:'África',population:33,area:239,language:'Inglês',currency:'Cedi Ganês',utcOffset:0,flag:'🇬🇭',capLat:5.6,capLon:-0.2},
  {id:'MZ',name:'Moçambique',capital:'Maputo',continent:'África',population:32,area:802,language:'Português',currency:'Metical (MT)',utcOffset:2,flag:'🇲🇿',capLat:-25.9,capLon:32.6},
  {id:'AU',name:'Austrália',capital:'Camberra',continent:'Oceania',population:26,area:7692,language:'Inglês',currency:'Dólar Australiano',utcOffset:10,flag:'🇦🇺',capLat:-35.3,capLon:149.1},
  {id:'NP',name:'Nepal',capital:'Katmandu',continent:'Ásia',population:30,area:147,language:'Nepalês',currency:'Rúpia Nepalesa',utcOffset:5.75,flag:'🇳🇵',capLat:27.7,capLon:85.3},
  {id:'IT',name:'Itália',capital:'Roma',continent:'Europa',population:60,area:301,language:'Italiano',currency:'Euro (€)',utcOffset:1,flag:'🇮🇹',capLat:41.9,capLon:12.5},
  {id:'PL',name:'Polônia',capital:'Varsóvia',continent:'Europa',population:38,area:313,language:'Polonês',currency:'Zloty (zł)',utcOffset:1,flag:'🇵🇱',capLat:52.2,capLon:21.0},
  {id:'MG',name:'Madagascar',capital:'Antananarivo',continent:'África',population:28,area:587,language:'Malgaxe/Francês',currency:'Ariary (Ar)',utcOffset:3,flag:'🇲🇬',capLat:-18.9,capLon:47.5},
  {id:'CM',name:'Camarões',capital:'Yaoundé',continent:'África',population:27,area:475,language:'Francês/Inglês',currency:'Franco CFA',utcOffset:1,flag:'🇨🇲',capLat:3.9,capLon:11.5},
  {id:'KP',name:'Coreia do Norte',capital:'Pyongyang',continent:'Ásia',population:26,area:121,language:'Coreano',currency:'Won (₩)',utcOffset:9,flag:'🇰🇵',capLat:39.0,capLon:125.8},
  {id:'CI',name:'Costa do Marfim',capital:'Yamoussoukro',continent:'África',population:27,area:322,language:'Francês',currency:'Franco CFA',utcOffset:0,flag:'🇨🇮',capLat:6.8,capLon:-5.3},
]

const CONT_COLOR: Record<string,string> = {
  'Ásia':'#f97316','América do Norte':'#3b82f6','América do Sul':'#22c55e',
  'Europa':'#8b5cf6','África':'#eab308','Europa/Ásia':'#ec4899','Oceania':'#06b6d4'
}

type LayerType = 'countries'|'daynight'|'timezones'|'seasons'|'capitals'

function getLocalTime(utcOffset: number): string {
  const now = new Date()
  const utc = now.getTime() + now.getTimezoneOffset() * 60000
  return new Date(utc + utcOffset * 3600000).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})
}
function getSunLon(date: Date): number {
  const h = date.getUTCHours() + date.getUTCMinutes()/60 + date.getUTCSeconds()/3600
  return ((180 - h * 15) + 360) % 360 - 180
}

export default function AtlasGlobal() {
  const [now, setNow] = useState(new Date())
  const [layer, setLayer] = useState<LayerType>('countries')
  const [hovered, setHovered] = useState<Country|null>(null)
  const [selected, setSelected] = useState<Country|null>(null)
  const [hoveredCap, setHoveredCap] = useState<Country|null>(null)
  const [mouse, setMouse] = useState({x:0,y:0})
  const [showGrid, setShowGrid] = useState(true)
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => { const i = setInterval(()=>setNow(new Date()),1000); return ()=>clearInterval(i) },[])

  const sunLon = getSunLon(now)
  const sunX = lx(sunLon)
  const m=now.getMonth()+1, dy=now.getDate()
  const isSummerNorth=(m===6&&dy>=21)||(m===7||m===8)||(m===9&&dy<23)
  const northSeason=isSummerNorth?'☀️ Verão':((m===12&&dy>=21)||(m<=3&&!(m===3&&dy>20)))?'❄️ Inverno':((m>=3&&m<=6&&!(m===6&&dy>20)))?'🌸 Primavera':'🍂 Outono'
  const southSeason=isSummerNorth?'❄️ Inverno':((m===12&&dy>=21)||(m<=3&&!(m===3&&dy>20)))?'☀️ Verão':((m>=3&&m<=6&&!(m===6&&dy>20)))?'🍂 Outono':'🌸 Primavera'

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const r = svgRef.current?.getBoundingClientRect()
    if (r) setMouse({x:e.clientX-r.left, y:e.clientY-r.top})
  },[])

  function getHighlightColor(c: Country): string {
    if (layer==='timezones') { const h=((c.utcOffset+12)/24)*300; return `hsl(${h},75%,42%)` }
    if (layer==='seasons') { const n=c.capLat>0?northSeason:southSeason; return n.includes('Verão')?'#f97316':n.includes('Inverno')?'#3b82f6':n.includes('Primavera')?'#22c55e':'#d97706' }
    return CONT_COLOR[c.continent]||'#6366f1'
  }

  const LAYERS: {id:LayerType;icon:string;label:string}[] = [
    {id:'countries',icon:'🌍',label:'Países'},
    {id:'daynight',icon:'🌞',label:'Dia/Noite'},
    {id:'timezones',icon:'🕐',label:'Fusos'},
    {id:'seasons',icon:'🌸',label:'Estações'},
    {id:'capitals',icon:'🏛️',label:'Capitais'},
  ]

  const tipX = Math.min(mouse.x+14, 740)
  const tipY = Math.max(mouse.y-20, 8)

  return (
    <div style={{display:'flex',flexDirection:'column',gap:10,height:'100%'}}>

      <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
        <span style={{fontSize:'0.58rem',color:'var(--text-muted)',fontFamily:'var(--font-mono)',textTransform:'uppercase',letterSpacing:'0.1em',marginRight:2}}>Camada:</span>
        {LAYERS.map(l=>(
          <button key={l.id} onClick={()=>{setLayer(l.id);setSelected(null)}}
            style={{padding:'5px 12px',borderRadius:20,border:`1px solid ${layer===l.id?'rgba(96,165,250,0.6)':'var(--border)'}`,background:layer===l.id?'rgba(96,165,250,0.12)':'transparent',color:layer===l.id?'#60a5fa':'var(--text-muted)',fontSize:'0.7rem',fontWeight:layer===l.id?700:400,cursor:'pointer',display:'flex',alignItems:'center',gap:4,transition:'all 0.15s'}}>
            {l.icon} {l.label}
          </button>
        ))}
        <button onClick={()=>setShowGrid(g=>!g)} style={{marginLeft:'auto',padding:'5px 10px',borderRadius:20,border:`1px solid ${showGrid?'rgba(52,211,153,0.4)':'var(--border)'}`,background:showGrid?'rgba(52,211,153,0.08)':'transparent',color:showGrid?'#34d399':'var(--text-muted)',fontSize:'0.68rem',cursor:'pointer'}}>⊞ Grade</button>
      </div>

      <div style={{display:'flex',gap:14,flex:1,minHeight:0}}>
        <div style={{flex:1,position:'relative',borderRadius:14,overflow:'hidden',border:'1px solid var(--border)',background:'#4a9ece'}}>
          <svg ref={svgRef} viewBox="0 0 1000 500" preserveAspectRatio="xMidYMid meet"
            style={{width:'100%',height:'100%',display:'block',cursor:'crosshair'}}
            onMouseMove={onMouseMove}
            onMouseLeave={()=>{setHovered(null);setHoveredCap(null)}}>

            <defs>
              <linearGradient id="ocean" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#5ba3d0"/>
                <stop offset="40%" stopColor="#4a8eba"/>
                <stop offset="100%" stopColor="#3a7aa8"/>
              </linearGradient>
            </defs>

            {/* Ocean background — classic blue */}
            <rect width="1000" height="500" fill="url(#ocean)"/>

            {/* Grid lines */}
            {showGrid && <>
              {[-60,-30,0,30,60].map(la=>(
                <line key={la} x1={0} y1={ly(la)} x2={1000} y2={ly(la)}
                  stroke={la===0?'rgba(255,255,255,0.5)':'rgba(255,255,255,0.2)'}
                  strokeWidth={la===0?1.2:0.5} strokeDasharray={la===0?'':'4,4'}/>
              ))}
              {[-120,-60,0,60,120].map(lo=>(
                <line key={lo} x1={lx(lo)} y1={0} x2={lx(lo)} y2={500} stroke="rgba(255,255,255,0.15)" strokeWidth={0.4} strokeDasharray="4,4"/>
              ))}
              <text x={lx(0)+2} y={ly(0)-3} fill="rgba(255,255,255,0.6)" fontSize={6.5}>Equador</text>
              <text x={lx(2)} y={ly(23.5)-3} fill="rgba(255,255,255,0.4)" fontSize={5.5}>Trópico de Câncer</text>
              <text x={lx(2)} y={ly(-23.5)+9} fill="rgba(255,255,255,0.4)" fontSize={5.5}>Trópico de Capricórnio</text>
            </>}

            {/* World base map — all 157 countries in classic green/tan */}
            {WORLD_PATHS.map((wp,i)=>(
              <path key={i} d={wp.d}
                fill="#c8d8a0" stroke="#8aa870" strokeWidth={0.5} strokeLinejoin="round"/>
            ))}

            {/* Night overlay */}
            {layer!=='seasons' && <>
              <rect width={sunX} height={500} fill="rgba(0,0,20,0.45)"/>
              <line x1={sunX} y1={0} x2={sunX} y2={500} stroke="rgba(255,210,60,0.3)" strokeWidth={2}/>
            </>}
            {layer==='daynight' && (
              <g transform={`translate(${sunX},${ly(0)})`}>
                <circle r={14} fill="rgba(255,220,50,0.15)" stroke="rgba(255,220,50,0.4)" strokeWidth={1.5}/>
                <circle r={7} fill="rgba(255,220,50,0.85)"/>
                <text x={0} y={4} textAnchor="middle" fontSize={9} fill="#fff">☀</text>
              </g>
            )}

            {/* 50 countries highlight overlays */}
            {COUNTRIES.map(c=>{
              const shape = HIGHLIGHTS[c.id]
              if (!shape) return null
              const isH = hovered?.id===c.id
              const isSel = selected?.id===c.id
              const col = isSel?'#fbbf24':isH?'#fff':getHighlightColor(c)
              const op = isSel?0.88:isH?0.82:0.0
              return (
                <polygon key={c.id}
                  points={shape.map(([lo,la])=>`${lx(lo).toFixed(1)},${ly(la).toFixed(1)}`).join(' ')}
                  fill={col} fillOpacity={op}
                  stroke={isH||isSel?'rgba(255,255,255,0.95)':'transparent'}
                  strokeWidth={isH||isSel?1.5:0} strokeLinejoin="round"
                  style={{cursor:'pointer'}}
                  onMouseEnter={()=>setHovered(c)}
                  onMouseLeave={()=>setHovered(null)}
                  onClick={()=>setSelected(c===selected?null:c)}/>
              )
            })}

            {/* Invisible hover targets for all 50 countries (even when opacity=0) */}
            {COUNTRIES.map(c=>{
              const shape = HIGHLIGHTS[c.id]
              if (!shape) return null
              return (
                <polygon key={c.id+'_hit'}
                  points={shape.map(([lo,la])=>`${lx(lo).toFixed(1)},${ly(la).toFixed(1)}`).join(' ')}
                  fill="transparent" stroke="none"
                  style={{cursor:'pointer'}}
                  onMouseEnter={()=>setHovered(c)}
                  onMouseLeave={()=>setHovered(null)}
                  onClick={()=>setSelected(c===selected?null:c)}/>
              )
            })}

            {/* Season labels */}
            {layer==='seasons' && <>
              <rect x={330} y={6} width={340} height={22} rx={5} fill="rgba(0,0,0,0.45)"/>
              <text x={500} y={21} textAnchor="middle" fill="rgba(255,255,255,0.9)" fontSize={10} fontWeight="bold">Norte: {northSeason}  ·  Sul: {southSeason}</text>
              <line x1={0} y1={ly(0)} x2={1000} y2={ly(0)} stroke="rgba(255,255,255,0.25)" strokeWidth={1} strokeDasharray="6,4"/>
            </>}

            {/* Capitals */}
            {(layer==='capitals'||layer==='timezones') && COUNTRIES.map(c=>{
              const isH = hoveredCap?.id===c.id
              return (
                <g key={c.id+'_cap'} transform={`translate(${lx(c.capLon)},${ly(c.capLat)})`}
                  style={{cursor:'pointer'}}
                  onMouseEnter={()=>setHoveredCap(c)}
                  onMouseLeave={()=>setHoveredCap(null)}
                  onClick={()=>setSelected(c)}>
                  <circle r={isH?7:3.5}
                    fill={isH?'#fbbf24':'rgba(30,30,60,0.85)'}
                    stroke={isH?'#f59e0b':'rgba(255,255,255,0.7)'} strokeWidth={isH?1.5:1}
                    style={{transition:'all 0.12s'}}/>
                  {isH&&<text x={8} y={-4} fontSize={7.5} fill="#1a1a2e" fontWeight="bold"
                    stroke="rgba(255,255,255,0.8)" strokeWidth={2} paintOrder="stroke"
                    ><tspan>{c.capital}</tspan></text>}
                </g>
              )
            })}

          </svg>

          {/* Tooltip capital */}
          {hoveredCap && (
            <div style={{position:'absolute',left:tipX,top:tipY,minWidth:190,padding:'10px 13px',borderRadius:11,background:'rgba(20,30,50,0.97)',border:'1px solid rgba(251,191,36,0.45)',backdropFilter:'blur(8px)',zIndex:20,pointerEvents:'none'}}>
              <div style={{fontWeight:800,fontSize:'0.82rem',color:'#fbbf24',marginBottom:5}}>{hoveredCap.flag} {hoveredCap.capital}</div>
              <div style={{fontFamily:'monospace',fontSize:'1rem',fontWeight:900,color:'#34d399',marginBottom:3}}>{getLocalTime(hoveredCap.utcOffset)}</div>
              <div style={{fontSize:'0.62rem',color:'rgba(255,255,255,0.55)'}}>UTC{hoveredCap.utcOffset>=0?'+':''}{hoveredCap.utcOffset} · {hoveredCap.name}</div>
              <div style={{fontSize:'0.6rem',color:'rgba(255,255,255,0.35)',marginTop:1}}>{hoveredCap.utcOffset-(-3)>=0?'+':''}{hoveredCap.utcOffset-(-3)}h vs Brasília</div>
            </div>
          )}

          {/* Tooltip country */}
          {hovered && !hoveredCap && (
            <div style={{position:'absolute',left:tipX,top:tipY,padding:'8px 12px',borderRadius:10,background:'rgba(20,30,50,0.95)',border:`1px solid ${CONT_COLOR[hovered.continent]||'#60a5fa'}66`,backdropFilter:'blur(6px)',zIndex:20,pointerEvents:'none'}}>
              <div style={{fontWeight:700,fontSize:'0.8rem',color:'#fff'}}>{hovered.flag} {hovered.name}</div>
              <div style={{fontSize:'0.62rem',color:'rgba(255,255,255,0.5)',marginTop:2}}>{hovered.capital} · {hovered.continent}</div>
              {layer==='timezones'&&<div style={{fontFamily:'monospace',color:'#34d399',fontSize:'0.72rem',marginTop:2}}>{getLocalTime(hovered.utcOffset)} · UTC{hovered.utcOffset>=0?'+':''}{hovered.utcOffset}</div>}
              <div style={{fontSize:'0.58rem',color:'rgba(255,255,255,0.3)',marginTop:2}}>Clique para detalhes</div>
            </div>
          )}
        </div>

        {/* Side panel */}
        <div style={{width:244,display:'flex',flexDirection:'column',gap:10,overflowY:'auto',flexShrink:0}}>
          {selected ? (
            <div style={{borderRadius:13,border:'1px solid rgba(96,165,250,0.3)',background:'var(--card-bg)',overflow:'hidden'}}>
              <div style={{padding:'14px 15px',background:`linear-gradient(135deg,${CONT_COLOR[selected.continent]||'#6366f1'}18,transparent)`,borderBottom:'1px solid var(--border)'}}>
                <div style={{fontSize:'2.2rem',marginBottom:4}}>{selected.flag}</div>
                <div style={{fontWeight:900,fontSize:'1.05rem',color:'var(--text-primary)'}}> {selected.name}</div>
                <div style={{fontSize:'0.65rem',color:'var(--text-muted)',marginTop:1}}>{selected.continent}</div>
              </div>
              <div style={{padding:'12px 15px',display:'flex',flexDirection:'column',gap:7}}>
                {[
                  {l:'🏛️ Capital',v:selected.capital},
                  {l:'👥 População',v:`${selected.population}M hab.`},
                  {l:'📐 Área',v:`${selected.area.toLocaleString('pt-BR')} km²`},
                  {l:'🗣️ Idioma',v:selected.language},
                  {l:'💰 Moeda',v:selected.currency},
                  {l:'🕐 Fuso',v:`UTC${selected.utcOffset>=0?'+':''}${selected.utcOffset}`},
                  {l:'⏰ Hora local',v:getLocalTime(selected.utcOffset)},
                  {l:'↔️ vs Brasília',v:`${selected.utcOffset-(-3)>=0?'+':''}${selected.utcOffset-(-3)}h`},
                ].map(it=>(
                  <div key={it.l} style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',fontSize:'0.7rem',gap:6}}>
                    <span style={{color:'var(--text-muted)',flexShrink:0}}>{it.l}</span>
                    <span style={{fontWeight:700,color:'var(--text-primary)',textAlign:'right'}}>{it.v}</span>
                  </div>
                ))}
                <button onClick={()=>setSelected(null)} style={{marginTop:4,padding:'5px',borderRadius:7,border:'1px solid var(--border)',background:'transparent',color:'var(--text-muted)',fontSize:'0.68rem',cursor:'pointer'}}>✕ Fechar</button>
              </div>
            </div>
          ) : (
            <div style={{borderRadius:13,border:'1px solid var(--border)',background:'var(--card-bg)',padding:'13px 14px'}}>
              <div style={{fontSize:'0.6rem',color:'var(--text-muted)',fontFamily:'var(--font-mono)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:10}}>🗺️ Atlas Global</div>
              <div style={{fontSize:'0.72rem',color:'var(--text-secondary)',lineHeight:1.6,marginBottom:10}}>Passe o mouse sobre um país para ver. Clique para detalhes.</div>
              <div style={{display:'flex',flexDirection:'column',gap:4}}>
                {LAYERS.map(l=>(
                  <button key={l.id} onClick={()=>setLayer(l.id)}
                    style={{padding:'6px 10px',borderRadius:8,border:`1px solid ${layer===l.id?'rgba(96,165,250,0.4)':'var(--border)'}`,background:layer===l.id?'rgba(96,165,250,0.08)':'transparent',color:layer===l.id?'#60a5fa':'var(--text-muted)',fontSize:'0.7rem',cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:6}}>
                    {l.icon} {l.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{borderRadius:11,border:'1px solid var(--border)',background:'var(--card-bg)',padding:'11px 13px'}}>
            <div style={{fontSize:'0.58rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:7}}>🌐 Agora</div>
            <div style={{fontFamily:'monospace',fontWeight:900,fontSize:'0.95rem',color:'#34d399'}}>{now.toLocaleTimeString('pt-BR')} BRT</div>
            <div style={{fontFamily:'monospace',fontSize:'0.72rem',color:'#60a5fa',marginTop:2}}>{getLocalTime(0).slice(0,5)} UTC</div>
          </div>

          {layer==='seasons' && (
            <div style={{borderRadius:11,border:'1px solid var(--border)',background:'var(--card-bg)',padding:'11px 13px'}}>
              <div style={{fontSize:'0.6rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:8}}>Estações Atuais</div>
              <div style={{display:'flex',flexDirection:'column',gap:6}}>
                {[{label:'Norte',val:northSeason,b:'rgba(59,130,246,0.2)'},{label:'Sul',val:southSeason,b:'rgba(52,211,153,0.2)'}].map(s=>(
                  <div key={s.label} style={{padding:'7px 10px',borderRadius:8,background:'rgba(255,255,255,0.03)',border:`1px solid ${s.b}`}}>
                    <div style={{fontSize:'0.57rem',color:'var(--text-muted)'}}>Hemisfério {s.label}</div>
                    <div style={{fontWeight:800,fontSize:'0.85rem',color:'var(--text-primary)',marginTop:1}}>{s.val}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{borderRadius:11,border:'1px solid var(--border)',background:'var(--card-bg)',padding:'11px 13px',flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>
            <div style={{fontSize:'0.58rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:8}}>50 países destacados</div>
            <div style={{overflowY:'auto',display:'flex',flexDirection:'column',gap:3,flex:1}}>
              {COUNTRIES.map(c=>(
                <button key={c.id} onClick={()=>setSelected(c===selected?null:c)}
                  style={{padding:'4px 8px',borderRadius:7,border:`1px solid ${selected?.id===c.id?'rgba(251,191,36,0.5)':'transparent'}`,background:selected?.id===c.id?'rgba(251,191,36,0.08)':'transparent',cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:6}}
                  onMouseEnter={e=>setHovered(c)}
                  onMouseLeave={()=>setHovered(null)}>
                  <span style={{fontSize:'0.85rem'}}>{c.flag}</span>
                  <span style={{fontSize:'0.68rem',color:'var(--text-secondary)',fontWeight:selected?.id===c.id?700:400}}>{c.name}</span>
                  <div style={{width:8,height:8,borderRadius:2,background:CONT_COLOR[c.continent]||'#666',marginLeft:'auto',flexShrink:0}}/>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
