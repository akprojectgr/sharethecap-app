import React, { useEffect } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

export default function QrScannerModal({ onScanSuccess, onClose }) {
  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      "reader",
      { fps: 10, qrbox: { width: 250, height: 250 } },
      false
    );

    scanner.render(
      (decodedText) => {
        scanner.clear();
        // Εξάγουμε τον κωδικό αν είναι URL ή απλό κείμενο
        let code = decodedText;
        try {
          const url = new URL(decodedText);
          const codeParam = url.searchParams.get('code');
          if (codeParam) code = codeParam;
        } catch (e) {}
        
        onScanSuccess(code);
      },
      (error) => {
        // αγνόησε τα συνεχή frames που δεν έχουν QR
      }
    );

    return () => {
      scanner.clear().catch((error) => {
        console.error("Failed to clear html5QrcodeScanner. ", error);
      });
    };
  }, []);

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <h3>Σαρώστε το QR Code</h3>
        <div id="reader" style={{ width: '100%' }}></div>
        <button onClick={onClose} style={styles.closeBtn}>Κλείσιμο</button>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.85)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
    padding: '20px'
  },
  modal: {
    background: '#16325C',
    padding: '20px',
    borderRadius: '16px',
    width: '100%',
    maxWidth: '360px',
    textAlign: 'center',
    color: '#fff'
  },
  closeBtn: {
    marginTop: '15px',
    background: '#ff453a',
    color: '#fff',
    border: 'none',
    padding: '10px 20px',
    borderRadius: '8px',
    fontWeight: 'bold',
    cursor: 'pointer'
  }
};