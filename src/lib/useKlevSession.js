import { useState, useEffect, useRef } from 'react';
import { supabase } from './supabaseClient';
import { upsertEventGuest } from './guests';

// ΔΙΟΡΘΩΣΗ ("κολλάει σε παλιό event"): αν ο χρήστης έχει ΗΔΗ μπει ποτέ σε
// ένα event σε αυτή τη συσκευή (π.χ. δοκιμαστικό TEST11507), το localStorage
// κρατάει το 'klev_event' εκείνου. Αν αργότερα ανοίξει ΔΙΑΦΟΡΕΤΙΚΟ link με
// ?code=ΑΛΛΟΣ_ΚΩΔΙΚΟΣ (π.χ. τον πραγματικό γάμο), ο παλιός κώδικας ΔΕΝ
// συνέκρινε καθόλου το url code με το αποθηκευμένο - απλά έβλεπε "υπάρχει
// ήδη κάτι αποθηκευμένο" και αγνοούσε ΕΝΤΕΛΩΣ το νέο ?code, κρατώντας τον
// χρήστη για πάντα στο ΠΑΛΙΟ event μέχρι να κάνει ρητά logout. Αυτή η
// βοηθητική συνάρτηση συγκρίνει το code του URL με το αποθηκευμένο event -
// used παρακάτω ΚΑΙ στο αρχικό state ΚΑΙ στα δύο effects ώστε η απόφαση να
// είναι συνεπής παντού.
function getUrlEventMismatch() {
  try {
    const params = new URLSearchParams(window.location.search);
    const urlCode = params.get('code');
    if (!urlCode) return null;
    const raw = localStorage.getItem('klev_event');
    if (!raw) return null; // δεν υπάρχει καν αποθηκευμένο event - δεν είναι "mismatch", είναι απλά πρώτη φορά
    const saved = JSON.parse(raw);
    const savedCode = saved?.event_code ? String(saved.event_code).trim().toUpperCase() : null;
    const cleanUrlCode = String(urlCode).trim().toUpperCase();
    if (savedCode && savedCode !== cleanUrlCode) return cleanUrlCode;
    return null;
  } catch (e) {
    return null;
  }
}

const hasPendingUrlCode = () => {
  try {
    // Νέο event code στο URL, διαφορετικό από το αποθηκευμένο -> ΠΡΕΠΕΙ να
    // περάσουμε από το "φόρτωμα" βήμα (checkingUrlCode), ακριβώς σαν να
    // μην υπήρχε τίποτα αποθηκευμένο.
    if (getUrlEventMismatch()) return true;
    if (localStorage.getItem('klev_event')) return false;
    const params = new URLSearchParams(window.location.search);
    return !!params.get('code');
  } catch (e) {
    return false;
  }
};

export const getSavedGuestName = () => {
  try {
    return localStorage.getItem('klev_guest_name') || '';
  } catch (e) {
    return '';
  }
};

