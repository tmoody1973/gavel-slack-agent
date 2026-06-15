/**
 * Map an MPROP zoning class to its Milwaukee Ch.295 code family. The code's
 * subchapters are organized by these families, so the family is the retrieval
 * filter key — NOT the aldermanic district. Unknown classes → null.
 * @param {string|null|undefined} zoningClass e.g. "RT4"
 * @returns {string|null}
 */
export function zoningClassToFamily(zoningClass) {
  const code = String(zoningClass ?? '')
    .trim()
    .toUpperCase();
  if (!code) return null;
  if (/^R[TSMO]/.test(code)) return 'residential';
  if (/^(LB|NS|CS|RB|TB)/.test(code)) return 'commercial';
  if (/^C9/.test(code)) return 'downtown';
  if (/^I[LMHOB]/.test(code)) return 'industrial';
  if (/^(PD|TL|T\d)/.test(code)) return 'special';
  return null;
}
