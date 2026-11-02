import React, { useRef, useState, useEffect, useCallback } from 'react';

// Γιατί υπάρχει αυτό το component:
// Το παλιό κουμπί "βίντεο-κάμερα" άνοιγε τη native Camera app της συσκευής
// μέσω <input type="file" capture="environment" accept="video/*">. Σε
// Android αυτό ανοίγει μια ΕΝΤΕΛΩΣ ξεχωριστή εφαρμογή (Camera) και βάζει το
// Chrome tab στο background - όσο διαρκεί η εγγραφή, το Android συχνά
// σκοτώνει (kill) τη διεργασία του background tab για να ελευθερώσει μνήμη
// (video recording = πολύ RAM). Όταν ο χρήστης γυρνάει πίσω, το Chrome δεν
// "συνεχίζει" - ξαναφορτώνει τη σελίδα από την αρχή, χάνοντας το βίντεο που
// μόλις τραβήχτηκε. Αυτό είναι behavior του λειτουργικού, όχι bug του
// κώδικα - δεν διορθώνεται όσο περνάμε από τη native app.
//
// Η λύση: γράφουμε το βίντεο ΜΕΣΑ στη σελίδα, με τα δικά της APIs του
// browser (getUserMedia για ζωντανή προεπισκόπηση κάμερας + MediaRecorder
// για την εγγραφή). Ποτέ δεν φεύγουμε από τη σελίδα, άρα ποτέ δεν μπαίνει
// το tab σε background/risk of kill - το βίντεο μένει πάντα ζωντανό στη
// μνήμη μέχρι να το επιβεβαιώσει ο χρήστης.

// ΔΙΟΡΘΩΣΗ (απόφαση μετά από πραγματικό περιστατικό σε event - βλ. σχόλιο
// στο videoBitsPerSecond παρακάτω): "story"-στυλ όριο 30″ αντί για 90″ -
// εγγυάται μικρό/γρήγορο αρχείο ΠΑΝΤΑ, ανεξάρτητα από δίκτυο. Μαζί με το
// δαχτυλίδι προόδου γύρω από το κουμπί στο κουμπί "Διακοπή" (βλ. JSX
// παρακάτω - ίδια λογική με Instagram/TikTok Stories) ο guest βλέπει καθαρά
// πόσος χρόνος απομένει όσο γράφει, όχι μόνο μετά.
const MAX_RECORD_SECONDS = 30;
const RECORD_RING_RADIUS = 36;
const RECORD_RING_CIRCUMFERENCE = 2 * Math.PI * RECORD_RING_RADIUS;

function pickMimeType() {
  if (typeof window === 'undefined' || !window.MediaRecorder) return '';
  const candidates = [
    'video/mp4;codecs=h264,aac',
    'video/mp4',
    'video/webm;codecs=vp9,opus',
    'video/webm;codecs=vp8,opus',
    'video/webm'
  ];
  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)) return type;
  }
  return '';
}

