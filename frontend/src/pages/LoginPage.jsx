import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const [isSignup, setIsSignup] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const { login, signup } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    setLoading(true);

    try {
      if (isSignup) {
        const result = await signup(email, password, fullName);
        if (result.session) {
          navigate('/dashboard');
        } else {
          setSuccessMsg('Account created! Please check your email to verify, then log in.');
          setIsSignup(false);
        }
      } else {
        await login(email, password);
        navigate('/dashboard');
      }
    } catch (err) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">AF</div>
        <h1 className="login-title">
          {isSignup ? 'Create Account' : 'Welcome Back'}
        </h1>
        <p className="login-subtitle">
          {isSignup
            ? 'Sign up to get started with AssetFlow'
            : 'Sign in to your AssetFlow account'}
        </p>

        {error && <div className="alert alert-danger">{error}</div>}
        {successMsg && <div className="alert alert-success">{successMsg}</div>}

        <form onSubmit={handleSubmit}>
          {isSignup && (
            <div className="form-group">
              <label className="form-label">Full Name</label>
              <input
                type="text"
                className="form-input"
                placeholder="Enter your full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
              />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Email</label>
            <input
              type="email"
              className="form-input"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
            {!isSignup && (
              <div style={{ textAlign: 'right', marginTop: '4px' }}>
                <a href="#" className="text-primary" style={{ fontSize: '12px' }}>
                  Forgot password?
                </a>
              </div>
            )}
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg w-100"
            disabled={loading}
          >
            {loading ? 'Please wait...' : isSignup ? 'Create Account' : 'Sign In'}
          </button>
        </form>

        {isSignup && (
          <div className="alert alert-info" style={{ marginTop: '16px' }}>
            <span style={{ fontSize: '12px' }}>
              Sign up creates an <strong>Employee</strong> account. Admin roles are assigned later by an administrator.
            </span>
          </div>
        )}

        <div className="login-divider">or</div>

        <div className="login-footer">
          {isSignup ? (
            <>
              Already have an account?{' '}
              <a href="#" onClick={(e) => { e.preventDefault(); setIsSignup(false); setError(''); }}>
                Sign In
              </a>
            </>
          ) : (
            <>
              New here?{' '}
              <a href="#" onClick={(e) => { e.preventDefault(); setIsSignup(true); setError(''); }}>
                Create Account
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
