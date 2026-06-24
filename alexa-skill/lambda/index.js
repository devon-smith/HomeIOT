/**
 * Home Brain — Alexa Custom Skill backend.
 *
 * Architecture:
 *   Echo → Alexa cloud (ASR/TTS) → this Lambda → POST /interpret on the
 *   Mac mini brain (via Cloudflare Tunnel). Brain races the planner
 *   against a 6.5s deadline and returns either a spoken result, an
 *   async ack, or an error. We speak whatever we get back.
 *
 * Config (in order of precedence):
 *   1. ./config.js          (Alexa-hosted skills — no env-var UI exists)
 *   2. process.env.*        (self-hosted Lambda with env vars)
 *
 * Required keys:
 *   HOME_BRAIN_URL              https://home.natashabrain.com/interpret
 *   HB_HMAC_SECRET              same 32-byte hex as the brain's .env
 *   CF_ACCESS_CLIENT_ID         (optional) Cloudflare Access service token id
 *   CF_ACCESS_CLIENT_SECRET     (optional) Cloudflare Access service token secret
 *
 * For Alexa-hosted skills, create a `config.js` file next to this one
 * (NOT committed to git) — see config.example.js for the template.
 *
 * One-intent design: RunCommandIntent has a single AMAZON.SearchQuery
 * slot named {command}. The user's whole utterance lands there, and the
 * Brain's planner does the interpretation. No per-tool intents to
 * maintain.
 */

const Alexa = require('ask-sdk-core');
const crypto = require('crypto');
const https = require('https');
const { URL } = require('url');

let fileConfig = {};
try { fileConfig = require('./config'); } catch (_) { /* fall through to env */ }

const BRAIN_URL = fileConfig.HOME_BRAIN_URL || process.env.HOME_BRAIN_URL;
const SECRET = fileConfig.HB_HMAC_SECRET || process.env.HB_HMAC_SECRET;
const CF_ID = fileConfig.CF_ACCESS_CLIENT_ID || process.env.CF_ACCESS_CLIENT_ID;
const CF_SECRET = fileConfig.CF_ACCESS_CLIENT_SECRET || process.env.CF_ACCESS_CLIENT_SECRET;

const CLIENT_TIMEOUT_MS = 7000;          // < Alexa's 8s skill ceiling
const BRAIN_DEADLINE_MS = 6500;          // Brain's race timer

function sign(ts, requestId, text) {
  return crypto.createHmac('sha256', SECRET).update(`${ts}.${requestId}.${text}`).digest('hex');
}

/**
 * POST the command to the brain's /interpret. Uses Node's built-in `https`
 * module (NOT global fetch) so it runs on every Alexa-hosted runtime —
 * fetch/AbortController are only globals on Node 18+, and Alexa-hosted
 * skills still provision Node 16. Explicit socket timeout via setTimeout.
 */
function callBrain(payload) {
  return new Promise((resolve, reject) => {
    const ts = Date.now().toString();
    const bodyStr = JSON.stringify(payload);
    const u = new URL(BRAIN_URL);
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(bodyStr),
      'X-HB-Timestamp': ts,
      'X-HB-Signature': sign(ts, payload.requestId, payload.text),
    };
    if (CF_ID && CF_SECRET) {
      headers['CF-Access-Client-Id'] = CF_ID;
      headers['CF-Access-Client-Secret'] = CF_SECRET;
    }
    const req = https.request(
      {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method: 'POST',
        headers,
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            reject(new Error(`brain ${res.statusCode}: ${data.slice(0, 200)}`));
            return;
          }
          try {
            resolve(JSON.parse(data)); // { spoken, status, keepSessionOpen, reprompt }
          } catch (_) {
            reject(new Error(`brain returned non-JSON: ${data.slice(0, 120)}`));
          }
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(CLIENT_TIMEOUT_MS, () => {
      req.destroy(new Error(`brain timeout after ${CLIENT_TIMEOUT_MS}ms`));
    });
    req.write(bodyStr);
    req.end();
  });
}

/** Fire the "On it." progressive response so the user hears something
 * while the planner runs. Non-fatal if it fails — just means a longer
 * wait. Requires .withApiClient(new Alexa.DefaultApiClient()) below. */
async function progressive(handlerInput, speech) {
  try {
    const directiveClient = handlerInput.serviceClientFactory.getDirectiveServiceClient();
    await directiveClient.enqueue({
      header: { requestId: handlerInput.requestEnvelope.request.requestId },
      directive: { type: 'VoicePlayer.Speak', speech },
    });
  } catch (e) {
    console.warn('progressive failed (non-fatal):', e?.message);
  }
}

