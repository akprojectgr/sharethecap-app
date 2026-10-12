import React from 'react';

export default function TopBar({ guestData, onLogout }) {
  const displayName = guestData?.name || 'Guest';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <div style={styles.topBar}>
      <div style={styles.container}>
        {/* Logo - Left */}
        <div style={styles.logoSection}>
          <img 
            src="/logo2.webp" 
            alt="Klev Logo" 
            className="top-bar-logo"
            style={styles.logo}
          />
        </div>

        {/* Center - Empty or can add event name */}
        <div style={styles.centerSection}>
          {/* Empty for now, clean minimal look */}
        </div>

        {/* Right - User & Logout */}
        <div style={styles.rightSection}>
          {/* User Info Chip */}
          <div className="user-chip" style={styles.userChip}>
            {guestData?.avatar ? (
              <img 
                src={guestData.avatar} 
                alt="Avatar"
                className="avatar-small"
                style={styles.avatarSmall}
              />
            ) : (
              <div className="avatar-small" style={styles.avatarSmall}>
                {initial}
              </div>
            )}
            <span className="user-name" style={styles.userName}>{displayName}</span>
          </div>

          {/* Logout Button */}
          <button 
            onClick={onLogout}
            className="logout-btn"
            style={styles.logoutBtn}
            title="Logout"
          >
            <svg 
              width="18" 
              height="18" 
              viewBox="0 0 24 24" 
              fill="none" 
              xmlns="http://www.w3.org/2000/svg"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path 
                d="M18.36 6.64a9 9 0 1 1-12.73 0" 
                stroke="currentColor"
              />
              <line 
                x1="12" 
                y1="2" 
                x2="12" 
                y2="12" 
                stroke="currentColor"
              />
            </svg>
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideDown {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes glow {
          0%, 100% {
            box-shadow: 0 0 20px rgba(192, 158, 93, 0.3);
          }
          50% {
            box-shadow: 0 0 30px rgba(192, 158, 93, 0.6);
          }
        }
      `}</style>
    </div>
  );
}

const styles = {
  topBar: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    height: '65px',
    // Στα notch/Dynamic Island κινητά, χωρίς αυτό το padding το bar θα
    // "χωνόταν" κάτω από το status bar/notch (viewport-fit=cover στο
    // index.html κάνει το env() να επιστρέφει πραγματική τιμή αντί για 0).
    paddingTop: 'env(safe-area-inset-top, 0px)',
    boxSizing: 'content-box',
    background: 'rgba(10, 22, 40, 0.98)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderBottom: '1px solid rgba(192, 158, 93, 0.15)',
    zIndex: 1000,
    animation: 'slideDown 0.6s cubic-bezier(0.4, 0, 0.2, 1)',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)'
  },

  container: {
    maxWidth: '1400px',
    margin: '0 auto',
    height: '65px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 16px',
    gap: '12px',
    boxSizing: 'border-box'
  },

  // Logo Section - Left
  logoSection: {
    display: 'flex',
    alignItems: 'center'
  },

  logo: {
    height: '40px',
    width: 'auto',
    filter: 'drop-shadow(0 0 12px rgba(192, 158, 93, 0.4))',
    transition: 'all 0.3s ease'
  },

  // Center Section
  centerSection: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },

  // Right Section
  rightSection: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    minWidth: 0,
    flex: '1 1 auto',
    justifyContent: 'flex-end'
  },

  // User Chip
  userChip: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 16px 8px 8px',
    background: 'rgba(255, 255, 255, 0.03)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderRadius: '12px',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    cursor: 'default',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
    minWidth: 0,
    flex: '0 1 auto',
    boxSizing: 'border-box'
  },

  avatarSmall: {
    width: '34px',
    height: '34px',
    minWidth: '34px',
    borderRadius: '10px',
    objectFit: 'cover',
    background: 'linear-gradient(135deg, #c09e5d 0%, #d4af37 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'white',
    fontSize: '15px',
    fontWeight: '700',
    border: 'none',
    boxShadow: '0 2px 8px rgba(192, 158, 93, 0.3), inset 0 -2px 4px rgba(0, 0, 0, 0.1)',
    flexShrink: 0
  },

  userName: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: '14px',
    fontWeight: '600',
    letterSpacing: '0.3px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    minWidth: 0,
    maxWidth: '32vw'
  },

  // Logout Button
  logoutBtn: {
    width: '40px',
    height: '40px',
    minWidth: '40px',
    borderRadius: '12px',
    background: 'rgba(255, 255, 255, 0.03)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    padding: 0,
    color: 'rgba(255, 255, 255, 0.7)',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
    position: 'relative',
    overflow: 'hidden',
    flexShrink: 0
  }
};