import { useState, useEffect, useRef } from 'react';
import { supabase, supabaseUrl, supabaseAnonKey } from './supabaseClient';
import * as tus from 'tus-js-client';
import heic2any from 'heic2any';
// ΔΙΟΡΘΩΣΗ (code review - "case-sensitivity", βρέθηκε με πραγματικό build):
// τα πραγματικά αρχεία είναι 'Deletetokens.js' και 'Imagepreview.js'.
import { saveMyPhotoToken } from './Deletetokens';
import { createPreviewBlob } from './Imagepreview';
import { createVideoThumbnail, isVideoFile } from './videoPreview';
import { acquireUploadBusy, releaseUploadBusy } from './uploadBusy';

// Ανώτατο μέγεθος για βίντεο που ανεβάζει ένας guest - χωρίς αυτό, ένα
// βίντεο 4K λίγων λεπτών μπορεί εύκολα να είναι 300-500MB+ και να γεμίσει
// γρήγορα το Supabase storage plan σου. Άλλαξέ το αν θες πιο αυστηρό/χαλαρό
// όριο (σε bytes).
// ΔΙΟΡΘΩΣΗ ("δεν γίνεται να αργεί να φορτώσει παντού" - θα ανεβάζουν ΟΛΟΙ οι
// καλεσμένοι βίντεο σε ένα event): δοκιμάσαμε να κατεβάσουμε αυτό το όριο
// δραστικά, αλλά ένα απλό 30-60άρι clip σε 4K (default σε πολλά κινητά) το
// ξεπερνάει εύκολα - θα μπλόκαρε κανονικά uploads. Η ΠΡΑΓΜΑΤΙΚΗ λύση δεν
// είναι να απαγορεύουμε μεγάλα αρχεία, είναι να διορθώνουμε το ΙΔΙΟ το
// αρχείο ώστε να ανοίγει αμέσως (βλ. remuxVideoForInstantPlayback παρακάτω) -
// το πλήρες original συνεχίζει να ανεβαίνει κανονικά (τίποτα δεν
// χάνεται/περιορίζεται εδώ), μόνο που τώρα ανεβαίνει ΚΑΙ μια "fast-start"
// εκδοχή ειδικά για άμεσο playback στο lightbox. Το όριο μένει μόνο ως
// γενικό safety cap.
const MAX_VIDEO_SIZE_BYTES = 1024 * 1024 * 1024; // 1GB (ταιριάζει με το bucket limit στο Supabase - ανέβηκε από 500MB->1GB)

// ΔΙΟΡΘΩΣΗ (design review - "όταν ανοίγω ένα βίντεο δεν θέλω να περιμένει ο
// χρήστης να φορτώσει, να ανοίγει κατευθείαν αμέσα" + "δεν θέλω να πληρώνω"):
// το πραγματικό πρόβλημα με τα μεγάλα βίντεο που "κολλάνε" στο lightbox ΔΕΝ
// είναι το μέγεθος τους καθαυτό - είναι ότι πολλά exports (π.χ. από InShot
// και άλλες εφαρμογές μοντάζ κινητού) γράφουν το "moov atom" (το index/
// metadata του αρχείου) στο ΤΕΛΟΣ του MP4 αντί στην αρχή. Ένα browser <video>
// ΔΕΝ μπορεί να ξεκινήσει playback πριν διαβάσει αυτό το atom - άρα πρέπει
// να κατέβει (σχεδόν) ΟΛΟΚΛΗΡΟ το αρχείο πριν παίξει έστω το πρώτο frame.
// Αυτό λέγεται "faststart" και η λύση είναι ΑΠΛΗ ΑΝΑΔΙΟΡΓΑΝΩΣΗ ΤΟΥ CONTAINER
// (remux, "-c copy -movflags +faststart") - ΟΧΙ re-encode/συμπίεση:
//   - Δεν ξαναγράφει το video/audio (καθόλου απώλεια ποιότητας, ίδιο
//     ακριβώς μέγεθος +/- λίγα KB).
//   - Είναι ΓΡΗΓΟΡΟ (δευτερόλεπτα, όχι σε real-time όσο διαρκεί το βίντεο -
//     όπως ήταν η προηγούμενη προσέγγιση με MediaRecorder).
//   - Τρέχει 100% στο browser μέσω ffmpeg.wasm - καμία κλήση σε δικό μας
//     server, καμία χρέωση.
// Lazy-load: το @ffmpeg/ffmpeg module (αρκετά MB) φορτώνεται ΜΟΝΟ όταν
// χρειάζεται να επεξεργαστούμε πραγματικά ένα βίντεο, όχι στο αρχικό bundle.
//
// ΔΙΟΡΘΩΣΗ (deploy error - "Pages only supports files up to 25 MiB in size",
// το ffmpeg-core.wasm είναι 30.7MB): αρχικά το είχαμε self-hosted στο
// public/ffmpeg/, αλλά το Cloudflare Pages ΑΡΝΕΙΤΑΙ να ανεβάσει αρχείο
// μεγαλύτερο από 25MB - δεν γίνεται να μπει καν στο deployment. Λύση: τα
// core αρχεία φορτώνονται από CDN (jsdelivr) ΚΑΤΑ ΤΟ RUNTIME, με το επίσημο
// toBlobURL() pattern του ffmpeg.wasm - το fetch()άρει το αρχείο από το CDN
// και το μετατρέπει σε τοπικό blob: URL, που δουλεύει σαν να ήταν
// same-origin (δεν χρειάζεται COOP/COEP headers). Δεν μπαίνει καθόλου στο
// δικό μας build/deploy size, και ο browser το κάνει ούτως ή άλλως cache
// μετά την πρώτη φόρτωση (long cache headers στο jsdelivr) - άρα δεν
// ξαναφορτώνεται σε κάθε βίντεο.
const FFMPEG_CORE_CDN_BASE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';

let ffmpegInstancePromise = null;
async function getFFmpeg() {
  if (!ffmpegInstancePromise) {
    ffmpegInstancePromise = (async () => {
      const { FFmpeg } = await import('@ffmpeg/ffmpeg');
      const { toBlobURL } = await import('@ffmpeg/util');
      const ffmpeg = new FFmpeg();
      await ffmpeg.load({
        coreURL: await toBlobURL(`${FFMPEG_CORE_CDN_BASE}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${FFMPEG_CORE_CDN_BASE}/ffmpeg-core.wasm`, 'application/wasm')
      });
      return ffmpeg;
    })();
  }
  return ffmpegInstancePromise;
}

// Επιστρέφει Blob με την ίδια ποιότητα βίντεο αλλά "faststart" MP4 container
// (moov atom στην αρχή - instant playback), ή null αν αποτύχει/δεν άξιζε
// (οπότε graceful fallback - το lightbox συνεχίζει να παίζει το original,
// ΟΠΩΣ ΚΑΙ ΣΗΜΕΡΑ). Σε αντίθεση με την παλιά compressVideoForPlayback, αυτό
// ΔΕΝ ξαναδιαβάζει καρέ-καρέ το βίντεο σε πραγματικό χρόνο - είναι ένα
// γρήγορο, καθαρό container remux.
async function remuxVideoForInstantPlayback(file) {
  const inputName = 'input_' + Date.now();
  const outputName = 'output_' + Date.now() + '.mp4';
  let ffmpeg;
  try {
    ffmpeg = await getFFmpeg();
    const { fetchFile } = await import('@ffmpeg/util');

    await ffmpeg.writeFile(inputName, await fetchFile(file));
    await ffmpeg.exec(['-i', inputName, '-c', 'copy', '-movflags', '+faststart', outputName]);
    const data = await ffmpeg.readFile(outputName);

    if (!data || data.byteLength === 0) return null;

    const blob = new Blob([data.buffer], { type: 'video/mp4' });

    // Sanity check: ένα καθαρό remux έχει ΣΧΕΔΟΝ το ίδιο μέγεθος με το
    // original (μόνο η θέση του moov atom αλλάζει) - αν για κάποιο λόγο
    // βγει πολύ μικρότερο/πολύ μεγαλύτερο, κάτι πήγε στραβά, δεν το
    // εμπιστευόμαστε.
    if (blob.size < file.size * 0.5 || blob.size > file.size * 1.5) return null;

    return { blob, mimeType: 'video/mp4' };
  } catch (err) {
    console.error('Αποτυχία ffmpeg.wasm faststart remux:', err);
    return null;
  } finally {
    // Καθαρισμός virtual filesystem του ffmpeg.wasm - δεν θέλουμε να
    // μαζεύονται παλιά αρχεία στη μνήμη για κάθε βίντεο που ανεβάζεται.
    try {
      if (ffmpeg) {
        await ffmpeg.deleteFile(inputName).catch(() => {});
        await ffmpeg.deleteFile(outputName).catch(() => {});
      }
    } catch {
      // δεν πειράζει, δεν είναι κρίσιμο
    }
  }
}

