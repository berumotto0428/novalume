export function LogoFull({ className = 'h-8' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 680 200" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Mark */}
      <polygon points="88,28 128,28 148,63 128,98 88,98 68,63" fill="none" stroke="#1a1a2e" strokeWidth="1.2" />
      <polygon points="88,28 108,63 68,63" fill="#1a1a2e" opacity="0.90" />
      <polygon points="128,28 148,63 108,63" fill="#1a1a2e" opacity="0.70" />
      <polygon points="68,63 108,63 88,98" fill="#1a1a2e" opacity="0.55" />
      <polygon points="108,63 148,63 128,98" fill="#1a1a2e" opacity="0.35" />
      <polygon points="108,36 123,63 108,90 93,63" fill="#4f6ef7" opacity="0.90" />
      <polygon points="108,36 123,63 93,63" fill="#7c9bff" opacity="0.70" />
      <polygon points="108,28 113,40 103,40" fill="#a8c0ff" opacity="0.70" />

      {/* Wordmark */}
      <text x="175" y="70" fontFamily="-apple-system,'SF Pro Display','Helvetica Neue',sans-serif" fontSize="52" fontWeight="700" fill="#171775">Nova</text>
      <text x="310" y="70" fontFamily="-apple-system,'SF Pro Display','Helvetica Neue',sans-serif" fontSize="52" fontWeight="300" fill="#4f6ef7">lume</text>

      {/* Separator */}
      <line x1="175" y1="85" x2="435" y2="85" stroke="#a0a8b3" strokeWidth="0.8" />

      {/* Tagline */}
      <text x="195" y="105" fontFamily="-apple-system,'SF Pro Text','Helvetica Neue',sans-serif" fontSize="11" fontWeight="400" fill="#8892a4" letterSpacing="3">KNOWLEDGE · ILLUMINATED</text>
    </svg>
  )
}
