import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useCameraZoom, digitalCropRect } from '../lib/useCameraZoom';
import ZoomControls, { ZoomViewport } from './ZoomControls';

// Ίδιο σκεπτικό/λύση με το VideoRecorder.jsx (βλ. εκεί για την πλήρη
// εξήγηση) - εδώ το ίδιο πρόβλημα αλλά για ΦΩΤΟΓΡΑΦΙΑ:
//
// Το παλιό κουμπί "φωτογραφία" άνοιγε τη native Camera app της συσκευής
// μέσω <input type="file" capture="environment" accept="image/*">. Αυτό
// βάζει την καρτέλα του browser σε background όσο είναι ανοιχτή η κάμερα -
// επιβεβαιωμένο σε πραγματικό test (Xiaomi + Firefox): το MIUI σκοτώνει
// επιθετικά background tabs για να ελευθερώσει μνήμη, ειδικά όταν ανοίγει
// μια "βαριά" native εφαρμογή σαν την Camera από πάνω. Όταν ο χρήστης
// γυρνάει πίσω, ο browser δεν "συνεχίζει" - ξαναφορτώνει τη σελίδα από την
// αρχή, χάνοντας τη φωτογραφία που μόλις τραβήχτηκε (φαίνεται σαν τυχαίο
// "refresh"). Αυτό είναι behavior του λειτουργικού, όχι bug του κώδικα -
// δεν διορθώνεται όσο περνάμε από τη native app.
//
// Η λύση: τραβάμε τη φωτογραφία ΜΕΣΑ στη σελίδα (getUserMedia για ζωντανή
// προεπισκόπηση + snapshot σε <canvas>). Ποτέ δεν φεύγουμε από τη σελίδα,
// άρα ποτέ δεν μπαίνει το tab σε background/risk of kill.
//
// ΣΗΜΕΙΩΣΗ: σε αντίθεση με το VideoRecorder, εδώ δεν χρειαζόμαστε
// MediaRecorder - μόνο getUserMedia + canvas.toBlob() - άρα υποστηρίζεται
// σε ελαφρώς περισσότερες/παλιότερες συσκευές. Fallback στο παλιό native
// camera input γίνεται στο FloatingAddMenu.jsx όταν δεν υπάρχει καν
// getUserMedia (πολύ σπάνιο σήμερα).

function formatFileName(ext) {
  return `photo-${Date.now()}.${ext}`;
}