// ΠΡΑΓΜΑΤΙΚΟ FIX (όχι workaround) για "το βίντεο από τη βιβλιοθήκη κολλάει
// στο ανέβασμα": το supabase.storage.upload() δεν έχει ΚΑΝΕΝΑ δικό του
// timeout - αν το network request κολλήσει (π.χ. ασταθές WiFi/data σε ένα
// venue, ή ένα μεγάλο native 4K βίντεο εκατοντάδων MB από τη βιβλιοθήκη,
// πολύ μεγαλύτερο από τα βίντεο του in-app recorder που είναι περιορισμένα
// σε 1080p/8Mbps), το fetch απλά περιμένει επ' αόριστον - καμία απάντηση,
// κανένα error, το UI μένει για πάντα σε "uploading". Το withTimeout()
// "τρέχει μαζί" το πραγματικό upload με ένα χρονόμετρο· όποιο τελειώσει
// πρώτο κερδίζει - αν λήξει πρώτα το timeout, απορρίπτουμε με ένα σαφές
// TIMEOUT error αντί να περιμένουμε για πάντα, ώστε ο χρήστης να δει
// μήνυμα και να μπορεί να ξαναδοκιμάσει (το αρχικό upload μπορεί να
// συνεχίσει "στο παρασκήνιο" άκυρα - δεν πειράζει, το fileName είναι
// unique ανά προσπάθεια μέσω Date.now()).
function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`TIMEOUT:${label}`));
    }, ms);
    promise.then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

