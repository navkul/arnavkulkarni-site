import { useId } from 'react';
export default function SettingHelp({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <span className="ct-help">
      <button type="button" aria-label={`About ${label}`} aria-describedby={id}>
        ?
      </button>
      <span id={id} role="tooltip">
        {children}
      </span>
    </span>
  );
}
