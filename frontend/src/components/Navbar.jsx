import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { BarChart2, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';

const linkClass = ({ isActive }) =>
  `px-3 py-2 rounded-lg text-sm font-medium ${isActive ? 'bg-slate-800 text-white' : 'text-slate-300 hover:text-white'}`;

export default function Navbar() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <nav className="fixed top-0 inset-x-0 z-50 bg-slate-900 text-white shadow-lg">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        <Link to="/dashboard" className="flex items-center gap-2 font-bold">
          <BarChart2 className="text-indigo-400" size={28} />
          <span>ReviewSense</span>
        </Link>

        <div className="hidden md:flex items-center gap-2">
          <NavLink to="/dashboard" className={linkClass}>
            Dashboard
          </NavLink>
          <NavLink to="/upload" className={linkClass}>
            Upload
          </NavLink>
          <NavLink to="/trends" className={linkClass}>
            Trends
          </NavLink>
          <NavLink to="/reports" className={linkClass}>
            Reports
          </NavLink>
          {user && ['admin', 'member'].includes(user.role) && (
            <NavLink to="/admin" className={linkClass}>
              Admin
            </NavLink>
          )}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <span className="text-slate-300 text-sm">{user?.name}</span>
          <button
            type="button"
            onClick={logout}
            className="flex items-center gap-1 text-sm bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-lg"
          >
            <LogOut size={16} />
            Logout
          </button>
        </div>

        <button type="button" className="md:hidden p-2" onClick={() => setOpen(!open)} aria-label="Menu">
          {open ? <X /> : <Menu />}
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-slate-800 px-4 py-3 flex flex-col gap-2">
          <NavLink to="/dashboard" className={linkClass} onClick={() => setOpen(false)}>
            Dashboard
          </NavLink>
          <NavLink to="/upload" className={linkClass} onClick={() => setOpen(false)}>
            Upload
          </NavLink>
          <NavLink to="/trends" className={linkClass} onClick={() => setOpen(false)}>
            Trends
          </NavLink>
          <NavLink to="/reports" className={linkClass} onClick={() => setOpen(false)}>
            Reports
          </NavLink>
          {user && ['admin', 'member'].includes(user.role) && (
            <NavLink to="/admin" className={linkClass} onClick={() => setOpen(false)}>
              Admin
            </NavLink>
          )}
          <button type="button" onClick={() => { logout(); setOpen(false); }} className="text-left text-red-300 py-2">
            Logout
          </button>
        </div>
      )}
    </nav>
  );
}
