import React, { type ErrorInfo, type ReactNode } from 'react';

type GridEngineRootRendererBoundaryProps = {
  readonly children: ReactNode;
  readonly fallback: ReactNode;
  readonly onError?: (error: Error, info: ErrorInfo) => void;
};

type GridEngineRootRendererBoundaryState = {
  readonly failed: boolean;
};

export class GridEngineRootRendererBoundary extends React.Component<
  GridEngineRootRendererBoundaryProps,
  GridEngineRootRendererBoundaryState
> {
  state: GridEngineRootRendererBoundaryState = { failed: false };

  static getDerivedStateFromError(): GridEngineRootRendererBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (this.props.onError) {
      this.props.onError(error, info);
      return;
    }
    console.warn('[DomusUI:grid-engine2:renderer]', {
      event: 'fallback',
      reason: error.name || 'Error',
    });
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
