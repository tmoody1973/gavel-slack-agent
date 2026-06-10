import { publishHome } from '../../home/publish.js';

/** "Watch something" modal submit → addWatch → re-publish the Home. */
export function makeAddWatchSubmit(deps) {
  return async ({ ack, body, view, client, logger }) => {
    const channelId = view.state.values.watch_channel?.value?.selected_option?.value;
    const entity = (view.state.values.watch_entity?.value?.value ?? '').trim();
    if (!entity) {
      await ack({
        response_action: 'errors',
        errors: { watch_entity: 'Name a file number, address, or name to watch.' },
      });
      return;
    }
    await ack();
    try {
      await deps.addWatch({ channelId, entity });
      await publishHome({ client, userId: body.user.id }, deps, logger);
    } catch (e) {
      logger.error(`home add-watch submit failed: ${e}`);
    }
  };
}

/** Channel config modal submit → upsertSubscription → re-publish the Home. */
export function makeChannelConfigSubmit(deps) {
  return async ({ ack, body, view, client, logger }) => {
    const channelId = view.private_metadata;
    const committees = (view.state.values.cfg_committees?.home_committees?.selected_options ?? []).map(
      (option) => option.value,
    );
    const keywords = (view.state.values.cfg_keywords?.value?.value ?? '')
      .split(',')
      .map((keyword) => keyword.trim())
      .filter(Boolean);
    const language = view.state.values.cfg_language?.value?.selected_option?.value ?? 'en';

    if (committees.length === 0 && keywords.length === 0) {
      await ack({
        response_action: 'errors',
        errors: {
          cfg_committees: 'Pick at least one committee or add a keyword — otherwise this channel gets no alerts.',
        },
      });
      return;
    }
    await ack();
    try {
      await deps.upsertSubscription({ channelId, committees, keywords, language });
      await publishHome({ client, userId: body.user.id }, deps, logger);
    } catch (e) {
      logger.error(`home config submit failed: ${e}`);
    }
  };
}
