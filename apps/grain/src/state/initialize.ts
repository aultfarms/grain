import { state } from './state';
import { changeRecord, loadGrainBoard, loadFromLocalStorage, trello } from './actions';
import debug from 'debug';
import * as trellolib from '@aultfarms/trello';

const info= debug("af/grain:info");

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
    (state as any).trelloAuthorized = false;
    return;
  }

  info('Connecting to Trello');
  // Make sure Trello is connected
  await trello();
  // Load the grain board:
  info('Loading grain board');
  await loadGrainBoard();
  // Load the latest record from localstorage now that grain board is loaded
  info('Loading latest saved record values from localStorage');
  loadFromLocalStorage();
  // Now check the current record: if there was nothing saved in localstorage, put in defaults
  if (!state.record.sellerList) changeRecord({ sellerList: state.grainBoard?.sellerLists[0] || {'name': 'UNKNOWN', idList: '' } });
  if (!state.record.dest) changeRecord({ dest: state.grainBoard?.webControls.settings.destinations[0] || 'UNKNOWN' });
  if (!state.record.driver) changeRecord({ driver: state.grainBoard?.webControls.settings.drivers[0] || 'UNKNOWN' });
  if (!state.record.crop) changeRecord({ crop: state.grainBoard?.webControls.settings.crops[0] || 'UNKNOWN' });

  (state as any).trelloAuthorized = true;
};
