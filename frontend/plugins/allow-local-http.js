// Lets the installed app (APK) talk to the backend over plain http on your own Wi-Fi, such as
// http://192.168.1.10:4000. Expo Go allows this, but Android blocks plain http in an installed app unless the
// app says so. It is still safe: src/lib/api.ts refuses plain http to anything but this PC and private Wi-Fi
// addresses, so on the internet the app only uses https.
// Uses Expo's own config tools (part of the expo package), no extra library. Listed under "plugins" in app.json.
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function allowLocalHttp(config) {
  return withAndroidManifest(config, (result) => {
    result.modResults.manifest.application[0].$['android:usesCleartextTraffic'] = 'true';
    return result;
  });
};
