// The few texts only the website needs. Every other text (in English and Kannada) is read from the
// phone app's file, frontend/src/lib/translations.ts, so the two never say different things.
// These are about location: a phone is told to open Settings, a browser to use the lock icon by the address.

export const webText = {
  en: {
    // {button} is replaced by the name of the "Use my location" button
    locationBlockedHelp:
      'Location is blocked for this website. Click the lock icon next to the address, set Location to Allow, then press "{button}".',
    locationUnavailableHelp:
      'The browser could not work out where you are. Check that location is switched on for this device, then press "{button}" again.',
  },
  kn: {
    locationBlockedHelp:
      'ಈ ವೆಬ್‌ಸೈಟ್‌ಗೆ ಸ್ಥಳದ ಅನುಮತಿ ನಿರ್ಬಂಧಿಸಲಾಗಿದೆ. ವಿಳಾಸದ ಪಕ್ಕದಲ್ಲಿರುವ ಬೀಗದ ಚಿಹ್ನೆಯನ್ನು ಒತ್ತಿ, ಸ್ಥಳವನ್ನು ಅನುಮತಿಸಿ ಎಂದು ಹೊಂದಿಸಿ, ನಂತರ "{button}" ಒತ್ತಿ.',
    locationUnavailableHelp:
      'ಬ್ರೌಸರ್‌ಗೆ ನಿಮ್ಮ ಸ್ಥಳವನ್ನು ಪತ್ತೆಹಚ್ಚಲು ಆಗಲಿಲ್ಲ. ಈ ಸಾಧನದಲ್ಲಿ ಸ್ಥಳ ಆನ್ ಆಗಿದೆಯೇ ಎಂದು ನೋಡಿ, ನಂತರ ಮತ್ತೆ "{button}" ಒತ್ತಿ.',
  },
};
