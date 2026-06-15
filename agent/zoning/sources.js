/** Authoritative Ch.295 ZONING PDFs (city.milwaukee.gov, Volume 2). Each entry
 * is one subchapter; `family`/`scope` classify its chunks for parcel-conditioned
 * retrieval. The TABLE is ingested whole (scope "table"). */
const BASE = 'https://city.milwaukee.gov/ImageLibrary/Groups/ccClerk/Ordinances/Volume-2';

export const CH295_SOURCES = [
  { file: 'CH295-sub1.pdf', parent: 'Subchapter 1 — Introduction', family: 'general', scope: 'general' },
  {
    file: 'CH295-sub2.pdf',
    parent: 'Subchapter 2 — Definitions and Rules of Measurement',
    family: 'general',
    scope: 'general',
  },
  {
    file: 'CH295-sub3.pdf',
    parent: 'Subchapter 3 — Administration, Enforcement and Appeals',
    family: 'general',
    scope: 'general',
  },
  { file: 'CH295-sub4.pdf', parent: 'Subchapter 4 — General Provisions', family: 'general', scope: 'general' },
  { file: 'CH295-sub5.pdf', parent: 'Subchapter 5 — Residential Districts', family: 'residential', scope: 'district' },
  { file: 'CH295-sub6.pdf', parent: 'Subchapter 6 — Commercial Districts', family: 'commercial', scope: 'district' },
  { file: 'CH295-sub7.pdf', parent: 'Subchapter 7 — Downtown Districts', family: 'downtown', scope: 'district' },
  { file: 'CH295-sub8.pdf', parent: 'Subchapter 8 — Industrial Districts', family: 'industrial', scope: 'district' },
  { file: 'CH295-sub9.pdf', parent: 'Subchapter 9 — Special Districts', family: 'special', scope: 'district' },
  { file: 'CH295-sub10.pdf', parent: 'Subchapter 10 — Overlay Zones', family: 'overlay', scope: 'district' },
  { file: 'CH295table.pdf', parent: 'Chapter 295 — Zoning Table', family: 'general', scope: 'table' },
].map((s) => ({ ...s, url: `${BASE}/${s.file}` }));
