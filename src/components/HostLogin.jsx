import React, { useState } from 'react';
import AuthForm from './AuthForm';
import { useLanguage } from '../lib/i18n';

// Ξεχωριστή, καθαρά host/organizer οθόνη σύνδεσης - δεν εμφανίζεται ΠΟΤΕ σε
// guests. Μόνο login/signup με email (μέσω του ήδη υπάρχοντος ενιαίου
// AuthForm), χωρίς κανένα QR/code UI. Προσβάσιμη μόνο μέσω του διακριτικού
// "Είσαι διοργανωτής;" link στο GuestJoin.jsx.
//
// Το AuthForm ανοίγει αυτόματα με το mount αφού ο μοναδικός λόγος ύπαρξης
// αυτής της οθόνης είναι η σύνδεση - δεν χρειάζεται ενδιάμεσο κλικ.
export default function HostLogin({ onBack, onAuthed }) {
  const [authOpen, setAuthOpen] = useState(true);
  const { language, t } = useLanguage();

  return (
    <div style={styles.container} className="klev-viewport">
      <div style={styles.content}>
        <div style={styles.logoContainer}>
          <img src="/Logo3.svg" alt="Klev Logo" style={styles.logo} />
        </div>

        <h2 style={styles.headerText}>{t('hostLogin.title')}</h2>
        <p style={styles.subText}>
          {t('hostLogin.subtitle')}
        </p>

        <button type="button" onClick={onBack} style={styles.backLink}>
          {language === 'en' ? '← I am a guest' : '← Είμαι καλεσμένος/η'}
        </button>
      </div>

      {authOpen && (
        <AuthForm
          onClose={() => {
            setAuthOpen(false);
            onBack?.();
          }}
          onAuthed={(user, name) => {
            setAuthOpen(false);
            onAuthed?.(user, name);
          }}
        />
      )}

      <style>{`
        .klev-viewport {
          min-height: 100%;
          height: 100%;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
        }
      `}</style>
    </div>
  );
}

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
    boxSizing: 'border-box'
  },
  content: {
    width: '100%',
    maxWidth: '400px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center'
  },
  logoContainer: {
    marginBottom: '20px'
  },
  logo: {
    height: '56px',
    width: 'auto',
    maxWidth: '82%'
  },
  headerText: {
    color: 'white',
    fontSize: '20px',
    fontWeight: '700',
    margin: '0 0 8px 0'
  },
  subText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: '14px',
    margin: '0 0 24px 0',
    lineHeight: 1.5
  },
  backLink: {
    WebkitAppearance: 'none',
    appearance: 'none',
    background: 'none',
    border: 'none',
    color: '#D9B54A',
    fontSize: '13.5px',
    fontWeight: '600',
    cursor: 'pointer',
    padding: 0
  }
};