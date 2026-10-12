import React, { useState } from 'react';

export default function GuestSignIn({ onContinue, onLogin, onCreateAccount }) {
  const [guestName, setGuestName] = useState('');
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarFile, setAvatarFile] = useState(null);

  const handleAvatarChange = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('image/')) {
      setAvatarFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleContinue = () => {
    if (guestName.trim()) {
      onContinue({ name: guestName, avatar: avatarFile });
    }
  };

  return (
    <div style={styles.container}>
      {/* Animated Background Particles */}
      <div style={styles.particlesContainer}>
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            style={{
              ...styles.particle,
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 3}s`,
              animationDuration: `${3 + Math.random() * 4}s`
            }}
          />
        ))}
      </div>

      <div style={styles.content}>
        {/* Logo */}
        <div style={styles.logoContainer}>
          <img 
            src="/logo.webp" 
            alt="Klev Logo" 
            style={styles.logo} 
          />
        </div>

        {/* Header */}
        <h2 style={styles.headerText}>
          Welcome to the <span style={styles.highlight}>Party!</span>
        </h2>
        <p style={styles.subText}>
          Enter your name to continue as guest
        </p>

        {/* Avatar Upload */}
        <div style={styles.avatarSection}>
          <label htmlFor="avatar-upload" style={styles.avatarLabel}>
            <div style={styles.avatarCircle}>
              {avatarPreview ? (
                <img src={avatarPreview} alt="Avatar" style={styles.avatarImage} />
              ) : (
                <div style={styles.avatarPlaceholder}>
                  <svg 
                    width="48" 
                    height="48" 
                    viewBox="0 0 24 24" 
                    fill="none" 
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path 
                      d="M12 12C14.21 12 16 10.21 16 8C16 5.79 14.21 4 12 4C9.79 4 8 5.79 8 8C8 10.21 9.79 12 12 12ZM12 14C9.33 14 4 15.34 4 18V20H20V18C20 15.34 14.67 14 12 14Z" 
                      fill="rgba(192, 158, 93, 0.5)"
                    />
                  </svg>
                  <div style={styles.cameraIcon}>📷</div>
                </div>
              )}
            </div>
            <p style={styles.avatarHint}>
              {avatarPreview ? 'Tap to change photo' : 'Add photo (optional)'}
            </p>
          </label>
          <input
            id="avatar-upload"
            type="file"
            accept="image/*"
            onChange={handleAvatarChange}
            style={{ display: 'none' }}
          />
        </div>

        {/* Name Input */}
        <div style={styles.inputSection}>
          <input
            type="text"
            placeholder="Enter your name"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            style={styles.nameInput}
            maxLength={30}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && guestName.trim()) {
                handleContinue();
              }
            }}
          />
        </div>

        {/* Continue Button */}
        <button
          onClick={handleContinue}
          disabled={!guestName.trim()}
          style={guestName.trim() ? styles.continueButton : styles.continueButtonDisabled}
        >
          <span style={styles.buttonContent}>
            Continue as Guest
            <span style={styles.buttonArrow}>→</span>
          </span>
        </button>

        {/* Divider */}
        <div style={styles.dividerContainer}>
          <div style={styles.dividerLine}></div>
          <span style={styles.dividerText}>OR</span>
          <div style={styles.dividerLine}></div>
        </div>

        {/* Login / Create Account Options */}
        <div style={styles.authOptions}>
          <button onClick={onLogin} style={styles.authButton}>
            LOGIN
          </button>
          <span style={styles.separator}>•</span>
          <button onClick={onCreateAccount} style={styles.authButton}>
            CREATE ACCOUNT
          </button>
        </div>
      </div>

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(180deg); }
        }

        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes pulse {
          0%, 100% { transform: scale(1); opacity: 0.6; }
          50% { transform: scale(1.05); opacity: 1; }
        }

        @keyframes glow {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.1); }
        }
      `}</style>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #0A1628 0%, #132F52 50%, #1A4478 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Manrope', sans-serif",
    padding: '20px',
    position: 'relative',
    overflow: 'hidden'
  },
  particlesContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    overflow: 'hidden'
  },
  particle: {
    position: 'absolute',
    width: '4px',
    height: '4px',
    background: 'radial-gradient(circle, rgba(192, 158, 93, 0.6), transparent)',
    borderRadius: '50%',
    animation: 'float linear infinite',
    top: '100%'
  },
  content: {
    width: '100%',
    maxWidth: '400px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    position: 'relative',
    zIndex: 1
  },
  logoContainer: {
    marginBottom: '30px',
    animation: 'fadeInUp 0.6s ease-out'
  },
  logo: {
    width: '120px',
    height: 'auto',
    filter: 'drop-shadow(0 0 20px rgba(192, 158, 93, 0.5))'
  },
  headerText: {
    fontSize: '28px',
    fontWeight: '700',
    color: 'white',
    marginBottom: '10px',
    animation: 'fadeInUp 0.6s ease-out 0.1s backwards'
  },
  highlight: {
    background: 'linear-gradient(135deg, #c09e5d 0%, #d4af37 100%)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    backgroundClip: 'text'
  },
  subText: {
    fontSize: '16px',
    color: 'rgba(255,255,255,0.7)',
    marginBottom: '40px',
    fontWeight: '400',
    animation: 'fadeInUp 0.6s ease-out 0.2s backwards'
  },
  avatarSection: {
    marginBottom: '30px',
    animation: 'fadeInUp 0.6s ease-out 0.3s backwards'
  },
  avatarLabel: {
    cursor: 'pointer',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px'
  },
  avatarCircle: {
    width: '120px',
    height: '120px',
    borderRadius: '50%',
    border: '3px solid rgba(192, 158, 93, 0.5)',
    background: 'rgba(255,255,255,0.05)',
    backdropFilter: 'blur(10px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    transition: 'all 0.3s ease',
    boxShadow: '0 0 20px rgba(192, 158, 93, 0.2)'
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover'
  },
  avatarPlaceholder: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  cameraIcon: {
    position: 'absolute',
    bottom: '-5px',
    right: '-5px',
    fontSize: '24px',
    background: 'rgba(192, 158, 93, 0.9)',
    borderRadius: '50%',
    width: '36px',
    height: '36px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '2px solid #0A1628'
  },
  avatarHint: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: '13px',
    fontWeight: '500',
    margin: 0
  },
  inputSection: {
    width: '100%',
    marginBottom: '25px',
    animation: 'fadeInUp 0.6s ease-out 0.4s backwards'
  },
  nameInput: {
    width: '100%',
    padding: '18px 24px',
    borderRadius: '50px',
    border: '2px solid rgba(192, 158, 93, 0.4)',
    background: 'rgba(255,255,255,0.05)',
    backdropFilter: 'blur(10px)',
    color: 'white',
    fontSize: '16px',
    textAlign: 'center',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'all 0.3s ease',
    fontWeight: '500'
  },
  continueButton: {
    width: '100%',
    padding: '18px',
    borderRadius: '50px',
    border: 'none',
    background: 'linear-gradient(135deg, #1e5a8e 0%, #c09e5d 100%)',
    color: 'white',
    fontSize: '16px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: '0 10px 30px rgba(192, 158, 93, 0.4)',
    letterSpacing: '0.5px',
    animation: 'fadeInUp 0.6s ease-out 0.5s backwards'
  },
  continueButtonDisabled: {
    width: '100%',
    padding: '18px',
    borderRadius: '50px',
    border: 'none',
    background: 'rgba(75, 85, 99, 0.3)',
    color: 'rgba(255,255,255,0.4)',
    fontSize: '16px',
    fontWeight: '700',
    cursor: 'not-allowed',
    letterSpacing: '0.5px',
    animation: 'fadeInUp 0.6s ease-out 0.5s backwards'
  },
  buttonContent: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px'
  },
  buttonArrow: {
    fontSize: '18px',
    transition: 'transform 0.3s ease'
  },
  dividerContainer: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '15px',
    margin: '30px 0 25px 0',
    animation: 'fadeInUp 0.6s ease-out 0.6s backwards'
  },
  dividerLine: {
    flex: 1,
    height: '1px',
    background: 'linear-gradient(90deg, transparent, rgba(192, 158, 93, 0.3), transparent)'
  },
  dividerText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: '13px',
    fontWeight: '600',
    letterSpacing: '1px'
  },
  authOptions: {
    display: 'flex',
    alignItems: 'center',
    gap: '15px',
    animation: 'fadeInUp 0.6s ease-out 0.7s backwards'
  },
  authButton: {
    background: 'none',
    border: 'none',
    color: '#c09e5d',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
    letterSpacing: '0.5px',
    textTransform: 'uppercase',
    transition: 'all 0.3s ease',
    padding: '8px 16px',
    borderRadius: '20px'
  },
  separator: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: '12px'
  }
};