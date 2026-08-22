import React from 'react';
import ReactDOM from 'react-dom/client';
import { setupIonicReact } from '@ionic/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';
import '@ionic/react/css/padding.css';
import '@ionic/react/css/flex-utils.css';
import './theme/variables.css';
import './styles/global.css';
import './styles/approval.css';
import './styles/approval-uc001.css';
import './styles/workspace.css';
import './styles/extended.css';
import './styles/brand-auth-fixes.css';
import './styles/auth-onboarding.css';
import './styles/auth-frozen-overrides.css';
import './styles/legal-and-recovery.css';
import './styles/uc02-project-admin.css';
import './styles/shell-ui-fixes.css';
import './styles/user-ui-guardrails.css';
import './styles/mobile-foundation.css';
import './styles/adaptive-lists.css';
import './styles/journey-mobile.css';
import './styles/operational-mobile.css';
import './styles/final-mobile-sweep.css';
import './styles/android-native.css';

import App from './App';

setupIonicReact({ mode: 'md' });

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><QueryClientProvider client={queryClient}><App /></QueryClientProvider></React.StrictMode>,
);
