// Facts for the crop helper chat, for every crop our model can recommend.
// Every number comes from one of the sources below. If a source had no figure, the field is left out
// and the chat says so, instead of guessing.
//
// Sources
//   TNAU        TNAU Agritech Portal (Tamil Nadu Agricultural University), https://agritech.tnau.ac.in
//               - water table: /agriculture/agri_irrigationmgt_waterrequirements.html
//               - crop pages (varieties and duration, irrigation, harvest) for each crop
//   TNAU notes  "Water requirement for different crops", eagri.org/eagri50/AGRO103/lec07.pdf (pulses: 200-450 mm)
//   FAO         FAO Irrigation Water Management Training Manual 3, Tables 6 and 14, https://www.fao.org/4/s2022e/s2022e07.htm
//   ICRISAT     pigeonpea maturity groups (extra early < 130 days ... late > 185 days)
//   Kenaf study harvest 114-152 days after emergence (Field Crops Research / Industrial Crops and Products)
//   PAU         Package of Practices for Crops of Punjab, Rabi 2025-26 (Punjab Agricultural University)
//   ICAR        ICAR-CRIJAF (jute duration 120-130 days), ICAR-CAZRI (moth bean varieties mature in 60-65 days)

export type CropInfo = {
  scientific: string;
  otherNames: string[]; // other English/Indian names, also used to understand questions
  kannadaNames: string[]; // Kannada words that mean this crop, used to understand questions
  days?: [number, number]; // seasonal crops: sowing to harvest
  bearingYears?: [number, number]; // trees and vines: planting to first harvest
  waterMm?: [number, number]; // seasonal crops: total water for the whole crop
  litresPerPlant?: [number, number]; // trees: litres per plant per day with drip irrigation
  waterNote?: { en: string; kn: string }; // when the source gives advice instead of a number
  // How the crop is grown. Plain English with the units printed in the source, because the
  // numbers mean the same in both languages and the chat writes the sentence around them.
  season?: string;       // when it is sown
  seedRate?: string;     // seed needed per hectare
  spacing?: string;      // gap between rows and plants
  fertiliser?: string;   // N : P2O5 : K2O per hectare when no soil test is available
  source: string;
};

// Pulses without their own figure use the general pulses range from TNAU notes
const PULSES_WATER: [number, number] = [200, 450];

