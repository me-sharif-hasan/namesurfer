// components/SubdomainTable.js - Admin table component
import { useState } from 'react';
import styles from '../styles/Admin.module.css';

export default function SubdomainTable({ subdomains, onApprove, onReject, onDelete, loading }) {
  const [actionLoading, setActionLoading] = useState({});
  
  const handleAction = async (id, action, fn) => {
    setActionLoading({ ...actionLoading, [id]: action });
    try {
      await fn(id);
    } finally {
      setActionLoading({ ...actionLoading, [id]: null });
    }
  };
  
  const formatDate = (timestamp) => {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };
  
  if (loading) {
    return (
      <div className={styles.loading}>
        <div className="spinner" style={{ width: '40px', height: '40px' }}></div>
      </div>
    );
  }
  
  if (subdomains.length === 0) {
    return (
      <div className={styles.empty}>
        No subdomains found
      </div>
    );
  }
  
  return (
    <div className={styles.tableCard}>
      <table className={styles.table}>
        <thead className={styles.tableHeader}>
          <tr>
            <th>Subdomain</th>
            <th>Email</th>
            <th>Target</th>
            <th>Type</th>
            <th>Status</th>
            <th>DNS</th>
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
              <td>{sub.userEmail}</td>
              <td>
                <code style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                  {sub.targetUrl}
                </code>
              </td>
              <td>
                <span className="badge badge-pending">{sub.recordType}</span>
              </td>
              <td>
                <span className={`badge badge-${sub.status}`}>
                  {sub.status}
                </span>
              </td>
              <td>
                {sub.status === 'approved' && (
                  <div className={styles.dnsStatus}>
                    {sub.dnsCreated ? (
                      <span className={styles.dnsCreated}>✓ Created</span>
                    ) : (
                      <>
                        <span className={styles.dnsFailed}>✗ Failed</span>
                        {sub.dnsError && (
                          <div className={styles.dnsError}>{sub.dnsError}</div>
                        )}
                      </>
                    )}
                  </div>
                )}
                {sub.status !== 'approved' && '-'}
              </td>
              <td style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                {formatDate(sub.createdAt)}
              </td>
              <td>
                <div className={styles.actions}>
                  {sub.status === 'pending' && (
                    <>
                      <button
                        className={`${styles.actionButton} ${styles.approveButton}`}
                        onClick={() => handleAction(sub.id, 'approve', onApprove)}
                        disabled={actionLoading[sub.id]}
                      >
                        {actionLoading[sub.id] === 'approve' ? (
                          <div className="spinner" style={{ width: '12px', height: '12px' }}></div>
                        ) : 'Approve'}
                      </button>
                      <button
                        className={`${styles.actionButton} ${styles.rejectButton}`}
                        onClick={() => handleAction(sub.id, 'reject', onReject)}
                        disabled={actionLoading[sub.id]}
                      >
                        {actionLoading[sub.id] === 'reject' ? (
                          <div className="spinner" style={{ width: '12px', height: '12px' }}></div>
                        ) : 'Reject'}
                      </button>
                    </>
                  )}
                  <button
                    className={`${styles.actionButton} ${styles.deleteButton}`}
                    onClick={() => {
                      if (confirm('Are you sure you want to delete this subdomain?')) {
                        handleAction(sub.id, 'delete', onDelete);
                      }
                    }}
                    disabled={actionLoading[sub.id]}
                  >
                    {actionLoading[sub.id] === 'delete' ? (
                      <div className="spinner" style={{ width: '12px', height: '12px' }}></div>
                    ) : 'Delete'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
