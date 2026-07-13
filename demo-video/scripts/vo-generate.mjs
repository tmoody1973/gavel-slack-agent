// Synthesize the VO segments with ElevenLabs and measure durations — the timeline's master clock.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const VOICE_ID = 'bMytOVfoTSi5oJ3DEe8q';
const API_KEY = process.env.ELEVENLABS_API_KEY;
if (!API_KEY) throw new Error('export ELEVENLABS_API_KEY first (it lives in ~/.claude/.env)');

const root = fileURLToPath(new URL('../vo/', import.meta.url));
const segments = JSON.parse(await readFile(`${root}script.json`, 'utf8'));
await mkdir(`${root}out`, { recursive: true });

const only = process.argv[2]; // optional: regenerate one segment, e.g. `node vo-generate.mjs s4`
const durations = JSON.parse(
  await readFile(`${root}out/durations.json`, 'utf8').catch(() => '{}'),
);

for (const { id, text } of segments) {
  if (only && id !== only) continue;
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: { 'xi-api-key': API_KEY, 'content-type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        // speed 1.1: the clone's natural read paced ~30% under the script's target
        voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 1.1 },
      }),
    },
  );
  if (!res.ok) throw new Error(`${id}: HTTP ${res.status} — ${await res.text()}`);
  const mp3Path = `${root}out/${id}.mp3`;
  await writeFile(mp3Path, Buffer.from(await res.arrayBuffer()));
  const seconds = Number(
    execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', mp3Path]),
  );
  durations[id] = Math.round(seconds * 10) / 10;
  console.log(`${id}: ${durations[id]}s`);
}
await writeFile(`${root}out/durations.json`, JSON.stringify(durations, null, 2));

const total = Object.values(durations).reduce((a, b) => a + b, 0);
const CLIP_AND_PAUSES = 16; // ~12s clip playback + typographic pause beats
console.log(`VO total: ${total.toFixed(1)}s · projected video: ${(total + CLIP_AND_PAUSES).toFixed(1)}s`);
if (total + CLIP_AND_PAUSES > 180) {
  console.log(`⚠️ OVER 3:00 — cut s6 (−${durations.s6}s) → ${(total + CLIP_AND_PAUSES - durations.s6).toFixed(1)}s`);
}
