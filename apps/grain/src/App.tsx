import * as React from 'react';
import { observer } from 'mobx-react-lite';
import { context } from './state';
import { Helmet, HelmetProvider } from 'react-helmet-async';
import pkg from '../package.json';
import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import InputLabel from '@mui/material/InputLabel';
import Select from '@mui/material/Select';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
// Will I need this to report on dest/seller mismatch error?
import FormHelperText from '@mui/material/FormHelperText';
import Snackbar from '@mui/material/Snackbar';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import dayjs from 'dayjs';
import { NavBar } from './NavBar';
import { ratio } from 'fuzzball';
import debug from 'debug';
import './App.css'

const info = debug('af/grain#App:info');

function sanitizeBushels(str: string): number {
  //const matches = str.match(/(([0-9]+[,.])?[0-9]*)$/);
  //const m = matches?.[1] || '';
  //return +(m.replace(/[,.]/g,'').trim()); // convert to number
  return +(str.replace(',',''));
}

export const App = observer(function App() {
  const ctx = React.useContext(context);
  const { state, actions } = ctx;
  const wc = state.grainBoard?.webControls.settings;

  const sellerLists = state.grainBoard?.sellerLists;
  function sellerListForId(idList: string) {
    return sellerLists?.find(sl => sl.idList === idList);
  }
  function sellerListMatchesDestination(): boolean {
    if (!sellerLists) return true;
    const dest = state.record.dest;
    const scores = sellerLists.map(sl => ({ ...sl, score: ratio(sl.name, dest) }));
    const best = scores.reduce((best, cur) => cur.score > best.score ? cur : best, scores[0]);
    info('scores = ', scores, ', best = ', best, 'dest = ', dest);
    if (best.idList !== state.record.sellerList.idList) return false;
    return true; // best match is in fact the one chosen
  }
  const isError = false && !sellerListMatchesDestination(); // figure out how to do this matching sometime

  return (
    <HelmetProvider>
      <Helmet>
        <title>AF/Grain - v{pkg.version}</title>
      </Helmet>
      <div style={{ width: '100vw', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <NavBar />
        { state.loading
          ? <div className="main">Loading grain board...</div>
          : !(state as any).trelloAuthorized
            ? <div className="main">
                <p>You must log in with Trello to use this app.</p>
                <Button variant="contained" onClick={() => actions.loginWithTrello()}>
                  Login with Trello
                </Button>
              </div>
            : !wc
              ? <div className="main"><span>Something went wrong, board is loaded but there are no web controls...</span></div>
              : <div className="main">
                <div>
                  <b><u>Add a grain load to Trello:</u></b> (<a href="#" onClick={() => actions.loadGrainBoard()}>Refresh</a>)
                </div>
                <hr/>

                <FormControl fullWidth variant="standard">
                  <InputLabel id="dest-label">Destination</InputLabel>
                  <Select labelId="dest-label"
                          label="Destination"
                          value={state.record.dest}
                          error={isError}
                          onChange={(evt) => actions.changeRecord({ dest: evt.target.value })}
                  >
                    {wc.destinations.map(d => <MenuItem key={d} value={d}>{d}</MenuItem>) }
                  </Select>
                  { isError ? <FormHelperText error={isError}>Destination does not match seller/list</FormHelperText> : null }
                </FormControl>
                <hr/>


                <FormControl fullWidth variant="standard">
                  <InputLabel id="sl-label">Seller/List</InputLabel>
                  <Select labelId="sl-label"
                          label="Seller/List"
                          value={state.record.sellerList.idList}
                          error={isError}
                          onChange={(evt) => actions.changeRecord({ sellerList: sellerListForId(evt.target.value) })}
                  >
                    {state.grainBoard?.sellerLists.map(d => <MenuItem key={d.idList} value={d.idList}>{d.name}</MenuItem>) }
                  </Select>
                  { isError ? <FormHelperText error={isError}>Seller/List does not match Destination</FormHelperText> : null }
                </FormControl>
                <hr/>

                <FormControl fullWidth variant="standard">
                  <TextField variant="standard"
                             label="Ticket #"
                             value={state.record.ticket || ''}
                             onChange={evt => actions.changeRecord({ ticket: evt.target.value })} />
                </FormControl>
                <hr/>

                <FormControl fullWidth variant="standard">
                  <TextField variant="standard"
                             label="Net Bu"
                             type="number"
                             value={state.record.bushels || ''}
                             onChange={evt => actions.changeRecord({ bushels: sanitizeBushels(evt.target.value) })} />
                </FormControl>
                <hr/>

                <FormControl fullWidth variant="standard">
                  <InputLabel id="crop-label">Destination</InputLabel>
                  <Select labelId="crop-label"
                          label="Crop"
                          value={state.record.crop}
                          onChange={(evt) => actions.changeRecord({ crop: evt.target.value })}
                  >
                    {wc.crops.map(c => <MenuItem key={c} value={c}>{c}</MenuItem>) }
                  </Select>
                </FormControl>
                <hr/>

                <FormControl fullWidth variant="standard">
                  <LocalizationProvider dateAdapter={AdapterDayjs}>
                    <DatePicker label="Date" value={dayjs(state.record.date)} onChange={(val) => actions.changeRecord({ date: dayjs(val).format('YYYY-MM-DD') })} />
                  </LocalizationProvider>
                </FormControl>
                <hr/>

                <FormControl fullWidth variant="standard">
                  <InputLabel id="driver-label">Driver</InputLabel>
                  <Select labelId="driver-label"
                          label="Driver"
                          value={state.record.driver}
                          onChange={(evt) => actions.changeRecord({ driver: evt.target.value })}>
                    {wc.drivers.map(d => <MenuItem key={d} value={d}>{d}</MenuItem>) }
                  </Select>
                </FormControl>

                <hr/>
                <FormControl fullWidth variant="standard">
                  <TextField label="Note"
                             variant="standard"
                             value={state.record.note || ''}
                             onChange={evt => actions.changeRecord({ note: evt.target.value })}
                  />
                </FormControl>
                <hr/>

                <Button variant="contained" onClick={() => actions.saveRecord()}>Save</Button>
                <hr/>


              </div>
        }
        <Snackbar
          anchorOrigin={{
            vertical: 'top',
            horizontal: 'center',
          }}
          open={state.msg.open}
          message={state.msg.text}
          autoHideDuration={10000}
          onClose={() => actions.closeMsg() }
        />
      </div>
    </HelmetProvider>
   )
});