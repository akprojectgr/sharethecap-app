// Δημιουργεί ένα μικρό, συμπιεσμένο preview (JPEG) από ένα αρχείο εικόνας,
// τρέχοντας εξ ολοκλήρου στον browser μέσω <canvas> - δεν χρειάζεται καμία
// επιπλέον βιβλιοθήκη (π.χ. browser-image-compression) και δεν αγγίζει ποτέ
// το πρωτότυπο αρχείο.
//
// Η ιδέα: το ΠΡΩΤΟΤΥΠΟ αρχείο ανεβαίνει πάντα ατόφιο (καμία απώλεια -
// χρειάζεται για την τελική παράδοση σε καλύτερη ανάλυση), ενώ αυτό το
// preview χρησιμοποιείται ΜΟΝΟ για γρήγορη/ελαφριά εμφάνιση μέσα στο
// masonry grid της εφαρμογής (thumbnails).
//
// maxDimension: μέγιστο πλάτος/ύψος σε pixels (η μεγαλύτερη διάσταση
// περιορίζεται σε αυτό, η αναλογία διατηρείται).
// quality: 0-1, ποιότητα JPEG συμπίεσης.
export async function createPreviewBlob(file, maxDimension = 1200, quality = 0.75) {
  const imageBitmap = await createImageBitmap(file);

  let { width, height } = imageBitmap;
  if (width > maxDimension || height > maxDimension) {
    if (width >= height) {
      height = Math.round((height / width) * maxDimension);
      width = maxDimension;
    } else {
      width = Math.round((width / height) * maxDimension);
      height = maxDimension;
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(imageBitmap, 0, 0, width, height);

  const blob = await new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/jpeg", quality);
  });

  return blob;
}