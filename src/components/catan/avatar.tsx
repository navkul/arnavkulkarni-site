import Image from 'next/image';
export function PlayerAvatar({
  name,
  src,
  color = '#557b86',
  size = 40,
}: {
  name: string;
  src?: string;
  color?: string;
  size?: number;
}) {
  return (
    <span
      className="ct-player-avatar"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: '50%',
        overflow: 'hidden',
        background: color,
        color: '#fff',
        boxShadow: 'inset 0 0 0 2px #ffffff80',
        fontWeight: 700,
        fontSize: Math.max(12, size * 0.35),
      }}
    >
      {src ? (
        <Image
          src={src}
          alt={`${name}'s profile picture`}
          width={size}
          height={size}
          unoptimized
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <span aria-hidden="true">
          {name
            .split(/\s+/)
            .map((part) => part[0])
            .slice(0, 2)
            .join('')
            .toUpperCase() || '♟'}
        </span>
      )}
    </span>
  );
}
