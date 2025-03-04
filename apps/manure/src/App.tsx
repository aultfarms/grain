import React from 'react';
import { observer } from 'mobx-react-lite';
import { NavBar } from './NavBar';
import { Map } from './Map';
import { Form } from './Form';
import { ConfigModal } from './ConfigModal';
import { BottomLoadButton } from './BottomLoadButton';
import { LoadingIndicator } from './LoadingIndicator';
import { Snackbar } from '@mui/material';
import { context } from './state';

import "./App.css";

export const App = observer(() => {
  const { state, actions } = React.useContext(context);
  return (
    <div className="main">
      <NavBar />

      <div className="content">
        { state.loading
          ? <LoadingIndicator/>
          : <React.Fragment>
              <div className="map-wrapper">
                <Map />
              </div>
              <div className="form-wrapper">
                <Form />
              </div>
            </React.Fragment>
        }
      </div>

      <ConfigModal />
      <div style={{ height: '3em' }} />
      <BottomLoadButton />
      <Snackbar
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        open={state.snackbar.open}
        autoHideDuration={3000} // Hides after 3 seconds
        onClose={(_, reason) => {
          if (reason !== 'clickaway') {
            actions.closeSnackbar();
          }
        }}
        message={state.snackbar.message}
      />

    </div>
  );
});