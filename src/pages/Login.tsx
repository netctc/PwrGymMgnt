import React, { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dumbbell } from 'lucide-react';
import { toast } from 'sonner';

type LoginMode = 'login' | 'forgot_password' | 'confirm_reset';

export default function Login() {
  const { user, loginState, signInWithGoogle } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<LoginMode>('login');
  const [newPassword, setNewPassword] = useState('');
  const [resetToken, setResetToken] = useState('');

  useEffect(() => {
    if (user) {
      // The redirect is handled in AuthContext after loadProfile now for standard route
    }
  }, [user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tokenFromUrl = params.get('resetToken') || params.get('token');
    if (tokenFromUrl) {
      setResetToken(tokenFromUrl);
      setMode('confirm_reset');
    }
  }, []);

  const validatePasswordComplexity = (pwd: string) => {
    // 8 characters, 1 number, 1 special char
    const regex = /^(?=.*[0-9])(?=.*[!@#$%^&*()[\]{}\\|;:'",.<>/?_=\-+`~]).{8,}$/;
    return regex.test(pwd);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Email and password required.');
      return;
    }

    if (!validatePasswordComplexity(password)) {
      toast.error('Password must be at least 8 characters long and contain at least one number and one special character.');
      return;
    }
    
    setLoading(true);
    try {
      await loginState(email, password);
      // Navigation is handled inside loginState via window.location.href
    } catch (error: any) {
       toast.error(error.message || 'Failed to sign in.');
       setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error('Email is required.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/password-reset/request', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to request password reset');

      const previewToken = data?.deliveryPreview?.token;
      if (previewToken) {
        setResetToken(previewToken);
        toast.info('Development reset token was filled automatically.');
      } else {
        setResetToken('');
      }
      toast.success(data.message || 'Password reset instructions sent.');
      setMode('confirm_reset');
    } catch (error: any) {
       toast.error(error.message || 'Error requesting password reset.');
    } finally {
       setLoading(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetToken || !newPassword) {
      toast.error('Reset token and new password are required.');
      return;
    }

    if (!validatePasswordComplexity(newPassword)) {
      toast.error('New password must be at least 8 characters long and contain at least one number and one special character.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/password-reset/confirm', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({ token: resetToken, newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reset password');
      
      toast.success(data.message || 'Password updated successfully. Please login.');
      setPassword('');
      setNewPassword('');
      setResetToken('');
      setMode('login');
    } catch (error: any) {
       toast.error(error.message || 'Error resetting password.');
    } finally {
       setLoading(false);
    }
  };

  const goToLogin = () => {
    setMode('login');
    setNewPassword('');
    setResetToken('');
  };

  const title = mode === 'login' ? 'Authentication Required' : mode === 'forgot_password' ? 'Request Password Reset' : 'Confirm Password Reset';

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-xl border-slate-200">
        <CardHeader className="text-center pb-6 border-b border-slate-100">
          <div className="w-16 h-16 bg-indigo-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Dumbbell className="w-8 h-8 text-indigo-600" />
          </div>
          <CardTitle className="text-2xl font-bold text-slate-800">FitAdmin Systems</CardTitle>
          <CardDescription className="text-slate-500 mt-2">
            {title}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6 pb-8 px-8">
          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">Email</Label>
                <Input 
                  id="login-email" 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  required 
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="login-password">Password</Label>
                  <button type="button" onClick={() => setMode('forgot_password')} className="text-xs text-indigo-600 hover:underline">Forgot password?</button>
                </div>
                <Input 
                  id="login-password" 
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required 
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700">
                {loading ? 'Processing...' : 'Sign In'}
              </Button>
              
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-white px-2 text-slate-500">Or continue with</span>
                </div>
              </div>

              <Button 
                type="button" 
                variant="outline" 
                className="w-full"
                onClick={signInWithGoogle}
              >
                <svg className="mr-2 h-4 w-4" aria-hidden="true" focusable="false" data-prefix="fab" data-icon="google" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 488 512">
                  <path fill="currentColor" d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"></path>
                </svg>
                Sign in with Google
              </Button>
            </form>
          ) : mode === 'forgot_password' ? (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <p className="text-sm text-slate-600">
                Enter your email. If an admin account exists, a reset token or link will be delivered through the configured channel.
              </p>
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email</Label>
                <Input 
                  id="reset-email" 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@example.com"
                  required 
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700">
                {loading ? 'Processing...' : 'Send Reset Instructions'}
              </Button>
              <div className="text-center mt-4">
                 <button type="button" onClick={goToLogin} className="text-sm text-slate-500 hover:text-slate-800">
                   Back to Login
                 </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleConfirmReset} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-token">Reset Token</Label>
                <Input 
                  id="reset-token" 
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  placeholder="Paste reset token"
                  required 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input 
                  id="new-password" 
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  required 
                />
              </div>
              <Button type="submit" disabled={loading} className="w-full bg-indigo-600 hover:bg-indigo-700">
                {loading ? 'Processing...' : 'Reset Password'}
              </Button>
              <div className="flex justify-center gap-4 mt-4 text-sm">
                 <button type="button" onClick={() => setMode('forgot_password')} className="text-slate-500 hover:text-slate-800">
                   Request New Token
                 </button>
                 <button type="button" onClick={goToLogin} className="text-slate-500 hover:text-slate-800">
                   Back to Login
                 </button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
