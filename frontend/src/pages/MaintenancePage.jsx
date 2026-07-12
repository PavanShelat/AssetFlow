import { useState, useEffect } from 'react';
import { maintenanceService, assetService, employeeService } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { MdAdd } from 'react-icons/md';

export default function MaintenancePage() {
  const [kanban, setKanban] = useState({});
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [formData, setFormData] = useState({});
  const [showActionModal, setShowActionModal] = useState(null);
  const [techName, setTechName] = useState('');
  const { canManageAssets } = useAuth();

  const columns = [
    { key: 'pending', label: 'Pending', color: 'var(--warning)' },
    { key: 'approved', label: 'Approved', color: 'var(--info)' },
    { key: 'technician_assigned', label: 'Technician Assigned', color: 'var(--primary)' },
    { key: 'in_progress', label: 'In Progress', color: 'var(--accent)' },
    { key: 'resolved', label: 'Resolved', color: 'var(--success)' },
  ];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [mainRes, assetRes] = await Promise.all([
        maintenanceService.list(),
        assetService.list(),
      ]);
      setKanban(mainRes.data.kanban || {});
      setAssets(assetRes.data.assets || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      await maintenanceService.create(formData);
      setShowModal(false);
      setFormData({});
      loadData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to create request');
    }
  };

  const handleAction = async (requestId, action) => {
    try {
      switch (action) {
        case 'approve':
          await maintenanceService.approve(requestId);
          break;
        case 'reject':
          await maintenanceService.reject(requestId);
          break;
        case 'assign-tech':
          await maintenanceService.assignTech(requestId, { technician_name: techName });
          setTechName('');
          break;
        case 'start':
          await maintenanceService.start(requestId);
          break;
        case 'resolve':
          await maintenanceService.resolve(requestId);
          break;
      }
      setShowActionModal(null);
      loadData();
    } catch (err) {
      alert(err.response?.data?.detail || `Action ${action} failed`);
    }
  };

  const priorityBadge = (priority) => {
    const map = { low: 'badge-neutral', medium: 'badge-info', high: 'badge-warning', critical: 'badge-danger' };
    return <span className={`badge ${map[priority] || 'badge-neutral'}`}>{priority}</span>;
  };

  if (loading) return <div className="loading-overlay"><div className="spinner" /></div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Maintenance</h1>
          <p className="page-subtitle">Track and manage maintenance requests</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setFormData({}); setShowModal(true); }}>
          <MdAdd size={16} /> Raise Request
        </button>
      </div>

      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '16px' }}>
        Approving a card moves the asset to Under Maintenance. Resolving returns it to Available.
      </p>

      {/* Kanban Board */}
      <div className="kanban-board">
        {columns.map((col) => {
          const items = kanban[col.key] || [];
          return (
            <div key={col.key} className="kanban-column">
              <div className="kanban-column-header">
                <span>{col.label}</span>
                <span className="kanban-column-count">{items.length}</span>
              </div>
              <div className="kanban-column-body">
                {items.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)', fontSize: '12px' }}>No items</div>
                ) : items.map((req) => (
                  <div key={req.id} className="kanban-card" onClick={() => setShowActionModal(req)}>
                    <div className="kanban-card-tag">{req.asset?.tag || 'Unknown'}</div>
                    <div className="kanban-card-title">{req.asset?.name || 'Unknown Asset'}</div>
                    <div className="kanban-card-desc">{req.issue_description?.substring(0, 60)}</div>
                    <div className="kanban-card-footer">
                      {priorityBadge(req.priority)}
                      {req.technician_name && <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>🔧 {req.technician_name}</span>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Raise Request Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Raise Maintenance Request</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Asset</label>
                <select className="form-select" value={formData.asset_id || ''} onChange={(e) => setFormData({ ...formData, asset_id: e.target.value })}>
                  <option value="">Select Asset...</option>
                  {assets.map(a => <option key={a.id} value={a.id}>{a.tag} — {a.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Issue Description</label>
                <textarea className="form-textarea" value={formData.issue_description || ''} onChange={(e) => setFormData({ ...formData, issue_description: e.target.value })} placeholder="Describe the issue..." />
              </div>
              <div className="form-group">
                <label className="form-label">Priority</label>
                <select className="form-select" value={formData.priority || 'medium'} onChange={(e) => setFormData({ ...formData, priority: e.target.value })}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={!formData.asset_id || !formData.issue_description}>Submit Request</button>
            </div>
          </div>
        </div>
      )}

      {/* Action Modal */}
      {showActionModal && (
        <div className="modal-overlay" onClick={() => setShowActionModal(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{showActionModal.asset?.tag} — {showActionModal.asset?.name}</h3>
              <button className="modal-close" onClick={() => setShowActionModal(null)}>×</button>
            </div>
            <div className="modal-body">
              <p><strong>Issue:</strong> {showActionModal.issue_description}</p>
              <p><strong>Priority:</strong> {priorityBadge(showActionModal.priority)}</p>
              <p><strong>Status:</strong> {showActionModal.status?.replace('_', ' ')}</p>
              <p><strong>Raised by:</strong> {showActionModal.raised_by_profile?.full_name}</p>
              {showActionModal.technician_name && <p><strong>Technician:</strong> {showActionModal.technician_name}</p>}

              {showActionModal.status === 'approved' && canManageAssets && (
                <div style={{ marginTop: '16px' }}>
                  <div className="form-group">
                    <label className="form-label">Technician Name</label>
                    <input className="form-input" value={techName} onChange={(e) => setTechName(e.target.value)} placeholder="e.g. R. Varma" />
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowActionModal(null)}>Close</button>
              {showActionModal.status === 'pending' && canManageAssets && (
                <>
                  <button className="btn btn-success" onClick={() => handleAction(showActionModal.id, 'approve')}>Approve</button>
                  <button className="btn btn-danger" onClick={() => handleAction(showActionModal.id, 'reject')}>Reject</button>
                </>
              )}
              {showActionModal.status === 'approved' && canManageAssets && (
                <button className="btn btn-primary" onClick={() => handleAction(showActionModal.id, 'assign-tech')} disabled={!techName}>Assign Technician</button>
              )}
              {showActionModal.status === 'technician_assigned' && (
                <button className="btn btn-primary" onClick={() => handleAction(showActionModal.id, 'start')}>Start Work</button>
              )}
              {showActionModal.status === 'in_progress' && (
                <button className="btn btn-success" onClick={() => handleAction(showActionModal.id, 'resolve')}>Mark Resolved</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
