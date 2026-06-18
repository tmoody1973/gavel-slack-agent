// Curated EN/ES onboarding strings for the Front Door (MOO-117 · spec §2, §3.1).
// Onboarding copy is static, so it's a hand-written bilingual string set — not
// Claude calls. Per the project rule, civic identifiers stay English even in the
// Spanish block: committee names, file numbers, addresses (e.g. "Hopkins Street"),
// channel handles (#gavel-watchlist) and the @Gavel mention.

export const LANGUAGES = ['en', 'es'];

// Every onboarding surface's strings must exist in both languages; the test fails
// if any key is missing from either block. Keep this list in sync with COPY.
export const REQUIRED_KEYS = [
  'nudgeIntro',
  'nudgeButton',
  'roleQuestion',
  'roleAssociation',
  'roleOrganizer',
  'roleReporter',
  'confirmHeading',
  'confirmGoLive',
  'confirmCustomize',
  'liveConfirmation',
  'memberWelcome',
  'memberAsk',
  'memberWhatCanYouDo',
  'whatCanYouDoBody',
  'transcriptExample',
  'growPrompt',
  'growHow',
  'growChecklist',
  'growAreasIntro',
];

export const COPY = {
  en: {
    nudgeIntro: "👋 I'm Gavel — I watch Milwaukee city hall so your neighbors don't have to.",
    nudgeButton: 'Set up Gavel',
    roleQuestion: 'What do you run?',
    roleAssociation: '👵 Neighborhood association',
    roleOrganizer: '📣 Community organizer',
    roleReporter: '📰 Reporter',
    confirmHeading: "Here's what I'll watch for you",
    confirmGoLive: 'Go live',
    confirmCustomize: 'Customize…',
    liveConfirmation: "✅ You're live — here's what I'll watch for you.",
    memberWelcome:
      "I watch Milwaukee city hall for your block. You'll see plain-language alerts here before the vote. Ask me anything in a thread or DM.",
    memberAsk: 'Ask Gavel',
    memberWhatCanYouDo: 'What can you do?',
    whatCanYouDoBody:
      'I turn city-hall legalese into plain-language alerts before the vote, search what was actually said in meetings, and track permits, zoning, and licenses for your area.',
    transcriptExample: 'Try: what did the committee say about the Hopkins Street sale?',
    growPrompt: 'Want watch-hits in their own #gavel-watchlist channel?',
    growHow: 'How →',
    growChecklist:
      "1) Create a #gavel-watchlist channel · 2) /invite @Gavel · 3) Done — I'll route every watch hit there.",
    growAreasIntro:
      'Cover more than one neighborhood? Give each its own channel so alerts stay local: 1) Create a channel per area (e.g. #civic-riverwest, #civic-bayview) · 2) /invite @Gavel · 3) Run `/gavel` in each to set its committees + language. I propose; you create.',
  },
  es: {
    nudgeIntro: '👋 Soy Gavel — vigilo el ayuntamiento de Milwaukee para que tus vecinos no tengan que hacerlo.',
    nudgeButton: 'Configurar Gavel',
    roleQuestion: '¿Qué diriges?',
    roleAssociation: '👵 Asociación vecinal',
    roleOrganizer: '📣 Organizador comunitario',
    roleReporter: '📰 Periodista',
    confirmHeading: 'Esto es lo que vigilaré para ti',
    confirmGoLive: 'Activar',
    confirmCustomize: 'Personalizar…',
    liveConfirmation: '✅ Ya estás activo — esto es lo que vigilaré para ti.',
    memberWelcome:
      'Vigilo el ayuntamiento de Milwaukee por tu barrio. Verás alertas en lenguaje claro aquí antes de la votación. Pregúntame lo que sea en un hilo o por mensaje directo.',
    memberAsk: 'Pregúntale a Gavel',
    memberWhatCanYouDo: '¿Qué puedes hacer?',
    whatCanYouDoBody:
      'Convierto la jerga del ayuntamiento en alertas claras antes de la votación, busco lo que realmente se dijo en las reuniones y sigo permisos, zonificación y licencias de tu zona.',
    transcriptExample: 'Prueba: ¿qué dijo el comité sobre la venta de Hopkins Street?',
    growPrompt: '¿Quieres los avisos de seguimiento en su propio canal #gavel-watchlist?',
    growHow: 'Cómo →',
    growChecklist:
      '1) Crea un canal #gavel-watchlist · 2) /invite @Gavel · 3) Listo — enviaré cada aviso de seguimiento ahí.',
    growAreasIntro:
      '¿Cubres más de un barrio? Dale a cada uno su propio canal para que las alertas sigan siendo locales: 1) Crea un canal por zona (p. ej. #civic-riverwest, #civic-bayview) · 2) /invite @Gavel · 3) Ejecuta `/gavel` en cada uno para fijar sus comités e idioma. Yo propongo; tú creas.',
  },
};

/**
 * The copy block for a language, falling back to English for anything unsupported
 * (mirrors normalizeSubscription's language default — never throws on bad input).
 *
 * @param {string} [language]
 * @returns {typeof COPY.en}
 */
export function copyFor(language) {
  return LANGUAGES.includes(language) ? COPY[language] : COPY.en;
}
