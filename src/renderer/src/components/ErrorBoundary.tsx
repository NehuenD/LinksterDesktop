import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Linkster UI error:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-surface p-8 text-center text-primary">
          <h1 className="font-display text-base font-semibold">Something went wrong</h1>
          <p className="max-w-md text-xs leading-relaxed text-muted">{this.state.error.message}</p>
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-fg transition hover:brightness-110 active:scale-[0.98]"
          >
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
