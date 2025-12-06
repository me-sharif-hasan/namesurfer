// pages/dashboard.js - User dashboard to manage subdomains
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import styles from '../styles/Admin.module.css';

export default function Dashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [authToken, setAuthToken] = useState(null);
  const [subdomains, setSubdomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editTarget, setEditTarget] = useState('');
  
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        setUser(user);
        const token = await user.getIdToken();
        setAuthToken(token);
      } else {
        router.push('/login');
      }
    });
    
    return () => unsubscribe();
  }, [router]);
  
  useEffect(() => {
    if (authToken) {
      fetchSubdomains();
    }
  }, [authToken]);
  
  const fetchSubdomains = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/subdomains', {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      
      if (res.ok) {
        const data = await res.json();
        setSubdomains(data.subdomains || []);
      }
    } catch (err) {
      console.error('Failed to fetch subdomains:', err);
    } finally {
      setLoading(false);
    }
  };
  
  const handleUpdate = async (id, currentTarget) => {
    if (editingId === id) {
      // Save
      try {
        const res = await fetch(`/api/subdomains/${id}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ targetUrl: editTarget })
        });
        
        if (res.ok) {
          await fetchSubdomains();
          setEditingId(null);
          setEditTarget('');
        } else {
          const data = await res.json();
          alert(`Failed to update: ${data.error}`);
        }
      } catch (err) {
        alert('Failed to update subdomain');
        console.error(err);
      }
    } else {
      // Start editing
      setEditingId(id);
      setEditTarget(currentTarget);
    }
  };
  
  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this subdomain? This will also remove the DNS record.')) {
      return;
    }
    
    try {
      const res = await fetch(`/api/subdomains/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      
      if (res.ok) {
        await fetchSubdomains();
      } else {
        const data = await res.json();
        alert(`Failed to delete: ${data.error}`);
      }
    } catch (err) {
      alert('Failed to delete subdomain');
      console.error(err);
    }
  };
  
  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };
  
  if (!user) {
    return <div className={styles.loading}><div className="spinner"></div></div>;
  }
  
  const isAdmin = user.email === 'me.sharif.hasan@gmail.com';
  
  return (
    <>
      <Head>
        <title>My Dashboard - OpenSubdomain</title>
      </Head>
      
      <div className={`${styles.container} container`}>
        <div className={styles.header}>
          <h1 className={styles.title}>
            My <span className="gradient-text">Subdomains</span>
            {isAdmin && <span style={{ color: 'var(--warning)', fontSize: '0.875rem', marginLeft: '1rem' }}>ADMIN</span>}
          </h1>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              {user.email}
            </span>
            <a href="/" className="btn btn-secondary">Home</a>
            <button onClick={handleLogout} className={styles.logoutButton}>
              Logout
            </button>
          </div>
        </div>
        
        <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
          <a href="/#request-form" className="btn btn-primary" style={{ fontSize: '1rem', padding: '0.875rem 2rem' }}>
            + Create New Subdomain
          </a>
        </div>
        
        {loading ? (
          <div className={styles.loading}>
            <div className="spinner" style={{ width: '40px', height: '40px' }}></div>
          </div>
        ) : subdomains.length === 0 ? (
          <div className={styles.empty}>
            <p style={{ fontSize: '1.125rem', marginBottom: '1rem' }}>No subdomains yet</p>
            <p style={{ color: 'var(--text-muted)' }}>Create your first subdomain to get started!</p>
          </div>
        ) : (
          <div className={`${styles.tableCard} glass`}>
            <table className={styles.table}>
              <thead className={styles.tableHeader}>
                <tr>
                  <th>Subdomain</th>
                  <th>Target</th>
                  <th>Type</th>
                  <th>DNS Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody className={styles.tableBody}>
                {subdomains.map((sub) => (
                  <tr key={sub.id}>
                    <td>
                      <span className={styles.subdomainName}>
                        {sub.subdomainName}.{process.env.NEXT_PUBLIC_PARENT_DOMAIN}
                      </span>
                    </td>
                    <td>
                      {editingId === sub.id ? (
                        <input
                          type="text"
                          value={editTarget}
                          onChange={(e) => setEditTarget(e.target.value)}
                          className="form-input"
                          style={{ maxWidth: '200px', padding: '0.375rem 0.5rem' }}
                        />
                      ) : (
                        <code style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                          {sub.targetUrl}
                        </code>
                      )}
                    </td>
                    <td>
                      <span className="badge badge-pending">{sub.recordType}</span>
                    </td>
                    <td>
                      <div className={styles.dnsStatus}>
                        {sub.dnsCreated ? (
                          <span className={styles.dnsCreated}>✓ Active</span>
                        ) : (
                          <span className={styles.dnsFailed}>✗ Failed</span>
                        )}
                      </div>
                    </td>
                    <td style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                      {new Date(sub.createdAt).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </td>
                    <td>
                      <div className={styles.actions}>
                        <button
                          className={`${styles.actionButton} ${editingId === sub.id ? styles.approveButton : styles.filterButton}`}
                          onClick={() => handleUpdate(sub.id, sub.targetUrl)}
                        >
                          {editingId === sub.id ? 'Save' : 'Edit'}
                        </button>
                        {editingId === sub.id && (
                          <button
                            className={`${styles.actionButton} ${styles.filterButton}`}
                            onClick={() => {
                              setEditingId(null);
                              setEditTarget('');
                            }}
                          >
                            Cancel
                          </button>
                        )}
                        <button
                          className={`${styles.actionButton} ${styles.deleteButton}`}
                          onClick={() => handleDelete(sub.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
