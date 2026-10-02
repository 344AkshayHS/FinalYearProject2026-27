// The pages of the website and who may open them. Same rules as frontend/src/app/_layout.tsx:
//   logged out: only login and register
//   logged in:  home, profile, and (after the admin login on the profile page) the ML dashboard
// Page addresses: "/ml-dashboard" is not "/admin" because "/admin/..." is also an address of the backend.

import { Navigate, Outlet, Route, Routes } from 'react-router-dom';

import { Layout } from '~/components/Layout';
import { Dashboard } from '~/pages/Dashboard';
import { DashboardRecommendation } from '~/pages/DashboardRecommendation';
import { Home } from '~/pages/Home';
import { Login } from '~/pages/Login';
import { Profile } from '~/pages/Profile';
import { Register } from '~/pages/Register';
import { useApp } from '~/lib/app-context';

function OnlyLoggedOut() {
  const { user } = useApp();
  return user ? <Navigate to="/" replace /> : <Outlet />;
}

function OnlyLoggedIn() {
  const { user } = useApp();
  return user ? <Layout /> : <Navigate to="/login" replace />;
}

function OnlyAdmin() {
  const { adminLoggedIn } = useApp();
  return adminLoggedIn ? <Outlet /> : <Navigate to="/profile" replace />;
}

export function App() {
  const { ready } = useApp();

  // Wait until we know if there is a login (the phone app keeps its splash screen for the same reason)
  if (!ready) {
    return null;
  }

  return (
    <Routes>
      <Route element={<OnlyLoggedOut />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>

      <Route element={<OnlyLoggedIn />}>
        <Route path="/" element={<Home />} />
        <Route path="/profile" element={<Profile />} />
        <Route element={<OnlyAdmin />}>
          <Route path="/ml-dashboard" element={<Dashboard />} />
          <Route path="/ml-dashboard/:id" element={<DashboardRecommendation />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
