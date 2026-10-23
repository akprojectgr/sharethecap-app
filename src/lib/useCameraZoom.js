import { useCallback, useEffect, useRef, useState } from 'react';

// ZOOM ΚΑΜΕΡΑΣ (pinch-to-zoom + κουμπιά 1x/2x/3x) για PhotoCapture και
// VideoRecorder. Η κάμερα τρέχει ΜΕΣΑ στη σελίδα (getUserMedia), άρα δεν
// έχουμε το zoom της native Camera app - το φτιάχνουμε εδώ σε 2 επίπεδα:
//
//  - 'hardware': ο browser εκθέτει zoom στο MediaStreamTrack (Chrome/Android
//    87+). Το zoom γίνεται από την ίδια την κάμερα (καλύτερη ποιότητα) και
//    το stream βγαίνει ήδη zoomαρισμένο - η λήψη/εγγραφή δεν αλλάζει καθόλου.
//  - 'digital': ο browser ΔΕΝ εκθέτει zoom (iOS Safari, Firefox). Κάνουμε
//    zoom στην προεπισκόπηση με CSS scale, και κάνουμε το ίδιο κεντρικό crop
//    κατά τη λήψη (φωτογραφία: crop στο canvas· βίντεο: εγγραφή μέσω canvas -
//    βλ. VideoRecorder.jsx).
//
// Το ψηφιακό zoom περιορίζεται σε 3x ώστε να μη χαλάει υπερβολικά η ανάλυση.

const DIGITAL_MAX_ZOOM = 3;
const HARDWARE_MAX_ZOOM_CAP = 10;

