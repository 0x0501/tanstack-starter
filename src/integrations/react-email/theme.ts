// Shared email styles. Email clients need inline styles and web-safe fonts, so
// we use a serif stack and the site's parchment / iron-gall / vermilion palette.
export const serif = "Georgia, 'Times New Roman', Times, serif"

export const main = {
  backgroundColor: '#efe7d6',
  margin: 0,
  // Horizontal padding keeps the card off the screen edges on small devices.
  padding: '32px 16px',
  fontFamily: serif,
}
export const container = {
  maxWidth: '480px',
  margin: '0 auto',
  backgroundColor: '#f9f6ef',
  border: '1px solid #e3d9c6',
  borderRadius: '4px',
  padding: '40px 40px 32px',
}
export const wordmark = {
  margin: 0,
  fontFamily: serif,
  fontSize: '22px',
  fontWeight: 600,
  letterSpacing: '0.01em',
  color: '#9a3727',
}
export const heading = {
  margin: '24px 0 0',
  fontFamily: serif,
  fontSize: '26px',
  fontWeight: 600,
  color: '#14110a',
}
export const text = {
  margin: '12px 0 0',
  fontSize: '16px',
  lineHeight: '1.6',
  color: '#4b4434',
}
export const button = {
  backgroundColor: '#9a3727',
  color: '#f9f6ef',
  fontFamily: serif,
  fontSize: '16px',
  fontWeight: 600,
  textDecoration: 'none',
  padding: '12px 28px',
  borderRadius: '3px',
  display: 'inline-block',
}
export const linkText = {
  margin: '8px 0 0',
  fontSize: '13px',
  lineHeight: '1.5',
  color: '#9a3727',
  wordBreak: 'break-all' as const,
}
export const hr = { borderColor: '#e3d9c6', margin: '28px 0 0' }
export const footer = {
  margin: '16px 0 0',
  fontSize: '13px',
  lineHeight: '1.6',
  color: '#807653',
}
