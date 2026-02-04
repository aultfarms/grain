import { action, runInAction } from 'mobx';
import { ActivityMessage, state } from './state';
import debug from 'debug';
import * as trellolib from '@aultfarms/trello';
import dayjs from 'dayjs';
import {grain, assertGrainRecord, GrainRecord} from '@aultfarms/trucking';

const warn = debug("af/grain:warn");
const info = debug("af/grain:info");

export const page = action('page', () => {
  console.log('Hello');
});

type PartialGrainRecord = {
  date?: string,
  sellerList?: { name: string, idList: string },
  dest?: string,
  bushels?: number,
  ticket?: string,
  crop?: string,
  driver?: string,
  note?: string,
};

export const changeRecord = action('changeRecord', (vals: PartialGrainRecord) => {
  state.record = {
    ...state.record,
    ...vals
  };
  // sellerList can have a "records" key that has all the records for that sellerList.  Don't
  // bother to keep that in the main record.
  if (vals.sellerList) {
    const { name, idList } = vals.sellerList;
    state.record.sellerList = { name, idList };
  }
});

export const loadGrainBoard = action('loadGrainBoard', async () => {
  loading(true);
  const client = await trello();
  const gb = await grain.grainBoard({ client });
  runInAction(() => state.grainBoard = gb);
  if (!state.grainBoard) throw new Error('ERROR: somehow grainBoard is not truthy');

  loading(false);
});

export const loading = action('loading', (val: boolean) => {
  state.loading = val;
});

export const saveRecord = action('saveRecord', async () => {
  msg({ type: 'good', msg: 'Saving to Trello...'});
  await grain.saveGrainDelivered({ client: await trello(), record: state.record });
  // And save this in state to pre-load old record with next time
  saveToLocalStorage();
  // Reset what needs to reset:
  resetRecord(state.record);
  msg({type: 'good', msg: 'Saved successfully.'});
});


let _trello: trellolib.client.Client | null = null;
export const trello = action('trello', async () => {
  if (!_trello) {
    _trello = trellolib.getClient();
    await _trello.connect({ org: trellolib.defaultOrg });
  }
  return _trello;
});

export const resetRecord = action('resetRecord', (prevrecord: GrainRecord) => {
  const copy = {
    ...prevrecord,
    // clear out load-specific things (i.e. things that don't persist from load to load)
    date: dayjs().format('YYYY-MM-DD'),
    ticket: '',
    bushels: 0,
    note: '',
    id: '',
    idList: '',
    cardName: '',
    dateLastActivity: '',
  };
  if (copy.error) delete copy.error;
  state.record = copy;
});


// Keep track of the last thing you saved so it can populate re-used settings
export const loadFromLocalStorage = action('loadFromLocalStorage', () => {
  let prevrecord_str: string = '';
  let prevrecord: GrainRecord | null | unknown = null;
  try {
    prevrecord_str = localStorage.getItem('grain-prevrecord') || '';
    if (!prevrecord_str) {
      info('There was no previous record saved in localstorage.  Moving on.');
      return;
    }
    prevrecord = JSON.parse(prevrecord_str);
    assertGrainRecord(prevrecord);
    resetRecord(prevrecord);
  } catch (e: any) {
    warn('Could not parse localStorage["grain-prevrecord"].  Removing previous value which was: ', prevrecord_str, '.  Error was: ', e.toString());
    clearLocalStorageCache();
    // JSON parse or type assertion failed
  }
});

export const saveToLocalStorage = action('saveToLocalStorage', () => {
  info('Saving previous record ', state.record, ' to localstorage');
  localStorage.setItem('grain-prevrecord', JSON.stringify(state.record));
});

export const clearLocalStorageCache = action('clearLocalStorageCache', () => {
  localStorage.removeItem('grain-prevrecord');
});

export const msg = action('msg', (msg: ActivityMessage) => {
  state.activityLog.push(msg);
  state.msg = { open: true, text: msg.msg };
});

export const closeMsg = action('closeMsg', () => {
  state.msg.open = false;
});

export const loginWithTrello = action('loginWithTrello', async () => {
  // Trigger Trello auth; if there is no valid token, this may redirect.
  await trello();
});

export const logoutTrello = action('logoutTrello', async () => {
  try {
    const client = trellolib.getClient();
    await client.deauthorize();
  } catch (e) {
    warn('Failed to deauthorize Trello', e);
  } finally {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  }
});

export const setTrelloAuthorization = action('setTrelloAuthorization', (val: boolean) => {
  state.trelloAuthorized = val;
});