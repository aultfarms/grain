import { state } from './state';
import { changeRecord, loadFeedBoard, loadFromLocalStorage, trello } from './actions';
import debug from 'debug';
import { firstSourceName } from './util';
import * as trellolib from '@aultfarms/trello';

const info= debug("af/feed:info");

export const initialize = async () => {
  // Ensure the `debug` library emits via the patched console.log so
  // its output is captured by @aultfarms/debug-console.
  debug.log = (...args: unknown[]) => {
    console.log(...args);
  };

  info('Checking Trello authorization');
  const authorized = await trellolib.checkAuthorization();
  if (!authorized) {
    info('Trello not authorized; waiting for user to log in');
    state.loading = false;
    state.trelloAuthorized = false;
    return;
  }

  info('Connecting to Trello');
  await trello();
  // Load the feed board:
  info('Loading feed board');
  await loadFeedBoard();
  // Load the latest record from localstorage now that feed board is loaded
  info('Loading latest saved record values from localStorage');
  loadFromLocalStorage();
  // Now check the current record: if there was nothing saved in localstorage, put in defaults
  if (!state.record.source) changeRecord({ source: firstSourceName(state.feedBoard?.webControls.settings.sources[0] || 'UNKNOWN') });
  if (!state.record.dest) changeRecord({ dest: state.feedBoard?.webControls.settings.destinations[0] || 'UNKNOWN' });
  if (!state.record.driver) changeRecord({ driver: state.feedBoard?.webControls.settings.drivers[0] || 'UNKNOWN' });

  state.trelloAuthorized = true;
};