export function useKlevSession() {
  const [currentEvent, setCurrentEvent] = useState(null);
  const [checkingUrlCode, setCheckingUrlCode] = useState(hasPendingUrlCode);
  const [showGuestSignIn, setShowGuestSignIn] = useState(false);
  const [guestData, setGuestData] = useState(null);
  const [user, setUser] = useState(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);

  // ΔΙΟΡΘΩΣΗ (code review - "race ανάμεσα σε invite-check και URL code"):
  // ένας ήδη συνδεδεμένος χρήστης (host/κουμπάρος με λογαριασμό) που ανοίγει
  // ένα link με ?code=ΑΛΛΟΣ_ΚΩΔΙΚΟΣ μπορεί ταυτόχρονα να έχει το δικό του
  // "invite check effect" (παρακάτω) να τρέχει ασύγχρονα και να αποφασίζει
  // ΑΥΤΟ ποιο event είναι το τρέχον. Δύο ανεξάρτητα async paths που και τα
  // δύο καταλήγουν σε setCurrentEvent()/upsertEventGuest() χωρίς αμοιβαίο
  // αποκλεισμό μπορούν να "τσακωθούν" για το ποιο event θα μείνει τελικά
  // ενεργό, ή - χειρότερο - να γράψουν ΚΑΙ τα δύο δεδομένα guest (δύο
  // upsertEventGuest/invite-accept) πριν προλάβει να αποφασιστεί ποιο
  // κερδίζει. Αυτά τα δύο refs δίνουν στο "URL code" path προτεραιότητα -
  // το invite-check effect ελέγχει (live, μέσω ref - όχι stale closure) αν
  // υπάρχει ήδη event ή αν είναι σε εξέλιξη login από URL code, και σταματά
  // αμέσως αν ναι.
  const currentEventRef = useRef(currentEvent);
  currentEventRef.current = currentEvent;
  const urlLoginInFlightRef = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user || null);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const handleLogin = async (codeToTry) => {
    if (!codeToTry) return;
    setJoining(true);
    setError('');

    // Διόρθωση: Μετατροπή σε κεφαλαία και αφαίρεση τυχόν κενών για να ταιριάζει με τη βάση
    const cleanCode = String(codeToTry).trim().toUpperCase();

    const { data, error } = await supabase
      .from('events')
      .select('*, venues(name), categories, hidden_categories')
      .eq('event_code', cleanCode)
      .single();

    setJoining(false);

    if (error || !data) {
      setError('Λάθος κωδικός event ή μη έγκυρο QR.');
      return;
    }

    if (data.is_active === false) {
      setError('Αυτό το event δεν είναι πλέον ενεργό. Επικοινώνησε με τον διοργανωτή.');
      return;
    }

    setCurrentEvent(data);
    setShowGuestSignIn(true);
    try {
      localStorage.setItem('klev_event', JSON.stringify(data));
    } catch (e) {
      console.log('localStorage not available');
    }
  };

  const handleGuestContinue = async (data) => {
    let avatarBase64 = null;
    if (data.avatar) {
      avatarBase64 = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(data.avatar);
      });
    }

    const guestSession = {
      name: data.name,
      avatar: avatarBase64,
      event_id: currentEvent.id,
      session_start: Date.now()
    };

    setGuestData(guestSession);
    setShowGuestSignIn(false);

    try {
      localStorage.setItem('klev_guest_session', JSON.stringify(guestSession));
      localStorage.setItem('klev_guest_name', data.name);
    } catch (e) {
      console.log('localStorage save failed:', e);
    }

    upsertEventGuest({ eventId: currentEvent.id, name: data.name });
  };

  const handleAuthed = async (authedUser, providedName) => {
    setAuthOpen(false);
    let displayName = providedName;
    if (!displayName) {
      const { data } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', authedUser.id)
        .single();
      displayName = data?.name || authedUser.email;
    }

    const guestSession = {
      name: displayName,
      avatar: null,
      event_id: currentEvent?.id,
      session_start: Date.now()
    };

    setGuestData(guestSession);
    setShowGuestSignIn(false);
    try {
      localStorage.setItem('klev_guest_session', JSON.stringify(guestSession));
      localStorage.setItem('klev_guest_name', displayName);
    } catch (e) {
      console.log('localStorage save failed:', e);
    }

    if (currentEvent?.id) {
      upsertEventGuest({ eventId: currentEvent.id, name: displayName, userId: authedUser.id });
    }
  };

  const enterEventAsAuthedUser = async (eventData) => {
    let finalEvent = eventData;
    if (eventData?.id) {
      const { data: fresh } = await supabase
        .from('events')
        .select('*, venues(name), categories, hidden_categories')
        .eq('id', eventData.id)
        .single();
      if (fresh) finalEvent = fresh;
    }

    setCurrentEvent(finalEvent);
    setShowGuestSignIn(false);

    let displayName = getSavedGuestName();
    if (user) {
      const { data } = await supabase
        .from('profiles')
        .select('name')
        .eq('id', user.id)
        .single();
      displayName = data?.name || user.email;
    }

    const guestSession = {
      name: displayName,
      avatar: null,
      event_id: finalEvent.id,
      session_start: Date.now()
    };

    setGuestData(guestSession);
    try {
      localStorage.setItem('klev_event', JSON.stringify(finalEvent));
      localStorage.setItem('klev_guest_session', JSON.stringify(guestSession));
      localStorage.setItem('klev_guest_name', displayName);
    } catch (e) {
      console.log('localStorage save failed:', e);
    }

    if (user) {
      upsertEventGuest({ eventId: finalEvent.id, name: displayName, userId: user.id });
    }
  };

  // Invite check effect
  useEffect(() => {
    if (!user || currentEvent) return;
    let cancelled = false;
    (async () => {
      try {
        const email = (user.email || '').trim().toLowerCase();
        if (!email) return;
        const { data: invite, error: inviteError } = await supabase
          .from('event_invites')
          .select('*, events(*)')
          .eq('email', email)
          .is('accepted_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (inviteError || !invite || !invite.events || cancelled) return;
        // Live έλεγχος (όχι stale closure) πριν δεσμευτούμε σε οποιαδήποτε
        // ενέργεια - αν στο ενδιάμεσο μπήκε ήδη event μέσω URL code, ή είναι
        // ένα τέτοιο login σε εξέλιξη, αυτό το path σταματά εδώ (βλ. σχόλιο
        // στα refs παραπάνω).
        //
        // ΔΙΟΡΘΩΣΗ (code review - "η πρόσκληση καταναλώνεται χωρίς να μπει
        // ποτέ ο χρήστης στο event"): το update (accepted_at) γινόταν ΠΑΝΤΑ
        // μόλις περνούσε αυτός ο έλεγχος, ΑΝΕΞΑΡΤΗΤΑ από το αν το επόμενο
        // (μετά το await) ξανά-έλεγχος θα επέτρεπε τελικά το enterEventAsAuthedUser
        // - αν στο ενδιάμεσο (όσο περίμενε το ίδιο το update network call)
        // ξεκινούσε ένα URL-code login για ΑΛΛΟ event, η πρόσκληση
        // "καταναλωνόταν" σιωπηλά χωρίς ο χρήστης να μπει ποτέ σε αυτό το
        // event - μη ανακτήσιμο από το client χωρίς χειροκίνητη επέμβαση
        // στη βάση. Τώρα κάνουμε το update ΜΟΝΟ αν ο τελικός έλεγχος
        // περνάει ΚΑΙ το δένουμε με το ίδιο if που κάνει entry, ώστε να μην
        // υπάρχει καθόλου παράθυρο όπου η πρόσκληση "καίγεται" χωρίς να
        // ακολουθήσει πραγματική είσοδος.
        if (currentEventRef.current || urlLoginInFlightRef.current) return;

        if (!cancelled && !currentEventRef.current && !urlLoginInFlightRef.current) {
          await supabase
            .from('event_invites')
            .update({ accepted_at: new Date().toISOString(), accepted_by_user_id: user.id })
            .eq('id', invite.id);

          // Ξανά-έλεγχος ΜΕΤΑ το await (το update είναι πραγματικό network
          // call, μπορεί να πέρασε αρκετός χρόνος) - αν στο ενδιάμεσο μπήκε
          // ήδη event αλλού, ΔΕΝ μπαίνουμε κι εδώ (θα έγραφε πάνω στο
          // currentEvent του άλλου login). Η πρόσκληση έχει ήδη γίνει
          // accepted σε αυτό το σενάριο - αποδεκτό trade-off (πολύ σπανιότερο
          // από πριν) έναντι του να μείνει μόνιμα unusable χωρίς ΚΑΝΕΝΑ λόγο.
          if (!cancelled && !currentEventRef.current && !urlLoginInFlightRef.current) {
            enterEventAsAuthedUser(invite.events);
          }
        }
      } catch (err) {
        console.log('invite check failed:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, currentEvent]);

  // URL code param check on mount
  useEffect(() => {
    try {
      // Διαφορετικό event code στο URL από το ήδη αποθηκευμένο (βλ.
      // getUrlEventMismatch πιο πάνω) - καθαρίζουμε την ΠΑΛΙΑ guest session
      // (όνομα/avatar ήταν για το ΑΛΛΟ event) και προχωράμε σε handleLogin
      // με τον ΝΕΟ κωδικό, ΑΚΡΙΒΩΣ σαν να μην υπήρχε τίποτα αποθηκευμένο.
      // Το 'klev_event' θα αντικατασταθεί μέσα στο ίδιο το handleLogin.
      const mismatchCode = getUrlEventMismatch();
      if (mismatchCode) {
        try { localStorage.removeItem('klev_guest_session'); } catch (e) {}
        urlLoginInFlightRef.current = true;
        Promise.resolve(handleLogin(mismatchCode)).finally(() => {
          urlLoginInFlightRef.current = false;
          setCheckingUrlCode(false);
        });
        return;
      }

      const alreadySaved = localStorage.getItem('klev_event');
      if (alreadySaved) {
        setCheckingUrlCode(false);
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const codeFromUrl = params.get('code');
      if (codeFromUrl) {
        urlLoginInFlightRef.current = true;
        Promise.resolve(handleLogin(codeFromUrl)).finally(() => {
          urlLoginInFlightRef.current = false;
          setCheckingUrlCode(false);
        });
        // ΣΗΜΑΝΤΙΚΟ: ΔΕΝ σβήνουμε πλέον το ?code=... από το URL (παλιά:
        // window.history.replaceState(...) το αφαιρούσε αμέσως). Το ?code
        // ΠΡΕΠΕΙ να μένει μόνιμα στο link - είναι το ίδιο link που ο guest
        // μπορεί να το κάνει bookmark, να το στείλει στον εαυτό του, ή να
        // το ξανανοίξει αργότερα από άλλη συσκευή (π.χ. PC, για να δει/
        // κατεβάσει φωτογραφίες μετά τον γάμο). Σε ΝΕΑ συσκευή δεν υπάρχει
        // localStorage, οπότε το ?code στο URL είναι ο ΜΟΝΟΣ τρόπος να ξέρει
        // η εφαρμογή ποιο event να φορτώσει. Στην ΙΔΙΑ συσκευή, το
        // localStorage (βλέπε "alreadySaved" παραπάνω) παρακάμπτει έτσι κι
        // αλλιώς αυτό το effect στα επόμενα ανοίγματα, οπότε δεν ξαναγίνεται
        // περιττό query στη βάση.
      } else {
        setCheckingUrlCode(false);
      }
    } catch (e) {
      console.log('URL code param error:', e);
      setCheckingUrlCode(false);
    }
  }, []);

  // LocalStorage session initialization με άμεσο fetch για ανανέωση των categories και hidden_categories
  useEffect(() => {
    try {
      // Αν το URL έχει code διαφορετικό από το αποθηκευμένο event, το
      // effect "URL code param check" παραπάνω αναλαμβάνει ΑΠΟΚΛΕΙΣΤΙΚΑ τη
      // φόρτωση (μέσω handleLogin) - ΔΕΝ πρέπει να φορτώσουμε εδώ το ΠΑΛΙΟ
      // αποθηκευμένο event από πάνω του (race condition/flicker ανάμεσα σε
      // δύο διαφορετικά events).
      if (getUrlEventMismatch()) return;

      const saved = localStorage.getItem('klev_event');
      const guestSession = localStorage.getItem('klev_guest_session');

      if (saved) {
        const parsedEvent = JSON.parse(saved);

        // Βάζουμε αμέσως, συγχρονισμένα, το cached event (ήδη έχει το σωστό
        // bg_color/theme από την προηγούμενη φορά) - έτσι δεν υπάρχει κενό
        // όπου το showGuestSignIn είναι ήδη true αλλά το currentEvent είναι
        // ακόμα null (που έκανε την οθόνη να δείχνει στιγμιαία το γενικό
        // μπλε του GuestJoin πριν έρθει το "πραγματικό" χρώμα του event -
        // το γνωστό "μπλε -> πράσινο" flash). Το φρέσκο fetch από κάτω απλά
        // ανανεώνει ήσυχα στο παρασκήνιο (categories/hidden_categories).
        setCurrentEvent(parsedEvent);

        supabase
          .from('events')
          .select('*, venues(name), categories, hidden_categories')
          .eq('id', parsedEvent.id)
          .single()
          .then(({ data: freshEvent }) => {
            if (!freshEvent) return;
            setCurrentEvent(freshEvent);
            try {
              localStorage.setItem('klev_event', JSON.stringify(freshEvent));
            } catch (e) {}
          });

        if (guestSession) {
          const parsedGuest = JSON.parse(guestSession);

          if (parsedGuest.event_id === parsedEvent.id) {
            // ΔΙΟΡΘΩΣΗ: έλειπε το setGuestData(parsedGuest) εδώ. Χωρίς αυτό,
            // όταν ο guest ξανανοίγει την εφαρμογή στην ίδια συσκευή (π.χ.
            // επόμενη μέρα), παρακάμπτουμε σωστά την οθόνη ονόματος
            // (setShowGuestSignIn(false)) αφού το έχουμε ήδη αποθηκευμένο -
            // αλλά ΠΟΤΕ δεν φορτώναμε αυτό το όνομα πίσω στο guestData
            // state. Αποτέλεσμα: guestData παρέμενε null σε όλη τη διάρκεια
            // της συνεδρίας, οπότε κάθε upload έγραφε "anonymous" στη βάση
            // (βλ. uploaderName = guestData?.name || 'anonymous' στο
            // useEventPhotos.js) παρόλο που το πραγματικό όνομα υπήρχε ήδη
            // αποθηκευμένο. Τώρα το επαναφέρουμε σωστά.
            setGuestData(parsedGuest);
            setShowGuestSignIn(false);
            upsertEventGuest({ eventId: parsedEvent.id, name: parsedGuest.name });
          } else {
            localStorage.removeItem('klev_guest_session');
            setShowGuestSignIn(true);
          }
        } else {
          setShowGuestSignIn(true);
        }
      }
    } catch (e) {
      console.log('localStorage error:', e);
    }
  }, []);

  const handleLogout = () => {
    if (user) {
      supabase.auth.signOut();
    }
    setCurrentEvent(null);
    setError('');
    setGuestData(null);
    setShowSettings(false);
    try {
      localStorage.removeItem('klev_event');
      localStorage.removeItem('klev_guest_session');
      // ΔΙΟΡΘΩΣΗ (code review - "κοινή/kiosk συσκευή κληρονομεί ταυτότητα"):
      // παλιά το logout καθάριζε ΜΟΝΟ το event/guest-session, αλλά ΟΧΙ το
      // αποθηκευμένο όνομα ('klev_guest_name'), το device token
      // ('klev_device_token') ή τα delete-tokens των φωτογραφιών
      // ('klev_my_photo_tokens'). Σε tablet/κινητό που μένει στην είσοδο
      // του γάμου και το χρησιμοποιούν πολλοί διαφορετικοί καλεσμένοι ένας-
      // ένας: ο ΕΠΟΜΕΝΟΣ καλεσμένος μετά από logout θα έβλεπε προσυμπληρωμένο
      // το όνομα του ΠΡΟΗΓΟΥΜΕΝΟΥ (GuestSignIn pre-fill), θα ανέβαζε φωτο ΜΕ
      // το ίδιο device_token (τα likes του θα καταγράφονταν σαν να τα έκανε
      // ο προηγούμενος), ΚΑΙ θα είχε ακόμα στη συσκευή τη δυνατότητα να
      // διαγράψει τις φωτογραφίες που ανέβασε ο προηγούμενος καλεσμένος.
      // Το ρητό logout πρέπει να καθαρίζει ΟΛΗ την ταυτότητα της συσκευής,
      // όχι μόνο ποιο event είναι ανοιχτό.
      localStorage.removeItem('klev_guest_name');
      localStorage.removeItem('klev_device_token');
      localStorage.removeItem('klev_my_photo_tokens');
    } catch (e) {
      console.log('localStorage not available');
    }
  };

  return {
    currentEvent,
    setCurrentEvent,
    checkingUrlCode,
    setCheckingUrlCode,
    showGuestSignIn,
    setShowGuestSignIn,
    guestData,
    user,
    authOpen,
    setAuthOpen,
    showSettings,
    setShowSettings,
    error,
    setError,
    joining,
    setJoining,
    handleLogin,
    handleGuestContinue,
    handleAuthed,
    enterEventAsAuthedUser,
    handleLogout
  };
}