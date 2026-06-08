import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import './i18n';
import { App } from './App';
import { PreviewApp } from './views/PreviewApp';

const root = document.getElementById('container');
if (!root) throw new Error('Root container #container not found');

const isPreview = new URLSearchParams(location.search).get('piper-preview') === '1';

createRoot(root).render(
  <StrictMode>
    {isPreview ? <PreviewApp /> : <App />}
  </StrictMode>
);
