export async function generateShareableImage(imageUrl, watermarkText) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');

      // Σχεδίαση της αρχικής φωτογραφίας
      ctx.drawImage(img, 0, 0);

      // Αν υπάρχει κείμενο watermark, το προσθέτουμε κάτω δεξιά
      if (watermarkText) {
        const fontSize = Math.max(canvas.width * 0.035, 24);
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
        ctx.shadowBlur = 8;
        ctx.textAlign = 'right';

        const x = canvas.width - (canvas.width * 0.04);
        const y = canvas.height - (canvas.height * 0.04);
        ctx.fillText(watermarkText, x, y);
      }

      canvas.toBlob((blob) => {
        if (!blob) {
          reject(new Error('Canvas blob creation failed'));
          return;
        }
        const file = new File([blob], 'sharethecap-story.jpg', { type: 'image/jpeg' });
        resolve(file);
      }, 'image/jpeg', 0.95);
    };
    img.onerror = (err) => reject(err);
    img.src = imageUrl;
  });
}