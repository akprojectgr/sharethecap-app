import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useCameraZoom, digitalCropRect } from '../lib/useCameraZoom';
import ZoomControls, { ZoomViewport } from './ZoomControls';

// Ψηφιακό zoom σε βίντεο (iOS, όπου ο browser δεν δίνει zoom κάμερας)
// σημαίνει εγγραφή μέσω canvas.captureStream() - αν δεν υποστηρίζεται,
// δεν δείχνουμε καθόλου zoom αντί για zoom που δεν θα φαινόταν στο βίντεο.
const CANVAS_CAPTURE_SUPPORTED =
  typeof window !== 'undefined' &&
  typeof HTMLCanvasElement !== 'undefined' &&
  typeof HTMLCanvasElement.prototype.captureStream === 'function';

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

const MAX_RECORD_SECONDS = 90; // απλό guard ώστε να μη γίνει τεράστιο αρχείο

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

  // Zoom - βλ. lib/useCameraZoom.js. Με ψηφιακό zoom η εγγραφή περνάει από
  // canvas (zoomCanvasRef) που ζωγραφίζει το κεντρικό crop σε κάθε frame.
  const cam = useCameraZoom({ allowDigital: CANVAS_CAPTURE_SUPPORTED });
  const [zoomLocked, setZoomLocked] = useState(false);
  const zoomPipelineRef = useRef(null); // { rafId, canvasTrack }

  const stopZoomPipeline = useCallback(() => {
    const pipe = zoomPipelineRef.current;
    if (!pipe) return;
    if (pipe.rafId) cancelAnimationFrame(pipe.rafId);
    pipe.stopped = true;
    try { pipe.canvasTrack?.stop(); } catch (_e) { /* best effort */ }
    zoomPipelineRef.current = null;
  }, []);

  // Επιστρέφει stream για τον MediaRecorder: εικόνα από canvas με το
  // τρέχον crop (το zoom αλλάζει ζωντανά και κατά την εγγραφή) + τον
  // αρχικό ήχο του μικροφώνου. null αν κάτι αποτύχει -> raw stream.
  const startZoomPipeline = useCallback(() => {
    const v = videoRef.current;
    const src = streamRef.current;
    if (!v || !src || !v.videoWidth || !v.videoHeight) return null;
    try {
      const canvas = document.createElement('canvas');
      canvas.width = v.videoWidth;
      canvas.height = v.videoHeight;
      const ctx = canvas.getContext('2d');
      const pipe = { rafId: 0, canvasTrack: null, stopped: false };
      const draw = () => {
        if (pipe.stopped) return;
        const vw = v.videoWidth || canvas.width;
        const vh = v.videoHeight || canvas.height;
        const c = digitalCropRect(vw, vh, cam.zoomRef.current);
        try {
          ctx.drawImage(v, c.sx, c.sy, c.sw, c.sh, 0, 0, canvas.width, canvas.height);
        } catch (_e) { /* frame not ready */ }
        pipe.rafId = requestAnimationFrame(draw);
      };
      draw();
      const canvasStream = canvas.captureStream(30);
      const canvasTrack = canvasStream.getVideoTracks()[0];
      if (!canvasTrack) {
        pipe.stopped = true;
        cancelAnimationFrame(pipe.rafId);
        return null;
      }
      pipe.canvasTrack = canvasTrack;
      zoomPipelineRef.current = pipe;
      return new MediaStream([canvasTrack, ...src.getAudioTracks()]);
    } catch (err) {
      console.error('zoom canvas pipeline failed, recording without zoom:', err);
      stopZoomPipeline();
      return null;
    }
  }, [cam.zoomRef, stopZoomPipeline]);

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
        cam.configure(stream.getVideoTracks()[0]);
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
      stopZoomPipeline();
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

    // Πηγή εγγραφής: με ψηφιακό zoom > 1x γράφουμε από canvas (crop), ώστε
    // το βίντεο να βγει όπως το βλέπει ο χρήστης. Σε 1x (ή hardware zoom)
    // γράφουμε το stream της κάμερας ακριβώς όπως πριν. Αν ξεκίνησε σε 1x με
    // ψηφιακό zoom, κλειδώνουμε το zoom μέχρι το τέλος της εγγραφής.
    let recordStream = streamRef.current;
    if (cam.mode === 'digital') {
      const piped = cam.zoomRef.current > 1.01 ? startZoomPipeline() : null;
      if (piped) {
        recordStream = piped;
      } else {
        cam.setLocked(true);
        setZoomLocked(true);
      }
    }

    // Ρητό υψηλό bitrate - χωρίς αυτό, ο browser encoder βάζει μόνος του
    // ένα συντηρητικό (χαμηλότερο) bitrate που κάνει το βίντεο αισθητά πιο
    // "θολό"/συμπιεσμένο από ό,τι θα έβγαζε η native Camera app. 8 Mbps
    // είναι καλή ποιότητα για 1080p (περίπου το ίδιο επίπεδο με μέτρια-καλή
    // native εγγραφή), χωρίς να κάνει τα αρχεία υπερβολικά μεγάλα.
    const recorderOptions = {
      videoBitsPerSecond: 8_000_000,
      audioBitsPerSecond: 128_000
    };
    if (mimeType) recorderOptions.mimeType = mimeType;

    let recorder;
    try {
      recorder = new MediaRecorder(recordStream, recorderOptions);
    } catch (err) {
      console.error('MediaRecorder init with options failed, retrying with defaults:', err);
      try {
        recorder = mimeType
          ? new MediaRecorder(recordStream, { mimeType })
          : new MediaRecorder(recordStream);
      } catch (err2) {
        console.error('MediaRecorder init failed:', err2);
        stopZoomPipeline();
        cam.setLocked(false);
        setZoomLocked(false);
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
      stopZoomPipeline();
      cam.setLocked(false);
      setZoomLocked(false);
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
  }, [stopRecording, cam, startZoomPipeline, stopZoomPipeline]);

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
      const c = cam.mode === 'digital'
        ? digitalCropRect(v.videoWidth, v.videoHeight, cam.zoomRef.current)
        : { sx: 0, sy: 0, sw: v.videoWidth, sh: v.videoHeight };
      ctx.drawImage(v, c.sx, c.sy, c.sw, c.sh, 0, 0, canvas.width, canvas.height);
      setPreviewPosterUrl(canvas.toDataURL('image/jpeg', 0.85));
    } catch (err) {
      console.error('Αποτυχία capture frame από ζωντανή κάμερα για preview poster:', err);
    }
  }, [cam.mode, cam.zoomRef]);

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
    stopZoomPipeline();
    stopStream();
    onCancel();
  };

  return (
    <div ref={cam.attachSurface} style={styles.overlay}>
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
          <ZoomViewport videoRef={videoRef}>
            <video
              ref={attachLiveVideo}
              autoPlay
              muted
              playsInline
              style={{
                ...styles.video,
                transform: cam.mode === 'digital' ? `scale(${cam.zoom})` : 'none'
              }}
            />
          </ZoomViewport>
          {ready && !zoomLocked && (
            <ZoomControls
              zoom={cam.zoom}
              presets={cam.presets}
              showBadge={cam.showBadge}
              onSelect={(z) => cam.setZoom(z, { silent: true })}
            />
          )}
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
              <button
                type="button"
                onClick={stopRecording}
                style={styles.stopBtn}
                aria-label="Διακοπή εγγραφής"
              >
                <span style={styles.stopBtnInner} />
              </button>
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
    // Πάνω από το PhotoPreviewModal (zIndex 9999-10001), γιατί η κάμερα
    // ανοίγει και από το "+ Προσθήκη" μέσα στο modal.
    zIndex: 20000,
    background: '#000',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    touchAction: 'none'
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
    padding: 0
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