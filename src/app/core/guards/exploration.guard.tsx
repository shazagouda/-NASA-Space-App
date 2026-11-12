import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { exploration } from '../services/exploration-state.service';
import { useSig } from '../signals';

/** Pages after “Explore” need a selected planetary region. */
export function RegionGuard({ children }: { children: ReactNode }) {
  const region = useSig(() => exploration.region());
  return region ? <>{children}</> : <Navigate to="/explore?needRegion=1" replace />;
}
