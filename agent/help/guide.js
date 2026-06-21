/**
 * The Gavel capability guide (MOO-152), as data. Gavel is proactive — it comes to you
 * rather than offering a "type a question" box — so users (and judges with sandbox
 * access) have no map of what it can do. This is that map, tailored to the three
 * personas (Denise/Marcos/Rachel → association/organizer/reporter) and bilingual.
 *
 * Pure, static, curated copy (NOT LLM-generated): reference text must be stable and
 * accurate, and the Spanish is hand-written for a native-speaker review. The Block Kit
 * modal (blockkit/help-modal.js) renders this; nothing here touches Slack or Claude.
 */

export const ROLES = ['association', 'organizer', 'reporter'];

// When a user spans channels of different roles (App Home is cross-channel), lead with
// the most capability-rich persona so the richest tour is the default.
const ROLE_PRIORITY = ['reporter', 'organizer', 'association'];

/** Pick the persona view to default to from a user's set of channel roles. */
export function primaryRole(roles) {
  for (const role of ROLE_PRIORITY) if (Array.isArray(roles) && roles.includes(role)) return role;
  return 'association';
}

/** The full persona guide lives in a Slack Canvas; overridable once it's published. */
export const GUIDE_URL =
  process.env.GAVEL_GUIDE_URL || 'https://github.com/tmoody1973/gavel-slack-agent/blob/main/docs/USER-GUIDE.md';

/** Bilingual string pair. */
const T = (en, es) => ({ en, es });

export const INTRO = T(
  'Gavel watches Milwaukee city hall and *comes to you* — you don’t have to ask. Here’s what you can do.',
  'Gavel vigila el ayuntamiento de Milwaukee y *te avisa* — no tienes que preguntar. Esto es lo que puedes hacer.',
);

export const ROLE_LABEL = {
  association: T('🏘 Resident / neighborhood', '🏘 Vecindario'),
  organizer: T('📣 Organizer', '📣 Organizador'),
  reporter: T('📰 Reporter', '📰 Periodista'),
};

const item = (icon, title, body) => ({ icon, title, body });

