import { observable } from 'mobx';
import type { GrainBoard, GrainRecord } from '@aultfarms/trucking';
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
  grainBoard: GrainBoard | null,
  record: GrainRecord,
};

export const state = observable<State>({
  activityLog: [],
  msg: { open: false, text: '' },
  errors: [],
  loading: true,
  trelloAuthorized: false,
  grainBoard: null,
  record: {
    date: dayjs().format('YYYY-MM-DD'),
    sellerList: { idList: '', name: '' },
    dest: '',
    bushels: 0,
    ticket: '',
    crop: '',
    driver: '',
  },
});