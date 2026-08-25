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
import './styles/uc01-administration.css';
import './styles/di-test-console.css';
import './styles/di-configuration.css';
import './styles/workspace.css';
import './styles/extended.css';
import './styles/brand-auth-fixes.css';
import './styles/auth-onboarding.css';
import './styles/auth-frozen-overrides.css';
import './styles/legal-and-recovery.css';
import './styles/uc02-project-admin.css';
import './styles/mahindra-masters.css';
import './styles/project-admin-outlet-location.css';
import './styles/project-admin-outlet-location-search.css';
import './styles/shell-ui-fixes.css';
import './styles/user-ui-guardrails.css';
import './styles/mobile-foundation.css';
import './styles/adaptive-lists.css';
import './styles/journey-mobile.css';
import './styles/operational-mobile.css';
import './styles/final-mobile-sweep.css';
import './styles/android-native.css';
import './styles/uc03-c0.css';
import './styles/uc03-c1.css';
import './styles/uc03-c1-responsive-fixes.css';
import './styles/uc03-capture-flow.css';
import './styles/uc03-c2.css';
import './styles/uc03-c3.css';
import './styles/auth-brand-emphasis.css';
import './styles/project-admin-step1-fix.css';
import './styles/uc02-project-admin-scroll-hotfix.css';
import './styles/navigation-admin-landing.css';
import './styles/scroll-foundation.css';
import './styles/uc03-pc-ui-regression-fixes.css';
import './styles/uc03-pc-landing-cta.css';
import './styles/uc03-pc-product-polish.css';
import './styles/uc03-phase2-worklist.css';
import './styles/uc03-approved-landing.css';
import './styles/uc03-hero-greeting.css';
import './styles/uc03-verification-simple.css';
import './styles/uc03-booking-capture-compact.css';
import './styles/uc03-booking-adaptive.css';
import './styles/uc03-booking-mobile-compact.css';
import './styles/uc03-booking-journey.css';
import './styles/ui-governance.css';
import './styles/authenticated-scroll-owner.css';

import App from './App';
import DiFieldViewerEnhancer from './features/di-test/DiFieldViewerEnhancer';

setupIonicReact({ mode: 'md' });

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <DiFieldViewerEnhancer />
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