export function clampZoom(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Κεντρικό crop για ψηφιακό zoom: ποιο κομμάτι του αρχικού frame
// αντιστοιχεί σε αυτό που βλέπει ο χρήστης στην προεπισκόπηση.
export function digitalCropRect(width, height, zoom) {
  const z = Math.max(1, zoom || 1);
  const sw = Math.round(width / z);
  const sh = Math.round(height / z);
  return { sx: Math.round((width - sw) / 2), sy: Math.round((height - sh) / 2), sw, sh };
}

export function useCameraZoom({ allowDigital = true } = {}) {
  const [mode, setMode] = useState('none'); // 'none' | 'hardware' | 'digital'
  const [zoom, setZoomState] = useState(1);
  const [range, setRange] = useState({ min: 1, max: 1 });
  const [showBadge, setShowBadge] = useState(false);

  const zoomRef = useRef(1);
  const modeRef = useRef('none');
  const rangeRef = useRef({ min: 1, max: 1 });
  const trackRef = useRef(null);
  const extraConstraintsRef = useRef(() => ({}));
  const lockedRef = useRef(false);
  const badgeTimerRef = useRef(null);

  // Ουρά applyConstraints: στο pinch έρχονται δεκάδες αλλαγές το δευτ. -
  // στέλνουμε μία τη φορά και πάντα την πιο πρόσφατη τιμή.
  const applyingRef = useRef(false);
  const pendingZoomRef = useRef(null);

  const flushHardwareZoom = useCallback(async () => {
    if (applyingRef.current) return;
    const track = trackRef.current;
    if (!track || modeRef.current !== 'hardware') return;
    applyingRef.current = true;
    try {
      while (pendingZoomRef.current !== null) {
        const value = pendingZoomRef.current;
        pendingZoomRef.current = null;
        try {
          await track.applyConstraints({ advanced: [{ zoom: value, ...extraConstraintsRef.current() }] });
        } catch (err) {
          console.warn('zoom applyConstraints failed:', err);
        }
      }
    } finally {
      applyingRef.current = false;
    }
  }, []);

  const flashBadge = useCallback(() => {
    setShowBadge(true);
    if (badgeTimerRef.current) clearTimeout(badgeTimerRef.current);
    badgeTimerRef.current = setTimeout(() => setShowBadge(false), 1200);
  }, []);

  const setZoom = useCallback((value, { silent = false } = {}) => {
    if (modeRef.current === 'none' || lockedRef.current) return;
    const { min, max } = rangeRef.current;
    const next = clampZoom(value, min, max);
    if (Math.abs(next - zoomRef.current) < 0.005) return;
    zoomRef.current = next;
    setZoomState(next);
    if (!silent) flashBadge();
    if (modeRef.current === 'hardware') {
      pendingZoomRef.current = next;
      flushHardwareZoom();
    }
  }, [flashBadge, flushHardwareZoom]);

  // Καλείται κάθε φορά που ανοίγει νέο stream (και σε εναλλαγή κάμερας).
  const configure = useCallback((track) => {
    trackRef.current = track || null;
    pendingZoomRef.current = null;
    zoomRef.current = 1;
    setZoomState(1);

    let nextMode = 'none';
    let nextRange = { min: 1, max: 1 };
    try {
      const caps = track?.getCapabilities?.();
      const z = caps && caps.zoom;
      if (z && typeof z.max === 'number' && typeof z.min === 'number' && z.max > z.min && z.max > 1) {
        nextMode = 'hardware';
        nextRange = { min: Math.max(z.min, 1), max: Math.min(z.max, HARDWARE_MAX_ZOOM_CAP) };
        // Ξεκινάμε πάντα από 1x (κάποιες συσκευές κρατάνε το zoom
        // της προηγούμενης φοράς).
        const settings = track.getSettings?.();
        if (settings && typeof settings.zoom === 'number' && settings.zoom !== nextRange.min) {
          track.applyConstraints({ advanced: [{ zoom: nextRange.min }] }).catch(() => {});
        }
      }
    } catch (err) {
      console.warn('zoom capability check failed:', err);
    }
    if (nextMode === 'none' && track && allowDigital) {
      nextMode = 'digital';
      nextRange = { min: 1, max: DIGITAL_MAX_ZOOM };
    }
    modeRef.current = nextMode;
    rangeRef.current = nextRange;
    zoomRef.current = nextRange.min;
    setMode(nextMode);
    setRange(nextRange);
    setZoomState(nextRange.min);
  }, [allowDigital]);

  const reset = useCallback(() => {
    trackRef.current = null;
    modeRef.current = 'none';
    zoomRef.current = 1;
    setMode('none');
    setZoomState(1);
  }, []);

  // Επιτρέπει στο component να κρατάει άλλα constraints (π.χ. φλας) μαζί με
  // το zoom - το applyConstraints αντικαθιστά ΟΛΑ τα advanced constraints.
  const setExtraConstraints = useCallback((fn) => {
    extraConstraintsRef.current = typeof fn === 'function' ? fn : () => ({});
  }, []);

  const hardwareZoomConstraint = useCallback(
    () => (modeRef.current === 'hardware' ? { zoom: zoomRef.current } : {}),
    []
  );

  const setLocked = useCallback((locked) => {
    lockedRef.current = !!locked;
  }, []);

  // Pinch-to-zoom: native listeners (όχι React props) γιατί το React
  // κάνει τα touch listeners passive και δεν μπορούμε να μπλοκάρουμε το
  // zoom της ίδιας της σελίδας στο iOS.
  const surfaceRef = useRef(null);
  const attachSurface = useCallback((node) => {
    surfaceRef.current = node;
  }, []);

  useEffect(() => {
    const node = surfaceRef.current;
    if (!node) return undefined;
    let startDistance = 0;
    let startZoom = 1;

    const distance = (touches) => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.hypot(dx, dy);
    };
    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        startDistance = distance(e.touches);
        startZoom = zoomRef.current;
      }
    };
    const onTouchMove = (e) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      if (!startDistance) {
        startDistance = distance(e.touches);
        startZoom = zoomRef.current;
        return;
      }
      setZoom(startZoom * (distance(e.touches) / startDistance));
    };
    const onTouchEnd = (e) => {
      if (e.touches.length < 2) startDistance = 0;
    };
    const preventGesture = (e) => e.preventDefault();

    node.addEventListener('touchstart', onTouchStart, { passive: true });
    node.addEventListener('touchmove', onTouchMove, { passive: false });
    node.addEventListener('touchend', onTouchEnd, { passive: true });
    node.addEventListener('touchcancel', onTouchEnd, { passive: true });
    node.addEventListener('gesturestart', preventGesture, { passive: false });
    node.addEventListener('gesturechange', preventGesture, { passive: false });
    return () => {
      node.removeEventListener('touchstart', onTouchStart);
      node.removeEventListener('touchmove', onTouchMove);
      node.removeEventListener('touchend', onTouchEnd);
      node.removeEventListener('touchcancel', onTouchEnd);
      node.removeEventListener('gesturestart', preventGesture);
      node.removeEventListener('gesturechange', preventGesture);
    };
  }, [setZoom]);

  useEffect(() => () => {
    if (badgeTimerRef.current) clearTimeout(badgeTimerRef.current);
  }, []);

  // Γρήγορα κουμπιά - μόνο όσα χωράνε στο εύρος της συσκευής.
  const presets = [1, 2, 3, 5].filter((p) => p >= range.min && p <= range.max + 0.001);

  return {
    mode,
    zoom,
    zoomRef,
    range,
    presets,
    showBadge,
    setZoom,
    configure,
    reset,
    setLocked,
    setExtraConstraints,
    hardwareZoomConstraint,
    attachSurface
  };
}
