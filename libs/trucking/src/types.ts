export const feedTrelloConfig = {
  board: "Feed",
  deliveredList: "Feed Delivered",
  availableList: "Available Load Numbers",
  webControlsList: "Web Controls",
};

export const grainTrelloConfig = {
  board: "Grain Hauling",
  webControlsList: "Web Controls",
};

export type AvailableLoadNumber = {
  id: string, // id of existing card in Trello
  name: string,
}

export type FeedBoard = {
  delivered: {
    idList: string,
    records: FeedRecord[],
  },
  available: {
    idList: string,
    records: AvailableLoadNumber[],
  },
  webControls: {
    idList: string,
    settings: FeedWebControls,
  }

  errors: string[],
};

export type GrainSellerList = {
  idList: string,
  name: string,
  records: GrainRecord[],
};
export type GrainBoard = {
  sellerLists: GrainSellerList[],
  webControls: {
    idList: string,
    settings: GrainWebControls,
  },
  errors: string[],
};


export type FeedRecord = {
  date: string,
  source: string,
  loadNumber: string,
  dest: string,
  weight: number,
  driver: string,
  note?: string | false,
  // From labels:
  invoiced?: boolean,
  paidFor?: boolean,
  truckingPaid?: boolean,
  // From the card:
  id?: string,               // ID of card
  idList?: string,           // ID of Feed Delivered list
  cardName?: string,         // original card name for debugging
  dateLastActivity?: string, // for sorting by "recent"-ness
  // If there are any errors:
  error?: string,
};

export function assertFeedRecord(o: any): asserts o is FeedRecord {
  if (!o || typeof o !== 'object') throw 'Feed record must be an object';
  if (typeof o.date !== 'string') throw 'Date must exist and be a string';
  if (typeof o.source !== 'string') throw 'Source must exist and be a string';
  if (typeof o.loadNumber !== 'string') throw 'Load number must exist and be a string';
  if (typeof o.dest !== 'string') throw 'Destination must exist and be a string';
  if (typeof o.weight !== 'number') throw 'Weight must exist and be a number';
  if (typeof o.driver !== 'string') throw 'Driver must exist and be a string';
  if ('note' in o && typeof o.note !== 'string') throw 'If note exists, it must be a string';
  if ('invoiced' in o && typeof o.invoiced !== 'boolean') throw 'If invoiced exists, it must be a boolean';
  if ('paidFor' in o && typeof o.paidFor !== 'boolean') throw 'If paidFor exists, it must be a boolean';
  if ('truckingPaid' in o && typeof o.truckingPaid !== 'boolean') throw 'If truckingPaid exists, it must be a boolean';
  if ('id' in o && typeof o.id !== 'string') throw 'If id exists, it must be a string';
  if ('idList' in o && typeof o.idList !== 'string') throw 'If idList exists, it must be a string';
  if ('cardName' in o && typeof o.cardName !== 'string') throw 'If cardName exists, it must be a string';
  if ('dateLastActivity' in o && typeof o.dateLastActivity !== 'string') throw 'If dateLastActivity exists, it must be a string';
  if ('error' in o && typeof o.error !== 'string') throw 'If error exists, it must be a string';
}

export type GrainRecord = {
  date: string,
  sellerList: { name: string, idList: string }, // name and id of list that this record should be in
  dest: string,
  bushels: number,
  ticket: string,
  crop: string,
  driver: string,
  note?: string | false,

  id?: string,               // ID of card
  idList?: string,           // ID of dead list
  cardName?: string,         // original card name for debugging
  dateLastActivity?: string, // for sorting by "recent"-ness

  error?: string,
};

export function assertGrainRecord(o: any): asserts o is GrainRecord {
  if (!o || typeof o !== 'object') throw 'Grain record must be an object';
  if (typeof o.date !== 'string') throw 'Date must exist and be a string';
  if (typeof o.sellerList !== 'object') throw 'Seller list must exist and be an object';
  if (typeof o.sellerList.name !== 'string') throw 'Seller list name must exist and be a string';
  if (typeof o.sellerList.idList !== 'string') throw 'Seller list idList must exist and be a string';
  if (typeof o.dest !== 'string') throw 'Destination must exist and be a string';
  if (typeof o.ticket !== 'string') throw 'Ticket must exist and be a string';
  if (typeof o.bushels !== 'number') throw 'Weight must exist and be a number';
  if (typeof o.ticket !== 'string') throw 'Ticket must exist and be a string';
  if (typeof o.driver !== 'string') throw 'Driver must exist and be a string';
  if ('note' in o && typeof o.note !== 'string') throw 'If note exists, it must be a string';
  if ('id' in o && typeof o.id !== 'string') throw 'If id exists, it must be a string';
  if ('idList' in o && typeof o.idList !== 'string') throw 'If idList exists, it must be a string';
  if ('cardName' in o && typeof o.cardName !== 'string') throw 'If cardName exists, it must be a string';
  if ('dateLastActivity' in o && typeof o.dateLastActivity !== 'string') throw 'If dateLastActivity exists, it must be a string';
  if ('error' in o && typeof o.error !== 'string') throw 'If error exists, it must be a string';
}



export type FeedWebControls = {
  drivers: string[],
  destinations: string[],
  sources: string[],
};

export type GrainWebControls = {
  drivers: string[],
  destinations: string[],
  crops: string[],
};

export type ErrorRecord = {
  [key: string]: any,
  error: string,
};