import { useState, useEffect, useRef, useCallback } from 'react'

// ─── Country Data ─────────────────────────────────────────────────────────────
interface Country {
  id: string; name: string; capital: string; continent: string
  population: number; area: number; language: string; currency: string
  tz: string; utcOffset: number; flag: string; color: string
  capLat: number; capLon: number
}

const COUNTRIES: Country[] = [
  { id:'CN', name:'China', capital:'Pequim', continent:'Ásia', population:1412, area:9597, language:'Mandarim', currency:'Yuan (¥)', tz:'Asia/Shanghai', utcOffset:8, flag:'🇨🇳', color:'#dc2626', capLat:39.9, capLon:116.4 },
  { id:'IN', name:'Índia', capital:'Nova Delhi', continent:'Ásia', population:1408, area:3287, language:'Hindi/Inglês', currency:'Rúpia (₹)', tz:'Asia/Kolkata', utcOffset:5.5, flag:'🇮🇳', color:'#f97316', capLat:28.6, capLon:77.2 },
  { id:'US', name:'EUA', capital:'Washington D.C.', continent:'América do Norte', population:334, area:9834, language:'Inglês', currency:'Dólar ($)', tz:'America/New_York', utcOffset:-5, flag:'🇺🇸', color:'#3b82f6', capLat:38.9, capLon:-77.0 },
  { id:'ID', name:'Indonésia', capital:'Jacarta', continent:'Ásia', population:277, area:1905, language:'Indonésio', currency:'Rúpia (Rp)', tz:'Asia/Jakarta', utcOffset:7, flag:'🇮🇩', color:'#dc2626', capLat:-6.2, capLon:106.8 },
  { id:'PK', name:'Paquistão', capital:'Islamabad', continent:'Ásia', population:231, area:881, language:'Urdu', currency:'Rúpia Paquistanesa', tz:'Asia/Karachi', utcOffset:5, flag:'🇵🇰', color:'#16a34a', capLat:33.7, capLon:73.1 },
  { id:'BR', name:'Brasil', capital:'Brasília', continent:'América do Sul', population:215, area:8516, language:'Português', currency:'Real (R$)', tz:'America/Sao_Paulo', utcOffset:-3, flag:'🇧🇷', color:'#16a34a', capLat:-15.8, capLon:-47.9 },
  { id:'NG', name:'Nigéria', capital:'Abuja', continent:'África', population:218, area:924, language:'Inglês', currency:'Naira (₦)', tz:'Africa/Lagos', utcOffset:1, flag:'🇳🇬', color:'#16a34a', capLat:9.1, capLon:7.2 },
  { id:'BD', name:'Bangladesh', capital:'Dhaka', continent:'Ásia', population:170, area:148, language:'Bengalês', currency:'Taka (৳)', tz:'Asia/Dhaka', utcOffset:6, flag:'🇧🇩', color:'#16a34a', capLat:23.7, capLon:90.4 },
  { id:'RU', name:'Rússia', capital:'Moscou', continent:'Europa/Ásia', population:145, area:17098, language:'Russo', currency:'Rublo (₽)', tz:'Europe/Moscow', utcOffset:3, flag:'🇷🇺', color:'#1d4ed8', capLat:55.8, capLon:37.6 },
  { id:'ET', name:'Etiópia', capital:'Adis Abeba', continent:'África', population:123, area:1104, language:'Amárico', currency:'Birr (Br)', tz:'Africa/Addis_Ababa', utcOffset:3, flag:'🇪🇹', color:'#16a34a', capLat:9.0, capLon:38.7 },
  { id:'MX', name:'México', capital:'Cidade do México', continent:'América do Norte', population:129, area:1964, language:'Espanhol', currency:'Peso (MXN)', tz:'America/Mexico_City', utcOffset:-6, flag:'🇲🇽', color:'#16a34a', capLat:19.4, capLon:-99.1 },
  { id:'JP', name:'Japão', capital:'Tóquio', continent:'Ásia', population:125, area:378, language:'Japonês', currency:'Iene (¥)', tz:'Asia/Tokyo', utcOffset:9, flag:'🇯🇵', color:'#dc2626', capLat:35.7, capLon:139.7 },
  { id:'PH', name:'Filipinas', capital:'Manila', continent:'Ásia', population:115, area:300, language:'Filipino/Inglês', currency:'Peso Filipino', tz:'Asia/Manila', utcOffset:8, flag:'🇵🇭', color:'#1d4ed8', capLat:14.6, capLon:120.9 },
  { id:'EG', name:'Egito', capital:'Cairo', continent:'África', population:106, area:1002, language:'Árabe', currency:'Libra Egípcia', tz:'Africa/Cairo', utcOffset:2, flag:'🇪🇬', color:'#dc2626', capLat:30.0, capLon:31.2 },
  { id:'CD', name:'Congo', capital:'Kinshasa', continent:'África', population:102, area:2345, language:'Francês', currency:'Franco Congolês', tz:'Africa/Kinshasa', utcOffset:1, flag:'🇨🇩', color:'#1d4ed8', capLat:-4.3, capLon:15.3 },
  { id:'VN', name:'Vietnã', capital:'Hanói', continent:'Ásia', population:98, area:331, language:'Vietnamita', currency:'Dong (₫)', tz:'Asia/Ho_Chi_Minh', utcOffset:7, flag:'🇻🇳', color:'#dc2626', capLat:21.0, capLon:105.8 },
  { id:'IR', name:'Irã', capital:'Teerã', continent:'Ásia', population:87, area:1745, language:'Persa', currency:'Rial Iraniano', tz:'Asia/Tehran', utcOffset:3.5, flag:'🇮🇷', color:'#16a34a', capLat:35.7, capLon:51.4 },
  { id:'TR', name:'Turquia', capital:'Ancara', continent:'Europa/Ásia', population:85, area:785, language:'Turco', currency:'Lira (₺)', tz:'Europe/Istanbul', utcOffset:3, flag:'🇹🇷', color:'#dc2626', capLat:39.9, capLon:32.9 },
  { id:'DE', name:'Alemanha', capital:'Berlim', continent:'Europa', population:83, area:358, language:'Alemão', currency:'Euro (€)', tz:'Europe/Berlin', utcOffset:1, flag:'🇩🇪', color:'#1c1c1c', capLat:52.5, capLon:13.4 },
  { id:'TH', name:'Tailândia', capital:'Bangcoc', continent:'Ásia', population:72, area:513, language:'Tailandês', currency:'Baht (฿)', tz:'Asia/Bangkok', utcOffset:7, flag:'🇹🇭', color:'#1d4ed8', capLat:13.8, capLon:100.5 },
  { id:'GB', name:'Reino Unido', capital:'Londres', continent:'Europa', population:68, area:242, language:'Inglês', currency:'Libra (£)', tz:'Europe/London', utcOffset:0, flag:'🇬🇧', color:'#1d4ed8', capLat:51.5, capLon:-0.1 },
  { id:'FR', name:'França', capital:'Paris', continent:'Europa', population:68, area:551, language:'Francês', currency:'Euro (€)', tz:'Europe/Paris', utcOffset:1, flag:'🇫🇷', color:'#1d4ed8', capLat:48.9, capLon:2.3 },
  { id:'TZ', name:'Tanzânia', capital:'Dodoma', continent:'África', population:65, area:945, language:'Suaíle', currency:'Shilling Tanzaniano', tz:'Africa/Dar_es_Salaam', utcOffset:3, flag:'🇹🇿', color:'#16a34a', capLat:-6.2, capLon:35.7 },
  { id:'ZA', name:'África do Sul', capital:'Pretória', continent:'África', population:60, area:1219, language:'11 idiomas', currency:'Rand (R)', tz:'Africa/Johannesburg', utcOffset:2, flag:'🇿🇦', color:'#16a34a', capLat:-25.7, capLon:28.2 },
  { id:'MM', name:'Mianmar', capital:'Naypyidaw', continent:'Ásia', population:55, area:677, language:'Birmanês', currency:'Kyat (K)', tz:'Asia/Rangoon', utcOffset:6.5, flag:'🇲🇲', color:'#fbbf24', capLat:19.7, capLon:96.1 },
  { id:'KR', name:'Coreia do Sul', capital:'Seul', continent:'Ásia', population:52, area:100, language:'Coreano', currency:'Won (₩)', tz:'Asia/Seoul', utcOffset:9, flag:'🇰🇷', color:'#dc2626', capLat:37.6, capLon:126.9 },
  { id:'CO', name:'Colômbia', capital:'Bogotá', continent:'América do Sul', population:52, area:1142, language:'Espanhol', currency:'Peso Colombiano', tz:'America/Bogota', utcOffset:-5, flag:'🇨🇴', color:'#fbbf24', capLat:4.7, capLon:-74.1 },
  { id:'KE', name:'Quênia', capital:'Nairóbi', continent:'África', population:55, area:580, language:'Suaíle/Inglês', currency:'Shilling Queniano', tz:'Africa/Nairobi', utcOffset:3, flag:'🇰🇪', color:'#16a34a', capLat:-1.3, capLon:36.8 },
  { id:'ES', name:'Espanha', capital:'Madri', continent:'Europa', population:47, area:506, language:'Espanhol', currency:'Euro (€)', tz:'Europe/Madrid', utcOffset:1, flag:'🇪🇸', color:'#dc2626', capLat:40.4, capLon:-3.7 },
  { id:'AR', name:'Argentina', capital:'Buenos Aires', continent:'América do Sul', population:46, area:2780, language:'Espanhol', currency:'Peso Argentino', tz:'America/Argentina/Buenos_Aires', utcOffset:-3, flag:'🇦🇷', color:'#60a5fa', capLat:-34.6, capLon:-58.4 },
  { id:'UG', name:'Uganda', capital:'Kampala', continent:'África', population:48, area:241, language:'Inglês/Suaíle', currency:'Shilling Ugandês', tz:'Africa/Kampala', utcOffset:3, flag:'🇺🇬', color:'#fbbf24', capLat:0.3, capLon:32.6 },
  { id:'UA', name:'Ucrânia', capital:'Kiev', continent:'Europa', population:44, area:604, language:'Ucraniano', currency:'Hryvnia (₴)', tz:'Europe/Kiev', utcOffset:2, flag:'🇺🇦', color:'#1d4ed8', capLat:50.4, capLon:30.5 },
  { id:'IQ', name:'Iraque', capital:'Bagdá', continent:'Ásia', population:42, area:438, language:'Árabe/Curdo', currency:'Dinar Iraquiano', tz:'Asia/Baghdad', utcOffset:3, flag:'🇮🇶', color:'#16a34a', capLat:33.3, capLon:44.4 },
  { id:'CA', name:'Canadá', capital:'Ottawa', continent:'América do Norte', population:38, area:9985, language:'Inglês/Francês', currency:'Dólar Canadense', tz:'America/Toronto', utcOffset:-5, flag:'🇨🇦', color:'#dc2626', capLat:45.4, capLon:-75.7 },
  { id:'PE', name:'Peru', capital:'Lima', continent:'América do Sul', population:33, area:1285, language:'Espanhol', currency:'Sol Peruano', tz:'America/Lima', utcOffset:-5, flag:'🇵🇪', color:'#dc2626', capLat:-12.1, capLon:-77.0 },
  { id:'VE', name:'Venezuela', capital:'Caracas', continent:'América do Sul', population:30, area:912, language:'Espanhol', currency:'Bolívar', tz:'America/Caracas', utcOffset:-4, flag:'🇻🇪', color:'#fbbf24', capLat:10.5, capLon:-66.9 },
  { id:'MA', name:'Marrocos', capital:'Rabat', continent:'África', population:37, area:447, language:'Árabe/Berbere', currency:'Dirham Marroquino', tz:'Africa/Casablanca', utcOffset:1, flag:'🇲🇦', color:'#dc2626', capLat:34.0, capLon:-6.8 },
  { id:'SA', name:'Arábia Saudita', capital:'Riade', continent:'Ásia', population:35, area:2150, language:'Árabe', currency:'Riyal (SR)', tz:'Asia/Riyadh', utcOffset:3, flag:'🇸🇦', color:'#16a34a', capLat:24.7, capLon:46.7 },
  { id:'MY', name:'Malásia', capital:'Kuala Lumpur', continent:'Ásia', population:33, area:330, language:'Malaio', currency:'Ringgit (RM)', tz:'Asia/Kuala_Lumpur', utcOffset:8, flag:'🇲🇾', color:'#dc2626', capLat:3.2, capLon:101.7 },
  { id:'GH', name:'Gana', capital:'Acra', continent:'África', population:33, area:239, language:'Inglês', currency:'Cedi Ganês', tz:'Africa/Accra', utcOffset:0, flag:'🇬🇭', color:'#dc2626', capLat:5.6, capLon:-0.2 },
  { id:'MZ', name:'Moçambique', capital:'Maputo', continent:'África', population:32, area:802, language:'Português', currency:'Metical (MT)', tz:'Africa/Maputo', utcOffset:2, flag:'🇲🇿', color:'#fbbf24', capLat:-25.9, capLon:32.6 },
  { id:'AU', name:'Austrália', capital:'Camberra', continent:'Oceania', population:26, area:7692, language:'Inglês', currency:'Dólar Australiano', tz:'Australia/Sydney', utcOffset:10, flag:'🇦🇺', color:'#1d4ed8', capLat:-35.3, capLon:149.1 },
  { id:'NP', name:'Nepal', capital:'Katmandu', continent:'Ásia', population:30, area:147, language:'Nepalês', currency:'Rúpia Nepalesa', tz:'Asia/Kathmandu', utcOffset:5.75, flag:'🇳🇵', color:'#dc2626', capLat:27.7, capLon:85.3 },
  { id:'IT', name:'Itália', capital:'Roma', continent:'Europa', population:60, area:301, language:'Italiano', currency:'Euro (€)', tz:'Europe/Rome', utcOffset:1, flag:'🇮🇹', color:'#16a34a', capLat:41.9, capLon:12.5 },
  { id:'PL', name:'Polônia', capital:'Varsóvia', continent:'Europa', population:38, area:313, language:'Polonês', currency:'Zloty (zł)', tz:'Europe/Warsaw', utcOffset:1, flag:'🇵🇱', color:'#dc2626', capLat:52.2, capLon:21.0 },
  { id:'MG', name:'Madagascar', capital:'Antananarivo', continent:'África', population:28, area:587, language:'Malgaxe/Francês', currency:'Ariary (Ar)', tz:'Indian/Antananarivo', utcOffset:3, flag:'🇲🇬', color:'#dc2626', capLat:-18.9, capLon:47.5 },
  { id:'CM', name:'Camarões', capital:'Yaoundé', continent:'África', population:27, area:475, language:'Francês/Inglês', currency:'Franco CFA', tz:'Africa/Douala', utcOffset:1, flag:'🇨🇲', color:'#16a34a', capLat:3.9, capLon:11.5 },
  { id:'CI', name:'Costa do Marfim', capital:'Yamoussoukro', continent:'África', population:27, area:322, language:'Francês', currency:'Franco CFA', tz:'Africa/Abidjan', utcOffset:0, flag:'🇨🇮', color:'#f97316', capLat:6.8, capLon:-5.3 },
  { id:'KP', name:'Coreia do Norte', capital:'Pyongyang', continent:'Ásia', population:26, area:121, language:'Coreano', currency:'Won (₩)', tz:'Asia/Pyongyang', utcOffset:9, flag:'🇰🇵', color:'#1d4ed8', capLat:39.0, capLon:125.8 },
  { id:'NG2', name:'Níger', capital:'Niamey', continent:'África', population:25, area:1267, language:'Francês', currency:'Franco CFA', tz:'Africa/Niamey', utcOffset:1, flag:'🇳🇪', color:'#f97316', capLat:13.5, capLon:2.1 },
]

