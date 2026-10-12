import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

// Ρυθμίσεις λογαριασμού - ανοίγει από το γρανάζι στο MyEvents.jsx. Δείχνει:
//  - Φωτογραφία προφίλ (profiles.avatar_url) - upload νέας, bucket "avatars".
//  - Όνομα (profiles.name) - επεξεργάσιμο.
//  - Email (auth.users.email, μέσω profiles.email) - ΜΟΝΟ για ανάγνωση, το
//    email είναι ταυτόχρονα και ο τρόπος σύνδεσης (OTP) οπότε η αλλαγή του
//    θα χρειαζόταν ξεχωριστό flow επιβεβαίωσης - δεν το ανοίγουμε εδώ.
//  - Αγαπημένα (likes) - όλες οι φωτογραφίες που έχει "αγαπήσει" ο χρήστης,
//    από όλα τα events του, με δυνατότητα αφαίρεσης (unlike).
//
// Props: onClose() -> πίσω στο MyEvents, onLogout() -> αποσύνδεση.
export default function AccountSettings({ onClose, onLogout }) {
  const [userId, setUserId] = useState(null);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [originalName, setOriginalName] = useState(''); // το ήδη αποθηκευμένο όνομα - δεν το ξανα-ελέγχουμε σαν "κατειλημμένο" από τον ίδιο
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [savingName, setSavingName] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [favorites, setFavorites] = useState([]);
  const [loadingFavorites, setLoadingFavorites] = useState(true);

  const fileInputRef = useRef(null);

  useEffect(() => {
    loadProfile();
    loadFavorites();
  }, []);

  // Live έλεγχος διαθεσιμότητας ονόματος - βλ. migration
  // "unique_profile_names" (unique index σε lower(name)) στη βάση. Αν το
  // πεδίο είναι ίδιο με το ήδη αποθηκευμένο όνομα (ο χρήστης δεν το άλλαξε
  // ή το ξαναέγραψε ίδιο), δεν το ελέγχουμε καν - είναι ήδη δικό του.
  const [nameStatus, setNameStatus] = useState('idle'); // 'idle' | 'checking' | 'available' | 'taken'
  const nameCheckTimer = useRef(null);

  useEffect(() => {
    const clean = name.trim();
    if (clean.length < 2 || clean.toLowerCase() === originalName.trim().toLowerCase()) {
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
          p_exclude_id: userId || null
        });
        if (rpcError) throw rpcError;
        setNameStatus(data === false ? 'taken' : 'available');
      } catch (err) {
        setNameStatus('idle');
      }
    }, 450);
    return () => clearTimeout(nameCheckTimer.current);
  }, [name, originalName, userId]);

  const loadProfile = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUserId(user.id);
      setEmail(user.email || '');

      const { data: profile } = await supabase
        .from('profiles')
        .select('name, avatar_url, email')
        .eq('id', user.id)
        .single();

      setName(profile?.name || '');
      setOriginalName(profile?.name || '');
      setAvatarUrl(profile?.avatar_url || null);
      if (profile?.email) setEmail(profile.email);
    } catch (err) {
      console.log('load profile error:', err);
    } finally {
      setLoading(false);
    }
  };

  const getPhotoUrl = (path) => {
    if (!path) return null;
    const { data } = supabase.storage.from('photos').getPublicUrl(path);
    return data.publicUrl;
  };

  const loadFavorites = async () => {
    setLoadingFavorites(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setFavorites([]);
        return;
      }
      const { data, error: fetchError } = await supabase
        .from('likes')
        .select('id, created_at, photos(id, file_path, preview_path), events(event_name)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (fetchError) throw fetchError;
      setFavorites((data || []).filter((row) => row.photos));
    } catch (err) {
      console.log('load favorites error:', err);
    } finally {
      setLoadingFavorites(false);
    }
  };

  const handleSaveName = async () => {
    if (!userId || nameStatus === 'taken') return;
    setSavingName(true);
    setError('');
    setSuccess('');
    try {
      const { error: updateError } = await supabase
        .from('profiles')
        .upsert({ id: userId, name: name.trim() });
      if (updateError) {
        if (updateError.code === '23505') {
          setNameStatus('taken');
          throw new Error('Αυτό το όνομα υπάρχει ήδη - διάλεξε άλλο.');
        }
        throw updateError;
      }
      setOriginalName(name.trim());
      setNameStatus('idle');
      setSuccess('Το όνομα αποθηκεύτηκε.');
    } catch (err) {
      setError(err.message || 'Δεν αποθηκεύτηκε το όνομα.');
    } finally {
      setSavingName(false);
    }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;
    e.target.value = '';

    setUploadingAvatar(true);
    setError('');
    setSuccess('');
    try {
      const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      const path = `${userId}/avatar-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(path, file, { cacheControl: '3600', upsert: false, contentType: file.type || 'image/jpeg' });
      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(path);
      const newUrl = publicData.publicUrl;

      const { error: updateError } = await supabase
        .from('profiles')
        .upsert({ id: userId, avatar_url: newUrl });
      if (updateError) throw updateError;

      setAvatarUrl(newUrl);
      setSuccess('Η φωτογραφία προφίλ ενημερώθηκε.');
    } catch (err) {
      setError(err.message || 'Δεν ανέβηκε η φωτογραφία. Δοκίμασε ξανά.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleUnlike = async (likeId) => {
    setFavorites((prev) => prev.filter((f) => f.id !== likeId));
    try {
      await supabase.from('likes').delete().eq('id', likeId);
    } catch (err) {
      console.log('unlike error:', err);
      loadFavorites(); // ξαναφόρτωσε αν κάτι πήγε στραβά, ώστε να μη μείνει ασυνεπές
    }
  };

  const initials = (name || email || '?').trim().charAt(0).toUpperCase();

  return (
    <div style={styles.container} className="klev-viewport">
      <div style={styles.topBar}>
        <button onClick={onClose} style={styles.backBtn} aria-label="Πίσω">
          <BackIcon />
        </button>
        <h1 style={styles.pageTitle}>Ρυθμίσεις λογαριασμού</h1>
        <div style={{ width: '38px', flexShrink: 0 }} />
      </div>

      <div style={styles.scrollArea}>
        {/* Avatar */}
        <div style={styles.avatarSection}>
          <div style={styles.avatarWrap}>
            {avatarUrl ? (
              <img src={avatarUrl} alt="" style={styles.avatarImg} />
            ) : (
              <div style={styles.avatarPlaceholder}>{initials}</div>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              style={styles.avatarEditBtn}
              aria-label="Αλλαγή φωτογραφίας"
              disabled={uploadingAvatar}
            >
              {uploadingAvatar ? '...' : <CameraIcon />}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              style={{ display: 'none' }}
            />
          </div>
        </div>

        {error && <p style={styles.error}>{error}</p>}
        {success && <p style={styles.success}>{success}</p>}

        {/* Όνομα */}
        <div style={styles.field}>
          <label style={styles.label}>Όνομα</label>
          <div style={styles.fieldRow}>
            <div style={styles.nameInputWrap}>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Το όνομά σου"
                style={{
                  ...styles.input,
                  width: '100%',
                  paddingRight: '38px',
                  borderColor:
                    nameStatus === 'taken'
                      ? 'rgba(248, 113, 113, 0.6)'
                      : nameStatus === 'available'
                      ? 'rgba(52, 211, 153, 0.6)'
                      : 'rgba(217, 181, 74, 0.35)'
                }}
                disabled={loading}
              />
              <span style={styles.nameStatusIcon}>
                {nameStatus === 'checking' && <span style={styles.nameSpinner} />}
                {nameStatus === 'available' && <span style={{ color: '#34d399' }}>✓</span>}
                {nameStatus === 'taken' && <span style={{ color: '#f87171' }}>✕</span>}
              </span>
            </div>
            <button
              onClick={handleSaveName}
              style={styles.saveBtn}
              disabled={savingName || loading || nameStatus === 'taken' || nameStatus === 'checking'}
            >
              {savingName ? '...' : 'Αποθήκευση'}
            </button>
          </div>
          {/* ΔΙΟΡΘΩΣΗ (code review) - ίδια εξήγηση με το AuthForm.jsx: το
          όνομα είναι unique σε όλη την πλατφόρμα, όχι ανά event. */}
          {nameStatus === 'taken' && (
            <p style={styles.nameHint}>
              Αυτό το όνομα το χρησιμοποιεί ήδη κάποιος άλλος λογαριασμός (ακόμα κι αν είναι σε εντελώς άλλον γάμο) - δοκίμασε να προσθέσεις το επώνυμό σου ή ένα αρχικό.
            </p>
          )}
        </div>

        {/* Email */}
        <div style={styles.field}>
          <label style={styles.label}>Email</label>
          <div style={styles.readonlyValue}>{email || '—'}</div>
          <p style={styles.hint}>Το email είναι και ο τρόπος σύνδεσής σου - δεν αλλάζει από εδώ.</p>
        </div>

        {/* Αγαπημένα */}
        <div style={styles.field}>
          <label style={styles.label}>Αγαπημένα</label>
          {loadingFavorites ? (
            <p style={styles.stateText}>Φόρτωση...</p>
          ) : favorites.length === 0 ? (
            <p style={styles.stateText}>Δεν έχεις αγαπήσει καμία φωτογραφία ακόμα.</p>
          ) : (
            <div style={styles.favGrid}>
              {favorites.map((fav) => {
                const url = getPhotoUrl(fav.photos?.preview_path || fav.photos?.file_path);
                return (
                  <div key={fav.id} style={styles.favItem}>
                    {url && <img src={url} alt="" style={styles.favImg} />}
                    <button
                      onClick={() => handleUnlike(fav.id)}
                      style={styles.favUnlike}
                      aria-label="Αφαίρεση από αγαπημένα"
                      title="Αφαίρεση από αγαπημένα"
                    >
                      ♥
                    </button>
                    {fav.events?.event_name && (
                      <span style={styles.favEventLabel}>{fav.events.event_name}</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <button onClick={onLogout} style={styles.logoutBtn}>
          Αποσύνδεση
        </button>
      </div>

      <style>{`
        .klev-viewport { height: 100%; }
        @keyframes settings-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
      <path d="M15 5L8 12L15 19" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" width="15" height="15" xmlns="http://www.w3.org/2000/svg">
      <path d="M4 8.5C4 7.67 4.67 7 5.5 7H8L9 5H15L16 7H18.5C19.33 7 20 7.67 20 8.5V17.5C20 18.33 19.33 19 18.5 19H5.5C4.67 19 4 18.33 4 17.5V8.5Z" stroke="#1a2f52" strokeWidth="1.6" strokeLinejoin="round" />
      <circle cx="12" cy="13" r="3.2" stroke="#1a2f52" strokeWidth="1.6" />
    </svg>
  );
}

