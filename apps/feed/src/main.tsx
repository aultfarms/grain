import '@aultfarms/debug-console'; // ensure console is patched before other imports

import React from 'react'
import ReactDOM from 'react-dom/client'
import { context, initialContext } from './state';
import { App } from './App'
import { DebugConsole } from '@aultfarms/debug-console';
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <context.Provider value={initialContext}>
      <App />
      <DebugConsole />
    </context.Provider>
  </React.StrictMode>,
);
