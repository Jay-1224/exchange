import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { formatFriendlyFirestoreError } from '../firebase/errorHandling';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message || 'An unexpected error occurred.' };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('NWS Exchange ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      const friendly = formatFriendlyFirestoreError(
        this.state.message,
        'An unexpected error occurred.'
      );

      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-slate-200 rounded-xl p-8 text-center">
            <div className="w-12 h-12 mx-auto mb-4 rounded-lg bg-red-50 text-red-700 flex items-center justify-center">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 mb-2">
              Exchange Data Connection Interrupted
            </h1>
            <p className="text-sm text-slate-600 mb-6 break-words">{friendly}</p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0F2544] text-white text-sm font-medium rounded-lg hover:bg-[#173663] transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              Reload Platform
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
