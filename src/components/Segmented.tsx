export function Segmented({ options, value, onChange, small }: { options: { value: string; label: string }[]; value: string; onChange: (v: string) => void; small?: boolean }) {
  return (
    <div className={`segmented${small ? ' small' : ''}`} role="radiogroup">
      {options.map((o) => (
        <button key={o.value} type="button" role="radio" aria-checked={value === o.value} className={value === o.value ? 'on' : undefined} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
