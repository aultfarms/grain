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
import Snackbar from '@mui/material/Snackbar';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import dayjs from 'dayjs';
import { NavBar } from './NavBar';
import { AvailableNumbers } from './AvailableNumbers';
import './App.css'
import { firstSourceName } from './state/util';

function sanitizeWeight(str: string): number {
  //const matches = str.match(/(([0-9]+[,.])?[0-9]*)$/);
  //const m = matches?.[1] || '';
  //return +(m.replace(/[,.]/g,'').trim()); // convert to number
  return +(str.replace(/^[^0-9.]*/g,''));
}

export const App = observer(function App() {
  const ctx = React.useContext(context);
  const { state, actions } = ctx;
  const wc = state.feedBoard?.webControls.settings;

  return (
    <HelmetProvider>
      <Helmet>
        <title>AF/Feed - v{pkg.version}</title>
      </Helmet>
      <div style={{ width: '100vw', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <NavBar />
        { state.loading
          ? <div className="main">Loading feed board...</div>
          : !state.trelloAuthorized
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
                  <b><u>Add a feed load to Trello:</u></b> (<a href="#" onClick={() => actions.loadFeedBoard()}>Refresh</a>)
                </div>
                <hr/>

                <FormControl fullWidth variant="standard">
                  <InputLabel id="source-label" >Source</InputLabel>
                  <Select labelId="source-label"
                          label="source"
                          value={state.record.source}
                          onChange={(evt) => actions.changeRecord({ source: evt.target.value })}
                  >
                    {state.feedBoard?.webControls.settings.sources.map(s =>
                      <MenuItem key={'source-'+firstSourceName(s)} value={firstSourceName(s)}>
                        {s}
                      </MenuItem>
                    )}
                  </Select>
                </FormControl>
                <hr/>

                <AvailableNumbers/>
                <hr/>

                <FormControl fullWidth variant="standard">
                  <InputLabel id="dest-label">Destination</InputLabel>
                  <Select labelId="dest-label"
                          label="Destination"
                          value={state.record.dest}
                          onChange={(evt) => actions.changeRecord({ dest: evt.target.value })}
                  >
                    {wc.destinations.map(d => <MenuItem key={d} value={d}>{d}</MenuItem>) }
                  </Select>
                </FormControl>
                <hr/>

                <FormControl fullWidth variant="standard">
                  <TextField variant="standard"
                             label="Net Lbs"
                             type="number"
                             value={state.record.weight || ''}
                             onChange={evt => actions.changeRecord({ weight: sanitizeWeight(evt.target.value) })} />
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
          autoHideDuration={9000}
          onClose={() => actions.closeMsg() }
        />
      </div>
    </HelmetProvider>
   )
});