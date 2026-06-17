// Deepgram Nova-3 batch transcription — the non-deterministic boundary of the
// transcript pipeline. diarize + utterances + smart_format give speaker-labelled
// segments with start/end timestamps (validated live on real chamber audio,
// MOO-40). `fetchFn` is injected so the mapping is unit-tested without the network.

const DEFAULT_MODEL = 'nova-3';
const ENDPOINT = 'https://api.deepgram.com/v1/listen';

/**
 * Transcribe WAV audio into diarized utterances.
 *
 * @param {Uint8Array|Buffer} audio  16kHz mono WAV bytes
 * @param {{apiKey:string, fetchFn?:typeof fetch, model?:string}} options
 * @returns {Promise<Array<{speaker:number, transcript:string, start:number, end:number}>>}
 */
export async function transcribeAudio(audio, { apiKey, fetchFn = fetch, model = DEFAULT_MODEL }) {
  if (!apiKey) throw new Error('transcribeAudio: DEEPGRAM_API_KEY is required');
  const params = new URLSearchParams({
    model,
    diarize: 'true',
    utterances: 'true',
    smart_format: 'true',
    punctuate: 'true',
  });
  const res = await fetchFn(`${ENDPOINT}?${params}`, {
    method: 'POST',
    headers: { Authorization: `Token ${apiKey}`, 'Content-Type': 'audio/wav' },
    body: audio,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Deepgram request failed: ${res.status} ${detail.slice(0, 200)}`);
  }
  const body = await res.json();
  return (body.results?.utterances ?? []).map((u) => ({
    speaker: u.speaker ?? 0,
    transcript: u.transcript ?? '',
    start: u.start ?? 0,
    end: u.end ?? 0,
  }));
}
