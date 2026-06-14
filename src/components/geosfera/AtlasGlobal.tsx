import { useState, useEffect, useRef, useCallback } from 'react'

// ─── Helpers ──────────────────────────────────────────────────────────────────
function lx(lon: number) { return ((lon + 180) / 360) * 1000 }
function ly(lat: number) { return ((90 - lat) / 180) * 500 }

// ─── Full world SVG paths (simplified but recognizable) ───────────────────────
// Using SVG path "d" strings for accurate country shapes
// Coordinate space: 0-1000 x, 0-500 y (lon -180→180, lat 90→-90)
function p(coords: [number,number][]): string {
  return 'M' + coords.map(([lo,la],i) => `${lx(lo).toFixed(1)},${ly(la).toFixed(1)}`).join('L') + 'Z'
}

// ─── World landmass paths (complete continents + islands) ─────────────────────
const WORLD_PATHS: string[] = [
  // North America mainland
  p([[-168,72],[-140,70],[-120,68],[-100,72],[-80,70],[-60,65],[-55,50],[-52,46],[-66,44],[-70,42],[-72,41],[-74,40],[-76,38],[-77,35],[-80,32],[-81,25],[-82,24],[-88,30],[-90,29],[-97,26],[-100,28],[-104,29],[-107,32],[-111,31],[-117,32],[-120,34],[-122,37],[-124,41],[-124,49],[-123,50],[-125,50],[-130,55],[-135,58],[-140,60],[-145,60],[-150,59],[-152,58],[-156,58],[-160,57],[-164,60],[-166,64],[-168,72]]),
  // Canada north
  p([[-60,78],[-80,80],[-100,82],[-120,80],[-140,78],[-120,74],[-100,72],[-80,70],[-60,65],[-60,78]]),
  // Greenland
  p([[-45,85],[-20,84],[-18,76],[-30,73],[-44,76],[-52,70],[-56,64],[-44,60],[-42,64],[-48,68],[-52,72],[-45,85]]),
  // Central America + Mexico
  p([[-117,32],[-110,24],[-108,27],[-104,20],[-90,18],[-83,10],[-77,8],[-76,8],[-80,8],[-83,10],[-87,16],[-89,16],[-92,18],[-94,18],[-97,20],[-99,20],[-104,19],[-109,24],[-110,24],[-117,32]]),
  // Cuba
  p([[-85,22],[-75,20],[-75,22],[-85,23],[-85,22]]),
  // South America
  p([[-81,8],[-76,8],[-72,12],[-60,9],[-52,4],[-50,1],[-44,2],[-37,-5],[-35,-9],[-35,-12],[-38,-14],[-38,-18],[-40,-22],[-43,-23],[-45,-24],[-48,-27],[-50,-30],[-52,-33],[-53,-34],[-57,-38],[-62,-38],[-65,-40],[-68,-44],[-70,-46],[-71,-52],[-68,-54],[-65,-55],[-62,-51],[-58,-46],[-57,-40],[-58,-34],[-62,-28],[-60,-5],[-62,-12],[-64,-12],[-66,-10],[-68,-12],[-70,-11],[-73,-10],[-75,-8],[-78,-2],[-80,0],[-81,2],[-81,8]]),
  // Argentina south
  p([[-66,-22],[-58,-22],[-53,-33],[-57,-38],[-62,-38],[-65,-40],[-68,-44],[-70,-46],[-71,-52],[-68,-54],[-65,-55],[-60,-51],[-66,-22]]),
  // Europe
  p([[2,51],[8,55],[14,54],[22,54],[24,50],[22,48],[18,48],[14,46],[12,44],[14,38],[12,36],[2,36],[0,38],[-2,37],[-8,38],[-9,44],[-2,44],[2,44],[2,51]]),
  // Scandinavia
  p([[6,58],[10,62],[14,68],[18,70],[24,70],[28,68],[30,64],[26,60],[22,56],[18,56],[14,56],[10,56],[6,58]]),
  // UK + Ireland
  p([[-6,58],[0,58],[2,52],[1,51],[-2,50],[-5,50],[-5,52],[-3,54],[-2,56],[-4,56],[-6,58]]),
  p([[-10,52],[-6,52],[-6,54],[-8,55],[-10,53],[-10,52]]),
  // Russia main
  p([[32,68],[40,70],[55,68],[70,70],[80,72],[90,76],[100,76],[110,74],[120,72],[130,70],[140,70],[148,60],[142,52],[136,46],[132,44],[128,48],[120,52],[110,52],[105,52],[90,54],[75,55],[62,54],[55,58],[50,62],[40,64],[32,68]]),
  // Russia far east
  p([[140,52],[145,60],[150,60],[155,58],[160,60],[165,62],[170,64],[175,64],[178,68],[175,70],[165,68],[158,60],[148,54],[140,52]]),
  // Turkey + Middle East
  p([[26,42],[36,42],[44,40],[48,38],[56,26],[50,14],[42,12],[36,22],[30,32],[26,40],[26,42]]),
  // Arabian Peninsula
  p([[36,30],[50,28],[56,22],[58,18],[52,12],[44,12],[40,14],[38,18],[36,24],[36,30]]),
  // Iran/Iraq
  p([[44,38],[58,38],[62,26],[56,24],[50,24],[44,28],[44,38]]),
  // India
  p([[66,36],[74,34],[80,30],[88,26],[92,22],[88,8],[80,8],[76,8],[72,20],[68,22],[66,28],[66,36]]),
  // China main
  p([[73,40],[80,50],[90,52],[100,52],[110,52],[120,52],[130,48],[134,46],[135,43],[132,38],[124,32],[122,28],[118,22],[110,20],[100,22],[96,28],[90,28],[84,32],[78,36],[73,40]]),
  // Southeast Asia
  p([[100,22],[106,22],[108,16],[108,8],[104,10],[100,4],[100,8],[96,16],[98,20],[100,22]]),
  // Indonesia (Java+Sumatra simplified)
  p([[96,6],[105,-6],[110,-8],[116,-8],[108,-8],[102,-2],[98,4],[96,6]]),
  p([[114,-8],[120,-10],[124,-8],[118,-6],[116,-8],[114,-8]]),
  p([[120,-8],[130,-4],[140,-8],[138,-8],[132,-6],[128,-4],[124,-6],[120,-8]]),
  // Philippines
  p([[118,18],[122,18],[124,12],[122,8],[118,10],[118,18]]),
  // Japan
  p([[130,32],[136,34],[140,40],[142,44],[140,44],[138,36],[134,34],[130,34],[130,32]]),
  p([[142,44],[144,44],[141,43],[140,44],[142,44]]),
  // Korean Peninsula
  p([[124,42],[130,42],[130,34],[126,34],[124,38],[124,42]]),
  // Africa
  p([[0,36],[2,36],[12,36],[14,36],[22,36],[32,32],[36,30],[42,12],[44,12],[46,8],[42,4],[38,0],[34,-2],[30,-4],[28,-8],[26,-10],[24,-8],[18,-6],[12,-4],[6,0],[0,4],[0,10],[2,14],[4,14],[4,10],[0,10],[0,14],[2,14],[4,18],[4,22],[0,28],[-4,28],[-8,28],[-14,32],[-14,28],[-8,28],[-4,28],[0,28],[0,36]]),
  // Africa east
  p([[32,-2],[38,0],[42,4],[46,8],[50,12],[44,12],[42,4],[38,0],[36,0],[34,-2],[32,-2]]),
  // Africa south
  p([[18,-22],[26,-18],[32,-22],[32,-26],[30,-30],[28,-34],[26,-34],[18,-34],[17,-30],[18,-22]]),
  // Madagascar
  p([[44,-12],[50,-14],[50,-26],[46,-26],[44,-22],[44,-12]]),
  // Australia
  p([[114,-22],[122,-18],[130,-12],[136,-12],[138,-16],[136,-20],[140,-18],[148,-22],[154,-28],[154,-38],[148,-38],[144,-38],[136,-36],[128,-34],[120,-34],[114,-28],[114,-22]]),
  // New Zealand
  p([[166,-46],[174,-42],[176,-38],[174,-36],[172,-40],[170,-44],[166,-46]]),
  p([[168,-44],[172,-44],[174,-44],[172,-46],[168,-44]]),
  // Sri Lanka
  p([[80,10],[82,10],[82,6],[80,8],[80,10]]),
  // Iceland
  p([[-24,66],[-14,66],[-14,64],[-18,63],[-24,64],[-24,66]]),
  // Antarctica (simplified)
  p([[-180,-68],[-120,-68],[-60,-70],[0,-70],[60,-70],[120,-68],[180,-68],[180,-90],[-180,-90],[-180,-68]]),
]

