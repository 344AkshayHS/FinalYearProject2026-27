// How farmers really type in the crop helper chat, so the app's own answers (used when the LLM is not
// available) still understand them: Kannada typed in English letters ("togari ge eshtu neeru beku"),
// Hindi words many farmers in Karnataka use ("pani", "khad"), English typed fast on a phone ("watr",
// "fertlizer") and whole phrases ("yaava bele hakali" = which crop should I sow).
//
// normaliseQuestion() rewrites a question into the plain English words the chat logic looks for, so
// "togari ge eshtu neeru beku" becomes "togari how much water need". Crop names are not rewritten here:
// CROP_SPELLINGS below lists them for the crop search in chatbot.ts.

// Whole phrases first (several words, matched as whole words), longest first
const PHRASES: [string, string][] = [
  // "What should I grow?" - the farmer's own result answers it
  ['yaava bele hakali', 'what should i grow'], ['yava bele hakali', 'what should i grow'],
  ['yaava bele hakabeku', 'what should i grow'], ['yava bele hakabeku', 'what should i grow'],
  ['yaava bele beleyali', 'what should i grow'], ['yava bele beleyali', 'what should i grow'],
  ['yaava bele beleyabeku', 'what should i grow'], ['yava bele beleyabeku', 'what should i grow'],
  ['yaava bele olledu', 'what should i grow'], ['yava bele olledu', 'what should i grow'],
  ['yaava bele sari', 'what should i grow'], ['yava bele sari', 'what should i grow'],
  ['yenu beleyali', 'what should i grow'], ['enu beleyali', 'what should i grow'], ['yenu belili', 'what should i grow'],
  ['yenu hakali', 'what should i grow'], ['enu hakali', 'what should i grow'], ['yenu beleyabeku', 'what should i grow'],
  ['nanna jameenige', 'what should i grow'], ['nanna jaminige', 'what should i grow'], ['nanna holakke', 'what should i grow'],
  ['nanna tota', 'what should i grow'],
  ['konsa fasal', 'what should i grow'], ['kaunsi fasal', 'what should i grow'], ['kya ugaye', 'what should i grow'],
  ['kya lagaye', 'what should i grow'], ['kya bove', 'what should i grow'],
  ['which crop is good', 'what should i grow'], ['wich crop', 'what should i grow'], ['which crop', 'what should i grow'],
  ['what to grow', 'what should i grow'], ['wat to grow', 'what should i grow'], ['what to plant', 'what should i grow'],
  ['what to sow', 'what should i grow'], ['wat crop', 'what should i grow'], ['what crop', 'what should i grow'],
  ['best crop', 'what should i grow'], ['good crop', 'what should i grow'], ['suitable crop', 'what should i grow'],
  ['my land', 'what should i grow'], ['my field', 'what should i grow'], ['my farm', 'what should i grow'],
  // "Can I grow X here?"
  ['beleyabahuda', 'can i grow'], ['beleyabahude', 'can i grow'], ['beleyabahudu', 'can i grow'],
  ['beleyalu agutta', 'can i grow'], ['beleyoke agutta', 'can i grow'], ['belelu agutta', 'can i grow'],
  ['hakabahuda', 'can i grow'], ['hakbahuda', 'can i grow'], ['illi agutta', 'can i grow'], ['illi aagutta', 'can i grow'],
  ['uga sakte', 'can i grow'], ['uga sakta', 'can i grow'], ['laga sakte', 'can i grow'],
  // how much water, when to sow, how many days
  ['eshtu neeru', 'how much water'], ['estu neeru', 'how much water'], ['yeshtu neeru', 'how much water'],
  ['kitna pani', 'how much water'], ['kitna paani', 'how much water'],
  ['yavaga bittabeku', 'when sow'], ['yaavaga bittabeku', 'when sow'], ['kab boye', 'when sow'], ['kab bona', 'when sow'],
  ['eshtu dina', 'how many days'], ['estu dina', 'how many days'], ['eshtu tingalu', 'how many months'],
  ['kitne din', 'how many days'], ['kitne mahine', 'how many months'],
  ['beeja pramana', 'seed rate'], ['bija pramana', 'seed rate'], ['beej dar', 'seed rate'],
  ['kottige gobbara', 'manure'], ['gobbar gobbara', 'manure'],
];

