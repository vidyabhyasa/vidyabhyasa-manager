// ============================================================
// EDIT THESE before going live.
// ============================================================

// Your real UPI ID and the name that should show up in the
// student's UPI app when they scan the QR code to pay.
export const UPI_ID = 'paytm.s21tdlt@pty';
export const UPI_PAYEE_NAME = 'Vidyabhyasa Study Center';

// Your deployed site's URL (no trailing slash) — used to build an
// absolute link to the logo for the bill email, since emails can't
// use relative paths. Update this once you know your real domain.
export const SITE_URL = 'https://vidyabhyasa-manager.vercel.app';

// Shown to students before they can proceed with registration.
// Each rule has a short label (like a category) and the actual
// rule text, plus an icon. Keep this in sync with the matching
// RULES_TEXT constant near the top of index.html's <script>.
export const RULES_TEXT = [
  { icon: '🤫', label: 'Silence', text: 'Keep silence in the study centre.' },
  { icon: '🚫', label: 'Discussions', text: 'Discussion and disturbing others are strictly not allowed inside the study centre.' },
  { icon: '🏫', label: 'Entry', text: 'Only admitted members are allowed inside the study centre.' },
  { icon: '📵', label: 'Phone calls', text: 'Talking on the phone is not allowed inside the study centre.' },
  { icon: '🪑', label: 'Seating', text: 'One should sit in the allotted seat only.' },
  { icon: '📢', label: 'Concerns', text: 'If any problems or discomfort, contact management immediately.' },
  { icon: '🍽️', label: 'Food', text: 'Do not eat on the study table.' },
  { icon: '🧹', label: 'Cleanliness', text: 'Maintain cleanliness at all times.' },
  { icon: '⚠️', label: 'Property', text: 'Marking, scratching, or damaging library property invites disciplinary action.' },
  { icon: '🎧', label: 'Online classes', text: 'Headphones/earbuds should be used while listening to online classes.' },
  { icon: '💳', label: 'Refunds', text: 'No refund after registration.' },
  { icon: '📰', label: 'Newspapers', text: 'Keep newspaper in the stand after reading.' },
  { icon: '💎', label: 'Valuables', text: 'Do not keep money, gold, or valuable items on the desk.' },
  { icon: '🔄', label: 'Seat changes', text: 'Inform management and get approval before changing your allotted seat.' },
  { icon: '🌀', label: 'Fans', text: "Do not adjust fan positions — they're already set for proper airflow to all members." }
];

// A separate highlighted note about renewals and the grace period —
// shown below the rules grid, not as part of it.
export const RULES_NOTES = [
  'Late payment does not extend your membership. Renewals are always calculated from your due date, not the payment date.',
  'Fee must be paid within 3 days after the due date to retain your seat. If payment is not received within 3 days, your books will be moved to the locker, and the seat may be allotted to another member. Books will be returned after clearing all pending dues.'
];
