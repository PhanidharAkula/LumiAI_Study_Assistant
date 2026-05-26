import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";

interface ProtectedRouteProps {
  session: Session | null;
  children: ReactNode;
}

const ProtectedRoute = ({ session, children }: ProtectedRouteProps) => {
  // No session → send the user to login.
  if (!session) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

export default ProtectedRoute;
