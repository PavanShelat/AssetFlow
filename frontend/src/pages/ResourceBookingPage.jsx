import { useState, useEffect } from 'react';
import { assetService, bookingService } from '../services/api';
import { MdEventNote, MdWarning } from 'react-icons/md';
import { format } from 'date-fns';

export default function ResourceBookingPage() {
  const [bookableAssets, setBookableAssets] = useState([]);
  const [selectedAsset, setSelectedAsset] = useState('');
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showBookingForm, setShowBookingForm] = useState(false);
  const [bookingForm, setBookingForm] = useState({});
  const [conflict, setConflict] = useState(null);
  const [allBookings, setAllBookings] = useState([]);
  const [activeTab, setActiveTab] = useState('calendar');

  useEffect(() => {
    loadAssets();
  }, []);

  useEffect(() => {
    if (selectedAsset) {
      loadBookings();
    }
  }, [selectedAsset, selectedDate]);

  const loadAssets = async () => {
    try {
      const res = await assetService.list({ is_bookable: true });
      setBookableAssets(res.data.assets || []);
      if (res.data.assets?.length > 0) {
        setSelectedAsset(res.data.assets[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadBookings = async () => {
    try {
      const res = await bookingService.getResourceBookings(selectedAsset, selectedDate);
      setBookings(res.data.bookings || []);
    } catch (err) {
      console.error(err);
    }
  };

  const loadAllBookings = async () => {
    try {
      const res = await bookingService.list();
      setAllBookings(res.data.bookings || []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (activeTab === 'mybookings') {
      loadAllBookings();
    }
  }, [activeTab]);

  const handleBook = async () => {
    setConflict(null);
    try {
      const startTime = `${selectedDate}T${bookingForm.start_time}:00`;
      const endTime = `${selectedDate}T${bookingForm.end_time}:00`;

      await bookingService.create({
        asset_id: selectedAsset,
        title: bookingForm.title,
        start_time: startTime,
        end_time: endTime,
        notes: bookingForm.notes,
      });

      alert('Booking confirmed!');
      setShowBookingForm(false);
      setBookingForm({});
      loadBookings();
    } catch (err) {
      if (err.response?.status === 409) {
        setConflict(err.response.data.detail);
      } else {
        alert(err.response?.data?.detail || 'Booking failed');
      }
    }
  };

  const handleCancel = async (id) => {
    if (!confirm('Cancel this booking?')) return;
    try {
      await bookingService.cancel(id);
      loadBookings();
      if (activeTab === 'mybookings') loadAllBookings();
    } catch (err) {
      alert('Cancel failed');
    }
  };

  const selectedAssetObj = bookableAssets.find(a => a.id === selectedAsset);

  // Generate timeline hours
  const hours = [];
  for (let h = 8; h <= 18; h++) {
    hours.push(`${h.toString().padStart(2, '0')}:00`);
  }

  const getBookingForHour = (hour) => {
    const hourNum = parseInt(hour.split(':')[0]);
    return bookings.find(b => {
      const start = new Date(b.start_time);
      const end = new Date(b.end_time);
      return start.getHours() <= hourNum && end.getHours() > hourNum;
    });
  };

  if (loading) return <div className="loading-overlay"><div className="spinner" /></div>;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Resource Booking</h1>
          <p className="page-subtitle">Book shared resources and manage reservations</p>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab-item ${activeTab === 'calendar' ? 'active' : ''}`} onClick={() => setActiveTab('calendar')}>Calendar View</button>
        <button className={`tab-item ${activeTab === 'mybookings' ? 'active' : ''}`} onClick={() => setActiveTab('mybookings')}>All Bookings</button>
      </div>

      {activeTab === 'calendar' && (
        <div className="card">
          <div className="card-body">
            {/* Resource selector */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ flex: 1, marginBottom: 0 }}>
                <label className="form-label">Resource</label>
                <select className="form-select" value={selectedAsset} onChange={(e) => setSelectedAsset(e.target.value)}>
                  {bookableAssets.map(a => (
                    <option key={a.id} value={a.id}>{a.name} ({a.tag})</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Date</label>
                <input type="date" className="form-input" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} />
              </div>
            </div>

            {bookableAssets.length === 0 ? (
              <div className="empty-state">
                <p className="empty-state-title">No bookable resources</p>
                <p className="empty-state-description">Mark assets as "bookable" in the Asset Registry to enable booking.</p>
              </div>
            ) : (
              <>
                <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '12px' }}>
                  {selectedAssetObj?.name} — {format(new Date(selectedDate + 'T00:00:00'), 'EEE, d MMM')}
                </h3>

                {/* Timeline */}
                <div className="timeline">
                  {hours.map((hour) => {
                    const booking = getBookingForHour(hour);
                    return (
                      <div key={hour} className="timeline-slot">
                        <div className="timeline-time">{hour}</div>
                        <div className="timeline-content">
                          {booking && (
                            <div className="timeline-booking">
                              <strong>Booked</strong> — {booking.booked_by_profile?.full_name || 'Unknown'} — {format(new Date(booking.start_time), 'H:mm')} to {format(new Date(booking.end_time), 'H:mm')}
                              {booking.title && ` — ${booking.title}`}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Conflict display */}
                {conflict && (
                  <div className="alert alert-danger" style={{ marginTop: '16px' }}>
                    <MdWarning size={18} />
                    <span>{conflict.message || 'Booking conflict — slot is unavailable'}</span>
                  </div>
                )}

                {/* Book a slot button */}
                <div style={{ marginTop: '20px' }}>
                  {!showBookingForm ? (
                    <button className="btn btn-primary" onClick={() => { setShowBookingForm(true); setConflict(null); }}>
                      <MdEventNote size={16} /> Book a Slot
                    </button>
                  ) : (
                    <div style={{ background: 'var(--bg-surface)', padding: '20px', borderRadius: '8px' }}>
                      <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>New Booking</h4>
                      <div className="form-group">
                        <label className="form-label">Title (optional)</label>
                        <input className="form-input" value={bookingForm.title || ''} onChange={(e) => setBookingForm({ ...bookingForm, title: e.target.value })} placeholder="e.g. Team Standup" />
                      </div>
                      <div className="form-row">
                        <div className="form-group">
                          <label className="form-label">Start Time</label>
                          <input type="time" className="form-input" value={bookingForm.start_time || ''} onChange={(e) => setBookingForm({ ...bookingForm, start_time: e.target.value })} />
                        </div>
                        <div className="form-group">
                          <label className="form-label">End Time</label>
                          <input type="time" className="form-input" value={bookingForm.end_time || ''} onChange={(e) => setBookingForm({ ...bookingForm, end_time: e.target.value })} />
                        </div>
                      </div>
                      <div className="form-group">
                        <label className="form-label">Notes</label>
                        <textarea className="form-textarea" value={bookingForm.notes || ''} onChange={(e) => setBookingForm({ ...bookingForm, notes: e.target.value })} placeholder="Optional notes..." />
                      </div>
                      <div className="d-flex gap-sm">
                        <button className="btn btn-primary" onClick={handleBook} disabled={!bookingForm.start_time || !bookingForm.end_time}>Confirm Booking</button>
                        <button className="btn btn-secondary" onClick={() => { setShowBookingForm(false); setConflict(null); }}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {activeTab === 'mybookings' && (
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Resource</th>
                    <th>Title</th>
                    <th>Date</th>
                    <th>Time</th>
                    <th>Booked By</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {allBookings.length === 0 ? (
                    <tr><td colSpan={7} className="text-center text-muted" style={{ padding: '32px' }}>No bookings yet</td></tr>
                  ) : allBookings.map(b => (
                    <tr key={b.id}>
                      <td style={{ fontWeight: 500 }}>{b.asset?.name} ({b.asset?.tag})</td>
                      <td>{b.title || '—'}</td>
                      <td>{format(new Date(b.start_time), 'MMM d, yyyy')}</td>
                      <td>{format(new Date(b.start_time), 'h:mm a')} – {format(new Date(b.end_time), 'h:mm a')}</td>
                      <td>{b.booked_by_profile?.full_name || '—'}</td>
                      <td>
                        <span className={`badge ${b.status === 'upcoming' ? 'badge-info' : b.status === 'ongoing' ? 'badge-success' : b.status === 'cancelled' ? 'badge-danger' : 'badge-neutral'}`}>
                          {b.status}
                        </span>
                      </td>
                      <td>
                        {['upcoming', 'ongoing'].includes(b.status) && (
                          <button className="btn btn-sm btn-danger" onClick={() => handleCancel(b.id)}>Cancel</button>
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