function formatTime(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function VideoRecorder({ onCancel, onCaptured }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const mimeTypeRef = useRef('');

  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewBlob, setPreviewBlob] = useState(null);
  const previewVideoRef = useRef(null);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setError('Η κάμερα δεν υποστηρίζεται σε αυτόν τον browser.');
        return;
      }
      // Ζητάμε ρητά υψηλή ανάλυση (Full HD) και καλό frame rate - χωρίς
      // αυτό, το getUserMedia συχνά επιστρέφει μια χαμηλότερη "ασφαλή"
      // ανάλυση από προεπιλογή, αισθητά χειρότερη από ό,τι θα έγραφε η
      // native Camera app. Με "ideal" (όχι "exact"/"min") η συσκευή δίνει
      // την καλύτερη διαθέσιμη ανάλυση μέχρι αυτό το ταβάνι - αν δεν
      // υποστηρίζεται τόσο υψηλή, πέφτει μόνη της στην καλύτερη δυνατή,
      // δεν αποτυγχάνει η κάμερα.
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 }
          },
          audio: {
            echoCancellation: true,
            noiseSuppression: true
          }
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setReady(true);
      } catch (err) {
        console.error('getUserMedia failed:', err);
        setError('Δεν μπόρεσα να ανοίξω την κάμερα. Έλεγξε ότι έδωσες άδεια πρόσβασης σε κάμερα/μικρόφωνο.');
      }
    }

    start();

    return () => {
      cancelled = true;
      stopStream();
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    setRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startRecording = useCallback(() => {
    if (!streamRef.current || !window.MediaRecorder) {
      setError('Η εγγραφή βίντεο δεν υποστηρίζεται σε αυτόν τον browser.');
      return;
    }
    const mimeType = pickMimeType();
    mimeTypeRef.current = mimeType;
    chunksRef.current = [];

    // ΔΙΟΡΘΩΣΗ (πραγματικό περιστατικό σε event - guest περίμενε πολύ ώρα να
    // ανέβει βίντεο, έκλεισε/ξανάνοιξε την εφαρμογή από αγανάκτηση και το
    // βίντεο χάθηκε χωρίς καν να καταγραφεί σφάλμα - το OS-level κλείσιμο
    // της εφαρμογής σκοτώνει τη διαδικασία πριν προλάβει να γράψει
    // οτιδήποτε, άρα δεν μπορούμε να το "πιάσουμε" με κώδικα): πριν αυτό
    // έγραφε σε 8 Mbps - ένα 1λεπτο βίντεο έβγαινε ~60MB, υπερβολικά μεγάλο
    // για αργό δίκτυο event. 3 Mbps δίνει ακόμα καλή ποιότητα για
    // προβολή σε κινητό/projector (όχι ίδιο επίπεδο με επαγγελματική
    // εγγραφή, αλλά αισθητά ελαφρύτερο αρχείο - ~22MB για 1λεπτο αντί για
    // ~60MB), μειώνοντας τον χρόνο αναμονής άρα και την πιθανότητα να
    // αγανακτήσει κάποιος guest πριν προλάβει να ολοκληρωθεί το upload.
    const recorderOptions = {
      videoBitsPerSecond: 3_000_000,
      audioBitsPerSecond: 128_000
    };
    if (mimeType) recorderOptions.mimeType = mimeType;

    let recorder;
    try {
      recorder = new MediaRecorder(streamRef.current, recorderOptions);
    } catch (err) {
      console.error('MediaRecorder init with options failed, retrying with defaults:', err);
      try {
        recorder = mimeType
          ? new MediaRecorder(streamRef.current, { mimeType })
          : new MediaRecorder(streamRef.current);
      } catch (err2) {
        console.error('MediaRecorder init failed:', err2);
        setError('Η εγγραφή βίντεο δεν μπόρεσε να ξεκινήσει σε αυτή τη συσκευή.');
        return;
      }
    }

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeTypeRef.current || 'video/webm' });
      setPreviewBlob(blob);
      setPreviewUrl(URL.createObjectURL(blob));
      // ΔΙΟΡΘΩΣΗ v3 ("στο preview εμφανίζεται μαύρο το video") - το seek
      // πάνω στο ΗΔΗ-ΗΧΟΓΡΑΦΗΜΕΝΟ blob (v1/v2 προσπάθειες) αποδείχτηκε
      // αναξιόπιστο σε iOS Safari (seeking quirks σε φρεσκο-φτιαγμένα
      // blobs). Πολύ πιο απλή/αξιόπιστη λύση: τραβάμε το poster frame
      // ΑΠΕΥΘΕΙΑΣ από το ΖΩΝΤΑΝΟ feed της κάμερας (videoRef) ΤΗΝ ΙΔΙΑ
      // στιγμή που σταματάει η εγγραφή - αυτό το <video> παίζει ήδη
      // κανονικά εδώ και ώρα, έχει σίγουρα έγκυρο decoded frame, άρα δεν
      // χρειάζεται κανένα seek/wait. Η ροή (stopStream) δεν έχει σταματήσει
      // ακόμα σε αυτό το σημείο, άρα το videoRef.current δείχνει ακόμα
      // ζωντανή εικόνα.
      capturePosterFromLiveVideo();
    };

    recorder.start();
    recorderRef.current = recorder;
    setRecording(true);
    setSeconds(0);
    timerRef.current = setInterval(() => {
      setSeconds((s) => {
        const next = s + 1;
        if (next >= MAX_RECORD_SECONDS) {
          stopRecording();
        }
        return next;
      });
    }, 1000);
  }, [stopRecording]);

  // ΔΙΟΡΘΩΣΗ ("μαύρη οθόνη μετά το 'Ξανά'") - ίδιο ακριβώς bug/λύση με το
  // PhotoCapture.jsx (βλ. εκεί για πλήρη εξήγηση): το live <video>
  // αφαιρείται από το DOM όσο δείχνουμε το preview του γυρισμένου βίντεο·
  // μετά το "Ξανά" δημιουργείται ΚΑΙΝΟΥΡΓΙΟ <video> στοιχείο που ποτέ δεν
  // ξαναπαίρνει το srcObject=stream. Ref callback αντί για απλό useRef -
  // ξανασυνδέει το ήδη ενεργό streamRef.current ΚΑΘΕ φορά που προσαρτάται
  // νέο <video> στοιχείο στο DOM.
  const attachLiveVideo = useCallback((node) => {
    videoRef.current = node;
    if (node && streamRef.current) {
      node.muted = true;
      node.srcObject = streamRef.current;
      node.play().catch((playErr) => {
        console.error('video.play() on retake remount failed:', playErr);
      });
    }
  }, []);

  // ΔΙΟΡΘΩΣΗ v4 ("στο preview εμφανίζεται μαύρο το video") - ΒΡΕΘΗΚΕ η
  // πραγματική αιτία: το <canvas ref={previewCanvasRef}> ζούσε ΜΕΣΑ στο
  // JSX branch που εμφανίζεται μόνο όταν previewUrl!=null - αλλά το
  // setPreviewUrl() (λίγο πιο πάνω, στο ίδιο onstop) δεν ενημερώνει το DOM
  // ΣΥΓΧΡΟΝΙΣΜΕΝΑ (React batching) - τη στιγμή που έτρεχε αυτή η function
  // ΑΜΕΣΩΣ μετά, το <canvas> ΔΕΝ υπήρχε ΑΚΟΜΑ στο DOM, άρα
  // previewCanvasRef.current ήταν null και η function έκανε σιωπηλό
  // early-return - ΠΟΤΕ δεν έφτιαχνε poster. Λύση: φτιάχνουμε το canvas
  // ΠΡΟΓΡΑΜΜΑΤΙΣΤΙΚΑ (document.createElement) αντί να εξαρτόμαστε από ένα
  // React ref πάνω σε conditional JSX - έτσι δεν έχει καμία εξάρτηση από
  // το πότε θα κάνει re-render/commit το React.
  const [previewPosterUrl, setPreviewPosterUrl] = useState(null);

  const capturePosterFromLiveVideo = useCallback(() => {
    const v = videoRef.current;
    if (!v || !v.videoWidth || !v.videoHeight) return;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      setPreviewPosterUrl(canvas.toDataURL('image/jpeg', 0.85));
    } catch (err) {
      console.error('Αποτυχία capture frame από ζωντανή κάμερα για preview poster:', err);
    }
  }, []);

  const retake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewBlob(null);
    setPreviewPosterUrl(null);
    setSeconds(0);
  };

  const confirmUse = () => {
    if (!previewBlob) return;
    const type = previewBlob.type || 'video/webm';
    const ext = type.includes('mp4') ? 'mp4' : 'webm';
    const file = new File([previewBlob], `video-${Date.now()}.${ext}`, { type });
    // ΔΙΟΡΘΩΣΗ (code review - "blob URLs δεν καθαρίζονται ποτέ στο happy
    // path"): ίδιο fix με το PhotoCapture.jsx - το retake() έκανε ήδη σωστά
    // revoke, αλλά όχι το κανονικό μονοπάτι επιβεβαίωσης. Βίντεο μπορεί να
    // είναι δεκάδες MB - αν ένας guest τραβήξει αρκετά κλιπ μέσα στο βράδυ
    // χωρίς να γίνεται ποτέ revoke, η μνήμη της καρτέλας γεμίζει σταδιακά
    // (κρίσιμο σε iOS Safari, που κλείνει/κάνει reload καρτέλες με πολλή
    // μνήμη). Ασφαλές: το new File([previewBlob], ...) έχει ήδη τα δικά του
    // δεδομένα, δεν εξαρτάται από το object URL string.
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    stopStream();
    onCaptured(file);
  };

  const handleCancel = () => {
    // ΔΙΟΡΘΩΣΗ (code review - "blob URL leak στο Ακύρωση"): το retake() και
    // το confirmUse() κάνουν ήδη σωστά revokeObjectURL(previewUrl), αλλά
    // αυτό το μονοπάτι (ο guest πατάει "Ακύρωση" ΑΦΟΥ έχει ήδη τραβήξει/
    // ξανατραβήξει ένα preview βίντεο) το παρέλειπε - το blob URL (και το
    // underlying video data, συχνά δεκάδες MB) έμενε ζωντανό στη μνήμη της
    // καρτέλας για όλη την υπόλοιπη διάρκεια της σελίδας. Αν ένας guest
    // τραβήξει-ακυρώσει αρκετές φορές μέσα στη βραδιά, η μνήμη συσσωρεύεται
    // αθόρυβα (κρίσιμο σε iOS Safari, που κλείνει καρτέλες με πολλή μνήμη).
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    stopStream();
    onCancel();
  };

  return (
    <div style={styles.overlay}>
      {error ? (
        <div style={styles.errorBox}>
          <p style={styles.errorText}>{error}</p>
          <button type="button" onClick={handleCancel} style={styles.secondaryBtn}>
            Κλείσιμο
          </button>
        </div>
      ) : previewUrl ? (
        <>
          <video
            ref={previewVideoRef}
            src={previewUrl}
            controls
            playsInline
            preload="metadata"
            poster={previewPosterUrl || undefined}
            style={styles.video}
          />
          <div style={styles.controlsRow}>
            <button type="button" onClick={retake} style={styles.secondaryBtn}>
              Ξανά
            </button>
            <button type="button" onClick={confirmUse} style={styles.primaryBtn}>
              Χρήση βίντεο
            </button>
          </div>
        </>
      ) : (
        <>
          <video ref={attachLiveVideo} autoPlay muted playsInline style={styles.video} />
          {!ready && (
            <div style={styles.loadingBadge}>Άνοιγμα κάμερας…</div>
          )}
          {recording && (
            <div style={styles.timerBadge}>● {formatTime(seconds)}</div>
          )}
          <div style={styles.controlsRow}>
            <button type="button" onClick={handleCancel} style={styles.secondaryBtn}>
              Άκυρο
            </button>
            {!recording ? (
              <button
                type="button"
                onClick={startRecording}
                disabled={!ready}
                style={{ ...styles.recordBtn, opacity: ready ? 1 : 0.5 }}
                aria-label="Έναρξη εγγραφής"
              />
            ) : (
              <div style={styles.recordRingWrap}>
                {/* ΝΕΟ: δαχτυλίδι προόδου (σαν Instagram/TikTok Stories) -
                γεμίζει καθώς πλησιάζει το όριο των 30″, ώστε ο guest να
                βλέπει ΟΠΤΙΚΑ πόσος χρόνος του μένει χωρίς να χρειάζεται να
                διαβάσει αριθμό. */}
                <svg width="80" height="80" viewBox="0 0 80 80" style={styles.recordRingSvg} aria-hidden="true">
                  <circle cx="40" cy="40" r={RECORD_RING_RADIUS} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="4" />
                  <circle
                    cx="40"
                    cy="40"
                    r={RECORD_RING_RADIUS}
                    fill="none"
                    stroke="#E6C594"
                    strokeWidth="4"
                    strokeLinecap="round"
                    strokeDasharray={RECORD_RING_CIRCUMFERENCE}
                    strokeDashoffset={RECORD_RING_CIRCUMFERENCE * (1 - Math.min(seconds / MAX_RECORD_SECONDS, 1))}
                    transform="rotate(-90 40 40)"
                    style={{ transition: 'stroke-dashoffset 1s linear' }}
                  />
                </svg>
                <button
                  type="button"
                  onClick={stopRecording}
                  style={styles.stopBtn}
                  aria-label="Διακοπή εγγραφής"
                >
                  <span style={styles.stopBtnInner} />
                </button>
              </div>
            )}
            <div style={{ width: '64px' }} aria-hidden="true" />
          </div>
        </>
      )}
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 200,
    background: '#000',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center'
  },
  video: {
    width: '100%',
    height: '100%',
    objectFit: 'contain',
    background: '#000'
  },
  controlsRow: {
    position: 'absolute',
    bottom: '28px',
    left: 0,
    right: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 28px'
  },
  recordBtn: {
    width: '68px',
    height: '68px',
    borderRadius: '50%',
    background: '#e0393e',
    border: '4px solid #fff',
    cursor: 'pointer',
    flexShrink: 0
  },
  recordRingWrap: {
    position: 'relative',
    width: '80px',
    height: '80px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
  },
  recordRingSvg: {
    position: 'absolute',
    top: 0,
    left: 0
  },
  stopBtn: {
    width: '68px',
    height: '68px',
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.15)',
    border: '4px solid #fff',
    cursor: 'pointer',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    position: 'relative'
  },
  stopBtnInner: {
    width: '26px',
    height: '26px',
    borderRadius: '7px',
    background: '#e0393e',
    display: 'block'
  },
  primaryBtn: {
    padding: '12px 22px',
    borderRadius: '9999px',
    border: 'none',
    background: '#8E3E12',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer'
  },
  secondaryBtn: {
    padding: '12px 22px',
    borderRadius: '9999px',
    border: '1px solid rgba(255,255,255,0.4)',
    background: 'rgba(255,255,255,0.1)',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer'
  },
  timerBadge: {
    position: 'absolute',
    top: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.5)',
    color: '#fff',
    padding: '6px 14px',
    borderRadius: '9999px',
    fontWeight: 600,
    fontSize: '14px'
  },
  loadingBadge: {
    position: 'absolute',
    top: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(0,0,0,0.5)',
    color: '#fff',
    padding: '6px 14px',
    borderRadius: '9999px',
    fontSize: '14px'
  },
  errorBox: {
    padding: '24px',
    textAlign: 'center',
    color: '#fff'
  },
  errorText: {
    marginBottom: '16px'
  }
};