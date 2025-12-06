// pages/admin/index.js - Admin dashboard
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { signOut } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import SubdomainTable from '../../components/SubdomainTable';
import styles from '../../styles/Admin.module.css';

export default function AdminDashboard() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [authToken, setAuthToken] = useState(null);
  const [subdomains, setSubdomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  
  useEffect(() => {
    // Check authentication
    const unsubscribe = auth.onAuthStateChanged(async (user) => {
      if (user) {
        setUser(user);
        const token = await user.getIdToken();
        setAuthToken(token);
      } else {
        router.push('/admin/login');
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
  
  const handleApprove = async (id) => {
    try {
      const res = await fetch(`/api/subdomains/${id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: 'approved' })
      });
      
      if (res.ok) {
        await fetchSubdomains();
      } else {
        const data = await res.json();
        alert(`Failed to approve: ${data.error}`);
      }
    } catch (err) {
      alert('Failed to approve subdomain');
      console.error(err);
    }
  };
  
  const handleReject = async (id) => {
    try {
      const res = await fetch(`/api/subdomains/${id}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: 'rejected' })
      });
      
      if (res.ok) {
        await fetchSubdomains();
      } else {
        const data = await res.json();
        alert(`Failed to reject: ${data.error}`);
      }
    } catch (err) {
      alert('Failed to reject subdomain');
      console.error(err);
    }
  };
  
  const handleDelete = async (id) => {
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
      router.push('/admin/login');
    } catch (err) {
      console.error('Logout error:', err);
    }
  };
  
  const filteredSubdomains = filter === 'all'
    ? subdomains
    : subdomains.filter(sub => sub.status === filter);
  
  if (!user) {
    return <div className={styles.loading}><div className="spinner"></div></div>;
  }
  
  return (
    <>
      <Head>
        <title>Admin Dashboard - OpenSubdomain</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      
      <div className={`${styles.container} container`}>
        <div className={styles.header}>
          <h1 className={styles.title}>
            Admin <span className="gradient-text">Dashboard</span>
          </h1>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              {user.email}
            </span>
            <button onClick={handleLogout} className={styles.logoutButton}>
              Logout
            </button>
          </div>
        </div>
        
        <div className={`${styles.filters} glass`}>
          <span style={{ color: 'var(--text-secondary)', fontWeight: '500' }}>Filter:</span>
          <button
            className={`${styles.filterButton} ${filter === 'all' ? styles.filterButtonActive : ''}`}
            onClick={() => setFilter('all')}
          >
            All ({subdomains.length})
          </button>
          <button
            className={`${styles.filterButton} ${filter === 'pending' ? styles.filterButtonActive : ''}`}
            onClick={() => setFilter('pending')}
          >
            Pending ({subdomains.filter(s => s.status === 'pending').length})
          </button>
          <button
            className={`${styles.filterButton} ${filter === 'approved' ? styles.filterButtonActive : ''}`}
            onClick={() => setFilter('approved')}
          >
            Approved ({subdomains.filter(s => s.status === 'approved').length})
          </button>
          <button
            className={`${styles.filterButton} ${filter === 'rejected' ? styles.filterButtonActive : ''}`}
            onClick={() => setFilter('rejected')}
          >
            Rejected ({subdomains.filter(s => s.status === 'rejected').length})
          </button>
          <button
            onClick={fetchSubdomains}
            className="btn btn-secondary"
            style={{ marginLeft: 'auto' }}
          >
            🔄 Refresh
          </button>
        </div>
        
        <SubdomainTable
          subdomains={filteredSubdomains}
          onApprove={handleApprove}
          onReject={handleReject}
          onDelete={handleDelete}
          loading={loading}
        />
      </div>
    </>
  );
}
