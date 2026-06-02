import React, { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Check local storage on initial load
    const storedToken = localStorage.getItem("auth_token");
    const storedUser = localStorage.getItem("auth_user");
    if (storedToken && storedUser) {
      setToken(storedToken);
      setUser(JSON.parse(storedUser));
    }
    setIsReady(true);

    // Setup Global Fetch Interceptor
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      let [resource, config] = args;

      const currentToken = localStorage.getItem("auth_token");
      if (resource.includes("https://https://bawarchee.edunextg.co/api") && !resource.includes("/api/auth/login")) {
        config = config || {};
        config.headers = config.headers || {};
        if (currentToken) {
          config.headers["Authorization"] = `Bearer ${currentToken}`;
        }
      }

      const response = await originalFetch(resource, config);

      // Auto-logout if token is expired or unauthorized
      if (response.status === 401 || response.status === 403) {
        if (currentToken) {
          setUser(null);
          setToken(null);
          localStorage.removeItem("auth_token");
          localStorage.removeItem("auth_user");
          window.location.href = "/authentication/sign-in";
        }
      }

      return response;
    };

    return () => {
      // Restore original fetch when context unmounts
      window.fetch = originalFetch;
    };
  }, []);

  const login = (userData, authToken) => {
    setUser(userData);
    setToken(authToken);
    localStorage.setItem("auth_token", authToken);
    localStorage.setItem("auth_user", JSON.stringify(userData));
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
  };

  useEffect(() => {
    let inactivityTimer;

    const resetTimer = () => {
      clearTimeout(inactivityTimer);
      // 7 hours inactivity
      inactivityTimer = setTimeout(() => {
        if (localStorage.getItem("auth_token")) {
          logout();
          window.location.href = "/authentication/sign-in";
        }
      }, 7 * 60 * 60 * 1000);
    };

    if (token) {
      window.addEventListener("mousemove", resetTimer);
      window.addEventListener("keypress", resetTimer);
      window.addEventListener("scroll", resetTimer);
      window.addEventListener("click", resetTimer);
      resetTimer();
    }

    return () => {
      clearTimeout(inactivityTimer);
      window.removeEventListener("mousemove", resetTimer);
      window.removeEventListener("keypress", resetTimer);
      window.removeEventListener("scroll", resetTimer);
      window.removeEventListener("click", resetTimer);
    };
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, isReady, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
