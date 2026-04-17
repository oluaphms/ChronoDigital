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
import { AppInitializer } from './src/components/AppInitializer';

try {
  initSentry();
} catch (e) {
  console.warn('[Sentry] init falhou (ignorado no dev):', e);
}
ThemeService.init();
i18n.init();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Could not find root element to mount to');

const envFatalError =
  typeof window !== 'undefined' ? (window as any).__ENV_FATAL_ERROR : null;
if (envFatalError) {
  rootElement.innerHTML = `
    <div style="padding:40px;font-family:system-ui,-apple-system,sans-serif">
      <h1>Erro de configuração</h1>
      <p>${envFatalError}</p>
    </div>
  `;
  throw new Error(String(envFatalError));
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <StrictMode>
    <AppInitializer>
      <BrowserRouter>
        <LanguageProvider>
          <ToastProvider>
            <ErrorBoundary>
              <App />
            </ErrorBoundary>
          </ToastProvider>
        </LanguageProvider>
      </BrowserRouter>
    </AppInitializer>
  </StrictMode>
);