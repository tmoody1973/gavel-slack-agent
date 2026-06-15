// MOO-54 staged sandbox corpus. Each channel carries its subscription config
// (real Legistar EventBodyName committee strings, copied from the working
// #general subscription, so alerts/digests actually route) and a small set of
// content-dated messages drawn from the personas.
//
// Slack cannot backdate a message, so this is real content posted now and
// disclosed as staged: the bracketed [Mon YYYY] in each message is the date the
// content represents. Messages store text only — never a user id or author —
// the project's minimal-PII rule extends to the seed.
//
// The one anchored thread lives in the Spanish near-south-side channel and
// references the real civic record (Punta Cana LLC / 2000 S 13th St / File
// #260229), so the demo's community-memory search surfaces a thread that maps
// to a live alert.

const ZND = 'ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE';
const CITY_PLAN = 'CITY PLAN COMMISSION';
const LICENSES = 'LICENSES COMMITTEE';
const CED = 'COMMUNITY & ECONOMIC DEVELOPMENT COMMITTEE';

export const SANDBOX_CHANNELS = [
  {
    name: 'sherman-park',
    language: 'en',
    client: 'milwaukee',
    boundary: { type: 'district', value: '7' },
    committees: [ZND, CITY_PLAN],
    keywords: ['rezoning', 'demolition', 'zoning'],
    messages: [
      {
        date: 'Mar 2024',
        text: 'Did anyone catch what happened with the rezoning over on N Sherman Blvd? I only found out after it already went to committee.',
      },
      {
        date: 'Apr 2024',
        text: 'There is a demolition notice posted on the old storefront near 35th and Center. Anyone know the backstory?',
      },
      {
        date: 'Jun 2024',
        text: 'Reminder: the neighborhood association meets the second Tuesday. Bring any zoning questions and we will sort them out.',
      },
      {
        date: 'Sep 2024',
        text: 'City Plan Commission agenda this week mentions a corner-store conversion on Burleigh. Worth a look before it moves.',
      },
      {
        date: 'Jan 2025',
        text: 'Happy new year, everyone. Let us keep an eye on demolition permits this spring so nothing sneaks through.',
      },
    ],
  },
  {
    name: 'lindsay-heights',
    language: 'en',
    client: 'milwaukee',
    boundary: { type: 'district', value: '6' },
    committees: [CED, ZND],
    keywords: ['development', 'vacant lot', 'rezoning'],
    messages: [
      {
        date: 'Feb 2024',
        text: 'Saw surveyors on the vacant lot on N 17th yesterday. Is something getting developed there?',
      },
      {
        date: 'May 2024',
        text: 'CED had an item about a development grant for the Fondy area. Did anyone hear if it passed?',
      },
      {
        date: 'Aug 2024',
        text: 'Another vacant-lot rezoning request near Lloyd St. We should weigh in before the hearing instead of after.',
      },
      {
        date: 'Nov 2024',
        text: 'Community garden folks are asking whether the lot on 20th is still city-owned. Anyone know?',
      },
      {
        date: 'Mar 2025',
        text: 'Heads up: spring construction season means more permit filings. Flag anything near our blocks.',
      },
    ],
  },
  {
    name: 'clarke-square',
    language: 'es',
    client: 'milwaukee',
    boundary: { type: 'district', value: '12' },
    committees: [LICENSES, ZND],
    keywords: ['liquor license', 'zoning', 'Punta Cana'],
    messages: [
      {
        date: 'Mar 2024',
        text: 'Bienvenidos al canal de Clarke Square. Aquí compartimos avisos de la ciudad y novedades del vecindario.',
      },
      {
        date: 'Jul 2024',
        text: 'Hay una propuesta de rezonificación cerca de National Ave. ¿Alguien tiene detalles antes de la audiencia?',
      },
    ],
    thread: {
      anchor: 'Punta Cana LLC',
      messages: [
        {
          date: 'Feb 2025',
          text: '¿Alguien sabe qué está pasando con el local en 2000 S 13th St? Vi que Punta Cana LLC pidió una licencia de licor.',
        },
        {
          date: 'Feb 2025',
          text: 'Yes — Punta Cana LLC filed for a liquor license at 2000 S 13th St. It is File #260229 on the city site, headed to the Licenses Committee.',
        },
        {
          date: 'Feb 2025',
          text: 'Me preocupa el ruido y el estacionamiento por la noche. ¿Podemos ir a la audiencia para opinar?',
        },
        {
          date: 'Feb 2025',
          text: 'We should show up. Last time a license like this went through with zero neighborhood input.',
        },
      ],
    },
  },
];
