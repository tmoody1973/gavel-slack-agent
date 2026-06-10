/** Slack data_table hard limit: 100 data rows + 1 header. */
const MAX_DATA_ROWS = 100;
/** One Slack page fits the full 15-member Common Council roll call. */
const PAGE_SIZE = 15;

/**
 * Member→vote table as Slack's data_table block (spike-verified for this app).
 * @param {{caption: string, votes: Array<{member: string, vote: string}>}} input
 * @returns {object}
 */
export function voteTable({ caption, votes }) {
  const cell = (text) => ({ type: 'raw_text', text });
  const rows = [
    [cell('Member'), cell('Vote')],
    ...votes.slice(0, MAX_DATA_ROWS).map((v) => [cell(v.member), cell(v.vote)]),
  ];
  return { type: 'data_table', caption, rows, page_size: PAGE_SIZE };
}
