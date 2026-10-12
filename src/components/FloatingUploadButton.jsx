import React from 'react';

export default function FloatingUploadButton({ onClick, uploading }) {
  return (
    <button
      onClick={onClick}
      disabled={uploading}
      style={{
        position: 'fixed',
        left: '50%',
        transform: 'translateX(-50%)',
        bottom: '22px',
        zIndex: 60,
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        background: 'rgba(255,255,255,0.06)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        color: '#F0D27A',
        fontWeight: 700,
        fontSize: '14px',
        border: '1.5px solid rgba(217, 181, 74, 0.75)',
        borderRadius: '9999px',
        padding: '12px 24px',
        cursor: uploading ? 'default' : 'pointer',
        opacity: uploading ? 0.7 : 1,
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)'
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F0D27A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13.5" r="3.6" />
      </svg>
      {uploading ? 'Ανεβαίνει…' : 'Add Photos'}
    </button>
  );
}