// Single words: Kannada in English letters, Hindi, and common misspellings -> the word the chat looks for
const WORDS: Record<string, string> = {
  // water
  neeru: 'water', niru: 'water', neer: 'water', nir: 'water', neerige: 'water', neerina: 'water',
  pani: 'water', paani: 'water', jal: 'water', jala: 'water',
  watr: 'water', wter: 'water', watar: 'water', woter: 'water', warer: 'water', wateer: 'water', waterr: 'water',
  waater: 'water', wtr: 'water', wataer: 'water', watter: 'water', vater: 'water',
  neeravari: 'irrigation', niravari: 'irrigation', sinchai: 'irrigation', irigation: 'irrigation',
  irrigtion: 'irrigation', irrigaton: 'irrigation', irigashan: 'irrigation', irrigashan: 'irrigation',
  // sowing and planting
  bittane: 'sowing', bitthane: 'sowing', bitane: 'sowing', bittanege: 'sowing', bittu: 'sow', bittabeku: 'sow',
  bittbeku: 'sow', bittodu: 'sow', bitti: 'sow', bittalu: 'sow', naati: 'planting', nati: 'planting',
  naatti: 'planting', nedu: 'plant', nettu: 'plant', nedabeku: 'plant', nedodu: 'plant',
  bowai: 'sowing', buvai: 'sowing', bijai: 'sowing', ropai: 'planting', lagana: 'plant', lagao: 'plant',
  sowin: 'sowing', soing: 'sowing', sowng: 'sowing', sowning: 'sowing', showing: 'sowing', shoing: 'sowing',
  sowe: 'sow', sowd: 'sow', plantin: 'planting', planing: 'planting', plantng: 'planting', palnt: 'plant',
  // when, how much, how
  yavaga: 'when', yaavaga: 'when', yavag: 'when', yavaaga: 'when', kab: 'when', wen: 'when', whn: 'when', wehn: 'when',
  eshtu: 'how much', estu: 'how much', yeshtu: 'how much', eshto: 'how much', kitna: 'how much', kitni: 'how much',
  kitne: 'how many', hege: 'how', hengey: 'how', kaise: 'how', hw: 'how', howw: 'how',
  wat: 'what', wht: 'what', waht: 'what', whta: 'what', yenu: 'what', enu: 'what', kya: 'what',
  mch: 'much', muh: 'much', mutch: 'much', beku: 'need', bekagutte: 'need', chahiye: 'need', ned: 'need', nead: 'need',
  // harvest and time
  kataavu: 'harvest', katavu: 'harvest', katau: 'harvest', koylu: 'harvest', koyilu: 'harvest', koyyu: 'harvest',
  koyya: 'harvest', katai: 'harvest', kataai: 'harvest', harvst: 'harvest', harvist: 'harvest', havest: 'harvest',
  harwest: 'harvest', harvset: 'harvest', hervest: 'harvest', harvestng: 'harvest', harvesting: 'harvest',
  dina: 'days', dinagalu: 'days', dinakke: 'days', din: 'days', dayz: 'days', dys: 'days', dayss: 'days',
  tingalu: 'months', thingalu: 'months', tingalige: 'months', mahina: 'months', mahine: 'months', mahino: 'months',
  mnths: 'months', monts: 'months', munths: 'months', mounths: 'months',
  varsha: 'years', varusha: 'years', varshagalu: 'years', saal: 'years', yers: 'years', yeers: 'years',
  kaala: 'time', avadhi: 'duration', samaya: 'time', samay: 'time', tym: 'time', tyme: 'time',
  // seed, spacing, fertiliser
  beeja: 'seed', bija: 'seed', beej: 'seed', beejaa: 'seed', bij: 'seed', sed: 'seed', seedz: 'seeds', seads: 'seeds',
  antara: 'spacing', antar: 'spacing', spaceing: 'spacing', spasing: 'spacing', spacng: 'spacing', gap: 'spacing',
  gobbara: 'fertilizer', gobra: 'fertilizer', gobbar: 'fertilizer', rasagobbara: 'fertilizer', khad: 'fertilizer',
  khaad: 'fertilizer', khaat: 'fertilizer', dap: 'fertilizer', npk: 'fertilizer', fertlizer: 'fertilizer',
  ferilizer: 'fertilizer', fertilzer: 'fertilizer', fartilizer: 'fertilizer', pertilizer: 'fertilizer',
  fertiliser: 'fertilizer', fertilizar: 'fertilizer', fertlizr: 'fertilizer', fertiizer: 'fertilizer',
  gobar: 'manure', compost: 'manure', kampost: 'manure', gobbaragundi: 'manure',
  // season
  hangamu: 'season', hangaam: 'season', hangamina: 'season', mausam: 'season', mosam: 'season',
  seson: 'season', sesson: 'season', seasen: 'season', sezon: 'season', seasn: 'season', saison: 'season',
  mungaru: 'kharif season', mungar: 'kharif season', hingaru: 'rabi season', hingar: 'rabi season',
  besige: 'summer season', bisilu: 'summer season', kharip: 'kharif', karif: 'kharif', rabbi: 'rabi',
  // name
  naam: 'name', namme: 'name', nam: 'name', neme: 'name',
  // not in the app: pests, diseases, prices, loans, insurance
  keeta: 'pest', keetagalu: 'pest', kita: 'pest', keeda: 'pest', kida: 'pest', hula: 'pest', hulu: 'pest',
  roga: 'disease', rog: 'disease', bimari: 'disease', beemari: 'disease', desease: 'disease',
  diseas: 'disease', disese: 'disease', aushadhi: 'pesticide', oushadhi: 'pesticide', dawa: 'pesticide',
  dava: 'pesticide', spre: 'spray', sprey: 'spray', pestiside: 'pesticide', pestisid: 'pesticide',
  dhara: 'price', dara: 'price', daam: 'price', kimmat: 'price', bhav: 'price', bhaav: 'price',
  prise: 'price', prize: 'price', rete: 'price', maarukatte: 'market', marukatte: 'market', mandi: 'market',
  maarket: 'market', markit: 'market', saala: 'loan', sala: 'loan', karz: 'loan', karja: 'loan', lone: 'loan',
  sahayadhana: 'subsidy', anudana: 'subsidy', subsidi: 'subsidy', vime: 'insurance', bima: 'insurance',
  // everyday fillers farmers add, which carry no meaning for the answer
  sir: '', madam: '', anna: '', akka: '', ji: '', bro: '', guru: '', swamy: '', plz: '', pls: '', please: '',
  ge: '', ige: '', kke: '', ke: '', ka: '', ki: '', ko: '', na: '', nu: '', ri: '', re: '',
};

