import { useState, useEffect, useRef, useCallback } from 'react'

// ─── Coordinate helpers ───────────────────────────────────────────────────────
// Map: lon -180→180 → x 0→1000, lat 90→-90 → y 0→500
function lx(lon: number) { return ((lon + 180) / 360) * 1000 }
function ly(lat: number) { return ((90 - lat) / 180) * 500 }
function pts(coords: [number, number][]): string {
  return coords.map(([lo, la]) => `${lx(lo).toFixed(1)},${ly(la).toFixed(1)}`).join(' ')
}

// ─── Country shapes — realistic simplified paths ───────────────────────────────
// Each shape: array of [lon, lat] points forming a closed polygon
const SHAPES: Record<string, [number,number][]> = {
  // ── Americas ──────────────────────────────────────────────────────────────
  CA: [[-140,60],[-135,60],[-125,50],[-123,49],[-95,49],[-83,46],[-76,44],[-71,45],[-67,48],[-60,47],[-53,47],[-56,51],[-60,55],[-64,60],[-68,63],[-75,63],[-80,62],[-85,55],[-90,60],[-95,60],[-100,58],[-110,60],[-120,59],[-130,55],[-135,58],[-140,60]],
  US: [[-124,49],[-116,49],[-104,49],[-97,49],[-87,47],[-83,46],[-76,44],[-72,41],[-70,42],[-67,44],[-67,47],[-70,44],[-72,41],[-74,40],[-76,38],[-77,35],[-76,32],[-80,25],[-82,24],[-87,30],[-90,29],[-94,26],[-97,26],[-100,28],[-104,29],[-106,32],[-111,31],[-117,32],[-120,34],[-122,37],[-124,40],[-124,46],[-124,49]],
  MX: [[-117,32],[-111,31],[-106,32],[-100,28],[-97,26],[-94,26],[-90,18],[-87,16],[-89,16],[-91,16],[-92,18],[-94,18],[-97,20],[-99,20],[-104,19],[-106,23],[-109,24],[-110,24],[-109,26],[-108,27],[-107,29],[-104,29],[-100,28],[-97,26],[-117,32]],
  BR: [[-73,-10],[-70,-4],[-68,-2],[-60,0],[-52,4],[-51,4],[-50,1],[-44,2],[-37,-5],[-35,-9],[-35,-12],[-38,-14],[-38,-18],[-40,-20],[-41,-22],[-43,-23],[-45,-24],[-48,-27],[-50,-30],[-52,-33],[-53,-33],[-54,-31],[-57,-30],[-58,-28],[-58,-24],[-57,-20],[-58,-16],[-60,-14],[-62,-12],[-64,-12],[-66,-10],[-68,-12],[-70,-11],[-73,-10]],
  AR: [[-73,-22],[-70,-18],[-68,-21],[-65,-22],[-65,-26],[-62,-28],[-58,-28],[-57,-30],[-57,-38],[-62,-38],[-65,-40],[-68,-44],[-70,-46],[-71,-52],[-68,-54],[-65,-55],[-60,-51],[-58,-46],[-57,-40],[-58,-36],[-60,-34],[-62,-38],[-62,-34],[-58,-28],[-62,-28],[-65,-22],[-68,-21],[-70,-18],[-73,-22]],
  CO: [[-76,8],[-72,12],[-71,12],[-67,6],[-67,2],[-70,0],[-70,-4],[-72,-4],[-76,-1],[-78,1],[-77,4],[-76,8]],
  VE: [[-73,11],[-70,12],[-63,11],[-60,9],[-60,6],[-67,4],[-67,2],[-71,2],[-72,5],[-73,9],[-73,11]],
  PE: [[-75,-2],[-68,0],[-68,-4],[-70,-11],[-72,-14],[-70,-18],[-68,-21],[-65,-22],[-65,-18],[-70,-14],[-75,-8],[-75,-2]],

  // ── Europe ────────────────────────────────────────────────────────────────
  RU: [[32,68],[40,70],[50,69],[60,73],[70,73],[80,73],[90,77],[100,77],[105,77],[115,75],[130,72],[140,72],[145,60],[140,55],[135,48],[132,43],[130,42],[128,48],[115,53],[105,52],[90,55],[75,55],[60,54],[55,58],[50,62],[40,65],[32,68]],
  DE: [[6,55],[8,55],[14,54],[14,50],[13,48],[12,48],[8,48],[7,48],[6,51],[7,53],[8,55],[6,55]],
  FR: [[-4,48],[2,51],[8,48],[8,43],[3,42],[0,43],[-2,47],[-4,48]],
  GB: [[-6,58],[0,58],[2,52],[1,51],[-2,50],[-5,50],[-5,52],[-3,54],[-2,56],[-4,56],[-6,58]],
  ES: [[-9,44],[3,44],[3,40],[0,38],[-2,37],[-7,38],[-9,38],[-9,44]],
  IT: [[7,44],[14,44],[16,38],[14,36],[12,38],[10,38],[8,44],[7,44]],
  PL: [[14,54],[22,54],[24,50],[22,49],[18,50],[14,51],[14,54]],
  UA: [[22,52],[38,52],[40,46],[36,46],[32,46],[28,48],[24,48],[22,50],[22,52]],
  TR: [[26,42],[36,42],[44,40],[44,36],[36,36],[28,37],[26,40],[26,42]],

  // ── Africa ────────────────────────────────────────────────────────────────
  NG: [[3,14],[13,14],[14,10],[14,6],[4,6],[3,7],[3,14]],
  ET: [[33,15],[42,15],[44,12],[44,8],[42,4],[38,4],[33,8],[33,15]],
  EG: [[25,32],[35,32],[35,22],[25,22],[25,32]],
  CD: [[12,5],[30,5],[32,0],[30,-5],[28,-8],[26,-10],[24,-8],[18,-6],[12,-4],[12,0],[12,5]],
  ZA: [[17,-22],[32,-22],[32,-26],[30,-30],[28,-34],[26,-34],[18,-34],[17,-30],[17,-22]],
  TZ: [[30,-1],[40,-1],[40,-10],[36,-10],[30,-8],[30,-1]],
  MA: [[-6,36],[0,36],[0,28],[-6,28],[-14,28],[-14,32],[-6,36]],
  MZ: [[32,-10],[36,-14],[38,-18],[36,-24],[34,-26],[32,-24],[30,-18],[32,-10]],
  GH: [[-3,11],[1,11],[1,5],[-3,5],[-3,11]],
  CM: [[8,12],[14,12],[14,4],[10,2],[8,4],[8,12]],
  KE: [[34,4],[42,4],[42,-2],[38,-4],[34,-2],[34,4]],
  CI: [[-8,10],[0,10],[0,4],[-4,4],[-8,6],[-8,10]],
  UG: [[30,4],[34,4],[34,0],[30,0],[30,4]],
  MG: [[44,-12],[50,-14],[50,-24],[46,-26],[44,-24],[44,-12]],
  TZ2: [[30,-4],[40,-4],[40,-12],[36,-12],[30,-8],[30,-4]],

  // ── Asia ──────────────────────────────────────────────────────────────────
  CN: [[73,40],[80,50],[90,53],[100,53],[110,53],[120,52],[130,48],[134,48],[135,43],[130,32],[122,31],[120,24],[110,20],[100,22],[100,26],[96,28],[90,28],[82,32],[76,36],[73,40]],
  IN: [[68,37],[74,34],[80,32],[88,26],[92,22],[80,8],[76,8],[72,20],[68,24],[68,37]],
  PK: [[60,37],[70,38],[76,36],[74,34],[70,30],[64,26],[60,24],[56,26],[60,30],[60,37]],
  ID: [[95,5],[100,5],[105,-6],[108,-8],[115,-8],[120,-10],[128,-4],[140,-8],[141,-6],[141,-2],[130,1],[120,1],[110,-8],[105,-8],[100,0],[95,2],[95,5]],
  JP: [[130,45],[132,42],[130,34],[130,31],[136,34],[140,40],[142,44],[141,43],[138,36],[136,34],[140,36],[141,40],[140,44],[130,44],[130,45]],
  BD: [[88,26],[92,26],[92,22],[88,22],[88,26]],
  PH: [[118,18],[122,18],[124,12],[124,8],[120,6],[116,8],[118,12],[118,18]],
  VN: [[102,23],[106,22],[108,16],[108,10],[104,10],[102,12],[100,22],[102,23]],
  MM: [[92,28],[100,26],[100,16],[98,14],[94,16],[92,20],[92,28]],
  TH: [[98,20],[102,18],[104,14],[100,6],[98,8],[98,16],[98,20]],
  KR: [[126,38],[130,38],[130,34],[126,34],[126,38]],
  KP: [[124,42],[130,42],[130,38],[126,38],[124,40],[124,42]],
  IR: [[44,38],[58,38],[62,28],[56,26],[50,26],[44,28],[44,38]],
  IQ: [[38,38],[48,38],[48,30],[44,28],[38,30],[38,38]],
  SA: [[36,30],[50,28],[56,22],[50,14],[42,12],[36,22],[36,30]],
  MY: [[100,6],[105,6],[108,4],[114,4],[114,2],[108,2],[100,2],[100,6]],
  NP: [[80,30],[88,30],[88,26],[80,26],[80,30]],

  // ── Oceania ───────────────────────────────────────────────────────────────
  AU: [[114,-22],[122,-18],[130,-12],[136,-12],[138,-16],[136,-20],[140,-18],[150,-24],[154,-28],[154,-38],[148,-38],[144,-38],[136,-36],[128,-34],[120,-34],[114,-28],[114,-22]],

  // ── Additional countries ───────────────────────────────────────────────────
  MG2: [[44,-13],[50,-14],[50,-26],[46,-26],[44,-22],[44,-13]],
  CM2: [[8,13],[16,13],[16,4],[8,4],[8,13]],
  NG2: [[2,14],[14,14],[14,4],[4,4],[2,8],[2,14]],
}

