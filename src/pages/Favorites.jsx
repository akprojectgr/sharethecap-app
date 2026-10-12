import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { fetchMyFavorites } from '../lib/likes';

// Το "plus" ενός λογαριασμού: όλες οι φωτογραφίες που έχει κάνει like ο
// χρήστης, από όλα τα events, μόνιμα προσβάσιμες - ακόμα και μετά το event,
// ακόμα κι από άλλη συσκευή. Ένας απλός guest (χωρίς λογαριασμό) δεν έχει
// πρόσβαση εδώ.
export default function Favorites() {
  const navigate = useNavigate();
  const [user, setUser] = useState(undefined); // undefined = ακόμα φορτώνει
  const [favorites, setFavorites] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user || null);
    });
  }, []);

  useEffect(() => {
    if (user === undefined) return;
    if (!user) {
      setLoading(false);
      return;
    }
    fetchMyFavorites(user.id).then((rows) => {
      setFavorites(rows);
      setLoading(false);
    });
  }, [user]);

  const getPhotoUrl = (path) => {
    const { data } = supabase.storage.from('photos').getPublicUrl(path);
    return data.publicUrl;
  };

  if (user === undefined || loading) {
    return (
      <div style={styles.container}>
        <div style={styles.spinner} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (!user) {
    return (
      <div style={styles.container}>
        <div style={styles.centerBox}>
          <p style={styles.emptyText}>
            Τα αγαπημένα είναι διαθέσιμα μόνο για συνδεδεμένους χρήστες.
          </p>
          <button style={styles.backBtn} onClick={() => navigate('/')}>
            ← Πίσω
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <button style={styles.backLink} onClick={() => navigate('/')}>← Πίσω</button>
        <h1 style={styles.title}>Τα αγαπημένα μου</h1>
      </div>

      {favorites.length === 0 ? (
        <div style={styles.centerBox}>
          <p style={styles.emptyText}>Δεν έχεις κάνει ακόμα like σε καμία φωτογραφία.</p>
        </div>
      ) : (
        <div className="masonry-grid">
          {favorites.map((photo) => (
            <div key={photo.id} style={styles.photoCard}>
              <img src={getPhotoUrl(photo.file_path)} alt="" style={styles.photoImage} loading="lazy" />
              <div style={styles.eventBadge}>{photo.event_name}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #0A1628 0%, #132F52 50%, #1A4478 100%)',
    padding: '24px 16px 60px',
    boxSizing: 'border-box'
  },
  header: {
    marginBottom: '24px'
  },
  backLink: {
    background: 'none',
    border: 'none',
    color: '#d4af37',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    padding: 0,
    marginBottom: '12px'
  },
  title: {
    color: 'white',
    fontSize: '24px',
    fontWeight: '700',
    margin: 0
  },
  spinner: {
    width: '36px',
    height: '36px',
    margin: '100px auto',
    border: '3px solid rgba(212, 175, 55, 0.25)',
    borderTop: '3px solid #d4af37',
    borderRadius: '50%',
    animation: 'spin 0.8s linear infinite'
  },
  centerBox: {
    textAlign: 'center',
    padding: '80px 20px'
  },
  emptyText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: '15px',
    marginBottom: '20px'
  },
  backBtn: {
    background: 'rgba(212, 175, 55, 0.15)',
    border: '1px solid rgba(212, 175, 55, 0.4)',
    color: '#d4af37',
    padding: '10px 20px',
    borderRadius: '20px',
    cursor: 'pointer',
    fontSize: '14px',
    fontWeight: '600'
  },
  photoCard: {
    position: 'relative',
    marginBottom: '15px',
    borderRadius: '20px',
    overflow: 'hidden',
    breakInside: 'avoid',
    WebkitColumnBreakInside: 'avoid',
    border: '1px solid rgba(255,255,255,0.05)'
  },
  photoImage: {
    width: '100%',
    height: 'auto',
    display: 'block'
  },
  eventBadge: {
    position: 'absolute',
    bottom: '8px',
    left: '8px',
    background: 'rgba(10, 22, 40, 0.8)',
    color: '#d4af37',
    fontSize: '11px',
    fontWeight: '600',
    padding: '4px 10px',
    borderRadius: '12px'
  }
};
