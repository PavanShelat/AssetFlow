import { useState, useEffect } from 'react';
import { departmentService, categoryService, employeeService } from '../services/api';
import { MdAdd, MdEdit } from 'react-icons/md';

export default function OrgSetupPage() {
  const [activeTab, setActiveTab] = useState('departments');
  const [departments, setDepartments] = useState([]);
  const [categories, setCategories] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState('');
  const [editItem, setEditItem] = useState(null);

  // Form states
  const [formData, setFormData] = useState({});

  useEffect(() => {
    loadData();
  }, [activeTab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'departments') {
        const res = await departmentService.list();
        setDepartments(res.data.departments || []);
      } else if (activeTab === 'categories') {
        const res = await categoryService.list();
        setCategories(res.data.categories || []);
      } else {
        const res = await employeeService.list();
        setEmployees(res.data.employees || []);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  const openAddModal = () => {
    setEditItem(null);
    setFormData({});
    setModalType(activeTab);
    setShowModal(true);
  };

  const openEditModal = (item) => {
    setEditItem(item);
    setFormData(item);
    setModalType(activeTab);
    setShowModal(true);
  };

  const handleSave = async () => {
    try {
      if (activeTab === 'departments') {
        if (editItem) {
          await departmentService.update(editItem.id, formData);
        } else {
          await departmentService.create(formData);
        }
      } else if (activeTab === 'categories') {
        if (editItem) {
          await categoryService.update(editItem.id, formData);
        } else {
          await categoryService.create(formData);
        }
      } else if (activeTab === 'employees' && editItem) {
        if (formData.newRole && formData.newRole !== editItem.role) {
          await employeeService.updateRole(editItem.id, formData.newRole);
        }
        if (formData.department_id !== editItem.department_id) {
          await employeeService.update(editItem.id, { department_id: formData.department_id });
        }
      }
      setShowModal(false);
      loadData();
    } catch (err) {
      console.error('Save failed:', err);
      alert(err.response?.data?.detail || 'Save failed');
    }
  };

  const statusBadge = (status) => {
    const cls = status === 'active' ? 'badge-success' : 'badge-neutral';
    return <span className={`badge ${cls}`}>{status}</span>;
  };

  const roleBadge = (role) => {
    const map = {
      admin: 'badge-danger',
      asset_manager: 'badge-info',
      department_head: 'badge-warning',
      employee: 'badge-neutral',
    };
    return <span className={`badge ${map[role] || 'badge-neutral'}`}>{role?.replace('_', ' ')}</span>;
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Organization Setup</h1>
          <p className="page-subtitle">Manage departments, categories, and employees</p>
        </div>
        <div className="page-actions">
          <button className="btn btn-primary" onClick={openAddModal}>
            <MdAdd size={16} /> Add {activeTab === 'departments' ? 'Department' : activeTab === 'categories' ? 'Category' : ''}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button
          className={`tab-item ${activeTab === 'departments' ? 'active' : ''}`}
          onClick={() => setActiveTab('departments')}
        >
          Departments
        </button>
        <button
          className={`tab-item ${activeTab === 'categories' ? 'active' : ''}`}
          onClick={() => setActiveTab('categories')}
        >
          Categories
        </button>
        <button
          className={`tab-item ${activeTab === 'employees' ? 'active' : ''}`}
          onClick={() => setActiveTab('employees')}
        >
          Employee Directory
        </button>
      </div>

      {/* Content */}
      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          {loading ? (
            <div className="loading-overlay"><div className="spinner" /></div>
          ) : activeTab === 'departments' ? (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Department</th>
                    <th>Head</th>
                    <th>Parent Dept</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {departments.length === 0 ? (
                    <tr><td colSpan={5} className="text-center text-muted" style={{ padding: '32px' }}>No departments yet</td></tr>
                  ) : departments.map((dept) => (
                    <tr key={dept.id}>
                      <td style={{ fontWeight: 500 }}>{dept.name}</td>
                      <td>{dept.head?.full_name || '—'}</td>
                      <td>{dept.parent?.name || '—'}</td>
                      <td>{statusBadge(dept.status)}</td>
                      <td>
                        <button className="btn btn-sm btn-secondary" onClick={() => openEditModal(dept)}>
                          <MdEdit size={14} /> Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : activeTab === 'categories' ? (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Category Name</th>
                    <th>Description</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {categories.length === 0 ? (
                    <tr><td colSpan={3} className="text-center text-muted" style={{ padding: '32px' }}>No categories yet</td></tr>
                  ) : categories.map((cat) => (
                    <tr key={cat.id}>
                      <td style={{ fontWeight: 500 }}>{cat.name}</td>
                      <td>{cat.description || '—'}</td>
                      <td>
                        <button className="btn btn-sm btn-secondary" onClick={() => openEditModal(cat)}>
                          <MdEdit size={14} /> Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Department</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.length === 0 ? (
                    <tr><td colSpan={6} className="text-center text-muted" style={{ padding: '32px' }}>No employees yet</td></tr>
                  ) : employees.map((emp) => (
                    <tr key={emp.id}>
                      <td style={{ fontWeight: 500 }}>{emp.full_name}</td>
                      <td>{emp.email}</td>
                      <td>{emp.department?.name || '—'}</td>
                      <td>{roleBadge(emp.role)}</td>
                      <td>{statusBadge(emp.status)}</td>
                      <td>
                        <button className="btn btn-sm btn-secondary" onClick={() => openEditModal(emp)}>
                          <MdEdit size={14} /> Manage
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

      {/* Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">
                {editItem ? 'Edit' : 'Add'} {modalType === 'departments' ? 'Department' : modalType === 'categories' ? 'Category' : 'Employee'}
              </h3>
              <button className="modal-close" onClick={() => setShowModal(false)}>×</button>
            </div>
            <div className="modal-body">
              {modalType === 'departments' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Department Name</label>
                    <input
                      className="form-input"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g. Engineering"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Status</label>
                    <select
                      className="form-select"
                      value={formData.status || 'active'}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    >
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Description</label>
                    <textarea
                      className="form-textarea"
                      value={formData.description || ''}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Optional description"
                    />
                  </div>
                </>
              )}
              {modalType === 'categories' && (
                <>
                  <div className="form-group">
                    <label className="form-label">Category Name</label>
                    <input
                      className="form-input"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      placeholder="e.g. Electronics"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Description</label>
                    <textarea
                      className="form-textarea"
                      value={formData.description || ''}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                      placeholder="Optional description"
                    />
                  </div>
                </>
              )}
              {modalType === 'employees' && editItem && (
                <>
                  <div className="form-group">
                    <label className="form-label">Name</label>
                    <input className="form-input" value={editItem.full_name || ''} disabled />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input className="form-input" value={editItem.email || ''} disabled />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Role</label>
                    <select
                      className="form-select"
                      value={formData.newRole || editItem.role}
                      onChange={(e) => setFormData({ ...formData, newRole: e.target.value })}
                    >
                      <option value="employee">Employee</option>
                      <option value="department_head">Department Head</option>
                      <option value="asset_manager">Asset Manager</option>
                      <option value="admin">Admin</option>
                    </select>
                    <p className="form-hint">This is the only place roles can be changed.</p>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Department</label>
                    <select
                      className="form-select"
                      value={formData.department_id || editItem.department_id || ''}
                      onChange={(e) => setFormData({ ...formData, department_id: e.target.value || null })}
                    >
                      <option value="">No Department</option>
                      {departments.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSave}>
                {editItem ? 'Save Changes' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
