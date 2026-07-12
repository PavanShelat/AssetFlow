import { useState, useEffect } from 'react';
import { notificationService } from '../services/api';
import { formatDistanceToNow } from 'date-fns';
import { MdCheckCircle } from 'react-icons/md';

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('notifications');

  useEffect(() => {
    loadNotifications();
  }, [activeFilter]);

  useEffect(() => {
    if (activeTab === 'logs') {
      loadLogs();
    }
  }, [activeTab]);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const params = {};
      if (activeFilter !== 'all') params.type = activeFilter;
      const res = await notificationService.list(params);
      setNotifications(res.data.notifications || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadLogs = async () => {
    try {
      const res = await notificationService.activityLogs({ limit: 50 });
      setLogs(res.data.logs || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkRead = async (id) => {
    try {
      await notificationService.markRead(id);
      loadNotifications();
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await notificationService.markAllRead();
      loadNotifications();
    } catch (err) {
      console.error(err);
    }
  };

  const filters = [
    { key: 'all', label: 'All' },
    { key: 'alerts', label: 'Alerts' },
    { key: 'approvals', label: 'Approvals' },
    { key: 'bookings', label: 'Bookings' },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Activity & Notifications</h1>
          <p className="page-subtitle">Stay updated on all system activity</p>
        </div>
        {activeTab === 'notifications' && (
          <button className="btn btn-secondary" onClick={handleMarkAllRead}>
            <MdCheckCircle size={16} /> Mark All Read
          </button>
        )}
      </div>

      <div className="tabs">
        <button className={`tab-item ${activeTab === 'notifications' ? 'active' : ''}`} onClick={() => setActiveTab('notifications')}>Notifications</button>
        <button className={`tab-item ${activeTab === 'logs' ? 'active' : ''}`} onClick={() => setActiveTab('logs')}>Activity Log</button>
      </div>

      {activeTab === 'notifications' && (
        <>
          {/* Filter Chips */}
          <div className="filter-bar">
            {filters.map(f => (
              <button
                key={f.key}
                className={`filter-chip ${activeFilter === f.key ? 'active' : ''}`}
                onClick={() => setActiveFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Notifications List */}
          <div className="card">
            <div className="card-body" style={{ padding: 0 }}>
              {loading ? (
                <div className="loading-overlay"><div className="spinner" /></div>
              ) : notifications.length === 0 ? (
                <div className="empty-state">
                  <p className="empty-state-title">No notifications</p>
                  <p className="empty-state-description">You're all caught up!</p>
                </div>
              ) : (
                notifications.map(n => (
                  <div
                    key={n.id}
                    className={`notification-item ${!n.read ? 'unread' : ''}`}
                    onClick={() => !n.read && handleMarkRead(n.id)}
                    style={{ cursor: !n.read ? 'pointer' : 'default' }}
                  >
                    <div className={`notification-dot ${n.type}`} />
                    <div className="notification-content">
                      <div className="notification-message">
                        {n.title}
                      </div>
                      {n.message && n.message !== n.title && (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {n.message}
                        </div>
                      )}
                    </div>
                    <span className="notification-time">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      {activeTab === 'logs' && (
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Action</th>
                    <th>Entity</th>
                    <th>When</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.length === 0 ? (
                    <tr><td colSpan={4} className="text-center text-muted" style={{ padding: '32px' }}>No activity yet</td></tr>
                  ) : logs.map(log => (
                    <tr key={log.id}>
                      <td style={{ fontWeight: 500 }}>{log.user_name || 'System'}</td>
                      <td>{log.action}</td>
                      <td>
                        <span className="badge badge-neutral">{log.entity_type}</span>
                      </td>
                      <td>{formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
