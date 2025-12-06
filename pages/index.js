// pages/index.js - Landing page with strong CTA
import { useState, useEffect } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { auth } from '../lib/firebase';
import SubdomainForm from '../components/SubdomainForm';
import styles from '../styles/Home.module.css';

export default function Home() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const parentDomain = process.env.NEXT_PUBLIC_PARENT_DOMAIN || 'example.com';
  
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      setUser(user);
    });
    
    return () => unsubscribe();
  }, []);
  
  return (
    <>
      <Head>
        <title>OpenSubdomain - Free Subdomain Service</title>
        <meta name="description" content="Get your free subdomain instantly. Fast, reliable, and easy to use." />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main className={styles.hero}>
        <div className={styles.heroBackground}></div>
        
        <div className="container">
          <div className={styles.heroContent}>
            {/* Navigation */}
            <div style={{ position: 'absolute', top: '2rem', right: '2rem', display: 'flex', gap: '1rem' }}>
              {user ? (
                <>
                  <a href="/dashboard" className="btn btn-secondary">
                    Dashboard
                  </a>
                  <button 
                    onClick={async () => {
                      await auth.signOut();
                      router.push('/');
                    }}
                    className="btn btn-secondary"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <a href="/login" className="btn btn-primary">
                  Sign In
                </a>
              )}
            </div>
            
            <h1 className={styles.heroTitle}>
              Get Your Free <span className="gradient-text">Subdomain</span> in Seconds
            </h1>
            <p className={styles.heroSubtitle}>
              Claim your personalized subdomain on <strong>{parentDomain}</strong>. 
              Instant activation, automatic DNS setup, completely free.
            </p>
            
            {/* Strong CTA */}
            {!user && (
              <div style={{ marginBottom: '2rem' }}>
                <a 
                  href="/login" 
                  className="btn btn-primary" 
                  style={{ 
                    fontSize: '1.25rem', 
                    padding: '1rem 3rem',
                    display: 'inline-block'
                  }}
                >
                  Get Started Free →
                </a>
                <p style={{ marginTop: '0.75rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                  No credit card required • Instant setup
                </p>
              </div>
            )}
            
            {/* Subdomain Request Form (for logged-in users) */}
            {user && (
              <div id="request-form">
                <SubdomainForm />
              </div>
            )}
            
            {/* Features */}
            <div className={styles.features}>
              <div className={`${styles.featureCard} glass fade-in`}>
                <div className={styles.featureIcon}>⚡</div>
                <h3 className={styles.featureTitle}>Instant Activation</h3>
                <p className={styles.featureDesc}>
                  Your subdomain is active immediately - no waiting for approval
                </p>
              </div>
              
              <div className={`${styles.featureCard} glass fade-in`}>
                <div className={styles.featureIcon}>🤖</div>
                <h3 className={styles.featureTitle}>Automatic DNS</h3>
                <p className={styles.featureDesc}>
                  PowerDNS integration creates DNS records automatically
                </p>
              </div>
              
              <div className={`${styles.featureCard} glass fade-in`}>
                <div className={styles.featureIcon}>🎯</div>
                <h3 className={styles.featureTitle}>Easy Management</h3>
                <p className={styles.featureDesc}>
                  Update or delete your subdomains anytime from your dashboard
                </p>
              </div>
            </div>
            
            {/* Social Proof / Stats */}
            <div style={{ marginTop: '4rem', textAlign: 'center' }}>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                Trusted by developers worldwide • Powered by PowerDNS
              </p>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
