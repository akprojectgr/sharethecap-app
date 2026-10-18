import React, { useState, useEffect, useMemo } from 'react';
import { checkGuestNameTaken } from '../lib/guests';
import { containsProfanity } from '../lib/profanityFilter';
import { useLanguage } from '../lib/i18n';

function hexToRgba(hex, alpha) {
  if (!hex) return null;
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(full, 16);
  if (Number.isNaN(num)) return null;
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ΣΗΜΑΝΤΙΚΟ (iOS keyboard fix - v2): Η πρώτη προσπάθεια έδενε το ΥΨΟΣ του
// container στο visualViewport.height. Αυτό ήταν λάθος: μόλις το
// container μίκραινε, έπαυε να καλύπτει ολόκληρο τον γονικό container
// (.klev-shell-inner), και αποκαλυπτόταν το φόντο ΤΟΥ ΓΟΝΙΚΟΥ (η θαμπωμένη
// φωτογραφία-banner του AppShell) στο κενό που έμενε από κάτω - ακριβώς το
// μπλε/σκούρο gradient που φάνηκε στο screenshot.
//
// Σωστή προσέγγιση: το container ΠΑΝΤΑ καλύπτει 100% (ποτέ δεν αποκαλύπτει
// τίποτα από πίσω του). Αντί να αλλάζουμε το ύψος του, προσθέτουμε ένα
// δυναμικό padding-bottom ΙΣΟ με το ύψος του πληκτρολογίου - αυτό σπρώχνει
// το flex περιεχόμενο (spacerTop/middle/spacerBottom/fabRow) να χωρέσει
// μέσα στον ορατό χώρο ΠΑΝΩ από το πληκτρολόγιο, χωρίς ποτέ να μικραίνει
// το ίδιο το container.
function useKeyboardInset() {
  const [inset, setInset] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return undefined;
    const vv = window.visualViewport;
    const update = () => {
      // Πόσο "κρύβεται" κάτω από το πληκτρολόγιο/κάτω άκρο - η διαφορά
      // ανάμεσα στο πλήρες ύψος του layout viewport και στο πραγματικά
      // ορατό (visual) viewport, αφαιρώντας και τυχόν κάθετο offset.
      const gap = window.innerHeight - vv.height - vv.offsetTop;
      setInset(gap > 0 ? gap : 0);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return inset;
}

export default function GuestSignIn({ event, onContinue, defaultName = '' }) {
  const { language, setLanguage, t } = useLanguage();
  const bannerUrl = event?.banner_url;

  const keyboardInset = useKeyboardInset();

  // Ξαναφέραμε το φωτο-carousel (είχε αφαιρεθεί σε προηγούμενη minimal
  // εκδοχή) - μπαίνει τώρα κάτω από το λογότυπο, όπως ζητήθηκε.
  const photos = useMemo(() => {
    const all = [bannerUrl, ...(Array.isArray(event?.extra_banner_urls) ? event.extra_banner_urls : [])];
    return [...new Set(all.filter(Boolean))];
  }, [bannerUrl, event?.extra_banner_urls]);

  const [activePhoto, setActivePhoto] = useState(0);

  useEffect(() => {
    if (photos.length < 2) return;
    const timer = setInterval(() => {
      setActivePhoto((i) => (i + 1) % photos.length);
    }, 6500);
    return () => clearInterval(timer);
  }, [photos.length]);

  // ΣΗΜΑΝΤΙΚΟ: το bg_color ανά event μπορεί να είναι σκούρο (navy, μαύρο,
  // πράσινο κ.λπ.) - το προηγούμενο "Bond-style" πείραμα υπέθετε λάθος
  // ανοιχτό φόντο και χρησιμοποιούσε σχεδόν μαύρο κείμενο, που γινόταν
  // αόρατο σε σκούρο φόντο. Τώρα το κείμενο είναι πάντα ανοιχτόχρωμο
  // (λευκό/χρυσό), όπως και το υπόλοιπο app. Το default (όταν δεν έχει
  // οριστεί bg_color) ταιριάζει πλέον με το πραγματικό dark theme του
  // PhotoGallery/FloatingAddMenu (#1F231B) αντί για το navy που είχα
  // βάλει αυθαίρετα πριν.
  const customBg = event?.bg_color;
  const resolvedBg = customBg || '#1F231B';
  const containerStyle = {
    ...styles.container,
    background: resolvedBg,
    // Το container μένει ΠΑΝΤΑ 100% - δεν καλύπτει ποτέ λιγότερο από τον
    // γονικό του, άρα δεν αποκαλύπτεται ποτέ το φόντο πίσω του. Το
    // padding-bottom είναι αυτό που "τρώει" τον χώρο του πληκτρολογίου -
    // βλ. useKeyboardInset() πιο πάνω.
    paddingBottom: `calc(32px + env(safe-area-inset-bottom) + ${keyboardInset}px)`
  };

  // Το γραμμένο όνομα μένει ΠΑΝΤΑ λευκό - όχι event.font_color. Το
  // font_color ανά event μπορεί να είναι οποιοδήποτε χρώμα (π.χ. θαμπό
  // λαδί-πράσινο σε αυτό το event) και πάνω σε σκούρο φόντο γίνεται
  // δυσανάγνωστο (ίδιο πρόβλημα με το προηγούμενο θαμπό χρυσό). Το
  // font_color χρησιμοποιείται μόνο για μικρές λεπτομέρειες-accent (το
  // περίγραμμα του πλαισίου εισαγωγής ονόματος), όχι για το κυρίως κείμενο.
  const customFont = event?.font_color;
  const nameInputStyle = styles.nameInput;
  const inputBoxStyle = customFont
    ? { ...styles.inputBox, borderColor: hexToRgba(customFont, 0.55) }
    : styles.inputBox;

  const [guestName, setGuestName] = useState(defaultName);

  // ΣΗΜΑΝΤΙΚΟ (mobile bug fix): το autoFocus στο input πιο κάτω άνοιγε
  // αυτόματα το πληκτρολόγιο μόλις φόρτωνε η σελίδα στο κινητό. Το iOS
  // Safari τότε κάνει αυτόματο scroll-into-view του input ΠΡΙΝ καν
  // σταθεροποιηθεί το layout (ειδικά μέσα σε fixed-position wrapper, βλ.
  // .klev-shell-outer στο AppShell) - αυτό είναι που έκοβε το λογότυπο/
  // πάνω μέρος της φωτογραφίας απ' έξω από την οθόνη σε screenshots από
  // κινητό. Λύση: autoFocus ΜΟΝΟ σε desktop/mouse (pointer: fine) - σε
  // κινητό ο guest πατάει μόνος του το input, δεν χρειάζεται να ανοίγει
  // το πληκτρολόγιο μόνο του (ήταν έτσι κι αλλιώς κακό UX pattern).
  const [shouldAutoFocus] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(pointer: fine)').matches;
  });

  // Name validator: "1 άτομο ανά entry" - αν το ίδιο ακριβώς όνομα το έχει
  // ήδη πάρει ΑΛΛΗ συσκευή σε αυτό το event, μπλοκάρουμε το Join Party
  // μέχρι να το αλλάξει (π.χ. να προσθέσει επώνυμο). Debounced check 450ms
  // μετά το τελευταίο πάτημα πλήκτρου, ώστε να μην κάνουμε ένα query σε
  // κάθε χαρακτήρα.
  const [nameTaken, setNameTaken] = useState(false);
  const [checkingName, setCheckingName] = useState(false);

  useEffect(() => {
    const trimmed = guestName.trim();
    if (trimmed.length < 2 || !event?.id) {
      setNameTaken(false);
      setCheckingName(false);
      return;
    }
    let cancelled = false;
    setCheckingName(true);
    const timer = setTimeout(async () => {
      // ΔΙΟΡΘΩΣΗ (QA test σε πραγματικές συνθήκες δικτύου - Desktop Chrome
      // "κόλλησε" μόνιμα στο κουμπί Join Party απενεργοποιημένο): αν το
      // checkGuestNameTaken πετάξει exception (π.χ. πραγματικό network
      // failure πριν καν απαντήσει ο server - το Supabase client ΔΕΝ το
      // επιστρέφει πάντα ως {error}, μπορεί να κάνει throw), το setCheckingName(false)
      // ΔΕΝ έτρεχε ποτέ -> το κουμπί έμενε disabled ΓΙΑ ΠΑΝΤΑ χωρίς κανένα
      // μήνυμα στον guest. Τώρα, ό,τι και να γίνει, ανοίγουμε ξανά το
      // κουμπί (fail-open - ίδια λογική με το ήδη υπάρχον fallback μέσα στο
      // checkGuestNameTaken για το {error} περίπτωση).
      let taken = false;
      try {
        taken = await checkGuestNameTaken({ eventId: event.id, name: trimmed });
      } catch (err) {
        console.log('checkGuestNameTaken threw', err?.message);
        taken = false;
      } finally {
        if (!cancelled) {
          setNameTaken(taken);
          setCheckingName(false);
        }
      }
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [guestName, event?.id]);

  // Client-side φίλτρο ακατάλληλων λέξεων στο όνομα - συγχρονισμένο (τοπικό
  // regex, όχι network call), οπότε το useMemo αρκεί χωρίς debounce.
  const hasProfanity = useMemo(() => containsProfanity(guestName), [guestName]);

  // ΔΙΟΡΘΩΣΗ (code review - "προλαβαίνει να πατήσει Join Party πριν βγει το
  // αποτέλεσμα"): το checkingName (true όσο εκκρεμεί το debounced query σε
  // αργό venue wifi) δεν μπλόκαρε το κουμπί - ο guest μπορούσε να πατήσει
  // Join Party ΜΕΣΑ στο παράθυρο των ~450ms+network πριν φανεί "το όνομα
  // υπάρχει ήδη" και να μπει στο event με όνομα που θα απορριφθεί μετά.
  const canContinue = !!guestName.trim() && !nameTaken && !hasProfanity && !checkingName;

  // Ίδιο pattern με το FloatingAddMenu (uploading -> opacity 0.6 στο ίδιο
  // κουμπί) αντί για ξεχωριστό γκρι/λευκό "disabled" χρώμα - το κουμπί
  // μένει πάντα κεραμιδί, απλά πιο ξεθωριασμένο όσο δεν μπορεί να προχωρήσει.
  const fabStyle = canContinue ? styles.fab : { ...styles.fab, ...styles.fabDisabled };

  const handleContinue = () => {
    if (canContinue) {
      onContinue({ name: guestName });
    }
  };

  return (
    <div style={containerStyle} className="klev-viewport">

      {/* ΝΕΟ (i18n): Language picker - EN/EL. ΣΗΜΑΝΤΙΚΟ: οι περισσότεροι
      guests μπαίνουν εδώ ΚΑΤΕΥΘΕΙΑΝ μέσω QR/link (?code=... στο URL,
      παρακάμπτει εντελώς το GuestJoin.jsx - βλ. useKlevSession.js, "URL
      code param check on mount") - άρα αυτή είναι συχνά η ΠΡΩΤΗ και ΜΟΝΗ
      οθόνη όπου μπορούν να αλλάξουν γλώσσα πριν μπουν στο event. */}
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

      {/* Πάνω ζώνη - μόνο το κανονικό λογότυπο, κεντραρισμένο. Το avatar
      upload αφαιρέθηκε: χωρίς account δεν είχε πουθενά να "ζωντανέψει"
      (δεν εμφανιζόταν στη φωτογαλερί), οπότε ήταν απλά τριβή πριν καν
      μπει ο guest στο πάρτι. */}
      <div style={styles.top}>
        <img src="/Logo3.svg" alt="Sharethecap" style={styles.logo} />
      </div>

      {/* Φωτογραφία του event - κάτω από το λογότυπο, με ωραία κάρτα. */}
      {photos.length > 0 && (
        <div style={styles.photoCard}>
          {photos.map((url, i) => (
            <img
              key={url}
              src={url}
              alt=""
              style={{ ...styles.photoCardImg, opacity: i === activePhoto ? 1 : 0 }}
            />
          ))}
        </div>
      )}

      <div style={styles.spacerTop} />

      {/* Κεντρική ζώνη - το ονοματεπώνυμο, όχι απλά "όνομα": ένα μόνο μικρό
      όνομα (π.χ. "Γιάννης") δεν αρκεί για να ξέρει το ζευγάρι ποιος είναι
      πραγματικά - μπορεί να υπάρχουν πολλοί καλεσμένοι με το ίδιο μικρό
      όνομα. Το placeholder-παράδειγμα μέσα στο input καθοδηγεί τον guest
      να γράψει και επώνυμο, χωρίς να το κάνουμε υποχρεωτικό/validated
      (θα ήταν επιπλέον τριβή). */}
      <div style={styles.middle}>
        <p style={styles.actionHint}>{t('guestSignIn.label')}</p>
        {/* ΔΙΟΡΘΩΣΗ (design review - "δεν είναι ξεκάθαρο ότι είναι πεδίο"):
        πριν ήταν μόνο κείμενο + λεπτή γραμμή από κάτω - έμοιαζε με απλή
        ετικέτα, όχι με κάτι πατήσιμο/επεξεργάσιμο. Μεγαλύτεροι σε ηλικία
        καλεσμένοι δεν θα καταλάβαιναν ότι μπορούν να γράψουν εκεί. Τώρα:
        (1) ορατό πλαίσιο με φόντο/περίγραμμα γύρω από το input - μοιάζει
        με πραγματικό text field, (2) συγκεκριμένο παράδειγμα στο
        placeholder ("π.χ. Γιάννης Παπαδόπουλος") αντί για γενικό "Το
        όνομά σου" - δείχνει ΚΑΙ ότι είναι πεδίο ΚΑΙ τι ακριβώς να γραφτεί
        (ονοματεπώνυμο, όχι μόνο μικρό όνομα), (3) μικρό εικονίδιο μολυβιού
        μέσα στο πλαίσιο - επιπλέον οπτικό σήμα "εδώ γράφεις". */}
        <div style={inputBoxStyle}>
          <input
            type="text"
            className="klev-name-input"
            placeholder={t('guestSignIn.namePlaceholder')}
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            style={nameInputStyle}
            maxLength={40}
            autoFocus={shouldAutoFocus}
            // autoComplete="off": μειώνει (δεν εγγυάται 100% αφαίρεση - το
            // ελέγχει το ίδιο το Safari) την εμφάνιση του native AutoFill
            // bar (κλειδί/κάρτα/τοποθεσία) πάνω από το πληκτρολόγιο - αυτό
            // είναι OS-level Safari UI, όχι κάτι της ιστοσελίδας μας, οπότε
            // δεν μπορεί να αφαιρεθεί πλήρως από εδώ.
            autoComplete="off"
            onKeyPress={(e) => {
              if (e.key === 'Enter' && canContinue) {
                handleContinue();
              }
            }}
          />
          <svg style={styles.inputIcon} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </div>
        {hasProfanity ? (
          <p style={styles.nameWarning}>
            {t('guestSignIn.profanityWarning')}
          </p>
        ) : nameTaken ? (
          <p style={styles.nameWarning}>
            {t('guestSignIn.nameTakenWarning')}
          </p>
        ) : (
          <p style={styles.nameFootnote}>{t('guestSignIn.footnote')}</p>
        )}
      </div>

      {/* ΔΙΟΡΘΩΣΗ (design review, 3η προσπάθεια): το spacerBottom ήταν
      flex-grow - δηλαδή "αναλογία" πάνω στον ΔΙΑΘΕΣΙΜΟ χώρο, όχι απόλυτο
      μέγεθος. Μειώνοντας τις τιμές spacerTop/spacerBottom ΑΝΑΛΟΓΙΚΑ (π.χ.
      0.6/1.8 -> 0.3/0.9, ίδιος λόγος 1:3) ΔΕΝ αλλάζει καθόλου το
      αποτέλεσμα - το flexbox μοιράζει ΟΛΟ τον διαθέσιμο χώρο ανάμεσά τους
      με βάση τον λόγο, ό,τι απόλυτες τιμές κι αν έχουν· γι' αυτό η
      προηγούμενη αλλαγή δεν φάνηκε καθόλου στην οθόνη.
      Σωστή λύση: το κουμπί κολλάει τώρα ΑΜΕΣΩΣ κάτω από το πεδίο ονόματος
      με ΣΤΑΘΕΡΟ (όχι flex) marginTop - έτσι η απόσταση πεδίο->κουμπί είναι
      πάντα μικρή/σταθερή. Το όποιο "περίσσιο" κενό χώρο (σε ψηλές οθόνες)
      πάει τώρα στο flex-grow spacer ΜΕΤΑ το κουμπί - δηλαδή στο κάτω άκρο
      της κάρτας, όχι ανάμεσα στο περιεχόμενο και στο CTA. */}
      <div style={styles.fabRow}>
        <button
          type="button"
          onClick={handleContinue}
          disabled={!canContinue}
          style={fabStyle}
          className={canContinue ? 'klev-fab klev-fab-active' : 'klev-fab'}
        >
          <span style={styles.fabText}>{t('guestSignIn.continue')}</span>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
          <span className="klev-fab-shimmer" aria-hidden="true" />
        </button>
      </div>

      {/* Απορροφά τον όποιο περίσσιο χώρο ΜΕΤΑ το κουμπί (κάτω άκρο της
      κάρτας) αντί να μένει ανάμεσα στο πεδίο και στο κουμπί. */}
      <div style={styles.spacerAfterButton} />

      <style>{`
        /* Ταιριάζει το φόντο του browser chrome (html/body) με το σκούρο
        θέμα της εφαρμογής - αν χωρίς αυτό γινόταν έστω ένα ελάχιστο
        rubber-band bounce σε iOS Safari, θα φαινόταν λευκό/μπλε πίσω από
        το app αντί για το σωστό σκούρο χρώμα. */
        html, body {
          background: ${resolvedBg};
        }
        .klev-viewport {
          /* "absolute" αντί για "fixed": σε desktop είναι μέσα στην
          κεντραρισμένη κάρτα (βλ. AppShell στο App.jsx) - fixed θα το έκανε
          να ξεχειλίζει σε όλη την πραγματική οθόνη. Σε mobile η κάρτα
          γεμίζει έτσι κι αλλιώς όλη την οθόνη, οπότε δεν αλλάζει τίποτα εκεί.
          Το ύψος ΠΑΝΤΑ 100% (inset:0) - ΔΕΝ μικραίνει ποτέ όταν ανοίγει το
          πληκτρολόγιο (αυτό αποκάλυπτε το φόντο του γονικού container).
          Αντί γι' αυτό, το padding-bottom στο containerStyle αλλάζει
          δυναμικά (βλ. useKeyboardInset πιο πάνω) ώστε το περιεχόμενο να
          μαζεύεται μέσα στο ορατό ύψος πάνω από το πληκτρολόγιο. */
          position: absolute;
          inset: 0;
          overflow-y: auto;
          -webkit-overflow-scrolling: touch;
          /* Εμποδίζει το "rubber-band" bounce scroll της iOS Safari να
          αποκαλύψει ό,τι υπάρχει πίσω από τη σελίδα όταν κάποιος σέρνει
          πέρα από τα όριά της - αυτό ήταν το "δεν μένει σταθερό, εμφανίζεται
          μπλε φόντο". */
          overscroll-behavior: none;
        }
        .klev-name-input::placeholder {
          font-size: clamp(14px, 4vw, 16px);
          font-weight: 500;
          /* Λίγο πιο ορατό από πριν (0.28 -> 0.42) - δυσκολότερο να
          μπερδευτεί με ήδη-γραμμένο κείμενο, ευκολότερο να διαβαστεί από
          μεγαλύτερους σε ηλικία καλεσμένους. */
          color: rgba(255,255,255,0.42);
        }
        .klev-fab {
          position: relative;
          overflow: hidden;
        }
        .klev-fab-shimmer {
          position: absolute;
          top: 0;
          left: -60%;
          width: 40%;
          height: 100%;
          background: linear-gradient(
            75deg,
            rgba(255,255,255,0) 0%,
            rgba(255,255,255,0.35) 50%,
            rgba(255,255,255,0) 100%
          );
          transform: skewX(-20deg);
          pointer-events: none;
        }
        .klev-fab-active .klev-fab-shimmer {
          animation: klevShimmer 3.2s ease-in-out infinite;
        }
        @keyframes klevShimmer {
          0% { left: -60%; }
          22% { left: 140%; }
          100% { left: 140%; }
        }
        .klev-fab-active {
          animation: klevGlowPulse 2.6s ease-in-out infinite;
        }
        @keyframes klevGlowPulse {
          0%, 100% { box-shadow: 0 10px 24px rgba(142, 62, 18, 0.4); }
          50% { box-shadow: 0 10px 30px rgba(142, 62, 18, 0.62); }
        }
      `}</style>
    </div>
  );
}

const styles = {
  container: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
    position: 'relative',
    boxSizing: 'border-box',
    padding: 'calc(24px + env(safe-area-inset-top)) 24px calc(32px + env(safe-area-inset-bottom))'
  },
  top: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  langSwitcher: {
    position: 'absolute',
    top: 'calc(14px + env(safe-area-inset-top))',
    right: '16px',
    display: 'flex',
    gap: '4px',
    padding: '3px',
    borderRadius: '999px',
    background: 'rgba(255,255,255,0.08)',
    border: '1px solid rgba(230, 197, 148, 0.3)',
    zIndex: 3
  },
  // ΔΙΟΡΘΩΣΗ (design review - "η γραμματοσειρά εδώ φαίνεται ξεχωριστή"):
  // τα <button> ΔΕΝ κληρονομούν αυτόματα το font-family της σελίδας στους
  // browsers (έχουν δικό τους, του λειτουργικού, εκτός αν οριστεί ρητά) -
  // γι' αυτό το "EN/EL" έδειχνε με διαφορετική γραμματοσειρά από το
  // υπόλοιπο κείμενο (που είναι μέσα σε <p>/<h2>, όπου η κληρονομικότητα
  // δουλεύει κανονικά). fontFamily: 'inherit' το διορθώνει.
  langBtn: {
    WebkitAppearance: 'none',
    appearance: 'none',
    border: 'none',
    background: 'transparent',
    color: 'rgba(255,255,255,0.55)',
    fontFamily: 'inherit',
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '0.4px',
    padding: '5px 10px',
    borderRadius: '999px',
    cursor: 'pointer'
  },
  langBtnActive: {
    WebkitAppearance: 'none',
    appearance: 'none',
    border: 'none',
    background: 'linear-gradient(135deg, #E6C594 0%, #C79A2E 100%)',
    color: '#1F231B',
    fontFamily: 'inherit',
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '0.4px',
    padding: '5px 10px',
    borderRadius: '999px',
    cursor: 'pointer'
  },
  logo: {
    height: '26px',
    width: 'auto',
    maxWidth: '55%',
    objectFit: 'contain'
  },
  photoCard: {
    width: '100%',
    maxWidth: '360px',
    aspectRatio: '16 / 10',
    borderRadius: '16px',
    overflow: 'hidden',
    border: '1px solid rgba(230, 197, 148, 0.28)',
    marginTop: '18px',
    flexShrink: 0,
    position: 'relative',
    boxShadow: '0 14px 30px rgba(0,0,0,0.35)'
  },
  photoCardImg: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block',
    transition: 'opacity 1.8s ease-in-out'
  },
  // ΔΙΟΡΘΩΣΗ (design review, τελική προσέγγιση): το spacerTop ΗΤΑΝ
  // flex-grow - αν άφηνα το spacerBottom να γίνει fixed/μικρό (βλ. fabRow
  // marginTop πιο κάτω) ενώ αυτό έμενε flex-grow, θα απορροφούσε ΟΛΟ το
  // περίσσιο κενό ΜΟΝΟ ΤΟΥ - θα μεγάλωνε αντί να μικρύνει. Τώρα είναι
  // ΣΤΑΘΕΡΟ (fixed height) μικρό κενό ανάμεσα στη φωτογραφία και στο
  // πεδίο· όλο το όποιο περίσσιο κενό σε ψηλές οθόνες πάει στο
  // spacerAfterButton (μετά το κουμπί, στο κάτω άκρο της κάρτας) - δες
  // σχόλιο εκεί. Στο keyboard-squeeze: αφού δεν έχει flex, δεν συρρικνώνεται
  // πλέον αυτό όταν ανοίγει το πληκτρολόγιο - ΔΕΝ πειράζει, είναι ήδη μικρό
  // (28px) και η ουσιαστική "απορρόφηση" χώρου γίνεται από το
  // spacerAfterButton, που έχει flexShrink ελεύθερο να πάει στο 0.
  spacerTop: {
    height: '28px',
    flexShrink: 0
  },
  middle: {
    width: '100%',
    maxWidth: '360px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    flexShrink: 0
  },
  actionHint: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: '13px',
    fontWeight: '600',
    letterSpacing: '0.3px',
    margin: '0 0 16px 0'
  },
  // ΝΕΟ (design review): πραγματικό "κουτί" πεδίου - ορατό background +
  // περίγραμμα + στρογγυλεμένες γωνίες, αντί για γυμνό κείμενο με μια
  // λεπτή γραμμή. Σκοπός: να φαίνεται ΑΜΕΣΩΣ, και σε κάποιον που δεν είναι
  // εξοικειωμένος με minimal web UI, ότι εδώ μπορεί να πατήσει και να
  // γράψει (σαν ένα κανονικό "κουτάκι φόρμας").
  inputBox: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '10px',
    background: 'rgba(255,255,255,0.07)',
    border: '1.5px solid rgba(230, 197, 148, 0.4)',
    borderRadius: '16px',
    padding: '16px 18px',
    boxSizing: 'border-box',
    boxShadow: '0 6px 18px rgba(0,0,0,0.18)'
  },
  nameInput: {
    flex: 1,
    minWidth: 0,
    background: 'none',
    border: 'none',
    outline: 'none',
    textAlign: 'center',
    color: 'white',
    fontSize: 'clamp(19px, 5.5vw, 22px)',
    fontWeight: '700',
    fontFamily: "'Helvetica Neue', Arial, sans-serif",
    lineHeight: 1.3,
    padding: 0,
    boxSizing: 'border-box'
  },
  inputIcon: {
    flexShrink: 0,
    color: 'rgba(230, 197, 148, 0.75)'
  },
  nameFootnote: {
    color: 'rgba(255,255,255,0.32)',
    fontSize: '11.5px',
    fontWeight: '500',
    fontStyle: 'italic',
    margin: '12px 0 0 0',
    lineHeight: 1.4
  },
  nameWarning: {
    color: '#E8A87C',
    fontSize: '11.5px',
    fontWeight: '600',
    margin: '12px 0 0 0',
    lineHeight: 1.4,
    padding: '0 8px'
  },
  fabRow: {
    width: '100%',
    maxWidth: '360px',
    display: 'flex',
    justifyContent: 'flex-end',
    flexShrink: 0,
    // Σταθερό, μικρό κενό ανάμεσα στο πεδίο ονόματος/footnote και στο
    // κουμπί - δεν "τρώει" όλο τον διαθέσιμο χώρο όπως το παλιό flex-grow
    // spacerBottom. Το όποιο περίσσιο κενό σε ψηλές οθόνες πάει τώρα στο
    // spacerAfterButton πιο κάτω (μετά το κουμπί).
    marginTop: '36px'
  },
  // Μόνο αυτό απορροφά το "περίσσιο" κενό πλέον (flex-grow, flexShrink
  // ελεύθερο να πάει στο 0 όταν ανοίγει το πληκτρολόγιο και χρειάζεται
  // χώρος) - στο κάτω άκρο της κάρτας, ΜΕΤΑ το κουμπί. Έτσι σε κοντές
  // οθόνες/με ανοιχτό πληκτρολόγιο απλά μηδενίζεται χωρίς πρόβλημα, και σε
  // ψηλές οθόνες η επιπλέον ανάσα πάει κάτω από το κουμπί, όχι ανάμεσα σε
  // περιεχόμενο και CTA.
  spacerAfterButton: {
    flex: 1,
    minHeight: 0
  },
  // fontFamily: 'inherit' - ίδιο ζήτημα/fix με τα langBtn* πιο πάνω: τα
  // <button> δεν κληρονομούν αυτόματα το font-family της σελίδας.
  fab: {
    WebkitAppearance: 'none',
    appearance: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: '9px',
    padding: '15px 26px',
    borderRadius: '999px',
    border: '1.5px solid rgba(230, 197, 148, 0.4)',
    background: 'linear-gradient(135deg, #D97B4A 0%, #C1652F 45%, #8E3E12 100%)',
    color: '#fff',
    fontFamily: 'inherit',
    boxShadow: '0 10px 24px rgba(142, 62, 18, 0.4)',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    flexShrink: 0,
    whiteSpace: 'nowrap'
  },
  fabDisabled: {
    opacity: 0.5,
    cursor: 'not-allowed'
  },
  fabText: {
    fontFamily: 'inherit',
    fontSize: '15px',
    fontWeight: '700',
    letterSpacing: '0.2px',
    whiteSpace: 'nowrap'
  }
};