export const CROP_INFO: Record<string, CropInfo> = {
  arecanut: {
    scientific: 'Areca catechu',
    otherNames: ['areca', 'betel nut', 'supari'],
    kannadaNames: ['ಅಡಿಕೆ'],
    bearingYears: [5, 5],
    litresPerPlant: [16, 20],
    waterNote: {
      en: 'With flood irrigation it needs about 175 litres per tree per day.',
      kn: 'ಹರಿ ನೀರಾವರಿಯಲ್ಲಿ ಪ್ರತಿ ಮರಕ್ಕೆ ದಿನಕ್ಕೆ ಸುಮಾರು 175 ಲೀಟರ್ ಬೇಕು.',
    },
    source: 'TNAU',
  },
  bajra: {
    scientific: 'Pennisetum glaucum',
    otherNames: ['pearl millet', 'cumbu', 'bajri'],
    kannadaNames: ['ಸಜ್ಜೆ'],
    days: [75, 100],
    waterMm: [450, 650],
    season: 'June to September, or October to December',
    seedRate: '5 kg per hectare',
    spacing: '45 cm between rows, 15 cm between plants',
    fertiliser: '70 : 35 : 35 kg N : P2O5 : K2O per hectare',
    source: 'TNAU (duration), FAO (water)',
  },
  'black gram': {
    scientific: 'Vigna mungo',
    otherNames: ['urad', 'urd', 'blackgram'],
    kannadaNames: ['ಉದ್ದು'],
    days: [65, 65],
    waterMm: [280, 280],
    source: 'TNAU',
  },
  'black pepper': {
    scientific: 'Piper nigrum',
    otherNames: ['pepper', 'kali mirch'],
    kannadaNames: ['ಕರಿಮೆಣಸು', 'ಮೆಣಸು'],
    bearingYears: [3, 4],
    waterNote: {
      en: 'Give protective irrigation in basins every 10 days from December to May.',
      kn: 'ಡಿಸೆಂಬರ್‌ನಿಂದ ಮೇ ವರೆಗೆ 10 ದಿನಕ್ಕೊಮ್ಮೆ ಪಾತಿಗಳಿಗೆ ರಕ್ಷಣಾತ್ಮಕ ನೀರು ಕೊಡಿ.',
    },
    source: 'TNAU',
  },
  cardamom: {
    scientific: 'Elettaria cardamomum',
    otherNames: ['elaichi', 'small cardamom'],
    kannadaNames: ['ಏಲಕ್ಕಿ'],
    bearingYears: [2, 2],
    waterNote: {
      en: 'Usually grown rainfed. Sprinkler irrigation in summer increases the yield.',
      kn: 'ಸಾಮಾನ್ಯವಾಗಿ ಮಳೆಯಾಶ್ರಿತ. ಬೇಸಿಗೆಯಲ್ಲಿ ತುಂತುರು ನೀರಾವರಿ ಕೊಟ್ಟರೆ ಇಳುವರಿ ಹೆಚ್ಚುತ್ತದೆ.',
    },
    source: 'TNAU',
  },
  cashewnut: {
    scientific: 'Anacardium occidentale',
    otherNames: ['cashew', 'kaju'],
    kannadaNames: ['ಗೋಡಂಬಿ', 'ಗೇರು'],
    bearingYears: [3, 3],
    waterNote: {
      en: 'Usually grown rainfed. Watering once a week from new leaf flush until the nuts mature increases the yield.',
      kn: 'ಸಾಮಾನ್ಯವಾಗಿ ಮಳೆಯಾಶ್ರಿತ. ಹೊಸ ಚಿಗುರು ಬಂದಾಗಿನಿಂದ ಬೀಜ ಬಲಿಯುವವರೆಗೆ ವಾರಕ್ಕೊಮ್ಮೆ ನೀರು ಕೊಟ್ಟರೆ ಇಳುವರಿ ಹೆಚ್ಚುತ್ತದೆ.',
    },
    source: 'TNAU',
  },
  castor: {
    scientific: 'Ricinus communis',
    otherNames: ['arandi'],
    kannadaNames: ['ಹರಳು'],
    days: [120, 160],
    source: 'TNAU',
  },
  chickpea: {
    scientific: 'Cicer arietinum',
    otherNames: ['bengal gram', 'bengalgram', 'chana', 'gram'],
    kannadaNames: ['ಕಡಲೆ'],
    days: [85, 85],
    waterMm: PULSES_WATER,
    source: 'TNAU',
  },
  chilli: {
    scientific: 'Capsicum annuum',
    otherNames: ['chillies', 'chili', 'mirchi', 'green chilli'],
    kannadaNames: ['ಮೆಣಸಿನಕಾಯಿ', 'ಮೆಣಸಿನ ಕಾಯಿ'],
    days: [120, 210],
    waterMm: [600, 900],
    source: 'FAO',
  },
  coconut: {
    scientific: 'Cocos nucifera',
    otherNames: ['coconut palm', 'nariyal'],
    kannadaNames: ['ತೆಂಗು', 'ತೆಂಗಿನ'],
    bearingYears: [3, 7], // dwarf and hybrid palms 3-4 years, tall palms 5-7 years
    litresPerPlant: [55, 120],
    source: 'TNAU',
  },
  coffee: {
    scientific: 'Coffea arabica (arabica), Coffea canephora (robusta)',
    otherNames: ['arabica', 'robusta'],
    kannadaNames: ['ಕಾಫಿ'],
    bearingYears: [5, 5],
    spacing: 'Arabica 1.5 to 2.0 m either way, robusta 2.5 m either way',
    waterNote: {
      en: 'Coffee is grown mainly on rain: arabica needs 1600 to 2500 mm a year at 1000 to 1500 m above sea level, '
        + 'robusta 1000 to 2000 mm at 500 to 1000 m. Sprinkler irrigation in March and April brings on the blossom and raises the yield.',
      kn: 'ಕಾಫಿ ಮುಖ್ಯವಾಗಿ ಮಳೆಯ ಮೇಲೆ ಬೆಳೆಯುವ ಬೆಳೆ: ಅರೇಬಿಕಾಗೆ 1000 ರಿಂದ 1500 ಮೀ ಎತ್ತರದಲ್ಲಿ '
        + 'ವರ್ಷಕ್ಕೆ 1600 ರಿಂದ 2500 ಮಿ.ಮೀ ಮಳೆ, ರೊಬಸ್ಟಾಗೆ 500 ರಿಂದ 1000 ಮೀ ಎತ್ತರದಲ್ಲಿ 1000 ರಿಂದ 2000 ಮಿ.ಮೀ ಬೇಕು. '
        + 'ಮಾರ್ಚ್ ಮತ್ತು ಏಪ್ರಿಲ್‌ನಲ್ಲಿ ತುಂತುರು ನೀರಾವರಿ ನೀಡಿದರೆ ಹೂ ಹೆಚ್ಚು ಬಿಟ್ಟು ಇಳುವರಿ ಹೆಚ್ಚಾಗುತ್ತದೆ.',
    },
    source: 'TNAU',
  },
  cotton: {
    scientific: 'Gossypium hirsutum',
    otherNames: ['kapas'],
    kannadaNames: ['ಹತ್ತಿ'],
    days: [165, 165],
    waterMm: [600, 600],
    source: 'TNAU',
  },
  cowpea: {
    scientific: 'Vigna unguiculata',
    otherNames: ['lobia', 'black-eyed pea'],
    kannadaNames: ['ಅಲಸಂದೆ', 'ಅಲಸಂದಿ'],
    days: [65, 90],
    waterMm: PULSES_WATER,
    source: 'TNAU',
  },
  ginger: {
    scientific: 'Zingiber officinale',
    otherNames: ['adrak'],
    kannadaNames: ['ಶುಂಠಿ'],
    days: [240, 270],
    waterNote: {
      en: 'Grown as an irrigated crop in humid areas. It does best with about 1500 mm of rain a year.',
      kn: 'ತೇವಾಂಶವಿರುವ ಪ್ರದೇಶಗಳಲ್ಲಿ ನೀರಾವರಿ ಬೆಳೆಯಾಗಿ ಬೆಳೆಯುತ್ತಾರೆ. ವರ್ಷಕ್ಕೆ ಸುಮಾರು 1500 ಮಿ.ಮೀ. ಮಳೆ ಉತ್ತಮ.',
    },
    source: 'TNAU',
  },
  'green gram': {
    scientific: 'Vigna radiata',
    otherNames: ['moong', 'mung', 'greengram'],
    kannadaNames: ['ಹೆಸರು ಕಾಳು', 'ಹೆಸರುಕಾಳು'], // not just "ಹೆಸರು", which also means "name"
    days: [60, 75],
    waterMm: PULSES_WATER,
    source: 'TNAU',
  },
  groundnut: {
    scientific: 'Arachis hypogaea',
    otherNames: ['peanut', 'moongphali'],
    kannadaNames: ['ಶೇಂಗಾ', 'ಕಡಲೆಕಾಯಿ', 'ನೆಲಗಡಲೆ'],
    days: [105, 105],
    waterMm: [510, 510],
    source: 'TNAU',
  },
  'horse gram': {
    scientific: 'Macrotyloma uniflorum',
    otherNames: ['kulthi', 'horsegram'],
    kannadaNames: ['ಹುರುಳಿ'],
    days: [110, 110],
    waterMm: PULSES_WATER,
    source: 'TNAU',
  },
  jowar: {
    scientific: 'Sorghum bicolor',
    otherNames: ['sorghum', 'cholam'],
    kannadaNames: ['ಜೋಳ'],
    days: [105, 105],
    waterMm: [500, 500],
    seedRate: '10 kg per hectare',
    spacing: '45 cm between rows, 15 cm between plants',
    fertiliser: '90 : 45 : 45 kg N : P2O5 : K2O per hectare',
    source: 'TNAU',
  },
  maize: {
    scientific: 'Zea mays',
    otherNames: ['corn', 'makka'],
    kannadaNames: ['ಮೆಕ್ಕೆಜೋಳ', 'ಮೆಕ್ಕೆ ಜೋಳ'],
    days: [100, 100],
    waterMm: [500, 500],
    season: 'June to September, or November to February',
    seedRate: '20 kg per hectare for hybrids, 25 kg for varieties',
    spacing: '60 cm between rows, 25 cm between plants',
    fertiliser: '60 : 30 : 30 kg N : P2O5 : K2O per hectare on red soils, 40 : 20 : 0 on black soils',
    source: 'TNAU',
  },
  mango: {
    scientific: 'Mangifera indica',
    otherNames: ['aam'],
    kannadaNames: ['ಮಾವು', 'ಮಾವಿನ'],
    bearingYears: [6, 6],
    waterNote: {
      en: 'Water regularly until the young tree is established, then once a week. Drip irrigation needs only about one-third of that water.',
      kn: 'ಸಸಿ ಬೇರೂರುವವರೆಗೆ ನಿಯಮಿತವಾಗಿ, ನಂತರ ವಾರಕ್ಕೊಮ್ಮೆ ನೀರು ಕೊಡಿ. ಹನಿ ನೀರಾವರಿಯಲ್ಲಿ ಅದರ ಮೂರನೇ ಒಂದು ಭಾಗ ನೀರು ಸಾಕು.',
    },
    source: 'TNAU',
  },
  mesta: {
    scientific: 'Hibiscus cannabinus',
    otherNames: ['kenaf', 'ambadi'],
    kannadaNames: ['ಪುಂಡಿ'],
    days: [115, 150],
    source: 'Kenaf harvest study',
  },
  'niger seed': {
    scientific: 'Guizotia abyssinica',
    otherNames: ['niger', 'ramtil'],
    kannadaNames: ['ಗುರೆಳ್ಳು', 'ಹುಚ್ಚೆಳ್ಳು'],
    days: [80, 80],
    source: 'TNAU',
  },
  onion: {
    scientific: 'Allium cepa',
    otherNames: ['bellary onion', 'pyaz'],
    kannadaNames: ['ಈರುಳ್ಳಿ', 'ಉಳ್ಳಾಗಡ್ಡೆ'],
    days: [150, 210],
    waterMm: [350, 550],
    source: 'FAO',
  },
  'pigeonpea (tur)': {
    scientific: 'Cajanus cajan',
    otherNames: ['pigeonpea', 'pigeon pea', 'tur', 'toor', 'arhar', 'red gram', 'redgram'],
    kannadaNames: ['ತೊಗರಿ'],
    days: [130, 185],
    waterMm: [427, 523], // drip 427 mm, surface irrigation 523 mm
    source: 'ICRISAT (duration), TNAU (water)',
  },
  potato: {
    scientific: 'Solanum tuberosum',
    otherNames: ['aloo'],
    kannadaNames: ['ಆಲೂಗಡ್ಡೆ'],
    days: [105, 145],
    waterMm: [500, 700],
    source: 'FAO',
  },
  ragi: {
    scientific: 'Eleusine coracana',
    otherNames: ['finger millet', 'nachni', 'mandua'],
    kannadaNames: ['ರಾಗಿ'],
    days: [95, 95],
    waterMm: [310, 310],
    season: 'June to July as a rainfed crop',
    seedRate: '10 kg per hectare',
    spacing: '30 cm between rows, 10 cm between plants when transplanted; 22.5 x 10 cm when sown directly',
    fertiliser: '60 : 30 : 30 kg N : P2O5 : K2O per hectare',
    source: 'TNAU',
  },
  rice: {
    scientific: 'Oryza sativa',
    otherNames: ['paddy', 'chawal', 'dhan'],
    kannadaNames: ['ಭತ್ತ', 'ಅಕ್ಕಿ'],
    days: [110, 110],
    waterMm: [1250, 1250],
    seedRate: '30 kg per hectare for long duration, 40 kg for medium, 60 kg for short duration, 20 kg for hybrids',
    spacing: 'at least 20 cm between rows',
    fertiliser: '150 : 50 : 50 kg N : P2O5 : K2O per hectare',
    source: 'TNAU',
  },
  sesame: {
    scientific: 'Sesamum indicum',
    otherNames: ['gingelly', 'til'],
    kannadaNames: ['ಎಳ್ಳು'],
    days: [85, 85],
    waterMm: [150, 150],
    source: 'TNAU',
  },
  soybean: {
    scientific: 'Glycine max',
    otherNames: ['soya', 'soyabean'],
    kannadaNames: ['ಸೋಯಾಬೀನ್', 'ಸೋಯಾ'],
    days: [85, 85],
    waterMm: [320, 320],
    source: 'TNAU',
  },
  sugarcane: {
    scientific: 'Saccharum officinarum',
    otherNames: ['cane', 'ganna'],
    kannadaNames: ['ಕಬ್ಬು'],
    days: [360, 360],
    waterMm: [2200, 2200],
    source: 'TNAU',
  },
  sunflower: {
    scientific: 'Helianthus annuus',
    otherNames: ['surajmukhi'],
    kannadaNames: ['ಸೂರ್ಯಕಾಂತಿ'],
    days: [110, 110],
    waterMm: [450, 450],
    source: 'TNAU',
  },
  tobacco: {
    scientific: 'Nicotiana tabacum',
    otherNames: ['tambaku'],
    kannadaNames: ['ತಂಬಾಕು', 'ಹೊಗೆಸೊಪ್ಪು'],
    days: [130, 160],
    source: 'FAO',
  },
  turmeric: {
    scientific: 'Curcuma longa',
    otherNames: ['haldi'],
    kannadaNames: ['ಅರಿಶಿನ', 'ಅರಿಶಿಣ'],
    days: [270, 270],
    source: 'TNAU',
  },
  wheat: {
    scientific: 'Triticum aestivum',
    otherNames: ['gehun'],
    kannadaNames: ['ಗೋಧಿ'],
    days: [120, 150],
    waterMm: [450, 650],
    source: 'FAO',
  },

  // Added when the model was retrained on all of India (46 crops)
  banana: {
    scientific: 'Musa spp.',
    otherNames: ['plantain', 'kela'],
    kannadaNames: ['ಬಾಳೆ'],
    days: [300, 365],
    waterMm: [1200, 2200],
    litresPerPlant: [5, 15], // drip: 5-10 L up to month 4, 10-15 L until shooting, then 15 L
    source: 'FAO, TNAU (drip)',
  },
  barley: {
    scientific: 'Hordeum vulgare',
    otherNames: ['jau'],
    kannadaNames: ['ಬಾರ್ಲಿ', 'ಜವೆಗೋಧಿ'],
    days: [120, 150],
    waterMm: [450, 650],
    source: 'FAO',
  },
  coriander: {
    scientific: 'Coriandrum sativum',
    otherNames: ['dhania', 'cilantro'],
    kannadaNames: ['ಕೊತ್ತಂಬರಿ'],
    waterNote: {
      en: 'Give the first irrigation about 3 weeks after sowing, then 3–4 more when needed. Avoid water stress at flowering and seed development.',
      kn: 'ಬಿತ್ತಿದ ಸುಮಾರು 3 ವಾರಗಳ ನಂತರ ಮೊದಲ ನೀರು, ನಂತರ ಅಗತ್ಯವಿದ್ದಾಗ ಇನ್ನೂ 3–4 ಬಾರಿ ಕೊಡಿ. ಹೂಬಿಡುವ ಮತ್ತು ಬೀಜ ಕಟ್ಟುವ ಸಮಯದಲ್ಲಿ ನೀರಿನ ಕೊರತೆ ಆಗದಂತೆ ನೋಡಿಕೊಳ್ಳಿ.',
    },
    source: 'PAU',
  },
  guar: {
    scientific: 'Cyamopsis tetragonoloba',
    otherNames: ['cluster bean', 'clusterbean', 'gavar'],
    kannadaNames: ['ಗೋರಿಕಾಯಿ'],
    days: [90, 145],
    waterNote: {
      en: 'Irrigate right after sowing, then once a week.',
      kn: 'ಬಿತ್ತಿದ ತಕ್ಷಣ ನೀರು ಕೊಡಿ, ನಂತರ ವಾರಕ್ಕೊಮ್ಮೆ.',
    },
    source: 'TNAU',
  },
  jute: {
    scientific: 'Corchorus olitorius',
    otherNames: ['tossa jute', 'pat'],
    kannadaNames: ['ಸೆಣಬು'],
    days: [120, 130],
    source: 'ICAR-CRIJAF',
  },
  khesari: {
    scientific: 'Lathyrus sativus',
    otherNames: ['grass pea', 'lathyrus', 'teora'],
    kannadaNames: ['ಕೇಸರಿ ಬೇಳೆ'],
    waterMm: PULSES_WATER,
    source: 'TNAU notes',
  },
  lentil: {
    scientific: 'Lens culinaris',
    otherNames: ['masoor', 'masur'],
    kannadaNames: ['ಮಸೂರ್', 'ಚನಂಗಿ'],
    days: [140, 146],
    waterMm: PULSES_WATER,
    source: 'PAU (duration), TNAU notes (water)',
  },
  linseed: {
    scientific: 'Linum usitatissimum',
    otherNames: ['flax', 'alsi'],
    kannadaNames: ['ಅಗಸೆ'],
    days: [158, 163],
    waterNote: {
      en: 'Needs 3–4 irrigations depending on the rain. Irrigation when flowering starts is essential.',
      kn: 'ಮಳೆಯನ್ನು ಅವಲಂಬಿಸಿ 3–4 ಬಾರಿ ನೀರು ಬೇಕು. ಹೂ ಬಿಡಲು ಆರಂಭಿಸಿದಾಗ ನೀರು ಕೊಡುವುದು ಅಗತ್ಯ.',
    },
    source: 'PAU',
  },
  'moth bean': {
    scientific: 'Vigna aconitifolia',
    otherNames: ['moth', 'matki'],
    kannadaNames: ['ಮಡಕೆ ಕಾಳು'],
    days: [60, 65],
    source: 'ICAR-CAZRI',
  },
  mustard: {
    scientific: 'Brassica juncea',
    otherNames: ['rai', 'raya', 'sarson', 'rapeseed'],
    kannadaNames: ['ಸಾಸಿವೆ'],
    days: [136, 162],
    source: 'PAU',
  },
  safflower: {
    scientific: 'Carthamus tinctorius',
    otherNames: ['kusum', 'kardi'],
    kannadaNames: ['ಕುಸುಬೆ'],
    days: [120, 125],
    source: 'TNAU',
  },
  'sweet potato': {
    scientific: 'Ipomoea batatas',
    otherNames: ['shakarkand'],
    kannadaNames: ['ಸಿಹಿ ಗೆಣಸು', 'ಗೆಣಸು'],
    days: [110, 120],
    waterNote: {
      en: 'Irrigate before planting, again on the 3rd day, then once a week. Stop one week before harvest.',
      kn: 'ನಾಟಿಗೆ ಮೊದಲು, 3ನೇ ದಿನ, ನಂತರ ವಾರಕ್ಕೊಮ್ಮೆ ನೀರು ಕೊಡಿ. ಕಟಾವಿಗೆ ಒಂದು ವಾರ ಮೊದಲು ನಿಲ್ಲಿಸಿ.',
    },
    source: 'TNAU',
  },
  tapioca: {
    scientific: 'Manihot esculenta',
    otherNames: ['cassava'],
    kannadaNames: ['ಮರಗೆಣಸು'],
    days: [270, 300],
    source: 'TNAU',
  },

  // Added with the horticulture statistics: fruit and vegetable crops the agriculture series
  // does not count, so the model could not name them before (see ml-service/data/raw/horticulture_area.csv)
  grapes: {
    scientific: 'Vitis vinifera',
    otherNames: ['grape', 'angur'],
    kannadaNames: ['ದ್ರಾಕ್ಷಿ'],
    spacing: '3 x 2 m for Muscat, 4 x 3 m for other varieties',
    waterNote: {
      en: 'Water at planting, again on the third day, then once a week. Stop watering 15 days before pruning '
        + 'and 15 days before harvest. Grapes want deep, well-drained loam with pH 6.5 to 7.0.',
      kn: 'ನೆಟ್ಟ ತಕ್ಷಣ, ಮೂರನೇ ದಿನ, ನಂತರ ವಾರಕ್ಕೊಮ್ಮೆ ನೀರು ಕೊಡಿ. '
        + 'ಚಾಟನಿಗಿಂತ 15 ದಿನ ಮುಂಚೆ ಮತ್ತು ಕೊಯ್ಲಿಗಿಂತ 15 ದಿನ ಮುಂಚೆ ನೀರು ನಿಲ್ಲಿಸಿ. '
        + 'ದ್ರಾಕ್ಷಿಗೆ ಆಳವಾದ, ನೀರು ಬಸಿದು ಹೋಗುವ ಗೋಡು ಮಣ್ಣು (pH 6.5 ರಿಂದ 7.0) ಬೇಕು.',
    },
    source: 'TNAU',
  },
  papaya: {
    scientific: 'Carica papaya',
    otherNames: ['papita', 'pappali'],
    kannadaNames: ['ಪಪ್ಪಾಯಿ'],
    seedRate: '500 g per hectare',
    spacing: '1.8 m either way, in pits of 45 x 45 x 45 cm',
    waterNote: {
      en: 'Irrigate once a week. One planting keeps bearing for 24 to 30 months. It grows up to 1200 m above '
        + 'sea level and needs well-drained soil of even texture, or the collar rots.',
      kn: 'ವಾರಕ್ಕೊಮ್ಮೆ ನೀರು ಕೊಡಿ. ಒಮ್ಮೆ ನಾಟಿದ ಬೆಳೆ 24 ರಿಂದ 30 ತಿಂಗಳು ಫಲ ಕೊಡುತ್ತದೆ. '
        + 'ಸಮುದ್ರ ಮಟ್ಟದಿಂದ 1200 ಮೀವರೆಗೆ ಬೆಳೆಯುತ್ತದೆ; ನೀರು ಬಸಿದು ಹೋಗುವ ಸಮ ಮಣ್ಣು ಬೇಕು.',
    },
    source: 'TNAU',
  },
  pomegranate: {
    scientific: 'Punica granatum',
    otherNames: ['anar'],
    kannadaNames: ['ದಾಳಿಂಬೆ'],
    spacing: '2.5 to 3 m either way',
    waterNote: {
      en: 'Irrigate about every 4 days. It stands drought, salty and alkaline soil, and grows well up to 1800 m. '
        + 'Cool winters and a dry summer give the best fruit.',
      kn: 'ಸುಮಾರು 4 ದಿನಕ್ಕೊಮ್ಮೆ ನೀರು ಕೊಡಿ. ಬರ, ಉಪ್ಪು ಮತ್ತು ಕ್ಷಾರ ಮಣ್ಣನ್ನೂ ಸಹಿಸುತ್ತದೆ, '
        + '1800 ಮೀವರೆಗೆ ಬೆಳೆಯುತ್ತದೆ. ತಂಪಾದ ಚಳಿಗಾಲ ಮತ್ತು ಒಣಗಿದ ಬೇಸಿಗೆ ಉತ್ತಮ ಫಲ ನೀಡುತ್ತವೆ.',
    },
    source: 'TNAU',
  },
  sapota: {
    scientific: 'Manilkara zapota',
    otherNames: ['chikoo', 'sapodilla'],
    kannadaNames: ['ಸಪೋಟ'],
    spacing: '8 x 8 m (156 trees per hectare), or 8 x 4 m (312 trees) for high-density planting',
    waterNote: {
      en: 'Water heavily right after planting and again on the third day, then once every 10 days until the graft '
        + 'takes. It grows in any soil, up to 1000 m above sea level.',
      kn: 'ನೆಟ್ಟ ತಕ್ಷಣ ಮತ್ತು ಮೂರನೇ ದಿನ ಚೆನ್ನಾಗಿ ನೀರು ಕೊಡಿ, ನಂತರ ಕಸಿ ಗಿಡ ಬೇರೂರುವವರೆಗೆ '
        + '10 ದಿನಕ್ಕೊಮ್ಮೆ ಕೊಡಿ. ಎಲ್ಲಾ ತರಹದ ಮಣ್ಣಿನಲ್ಲಿ, 1000 ಮೀವರೆಗೆ ಬೆಳೆಯುತ್ತದೆ.',
    },
    source: 'TNAU',
  },
  tomato: {
    scientific: 'Solanum lycopersicum',
    otherNames: ['tamatar'],
    kannadaNames: ['ಟೋಮೆಟೋ'],
    seedRate: '300 g per hectare',
    spacing: '60 x 45 cm (60 x 30 cm for CO 3)',
    fertiliser: '200 : 250 : 250 kg N : P2O5 : K2O per hectare for hybrids',
    waterNote: {
      en: 'Seedlings stay 25 to 30 days in the nursery before they are planted out.',
      kn: 'ಸಸಿಗಳು ನಾಟುವ ಮೊದಲು 25 ರಿಂದ 30 ದಿನ ಸಸಿಮಡಿಯಲ್ಲಿ ಇರಬೇಕು.',
    },
    source: 'TNAU',
  },
};
