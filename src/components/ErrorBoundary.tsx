/**
 * Error boundary component.
 * Catches React rendering errors and displays a fallback UI.
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createLogger } from '@core/utils/logger';

const log = createLogger('ErrorBoundary');

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    log.error('React rendering error caught', {
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-center px-8">
          <div className="w-14 h-14 rounded-lg bg-red-50 border border-red-100 flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6 text-red-500" strokeWidth={1.5} />
          </div>
          <h2 className="text-lg font-semibold text-stone-900 font-display mb-2">
            出现了一些问题
          </h2>
          <p className="text-sm text-stone-500 mb-6 max-w-md">
            渲染过程中发生错误，请尝试刷新页面或重试
          </p>
          <Button onClick={this.handleReset} variant="secondary">
            重试
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
