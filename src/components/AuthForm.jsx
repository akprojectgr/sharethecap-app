import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

// Ενιαία φόρμα σύνδεσης - passwordless, με email + 6ψήφιο κωδικό
// επιβεβαίωσης (OTP) αντί για password. ΔΕΝ υπάρχει πια ξεχωριστό "Login"
// vs "Create account": ο χρήστης γράφει μόνο το email του, παίρνει τον
// κωδικό, και το σύστημα καταλαβαίνει μόνο του αν είναι νέος ή υπάρχων -
// δεν χρειάζεται να ξέρει/διαλέξει τίποτα από πριν (ίδιο pattern με
// Notion/Slack κλπ). Αν είναι νέος, μετά την επιβεβαίωση του κωδικού
// ρωτάμε ΜΟΝΟ τότε το όνομά του (μία επιπλέον, μικρή οθόνη) - αν είναι
// ήδη γνωστός, μπαίνει κατευθείαν.
//
// Βήματα: 'email' -> 'code' -> ('name', μόνο για νέους) -> onAuthed().
export default function AuthForm({ onClose, onAuthed }) {
  const [step, setStep] = useState('email'); // 'email' | 'code' | 'name'
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [pendingUser, setPendingUser] = useState(null); // αποθηκεύεται όσο περιμένουμε το όνομα ενός νέου χρήστη
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Live έλεγχος διαθεσιμότητας ονόματος (σαν "username") - βλ.
  // migration "unique_profile_names" (unique index σε lower(name)) στη
  // βάση, οπότε αυτό δεν είναι μόνο κοσμητικό: αν δύο χρήστες προλάβουν
  // ταυτόχρονα το ίδιο όνομα, το DB θα απορρίψει τον δεύτερο (βλ. catch
  // στο handleSaveName) - το live check είναι απλά η γρήγορη/φιλική
  // ένδειξη πριν καν πατήσει submit.
  const [nameStatus, setNameStatus] = useState('idle'); // 'idle' | 'checking' | 'available' | 'taken'
  const nameCheckTimer = useRef(null);

  useEffect(() => {
    const clean = name.trim();
    if (clean.length < 2) {
      setNameStatus('idle');
      return;
    }
    setNameStatus('checking');
    clearTimeout(nameCheckTimer.current);
    nameCheckTimer.current = setTimeout(async () => {
      try {
        // ΔΙΟΡΘΩΣΗ (RLS security fix): πριν διάβαζε απευθείας τον πίνακα profiles
        // (select id), κάτι που χρειαζόταν μια πολιτική "profiles_select_all"
        // που εξέθετε ΟΛΑ τα emails δημόσια. Τώρα καλεί ένα SECURITY DEFINER
        // function (is_profile_name_available) που επιστρέφει μόνο true/false,
        // χωρίς να εκθέτει καμία στήλη - βλ. URGENT_rls_fixes.sql.
        const { data, error: rpcError } = await supabase.rpc('is_profile_name_available', {
          p_name: clean,
          p_exclude_id: null
        });
        if (rpcError) throw rpcError;
        setNameStatus(data === false ? 'taken' : 'available');
      } catch (err) {
        setNameStatus('idle'); // αν αποτύχει ο έλεγχος, δεν μπλοκάρουμε τον χρήστη - θα το πιάσει έτσι κι αλλιώς το unique index στο submit
      }
    }, 450);
    return () => clearTimeout(nameCheckTimer.current);
  }, [name]);

  // Βήμα 1: στέλνει το 6ψήφιο OTP στο email. shouldCreateUser: true πάντα -
  // αν το email δεν έχει ήδη λογαριασμό, φτιάχνεται αυτόματα μόλις
  // επιβεβαιωθεί ο κωδικός (δεν χρειάζεται να το ξέρουμε από πριν).
  const handleSendCode = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) return;

    setLoading(true);
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true }
      });
      if (otpError) throw otpError;
      setStep('code');
    } catch (err) {
      setError(err.message || 'Κάτι πήγε στραβά. Δοκίμασε ξανά.');
    } finally {
      setLoading(false);
    }
  };

  // Βήμα 2: επιβεβαιώνει τον κωδικό (δημιουργεί session). Μετά ελέγχουμε
  // αν υπάρχει ήδη "profiles.name" - αν όχι, είναι νέος χρήστης και
  // ζητάμε το όνομά του σε ένα επιπλέον, μικρό βήμα. Αν υπάρχει, μπαίνει
  // κατευθείαν.
  const handleVerifyCode = async (e) => {
    e.preventDefault();
    setError('');
    if (!code.trim()) return;

    setLoading(true);
    try {
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: code.trim(),
        type: 'email'
      });
      if (verifyError) throw verifyError;

      const user = data.user;
      if (!user) throw new Error('Κάτι πήγε στραβά. Δοκίμασε ξανά.');

      // Το email το γράφουμε πάντα στο profile (upsert με μόνο id/email δεν
      // πειράζει το ήδη αποθηκευμένο "name") - έτσι το admin dashboard
      // (σελίδα "Χρήστες") έχει πάντα το email διαθέσιμο.
      await supabase.from('profiles').upsert({ id: user.id, email: user.email });

      const { data: profile } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', user.id)
        .single();

      if (profile?.name?.trim()) {
        onAuthed?.(user, profile.name.trim());
      } else {
        // Νέος χρήστης (ή παλιός χωρίς όνομα ακόμα) - μία επιπλέον οθόνη.
        setPendingUser(user);
        setStep('name');
      }
    } catch (err) {
      setError(
        err.message?.includes('expired') || err.message?.includes('invalid')
          ? 'Λάθος ή ληγμένος κωδικός.'
          : err.message || 'Κάτι πήγε στραβά. Δοκίμασε ξανά.'
      );
    } finally {
      setLoading(false);
    }
  };

  // Βήμα 3 (μόνο για νέους χρήστες): αποθηκεύει το όνομα και ολοκληρώνει.
  const handleSaveName = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim() || !pendingUser || nameStatus === 'taken') return;

    setLoading(true);
    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .upsert({ id: pendingUser.id, name: name.trim() });
      if (updateError) {
        // unique_violation (23505) - κάποιος άλλος πρόλαβε το ίδιο όνομα
        // ανάμεσα στο live check και το submit.
        if (updateError.code === '23505') {
          setNameStatus('taken');
          throw new Error('Αυτό το όνομα μόλις πάρθηκε από άλλον χρήστη - δοκίμασε άλλο.');
        }
        throw updateError;
      }
      onAuthed?.(pendingUser, name.trim());
    } catch (err) {
      setError(err.message || 'Δεν αποθηκεύτηκε το όνομα. Δοκίμασε ξανά.');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    setLoading(true);
    try {
      const { error: otpError } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: { shouldCreateUser: true }
      });
      if (otpError) throw otpError;
    } catch (err) {
      setError(err.message || 'Δεν στάλθηκε ο κωδικός. Δοκίμασε ξανά.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.card} onClick={(e) => e.stopPropagation()}>
        {/* Στο βήμα "name" ΔΕΝ δείχνουμε το ✕ - είναι υποχρεωτικό βήμα για
        έναν νέο χρήστη (έχει ήδη επιβεβαιώσει το OTP, άρα υπάρχει ήδη
        session), όχι προαιρετικό. Αν το άφηνες, ο χρήστης θα μπορούσε να
        κλείσει το modal ΜΕΤΑ το verifyOtp αλλά ΠΡΙΝ αποθηκευτεί το όνομα,
        και θα έμενε "μισο-εγγεγραμμένος" (session χωρίς username) - αυτό
        ήταν και το bug που ανέφερε ο χρήστης. */}
        {step !== 'name' && (
          <button style={styles.closeBtn} onClick={onClose} aria-label="close">✕</button>
        )}

        {step === 'email' && (
          <>
            <h2 style={styles.title}>Σύνδεση</h2>
            <p style={styles.subtitle}>
              Γράψε το email σου - θα σου στείλουμε έναν κωδικό επιβεβαίωσης. Αν είναι η πρώτη φορά, φτιάχνουμε αυτόματα τον λογαριασμό σου.
            </p>

            <form onSubmit={handleSendCode} style={styles.form}>
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={styles.input}
                autoComplete="email"
                autoFocus
              />

              {error && <p style={styles.error}>{error}</p>}

              <button type="submit" style={styles.submitBtn} disabled={loading}>
                {loading ? '...' : 'Αποστολή κωδικού'}
              </button>
            </form>
          </>
        )}

        {step === 'code' && (
          <>
            <h2 style={styles.title}>Έλεγξε το email σου</h2>
            <p style={styles.subtitle}>
              Στείλαμε 6ψήφιο κωδικό στο <strong>{email}</strong>.
            </p>

            <form onSubmit={handleVerifyCode} style={styles.form}>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                maxLength={6}
                style={styles.codeInput}
                autoFocus
              />

              {error && <p style={styles.error}>{error}</p>}

              <button type="submit" style={styles.submitBtn} disabled={loading}>
                {loading ? '...' : 'Επιβεβαίωση'}
              </button>
            </form>

            <button style={styles.switchBtn} onClick={handleResend} disabled={loading}>
              Δεν ήρθε; Στείλε ξανά τον κωδικό
            </button>
            <button
              style={{ ...styles.switchBtn, marginTop: '6px', opacity: 0.6 }}
              onClick={() => { setStep('email'); setCode(''); setError(''); }}
            >
              Άλλαξε email
            </button>
          </>
        )}

        {step === 'name' && (
          <>
            <h2 style={styles.title}>Καλωσόρισες!</h2>
            <p style={styles.subtitle}>
              Πώς σε λένε; Τα αγαπημένα σου (likes) θα μένουν εδώ για πάντα, από όποια συσκευή κι αν μπεις.
            </p>

            <form onSubmit={handleSaveName} style={styles.form}>
              <div style={styles.nameInputWrap}>
                <input
                  type="text"
                  placeholder="Όνομα"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={{
                    ...styles.input,
                    paddingRight: '42px',
                    borderColor:
                      nameStatus === 'taken'
                        ? 'rgba(248, 113, 113, 0.6)'
                        : nameStatus === 'available'
                        ? 'rgba(52, 211, 153, 0.6)'
                        : 'rgba(217, 181, 74, 0.35)'
                  }}
                  autoFocus
                />
                <span style={styles.nameStatusIcon}>
                  {nameStatus === 'checking' && <span style={styles.nameSpinner} />}
                  {nameStatus === 'available' && <span style={{ color: '#34d399' }}>✓</span>}
                  {nameStatus === 'taken' && <span style={{ color: '#f87171' }}>✕</span>}
                </span>
              </div>
              {nameStatus === 'taken' && (
                // ΔΙΟΡΘΩΣΗ (code review - "δύο άσχετοι καλεσμένοι σε
                // διαφορετικούς γάμους με το ίδιο όνομα μπλοκάρονται"): το
                // "name" είναι unique σε ΟΛΗ την πλατφόρμα, όχι ανά event
                // (βλ. migration unique_profile_names) - ο παλιός μήνυμα
                // "υπάρχει ήδη" δεν εξηγούσε ΚΑΘΟΛΟΥ γιατί, μπερδεύοντας
                // κάποιον με ένα απολύτως συνηθισμένο όνομα/επώνυμο.
                // Σημείωση: η πλήρης λύση (per-event uniqueness αντί για
                // global) χρειάζεται migration στη βάση - αυτό το μήνυμα
                // είναι ενδιάμεση βελτίωση ώστε τουλάχιστον να ξέρει τι να
                // κάνει αντί να κολλήσει.
                <p style={styles.nameHint}>
                  Αυτό το όνομα το χρησιμοποιεί ήδη κάποιος άλλος λογαριασμός (ακόμα κι αν είναι σε εντελώς άλλον γάμο) - δοκίμασε να προσθέσεις το επώνυμό σου ή ένα αρχικό.
                </p>
              )}
              {nameStatus === 'available' && (
                <p style={{ ...styles.nameHint, color: '#34d399' }}>Διαθέσιμο!</p>
              )}

              {error && <p style={styles.error}>{error}</p>}

              <button
                type="submit"
                style={styles.submitBtn}
                disabled={loading || !name.trim() || nameStatus === 'taken' || nameStatus === 'checking'}
              >
                {loading ? '...' : 'Συνέχεια'}
              </button>
            </form>
          </>
        )}
      </div>
      <style>{`@keyframes authform-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const styles = {
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
    fontSize: '22px',
    fontWeight: '700',
    margin: '0 0 8px 0'
  },
  subtitle: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: '13px',
    margin: '0 0 24px 0',
    lineHeight: 1.4
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
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit'
  },
  codeInput: {
    width: '100%',
    padding: '14px 18px',
    borderRadius: '10px',
    border: '1px solid rgba(217, 181, 74, 0.35)',
    background: 'rgba(255,255,255,0.06)',
    color: 'white',
    fontSize: '22px',
    fontWeight: '700',
    letterSpacing: '8px',
    textAlign: 'center',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit'
  },
  error: {
    color: '#ff9b94',
    fontSize: '13px',
    margin: 0
  },
  nameInputWrap: {
    position: 'relative',
    width: '100%'
  },
  nameStatusIcon: {
    position: 'absolute',
    right: '14px',
    top: '50%',
    transform: 'translateY(-50%)',
    fontSize: '16px',
    fontWeight: '700',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '18px',
    height: '18px'
  },
  nameSpinner: {
    width: '14px',
    height: '14px',
    border: '2px solid rgba(217, 181, 74, 0.25)',
    borderTop: '2px solid #D9B54A',
    borderRadius: '50%',
    display: 'inline-block',
    animation: 'authform-spin 0.7s linear infinite'
  },
  nameHint: {
    margin: '-6px 0 0 0',
    fontSize: '12px',
    color: '#f87171'
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
  },
  switchBtn: {
    marginTop: '18px',
    width: '100%',
    background: 'none',
    border: 'none',
    color: '#D9B54A',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: 'inherit'
  }
};