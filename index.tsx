import React, { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import { initSentry } from './lib/sentry';
import { ThemeService } from './services/themeService';
import { i18n } from './lib/i18n';
import App from './App';
import { ToastProvider } from './src/components/ToastProvider';
import ErrorBoundary from './components/ErrorBoundary';
import { LanguageProvider } from './src/contexts/LanguageContext';

try {
  initSentry();
} catch (e) {
  console.warn('[Sentry] init falhou (ignorado no dev):', e);
}
ThemeService.init();
i18n.init();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Could not find root element to mount to');

const root = ReactDOM.createRoot(rootElement);
root.render(
  <StrictMode>
    <BrowserRouter>
      <LanguageProvider>
        <ToastProvider>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </ToastProvider>
      </LanguageProvider>
    </BrowserRouter>
  </StrictMode>
);