// ─── Wonders & Points of Interest ────────────────────────────────────────────
interface POI { name: string; lat: number; lon: number; type: 'wonder'|'natural'|'city'; icon: string; desc: string }

const POIS: POI[] = [
  { name:'Muralha da China', lat:40.4, lon:116.6, type:'wonder', icon:'🏯', desc:'7.300 km de extensão. Construída entre séc. VII a.C. e XVII d.C. para proteger o império chinês.' },
  { name:'Machu Picchu', lat:-13.2, lon:-72.5, type:'wonder', icon:'🏛️', desc:'Cidadela inca do séc. XV nos Andes peruanos. Considerada uma das 7 Maravilhas do Mundo Moderno.' },
  { name:'Cristo Redentor', lat:-22.9, lon:-43.2, type:'wonder', icon:'✝️', desc:'Estátua de 30m no Rio de Janeiro, símbolo do Brasil. Uma das 7 Maravilhas do Mundo Moderno.' },
  { name:'Coliseu', lat:41.9, lon:12.5, type:'wonder', icon:'🏟️', desc:'Arena romana do séc. I d.C. com capacidade para 80.000 espectadores.' },
  { name:'Taj Mahal', lat:27.2, lon:78.0, type:'wonder', icon:'🕌', desc:'Mausoléu de mármore branco em Agra, Índia. Construído pelo imperador Shah Jahan em 1653.' },
  { name:'Chichén Itzá', lat:20.7, lon:-88.6, type:'wonder', icon:'🔺', desc:'Pirâmide maia no México. Centro de peregrinação e calendário astronômico preciso.' },
  { name:'Petra', lat:30.3, lon:35.4, type:'wonder', icon:'🏜️', desc:'Cidade esculpida na rocha na Jordânia. Capital do reino Nabateu por volta do séc. IV a.C.' },
  { name:'Monte Everest', lat:27.9, lon:86.9, type:'natural', icon:'🏔️', desc:'8.849m — o ponto mais alto da Terra. Primeira ascensão: Edmund Hillary e Tenzing Norgay em 1953.' },
  { name:'Amazônia', lat:-3.5, lon:-62.0, type:'natural', icon:'🌿', desc:'Maior floresta tropical do mundo: 5,5 milhões km². Abriga 10% de todas as espécies do planeta.' },
  { name:'Deserto do Saara', lat:23.0, lon:12.0, type:'natural', icon:'🏜️', desc:'Maior deserto quente do mundo: 9,2 milhões km². Temperaturas chegam a 57°C.' },
  { name:'Grande Barreira de Corais', lat:-18.0, lon:147.0, type:'natural', icon:'🐠', desc:'Maior estrutura viva da Terra: 2.300 km ao longo da costa australiana.' },
  { name:'Kilimanjaro', lat:-3.1, lon:37.4, type:'natural', icon:'🏔️', desc:'5.895m — o ponto mais alto da África. Vulcão inativo na Tanzânia.' },
  { name:'Lago Baikal', lat:53.5, lon:108.0, type:'natural', icon:'💧', desc:'Lago mais profundo do mundo: 1.642m. Contém 20% de toda a água doce superficial do planeta.' },
  { name:'Rio Amazonas', lat:-3.0, lon:-60.0, type:'natural', icon:'🌊', desc:'Maior rio do mundo em volume: descarrega 20% de toda a água doce dos oceanos.' },
  { name:'Antártida', lat:-90.0, lon:0.0, type:'natural', icon:'❄️', desc:'O continente mais frio: -89°C de mínima. Contém 70% da água doce do planeta congelada.' },
]

