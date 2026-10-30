interface LogoProps {
  size?: number | string;
  className?: string;
  barColor?: string;
  withBackground?: boolean;
}

export function Logo({
  size = 32,
  className = '',
  barColor = '#fde5b7',
  withBackground = true,
}: LogoProps) {
  const dimension = typeof size === 'number' ? `${size}px` : size;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      style={{ width: dimension, height: dimension }}
      className={`shrink-0 select-none ${className}`}
    >
      {withBackground && (
        <rect width="64" height="64" rx="16" fill="#171719" />
      )}
      {/* Symmetrical Minimalist Soundwave "V" */}
      <rect x="11.5" y="15" width="5" height="26" rx="2.5" fill={barColor} />
      <rect x="20.5" y="21" width="5" height="24" rx="2.5" fill={barColor} />
      <rect x="29.5" y="27" width="5" height="22" rx="2.5" fill={barColor} />
      <rect x="38.5" y="21" width="5" height="24" rx="2.5" fill={barColor} />
      <rect x="47.5" y="15" width="5" height="26" rx="2.5" fill={barColor} />
    </svg>
  );
}
