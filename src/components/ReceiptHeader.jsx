import { useState } from 'react'

// Shared header for half-page money receipts (tuition payment, salary
// payment): logo left, school name/title centered, Bénin flag right --
// same layout convention as the bulletin header, just compacted to fit a
// half-A4 sheet instead of a full page.
export default function ReceiptHeader({ school, title, receiptNumber }) {
  const [logoFailed, setLogoFailed] = useState(false)
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid #000', paddingBottom: 6, marginBottom: 8 }}>
      <div style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {!logoFailed ? (
          <img src="/api/settings/school-logo" alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} onError={() => setLogoFailed(true)} />
        ) : (
          <div style={{ width: 28, height: 28, border: '2px solid #999', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#999', fontSize: 13, fontWeight: 'bold' }}>S</span>
          </div>
        )}
      </div>
      <div style={{ textAlign: 'center', flex: 1, padding: '0 8px' }}>
        <p style={{ fontWeight: 'bold', fontSize: 13, margin: 0 }}>{school?.school_name || 'Établissement scolaire'}</p>
        {(school?.city || school?.country) && (
          <p style={{ fontSize: 9, margin: '1px 0 0', color: '#555' }}>{[school.city, school.country].filter(Boolean).join(' — ')}</p>
        )}
        <p style={{ fontWeight: 'bold', fontSize: 11, letterSpacing: 1.5, margin: '5px 0 0', textTransform: 'uppercase' }}>{title}</p>
        {receiptNumber && <p style={{ fontSize: 10, margin: '2px 0 0' }}>N° <strong>{receiptNumber}</strong></p>}
      </div>
      <div style={{ width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <img src="/drapeau_benin.png" alt="Drapeau du Bénin" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
      </div>
    </div>
  )
}
