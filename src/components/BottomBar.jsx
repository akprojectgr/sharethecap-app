import React from 'react';

export default function BottomBar({ activeTab, onTabChange, onUploadClick }) {
  const isHomeActive = activeTab === 'home';
  const isProfileActive = activeTab === 'profile';

  return (
    <div style={styles.navBar}>
      {/* Photos / Feed Tab */}
      <button 
        style={styles.navItem}
        onClick={() => onTabChange('home')}
        title="Ροή Φωτογραφιών"
      >
        <svg 
          style={{ ...styles.tabSvgIcon, fill: isHomeActive ? '#D9B54A' : 'rgba(255,255,255,0.5)' }} 
          viewBox="0 0 24 24"
        >
          <path d="M3 3h7v7H3V3zm11 0h7v7h-7V3zm0 11h7v7h-7v-7zm-11 0h7v7H3v-7z"/>
        </svg>
      </button>

      {/* Κεντρικό Κουμπί Μεταφόρτωσης (Καθαρό Logo) */}
      <div style={styles.uploadBtnContainer}>
        <button 
          style={styles.uploadBtn}
          onClick={onUploadClick}
          aria-label="Upload photo"
        >
          <img src="/test.svg" alt="Upload" style={styles.svgIcon} />
        </button>
      </div>

      {/* Προφίλ Tab */}
      <button 
        style={styles.navItem}
        onClick={() => onTabChange('profile')}
        title="Προφίλ"
      >
        <svg 
          style={{ ...styles.tabSvgIcon, fill: isProfileActive ? '#D9B54A' : 'rgba(255,255,255,0.5)' }} 
          viewBox="0 0 24 24"
        >
          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
        </svg>
      </button>
    </div>
  );
}

const styles = {
  navBar: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    height: '66px',
    background: '#070E18',
    borderTop: '1px solid rgba(217, 181, 74, 0.2)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-around',
    padding: '0 16px',
    zIndex: 9999,
    boxShadow: '0 -10px 25px rgba(0,0,0,0.5)'
  },
  navItem: {
    background: 'none',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flex: 1,
    height: '100%',
    padding: 0
  },
  tabSvgIcon: {
    width: '24px',
    height: '24px',
    transition: 'fill 0.2s ease, transform 0.2s ease'
  },
  uploadBtnContainer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    top: '-6px',
    flex: 1
  },
  uploadBtn: {
    background: 'none',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: 0,
    transition: 'transform 0.1s ease',
    outline: 'none'
  },
  svgIcon: {
    width: '68px',
    height: '52px',
    objectFit: 'contain',
    display: 'block',
    filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.4))'
  }
};