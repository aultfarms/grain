import { action, runInAction } from 'mobx';
import { ActivityMessage, state } from './state';
import debug from 'debug';
import * as trellolib from '@aultfarms/trello';
import dayjs from 'dayjs';
import {feed, assertFeedRecord, FeedRecord} from '@aultfarms/trucking';
import { allSourcesFromFullSource, matchFullSourceFromPart } from './util';

const warn = debug("af/feed:warn");
const info = debug("af/feed:info");

export const page = action('page', () => {
  console.info('Feed page action invoked');
});
type PartialFeedRecord = {
  date?: string,
  source?: string,
  loadNumber?: string,
  dest?: string,
  weight?: number,
  driver?: string,
  note?: string,
  id?: string, // cardid for an existing available load number card
};

export const changeRecord = action('changeRecord', (vals: PartialFeedRecord) => {
  // If changing the source, we also need to change the available load numbers for this source
  if (vals.source) {
    // Change the available load numbers:
    const fullsource = state.feedBoard?.webControls.settings.sources.find(
      full => {
        info('Matching full = ', full, 'against vals.source: ', vals.source);
        return full.toUpperCase().match(new RegExp('^'+vals.source?.toUpperCase(), 'i'))
      }
    ) || '';
    const allsources = allSourcesFromFullSource(fullsource);
    const available = state.feedBoard?.available.records.filter(a => !!allsources.find(ss => a.name.toUpperCase().match(ss.toUpperCase())));
    state.availableNumbersForCurrentSource = available || [];
    // If there are no available load numbers for this source, we need to set the loadNumber to
    // be the source first name and mark the flag for newLoadNumberMode
    if (state.availableNumbersForCurrentSource.length < 1) {
      newLoadNumberMode(true, vals.source);
    } else {
      // Reset the load number in the dropdown to the first one for this source
      newLoadNumberMode(false);
      const avail = state.availableNumbersForCurrentSource[0];
      changeRecord({
        loadNumber: avail?.name || '',
        id: avail?.id, // also need to set the card id to the first card
      });
    }
  }

  if (vals.loadNumber) {
    // Check if this load number is actually one of the available load numbers.  If so, set the card
    // id on the record so the lib will move that card from available to delivered.
    const avail = state.availableNumbersForCurrentSource.find(a => a.name === vals.loadNumber);
    if (avail) vals.id = avail.id;
  }
  // Now change the regular record:
  state.record = {
    ...state.record,
    ...vals
  };
});

export const newLoadNumberMode = action('newLoadNumberMode', (newval: boolean, newsource?: string) => {
  // When newLoadNumberMode is first started, pre-load the loadNumber text box with
  // the first (primary) name for the source
  if (newval) {
    // Also, need to make sure the card id is cleared
    changeRecord({
      loadNumber: newsource || state.record.source,
      id: '',
    });
  }
  state.newLoadNumberMode = newval;
});

export const loadFeedBoard = action('loadFeedBoard', async () => {
  runInAction(() => state.loading = true);
  const client = await trello();
  const fb = await feed.feedBoard({ client });
  runInAction(() => state.feedBoard = fb);
  if (!state.feedBoard) throw new Error('ERROR: somehow feedboard is not truthy');

  const foundsource = matchFullSourceFromPart(state.record.source, state.feedBoard.webControls.settings.sources);
  if (!foundsource) { // If no source on current record, go ahead and set to the first source's first entry:
    const firstsource = state.feedBoard.webControls.settings.sources[0]?.split(',')?.[0] || 'UNKNOWN';
    changeRecord({ source: firstsource });
  }
  runInAction(() => state.loading = false);
});

export const saveRecord = action('saveRecord', async () => {
  // Save to Trello: the source doesn't actually go on the card,
  // it is assumed to be already present in the load number.
  msg({ type: 'good', msg: 'Saving to Trello...'});
  await feed.saveFeedDelivered({ client: await trello(), record: { ...state.record, source: '' } });
  // And save this in state to pre-load old record with next time
  localStorage.setItem('feed-prevrecord', JSON.stringify(state.record));
  // Reset what needs to reset:
  newLoadNumberMode(false);
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

export const resetRecord = action('resetRecord', (prevrecord: FeedRecord) => {
  const copy = {
    ...prevrecord,
    // clear out load-specific things (i.e. things that don't persist from load to load)
    date: dayjs().format('YYYY-MM-DD'),
    loadNumber: '',
    weight: 0,
    note: '',
    id: '',
    idList: '',
    cardName: '',
    dateLastActivity: '',
  };
  if (copy.error) delete copy.error;
  state.record = copy;
  // Now refresh the load number/available load numbers stuff based on the source:
  changeRecord({ source: state.record.source });
});


// Keep track of the last thing you saved so it can populate re-used settings
export const loadFromLocalStorage = action('loadFromLocalStorage', () => {
  try {
    const prevrecord = JSON.parse(localStorage.getItem('feed-prevrecord') || '');
    assertFeedRecord(prevrecord);
    resetRecord(prevrecord);
  } catch (e) {
    warn('Could not parse localStorage["feed-prevrecord"]');
    // JSON parse or type assertion failed
  }
});

export const saveToLocalStorage = action('saveToLocalStorage', () => {
  localStorage.setItem('feed-prevrecord', JSON.stringify(state.record));
});

export const msg = action('msg', (msg: ActivityMessage) => {
  state.activityLog.push(msg);
  state.msg = { open: true, text: msg.msg };
});

export const closeMsg = action('closeMsg', () => {
  state.msg.open = false;
});

export const loginWithTrello = action('loginWithTrello', async () => {
  info('LoginWithTrello: connecting to Trello (may redirect for auth)');
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
