import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';

// Μικρό "κενό" (gutter) ΑΝΑΜΕΣΑ στις φωτογραφίες - φαίνεται ΜΟΝΟ κατά το
// swipe/drag (όταν η επόμενη/προηγούμενη ξεπροβάλλει), ΟΧΙ όταν είσαι
// ακίνητος πάνω σε μία φωτο (εκεί είναι πάντα πλήρως edge-to-edge, χωρίς
// κενό ή στρογγυλεμένες γωνίες - ζητήθηκε ξεχωριστά).
const GUTTER = 14;

// --- Pinch-to-zoom ρυθμίσεις -------------------------------------------
const MIN_SCALE = 1;
const MAX_SCALE = 4;
const DOUBLE_TAP_SCALE = 2.5;

function distanceBetween(p1, p2) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}
function midpointOf(p1, p2) {
  return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
}

export default function PhotoLightbox({ photos = [], currentIndex = 0, photo, getPhotoUrl, onClose, onDelete, canDelete, isLiked, likeCount, onToggleLike, deleting, onNavigate }) {
  const list = photos.length > 0 ? photos : (photo ? [photo] : []);
  const [index, setIndex] = useState(currentIndex >= 0 && currentIndex < list.length ? currentIndex : 0);

  // --- Smooth, iPhone-Photos-style swipe -------------------------------
  // Αντί να αλλάζει το index απότομα στο touchend (παλιά συμπεριφορά),
  // κρατάμε 3 "θέσεις" πάνω σε ένα οριζόντιο track (προηγούμενη/τρέχουσα/
  // επόμενη) και το track ακολουθεί το δάχτυλο 1-προς-1 κατά το drag. Στο
  // release είτε ολοκληρώνει το slide προς την επόμενη/προηγούμενη με ένα
  // ομαλό animation, είτε επιστρέφει ελαστικά στην τρέχουσα αν δεν
  // ξεπεράστηκε το threshold - ό,τι κάνει το iOS Photos.
  const [dragX, setDragX] = useState(0);
  const [useTransition, setUseTransition] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const contentRef = useRef(null);
  const draggingRef = useRef(false);
  const startXRef = useRef(0);
  const pendingDirRef = useRef(0); // -1 = commit προς next, 1 = commit προς prev

  // --- Pinch-to-zoom / pan --------------------------------------------
  // ΣΗΜΑΝΤΙΚΟ (performance): το zoom/pan ΔΕΝ περνάει από React state σε
  // κάθε κίνηση δαχτύλου. Η πρώτη υλοποίηση έκανε setState(scale)/
  // setState(translate) σε ΚΑΘΕ pointermove - αυτό σήμαινε πλήρες
  // re-render ολόκληρου του lightbox (topBar, bottomBar, κουμπιά κλπ) σε
  // κάθε frame του pinch, κάτι που σε πιο αδύναμο τηλέφωνο/browser (π.χ.
  // Xiaomi + Firefox Android) γίνεται αισθητά αργό/"κολλημένο". Αντί γι'
  // αυτό, το scale/translate ζουν ΜΟΝΟ σε refs και γράφονται απευθείας
  // πάνω στο DOM element (zoomWrapperRef.style.transform) - ο browser
  // χειρίζεται το transform στο compositor thread, χωρίς κανένα React
  // re-render όσο διαρκεί η χειρονομία. Δεν χρειάζεται καν state - το
  // μόνο που "θυμάται" η εφαρμογή ανάμεσα σε renders είναι η ίδια η τιμή
  // transform πάνω στο DOM.
  const scaleRef = useRef(1);
  const translateRef = useRef({ x: 0, y: 0 });
  const zoomWrapperRef = useRef(null);

  const activePointersRef = useRef(new Map()); // pointerId -> {x, y}
  const pinchRef = useRef(null); // {startDist, startScale, startMid, startTranslate}
  const panRef = useRef(null); // {startX, startY, startTranslate}
  const lastTapRef = useRef({ time: 0, x: 0, y: 0 });

  // Γράφει την τρέχουσα τιμή των refs κατευθείαν στο DOM. immediate=true
  // κατά τη διάρκεια ενεργού pinch/pan (καμία transition - ακολουθεί το
  // δάχτυλο 1-προς-1, χωρίς καθυστέρηση)· immediate=false για το ένα
  // discrete "άλμα" του double-tap zoom in/out (εκεί θέλουμε ομαλό
  // animation, όχι απότομη αλλαγή).
  const applyZoomTransform = (immediate) => {
    const el = zoomWrapperRef.current;
    if (!el) return;
    el.style.transition = immediate ? 'none' : 'transform 200ms ease-out';
    el.style.transform = `translate(${translateRef.current.x}px, ${translateRef.current.y}px) scale(${scaleRef.current})`;
  };

  const clampTranslate = (s, tx, ty) => {
    const maxX = Math.max(0, (containerWidth * (s - 1)) / 2);
    const maxY = Math.max(0, (containerHeight * (s - 1)) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, tx)),
      y: Math.min(maxY, Math.max(-maxY, ty))
    };
  };

  useLayoutEffect(() => {
    const measure = () => {
      setContainerWidth(contentRef.current?.offsetWidth || 0);
      setContainerHeight(contentRef.current?.offsetHeight || 0);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Κάθε φορά που αλλάζει η φωτογραφία (swipe σε επόμενη/προηγούμενη),
  // μηδενίζουμε το zoom - δεν θέλουμε να "κληρονομήσει" η επόμενη φωτο
  // το zoom της προηγούμενης. Γίνεται απευθείας στο DOM (χωρίς state),
  // ίδια λογική με το applyZoomTransform παραπάνω.
  useEffect(() => {
    scaleRef.current = 1;
    translateRef.current = { x: 0, y: 0 };
    pinchRef.current = null;
    panRef.current = null;
    activePointersRef.current.clear();
    applyZoomTransform(true);
  }, [index]);

  // ΔΙΟΡΘΩΣΗ (code review - "λάθος φωτο όταν μπαίνουν νέες ζωντανά"): το
  // "index" είναι εσωτερικό state - αρχικοποιείται ΜΙΑ φορά από το
  // currentIndex prop, αλλά η γονική λίστα (visiblePhotos) μπορεί να
  // shiftάρει (νέο realtime upload μπαίνει μπροστά) ΟΣΟ το lightbox είναι
  // ανοιχτό. Ο γονέας (PhotoGallery.jsx) πλέον ξαναυπολογίζει το
  // currentIndex ΚΑΘΕ render με βάση το ID της ίδιας φωτο - αν αυτό διαφέρει
  // από το δικό μας "κολλημένο" index, συγχρονιζόμαστε εδώ. useLayoutEffect
  // (όχι useEffect) ώστε η διόρθωση να γίνεται ΠΡΙΝ το browser ζωγραφίσει το
  // frame - μηδενικό flicker, ο χρήστης βλέπει πάντα τη σωστή φωτο.
  useLayoutEffect(() => {
    if (currentIndex >= 0 && currentIndex < list.length && currentIndex !== index) {
      setIndex(currentIndex);
    }
  }, [currentIndex, list.length]);

  const currentPhoto = list[index] || list[0];

  // ΝΕΟ (ζητήθηκε - "να μπορούν οι χρήστες να αποθηκεύσουν τις φωτογραφίες
  // στη συλλογή τους"): κατέβασμα της τρέχουσας φωτογραφίας/βίντεο στη
  // συσκευή του guest. Σε PWA (όχι native app) ο μόνος αξιόπιστος τρόπος
  // να καταλήξει το αρχείο ΠΡΑΓΜΑΤΙΚΑ στη Συλλογή/Photos του κινητού
  // (ειδικά στο iOS Safari, όπου το <a download> απλά ανοίγει την εικόνα
  // σε νέα καρτέλα αντί να την αποθηκεύει) είναι το native share sheet
  // μέσω Web Share API με αρχείο - έχει ενσωματωμένη επιλογή "Αποθήκευση
  // εικόνας"/"Save to Photos". Όπου δεν υποστηρίζεται (desktop browsers),
  // πέφτουμε σε κλασικό download μέσω προσωρινού <a download>.
  const [downloading, setDownloading] = useState(false);
  // ΔΙΟΡΘΩΣΗ (code review - "σιωπηλή αποτυχία λήψης"): πριν, ένα αποτυχημένο
  // fetch (π.χ. venue wifi που κόβεται ακριβώς τη στιγμή που ο guest θέλει
  // να κατεβάσει το βίντεο) έκανε μόνο console.log - ο guest έβλεπε το
  // spinner να σταματάει και το κουμπί να γυρνάει στην αρχική του μορφή,
  // σαν να μην έγινε τίποτα, χωρίς καμία εξήγηση. Τώρα δείχνουμε σύντομο
  // μήνυμα σφάλματος κάτω από το top bar, που εξαφανίζεται μόνο του.
  const [downloadError, setDownloadError] = useState(false);
  const downloadErrorTimerRef = useRef(null);
  // ΝΕΟ ("ο χρήστης δεν καταλαβαίνει αν έγινε η λήψη"): μήνυμα επιτυχίας +
  // τικ στο εικονίδιο για ~2.5s μετά από επιτυχημένη λήψη. Κρατάει το κείμενο
  // του μηνύματος (null = δεν εμφανίζεται).
  const [downloadDone, setDownloadDone] = useState(null);
  const downloadDoneTimerRef = useRef(null);
  const showDownloadDone = (message) => {
    setDownloadDone(message);
    clearTimeout(downloadDoneTimerRef.current);
    downloadDoneTimerRef.current = setTimeout(() => setDownloadDone(null), 2500);
  };
  useEffect(() => () => {
    clearTimeout(downloadDoneTimerRef.current);
    clearTimeout(downloadErrorTimerRef.current);
  }, []);

  // ΔΙΟΡΘΩΣΗ ("το download icon δεν κάνει τίποτα, μόνο loading"): το spinner
  // σταματούσε ΜΟΝΟ όταν ολοκληρωνόταν το fetch ή το navigator.share - αν
  // κάποιο από τα δύο έμενε pending (αργό/κολλημένο δίκτυο, ή share dialog
  // σε desktop που δεν ολοκληρώνεται), το κουμπί έμενε για πάντα σε loading,
  // χωρίς μήνυμα. Τώρα:
  //  1. Το fetch έχει timeout (AbortController) και ελέγχει response.ok.
  //  2. Η λήψη φωτογραφίας ξεκινά ΗΔΗ στο παρασκήνιο μόλις ανοίξει η
  //     φωτογραφία (prefetch). Έτσι στο tap το blob είναι έτοιμο και το
  //     navigator.share καλείται ΑΜΕΣΩΣ, μέσα στο user gesture (σε iOS/Safari
  //     αλλιώς απορρίπτεται με NotAllowedError αν περάσουν δευτερόλεπτα
  //     fetch πριν το share).
  //  3. Το Web Share API χρησιμοποιείται ΜΟΝΟ σε συσκευές αφής (κινητό/
  //     tablet). Σε desktop κατεβαίνει κατευθείαν με <a download>.
  //  4. Αν το share αποτύχει (εκτός από ακύρωση χρήστη), πέφτουμε σε
  //     κλασικό download αντί να δείχνουμε σφάλμα.
  //  5. Η επέκταση προκύπτει από το πραγματικό MIME type του αρχείου.
  const prefetchRef = useRef({ id: null, promise: null });

  const fetchMediaBlob = async (url, timeoutMs) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.blob();
    } finally {
      clearTimeout(timer);
    }
  };

  // Prefetch μόνο για φωτογραφίες (τα βίντεο είναι βαριά - κατεβαίνουν μόνο
  // όταν ο χρήστης πατήσει πραγματικά λήψη).
  useEffect(() => {
    const photoNow = list[index];
    if (!photoNow || photoNow.media_type === 'video') {
      prefetchRef.current = { id: null, promise: null };
      return;
    }
    const promise = fetchMediaBlob(getPhotoUrl(photoNow.file_path), 60000).catch(() => null);
    prefetchRef.current = { id: photoNow.id, promise };
  }, [index]);

  const triggerClassicDownload = (blob, fileName) => {
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
  };

  const extFromMime = (mime, isVideo) => {
    const map = {
      'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
      'image/heic': 'heic', 'image/heif': 'heif', 'image/gif': 'gif',
      'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm'
    };
    return map[mime] || (isVideo ? 'mp4' : 'jpg');
  };

  const handleDownload = async () => {
    if (!currentPhoto || downloading) return;
    setDownloading(true);
    setDownloadError(false);
    setDownloadDone(null);
    try {
      const isVideo = currentPhoto.media_type === 'video';
      const pre = prefetchRef.current;
      let blob = null;
      if (!isVideo && pre.id === currentPhoto.id && pre.promise) {
        blob = await pre.promise;
      }
      if (!blob) {
        blob = await fetchMediaBlob(getPhotoUrl(currentPhoto.file_path), isVideo ? 180000 : 45000);
      }
      const mime = blob.type && blob.type !== 'application/octet-stream' ? blob.type : (isVideo ? 'video/mp4' : 'image/jpeg');
      const fileName = `sharethecap-${currentPhoto.id || Date.now()}.${extFromMime(mime, isVideo)}`;
      const file = new File([blob], fileName, { type: mime });

      const isTouchDevice = window.matchMedia?.('(pointer: coarse)').matches;
      let shared = false;
      if (isTouchDevice && navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file] });
          shared = true;
        } catch (shareErr) {
          // Ακύρωση από τον χρήστη: τίποτα άλλο να γίνει.
          if (shareErr?.name === 'AbortError') return;
          // Οτιδήποτε άλλο (π.χ. NotAllowedError): fallback σε κλασικό download.
        }
      }
      if (!shared) triggerClassicDownload(blob, fileName);
      showDownloadDone(shared ? 'Ολοκληρώθηκε' : 'Αποθηκεύτηκε στη συσκευή σου');
    } catch (err) {
      {
        console.log('download error', err?.message);
        setDownloadError(true);
        clearTimeout(downloadErrorTimerRef.current);
        downloadErrorTimerRef.current = setTimeout(() => setDownloadError(false), 4000);
      }
    } finally {
      setDownloading(false);
    }
  };

  // Βίντεο: μόνο το ΤΡΕΧΟΝ slide παίζει πραγματικό <video> - τα peek slides
  // (προηγούμενο/επόμενο, που "ξεπροβάλλουν" κατά το swipe) δείχνουν απλά
  // το thumbnail τους σαν εικόνα. Έτσι δεν παίζουν ποτέ 2-3 βίντεο
  // ταυτόχρονα και δεν κατεβάζουμε άσκοπα βίντεο που δεν βλέπεις ακόμα.
  //
  // ΔΕΝ χρησιμοποιούμε τα native <video controls> - "τρώνε" όλα τα touch
  // events πάνω τους, οπότε το swipe-to-navigate δεν θα δούλευε ποτέ πάνω
  // από ένα βίντεο (δοκιμάστηκε, ήταν σπασμένο). Αντί γι' αυτό το <video>
  // έχει το ΙΔΙΟ pointerEvents:'none' με τις φωτογραφίες (βλ. styles.image)
  // - το tap/drag περνάει κατευθείαν στο content div από κάτω, ΑΚΡΙΒΩΣ
  // όπως στις φωτογραφίες. Το play/pause γίνεται προγραμματιστικά (μέσω
  // videoRef.current.play()/pause() - αυτό δουλεύει κανονικά ΑΝΕΞΑΡΤΗΤΑ
  // από το pointerEvents CSS) όταν ο finishDrag() παρακάτω ανιχνεύσει ότι
  // το gesture ήταν tap (ελάχιστη μετακίνηση), όχι swipe.
  const videoRef = useRef(null);
  const [videoPaused, setVideoPaused] = useState(true);

  // ΔΙΟΡΘΩΣΗ v2 (design feedback - "αν δεν γίνεται να παίζει αμέσως, ας έχει
  // απλά play button, όχι 'φόρτωση'"): οι προηγούμενες εκδοχές έδειχναν το
  // spinner "Φόρτωση βίντεο..." ΑΠΟ ΤΗΝ ΑΡΧΗ, πριν καν πατήσει ο χρήστης -
  // αλλά με preload="metadata" ο browser δεν φορτώνει ΚΑΘΟΛΟΥ πραγματικά
  // δεδομένα βίντεο μέχρι να ζητηθεί playback, οπότε το "φορτώνει" ήταν
  // παραπλανητικό/μόνιμο μέχρι το tap - ένα απλό play button (σαν
  // YouTube thumbnail) είναι πιο έντιμο: δείχνει "πάτα για να παίξει", όχι
  // "κάτι χρειάζεται χρόνο". Το spinner τώρα εμφανίζεται ΜΟΝΟ μετά το tap,
  // όσο περιμένουμε το πραγματικό playback να ξεκινήσει.
  //
  // Ένα και μοναδικό state αντί για πολλά booleans:
  //   'idle'    - αρχική κατάσταση, δείχνουμε poster + play button
  //   'loading' - ο χρήστης μόλις πάτησε play, περιμένουμε να ξεκινήσει
  //   'playing' - παίζει κανονικά, καμία επικάλυψη
  //   'paused'  - παιζόταν, πάτησε pause - δείχνουμε ξανά το play button
  //   'error'   - πέρασε το timeout (ή πραγματικό σφάλμα) ΜΕΤΑ το tap
  const [videoPhase, setVideoPhase] = useState('idle');
  const videoLoadTimerRef = useRef(null);
  const VIDEO_LOAD_TIMEOUT_MS = 15000;

  useEffect(() => {
    setVideoPaused(true);
    setVideoPhase('idle');
    if (videoLoadTimerRef.current) clearTimeout(videoLoadTimerRef.current);
    return () => clearTimeout(videoLoadTimerRef.current);
  }, [index]);

  // Belt-and-suspenders fallback (ίδιο σκεπτικό με πριν): τα events του
  // <video> δεν πυροδοτούνται πάντα αξιόπιστα σε κάθε browser/PWA - ενώ
  // περιμένουμε ('loading'), ελέγχουμε ΚΑΙ ενεργά (polling, κάθε 250ms) το
  // πραγματικό readyState/paused state, ώστε να μην μείνει ποτέ κολλημένο
  // το spinner πάνω σε βίντεο που στην πραγματικότητα ήδη παίζει.
  useEffect(() => {
    const intervalId = setInterval(() => {
      const el = videoRef.current;
      if (!el) return;
      if (videoPhase === 'loading' && (el.readyState >= 2 || !el.paused)) {
        setVideoPhase('playing');
      }
    }, 250);
    return () => clearInterval(intervalId);
  }, [index, videoPhase]);

  const toggleVideoPlay = () => {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      setVideoPhase('loading');
      if (videoLoadTimerRef.current) clearTimeout(videoLoadTimerRef.current);
      videoLoadTimerRef.current = setTimeout(() => {
        setVideoPhase((phase) => (phase === 'loading' ? 'error' : phase));
      }, VIDEO_LOAD_TIMEOUT_MS);
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  };

  if (!currentPhoto) return null;

  const renderMedia = (media, isCurrent) => {
    if (!media) return null;
    const thumbUrl = media.preview_path ? getPhotoUrl(media.preview_path) : getPhotoUrl(media.file_path);

    if (media.media_type === 'video') {
      if (!isCurrent) {
        return <img src={thumbUrl} alt="" style={styles.image} draggable={false} />;
      }
      // ΝΕΟ: αν υπάρχει συμπιεσμένη εκδοχή (compressed_video_path - βλ.
      // compressVideoForPlayback στο useEventPhotos.js), παίζουμε ΑΥΤΗΝ εδώ
      // (πολύ ελαφρύτερη, φορτώνει γρήγορα ανεξάρτητα από το πόσο μεγάλο
      // είναι το original). Το videoUrl (πλήρης ποιότητα) μένει μόνο για το
      // "Άνοιγμα/λήψη βίντεο" fallback link παρακάτω και για το κουμπί
      // download στο bottomBar (handleDownload) - εκεί θέλουμε πάντα την
      // πλήρη ποιότητα. Παλιά βίντεο χωρίς compressed_video_path κάνουν
      // αυτόματα fallback στο ίδιο videoUrl, όπως πριν - καμία αλλαγή γι'
      // αυτά.
      const videoUrl = getPhotoUrl(media.file_path);
      const playbackUrl = media.compressed_video_path ? getPhotoUrl(media.compressed_video_path) : videoUrl;
      return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          {/* Poster πάντα ορατό από κάτω - έτσι ακόμα κι αν το ίδιο το
          βίντεο δεν φορτώσει ποτέ, ο χρήστης βλέπει τη φωτογραφία
          thumbnail αντί για μαύρη οθόνη. */}
          {media.preview_path && (
            <img src={thumbUrl} alt="" style={styles.image} draggable={false} />
          )}
          <video
            key={media.id}
            ref={videoRef}
            src={playbackUrl}
            poster={media.preview_path ? thumbUrl : undefined}
            playsInline
            preload="metadata"
            style={{ ...styles.image, position: 'absolute', top: 0, left: 0 }}
            // ΔΙΟΡΘΩΣΗ ("γιατί να έχει spinner όταν το πατάω να παίξει, αφού
            // παίζει με την μία;"): αφαιρέθηκε εντελώς το ενδιάμεσο
            // "Φόρτωση βίντεο..." overlay - το tap πάει κατευθείαν σε
            // play(), χωρίς καμία οπτική "loading" κατάσταση ανάμεσα. Τα
            // events εδώ χρησιμεύουν ΜΟΝΟ για να καθαρίσουν το timeout-timer
            // (ώστε να μην εμφανιστεί ποτέ λανθασμένα το error message όταν
            // το βίντεο στην πραγματικότητα παίζει ήδη κανονικά).
            onPlay={() => { setVideoPaused(false); setVideoPhase('playing'); clearTimeout(videoLoadTimerRef.current); }}
            onPlaying={() => { setVideoPhase('playing'); clearTimeout(videoLoadTimerRef.current); }}
            onPause={() => { setVideoPaused(true); setVideoPhase((phase) => (phase === 'playing' ? 'paused' : phase)); }}
            onEnded={() => setVideoPaused(true)}
            onLoadedData={() => clearTimeout(videoLoadTimerRef.current)}
            onCanPlay={() => clearTimeout(videoLoadTimerRef.current)}
            onError={() => { setVideoPhase('error'); clearTimeout(videoLoadTimerRef.current); }}
          />
          {videoPhase === 'error' && (
            <div style={styles.videoErrorOverlay}>
              {/* ΔΙΟΡΘΩΣΗ ("βγάζει 'το βίντεο είναι μεγάλο' αμέσως μετά το
              upload"): αν δεν υπάρχει ΑΚΟΜΑ compressed_video_path, σημαίνει
              ότι το fast-start remux σε background (βλ. useEventPhotos.js)
              απλά δεν έχει προλάβει να τελειώσει - ΔΕΝ είναι πραγματικό
              σφάλμα, είναι θέμα χρόνου (συνήθως λίγα δευτερόλεπτα). Το
              παλιό μήνυμα ήταν παραπλανητικό σε αυτή την περίπτωση - έδειχνε
              "είναι μεγάλο/αργεί" σαν μόνιμο πρόβλημα, ενώ η οθόνη αυτή θα
              εξαφανιστεί ΜΟΝΗ ΤΗΣ (μέσω του realtime UPDATE listener) μόλις
              το remux τελειώσει. Μόνο αν ΥΠΑΡΧΕΙ ήδη compressed_video_path
              και ΠΑΛΙ αργεί/αποτυγχάνει δείχνουμε το αρχικό μήνυμα - τότε
              πράγματι είναι θέμα σύνδεσης, όχι επεξεργασίας. */}
              {!media.compressed_video_path ? (
                <p style={styles.videoErrorText}>
                  Το βίντεο προετοιμάζεται για άμεση αναπαραγωγή... Δοκίμασε ξανά σε λίγα δευτερόλεπτα.
                </p>
              ) : (
                <p style={styles.videoErrorText}>
                  Το βίντεο είναι μεγάλο και αργεί να φορτώσει σε αυτή τη σύνδεση.
                </p>
              )}
              <a
                href={videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={styles.videoErrorLink}
                onClick={(e) => e.stopPropagation()}
              >
                Άνοιγμα / λήψη βίντεο
              </a>
            </div>
          )}
          {(videoPhase === 'idle' || videoPhase === 'paused') && (
            <div style={styles.videoPlayOverlay} aria-hidden="true">
              {/* ΔΙΟΡΘΩΣΗ ("τα χρώματα πιο κοντά στην εφαρμογή"): το χρυσό
              #D9B54A είναι το κύριο accent χρώμα σε όλη την εφαρμογή (βλ.
              BottomBar.jsx/PhotoPreviewModal.jsx) - εδώ αντί για γενικό
              λευκό, ταιριάζει το ίδιο accent. */}
              <svg width="26" height="26" viewBox="0 0 24 24" fill="#D9B54A">
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          )}
        </div>
      );
    }

    // Οι γειτονικές (peek) φωτογραφίες δείχνουν το ελαφρύ preview (~1200px)
    // αντί για το πλήρες original (συχνά 3-10MB) - αλλιώς κάθε swipe
    // κατεβάζει 3 ολόκληρα originals, πολύ αργό σε φορτωμένο venue wifi.
    // Η τρέχουσα φωτο μένει σε πλήρη ποιότητα (zoom/λήψη).
    if (!isCurrent) {
      return <img src={thumbUrl} alt="" style={styles.image} draggable={false} />;
    }
    // Τρέχουσα φωτο: το preview (ήδη cached από το peek) από κάτω, το πλήρες
    // original από πάνω - φαίνεται αμέσως κάτι σωστό και "οξύνει" μόλις
    // φορτώσει το original. key={media.id} ώστε να μη μείνει στιγμιαία
    // ορατή η ΠΡΟΗΓΟΥΜΕΝΗ φωτο όσο φορτώνει η νέα.
    return (
      <div key={media.id} style={{ position: 'relative', width: '100%', height: '100%' }}>
        {media.preview_path && (
          <img src={thumbUrl} alt="" style={styles.image} draggable={false} />
        )}
        <img
          src={getPhotoUrl(media.file_path)}
          alt="Event moment"
          style={media.preview_path ? { ...styles.image, position: 'absolute', top: 0, left: 0 } : styles.image}
          draggable={false}
        />
      </div>
    );
  };

  const hasPrev = index > 0;
  const hasNext = index < list.length - 1;
  const prevPhoto = hasPrev ? list[index - 1] : null;
  const nextPhoto = hasNext ? list[index + 1] : null;

  // Ελέγχει αν ένα tap ήταν "διπλό" (δεύτερο tap μέσα σε ~320ms, κοντά στο
  // ίδιο σημείο) - zoom-in κεντραρισμένο στο σημείο του tap, ή zoom-out αν
  // ήδη είμαστε zoomed. Ίδιο πρότυπο με iOS Photos/Instagram.
  const handlePossibleDoubleTap = (e) => {
    const now = Date.now();
    const last = lastTapRef.current;
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    const isDoubleTap = now - last.time < 320 && Math.hypot(dx, dy) < 40;

    if (!isDoubleTap) {
      lastTapRef.current = { time: now, x: e.clientX, y: e.clientY };
      return;
    }

    // Κατανάλωσε το tap ώστε ένα ενδεχόμενο τρίτο tap να μην μετρήσει σαν
    // "διπλό" με αυτό.
    lastTapRef.current = { time: 0, x: 0, y: 0 };

    if (scaleRef.current > 1.01) {
      scaleRef.current = 1;
      translateRef.current = { x: 0, y: 0 };
      applyZoomTransform(false);
      return;
    }

    const rect = contentRef.current?.getBoundingClientRect();
    if (!rect) {
      scaleRef.current = DOUBLE_TAP_SCALE;
      applyZoomTransform(false);
      return;
    }
    // Το σημείο του tap πρέπει να μείνει "κάτω από το δάχτυλο" μετά το
    // zoom - μεταφράζουμε την απόσταση του tap από το κέντρο σε
    // αντίστοιχο translate ώστε να κεντράρει εκεί, όχι στο μέσο της οθόνης.
    const offsetX = e.clientX - (rect.left + rect.width / 2);
    const offsetY = e.clientY - (rect.top + rect.height / 2);
    const next = clampTranslate(DOUBLE_TAP_SCALE, -offsetX * (DOUBLE_TAP_SCALE - 1), -offsetY * (DOUBLE_TAP_SCALE - 1));
    scaleRef.current = DOUBLE_TAP_SCALE;
    translateRef.current = next;
    applyZoomTransform(false);
  };

  const handlePointerDown = (e) => {
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const pts = Array.from(activePointersRef.current.values());

    if (pts.length >= 2) {
      // Ξεκινάει pinch (2ο δάχτυλο) - ακύρωσε οποιοδήποτε swipe-drag ήταν
      // ήδη σε εξέλιξη από το πρώτο δάχτυλο.
      draggingRef.current = false;
      setUseTransition(false);
      setDragX(0);
      panRef.current = null;
      const [p1, p2] = pts;
      pinchRef.current = {
        startDist: distanceBetween(p1, p2) || 1,
        startScale: scaleRef.current,
        startMid: midpointOf(p1, p2),
        startTranslate: { ...translateRef.current }
      };
      return;
    }

    if (scaleRef.current > 1.01) {
      // Ήδη zoomed: το μονό δάχτυλο κάνει pan μέσα στην εικόνα, όχι swipe
      // ανάμεσα σε φωτογραφίες.
      panRef.current = { startX: e.clientX, startY: e.clientY, startTranslate: { ...translateRef.current } };
      return;
    }

    // Κανονικό swipe-to-navigate (μόνο όταν δεν είμαστε zoomed).
    if (e.pointerType === 'touch' && !e.isPrimary) return;
    draggingRef.current = true;
    startXRef.current = e.clientX;
    setUseTransition(false);
  };

  const handlePointerMove = (e) => {
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    const pts = Array.from(activePointersRef.current.values());

    if (pinchRef.current && pts.length >= 2) {
      const [p1, p2] = pts;
      const dist = distanceBetween(p1, p2) || 1;
      const mid = midpointOf(p1, p2);
      const ratio = dist / pinchRef.current.startDist;
      const nextScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, pinchRef.current.startScale * ratio));
      const dx = mid.x - pinchRef.current.startMid.x;
      const dy = mid.y - pinchRef.current.startMid.y;
      const next = clampTranslate(
        nextScale,
        pinchRef.current.startTranslate.x + dx,
        pinchRef.current.startTranslate.y + dy
      );
      scaleRef.current = nextScale;
      translateRef.current = next;
      // Απευθείας στο DOM - ΟΧΙ setState - βλ. σχόλιο πιο πάνω στο
      // applyZoomTransform: αυτό είναι το κρίσιμο σημείο που κρατάει το
      // pinch ομαλό/60fps ακόμα και σε πιο αδύναμα κινητά.
      applyZoomTransform(true);
      return;
    }

    if (panRef.current) {
      const dx = e.clientX - panRef.current.startX;
      const dy = e.clientY - panRef.current.startY;
      const next = clampTranslate(
        scaleRef.current,
        panRef.current.startTranslate.x + dx,
        panRef.current.startTranslate.y + dy
      );
      translateRef.current = next;
      applyZoomTransform(true);
      return;
    }

    if (!draggingRef.current) return;
    let delta = e.clientX - startXRef.current;
    // "Ελαστική" αντίσταση στις άκρες (δεν υπάρχει prev/next).
    if ((delta > 0 && !hasPrev) || (delta < 0 && !hasNext)) {
      delta = delta / 3;
    }
    setDragX(delta);
  };

  // Η "απόσταση ενός slide" στο transform πρέπει να περιλαμβάνει και το
  // gutter ανάμεσα στις φωτο, αλλιώς το commit θα σταματούσε λίγο πριν/μετά
  // τη σωστή θέση.
  const step = containerWidth + GUTTER;

  const finishDrag = (e) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const threshold = Math.max(50, containerWidth * 0.18);
    // Σχεδόν καθόλου οριζόντια μετακίνηση = tap, όχι swipe. Σε βίντεο, ένα
    // tap κάνει play/pause· σε φωτογραφία, ένα διπλό tap κάνει zoom in/out
    // (μονό tap δεν κάνει τίποτα, όπως πάντα).
    // ΔΙΟΡΘΩΣΗ ("στο βίντεο χρειάζεται 2 tap για να ξεκινήσει"): το όριο
    // ήταν πολύ αυστηρό (6px) - ένα φυσιολογικό tap σε κινητό έχει σχεδόν
    // πάντα λίγη ακούσια μετατόπιση δαχτύλου ανάμεσα σε pointerdown/up
    // (π.χ. 10-20px), που ξεπερνούσε το όριο και δεν μετρούσε ΟΥΤΕ ως tap
    // ΟΥΤΕ ως swipe (ήταν κάτω από το swipe-commit threshold） - απλά δεν
    // συνέβαινε τίποτα στο πρώτο tap. Το δεύτερο tap (συνήθως πιο
    // "σταθερό") έπεφτε τυχαία κάτω από τα 6px και δούλευε. Μεγαλώνουμε το
    // όριο σε 18px - αρκετό για φυσιολογικό tap-jitter, πολύ μικρότερο από
    // το πραγματικό swipe-commit threshold (βλ. "threshold" πιο πάνω,
    // τουλάχιστον 50px), άρα δεν μπερδεύεται με πραγματικό swipe.
    const wasTap = Math.abs(dragX) < 18;
    setUseTransition(true);
    if (dragX <= -threshold && hasNext) {
      pendingDirRef.current = -1;
      setDragX(-step);
    } else if (dragX >= threshold && hasPrev) {
      pendingDirRef.current = 1;
      setDragX(step);
    } else {
      pendingDirRef.current = 0;
      setDragX(0);
      if (wasTap) {
        if (currentPhoto.media_type === 'video') {
          toggleVideoPlay();
        } else {
          handlePossibleDoubleTap(e);
        }
      }
    }
  };

  const handlePointerUp = (e) => {
    activePointersRef.current.delete(e.pointerId);
    const remaining = activePointersRef.current.size;

    if (pinchRef.current) {
      if (remaining < 2) {
        const endedScale = scaleRef.current;
        pinchRef.current = null;
        if (endedScale <= 1.05) {
          // Επέστρεψε σχεδόν στο αρχικό μέγεθος - "καρφώνει" καθαρά στο 1x
          // ώστε να ξαναδουλέψει κανονικά το swipe-to-navigate.
          scaleRef.current = 1;
          translateRef.current = { x: 0, y: 0 };
          applyZoomTransform(false);
        } else if (remaining === 1) {
          // Έφυγε το ένα από τα δύο δάχτυλα - το άλλο συνεχίζει ως pan.
          const p = Array.from(activePointersRef.current.values())[0];
          if (p) {
            panRef.current = { startX: p.x, startY: p.y, startTranslate: { ...translateRef.current } };
          }
        }
      }
      return;
    }

    if (panRef.current) {
      if (remaining === 0) panRef.current = null;
      return;
    }

    finishDrag(e);
  };

  const handleTrackTransitionEnd = () => {
    const dir = pendingDirRef.current;
    if (dir !== 0) {
      const newIdx = index - dir;
      // Το reset γίνεται ΧΩΡΙΣ transition, στο ίδιο render με την αλλαγή
      // index - το περιεχόμενο του slot "μετακινείται" νοητά κατά μία θέση
      // ακριβώς όσο μετακινείται πίσω και το transform, οπότε ο χρήστης δεν
      // βλέπει κανένα jump/flash, μόνο το ομαλό slide που προηγήθηκε.
      setUseTransition(false);
      setDragX(0);
      setIndex(newIdx);
      onNavigate?.(newIdx);
    }
    pendingDirRef.current = 0;
  };

  const trackStyle = {
    ...styles.track,
    width: containerWidth ? `${containerWidth * 3 + GUTTER * 2}px` : '300%',
    transform: `translateX(${-step + dragX}px)`,
    transition: useTransition ? 'transform 320ms cubic-bezier(.22,.61,.36,1)' : 'none'
  };

  const slideStyle = {
    ...styles.slide,
    width: containerWidth ? `${containerWidth}px` : '100%'
  };

  const gutterStyle = {
    flexShrink: 0,
    width: `${GUTTER}px`
  };

  return (
    <div style={styles.overlay}>
      {/* ΔΙΟΡΘΩΣΗ (design review - "σαν το native iOS Photos"): το top bar
      ξαναχτίστηκε για να μοιάζει με το native Photos app - back arrow
      αριστερά, κεντραρισμένος counter, download icon δεξιά (εκεί που το
      iOS Photos έχει το δικό του share icon - εδώ βάζουμε κατευθείαν
      download, αφού αυτό κάνει ουσιαστικά το handleDownload: μέσω Web
      Share API σε κινητό, classic download σε desktop). Το download
      κουμπί μετακόμισε εδώ ΑΠΟ το bottomBar - δεν υπάρχει πια διπλό. */}
      <div style={styles.topBar}>
        <button type="button" onClick={onClose} style={styles.closeBtn} aria-label="Κλείσιμο">
          {/* ΔΙΟΡΘΩΣΗ ("premium X"): το ✕ ξεχωρίζει τώρα από τα υπόλοιπα
          icons - συμπαγές χρυσό gradient background (ίδιο gradient με τα
          primary buttons στο PhotoPreviewModal.jsx) αντί για navy glass,
          με σκούρο navy ✕ από πάνω (αντί για χρυσό περίγραμμα) - πιο
          "premium" look, σαν badge, και ταυτόχρονα η πιο ευδιάκριτη ενέργεια
          του πάνω bar αφού είναι η μοναδική που κλείνει το lightbox. */}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0A1628" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 6L6 18" />
            <path d="M6 6l12 12" />
          </svg>
        </button>
        {/* ΔΙΟΡΘΩΣΗ: το "list" είναι ταξινομημένο νεότερη-πρώτα (index 0 =
        η πιο πρόσφατη φωτο) - γι' αυτό, όταν χρησιμοποιούσαμε "index + 1"
        απευθείας, η ΝΕΟΤΕΡΗ φωτογραφία έπαιρνε πάντα τον αριθμό "1" (ενώ
        χρονολογικά είναι η ΤΕΛΕΥΤΑΙΑ, π.χ. η 79η). Το "list.length - index"
        δίνει το πραγματικό χρονολογικό νούμερο: η παλιότερη φωτο = 1, η πιο
        πρόσφατη = list.length (π.χ. 79) - αυξάνεται φυσικά όσο ανεβαίνουν
        νέες φωτογραφίες, χωρίς να αλλάζει η σειρά εμφάνισης (που παραμένει
        νεότερη-πρώτα). */}
        <span style={styles.counter}>{list.length - index} / {list.length}</span>
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          style={styles.iconBtn}
          aria-label="αποθήκευση στη συλλογή"
        >
          {downloading ? (
            <span style={styles.deleteSpinner} />
          ) : downloadDone ? (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D9B54A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          ) : (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#D9B54A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12" />
              <path d="M7.5 10.5L12 15l4.5-4.5" />
              <path d="M5 19h14" />
            </svg>
          )}
        </button>
      </div>

      {downloadDone && (
        <div style={styles.downloadDoneToast} role="status">
          ✓ {downloadDone}
        </div>
      )}

      {downloadError && (
        <div style={styles.downloadErrorToast}>
          Η λήψη απέτυχε - δοκίμασε ξανά
        </div>
      )}

      <div
        ref={contentRef}
        style={styles.content}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div style={trackStyle} onTransitionEnd={handleTrackTransitionEnd}>
          <div style={slideStyle}>
            {renderMedia(prevPhoto, false)}
          </div>
          <div style={gutterStyle} aria-hidden="true" />
          <div style={slideStyle}>
            <div ref={zoomWrapperRef} style={styles.zoomWrapper}>
              {renderMedia(currentPhoto, true)}
            </div>
          </div>
          <div style={gutterStyle} aria-hidden="true" />
          <div style={slideStyle}>
            {renderMedia(nextPhoto, false)}
          </div>
        </div>
      </div>

      <div style={styles.bottomBar}>
        <div style={styles.infoRow}>
          {/* ΔΙΟΡΘΩΣΗ (design review - "πολύ ai vibe coded", "δεν ξέρω αν
          είναι χρήσιμο το avatar"): το avatar ήταν απλά το πρώτο γράμμα
          του ονόματος μέσα σε κύκλο - καθαρά διακοσμητικό (δεν υπάρχουν
          πραγματικά avatar/προφίλ αφού δεν υπάρχουν λογαριασμοί), καμία
          επιπλέον πληροφορία πέρα από το ίδιο το όνομα που φαίνεται ήδη
          δίπλα. Αφαιρέθηκε - το όνομα μεγάλωσε λίγο για να κρατήσει το
          οπτικό βάρος της γραμμής χωρίς τον κύκλο. */}
          <div style={styles.uploaderInfo}>
            <div>
              <p style={styles.uploaderName}>{currentPhoto.uploaded_by || 'anonymous'}</p>
              <p style={styles.dateText}>
                {new Date(currentPhoto.created_at).toLocaleDateString('el-GR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </p>
            </div>
          </div>

          <div style={styles.actionsRight}>
            <button type="button" onClick={onToggleLike} style={styles.actionBadge} aria-label="like">
              {/* Ίδιο λεπτό/premium heart path με το PhotoGallery.jsx -
              συνέπεια σχήματος σε όλη την εφαρμογή. */}
              {isLiked ? (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#E4483F">
                  <path d="M12 21c5.25-3.55 10.5-7.5 10.5-12.75a5.235 5.235 0 0 0-5.25-5.25c-1.35 0-2.685.51-3.675 1.515L12 6.105l-1.575-1.59A5.235 5.235 0 0 0 6.75 3a5.25 5.25 0 0 0-5.25 5.25c0 5.25 5.25 9.2 10.5 12.75z" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 21c5.25-3.55 10.5-7.5 10.5-12.75a5.235 5.235 0 0 0-5.25-5.25c-1.35 0-2.685.51-3.675 1.515L12 6.105l-1.575-1.59A5.235 5.235 0 0 0 6.75 3a5.25 5.25 0 0 0-5.25 5.25c0 5.25 5.25 9.2 10.5 12.75z" />
                </svg>
              )}
              {likeCount > 0 && <span style={styles.likeCountText}>{likeCount}</span>}
            </button>

            {/* ΔΙΟΡΘΩΣΗ (full top bar redesign): το κουμπί λήψης μετακόμισε
            στο top bar (δίπλα στο back arrow) - όπως στο native iOS Photos.
            Δεν υπάρχει πια εδώ, ώστε να μην υπάρχει διπλό κουμπί. */}

            {canDelete && (
              <button type="button" onClick={onDelete} disabled={deleting} style={styles.deleteBadge} aria-label="διαγραφή φωτογραφίας">
                {deleting ? (
                  <span style={styles.deleteSpinner} />
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="3 6 5 6 21 6" />
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    <line x1="10" y1="11" x2="10" y2="17" />
                    <line x1="14" y1="11" x2="14" y2="17" />
                  </svg>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

const styles = {
  overlay: {
    // ΔΙΟΡΘΩΣΗ ("όλα κολλημένα, η εικόνα δεν καλύπτει αριστερά-δεξιά σαν
    // το native"): πριν, το overlay ήταν flex column με topBar/content/
    // bottomBar σαν 3 διαδοχικά "κομμάτια" διάταξης (justifyContent:
    // 'space-between') - το topBar (60px) και το bottomBar έτρωγαν
    // ΠΡΑΓΜΑΤΙΚΟ ύψος από το content, μικραίνοντάς το κάθετα. Έτσι το
    // content γινόταν σχετικά "πιο πλατύ" (width/height ratio) από την
    // ίδια τη φωτογραφία, οπότε το objectFit:'contain' τη "γέμιζε" κατά
    // ύψος αφήνοντας μαύρες λωρίδες αριστερά/δεξιά αντί να καλύπτει όλο
    // το πλάτος. Στο native iOS Photos, τα πάνω/κάτω bars ΕΠΙΠΛΕΟΥΝ πάνω
    // από τη φωτογραφία (με gradient, όχι αδιαφανές φόντο) - η ίδια η
    // φωτογραφία πιάνει ΟΛΗ την οθόνη. Γι' αυτό τώρα: το overlay είναι
    // απλό full-screen container, και topBar/content/bottomBar γίνονται
    // positioned layers (content γεμίζει όλη την οθόνη, τα bars επιπλέουν
    // από πάνω με absolute positioning).
    position: 'fixed',
    inset: 0,
    zIndex: 10000,
    background: '#000000',
    overflow: 'hidden',
    userSelect: 'none'
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '60px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    // ΔΙΟΡΘΩΣΗ: safe-area inset ώστε στο iPhone (notch/Dynamic Island) το
    // back arrow/counter/download να μην κολλάνε στην πάνω άκρη.
    paddingTop: 'env(safe-area-inset-top)',
    background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)',
    zIndex: 20
  },
  // ΝΕΟ (code review - "σιωπηλή αποτυχία λήψης"): μικρό, αυτο-εξαφανιζόμενο
  // μήνυμα όταν αποτύχει το handleDownload - βλ. σχόλιο εκεί.
  downloadErrorToast: {
    position: 'absolute',
    top: 'calc(60px + env(safe-area-inset-top) + 10px)',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(10, 22, 40, 0.92)',
    border: '1px solid rgba(228, 72, 63, 0.5)',
    color: '#fff',
    fontSize: '13px',
    fontWeight: '600',
    padding: '8px 16px',
    borderRadius: '999px',
    zIndex: 25,
    whiteSpace: 'nowrap'
  },
  downloadDoneToast: {
    position: 'absolute',
    top: 'calc(60px + env(safe-area-inset-top) + 10px)',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(10, 22, 40, 0.92)',
    border: '1px solid rgba(217, 181, 74, 0.6)',
    color: '#D9B54A',
    fontSize: '13px',
    fontWeight: '600',
    padding: '8px 16px',
    borderRadius: '999px',
    zIndex: 25,
    whiteSpace: 'nowrap'
  },
  counter: {
    // ΔΙΟΡΘΩΣΗ (full top bar redesign): flex:1 + textAlign center ώστε ο
    // μετρητής να μένει πάντα στο ΚΕΝΤΡΟ του top bar (σαν το native iOS
    // Photos), ανεξάρτητα από το πλάτος των δύο κουμπιών αριστερά/δεξιά -
    // με simple space-between στο topBar, ο counter θα πήγαινε στο κέντρο
    // μόνο όταν τα δύο κουμπιά έχουν ακριβώς το ίδιο πλάτος.
    flex: 1,
    textAlign: 'center',
    // ΔΙΟΡΘΩΣΗ ("τα χρώματα πιο κοντά στην εφαρμογή"): απαλό χρυσό αντί για
    // ουδέτερο λευκό - ίδιο brand accent (#D9B54A) με το υπόλοιπο app.
    color: 'rgba(217, 181, 74, 0.85)',
    fontSize: '14px',
    fontWeight: '600'
  },
  iconBtn: {
    // ΔΙΟΡΘΩΣΗ ("τα χρώματα πιο κοντά στην εφαρμογή"): το γυάλινο
    // background/border ήταν ουδέτερο λευκό - τώρα navy glass (#0A1628,
    // ίδιο με το φόντο στο PhotoPreviewModal.jsx) με λεπτό χρυσό περίγραμμα,
    // ώστε να ταιριάζει με την γενική παλέτα navy+gold της εφαρμογής.
    background: 'rgba(10, 22, 40, 0.55)',
    border: '1px solid rgba(217, 181, 74, 0.35)',
    color: '#D9B54A',
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    fontSize: '18px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  // ΝΕΟ ("premium X"): ξεχωριστό στυλ για το κουμπί κλεισίματος - συμπαγές
  // χρυσό gradient badge (ίδιο gradient με τα primary κουμπιά της
  // εφαρμογής, π.χ. PhotoPreviewModal.jsx) με απαλή σκιά, αντί για navy
  // glass σαν τα υπόλοιπα icons του top bar.
  closeBtn: {
    background: 'linear-gradient(135deg, #D9B54A 0%, #C79A2E 100%)',
    border: 'none',
    width: '36px',
    height: '36px',
    borderRadius: '50%',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 2px 10px rgba(0, 0, 0, 0.35)'
  },
  content: {
    // ΔΙΟΡΘΩΣΗ: τώρα γεμίζει ΟΛΗ την οθόνη (όχι πια flex:1 μέσα σε column
    // layout) - τα topBar/bottomBar επιπλέουν από πάνω του με δικό τους
    // absolute positioning (βλ. σχόλιο στο styles.overlay).
    position: 'absolute',
    inset: 0,
    overflow: 'hidden',
    // ΔΙΟΡΘΩΣΗ ("κολλάει η πρώτη φορά, χρειάζεται 2ο swipe"): ήταν
    // 'pan-y' (επιτρέπει στον browser να διαχειριστεί κάθετο scroll εδώ),
    // αλλά μέσα στο lightbox δεν υπάρχει ΚΑΘΟΛΟΥ κάθετο περιεχόμενο προς
    // scroll (το κλείσιμο γίνεται με το κουμπί ✕, όχι swipe-down) - το
    // 'pan-y' απλά έκανε τον browser να καθυστερεί/να "διστάζει" να δώσει
    // τον έλεγχο του gesture στο δικό μας pointermove handler όσο
    // προσπαθούσε να αποφασίσει αν είναι οριζόντιο ή κάθετο swipe (ειδικά
    // σε λίγο διαγώνια/αργά swipes) - εξηγεί γιατί ήταν τυχαίο/περιστασιακό.
    // Με 'none', όλο το gesture χειρίζεται αποκλειστικά το δικό μας JS από
    // την πρώτη στιγμή, χωρίς καμία αναμονή/διαπραγμάτευση με τον browser -
    // το ίδιο 'none' είναι ΚΑΙ προϋπόθεση για να δουλέψει το pinch-to-zoom
    // παρακάτω (αλλιώς ο browser θα προσπαθούσε να κάνει native page-zoom).
    touchAction: 'none'
  },
  track: {
    display: 'flex',
    height: '100%',
    willChange: 'transform'
  },
  slide: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxSizing: 'border-box',
    overflow: 'hidden'
  },
  // Wrapper γύρω από το ΤΡΕΧΟΝ media - εδώ εφαρμόζεται το pinch/pan
  // transform απευθείας μέσω ref (βλ. applyZoomTransform στο component),
  // ΟΧΙ μέσω React state/re-render. Το willChange προ-ειδοποιεί τον
  // browser να ετοιμάσει ξεχωριστό compositor layer από την αρχή, ώστε η
  // πρώτη κιόλας κίνηση του pinch να είναι ήδη ομαλή (χωρίς το "τίναγμα"
  // που θα υπήρχε αν ο browser έφτιαχνε το layer μόνο την ώρα του πρώτου
  // transform).
  zoomWrapper: {
    width: '100%',
    height: '100%',
    transformOrigin: 'center center',
    willChange: 'transform',
    transform: 'translate(0px, 0px) scale(1)'
  },
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    pointerEvents: 'none'
  },
  // ΝΕΟ (βλ. σχόλιο στο renderMedia): spinner όσο το βαρύ βίντεο φορτώνει.
  videoLoadingOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
    pointerEvents: 'none'
  },
  videoLoadingText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: '13px',
    fontWeight: '600'
  },
  // ΝΕΟ: μήνυμα + link λήψης όταν το βίντεο δεν προλαβαίνει να παίξει
  // inline (π.χ. πολύ μεγάλο αρχείο σε αργό δίκτυο) - αντί για μόνιμη
  // μαύρη οθόνη χωρίς καμία εξήγηση.
  videoErrorOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '80%',
    maxWidth: '280px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '14px',
    textAlign: 'center'
  },
  videoErrorText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: '14px',
    lineHeight: 1.4,
    margin: 0
  },
  videoErrorLink: {
    display: 'inline-block',
    padding: '10px 18px',
    borderRadius: '999px',
    background: 'rgba(255,255,255,0.12)',
    border: '1px solid rgba(255,255,255,0.3)',
    color: '#fff',
    fontSize: '13px',
    fontWeight: '700',
    textDecoration: 'none'
  },
  videoPlayOverlay: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    // ΔΙΟΡΘΩΣΗ ("τα χρώματα πιο κοντά στην εφαρμογή"): λεπτό χρυσό
    // περίγραμμα στο ίδιο navy glass background με τα iconBtn του top bar,
    // ώστε το play button να ταιριάζει με την ίδια παλέτα.
    background: 'rgba(10, 22, 40, 0.55)',
    border: '1px solid rgba(217, 181, 74, 0.35)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    // Καθαρά διακοσμητικό - το πραγματικό play/pause γίνεται από το tap
    // detection στο finishDrag(), όχι από κλικ πάνω σε αυτό το εικονίδιο.
    pointerEvents: 'none',
    paddingLeft: '4px'
  },
  bottomBar: {
    // ΔΙΟΡΘΩΣΗ: επιπλέει στο κάτω μέρος της οθόνης με absolute positioning
    // (βλ. σχόλιο στο styles.overlay) αντί να παίρνει layout χώρο από το
    // content - έτσι η φωτογραφία/βίντεο πιάνει όλη την οθόνη από κάτω.
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 20,
    padding: '16px 20px calc(24px + env(safe-area-inset-bottom)) 20px',
    // ΔΙΟΡΘΩΣΗ ("το μαύρο διάφανο από κάτω;"): πριν ήταν σχεδόν συμπαγές
    // μαύρο (0.95 -> 0.8, ΔΕΝ ξεθώριαζε πραγματικά ποτέ) με στρογγυλεμένες
    // πάνω γωνίες - έμοιαζε σαν "κουτί" πάνω στη φωτογραφία αντί να
    // επιπλέει διάφανο σαν το topBar. Τώρα ίδιας λογικής gradient με το
    // topBar αλλά ανάποδα (to top): ξεκινά διάφανο ΠΑΝΩ (εκεί που ενώνεται
    // με τη φωτογραφία) και σκουραίνει μόνο κοντά στην κάτω άκρη - όχι πια
    // "κουτί", απλά ένα φυσικό σκίασμα σαν το native iOS Photos.
    background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.55) 60%, transparent 100%)',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    alignItems: 'center'
  },
  // ΔΙΟΡΘΩΣΗ (design review - "κουτί μέσα σε κουτί, πολύ vibe coded"): το
  // infoRow ήταν ΑΚΟΜΑ μια στρογγυλεμένη "glass card" (δικό της background/
  // border/padding) ΜΕΣΑ στο ήδη σκούρο bottomBar panel - διπλή συσκευασία
  // χωρίς λόγο. Αφαιρέθηκε το δικό του background/border/radius· το
  // περιεχόμενο κάθεται πλέον απευθείας πάνω στο bottomBar, μόνο με
  // justify-content: space-between για τη διάταξη.
  infoRow: {
    width: '100%',
    maxWidth: '360px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  uploaderInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px'
  },
  uploaderName: {
    color: 'white',
    fontSize: '15px',
    fontWeight: '600',
    margin: 0
  },
  dateText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: '11px',
    margin: 0
  },
  actionsRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  actionBadge: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    minWidth: '32px',
    height: '32px',
    padding: '0 8px',
    // ΔΙΟΡΘΩΣΗ ("τα χρώματα πιο κοντά στην εφαρμογή"): ίδιο navy/gold glass
    // με τα κουμπιά του top bar, για συνέπεια σε όλο το lightbox.
    background: 'rgba(10, 22, 40, 0.55)',
    border: '1px solid rgba(217, 181, 74, 0.35)',
    borderRadius: '16px',
    cursor: 'pointer'
  },
  likeCountText: {
    color: '#fff',
    fontSize: '13px',
    fontWeight: '600'
  },
  deleteBadge: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '32px',
    height: '32px',
    background: 'rgba(228, 72, 63, 0.35)',
    border: '1px solid rgba(228, 72, 63, 0.5)',
    borderRadius: '50%',
    cursor: 'pointer'
  },
  deleteSpinner: {
    width: '14px',
    height: '14px',
    borderRadius: '50%',
    border: '2px solid rgba(255,255,255,0.35)',
    borderTopColor: '#fff',
    animation: 'spin 0.8s linear infinite',
    display: 'inline-block'
  }
};