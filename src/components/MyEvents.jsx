import React, { useState, useEffect } from 'react';
import QrScanner from './QrScanner';
import { supabase } from '../lib/supabaseClient';

// Σελίδα "My Events" - η landing page για έναν ήδη συνδεδεμένο χρήστη
// (μετά το onAuthed του AuthForm.jsx). Δείχνει όλα τα events στα οποία ο
// χρήστης έχει μπει ξανά (μέσω του public.event_guests, όπου το user_id
// γεμίζει μόλις μπει σε ένα event ενώ είναι συνδεδεμένος), με:
//  - Γρανάζι (settings) πάνω-δεξιά, γενικό για τον λογαριασμό - ΟΧΙ ανά event.
//  - "+" κάτω-δεξιά (floating button) για να προσθέσει ένα ΝΕΟ event με
//    κωδικό - ίδιο "Enter event code" flow με το Login.jsx, μέσα σε modal,
//    ώστε ο ήδη συνδεδεμένος χρήστης να μη χρειάζεται να ξαναπεράσει από
//    ολόκληρη τη Login οθόνη.
//
// Props:
//  - onOpenEvent(event): πλοήγηση μέσα σε συγκεκριμένο event (π.χ. GuestSignIn/gallery του)
//  - onOpenSettings(): πλοήγηση στις ρυθμίσεις λογαριασμού
export default function MyEvents({ onOpenEvent, onOpenSettings }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    setLoading(true);
    setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setEvents([]);
        return;
      }
      // event_guests.event_id -> events (foreign key ήδη υπάρχει στη βάση),
      // οπότε το nested select φέρνει κατευθείαν όλο το event row μαζί.
      const { data, error: fetchError } = await supabase
        .from('event_guests')
        .select('event_id, last_seen_at, events(*)')
        .eq('user_id', user.id)
        .order('last_seen_at', { ascending: false });
      if (fetchError) throw fetchError;

      // Αφαιρούμε τυχόν duplicate events (αν κάποιος έχει πολλαπλές
      // event_guests εγγραφές για το ίδιο event) και events που έχουν
      // διαγραφεί/null.
      const seen = new Set();
      const unique = [];
      (data || []).forEach((row) => {
        if (row.events && !seen.has(row.events.id)) {
          seen.add(row.events.id);
          unique.push(row.events);
        }
      });
      setEvents(unique);
    } catch (err) {
      setError('Δεν μπορέσαμε να φορτώσουμε τα events σου.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container} className="klev-viewport">
      {/* Ίδιο λογότυπο brand με το Login.jsx/GuestSignIn.jsx (public/Logo2.svg) -
      μικρό, πάνω-πάνω, για συνέπεια σε όλη την εφαρμογή. */}
      <div style={styles.logoRow}>
        <img src="/Logo2.svg" alt="Sharethecap" style={styles.logo} />
      </div>

      <div style={styles.topBar}>
        <h1 style={styles.pageTitle}>My Events</h1>
        <button onClick={onOpenSettings} style={styles.settingsBtn} aria-label="Settings">
          <GearIcon />
        </button>
      </div>

      <div style={styles.scrollArea}>
        {loading && <p style={styles.stateText}>Φόρτωση...</p>}
        {!loading && error && <p style={styles.stateText}>{error}</p>}
        {!loading && !error && events.length === 0 && (
          <div style={styles.emptyState}>
            <p style={styles.emptyText}>Δεν έχεις μπει ακόμα σε κάποιο event.</p>
            <p style={styles.emptySubtext}>Πάτησε το + κάτω-δεξιά για να προσθέσεις ένα με κωδικό.</p>
          </div>
        )}
        {!loading && !error && events.length > 0 && (
          <div style={styles.grid}>
            {events.map((ev) => (
              <button key={ev.id} onClick={() => onOpenEvent?.(ev)} style={styles.card}>
                <div style={styles.cardImageWrap}>
                  {ev.banner_url ? (
                    <img src={ev.banner_url} alt="" style={styles.cardImage} />
                  ) : (
                    <div style={styles.cardImagePlaceholder} />
                  )}
                </div>
                <div style={styles.cardInfo}>
                  <p style={styles.cardTitle}>
                    {ev.event_category === 'wedding' && ev.couple_names ? ev.couple_names : ev.event_name}
                  </p>
                  {ev.wedding_date && (
                    <p style={styles.cardDate}>
                      {new Date(ev.wedding_date).toLocaleDateString('el-GR', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Floating "+" - κάτω-δεξιά, ίδιο brand χρυσό, στρογγυλό (εξαίρεση
      σκόπιμη: ένα κυκλικό icon-button για "add" είναι διαφορετικό
      functional pattern από τα pill-shaped CTAs που είχαμε αποφύγει
      αλλού - εδώ το κύκλος είναι το αναμενόμενο σχήμα ενός FAB). */}
      <button onClick={() => setShowAdd(true)} style={styles.fab} aria-label="Add event">
        <span style={styles.fabIcon}>+</span>
      </button>

      {showAdd && (
        <AddEventModal
          onClose={() => setShowAdd(false)}
          onJoined={(ev) => {
            setShowAdd(false);
            loadEvents();
            onOpenEvent?.(ev);
          }}
        />
      )}

      <style>{`
        .klev-viewport { height: 100dvh; }
        @keyframes modalScan {
          0% { top: 0%; }
          50% { top: 100%; }
          100% { top: 0%; }
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

// Modal για προσθήκη ενός ΝΕΟΥ event - δύο tabs, ίδια λογική/ύφος με το
// Login.jsx (QR scan ή "Enter event code"), αλλά μέσα σε modal ώστε να μη
// φεύγει ο ήδη συνδεδεμένος χρήστης από τη λίστα του. Και τα δύο tabs
// καταλήγουν στο ίδιο joinEvent(codeOrText) - το QR περιέχει τον ίδιο
// event_code σαν κείμενο, οπότε δεν χρειάζεται ξεχωριστό parsing.
function AddEventModal({ onClose, onJoined }) {
  const [tab, setTab] = useState('scan'); // 'scan' | 'code'
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const joinEvent = async (rawCode) => {
    const codeValue = (rawCode || '').trim();
    if (!codeValue) return;
    setLoading(true);
    setError('');
    try {
      const { data: event, error: findError } = await supabase
        .from('events')
        .select('*')
        .eq('event_code', codeValue.toUpperCase())
        .eq('is_active', true)
        .single();
      if (findError || !event) {
        setError('Δεν βρέθηκε event με αυτόν τον κωδικό.');
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Πρέπει να είσαι συνδεδεμένος.');
        return;
      }

      // Ελέγχουμε πρώτα αν υπάρχει ήδη εγγραφή (αντί για upsert με
      // onConflict) - δεν ξέρουμε αν υπάρχει unique constraint πάνω σε
      // (event_id, user_id) στο event_guests, οπότε αυτό το κάνει σωστά
      // ανεξάρτητα.
      const { data: existing } = await supabase
        .from('event_guests')
        .select('id')
        .eq('event_id', event.id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!existing) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('name')
          .eq('id', user.id)
          .single();

        const { error: insertError } = await supabase
          .from('event_guests')
          .insert({
            event_id: event.id,
            user_id: user.id,
            guest_name: profile?.name || 'Guest'
          });
        if (insertError) throw insertError;
      }

      onJoined?.(event);
    } catch (err) {
      setError(err.message || 'Κάτι πήγε στραβά. Δοκίμασε ξανά.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitCode = (e) => {
    e.preventDefault();
    joinEvent(code);
  };

  const handleScan = (decodedText) => {
    if (decodedText && !loading) {
      joinEvent(decodedText);
    }
  };

  // ΔΙΟΡΘΩΣΗ (code review - "σιωπηλή άδεια κάμερα"): βλ. ίδιο σχόλιο στο
  // Login.jsx/QrScanner.jsx. Χωρίς αυτό, μια άρνηση άδειας κάμερας ή
  // συσκευή χωρίς κάμερα άφηνε το scan tab άδειο για πάντα - τώρα
  // μεταφέρουμε αυτόματα στο tab "Κωδικός" με εξήγηση.
  const handleScanError = () => {
    setTab('code');
    setError('Δεν μπόρεσα να ανοίξω την κάμερα (ίσως δεν δόθηκε άδεια, ή η συσκευή δεν έχει κάμερα). Γράψε τον κωδικό εδώ.');
  };

  return (
    <div style={modalStyles.overlay} onClick={onClose}>
      <div style={modalStyles.card} onClick={(e) => e.stopPropagation()}>
        <button style={modalStyles.closeBtn} onClick={onClose} aria-label="close">✕</button>
        <h2 style={modalStyles.title}>Πρόσθεσε ένα event</h2>
        <p style={modalStyles.subtitle}>Σκάναρε το QR code του event ή γράψε τον κωδικό του.</p>

        {/* Tabs - ίδιο ζευγάρι επιλογών με το Login.jsx (QR / κωδικός), απλά
        εδώ σαν explicit tabs αντί για divider, γιατί μέσα στο modal δεν
        υπάρχει χώρος να δείχνονται και τα δύο ταυτόχρονα. */}
        <div style={modalStyles.tabs}>
          <button
            type="button"
            onClick={() => { setTab('scan'); setError(''); }}
            style={tab === 'scan' ? modalStyles.tabActive : modalStyles.tab}
          >
            QR code
          </button>
          <button
            type="button"
            onClick={() => { setTab('code'); setError(''); }}
            style={tab === 'code' ? modalStyles.tabActive : modalStyles.tab}
          >
            Κωδικός
          </button>
        </div>

        {tab === 'scan' ? (
          <div style={modalStyles.scanWrap}>
            <div style={modalStyles.cameraWrapper}>
              <QrScanner onResult={handleScan} onError={handleScanError} className="qr-video-fill" />
              <div style={modalStyles.scannerOverlay}>
                <div style={modalStyles.scanLine}></div>
              </div>
            </div>
            {loading && <p style={modalStyles.scanStatus}>Έλεγχος...</p>}
            {error && <p style={modalStyles.error}>{error}</p>}
          </div>
        ) : (
          <form onSubmit={handleSubmitCode} style={modalStyles.form}>
            <input
              type="text"
              placeholder="Event code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              style={modalStyles.input}
              maxLength={20}
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
            />

            {error && <p style={modalStyles.error}>{error}</p>}

            <button type="submit" style={modalStyles.submitBtn} disabled={loading}>
              {loading ? '...' : 'Join'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
      <circle cx="12" cy="12" r="3.2" stroke="white" strokeWidth="1.6" />
      <path
        d="M19.4 13.4c.04-.3.06-.6.06-.9v-1c0-.3-.02-.6-.06-.9l1.86-1.45a.45.45 0 0 0 .1-.58l-1.76-3.05a.45.45 0 0 0-.55-.2l-2.2.88a7.4 7.4 0 0 0-1.55-.9l-.33-2.34a.45.45 0 0 0-.45-.39h-3.52a.45.45 0 0 0-.45.39l-.33 2.34a7.4 7.4 0 0 0-1.55.9l-2.2-.88a.45.45 0 0 0-.55.2L3.62 8.58a.45.45 0 0 0 .1.58L5.58 10.6c-.04.3-.06.6-.06.9v1c0 .3.02.6.06.9L3.72 14.85a.45.45 0 0 0-.1.58l1.76 3.05c.11.19.35.27.55.2l2.2-.88c.47.39.98.7 1.55.9l.33 2.34c.04.22.23.39.45.39h3.52c.22 0 .41-.17.45-.39l.33-2.34c.57-.2 1.08-.51 1.55-.9l2.2.88c.2.07.44-.01.55-.2l1.76-3.05a.45.45 0 0 0-.1-.58L19.4 13.4Z"
        stroke="white"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const styles = {
  container: {
    height: '100vh',
    background: '#1a4377',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    boxSizing: 'border-box',
    position: 'relative',
    overflow: 'hidden'
  },
  logoRow: {
    display: 'flex',
    justifyContent: 'center',
    padding: 'clamp(14px, 3vh, 22px) 0 0',
    flexShrink: 0
  },
  logo: {
    height: 'clamp(26px, 4vh, 38px)',
    width: 'auto',
    maxWidth: '55%',
    objectFit: 'contain'
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'clamp(10px, 2.5vh, 18px) clamp(18px, 5vw, 28px) clamp(10px, 2vh, 16px)',
    flexShrink: 0
  },
  pageTitle: {
    color: 'white',
    fontSize: 'clamp(19px, 3vh, 24px)',
    fontWeight: '700',
    margin: 0,
    letterSpacing: '0.2px'
  },
  settingsBtn: {
    WebkitAppearance: 'none',
    appearance: 'none',
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(217, 181, 74, 0.3)',
    borderRadius: '10px',
    width: '38px',
    height: '38px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: 0,
    flexShrink: 0
  },
  scrollArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '0 clamp(18px, 5vw, 28px) clamp(90px, 14vh, 110px)',
    boxSizing: 'border-box'
  },
  stateText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: '14px',
    textAlign: 'center',
    marginTop: '40px'
  },
  emptyState: {
    textAlign: 'center',
    marginTop: 'clamp(40px, 12vh, 90px)'
  },
  emptyText: {
    color: 'white',
    fontSize: '15px',
    fontWeight: '600',
    margin: '0 0 6px 0'
  },
  emptySubtext: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: '13px',
    margin: 0
  },
  grid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    marginTop: '8px'
  },
  card: {
    WebkitAppearance: 'none',
    appearance: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    width: '100%',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(217, 181, 74, 0.2)',
    borderRadius: '12px',
    padding: '10px',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
    boxSizing: 'border-box'
  },
  cardImageWrap: {
    width: '60px',
    height: '60px',
    borderRadius: '8px',
    overflow: 'hidden',
    flexShrink: 0,
    background: 'rgba(255,255,255,0.08)'
  },
  cardImage: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block'
  },
  cardImagePlaceholder: {
    width: '100%',
    height: '100%',
    background: 'linear-gradient(135deg, rgba(217,181,74,0.15), transparent)'
  },
  cardInfo: {
    flex: 1,
    minWidth: 0
  },
  cardTitle: {
    color: 'white',
    fontSize: '15px',
    fontWeight: '700',
    margin: '0 0 3px 0',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  cardDate: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: '12.5px',
    margin: 0
  },
  fab: {
    WebkitAppearance: 'none',
    appearance: 'none',
    position: 'absolute',
    bottom: 'clamp(20px, 4vh, 32px)',
    right: 'clamp(20px, 5vw, 30px)',
    width: '56px',
    height: '56px',
    borderRadius: '50%',
    border: 'none',
    background: 'linear-gradient(135deg, #D9B54A 0%, #C79A2E 100%)',
    boxShadow: '0 10px 24px rgba(217, 181, 74, 0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    zIndex: 2
  },
  fabIcon: {
    color: '#1a2f52',
    fontSize: '28px',
    fontWeight: '700',
    lineHeight: 1
  }
};

const modalStyles = {
  overlay: {
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(4px)',
    zIndex: 3000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    boxSizing: 'border-box'
  },
  card: {
    position: 'relative',
    width: '100%',
    maxWidth: '380px',
    background: '#1a4377',
    borderRadius: '18px',
    padding: '32px 28px',
    boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
    border: '1px solid rgba(217, 181, 74, 0.25)',
    boxSizing: 'border-box',
    fontFamily: "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
  },
  closeBtn: {
    position: 'absolute',
    top: '16px',
    right: '16px',
    background: 'rgba(255,255,255,0.1)',
    border: 'none',
    borderRadius: '50%',
    width: '32px',
    height: '32px',
    color: 'white',
    cursor: 'pointer',
    fontSize: '14px'
  },
  title: {
    color: 'white',
    fontSize: '20px',
    fontWeight: '700',
    margin: '0 0 8px 0'
  },
  subtitle: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: '13px',
    margin: '0 0 20px 0',
    lineHeight: 1.4
  },
  tabs: {
    display: 'flex',
    gap: '8px',
    marginBottom: '18px',
    background: 'rgba(255,255,255,0.05)',
    borderRadius: '10px',
    padding: '4px'
  },
  tab: {
    WebkitAppearance: 'none',
    appearance: 'none',
    flex: 1,
    padding: '10px 12px',
    borderRadius: '8px',
    border: 'none',
    background: 'transparent',
    color: 'rgba(255,255,255,0.55)',
    fontSize: '13.5px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: 'inherit'
  },
  tabActive: {
    WebkitAppearance: 'none',
    appearance: 'none',
    flex: 1,
    padding: '10px 12px',
    borderRadius: '8px',
    border: 'none',
    background: 'linear-gradient(135deg, #D9B54A 0%, #C79A2E 100%)',
    color: '#1a2f52',
    fontSize: '13.5px',
    fontWeight: '700',
    cursor: 'pointer',
    fontFamily: 'inherit'
  },
  scanWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px'
  },
  cameraWrapper: {
    width: '100%',
    aspectRatio: '1 / 1',
    borderRadius: '14px',
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
  scanLine: {
    position: 'absolute',
    width: '100%',
    height: '2px',
    background: 'linear-gradient(90deg, transparent, #D9B54A, transparent)',
    boxShadow: '0 0 10px #D9B54A',
    animation: 'modalScan 2s linear infinite'
  },
  scanStatus: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: '13px',
    textAlign: 'center',
    margin: 0
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  input: {
    width: '100%',
    padding: '14px 18px',
    borderRadius: '10px',
    border: '1px solid rgba(217, 181, 74, 0.35)',
    background: 'rgba(255,255,255,0.06)',
    color: 'white',
    fontSize: '15px',
    textAlign: 'center',
    letterSpacing: '1.5px',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit'
  },
  error: {
    color: '#ff9b94',
    fontSize: '13px',
    margin: 0
  },
  submitBtn: {
    marginTop: '4px',
    padding: '15px',
    borderRadius: '10px',
    border: 'none',
    background: 'linear-gradient(135deg, #D9B54A 0%, #C79A2E 100%)',
    color: '#1a2f52',
    fontSize: '15px',
    fontWeight: '700',
    cursor: 'pointer',
    fontFamily: 'inherit'
  }
};