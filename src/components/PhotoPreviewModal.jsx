import React, { useState, useRef } from 'react';
import { isVideoFile } from '../lib/videoPreview';

export default function PhotoPreviewModal({ previewUrls, pendingFiles, onRemovePhoto, onAddMoreFiles, onConfirm, onCancel, onDismiss, uploading, uploadProgress, event, error }) {
  const [selectedIndex, setSelectedIndex] = useState(null);

  // pendingFiles είναι στην ΙΔΙΑ σειρά με τα previewUrls (βλ. useEventPhotos.js)
  // - το χρησιμοποιούμε ΜΟΝΟ για να ξέρουμε ποιο index είναι βίντεο· το
  // ίδιο το URL που δείχνουμε παραμένει πάντα το previewUrls[index].
  const isVideoAt = (index) => !!(pendingFiles && pendingFiles[index] && isVideoFile(pendingFiles[index]));

  // ΔΙΟΡΘΩΣΗ ("ο guest δεν ξέρει το όριο διάρκειας βίντεο παρά μόνο ΑΦΟΥ
  // απορριφθεί"): επαγγελματικό UX είναι ο περιορισμός να φαίνεται ΠΡΟΛΗΠΤΙΚΑ
  // (εδώ, πριν καν πατήσει "Αποστολή") ΚΑΙ όχι μόνο αντιδραστικά μέσω του
  // μηνύματος σφάλματος (useEventPhotos.js) αν τον παραβεί - έτσι δεν
  // εκπλήσσεται άσχημα. Δείχνουμε την υπενθύμιση ΜΟΝΟ όταν υπάρχει
  // πράγματι τουλάχιστον ένα βίντεο στο batch (όχι άσχετη σε ένα batch μόνο
  // με φωτογραφίες). Το ίδιο όριο (5 λεπτά) με το MAX_VIDEO_DURATION_SECONDS
  // στο useEventPhotos.js - αν αλλάξει εκεί, άλλαξέ το και εδώ.
  const hasVideo = !!(pendingFiles && pendingFiles.some((f) => isVideoFile(f)));

  const allCategories = event?.categories || [];
  const hiddenCategories = event?.hidden_categories || [];
  const availableCategories = allCategories.filter((cat) => !hiddenCategories.includes(cat));

  const [selectedCategory, setSelectedCategory] = useState(availableCategories[0] || '');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const addMoreInputRef = useRef(null);
  const touchStartX = useRef(null);

  // Drag-to-dismiss στη λαβή πάνω πάνω (σαν iOS sheet): σέρνεις κάτω, το
  // modal ακολουθεί το δάχτυλο σε πραγματικό χρόνο (χωρίς transition), και
  // στο release είτε γυρνάει πίσω (κάτω από το threshold) είτε γλιστράει
  // εντελώς κάτω και μόλις τελειώσει το animation καλεί onDismiss() - που
  // ΜΟΝΟ κρύβει το preview, ΔΕΝ πετάει τις επιλεγμένες φωτογραφίες (αυτές
  // μένουν σαν draft). Το ρητό "Απόρριψη όλων" παραμένει το μόνο σημείο
  // που πραγματικά διαγράφει τα πάντα, μέσω onCancel().
  const dragStartY = useRef(null);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [closing, setClosing] = useState(false);

  if (!previewUrls || previewUrls.length === 0) return null;

  const handleDragPointerDown = (e) => {
    if (uploading) return;
    dragStartY.current = e.clientY;
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const handleDragPointerMove = (e) => {
    if (dragStartY.current === null) return;
    const delta = e.clientY - dragStartY.current;
    setDragY(delta > 0 ? delta : 0);
  };

  const handleDragPointerUp = () => {
    if (dragStartY.current === null) return;
    dragStartY.current = null;
    setDragging(false);
    if (dragY > 100) {
      setClosing(true);
    } else {
      setDragY(0);
    }
  };

  const handleTouchStart = (e) => {
    touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(diff) > 50) {
      if (diff > 0) {
        setSelectedIndex((i) => (i > 0 ? i - 1 : previewUrls.length - 1));
      } else {
        setSelectedIndex((i) => (i < previewUrls.length - 1 ? i + 1 : 0));
      }
    }
    touchStartX.current = null;
  };

  const handleDeleteCurrent = () => {
    if (selectedIndex === null) return;
    onRemovePhoto(selectedIndex);
    if (previewUrls.length <= 1) {
      setSelectedIndex(null);
    } else if (selectedIndex >= previewUrls.length - 1) {
      setSelectedIndex(previewUrls.length - 2);
    }
  };

  const finalCategoryToSubmit = selectedCategory || availableCategories[0] || '';
  const currentLabel = finalCategoryToSubmit || 'Επιλέξτε κατηγορία';

  return (
    <>
      <input
        ref={addMoreInputRef}
        type="file"
        accept="image/*,video/*,.heic,.heif"
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          if (e.target.files && e.target.files.length > 0) {
            onAddMoreFiles(e);
          }
        }}
      />

      <div style={styles.overlay}>
        <div
          style={{
            ...styles.modalCard,
            transform: closing ? 'translateY(120%)' : `translateY(${dragY}px)`,
            transition: dragging ? 'none' : 'transform 0.32s cubic-bezier(0.22, 0.61, 0.36, 1)'
          }}
          onTransitionEnd={() => {
            if (closing) (onDismiss || onCancel)();
          }}
        >
          <div
            style={{ ...styles.dragHandleHitArea, cursor: uploading ? 'default' : 'grab', touchAction: 'none' }}
            onPointerDown={handleDragPointerDown}
            onPointerMove={handleDragPointerMove}
            onPointerUp={handleDragPointerUp}
            onPointerCancel={handleDragPointerUp}
          >
            <div style={styles.dragHandle} />
          </div>

          <div style={styles.headerRow}>
            <div>
              <p style={styles.title}>Νέες φωτογραφίες ({previewUrls.length})</p>
              <p style={styles.subtitle}>
                Πάτησε μια φωτογραφία για προβολή
                {hasVideo ? ' · Βίντεο έως 5 λεπτά' : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => addMoreInputRef.current?.click()}
              disabled={uploading}
              style={styles.addMoreBtn}
            >
              + Προσθήκη
            </button>
          </div>

          {/* MINIMAL CUSTOM DROPDOWN */}
          {availableCategories.length > 0 && (
            <div style={{ width: '100%', marginBottom: '16px', position: 'relative' }}>
              <button
                type="button"
                onClick={() => !uploading && setDropdownOpen((prev) => !prev)}
                disabled={uploading}
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  borderRadius: '12px',
                  background: 'rgba(255, 255, 255, 0.07)',
                  color: '#fff',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  fontSize: '14px',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: uploading ? 'default' : 'pointer',
                  boxSizing: 'border-box',
                  textAlign: 'left'
                }}
              >
                <span>{currentLabel}</span>
                <span style={{ color: 'rgba(217, 181, 74, 0.8)', fontSize: '11px', transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>▼</span>
              </button>

              {dropdownOpen && (
                <>
                  <div
                    onClick={() => setDropdownOpen(false)}
                    style={{ position: 'fixed', inset: 0, zIndex: 40 }}
                  />
                  <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 6px)',
                    left: 0,
                    right: 0,
                    background: '#0D1D35',
                    border: '1px solid rgba(217, 181, 74, 0.3)',
                    borderRadius: '12px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                    zIndex: 50,
                    overflow: 'hidden',
                    maxHeight: '200px',
                    overflowY: 'auto'
                  }}>
                    {availableCategories.map((cat) => (
                      <div
                        key={cat}
                        onClick={() => {
                          setSelectedCategory(cat);
                          setDropdownOpen(false);
                        }}
                        style={{
                          padding: '12px 16px',
                          fontSize: '13.5px',
                          color: finalCategoryToSubmit === cat ? '#F0D27A' : '#fff',
                          background: finalCategoryToSubmit === cat ? 'rgba(217, 181, 74, 0.1)' : 'transparent',
                          cursor: 'pointer',
                          borderBottom: '1px solid rgba(255,255,255,0.06)'
                        }}
                      >
                        {cat}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Οριζόντιο Scrollable Container για φωτογραφίες */}
          <div style={styles.scrollContainer}>
            {previewUrls.map((url, index) => (
              <div key={index} style={styles.imageContainer}>
                {isVideoAt(index) ? (
                  // muted/χωρίς controls εδώ - είναι απλά το thumbnail στη
                  // λωρίδα, το πραγματικό play γίνεται στο full-screen preview
                  // παρακάτω. preload="metadata" ώστε ο browser να δείξει
                  // τουλάχιστον το πρώτο frame σαν στατική εικόνα.
                  <video src={url} muted playsInline preload="metadata" style={styles.image} onClick={() => setSelectedIndex(index)} />
                ) : (
                  <img
                    src={url}
                    alt={`Preview ${index}`}
                    style={styles.image}
                    onClick={() => setSelectedIndex(index)}
                  />
                )}
                {isVideoAt(index) && (
                  <div style={styles.thumbPlayBadge} aria-hidden="true">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="#16223E">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemovePhoto(index);
                  }}
                  disabled={uploading}
                  style={styles.removeBtn}
                  aria-label="Αφαίρεση φωτογραφίας"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {/* ΜΠΑΡΑ ΠΡΟΟΔΟΥ ΑΝΕΒΑΣΜΑΤΟΣ - πραγματική πρόοδος (X από Y φωτογραφίες),
          όχι fake/indeterminate shimmer, ώστε ο χρήστης να βλέπει από το
          πρώτο frame ότι κάτι ήδη συμβαίνει και πόσο έχει προχωρήσει. */}
          {uploading && (
            <div style={{ width: '100%', marginBottom: '14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#F0D27A', marginBottom: '6px', fontWeight: '600' }}>
                <span>
                  {/* ΔΙΟΡΘΩΣΗ (design review - "δεν ενδιαφέρει τον χρήστη ότι
                  γίνεται συμπίεση"): η συμπίεση βίντεο (βλ.
                  compressVideoForPlayback στο useEventPhotos.js) τρέχει πλέον
                  ΑΘΟΡΥΒΑ σε background ΜΕΤΑ την ολοκλήρωση του upload - δεν
                  υπάρχει κανένα στάδιο "συμπίεσης" που να πρέπει να δείξουμε
                  εδώ πια, ο guest βλέπει μόνο το κανονικό upload progress. */}
                  Ανέβασμα {uploadProgress?.current || 1} από {uploadProgress?.total || previewUrls.length} φωτογραφι{(uploadProgress?.total || previewUrls.length) === 1 ? 'ά' : 'ών'}...
                </span>
                {/* ΝΕΟ (auto-retry): όσο γίνεται retry λόγω στιγμιαίου network
                drop, δείχνουμε "Επανασύνδεση... X/Y" αντί για το σιωπηλό
                "Παρακαλώ περιμένετε", ώστε ο χρήστης να ξέρει ότι κάτι ξανά
                δοκιμάζεται - όχι ότι έχει κολλήσει.
                ΝΕΟ v4 (resumable/TUS video upload - βλ. tusUploadVideo στο
                useEventPhotos.js): για βίντεο δείχνουμε πλέον πραγματικό
                ποσοστό % προόδου αντί για το γενικό "Παρακαλώ περιμένετε" -
                σημαντικό ειδικά για μεγάλα βίντεο σε αργό δίκτυο, ώστε ο
                guest να βλέπει ότι όντως προχωράει, όχι ότι έχει κολλήσει. */}
                <span>
                  {uploadProgress?.retry
                    ? `Επανασύνδεση... προσπάθεια ${uploadProgress.retry.attempt}/${uploadProgress.retry.max}`
                    : typeof uploadProgress?.videoProgress === 'number'
                    ? `Ανέβασμα βίντεο... ${uploadProgress.videoProgress}%`
                    : 'Παρακαλώ περιμένετε'}
                </span>
              </div>
              <div style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{
                  width: `${uploadProgress?.total ? Math.round(((uploadProgress.current - 0.5) / uploadProgress.total) * 100) : 8}%`,
                  height: '100%',
                  background: 'linear-gradient(90deg, #D9B54A, #F5DD9A)',
                  borderRadius: '3px',
                  transition: 'width 0.3s ease'
                }} />
              </div>
            </div>
          )}

          {/* ΔΙΟΡΘΩΣΗ ("κολλάει στο ανέβασμα χωρίς κανένα μήνυμα" - π.χ. video
          upload σε Samsung): πριν, το σφάλμα (timeout μετά 2 λεπτά, αρχείο
          πολύ μεγάλο, σφάλμα δικτύου) υπολογιζόταν στο useEventPhotos.js
          αλλά ΔΕΝ έφτανε ποτέ ως props εδώ - το modal αυτό απλά δεν είχε
          error prop. Αποτέλεσμα: ο χρήστης έβλεπε το "Ανεβαίνουν..." να
          μένει ή να εξαφανίζεται χωρίς καμία εξήγηση όταν κάτι πήγαινε
          στραβά. Τώρα, αν υπάρχει error, το δείχνουμε ΜΕΣΑ στο ίδιο το
          modal (zIndex 9999+), όχι στο εξωτερικό banner που θα έμενε κρυμμένο
          πίσω από αυτό το modal. */}
          {error && (
            <div style={{
              width: '100%',
              marginBottom: '14px',
              padding: '10px 14px',
              borderRadius: '10px',
              background: 'rgba(255, 69, 58, 0.15)',
              border: '1px solid rgba(255, 69, 58, 0.5)',
              color: '#ff8a80',
              fontSize: '13px',
              fontWeight: '600',
              textAlign: 'center'
            }}>
              {error}
            </div>
          )}

          <div style={styles.actions}>
            <button
              type="button"
              onClick={onCancel}
              disabled={uploading}
              style={styles.cancelBtn}
            >
              Απόρριψη όλων
            </button>
            <button
              type="button"
              onClick={() => onConfirm(finalCategoryToSubmit)}
              disabled={uploading}
              style={styles.confirmBtn}
            >
              {uploading ? (
                <span style={styles.confirmBtnUploading}>
                  <span style={styles.confirmSpinner} />
                  Ανεβαίνουν… {uploadProgress?.current || 1}/{uploadProgress?.total || previewUrls.length}
                </span>
              ) : (
                'Αποστολή'
              )}
            </button>
          </div>
        </div>
      </div>

      {selectedIndex !== null && previewUrls[selectedIndex] && (
        <div
          style={styles.lightboxOverlay}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >
          <div style={styles.lightboxTopBar}>
            <button
              type="button"
              onClick={handleDeleteCurrent}
              style={styles.lightboxActionBtn}
              aria-label="Διαγραφή φωτογραφίας"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
            </button>

            <span style={styles.lightboxCounter}>
              {selectedIndex + 1} of {previewUrls.length}
            </span>

            <button
              type="button"
              onClick={() => setSelectedIndex(null)}
              style={styles.lightboxActionBtn}
              aria-label="Κλείσιμο"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          </div>

          <div style={styles.lightboxContent}>
            {isVideoAt(selectedIndex) ? (
              <video
                src={previewUrls[selectedIndex]}
                controls
                playsInline
                autoPlay
                style={styles.lightboxImage}
              />
            ) : (
              <img
                src={previewUrls[selectedIndex]}
                alt="Full view"
                style={styles.lightboxImage}
              />
            )}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 9999,
    background: 'rgba(10, 22, 40, 0.8)',
    backdropFilter: 'blur(10px)',
    WebkitBackdropFilter: 'blur(10px)',
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'center',
    animation: 'fadeInUp 0.3s ease-out'
  },
  modalCard: {
    width: '100%',
    maxWidth: '500px',
    background: '#262A21',
    borderTop: '1px solid rgba(217, 181, 74, 0.3)',
    borderLeft: '1px solid rgba(217, 181, 74, 0.15)',
    borderRight: '1px solid rgba(217, 181, 74, 0.15)',
    borderTopLeftRadius: '24px',
    borderTopRightRadius: '24px',
    borderBottomLeftRadius: '0px',
    borderBottomRightRadius: '0px',
    padding: '16px 20px 34px 20px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    boxShadow: '0 -10px 30px rgba(0,0,0,0.5)',
    boxSizing: 'border-box'
  },
  dragHandleHitArea: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '10px 0',
    marginBottom: '4px',
    marginTop: '-10px'
  },
  dragHandle: {
    width: '36px',
    height: '4px',
    borderRadius: '2px',
    background: 'rgba(255, 255, 255, 0.25)'
  },
  headerRow: {
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '14px'
  },
  title: {
    color: 'white',
    fontSize: '17px',
    fontWeight: '600',
    margin: '0 0 2px 0',
    textAlign: 'left'
  },
  subtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: '11.5px',
    margin: 0,
    textAlign: 'left'
  },
  addMoreBtn: {
    background: 'rgba(217, 181, 74, 0.15)',
    border: '1px solid rgba(217, 181, 74, 0.4)',
    color: '#D9B54A',
    padding: '6px 12px',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    whiteSpace: 'nowrap'
  },
  scrollContainer: {
    width: '100%',
    display: 'flex',
    flexDirection: 'row',
    gap: '12px',
    overflowX: 'auto',
    overflowY: 'hidden',
    marginBottom: '20px',
    paddingBottom: '6px',
    WebkitOverflowScrolling: 'touch'
  },
  imageContainer: {
    position: 'relative',
    width: '84px',
    height: '84px',
    flexShrink: 0,
    borderRadius: '12px',
    overflow: 'hidden',
    background: '#0A1628',
    border: '1px solid rgba(255,255,255,0.1)',
    cursor: 'pointer'
  },
  image: {
    width: '100%',
    height: '100%',
    objectFit: 'cover'
  },
  thumbPlayBadge: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '26px',
    height: '26px',
    borderRadius: '50%',
    background: 'rgba(255, 255, 255, 0.9)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: '2px',
    pointerEvents: 'none'
  },
  removeBtn: {
    position: 'absolute',
    top: '4px',
    right: '4px',
    width: '22px',
    height: '22px',
    borderRadius: '50%',
    background: 'rgba(0, 0, 0, 0.75)',
    border: '1px solid rgba(255, 255, 255, 0.3)',
    color: 'white',
    fontSize: '11px',
    fontWeight: '700',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
  },
  actions: {
    display: 'flex',
    gap: '10px',
    width: '100%'
  },
  cancelBtn: {
    flex: 1,
    padding: '12px',
    borderRadius: '12px',
    background: 'rgba(217, 181, 74, 0.15)',
    border: '1px solid rgba(217, 181, 74, 0.4)',
    color: '#D9B54A',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer'
  },
  confirmBtn: {
    flex: 1,
    padding: '12px',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, #D9B54A 0%, #C79A2E 100%)',
    border: 'none',
    color: '#16325C',
    fontSize: '14px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: '0 4px 15px rgba(217, 181, 74, 0.3)'
  },
  confirmBtnUploading: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px'
  },
  confirmSpinner: {
    width: '14px',
    height: '14px',
    borderRadius: '50%',
    border: '2px solid rgba(22, 50, 92, 0.35)',
    borderTopColor: '#16325C',
    animation: 'spin 0.7s linear infinite',
    display: 'inline-block',
    flexShrink: 0
  },
  lightboxOverlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 10000,
    background: '#000000',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    userSelect: 'none'
  },
  lightboxTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '60px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 20px',
    zIndex: 10001,
    background: 'linear-gradient(to bottom, rgba(0,0,0,0.8), transparent)'
  },
  lightboxActionBtn: {
    background: 'none',
    border: 'none',
    color: 'white',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px'
  },
  lightboxCounter: {
    color: 'white',
    fontSize: '15px',
    fontWeight: '500',
    letterSpacing: '0.5px'
  },
  lightboxContent: {
    flex: 1,
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px'
  },
  lightboxImage: {
    maxWidth: '100%',
    maxHeight: '82vh',
    objectFit: 'contain',
    borderRadius: '12px'
  }
};