import React from 'react';

export function InlineSpinner({size = 16, style}: {size?: number; style?: React.CSSProperties}) {
  return (
    <svg
      className="tango-inline-spinner"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      style={{display: 'block', flexShrink: 0, ...style}}
      aria-hidden
    >
      <circle cx="12" cy="12" r="9" strokeDasharray="42 20" />
    </svg>
  );
}
