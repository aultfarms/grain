import { runInAction } from 'mobx';
import { actions } from '.';
import { auth } from '@aultfarms/google';
import pkg from '../../package.json';
import debug from 'debug';

const info = debug('af/manure#initialize:info');

export const initialize = async () => {
  info('Initializing app...');

  // **Set the document title with the app version**
  document.title = `AF/Manure - v${pkg.version}`;

  // Get GPS coordinates every time they change:
  navigator.geolocation.watchPosition(e => {
    actions.currentGPS({ lat: e.coords.latitude, lon: e.coords.longitude });
  })
  info('Started watchPosition to updarte GPS coordinates as they change');

  // **Authenticate with Google**
  await auth.authorize();

  // **Trigger asynchronous spreadsheet verification and updates**
  actions.loadAllSheets();
};