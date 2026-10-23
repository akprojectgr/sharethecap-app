import React, { useEffect, useRef, useState } from 'react';

// Πλαίσιο για τη ζωντανή προεπισκόπηση: έχει ΑΚΡΙΒΩΣ το σχήμα του frame
// της κάμερας και κόβει (overflow hidden) ό,τι βγαίνει έξω όταν κάνουμε
// ψηφιακό zoom με CSS scale. Χωρίς αυτό, όταν το frame δεν ταιριάζει με το
// σχήμα της οθόνης, το μεγεθυσμένο video "ξεχείλιζε" στις μαύρες λωρίδες
// και η προεπισκόπηση έδειχνε περισσότερα απ' όσα τελικά γράφονται.
export function ZoomViewport({ videoRef, children }) {
  const outerRef = useRef(null);
  const [box, setBox] = useState(null);

  useEffect(() => {
    const compute = () => {
      const outer = outerRef.current;
      const v = videoRef.current;
      if (!outer || !v || !v.videoWidth || !v.videoHeight) return;
      const W = outer.clientWidth;
      const H = outer.clientHeight;
      if (!W || !H) return;
      const ar = v.videoWidth / v.videoHeight;
      const next = W / H > ar
        ? { w: Math.round(H * ar), h: H }
        : { w: W, h: Math.round(W / ar) };
      setBox((prev) => (prev && prev.w === next.w && prev.h === next.h ? prev : next));
    };
    compute();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(compute) : null;
    if (ro && outerRef.current) ro.observe(outerRef.current);
    // Οι διαστάσεις του frame αλλάζουν σε περιστροφή, εναλλαγή κάμερας ή
    // "Ξανά" (νέο <video>) - ένας ελαφρύς έλεγχος ανά 400ms τα πιάνει όλα.
    const id = setInterval(compute, 400);
    return () => {
      if (ro) ro.disconnect();
      clearInterval(id);
    };
  }, [videoRef]);

  return (
    <div ref={outerRef} style={viewportStyles.outer}>
      <div
        style={{
          ...viewportStyles.inner,
          width: box ? `${box.w}px` : '100%',
          height: box ? `${box.h}px` : '100%'
        }}
      >
        {children}
      </div>
    </div>
  );
}

const viewportStyles = {
  outer: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  inner: {
    position: 'relative',
    overflow: 'hidden'
  }
};

// Κουμπιά γρήγορου zoom (1x / 2x / 3x ...) πάνω από το κουμπί λήψης, σαν
// της native κάμερας, + ένδειξη του τρέχοντος zoom στο pinch.
// Το pinch-to-zoom δουλεύει παντού στην προεπισκόπηση (βλ. useCameraZoom).

function formatZoom(z) {
  const rounded = Math.round(z * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}x`;
}

export default function ZoomControls({ zoom, presets, onSelect, showBadge, bottom = 116 }) {
  if (!presets || presets.length < 2) return null;

  // Ποιο preset "φωτίζεται": το μεγαλύτερο που δεν ξεπερνά το τρέχον zoom.
  let activeIndex = 0;
  presets.forEach((p, i) => {
    if (zoom >= p - 0.05) activeIndex = i;
  });

  return (
    <>
      {showBadge && <div style={styles.badge}>{formatZoom(zoom)}</div>}
      <div style={{ ...styles.row, bottom: `${bottom}px` }}>
        {presets.map((p, i) => {
          const active = i === activeIndex;
          // Στο ενεργό κουμπί δείχνουμε την ακριβή τιμή (π.χ. 1.6x από pinch).
          const label = active && Math.abs(zoom - p) > 0.05 ? formatZoom(zoom) : `${p}x`;
          return (
            <button
              key={p}
              type="button"
              onClick={() => onSelect(p)}
              aria-label={`Zoom ${p}x`}
              style={{ ...styles.btn, ...(active ? styles.btnActive : null) }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </>
  );
}

const styles = {
  row: {
    position: 'absolute',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    gap: '8px',
    padding: '4px',
    borderRadius: '9999px',
    background: 'rgba(0,0,0,0.4)',
    zIndex: 2
  },
  btn: {
    minWidth: '40px',
    height: '40px',
    padding: '0 8px',
    borderRadius: '9999px',
    border: 'none',
    background: 'rgba(255,255,255,0.12)',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer'
  },
  btnActive: {
    background: '#F3D16B',
    color: '#16223E'
  },
  badge: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    background: 'rgba(0,0,0,0.55)',
    color: '#fff',
    padding: '10px 18px',
    borderRadius: '9999px',
    fontSize: '20px',
    fontWeight: 700,
    pointerEvents: 'none',
    zIndex: 2
  }
};