// Each plan: a persona tagline + ordered capability sections. Capabilities are REAL,
// shipped features (alerts, threads, /gavel watch, parcel, bridge, escalation, stories,
// dossier, video receipts, zoning) — this surfaces them, it doesn't invent any.
const PLANS = {
  association: {
    tagline: T(
      'Find out what’s coming to your block *before* the vote — and how to speak up.',
      'Entérate de lo que viene a tu cuadra *antes* de la votación — y cómo participar.',
    ),
    sections: [
      {
        heading: T('🔔 Get alerted', '🔔 Recibe alertas'),
        items: [
          item(
            '🔔',
            T('Alerts before the vote', 'Alertas antes de la votación'),
            T(
              'I post plain-English (and Spanish) alerts in your channel when something on the agenda affects your area — before the decision, not after.',
              'Publico alertas en inglés (y español) en tu canal cuando algo en la agenda afecta tu área — antes de la decisión, no después.',
            ),
          ),
          item(
            '🗣',
            T('How to be heard', 'Cómo hacerte oír'),
            T(
              'Every alert tells you when and where the hearing is and how to comment — turning information into action.',
              'Cada alerta te dice cuándo y dónde es la audiencia y cómo comentar — convirtiendo la información en acción.',
            ),
          ),
        ],
      },
      {
        heading: T('👁 Track & ask', '👁 Sigue y pregunta'),
        items: [
          item(
            '👁',
            T('Watch what matters', 'Sigue lo que importa'),
            T(
              'Try `/gavel watch 2000 S 13th St` (or a file number or name) — I ping the channel whenever it moves through the record.',
              'Prueba `/gavel watch 2000 S 13th St` (o un número de expediente o nombre) — aviso al canal cuando avance en el registro.',
            ),
          ),
          item(
            '💬',
            T('Just ask', 'Solo pregunta'),
            T(
              'Reply in any alert’s thread or DM me — “what’s coming up this week?” — I answer in plain language, in your language.',
              'Responde en el hilo de cualquier alerta o envíame un DM — “¿qué viene esta semana?” — respondo en lenguaje claro, en tu idioma.',
            ),
          ),
          item(
            '⚙️',
            T('Your setup', 'Tu configuración'),
            T(
              '`/gavel status` shows this channel’s committees, topics, and language; the App Home lets you tune them.',
              '`/gavel status` muestra los comités, temas e idioma de este canal; la App Home te deja ajustarlos.',
            ),
          ),
        ],
      },
    ],
  },
  organizer: {
    tagline: T(
      'Organize across neighborhoods — in Spanish, with the city’s records doing the legwork.',
      'Organiza entre vecindarios — en español, con los registros de la ciudad haciendo el trabajo.',
    ),
    sections: [
      {
        heading: T('📣 Mobilize', '📣 Moviliza'),
        items: [
          item(
            '🌎',
            T('Spanish, natively', 'Español, de forma nativa'),
            T(
              'Every card is *written* in Spanish (not machine-translated) when your channel’s language is set to Español.',
              'Cada tarjeta se *escribe* en español (no traducción automática) cuando el idioma del canal es Español.',
            ),
          ),
          item(
            '🧠',
            T('Community-memory bridge', 'Puente de memoria comunitaria'),
            T(
              'When your group has been discussing something that lands on the agenda, I connect the two — “you’ve been talking about this; it’s up this week.”',
              'Cuando tu grupo ha estado hablando de algo que llega a la agenda, conecto ambos — “han estado hablando de esto; está esta semana.”',
            ),
          ),
        ],
      },
      {
        heading: T('🔎 Investigate & track', '🔎 Investiga y sigue'),
        items: [
          item(
            '🏠',
            T('Who owns this?', '¿Quién es el dueño?'),
            T(
              'Ask me about an address — I pull ownership, the parcel, and recent permits from city records.',
              'Pregúntame por una dirección — saco el dueño, la parcela y los permisos recientes de los registros.',
            ),
          ),
          item(
            '👁',
            T('Watchlists + escalation', 'Listas de seguimiento + alertas'),
            T(
              'Watch an owner, developer, or address across channels; I escalate when an item jumps from committee toward a final vote.',
              'Sigue a un dueño, urbanizador o dirección en varios canales; escalo cuando un asunto pasa del comité hacia la votación final.',
            ),
          ),
          item(
            '💬',
            T('Ask in any language', 'Pregunta en cualquier idioma'),
            T(
              'DM me or reply in a thread — I answer in the language you write in.',
              'Envíame un DM o responde en un hilo — respondo en el idioma en que escribes.',
            ),
          ),
        ],
      },
    ],
  },
  reporter: {
    tagline: T(
      'Cover city hall faster — leads, dossiers, and *receipts* with the quote, the speaker, and the clip.',
      'Cubre el ayuntamiento más rápido — pistas, expedientes y *pruebas* con la cita, quién habló y el video.',
    ),
    sections: [
      {
        heading: T('📰 Find the story', '📰 Encuentra la historia'),
        items: [
          item(
            '📰',
            T('Story leads', 'Pistas de reportaje'),
            T(
              '`/gavel stories` ranks what’s newsworthy on the upcoming agenda — money, accountability, anomalies — grounded in the record.',
              '`/gavel stories` clasifica lo noticioso en la agenda — dinero, rendición de cuentas, anomalías — basado en el registro.',
            ),
          ),
          item(
            '📋',
            T('Brief me (dossier)', 'Resúmeme (expediente)'),
            T(
              'On any lead, hit “Brief me” for a one-screen dossier: angle, sponsor, history, the video moment, and the outcome.',
              'En cualquier pista, pulsa “Resúmeme” para un expediente de una pantalla: ángulo, patrocinador, historial, el momento en video y el resultado.',
            ),
          ),
        ],
      },
      {
        heading: T('🎥 Get the receipts', '🎥 Consigue las pruebas'),
        items: [
          item(
            '🎥',
            T('What did they say?', '¿Qué dijeron?'),
            T(
              '`/gavel video` browses footage; ask “what did the committee say about X” and I return the quote, the speaker, and a ▶ timestamped clip.',
              '`/gavel video` explora los videos; pregunta “qué dijo el comité sobre X” y devuelvo la cita, quién habló y un video ▶ con marca de tiempo.',
            ),
          ),
          item(
            '🧱',
            T('What could they build?', '¿Qué podrían construir?'),
            T(
              'Ask a zoning question about a parcel — I answer with the relevant code sections.',
              'Haz una pregunta de zonificación sobre una parcela — respondo con las secciones del código pertinentes.',
            ),
          ),
          item(
            '💬',
            T('Ask anything', 'Pregunta lo que sea'),
            T(
              'Reply in a thread or DM — I cite primary sources and never invent a quote.',
              'Responde en un hilo o DM — cito fuentes primarias y nunca invento una cita.',
            ),
          ),
        ],
      },
    ],
  },
};

/**
 * Resolve one persona's guide into a single language — the shape the modal renders.
 * @param {'association'|'organizer'|'reporter'|string} role
 * @param {'en'|'es'} [language]
 * @returns {{role:string, label:string, tagline:string, sections:Array<{heading:string, items:Array<{icon:string,title:string,body:string}>}>}}
 */
export function helpForRole(role, language = 'en') {
  const resolvedRole = PLANS[role] ? role : 'association';
  const plan = PLANS[resolvedRole];
  const pick = (pair) => (language === 'es' ? pair.es : pair.en);
  return {
    role: resolvedRole,
    label: pick(ROLE_LABEL[resolvedRole]),
    tagline: pick(plan.tagline),
    sections: plan.sections.map((section) => ({
      heading: pick(section.heading),
      items: section.items.map((it) => ({ icon: it.icon, title: pick(it.title), body: pick(it.body) })),
    })),
  };
}
