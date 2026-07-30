import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

const ProtectedRoute = ({ children, allowedRoles, requiredPermission }) => {
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

  if (
    requiredPermission
    && user?.role !== "admin"
    && !Array.isArray(user?.permissions)
  ) {
    return <Navigate to="/authentication/sign-in" replace />;
  }

  if (
    requiredPermission
    && user?.role !== "admin"
    && !user.permissions.includes(requiredPermission)
  ) {
    const firstAllowedRoute = user.permissions.includes("dashboard")
      ? "/dashboard"
      : user.permissions.includes("dms") && user.permissions.includes("add_seller")
        ? "/add-seller"
        : user.permissions.includes("dms") && user.permissions.includes("add_item")
          ? "/add-item"
          : user.permissions.includes("dms") && user.permissions.includes("item_list")
            ? "/dms-stock"
            : user.permissions.includes("update_payment")
              ? "/update-payment"
              : user.permissions.includes("bank_deposit")
                ? "/bank-deposit"
                : user.permissions.includes("add_outlet")
                  ? "/add-outlet"
                  : user.permissions.includes("add_sales")
                    ? "/add-sales"
                    : "/welcome";
    return <Navigate to={firstAllowedRoute} replace />;
  }

  return children;
};

export default ProtectedRoute;
