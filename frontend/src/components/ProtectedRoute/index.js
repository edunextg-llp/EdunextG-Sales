import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const ProtectedRoute = ({ children, allowedRoles }) => {
  const { token, user, isReady } = useAuth();
  const location = useLocation();

  if (!isReady) {
    return null; // or a loading spinner
  }

  if (!token) {
    return <Navigate to="/authentication/sign-in" state={{ from: location }} replace />;
  }

  if (allowedRoles?.length && !allowedRoles.includes(user?.role || "admin")) {
    return <Navigate to={user?.role === "staff" ? "/purchase-requisition" : "/dashboard"} replace />;
  }

  return children;
};

export default ProtectedRoute;
