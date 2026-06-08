import { Component, type ReactNode } from 'react';
import { withTranslation, type WithTranslation } from 'react-i18next';
import { Button } from './ui/button';

interface Props extends WithTranslation {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

class ErrorBoundaryBase extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error('[ErrorBoundary]', error, info);
  }

  reset = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  render() {
    const { error } = this.state;
    const { t, children } = this.props;
    if (!error) return children;
    return (
      <div className="flex h-full items-center justify-center bg-neutral-50 p-8">
        <div className="max-w-md rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-neutral-900">
            {t('errors.boundaryTitle')}
          </h2>
          <p className="mt-2 text-sm text-neutral-600">
            {t('errors.boundaryDesc')}
          </p>
          <pre className="mt-3 max-h-40 overflow-auto rounded bg-neutral-100 p-2 text-xs text-neutral-700">
            {error.message}
          </pre>
          <div className="mt-4 flex justify-end">
            <Button variant="primary" onClick={this.reset}>
              {t('errors.reload')}
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

export const ErrorBoundary = withTranslation()(ErrorBoundaryBase);
