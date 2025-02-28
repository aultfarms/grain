import React from 'react';
import { observer } from 'mobx-react-lite';
import { NavBar } from './NavBar';
import { Map } from './Map';
import { Form } from './Form';
import { ConfigModal } from './ConfigModal';
import { BottomLoadButton } from './BottomLoadButton';

import "./App.css";

export const App = observer(() => {
  return (
    <div className="main">
      <NavBar />

      <div className="content">
        <div className="map-wrapper">
          <Map />
        </div>
        <div className="form-wrapper">
          <Form />
        </div>
      </div>

      <ConfigModal />
      <div style={{ height: '3em' }} />
      <BottomLoadButton />
    </div>
  );
});