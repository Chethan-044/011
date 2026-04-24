import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import toast from 'react-hot-toast';
import { useEffect, useRef } from 'react';

export default function AdminRoute({ children }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();
  const toasted = useRef(false);

  useEffect(() => {
    if (!isLoading && user && !['admin', 'member'].includes(user.role) && !toasted.current) {
      toast.error('Access denied — Admin or Member role required');
      toasted.current = true;
    }
  }, [isLoading, user]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-pulse text-slate-600">Loading session…</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }

  if (!['admin', 'member'].includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}
