import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, getToken, getUser, logout, SIGN_IN_URL, startIdleWatch } from "@/lib/api";

// Session from the main site's sign-in page. `profile` is the distributor's details from
// /api/distributor/me. Not signed in → the main sign-in page; signed in as someone else
// (admin, staff…) → `notDistributor`.
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const signedIn = Boolean(getToken());
  const isDistributor = getUser()?.role === "distributor";
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!signedIn) {
      window.location.replace(SIGN_IN_URL);
      return undefined;
    }
    if (!isDistributor) return undefined;
    api("/me")
      .then((data) => setProfile(data.distributor))
      .catch((err) => setError(err.message));
    return startIdleWatch();
  }, [signedIn, isDistributor]);

  const value = useMemo(
    () => ({ profile, error, logout, notDistributor: signedIn && !isDistributor, ready: Boolean(profile) }),
    [profile, error, signedIn, isDistributor]
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