const styles = {
  container: {
    height: '100%',
    background: '#1a4377',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: "'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    boxSizing: 'border-box',
    position: 'relative',
    overflow: 'hidden'
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 'clamp(14px, 3vh, 22px) clamp(18px, 5vw, 28px) clamp(10px, 2vh, 16px)',
    flexShrink: 0
  },
  backBtn: {
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
  pageTitle: {
    color: 'white',
    fontSize: 'clamp(17px, 2.6vh, 20px)',
    fontWeight: '700',
    margin: 0,
    textAlign: 'center',
    flex: 1
  },
  scrollArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px clamp(18px, 5vw, 28px) 40px',
    boxSizing: 'border-box',
    display: 'flex',
    flexDirection: 'column',
    gap: '26px'
  },
  avatarSection: {
    display: 'flex',
    justifyContent: 'center',
    paddingTop: '8px'
  },
  avatarWrap: {
    position: 'relative',
    width: '96px',
    height: '96px'
  },
  avatarImg: {
    width: '96px',
    height: '96px',
    borderRadius: '50%',
    objectFit: 'cover',
    border: '2px solid rgba(217, 181, 74, 0.4)',
    display: 'block'
  },
  avatarPlaceholder: {
    width: '96px',
    height: '96px',
    borderRadius: '50%',
    border: '2px solid rgba(217, 181, 74, 0.4)',
    background: 'rgba(255,255,255,0.08)',
    color: 'white',
    fontSize: '32px',
    fontWeight: '700',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarEditBtn: {
    WebkitAppearance: 'none',
    appearance: 'none',
    position: 'absolute',
    bottom: '0',
    right: '0',
    width: '30px',
    height: '30px',
    borderRadius: '50%',
    border: '2px solid #1a4377',
    background: 'linear-gradient(135deg, #D9B54A 0%, #C79A2E 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: 0,
    fontSize: '11px',
    color: '#1a2f52',
    fontWeight: '700'
  },
  error: {
    color: '#ff9b94',
    fontSize: '13px',
    margin: 0,
    textAlign: 'center'
  },
  success: {
    color: '#7fd9a8',
    fontSize: '13px',
    margin: 0,
    textAlign: 'center'
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px'
  },
  label: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: '12px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.04em'
  },
  fieldRow: {
    display: 'flex',
    gap: '10px'
  },
  nameInputWrap: {
    position: 'relative',
    flex: 1,
    minWidth: 0
  },
  nameStatusIcon: {
    position: 'absolute',
    right: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    fontSize: '15px',
    fontWeight: '700',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '16px',
    height: '16px'
  },
  nameSpinner: {
    width: '13px',
    height: '13px',
    border: '2px solid rgba(217, 181, 74, 0.25)',
    borderTop: '2px solid #D9B54A',
    borderRadius: '50%',
    display: 'inline-block',
    animation: 'settings-spin 0.7s linear infinite'
  },
  nameHint: {
    margin: 0,
    fontSize: '12px',
    color: '#f87171'
  },
  input: {
    flex: 1,
    minWidth: 0,
    padding: '12px 16px',
    borderRadius: '10px',
    border: '1px solid rgba(217, 181, 74, 0.35)',
    background: 'rgba(255,255,255,0.06)',
    color: 'white',
    fontSize: '15px',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'inherit'
  },
  saveBtn: {
    WebkitAppearance: 'none',
    appearance: 'none',
    padding: '0 18px',
    borderRadius: '10px',
    border: 'none',
    background: 'linear-gradient(135deg, #D9B54A 0%, #C79A2E 100%)',
    color: '#1a2f52',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
    fontFamily: 'inherit',
    flexShrink: 0
  },
  readonlyValue: {
    padding: '12px 16px',
    borderRadius: '10px',
    border: '1px solid rgba(255,255,255,0.12)',
    background: 'rgba(255,255,255,0.03)',
    color: 'rgba(255,255,255,0.75)',
    fontSize: '15px',
    boxSizing: 'border-box'
  },
  hint: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: '12px',
    margin: 0
  },
  stateText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: '13.5px',
    margin: 0
  },
  favGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '10px'
  },
  favItem: {
    position: 'relative',
    aspectRatio: '1 / 1',
    borderRadius: '10px',
    overflow: 'hidden',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(217, 181, 74, 0.2)'
  },
  favImg: {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block'
  },
  favUnlike: {
    WebkitAppearance: 'none',
    appearance: 'none',
    position: 'absolute',
    top: '5px',
    right: '5px',
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    border: 'none',
    background: 'rgba(0,0,0,0.55)',
    color: '#ff6b7a',
    fontSize: '13px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    padding: 0
  },
  favEventLabel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: '4px 6px',
    background: 'linear-gradient(0deg, rgba(0,0,0,0.65), transparent)',
    color: 'white',
    fontSize: '10px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis'
  },
  logoutBtn: {
    WebkitAppearance: 'none',
    appearance: 'none',
    marginTop: '8px',
    padding: '13px',
    borderRadius: '10px',
    border: '1px solid rgba(255, 107, 122, 0.35)',
    background: 'rgba(255, 107, 122, 0.08)',
    color: '#ff9b94',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
    fontFamily: 'inherit'
  }
};