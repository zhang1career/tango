import React from 'react';
import ReactDOM from 'react-dom/client';
import {GameIdProvider} from './context/GameIdContext';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GameIdProvider>
      <App/>
    </GameIdProvider>
  </React.StrictMode>
);