// ─── Country data ─────────────────────────────────────────────────────────────
interface Country {
  id:string; name:string; capital:string; continent:string
  population:number; area:number; language:string; currency:string
  utcOffset:number; flag:string; color:string; capLat:number; capLon:number
  path: string
}

// Precise country shapes for the 50 highlighted countries
const COUNTRY_SHAPES: Record<string, [number,number][]> = {
  CN: [[73,40],[80,50],[90,52],[100,52],[110,52],[120,52],[128,48],[134,46],[135,43],[130,32],[122,28],[118,22],[110,20],[100,22],[96,28],[90,28],[84,32],[78,36],[73,40]],
  IN: [[66,36],[74,34],[80,30],[88,26],[92,22],[88,10],[80,8],[76,8],[72,20],[68,22],[66,28],[66,36]],
  US: [[-124,48],[-116,49],[-104,49],[-97,49],[-87,47],[-83,45],[-76,44],[-72,41],[-70,42],[-67,44],[-67,47],[-70,44],[-74,40],[-77,35],[-80,32],[-81,25],[-82,24],[-88,30],[-90,29],[-97,26],[-100,28],[-104,29],[-107,32],[-111,31],[-117,32],[-120,34],[-122,37],[-124,40],[-124,48]],
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

interface Country2 {
  id:string; name:string; capital:string; continent:string
  population:number; area:number; language:string; currency:string
  utcOffset:number; flag:string; capLat:number; capLon:number
}

const COUNTRIES: Country2[] = [
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

// Country highlight colors by continent
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
  const [hovered, setHovered] = useState<Country2|null>(null)
  const [selected, setSelected] = useState<Country2|null>(null)
  const [hoveredCap, setHoveredCap] = useState<Country2|null>(null)
  const [mouse, setMouse] = useState({x:0,y:0})
  const [showGrid, setShowGrid] = useState(true)
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => { const i = setInterval(()=>setNow(new Date()),1000); return ()=>clearInterval(i) },[])

  const sunLon = getSunLon(now)
  const sunX = lx(sunLon)
  const m=now.getMonth()+1, dy=now.getDate()
  const isSummerNorth = (m===6&&dy>=21)||(m===7||m===8)||(m===9&&dy<23)
  const northSeason = isSummerNorth?'☀️ Verão':((m===12&&dy>=21)||(m<=3&&!(m===3&&dy>20)))?'❄️ Inverno':((m>=3&&m<=6&&!(m===6&&dy>20)))?'🌸 Primavera':'🍂 Outono'
  const southSeason = isSummerNorth?'❄️ Inverno':((m===12&&dy>=21)||(m<=3&&!(m===3&&dy>20)))?'☀️ Verão':((m>=3&&m<=6&&!(m===6&&dy>20)))?'🍂 Outono':'🌸 Primavera'

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const r = svgRef.current?.getBoundingClientRect()
    if (r) setMouse({x:e.clientX-r.left, y:e.clientY-r.top})
  },[])

  function getHighlightColor(c: Country2): string {
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

      {/* Toolbar */}
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

        {/* MAP */}
        <div style={{flex:1,position:'relative',borderRadius:14,overflow:'hidden',border:'1px solid var(--border)',background:'#061828'}}>
          <svg ref={svgRef} viewBox="0 0 1000 500" preserveAspectRatio="xMidYMid meet"
            style={{width:'100%',height:'100%',display:'block',cursor:'crosshair'}}
            onMouseMove={onMouseMove}
            onMouseLeave={()=>{setHovered(null);setHoveredCap(null)}}>

            <defs>
              <radialGradient id="ocean" cx="40%" cy="40%">
                <stop offset="0%" stopColor="#0a4a8a"/>
                <stop offset="60%" stopColor="#062050"/>
                <stop offset="100%" stopColor="#020c1e"/>
              </radialGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="2" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>

            {/* Ocean */}
            <rect width="1000" height="500" fill="url(#ocean)"/>

            {/* Grid */}
            {showGrid && <>
              {[-60,-30,0,30,60].map(la=>(
                <line key={la} x1={0} y1={ly(la)} x2={1000} y2={ly(la)}
                  stroke={la===0?'rgba(96,165,250,0.35)':'rgba(96,165,250,0.1)'}
                  strokeWidth={la===0?1:0.5} strokeDasharray={la===0?'':'4,4'}/>
              ))}
              {[-150,-120,-90,-60,-30,0,30,60,90,120,150].map(lo=>(
                <line key={lo} x1={lx(lo)} y1={0} x2={lx(lo)} y2={500} stroke="rgba(96,165,250,0.08)" strokeWidth={0.4} strokeDasharray="4,4"/>
              ))}
              <text x={lx(0)+2} y={ly(0)-3} fill="rgba(96,165,250,0.5)" fontSize={6.5}>Equador</text>
              <text x={lx(1)} y={ly(23.5)-3} fill="rgba(96,165,250,0.3)" fontSize={5.5}>Trópico de Câncer</text>
              <text x={lx(1)} y={ly(-23.5)+9} fill="rgba(96,165,250,0.3)" fontSize={5.5}>Trópico de Capricórnio</text>
            </>}

            {/* World landmass base layer — light grey/green tones */}
            {WORLD_PATHS.map((d,i)=>(
              <path key={i} d={d} fill="rgba(60,80,55,0.55)" stroke="rgba(80,100,70,0.4)" strokeWidth={0.4} strokeLinejoin="round"/>
            ))}

            {/* Night overlay */}
            {layer!=='seasons' && <>
              <rect width={sunX} height={500} fill="rgba(0,2,12,0.48)"/>
              <line x1={sunX} y1={0} x2={sunX} y2={500} stroke="rgba(255,210,60,0.3)" strokeWidth={2}/>
              <line x1={sunX} y1={0} x2={sunX} y2={500} stroke="rgba(255,210,60,0.08)" strokeWidth={10}/>
            </>}
            {layer==='daynight' && (
              <g transform={`translate(${sunX},${ly(0)})`} filter="url(#glow)">
                <circle r={14} fill="rgba(255,220,50,0.15)" stroke="rgba(255,220,50,0.4)" strokeWidth={1.5}/>
                <circle r={7} fill="rgba(255,220,50,0.8)"/>
                <text x={0} y={4} textAnchor="middle" fontSize={9} fill="#fff">☀</text>
              </g>
            )}

            {/* 50 highlighted countries — colored overlay */}
            {COUNTRIES.map(c=>{
              const shape = COUNTRY_SHAPES[c.id]
              if (!shape) return null
              const isH = hovered?.id===c.id
              const isSel = selected?.id===c.id
              const col = isSel?'#fbbf24':isH?'#fff':getHighlightColor(c)
              const opacity = isSel?0.95:isH?0.9:0.55
              return (
                <polygon key={c.id}
                  points={shape.map(([lo,la])=>`${lx(lo).toFixed(1)},${ly(la).toFixed(1)}`).join(' ')}
                  fill={col} fillOpacity={opacity}
                  stroke={isH||isSel?'rgba(255,255,255,0.9)':'rgba(255,255,255,0.3)'}
                  strokeWidth={isH||isSel?1.5:0.5} strokeLinejoin="round"
                  style={{cursor:'pointer',transition:'fill-opacity 0.12s,stroke-width 0.12s'}}
                  onMouseEnter={()=>setHovered(c)}
                  onMouseLeave={()=>setHovered(null)}
                  onClick={()=>setSelected(c===selected?null:c)}/>
              )
            })}

            {/* Season overlay labels */}
            {layer==='seasons' && <>
              <rect x={330} y={6} width={340} height={22} rx={5} fill="rgba(0,0,0,0.5)"/>
              <text x={500} y={21} textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize={10} fontWeight="bold">Norte: {northSeason}  ·  Sul: {southSeason}</text>
              <line x1={0} y1={ly(0)} x2={1000} y2={ly(0)} stroke="rgba(255,255,255,0.2)" strokeWidth={1} strokeDasharray="6,4"/>
            </>}

            {/* Timezone meridians */}
            {layer==='timezones' && [-120,-90,-60,-30,0,30,60,90,120].map(lo=>(
              <g key={lo}>
                <line x1={lx(lo)} y1={0} x2={lx(lo)} y2={500} stroke="rgba(255,255,255,0.06)" strokeWidth={0.5}/>
                <text x={lx(lo)+2} y={12} fontSize={6} fill="rgba(255,255,255,0.35)">UTC{lo/15>=0?'+':''}{lo/15}</text>
              </g>
            ))}

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
                    fill={isH?'#fbbf24':'rgba(255,255,255,0.88)'}
                    stroke={isH?'#f59e0b':'rgba(0,0,0,0.4)'} strokeWidth={isH?1.5:1}
                    style={{transition:'all 0.12s'}}/>
                  {isH&&<text x={8} y={-4} fontSize={7.5} fill="#fbbf24" fontWeight="bold" stroke="rgba(0,0,0,0.6)" strokeWidth={0.5}>{c.capital}</text>}
                </g>
              )
            })}

            {/* Continent legend */}
            {layer==='countries' && (() => {
              const conts = Object.entries(CONT_COLOR)
              return (
                <g>
                  <rect x={6} y={468} width={360} height={26} rx={5} fill="rgba(0,0,0,0.55)"/>
                  {conts.map(([cont,col],i)=>(
                    <g key={cont} transform={`translate(${14+i*53},474)`}>
                      <rect x={0} y={0} width={8} height={8} rx={2} fill={col} fillOpacity={0.8}/>
                      <text x={10} y={7.5} fontSize={6} fill="rgba(255,255,255,0.6)">{cont.split('/')[0].split(' ').pop()}</text>
                    </g>
                  ))}
                </g>
              )
            })()}

          </svg>

          {/* Tooltip — hovered capital */}
          {hoveredCap && (
            <div style={{position:'absolute',left:tipX,top:tipY,minWidth:190,padding:'10px 13px',borderRadius:11,background:'rgba(4,14,30,0.97)',border:'1px solid rgba(251,191,36,0.4)',backdropFilter:'blur(8px)',zIndex:20,pointerEvents:'none'}}>
              <div style={{fontWeight:800,fontSize:'0.82rem',color:'#fbbf24',marginBottom:5}}>{hoveredCap.flag} {hoveredCap.capital}</div>
              <div style={{fontFamily:'monospace',fontSize:'1rem',fontWeight:900,color:'#34d399',marginBottom:3}}>{getLocalTime(hoveredCap.utcOffset)}</div>
              <div style={{fontSize:'0.62rem',color:'rgba(255,255,255,0.55)'}}>UTC{hoveredCap.utcOffset>=0?'+':''}{hoveredCap.utcOffset} · {hoveredCap.name}</div>
              <div style={{fontSize:'0.6rem',color:'rgba(255,255,255,0.35)',marginTop:1}}>{hoveredCap.utcOffset-(-3)>=0?'+':''}{hoveredCap.utcOffset-(-3)}h vs Brasília</div>
            </div>
          )}

          {/* Tooltip — hovered country */}
          {hovered && !hoveredCap && (
            <div style={{position:'absolute',left:tipX,top:tipY,padding:'8px 12px',borderRadius:10,background:'rgba(4,14,30,0.95)',border:`1px solid ${CONT_COLOR[hovered.continent]||'rgba(96,165,250,0.3)'}55`,backdropFilter:'blur(6px)',zIndex:20,pointerEvents:'none'}}>
              <div style={{fontWeight:700,fontSize:'0.8rem',color:'#fff'}}>{hovered.flag} {hovered.name}</div>
              <div style={{fontSize:'0.62rem',color:'rgba(255,255,255,0.5)',marginTop:2}}>{hovered.capital} · {hovered.continent}</div>
              {layer==='timezones'&&<div style={{fontFamily:'monospace',color:'#34d399',fontSize:'0.72rem',marginTop:2}}>{getLocalTime(hovered.utcOffset)} · UTC{hovered.utcOffset>=0?'+':''}{hovered.utcOffset}</div>}
              <div style={{fontSize:'0.58rem',color:'rgba(255,255,255,0.3)',marginTop:2}}>Clique para detalhes completos</div>
            </div>
          )}
        </div>

        {/* SIDE PANEL */}
        <div style={{width:244,display:'flex',flexDirection:'column',gap:10,overflowY:'auto',flexShrink:0}}>
          {selected ? (
            <div style={{borderRadius:13,border:'1px solid rgba(96,165,250,0.3)',background:'var(--card-bg)',overflow:'hidden'}}>
              <div style={{padding:'14px 15px',background:`linear-gradient(135deg,${CONT_COLOR[selected.continent]||'#6366f1'}18,transparent)`,borderBottom:'1px solid var(--border)'}}>
                <div style={{fontSize:'2.2rem',marginBottom:4}}>{selected.flag}</div>
                <div style={{fontWeight:900,fontSize:'1.05rem',color:'var(--text-primary)'}}>{selected.name}</div>
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
              <div style={{fontSize:'0.72rem',color:'var(--text-secondary)',lineHeight:1.6,marginBottom:10}}>Passe o mouse sobre um país colorido para ver informações. Clique para detalhes completos.</div>
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
                {[{label:'Hemisfério Norte',val:northSeason,c:'rgba(59,130,246,0.1)',b:'rgba(59,130,246,0.2)'},{label:'Hemisfério Sul',val:southSeason,c:'rgba(52,211,153,0.08)',b:'rgba(52,211,153,0.2)'}].map(s=>(
                  <div key={s.label} style={{padding:'7px 10px',borderRadius:8,background:s.c,border:`1px solid ${s.b}`}}>
                    <div style={{fontSize:'0.57rem',color:'var(--text-muted)'}}>{s.label}</div>
                    <div style={{fontWeight:800,fontSize:'0.85rem',color:'var(--text-primary)',marginTop:1}}>{s.val}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Country list */}
          <div style={{borderRadius:11,border:'1px solid var(--border)',background:'var(--card-bg)',padding:'11px 13px',flex:1,overflow:'hidden',display:'flex',flexDirection:'column'}}>
            <div style={{fontSize:'0.58rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:8}}>50 países destacados</div>
            <div style={{overflowY:'auto',display:'flex',flexDirection:'column',gap:3,flex:1}}>
              {COUNTRIES.map(c=>(
                <button key={c.id} onClick={()=>setSelected(c===selected?null:c)}
                  style={{padding:'4px 8px',borderRadius:7,border:`1px solid ${selected?.id===c.id?'rgba(251,191,36,0.5)':'transparent'}`,background:selected?.id===c.id?'rgba(251,191,36,0.08)':'transparent',cursor:'pointer',textAlign:'left',display:'flex',alignItems:'center',gap:6,transition:'all 0.1s'}}
                  onMouseEnter={e=>(e.currentTarget as HTMLElement).style.background='rgba(255,255,255,0.04)'}
                  onMouseLeave={e=>(e.currentTarget as HTMLElement).style.background=selected?.id===c.id?'rgba(251,191,36,0.08)':'transparent'}>
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
