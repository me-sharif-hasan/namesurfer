// pages/login.js - Google Sign-In for all users
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { signInWithPopup } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase';
import styles from '../styles/Admin.module.css';

export default function Login() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  useEffect(() => {
    // Check if already logged in
    const unsubscribe = auth.onAuthStateChanged((user) => {
      if (user) {
        // Check if there's pending subdomain data - redirect to home to process it
        const pendingData = sessionStorage.getItem('pendingSubdomain');
        if (pendingData) {
          router.push('/');
        } else {
          router.push('/dashboard');
        }
      }
    });
    
    return () => unsubscribe();
  }, [router]);
  
  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);
    
    try {
      await signInWithPopup(auth, googleProvider);
      // Will redirect via useEffect
    } catch (err) {
      setError('Failed to sign in with Google. Please try again.');
      console.error('Login error:', err);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <>
      <Head>
        <title>Sign In - OpenSubdomain</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      
      <div className={styles.loginContainer}>
        <div className={`${styles.loginCard} glass`}>
          <h1 className={styles.loginTitle}>
            Sign In to <span className="gradient-text">OpenSubdomain</span>
          </h1>
          
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', textAlign: 'center' }}>
            Manage your subdomains with ease
          </p>
          
          <button
            onClick={handleGoogleSignIn}
            className={styles.loginButton}
            disabled={loading}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.75rem'
            }}
          >
            {loading ? (
              <div className="spinner"></div>
            ) : (
              <>
                <svg width="20" height="20" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Sign in with Google
              </>
            )}
          </button>
          
          {error && (
            <div style={{ color: 'var(--error)', fontSize: '0.875rem', textAlign: 'center', marginTop: '1rem' }}>
              {error}
            </div>
          )}
          
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