// ─── SVG Map Paths (simplified continents) ────────────────────────────────────
// Coordinate system: lon -180→180 mapped to x 0→1000, lat 90→-90 mapped to y 0→500
function lonToX(lon: number) { return ((lon + 180) / 360) * 1000 }
function latToY(lat: number) { return ((90 - lat) / 180) * 500 }

// Country shapes as simplified polygons [lon, lat][]
const COUNTRY_SHAPES: Record<string, [number,number][]> = {
  CN: [[73,53],[135,53],[135,18],[120,15],[110,18],[100,22],[98,28],[92,32],[78,36],[73,40]],
  IN: [[68,37],[78,36],[88,27],[97,28],[97,22],[80,8],[72,8],[68,23],[60,24]],
  US: [[-125,49],[-67,47],[-67,25],[-80,25],[-97,26],[-115,32],[-117,49]],
  BR: [[-73,-5],[-35,-5],[-35,-34],[-58,-34],[-73,-20],[-73,-5]],
  RU: [[32,70],[180,70],[180,50],[140,50],[105,52],[75,55],[55,60],[32,65]],
  CA: [[-140,70],[-60,70],[-60,45],[-83,42],[-100,49],[-120,49],[-140,60]],
  AU: [[114,-22],[154,-22],[154,-40],[135,-40],[115,-35],[114,-25]],
  AR: [[-73,-22],[-53,-22],[-53,-55],[-68,-55],[-73,-40]],
  DE: [[6,55],[15,55],[15,47],[6,47]],
  FR: [[-5,51],[8,51],[8,43],[-2,43],[-5,47]],
  GB: [[-6,59],[2,59],[2,51],[-5,50],[-6,54]],
  JP: [[130,45],[145,45],[145,31],[130,31]],
  MX: [[-117,32],[-86,21],[-87,15],[-92,18],[-100,20],[-105,25],[-117,30]],
  NG: [[3,14],[15,14],[15,4],[3,4]],
  SA: [[37,32],[55,28],[56,22],[50,12],[40,12],[37,18]],
  ZA: [[17,-22],[33,-22],[33,-35],[17,-35]],
  EG: [[25,32],[36,32],[36,22],[25,22]],
  ET: [[33,15],[48,15],[48,4],[33,4]],
  TR: [[26,42],[45,42],[45,36],[26,36]],
  IR: [[44,39],[64,39],[62,25],[44,28]],
  ID: [[95,-5],[141,-5],[141,-10],[95,-10]],
  PK: [[60,37],[78,37],[75,24],[60,24]],
  BD: [[88,26],[92,26],[92,21],[88,21]],
  PH: [[117,20],[126,20],[126,5],[117,5]],
  VN: [[102,24],[110,24],[110,8],[102,8]],
  TH: [[97,21],[106,21],[106,6],[97,6]],
  MM: [[92,28],[101,28],[101,10],[92,10]],
  KR: [[126,38],[130,38],[130,34],[126,34]],
  KP: [[124,43],[130,43],[130,38],[124,38]],
  MA: [[-17,36],[-1,36],[-1,28],[-17,28]],
  TZ: [[29,-1],[40,-1],[40,-12],[29,-12]],
  CD: [[12,-5],[32,-5],[32,-14],[12,-14]],
  PE: [[-82,-1],[-68,-1],[-68,-18],[-82,-18]],
  CO: [[-78,12],[-66,12],[-66,0],[-78,0]],
  VE: [[-73,12],[-60,12],[-60,4],[-73,4]],
  ES: [[-9,44],[4,44],[4,36],[-9,36]],
  IT: [[7,47],[18,47],[18,37],[7,37]],
  PL: [[14,55],[24,55],[24,49],[14,49]],
  UA: [[22,53],[40,53],[40,44],[22,44]],
  MY: [[100,7],[119,7],[119,1],[100,1]],
  UG: [[29,5],[35,5],[35,-1],[29,-1]],
  KE: [[34,5],[42,5],[42,-5],[34,-5]],
  GH: [[-3,11],[1,11],[1,5],[-3,5]],
  MZ: [[32,-10],[41,-10],[41,-26],[32,-26]],
  MG: [[44,-12],[50,-12],[50,-26],[44,-26]],
  CM: [[8,13],[16,13],[16,2],[8,2]],
  IQ: [[39,38],[48,38],[48,29],[39,29]],
  NP: [[80,30],[88,30],[88,26],[80,26]],
  AU2: [[114,-10],[136,-10],[136,-25],[114,-25]], // Northern Australia
}

