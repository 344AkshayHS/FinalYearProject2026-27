// The few texts only the website needs: its menu, the home page's panels, the footer, the login page's side panel,
// and the location help (a phone is told to open Settings, a browser to use the lock icon by the address).
// Every other text (in English and Kannada) is read from the phone app's file, frontend/src/lib/translations.ts,
// so the two never say different things. `kn` has the type of `en`, so a missing Kannada text stops the build.

const en = {
  // {button} is replaced by the name of the "Use my location" button
  locationBlockedHelp:
    'Location is blocked for this website. Click the lock icon next to the address, set Location to Allow, then press "{button}".',
  locationUnavailableHelp:
    'The browser could not work out where you are. Check that location is switched on for this device, then press "{button}" again.',
  nav: {
    home: 'Find crops',
    chat: 'Crop helper',
    compare: 'Compare',
    saved: 'Saved crops',
    history: 'History',
    profile: 'My profile',
    menu: 'Menu',
  },
  home: {
    intro: 'Find the crops that suit your land. We look at your soil, 20 years of weather, the season, and what farmers near you grow.',
    yourLand: 'Your land',
    yourLandIntro: 'Tell us where the field is, when you will sow and how it gets water.',
    steps: ['Choose the place', 'Pick the season and water', 'Find crops'],
    emptyTitle: 'Your crops will appear here',
    // {button} is the name of the "Find crops" button
    emptyText: 'Choose your place and press "{button}". The first time for a place it takes a few seconds.',
  },
  chat: {
    cropsTitle: 'Ask about a crop',
  },
  profile: {
    account: 'Your account',
    // A browser opens one picker for the camera or the files, so the website has one photo button
    choosePhoto: 'Choose a photo',
  },
  auth: {
    features: [
      'Crops for your own field, from its soil and 20 years of weather',
      'What farmers around you really grow, from government data',
      'Weather, water and a crop helper chat, in English and Kannada',
    ],
  },
  footer: {
    pages: 'Pages',
    data: 'Data',
    sources: 'Agriculture Census, Karnataka DES, ICRISAT, ISRIC SoilGrids, NASA POWER, IMD, FAO EcoCrop, Open-Meteo',
    project: 'Final-year B.E. project (CSE – AI & ML), Mangalore Institute of Technology & Engineering',
  },
};

