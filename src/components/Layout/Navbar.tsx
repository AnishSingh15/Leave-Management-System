import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../../config/firebase';
import { useAuth } from '../../contexts/AuthContext';
import './Navbar.css';

const Navbar: React.FC = () => {
  const { userData, logout, isManager, isHRAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [pendingCount, setPendingCount] = useState(0);

  // Real-time listener for pending approval count
  useEffect(() => {
    if (!userData || (!isManager && !isHRAdmin)) {
      setPendingCount(0);
      return;
    }

    const queries: (() => void)[] = [];

    if (isHRAdmin) {
      // HR sees pending_hr requests
      const q = query(
        collection(db, 'leaves'),
        where('status', '==', 'pending_hr')
      );
      const unsub = onSnapshot(q, (snap) => {
        setPendingCount(snap.size);
      });
      queries.push(unsub);
    } else if (isManager) {
      // Manager sees pending_manager requests assigned to them
      const q = query(
        collection(db, 'leaves'),
        where('managerId', '==', userData.uid),
        where('status', '==', 'pending_manager')
      );
      const unsub = onSnapshot(q, (snap) => {
        setPendingCount(snap.size);
      });
      queries.push(unsub);
    }

    return () => queries.forEach((unsub) => unsub());
  }, [userData, isManager, isHRAdmin]);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const isActive = (path: string) => location.pathname === path;

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <Link to="/dashboard">
          <h1>LAMS</h1>
        </Link>
      </div>
      
      <div className="navbar-menu">
        <Link 
          to="/dashboard" 
          className={`nav-link ${isActive('/dashboard') ? 'active' : ''}`}
        >
          Dashboard
        </Link>
        
        <Link 
          to="/apply-leave" 
          className={`nav-link ${isActive('/apply-leave') ? 'active' : ''}`}
        >
          Apply Leave
        </Link>
        
        <Link 
          to="/my-leaves" 
          className={`nav-link ${isActive('/my-leaves') ? 'active' : ''}`}
        >
          My Leaves
        </Link>
        
        {(isManager || isHRAdmin) && (
          <Link 
            to="/approvals" 
            className={`nav-link ${isActive('/approvals') ? 'active' : ''}`}
          >
            Approvals
            {pendingCount > 0 && (
              <span className="nav-badge">{pendingCount}</span>
            )}
          </Link>
        )}
        
        {(isManager || isHRAdmin) && (
          <Link 
            to="/admin" 
            className={`nav-link ${isActive('/admin') ? 'active' : ''}`}
          >
            Admin
          </Link>
        )}
      </div>
      
      <div className="navbar-user">
        <div className="user-info">
          <span className="user-name">{userData?.name}</span>
          <span className="user-role">{userData?.role.replace('_', ' ').toUpperCase()}</span>
        </div>
        <button onClick={handleLogout} className="logout-button">
          Logout
        </button>
      </div>
    </nav>
  );
};

export default Navbar;