// ─── Country Data ─────────────────────────────────────────────────────────────
interface Country {
  id: string; name: string; capital: string; continent: string
  population: number; area: number; language: string; currency: string
  utcOffset: number; flag: string; color: string
  capLat: number; capLon: number
}

const COUNTRIES: Country[] = [
  { id:'CN', name:'China', capital:'Pequim', continent:'Ásia', population:1412, area:9597, language:'Mandarim', currency:'Yuan (¥)', utcOffset:8, flag:'🇨🇳', color:'#b91c1c', capLat:39.9, capLon:116.4 },
  { id:'IN', name:'Índia', capital:'Nova Delhi', continent:'Ásia', population:1408, area:3287, language:'Hindi/Inglês', currency:'Rúpia (₹)', utcOffset:5.5, flag:'🇮🇳', color:'#ea580c', capLat:28.6, capLon:77.2 },
  { id:'US', name:'EUA', capital:'Washington D.C.', continent:'América do Norte', population:334, area:9834, language:'Inglês', currency:'Dólar ($)', utcOffset:-5, flag:'🇺🇸', color:'#1d4ed8', capLat:38.9, capLon:-77.0 },
  { id:'ID', name:'Indonésia', capital:'Jacarta', continent:'Ásia', population:277, area:1905, language:'Indonésio', currency:'Rúpia (Rp)', utcOffset:7, flag:'🇮🇩', color:'#be123c', capLat:-6.2, capLon:106.8 },
  { id:'PK', name:'Paquistão', capital:'Islamabad', continent:'Ásia', population:231, area:881, language:'Urdu', currency:'Rúpia Paquistanesa', utcOffset:5, flag:'🇵🇰', color:'#15803d', capLat:33.7, capLon:73.1 },
  { id:'BR', name:'Brasil', capital:'Brasília', continent:'América do Sul', population:215, area:8516, language:'Português', currency:'Real (R$)', utcOffset:-3, flag:'🇧🇷', color:'#16a34a', capLat:-15.8, capLon:-47.9 },
  { id:'NG', name:'Nigéria', capital:'Abuja', continent:'África', population:218, area:924, language:'Inglês', currency:'Naira (₦)', utcOffset:1, flag:'🇳🇬', color:'#15803d', capLat:9.1, capLon:7.2 },
  { id:'BD', name:'Bangladesh', capital:'Dhaka', continent:'Ásia', population:170, area:148, language:'Bengalês', currency:'Taka (৳)', utcOffset:6, flag:'🇧🇩', color:'#166534', capLat:23.7, capLon:90.4 },
  { id:'RU', name:'Rússia', capital:'Moscou', continent:'Europa/Ásia', population:145, area:17098, language:'Russo', currency:'Rublo (₽)', utcOffset:3, flag:'🇷🇺', color:'#1e3a8a', capLat:55.8, capLon:37.6 },
  { id:'ET', name:'Etiópia', capital:'Adis Abeba', continent:'África', population:123, area:1104, language:'Amárico', currency:'Birr (Br)', utcOffset:3, flag:'🇪🇹', color:'#166534', capLat:9.0, capLon:38.7 },
  { id:'MX', name:'México', capital:'Cidade do México', continent:'América do Norte', population:129, area:1964, language:'Espanhol', currency:'Peso (MXN)', utcOffset:-6, flag:'🇲🇽', color:'#166534', capLat:19.4, capLon:-99.1 },
  { id:'JP', name:'Japão', capital:'Tóquio', continent:'Ásia', population:125, area:378, language:'Japonês', currency:'Iene (¥)', utcOffset:9, flag:'🇯🇵', color:'#dc2626', capLat:35.7, capLon:139.7 },
  { id:'PH', name:'Filipinas', capital:'Manila', continent:'Ásia', population:115, area:300, language:'Filipino/Inglês', currency:'Peso Filipino', utcOffset:8, flag:'🇵🇭', color:'#1d4ed8', capLat:14.6, capLon:120.9 },
  { id:'EG', name:'Egito', capital:'Cairo', continent:'África', population:106, area:1002, language:'Árabe', currency:'Libra Egípcia', utcOffset:2, flag:'🇪🇬', color:'#b45309', capLat:30.0, capLon:31.2 },
  { id:'CD', name:'Congo', capital:'Kinshasa', continent:'África', population:102, area:2345, language:'Francês', currency:'Franco Congolês', utcOffset:1, flag:'🇨🇩', color:'#1d4ed8', capLat:-4.3, capLon:15.3 },
  { id:'VN', name:'Vietnã', capital:'Hanói', continent:'Ásia', population:98, area:331, language:'Vietnamita', currency:'Dong (₫)', utcOffset:7, flag:'🇻🇳', color:'#dc2626', capLat:21.0, capLon:105.8 },
  { id:'IR', name:'Irã', capital:'Teerã', continent:'Ásia', population:87, area:1745, language:'Persa', currency:'Rial Iraniano', utcOffset:3.5, flag:'🇮🇷', color:'#166534', capLat:35.7, capLon:51.4 },
  { id:'TR', name:'Turquia', capital:'Ancara', continent:'Europa/Ásia', population:85, area:785, language:'Turco', currency:'Lira (₺)', utcOffset:3, flag:'🇹🇷', color:'#dc2626', capLat:39.9, capLon:32.9 },
  { id:'DE', name:'Alemanha', capital:'Berlim', continent:'Europa', population:83, area:358, language:'Alemão', currency:'Euro (€)', utcOffset:1, flag:'🇩🇪', color:'#374151', capLat:52.5, capLon:13.4 },
  { id:'TH', name:'Tailândia', capital:'Bangcoc', continent:'Ásia', population:72, area:513, language:'Tailandês', currency:'Baht (฿)', utcOffset:7, flag:'🇹🇭', color:'#1d4ed8', capLat:13.8, capLon:100.5 },
  { id:'GB', name:'Reino Unido', capital:'Londres', continent:'Europa', population:68, area:242, language:'Inglês', currency:'Libra (£)', utcOffset:0, flag:'🇬🇧', color:'#1d4ed8', capLat:51.5, capLon:-0.1 },
  { id:'FR', name:'França', capital:'Paris', continent:'Europa', population:68, area:551, language:'Francês', currency:'Euro (€)', utcOffset:1, flag:'🇫🇷', color:'#1d4ed8', capLat:48.9, capLon:2.3 },
  { id:'TZ', name:'Tanzânia', capital:'Dodoma', continent:'África', population:65, area:945, language:'Suaíle', currency:'Shilling Tanzaniano', utcOffset:3, flag:'🇹🇿', color:'#166534', capLat:-6.2, capLon:35.7 },
  { id:'ZA', name:'África do Sul', capital:'Pretória', continent:'África', population:60, area:1219, language:'11 idiomas', currency:'Rand (R)', utcOffset:2, flag:'🇿🇦', color:'#166534', capLat:-25.7, capLon:28.2 },
  { id:'MM', name:'Mianmar', capital:'Naypyidaw', continent:'Ásia', population:55, area:677, language:'Birmanês', currency:'Kyat (K)', utcOffset:6.5, flag:'🇲🇲', color:'#fbbf24', capLat:19.7, capLon:96.1 },
  { id:'KR', name:'Coreia do Sul', capital:'Seul', continent:'Ásia', population:52, area:100, language:'Coreano', currency:'Won (₩)', utcOffset:9, flag:'🇰🇷', color:'#dc2626', capLat:37.6, capLon:126.9 },
  { id:'CO', name:'Colômbia', capital:'Bogotá', continent:'América do Sul', population:52, area:1142, language:'Espanhol', currency:'Peso Colombiano', utcOffset:-5, flag:'🇨🇴', color:'#fbbf24', capLat:4.7, capLon:-74.1 },
  { id:'KE', name:'Quênia', capital:'Nairóbi', continent:'África', population:55, area:580, language:'Suaíle/Inglês', currency:'Shilling Queniano', utcOffset:3, flag:'🇰🇪', color:'#166534', capLat:-1.3, capLon:36.8 },
  { id:'ES', name:'Espanha', capital:'Madri', continent:'Europa', population:47, area:506, language:'Espanhol', currency:'Euro (€)', utcOffset:1, flag:'🇪🇸', color:'#dc2626', capLat:40.4, capLon:-3.7 },
  { id:'AR', name:'Argentina', capital:'Buenos Aires', continent:'América do Sul', population:46, area:2780, language:'Espanhol', currency:'Peso Argentino', utcOffset:-3, flag:'🇦🇷', color:'#60a5fa', capLat:-34.6, capLon:-58.4 },
  { id:'UG', name:'Uganda', capital:'Kampala', continent:'África', population:48, area:241, language:'Inglês/Suaíle', currency:'Shilling Ugandês', utcOffset:3, flag:'🇺🇬', color:'#fbbf24', capLat:0.3, capLon:32.6 },
  { id:'UA', name:'Ucrânia', capital:'Kiev', continent:'Europa', population:44, area:604, language:'Ucraniano', currency:'Hryvnia (₴)', utcOffset:2, flag:'🇺🇦', color:'#1d4ed8', capLat:50.4, capLon:30.5 },
  { id:'IQ', name:'Iraque', capital:'Bagdá', continent:'Ásia', population:42, area:438, language:'Árabe/Curdo', currency:'Dinar Iraquiano', utcOffset:3, flag:'🇮🇶', color:'#166534', capLat:33.3, capLon:44.4 },
  { id:'CA', name:'Canadá', capital:'Ottawa', continent:'América do Norte', population:38, area:9985, language:'Inglês/Francês', currency:'Dólar Canadense', utcOffset:-5, flag:'🇨🇦', color:'#dc2626', capLat:45.4, capLon:-75.7 },
  { id:'PE', name:'Peru', capital:'Lima', continent:'América do Sul', population:33, area:1285, language:'Espanhol', currency:'Sol Peruano', utcOffset:-5, flag:'🇵🇪', color:'#dc2626', capLat:-12.1, capLon:-77.0 },
  { id:'VE', name:'Venezuela', capital:'Caracas', continent:'América do Sul', population:30, area:912, language:'Espanhol', currency:'Bolívar', utcOffset:-4, flag:'🇻🇪', color:'#fbbf24', capLat:10.5, capLon:-66.9 },
  { id:'MA', name:'Marrocos', capital:'Rabat', continent:'África', population:37, area:447, language:'Árabe/Berbere', currency:'Dirham Marroquino', utcOffset:1, flag:'🇲🇦', color:'#dc2626', capLat:34.0, capLon:-6.8 },
  { id:'SA', name:'Arábia Saudita', capital:'Riade', continent:'Ásia', population:35, area:2150, language:'Árabe', currency:'Riyal (SR)', utcOffset:3, flag:'🇸🇦', color:'#166534', capLat:24.7, capLon:46.7 },
  { id:'MY', name:'Malásia', capital:'Kuala Lumpur', continent:'Ásia', population:33, area:330, language:'Malaio', currency:'Ringgit (RM)', utcOffset:8, flag:'🇲🇾', color:'#dc2626', capLat:3.2, capLon:101.7 },
  { id:'GH', name:'Gana', capital:'Acra', continent:'África', population:33, area:239, language:'Inglês', currency:'Cedi Ganês', utcOffset:0, flag:'🇬🇭', color:'#dc2626', capLat:5.6, capLon:-0.2 },
  { id:'MZ', name:'Moçambique', capital:'Maputo', continent:'África', population:32, area:802, language:'Português', currency:'Metical (MT)', utcOffset:2, flag:'🇲🇿', color:'#fbbf24', capLat:-25.9, capLon:32.6 },
  { id:'AU', name:'Austrália', capital:'Camberra', continent:'Oceania', population:26, area:7692, language:'Inglês', currency:'Dólar Australiano', utcOffset:10, flag:'🇦🇺', color:'#1d4ed8', capLat:-35.3, capLon:149.1 },
  { id:'NP', name:'Nepal', capital:'Katmandu', continent:'Ásia', population:30, area:147, language:'Nepalês', currency:'Rúpia Nepalesa', utcOffset:5.75, flag:'🇳🇵', color:'#dc2626', capLat:27.7, capLon:85.3 },
  { id:'IT', name:'Itália', capital:'Roma', continent:'Europa', population:60, area:301, language:'Italiano', currency:'Euro (€)', utcOffset:1, flag:'🇮🇹', color:'#166534', capLat:41.9, capLon:12.5 },
  { id:'PL', name:'Polônia', capital:'Varsóvia', continent:'Europa', population:38, area:313, language:'Polonês', currency:'Zloty (zł)', utcOffset:1, flag:'🇵🇱', color:'#dc2626', capLat:52.2, capLon:21.0 },
  { id:'MG', name:'Madagascar', capital:'Antananarivo', continent:'África', population:28, area:587, language:'Malgaxe/Francês', currency:'Ariary (Ar)', utcOffset:3, flag:'🇲🇬', color:'#dc2626', capLat:-18.9, capLon:47.5 },
  { id:'CM', name:'Camarões', capital:'Yaoundé', continent:'África', population:27, area:475, language:'Francês/Inglês', currency:'Franco CFA', utcOffset:1, flag:'🇨🇲', color:'#166534', capLat:3.9, capLon:11.5 },
  { id:'KP', name:'Coreia do Norte', capital:'Pyongyang', continent:'Ásia', population:26, area:121, language:'Coreano', currency:'Won (₩)', utcOffset:9, flag:'🇰🇵', color:'#1d4ed8', capLat:39.0, capLon:125.8 },
  { id:'UA', name:'Ucrânia', capital:'Kiev', continent:'Europa', population:44, area:604, language:'Ucraniano', currency:'Hryvnia (₴)', utcOffset:2, flag:'🇺🇦', color:'#2563eb', capLat:50.4, capLon:30.5 },
]

