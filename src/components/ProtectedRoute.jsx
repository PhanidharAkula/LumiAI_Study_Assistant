import { Navigate } from "react-router-dom";
import { memo } from "react";

const ProtectedRoute = ({ session, children }) => {
  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default memo(ProtectedRoute);
