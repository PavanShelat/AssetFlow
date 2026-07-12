import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to every request
api.interceptors.request.use((config) => {
  const session = JSON.parse(localStorage.getItem('assetflow_session') || 'null');
  if (session?.access_token) {
    config.headers.Authorization = `Bearer ${session.access_token}`;
  }
  return config;
});

// Handle 401 responses
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('assetflow_session');
      localStorage.removeItem('assetflow_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

// ==================== AUTH ====================
export const authService = {
  signup: (data) => api.post('/auth/signup', data),
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
};

// ==================== DEPARTMENTS ====================
export const departmentService = {
  list: () => api.get('/departments'),
  create: (data) => api.post('/departments', data),
  update: (id, data) => api.put(`/departments/${id}`, data),
  delete: (id) => api.delete(`/departments/${id}`),
};

// ==================== EMPLOYEES ====================
export const employeeService = {
  list: (params) => api.get('/employees', { params }),
  get: (id) => api.get(`/employees/${id}`),
  update: (id, data) => api.put(`/employees/${id}`, data),
  updateRole: (id, role) => api.put(`/employees/${id}/role`, { role }),
};

// ==================== CATEGORIES ====================
export const categoryService = {
  list: () => api.get('/categories'),
  create: (data) => api.post('/categories', data),
  update: (id, data) => api.put(`/categories/${id}`, data),
};

// ==================== ASSETS ====================
export const assetService = {
  list: (params) => api.get('/assets', { params }),
  get: (id) => api.get(`/assets/${id}`),
  create: (data) => api.post('/assets', data),
  update: (id, data) => api.put(`/assets/${id}`, data),
  nextTag: () => api.get('/assets/next-tag'),
};

// ==================== ALLOCATIONS ====================
export const allocationService = {
  list: (params) => api.get('/allocations', { params }),
  allocate: (data) => api.post('/allocations', data),
  return: (data) => api.post('/allocations/return', data),
  history: (assetId) => api.get(`/allocations/history/${assetId}`),
  // Transfers
  listTransfers: (params) => api.get('/allocations/transfers', { params }),
  createTransfer: (data) => api.post('/allocations/transfers', data),
  approveTransfer: (id) => api.put(`/allocations/transfers/${id}/approve`),
  rejectTransfer: (id) => api.put(`/allocations/transfers/${id}/reject`),
};

// ==================== BOOKINGS ====================
export const bookingService = {
  list: (params) => api.get('/bookings', { params }),
  getResourceBookings: (assetId, date) => api.get(`/bookings/resource/${assetId}`, { params: { date } }),
  create: (data) => api.post('/bookings', data),
  cancel: (id) => api.put(`/bookings/${id}/cancel`),
  reschedule: (id, data) => api.put(`/bookings/${id}/reschedule`, data),
};

// ==================== MAINTENANCE ====================
export const maintenanceService = {
  list: (params) => api.get('/maintenance', { params }),
  create: (data) => api.post('/maintenance', data),
  approve: (id) => api.put(`/maintenance/${id}/approve`),
  reject: (id) => api.put(`/maintenance/${id}/reject`),
  assignTech: (id, data) => api.put(`/maintenance/${id}/assign-tech`, data),
  start: (id) => api.put(`/maintenance/${id}/start`),
  resolve: (id) => api.put(`/maintenance/${id}/resolve`),
};

// ==================== AUDITS ====================
export const auditService = {
  list: (params) => api.get('/audits', { params }),
  get: (id) => api.get(`/audits/${id}`),
  create: (data) => api.post('/audits', data),
  updateItem: (cycleId, itemId, data) => api.put(`/audits/${cycleId}/items/${itemId}`, data),
  close: (id) => api.post(`/audits/${id}/close`),
  discrepancyReport: (id) => api.get(`/audits/${id}/discrepancy-report`),
};

// ==================== REPORTS ====================
export const reportService = {
  dashboard: () => api.get('/reports/dashboard'),
  utilization: () => api.get('/reports/utilization'),
  maintenanceFrequency: () => api.get('/reports/maintenance-frequency'),
  mostUsed: () => api.get('/reports/most-used'),
  idle: () => api.get('/reports/idle'),
  dueMaintenance: () => api.get('/reports/due-maintenance'),
};

// ==================== NOTIFICATIONS ====================
export const notificationService = {
  list: (params) => api.get('/notifications', { params }),
  unreadCount: () => api.get('/notifications/count'),
  markRead: (id) => api.put(`/notifications/${id}/read`),
  markAllRead: () => api.put('/notifications/read-all'),
  activityLogs: (params) => api.get('/notifications/activity-logs', { params }),
};
