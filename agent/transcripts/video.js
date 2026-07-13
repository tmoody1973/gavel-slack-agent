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
 * realtime. Map a resolved stream URL to the direct MP4 so ffmpeg can seek straight to the moment
 * instead of streaming everything before it.
 * @returns {string|null} the direct MP4 URL, or null when the stream URL isn't a Granicus archive
 */
export function archiveMp4Url(streamUrl) {
  const archive = String(streamUrl ?? '').match(/mp4:archive\/([^/]+)\/([^/]+\.mp4)/);
  return archive ? `https://archive-video.granicus.com/${archive[1]}/${archive[2]}` : null;
}

/**
 * The player page (after redirects) names the archive MP4 outright. Scraping it is how we avoid
 * yt-dlp entirely: its Granicus extractor fails intermittently with "No video formats found", which
 * is not something to hang a resident's request on.
 * @returns {string|null} the direct MP4 URL, or null when the page doesn't name one
 */
export function extractArchiveMp4(html) {
  const found = String(html ?? '').match(/archive-video\.granicus\.com\/[^"'\s<>\\]+\.mp4/);
  return found ? `https://${found[0]}` : null;
}

/**
 * Resolve a Granicus clip id to its range-seekable archive MP4 by reading the player page.
 *
 * KNOWN LIMITATION (verified 2026-07-12): Granicus serves this page to anyone, but 403s the archive
 * MP4 itself when the request comes from a datacenter IP — every header combination (UA, Referer,
 * none) returns 403 from Fly, while the identical request from a residential IP returns 206. So
 * `clip_video_moment` works from the ingest host but degrades to a timestamped deep link in the
 * deployed app. Don't spend another night on headers; it is an IP block. Fixing it means fetching
 * the media through an allowed egress (or caching clips at ingest), not more request tuning.
 *
 * @param {{fetchFn?:typeof fetch}} deps
 */
export async function resolveArchiveMp4(eventMedia, { fetchFn = fetch, subdomain = DEFAULT_SUBDOMAIN } = {}) {
  const res = await fetchFn(mediaPlayerUrl(eventMedia, subdomain), {
    headers: { 'User-Agent': BROWSER_UA },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`Granicus player page returned ${res.status} for clip ${eventMedia}`);
  const mp4Url = extractArchiveMp4(await res.text());
  if (!mp4Url) throw new Error(`the Granicus player page for clip ${eventMedia} names no archive MP4`);
  return mp4Url;
}

/**
 * ffmpeg args to cut [start, start+duration] (≥ 30s) straight out of the archive MP4. Seeking
 * before -i makes this a byte-range fetch, so the cut costs seconds no matter how deep into a
 * three-hour webcast the moment sits. Stream-copied, not re-encoded: -ss lands on a keyframe, so
 * the clip is already valid MP4 and Slack plays it inline. Re-encoding a 90s clip cost ~85s of CPU
 * — far too slow to run inside a resident's request; copying it costs ~3s.
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
    '-c',
    'copy',
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
  { run, fetchFn = fetch },
) {
  const mp4Url = await resolveArchiveMp4(eventMedia, { fetchFn, subdomain });
  await run('ffmpeg', buildClipArgs({ mp4Url, startSeconds, durationSeconds, outPath }));
  return outPath;
}

/** Map a clip on disk to `files.uploadV2` arguments (filename derived from the path). */
export function buildUploadParams({ channel, filePath, title, initialComment, filename, thread_ts: threadTs }) {
  return {
    channel_id: channel,
    file: filePath,
    filename: filename ?? filePath.split('/').pop(),
    title,
    initial_comment: initialComment,
    // Keep the clip in the thread the resident asked in, not the channel root.
    ...(threadTs ? { thread_ts: threadTs } : {}),
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
