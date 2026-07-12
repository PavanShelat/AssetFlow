import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  MdDashboard, MdBusiness, MdInventory, MdSwapHoriz,
  MdEventNote, MdBuild, MdFactCheck, MdBarChart,
  MdNotifications, MdLogout
} from 'react-icons/md';

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: MdDashboard },
  { path: '/organization', label: 'Organization Setup', icon: MdBusiness, adminOnly: true },
  { path: '/assets', label: 'Assets', icon: MdInventory },
  { path: '/allocations', label: 'Allocation & Transfer', icon: MdSwapHoriz },
  { path: '/bookings', label: 'Resource Booking', icon: MdEventNote },
  { path: '/maintenance', label: 'Maintenance', icon: MdBuild },
  { path: '/audits', label: 'Audit', icon: MdFactCheck },
  { path: '/reports', label: 'Reports', icon: MdBarChart },
  { path: '/notifications', label: 'Notifications', icon: MdNotifications },
];

export default function Sidebar() {
  const { user, logout, isAdmin } = useAuth();

  const filteredItems = navItems.filter(item => {
    if (item.adminOnly && !isAdmin) return false;
    return true;
  });

  return (
    <aside className="app-sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">AF</div>
        <span className="sidebar-brand">AssetFlow</span>
      </div>

      <nav className="sidebar-nav">
        {filteredItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `sidebar-nav-item ${isActive ? 'active' : ''}`
            }
          >
            <item.icon className="nav-icon" />
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-user">
        <div className="sidebar-user-avatar">
          {user?.full_name?.charAt(0)?.toUpperCase() || 'U'}
        </div>
        <div className="sidebar-user-info">
          <div className="sidebar-user-name">{user?.full_name || 'User'}</div>
          <div className="sidebar-user-role">{user?.role?.replace('_', ' ') || 'Employee'}</div>
        </div>
        <button
          onClick={logout}
          className="btn btn-icon"
          style={{ color: 'rgba(255,255,255,0.6)', background: 'none', border: 'none' }}
          title="Logout"
        >
          <MdLogout size={18} />
        </button>
      </div>
    </aside>
  );
}