// ─── Layer Types ──────────────────────────────────────────────────────────────
type LayerType = 'countries' | 'daynight' | 'timezones' | 'seasons' | 'wonders' | 'capitals'

// ─── Utilities ────────────────────────────────────────────────────────────────
function getLocalTime(utcOffset: number): string {
  const now = new Date()
  const utc = now.getTime() + now.getTimezoneOffset() * 60000
  const local = new Date(utc + utcOffset * 3600000)
  return local.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function getSunLongitude(date: Date): number {
  const utcH = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600
  return ((180 - utcH * 15) + 360) % 360 - 180
}

function getBrasiliaOffset(): number { return -3 }

// ─── Main Atlas Component ─────────────────────────────────────────────────────
export default function AtlasGlobal() {
  const [now, setNow] = useState(new Date())
  const [layer, setLayer] = useState<LayerType>('countries')
  const [hoveredCountry, setHoveredCountry] = useState<Country | null>(null)
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null)
  const [hoveredPOI, setHoveredPOI] = useState<POI | null>(null)
  const [hoveredCapital, setHoveredCapital] = useState<Country | null>(null)
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 })
  const [showGrid, setShowGrid] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const timerRef = useRef<ReturnType<typeof setInterval>>()

  useEffect(() => {
    timerRef.current = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timerRef.current)
  }, [])

  const sunLon = getSunLongitude(now)
  const sunX = lonToX(sunLon)

  // Ocean background + day/night gradient
  const dayPct = Math.round(((sunLon + 180) / 360) * 100)

  // Season hemispheres
  const m = now.getMonth() + 1, d = now.getDate()
  let northSeason = '', southSeason = ''
  if (m === 12 && d >= 21 || m <= 3 && !(m===3&&d>20)) { northSeason='❄️ Inverno'; southSeason='☀️ Verão' }
  else if (m>=3&&m<=6&&!(m===6&&d>20)&&!(m===3&&d<21)) { northSeason='🌸 Primavera'; southSeason='🍂 Outono' }
  else if (m>=6&&m<=9&&!(m===9&&d>22)&&!(m===6&&d<21)) { northSeason='☀️ Verão'; southSeason='❄️ Inverno' }
  else { northSeason='🍂 Outono'; southSeason='🌸 Primavera' }

  const LAYERS: { id: LayerType; icon: string; label: string }[] = [
    { id: 'countries',  icon: '🌍', label: 'Países' },
    { id: 'daynight',   icon: '🌞', label: 'Dia/Noite' },
    { id: 'timezones',  icon: '🕐', label: 'Fusos' },
    { id: 'seasons',    icon: '🌸', label: 'Estações' },
    { id: 'capitals',   icon: '🏛️', label: 'Capitais' },
    { id: 'wonders',    icon: '⭐', label: 'Maravilhas' },
  ]

  function getCountryFill(c: Country): string {
    if (selectedCountry?.id === c.id) return '#fbbf24'
    if (hoveredCountry?.id === c.id) return '#60a5fa'
    if (layer === 'timezones') {
      const hue = ((c.utcOffset + 12) / 24) * 280
      return `hsl(${hue},60%,35%)`
    }
    if (layer === 'seasons') {
      const isNorth = c.capLat > 0
      if (northSeason.includes('Verão') && isNorth) return '#f97316'
      if (northSeason.includes('Inverno') && isNorth) return '#3b82f6'
      if (northSeason.includes('Primavera') && isNorth) return '#22c55e'
      if (northSeason.includes('Outono') && isNorth) return '#d97706'
      if (!isNorth && southSeason.includes('Verão')) return '#f97316'
      if (!isNorth && southSeason.includes('Inverno')) return '#3b82f6'
      if (!isNorth && southSeason.includes('Primavera')) return '#22c55e'
      return '#d97706'
    }
    return c.color
  }

  const handleSVGMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
  }, [])

  function polyPoints(coords: [number,number][]): string {
    return coords.map(([lon, lat]) => `${lonToX(lon)},${latToY(lat)}`).join(' ')
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%' }}>

      {/* Layer toolbar */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', padding: '10px 0 12px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', marginRight: 4 }}>Camada:</span>
        {LAYERS.map(l => (
          <button key={l.id} onClick={() => { setLayer(l.id); setSelectedCountry(null) }}
            style={{ padding: '5px 12px', borderRadius: 20, border: `1px solid ${layer === l.id ? 'rgba(96,165,250,0.6)' : 'var(--border)'}`, background: layer === l.id ? 'rgba(96,165,250,0.12)' : 'transparent', color: layer === l.id ? '#60a5fa' : 'var(--text-muted)', fontSize: '0.72rem', fontWeight: layer === l.id ? 700 : 400, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, transition: 'all 0.15s' }}>
            {l.icon} {l.label}
          </button>
        ))}
        <button onClick={() => setShowGrid(g => !g)}
          style={{ marginLeft: 'auto', padding: '5px 10px', borderRadius: 20, border: `1px solid ${showGrid ? 'rgba(52,211,153,0.4)' : 'var(--border)'}`, background: showGrid ? 'rgba(52,211,153,0.08)' : 'transparent', color: showGrid ? '#34d399' : 'var(--text-muted)', fontSize: '0.68rem', cursor: 'pointer' }}>
          ⊞ Grade
        </button>
      </div>

      <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0 }}>

        {/* MAP */}
        <div style={{ flex: 1, position: 'relative', borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border)', background: '#0a1628' }}>
          <svg ref={svgRef} viewBox="0 0 1000 500" style={{ width: '100%', height: '100%', cursor: 'crosshair', display: 'block' }}
            onMouseMove={handleSVGMouseMove}
            onMouseLeave={() => { setHoveredCountry(null); setHoveredPOI(null); setHoveredCapital(null) }}>

            <defs>
              <radialGradient id="oceanGrad" cx="50%" cy="50%">
                <stop offset="0%" stopColor="#0d3b6e"/>
                <stop offset="100%" stopColor="#061a33"/>
              </radialGradient>
              <linearGradient id="dayNightGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="rgba(255,200,50,0.08)"/>
                <stop offset="45%" stopColor="rgba(255,200,50,0.0)"/>
                <stop offset="55%" stopColor="rgba(0,0,20,0.0)"/>
                <stop offset="100%" stopColor="rgba(0,0,20,0.6)"/>
              </linearGradient>
              <filter id="glow">
                <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
                <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>

            {/* Ocean */}
            <rect width="1000" height="500" fill="url(#oceanGrad)"/>

            {/* Latitude/longitude grid */}
            {showGrid && <>
              {[-60,-30,0,30,60].map(lat => (
                <line key={lat} x1={0} y1={latToY(lat)} x2={1000} y2={latToY(lat)} stroke="rgba(96,165,250,0.15)" strokeWidth={lat===0?1.5:0.5} strokeDasharray={lat===0?'':'4,4'}/>
              ))}
              {[-150,-120,-90,-60,-30,0,30,60,90,120,150].map(lon => (
                <line key={lon} x1={lonToX(lon)} y1={0} x2={lonToX(lon)} y2={500} stroke="rgba(96,165,250,0.12)" strokeWidth={0.5} strokeDasharray="4,4"/>
              ))}
              <text x={lonToX(0)+3} y={latToY(0)-4} fill="rgba(96,165,250,0.4)" fontSize={8}>Equador</text>
              <text x={lonToX(0)+3} y={latToY(23.5)-4} fill="rgba(96,165,250,0.3)" fontSize={7}>Trópico de Câncer</text>
              <text x={lonToX(0)+3} y={latToY(-23.5)+10} fill="rgba(96,165,250,0.3)" fontSize={7}>Trópico de Capricórnio</text>
            </>}

            {/* Day/Night overlay */}
            {(layer === 'daynight' || layer === 'countries' || layer === 'timezones') && (
              <>
                {/* Night side — left of terminator */}
                <rect width={sunX} height={500} fill="rgba(0,0,20,0.55)"/>
                {/* Terminator glow */}
                <line x1={sunX} y1={0} x2={sunX} y2={500} stroke="rgba(255,200,50,0.3)" strokeWidth={3}/>
                <line x1={sunX} y1={0} x2={sunX} y2={500} stroke="rgba(255,220,100,0.12)" strokeWidth={12}/>
                {/* Sun position marker */}
                {layer === 'daynight' && (
                  <g transform={`translate(${sunX},${latToY(0)})`} filter="url(#glow)">
                    <circle r={14} fill="rgba(255,220,50,0.15)" stroke="rgba(255,220,50,0.4)" strokeWidth={1.5}/>
                    <circle r={7} fill="rgba(255,220,50,0.7)"/>
                    <text x={0} y={4} textAnchor="middle" fontSize={10} fill="#fff">☀</text>
                  </g>
                )}
              </>
            )}

            {/* Country shapes */}
            {COUNTRIES.map(country => {
              const shape = COUNTRY_SHAPES[country.id]
              if (!shape) return null
              const fill = getCountryFill(country)
              const isHovered = hoveredCountry?.id === country.id
              return (
                <polygon key={country.id}
                  points={polyPoints(shape)}
                  fill={fill}
                  fillOpacity={isHovered ? 0.9 : 0.75}
                  stroke={isHovered ? '#fff' : 'rgba(255,255,255,0.2)'}
                  strokeWidth={isHovered ? 1.5 : 0.5}
                  style={{ cursor: 'pointer', transition: 'fill 0.2s, fill-opacity 0.2s' }}
                  onMouseEnter={() => setHoveredCountry(country)}
                  onClick={() => setSelectedCountry(country === selectedCountry ? null : country)}
                />
              )
            })}

            {/* Season overlay */}
            {layer === 'seasons' && (
              <>
                <text x={500} y={30} textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize={13} fontWeight="bold">🌍 Hemisfério Norte: {northSeason}</text>
                <text x={500} y={490} textAnchor="middle" fill="rgba(255,255,255,0.6)" fontSize={13} fontWeight="bold">🌏 Hemisfério Sul: {southSeason}</text>
                <line x1={0} y1={latToY(0)} x2={1000} y2={latToY(0)} stroke="rgba(255,255,255,0.3)" strokeWidth={1.5} strokeDasharray="8,4"/>
              </>
            )}

            {/* POI Wonders */}
            {(layer === 'wonders' || layer === 'countries') && POIS.map((poi, i) => (
              <g key={i} transform={`translate(${lonToX(poi.lon)},${latToY(poi.lat)})`}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoveredPOI(poi)}
                onMouseLeave={() => setHoveredPOI(null)}>
                <circle r={hoveredPOI?.name === poi.name ? 10 : 7}
                  fill={poi.type === 'wonder' ? 'rgba(251,191,36,0.85)' : poi.type === 'natural' ? 'rgba(52,211,153,0.85)' : 'rgba(96,165,250,0.85)'}
                  stroke="#fff" strokeWidth={1}
                  style={{ transition: 'r 0.15s' }}/>
                <text x={0} y={4} textAnchor="middle" fontSize={hoveredPOI?.name === poi.name ? 9 : 7} fill="#fff">{poi.icon}</text>
              </g>
            ))}

            {/* Capitals */}
            {(layer === 'capitals' || layer === 'timezones') && COUNTRIES.map(c => (
              <g key={c.id + '_cap'} transform={`translate(${lonToX(c.capLon)},${latToY(c.capLat)})`}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHoveredCapital(c)}
                onMouseLeave={() => setHoveredCapital(null)}
                onClick={() => setSelectedCountry(c)}>
                <circle r={hoveredCapital?.id === c.id ? 7 : 4}
                  fill={hoveredCapital?.id === c.id ? '#fbbf24' : 'rgba(255,255,255,0.85)'}
                  stroke={c.color} strokeWidth={1.5}
                  style={{ transition: 'all 0.15s' }}/>
                {hoveredCapital?.id === c.id && (
                  <text x={6} y={-6} fontSize={8} fill="#fbbf24" fontWeight="bold" stroke="#000" strokeWidth={0.3}>{c.capital}</text>
                )}
              </g>
            ))}

            {/* Timezone labels */}
            {layer === 'timezones' && [-12,-9,-6,-3,0,3,6,9,12].map(tz => (
              <g key={tz}>
                <text x={lonToX(tz * 15)} y={15} textAnchor="middle" fontSize={8} fill="rgba(255,255,255,0.5)">UTC{tz >= 0 ? '+' : ''}{tz}</text>
                <line x1={lonToX(tz * 15)} y1={20} x2={lonToX(tz * 15)} y2={490} stroke="rgba(255,255,255,0.06)" strokeWidth={0.5}/>
              </g>
            ))}

            {/* Country labels for hovered */}
            {hoveredCountry && (() => {
              const shape = COUNTRY_SHAPES[hoveredCountry.id]
              if (!shape) return null
              const avgLon = shape.reduce((a,c) => a + c[0], 0) / shape.length
              const avgLat = shape.reduce((a,c) => a + c[1], 0) / shape.length
              return (
                <text x={lonToX(avgLon)} y={latToY(avgLat)} textAnchor="middle" dominantBaseline="middle"
                  fontSize={9} fill="#fff" fontWeight="bold" stroke="#000" strokeWidth={0.4} style={{ pointerEvents: 'none' }}>
                  {hoveredCountry.flag}
                </text>
              )
            })()}

            {/* Day/Night info overlay */}
            {layer === 'daynight' && (
              <>
                <rect x={5} y={460} width={180} height={35} rx={6} fill="rgba(0,0,0,0.5)"/>
                <text x={15} y={475} fontSize={9} fill="#fbbf24">☀️ Dia: ~{100 - Math.round(Math.abs(sunLon) / 180 * 50)}% da Terra</text>
                <text x={15} y={490} fontSize={9} fill="#60a5fa">🌙 Noite: ~{Math.round(Math.abs(sunLon) / 180 * 50)}% da Terra</text>
              </>
            )}

          </svg>

          {/* Hovering tooltip — POI */}
          {hoveredPOI && (
            <div style={{ position: 'absolute', left: Math.min(mousePos.x + 12, 500), top: Math.max(mousePos.y - 60, 8), maxWidth: 240, padding: '10px 14px', borderRadius: 12, background: 'rgba(10,22,40,0.95)', border: '1px solid rgba(251,191,36,0.4)', backdropFilter: 'blur(8px)', zIndex: 10, pointerEvents: 'none' }}>
              <div style={{ fontWeight: 800, fontSize: '0.82rem', color: '#fbbf24', marginBottom: 4 }}>{hoveredPOI.icon} {hoveredPOI.name}</div>
              <div style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>{hoveredPOI.desc}</div>
            </div>
          )}

          {/* Hovering tooltip — Capital */}
          {hoveredCapital && !hoveredPOI && (
            <div style={{ position: 'absolute', left: Math.min(mousePos.x + 12, 500), top: Math.max(mousePos.y - 80, 8), minWidth: 180, padding: '10px 14px', borderRadius: 12, background: 'rgba(10,22,40,0.95)', border: '1px solid rgba(251,191,36,0.4)', backdropFilter: 'blur(8px)', zIndex: 10, pointerEvents: 'none' }}>
              <div style={{ fontWeight: 800, fontSize: '0.85rem', color: '#fbbf24', marginBottom: 6 }}>{hoveredCapital.flag} {hoveredCapital.capital}</div>
              <div style={{ fontFamily: 'monospace', fontSize: '1rem', fontWeight: 900, color: '#34d399', marginBottom: 4 }}>{getLocalTime(hoveredCapital.utcOffset)}</div>
              <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.6)' }}>UTC{hoveredCapital.utcOffset >= 0 ? '+' : ''}{hoveredCapital.utcOffset} · {hoveredCapital.name}</div>
              <div style={{ fontSize: '0.62rem', color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>
                {hoveredCapital.utcOffset - getBrasiliaOffset() >= 0 ? '+' : ''}{hoveredCapital.utcOffset - getBrasiliaOffset()}h em relação a Brasília
              </div>
            </div>
          )}

          {/* Hovering tooltip — Country */}
          {hoveredCountry && !hoveredPOI && !hoveredCapital && (
            <div style={{ position: 'absolute', left: Math.min(mousePos.x + 12, 500), top: Math.max(mousePos.y - 40, 8), padding: '8px 12px', borderRadius: 10, background: 'rgba(10,22,40,0.92)', border: '1px solid rgba(96,165,250,0.3)', backdropFilter: 'blur(6px)', zIndex: 10, pointerEvents: 'none' }}>
              <div style={{ fontWeight: 700, fontSize: '0.8rem', color: '#fff' }}>{hoveredCountry.flag} {hoveredCountry.name}</div>
              <div style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.55)', marginTop: 2 }}>{hoveredCountry.capital} · {hoveredCountry.continent}</div>
              {layer === 'timezones' && <div style={{ fontFamily: 'monospace', color: '#34d399', fontSize: '0.75rem', marginTop: 3 }}>{getLocalTime(hoveredCountry.utcOffset)} · UTC{hoveredCountry.utcOffset >= 0 ? '+' : ''}{hoveredCountry.utcOffset}</div>}
            </div>
          )}

          {/* Map legend */}
          <div style={{ position: 'absolute', bottom: 10, right: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: '0.55rem', color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace' }}>🌕 País · ⭐ Maravilha · 🟢 Natural · 🔵 Capital</span>
          </div>
        </div>

        {/* SIDE PANEL */}
        <div style={{ width: 260, display: 'flex', flexDirection: 'column', gap: 12, overflowY: 'auto' }}>

          {/* Selected Country */}
          {selectedCountry ? (
            <div style={{ borderRadius: 14, border: '1px solid rgba(96,165,250,0.3)', background: 'var(--card-bg)', overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', background: `linear-gradient(135deg,${selectedCountry.color}22,transparent)`, borderBottom: '1px solid var(--border)' }}>
                <div style={{ fontSize: '2rem', marginBottom: 4 }}>{selectedCountry.flag}</div>
                <div style={{ fontWeight: 900, fontSize: '1.1rem', color: 'var(--text-primary)' }}>{selectedCountry.name}</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{selectedCountry.continent}</div>
              </div>
              <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[
                  { l: '🏛️ Capital', v: selectedCountry.capital },
                  { l: '👥 População', v: `${selectedCountry.population}M hab.` },
                  { l: '📐 Área', v: `${selectedCountry.area.toLocaleString('pt-BR')} km²` },
                  { l: '🗣️ Idioma', v: selectedCountry.language },
                  { l: '💰 Moeda', v: selectedCountry.currency },
                  { l: '🕐 Fuso', v: `UTC${selectedCountry.utcOffset >= 0 ? '+' : ''}${selectedCountry.utcOffset}` },
                  { l: '⏰ Hora local', v: getLocalTime(selectedCountry.utcOffset) },
                  { l: '↔️ vs Brasília', v: `${selectedCountry.utcOffset - getBrasiliaOffset() >= 0 ? '+' : ''}${selectedCountry.utcOffset - getBrasiliaOffset()}h` },
                ].map(item => (
                  <div key={item.l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem' }}>
                    <span style={{ color: 'var(--text-muted)' }}>{item.l}</span>
                    <span style={{ fontWeight: 700, color: 'var(--text-primary)', textAlign: 'right', maxWidth: 130 }}>{item.v}</span>
                  </div>
                ))}
                <button onClick={() => setSelectedCountry(null)} style={{ marginTop: 6, padding: '6px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: '0.7rem', cursor: 'pointer' }}>✕ Fechar</button>
              </div>
            </div>
          ) : (
            <div style={{ borderRadius: 14, border: '1px solid var(--border)', background: 'var(--card-bg)', padding: '14px 16px' }}>
              <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Atlas Global</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                Clique em um país ou capital para ver informações detalhadas.
              </div>
              <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {LAYERS.map(l => (
                  <button key={l.id} onClick={() => setLayer(l.id)}
                    style={{ padding: '6px 10px', borderRadius: 8, border: `1px solid ${layer === l.id ? 'rgba(96,165,250,0.4)' : 'var(--border)'}`, background: layer === l.id ? 'rgba(96,165,250,0.08)' : 'transparent', color: layer === l.id ? '#60a5fa' : 'var(--text-muted)', fontSize: '0.7rem', cursor: 'pointer', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {l.icon} {l.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Live UTC time */}
          <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card-bg)', padding: '12px 14px' }}>
            <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>🌐 Tempo Real</div>
            <div style={{ fontFamily: 'monospace', fontWeight: 900, fontSize: '1rem', color: '#34d399' }}>{now.toLocaleTimeString('pt-BR')} BRT</div>
            <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 2 }}>{now.toUTCString().split(' ').slice(-2,1).join(' ').replace('GMT','UTC').slice(0,-3)} UTC</div>
            <div style={{ fontFamily: 'monospace', fontSize: '0.72rem', color: '#60a5fa', marginTop: 2 }}>{getLocalTime(0).slice(0,5)} UTC</div>
          </div>

          {/* Layer info */}
          {layer === 'daynight' && (
            <div style={{ borderRadius: 12, border: '1px solid rgba(251,191,36,0.25)', background: 'rgba(251,191,36,0.05)', padding: '12px 14px' }}>
              <div style={{ fontSize: '0.6rem', color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>☀️ Sol · Agora</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                <div>Longitude solar: <strong style={{ color: '#fbbf24' }}>{sunLon.toFixed(1)}°</strong></div>
                <div>UTC: <strong style={{ color: '#fbbf24' }}>{now.toLocaleTimeString('pt-BR', { timeZone: 'UTC' })}</strong></div>
              </div>
            </div>
          )}

          {layer === 'seasons' && (
            <div style={{ borderRadius: 12, border: '1px solid var(--border)', background: 'var(--card-bg)', padding: '12px 14px' }}>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>Estações Atuais</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ padding: '8px 10px', borderRadius: 9, background: 'rgba(96,165,250,0.06)', border: '1px solid rgba(96,165,250,0.2)' }}>
                  <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Hemisfério Norte</div>
                  <div style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--text-primary)', marginTop: 2 }}>{northSeason}</div>
                </div>
                <div style={{ padding: '8px 10px', borderRadius: 9, background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.2)' }}>
                  <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>Hemisfério Sul</div>
                  <div style={{ fontWeight: 800, fontSize: '0.88rem', color: 'var(--text-primary)', marginTop: 2 }}>{southSeason}</div>
                </div>
              </div>
            </div>
          )}

          {/* POI detail */}
          {layer === 'wonders' && !selectedCountry && (
            <div style={{ borderRadius: 12, border: '1px solid rgba(251,191,36,0.2)', background: 'var(--card-bg)', padding: '12px 14px' }}>
              <div style={{ fontSize: '0.6rem', color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8 }}>Pontos de Interesse</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {POIS.slice(0, 6).map((poi, i) => (
                  <div key={i} style={{ fontSize: '0.68rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>{poi.icon}</span> {poi.name}
                  </div>
                ))}
                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginTop: 2 }}>Passe o mouse nos marcadores do mapa</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
