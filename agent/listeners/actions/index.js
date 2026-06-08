import { handleAlertAsk, handleAlertHistory, handleAlertWatch } from './alert-buttons.js';
import { handleFeedbackButton } from './feedback-buttons.js';

/**
 * Register action listeners with the Bolt app.
 * @param {import('@slack/bolt').App} app
 * @returns {void}
 */
export function register(app) {
  app.action('feedback', handleFeedbackButton);
  app.action('alert_watch', handleAlertWatch);
  app.action('alert_history', handleAlertHistory);
  app.action('alert_ask', handleAlertAsk);
}
