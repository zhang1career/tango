import React from 'react';
import ReactDOM from 'react-dom/client';
import {GameIdProvider} from './context/GameIdContext';
import {NotificationProvider} from './context/NotificationContext';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <GameIdProvider>
      <NotificationProvider>
        <App/>
      </NotificationProvider>
    </GameIdProvider>
  </React.StrictMode>
);
