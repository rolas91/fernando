import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { installErrorReporting } from './lib/errorReporting';
import SystemErrorBoundary from './components/SystemErrorBoundary';

installErrorReporting();

createRoot(document.getElementById('root')!).render(
  <SystemErrorBoundary>
    <App />
  </SystemErrorBoundary>,
);