// Kannada crop names typed in English letters, Hindi names, and short English names often misspelled
export const CROP_SPELLINGS: Record<string, string[]> = {
  rice: ['bhatta', 'batta', 'bhattha', 'akki', 'paddy', 'padi', 'paddi', 'rise', 'ryce', 'dhan', 'dhaan', 'chawal', 'nellu'],
  ragi: ['raagi', 'ragy', 'ragee', 'nachni', 'mandua', 'finger millet'],
  jowar: ['jola', 'jowla', 'jolada', 'jwar', 'jawar', 'jowari', 'juwar', 'jonna', 'sorgam', 'sorghum'],
  maize: ['mekkejola', 'mekke jola', 'musukina jola', 'maze', 'maiz', 'makka', 'makkai', 'makai', 'corn', 'bhutta'],
  bajra: ['sajje', 'bajri', 'bajara', 'pearl millet'],
  wheat: ['godhi', 'godi', 'weat', 'wheet', 'gehu', 'gehun', 'gahu'],
  groundnut: ['shenga', 'sheng', 'kadalekai', 'kadale kai', 'kadlekai', 'nelagadale', 'moongphali', 'mungfali', 'peanut', 'grounnut', 'groundnet'],
  'pigeonpea (tur)': ['togari', 'thogari', 'togri', 'tuvar', 'toor', 'arhar', 'redgram', 'red gram'],
  chickpea: ['kadale', 'kadle', 'kadale kalu', 'chana', 'channa', 'chane', 'bengal gram', 'gram'],
  'green gram': ['hesaru', 'hesaru kalu', 'hesarukalu', 'moong', 'mung', 'greengram'],
  'black gram': ['uddu', 'uddina bele', 'udad', 'urad', 'blackgram'],
  'horse gram': ['huruli', 'hurali', 'hurli', 'kulthi', 'kollu', 'horsegram'],
  cowpea: ['alasande', 'alsande', 'lobia', 'chawli', 'cowpee'],
  sugarcane: ['kabbu', 'kabu', 'ganna', 'ganne', 'sugar cane', 'sugercane', 'shugarcane'],
  coconut: ['tengu', 'thengu', 'tenginakai', 'tengina mara', 'nariyal', 'nariyel', 'cocunut', 'coconat'],
  arecanut: ['adike', 'adake', 'adakke', 'supari', 'areca', 'arecnut', 'arcanut', 'arekanut'],
  cotton: ['hatti', 'kapas', 'kapaas', 'coton', 'cottan', 'cotten'],
  sunflower: ['suryakanti', 'suryakaanti', 'surajmukhi', 'sunflover', 'sunflowr'],
  onion: ['eerulli', 'irulli', 'ullagaddi', 'ulli', 'pyaz', 'pyaaz', 'kanda', 'onian', 'onin', 'oniyan'],
  potato: ['alugadde', 'aalugadde', 'aloo', 'alu', 'batate', 'potatto', 'potata'],
  tomato: ['tamato', 'tomoto', 'tamatar', 'tamaatar', 'tometo', 'tomatto'],
  chilli: ['menasinakai', 'menasinakayi', 'menasina kai', 'mirchi', 'mirch', 'chili', 'chilly', 'chillies'],
  'black pepper': ['menasu', 'kari menasu', 'kaali mirch', 'kali mirch', 'pepper', 'pepar'],
  tobacco: ['hogesoppu', 'hoge soppu', 'tambaku', 'tambaaku', 'tobaco', 'tobbaco'],
  coffee: ['kaapi', 'kafi', 'kappi', 'cofee', 'coffe'],
  banana: ['baale', 'bale hannu', 'balehannu', 'baalehannu', 'kela', 'kele', 'bannana', 'banan'],
  mango: ['mavu', 'maavu', 'mavinakai', 'mavina mara', 'aam', 'mangoo'],
  turmeric: ['arishina', 'arisina', 'arshina', 'haldi', 'turmaric', 'termeric'],
  ginger: ['shunti', 'shunthi', 'adrak', 'allam', 'gingar'],
  sesame: ['ellu', 'til', 'gingelly', 'sesami'],
  castor: ['haralu', 'harlu', 'arandi', 'erandi', 'castar'],
  safflower: ['kusube', 'kusume', 'kusum', 'saffola'],
  'niger seed': ['gurellu', 'huchellu', 'ramtil', 'niger'],
  cardamom: ['yelakki', 'elakki', 'elaichi', 'ilaichi', 'cardamon', 'cardimom'],
  cashewnut: ['godambi', 'godambi beeja', 'geru beeja', 'kaju', 'cashew', 'cashu'],
  coriander: ['kottambari', 'kothambari', 'dhaniya', 'dhania', 'coriender', 'koriander'],
  tapioca: ['maragenasu', 'mara genasu', 'kappa', 'cassava', 'tapiyoka'],
  'sweet potato': ['genasu', 'sihi genasu', 'shakarkand', 'sweet patato'],
  grapes: ['drakshi', 'drakshe', 'draksha', 'angoor', 'angur', 'grape', 'graps'],
  pomegranate: ['dalimbe', 'dalimbe hannu', 'anar', 'anaar', 'pomogranate', 'pomegranet'],
  papaya: ['parangi', 'parangi hannu', 'pappaya', 'papita', 'papaiya'],
  sapota: ['chikku', 'chiku', 'sapota hannu', 'sappota', 'chickoo'],
  mesta: ['pundi', 'pundi soppu', 'ambadi', 'gongura'],
  jute: ['sanabu', 'pat', 'patsan'],
  linseed: ['agase', 'alsi', 'flax', 'flaxseed'],
  mustard: ['sasive', 'saasive', 'sarson', 'rai', 'mastard'],
  soybean: ['soyabean', 'soya', 'soyabin', 'soybin', 'soyabeen'],
  barley: ['jave', 'jau', 'barly'],
  guar: ['gorikai', 'gori kai', 'guwar', 'cluster bean'],
  lentil: ['masoor', 'masur', 'chanangi'],
  khesari: ['kesari bele', 'teora'],
  'moth bean': ['madike', 'madike kalu', 'matki'],
};

