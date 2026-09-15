import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  // Scoped boundaries (e.g. around one page section) pass their own inert
  // fallback -- null by default -- instead of the full-page message, so one
  // section's bug doesn't read as the whole page being broken.
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(
      JSON.stringify({
        event_name: 'web_react_error',
        service_name: 'verigence-web',
        error_type: error.name,
        message: error.message,
        component_stack: info.componentStack?.slice(0, 500),
      }),
    );
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback !== undefined ? this.props.fallback : (
        <div style={{ padding: '2rem', textAlign: 'center' }}>
          <p>Something went wrong. Please refresh the page.</p>
        </div>
      );
    }
    return this.props.children;
  }
}
