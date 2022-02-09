import { MultiError } from './err';

export type Thing = { [key: string]: any } | any[];

const stripQuotes = (str:string) => str.replace(/^["']/,'').replace(/['"]$/,'');
const noTrailingSeparators = (str:string) => str.replace(/[,;]+$/,'');
const clean = (str:any): string => {
  if (!str && typeof str !== 'number') return '';
  if (typeof str !== 'string') return clean(`${str}`);
  return noTrailingSeparators(stripQuotes(str.trim()).trim()).trim();
}

const isJSON = (str:string) => !!str.match(/^[\{\[]/);
const isPlainString = (str:string) => !str.match(/:/); // plain strings have no colons
const hasSemicolon = (str:string) => !!str.match(/;/);
const hasComma = (str:string) => !!str.match(/,/);
const probablyNotANumber = (str:string) => !!str.match(/[^\-\$, .0-9]/); // if it has anything that wouldn't be in a number

const maybeNumber = (str: string): number | string => {
  const t = +str;
  if (isNaN(t)) return str;
  return t; // a number
}

const parseOneItem = (str: string, acc?: Thing): Thing | number | string => {
  str = clean(str);
  if (isJSON(str)) return JSON.parse(str);
  if (isPlainString(str)) return maybeNumber(str); // no colons, it's just a single value
  // Otherise, we have a colon, so parse the key and then recursively parse the value
  const matches = str.match(/^([^:]+):(.*)$/);
  const key = matches ? clean(matches[1]) : '';
  let val: any = matches ? clean(matches[2]) : '';
  if (key.match(/s$/) && !isJSON(str) && probablyNotANumber(val) && hasComma(val)) {
    // key name ends in "s" and value has commas and is not JSON, put it into an array
    val = val.split(',').map((v: string) => v.trim());
  } else {
    // Otherwise, it's a normal situation so just recursively parse (could be json)
    val = parseOneItem(val, acc || {});
  }
  const ret = acc ? { ...acc } : {};
  return {
    ...ret,
    [key]: val,
  };
}

// this is a note => string
// { } => JSON.parse
// [ ] => JSON.parse
//
// has a colon:
//   has a colon and at least one semicolon:
// anything: value; other thing: other  value; => into { anything: "value", "other thing": "other  value" }
//   has a colon and no semicolons: comma separator
// anything: value, other thing: other value => into { anything: "value", "other thing": "other value" }
// 
// If any values start with a quote, the quotes are stripped
// If any value could be interpreted as a number, it will be converted to a number.
// If any key ends in "s" (i.e. is plural), and has commas, it will be parsed as an array of things
export default function(str: string): Thing | string | number | any[] {
  str = clean(str);
  if (isJSON(str)) return JSON.parse(str);
  if (isPlainString(str)) return maybeNumber(str); // no colons, it's just a single value

  if (hasSemicolon(str)) {
    // Keep parsing each individual key/value pair and adding them into the
    // same accumulator object to return:
    return str.split(';').reduce((acc: Thing, s: string) => {
      const res = parseOneItem(s, acc);
      if (typeof res !== 'object') {
        throw new MultiError({ 
          msg: [ `settings-parser: Failed to parse string ${str}.  One of the items (${s}) did not parse to a key/value pair.` ]
        });
      }
      return res;
    },{})
  }

  return parseOneItem(str);
}
