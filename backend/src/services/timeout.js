// How long the backend waits for our own ML service before giving up.
// Without a limit a stuck service would leave the farmer's phone loading for ever;
// with one the app shows "please try again" and the farmer can retry.
// Reading soil from SoilGrids is the slowest step (18 small downloads), so it gets the most.

const SECONDS = 1000;

const TIMEOUTS = {
  soil: 90 * SECONDS,
  climate: 120 * SECONDS,   // NASA POWER, with its own retries inside the ML service
  terrain: 60 * SECONDS,
  predict: 60 * SECONDS,
  report: 30 * SECONDS,
};

function giveUpAfter(step) {
  return AbortSignal.timeout(TIMEOUTS[step]);
}

module.exports = { giveUpAfter, TIMEOUTS };
