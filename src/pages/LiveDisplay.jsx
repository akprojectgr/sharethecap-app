import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';

const SLIDE_SECONDS = 6;

// Ζωντανή προβολή για TV / projector στο event: βρες την με /display/ΚΩΔΙΚΟΣ
// Δεν χρειάζεται guest session - είναι φτιαγμένη να μένει ανοιχτή σε μια οθόνη όλη τη βραδιά.
export default function LiveDisplay() {
  const { code } = useParams();
  const [event, setEvent] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [current, setCurrent] = useState(0);
  const [notFound, setNotFound] = useState(false);
  const [newBadge, setNewBadge] = useState(false);
  const photosRef = useRef(photos);
  photosRef.current = photos;

  // ΔΙΟΡΘΩΣΗ (code review - "Wake Lock"): χωρίς αυτό, η οθόνη/tablet όπου
  // τρέχει αυτή η προβολή μπορεί να μαυρίσει/κλειδώσει μόνη της μετά το
  // idle-timeout της συσκευής (π.χ. Android/iPad τυπικά 1-5 λεπτά χωρίς
  // άγγιγμα) - ΑΚΡΙΒΩΣ το αντίθετο από το σκοπό αυτής της σελίδας
  // ("μένει ανοιχτή σε μια οθόνη όλη τη βραδιά"). Το Screen Wake Lock API
  // λέει ρητά στο λειτουργικό "μην κλειδώσεις/σβήσεις αυτή την οθόνη".
  // ΔΕΝ υποστηρίζεται σε κάθε browser/συσκευή (π.χ. παλιό iOS Safari) -
  // το ελέγχουμε με 'in' πριν το καλέσουμε, ώστε να αποτυγχάνει σιωπηλά
  // κι όχι να σπάει τη σελίδα. Ξαναζητάμε το lock όταν η σελίδα ξαναγίνεται
  // ορατή, γιατί το λειτουργικό το ακυρώνει αυτόματα όποτε η καρτέλα χάσει
  // visibility (π.χ. κάποιος κλείδωσε στιγμιαία τη συσκευή).
  useEffect(() => {
    let wakeLock = null;
    let released = false;

    const requestWakeLock = async () => {
      if (!('wakeLock' in navigator)) return;
      try {
        wakeLock = await navigator.wakeLock.request('screen');
      } catch (err) {
        console.error('Wake Lock request failed:', err);
      }
    };

    requestWakeLock();

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && !released) {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      released = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      wakeLock?.release().catch(() => {});
    };
  }, []);

  // Φόρτωσε το event από τον κωδικό
  useEffect(() => {
    if (!code) return;
    (async () => {
      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('event_code', code.toUpperCase())
        .single();

      if (error || !data) {
        setNotFound(true);
        return;
      }
      setEvent(data);
    })();
  }, [code]);

  // Φόρτωσε φωτογραφίες + realtime subscription
  useEffect(() => {
    if (!event) return;

    const loadPhotos = async () => {
      const { data, error } = await supabase
        .from('photos')
        .select('*')
        .eq('event_id', event.id)
        .order('created_at', { ascending: false });
      if (!error && data) setPhotos(data);
    };
    loadPhotos();

    const channel = supabase
      .channel('live-display-' + event.id)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'photos', filter: `event_id=eq.${event.id}` },
        (payload) => {
          setPhotos(prev => {
            if (prev.find(p => p.id === payload.new.id)) return prev;
            return [payload.new, ...prev];
          });
          // Πήγαινε αμέσως στη νέα φωτογραφία, να τη δουν όλοι live
          setCurrent(0);
          setNewBadge(true);
          setTimeout(() => setNewBadge(false), 4000);
        }
      )
      // ΔΙΟΡΘΩΣΗ (code review - "σβησμένη φωτογραφία μένει για πάντα στο
      // slideshow"): αυτό το κανάλι άκουγε ΜΟΝΟ INSERT - αν ένας guest σβήσει
      // τη δική του φωτογραφία (κουμπί διαγραφής στο gallery) ενώ η οθόνη του
      // venue (LiveDisplay) τρέχει ασυνόδευτη όλο το βράδυ, το photos state
      // εδώ ΔΕΝ ενημερωνόταν ποτέ - η σβησμένη φωτο έμενε στη λίστα για πάντα,
      // δείχνοντας σπασμένη/μαύρη εικόνα σε κάθε περιστροφή της. Προσθέσαμε
      // DELETE listener που την αφαιρεί αμέσως από το τοπικό state.
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'photos', filter: `event_id=eq.${event.id}` },
        (payload) => {
          setPhotos(prev => prev.filter(p => p.id !== payload.old.id));
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [event]);

  // Auto-advance slideshow
  useEffect(() => {
    if (photosRef.current.length < 2) return;
    const interval = setInterval(() => {
      setCurrent(prev => (prev + 1) % photosRef.current.length);
    }, SLIDE_SECONDS * 1000);
    return () => clearInterval(interval);
  }, [photos.length]);

  // ΔΙΟΡΘΩΣΗ (code review - μαζί με το νέο DELETE listener πιο πάνω): αν
  // μια φωτογραφία διαγραφεί ενώ το "current" δείχνει ΣΕ ΑΥΤΗΝ ή σε κάποια
  // πιο κάτω θέση, το photos.length μικραίνει και το "current" μπορεί να
  // μείνει εκτός ορίων (π.χ. current=5 σε array με 3 στοιχεία πλέον) - το
  // photos[current] γίνεται undefined και το render crasharei αμέσως μετά
  // (photo.media_type). Μαζεύουμε το current μέσα στα νέα όρια.
  useEffect(() => {
    if (photos.length === 0) return;
    if (current >= photos.length) setCurrent(0);
  }, [photos.length, current]);

  const getPhotoUrl = (path) => supabase.storage.from('photos').getPublicUrl(path).data.publicUrl;

  if (notFound) {
    return (
      <div style={styles.centered}>
        <p style={styles.notFoundText}>Δεν βρέθηκε event με αυτόν τον κωδικό.</p>
      </div>
    );
  }

  if (!event) {
    return <div style={styles.centered}><div style={styles.spinner} /></div>;
  }

  if (photos.length === 0) {
    return (
      <div style={styles.centered}>
        <div style={styles.waitingWrap}>
          <span style={styles.waitingIcon}>📸</span>
          <h1 style={styles.waitingTitle}>{event.event_name}</h1>
          <p style={styles.waitingSub}>Σκάναρε τον κωδικό <b>{event.event_code}</b> και ανέβασε την πρώτη φωτογραφία!</p>
        </div>
      </div>
    );
  }

  // ΔΙΟΡΘΩΣΗ: το clamp effect πιο πάνω διορθώνει το "current" ΜΟΝΟ μετά το
  // render (τα effects τρέχουν μετά το commit) - αν μια φωτογραφία σβηστεί
  // ΑΚΡΙΒΩΣ τη στιγμή που ήταν η τελευταία στη λίστα και το "current"
  // έδειχνε εκεί, αυτό ΤΟ ίδιο render θα έκανε photos[current]===undefined
  // και θα crasharε στο photo.media_type παρακάτω, πριν προλάβει να τρέξει
  // το effect. Υπολογίζουμε ασφαλή δείκτη ΕΔΩ, στο ίδιο render.
  const safeCurrent = current < photos.length ? current : 0;
  const photo = photos[safeCurrent];
  // ΔΙΟΡΘΩΣΗ (code review - "μαύρη οθόνη στο βίντεο"): το background εδώ
  // είναι πάντα ένα CSS background-image - ένα .mp4/.mov ΔΕΝ μπορεί ποτέ
  // να αποδοθεί έτσι, οπότε κάθε βίντεο έδειχνε απλά μαύρο στην τηλεόραση/
  // projector. Για βίντεο χρησιμοποιούμε το preview_path - το JPG
  // thumbnail που ήδη παράγεται κατά το ανέβασμα (βλ. useEventPhotos.js) -
  // αντί για το ίδιο το αρχείο βίντεο. Fallback στο file_path μόνο αν για
  // κάποιο λόγο λείπει το preview (π.χ. απέτυχε η δημιουργία thumbnail).
  const isVideoSlide = photo.media_type === 'video';
  const slideImagePath = isVideoSlide ? (photo.preview_path || photo.file_path) : photo.file_path;

  return (
    <div style={styles.container}>
      {/* Ken Burns background */}
      <div key={photo.id} style={{
        ...styles.kenBurns,
        backgroundImage: `url(${getPhotoUrl(slideImagePath)})`
      }} />
      {isVideoSlide && (
        <div style={styles.videoBadge} aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M8 5v14l11-7z" /></svg>
          <span>Βίντεο</span>
        </div>
      )}
      <div style={styles.vignette} />

      {/* Event title, πάνω-αριστερά, διακριτικά */}
      <div style={styles.header}>
        <span style={styles.headerCode}>{event.event_code}</span>
        <h1 style={styles.headerTitle}>{event.event_name}</h1>
      </div>

      {/* Uploader credit, κάτω-δεξιά */}
      <div style={styles.creditCapsule}>
        <div style={styles.creditAvatar}>
          {photo.uploaded_by?.charAt(0).toUpperCase() || 'A'}
        </div>
        <span style={styles.creditName}>{photo.uploaded_by || 'Anonymous'}</span>
      </div>

      {/* "Νέα φωτογραφία" badge */}
      {newBadge && (
        <div style={styles.newBadge}>✨ Νέα φωτογραφία!</div>
      )}

      {/* Progress dots */}
      <div style={styles.dotsRow}>
        {photos.slice(0, 30).map((p, i) => (
          <div key={p.id} style={{
            ...styles.dot,
            ...(i === current ? styles.dotActive : {})
          }} />
        ))}
      </div>

      <style>{`
        @keyframes kenburns {
          0% { transform: scale(1) translate(0, 0); }
          100% { transform: scale(1.12) translate(-1.5%, -1.5%); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes badgePop {
          0% { transform: scale(0.8) translateY(10px); opacity: 0; }
          15% { transform: scale(1) translateY(0); opacity: 1; }
          85% { transform: scale(1) translateY(0); opacity: 1; }
          100% { transform: scale(0.95) translateY(-10px); opacity: 0; }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

const styles = {
  container: {
    position: 'fixed',
    inset: 0,
    background: '#000',
    overflow: 'hidden',
    fontFamily: "'Manrope', sans-serif"
  },
  kenBurns: {
    position: 'absolute',
    inset: '-3%',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    animation: 'kenburns 7s ease-out forwards, fadeIn 1s ease-out'
  },
  videoBadge: {
    position: 'absolute',
    top: '3vh',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 2,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: 'rgba(0,0,0,0.5)',
    color: '#fff',
    padding: '8px 18px',
    borderRadius: '50px',
    fontSize: '1vw',
    fontWeight: 700
  },
  vignette: {
    position: 'absolute',
    inset: 0,
    background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0) 70%, rgba(0,0,0,0.75) 100%)'
  },
  header: {
    position: 'absolute',
    top: '3vh',
    left: '3vw',
    zIndex: 2
  },
  headerCode: {
    display: 'inline-block',
    color: '#d4af37',
    fontSize: '1.1vw',
    fontWeight: 700,
    letterSpacing: '3px',
    marginBottom: '6px',
    textShadow: '0 2px 10px rgba(0,0,0,0.6)'
  },
  headerTitle: {
    margin: 0,
    color: 'white',
    fontSize: '2.4vw',
    fontWeight: 800,
    textTransform: 'uppercase',
    letterSpacing: '2px',
    textShadow: '0 4px 20px rgba(0,0,0,0.7)'
  },
  creditCapsule: {
    position: 'absolute',
    bottom: '4vh',
    right: '3vw',
    zIndex: 2,
    display: 'flex',
    alignItems: 'center',
    gap: '14px',
    background: 'rgba(10, 22, 40, 0.65)',
    backdropFilter: 'blur(12px)',
    padding: '10px 22px 10px 10px',
    borderRadius: '50px',
    border: '1px solid rgba(212, 175, 55, 0.3)'
  },
  creditAvatar: {
    width: '38px',
    height: '38px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #c09e5d 0%, #d4af37 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'white',
    fontWeight: 'bold',
    fontSize: '1vw'
  },
  creditName: {
    color: 'white',
    fontSize: '1.1vw',
    fontWeight: 600
  },
  newBadge: {
    position: 'absolute',
    top: '3vh',
    right: '3vw',
    zIndex: 3,
    background: 'linear-gradient(135deg, #1e5a8e 0%, #c09e5d 100%)',
    color: 'white',
    padding: '10px 22px',
    borderRadius: '50px',
    fontWeight: 700,
    fontSize: '1vw',
    boxShadow: '0 10px 30px rgba(0,0,0,0.4)',
    animation: 'badgePop 4s ease-in-out forwards'
  },
  dotsRow: {
    position: 'absolute',
    bottom: '2vh',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: '6px',
    zIndex: 2
  },
  dot: {
    width: '6px',
    height: '6px',
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.3)'
  },
  dotActive: {
    background: '#d4af37',
    boxShadow: '0 0 8px #d4af37'
  },
  centered: {
    position: 'fixed',
    inset: 0,
    background: '#0A1628',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  notFoundText: {
    color: 'white',
    fontSize: '20px'
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '4px solid rgba(255,255,255,0.2)',
    borderTopColor: '#d4af37',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite'
  },
  waitingWrap: {
    textAlign: 'center',
    padding: '40px'
  },
  waitingIcon: {
    fontSize: '48px',
    display: 'block',
    marginBottom: '20px'
  },
  waitingTitle: {
    color: 'white',
    fontSize: '32px',
    margin: '0 0 15px 0'
  },
  waitingSub: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: '18px'
  }
};