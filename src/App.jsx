import React, { useState, useRef, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useKlevSession, getSavedGuestName } from './lib/useKlevSession';
import { useEventPhotos } from './lib/useEventPhotos';
import GuestJoin from './components/GuestJoin';
import HostLogin from './components/HostLogin';
// ΔΙΟΡΘΩΣΗ (code review - "case-sensitivity"): το πραγματικό αρχείο στον
// δίσκο είναι 'Guestsignin.jsx' (πεζά) - αυτό το import ζητούσε
// 'GuestSignIn.jsx' (διαφορετικά κεφαλαία/πεζά). Σε Windows (όπου γίνεται
// το build τώρα) αυτό δουλεύει επειδή το NTFS δεν ξεχωρίζει πεζά/κεφαλαία -
// αλλά σε Mac/Linux/οποιοδήποτε CI (case-sensitive filesystem) θα
// σταματούσε ΟΛΟΚΛΗΡΟ το build. Διορθώθηκε ώστε να ταιριάζει ακριβώς με
// το πραγματικό filename.
import GuestSignIn from './components/Guestsignin';
import PhotoGallery from './components/PhotoGallery';
// ΔΙΟΡΘΩΣΗ (code review - "case-sensitivity", 2η φορά): ίδιο πρόβλημα με το
// GuestSignIn παραπάνω - το πραγματικό αρχείο είναι 'Eventhero.jsx' (πεζά),
// όχι 'EventHero.jsx'. Αυτό ΔΕΝ το είχαμε πιάσει στο προηγούμενο πέρασμα -
// εντοπίστηκε τρέχοντας ΠΡΑΓΜΑΤΙΚΟ `npm run build` σε case-sensitive
// filesystem, που είναι ο μόνος σίγουρος τρόπος να πιάσεις όλα αυτά τα
// mismatches μαζεμένα.
import EventHero from './components/Eventhero';
import AuthForm from './components/AuthForm';
import MyEvents from './components/MyEvents';
import AccountSettings from './components/AccountSettings';
import FloatingAddMenu from './components/FloatingAddMenu';
import PhotoPreviewModal from './components/PhotoPreviewModal';
import VideoRecorder from './components/VideoRecorder';
import PhotoCapture from './components/PhotoCapture';
import UploadToastStack from './components/UploadToastStack';

// Desktop/PC "shell": σε κινητό η εφαρμογή παραμένει ακριβώς όπως ήταν
// (γεμίζει όλη την οθόνη). Σε μεγαλύτερες οθόνες (π.χ. κάποιος ανοίγει το
// link από τον υπολογιστή του μετά τον γάμο για να κατεβάσει φωτογραφίες)
// εμφανίζεται μια κεντραρισμένη "κάρτα" στο πλάτος κινητού, με ένα
// διακριτικό, θαμπωμένο branded φόντο γύρω της αντί για ένα γυμνό/σπασμένο
// full-width layout. Όλα τα child components (GuestJoin, HostLogin,
// MyEvents, AccountSettings, GuestSignIn) δένουν πλέον στο μέγεθος του ΓΟΝΙΚΟΥ
// container (100%) αντί στο πραγματικό παράθυρο (100vh/100vw/fixed), ώστε να
// χωράνε σωστά μέσα στην κάρτα - βλ. αντίστοιχα σχόλια σε κάθε αρχείο.
function AppShell({ children, bg, backgroundUrl }) {
  return (
    <div className="klev-shell-outer" style={{ background: bg || '#1a4377' }}>
      {backgroundUrl && (
        <div className="klev-shell-bgphoto" style={{ backgroundImage: `url(${backgroundUrl})` }} aria-hidden="true" />
      )}
      <div className="klev-shell-inner">
        {children}
      </div>
      <style>{`
        .klev-shell-outer {
          position: fixed;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }
        .klev-shell-bgphoto {
          position: absolute;
          inset: -60px;
          background-size: cover;
          background-position: center;
          filter: blur(60px) brightness(0.45) saturate(1.15);
          transform: scale(1.2);
        }
        .klev-shell-inner {
          position: relative;
          width: 100%;
          height: 100dvh;
          max-width: 100%;
          overflow: hidden;
          z-index: 1;
        }
        @media (min-width: 641px) {
          .klev-shell-inner {
            max-width: 430px;
            height: min(100dvh, 900px);
            border-radius: 28px;
            box-shadow: 0 30px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06);
          }
        }
      `}</style>
    </div>
  );
}