// ─── POIs ─────────────────────────────────────────────────────────────────────
interface POI { name:string; lat:number; lon:number; type:'wonder'|'natural'; icon:string; desc:string }
const POIS: POI[] = [
  { name:'Muralha da China', lat:40.4, lon:116.6, type:'wonder', icon:'🏯', desc:'7.300 km de extensão. Construída entre séc. VII a.C. e XVII d.C. para proteger o império chinês.' },
  { name:'Machu Picchu', lat:-13.2, lon:-72.5, type:'wonder', icon:'🏛️', desc:'Cidadela inca do séc. XV nos Andes peruanos. Uma das 7 Maravilhas do Mundo Moderno.' },
  { name:'Cristo Redentor', lat:-22.9, lon:-43.2, type:'wonder', icon:'✝️', desc:'Estátua de 30m no Rio de Janeiro. Uma das 7 Maravilhas do Mundo Moderno.' },
  { name:'Coliseu', lat:41.9, lon:12.5, type:'wonder', icon:'🏟️', desc:'Arena romana do séc. I d.C. com capacidade para 80.000 espectadores.' },
  { name:'Taj Mahal', lat:27.2, lon:78.0, type:'wonder', icon:'🕌', desc:'Mausoléu de mármore em Agra, Índia. Construído em 1653 pelo imperador Shah Jahan.' },
  { name:'Chichén Itzá', lat:20.7, lon:-88.6, type:'wonder', icon:'🔺', desc:'Pirâmide maia no México. Centro de peregrinação e calendário astronômico preciso.' },
  { name:'Petra', lat:30.3, lon:35.4, type:'wonder', icon:'🏜️', desc:'Cidade esculpida na rocha na Jordânia. Capital do reino Nabateu no séc. IV a.C.' },
  { name:'Monte Everest', lat:27.9, lon:86.9, type:'natural', icon:'🏔️', desc:'8.849m — o ponto mais alto da Terra. Primeira ascensão em 1953 por Hillary e Tenzing.' },
  { name:'Amazônia', lat:-3.5, lon:-62.0, type:'natural', icon:'🌿', desc:'Maior floresta tropical: 5,5M km². Abriga 10% das espécies do planeta.' },
  { name:'Saara', lat:23.0, lon:12.0, type:'natural', icon:'🏜️', desc:'Maior deserto quente do mundo: 9,2M km². Temperaturas chegam a 57°C.' },
  { name:'Grande Barreira de Corais', lat:-18.0, lon:147.0, type:'natural', icon:'🐠', desc:'Maior estrutura viva da Terra: 2.300 km ao largo da costa australiana.' },
  { name:'Kilimanjaro', lat:-3.1, lon:37.4, type:'natural', icon:'🏔️', desc:'5.895m — o ponto mais alto da África. Vulcão inativo na Tanzânia.' },
  { name:'Lago Baikal', lat:53.5, lon:108.0, type:'natural', icon:'💧', desc:'Lago mais profundo do mundo: 1.642m. Contém 20% da água doce superficial.' },
  { name:'Antártida', lat:-75.0, lon:0.0, type:'natural', icon:'❄️', desc:'Continente mais frio: -89°C. Contém 70% da água doce do planeta congelada.' },
]

