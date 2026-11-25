/** A placeholder logomark until the brand exists. Inline, so it takes the text's colour. */
export function Logomark({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="currentColor" className={className}>
      <rect x="2" y="2" width="20" height="20" rx="6" />
    </svg>
  );
}
