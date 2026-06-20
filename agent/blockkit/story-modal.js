// Story-leads browse modal (MOO-130). The App Home is lean triage (one line per
// cluster); this modal is the rich "show me everything, my way" view: a beat-grouped
// list of every newsworthy lead with a dropdown filter (All / by committee / by MOO-121
// topic / by district). Pure builder — classic Block Kit only (guaranteed to render in a
// modal) and well under the 100-block cap. No Claude call: explainable tags + dates only.
//
// The handler refetches the cheap pure pipeline on each filter change and re-renders via
// views.update, so the filter is stateless — `decodeFilter` (exported) turns the selected
// option value back into a filter object for that refetch.

import { matchSubscriptions } from '../alerts/match.js';
import { committeesAndKeywordsForTopics, topicChoices } from '../onboarding/topics.js';
import { clusterLeads } from '../stories/cluster.js';
import { districtOf } from '../home/salience.js';
import { metaLine, themeLabel } from './story-labels.js';

const plain = (text) => ({ type: 'plain_text', text: String(text).slice(0, 75), emoji: true });
const mrkdwn = (text) => ({ type: 'section', text: { type: 'mrkdwn', text } });
const context = (text) => ({ type: 'context', elements: [{ type: 'mrkdwn', text }] });

// Slack caps a modal at 100 blocks; each lead is ≤2 blocks plus group headers, so 40
// leads is a safe ceiling for the realistically tiny newsworthy set (≤6 this week).
const MAX_MODAL_LEADS = 40;
// static_select option `value` caps at 75 chars; Milwaukee committee names fit under the
// `c::` + name budget, so we keep the exact name for an exact filter match.
const VALUE_MAX = 75;

const COPY = {
  en: {
    title: '📰 Story leads',
    close: 'Close',
    leadIn: 'Every lead on the upcoming agenda, grouped by beat. Filter to your patch.',
    filterAll: 'Show',
    allOption: 'All story leads',
    byCommittee: 'By committee',
    byTopic: 'By topic',
    byDistrict: 'By district',
    watch: '👁 Watch',
    ask: '💬 Ask Gavel',
    empty: 'No story leads match this filter — try another.',
    quiet: 'Quiet week — nothing on the upcoming agenda is jumping out as a story yet.',
    disclaimer: '_Leads, not conclusions — Gavel points you to what’s worth a look and the public record behind it._',
  },
  es: {
    title: '📰 Pistas',
    close: 'Cerrar',
    leadIn: 'Todas las pistas de la próxima agenda, agrupadas por tema. Filtra por tu zona.',
    filterAll: 'Mostrar',
    allOption: 'Todas las pistas',
    byCommittee: 'Por comité',
    byTopic: 'Por tema',
    byDistrict: 'Por distrito',
    watch: '👁 Seguir',
    ask: '💬 Pregúntale a Gavel',
    empty: 'Ninguna pista coincide con este filtro — prueba otro.',
    quiet: 'Semana tranquila — nada en la próxima agenda destaca como reportaje todavía.',
    disclaimer: '_Pistas, no conclusiones — Gavel te señala lo que vale la pena revisar y el registro público detrás._',
  },
};

/** "all" | "c::<committee>" | "t::<topicKey>" | "d::<district>" — compact, ≤75 chars. */
function encodeFilter(filter) {
  if (!filter || filter.t === 'all') return 'all';
  return `${filter.t[0]}::${filter.v}`.slice(0, VALUE_MAX);
}

/**
 * Inverse of encodeFilter. Exported so the views.update handler can turn the selected
 * option value back into a filter object for the refetch.
 * @param {string} value
 * @returns {{ t: 'all'|'committee'|'topic'|'district', v?: string }}
 */
export function decodeFilter(value) {
  if (!value || value === 'all') return { t: 'all' };
  const sep = value.indexOf('::');
  if (sep === -1) return { t: 'all' };
  const kind = { c: 'committee', t: 'topic', d: 'district' }[value.slice(0, sep)];
  return kind ? { t: kind, v: value.slice(sep + 2) } : { t: 'all' };
}

const committeeOf = (lead) => lead.item?.eventBodyName ?? '';

/** Narrow the full lead set to the active filter. Pure. */
function applyFilter(leads, filter) {
  if (!filter || filter.t === 'all') return leads;
  if (filter.t === 'committee') return leads.filter((l) => committeeOf(l) === filter.v);
  if (filter.t === 'district') return leads.filter((l) => String(districtOf(l.item?.title) ?? '') === String(filter.v));
  if (filter.t === 'topic') {
    const { committees, keywords } = committeesAndKeywordsForTopics([filter.v]);
    const pseudoSub = [{ channelId: 'query', committees, keywords }];
    return leads.filter((l) => matchSubscriptions(l.item, pseudoSub).length > 0);
  }
  return leads;
}

