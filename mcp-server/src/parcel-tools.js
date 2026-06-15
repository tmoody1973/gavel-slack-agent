import { z } from 'zod';
import { informationUnavailable, safeCall } from './errors.js';

// JSON-as-text only, matching the Legistar tools (MCP rejects array
// structuredContent with -32602). The text payload carries everything the agent reads.
const text = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value) }] });

const watchHint = (owner) => `To track this owner citywide: /gavel watch "${owner}"`;

/**
 * Register the parcel layer of the Civic MCP server (MPROP + buildingpermits via
 * CKAN). Mirrors registerTools: every handler is wrapped in safeCall so a network
 * or parse failure degrades to information_unavailable instead of crashing.
 */
export function registerParcelTools(server, parcel) {
  const tool = (name, config, run) =>
    server.registerTool(name, config, async (args) =>
      text(await safeCall(() => run(args), `${name}(${JSON.stringify(args)})`)),
    );

  tool(
    'lookup_parcel',
    {
      description:
        'Property record for a street address from MPROP (daily): TAXKEY, zoning, land use, aldermanic district, owner, assessed value, plus open-violation / raze flags. Returns information_unavailable when the address is not in MPROP.',
      inputSchema: z.object({ address: z.string() }),
    },
    async ({ address }) => {
      const parcel_ = await parcel.lookupParcel(address);
      if (!parcel_) return informationUnavailable(`no MPROP parcel for "${address}"`);
      return parcel_.owner ? { ...parcel_, watchHint: watchHint(parcel_.owner) } : parcel_;
    },
  );

  tool(
    'check_zoning',
    {
      description: 'Current zoning district and aldermanic district for an address (MPROP).',
      inputSchema: z.object({ address: z.string() }),
    },
    async ({ address }) => {
      const zoning = await parcel.checkZoning(address);
      return zoning ?? informationUnavailable(`no MPROP parcel for "${address}"`);
    },
  );

  tool(
    'get_ownership_portfolio',
    {
      description:
        'Every parcel owned by a name/LLC in MPROP — the "who else do they own?" view. Use match:"contains" to catch shell variants (e.g. BERRADA PROPERTIES 24/36 LLC). Returns a total count plus the first `limit` parcels.',
      inputSchema: z.object({
        owner_name: z.string(),
        limit: z.number().optional(),
        match: z.enum(['exact', 'contains']).optional(),
      }),
    },
    async ({ owner_name, limit, match }) => {
      const portfolio = await parcel.getOwnershipPortfolio(owner_name, { limit, match });
      return { ...portfolio, watchHint: watchHint(owner_name) };
    },
  );

  tool(
    'get_permits',
    {
      description:
        'Building permits filed at an address, from the Milwaukee buildingpermits dataset (monthly refresh — disclosed in the output `source`). Optional `since` (YYYY-MM-DD) filters by date opened.',
      inputSchema: z.object({ address: z.string(), since: z.string().optional() }),
    },
    ({ address, since }) => parcel.getPermits(address, { since }),
  );
}