function escape(word: string) {
  return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Longest phrases first, so "yaava bele hakabeku" wins over "yaava bele"
const PHRASE_PATTERNS = [...PHRASES]
  .sort((a, b) => b[0].length - a[0].length)
  .map(([phrase, meaning]) => ({ pattern: new RegExp(`(^|\\s)${escape(phrase)}(?=\\s|$)`, 'g'), meaning }));

// True when the question uses Kannada or Hindi words typed in English letters (then the reply follows the
// app's language rather than English)
export function typedInLocalWords(question: string) {
  const words = question.toLowerCase().split(/[^a-z]+/);
  const local = new Set(['neeru', 'niru', 'eshtu', 'estu', 'yavaga', 'yaavaga', 'beku', 'bittane', 'bele', 'yaava', 'yava',
    'yenu', 'enu', 'hege', 'dina', 'tingalu', 'gobbara', 'beeja', 'kataavu', 'hakali', 'beleyali', 'agutta', 'illi',
    'nanna', 'olledu', 'sari', 'bhatta', 'togari', 'shenga', 'kabbu', 'adike', 'jola', 'hesaru', 'uddu', 'huruli']);
  return words.filter((word) => local.has(word)).length >= 1;
}

// The question in the plain words the chat looks for; crop names are left as they are
export function normaliseQuestion(question: string) {
  let text = ' ' + question.toLowerCase().replace(/[?!.,’'"]/g, ' ').replace(/(.)\1{2,}/g, '$1$1').replace(/\s+/g, ' ') + ' ';
  for (const { pattern, meaning } of PHRASE_PATTERNS) {
    text = text.replace(pattern, `$1${meaning}`);
  }
  return text
    .split(' ')
    .map((word) => (word in WORDS ? WORDS[word] : word))
    .filter(Boolean)
    .join(' ');
}
