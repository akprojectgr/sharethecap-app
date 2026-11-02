// ΝΕΟ: client-side συμπίεση φωτογραφίας ΠΡΙΝ το upload.
//
// ΓΙΑΤΙ: οι φωτογραφίες από κινητό (ειδικά iPhone) είναι συνήθως 8-15MB σε
// πλήρη ανάλυση. Σε αργό δίκτυο event (βλ. πραγματικά timeout logs που
// είχαμε δει - πολλαπλά ταυτόχρονα uploads σε 3G/κακό wifi) αυτό το μέγεθος
// είναι η βασική αιτία που ένα upload αργεί/κολλάει/κάνει timeout. Η λύση
// δεν είναι να αυξάνουμε άπειρα το timeout (βλ. UPLOAD_TIMEOUT_MS_PHOTO στο
// useEventPhotos.js - αυτό ήταν μπάλωμα, όχι λύση) αλλά να μικραίνουμε ΤΟ
// ΙΔΙΟ το αρχείο πριν φύγει από τη συσκευή του guest.
//
// ΣΤΟΧΟΣ: ~1920px στη μεγάλη διάσταση (1080p-class - αρκετό για κρυστάλλινη
// προβολή σε κινητό/projector, ταιριάζει με αυτό που ήδη υπόσχεται το
// marketing - "Full HD download"), JPEG quality ~0.82, τελικό αρχείο
// συνήθως 300-600KB αντί για 8-15MB.
//
// ΑΣΦΑΛΕΙΑ: αυτή η συνάρτηση ΔΕΝ πετάει ποτέ exception προς τα έξω. Αν
// οτιδήποτε πάει στραβά (μη υποστηριζόμενος browser, corrupt data, GIF,
// κ.λπ.) επιστρέφει το ΑΡΧΙΚΟ αρχείο αναλλοίωτο - ποτέ δεν μπλοκάρει το
// upload εξαιτίας αποτυχίας συμπίεσης.

const MAX_DIMENSION = 1920; // μεγάλη διάσταση (px) - 1080p-class
const JPEG_QUALITY = 0.82;
const SECOND_PASS_QUALITY = 0.68; // αν η 1η προσπάθεια βγει πολύ μεγάλη
const SECOND_PASS_THRESHOLD_BYTES = 1.5 * 1024 * 1024; // 1.5MB
// Αρχεία ήδη κάτω από αυτό το μέγεθος δεν αξίζει να συμπιεστούν (το
// re-encode θα μπορούσε ακόμα και να τα μεγαλώσει σε edge cases).
const SKIP_COMPRESSION_BELOW_BYTES = 350 * 1024; // 350KB

// Τύποι που ΔΕΝ συμπιέζουμε: GIF (θα "σκότωνε" το animation - το canvas
// κρατάει μόνο ένα frame), και οτιδήποτε δεν είναι αναγνωρισμένη εικόνα.
function isCompressibleImage(file) {
  if (!file || !file.type) return false;
  if (file.type === 'image/gif') return false;
  return /^image\//.test(file.type);
}

// Φορτώνει το αρχείο σε ImageBitmap εφαρμόζοντας αυτόματα τον EXIF
// orientation (imageOrientation: 'from-image') - χωρίς αυτό, φωτογραφίες
// τραβηγμένες "όρθιες" σε ορισμένα κινητά θα μπορούσαν να βγουν
// πλαγιασμένες μετά το canvas redraw. Fallback σε <img> element αν ο
// browser δεν υποστηρίζει createImageBitmap με αυτή την επιλογή (παλιά
// Safari) - τα σύγχρονα κινητά/browsers (2024+) το υποστηρίζουν κανονικά.
async function loadOrientedBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (e) {
      // μερικοί browsers/τύποι αρχείων δεν υποστηρίζουν το option - δοκίμασε
      // χωρίς αυτό πριν πέσεις σε πλήρες fallback.
      try {
        return await createImageBitmap(file);
      } catch (e2) {
        // συνεχίζουμε στο <img> fallback παρακάτω
      }
    }
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };
    img.src = url;
  });
}

function canvasToBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob επέστρεψε null'))),
      'image/jpeg',
      quality
    );
  });
}

/**
 * Συμπιέζει ένα File εικόνας πριν το upload. Επιστρέφει πάντα ένα File
 * (ή το ίδιο το αρχικό αν η συμπίεση δεν ήταν δυνατή/χρήσιμη) - ΠΟΤΕ δεν
 * πετάει exception.
 */
export async function compressImage(file) {
  try {
    if (!isCompressibleImage(file)) return file;
    if (file.size <= SKIP_COMPRESSION_BELOW_BYTES) return file;

    const source = await loadOrientedBitmap(file);
    const sourceWidth = source.width;
    const sourceHeight = source.height;
    if (!sourceWidth || !sourceHeight) {
      if (source.close) source.close();
      return file;
    }

    const scale = Math.min(1, MAX_DIMENSION / Math.max(sourceWidth, sourceHeight));
    const targetWidth = Math.round(sourceWidth * scale);
    const targetHeight = Math.round(sourceHeight * scale);

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      if (source.close) source.close();
      return file;
    }
    ctx.drawImage(source, 0, 0, targetWidth, targetHeight);
    if (source.close) source.close(); // ImageBitmap - απελευθέρωση μνήμης

    let blob = await canvasToBlob(canvas, JPEG_QUALITY);
    if (blob.size > SECOND_PASS_THRESHOLD_BYTES) {
      // 1η προσπάθεια ακόμα μεγάλη (π.χ. πολύ "πυκνή"/λεπτομερής φωτο) -
      // ξαναδοκιμάζουμε με χαμηλότερο quality αντί να στείλουμε ό,τι βγει.
      blob = await canvasToBlob(canvas, SECOND_PASS_QUALITY);
    }

    // Αν για οποιονδήποτε λόγο το συμπιεσμένο αρχείο βγήκε ΜΕΓΑΛΥΤΕΡΟ από
    // το αρχικό (σπάνιο, αλλά δυνατό σε ήδη πολύ συμπιεσμένα/μικρά jpeg),
    // κρατάμε το αρχικό - δεν έχει νόημα να "συμπιέζουμε" προς τα πάνω.
    if (blob.size >= file.size) return file;

    const newName = file.name.replace(/\.(jpe?g|png|webp|heic|heif)$/i, '') + '.jpg';
    return new File([blob], newName, { type: 'image/jpeg' });
  } catch (err) {
    console.error('Αποτυχία συμπίεσης εικόνας - χρήση αρχικού αρχείου:', err);
    return file;
  }
}
