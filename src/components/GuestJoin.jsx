import React, { useState, useEffect } from 'react';
import { useLanguage } from '../lib/i18n';

// ΔΙΟΡΘΩΣΗ (σοβαρό bug - βρέθηκε πριν προσθέσουμε το language picker): το
// αρχείο αυτό είχε κατά λάθος αντικατασταθεί με περιεχόμενο σχεδόν
// πανομοιότυπο με το Guestsignin.jsx (λογική "όνομα καλεσμένου", props
// {event, onContinue, defaultName}) - εντελώς διαφορετικά από αυτά που
// περνάει το App.jsx εδώ ({onLogin, loading, error, onHostLogin}). Στην
// πράξη αυτό σήμαινε ότι ΚΑΝΕΝΑΣ καλεσμένος δεν θα μπορούσε να μπει σε
// event γράφοντας κωδικό - το "Join Party" θα έσκαγε (onContinue is not a
// function). Επαναφέρθηκε από προηγούμενο, σωστό zip (ίδιο ακριβώς με το
// πραγματικό App.jsx contract) + προστέθηκε το language picker.
//
// Καθαρή, guest-only οθόνη εισαγωγής κωδικού event.
//
// Δεν έχει QR scanner: οι περισσότεροι guests μπαίνουν μέσω link/QR που
// κουβαλάει τον κωδικό μέσα στο URL (?code=...) και παρακάμπτει αυτή τη
// σελίδα εντελώς - βλ. useKlevSession.js, "URL code param check on mount".
// Αυτή η σελίδα καλύπτει μόνο την περίπτωση guests που έλαβαν τον κωδικό
// προφορικά/τυπωμένο σε χαρτί, χωρίς link (π.χ. μεγαλύτεροι σε ηλικία
// καλεσμένοι που προτιμούν να τον πληκτρολογήσουν).
//
// Δεν εμφανίζει καθόλου επιλογή λογαριασμού/email - αυτό μετακόμισε στο
// ξεχωριστό HostLogin.jsx, προσβάσιμο μόνο μέσω του διακριτικού link
// "Είσαι διοργανωτής;" εδώ κάτω, ώστε ο τυπικός guest να μην βλέπει καν
// τη λέξη "λογαριασμός".
export default function GuestJoin({ onLogin, loading, error, onHostLogin }) {
  const [inputCode, setInputCode] = useState('');
  const [mounted, setMounted] = useState(false);
  const { language, setLanguage, t } = useLanguage();

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (inputCode.trim()) {
      onLogin(inputCode.trim());
    }
  };

  return (
    <div style={styles.container} className="klev-viewport">
      {/* ΝΕΟ: Language picker - EN/EL, κεντραρισμένο στην κορυφή ΟΛΗΣ της
      σελίδας (όχι πια πάνω-δεξιά μέσα στο .content, που το έδειχνε
      κολλημένο πάνω από τον τίτλο αντί για ψηλά-κέντρο). Βγήκε έξω από το
      .content ώστε να τοποθετείται σχετικά με το .container (position:
      relative, γεμίζει όλη την οθόνη) και να μένει σταθερά πάνω-κέντρο
      ανεξάρτητα από το πόσο ψηλό/χαμηλό κάθεται το .content λόγω
      κάθετου centering. Default EN (βλ. lib/i18n.js - DEFAULT_LANGUAGE),
      αποθηκεύεται στο localStorage της συσκευής. */}
      <div style={styles.langSwitcher} role="group" aria-label={t('guestJoin.languageLabel')}>
        <button
          type="button"
          onClick={() => setLanguage('en')}
          style={language === 'en' ? styles.langBtnActive : styles.langBtn}
        >
          EN
        </button>
        <button
          type="button"
          onClick={() => setLanguage('el')}
          style={language === 'el' ? styles.langBtnActive : styles.langBtn}
        >
          EL
        </button>
      </div>

      <div style={{ ...styles.content, opacity: mounted ? 1 : 0, transform: mounted ? 'translateY(0)' : 'translateY(20px)' }}>

        {/* LOGO */}
        <div style={styles.logoContainer}>
          <img
            src="/Logo3.svg"
            alt="Sharethecap"
            style={styles.logo}
          />
        </div>

        {/* Header Text */}
        <h2 style={styles.headerText}>
          {language === 'en' ? (
            <>Enter your <span style={styles.highlight}>code</span><br />to join the party</>
          ) : (
            <>Γράψε τον <span style={styles.highlight}>κωδικό</span> σου<br />για να μπεις στο πάρτι</>
          )}
        </h2>

        {/* Form Section */}
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.inputWrapper}>
            <input
              type="text"
              placeholder={t('guestJoin.codePlaceholder')}
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value)}
              style={styles.input}
              maxLength={20}
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              inputMode="text"
              autoFocus
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
                  {t('guestJoin.joining')}
                </>
              ) : (
                <>
                  {t('guestJoin.joinParty')}
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

        {/* Διακριτικό, ξεχωριστό μονοπάτι για το ζευγάρι/διοργανωτή - δεν
        αναφέρει "λογαριασμό" ή "αγαπημένα" στον guest, μόνο τον ρόλο. */}
        <div style={styles.createLine}>
          <button
            type="button"
            onClick={onHostLogin}
            style={styles.createLineLink}
          >
            {language === 'en' ? 'Are you the host? Sign in' : 'Είσαι διοργανωτής; Σύνδεση'}
          </button>
        </div>

      </div>

      <style>{`
        .klev-viewport {
          /* height/min-height 100% (όχι 100dvh) - δένει στον γονικό
          container (η κάρτα σε desktop, όλη η οθόνη σε mobile), βλ. AppShell
          στο App.jsx. */
          min-height: 100%;
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

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

// STYLES
const styles = {
  container: {
    minHeight: '100%',
    width: '100%',
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
  // ΔΙΟΡΘΩΣΗ (design review - "mipws to language switch na mpei sto kentro
  // panw panw"): ήταν πάνω-δεξιά σχετικά με το .content (κολλημένο πάνω
  // από τον τίτλο) - τώρα κεντραρισμένο οριζόντια σε σχέση με όλη τη
  // σελίδα (.container), στην κορυφή της.
  langSwitcher: {
    position: 'absolute',
    top: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: '4px',
    padding: '3px',
    borderRadius: '999px',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(217, 181, 74, 0.25)',
    zIndex: 3
  },
  // ΔΙΟΡΘΩΣΗ (design review - "η γραμματοσειρά εδώ φαίνεται ξεχωριστή", ίδιο
  // με Guestsignin.jsx): τα <button> δεν κληρονομούν αυτόματα το
  // font-family της σελίδας - fontFamily: 'inherit' το διορθώνει.
  langBtn: {
    WebkitAppearance: 'none',
    appearance: 'none',
    border: 'none',
    background: 'transparent',
    color: 'rgba(255,255,255,0.5)',
    fontFamily: 'inherit',
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '0.4px',
    padding: '5px 10px',
    borderRadius: '999px',
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  },
  langBtnActive: {
    WebkitAppearance: 'none',
    appearance: 'none',
    border: 'none',
    background: 'linear-gradient(135deg, #D9B54A 0%, #C79A2E 100%)',
    color: '#1a2f52',
    fontFamily: 'inherit',
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '0.4px',
    padding: '5px 10px',
    borderRadius: '999px',
    cursor: 'pointer'
  },
  logoContainer: {
    position: 'relative',
    marginBottom: '28px',
    marginTop: '20px',
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
    fontSize: '17px',
    fontWeight: '500',
    marginBottom: '24px',
    lineHeight: '1.5',
    animation: 'fadeInUp 0.8s ease-out 0.2s backwards',
    letterSpacing: '0.3px',
    flexShrink: 0
  },
  highlight: {
    color: '#D9B54A',
    fontWeight: '700'
  },
  form: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    animation: 'fadeInUp 0.8s ease-out 0.4s backwards',
    flexShrink: 0
  },
  inputWrapper: {
    position: 'relative',
    width: '100%'
  },
  input: {
    width: '100%',
    padding: '14px 18px',
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
    fontFamily: 'inherit',
    fontSize: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  // fontFamily: 'inherit' - ίδιο ζήτημα/fix με τα langBtn* πιο πάνω.
  button: {
    width: '100%',
    padding: '13px',
    borderRadius: '10px',
    border: 'none',
    background: 'linear-gradient(135deg, #D9B54A 0%, #C79A2E 100%)',
    color: '#1a2f52',
    fontFamily: 'inherit',
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
    padding: '13px',
    borderRadius: '10px',
    border: 'none',
    background: 'rgba(75, 85, 99, 0.5)',
    color: '#9ca3af',
    cursor: 'not-allowed',
    fontFamily: 'inherit',
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
    marginTop: '22px',
    flexShrink: 0,
    animation: 'fadeInUp 0.8s ease-out 0.6s backwards'
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