type LayerType = 'countries'|'daynight'|'timezones'|'seasons'|'wonders'|'capitals'

function getLocalTime(utcOffset: number): string {
  const now = new Date()
  const utc = now.getTime() + now.getTimezoneOffset() * 60000
  return new Date(utc + utcOffset * 3600000).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit', second:'2-digit' })
}

function getSunLon(date: Date): number {
  const h = date.getUTCHours() + date.getUTCMinutes()/60 + date.getUTCSeconds()/3600
  return ((180 - h * 15) + 360) % 360 - 180
}

export default function AtlasGlobal() {
  const [now, setNow] = useState(new Date())
  const [layer, setLayer] = useState<LayerType>('countries')
  const [hoveredCountry, setHoveredCountry] = useState<Country|null>(null)
  const [selectedCountry, setSelectedCountry] = useState<Country|null>(null)
  const [hoveredPOI, setHoveredPOI] = useState<POI|null>(null)
  const [hoveredCapital, setHoveredCapital] = useState<Country|null>(null)
  const [mousePos, setMousePos] = useState({x:0,y:0})
  const [showGrid, setShowGrid] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(i)
  }, [])

  const sunLon = getSunLon(now)
  const sunX = lx(sunLon)

  const m = now.getMonth()+1, d = now.getDate()
  let northSeason='', southSeason=''
  if (m===12&&d>=21||m<=3&&!(m===3&&d>20)) { northSeason='❄️ Inverno'; southSeason='☀️ Verão' }
  else if (m>=3&&m<=6&&!(m===6&&d>20)&&!(m===3&&d<21)) { northSeason='🌸 Primavera'; southSeason='🍂 Outono' }
  else if (m>=6&&m<=9&&!(m===9&&d>22)&&!(m===6&&d<21)) { northSeason='☀️ Verão'; southSeason='❄️ Inverno' }
  else { northSeason='🍂 Outono'; southSeason='🌸 Primavera' }

  function getCountryFill(c: Country): string {
    if (selectedCountry?.id === c.id) return '#fbbf24'
    if (hoveredCountry?.id === c.id) return '#93c5fd'
    if (layer === 'timezones') {
      const hue = ((c.utcOffset + 12) / 24) * 300
      return `hsl(${hue},70%,38%)`
    }
    if (layer === 'seasons') {
      const isNorth = c.capLat > 0
      const s = isNorth ? northSeason : southSeason
      if (s.includes('Verão')) return '#f97316'
      if (s.includes('Inverno')) return '#3b82f6'
      if (s.includes('Primavera')) return '#22c55e'
      return '#d97706'
    }
    return c.color
  }

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (rect) setMousePos({x: e.clientX - rect.left, y: e.clientY - rect.top})
  }, [])

  const LAYERS: {id:LayerType;icon:string;label:string}[] = [
    {id:'countries',icon:'🌍',label:'Países'},
    {id:'daynight',icon:'🌞',label:'Dia/Noite'},
    {id:'timezones',icon:'🕐',label:'Fusos'},
    {id:'seasons',icon:'🌸',label:'Estações'},
    {id:'capitals',icon:'🏛️',label:'Capitais'},
    {id:'wonders',icon:'⭐',label:'Maravilhas'},
  ]

  // Tooltip position (clamp to SVG bounds)
  const tipX = Math.min(mousePos.x + 14, 760)
  const tipY = Math.max(mousePos.y - 20, 8)

  return (
    <div style={{display:'flex',flexDirection:'column',gap:10,height:'100%'}}>

      {/* Toolbar */}
      <div style={{display:'flex',gap:6,alignItems:'center',flexWrap:'wrap'}}>
        <span style={{fontSize:'0.58rem',color:'var(--text-muted)',fontFamily:'var(--font-mono)',textTransform:'uppercase',letterSpacing:'0.1em',marginRight:2}}>Camada:</span>
        {LAYERS.map(l=>(
          <button key={l.id} onClick={()=>{setLayer(l.id);setSelectedCountry(null)}}
            style={{padding:'5px 12px',borderRadius:20,border:`1px solid ${layer===l.id?'rgba(96,165,250,0.6)':'var(--border)'}`,background:layer===l.id?'rgba(96,165,250,0.12)':'transparent',color:layer===l.id?'#60a5fa':'var(--text-muted)',fontSize:'0.7rem',fontWeight:layer===l.id?700:400,cursor:'pointer',display:'flex',alignItems:'center',gap:4,transition:'all 0.15s'}}>
            {l.icon} {l.label}
          </button>
        ))}
        <button onClick={()=>setShowGrid(g=>!g)}
          style={{marginLeft:'auto',padding:'5px 10px',borderRadius:20,border:`1px solid ${showGrid?'rgba(52,211,153,0.4)':'var(--border)'}`,background:showGrid?'rgba(52,211,153,0.08)':'transparent',color:showGrid?'#34d399':'var(--text-muted)',fontSize:'0.68rem',cursor:'pointer'}}>
          ⊞ Grade
        </button>
      </div>

      <div style={{display:'flex',gap:14,flex:1,minHeight:0}}>

        {/* SVG MAP */}
        <div style={{flex:1,position:'relative',borderRadius:14,overflow:'hidden',border:'1px solid var(--border)',background:'#061828'}}>
          <svg ref={svgRef} viewBox="0 0 1000 500" preserveAspectRatio="xMidYMid meet"
            style={{width:'100%',height:'100%',display:'block',cursor:'crosshair'}}
            onMouseMove={handleMouseMove}
            onMouseLeave={()=>{setHoveredCountry(null);setHoveredPOI(null);setHoveredCapital(null)}}>

            <defs>
              <radialGradient id="og" cx="40%" cy="40%">
                <stop offset="0%" stopColor="#0d4a7a"/>
                <stop offset="100%" stopColor="#020e1c"/>
              </radialGradient>
              <filter id="gl">
                <feGaussianBlur stdDeviation="1.5" result="b"/>
                <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>

            {/* Ocean */}
            <rect width="1000" height="500" fill="url(#og)"/>

            {/* Graticule */}
            {showGrid && <>
              {[-60,-30,0,30,60].map(la=>(
                <line key={la} x1={0} y1={ly(la)} x2={1000} y2={ly(la)}
                  stroke={la===0?'rgba(96,165,250,0.4)':'rgba(96,165,250,0.15)'}
                  strokeWidth={la===0?1.2:0.5} strokeDasharray={la===0?'':'3,3'}/>
              ))}
              {[-120,-60,0,60,120].map(lo=>(
                <line key={lo} x1={lx(lo)} y1={0} x2={lx(lo)} y2={500}
                  stroke="rgba(96,165,250,0.12)" strokeWidth={0.5} strokeDasharray="3,3"/>
              ))}
              <text x={lx(0)+3} y={ly(0)-4} fill="rgba(96,165,250,0.5)" fontSize={7}>Equador</text>
              <text x={lx(2)+3} y={ly(23.5)-3} fill="rgba(96,165,250,0.35)" fontSize={6}>Trópico de Câncer</text>
              <text x={lx(2)+3} y={ly(-23.5)+9} fill="rgba(96,165,250,0.35)" fontSize={6}>Trópico de Capricórnio</text>
            </>}

            {/* Day/Night overlay */}
            {layer!=='seasons' && <>
              <rect width={sunX} height={500} fill="rgba(0,4,20,0.52)"/>
              <line x1={sunX} y1={0} x2={sunX} y2={500} stroke="rgba(255,210,60,0.35)" strokeWidth={2.5}/>
              <line x1={sunX} y1={0} x2={sunX} y2={500} stroke="rgba(255,210,60,0.1)" strokeWidth={14}/>
              {layer==='daynight' && (
                <g transform={`translate(${sunX},${ly(0)})`} filter="url(#gl)">
                  <circle r={16} fill="rgba(255,220,50,0.12)" stroke="rgba(255,220,50,0.4)" strokeWidth={1.5}/>
                  <circle r={8} fill="rgba(255,220,50,0.75)"/>
                  <text x={0} y={4} textAnchor="middle" fontSize={10} fill="#fff">☀</text>
                </g>
              )}
            </>}

            {/* Countries */}
            {COUNTRIES.map(c => {
              const shape = SHAPES[c.id]
              if (!shape) return null
              const fill = getCountryFill(c)
              const isH = hoveredCountry?.id === c.id
              return (
                <polygon key={c.id} points={pts(shape)}
                  fill={fill} fillOpacity={isH?0.95:0.82}
                  stroke={isH?'rgba(255,255,255,0.9)':'rgba(255,255,255,0.25)'}
                  strokeWidth={isH?1.5:0.7} strokeLinejoin="round"
                  style={{cursor:'pointer',transition:'fill-opacity 0.15s,stroke 0.15s'}}
                  onMouseEnter={()=>setHoveredCountry(c)}
                  onMouseLeave={()=>setHoveredCountry(null)}
                  onClick={()=>setSelectedCountry(c===selectedCountry?null:c)}/>
              )
            })}

            {/* Season labels */}
            {layer==='seasons' && <>
              <rect x={340} y={8} width={320} height={24} rx={6} fill="rgba(0,0,0,0.45)"/>
              <text x={500} y={24} textAnchor="middle" fill="rgba(255,255,255,0.85)" fontSize={11} fontWeight="bold">Norte: {northSeason} · Sul: {southSeason}</text>
              <line x1={0} y1={ly(0)} x2={1000} y2={ly(0)} stroke="rgba(255,255,255,0.25)" strokeWidth={1.2} strokeDasharray="8,4"/>
            </>}

            {/* Timezone meridians */}
            {layer==='timezones' && [-180,-150,-120,-90,-60,-30,0,30,60,90,120,150].map(lo=>(
              <g key={lo}>
                <line x1={lx(lo)} y1={0} x2={lx(lo)} y2={500} stroke="rgba(255,255,255,0.07)" strokeWidth={0.6}/>
                <text x={lx(lo)+2} y={14} fontSize={7} fill="rgba(255,255,255,0.4)">UTC{lo/15>=0?'+':''}{lo/15}</text>
              </g>
            ))}

            {/* Wonders & Natural POIs */}
            {(layer==='wonders'||layer==='countries') && POIS.map((p,i)=>{
              const isH = hoveredPOI?.name===p.name
              return (
                <g key={i} transform={`translate(${lx(p.lon)},${ly(p.lat)})`}
                  style={{cursor:'pointer'}}
                  onMouseEnter={()=>setHoveredPOI(p)}
                  onMouseLeave={()=>setHoveredPOI(null)}>
                  <circle r={isH?10:6.5}
                    fill={p.type==='wonder'?'rgba(251,191,36,0.9)':'rgba(52,211,153,0.9)'}
                    stroke="#fff" strokeWidth={1}
                    style={{transition:'r 0.12s'}}/>
                  <text x={0} y={4} textAnchor="middle" fontSize={isH?9:7} fill="#fff">{p.icon}</text>
                </g>
              )
            })}

            {/* Capitals */}
            {(layer==='capitals'||layer==='timezones') && COUNTRIES.map(c=>{
              const isH = hoveredCapital?.id===c.id
              return (
                <g key={c.id+'_c'} transform={`translate(${lx(c.capLon)},${ly(c.capLat)})`}
                  style={{cursor:'pointer'}}
                  onMouseEnter={()=>setHoveredCapital(c)}
                  onMouseLeave={()=>setHoveredCapital(null)}
                  onClick={()=>setSelectedCountry(c)}>
                  <circle r={isH?7:3.5}
                    fill={isH?'#fbbf24':'rgba(255,255,255,0.9)'}
                    stroke={c.color} strokeWidth={isH?2:1.5}
                    style={{transition:'all 0.12s'}}/>
                  {isH && <text x={7} y={-5} fontSize={8} fill="#fbbf24" fontWeight="bold"
                    stroke="rgba(0,0,0,0.6)" strokeWidth={0.6}>{c.capital}</text>}
                </g>
              )
            })}

            {/* Map legend */}
            <rect x={6} y={480} width={300} height={14} rx={3} fill="rgba(0,0,0,0.4)"/>
            <text x={10} y={491} fontSize={7.5} fill="rgba(255,255,255,0.45)">🌍 País · ⭐ Maravilha · 🟢 Natural · ● Capital</text>

          </svg>

          {/* Tooltips — render outside SVG as HTML for better styling */}
          {hoveredPOI && (
            <div style={{position:'absolute',left:tipX,top:tipY,maxWidth:230,padding:'10px 13px',borderRadius:11,background:'rgba(6,20,40,0.96)',border:'1px solid rgba(251,191,36,0.4)',backdropFilter:'blur(8px)',zIndex:20,pointerEvents:'none'}}>
              <div style={{fontWeight:800,fontSize:'0.8rem',color:'#fbbf24',marginBottom:4}}>{hoveredPOI.icon} {hoveredPOI.name}</div>
              <div style={{fontSize:'0.67rem',color:'rgba(255,255,255,0.75)',lineHeight:1.55}}>{hoveredPOI.desc}</div>
            </div>
          )}

          {hoveredCapital && !hoveredPOI && (
            <div style={{position:'absolute',left:tipX,top:tipY,minWidth:190,padding:'10px 13px',borderRadius:11,background:'rgba(6,20,40,0.96)',border:'1px solid rgba(251,191,36,0.35)',backdropFilter:'blur(8px)',zIndex:20,pointerEvents:'none'}}>
              <div style={{fontWeight:800,fontSize:'0.82rem',color:'#fbbf24',marginBottom:5}}>{hoveredCapital.flag} {hoveredCapital.capital}</div>
              <div style={{fontFamily:'monospace',fontSize:'1rem',fontWeight:900,color:'#34d399',marginBottom:3}}>{getLocalTime(hoveredCapital.utcOffset)}</div>
              <div style={{fontSize:'0.62rem',color:'rgba(255,255,255,0.6)'}}>UTC{hoveredCapital.utcOffset>=0?'+':''}{hoveredCapital.utcOffset} · {hoveredCapital.name}</div>
              <div style={{fontSize:'0.6rem',color:'rgba(255,255,255,0.4)',marginTop:2}}>
                {hoveredCapital.utcOffset-(-3)>=0?'+':''}{hoveredCapital.utcOffset-(-3)}h vs Brasília
              </div>
            </div>
          )}

          {hoveredCountry && !hoveredPOI && !hoveredCapital && (
            <div style={{position:'absolute',left:tipX,top:tipY,padding:'8px 12px',borderRadius:10,background:'rgba(6,20,40,0.93)',border:'1px solid rgba(96,165,250,0.3)',backdropFilter:'blur(6px)',zIndex:20,pointerEvents:'none'}}>
              <div style={{fontWeight:700,fontSize:'0.78rem',color:'#fff'}}>{hoveredCountry.flag} {hoveredCountry.name}</div>
              <div style={{fontSize:'0.62rem',color:'rgba(255,255,255,0.5)',marginTop:2}}>{hoveredCountry.capital} · {hoveredCountry.continent}</div>
              {layer==='timezones'&&<div style={{fontFamily:'monospace',color:'#34d399',fontSize:'0.73rem',marginTop:3}}>{getLocalTime(hoveredCountry.utcOffset)} · UTC{hoveredCountry.utcOffset>=0?'+':''}{hoveredCountry.utcOffset}</div>}
              <div style={{fontSize:'0.6rem',color:'rgba(255,255,255,0.35)',marginTop:2}}>Clique para detalhes</div>
            </div>
          )}
        </div>

        {/* SIDE PANEL */}
        <div style={{width:248,display:'flex',flexDirection:'column',gap:10,overflowY:'auto',flexShrink:0}}>
          {selectedCountry ? (
            <div style={{borderRadius:13,border:'1px solid rgba(96,165,250,0.3)',background:'var(--card-bg)',overflow:'hidden'}}>
              <div style={{padding:'14px 15px',background:`linear-gradient(135deg,${selectedCountry.color}22,transparent)`,borderBottom:'1px solid var(--border)'}}>
                <div style={{fontSize:'2.2rem',marginBottom:4}}>{selectedCountry.flag}</div>
                <div style={{fontWeight:900,fontSize:'1.05rem',color:'var(--text-primary)'}}>{selectedCountry.name}</div>
                <div style={{fontSize:'0.65rem',color:'var(--text-muted)',marginTop:2}}>{selectedCountry.continent}</div>
              </div>
              <div style={{padding:'12px 15px',display:'flex',flexDirection:'column',gap:7}}>
                {[
                  {l:'🏛️ Capital', v:selectedCountry.capital},
                  {l:'👥 População', v:`${selectedCountry.population}M hab.`},
                  {l:'📐 Área', v:`${selectedCountry.area.toLocaleString('pt-BR')} km²`},
                  {l:'🗣️ Idioma', v:selectedCountry.language},
                  {l:'💰 Moeda', v:selectedCountry.currency},
                  {l:'🕐 Fuso', v:`UTC${selectedCountry.utcOffset>=0?'+':''}${selectedCountry.utcOffset}`},
                  {l:'⏰ Hora local', v:getLocalTime(selectedCountry.utcOffset)},
                  {l:'↔️ vs Brasília', v:`${selectedCountry.utcOffset-(-3)>=0?'+':''}${selectedCountry.utcOffset-(-3)}h`},
                ].map(it=>(
                  <div key={it.l} style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',fontSize:'0.7rem',gap:6}}>
                    <span style={{color:'var(--text-muted)',flexShrink:0}}>{it.l}</span>
                    <span style={{fontWeight:700,color:'var(--text-primary)',textAlign:'right'}}>{it.v}</span>
                  </div>
                ))}
                <button onClick={()=>setSelectedCountry(null)} style={{marginTop:4,padding:'5px',borderRadius:7,border:'1px solid var(--border)',background:'transparent',color:'var(--text-muted)',fontSize:'0.68rem',cursor:'pointer'}}>✕ Fechar</button>
              </div>
            </div>
          ) : (
            <div style={{borderRadius:13,border:'1px solid var(--border)',background:'var(--card-bg)',padding:'13px 14px'}}>
              <div style={{fontSize:'0.6rem',color:'var(--text-muted)',fontFamily:'var(--font-mono)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:10}}>🗺️ Atlas Global</div>
              <div style={{fontSize:'0.72rem',color:'var(--text-secondary)',lineHeight:1.6,marginBottom:10}}>Clique em um país ou capital para detalhes completos.</div>
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

          {/* Live clock */}
          <div style={{borderRadius:11,border:'1px solid var(--border)',background:'var(--card-bg)',padding:'11px 13px'}}>
            <div style={{fontSize:'0.58rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:7}}>🌐 Agora</div>
            <div style={{fontFamily:'monospace',fontWeight:900,fontSize:'0.95rem',color:'#34d399'}}>{now.toLocaleTimeString('pt-BR')} BRT</div>
            <div style={{fontFamily:'monospace',fontSize:'0.72rem',color:'#60a5fa',marginTop:2}}>{getLocalTime(0).slice(0,5)} UTC</div>
          </div>

          {/* Layer hint */}
          {layer==='seasons' && (
            <div style={{borderRadius:11,border:'1px solid var(--border)',background:'var(--card-bg)',padding:'11px 13px'}}>
              <div style={{fontSize:'0.6rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:8}}>Estações Atuais</div>
              <div style={{display:'flex',flexDirection:'column',gap:7}}>
                <div style={{padding:'7px 10px',borderRadius:8,background:'rgba(59,130,246,0.07)',border:'1px solid rgba(59,130,246,0.2)'}}>
                  <div style={{fontSize:'0.58rem',color:'var(--text-muted)'}}>Norte</div>
                  <div style={{fontWeight:800,fontSize:'0.85rem',color:'var(--text-primary)',marginTop:1}}>{northSeason}</div>
                </div>
                <div style={{padding:'7px 10px',borderRadius:8,background:'rgba(52,211,153,0.07)',border:'1px solid rgba(52,211,153,0.2)'}}>
                  <div style={{fontSize:'0.58rem',color:'var(--text-muted)'}}>Sul</div>
                  <div style={{fontWeight:800,fontSize:'0.85rem',color:'var(--text-primary)',marginTop:1}}>{southSeason}</div>
                </div>
              </div>
            </div>
          )}

          {layer==='daynight' && (
            <div style={{borderRadius:11,border:'1px solid rgba(251,191,36,0.2)',background:'rgba(251,191,36,0.04)',padding:'11px 13px'}}>
              <div style={{fontSize:'0.6rem',color:'#fbbf24',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:7}}>☀️ Sol · UTC</div>
              <div style={{fontSize:'0.72rem',color:'var(--text-secondary)',lineHeight:1.8}}>
                <div>Long. solar: <strong style={{color:'#fbbf24'}}>{sunLon.toFixed(1)}°</strong></div>
                <div>UTC: <strong style={{color:'#fbbf24'}}>{getLocalTime(0).slice(0,5)}</strong></div>
              </div>
            </div>
          )}

          {layer==='wonders' && (
            <div style={{borderRadius:11,border:'1px solid rgba(251,191,36,0.18)',background:'var(--card-bg)',padding:'11px 13px'}}>
              <div style={{fontSize:'0.6rem',color:'#fbbf24',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:8}}>Pontos marcados</div>
              <div style={{display:'flex',flexDirection:'column',gap:4}}>
                {POIS.map((p,i)=>(
                  <div key={i} style={{fontSize:'0.67rem',color:'var(--text-secondary)',display:'flex',alignItems:'center',gap:5}}>
                    <span style={{fontSize:'0.8rem'}}>{p.icon}</span> {p.name}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
