/**
 * Template for Alexa-hosted skill config.
 *
 * Alexa-hosted skills don't expose an Environment Variables UI, so we
 * keep secrets in a local config file instead. Copy this to `config.js`
 * IN THE ALEXA CLOUD EDITOR ONLY (do not commit the real values to git
 * — config.js is .gitignored), fill in your values, then Save + Deploy.
 *
 * If you later switch to a self-hosted Lambda, set the same keys as
 * env vars and delete config.js — index.js reads from either source.
 */
module.exports = {
  HOME_BRAIN_URL: 'https://home.natashabrain.com/interpret',
  HB_HMAC_SECRET: '',  // paste your 32-byte hex secret here
  // CF_ACCESS_CLIENT_ID: '',
  // CF_ACCESS_CLIENT_SECRET: '',
};
