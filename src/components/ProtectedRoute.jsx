import { Navigate } from "react-router-dom";

const ProtectedRoute = ({ session, children }) => {
  // If we don't have a session, redirect to login
  if (!session) {
    return <Navigate to="/login" replace />;
  }

  // Session exists, render the protected component
  return children;
};

export default ProtectedRoute;
