// pages/admin/login.js - Admin login page
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import styles from '../../styles/Admin.module.css';

export default function AdminLogin() {
  const router = useRouter();
  const [formData, setFormData] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    // Check if already logged in
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        router.push('/admin');
      }
    });
    
    return () => unsubscribe();
  }, [router]);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    
    try {
      await signInWithEmailAndPassword(auth, formData.email, formData.password);
      router.push('/admin');
    } catch (err) {
      setError('Invalid credentials. Please try again.');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <>
      <Head>
        <title>Admin Login - OpenSubdomain</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      
      <div className={styles.loginContainer}>
        <div className={`${styles.loginCard} glass`}>
          <h1 className={styles.loginTitle}>
            Admin <span className="gradient-text">Login</span>
          </h1>
          
          <form className={styles.loginForm} onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label">Email</label>
              <input
                type="email"
                className="form-input"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                required
                disabled={loading}
              />
            </div>
            
            <div className="form-group">
              <label className="form-label">Password</label>
              <input
                type="password"
                className="form-input"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                required
                disabled={loading}
              />
            </div>
            
            {error && (
              <div style={{ color: 'var(--error)', fontSize: '0.875rem', textAlign: 'center' }}>
                {error}
              </div>
            )}
            
            <button
              type="submit"
              className={styles.loginButton}
              disabled={loading}
            >
              {loading ? <div className="spinner"></div> : null}
              {loading ? 'Signing in...' : 'Sign In'}
            </button>
          </form>
          
          <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <a href="/" style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              ← Back to Home
            </a>
          </div>
        </div>
      </div>
    </>
  );
}
