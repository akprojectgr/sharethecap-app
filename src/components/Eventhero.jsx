import React, { useEffect, useRef, useState } from 'react';

// ΔΙΟΡΘΩΣΗ (ζωντανός μετρητής φωτογραφιών - "εντυπωσιακό" ανέβασμα νούμερου):
// Αντί το {photoCount} να πηδάει κατευθείαν στο νέο νούμερο (π.χ. 10 -> 11
// ξαφνικά), αυτό το hook μετράει ομαλά από την παλιά τιμή στη νέα (σαν
// odometer) ΚΑΙ κάνει ένα στιγμιαίο "pop" (μεγαλώνει/λάμπει) το νούμερο όταν
// αλλάζει - έτσι κάθε νέα φωτογραφία/βίντεο που ολοκληρώνει ανέβασμα (ζωντανά,
// μέσα από photos.length στο App.jsx) φαίνεται καθαρά στον guest.
function useAnimatedCount(value) {
  const [display, setDisplay] = useState(value);
  const [pulse, setPulse] = useState(false);
  const frameRef = useRef(null);
  const fromRef = useRef(value);

  useEffect(() => {
    if (value === fromRef.current) return undefined;

    const from = fromRef.current;
    const to = value;
    const start = performance.now();
    // Διάρκεια ανάλογη με τη διαφορά (πιο αργή για μεγάλα άλματα, π.χ. αρχικό
    // φόρτωμα πολλών φωτογραφιών), αλλά με ανώτατο όριο ώστε να μη "σέρνεται".
    const duration = Math.min(900, Math.max(350, Math.abs(to - from) * 60));

    cancelAnimationFrame(frameRef.current);

    function tick(now) {
      const progress = Math.min(1, (now - start) / duration);
      // easeOutCubic - γρήγορο ξεκίνημα, ομαλή "προσγείωση" στο τέλος.
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    }
    frameRef.current = requestAnimationFrame(tick);

    setPulse(true);
    const pulseTimeout = setTimeout(() => setPulse(false), 420);

    return () => {
      cancelAnimationFrame(frameRef.current);
      clearTimeout(pulseTimeout);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return { display, pulse };
}

export default function EventHero({ event, eventName, photoCount = 0, tagline, user, onLogout, categories = [], activeTab = 'all', onTabChange }) {
  const { display: animatedPhotoCount, pulse: photoCountPulse } = useAnimatedCount(photoCount);
  const displayName =
    (event?.event_category === 'wedding' && event?.couple_names?.trim()) ||
    event?.event_name ||
    eventName ||
    '';

  const tabs = [
    { key: 'all', label: 'Όλες' },
    ...categories.map((c) => ({ key: c, label: c })),
    { key: 'liked', label: '❤ Αγαπημένες' }
  ];

  return (
    <div style={styles.container}>
      {/* TopBar - το profile/login κουμπί αφαιρέθηκε: κανένας guest δεν
      χρειάζεται πλέον λογαριασμό (όνομα, like, ανέβασμα όλα δουλεύουν
      ανώνυμα με device_token). Στη θέση του μπαίνει ΜΟΝΟ ένα κουμπί logout,
      και ΜΟΝΟ όταν υπάρχει πραγματικά ενεργή σύνδεση (π.χ. κάποιος παλιός
      λογαριασμός) - όχι ένα κουμπί που οδηγεί σε login που πια δεν χρειάζεται. */}
      <div style={styles.topBar}>
        <img src="/Logo3.svg" alt="Sharethecap" style={styles.logo} />
        {user && (
          <button
            type="button"
            onClick={onLogout}
            aria-label="Αποσύνδεση"
            style={styles.profileBtn}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <path d="M16 17l5-5-5-5" />
              <path d="M21 12H9" />
            </svg>
          </button>
        )}
      </div>

      {/* Editorial Hero Content (Flat) */}
      <div style={styles.heroContent}>
        <h1 className="wedding-title" style={styles.name}>
          {displayName}
        </h1>
        <div style={styles.metaRow}>
          {tagline && <span style={styles.tagline}>{tagline}</span>}
          <span style={styles.photoCount}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="rgba(255,255,255,0.85)" style={styles.photoIcon}>
              <path d="M12 9a3.75 3.75 0 100 7.5A3.75 3.75 0 0012 9z" />
              <path fillRule="evenodd" clipRule="evenodd" d="M9.344 3.071a49.52 49.52 0 015.312 0c.967.052 1.83.585 2.332 1.39l.821 1.317c.24.383.645.643 1.11.71.386.054.77.113 1.152.177 1.432.239 2.429 1.493 2.429 2.909V18a3 3 0 01-3 3H4.5a3 3 0 01-3-3V9.574c0-1.416.997-2.67 2.429-2.909.382-.064.766-.123 1.151-.178a1.56 1.56 0 001.11-.71l.822-1.315a2.942 2.942 0 012.332-1.39zM6.75 12.75a5.25 5.25 0 1110.5 0 5.25 5.25 0 01-10.5 0z" />
            </svg>
            <span
              className={photoCountPulse ? 'photo-count-pulse' : ''}
              style={styles.photoCountNumber}
              data-testid="photo-count"
            >
              {animatedPhotoCount}
            </span>
          </span>
        </div>
      </div>

      {/* Tabs embedded inside Hero */}
      <div style={styles.tabsBar}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              style={{
                ...styles.tabBtn,
                ...(isActive ? styles.tabBtnActive : styles.tabBtnInactive)
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  container: {
    backgroundColor: '#262A21',
    flexShrink: 0,
    borderRadius: '0px',
    overflow: 'hidden'
  },
  topBar: {
    padding: '16px 20px 8px 20px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  logo: {
    height: '20px',
    width: 'auto',
    display: 'block'
  },
  profileBtn: {
    width: '32px',
    height: '32px',
    borderRadius: '50%',
    background: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0
  },
  heroContent: {
    padding: '12px 20px 18px 20px',
    textAlign: 'left'
  },
  name: {
    color: '#FFFFFF',
    fontSize: 'clamp(32px, 8vw, 40px)',
    fontWeight: '500',
    fontStyle: 'italic',
    margin: '0 0 8px 0',
    lineHeight: 1.1,
    letterSpacing: '0.3px'
  },
  metaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    fontWeight: '400'
  },
  tagline: {
    color: '#E6C594',
    margin: 0,
    fontWeight: '400',
    letterSpacing: '0.2px'
  },
  photoCount: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: '500'
  },
  photoIcon: {
    flexShrink: 0
  },
  photoCountNumber: {
    display: 'inline-block',
    fontVariantNumeric: 'tabular-nums'
  },
  tabsBar: {
    display: 'flex',
    gap: '8px',
    overflowX: 'auto',
    padding: '0 20px 20px 20px',
    scrollbarWidth: 'none',
    WebkitOverflowScrolling: 'touch'
  },
  tabBtn: {
    flexShrink: 0,
    fontSize: '12.5px',
    fontWeight: '600',
    borderRadius: '9999px',
    padding: '7px 14px',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    transition: 'all 0.2s ease'
  },
  tabBtnInactive: {
    background: 'rgba(255, 255, 255, 0.06)',
    border: '1px solid rgba(255, 255, 255, 0.1)',
    color: 'rgba(255, 255, 255, 0.6)'
  },
  tabBtnActive: {
    background: 'rgba(230, 197, 148, 0.18)',
    border: '1px solid rgba(230, 197, 148, 0.5)',
    color: '#E6C594'
  }
};