/**
 * Headshot + contact context block for a council member (originally MOO-72's
 * buildMemberContextBlock in alerts/card.js; shared by alerts and threads).
 * @param {{name: string, title: string, imageUrl: string, email?: string, phone?: string, webpage?: string}} member
 * @returns {object}
 */
export function sponsorCard(member) {
  const contact = [
    member.phone && `☎️ ${member.phone}`,
    member.email && `✉️ <mailto:${member.email}|${member.email}>`,
    member.webpage && `<${member.webpage}|City webpage>`,
  ]
    .filter(Boolean)
    .join(' · ');
  return {
    type: 'context',
    elements: [
      { type: 'image', image_url: member.imageUrl, alt_text: member.name },
      { type: 'mrkdwn', text: `*${member.name}* — ${member.title}\n${contact}` },
    ],
  };
}
