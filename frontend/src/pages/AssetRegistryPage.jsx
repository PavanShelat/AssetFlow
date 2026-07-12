import { useState, useEffect } from 'react';
import { assetService, categoryService, departmentService } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import { MdAdd, MdSearch, MdVisibility } from 'react-icons/md';

export default function AssetRegistryPage() {
  const [assets, setAssets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showDetail, setShowDetail] = useState(null);
  const [formData, setFormData] = useState({});
  const { canManageAssets } = useAuth();

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    loadAssets();
  }, [search, filterCategory, filterStatus, filterDept]);

  const loadData = async () => {
    try {
      const [catRes, deptRes] = await Promise.all([
        categoryService.list(),
        departmentService.list(),
      ]);
      setCategories(catRes.data.categories || []);
      setDepartments(deptRes.data.departments || []);
    } catch (err) {
      console.error(err);
    }
  };

  const loadAssets = async () => {
    setLoading(true);
    try {
      const params = {};
      if (search) params.search = search;
      if (filterCategory) params.category_id = filterCategory;
      if (filterStatus) params.status = filterStatus;
      if (filterDept) params.department_id = filterDept;
      const res = await assetService.list(params);
      setAssets(res.data.assets || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    try {
      await assetService.create(formData);
      setShowModal(false);
      setFormData({});
      loadAssets();
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to register asset');
    }
  };

  const loadDetail = async (id) => {
    try {
      const res = await assetService.get(id);
      setShowDetail(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const statusBadge = (status) => {
    const map = {
      available: 'badge-success',
      allocated: 'badge-info',
      under_maintenance: 'badge-warning',
      retired: 'badge-neutral',
      lost: 'badge-danger',
    };
    return <span className={`badge ${map[status] || 'badge-neutral'}`}>{status?.replace('_', ' ')}</span>;
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Asset Registry</h1>
          <p className="page-subtitle">Manage and track all organizational assets</p>
        </div>
        {canManageAssets && (
          <button className="btn btn-primary" onClick={() => { setFormData({}); setShowModal(true); }}>
            <MdAdd size={16} /> Register Asset
          </button>
        )}
      </div>

      {/* Search & Filters */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <div className="search-bar" style={{ flex: 1, minWidth: '250px' }}>
          <MdSearch className="search-icon" />
          <input
            placeholder="Search by tag, serial, or QR code..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="form-select" style={{ width: 'auto', minWidth: '140px' }} value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
          <option value="">All Categories</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="form-select" style={{ width: 'auto', minWidth: '140px' }} value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="">All Status</option>
          <option value="available">Available</option>
          <option value="allocated">Allocated</option>
          <option value="under_maintenance">Under Maintenance</option>
          <option value="retired">Retired</option>
          <option value="lost">Lost</option>
        </select>
        <select className="form-select" style={{ width: 'auto', minWidth: '140px' }} value={filterDept} onChange={(e) => setFilterDept(e.target.value)}>
          <option value="">All Departments</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {/* Asset Table */}
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="loading-overlay"><div className="spinner" /></div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Tag</th>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Status</th>
                    <th>Location</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.length === 0 ? (
                    <tr><td colSpan={6} className="text-center text-muted" style={{ padding: '32px' }}>No assets found</td></tr>
                  ) : assets.map((asset) => (
                    <tr key={asset.id}>
                      <td style={{ fontWeight: 600, color: 'var(--primary)' }}>{asset.tag}</td>
                      <td style={{ fontWeight: 500 }}>{asset.name}</td>
                      <td>{asset.category?.name || '—'}</td>
                      <td>{statusBadge(asset.status)}</td>
                      <td>{asset.location || '—'}</td>
                      <td>
                        <button className="btn btn-sm btn-secondary" onClick={() => loadDetail(asset.id)}>
                          <MdVisibility size={14} /> View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Register Asset Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <h3 className="modal-title">Register New Asset</h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Asset Name *</label>
                  <input className="form-input" value={formData.name || ''} onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. Dell Laptop" />
                </div>
                <div className="form-group">
                  <label className="form-label">Category</label>
                  <select className="form-select" value={formData.category_id || ''} onChange={(e) => setFormData({ ...formData, category_id: e.target.value || undefined })}>
                    <option value="">Select Category</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Serial Number</label>
                  <input className="form-input" value={formData.serial_number || ''} onChange={(e) => setFormData({ ...formData, serial_number: e.target.value })} placeholder="e.g. SN-12345" />
                </div>
                <div className="form-group">
                  <label className="form-label">Condition</label>
                  <select className="form-select" value={formData.condition || 'new'} onChange={(e) => setFormData({ ...formData, condition: e.target.value })}>
                    <option value="new">New</option>
                    <option value="good">Good</option>
                    <option value="fair">Fair</option>
                    <option value="poor">Poor</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Location</label>
                  <input className="form-input" value={formData.location || ''} onChange={(e) => setFormData({ ...formData, location: e.target.value })} placeholder="e.g. Bengaluru HQ" />
                </div>
                <div className="form-group">
                  <label className="form-label">Department</label>
                  <select className="form-select" value={formData.department_id || ''} onChange={(e) => setFormData({ ...formData, department_id: e.target.value || undefined })}>
                    <option value="">No Department</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Acquisition Date</label>
                  <input type="date" className="form-input" value={formData.acquisition_date || ''} onChange={(e) => setFormData({ ...formData, acquisition_date: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Acquisition Cost</label>
                  <input type="number" className="form-input" value={formData.acquisition_cost || ''} onChange={(e) => setFormData({ ...formData, acquisition_cost: parseFloat(e.target.value) || undefined })} placeholder="0.00" />
                </div>
              </div>
              <div className="form-group">
                <label className="form-checkbox">
                  <input type="checkbox" checked={formData.is_bookable || false} onChange={(e) => setFormData({ ...formData, is_bookable: e.target.checked })} />
                  <span>This is a shared/bookable resource (e.g. conference room)</span>
                </label>
              </div>
              <div className="form-group">
                <label className="form-label">Notes</label>
                <textarea className="form-textarea" value={formData.notes || ''} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder="Optional notes..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleRegister} disabled={!formData.name}>Register Asset</button>
            </div>
          </div>
        </div>
      )}

      {/* Asset Detail Modal */}
      {showDetail && (
        <div className="modal-overlay" onClick={() => setShowDetail(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <h3 className="modal-title">{showDetail.asset?.tag} — {showDetail.asset?.name}</h3>
              <button className="modal-close" onClick={() => setShowDetail(null)}>×</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                <div><strong>Tag:</strong> {showDetail.asset?.tag}</div>
                <div><strong>Status:</strong> {statusBadge(showDetail.asset?.status)}</div>
                <div><strong>Category:</strong> {showDetail.asset?.category?.name || '—'}</div>
                <div><strong>Condition:</strong> {showDetail.asset?.condition}</div>
                <div><strong>Location:</strong> {showDetail.asset?.location || '—'}</div>
                <div><strong>Serial:</strong> {showDetail.asset?.serial_number || '—'}</div>
                <div><strong>Bookable:</strong> {showDetail.asset?.is_bookable ? 'Yes' : 'No'}</div>
                <div><strong>Dept:</strong> {showDetail.asset?.department?.name || '—'}</div>
              </div>

              {showDetail.allocation_history?.length > 0 && (
                <>
                  <h4 style={{ fontSize: '14px', fontWeight: 600, marginTop: '16px', marginBottom: '8px' }}>Allocation History</h4>
                  <ul className="history-list">
                    {showDetail.allocation_history.map(a => (
                      <li key={a.id} className="history-item">
                        <span className="history-date">{new Date(a.created_at).toLocaleDateString()}</span>
                        <span>
                          {a.status === 'active' ? 'Allocated to' : 'Returned by'} {a.allocated_to_profile?.full_name || 'Unknown'}
                          {a.department?.name ? ` — ${a.department.name}` : ''}
                          {a.condition_notes ? ` — condition: ${a.condition_notes}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {showDetail.maintenance_history?.length > 0 && (
                <>
                  <h4 style={{ fontSize: '14px', fontWeight: 600, marginTop: '16px', marginBottom: '8px' }}>Maintenance History</h4>
                  <ul className="history-list">
                    {showDetail.maintenance_history.map(m => (
                      <li key={m.id} className="history-item">
                        <span className="history-date">{new Date(m.created_at).toLocaleDateString()}</span>
                        <span>
                          {m.issue_description} — <span className={`badge badge-${m.status === 'resolved' ? 'success' : 'warning'}`}>{m.status}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowDetail(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
