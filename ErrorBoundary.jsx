import React from "react";

// Top-level error boundary. The app is one large component with many screens;
// without this, a single render-time throw on any screen unmounts the whole
// tree and the user sees a blank white page (this has bitten before — see the
// "blank-page crash in Plan Builder" fix). Here we catch it, keep the chrome,
// and offer a reload instead of a dead page.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("Uncaught render error:", error, info?.componentStack);
  }

  handleReload = () => {
    this.setState({ error: null });
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{
        minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
        padding: 24, fontFamily: "system-ui, sans-serif", background: "#FBF8F1", color: "#2b2b2b",
      }}>
        <div style={{ maxWidth: 420, textAlign: "center" }}>
          <div style={{ fontSize: 13, letterSpacing: 2, textTransform: "uppercase", opacity: 0.6, marginBottom: 12 }}>
            Form &amp; Pace
          </div>
          <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>Something went wrong</h1>
          <p style={{ fontSize: 14, lineHeight: 1.5, opacity: 0.8, margin: "0 0 20px" }}>
            The screen hit an unexpected error. Your data is safe — reloading usually fixes it.
          </p>
          <button
            onClick={this.handleReload}
            style={{
              background: "#2b2b2b", color: "#FBF8F1", border: 0, borderRadius: 4,
              padding: "10px 20px", fontSize: 14, fontWeight: 700, letterSpacing: 1, cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
