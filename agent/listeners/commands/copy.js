// Bilingual strings for the /gavel command surface (the Spanish ramp's top rungs).
// Mirrors onboarding/copy.js: a {en, es} block + a required-keys test guarantees no
// English cliff. Civic identifiers and slash-command syntax stay English in both.

export const COMMAND_REQUIRED_KEYS = [
  'help',
  'usageSearch',
  'usageWatch',
  'usageUnwatch',
  'digestStub',
  'genericError',
  'notConfigured',
  'statusHeading',
];

const HELP_EN = [
  '*Gavel commands*',
  '• `/gavel watch <entity>` — alert this channel when a file number, address, or name appears',
  '• `/gavel search <term>` — search city mail, agendas, minutes & zoning (quotes = exact phrase)',
  '• `/gavel stories [committee|topic]` — ranked story leads on the upcoming agenda (for reporters)',
  '• `/gavel video [committee]` — browse recent meeting video you can watch (and search)',
  "• `/gavel status` — show this channel's committees, keywords, language, and watches",
  '• `/gavel unwatch <entity>` — stop watching (names as shown in `/gavel status`)',
].join('\n');

const HELP_ES = [
  '*Comandos de Gavel*',
  '• `/gavel watch <entidad>` — avisa a este canal cuando aparezca un número de expediente, dirección o nombre',
  '• `/gavel search <término>` — busca en el correo de la ciudad, agendas, actas y zonificación (comillas = frase exacta)',
  '• `/gavel stories [comité|tema]` — pistas de reportaje en la agenda próxima (para periodistas)',
  '• `/gavel video [comité]` — explora video reciente de reuniones (y búscalo)',
  '• `/gavel status` — muestra los comités, palabras clave, idioma y seguimientos de este canal',
  '• `/gavel unwatch <entidad>` — deja de seguir (nombres tal como aparecen en `/gavel status`)',
].join('\n');

export const COMMAND_COPY = {
  en: {
    help: HELP_EN,
    usageSearch:
      'Usage: `/gavel search <term>` — e.g. `/gavel search 2000 S 13th St`, `/gavel search tavern`, or `/gavel search "data center"` (quotes = exact phrase).',
    usageWatch: 'Usage: `/gavel watch <entity>` — e.g. `/gavel watch 2000 S 13th St` or `/gavel watch File #260229`.',
    usageUnwatch: 'Usage: `/gavel unwatch <entity>` — exactly as it appears in `/gavel status`.',
    digestStub: 'The weekly digest is coming soon — for now I post alerts here automatically.',
    genericError: ':warning: Something went wrong — please try again.',
    notConfigured:
      "This channel isn't set up yet — run `/gavel` to choose what I watch. No alerts post here until then.",
    statusHeading: '*Gavel status for this channel*',
  },
  es: {
    help: HELP_ES,
    usageSearch:
      'Uso: `/gavel search <término>` — p. ej. `/gavel search 2000 S 13th St`, `/gavel search tavern`, o `/gavel search "data center"` (las comillas = frase exacta).',
    usageWatch: 'Uso: `/gavel watch <entidad>` — p. ej. `/gavel watch 2000 S 13th St` o `/gavel watch File #260229`.',
    usageUnwatch: 'Uso: `/gavel unwatch <entidad>` — exactamente como aparece en `/gavel status`.',
    digestStub: 'El resumen semanal llegará pronto — por ahora publico alertas aquí automáticamente.',
    genericError: ':warning: Algo salió mal — inténtalo de nuevo.',
    notConfigured:
      'Este canal aún no está configurado — escribe `/gavel` para elegir qué vigilo. No publico alertas aquí hasta entonces.',
    statusHeading: '*Estado de Gavel para este canal*',
  },
};

const LABELS = {
  en: {
    committees: '🏛 Committees',
    keywords: '🔑 Keywords',
    language: '🌐 Language',
    watches: '👁 Watches',
    english: 'English',
    spanish: 'Español (bilingual cards)',
  },
  es: {
    committees: '🏛 Comités',
    keywords: '🔑 Palabras clave',
    language: '🌐 Idioma',
    watches: '👁 Seguimientos',
    english: 'Inglés',
    spanish: 'Español (tarjetas bilingües)',
  },
};

/** The bilingual command-copy bundle for a channel language (falls back to EN). */
export function commandCopy(language) {
  const lang = language === 'es' ? 'es' : 'en';
  const strings = COMMAND_COPY[lang];
  const label = LABELS[lang];
  return {
    ...strings,
    statusLine: ({ committees, keywords, language: chLang, watchList }) =>
      [
        strings.statusHeading,
        `${label.committees}: ${committees}`,
        `${label.keywords}: ${keywords}`,
        `${label.language}: ${chLang === 'es' ? label.spanish : label.english}`,
        `${label.watches}:\n${watchList}`,
      ].join('\n'),
  };
}