const Launch = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === 'LaunchRequest';
  },
  handle(h) {
    return h.responseBuilder
      .speak('Home Brain ready. What would you like?')
      .reprompt('Try: dim the kitchen and play jazz.')
      .withShouldEndSession(false)
      .getResponse();
  },
};

const RunCommand = {
  canHandle(h) {
    return Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
        && Alexa.getIntentName(h.requestEnvelope) === 'RunCommandIntent';
  },
  async handle(h) {
    const command = Alexa.getSlotValue(h.requestEnvelope, 'command');
    if (!command || command.trim().length < 2) {
      return h.responseBuilder
        .speak("I didn't catch that.")
        .reprompt("What should Home Brain do?")
        .withShouldEndSession(false)
        .getResponse();
    }

    if (!BRAIN_URL || !SECRET) {
      console.error('missing HOME_BRAIN_URL or HB_HMAC_SECRET');
      return h.responseBuilder
        .speak("Home Brain isn't configured yet.")
        .withShouldEndSession(true)
        .getResponse();
    }

    // Speak immediately so the user knows we heard them.
    await progressive(h, 'On it.');

    let result;
    try {
      result = await callBrain({
        text: command,
        source: 'alexa',
        requestId: h.requestEnvelope.request.requestId,
        sessionId: h.requestEnvelope.session?.sessionId,
        userId: h.requestEnvelope.context?.System?.user?.userId,
        deadlineMs: BRAIN_DEADLINE_MS,
      });
    } catch (e) {
      console.error('brain call failed:', e?.message);
      return h.responseBuilder
        .speak("Home Brain didn't respond in time. Please try again.")
        .withShouldEndSession(true)
        .getResponse();
    }

    const rb = h.responseBuilder.speak(result.spoken || 'Done.');
    if (result.keepSessionOpen) {
      rb.reprompt(result.reprompt || 'Anything else?').withShouldEndSession(false);
    } else {
      rb.withShouldEndSession(true);
    }
    return rb.getResponse();
  },
};

const Help = {
  canHandle: (h) =>
    Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
    && Alexa.getIntentName(h.requestEnvelope) === 'AMAZON.HelpIntent',
  handle: (h) =>
    h.responseBuilder
      .speak('Tell me what to do, like turn off the patio, play jazz in the kitchen, or warm the hot tub.')
      .reprompt('What would you like?')
      .withShouldEndSession(false)
      .getResponse(),
};

/** If NLU couldn't route an utterance to RunCommandIntent (no carrier word
 * matched), don't silently beep — tell the user and keep the session open
 * so they can retry. Also logs to CloudWatch so we can spot common misses. */
const Fallback = {
  canHandle: (h) =>
    Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
    && Alexa.getIntentName(h.requestEnvelope) === 'AMAZON.FallbackIntent',
  handle: (h) => {
    console.warn('fallback fired — utterance did not match RunCommandIntent samples');
    return h.responseBuilder
      .speak("I didn't catch that. Try starting with turn, set, play, open, or close.")
      .reprompt('What should I do?')
      .withShouldEndSession(false)
      .getResponse();
  },
};

const StopOrCancel = {
  canHandle: (h) => {
    if (Alexa.getRequestType(h.requestEnvelope) !== 'IntentRequest') return false;
    const n = Alexa.getIntentName(h.requestEnvelope);
    return n === 'AMAZON.StopIntent' || n === 'AMAZON.CancelIntent';
  },
  handle: (h) => h.responseBuilder.speak('Okay.').withShouldEndSession(true).getResponse(),
};

const SessionEnded = {
  canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'SessionEndedRequest',
  handle: (h) => {
    console.log('session ended:', JSON.stringify(h.requestEnvelope.request.reason));
    return h.responseBuilder.getResponse();
  },
};

const ErrorCatch = {
  canHandle: () => true,
  handle: (h, err) => {
    console.error('unhandled error:', err?.message, err?.stack);
    return h.responseBuilder
      .speak("Something went wrong. Please try again.")
      .withShouldEndSession(true)
      .getResponse();
  },
};

exports.handler = Alexa.SkillBuilders.custom()
  .addRequestHandlers(Launch, RunCommand, Help, Fallback, StopOrCancel, SessionEnded)
  .addErrorHandlers(ErrorCatch)
  .withApiClient(new Alexa.DefaultApiClient())
  .lambda();
