import { useState, useEffect } from 'react';
import { auditService, departmentService, employeeService } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { MdAdd, MdWarning } from 'react-icons/md';

export default function AuditPage() {
  const [cycles, setCycles] = useState([]);
  const [selectedCycle, setSelectedCycle] = useState(null);
  const [cycleDetail, setCycleDetail] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({});
  const [selectedAuditors, setSelectedAuditors] = useState([]);
  const { canManageAssets } = useAuth();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [cycleRes, deptRes, empRes] = await Promise.all([
        auditService.list(),
        departmentService.list(),
        employeeService.list(),
      ]);
      setCycles(cycleRes.data.cycles || []);
      setDepartments(deptRes.data.departments || []);
      setEmployees(empRes.data.employees || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadCycleDetail = async (cycleId) => {
    try {
      const res = await auditService.get(cycleId);
      setCycleDetail(res.data);
      setSelectedCycle(cycleId);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreate = async () => {
    try {
      await auditService.create({
        ...formData,
        auditor_ids: selectedAuditors,
      });
      setShowCreateModal(false);
      setFormData({});
      setSelectedAuditors([]);
      loadData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to create audit cycle');
    }
  };

  const handleVerification = async (itemId, status) => {
    try {
      await auditService.updateItem(selectedCycle, itemId, { verification_status: status });
      loadCycleDetail(selectedCycle);
    } catch (err) {
      alert(err.response?.data?.detail || 'Update failed');
    }
  };

  const handleClose = async () => {
    if (!confirm('Close this audit cycle? This action cannot be undone. Missing items will be marked as Lost.')) return;
    try {
      const res = await auditService.close(selectedCycle);
      alert(`Audit closed. ${res.data.discrepancies?.missing || 0} missing, ${res.data.discrepancies?.damaged || 0} damaged.`);
      setSelectedCycle(null);
      setCycleDetail(null);
      loadData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Close failed');
    }
  };

  const verificationBadge = (status) => {
    const map = {
      pending: { cls: 'badge-neutral', label: 'Pending' },
      verified: { cls: 'badge-success', label: 'Verified' },
      missing: { cls: 'badge-warning', label: 'Missing' },
      damaged: { cls: 'badge-danger', label: 'Damaged' },
    };
    const s = map[status] || map.pending;
    return <span className={`badge ${s.cls}`}>{s.label}</span>;
  };

  if (loading) return <div className="loading-overlay"><div className="spinner" /></div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Asset Audit</h1>
          <p className="page-subtitle">Create and manage audit cycles</p>
        </div>
        {canManageAssets && (
          <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
            <MdAdd size={16} /> New Audit Cycle
          </button>
        )}
      </div>

      {/* Cycle Detail View */}
      {cycleDetail ? (
        <div>
          <button className="btn btn-secondary mb-md" onClick={() => { setSelectedCycle(null); setCycleDetail(null); }}>
            ← Back to Cycles
          </button>

          <div className="card" style={{ marginBottom: '16px' }}>
            <div className="card-body" style={{ background: 'var(--primary-bg)' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 600 }}>
                {cycleDetail.cycle?.name}
              </h3>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                {cycleDetail.cycle?.department?.name || 'All Departments'} — {cycleDetail.cycle?.start_date} to {cycleDetail.cycle?.end_date}
              </p>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Auditors: {cycleDetail.auditors?.map(a => a.full_name).join(', ') || 'None assigned'}
              </p>
            </div>
          </div>

          {/* Audit Items Table */}
          <div className="card">
            <div className="card-body" style={{ padding: 0 }}>
              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th>Expected Location</th>
                      <th>Verification</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(cycleDetail.items || []).map(item => (
                      <tr key={item.id}>
                        <td style={{ fontWeight: 500 }}>{item.asset?.tag} {item.asset?.name}</td>
                        <td>{item.expected_location || '—'}</td>
                        <td>
                          {cycleDetail.cycle?.status === 'open' ? (
                            <div className="d-flex gap-sm">
                              <button
                                className={`btn btn-sm ${item.verification_status === 'verified' ? 'btn-success' : 'btn-secondary'}`}
                                onClick={() => handleVerification(item.id, 'verified')}
                              >Verified</button>
                              <button
                                className={`btn btn-sm ${item.verification_status === 'missing' ? 'btn-warning' : 'btn-secondary'}`}
                                onClick={() => handleVerification(item.id, 'missing')}
                              >Missing</button>
                              <button
                                className={`btn btn-sm ${item.verification_status === 'damaged' ? 'btn-danger' : 'btn-secondary'}`}
                                onClick={() => handleVerification(item.id, 'damaged')}
                              >Damaged</button>
                            </div>
                          ) : (
                            verificationBadge(item.verification_status)
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Discrepancy Banner */}
          {cycleDetail.flagged_count > 0 && (
            <div className="alert alert-warning" style={{ marginTop: '16px' }}>
              <MdWarning size={18} />
              <span><strong>{cycleDetail.flagged_count} asset{cycleDetail.flagged_count > 1 ? 's' : ''} flagged</strong> — discrepancy report generated automatically</span>
            </div>
          )}

          {/* Close Button */}
          {cycleDetail.cycle?.status === 'open' && canManageAssets && (
            <button className="btn btn-primary mt-md" onClick={handleClose}>
              Close Audit Cycle
            </button>
          )}
        </div>
      ) : (
        /* Cycles List */
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Audit Cycle</th>
                    <th>Department</th>
                    <th>Period</th>
                    <th>Auditors</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {cycles.length === 0 ? (
                    <tr><td colSpan={6} className="text-center text-muted" style={{ padding: '32px' }}>No audit cycles yet</td></tr>
                  ) : cycles.map(c => (
                    <tr key={c.id}>
                      <td style={{ fontWeight: 500 }}>{c.name}</td>
                      <td>{c.department?.name || 'All'}</td>
                      <td>{c.start_date} to {c.end_date}</td>
                      <td>{c.auditors?.map(a => a.full_name).join(', ') || '—'}</td>
                      <td>
                        <span className={`badge ${c.status === 'open' ? 'badge-success' : 'badge-neutral'}`}>{c.status}</span>
                      </td>
                      <td>
                        <button className="btn btn-sm btn-secondary" onClick={() => loadCycleDetail(c.id)}>View</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Create Audit Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">New Audit Cycle</h3>
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Cycle Name</label>
                <input className="form-input" value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Q3 Audit: Engineering Dept" />
              </div>
              <div className="form-group">
                <label className="form-label">Department</label>
                <select className="form-select" value={formData.department_id || ''} onChange={(e) => setFormData({ ...formData, department_id: e.target.value || undefined })}>
                  <option value="">All Departments</option>
                  {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Start Date</label>
                  <input type="date" className="form-input" value={formData.start_date || ''} onChange={(e) => setFormData({ ...formData, start_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">End Date</label>
                  <input type="date" className="form-input" value={formData.end_date || ''} onChange={(e) => setFormData({ ...formData, end_date: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Assign Auditors</label>
                {employees.map(emp => (
                  <label key={emp.id} className="form-checkbox" style={{ marginBottom: '4px' }}>
                    <input
                      type="checkbox"
                      checked={selectedAuditors.includes(emp.id)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedAuditors([...selectedAuditors, emp.id]);
                        } else {
                          setSelectedAuditors(selectedAuditors.filter(id => id !== emp.id));
                        }
                      }}
                    />
                    <span>{emp.full_name} ({emp.role?.replace('_', ' ')})</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={!formData.name || !formData.start_date || !formData.end_date}>Create Cycle</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
