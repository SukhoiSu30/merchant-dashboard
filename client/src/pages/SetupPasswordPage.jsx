import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { authAPI } from '../services/api';
import { Eye, EyeOff, Lock, CheckCircle, AlertCircle } from 'lucide-react';
import { useToast } from '../context/ToastContext';

function PasswordStrengthMeter({ password }) {
  let strength = 0;
  let label = 'Weak';
  let color = 'bg-danger-500';

  if (password.length >= 8) strength++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) strength++;
  if (/\d/.test(password)) strength++;
  if (/[!@#$%^&*(),.?":{}|<>]/.test(password)) strength++;

  if (strength === 1) { label = 'Weak'; color = 'bg-danger-500'; }
  else if (strength === 2) { label = 'Fair'; color = 'bg-warning-500'; }
  else if (strength === 3) { label = 'Good'; color = 'bg-blue-500'; }
  else if (strength === 4) { label = 'Strong'; color = 'bg-success-500'; }

  return (
    <div className="space-y-2">
      <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
        <div className={`h-full ${color} transition-all`} style={{ width: `${(strength / 4) * 100}%` }}></div>
      </div>
      <p className="text-xs text-gray-500">Strength: {label}</p>
    </div>
  );
}

export default function SetupPasswordPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [tokenValid, setTokenValid] = useState(false);
  const [tokenError, setTokenError] = useState('');
  const [email, setEmail] = useState('');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  // Verify token on mount
  useEffect(() => {
    const verifyToken = async () => {
      if (!token) {
        setTokenError('No token provided');
        setLoading(false);
        return;
      }

      try {
        const { data } = await authAPI.verifyToken(token);
        if (data.valid) {
          setTokenValid(true);
          setEmail(data.email);
        } else {
          setTokenError(data.error || 'Invalid or expired token');
        }
      } catch (err) {
        setTokenError(err.response?.data?.error || 'Failed to verify token');
      } finally {
        setLoading(false);
      }
    };

    verifyToken();
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validation
    if (!password || !confirmPassword) {
      setError('Both password fields are required');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setVerifying(true);
    try {
      await authAPI.setupPassword({ token, password });
      toast.success('Password set successfully! Redirecting to login...');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to set password');
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-8">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 border-3 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-gray-500 text-sm">Verifying token...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary-500 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary-500/30">
            <span className="text-white font-bold text-2xl">JP</span>
          </div>
          <h1 className="text-2xl font-bold text-white">JusPay Dashboard</h1>
          <p className="text-blue-200 mt-1">Set Your Password</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {!tokenValid ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="text-danger-500 flex-shrink-0 mt-0.5" size={20} />
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">Invalid Link</h2>
                  <p className="text-gray-600 text-sm mt-1">{tokenError}</p>
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-4">
                This password setup link is invalid or has expired. Please contact your administrator to send you a new invitation.
              </p>
              <button
                onClick={() => navigate('/login')}
                className="w-full py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors"
              >
                Go to Login
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-800 mb-1">Set your password</h2>
                <p className="text-gray-500 text-sm mb-6">Account: {email}</p>
              </div>

              {error && (
                <div className="p-3 bg-danger-50 border border-danger-200 rounded-lg text-sm text-danger-700 flex items-start gap-2">
                  <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {password && <div className="mt-2"><PasswordStrengthMeter password={password} /></div>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                  <input
                    type={showConfirm ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm password"
                    className="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {password && confirmPassword && password === confirmPassword && (
                  <div className="mt-2 flex items-center gap-1 text-success-600 text-sm">
                    <CheckCircle size={14} />
                    <span>Passwords match</span>
                  </div>
                )}
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
                <p className="font-medium mb-1">Password requirements:</p>
                <ul className="text-xs space-y-1">
                  <li>At least 8 characters</li>
                  <li>Mix of uppercase and lowercase letters</li>
                  <li>At least one number</li>
                  <li>Strong recommended: Add special characters</li>
                </ul>
              </div>

              <button
                type="submit"
                disabled={verifying || !password || !confirmPassword}
                className="w-full py-2.5 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                {verifying ? 'Setting Password...' : 'Set Password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
