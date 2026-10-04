// The one place that talks to the Jev model. Everything else goes through askJev().
// If the model is reached another way one day (for example through a gateway instead of its own API),
// this is the only module to swap: keep the same arguments and the same result.
//
// API as documented at docs.typesafe.ai/api (read 4 Oct 2026):
//   POST https://api.typesafe.ai/v1/systemone
//   Authorization: Bearer <key>, Content-Type: application/json
//   body { state, model, questions: { <id>: { type: "choice", instructions, criteria: { <option>: <text> } } } }
//   answer { model, answers: { <id>: { type, choice, probabilities, confidence } }, usage: { input_tokens, output_tokens } }
//   errors: 401 bad key, 422 bad request, 429 rate limit (back off and retry), 529 overloaded (retry)

export const JEV_URL = 'https://api.typesafe.ai/v1/systemone';
export const JEV_MODEL = 'jev-latest';

// Sends one request. Never throws for an HTTP status or a bad body: it reports them.
// Result: { status, body, ms, failure }.
//   status   the HTTP status, or 0 when no answer came
//   body     the parsed JSON body, or null when it was not JSON
//   ms       how long the call took
//   failure  null, 'timeout' or 'network'
export async function askJev({ key, state, questions, model = JEV_MODEL, url = JEV_URL, timeoutMs = 30000 }) {
  const began = Date.now();
  const stop = new AbortController();
  const timer = setTimeout(() => stop.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, model, questions }),
      signal: stop.signal,
    });
    const text = await res.text();
    let body = null;
    try { body = JSON.parse(text); } catch (e) { body = null; }
    return { status: res.status, body, ms: Date.now() - began, failure: null };
  } catch (e) {
    return { status: 0, body: null, ms: Date.now() - began, failure: stop.signal.aborted ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
  }
}
