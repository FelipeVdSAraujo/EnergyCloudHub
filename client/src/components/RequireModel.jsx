// src/components/RequireModel.jsx
import { Navigate, useLocation } from 'react-router-dom';
import { useModel } from '../models/ModelContext';

export default function RequireModel({ children }) {
  const { meta } = useModel();
  const loc = useLocation();
  if (!meta) return <Navigate to="/models" state={{ from: loc }} replace />;
  return children;
}
