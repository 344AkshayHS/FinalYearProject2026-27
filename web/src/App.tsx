// The pages of the website and who may open them. Same rules as frontend/src/app/_layout.tsx:
//   logged out: only login and register
//   logged in:  the tabs Home, Chatbot and Profile and the pages that open over them (a crop, compare, history,
//               saved crops, about)
//   admin:      the ML dashboard, after the admin login on the login page (no farmer account needed)
// Page addresses: "/ml-dashboard" is not "/admin" because "/admin/..." is also an address of the backend.

import { Link, Navigate, Outlet, Route, Routes } from 'react-router-dom';

import { Layout } from '~/components/Layout';
import { About } from '~/pages/About';
import { Compare } from '~/pages/Compare';
import { CropPage } from '~/pages/CropPage';
import { Dashboard } from '~/pages/Dashboard';
import { DashboardRecommendation } from '~/pages/DashboardRecommendation';
import { History } from '~/pages/History';
import { Login } from '~/pages/Login';
import { Register } from '~/pages/Register';
import { Saved } from '~/pages/Saved';
import { useApp } from '~/lib/app-context';

function OnlyLoggedOut() {
  const { user } = useApp();
  return user ? <Navigate to="/" replace /> : <Outlet />;
}

function OnlyLoggedIn() {
  const { user } = useApp();
  return user ? <Layout /> : <Navigate to="/login" replace />;
}

// The ML dashboard in a plain frame of its own (English only): GreenRoot, and "Log out" to end the admin session
function OnlyAdmin() {
  const { adminLoggedIn, adminLogout } = useApp();
  if (!adminLoggedIn) {
    return <Navigate to="/login" replace />;
  }
  return (
    <>
      <header className="header">
        <div className="header-inner">
          <Link to="/ml-dashboard" className="brand">
            🌱 GreenRoot · ML dashboard
          </Link>
          <button type="button" className="link-button" onClick={adminLogout}>
            Log out
          </button>
        </div>
      </header>
      <main className="page admin-page">
        <Outlet />
      </main>
    </>
  );
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
        {/* The three tabs: Layout shows them itself and keeps them open (see components/Layout.tsx) */}
        <Route path="/" element={null} />
        <Route path="/chat" element={null} />
        <Route path="/profile" element={null} />
        {/* Pages that open over the tabs, with "Back" at the top */}
        <Route path="/crop/:name" element={<CropPage />} />
        <Route path="/compare" element={<Compare />} />
        <Route path="/history" element={<History />} />
        <Route path="/saved" element={<Saved />} />
        <Route path="/about" element={<About />} />
      </Route>

      <Route element={<OnlyAdmin />}>
        <Route path="/ml-dashboard" element={<Dashboard />} />
        <Route path="/ml-dashboard/:id" element={<DashboardRecommendation />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