// AUTOMATIC RETRY (design review - "σε μια επαγγελματική εφαρμογή τι λύση θα
// υπήρχε;" για σφάλματα σαν το "Failed to fetch" στα logs): το "Failed to
// fetch"/"NetworkError" είναι το μήνυμα που πετάει ο browser όταν το ίδιο το
// fetch() δεν έφτασε καν στο δίκτυο (στιγμιαία πτώση WiFi/data σε venue,
// handoff σε άλλο κελί κινητής κλπ) - ΔΕΝ είναι πρόβλημα server/δεδομένων,
// είναι καθαρά client-side συνδεσιμότητα, και τις περισσότερες φορές
// διορθώνεται μόνο του μέσα σε λίγα δευτερόλεπτα. Αντί να αναγκάζουμε τον
// guest να το προσέξει και να ξαναπατήσει μόνος του "Αποστολή", το
// ξαναδοκιμάζουμε ΕΜΕΙΣ αυτόματα 2 ακόμα φορές (σύνολο 3 προσπάθειες) με
// exponential backoff (1.5s, 3s) πριν παραδεχτούμε πραγματική αποτυχία.
//
// ΣΚΟΠΙΜΑ ξεχωρίζουμε τι αξίζει retry: ένα TIMEOUT (ήδη περιμέναμε πολλά
// λεπτά - βλ. withTimeout) ή ένα πραγματικό server/policy error (π.χ. RLS,
// "already exists") δεν πρόκειται να διορθωθεί ξαναδοκιμάζοντας αμέσως -
// αυτά περνάνε κανονικά στο μήνυμα λάθους όπως πριν, χωρίς αναμονή.
function isRetryableNetworkError(err) {
  const msg = (err?.message || '').toLowerCase();
  return (
    err instanceof TypeError ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('load failed')
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ΔΙΟΡΘΩΣΗ v4 ("το ίδιο βίντεο αποτυγχάνει επανειλημμένα σε αδύναμο δίκτυο
// venue, πάντα 'Failed to fetch', ΠΟΤΕ timeout" - επιβεβαιώθηκε από τα
// πραγματικά logs στο upload_errors table: 6+ συνεχόμενες αποτυχίες για το
// ΙΔΙΟ 25MB βίντεο, ενώ ΟΛΕΣ οι φωτογραφίες στο ίδιο batch/δίκτυο ανέβηκαν
// κανονικά): ένα απλό fetch() με ΟΛΟΚΛΗΡΟ το αρχείο σαν ενιαίο σώμα
// αιτήματος είναι εύθραυστο σε ασταθές κινητό δίκτυο - αν η σύνδεση "κοπεί"
// έστω και για μισό δευτερόλεπτο ΣΤΗ ΜΕΣΗ ενός 25MB ανεβάσματος (πολύ
// συχνό σε venue με αδύναμο σήμα/πολλούς χρήστες μαζί στο ίδιο wifi),
// ΟΛΟΚΛΗΡΟ το αρχείο πρέπει να ξαναρχίσει απ' την αρχή - σε αρκετά ασταθές
// δίκτυο αυτό μπορεί να μην τα καταφέρει ΠΟΤΕ, όσες φορές κι αν
// ξαναδοκιμάσουμε απλά (ακριβώς αυτό έδειχναν τα logs).
//
// Λύση: το Supabase Storage υποστηρίζει το πρωτόκολλο TUS (resumable
// upload) - το αρχείο ανεβαίνει σε κομμάτια (chunks) των 6MB, και αν
// κολλήσει η σύνδεση στη μέση, το tus-js-client συνεχίζει ΑΠΟ ΤΟ ΣΗΜΕΙΟ
// ΠΟΥ ΕΜΕΙΝΕ (ή έστω από το τελευταίο ολοκληρωμένο chunk) αντί να ξαναστείλει
// ΟΛΟΚΛΗΡΟ το αρχείο απ' την αρχή - πολύ πιο ανθεκτικό σε ασταθές δίκτυο.
// Χρησιμοποιείται ΜΟΝΟ για βίντεο (οι φωτογραφίες είναι ήδη αρκετά μικρές
// ώστε να ανεβαίνουν αξιόπιστα με το απλό upload - καμία αποτυχία
// φωτογραφίας στα πραγματικά logs του test).
function tusUploadVideo(file, fileName, { onProgress } = {}) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const upload = new tus.Upload(file, {
      endpoint: `${supabaseUrl}/storage/v1/upload/resumable`,
      // retryDelays: το ΔΙΚΟ του εσωτερικό retry του tus-js-client -
      // ειδικά σχεδιασμένο για resumable uploads (ξαναδοκιμάζει ΜΟΝΟ το
      // σημείο που κόπηκε, όχι απ' την αρχή).
      retryDelays: [0, 1000, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${supabaseAnonKey}`,
        'x-upsert': 'false'
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      metadata: {
        bucketName: 'photos',
        objectName: fileName,
        contentType: file.type || 'video/mp4',
        cacheControl: '3600'
      },
      chunkSize: 6 * 1024 * 1024, // ΥΠΟΧΡΕΩΤΙΚΟ 6MB - απαίτηση του Supabase TUS endpoint (δεν αλλάζει)
      onError: (err) => {
        if (settled) return;
        settled = true;
        reject(err);
      },
      onProgress: (bytesUploaded, bytesTotal) => {
        if (onProgress) onProgress(bytesUploaded, bytesTotal);
      },
      onSuccess: () => {
        if (settled) return;
        settled = true;
        resolve({ path: fileName });
      }
    });

    // Αν υπάρχει ΗΔΗ μια ημιτελής προσπάθεια γι' αυτό ΑΚΡΙΒΩΣ το αρχείο
    // (π.χ. ο guest ξανακλείδωσε/ξανάνοιξε την καρτέλα στη μέση), το
    // tus-js-client τη βρίσκει μέσω fingerprint και συνεχίζει από εκεί -
    // αλλιώς ξεκινάει κανονικά από την αρχή.
    upload
      .findPreviousUploads()
      .then((previousUploads) => {
        if (previousUploads.length > 0) {
          upload.resumeFromPreviousUpload(previousUploads[0]);
        }
        upload.start();
      })
      .catch(() => {
        // Αν αποτύχει ο έλεγχος προηγούμενων uploads (σπάνιο/μη κρίσιμο),
        // ξεκινάμε απλά από την αρχή - δεν μπλοκάρει το upload.
        upload.start();
      });
  });
}

const UPLOAD_RETRY_MAX = 2; // επιπλέον προσπάθειες μετά την πρώτη (σύνολο έως 3)
const UPLOAD_RETRY_BASE_DELAY_MS = 1500;

// onRetry(attempt, maxRetries) - προαιρετικό callback ώστε το UI να δείξει
// "Επανασύνδεση... προσπάθεια X/Y" αντί να μένει σιωπηλό όσο περιμένουμε.
async function withNetworkRetry(fn, { onRetry } = {}) {
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= UPLOAD_RETRY_MAX || !isRetryableNetworkError(err)) throw err;
      attempt += 1;
      const delay = UPLOAD_RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1);
      if (onRetry) onRetry(attempt, UPLOAD_RETRY_MAX);
      await sleep(delay);
    }
  }
}

// ΚΑΤΑΓΡΑΦΗ UPLOADS ("θέλω log θετικό/αρνητικό για κάθε φωτο, για πλήρη
// έλεγχο"): το logUploadError παλιότερα κατέγραφε ΜΟΝΟ αποτυχίες - καμία
// καταγραφή δεν υπήρχε για τα upload που πέτυχαν (η μόνη "απόδειξη" επιτυχίας
// ήταν η ίδια η γραμμή στο photos table, χωρίς ιστορικό/timeline ανά
// προσπάθεια). Το logUploadEvent είναι η γενική συνάρτηση που γράφει ΚΑΘΕ
// προσπάθεια ανεβάσματος στο public.upload_errors (νέα στήλη status:
// 'success'/'error' - βλ. migration), fire-and-forget όπως πριν. Ο host
// μπορεί τώρα να δει ΟΛΟΚΛΗΡΗ την εικόνα (όχι μόνο τα σπασμένα) μέσα από το
// Supabase SQL editor:
//   select * from upload_errors order by created_at desc;
//   select * from upload_errors where status = 'error' order by created_at desc;
function logUploadEvent({ status, eventId, errorType, errorMessage, fileName, filePath, fileSizeBytes, isVideo, guestName }) {
  try {
    supabase.from('upload_errors').insert([{
      status,
      event_id: eventId || null,
      error_type: errorType || (status === 'success' ? 'success' : 'other'),
      error_message: errorMessage || null,
      file_name: fileName || null,
      file_path: filePath || null,
      file_size_bytes: typeof fileSizeBytes === 'number' ? fileSizeBytes : null,
      is_video: !!isVideo,
      guest_name: guestName || null,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : null
    }]).then(({ error }) => {
      if (error) console.error('logUploadEvent insert failed:', error);
    });
  } catch (err) {
    console.error('logUploadEvent threw:', err);
  }
}

// Διατηρείται ως wrapper (ίδιο όνομα με πριν) ώστε να μη χρειαστεί να
// αλλάξουν όλα τα σημεία κλήσης παρακάτω - περνάει πάντα status: 'error'.
function logUploadError(args) {
  logUploadEvent({ status: 'error', ...args });
}

// Ανώτατο όριο αναμονής ανά αρχείο - πιο γενναιόδωρο για βίντεο (μεγαλύτερα
// αρχεία, φυσιολογικά πιο αργά) απ' ό,τι για φωτογραφίες.
const UPLOAD_TIMEOUT_MS_PHOTO = 45 * 1000; // 45 δευτ.
// Ανέβηκε από 2 σε 5 λεπτά μαζί με το όριο μεγέθους (200MB -> 500MB), και
// τώρα από 5 σε 10 λεπτά μαζί με το νέο όριο (500MB -> 1GB) - ένα
// μεγαλύτερο 4K βίντεο σε αργότερο δίκτυο χρειάζεται φυσιολογικά παραπάνω
// χρόνο· αλλιώς θα "κόβαμε" σωστά ανεβάσματα μόνο επειδή αργούν λίγο παραπάνω.
const UPLOAD_TIMEOUT_MS_VIDEO = 600 * 1000; // 10 λεπτά
// ΔΙΟΡΘΩΣΗ (code review - "κολλάει για πάντα στο upload"): το κύριο αρχείο
// είχε ήδη withTimeout, αλλά το preview upload (μικρή JPEG εικόνα) και το
// DB insert ΔΕΝ είχαν - αν το δίκτυο κολλήσει ΜΕΤΑ την επιτυχή ανάρτηση του
// κύριου αρχείου (π.χ. σε μποτιλιαρισμένο venue wifi με πολλούς guests
// μαζί), το await έμενε για πάντα, το "Ανέβασμα X από Y" κολλούσε
// ολόκληρο, ΚΑΙ το αρχείο ήταν ήδη στο storage χωρίς ποτέ να εμφανιστεί
// στο gallery. Γενναιόδωρα όρια (δεν είναι μεγάλα payloads).
const UPLOAD_TIMEOUT_MS_PREVIEW = 30 * 1000; // 30 δευτ.
const DB_INSERT_TIMEOUT_MS = 20 * 1000; // 20 δευτ.

// ΔΙΟΡΘΩΣΗ ("loadPhotos χωρίς pagination"): το loadPhotos() τραβούσε ΟΛΕΣ
// τις φωτογραφίες ενός event σε ΜΙΑ μόνο query, χωρίς κανένα όριο. Για ένα
// γάμο με π.χ. 300-500+ φωτο/βίντεο, αυτό σημαίνει μεγάλο JSON payload +
// πολλά DB rows σε ΚΑΘΕ φόρτωμα -ΚΑΙ ξανά σε κάθε επιστροφή στην καρτέλα
// (visibilitychange/focus παρακάτω) - αργό άνοιγμα σε κινητό δίκτυο,
// ειδικά τη βραδιά του γάμου με πολλούς guests ταυτόχρονα. Φορτώνουμε
// τώρα ΜΙΑ "σελίδα" τη φορά (PAGE_SIZE) και εκθέτουμε loadMorePhotos() για
// να φέρνει τις επόμενες όταν ο χρήστης φτάνει στο τέλος του gallery.
const PAGE_SIZE = 60;

export function useEventPhotos(currentEvent, guestData, user) {
  const [photos, setPhotos] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [hasMorePhotos, setHasMorePhotos] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const [pendingFiles, setPendingFiles] = useState([]);
  const [previewUrls, setPreviewUrls] = useState([]);

  // Live "κάποιος ανέβασε φωτογραφία" toasts (σαν ειδοποίηση μηνύματος) -
  // ουρά από μικρές φούσκες που εμφανίζονται κάτω-δεξιά σε ΟΛΟΥΣ τους
  // καλεσμένους όταν προστίθεται νέα φωτογραφία/βίντεο σε πραγματικό
  // χρόνο (μέσω του ίδιου realtime INSERT event που ήδη ενημερώνει το
  // gallery - δεν χρειάζεται ξεχωριστό κανάλι). Κάθε toast αυτοκαταστρέφεται
  // μόνο του μετά από λίγα δευτερόλεπτα (βλ. πιο κάτω).
  const [uploadToasts, setUploadToasts] = useState([]);

  // ΟΜΑΔΟΠΟΙΗΣΗ toasts ανά uploader: αν κάποιος ανεβάζει π.χ. 10 φωτογραφίες
  // μαζί, τα postgres_changes INSERT events φτάνουν ένα-ένα - χωρίς αυτό θα
  // εμφανίζονταν 10 ξεχωριστά μπαλονάκια ταυτόχρονα (χάος στην οθόνη). Αντί
  // γι' αυτό, κρατάμε ΕΝΑ "ενεργό" toast ανά όνομα καλεσμένου: κάθε νέο
  // insert από τον ΙΔΙΟ uploader μέσα στο παράθυρο των 4 δευτ. αυξάνει απλά
  // τους μετρητές (photoCount/videoCount) πάνω στο ΙΔΙΟ toast και ξανασέρνει
  // το χρονόμετρο αυτοκαταστροφής, αντί να δημιουργεί νέο. Το toast σβήνει
  // μόνο αφού περάσουν 4 δευτ. ΧΩΡΙΣ νέο upload από αυτόν τον uploader.
  const activeToastByUploaderRef = useRef({});
  // Βλ. σχόλιο μέσα στο confirmUpload() για το γιατί χρειάζεται ref (και
  // όχι μόνο το uploading state) εδώ.
  const confirmUploadInFlightRef = useRef(false);

  // Κρατάει πάντα συγχρονισμένο ένα "ζωντανό" αντίγραφο του photos state -
  // χρειάζεται στο loadMorePhotos() παρακάτω (async callback) για να ξέρει
  // ΠΟΙΑ είναι η πιο "παλιά" ήδη φορτωμένη φωτο (cursor pagination) χωρίς
  // να το έχει σαν dependency (θα ξαναδημιουργούσε τη function σε κάθε
  // αλλαγή του photos, κόβοντας τη σταθερή reference που χρειάζεται το UI).
  const photosRef = useRef([]);
  useEffect(() => {
    photosRef.current = photos;
  }, [photos]);

  // Η "νεότερη" created_at τιμή που έχουμε ήδη φορτωμένη - χρησιμοποιείται
  // από το refreshLatestPhotos() (visibilitychange/focus παρακάτω) ώστε να
  // φέρνει ΜΟΝΟ τις πραγματικά νέες φωτο (gt) αντί να ξαναφορτώνει/
  // αντικαθιστά ΟΛΟ το ήδη φορτωμένο gallery - κάτι που θα πετούσε έξω
  // τυχόν παλιότερες σελίδες που ο guest είχε ήδη φέρει με "Φόρτωσε
  // περισσότερες".
  const newestCreatedAtRef = useRef(null);

  // Πραγματική πρόοδος ανεβάσματος (όχι fake shimmer): πόσες από τις
  // pendingFiles έχουν ήδη ολοκληρωθεί / πόσες συνολικά, ώστε το modal να
  // δείχνει πάντα "Ανέβασμα X από Y" και ο χρήστης να ξέρει ανά πάσα
  // στιγμή ότι κάτι πραγματικά συμβαίνει (όχι μόνο τα πρώτα 1-2 δευτ.).
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });

  // Draft mode: όταν ο χρήστης κλείνει το preview modal με swipe-down (βλ.
  // PhotoPreviewModal.jsx), ΔΕΝ θέλουμε να χάνονται οι ήδη επιλεγμένες
  // φωτογραφίες - το modal απλά κρύβεται (previewHidden = true) κρατώντας
  // pendingFiles/previewUrls ως έχουν, και ξανανοίγει (χωρίς νέο file
  // picker) την επόμενη φορά που πατηθεί το κουμπί προσθήκης. Μόνο το
  // ρητό "Απόρριψη όλων" (cancelUpload) πραγματικά πετάει το draft.
  const [previewHidden, setPreviewHidden] = useState(false);

  // ΔΙΟΡΘΩΣΗ ("ξαφνικό refresh ενώ ανέβαζε φωτογραφία" - αφορά ΟΛΕΣ τις
  // συσκευές/browsers, όχι μόνο Xiaomi/Firefox όπου αναφέρθηκε πρώτα): το
  // main.jsx έχει ένα auto-update service worker που κάνει force
  // window.location.reload() μόλις ανιχνεύσει νέα έκδοση - και αυτό συχνά
  // πέφτει ΑΚΡΙΒΩΣ τη στιγμή που η καρτέλα ξαναγίνεται ενεργή μετά από
  // background, σβήνοντας τις ήδη επιλεγμένες φωτογραφίες ή διακόπτοντας ένα
  // upload σε εξέλιξη. Εδώ κρατάμε ενεργό το reason 'draft' του κοινού
  // κλειδώματος (lib/uploadBusy.js) ΟΣΟ υπάρχει ενεργό draft φωτογραφιών
  // (pendingFiles) ή γίνεται upload (uploading) - derived απευθείας από αυτά
  // τα δύο state values, οπότε δεν υπάρχει περίπτωση να μείνει "κολλημένο"
  // ενεργό: ακολουθεί πιστά την πραγματική κατάσταση. Το ξεχωριστό reason
  // 'picker' (για το διάστημα ΟΣΟ είναι ανοιχτό το ίδιο το native file
  // picker, πριν καν επιλεγεί αρχείο) ζει στο FloatingAddMenu.jsx - βλ. εκεί.
  useEffect(() => {
    const busy = pendingFiles.length > 0 || uploading;
    if (busy) {
      acquireUploadBusy('draft');
    } else {
      releaseUploadBusy('draft');
    }
    return () => releaseUploadBusy('draft');
  }, [pendingFiles.length, uploading]);

  useEffect(() => {
    if (!currentEvent) return;

    // Reset κατάστασης pagination σε κάθε αλλαγή event - αλλιώς ένα
    // "hasMorePhotos: true" από το ΠΡΟΗΓΟΥΜΕΝΟ event θα έμενε κολλημένο.
    setHasMorePhotos(false);
    newestCreatedAtRef.current = null;

    const loadPhotos = async () => {
      // Πρώτη "σελίδα" μόνο (PAGE_SIZE) - βλ. σχόλιο πάνω από το PAGE_SIZE
      // για το γιατί. Οι επόμενες έρχονται μόνο όταν ο guest τις ζητήσει
      // μέσω loadMorePhotos() (εκτίθεται πιο κάτω).
      const { data, error } = await supabase
        .from('photos')
        .select('*')
        .eq('event_id', currentEvent.id)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE);

      if (!error && data) {
        setPhotos(data);
        setHasMorePhotos(data.length === PAGE_SIZE);
        newestCreatedAtRef.current = data[0]?.created_at || null;
      }
    };

    // ΔΙΟΡΘΩΣΗ (συνέχεια του pagination fix): όταν η καρτέλα ξαναγίνεται
    // ορατή (βλ. handleVisibilityChange πιο κάτω), ΔΕΝ ξαναφορτώνουμε ΟΛΟ
    // το loadPhotos() από την αρχή (αυτό θα πετούσε έξω οποιαδήποτε
    // επιπλέον σελίδα που ο guest είχε ήδη φορτώσει μέσω "Φόρτωσε
    // περισσότερες", γυρίζοντάς τον απότομα στην κορυφή του gallery).
    // Αντί γι' αυτό, φέρνουμε ΜΟΝΟ φωτο πιο πρόσφατες από τη νεότερη που
    // έχουμε ήδη (gt στο created_at) και τις προσθέτουμε μπροστά.
    const refreshLatestPhotos = async () => {
      if (!currentEvent) return;
      let query = supabase
        .from('photos')
        .select('*')
        .eq('event_id', currentEvent.id)
        .order('created_at', { ascending: false });

      query = newestCreatedAtRef.current
        ? query.gt('created_at', newestCreatedAtRef.current)
        : query.limit(PAGE_SIZE);

      const { data, error } = await query;
      if (!error && data && data.length > 0) {
        setPhotos(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const notYetAdded = data.filter(p => !existingIds.has(p.id));
          return [...notYetAdded, ...prev];
        });
        newestCreatedAtRef.current = data[0].created_at;
      }
    };

    loadPhotos();

    const channel = supabase
      .channel('photos-changes')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'photos',
          filter: `event_id=eq.${currentEvent.id}`
        },
        (payload) => {
          setPhotos(prev => {
            const exists = prev.find(p => p.id === payload.new.id);
            if (exists) return prev;
            return [payload.new, ...prev];
          });
          // Αυτή είναι εξ ορισμού η νεότερη φωτο τη στιγμή που φτάνει το
          // realtime event - κρατάμε το cursor του refreshLatestPhotos()
          // ενημερωμένο, αλλιώς το επόμενο visibilitychange θα ξαναζητούσε
          // (άσκοπα, αλλά όχι λάθος) τις ίδιες φωτο από μια παλιότερη τιμή.
          if (!newestCreatedAtRef.current || payload.new.created_at > newestCreatedAtRef.current) {
            newestCreatedAtRef.current = payload.new.created_at;
          }

          // Toast (ομαδοποιημένο ανά uploader - βλ. σχόλιο πιο πάνω στο
          // activeToastByUploaderRef): αν υπάρχει ήδη ενεργό toast για αυτό
          // το όνομα, απλά αυξάνουμε τον μετρητή του και ξανασέρνουμε το
          // auto-remove timer· αλλιώς δημιουργούμε νέο toast.
          const uploaderKey = payload.new.uploaded_by || 'Someone';
          const isVideo = payload.new.media_type === 'video';
          const existingEntry = activeToastByUploaderRef.current[uploaderKey];

          if (existingEntry) {
            clearTimeout(existingEntry.timeoutId);
            setUploadToasts(prev => prev.map(t => (
              t.id === existingEntry.id
                ? {
                    ...t,
                    photoCount: t.photoCount + (isVideo ? 0 : 1),
                    videoCount: t.videoCount + (isVideo ? 1 : 0)
                  }
                : t
            )));
            existingEntry.timeoutId = setTimeout(() => {
              setUploadToasts(prev => prev.filter(t => t.id !== existingEntry.id));
              delete activeToastByUploaderRef.current[uploaderKey];
            }, 4000);
          } else {
            const toastId = `${uploaderKey}-${Date.now()}`;
            const newToast = {
              id: toastId,
              name: uploaderKey,
              photoCount: isVideo ? 0 : 1,
              videoCount: isVideo ? 1 : 0
            };
            setUploadToasts(prev => [...prev, newToast]);
            const timeoutId = setTimeout(() => {
              setUploadToasts(prev => prev.filter(t => t.id !== toastId));
              delete activeToastByUploaderRef.current[uploaderKey];
            }, 4000);
            activeToastByUploaderRef.current[uploaderKey] = { id: toastId, timeoutId };
          }
        }
      )
      // ΝΕΟ: UPDATE listener - η συμπιεσμένη εκδοχή βίντεο (compressed_video_path,
      // βλ. compressVideoForPlayback) ανεβαίνει ΑΣΥΓΧΡΟΝΑ στο background ΜΕΤΑ
      // το αρχικό insert (ώστε ο guest να ΜΗΝ περιμένει τη συμπίεση - βλ.
      // σχόλιο στο confirmUpload), οπότε η γραμμή της φωτογραφίας ενημερώνεται
      // αργότερα με ένα ξεχωριστό UPDATE. Χωρίς αυτό το listener, το ήδη
      // φορτωμένο photos state θα έμενε "κολλημένο" στο αρχικό compressed_video_path:
      // null μέχρι να γίνει πλήρες reload της σελίδας.
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'photos',
          filter: `event_id=eq.${currentEvent.id}`
        },
        (payload) => {
          setPhotos(prev => prev.map(p => (p.id === payload.new.id ? { ...p, ...payload.new } : p)));
        }
      )
      .subscribe();

    // ΣΗΜΑΝΤΙΚΟ (auto-refresh αντί για pull-to-refresh): αν ο guest
    // κλειδώσει το κινητό ή αφήσει την εφαρμογή στο background για αρκετή
    // ώρα, η realtime σύνδεση (websocket) του Supabase μπορεί να κοπεί -
    // το ίδιο το Supabase client τη ξανασυνδέει μόνο του συνήθως, αλλά
    // υπάρχει ένα μικρό παράθυρο όπου μπορεί να έχουν προστεθεί νέες
    // φωτογραφίες (από άλλους guests) όσο ήταν ο χρήστης "εκτός" και να
    // μην έχουν φτάσει ακόμα μέσω websocket. Αντί για χειροκίνητο
    // pull-to-refresh gesture (ρίσκο σύγκρουσης με το κάθετο scroll του
    // gallery), ξαναφορτώνουμε αθόρυβα τη λίστα κάθε φορά που η καρτέλα/
    // εφαρμογή ξαναγίνεται ορατή - ο χρήστης δεν χρειάζεται να κάνει
    // τίποτα, απλά βλέπει πάντα ενημερωμένο gallery όταν γυρνάει σε αυτό.
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshLatestPhotos();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    // "focus" καλύπτει επιπλέον περιπτώσεις (π.χ. desktop browser tab
    // switch) όπου το visibilitychange event δεν πυροδοτείται αξιόπιστα σε
    // όλους τους browsers/συσκευές.
    window.addEventListener('focus', handleVisibilityChange);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
      // Καθαρίζουμε τυχόν εκκρεμή auto-remove timers των toasts, ώστε να
      // μην τρέξουν setState πάνω σε unmounted/παλιό currentEvent.
      Object.values(activeToastByUploaderRef.current).forEach(entry => {
        clearTimeout(entry.timeoutId);
      });
      activeToastByUploaderRef.current = {};
    };
  }, [currentEvent]);

  const handleFileSelected = async (e) => {
    // Το native picker μόλις έκλεισε (onChange) - ελευθερώνουμε το
    // προσωρινό 'picker' κλείδωμα (βλ. FloatingAddMenu.jsx) αμέσως, το
    // reason 'draft' παρακάτω αναλαμβάνει από εδώ και πέρα μόλις γεμίσει το
    // pendingFiles. Ασφαλές να καλείται ακόμα κι αν το 'picker' δεν ήταν
    // ενεργό (π.χ. αν ποτέ δεν προστέθηκε το reason).
    releaseUploadBusy('picker');

    const rawFiles = Array.from(e.target.files);
    if (rawFiles.length === 0) return;

    setError('');
    setPreviewHidden(false);
    const processedFiles = [];
    const urls = [];
    // ΔΙΟΡΘΩΣΗ ("ένα χαλασμένο HEIC ρίχνει ΟΛΟ το batch"): το try/catch
    // ΓΥΡΩ από ολόκληρο το for loop σήμαινε ότι αν το heic2any() έσκαγε σε
    // ΕΝΑ μόνο αρχείο (π.χ. κατεστραμμένο/μερικώς αντιγραμμένο HEIC - σε
    // iPhone συμβαίνει αρκετά συχνά σε φωτο από AirDrop/Media Share), ΟΛΑ
    // τα υπόλοιπα αρχεία του batch χάνονταν σιωπηλά (ούτε καν έμπαιναν στο
    // pendingFiles) - ο guest έβλεπε ένα γενικό σφάλμα και το draft έμενε
    // εντελώς άδειο, χωρίς να καταλαβαίνει ότι έφταιγε μόνο ΜΙΑ φωτογραφία.
    // Τώρα κάθε αρχείο επεξεργάζεται σε ΔΙΚΟ ΤΟΥ try/catch - ένα χαλασμένο
    // αρχείο παραλείπεται (καταγράφεται σε failedNames) και ΟΛΑ τα υπόλοιπα
    // συνεχίζουν κανονικά.
    const failedNames = [];

    for (const rawFile of rawFiles) {
      try {
        const isHeic =
          /image\/hei(c|f)/i.test(rawFile.type) ||
          /\.hei[cf]$/i.test(rawFile.name);
        const isVideo = isVideoFile(rawFile);

        if (!rawFile.type.startsWith('image/') && !isHeic && !isVideo) continue;

        if (isVideo && rawFile.size > MAX_VIDEO_SIZE_BYTES) {
          setError(`Το βίντεο "${rawFile.name}" είναι πολύ μεγάλο (μέγιστο ${Math.round(MAX_VIDEO_SIZE_BYTES / (1024 * 1024))}MB).`);
          logUploadError({
            eventId: currentEvent?.id,
            errorType: 'size_limit',
            errorMessage: `Βίντεο ${Math.round(rawFile.size / (1024 * 1024))}MB > όριο ${Math.round(MAX_VIDEO_SIZE_BYTES / (1024 * 1024))}MB`,
            fileName: rawFile.name,
            fileSizeBytes: rawFile.size,
            isVideo: true,
            guestName: guestData?.name
          });
          continue;
        }

        let file = rawFile;
        if (isHeic) {
          const convertedBlob = await heic2any({
            blob: rawFile,
            toType: 'image/jpeg',
            quality: 0.9
          });
          const newName = rawFile.name.replace(/\.hei[cf]$/i, '.jpg');
          file = new File([convertedBlob], newName, { type: 'image/jpeg' });
        }

        processedFiles.push(file);
        urls.push(URL.createObjectURL(file));
      } catch (err) {
        failedNames.push(rawFile.name || 'αρχείο');
        logUploadError({
          eventId: currentEvent?.id,
          errorType: 'process_failed',
          errorMessage: err?.message || String(err),
          fileName: rawFile.name,
          fileSizeBytes: rawFile.size,
          isVideo: isVideoFile(rawFile),
          guestName: guestData?.name
        });
        console.error('Αποτυχία επεξεργασίας αρχείου:', rawFile.name, err);
      }
    }

    if (failedNames.length > 0) {
      setError(
        `${failedNames.length === 1 ? 'Το αρχείο' : 'Τα αρχεία'} "${failedNames.join('", "')}" ήταν κατεστραμμένο/μη αναγνώσιμο και παραλείφθηκε. ${processedFiles.length > 0 ? 'Τα υπόλοιπα προστέθηκαν κανονικά.' : ''}`
      );
    }

    setPendingFiles(processedFiles);
    setPreviewUrls(urls);
    e.target.value = '';
  };

  const handleMoreFilesSelected = async (e) => {
    // Ίδιος λόγος με το handleFileSelected παραπάνω - ασφαλές no-op αν δεν
    // ήταν ενεργό.
    releaseUploadBusy('picker');

    const rawFiles = Array.from(e.target.files);
    if (rawFiles.length === 0) return;

    setError('');
    setPreviewHidden(false);
    const processedFiles = [];
    const urls = [];
    // Ίδια διόρθωση με το handleFileSelected παραπάνω - δες το σχόλιο εκεί
    // για την πλήρη εξήγηση (ένα χαλασμένο αρχείο δεν πρέπει να ρίχνει όλα
    // τα υπόλοιπα).
    const failedNames = [];

    for (const rawFile of rawFiles) {
      try {
        const isHeic =
          /image\/hei(c|f)/i.test(rawFile.type) ||
          /\.hei[cf]$/i.test(rawFile.name);
        const isVideo = isVideoFile(rawFile);

        if (!rawFile.type.startsWith('image/') && !isHeic && !isVideo) continue;

        if (isVideo && rawFile.size > MAX_VIDEO_SIZE_BYTES) {
          setError(`Το βίντεο "${rawFile.name}" είναι πολύ μεγάλο (μέγιστο ${Math.round(MAX_VIDEO_SIZE_BYTES / (1024 * 1024))}MB).`);
          logUploadError({
            eventId: currentEvent?.id,
            errorType: 'size_limit',
            errorMessage: `Βίντεο ${Math.round(rawFile.size / (1024 * 1024))}MB > όριο ${Math.round(MAX_VIDEO_SIZE_BYTES / (1024 * 1024))}MB`,
            fileName: rawFile.name,
            fileSizeBytes: rawFile.size,
            isVideo: true,
            guestName: guestData?.name
          });
          continue;
        }

        let file = rawFile;
        if (isHeic) {
          const convertedBlob = await heic2any({
            blob: rawFile,
            toType: 'image/jpeg',
            quality: 0.9
          });
          const newName = rawFile.name.replace(/\.hei[cf]$/i, '.jpg');
          file = new File([convertedBlob], newName, { type: 'image/jpeg' });
        }

        processedFiles.push(file);
        urls.push(URL.createObjectURL(file));
      } catch (err) {
        failedNames.push(rawFile.name || 'αρχείο');
        logUploadError({
          eventId: currentEvent?.id,
          errorType: 'process_failed',
          errorMessage: err?.message || String(err),
          fileName: rawFile.name,
          fileSizeBytes: rawFile.size,
          isVideo: isVideoFile(rawFile),
          guestName: guestData?.name
        });
        console.error('Αποτυχία επεξεργασίας αρχείου:', rawFile.name, err);
      }
    }

    if (failedNames.length > 0) {
      setError(
        `${failedNames.length === 1 ? 'Το αρχείο' : 'Τα αρχεία'} "${failedNames.join('", "')}" ήταν κατεστραμμένο/μη αναγνώσιμο και παραλείφθηκε. ${processedFiles.length > 0 ? 'Τα υπόλοιπα προστέθηκαν κανονικά.' : ''}`
      );
    }

    setPendingFiles(prev => [...prev, ...processedFiles]);
    setPreviewUrls(prev => [...prev, ...urls]);
    e.target.value = '';
  };

  const removePendingPhoto = (indexToRemove) => {
    URL.revokeObjectURL(previewUrls[indexToRemove]);
    setPreviewUrls(prev => prev.filter((_, i) => i !== indexToRemove));
    setPendingFiles(prev => prev.filter((_, i) => i !== indexToRemove));
  };

  // ΔΙΟΡΘΩΣΗ (code review - "διπλό-tap στο Αποστολή"): το setUploading(true)
  // παρακάτω είναι ασύγχρονο (React state) - δεν προλαβαίνει να εμποδίσει
  // ένα 2ο, πολύ ταχύ tap στο ίδιο κουμπί ΠΡΙΝ προλάβει να γίνει re-render
  // με disabled=true. Ένα ref είναι συγχρονισμένο - ελέγχεται/ενημερώνεται
  // ΑΜΕΣΩΣ, οπότε ένα γνήσιο διπλό-tap που φτάνει πρακτικά ταυτόχροχα δεν
  // μπορεί ποτέ να ξεκινήσει 2 παράλληλα confirmUpload() και να ανεβάσει το
  // ίδιο batch δύο φορές.
  const confirmUpload = async (selectedCategory) => {
    if (pendingFiles.length === 0 || !currentEvent) return;
    if (confirmUploadInFlightRef.current) return;
    confirmUploadInFlightRef.current = true;

    setUploading(true);
    setError('');
    // Δείχνουμε αμέσως 1/Ν πριν καν ξεκινήσει το πρώτο upload, ώστε να
    // υπάρχει ορατή ένδειξη προόδου από το ΠΡΩΤΟ frame μετά το κλικ.
    setUploadProgress({ current: pendingFiles.length > 0 ? 1 : 0, total: pendingFiles.length });

    // Screen Wake Lock (βλ. εκτενές σχόλιο v3 πιο κάτω στο γιατί): κρατάει
    // την οθόνη ξύπνια όσο διαρκεί το ανέβασμα, όπου υποστηρίζεται (Safari
    // 16.4+, Chrome/Android) - μειώνει σημαντικά την πιθανότητα το
    // λειτουργικό να "παγώσει" τα δικτυακά requests λόγω auto-lock της
    // οθόνης στη μέση ενός μεγάλου batch. Καθαρό best-effort: αν δεν
    // υποστηρίζεται ή ο browser αρνηθεί (π.χ. χαμηλή μπαταρία), απλά
    // συνεχίζουμε κανονικά χωρίς αυτό - ΔΕΝ μπλοκάρει ποτέ το upload.
    let wakeLock = null;
    try {
      if ('wakeLock' in navigator) {
        wakeLock = await navigator.wakeLock.request('screen');
      }
    } catch (wakeLockErr) {
      console.warn('Screen Wake Lock δεν ενεργοποιήθηκε (μη κρίσιμο):', wakeLockErr);
    }

    // ΔΙΟΡΘΩΣΗ v2 ("δεν μπορεί να ανεβάσει 97 φωτογραφίες μαζί" - "Failed to
    // fetch"): η ΠΑΛΙΑ λογική εδώ σταματούσε ΟΛΟΚΛΗΡΟ το batch με throw μόλις
    // ΕΝΑ αρχείο απέτυχε (ακόμα κι όταν ο εσωτερικός withNetworkRetry είχε
    // ήδη εξαντλήσει τις 3 προσπάθειές του) - σε ένα μεγάλο batch πάνω από
    // αρκετά λεπτά σε venue wifi, είναι σχεδόν σίγουρο ότι ΤΟΥΛΑΧΙΣΤΟΝ ένα
    // αρχείο θα πέσει πάνω σε μια στιγμιαία διακοπή δικτύου - και μόλις
    // συνέβαινε αυτό (π.χ. στο αρχείο #11 από τα 97), τα υπόλοιπα 86 δεν
    // δοκιμάζονταν ΚΑΘΟΛΟΥ· έμεναν στο modal περιμένοντας τον guest να
    // ξαναπατήσει "Αποστολή" ξανά και ξανά, ένα-ένα σταμάτημα τη φορά - σε
    // πρακτική χρήση αυτό σήμαινε ότι ΔΕΝ γινόταν ποτέ να ολοκληρωθεί ένα
    // batch αυτού του μεγέθους. Τώρα κάθε αρχείο έχει το ΔΙΚΟ του try/catch
    // μέσα στο loop - μια αποτυχία (μετά την εξάντληση των retries) απλά
    // καταγράφεται και προχωράμε στο ΕΠΟΜΕΝΟ αρχείο, αντί να σταματήσει όλο
    // το batch. Στο τέλος μαζεύουμε ΠΟΙΑ index απέτυχαν (όχι απλά ένα
    // συνεχόμενο "successCount" - τώρα μπορεί π.χ. το #11 να αποτύχει αλλά
    // το #12 να πετύχει) και αφήνουμε στο pendingFiles/previewUrls ΜΟΝΟ αυτά
    // που πραγματικά απέτυχαν, έτοιμα για ένα ρητό retry.
    let successCount = 0;
    const failedIndices = [];
    let firstErr = null;
    let anyTimeout = false;
    // Δηλωμένο ΕΞΩ από το loop ώστε να είναι προσβάσιμο μετά (χρειάζεται
    // για να ενημερώσουμε το gallery με όλες τις επιτυχείς φωτογραφίες,
    // ακόμα κι όταν κάποιες άλλες στο ίδιο batch απέτυχαν).
    const newUploadedPhotos = [];

    // ΔΙΟΡΘΩΣΗ v3 ("σε 97-100 φωτο ανεβάζει μόνο 5-8 και μετά σκάει παντού
    // 'Failed to fetch'"): το v2 fix πιο πάνω εμπόδιζε ΜΙΑ αποτυχία να
    // μπλοκάρει όλο το batch, αλλά δεν εξηγεί ΓΙΑΤΙ ξαφνικά όλα τα υπόλοιπα
    // αρχεία αποτυχαίνουν μετά τα πρώτα 5-8 - αυτό το μοτίβο (λίγα πετυχαίνουν,
    // μετά ΟΛΑ αποτυχαίνουν, όχι τυχαία/σποραδικά) είναι το κλασικό "σημάδι"
    // ότι το κινητό (κυρίως iOS Safari) έβαλε την καρτέλα σε background/ύπνο
    // (κλείδωμα οθόνης, αλλαγή εφαρμογής, ή απλά inactivity timeout) ΚΑΙ το
    // λειτουργικό "πάγωσε"/σκότωσε τα εναπομείναντα δικτυακά requests - ένα
    // sequential loop με 97 αρχεία, ένα-ένα, μπορεί εύκολα να πάρει πολλά
    // λεπτά, πολύ περισσότερο απ' όσο ένας καλεσμένος περιμένει να κρατήσει
    // ανοιχτή/ξεκλείδωτη την οθόνη.
    // Λύση σε 2 επίπεδα:
    //   1) Ανεβάζουμε CONCURRENT_UPLOADS αρχεία ΤΑΥΤΟΧΡΟΝΑ (απλό "worker
    //      pool") αντί ένα-ένα - μειώνει δραστικά τον ΣΥΝΟΛΙΚΟ χρόνο του
    //      batch (π.χ. 97 αρχεία σε pool των 4 είναι περίπου στο 1/4 του
    //      χρόνου), άρα λιγότερο "παράθυρο" για να κλειδώσει/κοιμηθεί η
    //      συσκευή στη μέση.
    //   2) Screen Wake Lock (βλ. πιο πάνω στην αρχή του confirmUpload) -
    //      κρατάει την οθόνη ξύπνια όσο διαρκεί το upload, όπου
    //      υποστηρίζεται (Safari 16.4+, Chrome/Android) - μειώνει ΑΚΟΜΑ
    //      περισσότερο την πιθανότητα το λειτουργικό να "παγώσει" την
    //      καρτέλα λόγω αδράνειας οθόνης. Δεν καλύπτει την περίπτωση ο
    //      guest να αλλάξει ο ίδιος εφαρμογή/κλειδώσει χειροκίνητα, αλλά
    //      καλύπτει το πολύ πιο συνηθισμένο σενάριο (auto-lock λόγω χρόνου).
    let completedCount = 0;
    const CONCURRENT_UPLOADS = Math.min(4, pendingFiles.length) || 1;

    const uploadOneFile = async (i) => {
      const file = pendingFiles[i];
      try {
        const isVideo = isVideoFile(file);
        const safeName = file.name || (isVideo ? 'video.mp4' : 'photo.jpg');
        const fileName = `${currentEvent.id}/${Date.now()}_${safeName}`;

        let uploadData;
        if (isVideo) {
          // ΔΙΟΡΘΩΣΗ v4 - βλ. εκτενές σχόλιο στο tusUploadVideo πιο πάνω στο
          // αρχείο: τα βίντεο ανεβαίνουν τώρα με resumable (TUS) upload αντί
          // για ένα ενιαίο fetch, ώστε ένα "κόψιμο" στη μέση σε ασταθές
          // δίκτυο να ΣΥΝΕΧΙΖΕΙ από εκεί που έμεινε αντί να ξαναρχίζει απ'
          // την αρχή. Το tus-js-client έχει ΔΙΚΟ του retry logic
          // (retryDelays) ειδικό για αυτό - δεν χρειάζεται το γενικό
          // withNetworkRetry εδώ. Κρατάμε πάντα το withTimeout σαν ΤΕΛΙΚΟ
          // safety net (10 λεπτά) για να μην κολλήσει το UI επ' αόριστον σε
          // ένα ακραίο σενάριο όπου ΤΙΠΟΤΑ δεν δουλεύει.
          uploadData = await withTimeout(
            tusUploadVideo(file, fileName, {
              onProgress: (bytesUploaded, bytesTotal) => {
                const pct = bytesTotal ? Math.round((bytesUploaded / bytesTotal) * 100) : 0;
                setUploadProgress({
                  current: completedCount,
                  total: pendingFiles.length,
                  videoProgress: pct
                });
              }
            }),
            UPLOAD_TIMEOUT_MS_VIDEO,
            'main_upload'
          );
        } else {
          // withTimeout εδώ - βλ. σχόλιο στην κορυφή του αρχείου. Χωρίς αυτό,
          // μια φωτογραφία πάνω σε αργό/ασταθές δίκτυο μπορεί να κολλήσει το
          // UI επ' αόριστον σε "uploading" χωρίς ΚΑΝΕΝΑ error.
          // withNetworkRetry γύρω-γύρω - βλ. εκτενές σχόλιο στην κορυφή του
          // αρχείου: ξαναδοκιμάζει αυτόματα μόνο σε στιγμιαία δικτυακά
          // σφάλματα ("Failed to fetch"), ενημερώνοντας το uploadProgress
          // ώστε το UI να δείχνει "Επανασύνδεση..." αντί να μένει σιωπηλό.
          // (Οι φωτογραφίες είναι ήδη αρκετά μικρές ώστε ένα απλό upload να
          // είναι αξιόπιστο - βλ. σχόλιο στο tusUploadVideo για γιατί ΔΕΝ
          // χρειάζονται κι αυτές resumable upload.)
          const { data, error: uploadError } = await withNetworkRetry(
            () =>
              withTimeout(
                supabase.storage
                  .from('photos')
                  .upload(fileName, file, {
                    cacheControl: '3600',
                    upsert: false,
                    contentType: file.type || 'image/jpeg'
                  }),
                UPLOAD_TIMEOUT_MS_PHOTO,
                'main_upload'
              ),
            {
              onRetry: (attempt, max) => {
                setUploadProgress({
                  current: completedCount,
                  total: pendingFiles.length,
                  retry: { attempt, max }
                });
              }
            }
          );
          if (uploadError) throw uploadError;
          uploadData = data;
        }
        // Ό,τι retry/progress ένδειξη ήταν ενεργή ολοκληρώθηκε (πέτυχε ή
        // εξάντλησε τις προσπάθειες) - καθαρίζουμε την ένδειξη από το
        // progress πριν προχωρήσουμε στα επόμενα βήματα αυτού του αρχείου.
        setUploadProgress({ current: completedCount, total: pendingFiles.length });

        // ΔΙΟΡΘΩΣΗ (design review - "δεν νομίζω ότι ενδιαφέρει τον χρήστη ότι
        // γίνεται συμπίεση, δεν είναι ωραίο να περιμένει το άγνωστο"): η
        // συμπίεση βίντεο ΔΕΝ γίνεται πια εδώ, μπλοκάροντας το upload -
        // μετακινήθηκε ΜΕΤΑ το insert, σε background/fire-and-forget (βλ.
        // παρακάτω) ώστε ο guest να μην περιμένει καθόλου παραπάνω απ' όσο
        // περίμενε πριν. Το compressed_video_path μπαίνει null στο αρχικό
        // insert και ενημερώνεται αθόρυβα αργότερα μέσω UPDATE (realtime
        // listener στο photos-changes channel το πιάνει αυτόματα).
        const compressedVideoPath = null;

        // Preview: για φωτογραφία είναι ένα resized αντίγραφο· για βίντεο
        // είναι ένα frame-thumbnail (βλ. lib/videoPreview.js) - έτσι το
        // gallery δείχνει πάντα μια ελαφριά εικόνα, ποτέ δεν χρειάζεται να
        // "τραβήξει" ολόκληρο το βίντεο μόνο για το thumbnail του.
        let previewPath = null;
        try {
          const previewBlob = isVideo
            ? await createVideoThumbnail(file, 800, 0.75)
            : await createPreviewBlob(file, 1200, 0.75);
          if (previewBlob) {
            const previewFileName = `${currentEvent.id}/previews/${Date.now()}_${safeName.replace(/\.[^/.]+$/, '')}.jpg`;
            // ΔΙΟΡΘΩΣΗ: withTimeout εδώ - βλ. σχόλιο στο UPLOAD_TIMEOUT_MS_PREVIEW
            // πιο πάνω. Αν λήξει, πέφτουμε στο ίδιο catch(previewErr) παρακάτω
            // που ήδη χειρίζεται αυτό το σενάριο σωστά (previewPath μένει null,
            // ΔΕΝ μπλοκάρει το υπόλοιπο upload - το preview είναι προαιρετικό).
            const { data: previewUploadData, error: previewUploadError } = await withTimeout(
              supabase.storage
                .from('photos')
                .upload(previewFileName, previewBlob, {
                  cacheControl: '3600',
                  upsert: false,
                  contentType: 'image/jpeg'
                }),
              UPLOAD_TIMEOUT_MS_PREVIEW,
              'preview_upload'
            );
            if (!previewUploadError) {
              previewPath = previewUploadData.path;
            }
          }
        } catch (previewErr) {
          console.error('Preview generation failed:', previewErr);
        }

        const uploaderName = guestData?.name || 'anonymous';
        const deleteToken = crypto.randomUUID();

        // ΔΙΟΡΘΩΣΗ (code review - "διπλή φωτογραφία σε ασταθές δίκτυο"): το
        // withNetworkRetry ξανακάνει insert σε ΟΠΟΙΟΔΗΠΟΤΕ "Failed to fetch"/
        // "load failed" - που είναι ΑΚΡΙΒΩΣ το σφάλμα που παίρνουμε όταν το
        // insert ΠΕΤΥΧΕ στον server αλλά η απάντηση χάθηκε στο δρόμο (κοινό σε
        // venue wifi). Χωρίς έλεγχο, το retry έβαζε ΔΕΥΤΕΡΗ πανομοιότυπη
        // γραμμή - η φωτογραφία εμφανιζόταν διπλή σε όλο το gallery. Το
        // uploadData.path (fileName) είναι unique ανά προσπάθεια (event_id +
        // Date.now() + filename), οπότε πριν από ΚΑΘΕ προσπάθεια insert
        // ελέγχουμε πρώτα αν υπάρχει ήδη γραμμή με αυτό το ΑΚΡΙΒΩΣ file_path -
        // αν ναι, σημαίνει ότι ένα προηγούμενο insert πέτυχε στην
        // πραγματικότητα, και επιστρέφουμε ΕΚΕΙΝΗ τη γραμμή αντί να βάλουμε
        // δεύτερη. withTimeout μαζί - βλ. σχόλιο στο DB_INSERT_TIMEOUT_MS.
        const { data: newPhoto, error: dbError } = await withNetworkRetry(() =>
          withTimeout(
            (async () => {
              const { data: existingRow } = await supabase
                .from('photos')
                .select()
                .eq('file_path', uploadData.path)
                .maybeSingle();
              if (existingRow) return { data: existingRow, error: null };

              return supabase
                .from('photos')
                .insert([
                  {
                    event_id: currentEvent.id,
                    file_path: uploadData.path,
                    preview_path: previewPath,
                    compressed_video_path: compressedVideoPath,
                    uploaded_by: uploaderName,
                    delete_token: deleteToken,
                    uploaded_by_user_id: user?.id || null,
                    category: selectedCategory || null, // <-- Αποθήκευση της κατηγορίας κανονικά
                    media_type: isVideo ? 'video' : 'photo'
                  }
                ])
                .select()
                .single();
            })(),
            DB_INSERT_TIMEOUT_MS,
            'db_insert'
          )
        );

        if (dbError) throw dbError;

        saveMyPhotoToken(newPhoto.id, deleteToken);
        newUploadedPhotos.push(newPhoto);
        successCount += 1;

        // ΘΕΤΙΚΟ log - βλ. σχόλιο στο logUploadEvent πιο πάνω στο αρχείο.
        logUploadEvent({
          status: 'success',
          eventId: currentEvent?.id,
          fileName: safeName,
          filePath: uploadData.path,
          fileSizeBytes: file.size,
          isVideo,
          guestName: guestData?.name
        });

        // ΔΙΟΡΘΩΣΗ (βλ. remuxVideoForInstantPlayback στην κορυφή του αρχείου):
        // το "faststart" remux ΣΕ BACKGROUND - ΣΚΟΠΙΜΑ ΧΩΡΙΣ await εδώ. Το
        // upload του guest έχει ήδη ολοκληρωθεί (η φωτο/βίντεο είναι ήδη στο
        // gallery) - η fast-start εκδοχή για instant playback στο lightbox
        // φτιάχνεται αθόρυβα "από πίσω" (δευτερόλεπτα, όχι real-time όπως
        // πριν με το MediaRecorder re-encode) και ενημερώνει το
        // compressed_video_path με ένα UPDATE όταν είναι έτοιμη (το realtime
        // listener στο photos-changes channel το πιάνει αυτόματα, βλ. πιο
        // πάνω). Αν αποτύχει/παραλειφθεί/ο guest κλείσει την καρτέλα στο
        // μεταξύ, απλά το compressed_video_path μένει null - το lightbox
        // συνεχίζει να παίζει κανονικά το file_path, όπως πριν (καμία
        // λειτουργία δεν χάνεται, είναι καθαρό bonus).
        if (isVideo) {
          const photoId = newPhoto.id;
          remuxVideoForInstantPlayback(file)
            .then((remuxed) => {
              if (!remuxed) return null;
              const compressedFileName = `${currentEvent.id}/compressed/${Date.now()}_${safeName.replace(/\.[^/.]+$/, '')}.mp4`;
              return supabase.storage
                .from('photos')
                .upload(compressedFileName, remuxed.blob, {
                  cacheControl: '3600',
                  upsert: false,
                  contentType: remuxed.mimeType
                })
                .then(({ data, error }) => (error ? null : data.path));
            })
            .then((compressedPath) => {
              if (!compressedPath) return;
              return supabase.from('photos').update({ compressed_video_path: compressedPath }).eq('id', photoId);
            })
            .catch((err) => console.error('Background faststart remux βίντεο απέτυχε:', err));
        }
      } catch (fileErr) {
        // ΔΙΟΡΘΩΣΗ v2 (βλ. εκτενές σχόλιο πριν το for loop): ΔΕΝ κάνουμε
        // throw/break εδώ πλέον - καταγράφουμε το index που απέτυχε και
        // προχωράμε κανονικά στο ΕΠΟΜΕΝΟ αρχείο του batch.
        failedIndices.push(i);
        if (!firstErr) firstErr = fileErr;
        if (typeof fileErr?.message === 'string' && fileErr.message.startsWith('TIMEOUT:')) {
          anyTimeout = true;
        }
        logUploadError({
          eventId: currentEvent?.id,
          errorType: (typeof fileErr?.message === 'string' && fileErr.message.startsWith('TIMEOUT:')) ? 'timeout' : 'other',
          errorMessage: fileErr?.message || String(fileErr),
          fileName: file?.name,
          fileSizeBytes: file?.size,
          isVideo: isVideoFile(file),
          guestName: guestData?.name
        });
        console.error(fileErr);
      } finally {
        completedCount += 1;
        // current = πόσα ΤΕΛΕΙΩΣΑΝ (πέτυχαν ή απέτυχαν οριστικά) - με
        // CONCURRENT_UPLOADS αρχεία ταυτόχρονα δεν έχει νόημα πια το "i+1"
        // (δεν ολοκληρώνονται με τη σειρά).
        setUploadProgress({ current: completedCount, total: pendingFiles.length });
      }
    };

    // Απλό "worker pool": CONCURRENT_UPLOADS worker-concurrent βρόχοι
    // τραβάνε τον επόμενο διαθέσιμο index από το κοινό nextIndex μέχρι να
    // εξαντληθούν όλα τα αρχεία - έτσι έχουμε πάντα το πολύ CONCURRENT_UPLOADS
    // ταυτόχρονα upload σε εξέλιξη, όχι 97 μαζεμένα αλλά ούτε ένα-ένα.
    let nextIndex = 0;
    const runWorker = async () => {
      while (nextIndex < pendingFiles.length) {
        const i = nextIndex;
        nextIndex += 1;
        await uploadOneFile(i);
      }
    };
    await Promise.all(Array.from({ length: CONCURRENT_UPLOADS }, () => runWorker()));

    // Δείχνουμε στο gallery ΟΛΑ όσα πρόλαβαν να ανέβουν με επιτυχία - είτε
    // πέτυχε ολόκληρο το batch είτε όχι. Dedup με το realtime subscription:
    // το postgres_changes INSERT event μπορεί να έχει φτάσει μέσω websocket
    // ΠΡΙΝ καν επιστρέψει αυτό το .insert().select() - η σειρά δεν είναι
    // εγγυημένη, οπότε φιλτράρουμε ό,τι έχει ήδη προστεθεί.
    if (newUploadedPhotos.length > 0) {
      setPhotos(prev => {
        const existingIds = new Set(prev.map(p => p.id));
        const notYetAdded = newUploadedPhotos.filter(p => !existingIds.has(p.id));
        return [...notYetAdded, ...prev];
      });
    }

    if (failedIndices.length === 0) {
      // Όλα πέτυχαν - καθαρό batch, κλείνουμε κανονικά το draft.
      cancelUpload();
    } else {
      // Μερική αποτυχία: κρατάμε στο pendingFiles/previewUrls ΜΟΝΟ τα
      // αρχεία που πραγματικά απέτυχαν (με βάση τα index στο
      // failedIndices) - ΟΧΙ ένα απλό "slice" όπως πριν, γιατί τώρα η
      // αποτυχία δεν είναι υποχρεωτικά ένα συνεχόμενο "ουρά" (π.χ. το #11
      // μπορεί να απέτυχε αλλά το #12 να πέτυχε κανονικά). Όσα πέτυχαν
      // αφαιρούνται οριστικά (και τα preview blob URLs τους γίνονται
      // revoke) - ένα retry θα ξαναπροσπαθήσει ΜΟΝΟ τα πραγματικά
      // αποτυχημένα, ποτέ ξανά αυτά που ήδη ανέβηκαν.
      const failedSet = new Set(failedIndices);
      setPreviewUrls(prev => {
        prev.forEach((url, idx) => {
          if (!failedSet.has(idx)) URL.revokeObjectURL(url);
        });
        return prev.filter((_, idx) => failedSet.has(idx));
      });
      setPendingFiles(prev => prev.filter((_, idx) => failedSet.has(idx)));

      const remaining = failedIndices.length;
      setError(
        anyTimeout
          ? `Κάποια ανεβάσματα άργησαν πολύ (πιθανώς αργή σύνδεση) και ακυρώθηκαν. ${successCount > 0 ? `${successCount} ανέβηκαν κανονικά. ` : ''}Δοκίμασε ξανά για τ${remaining === 1 ? 'ο υπόλοιπο' : 'α υπόλοιπα'} (${remaining}) — ιδανικά με καλύτερο WiFi/σήμα.`
          : `Σφάλμα κατά το ανέβασμα κάποιων αρχείων. ${successCount > 0 ? `${successCount} ανέβηκαν κανονικά. ` : ''}Δοκίμασε ξανά για τ${remaining === 1 ? 'ο υπόλοιπο' : 'α υπόλοιπα'} (${remaining}).`
      );
      console.error(firstErr);
    }

    // Απελευθέρωση του wake lock (βλ. σχόλιο στην αρχή) - πάντα, είτε
    // πέτυχε είτε απέτυχε (μερικώς ή ολικά) το batch.
    if (wakeLock) {
      try {
        await wakeLock.release();
      } catch (releaseErr) {
        // δεν πειράζει, δεν είναι κρίσιμο
      }
    }

    setUploading(false);
    setUploadProgress({ current: 0, total: 0 });
    confirmUploadInFlightRef.current = false;
  };

  // Πραγματική, ρητή ακύρωση - πετάει το draft εντελώς (καλείται από το
  // κουμπί "Απόρριψη όλων" και μετά από επιτυχές upload).
  const cancelUpload = () => {
    previewUrls.forEach(url => URL.revokeObjectURL(url));
    setPendingFiles([]);
    setPreviewUrls([]);
    setPreviewHidden(false);
  };

  // Swipe-down dismiss: κρύβει το modal ΧΩΡΙΣ να πειράξει τα pendingFiles -
  // το draft μένει ζωντανό στη μνήμη.
  const hidePreviewDraft = () => {
    setPreviewHidden(true);
  };

  // Ξαναδείχνει το ήδη υπάρχον draft (π.χ. όταν ξαναπατηθεί το κουμπί
  // προσθήκης ενώ υπάρχει κρυμμένο draft) αντί να ανοίξει νέο file picker.
  const resumePreviewDraft = () => {
    setPreviewHidden(false);
  };

  // Φέρνει την ΕΠΟΜΕΝΗ "σελίδα" παλιότερων φωτο (cursor pagination βάσει
  // created_at, πιο σταθερό από offset-based pagination όταν μπαίνουν
  // συνέχεια νέα rows μέσω του realtime insert παραπάνω). Καλείται από το
  // UI (π.χ. κουμπί "Φόρτωσε περισσότερες" ή IntersectionObserver στο
  // τέλος του gallery) - βλ. PhotoGallery.jsx.
  const loadMorePhotos = async () => {
    if (!currentEvent || loadingMore || !hasMorePhotos) return;
    const current = photosRef.current;
    const cursor = current[current.length - 1]?.created_at;
    if (!cursor) return;

    setLoadingMore(true);
    try {
      const { data, error } = await supabase
        .from('photos')
        .select('*')
        .eq('event_id', currentEvent.id)
        .order('created_at', { ascending: false })
        .lt('created_at', cursor)
        .limit(PAGE_SIZE);

      if (!error && data) {
        setPhotos(prev => {
          const existingIds = new Set(prev.map(p => p.id));
          const newOnes = data.filter(p => !existingIds.has(p.id));
          return [...prev, ...newOnes];
        });
        setHasMorePhotos(data.length === PAGE_SIZE);
      }
    } catch (err) {
      console.error('loadMorePhotos failed:', err);
    } finally {
      setLoadingMore(false);
    }
  };

  const getPhotoUrl = (path) => {
    const { data } = supabase.storage.from('photos').getPublicUrl(path);
    return data.publicUrl;
  };

  const getPreviewUrl = (photo) => getPhotoUrl(photo.preview_path || photo.file_path);

  return {
    photos,
    setPhotos,
    uploading,
    error,
    setError,
    handleFileSelected,
    handleMoreFilesSelected,
    removePendingPhoto,
    confirmUpload,
    cancelUpload,
    previewUrls,
    // Εκτίθεται πλέον και το pendingFiles (τα ίδια τα File objects, στην
    // ΙΔΙΑ σειρά με τα previewUrls) - το PhotoPreviewModal το χρειάζεται
    // για να ξέρει ποιο preview είναι βίντεο και ποιο φωτογραφία (τα
    // previewUrls από μόνα τους είναι απλά blob: URLs, δεν κουβαλάνε τύπο).
    pendingFiles,
    previewHidden,
    hidePreviewDraft,
    resumePreviewDraft,
    uploadProgress,
    getPhotoUrl,
    getPreviewUrl,
    uploadToasts,
    hasMorePhotos,
    loadingMore,
    loadMorePhotos
  };
}