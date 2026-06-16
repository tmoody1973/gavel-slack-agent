// Video-moment tools (MOO-113 task C). Legistar's EventMedia → a Granicus clip;
// EventItemVideoIndex → the second the agenda item begins. Tier 1 is a deep link
// to the player at that moment; tier 2 clips a short segment with yt-dlp (which
// handles Granicus's auth/referer — raw ffmpeg on the resolved stream 403s).
// Proven live on clip 5210 (an 8s + 90s section download both succeeded).

const DEFAULT_SUBDOMAIN = 'milwaukee';
const DEFAULT_CLIP_SECONDS = 90; // PRD: ~90-second clip of the debate
const MIN_CLIP_SECONDS = 30;

function mediaPlayerUrl(eventMedia, subdomain) {
  return `https://${subdomain}.granicus.com/MediaPlayer.php?clip_id=${eventMedia}`;
}

/** The Granicus player URL for a clip. */
export function granicusMediaUrl(eventMedia, { subdomain = DEFAULT_SUBDOMAIN } = {}) {
  return mediaPlayerUrl(eventMedia, subdomain);
}

/** Tier 1: a deep link to the player positioned at the item's timestamp. */
export function videoMomentDeepLink(eventMedia, startSeconds, { subdomain = DEFAULT_SUBDOMAIN } = {}) {
  return `${mediaPlayerUrl(eventMedia, subdomain)}&starttime=${Math.max(0, Math.floor(startSeconds))}`;
}

/** yt-dlp args to download just the [start, start+duration] section (≥ 30s). */
export function buildClipArgs({
  eventMedia,
  startSeconds,
  durationSeconds = DEFAULT_CLIP_SECONDS,
  outPath,
  subdomain = DEFAULT_SUBDOMAIN,
}) {
  const start = Math.max(0, Math.floor(startSeconds));
  const end = start + Math.max(MIN_CLIP_SECONDS, Math.floor(durationSeconds));
  return [
    '--no-warnings',
    '--quiet',
    '--download-sections',
    `*${start}-${end}`,
    '--force-keyframes-at-cuts',
    '-o',
    outPath,
    mediaPlayerUrl(eventMedia, subdomain),
  ];
}

/**
 * Tier 2: clip the moment to a local MP4 (uploadable to Slack via files.uploadV2).
 * The process runner is injected so the command is unit-tested without the network.
 *
 * @param {{eventMedia:number, startSeconds:number, durationSeconds?:number, outPath:string, subdomain?:string}} opts
 * @param {{run:(cmd:string, args:string[])=>Promise<unknown>}} deps
 * @returns {Promise<string>} the output path
 */
export async function clipVideoMoment(opts, { run }) {
  await run('yt-dlp', buildClipArgs(opts));
  return opts.outPath;
}
