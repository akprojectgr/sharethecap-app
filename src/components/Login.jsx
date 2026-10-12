import React, { useState, useEffect } from 'react';
import QrScanner from './QrScanner';
import AuthForm from './AuthForm';

// onLogin: submit ενός QR/event code (η κύρια λειτουργία αυτής της
// σελίδας). onAuthed: προαιρετικό - καλείται όταν ο χρήστης κάνει επιτυχώς
// login μέσα από το ενσωματωμένο AuthForm modal (π.χ. για να τον στείλει
// κάπου αλλού μετά).
//
// ΕΝΙΑΙΟ flow σύνδεσης (όχι πια ξεχωριστά "Sign in" / "Create an account"):
// το AuthForm δεν χρειάζεται να ξέρει από πριν αν το email είναι νέο ή
// υπάρχον - ο χρήστης γράφει μόνο το email του και το σύστημα καταλαβαίνει
// μόνο του τι να κάνει. Ένα και μοναδικό σημείο εισόδου, "Σύνδεση με email",
// κάτω από τη ροή QR/Join Party (όχι πια πάνω-δεξιά).
export default function Login({ onLogin, loading, error, onAuthed }) {
  const [inputCode, setInputCode] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  // ΔΙΟΡΘΩΣΗ (code review - "σιωπηλή άδεια κάμερα"): βλ. σχόλιο στο
  // QrScanner.jsx - χωρίς αυτό, αν ο guest αρνηθεί άδεια κάμερας (ή η
  // συσκευή δεν έχει καθόλου κάμερα), το scanner box έμενε άδειο για πάντα
  // χωρίς καμία εξήγηση. Τώρα δείχνουμε μήνυμα και κλείνουμε αυτόματα την
  // κάμερα, ώστε να φαίνεται αμέσως το πεδίο "ή γράψε τον κωδικό" από κάτω.
  const [cameraError, setCameraError] = useState('');
  const [mounted, setMounted] = useState(false);
  // false = κλειστό, true = ανοιχτό το AuthForm modal.
  const [authOpen, setAuthOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputCode.trim()) {
      onLogin(inputCode.trim());
    }
  };

  const handleScan = (decodedText) => {
    if (decodedText) {
      setIsScanning(false);
      onLogin(decodedText);
    }
  };

  const handleScanError = () => {
    setIsScanning(false);
    setCameraError('Δεν μπόρεσα να ανοίξω την κάμερα (ίσως δεν δόθηκε άδεια, ή η συσκευή δεν έχει κάμερα). Γράψε τον κωδικό χειροκίνητα παρακάτω.');
  };

  const handleStartScanning = () => {
    setCameraError('');
    setIsScanning(true);
  };

  return (
    <div style={styles.container} className="klev-viewport">
      <div style={{...styles.content, opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(20px)'}}>

        {/* LOGO */}
        <div style={styles.logoContainer}>
          <img
            src="/Logo3.svg"
            alt="Klev Logo"
            style={styles.logo}
          />
        </div>

        {/* Header Text */}
        <h2 style={styles.headerText}>
          Σάρωσε το <span style={styles.highlight}>QR code</span><br />
          του event που θέλεις να μπεις
        </h2>

        {/* QR SECTION */}
        <div style={styles.qrSection}>
          {isScanning ? (
            <div style={styles.cameraWrapper}>
              <QrScanner onResult={handleScan} onError={handleScanError} className="qr-video-fill" />
              <div style={styles.scannerOverlay}>
                <div style={styles.scanLine}></div>
              </div>
              {/* Ίδιο "scanner frame" ύφος με γωνιακά brackets, πάνω στην
              ίδια την κάμερα - πιο μεγάλα/ανοιχτόχρωμα από τα brackets του
              στατικού QR icon, όπως το reference screenshot (λευκά, κοντά
              στις άκρες, μαζί με τη μπλε scan line). */}
              <div style={{...styles.cameraCorner, ...styles.cameraCornerTL}}></div>
              <div style={{...styles.cameraCorner, ...styles.cameraCornerTR}}></div>
              <div style={{...styles.cameraCorner, ...styles.cameraCornerBL}}></div>
              <div style={{...styles.cameraCorner, ...styles.cameraCornerBR}}></div>
              <button
                onClick={() => setIsScanning(false)}
                style={styles.closeCameraBtn}
              >
                ✕ Ακύρωση
              </button>
            </div>
          ) : (
            <div
              style={styles.qrIconContainer}
              onClick={handleStartScanning}
            >
              <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={styles.qrSvg}>
                <path d="M3 3H9V9H3V3Z" stroke="#D9B54A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M15 3H21V9H15V3Z" stroke="#D9B54A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M3 15H9V21H3V15Z" stroke="#D9B54A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M15 15H21V21H15V15Z" stroke="#D9B54A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M7 7H5V5H7V7Z" fill="#D9B54A"/>
                <path d="M19 7H17V5H19V7Z" fill="#D9B54A"/>
                <path d="M7 19H5V17H7V19Z" fill="#D9B54A"/>
              </svg>

              {/* Animated corners */}
              <div style={{...styles.corner, ...styles.cornerTL}}></div>
              <div style={{...styles.corner, ...styles.cornerTR}}></div>
              <div style={{...styles.corner, ...styles.cornerBL}}></div>
              <div style={{...styles.corner, ...styles.cornerBR}}></div>
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={styles.dividerContainer}>
          <div style={styles.dividerLine}></div>
          <p style={styles.dividerText}>ή γράψε τον κωδικό</p>
          <div style={styles.dividerLine}></div>
        </div>

        {/* Form Section */}
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.inputWrapper}>
            <input
              type="text"
              placeholder="Κωδικός event"
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value)}
              style={styles.input}
              maxLength={20}
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              inputMode="text"
            />
            {inputCode && (
              <button
                type="button"
                onClick={() => setInputCode('')}
                style={styles.clearBtn}
              >
                ✕
              </button>
            )}
          </div>

          <button
            type="submit"
            style={loading ? styles.buttonDisabled : styles.button}
            disabled={loading}
          >
            <span style={styles.buttonContent}>
              {loading ? (
                <>
                  <span style={styles.spinner}></span>
                  Joining...
                </>
              ) : (
                <>
                  Join Party
                  <span style={styles.buttonArrow}>→</span>
                </>
              )}
            </span>
          </button>
        </form>

        {error && (
          <div style={styles.errorContainer}>
            <span style={styles.errorIcon}>⚠️</span>
            <p style={styles.error}>{error}</p>
          </div>
        )}

        {cameraError && (
          <div style={styles.errorContainer}>
            <span style={styles.errorIcon}>⚠️</span>
            <p style={styles.error}>{cameraError}</p>
          </div>
        )}

        {/* Ενιαίο σημείο εισόδου με email - πλέον κάτω από τη ροή QR/Join
        Party αντί για το παλιό διακριτικό link πάνω-δεξιά. Το "Σύνδεση"
        έδειχνε να υπονοεί ότι χρειάζεται ήδη λογαριασμός (κάποιος που δεν
        έχει θα μπερδευόταν αναζητώντας πού κάνει εγγραφή) - η ουδέτερη
        διατύπωση "Συνέχεια με email" + μια μικρή εξήγηση του λόγου καλύπτει
        και τους δύο (νέο και υπάρχοντα χρήστη) χωρίς να χρειάζεται να ξέρει
        κανείς εκ των προτέρων αν έχει ήδη λογαριασμό. */}
        <div style={styles.createLine}>
          <p style={styles.createLineText}>
            Θες να κρατάς τα αγαπημένα σου και τις φωτογραφίες σου;
          </p>
          <button
            type="button"
            onClick={() => setAuthOpen(true)}
            style={styles.createLineLink}
          >
            Συνέχεια με email
          </button>
        </div>

      </div>

      {/* AuthForm modal - fixed overlay, ανεξάρτητο από πού μπαίνει στο DOM.
      Ένα και μοναδικό, ενιαίο flow σύνδεσης (χωρίς mode). */}
      {authOpen && (
        <AuthForm
          onClose={() => setAuthOpen(false)}
          onAuthed={(user, name) => {
            setAuthOpen(false);
            onAuthed?.(user, name);
          }}
        />
      )}

      <style>{`
        .klev-viewport {
          min-height: 100dvh;
          height: 100%;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
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

        @keyframes scan {
          0% { top: 0%; }
          50% { top: 100%; }
          100% { top: 0%; }
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .qr-video-fill video {
          width: 100% !important;
          height: 100% !important;
          object-fit: cover;
        }
      `}</style>
    </div>
  );
}

