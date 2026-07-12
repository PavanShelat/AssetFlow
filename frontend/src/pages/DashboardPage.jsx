import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { reportService } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { MdAdd, MdEventNote, MdBuild, MdWarning } from 'react-icons/md';
import { formatDistanceToNow } from 'date-fns';

export default function DashboardPage() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const res = await reportService.dashboard();
      setStats(res.data);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="loading-overlay">
        <div className="spinner" />
      </div>
    );
  }

  const kpi = stats?.kpi || {};
  const overdue = stats?.overdue_returns || [];
  const recentActivity = stats?.recent_activity || [];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Welcome back, {user?.full_name || 'User'}</p>
        </div>
      </div>

      {/* KPI Cards */}
      <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px', color: 'var(--text-secondary)' }}>
        Today's Overview
      </h3>
      <div className="kpi-grid" style={{ marginBottom: '24px' }}>
        <div className="kpi-card success">
          <div className="kpi-card-label">Available</div>
          <div className="kpi-card-value">{kpi.available || 0}</div>
        </div>
        <div className="kpi-card primary">
          <div className="kpi-card-label">Allocated</div>
          <div className="kpi-card-value">{kpi.allocated || 0}</div>
        </div>
        <div className="kpi-card warning">
          <div className="kpi-card-label">Under Maintenance</div>
          <div className="kpi-card-value">{kpi.under_maintenance || 0}</div>
        </div>
        <div className="kpi-card info">
          <div className="kpi-card-label">Active Bookings</div>
          <div className="kpi-card-value">{kpi.active_bookings || 0}</div>
        </div>
        <div className="kpi-card accent">
          <div className="kpi-card-label">Pending Transfers</div>
          <div className="kpi-card-value">{kpi.pending_transfers || 0}</div>
        </div>
        <div className="kpi-card danger">
          <div className="kpi-card-label">Upcoming Returns</div>
          <div className="kpi-card-value">{kpi.upcoming_returns || 0}</div>
        </div>
      </div>

      {/* Overdue Returns Alert */}
      {overdue.length > 0 && (
        <div className="alert alert-danger" style={{ marginBottom: '24px' }}>
          <MdWarning size={18} />
          <span>
            <strong>{overdue.length} asset{overdue.length > 1 ? 's' : ''} overdue for return</strong> — flagged for follow-up
          </span>
        </div>
      )}

      {/* Quick Actions */}
      <div className="quick-actions" style={{ marginBottom: '24px' }}>
        <button className="quick-action-btn" onClick={() => navigate('/assets')}>
          <MdAdd size={16} /> Register Asset
        </button>
        <button className="quick-action-btn" onClick={() => navigate('/bookings')}>
          <MdEventNote size={16} /> Book Resource
        </button>
        <button className="quick-action-btn" onClick={() => navigate('/maintenance')}>
          <MdBuild size={16} /> Raise Request
        </button>
      </div>

      {/* Recent Activity */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">Recent Activity</h3>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {recentActivity.length === 0 ? (
            <div className="empty-state">
              <p className="empty-state-description">No recent activity</p>
            </div>
          ) : (
            <ul className="activity-feed">
              {recentActivity.map((item) => (
                <li key={item.id} className="activity-item" style={{ padding: '12px 24px' }}>
                  <div className="activity-dot" />
                  <span className="activity-text">
                    <strong>{item.user_name || 'System'}</strong> — {item.action}
                  </span>
                  <span className="activity-time">
                    {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
