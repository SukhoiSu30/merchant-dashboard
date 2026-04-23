import { useState, useEffect } from 'react';
import { authAPI, settingsAPI } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  Shield, Lock, Smartphone, Key, Eye, EyeOff, CheckCircle, XCircle,
  AlertTriangle, RefreshCw, Copy
} from 'lucide-react';
import { Skeleton } from '../components/ui/Skeleton';

export default function SecurityPage() {
  const { user } = useAuth();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState('password');

  // Password change
  const [pwForm, setPwForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMessage, setPwMessage] = useState(null);
  const [showPw, setShowPw] = useState({});

  // 2FA
  const [twoFA, setTwoFA] = useState({ enabled: user?.two_factor_enabled || false });
  const [setupData, setSetupData] = useState(null);
  const [setupLoading, setSetupLoading] = useState(false);
  const [verifyCode, setVerifyCode] = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  const [disableLoading, setDisableLoading] = useState(false);

  // Security settings
  const [securitySettings, setSecuritySettings] = useState(null);
  const [settingsLoading, setSettingsLoading] = useState(true);

  useEffect(() => {
    const fetchSecurity = async () => {
      try {
        const { data } = await settingsAPI.getSecurity();
        setSecuritySettings(data.settings);
      } catch (err) {
        toast.error('Failed to load security settings');
      }
      finally { setSettingsLoading(false); }
    };
    fetchSecurity();
  }, []);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwMessage(null);

    if (pwForm.new_password !== pwForm.confirm_password) {
      setPwMessage({ type: 'error', text: 'New passwords do not match' });
      return;
    }
    if (pwForm.new_password.length < 8) {
      setPwMessage({ type: 'error', text: 'Password must be at least 8 characters' });
      return;
    }

    setPwLoading(true);
    try {
      await authAPI.changePassword({
        currentPassword: pwForm.current_password,
        newPassword: pwForm.new_password,
      });
      setPwMessage({ type: 'success', text: 'Password changed successfully' });
      setPwForm({ current_password: '', new_password: '', confirm_password: '' });
    } catch (err) {
      setPwMessage({ type: 'error', text: err.response?.data?.error || 'Failed to change password' });
    }
    finally { setPwLoading(false); }
  };

  const handleSetup2FA = async () => {
    setSetupLoading(true);
    try {
      const { data } = await authAPI.setup2FA();
      setSetupData(data);
    } catch (err) { toast.error('Failed to set up 2FA. Please try again.'); }
    finally { setSetupLoading(false); }
  };

  const handleEnable2FA = async () => {
    if (!verifyCode || verifyCode.length !== 6) return;
    setVerifyLoading(true);
    try {
      await authAPI.enable2FA({ token: verifyCode });
      setTwoFA({ enabled: true });
      setSetupData(null);
      setVerifyCode('');
      // Update local user
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      stored.two_factor_enabled = true;
      localStorage.setItem('user', JSON.stringify(stored));
      toast.success('Two-factor authentication enabled');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Invalid code');
    }
    finally { setVerifyLoading(false); }
  };

  const handleDisable2FA = async () => {
    if (!disableCode || disableCode.length !== 6) return;
    setDisableLoading(true);
    try {
      await authAPI.disable2FA({ token: disableCode });
      setTwoFA({ enabled: false });
      setDisableCode('');
      const stored = JSON.parse(localStorage.getItem('user') || '{}');
      stored.two_factor_enabled = false;
      localStorage.setItem('user', JSON.stringify(stored));
      toast.success('Two-factor authentication disabled');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Invalid code');
    }
    finally { setDisableLoading(false); }
  };

  const passwordStrength = (pw) => {
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[a-z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    if (score <= 2) return { label: 'Weak', color: 'bg-danger-500', width: '33%' };
    if (score <= 4) return { label: 'Medium', color: 'bg-warning-500', width: '66%' };
    return { label: 'Strong', color: 'bg-success-500', width: '100%' };
  };

  const strength = passwordStrength(pwForm.new_password);

  const tabs = [
    { id: 'password', label: 'Password', icon: Lock },
    { id: '2fa', label: 'Two-Factor Auth', icon: Smartphone },
    { id: 'policies', label: 'Security Policies', icon: Shield },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Security</h1>
          <p className="text-gray-500 text-sm mt-1">Manage your account security settings</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        {/* Tabs */}
        <div className="flex border-b border-gray-200">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary-600 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              <tab.icon size={16} />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {/* Password Tab */}
          {activeTab === 'password' && (
            <div className="max-w-md">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Change Password</h3>

              {pwMessage && (
                <div className={`p-3 rounded-lg mb-4 flex items-center gap-2 text-sm ${
                  pwMessage.type === 'success' ? 'bg-success-50 text-success-700' : 'bg-danger-50 text-danger-700'
                }`}>
                  {pwMessage.type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
                  {pwMessage.text}
                </div>
              )}

              <form onSubmit={handleChangePassword} className="space-y-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Current Password</label>
                  <div className="relative">
                    <input
                      type={showPw.current ? 'text' : 'password'}
                      value={pwForm.current_password}
                      onChange={(e) => setPwForm(f => ({ ...f, current_password: e.target.value }))}
                      required
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm pr-10"
                    />
                    <button type="button" onClick={() => setShowPw(s => ({ ...s, current: !s.current }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                      {showPw.current ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">New Password</label>
                  <div className="relative">
                    <input
                      type={showPw.new ? 'text' : 'password'}
                      value={pwForm.new_password}
                      onChange={(e) => setPwForm(f => ({ ...f, new_password: e.target.value }))}
                      required minLength={8}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm pr-10"
                    />
                    <button type="button" onClick={() => setShowPw(s => ({ ...s, new: !s.new }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                      {showPw.new ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  {pwForm.new_password && (
                    <div className="mt-2">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-500">Strength</span>
                        <span className={`text-xs font-medium ${
                          strength.label === 'Strong' ? 'text-success-600' :
                          strength.label === 'Medium' ? 'text-warning-600' : 'text-danger-600'
                        }`}>{strength.label}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div className={`h-full ${strength.color} transition-all`} style={{ width: strength.width }} />
                      </div>
                      <div className="mt-2 space-y-1">
                        {[
                          { test: pwForm.new_password.length >= 8, label: 'At least 8 characters' },
                          { test: /[A-Z]/.test(pwForm.new_password), label: 'One uppercase letter' },
                          { test: /[a-z]/.test(pwForm.new_password), label: 'One lowercase letter' },
                          { test: /[0-9]/.test(pwForm.new_password), label: 'One number' },
                          { test: /[^A-Za-z0-9]/.test(pwForm.new_password), label: 'One special character' },
                        ].map((rule, i) => (
                          <div key={i} className="flex items-center gap-1.5">
                            {rule.test
                              ? <CheckCircle size={12} className="text-success-500" />
                              : <XCircle size={12} className="text-gray-300" />
                            }
                            <span className={`text-xs ${rule.test ? 'text-success-600' : 'text-gray-400'}`}>{rule.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Confirm New Password</label>
                  <input
                    type={showPw.confirm ? 'text' : 'password'}
                    value={pwForm.confirm_password}
                    onChange={(e) => setPwForm(f => ({ ...f, confirm_password: e.target.value }))}
                    required
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                  {pwForm.confirm_password && pwForm.new_password !== pwForm.confirm_password && (
                    <p className="text-xs text-danger-600 mt-1">Passwords do not match</p>
                  )}
                </div>

                <button type="submit" disabled={pwLoading}
                  className="w-full py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
                  {pwLoading ? 'Changing...' : 'Change Password'}
                </button>
              </form>
            </div>
          )}

          {/* 2FA Tab */}
          {activeTab === '2fa' && (
            <div className="max-w-md">
              <div className="flex items-center gap-3 mb-6">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  twoFA.enabled ? 'bg-success-50' : 'bg-gray-100'
                }`}>
                  <Smartphone size={24} className={twoFA.enabled ? 'text-success-600' : 'text-gray-400'} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Two-Factor Authentication</h3>
                  <p className={`text-sm ${twoFA.enabled ? 'text-success-600' : 'text-gray-500'}`}>
                    {twoFA.enabled ? 'Enabled — your account is protected' : 'Not enabled'}
                  </p>
                </div>
              </div>

              {!twoFA.enabled ? (
                <>
                  {!setupData ? (
                    <div className="space-y-4">
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                        <p className="text-sm text-blue-700">
                          Two-factor authentication adds an extra layer of security. You'll need an authenticator app
                          like Google Authenticator, Authy, or 1Password.
                        </p>
                      </div>
                      <button onClick={handleSetup2FA} disabled={setupLoading}
                        className="w-full py-2 bg-primary-600 text-white rounded-lg text-sm hover:bg-primary-700 disabled:opacity-50">
                        {setupLoading ? 'Generating...' : 'Set Up 2FA'}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="bg-gray-50 rounded-lg p-4 text-center">
                        <p className="text-sm text-gray-600 mb-3">Scan this QR code with your authenticator app:</p>
                        {setupData.qrCode && (
                          <img src={setupData.qrCode} alt="2FA QR Code" className="mx-auto w-48 h-48 mb-3" />
                        )}
                        <p className="text-xs text-gray-500 mb-1">Or enter this key manually:</p>
                        <div className="flex items-center justify-center gap-2">
                          <code className="text-sm bg-white px-3 py-1 rounded border border-gray-200">{setupData.secret}</code>
                          <button onClick={() => navigator.clipboard?.writeText(setupData.secret)}
                            className="text-gray-400 hover:text-gray-600"><Copy size={14} /></button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Enter verification code from your app:</label>
                        <input type="text" value={verifyCode} onChange={(e) => setVerifyCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          placeholder="000000" maxLength={6}
                          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-center font-mono text-lg tracking-widest" />
                      </div>

                      <button onClick={handleEnable2FA} disabled={verifyLoading || verifyCode.length !== 6}
                        className="w-full py-2 bg-success-600 text-white rounded-lg text-sm hover:bg-success-700 disabled:opacity-50">
                        {verifyLoading ? 'Verifying...' : 'Verify & Enable 2FA'}
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-4">
                  <div className="bg-warning-50 border border-warning-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <AlertTriangle size={16} className="text-warning-600" />
                      <p className="text-sm font-medium text-warning-700">Disable Two-Factor Authentication</p>
                    </div>
                    <p className="text-xs text-warning-600">
                      This will make your account less secure. Enter your current 2FA code to disable.
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Current 2FA Code:</label>
                    <input type="text" value={disableCode} onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000" maxLength={6}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-center font-mono text-lg tracking-widest" />
                  </div>

                  <button onClick={handleDisable2FA} disabled={disableLoading || disableCode.length !== 6}
                    className="w-full py-2 bg-danger-600 text-white rounded-lg text-sm hover:bg-danger-700 disabled:opacity-50">
                    {disableLoading ? 'Disabling...' : 'Disable 2FA'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Security Policies Tab */}
          {activeTab === 'policies' && (
            <div className="space-y-6 max-w-2xl">
              {settingsLoading ? (
                <div className="space-y-4">
                  <Skeleton height="20px" width="200px" />
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="space-y-3">
                      <Skeleton height="16px" width="150px" />
                      <Skeleton height="16px" width="100%" />
                    </div>
                  ))}
                </div>
              ) : securitySettings && (
                <>
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Password Policy</h3>
                    <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                      {[
                        { label: 'Minimum length', value: `${securitySettings.password_policy.min_length} characters` },
                        { label: 'Require uppercase', value: securitySettings.password_policy.require_uppercase ? 'Yes' : 'No' },
                        { label: 'Require lowercase', value: securitySettings.password_policy.require_lowercase ? 'Yes' : 'No' },
                        { label: 'Require number', value: securitySettings.password_policy.require_number ? 'Yes' : 'No' },
                        { label: 'Require special character', value: securitySettings.password_policy.require_special ? 'Yes' : 'No' },
                        { label: 'Password expiry', value: `${securitySettings.password_policy.expiry_days} days` },
                      ].map((item, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">{item.label}</span>
                          <span className="text-sm font-medium text-gray-900">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Session Settings</h3>
                    <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                      {[
                        { label: 'Max concurrent sessions', value: securitySettings.session.max_sessions },
                        { label: 'Session timeout', value: `${securitySettings.session.session_timeout} minutes` },
                        { label: 'Idle timeout', value: `${securitySettings.session.idle_timeout} minutes` },
                      ].map((item, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">{item.label}</span>
                          <span className="text-sm font-medium text-gray-900">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Login Security</h3>
                    <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                      {[
                        { label: 'Max failed attempts before lock', value: securitySettings.login.max_failed_attempts },
                        { label: 'Lockout duration', value: `${securitySettings.login.lockout_duration} minutes` },
                        { label: 'Require 2FA for all users', value: securitySettings.login.require_2fa ? 'Yes' : 'No' },
                        { label: 'IP whitelist enabled', value: securitySettings.login.ip_whitelist_enabled ? 'Yes' : 'No' },
                      ].map((item, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">{item.label}</span>
                          <span className="text-sm font-medium text-gray-900">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-gray-900 mb-3">Encryption</h3>
                    <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">API key format</span>
                        <span className="text-sm font-medium text-gray-900">{securitySettings.encryption.api_key_format}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">Webhook signing</span>
                        <span className="text-sm font-medium text-gray-900">{securitySettings.encryption.webhook_signing}</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-sm text-blue-700">
                      Security policy editing (IP whitelisting, enforce 2FA, session controls) will be available in Phase 5.
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
