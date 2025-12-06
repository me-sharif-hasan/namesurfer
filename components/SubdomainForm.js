// components/SubdomainForm.js - Subdomain request form component (requires auth)
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { auth } from '../lib/firebase';
import styles from '../styles/Home.module.css';

export default function SubdomainForm() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    subdomainName: '',
    targetUrl: '',
    recordType: 'A'
  });
  
  const [availability, setAvailability] = useState(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authToken, setAuthToken] = useState(null);
  
  const parentDomain = process.env.NEXT_PUBLIC_PARENT_DOMAIN || 'example.com';
  
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        const token = await user.getIdToken();
        setAuthToken(token);
      }
    });
    
    return () => unsubscribe();
  }, []);
  
  // Debounced availability check
  useEffect(() => {
    if (!formData.subdomainName || formData.subdomainName.length < 3) {
      setAvailability(null);
      return;
    }
    
    const timer = setTimeout(async () => {
      setChecking(true);
      try {
        const res = await fetch(`/api/subdomains/check?name=${encodeURIComponent(formData.subdomainName)}`);
        const data = await res.json();
        setAvailability(data);
      } catch (err) {
        console.error('Availability check failed:', err);
      } finally {
        setChecking(false);
      }
    }, 500);
    
    return () => clearTimeout(timer);
  }, [formData.subdomainName]);
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!authToken) {
      router.push('/login');
      return;
    }
    
    setError('');
    setSuccess(false);
    setLoading(true);
    
    try {
      const res = await fetch('/api/subdomains', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify(formData)
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || 'Failed to submit request');
      }
      
      setSuccess(true);
      setFormData({
        subdomainName: '',
        targetUrl: '',
        recordType: 'A'
      });
      setAvailability(null);
      
      // Redirect to dashboard after 2 seconds
      setTimeout(() => {
        router.push('/dashboard');
      }, 2000);
      
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className={`${styles.formCard} glass`}>
      <h2 className={styles.formTitle}>Create Your Subdomain</h2>
      <p style={{ color: 'var(--text-muted)', textAlign: 'center', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
        Your subdomain will be activated instantly!
      </p>
      
      <form onSubmit={handleSubmit}>
        <div className={styles.inputGroup}>
          <label className="form-label">Subdomain Name</label>
          <div className={styles.inputWrapper}>
            <input
              type="text"
              className={`${styles.input} ${styles.inputWithPrefix} ${
                availability?.available ? styles.inputSuccess :
                availability?.available === false ? styles.inputError : ''
              }`}
              value={formData.subdomainName}
              onChange={(e) => setFormData({ ...formData, subdomainName: e.target.value.toLowerCase() })}
              placeholder="mysubdomain"
              required
            />
            <span className={styles.inputPrefix}>.{parentDomain}</span>
          </div>
          {checking && (
            <div className={`${styles.availabilityMessage} ${styles.availabilityAvailable}`}>
              Checking...
            </div>
          )}
          {availability && !checking && (
            <div className={`${styles.availabilityMessage} ${
              availability.available ? styles.availabilityAvailable : styles.availabilityTaken
            }`}>
              {availability.available ? '✓ Available' : '✗ ' + availability.reason}
            </div>
          )}
        </div>
        
        <div className={styles.inputGroup}>
          <label className="form-label">Record Type</label>
          <select
            className={styles.select}
            value={formData.recordType}
            onChange={(e) => setFormData({ ...formData, recordType: e.target.value })}
          >
            <option value="A">A Record (IP Address)</option>
            <option value="CNAME">CNAME (Domain)</option>
          </select>
        </div>
        
        <div className={styles.inputGroup}>
          <label className="form-label">
            {formData.recordType === 'A' ? 'Target IP Address' : 'Target Domain'}
          </label>
          <input
            type="text"
            className={styles.input}
            value={formData.targetUrl}
            onChange={(e) => setFormData({ ...formData, targetUrl: e.target.value })}
            placeholder={formData.recordType === 'A' ? '192.168.1.1' : 'example.com'}
            required
          />
        </div>
        
        {error && (
          <div className={styles.errorMessage}>
            {error}
          </div>
        )}
        
        <button
          type="submit"
          className={styles.submitButton}
          disabled={loading || !availability?.available}
        >
          {loading && <div className="spinner"></div>}
          {loading ? 'Creating...' : 'Create Subdomain'}
        </button>
        
        {success && (
          <div className={styles.successMessage}>
            ✓ Subdomain created successfully! Redirecting to dashboard...
          </div>
        )}
      </form>
    </div>
  );
}