const kn: typeof en = {
  locationBlockedHelp:
    'ಈ ವೆಬ್‌ಸೈಟ್‌ಗೆ ಸ್ಥಳದ ಅನುಮತಿ ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ. ವಿಳಾಸದ ಪಕ್ಕದಲ್ಲಿರುವ ಬೀಗದ ಚಿಹ್ನೆಯನ್ನು ಒತ್ತಿ, ಸ್ಥಳವನ್ನು ಅನುಮತಿಸಿ ಎಂದು ಹೊಂದಿಸಿ, ನಂತರ "{button}" ಒತ್ತಿ.',
  locationUnavailableHelp:
    'ಬ್ರೌಸರ್‌ಗೆ ನಿಮ್ಮ ಸ್ಥಳವನ್ನು ಪತ್ತೆಹಚ್ಚಲು ಆಗಲಿಲ್ಲ. ಈ ಸಾಧನದಲ್ಲಿ ಸ್ಥಳ ಆನ್ ಆಗಿದೆಯೇ ಎಂದು ನೋಡಿ, ನಂತರ ಮತ್ತೆ "{button}" ಒತ್ತಿ.',
  nav: {
    home: 'ಬೆಳೆ ಹುಡುಕಿ',
    chat: 'ಬೆಳೆ ಸಹಾಯಕ',
    compare: 'ಹೋಲಿಕೆ',
    saved: 'ಉಳಿಸಿದ ಬೆಳೆಗಳು',
    history: 'ಇತಿಹಾಸ',
    profile: 'ನನ್ನ ಪ್ರೊಫೈಲ್',
    menu: 'ಮೆನು',
  },
  home: {
    intro: 'ನಿಮ್ಮ ಜಮೀನಿಗೆ ಸೂಕ್ತ ಬೆಳೆಗಳನ್ನು ತಿಳಿಯಿರಿ. ನಿಮ್ಮ ಮಣ್ಣು, 20 ವರ್ಷಗಳ ಹವಾಮಾನ, ಹಂಗಾಮು ಮತ್ತು ಹತ್ತಿರದ ರೈತರು ಬೆಳೆಯುವುದನ್ನು ನೋಡುತ್ತೇವೆ.',
    yourLand: 'ನಿಮ್ಮ ಜಮೀನು',
    yourLandIntro: 'ಹೊಲ ಎಲ್ಲಿದೆ, ಯಾವಾಗ ಬಿತ್ತುತ್ತೀರಿ ಮತ್ತು ಅದಕ್ಕೆ ನೀರು ಹೇಗೆ ಸಿಗುತ್ತದೆ ಎಂದು ತಿಳಿಸಿ.',
    steps: ['ಸ್ಥಳ ಆರಿಸಿ', 'ಹಂಗಾಮು ಮತ್ತು ನೀರು ಆರಿಸಿ', 'ಬೆಳೆಗಳನ್ನು ಹುಡುಕಿ'],
    emptyTitle: 'ನಿಮ್ಮ ಬೆಳೆಗಳು ಇಲ್ಲಿ ಕಾಣಿಸುತ್ತವೆ',
    emptyText: 'ನಿಮ್ಮ ಸ್ಥಳ ಆರಿಸಿ "{button}" ಒತ್ತಿ. ಒಂದು ಸ್ಥಳಕ್ಕೆ ಮೊದಲ ಬಾರಿ ಕೆಲವು ಸೆಕೆಂಡುಗಳು ಬೇಕು.',
  },
  chat: {
    cropsTitle: 'ಬೆಳೆಯ ಬಗ್ಗೆ ಕೇಳಿ',
  },
  profile: {
    account: 'ನಿಮ್ಮ ಖಾತೆ',
    choosePhoto: 'ಫೋಟೋ ಆರಿಸಿ',
  },
  auth: {
    features: [
      'ನಿಮ್ಮ ಹೊಲದ ಮಣ್ಣು ಮತ್ತು 20 ವರ್ಷಗಳ ಹವಾಮಾನ ನೋಡಿ ಸೂಚಿಸಿದ ಬೆಳೆಗಳು',
      'ನಿಮ್ಮ ಸುತ್ತಲಿನ ರೈತರು ನಿಜವಾಗಿ ಬೆಳೆಯುವ ಬೆಳೆಗಳು, ಸರ್ಕಾರಿ ಮಾಹಿತಿಯಿಂದ',
      'ಹವಾಮಾನ, ನೀರು ಮತ್ತು ಬೆಳೆ ಸಹಾಯಕ ಚಾಟ್, ಕನ್ನಡ ಮತ್ತು ಇಂಗ್ಲಿಷ್‌ನಲ್ಲಿ',
    ],
  },
  footer: {
    pages: 'ಪುಟಗಳು',
    data: 'ಮಾಹಿತಿ',
    sources: 'ಕೃಷಿ ಗಣತಿ, ಕರ್ನಾಟಕ DES, ICRISAT, ISRIC SoilGrids, NASA POWER, IMD, FAO EcoCrop, Open-Meteo',
    project: 'ಅಂತಿಮ ವರ್ಷದ ಬಿ.ಇ. ಯೋಜನೆ (CSE – AI & ML), ಮಂಗಳೂರು ಇನ್‌ಸ್ಟಿಟ್ಯೂಟ್ ಆಫ್ ಟೆಕ್ನಾಲಜಿ ಅಂಡ್ ಇಂಜಿನಿಯರಿಂಗ್',
  },
};

export const webText = { en, kn };
