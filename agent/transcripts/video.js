// Video-moment tools (MOO-113 task C). Legistar's EventMedia → a Granicus clip;
// EventItemVideoIndex → the second the agenda item begins. Tier 1 is a deep link to
// the player at that moment; tier 2 cuts a short MP4 that plays inline in Slack.
//
// Tier 2 used to shell out to `yt-dlp --download-sections`, on the belief that raw ffmpeg
// 403s on the resolved stream. It does — until you send a browser User-Agent. yt-dlp's
// downloader has since broken on this player page anyway, so it is now only the URL
// *extractor*: it resolves the archive stream, and ffmpeg range-fetches the window from the
// direct MP4 (which honors HTTP ranges). A 90s clip out of a 3-hour webcast costs seconds.

const DEFAULT_SUBDOMAIN = 'milwaukee';
const DEFAULT_CLIP_SECONDS = 90; // PRD: ~90-second clip of the debate
const MIN_CLIP_SECONDS = 30;

// Granicus's archive CDN 403s a bare ffmpeg; it wants a browser UA.
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';

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

/**
 * Granicus's archive MP4 honors HTTP range requests; its HLS endpoint is throttled to ~0.45x
 * realtime and its player-page downloader breaks. Map a resolved stream URL to the direct MP4 so
 * ffmpeg can seek straight to the moment instead of streaming everything before it.
 * @returns {string|null} the direct MP4 URL, or null when the stream URL isn't a Granicus archive
 */
export function archiveMp4Url(streamUrl) {
  const archive = String(streamUrl ?? '').match(/mp4:archive\/([^/]+)\/([^/]+\.mp4)/);
  return archive ? `https://archive-video.granicus.com/${archive[1]}/${archive[2]}` : null;
}

/**
 * ffmpeg args to cut [start, start+duration] (≥ 30s) straight out of the archive MP4. Seeking
 * before -i makes this a byte-range fetch, so a 90s clip costs seconds regardless of how deep into
 * a three-hour webcast the moment sits. Re-encoded (not stream-copied) so the clip opens on a clean
 * keyframe and plays inline in Slack.
 */
export function buildClipArgs({ mp4Url, startSeconds, durationSeconds = DEFAULT_CLIP_SECONDS, outPath }) {
  const start = Math.max(0, Math.floor(startSeconds));
  const duration = Math.max(MIN_CLIP_SECONDS, Math.floor(durationSeconds));
  return [
    '-nostdin',
    '-loglevel',
    'error',
    '-user_agent',
    BROWSER_UA,
    '-ss',
    String(start),
    '-t',
    String(duration),
    '-i',
    mp4Url,
    '-c:v',
    'libx264',
    '-c:a',
    'aac',
    '-movflags',
    '+faststart',
    outPath,
    '-y',
  ];
}

/**
 * Tier 2: clip the moment to a local MP4 (uploadable to Slack via files.uploadV2).
 * Resolves the archive URL once (yt-dlp is only an extractor here — its downloader is broken on
 * this player page), then lets ffmpeg range-fetch the window. The runner is injected so both
 * commands are unit-tested without the network.
 *
 * @param {{eventMedia:number, startSeconds:number, durationSeconds?:number, outPath:string, subdomain?:string}} opts
 * @param {{run:(cmd:string, args:string[])=>Promise<{stdout:string}>}} deps
 * @returns {Promise<string>} the output path
 */
export async function clipVideoMoment(
  { eventMedia, startSeconds, durationSeconds, outPath, subdomain = DEFAULT_SUBDOMAIN },
  { run },
) {
  const { stdout } = await run('yt-dlp', ['--no-warnings', '-g', mediaPlayerUrl(eventMedia, subdomain)]);
  const mp4Url = archiveMp4Url(String(stdout ?? '').trim().split('\n')[0]);
  if (!mp4Url) throw new Error(`could not resolve an archive MP4 for Granicus clip ${eventMedia}`);
  await run('ffmpeg', buildClipArgs({ mp4Url, startSeconds, durationSeconds, outPath }));
  return outPath;
}

/** Map a clip on disk to `files.uploadV2` arguments (filename derived from the path). */
export function buildUploadParams({ channel, filePath, title, initialComment, filename }) {
  return {
    channel_id: channel,
    file: filePath,
    filename: filename ?? filePath.split('/').pop(),
    title,
    initial_comment: initialComment,
  };
}

/**
 * Upload a clipped moment so it plays inline in a Slack channel. The Slack client
 * is injected so the call is unit-tested without the network.
 *
 * @param {{files:{uploadV2:(args:object)=>Promise<unknown>}}} client
 * @param {{channel:string, filePath:string, title?:string, initialComment?:string, filename?:string}} opts
 */
export async function uploadClipToSlack(client, opts) {
  return client.files.uploadV2(buildUploadParams(opts));
}