// STYLES
const styles = {
  container: {
    minHeight: '100dvh',
    width: '100vw',
    background: '#1a4377',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    padding: '24px 16px',
    position: 'relative',
    boxSizing: 'border-box',
    overflowX: 'hidden'
  },
  content: {
    width: '100%',
    maxWidth: '400px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    position: 'relative',
    zIndex: 1,
    transition: 'all 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
    margin: 'auto'
  },
  logoContainer: {
    position: 'relative',
    marginBottom: '16px',
    animation: 'fadeInUp 0.8s ease-out',
    flexShrink: 0
  },
  logo: {
    height: '56px',
    width: 'auto',
    maxWidth: '82%',
    position: 'relative',
    zIndex: 2
  },
  headerText: {
    color: 'white',
    fontSize: '14px',
    fontWeight: '500',
    marginBottom: '16px',
    lineHeight: '1.5',
    animation: 'fadeInUp 0.8s ease-out 0.2s backwards',
    letterSpacing: '0.3px',
    flexShrink: 0
  },
  highlight: {
    color: '#D9B54A',
    fontWeight: '700'
  },
  qrSection: {
    width: '130px',
    height: '130px',
    marginBottom: '16px',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    animation: 'fadeInUp 0.8s ease-out 0.4s backwards',
    flexShrink: 0
  },
  qrIconContainer: {
    width: '100%',
    height: '100%',
    position: 'relative',
    cursor: 'pointer',
    padding: '22px',
    boxSizing: 'border-box',
    background: 'radial-gradient(circle, rgba(217, 181, 74, 0.08), transparent 70%)',
    borderRadius: '24px',
    transition: 'all 0.3s ease',
    border: '1px solid rgba(217, 181, 74, 0.25)'
  },
  qrSvg: {
    width: '100%',
    height: '100%',
    filter: 'drop-shadow(0 0 15px rgba(217, 181, 74, 0.5))'
  },
  corner: {
    position: 'absolute',
    width: '16px',
    height: '16px',
    borderColor: '#D9B54A',
    borderStyle: 'solid',
    borderWidth: '2.5px'
  },
  cornerTL: {
    top: '6px',
    left: '6px',
    borderRight: 'none',
    borderBottom: 'none',
    borderTopLeftRadius: '4px'
  },
  cornerTR: {
    top: '6px',
    right: '6px',
    borderLeft: 'none',
    borderBottom: 'none',
    borderTopRightRadius: '4px'
  },
  cornerBL: {
    bottom: '6px',
    left: '6px',
    borderRight: 'none',
    borderTop: 'none',
    borderBottomLeftRadius: '4px'
  },
  cornerBR: {
    bottom: '6px',
    right: '6px',
    borderLeft: 'none',
    borderTop: 'none',
    borderBottomRightRadius: '4px'
  },
  cameraWrapper: {
    width: '100%',
    height: '100%',
    borderRadius: '20px',
    overflow: 'hidden',
    position: 'relative',
    border: '2px solid rgba(217, 181, 74, 0.5)',
    boxShadow: '0 0 30px rgba(217, 181, 74, 0.3)'
  },
  scannerOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none'
  },
  cameraCorner: {
    position: 'absolute',
    width: '24px',
    height: '24px',
    borderColor: 'rgba(255,255,255,0.85)',
    borderStyle: 'solid',
    borderWidth: '2.5px',
    pointerEvents: 'none'
  },
  cameraCornerTL: {
    top: '8px',
    left: '8px',
    borderRight: 'none',
    borderBottom: 'none',
    borderTopLeftRadius: '8px'
  },
  cameraCornerTR: {
    top: '8px',
    right: '8px',
    borderLeft: 'none',
    borderBottom: 'none',
    borderTopRightRadius: '8px'
  },
  cameraCornerBL: {
    bottom: '8px',
    left: '8px',
    borderRight: 'none',
    borderTop: 'none',
    borderBottomLeftRadius: '8px'
  },
  cameraCornerBR: {
    bottom: '8px',
    right: '8px',
    borderLeft: 'none',
    borderTop: 'none',
    borderBottomRightRadius: '8px'
  },
  scanLine: {
    position: 'absolute',
    width: '100%',
    height: '2px',
    background: 'linear-gradient(90deg, transparent, #D9B54A, transparent)',
    boxShadow: '0 0 10px #D9B54A',
    animation: 'scan 2s linear infinite'
  },
  closeCameraBtn: {
    position: 'absolute',
    bottom: '12px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.8)',
    backdropFilter: 'blur(10px)',
    color: 'white',
    border: '1px solid rgba(255,255,255,0.2)',
    padding: '8px 16px',
    borderRadius: '20px',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    zIndex: 10,
    transition: 'all 0.3s ease'
  },
  dividerContainer: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '14px',
    animation: 'fadeInUp 0.8s ease-out 0.6s backwards',
    flexShrink: 0
  },
  dividerLine: {
    flex: 1,
    height: '1px',
    background: 'rgba(217, 181, 74, 0.28)'
  },
  dividerText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: '13px',
    fontWeight: '500',
    whiteSpace: 'nowrap'
  },
  form: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    animation: 'fadeInUp 0.8s ease-out 0.8s backwards',
    flexShrink: 0
  },
  inputWrapper: {
    position: 'relative',
    width: '100%'
  },
  input: {
    width: '100%',
    padding: '12px 18px',
    borderRadius: '10px',
    border: '1px solid rgba(217, 181, 74, 0.32)',
    background: 'rgba(255,255,255,0.04)',
    color: 'white',
    fontSize: '15px',
    textAlign: 'center',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'all 0.3s ease',
    letterSpacing: '1.5px',
    fontWeight: '500'
  },
  clearBtn: {
    position: 'absolute',
    right: '16px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'rgba(255,255,255,0.1)',
    border: 'none',
    color: 'rgba(255,255,255,0.6)',
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    cursor: 'pointer',
    fontSize: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  button: {
    width: '100%',
    padding: '12px',
    borderRadius: '10px',
    border: 'none',
    background: 'linear-gradient(135deg, #D9B54A 0%, #C79A2E 100%)',
    color: '#1a2f52',
    fontSize: '15.5px',
    fontWeight: '700',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    boxShadow: '0 10px 24px rgba(217, 181, 74, 0.28)',
    position: 'relative',
    overflow: 'hidden',
    letterSpacing: '0.3px'
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
  buttonDisabled: {
    width: '100%',
    padding: '12px',
    borderRadius: '10px',
    border: 'none',
    background: 'rgba(75, 85, 99, 0.5)',
    color: '#9ca3af',
    cursor: 'not-allowed',
    fontSize: '15.5px',
    fontWeight: '700',
    letterSpacing: '0.3px'
  },
  spinner: {
    width: '16px',
    height: '16px',
    border: '2px solid rgba(255,255,255,0.3)',
    borderTop: '2px solid white',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite',
    display: 'inline-block'
  },
  errorContainer: {
    marginTop: '16px',
    padding: '10px 16px',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    animation: 'fadeInUp 0.5s ease-out'
  },
  errorIcon: {
    fontSize: '16px'
  },
  error: {
    color: '#ff6b6b',
    fontSize: '13.5px',
    margin: 0,
    fontWeight: '500'
  },
  createLine: {
    marginTop: '16px',
    flexShrink: 0,
    animation: 'fadeInUp 0.8s ease-out 1s backwards'
  },
  createLineText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: '12px',
    marginBottom: '4px'
  },
  createLineLink: {
    WebkitAppearance: 'none',
    appearance: 'none',
    display: 'inline-block',
    background: 'none',
    border: 'none',
    borderBottom: '1px solid rgba(217, 181, 74, 0.5)',
    margin: 0,
    padding: '0 0 1px 0',
    color: '#D9B54A',
    fontFamily: 'inherit',
    fontSize: '12.5px',
    fontWeight: '700',
    lineHeight: 'normal',
    cursor: 'pointer'
  }
};