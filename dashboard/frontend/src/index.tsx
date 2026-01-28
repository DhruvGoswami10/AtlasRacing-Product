import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { TelemetryProvider } from './context/TelemetryContext';
import { AuthProvider } from './context/AuthContext';

const rootElement = document.getElementById('root');

if (!rootElement) {
  console.error("Root element 'root' not found");
} else {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <AuthProvider>
        <TelemetryProvider>
          <App />
        </TelemetryProvider>
      </AuthProvider>
    </React.StrictMode>
  );
}