export default function KlevApp() {
  const navigate = useNavigate();
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [showHostLogin, setShowHostLogin] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  // Ελέγχει αν είναι ανοιχτός ο in-app video recorder (βλ.
  // components/VideoRecorder.jsx) - τον χρησιμοποιούμε αντί για τη native
  // camera app της συσκευής όταν ο χρήστης θέλει να τραβήξει βίντεο, ώστε
  // να αποφύγουμε το Android bug όπου το background tab σκοτώνεται κατά
  // την εγγραφή και χάνεται το βίντεο.
  const [showVideoRecorder, setShowVideoRecorder] = useState(false);
  // Ίδιο σκεπτικό, για φωτογραφία (βλ. components/PhotoCapture.jsx) - Bug
  // #9: το native camera app έβαζε το tab background και σε ορισμένες
  // συσκευές (επιβεβαιωμένο σε Xiaomi/MIUI + Firefox) το λειτουργικό το
  // σκότωνε, χάνοντας τη φωτογραφία με ένα ξαφνικό "refresh".
  const [showPhotoCapture, setShowPhotoCapture] = useState(false);

  const inviteFileInputRef = useRef(null);
  const cameraFileInputRef = useRef(null);
  // Ξεχωριστό input ΜΟΝΟ για βιντεο-λήψη με την κάμερα. Δεν μπορούσαμε να
  // το μοιραστούμε με το cameraFileInputRef (accept="image/*,video/*" +
  // capture μαζί) γιατί σε πολλές συσκευές/browsers (ειδικά iOS Safari) η
  // κάμερα ανοίγει ΠΑΝΤΑ σε photo mode και αγνοεί εντελώς το video/* -
  // δεν εμφανίζεται καν επιλογή για βίντεο. Με ξεχωριστό input που δηλώνει
  // ΜΟΝΟ accept="video/*", η κάμερα ανοίγει κατευθείαν σε λήψη βίντεο.
  const videoCaptureFileInputRef = useRef(null);

  const {
    currentEvent,
    checkingUrlCode,
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
    handleLogin,
    handleGuestContinue,
    handleAuthed,
    enterEventAsAuthedUser,
    handleLogout
  } = useKlevSession();

  const {
    photos,
    setPhotos,
    totalPhotoCount,
    handleFileSelected,
    handleMoreFilesSelected,
    removePendingPhoto,
    confirmUpload,
    cancelUpload,
    previewUrls,
    pendingFiles,
    previewHidden,
    hidePreviewDraft,
    resumePreviewDraft,
    uploading,
    uploadProgress,
    getPhotoUrl,
    getPreviewUrl,
    uploadToasts,
    hasMorePhotos,
    loadingMore,
    loadMorePhotos,
    // ΔΙΟΡΘΩΣΗ ("κολλάει στο ανέβασμα χωρίς κανένα μήνυμα"): το
    // useEventPhotos.js ΗΔΗ παράγει σαφές μήνυμα σφάλματος (π.χ. timeout
    // μετά από 2 λεπτά, ή "πολύ μεγάλο αρχείο") μέσω setError εσωτερικά -
    // απλά ΔΕΝ ήταν συνδεδεμένο πουθενά στο UI (το "error" παρακάτω, χωρίς
    // rename, θα συγκρουόταν με το error του useKlevSession() πιο πάνω, που
    // αφορά session/login σφάλματα - τελείως διαφορετικό πράγμα). Μετονομασία
    // σε uploadError/setUploadError ώστε να περάσει στο PhotoPreviewModal.
    error: uploadError,
    setError: setUploadError
  } = useEventPhotos(currentEvent, guestData, user);

  // Δυναμικές κατηγορίες από το event ή τις φωτογραφίες
  const categories = useMemo(() => {
    const allCats = Array.isArray(currentEvent?.categories) ? currentEvent.categories : [];
    const hiddenCats = Array.isArray(currentEvent?.hidden_categories) ? currentEvent.hidden_categories : [];
    const visibleCats = allCats.filter(c => !hiddenCats.includes(c));

    if (visibleCats.length > 0) return visibleCats;
    
    const fallbackCats = Array.from(new Set(photos.map((p) => p.category).filter(Boolean)));
    return fallbackCats.filter(c => !hiddenCats.includes(c));
  }, [currentEvent?.categories, currentEvent?.hidden_categories, photos]);

  // Δυναμικό background από τη βάση (bg_color) ή fallback στο προεπιλεγμένο
  const eventBg = currentEvent?.bg_color || '#16325C';

  // ΔΙΟΡΘΩΣΗ ("το κόκκινο μήνυμα σφάλματος μένει για πάντα στην οθόνη"):
  // το banner πιο κάτω (error || uploadError) δεν είχε ΚΑΘΟΛΟΥ auto-dismiss -
  // έμενε ορατό μέχρι ο guest να κάνει κάποια άλλη ενέργεια που τυχαία το
  // καθάριζε (π.χ. άνοιγμα νέου file picker). Αφού πρόκειται για μήνυμα
  // τύπου toast (π.χ. "το βίντεο είναι πολύ μεγάλο"), πρέπει να εξαφανίζεται
  // μόνο του μετά από λίγα δευτερόλεπτα, όχι να μένει κολλημένο επ' αόριστον.
  useEffect(() => {
    if (!error && !uploadError) return;
    const timer = setTimeout(() => {
      if (error) setError('');
      if (uploadError) setUploadError('');
    }, 5000);
    return () => clearTimeout(timer);
  }, [error, uploadError, setError, setUploadError]);

  // ΠΡΟΣΤΑΣΙΑ "πίσω" ΟΣΟ γίνεται upload ή υπάρχει ανεπιβεβαίωτο draft
  // φωτογραφιών (feature request - "αν πατήσει κάποιος κατά λάθος πίσω στον
  // browser ενώ ανεβάζει, να παραμένει εκεί"): σε κινητό, ένα ακούσιο tap
  // στο gesture "πίσω" (swipe από την άκρη σε Android, back button) μπορεί
  // να βγάλει τον guest ΕΝΤΕΛΩΣ έξω από την εφαρμογή (π.χ. πίσω στο
  // messenger/SMS από όπου άνοιξε το link) ενώ ανεβαίνει ένα βαρύ βίντεο -
  // χάνοντας το upload ΚΑΙ το draft χωρίς καμία προειδοποίηση.
  //
  // Λύση (κλασικό pattern): όσο υπάρχει ενεργό upload ή pendingFiles,
  // μπαίνει μια επιπλέον, "αόρατη" εγγραφή στο browser history (ένα
  // history.pushState χωρίς αλλαγή URL). Το ΠΡΩΤΟ "πίσω" του guest δεν
  // βγάζει πλέον έξω από την εφαρμογή - ενεργοποιεί το δικό μας popstate
  // listener, που αν δει ότι υπάρχει ακόμα ενεργό upload/draft, ΞΑΝΑΜΠΑΖΕΙ
  // αμέσως την ίδια "ασπίδα" (άρα ο guest παραμένει στην ίδια οθόνη) και
  // δείχνει ένα σαφές μήνυμα γιατί δεν προχώρησε. Μόλις το upload
  // ολοκληρωθεί/ακυρωθεί (uploading=false ΚΑΙ pendingFiles=0), η ασπίδα
  // "αδειάζει" - το επόμενο "πίσω" δουλεύει κανονικά, όπως θα περίμενε ο
  // guest. Επιπλέον beforeunload για το σκληρό κλείσιμο/refresh καρτέλας
  // (διαφορετικό API, διαφορετικό σενάριο - ο browser δείχνει το δικό του
  // έτοιμο "είσαι σίγουρος;" dialog, δεν μπορούμε να το αντικαταστήσουμε με
  // δικό μας κείμενο σε κανέναν σύγχρονο browser, αλλά η εμφάνισή του αρκεί).
  const hasActiveUploadOrDraft = uploading || pendingFiles.length > 0;
  const uploadGuardActiveRef = useRef(false);
  const uploadGuardPushedRef = useRef(false);
  useEffect(() => {
    uploadGuardActiveRef.current = hasActiveUploadOrDraft;
    if (hasActiveUploadOrDraft && !uploadGuardPushedRef.current) {
      window.history.pushState({ klevUploadGuard: true }, '');
      uploadGuardPushedRef.current = true;
    } else if (!hasActiveUploadOrDraft) {
      uploadGuardPushedRef.current = false;
    }
  }, [hasActiveUploadOrDraft]);

  useEffect(() => {
    const handlePopState = () => {
      if (uploadGuardActiveRef.current) {
        window.history.pushState({ klevUploadGuard: true }, '');
        setUploadError('Η μεταφόρτωση είναι σε εξέλιξη - παρέμεινε λίγο ακόμα μέχρι να ολοκληρωθεί.');
      }
    };
    const handleBeforeUnload = (e) => {
      if (!uploadGuardActiveRef.current) return;
      e.preventDefault();
      // Παλιό API requirement κάποιων browsers - αγνοείται πλέον το
      // περιεχόμενο του string, αλλά η ίδια η ανάθεση χρειάζεται να υπάρχει.
      e.returnValue = '';
    };
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [setUploadError]);

  if (checkingUrlCode) {
    return (
      <AppShell bg={eventBg}>
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <div style={{
            width: '44px',
            height: '44px',
            border: '3px solid rgba(192, 158, 93, 0.25)',
            borderTop: '3px solid #c09e5d',
            borderRadius: '50%',
            animation: 'klev-spin 0.8s linear infinite'
          }} />
          <style>{`@keyframes klev-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      </AppShell>
    );
  }

  if (!currentEvent) {
    if (user) {
      if (showSettings) {
        return (
          <AppShell>
            <AccountSettings
              onClose={() => setShowSettings(false)}
              onLogout={() => {
                setShowSettings(false);
                handleLogout();
              }}
            />
          </AppShell>
        );
      }
      return (
        <AppShell>
          <MyEvents
            onOpenEvent={enterEventAsAuthedUser}
            onOpenSettings={() => setShowSettings(true)}
          />
        </AppShell>
      );
    }
    if (showHostLogin) {
      return (
        <AppShell>
          <HostLogin
            onBack={() => setShowHostLogin(false)}
            onAuthed={handleAuthed}
          />
        </AppShell>
      );
    }
    return (
      <AppShell>
        <GuestJoin
          onLogin={handleLogin}
          loading={joining}
          error={error}
          onHostLogin={() => setShowHostLogin(true)}
        />
      </AppShell>
    );
  }

  if (showGuestSignIn) {
    return (
      <AppShell bg={eventBg} backgroundUrl={currentEvent?.banner_url}>
        <GuestSignIn
          event={currentEvent}
          onContinue={handleGuestContinue}
          defaultName={getSavedGuestName()}
        />
      </AppShell>
    );
  }

  if (showSettings) {
    return (
      <AppShell bg={eventBg} backgroundUrl={currentEvent?.banner_url}>
        <AccountSettings
          onClose={() => setShowSettings(false)}
          onLogout={() => {
            setShowSettings(false);
            handleLogout();
          }}
        />
      </AppShell>
    );
  }

  return (
    <AppShell bg={eventBg} backgroundUrl={currentEvent?.banner_url}>
    <div style={{
      position: 'absolute',
      inset: 0,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: eventBg,
      overflow: 'hidden'
    }}>

      {/* ΔΙΟΡΘΩΣΗ: πριν, το uploadError (από το useEventPhotos.js - π.χ. timeout
          στο ανέβασμα βίντεο μετά από 2 λεπτά, ή αρχείο πολύ μεγάλο) δεν
          εμφανιζόταν ΠΟΥΘΕΝΑ - μόνο το session error (login/κωδικός event)
          έδειχνε εδώ. Αποτέλεσμα: ο guest έβλεπε το "Ανεβαίνουν..." να κολλάει
          επ' αόριστον χωρίς καμία εξήγηση. Τώρα δείχνουμε ό,τι από τα δύο
          υπάρχει - πρακτικά δεν εμφανίζονται ποτέ ταυτόχρονα. */}
      {(error || uploadError) && (
        <div style={{
          position: 'absolute',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 2000,
          background: '#ff453a',
          color: 'white',
          padding: '10px 20px',
          borderRadius: '25px',
          boxShadow: '0 5px 15px rgba(0,0,0,0.3)',
          fontWeight: '500',
          maxWidth: '90%',
          textAlign: 'center'
        }}>
          {error || uploadError}
        </div>
      )}

      {/* Κρύβεται αυτόματα όταν είναι ανοιχτό το Lightbox */}
      {!isLightboxOpen && (
        <EventHero
          event={currentEvent}
          photoCount={totalPhotoCount}
          tagline={currentEvent?.tagline || 'Different moments, same celebration. All yours.'}
          categories={categories}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          user={user}
          onLogout={handleLogout}
        />
      )}

      <div className="klev-scroll-area" style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch'
      }}>
        <PhotoGallery
          photos={photos}
          event={currentEvent}
          getPhotoUrl={getPhotoUrl}
          getPreviewUrl={getPreviewUrl}
          user={user}
          activeTab={activeTab}
          onPhotoDeleted={(photoId) => setPhotos((prev) => prev.filter((p) => p.id !== photoId))}
          onRequireAuth={() => setAuthOpen(true)}
          onLightboxChange={(isOpen) => setIsLightboxOpen(isOpen)}
          hasMorePhotos={hasMorePhotos}
          loadingMore={loadingMore}
          onLoadMore={loadMorePhotos}
        />
      </div>

      {/* Κρύβεται αυτόματα όταν είναι ανοιχτό το Lightbox */}
      {!isLightboxOpen && (
        <FloatingAddMenu
          addMenuOpen={addMenuOpen}
          setAddMenuOpen={setAddMenuOpen}
          uploading={uploading}
          inviteFileInputRef={inviteFileInputRef}
          cameraFileInputRef={cameraFileInputRef}
          videoCaptureFileInputRef={videoCaptureFileInputRef}
          onFileUpload={handleFileSelected}
          onOpenVideoRecorder={() => setShowVideoRecorder(true)}
          onOpenPhotoCapture={() => setShowPhotoCapture(true)}
          hasDraft={previewUrls.length > 0 && previewHidden}
          onResumeDraft={resumePreviewDraft}
        />
      )}

      {/* Live "κάποιος ανέβασε φωτογραφία" toasts - κρύβεται μαζί με το
      FloatingAddMenu όταν είναι ανοιχτό το Lightbox, για συνέπεια με τα
      άλλα floating στοιχεία. */}
      {!isLightboxOpen && <UploadToastStack toasts={uploadToasts} />}

      {/* In-app video recorder - βλ. σχόλια στο VideoRecorder.jsx για το
      γιατί υπάρχει (αποφυγή Android tab-kill bug κατά τη λήψη βίντεο μέσω
      της native camera app). Όταν ο χρήστης πατήσει "Χρήση βίντεο", το
      αρχείο περνάει από το ΙΔΙΟ μονοπάτι με ένα κανονικό file-picker
      αρχείο (handleFileSelected/handleMoreFilesSelected) - άρα η
      υπόλοιπη ροή (preview modal, upload κλπ) μένει ανέγγιχτη. */}
      {showVideoRecorder && (
        <VideoRecorder
          onCancel={() => setShowVideoRecorder(false)}
          onCaptured={(file) => {
            setShowVideoRecorder(false);
            const fakeEvent = { target: { files: [file], value: '' } };
            if (pendingFiles.length > 0) {
              handleMoreFilesSelected(fakeEvent);
            } else {
              handleFileSelected(fakeEvent);
            }
          }}
        />
      )}

      {/* In-app photo capture - βλ. σχόλια στο PhotoCapture.jsx (Bug #9:
      αποφυγή Android tab-kill κατά τη λήψη φωτογραφίας μέσω της native
      camera app, ίδιο σκεπτικό με το VideoRecorder παραπάνω). Το αρχείο
      περνάει από το ΙΔΙΟ μονοπάτι με ένα κανονικό file-picker αρχείο. */}
      {showPhotoCapture && (
        <PhotoCapture
          onCancel={() => setShowPhotoCapture(false)}
          onCaptured={(file) => {
            setShowPhotoCapture(false);
            const fakeEvent = { target: { files: [file], value: '' } };
            if (pendingFiles.length > 0) {
              handleMoreFilesSelected(fakeEvent);
            } else {
              handleFileSelected(fakeEvent);
            }
          }}
        />
      )}

      {/* Μόνο όταν υπάρχουν pending φωτογραφίες ΚΑΙ δεν είναι κρυμμένες.
      Όταν previewHidden γίνεται true (swipe-down στη λαβή), το modal
      κάνει πλήρες unmount εδώ - έτσι όταν ξανανοίξει το εσωτερικό του
      drag state (dragY/closing) ξεκινάει πάντα από την αρχή. */}
      {previewUrls.length > 0 && !previewHidden && (
        <PhotoPreviewModal
          previewUrls={previewUrls}
          pendingFiles={pendingFiles}
          onRemovePhoto={removePendingPhoto}
          onAddMoreFiles={handleMoreFilesSelected}
          onOpenPhotoCapture={() => setShowPhotoCapture(true)}
          onOpenVideoRecorder={() => setShowVideoRecorder(true)}
          onConfirm={confirmUpload}
          onCancel={cancelUpload}
          onDismiss={hidePreviewDraft}
          uploading={uploading}
          uploadProgress={uploadProgress}
          event={currentEvent}
          error={uploadError}
        />
      )}

      {authOpen && (
        <AuthForm
          onClose={() => setAuthOpen(false)}
          onAuthed={handleAuthed}
        />
      )}

      <style>{`
        .klev-scroll-area::-webkit-scrollbar { display: none; }
        .klev-scroll-area { scrollbar-width: none; -ms-overflow-style: none; }
      `}</style>
    </div>
    </AppShell>
  );
}