const option = (text, value) => ({ text: plain(text), value: String(value).slice(0, VALUE_MAX) });

/** The filter dropdown, with option groups derived from the FULL (unfiltered) lead set. */
function filterBlock(allLeads, filter, language, copy) {
  const committees = [...new Set(allLeads.map(committeeOf).filter(Boolean))].sort();
  const districts = [...new Set(allLeads.map((l) => districtOf(l.item?.title)).filter((d) => d != null))].sort(
    (a, b) => a - b,
  );

  const groups = [{ label: plain(copy.filterAll), options: [option(copy.allOption, 'all')] }];
  if (committees.length > 0) {
    groups.push({ label: plain(copy.byCommittee), options: committees.map((c) => option(c, `c::${c}`)) });
  }
  groups.push({
    label: plain(copy.byTopic),
    options: topicChoices(language).map((t) => option(t.label, `t::${t.key}`)),
  });
  if (districts.length > 0) {
    groups.push({
      label: plain(copy.byDistrict),
      options: districts.map((d) => option(`📍 District ${d}`, `d::${d}`)),
    });
  }

  const select = { type: 'static_select', action_id: 'story_modal_filter', option_groups: groups };
  const active = encodeFilter(filter);
  const initial = groups.flatMap((g) => g.options).find((o) => o.value === active);
  if (initial) select.initial_option = initial;
  return { type: 'actions', elements: [select] };
}

/** Earliest meeting date across a cluster's members. */
function clusterDate(cluster) {
  return cluster.members
    .map((m) => m.item?.eventDate)
    .filter(Boolean)
    .sort()[0];
}

/** A lead row: title + the Watch / Ask overflow keyed on the eventItemId. */
function leadRow(lead, copy, { bullet } = {}) {
  const id = lead.item?.eventItemId ?? 0;
  const title = lead.item?.title ?? '';
  return {
    type: 'section',
    text: { type: 'mrkdwn', text: bullet ? `• ${title}` : `*${title}*` },
    accessory: {
      type: 'overflow',
      action_id: 'story_lead_overflow',
      options: [option(copy.watch, `w::${id}`), option(copy.ask, `a::${id}`)],
    },
  };
}

/** Render the clustered entries grouped by beat. */
function entryBlocks(entries, language, copy) {
  const blocks = [];
  for (const entry of entries) {
    if (entry.kind === 'cluster') {
      blocks.push(mrkdwn(`*${themeLabel(entry.theme, language)}*`));
      blocks.push(
        context(
          metaLine(
            { committee: entry.committee, district: entry.district, date: clusterDate(entry), tags: entry.tags },
            language,
          ),
        ),
      );
      for (const member of entry.members) blocks.push(leadRow(member, copy, { bullet: true }));
    } else {
      blocks.push(leadRow(entry, copy));
      blocks.push(
        context(
          metaLine(
            {
              committee: entry.item?.eventBodyName,
              district: entry.district,
              date: entry.item?.eventDate,
              tags: entry.tags,
            },
            language,
          ),
        ),
      );
    }
  }
  return blocks;
}

/**
 * The filterable Story-leads modal. Pure over the full ranked lead set.
 * @param {Array<object>} leads - the full, unfiltered ranked story leads
 * @param {{ language?: 'en'|'es', filter?: {t: string, v?: string} }} [opts]
 * @returns {object} a Block Kit modal view
 */
export function storyModal(leads = [], { language = 'en', filter = { t: 'all' } } = {}) {
  const copy = COPY[language] ?? COPY.en;
  const view = {
    type: 'modal',
    callback_id: 'story_browse_modal',
    private_metadata: JSON.stringify({ language, filter: encodeFilter(filter) }),
    title: plain(copy.title),
    close: plain(copy.close),
    blocks: [],
  };

  if (!leads || leads.length === 0) {
    view.blocks = [mrkdwn(copy.quiet)];
    return view;
  }

  const visible = applyFilter(leads, filter).slice(0, MAX_MODAL_LEADS);
  const entries = clusterLeads(visible);

  view.blocks = [filterBlock(leads, filter, language, copy), context(copy.leadIn), { type: 'divider' }];
  if (entries.length === 0) {
    view.blocks.push(mrkdwn(copy.empty));
  } else {
    view.blocks.push(...entryBlocks(entries, language, copy));
  }
  view.blocks.push({ type: 'divider' }, context(copy.disclaimer));
  return view;
}
