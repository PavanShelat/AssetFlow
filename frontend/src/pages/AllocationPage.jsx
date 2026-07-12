import { useState, useEffect } from 'react';
import { assetService, allocationService, employeeService } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { MdWarning } from 'react-icons/md';
import { formatDistanceToNow } from 'date-fns';

export default function AllocationPage() {
  const [assets, setAssets] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [allocations, setAllocations] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [selectedAsset, setSelectedAsset] = useState('');
  const [conflict, setConflict] = useState(null);
  const [allocForm, setAllocForm] = useState({});
  const [transferForm, setTransferForm] = useState({});
  const [allocationHistory, setAllocationHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('allocate');
  const { canApprove } = useAuth();

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [assetRes, empRes, allocRes, transferRes] = await Promise.all([
        assetService.list(),
        employeeService.list(),
        allocationService.list({ status: 'active' }),
        allocationService.listTransfers(),
      ]);
      setAssets(assetRes.data.assets || []);
      setEmployees(empRes.data.employees || []);
      setAllocations(allocRes.data.allocations || []);
      setTransfers(transferRes.data.transfers || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAssetSelect = async (assetId) => {
    setSelectedAsset(assetId);
    setConflict(null);
    setAllocationHistory([]);
    if (!assetId) return;

    try {
      const histRes = await allocationService.history(assetId);
      setAllocationHistory(histRes.data.history || []);
    } catch (err) {
      console.error(err);
    }
  };

  const handleAllocate = async () => {
    try {
      await allocationService.allocate({
        asset_id: selectedAsset,
        allocated_to: allocForm.allocated_to,
        department_id: allocForm.department_id,
        expected_return_date: allocForm.expected_return_date,
      });
      alert('Asset allocated successfully!');
      setSelectedAsset('');
      setAllocForm({});
      setConflict(null);
      loadData();
    } catch (err) {
      if (err.response?.status === 409) {
        const detail = err.response.data.detail;
        setConflict(detail);
      } else {
        alert(err.response?.data?.detail || 'Allocation failed');
      }
    }
  };

  const handleTransferSubmit = async () => {
    try {
      await allocationService.createTransfer({
        asset_id: selectedAsset,
        from_employee_id: conflict?.current_holder?.employee_id,
        to_employee_id: transferForm.to_employee_id,
        reason: transferForm.reason,
      });
      alert('Transfer request submitted!');
      setTransferForm({});
      setConflict(null);
      setSelectedAsset('');
      loadData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Transfer request failed');
    }
  };

  const handleReturn = async (allocId) => {
    const notes = prompt('Condition notes (optional):');
    try {
      await allocationService.return({ allocation_id: allocId, condition_notes: notes || undefined });
      alert('Asset returned successfully');
      loadData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Return failed');
    }
  };

  const handleApproveTransfer = async (id) => {
    try {
      await allocationService.approveTransfer(id);
      alert('Transfer approved');
      loadData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Approval failed');
    }
  };

  const handleRejectTransfer = async (id) => {
    try {
      await allocationService.rejectTransfer(id);
      alert('Transfer rejected');
      loadData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Rejection failed');
    }
  };

  const selectedAssetObj = assets.find(a => a.id === selectedAsset);

  if (loading) return <div className="loading-overlay"><div className="spinner" /></div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Allocation & Transfer</h1>
          <p className="page-subtitle">Allocate assets, manage transfers and returns</p>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab-item ${activeTab === 'allocate' ? 'active' : ''}`} onClick={() => setActiveTab('allocate')}>Allocate</button>
        <button className={`tab-item ${activeTab === 'active' ? 'active' : ''}`} onClick={() => setActiveTab('active')}>Active Allocations</button>
        <button className={`tab-item ${activeTab === 'transfers' ? 'active' : ''}`} onClick={() => setActiveTab('transfers')}>Transfer Requests</button>
      </div>

      {activeTab === 'allocate' && (
        <div className="card">
          <div className="card-body">
            {/* Asset Selector */}
            <div className="form-group">
              <label className="form-label">Asset</label>
              <select
                className="form-select"
                value={selectedAsset}
                onChange={(e) => handleAssetSelect(e.target.value)}
              >
                <option value="">Select an asset...</option>
                {assets.map(a => (
                  <option key={a.id} value={a.id}>{a.tag} — {a.name}</option>
                ))}
              </select>
            </div>

            {/* ⭐ Conflict Alert */}
            {conflict && (
              <div className="alert alert-danger">
                <MdWarning size={18} />
                <div>
                  <strong>{conflict.message || `Already Allocated to ${conflict.current_holder?.employee_name}. Direct re-allocation is blocked.`}</strong>
                </div>
              </div>
            )}

            {/* Transfer Request Form (shown on conflict) */}
            {conflict && (
              <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: '8px', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>Transfer Request</h3>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">From</label>
                    <input className="form-input" value={conflict.current_holder?.employee_name || ''} disabled />
                  </div>
                  <div className="form-group">
                    <label className="form-label">To</label>
                    <select
                      className="form-select"
                      value={transferForm.to_employee_id || ''}
                      onChange={(e) => setTransferForm({ ...transferForm, to_employee_id: e.target.value })}
                    >
                      <option value="">Select Employee...</option>
                      {employees.filter(e => e.id !== conflict.current_holder?.employee_id).map(e => (
                        <option key={e.id} value={e.id}>{e.full_name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Reason</label>
                  <textarea
                    className="form-textarea"
                    value={transferForm.reason || ''}
                    onChange={(e) => setTransferForm({ ...transferForm, reason: e.target.value })}
                    placeholder="Reason for transfer..."
                  />
                </div>
                <button className="btn btn-primary" onClick={handleTransferSubmit} disabled={!transferForm.to_employee_id}>
                  Submit Request
                </button>
              </div>
            )}

            {/* Normal Allocation Form (no conflict) */}
            {selectedAsset && !conflict && (
              <>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Allocate To</label>
                    <select
                      className="form-select"
                      value={allocForm.allocated_to || ''}
                      onChange={(e) => setAllocForm({ ...allocForm, allocated_to: e.target.value })}
                    >
                      <option value="">Select Employee...</option>
                      {employees.map(e => (
                        <option key={e.id} value={e.id}>{e.full_name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Expected Return Date</label>
                    <input
                      type="date"
                      className="form-input"
                      value={allocForm.expected_return_date || ''}
                      onChange={(e) => setAllocForm({ ...allocForm, expected_return_date: e.target.value })}
                    />
                  </div>
                </div>
                <button className="btn btn-primary" onClick={handleAllocate} disabled={!allocForm.allocated_to}>
                  Allocate Asset
                </button>
              </>
            )}

            {/* Allocation History */}
            {allocationHistory.length > 0 && (
              <div style={{ marginTop: '24px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>Allocation History</h4>
                <ul className="history-list">
                  {allocationHistory.map(a => (
                    <li key={a.id} className="history-item">
                      <span className="history-date">{new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      <span>
                        {a.status === 'active' ? 'Allocated to' : 'Returned by'} {a.allocated_to_profile?.full_name || 'Unknown'}
                        {a.department?.name ? ` — ${a.department.name}` : ''}
                        {a.condition_notes ? ` — condition: ${a.condition_notes}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'active' && (
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Allocated To</th>
                    <th>Department</th>
                    <th>Since</th>
                    <th>Expected Return</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {allocations.length === 0 ? (
                    <tr><td colSpan={6} className="text-center text-muted" style={{ padding: '32px' }}>No active allocations</td></tr>
                  ) : allocations.map(a => (
                    <tr key={a.id}>
                      <td style={{ fontWeight: 600, color: 'var(--primary)' }}>{a.asset?.tag} — {a.asset?.name}</td>
                      <td>{a.allocated_to_profile?.full_name}</td>
                      <td>{a.department?.name || '—'}</td>
                      <td>{formatDistanceToNow(new Date(a.created_at), { addSuffix: true })}</td>
                      <td>{a.expected_return_date || '—'}</td>
                      <td>
                        <button className="btn btn-sm btn-secondary" onClick={() => handleReturn(a.id)}>Return</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'transfers' && (
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>From</th>
                    <th>To</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {transfers.length === 0 ? (
                    <tr><td colSpan={6} className="text-center text-muted" style={{ padding: '32px' }}>No transfer requests</td></tr>
                  ) : transfers.map(t => (
                    <tr key={t.id}>
                      <td style={{ fontWeight: 600, color: 'var(--primary)' }}>{t.asset?.tag} — {t.asset?.name}</td>
                      <td>{t.from_employee?.full_name}</td>
                      <td>{t.to_employee?.full_name}</td>
                      <td>{t.reason || '—'}</td>
                      <td>
                        <span className={`badge ${t.status === 'requested' ? 'badge-warning' : t.status === 'approved' ? 'badge-success' : 'badge-danger'}`}>
                          {t.status}
                        </span>
                      </td>
                      <td>
                        {t.status === 'requested' && canApprove && (
                          <div className="d-flex gap-sm">
                            <button className="btn btn-sm btn-success" onClick={() => handleApproveTransfer(t.id)}>Approve</button>
                            <button className="btn btn-sm btn-danger" onClick={() => handleRejectTransfer(t.id)}>Reject</button>
                          </div>
                        )}
                      </td>
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
