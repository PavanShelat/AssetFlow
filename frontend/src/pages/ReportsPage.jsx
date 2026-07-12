import { useState, useEffect } from 'react';
import { reportService } from '../services/api';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { MdDownload } from 'react-icons/md';

export default function ReportsPage() {
  const [utilization, setUtilization] = useState([]);
  const [frequency, setFrequency] = useState([]);
  const [mostUsed, setMostUsed] = useState([]);
  const [idle, setIdle] = useState([]);
  const [dueMaint, setDueMaint] = useState({ nearing_warranty_expiry: [], poor_condition: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    try {
      const [utilRes, freqRes, usedRes, idleRes, dueRes] = await Promise.all([
        reportService.utilization(),
        reportService.maintenanceFrequency(),
        reportService.mostUsed(),
        reportService.idle(),
        reportService.dueMaintenance(),
      ]);
      setUtilization(utilRes.data.utilization || []);
      setFrequency(freqRes.data.frequency || []);
      setMostUsed(usedRes.data.most_used || []);
      setIdle(idleRes.data.idle_assets || []);
      setDueMaint(dueRes.data || {});
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    const data = {
      utilization,
      most_used: mostUsed,
      idle_assets: idle,
      maintenance_due: dueMaint,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'assetflow_report.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <div className="loading-overlay"><div className="spinner" /></div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports & Analytics</h1>
          <p className="page-subtitle">Insights into asset utilization, maintenance, and activity</p>
        </div>
        <button className="btn btn-primary" onClick={handleExport}>
          <MdDownload size={16} /> Export Report
        </button>
      </div>

      {/* Charts */}
      <div className="charts-grid">
        <div className="chart-card">
          <h3 className="chart-card-title">Utilization by Department</h3>
          {utilization.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={utilization}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="department" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Legend />
                <Bar dataKey="total" fill="#714B67" name="Total Assets" radius={[4,4,0,0]} />
                <Bar dataKey="allocated" fill="#00A09D" name="Allocated" radius={[4,4,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state"><p className="empty-state-description">No data available</p></div>
          )}
        </div>

        <div className="chart-card">
          <h3 className="chart-card-title">Maintenance Frequency</h3>
          {frequency.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={frequency}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={12} />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#DC3545" strokeWidth={2} dot={{ fill: '#DC3545' }} name="Requests" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state"><p className="empty-state-description">No data available</p></div>
          )}
        </div>
      </div>

      {/* Info Cards */}
      <div className="charts-grid">
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Most Used Assets</h3>
          </div>
          <div className="card-body">
            {mostUsed.length === 0 ? (
              <p className="text-muted">No usage data yet</p>
            ) : (
              <ul style={{ listStyle: 'none' }}>
                {mostUsed.map((asset, i) => (
                  <li key={asset.asset_id} style={{ padding: '8px 0', borderBottom: i < mostUsed.length - 1 ? '1px solid var(--border-light)' : 'none', display: 'flex', justifyContent: 'space-between' }}>
                    <span>
                      <strong>{asset.name}</strong> <span className="text-muted">({asset.tag})</span>
                    </span>
                    <span className="badge badge-info">{asset.usage_count} uses</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Idle Assets</h3>
          </div>
          <div className="card-body">
            {idle.length === 0 ? (
              <p className="text-muted">No idle assets</p>
            ) : (
              <ul style={{ listStyle: 'none' }}>
                {idle.map((asset, i) => (
                  <li key={asset.id} style={{ padding: '8px 0', borderBottom: i < idle.length - 1 ? '1px solid var(--border-light)' : 'none' }}>
                    <strong>{asset.name}</strong> <span className="text-muted">({asset.tag})</span>
                    <br />
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      Last updated: {new Date(asset.updated_at).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Due Maintenance */}
      <div className="card" style={{ marginTop: '0' }}>
        <div className="card-header">
          <h3 className="card-title">Assets Due for Maintenance / Nearing Retirement</h3>
        </div>
        <div className="card-body">
          {(dueMaint.nearing_warranty_expiry?.length === 0 && dueMaint.poor_condition?.length === 0) ? (
            <p className="text-muted">No assets due for maintenance</p>
          ) : (
            <ul style={{ listStyle: 'none' }}>
              {dueMaint.nearing_warranty_expiry?.map(a => (
                <li key={a.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border-light)' }}>
                  <strong>{a.name}</strong> ({a.tag}) — warranty expires {a.warranty_expiry}
                </li>
              ))}
              {dueMaint.poor_condition?.map(a => (
                <li key={a.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--border-light)' }}>
                  <strong>{a.name}</strong> ({a.tag}) — condition: <span className="badge badge-warning">{a.condition}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
