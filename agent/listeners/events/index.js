import { createHomeDeps } from '../../home/deps.js';
import { makeAppHomeOpened } from './app-home-opened.js';
import { handleAppMentioned } from './app-mentioned.js';
import { handleAssistantThreadStarted } from './assistant-thread-started.js';
import { handleMessage } from './message.js';

/**
 * Register event listeners with the Bolt app.
 * @param {import('@slack/bolt').App} app
 * @returns {void}
 */
export function register(app) {
  app.event('app_home_opened', makeAppHomeOpened(createHomeDeps(app.client)));
  app.event('app_mention', handleAppMentioned);
  app.event('assistant_thread_started', handleAssistantThreadStarted);
  app.event('message', handleMessage);
}
