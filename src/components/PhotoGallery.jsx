import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';
import { fetchLikeCounts, fetchMyLikedPhotoIds, toggleLike } from '../lib/likes';
// ΔΙΟΡΘΩΣΗ (code review - "case-sensitivity", βρέθηκε με πραγματικό build):
// το πραγματικό αρχείο είναι 'Deletetokens.js' (κεφαλαίο D, πεζά τα
// υπόλοιπα), όχι 'deleteTokens.js'.
import { getMyPhotoToken, forgetMyPhotoToken } from '../lib/Deletetokens';
import PhotoLightbox from './PhotoLightbox';

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

export default function PhotoGallery({ photos, event, getPhotoUrl, getPreviewUrl, user, onPhotoDeleted, onRequireAuth, onLightboxChange, activeTab, hasMorePhotos, loadingMore, onLoadMore }) {
  // ΔΙΟΡΘΩΣΗ (code review - "λάθος φωτο στο lightbox"): κρατάμε πλέον το ID
  // της ανοιχτής φωτογραφίας, ΟΧΙ την αριθμητική θέση της στο visiblePhotos.
  // Η λίστα είναι νεότερη-πρώτα και νέες φωτο μπαίνουν ΜΠΡΟΣΤΑ μέσω realtime
  // - όσο ο guest κοιτάζει μια φωτο στο lightbox, αν φτάσει μια καινούρια
  // ΟΛΕΣ οι θέσεις μετά αυτής shiftάρουν κατά +1. Με raw index, το lightbox
  // (και τα like/delete κουμπιά του) θα "γλιστρούσε" αθόρυβα σε ΑΛΛΗ
  // φωτογραφία χωρίς ο χρήστης να το καταλάβει. Το ID είναι σταθερό όσο
  // υπάρχει η φωτο, οπότε δεν έχει αυτό το πρόβλημα.
  const [selectedPhotoId, setSelectedPhotoId] = useState(null);
  const [likeCounts, setLikeCounts] = useState({});
  const [myLikes, setMyLikes] = useState(new Set());
  const [deletingId, setDeletingId] = useState(null);

  // Smooth "opening" εφέ όταν μπαίνουμε στη galleries: κάθε κάρτα ξεκινάει
  // αόρατη/λίγο μικρότερη και μόνο ΟΤΑΝ η ίδια η εικόνα της τελειώσει το
  // φόρτωμα (onLoad) κάνει fade-in + scale-up, με μικρό stagger ανά θέση.
  // Έτσι αντί να βλέπει ο guest τις κάρτες να "ανοίγουν κλειστές" απότομα
  // μετά από 1-2 δευτερόλεπτα (καθώς φορτώνουν τα αρχεία), βλέπει μια
  // σκόπιμη, ήρεμη είσοδο - και καμία κάρτα δεν εμφανίζεται ποτέ άδεια/pop-in.
  const [loadedPhotoIds, setLoadedPhotoIds] = useState(() => new Set());

  // ΔΙΟΡΘΩΣΗ (design review - "δεν μου αρέσει που αλλάζει σχήμα η φωτο"):
  // πριν, κάθε κάρτα έπαιρνε το ΠΡΑΓΜΑΤΙΚΟ aspect-ratio της φωτογραφίας της
  // (naturalWidth/naturalHeight) μόλις φόρτωνε - αποτέλεσμα: μια κάθετη
  // (πορτραίτο) φωτο έπαιρνε ψηλό κουτί, μια οριζόντια/τετράγωνη έπαιρνε
  // κοντό, και το grid έδειχνε ανομοιόμορφο/"σπασμένο" (ακριβώς αυτό που
  // φαίνεται στο screenshot - δύο διαφορετικά σχήματα δίπλα-δίπλα). Τώρα
  // ΟΛΕΣ οι κάρτες έχουν το ΙΔΙΟ σταθερό σχήμα (CARD_ASPECT_RATIO) - η ίδια
  // η φωτογραφία κάνει crop μέσα του μέσω object-fit:cover (ήδη υπήρχε στο
  // styles.photoImage), όπως σε κάθε τυπικό photo-grid (Instagram κλπ.).
  // Δεν χρειάζεται πλέον να παρακολουθούμε/αποθηκεύουμε το ratio ανά φωτο -
  // μόνο αν έχει φορτώσει (για το fade-in reveal animation).
  const CARD_ASPECT_RATIO = '4 / 5';

  const handlePhotoLoad = useCallback((photoId) => {
    setLoadedPhotoIds((prev) => {
      if (prev.has(photoId)) return prev;
      const next = new Set(prev);
      next.add(photoId);
      return next;
    });
  }, []);

  const customColor = event?.font_color;

  const photoCardDynamicStyle = {
    ...styles.photoCard,
    border: customColor ? `1px solid ${hexToRgba(customColor, 0.35)}` : styles.photoCard.border
  };

  const categories = useMemo(() => {
    const allCats = Array.isArray(event?.categories) ? event.categories : [];
    const hiddenCats = Array.isArray(event?.hidden_categories) ? event.hidden_categories : [];
    const visibleCats = allCats.filter(c => !hiddenCats.includes(c));

    if (visibleCats.length > 0) return visibleCats;

    const fallbackCats = Array.from(new Set(photos.map((p) => p.category).filter(Boolean)));
    return fallbackCats.filter(c => !hiddenCats.includes(c));
  }, [event?.categories, event?.hidden_categories, photos]);

  const visiblePhotos = useMemo(() => {
    if (!activeTab || activeTab === 'all') return photos;
    if (activeTab === 'liked') return photos.filter((p) => myLikes.has(p.id));
    return photos.filter((p) => p.category === activeTab);
  }, [photos, activeTab, myLikes]);

  const photoIds = photos.map((p) => p.id);
  const photoIdsKey = photoIds.join(',');

  useEffect(() => {
    let cancelled = false;
    if (photoIds.length === 0) {
      setLikeCounts({});
      setMyLikes(new Set());
      return;
    }
    (async () => {
      const [counts, mine] = await Promise.all([
        fetchLikeCounts(photoIds),
        fetchMyLikedPhotoIds(photoIds, user?.id)
      ]);
      if (!cancelled) {
        setLikeCounts(counts);
        setMyLikes(mine);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [photoIdsKey, user?.id]);

  const handleOpenLightbox = (photo) => {
    setSelectedPhotoId(photo.id);
    onLightboxChange?.(true);
  };

  // ΔΙΟΡΘΩΣΗ ("το πλήκτρο πίσω βγάζει τον guest έξω από την εφαρμογή όταν
  // είναι ανοιχτό το lightbox"): η εφαρμογή τρέχει σε browser (οι
  // περισσότεροι guests δεν την έχουν "εγκαταστήσει" σαν PWA), και το
  // άνοιγμα του lightbox είναι απλά React state - όχι πραγματική σελίδα/
  // route - οπότε το πλήκτρο "πίσω" (ή swipe-back gesture σε iOS/Android)
  // δεν είχε τίποτα να "καταναλώσει" εκεί και πήγαινε κατευθείαν στην
  // προηγούμενη πραγματική σελίδα, βγάζοντας τον guest έξω.
  //
  // Λύση: όταν ανοίγει το lightbox, σπρώχνουμε ένα history entry (χωρίς
  // αλλαγή URL) - βλ. useEffect πιο κάτω. Το πλήκτρο "πίσω" καταναλώνει
  // ΠΡΩΤΑ αυτό (κλείνοντας απλά το lightbox μέσω του popstate handler) και
  // μόνο σε ΕΠΟΜΕΝΟ "πίσω" βγαίνει πραγματικά από την εφαρμογή.
  //
  // Το closeLightbox() είναι το ΜΟΝΟ σωστό μονοπάτι κλεισίματος πλέον - το
  // χρησιμοποιούν και το κουμπί X ΚΑΙ η διαγραφή φωτογραφίας παρακάτω, ώστε
  // να καταναλώνεται πάντα σωστά το pushed entry (χωρίς "φαντασματικό"
  // επιπλέον βήμα στο ιστορικό αν κάποιος κλείσει με το X αντί για back).
  const lightboxHistoryPushedRef = useRef(false);
  const isLightboxOpen = selectedPhotoId !== null;

  const closeLightbox = useCallback(() => {
    if (lightboxHistoryPushedRef.current) {
      window.history.back();
    } else {
      setSelectedPhotoId(null);
      onLightboxChange?.(false);
    }
  }, [onLightboxChange]);

  useEffect(() => {
    if (!isLightboxOpen) return undefined;

    window.history.pushState({ klevLightbox: true }, '');
    lightboxHistoryPushedRef.current = true;

    const handlePopState = () => {
      // ΔΙΟΡΘΩΣΗ (code review - production crash): υπήρχε "setSelectedPhotoIndex"
      // που ΔΕΝ υπάρχει πουθενά στο component (το πραγματικό state setter
      // είναι "setSelectedPhotoId") - ReferenceError σε ΚΑΘΕ κλείσιμο του
      // lightbox (X ή back-swipe), αφού το closeLightbox() καλεί πάντα
      // window.history.back() όταν υπάρχει pushed entry, που πυροδοτεί
      // αυτό το handler. Ο guest έβλεπε το lightbox να "κολλάει" ανοιχτό.
      lightboxHistoryPushedRef.current = false;
      setSelectedPhotoId(null);
      onLightboxChange?.(false);
    };
    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      lightboxHistoryPushedRef.current = false;
    };
  }, [isLightboxOpen, onLightboxChange]);

  const handleCloseLightbox = () => {
    closeLightbox();
  };

  // Pop animation στην καρδιά του badge - key-based trick: κάθε φορά που
  // κάνουμε πραγματικό "like" (όχι unlike) αυξάνουμε το counter για αυτή
  // τη φωτογραφία, το οποίο remount-άρει το <span> γύρω από το SVG και
  // ξεκινάει αυτόματα το CSS animation (χωρίς χειροκίνητο reflow-hack).
  const [likePopKeys, setLikePopKeys] = useState({});

  // Το μεγάλο "heart burst" πάνω στη φωτογραφία, όταν κάνεις διπλό-tap
  // (Instagram-style). Μόνο μία κάρτα κάθε φορά μπορεί να το δείχνει.
  const [burstPhotoId, setBurstPhotoId] = useState(null);
  const burstTimeoutRef = useRef(null);

  // Tap/double-tap detection ανά κάρτα. ΜΙΑ μόνο απόφαση σε ΕΝΑ timeout
  // (μετράμε πόσα taps έγιναν μέσα στο παράθυρο και αποφασίζουμε μια φορά
  // όταν λήξει) - αυτό αποκλείει το race condition του προηγούμενου
  // pattern (δύο ξεχωριστά branches) που μπορούσε να κάνει like ΚΑΙ να
  // ανοίξει το lightbox μαζί σε ένα διπλό-tap.
  const clickCountRef = useRef({});
  const tapTimeoutRef = useRef({});

  useEffect(() => {
    const tapTimeouts = tapTimeoutRef.current;
    return () => {
      Object.values(tapTimeouts).forEach(clearTimeout);
      clearTimeout(burstTimeoutRef.current);
    };
  }, []);

  const handleToggleLike = useCallback(
    async (photo, e, opts = {}) => {
      if (e) e.stopPropagation();
      const { forceLike = false } = opts;
      // Το like ΔΕΝ χρειάζεται πλέον λογαριασμό - μπορεί να κάνει like
      // όποιος θέλει (guest ή συνδεδεμένος). Χωρίς user, το toggleLike
      // χρησιμοποιεί αυτόματα το device_token της συσκευής.
      const isLiked = myLikes.has(photo.id);
      // Το διπλό-tap πάνω στη φωτογραφία κάνει ΠΑΝΤΑ like, ποτέ unlike -
      // ίδια λογική με Instagram: αν είναι ήδη liked, το 2ο tap δεν κάνει τίποτα.
      if (forceLike && isLiked) return;

      setMyLikes((prev) => {
        const next = new Set(prev);
        isLiked ? next.delete(photo.id) : next.add(photo.id);
        return next;
      });
      setLikeCounts((prev) => ({
        ...prev,
        [photo.id]: Math.max(0, (prev[photo.id] || 0) + (isLiked ? -1 : 1))
      }));
      if (!isLiked) {
        // πηγαίνουμε προς "liked" - παίξε το pop στο badge
        setLikePopKeys((prev) => ({ ...prev, [photo.id]: (prev[photo.id] || 0) + 1 }));
      }
      // ΔΙΟΡΘΩΣΗ (code review - "η καρδιά ξε-γίνεται μόνη της σε refresh"):
      // το optimistic update πάνω γινόταν ΠΑΝΤΑ, χωρίς να ελέγχεται ποτέ αν
      // το toggleLike() πέτυχε πραγματικά - σε ασταθές venue wifi με πολλούς
      // guests μαζί, αν αποτύχει, ο guest έβλεπε κόκκινη καρδιά/+1 στο
      // μέτρημα που μετά απλά "χανόταν" σε επόμενο reload, χωρίς καμία
      // εξήγηση. Τώρα, αν αποτύχει, κάνουμε rollback στο ΙΔΙΟ optimistic
      // state (myLikes/likeCounts) ώστε η οθόνη να γυρίσει αμέσως στην
      // πραγματική κατάσταση αντί να μείνει "ψεύτικα" ενημερωμένη.
      try {
        const { error: toggleError } = await toggleLike(photo.id, photo.event_id, user?.id, isLiked);
        if (toggleError) throw toggleError;
      } catch (err) {
        console.error('toggleLike failed, rolling back optimistic update:', err);
        setMyLikes((prev) => {
          const next = new Set(prev);
          isLiked ? next.add(photo.id) : next.delete(photo.id);
          return next;
        });
        setLikeCounts((prev) => ({
          ...prev,
          [photo.id]: Math.max(0, (prev[photo.id] || 0) + (isLiked ? 1 : -1))
        }));
      }
    },
    [myLikes, user]
  );

  // Tap πάνω στην κάρτα: μετράμε πόσα taps έγιναν μέσα σε ένα παράθυρο
  // 280ms και αποφασίζουμε ΜΙΑ φορά, όταν λήξει το timeout - 1 tap ανοίγει
  // ΜΟΝΟ το lightbox, 2 (ή παραπάνω) taps κάνουν ΜΟΝΟ like + heart burst,
  // ποτέ και τα δύο μαζί.
  const handleCardTap = useCallback(
    (photo) => {
      const id = photo.id;
      clickCountRef.current[id] = (clickCountRef.current[id] || 0) + 1;

      if (clickCountRef.current[id] > 1) return; // ήδη τρέχει το timeout - απλά μετράμε

      tapTimeoutRef.current[id] = setTimeout(() => {
        const taps = clickCountRef.current[id] || 0;
        clickCountRef.current[id] = 0;

        if (taps >= 2) {
          setBurstPhotoId(id);
          clearTimeout(burstTimeoutRef.current);
          burstTimeoutRef.current = setTimeout(() => setBurstPhotoId(null), 700);
          handleToggleLike(photo, null, { forceLike: true });
        } else {
          handleOpenLightbox(photo);
        }
      }, 280);
    },
    [handleToggleLike]
  );

  const handleDeletePhoto = useCallback(
    async (photo) => {
      if (!window.confirm('Να διαγραφεί αυτή η φωτογραφία;')) return;
      setDeletingId(photo.id);
      const token = getMyPhotoToken(photo.id);
      const { data, error } = await supabase.rpc('delete_own_photo', {
        p_photo_id: photo.id,
        p_token: token
      });
      setDeletingId(null);
      if (error || !data) {
        window.alert('Δεν ήταν δυνατή η διαγραφή. Δοκίμασε ξανά.');
        return;
      }
      forgetMyPhotoToken(photo.id);

      if (selectedPhotoId === photo.id) {
        // closeLightbox() αντί για απευθείας setSelectedPhotoId(null) -
        // ώστε να καταναλωθεί σωστά το history entry που σπρώχτηκε όταν
        // άνοιξε το lightbox (βλ. σχόλιο στο handleOpenLightbox), αλλιώς θα
        // έμενε ένα "φαντασματικό" επιπλέον βήμα στο ιστορικό του browser.
        closeLightbox();
      }
      onPhotoDeleted?.(photo.id);
    },
    [selectedPhotoId, onPhotoDeleted, closeLightbox]
  );

  const canDelete = (photo) =>
    !!getMyPhotoToken(photo.id) || (user && photo.uploaded_by_user_id === user.id);

  // Βρίσκουμε τη φωτο ΚΑΘΕ φορά από το ID της, όχι από κάποια αποθηκευμένη
  // θέση - έτσι ακολουθεί σωστά τη ΣΩΣΤΗ φωτο ακόμα κι αν η λίστα shiftάρει
  // λόγω νέων realtime uploads όσο το lightbox είναι ανοιχτό. Πρέπει να
  // υπολογίζεται ΠΡΙΝ από οποιοδήποτε early return παρακάτω, ώστε το
  // useEffect που ακολουθεί να τρέχει πάντα στην ίδια σειρά (rules of hooks).
  const selectedPhotoIndex = selectedPhotoId !== null
    ? visiblePhotos.findIndex((p) => p.id === selectedPhotoId)
    : -1;
  const selectedPhoto = selectedPhotoIndex !== -1 ? visiblePhotos[selectedPhotoIndex] : null;

  // Αν η επιλεγμένη φωτο εξαφανίστηκε από τη λίστα (π.χ. διαγράφηκε από
  // άλλη συσκευή/host όσο το lightbox ήταν ανοιχτό), κλείνουμε καθαρά το
  // lightbox αντί να το αφήσουμε "ανοιχτό" με selectedPhoto === null (που θα
  // κρατούσε ενεργό το history-push του closeLightbox χωρίς να φαίνεται
  // τίποτα στην οθόνη).
  useEffect(() => {
    if (selectedPhotoId !== null && selectedPhoto === null) {
      closeLightbox();
    }
  }, [selectedPhotoId, selectedPhoto, closeLightbox]);

  if (photos.length === 0 && categories.length === 0) {
    return (
      <div style={styles.emptyState}>
        <div style={styles.emptyIconWrapper}>
          <span style={styles.emptyIcon}>📸</span>
        </div>
        <p style={styles.emptyTitle}>Δεν υπάρχουν ακόμα φωτογραφίες</p>
        <p style={styles.emptySubtitle}>Γίνε ο πρώτος που θα ανεβάσει!</p>
      </div>
    );
  }

  return (
    <>
      {visiblePhotos.length === 0 && (
        <div style={styles.emptyState}>
          <p style={styles.emptySubtitle}>
            {activeTab === 'liked' ? 'Δεν έχεις αγαπημένες φωτογραφίες ακόμα.' : 'Καμία φωτογραφία σε αυτή την κατηγορία ακόμα.'}
          </p>
        </div>
      )}

      <div style={styles.grid}>
        {visiblePhotos.map((photo, index) => {
          const isNewest = photos[0]?.id === photo.id;
          const isLiked = myLikes.has(photo.id);
          const count = likeCounts[photo.id] || 0;
          const isLoaded = loadedPhotoIds.has(photo.id);
          // Μικρό, φθίνον stagger ανά θέση (καπάρισμα στα 360ms ώστε οι
          // τελευταίες κάρτες σε μεγάλες γκαλερί να μην καθυστερούν υπερβολικά).
          const revealDelayMs = Math.min(index * 45, 360);
          const cardEntranceStyle = {
            opacity: isLoaded ? 1 : 0,
            transform: isLoaded ? 'translateY(0) scale(1)' : 'translateY(14px) scale(0.965)',
            transition: `opacity 0.55s cubic-bezier(.22,.61,.36,1) ${revealDelayMs}ms, transform 0.55s cubic-bezier(.22,.61,.36,1) ${revealDelayMs}ms`,
            // Σταθερό aspect-ratio για ΟΛΕΣ τις κάρτες (βλ. σχόλιο στο
            // handlePhotoLoad) - έτσι το grid έχει πάντα ομοιόμορφο σχήμα,
            // ανεξάρτητα από τις πραγματικές διαστάσεις κάθε φωτογραφίας·
            // το crop γίνεται μέσω object-fit:cover στο styles.photoImage.
            aspectRatio: CARD_ASPECT_RATIO
          };
          // Το "goldArrival" glow (χρυσό περίγραμμα για τη νεότερη φωτο)
          // πρέπει να ξεκινάει ΜΑΖΙ με το fade-in της κάρτας, όχι από το
          // mount - αλλιώς τρέχει ενώ η κάρτα είναι ακόμα αόρατη (opacity 0)
          // και όταν τελικά εμφανιστεί το glow είναι ήδη στη μέση/τέλος της
          // διαδρομής του, δίνοντας την εντύπωση μιας τυχαίας "γραμμής" που
          // απλά εμφανίζεται/χάνεται απότομα. Γι' αυτό η κλάση μπαίνει μόνο
          // όταν isLoaded === true, με το ίδιο delay όσο το fade-in.
          const showGoldArrival = isNewest && isLoaded;
          if (showGoldArrival) {
            cardEntranceStyle.animation = `goldArrival 2.4s ease-in-out ${revealDelayMs}ms`;
          }

          return (
            <div
              key={photo.id}
              className="photo-card-fade"
              style={{ ...photoCardDynamicStyle, ...cardEntranceStyle }}
              onClick={() => handleCardTap(photo)}
            >
              <img
                src={getPreviewUrl ? getPreviewUrl(photo) : getPhotoUrl(photo.file_path)}
                alt="Event photo"
                style={styles.photoImage}
                loading="lazy"
                onLoad={() => handlePhotoLoad(photo.id)}
              />
              {photo.media_type === 'video' && (
                // Απλό play-badge πάνω στο thumbnail - δείχνει ξεκάθαρα ότι
                // είναι βίντεο. pointerEvents: none ώστε το click να πάει
                // κανονικά στην κάρτα (άνοιγμα lightbox), όχι σε αυτό.
                <div style={styles.videoPlayBadge} aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="#16223E">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              )}
              {burstPhotoId === photo.id && (
                <div style={styles.likeBurst} aria-hidden="true">
                  <svg width="72" height="72" viewBox="0 0 24 24" fill="#E4483F" className="like-burst-heart">
                    <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
                  </svg>
                </div>
              )}
              <button
                type="button"
                onClick={(e) => handleToggleLike(photo, e)}
                aria-label="like"
                style={{
                  ...styles.likeBadge,
                  ...(isLiked ? styles.likeBadgeActive : styles.likeBadgeInactive)
                }}
              >
                {/* SVG καρδιά αντί για unicode ♡/❤ - το unicode glyph
                render διαφορετικά (και συχνά άσχημα/λοξά) ανά συσκευή και
                font, ενώ το SVG είναι πάντα ίδιο, καθαρό, στο ίδιο στυλ με
                τα υπόλοιπα icons του app (profile, join arrow). */}
                {/* key={popKey} - remount στο κάθε "like" ώστε να ξαναπαίξει
                αυτόματα το CSS pop animation (χωρίς manual reflow hack). Το
                animation μπαίνει σαν class μόνο όταν popKey > 0, ώστε να ΜΗΝ
                παίζει στο αρχικό mount της κάρτας. */}
                <span
                  key={likePopKeys[photo.id] || 0}
                  className={likePopKeys[photo.id] ? 'like-badge-pop' : undefined}
                  style={styles.likeIconWrap}
                >
                  {isLiked ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="#E4483F" style={styles.likeIcon}>
                      <path d="M11.645 20.91l-.007-.003-.022-.012a15.247 15.247 0 01-.383-.218 25.18 25.18 0 01-4.244-3.17C4.688 15.36 2.25 12.174 2.25 8.25 2.25 5.322 4.714 3 7.688 3A5.5 5.5 0 0112 5.052 5.5 5.5 0 0116.313 3c2.973 0 5.437 2.322 5.437 5.25 0 3.925-2.438 7.111-4.739 9.256a25.175 25.175 0 01-4.244 3.17 15.247 15.247 0 01-.383.219l-.022.012-.007.004-.003.001a.752.752 0 01-.704 0l-.003-.001z" />
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.95)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={styles.likeIcon}>
                      <path d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                    </svg>
                  )}
                </span>
                {count > 0 && (
                  <span style={{ fontSize: '13px', fontWeight: '600', letterSpacing: '0.1px', color: '#fff' }}>
                    {count}
                  </span>
                )}
              </button>
            </div>
          );
        })}
      </div>

      {/* ΔΙΟΡΘΩΣΗ (pagination - βλ. σχόλιο στο useEventPhotos.js): χωρίς
      αυτό, υπήρχε ΜΟΝΟ ένα "όλα ή τίποτα" φόρτωμα όλου του gallery - σε
      ένα event με πολλές εκατοντάδες φωτο/βίντεο αυτό αργεί αισθητά,
      ειδικά σε κινητό δίκτυο τη βραδιά του γάμου. Το κουμπί φαίνεται μόνο
      στην καρτέλα "Όλα" - το hasMorePhotos αναφέρεται στο ΣΥΝΟΛΙΚΟ
      gallery, όχι σε μια φιλτραρισμένη κατηγορία/λίστα αγαπημένων, οπότε
      δεν έχει νόημα εκεί. */}
      {hasMorePhotos && (!activeTab || activeTab === 'all') && (
        <div style={styles.loadMoreWrap}>
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            style={{ ...styles.loadMoreBtn, opacity: loadingMore ? 0.6 : 1 }}
          >
            {loadingMore ? 'Φόρτωση…' : 'Φόρτωσε περισσότερες'}
          </button>
        </div>
      )}

      {selectedPhoto && (
        <PhotoLightbox
          photos={visiblePhotos}
          currentIndex={selectedPhotoIndex}
          getPhotoUrl={getPhotoUrl}
          onClose={handleCloseLightbox}
          onDelete={() => handleDeletePhoto(selectedPhoto)}
          canDelete={canDelete(selectedPhoto)}
          isLiked={myLikes.has(selectedPhoto.id)}
          likeCount={likeCounts[selectedPhoto.id] || 0}
          onToggleLike={(e) => handleToggleLike(selectedPhoto, e)}
          deleting={deletingId === selectedPhoto.id}
          onNavigate={(newIdx) => {
            // Αποθηκεύουμε το ID της ΝΕΑΣ φωτο (όχι τη θέση της) - βλ.
            // σχόλιο στο selectedPhotoId state παραπάνω.
            const newPhoto = visiblePhotos[newIdx];
            if (newPhoto) setSelectedPhotoId(newPhoto.id);
          }}
        />
      )}

      <style>{`
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* v2: πριν το 0% ξεκινούσε ΚΑΤΕΥΘΕΙΑΝ στο πλήρες box-shadow (χωρίς
        fade-in) - φαινόταν σαν μια γραμμή που "πετάγεται" απότομα δίπλα
        στη φωτογραφία. Τώρα ξεκινάει από τελείως διάφανο, φτάνει ομαλά
        στο μέγιστο γύρω στο 18% και μετά σβήνει αργά - καμία απότομη
        μετάβαση σε καμία φάση. Η κλάση εφαρμόζεται πλέον μόνο ΑΦΟΥ η
        κάρτα έχει ήδη γίνει ορατή (isLoaded), οπότε είναι πάντα
        συγχρονισμένη με το fade-in της κάρτας. */
        @keyframes goldArrival {
          0%   { box-shadow: 0 0 0 0 rgba(230, 197, 148, 0); }
          18%  { box-shadow: 0 0 0 2px rgba(230, 197, 148, 0.85), 0 0 16px rgba(230, 197, 148, 0.45); }
          100% { box-shadow: 0 0 0 0 rgba(230, 197, 148, 0); }
        }

        /* Pop του heart badge όταν κάνουμε like (tap στο badge ή διπλό-tap
        στη φωτο) - "ελαστικό" bounce, ίδιο πνεύμα με το glam pattern του
        Join Party button. */
        @keyframes badgeHeartPop {
          0%   { transform: scale(1); }
          30%  { transform: scale(1.45); }
          55%  { transform: scale(0.85); }
          78%  { transform: scale(1.12); }
          100% { transform: scale(1); }
        }
        .like-badge-pop {
          animation: badgeHeartPop 0.5s cubic-bezier(.17,.89,.32,1.49);
        }

        /* Μεγάλη καρδιά που "ξεπετάγεται" στο κέντρο της φωτο σε διπλό-tap
        (Instagram-style feedback), scale+rotate pop και μετά fade-out. */
        @keyframes heartBurstPop {
          0%   { transform: scale(0.3) rotate(-8deg); opacity: 0; }
          22%  { transform: scale(1.25) rotate(4deg); opacity: 1; }
          38%  { transform: scale(0.94) rotate(-2deg); opacity: 1; }
          55%  { transform: scale(1.06) rotate(0deg); opacity: 1; }
          100% { transform: scale(1.06) rotate(0deg); opacity: 0; }
        }
        .like-burst-heart {
          animation: heartBurstPop 0.7s cubic-bezier(.2,.9,.3,1.4) forwards;
          filter: drop-shadow(0 6px 18px rgba(0,0,0,0.45));
        }

        @media (prefers-reduced-motion: reduce) {
          .photo-card-fade {
            transition: none !important;
            animation: none !important;
            opacity: 1 !important;
            transform: none !important;
          }
          .like-badge-pop {
            animation: none !important;
          }
          .like-burst-heart {
            animation: none !important;
            opacity: 0.9 !important;
          }
        }
      `}</style>
    </>
  );
}

const styles = {
  loadMoreWrap: {
    display: 'flex',
    justifyContent: 'center',
    padding: '24px 0 36px'
  },
  loadMoreBtn: {
    padding: '12px 26px',
    borderRadius: '9999px',
    border: '1px solid rgba(255,255,255,0.35)',
    background: 'rgba(255,255,255,0.08)',
    color: '#fff',
    fontWeight: 600,
    fontSize: '14px',
    cursor: 'pointer'
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '80px 20px',
    textAlign: 'center',
    animation: 'fadeInUp 0.6s ease-out'
  },
  emptyIconWrapper: {
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.05)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '20px',
    border: '1px solid rgba(255,255,255,0.1)'
  },
  emptyIcon: { fontSize: '32px' },
  videoPlayBadge: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '48px',
    height: '48px',
    borderRadius: '50%',
    background: 'rgba(255, 255, 255, 0.9)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    // Μικρό οπτικό "κέντρισμα" προς τα δεξιά ώστε το τρίγωνο του play να
    // φαίνεται οπτικά κεντραρισμένο (χωρίς αυτό δείχνει ελαφρώς μετατοπισμένο
    // αριστερά μέσα στον κύκλο).
    paddingLeft: '3px',
    boxShadow: '0 4px 14px rgba(0,0,0,0.35)',
    pointerEvents: 'none',
    zIndex: 2
  },
  emptyTitle: {
    color: 'white',
    fontSize: '20px',
    fontWeight: '600',
    marginBottom: '8px'
  },
  emptySubtitle: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: '15px'
  },
  likeBadge: {
    position: 'absolute',
    bottom: '10px',
    left: '10px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    borderRadius: '9999px',
    padding: '8px 12px',
    border: 'none',
    cursor: 'pointer',
    zIndex: 2,
    transition: 'transform 0.15s ease, background 0.2s ease, border-color 0.2s ease',
    boxShadow: '0 4px 14px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.08)'
  },
  likeIcon: {
    display: 'block',
    flexShrink: 0
  },
  likeIconWrap: {
    display: 'inline-flex',
    transformOrigin: 'center'
  },
  likeBurst: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
    zIndex: 3
  },
  likeBadgeInactive: {
    background: 'rgba(255, 255, 255, 0.16)', // Ανοιχτόχρωμο glassmorphism αντί για συμπαγές σκούρο
    border: '1px solid rgba(255, 255, 255, 0.26)'
  },
  likeBadgeActive: {
    background: 'rgba(230, 197, 148, 0.24)', // Χρυσαφί glass όταν ενεργό
    border: '1px solid rgba(230, 197, 148, 0.6)', // Χρυσαφένιο διακριτικό περίγραμμα
    boxShadow: '0 4px 14px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.1)'
  },
  grid: {
    // ΔΙΟΡΘΩΣΗ: "columnCount: 2" (CSS multi-column / masonry) γέμιζε ΠΡΩΤΑ
    // ολόκληρη την αριστερή στήλη από πάνω μέχρι κάτω και ΜΕΤΑ προχωρούσε
    // στη δεξιά (π.χ. σε 78 φωτο: 1-39 αριστερά, 40-78 δεξιά) - αυτό είναι
    // η φύση του column-fill, όχι θέμα ταξινόμησης δεδομένων (τα photos
    // έρχονται ήδη σωστά ταξινομημένα, νεότερα πρώτα, από το
    // useEventPhotos.js). Με κανονικό CSS Grid 2 στηλών + το default
    // grid-auto-flow: row, τα στοιχεία μπαίνουν σε ΣΕΙΡΑ ΑΝΑΓΝΩΣΗΣ: νεότερη
    // πάνω-αριστερά, 2η νεότερη πάνω-δεξιά, 3η νεότερη 2η σειρά-αριστερά
    // κ.ο.κ. - χωρίς κανένα διαχωρισμό αριστερά/δεξιά.
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '12px',
    padding: '16px 16px 40px',
    minHeight: '200px'
  },
  photoCard: {
    position: 'relative',
    borderRadius: '16px',
    overflow: 'hidden',
    cursor: 'pointer',
    background: '#1F231B',
    border: '1px solid rgba(230, 197, 148, 0.15)',
    display: 'block'
  },
  photoImage: {
    // Η κάρτα έχει σταθερό aspect-ratio ΓΙΑ ΟΛΕΣ τις φωτογραφίες (βλ.
    // CARD_ASPECT_RATIO / handlePhotoLoad), οπότε η εικόνα πρέπει να
    // γεμίζει ΟΛΟ το ύψος του wrapper (όχι height:'auto', που θα άφηνε
    // κενό/θα προκαλούσε παραμόρφωση) - το object-fit: cover κάνει εδώ
    // το ουσιαστικό crop ώστε κάθε φωτο, όποιες διαστάσεις και να έχει,
    // να γεμίζει το ίδιο σχήμα χωρίς τέντωμα.
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    display: 'block'
  }
};