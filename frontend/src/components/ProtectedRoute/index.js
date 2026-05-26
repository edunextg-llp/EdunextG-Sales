import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const ProtectedRoute = ({ children }) => {
  const { token, isReady } = useAuth();
  const location = useLocation();

  if (!isReady) {
    return null; // or a loading spinner
  }

  if (!token) {
    return <Navigate to="/authentication/sign-in" state={{ from: location }} replace />;
  }

  return children;
};

export default ProtectedRoute;
