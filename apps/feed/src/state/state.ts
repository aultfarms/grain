import { observable } from 'mobx';
import { FeedBoard, FeedRecord, AvailableLoadNumber } from '@aultfarms/trucking';
import dayjs from 'dayjs';

export type ActivityMessage = {
  msg: string,
  type: 'good' | 'bad',
};

export type State = {
  activityLog: ActivityMessage[],
  msg: { open: boolean, text: string },
  errors: string[],
  loading: boolean,
  trelloAuthorized: boolean,
  feedBoard: FeedBoard | null,
  record: FeedRecord,
  // special stuff for AvailableNumbers
  availableNumbersForCurrentSource: AvailableLoadNumber[],
  newLoadNumberMode: boolean,
};

export const state = observable<State>({
  activityLog: [],
  msg: { open: false, text: '' },
  errors: [],
  loading: true,
  trelloAuthorized: false,
  feedBoard: null,
  record: {
    date: dayjs().format('YYYY-MM-DD'),
    source: '',
    loadNumber: '',
    dest: '',
    weight: 0,
    driver: '',
  },
  availableNumbersForCurrentSource: [],
  newLoadNumberMode: false,
});
