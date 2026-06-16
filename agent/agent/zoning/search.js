/**
 * Parcel-conditioned zoning retrieval, formatted for Claude to compose a cited
 * answer. Pure: all I/O (parcel lookup, embeddings, Convex search) is injected.
 * @param {{address:string, question:string}} input
 * @param {{
 *   resolveZoning: (address:string) => Promise<{zoning:string, district:string}|null>,
 *   classToFamily: (zoningClass:string) => string|null,
 *   embedQuery: (text:string) => Promise<number[]>,
 *   search: (q:{embedding:number[], family:string}) => Promise<Array<{section:string,parent:string,text:string,sourceUrl:string}>>,
 * }} deps
 * @returns {Promise<string>}
 */
export async function runZoningAnswer({ address, question }, deps) {
  const parcel = await deps.resolveZoning(address);
  if (!parcel?.zoning) {
    return `information_unavailable: couldn't find a Milwaukee parcel for "${address}", so I can't look up its zoning. Ask the user to check the address.`;
  }
  const zoningClass = parcel.zoning;
  const family = deps.classToFamily(zoningClass);
  const note =
    family === null
      ? `NOTE: zoning class ${zoningClass} isn't mapped to a code family, so only general/citywide provisions were retrieved — say so.`
      : '';
  const embedding = await deps.embedQuery(question);
  const chunks = await deps.search({ embedding, family: family ?? '__none__' });
  if (chunks.length === 0) {
    return `No zoning-code sections matched for ${zoningClass}. Fall back to prose: explain you don't have the specific code text and point to milwaukee.gov, don't invent sections.`;
  }
  const header = [
    `Zoning for ${address}: class ${zoningClass}${family ? ` (${family})` : ''}.`,
    note,
    'Answer the question using ONLY these code sections. CITE the section numbers (e.g. §295-505) you rely on; never invent a section. Keep citations in English even when answering in Spanish.',
  ]
    .filter(Boolean)
    .join('\n');
  const body = chunks.map((c) => `### §${c.section} — ${c.parent}\n${c.text}\n(source: ${c.sourceUrl})`).join('\n\n');
  return `${header}\n\n${body}`;
}
