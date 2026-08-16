/** Class-component error boundary (React has no hook equivalent) - catches render errors anywhere
 * in its subtree and shows a full-screen fallback with a reload button instead of a blank/crashed app. */
import { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div
          className="h-screen flex flex-col items-center justify-center gap-4 p-8"
          style={{ background: 'var(--bg)' }}
        >
          <div className="text-4xl">⚠</div>
          <h1 className="text-lg font-semibold" style={{ color: 'var(--text)' }}>
            Something went wrong
          </h1>
          <p className="text-sm text-center max-w-sm" style={{ color: 'var(--text-3)' }}>
            {this.state.error.message}
          </p>
          <button onClick={() => window.location.reload()} className="btn-primary mt-2">
            Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
