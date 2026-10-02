import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { App } from '~/App';
import { AppProvider } from '~/lib/app-context';
import { cardShadow, colors, radius } from '@/theme';
import '~/styles.css';

// The colours and corner sizes come from the phone app's theme file, so both look the same. They become
// CSS variables (--primary, --primary-dark, --radius-large ...) that styles.css uses.
const root = document.documentElement;
for (const [name, value] of Object.entries(colors)) {
  root.style.setProperty('--' + name.replace(/[A-Z]/g, (letter) => '-' + letter.toLowerCase()), value);
}
for (const [name, value] of Object.entries(radius)) {
  root.style.setProperty(`--radius-${name}`, `${value}px`);
}
root.style.setProperty('--card-shadow', cardShadow);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AppProvider>
        <App />
      </AppProvider>
    </BrowserRouter>
  </StrictMode>,
);
