import { runInAction } from 'mobx';
import { actions } from '.';
import { auth } from '@aultfarms/google';
import pkg from '../../package.json';
import debug from 'debug';

const info = debug('af/manure#initialize:info');

/**
 * Initializes the application by setting the document title, loading cached data,
 * authenticating with Google, and triggering spreadsheet verification.
 */
let _gpsPollInterval: ReturnType<typeof setInterval> | null = null;
export const initialize = async () => {
  info('Initializing app...');

  // **Set the document title with the app version**
  document.title = `AF/Manure - v${pkg.version}`;

  // Grab GPS coordinates every second with actions.updateCurrentGPS
  _gpsPollInterval = setInterval(actions.updateCurrentGPS, 1000);

/*
  // **Load cached data from local storage**
  const cachedCurrentId = localStorage.getItem('currentSheetId');
  const cachedLastYearId = localStorage.getItem('lastYearSheetId');
  const selectedField = localStorage.getItem('selectedField');
  const selectedSource = localStorage.getItem('selectedSource');
  const selectedDriver = localStorage.getItem('selectedDriver');

  // **Set initial state with cached values**
  runInAction(() => {
    state.currentSheetId = cachedCurrentId;
    state.lastYearSheetId = cachedLastYearId;
    state.selectedField = selectedField;
    state.selectedSource = selectedSource;
    state.selectedDriver = selectedDriver;
  });

  // **Authenticate with Google**
  await auth.authorize();

  // **Trigger asynchronous spreadsheet verification and updates**
  actions.verifyAndUpdateSpreadsheets();
*/
};