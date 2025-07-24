
import React from 'react'; // React import is needed for JSX.Element
import { Navigate } from 'react-router-dom';

interface ProtectedRouteProps {
  children: React.ReactNode; // Changed from JSX.Element to React.ReactNode for broader compatibility
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  // In a real app, you'd check authentication status here
  // For this example, it's a pass-through
  return <>{children}</>;
};

export default ProtectedRoute;
