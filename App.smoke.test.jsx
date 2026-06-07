// Smoke test: render the whole App component to a string. This executes the
// entire component body — every hook call, useMemo factory, and useEffect
// DEPENDENCY ARRAY — which is exactly where temporal-dead-zone bugs ("cannot
// access X before initialization") throw. `vite build` does NOT catch these
// (it compiles fine), and the lib/* unit tests never mount App, so this is the
// guard for render-time crashes that take the whole app down.
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";

// Stub the Supabase module so importing App doesn't construct a real client
// (which throws without a URL/key) or hit the network. We only need the
// component body to execute. Covers every binding App + lib/strava + lib/push
// import from it.
vi.mock("./lib/supabase.js", () => {
  const chain = {
    select() { return this; }, eq() { return this; }, in() { return this; },
    gte() { return this; }, order() { return this; }, limit() { return this; },
    maybeSingle: async () => ({ data: null, error: null }),
    single: async () => ({ data: null, error: null }),
    then: (resolve) => resolve({ data: [], error: null }),
  };
  return {
    SUPABASE_URL: "http://localhost",
    SUPABASE_ANON_KEY: "test",
    STRAVA_CLIENT_ID: "test",
    supabase: {
      auth: {
        getSession: async () => ({ data: { session: null } }),
        getUser: async () => ({ data: { user: null } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signInWithOAuth: async () => ({}),
        signOut: async () => ({}),
      },
      from: () => chain,
      channel: () => ({ on() { return this; }, subscribe() { return this; } }),
      removeChannel: () => {},
    },
    getAuthToken: async () => "",
    stravaCall: async () => ({}),
    exchangeStravaCode: async () => ({}),
    syncAthleteStrava: async () => ({}),
    sendPush: async () => ({}),
  };
});

import App from "./App.jsx";

describe("App render smoke", () => {
  it("renders the initial screen without throwing (guards render-time TDZ)", () => {
    expect(() => renderToString(React.createElement(App))).not.toThrow();
  });
});
