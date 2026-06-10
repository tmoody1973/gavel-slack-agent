/**
 * Compact matter receipt: file number + title section, then a status/body/link
 * context line. Classic sections (the shipped alert-card vocabulary).
 * @param {{fileNumber?: string, title: string, status?: string, bodyName?: string, legistarUrl?: string}} matter
 * @returns {object[]}
 */
export function matterCard(matter) {
  const heading = matter.fileNumber ? `*File #${matter.fileNumber}* — ${matter.title}` : `*${matter.title}*`;
  const meta = [
    matter.status && `Status: ${matter.status}`,
    matter.bodyName && `Before: ${matter.bodyName}`,
    matter.legistarUrl && `<${matter.legistarUrl}|milwaukee.legistar.com>`,
  ]
    .filter(Boolean)
    .join(' · ');
  const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: heading } }];
  if (meta) {
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: meta }] });
  }
  return blocks;
}