export default function PhotoCapture({ onCancel, onCaptured }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const canvasRef = useRef(null);

  const [facingMode, setFacingMode] = useState('environment');
  const [ready, setReady] = useState(false);
  const [switchingCamera, setSwitchingCamera] = useState(false);
  const [needsTapToStart, setNeedsTapToStart] = useState(false);
  const [error, setError] = useState('');
  const [previewUrl, setPreviewUrl] = useState(null);
  const [previewBlob, setPreviewBlob] = useState(null);

  // ΦΛΑΣ/ΦΩΤΙΣΜΟΣ: πολλά Android (κυρίως πίσω κάμερα) υποστηρίζουν torch
  // μέσω MediaStreamTrack.applyConstraints({advanced:[{torch:true}]}) - ΔΕΝ
  // υπάρχει κανένα standard UI γι' αυτό από τον browser όταν τραβάμε μέσα
  // από τη σελίδα (getUserMedia), σε αντίθεση με τη native camera app που
  // είχε δικό της κουμπί φλας. Χωρίς αυτό, σε σκοτεινό χώρο (π.χ. βραδινό
  // γάμο/πάρτι) ο guest δεν έχει ΚΑΝΕΝΑ τρόπο να ανάψει φως - απλά παίρνει
  // σκοτεινές φωτογραφίες. Ελέγχουμε υποστήριξη ΚΑΘΕ φορά που ανοίγει νέο
  // stream (iOS Safari και η μπροστινή κάμερα συνήθως δεν την υποστηρίζουν
  // καθόλου - το κουμπί εμφανίζεται μόνο όταν όντως δουλεύει).
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const torchOnRef = useRef(false);

  // Zoom (pinch + κουμπιά 1x/2x/3x) - βλ. lib/useCameraZoom.js. Το φλας
  // ξαναστέλνεται μαζί με κάθε αλλαγή zoom, γιατί το applyConstraints
  // αντικαθιστά όλα τα advanced constraints μαζί.
  const cam = useCameraZoom();
  useEffect(() => {
    cam.setExtraConstraints(() => (torchOnRef.current ? { torch: true } : {}));
  }, [cam.setExtraConstraints]);

  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  // Ζητάμε ρητά υψηλή ανάλυση (ίδιος λόγος με στο VideoRecorder.jsx) -
  // "ideal" ώστε να πέφτει μόνη της σε χαμηλότερη αν δεν υποστηρίζεται,
  // χωρίς να αποτυγχάνει η κάμερα.
  const startStream = useCallback(async (mode) => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setError('Η κάμερα δεν υποστηρίζεται σε αυτόν τον browser.');
      return;
    }
    setReady(false);
    setNeedsTapToStart(false);
    // Νέο stream = ξεκινάμε πάντα με το φλας σβηστό (ένα νέο track δεν
    // κληρονομεί ποτέ την κατάσταση torch από το προηγούμενο), και δεν
    // ξέρουμε ακόμα αν το νέο track το υποστηρίζει μέχρι να το ελέγξουμε
    // παρακάτω.
    setTorchOn(false);
    torchOnRef.current = false;
    setTorchSupported(false);
    stopStream();
    try {
      // ΑΝΑΛΥΣΗ - ισορροπία ταχύτητας ανεβάσματος VS ποιότητας για το
      // ΤΕΛΙΚΟ κατέβασμα του ζευγαριού μετά τον γάμο (δύο αντικρουόμενες
      // ανάγκες, το ίδιο αρχείο εξυπηρετεί και τις δύο - δεν υπάρχει "διόρθωση"
      // ανάλυσης αργότερα, ό,τι αποθηκεύσουμε τώρα θα μείνει):
      //  - 4K (3840x2160) ήταν πολύ "βαρύ" (8-10MB+) - αισθητά πιο αργό
      //    ανέβασμα, επιβεβαιωμένο σε πραγματικό test.
      //  - 1080p ήταν γρήγορο, αλλά ~2MP είναι χαμηλή ανάλυση για το
      //    ζευγάρι αν θελήσει αργότερα να εκτυπώσει/κρατήσει τις
      //    φωτογραφίες σε καλή ποιότητα (αρκεί μόνο για μικρή εκτύπωση).
      //  - Μέση λύση: 2560x1440 (~3.7MP - αρκεί άνετα για ένα καλό 8x10
      //    print) ΚΑΙ ελαφρώς χαμηλότερη ποιότητα JPEG (0.85 αντί για 0.92,
      //    βλ. canvas.toBlob() στο capture() παρακάτω) - η ποιότητα JPEG
      //    επηρεάζει το τελικό μέγεθος αρχείου πολύ περισσότερο απ' ό,τι
      //    φαίνεται οπτικά, οπότε το αρχείο μένει περίπου στο ίδιο "ελαφρύ"
      //    επίπεδο με το 1080p/0.92, με αισθητά περισσότερα πραγματικά
      //    pixels για το ζευγάρι.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 2560 },
          height: { ideal: 1440 }
        },
        audio: false
      });
      streamRef.current = stream;
      // Έλεγχος υποστήριξης torch στο ΝΕΟ video track - getCapabilities()
      // δεν υπάρχει καθόλου σε κάποιους browsers (π.χ. iOS Safari), οπότε
      // το προστατεύουμε με optional chaining· χωρίς αυτό, ένα plain try/
      // catch θα ήταν αρκετό αλλά το απλό "?." είναι καθαρότερο εδώ.
      const videoTrack = stream.getVideoTracks()[0];
      const capabilities = videoTrack?.getCapabilities?.();
      setTorchSupported(!!capabilities && 'torch' in capabilities);
      cam.configure(videoTrack);
      if (videoRef.current) {
        const videoEl = videoRef.current;
        videoEl.srcObject = stream;
        // ΔΙΟΡΘΩΣΗ ("η κάμερα επιτρέπεται αλλά δείχνει μαύρο φόντο"): σε
        // ορισμένα Android WebView/browser combos, το attribute autoPlay
        // ΔΕΝ αρκεί από μόνο του όταν το srcObject μπαίνει δυναμικά μέσω JS
        // μετά το mount - το <video> μένει "παγωμένο" σε μαύρο, παρόλο που
        // το stream είναι κανονικά ενεργό (η κάμερα ΟΝΤΩΣ επιτρέπεται, απλά
        // δεν ξεκινάει ποτέ η αναπαραγωγή του frame). Ρητό .play() εδώ, ΚΑΙ
        // ξανά στο onloadedmetadata παρακάτω σαν safety net (σε κάποιες
        // συσκευές τα metadata δεν είναι έτοιμα ακόμα τη στιγμή του πρώτου
        // play() call). Το video είναι muted, άρα αυτό το play() δεν
        // μπλοκάρεται ποτέ από πολιτικές αυτόματης αναπαραγωγής (muted
        // autoplay επιτρέπεται σχεδόν παντού) - αν παρ' όλα αυτά αποτύχει,
        // δείχνουμε ένα "πάτα για έναρξη" fallback αντί να μείνει σιωπηλά
        // μαύρο χωρίς καμία εξήγηση.
        videoEl.muted = true;
        videoEl.onloadedmetadata = () => {
          videoEl.play().catch((playErr) => {
            console.error('video.play() retry on loadedmetadata failed:', playErr);
          });
        };
        try {
          await videoEl.play();
        } catch (playErr) {
          console.error('video.play() failed:', playErr);
          setNeedsTapToStart(true);
        }
      }
      setReady(true);
    } catch (err) {
      console.error('getUserMedia failed:', err);
      setError('Δεν μπόρεσα να ανοίξω την κάμερα. Έλεγξε ότι έδωσες άδεια πρόσβασης σε κάμερα.');
    } finally {
      setSwitchingCamera(false);
    }
  }, [stopStream, cam.configure]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await startStream(facingMode);
      // Αν το component έκανε unmount ενόσω περιμέναμε το getUserMedia,
      // σταματάμε αμέσως το stream που μόλις ήρθε (αποφυγή leak).
      if (cancelled) stopStream();
    })();
    return () => {
      cancelled = true;
      stopStream();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()?.[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next, ...cam.hardwareZoomConstraint() }] });
      torchOnRef.current = next;
      setTorchOn(next);
    } catch (err) {
      // Σπάνιο (π.χ. η συσκευή "λέει" ότι υποστηρίζει torch αλλά αρνείται
      // το applyConstraints εν τη ρύσει) - δεν σπάμε τη ροή λήψης φωτο,
      // απλά το κουμπί φλας δεν αλλάζει κατάσταση.
      console.error('torch toggle failed:', err);
    }
  };

  const switchCamera = () => {
    if (switchingCamera || previewUrl) return;
    const next = facingMode === 'environment' ? 'user' : 'environment';
    setSwitchingCamera(true);
    setFacingMode(next);
    startStream(next);
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = canvasRef.current || document.createElement('canvas');
    canvasRef.current = canvas;
    // Ψηφιακό zoom (iOS κ.λπ.): κρατάμε μόνο το κεντρικό κομμάτι που
    // έβλεπε ο χρήστης στην προεπισκόπηση. Με hardware zoom το frame είναι
    // ήδη zoomαρισμένο από την κάμερα, οπότε παίρνουμε ολόκληρο.
    const crop = cam.mode === 'digital'
      ? digitalCropRect(video.videoWidth, video.videoHeight, cam.zoomRef.current)
      : { sx: 0, sy: 0, sw: video.videoWidth, sh: video.videoHeight };
    canvas.width = crop.sw;
    canvas.height = crop.sh;
    const ctx = canvas.getContext('2d');
    // Μπροστινή (selfie) κάμερα: το ζωντανό preview είναι mirrored (βλ.
    // transform στο <video> παρακάτω) - η αποθηκευμένη φωτογραφία ακολουθεί
    // το ΙΔΙΟ mirror ώστε να ταιριάζει με αυτό που είδε ο χρήστης ζωντανά
    // (η καθιερωμένη συμπεριφορά "selfie" - όπως βλέπεις τον εαυτό σου στον
    // καθρέφτη).
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, canvas.width, canvas.height);
    // Ποιότητα 0.85 (αντί για 0.92) - βλ. σχόλιο στο startStream() παραπάνω
    // για το γιατί: κρατάει το τελικό αρχείο "ελαφρύ" παρά την ανεβασμένη
    // ανάλυση (2560x1440), ισορροπώντας ταχύτητα ανεβάσματος με ποιότητα
    // για μελλοντικό κατέβασμα/εκτύπωση.
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        setPreviewBlob(blob);
        setPreviewUrl(URL.createObjectURL(blob));
      },
      'image/jpeg',
      0.85
    );
  };

  // ΔΙΟΡΘΩΣΗ ("μαύρη οθόνη μετά το 'Ξανά'/retake"): το <video> της ζωντανής
  // κάμερας αφαιρείται εντελώς από το DOM όσο δείχνουμε το preview
  // (<img src={previewUrl}>) - όταν πατηθεί "Ξανά", δημιουργείται ΚΑΙΝΟΥΡΓΙΟ
  // <video> στοιχείο, αλλά το srcObject=stream είχε μπει ΜΟΝΟ στο αρχικό
  // στοιχείο μέσα στο startStream() - ποτέ δεν ξαναμπαίνει στο νέο. Η κάμερα
  // παραμένει τεχνικά ενεργή (streamRef.current), απλά το νέο <video> δεν
  // έχει καμία πηγή - εξ ου και το μαύρο φόντο χωρίς κανένα error.
  //
  // Λύση: ref callback (αντί για απλό useRef) στο live <video> - ξανασυνδέει
  // ρητά το srcObject ΚΑΘΕ φορά που ένα νέο <video> στοιχείο προσαρτάται στο
  // DOM (δηλ. και στο αρχικό άνοιγμα ΚΑΙ μετά από κάθε retake), όχι μόνο μία
  // φορά στην αρχή.
  const attachLiveVideo = useCallback((node) => {
    videoRef.current = node;
    if (node && streamRef.current) {
      node.muted = true;
      node.srcObject = streamRef.current;
      node.play().catch((playErr) => {
        console.error('video.play() on retake remount failed:', playErr);
        setNeedsTapToStart(true);
      });
    }
  }, []);

  const retake = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setPreviewBlob(null);
  };

  const confirmUse = () => {
    if (!previewBlob) return;
    const file = new File([previewBlob], formatFileName('jpg'), { type: 'image/jpeg' });
    // ΔΙΟΡΘΩΣΗ (code review - "blob URLs δεν καθαρίζονται ποτέ στο happy
    // path"): το retake() ήδη έκανε revokeObjectURL σωστά, αλλά το confirmUse
    // (το μονοπάτι που παίρνει ΚΑΘΕ guest που τραβάει φωτο κανονικά) όχι -
    // το previewUrl έμενε pinned στη μνήμη για όλη τη ζωή της σελίδας. Το
    // revoke εδώ είναι ασφαλές: το new File([previewBlob], ...) πάνω έχει
    // ήδη τα δικά του δεδομένα από το Blob - δεν εξαρτάται καθόλου από το
    // object URL string, μόνο η εμφάνιση του <img> παραπάνω το χρειαζόταν.
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    stopStream();
    onCaptured(file);
  };

  const handleCancel = () => {
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
          <img src={previewUrl} alt="Προεπισκόπηση φωτογραφίας" style={styles.video} />
          <div style={styles.controlsRow}>
            <button type="button" onClick={retake} style={styles.secondaryBtn}>
              Ξανά
            </button>
            <button type="button" onClick={confirmUse} style={styles.primaryBtn}>
              Χρήση φωτογραφίας
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
                // Μόνο η μπροστινή κάμερα δείχνει mirrored preview (standard
                // convention - η πίσω κάμερα δείχνει ακριβώς όπως είναι).
                // + ψηφιακό zoom με CSS scale (με hardware zoom η εικόνα
                // έρχεται ήδη zoomαρισμένη από την κάμερα).
                transform: (() => {
                  const z = cam.mode === 'digital' ? cam.zoom : 1;
                  return `scale(${facingMode === 'user' ? -z : z}, ${z})`;
                })()
              }}
            />
          </ZoomViewport>
          {ready && (
            <ZoomControls
              zoom={cam.zoom}
              presets={cam.presets}
              showBadge={cam.showBadge}
              onSelect={(z) => cam.setZoom(z, { silent: true })}
            />
          )}
          {!ready && <div style={styles.loadingBadge}>Άνοιγμα κάμερας…</div>}
          {ready && torchSupported && (
            <button
              type="button"
              onClick={toggleTorch}
              aria-label="Φλας"
              style={{ ...styles.torchBtn, ...(torchOn ? styles.torchBtnActive : null) }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill={torchOn ? '#16223E' : '#fff'} stroke={torchOn ? '#16223E' : '#fff'} strokeWidth="1.5">
                <path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          {ready && needsTapToStart && (
            <button
              type="button"
              onClick={() => {
                videoRef.current
                  ?.play()
                  .then(() => setNeedsTapToStart(false))
                  .catch((err) => console.error('manual play() failed:', err));
              }}
              style={styles.tapToStartBtn}
            >
              Πάτα για έναρξη κάμερας
            </button>
          )}
          <div style={styles.controlsRow}>
            <button type="button" onClick={handleCancel} style={styles.secondaryBtn}>
              Άκυρο
            </button>
            <button
              type="button"
              onClick={capture}
              disabled={!ready}
              style={{ ...styles.shutterBtn, opacity: ready ? 1 : 0.5 }}
              aria-label="Λήψη φωτογραφίας"
            />
            <div style={styles.flipBtnSlot}>
              <button
                type="button"
                onClick={switchCamera}
                disabled={!ready || switchingCamera}
                style={styles.flipBtn}
                aria-label="Εναλλαγή κάμερας"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 2l4 4-4 4" />
                  <path d="M3 11V9a4 4 0 0 1 4-4h14" />
                  <path d="M7 22l-4-4 4-4" />
                  <path d="M21 13v2a4 4 0 0 1-4 4H3" />
                </svg>
              </button>
            </div>
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
  shutterBtn: {
    width: '68px',
    height: '68px',
    borderRadius: '50%',
    background: '#fff',
    border: '4px solid rgba(255,255,255,0.4)',
    cursor: 'pointer',
    flexShrink: 0
  },
  flipBtnSlot: {
    width: '64px',
    display: 'flex',
    justifyContent: 'center',
    flexShrink: 0
  },
  flipBtn: {
    width: '46px',
    height: '46px',
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.15)',
    border: '1px solid rgba(255,255,255,0.35)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0
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
  torchBtn: {
    position: 'absolute',
    top: '20px',
    right: '20px',
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    background: 'rgba(0,0,0,0.45)',
    border: '1px solid rgba(255,255,255,0.4)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer'
  },
  torchBtnActive: {
    background: '#F3D16B',
    border: '1px solid #F3D16B'
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
  tapToStartBtn: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    padding: '14px 22px',
    borderRadius: '9999px',
    border: '1px solid rgba(255,255,255,0.5)',
    background: 'rgba(0,0,0,0.6)',
    color: '#fff',
    fontWeight: 600,
    fontSize: '14px',
    cursor: 'pointer'
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