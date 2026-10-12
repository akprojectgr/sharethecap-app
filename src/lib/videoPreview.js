// Δημιουργεί ένα JPEG thumbnail (ένα frame) από ένα βίντεο αρχείο, τοπικά
// στη συσκευή του guest - πριν καν ανέβει κάτι στο Supabase. Χρησιμοποιείται
// σαν "preview" για βίντεο στο gallery, ακριβώς όπως το createPreviewBlob
// κάνει resize σε μια φωτογραφία - έτσι το gallery δείχνει πάντα μια μικρή,
// γρήγορη εικόνα αντί να κατεβάζει/φορτώνει ολόκληρο το βίντεο μόνο και
// μόνο για να δείξει το thumbnail του.
//
// ΔΙΟΡΘΩΣΗ ("το thumbnail στο gallery ανεβαίνει μαύρο") - ΙΔΙΑ οικογένεια
// bug με αυτό που βρέθηκε/διορθώθηκε στο VideoRecorder.jsx: το απλό
// loadedmetadata -> seek -> seeked pattern είναι αναξιόπιστο σε
// φρεσκοφτιαγμένα βίντεο (π.χ. μόλις ηχογραφημένα μέσα στην ίδια σελίδα
// με MediaRecorder) σε iOS Safari - είτε το seek δεν "πιάνει" καθόλου
// (λόγω σπασμένου duration metadata), είτε το 'seeked' event απλά δεν
// πυροδοτείται ποτέ, οπότε η Promise κρεμόταν μέχρι το 8s timeout και
// γύρναγε null (= gallery δείχνει μαύρο/άδειο thumbnail, το ίδιο
// πρόβλημα που είχαμε στο preview της εγγραφής). Σκληραίνουμε τη λογική:
//   1) "Ξεκλείδωμα" σπασμένου duration (seek σε τεράστιο currentTime
//      πρώτα) πριν τον πραγματικό στόχο - ίδιο τρικ με το VideoRecorder.
//   2) ΠΟΛΛΑΠΛΑ events (seeked/loadeddata/canplay) μπορούν να
//      πυροδοτήσουν το capture - όποιο έρθει πρώτο, με guard ώστε να μην
//      "τραβήξουμε" δύο φορές.
//   3) Αν με την πρώτη denominator δεν δουλέψει τίποτα μέχρι 8s, δοκιμάζει
//      ΞΑΝΑ μία φορά να τραβήξει ό,τι frame υπάρχει ήδη στο video element
//      (ακόμα κι αν δεν ήρθε ποτέ κανονικό event) πριν τελικά παραιτηθεί -
//      καλύτερα ένα "κάπως σωστό" thumbnail παρά κανένα.
export function createVideoThumbnail(file, maxWidth = 800, quality = 0.75) {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    // Χρειάζεται να ζήσει (έστω αόρατο) στο DOM σε κάποια browsers
    // (Safari/iOS) για να τρέξει σωστά το seeked event.
    video.style.position = 'fixed';
    video.style.left = '-9999px';
    video.style.width = '1px';
    video.style.height = '1px';
    document.body.appendChild(video);

    const objectUrl = URL.createObjectURL(file);
    video.src = objectUrl;

    let settled = false;

    const cleanup = () => {
      URL.revokeObjectURL(objectUrl);
      video.remove();
    };

    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      cleanup();
      resolve(result);
    };

    const captureFrame = () => {
      if (settled) return false;
      try {
        if (!video.videoWidth || !video.videoHeight) return false;
        const scale = Math.min(1, maxWidth / video.videoWidth);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(
          (blob) => finish(blob),
          'image/jpeg',
          quality
        );
        return true;
      } catch (err) {
        console.error('createVideoThumbnail: αποτυχία capture frame:', err);
        return false;
      }
    };

    // Τελευταία προσπάθεια αν δεν ήρθε ΚΑΝΕΝΑ event μέχρι το timeout -
    // καλύτερα ένα frame από ένα "ό,τι να 'ναι" state παρά τίποτα.
    const timeoutId = setTimeout(() => {
      if (!captureFrame()) finish(null);
    }, 8000);

    const seekToTarget = () => {
      // Frame στο 10% της διάρκειας (ποτέ 0 - συχνά μαύρη/άδεια εικόνα σε
      // κάποια codecs), με ανώτατο όριο 1 δευτερόλεπτο.
      const seekTo = Math.min(video.duration ? video.duration * 0.1 : 0, 1);
      try {
        video.currentTime = seekTo;
      } catch (err) {
        // Αν το seek πετάξει σφάλμα, μένουμε στα loadeddata/canplay
        // listeners παρακάτω σαν fallback - δεν παραιτούμαστε ακόμα.
      }
    };

    video.addEventListener('loadedmetadata', () => {
      if (!isFinite(video.duration) || video.duration === 0) {
        // "Ξεκλείδωμα" σπασμένου duration metadata (γνωστό quirk σε
        // φρεσκοφτιαγμένα recordings) - σεκάρουμε πρώτα πολύ μακριά, ΜΕΤΑ
        // στον πραγματικό στόχο.
        const onUnlockSeeked = () => {
          video.removeEventListener('seeked', onUnlockSeeked);
          seekToTarget();
        };
        video.addEventListener('seeked', onUnlockSeeked);
        try {
          video.currentTime = Number.MAX_SAFE_INTEGER;
        } catch (err) {
          video.removeEventListener('seeked', onUnlockSeeked);
          seekToTarget();
        }
      } else {
        seekToTarget();
      }
    });

    // Οποιοδήποτε από αυτά τα 3 events μπορεί να σημαίνει "έχουμε ήδη ένα
    // αξιοποιήσιμο frame" - το πρώτο που έρθει κερδίζει (captureFrame έχει
    // το δικό του "settled" guard, οπότε δεν τραβάμε δύο φορές).
    video.addEventListener('seeked', captureFrame);
    video.addEventListener('loadeddata', captureFrame);
    video.addEventListener('canplay', captureFrame);

    video.addEventListener('error', () => finish(null));
  });
}

// Απλός έλεγχος αν ένα File είναι βίντεο (mimetype ή, σε iOS που μερικές
// φορές δίνει άδειο/λάθος type, από την κατάληξη).
export function isVideoFile(file) {
  if (file.type && file.type.startsWith('video/')) return true;
  return /\.(mp4|mov|m4v|webm|avi|3gp)$/i.test(file.name || '');
}