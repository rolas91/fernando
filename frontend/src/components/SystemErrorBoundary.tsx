import React from 'react';
import { reportError } from '@/lib/errorReporting';

export default class SystemErrorBoundary extends React.Component<
  React.PropsWithChildren,
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportError(error, {
      context: 'React',
      stack: `${error.stack || ''}\n${info.componentStack || ''}`,
    });
  }
  render() {
    if (this.state.failed)
      return (
        <main className="p-8 text-center">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="my-4">
            The error has been reported. Reload to try again.
          </p>
          <button
            className="rounded bg-primary px-4 py-2 text-white"
            onClick={() => location.reload()}
          >
            Reload
          </button>
        </main>
      );
    return this.props.children;
  }
}
