import { useRef, useState, type ReactNode } from 'react';
import { ACCEPT_ATTR } from '../lib/parsers';

interface Props {
  onFiles: (files: File[]) => void;
  busy?: boolean;
  children?: ReactNode;
  compact?: boolean;
}

export function FileDrop({ onFiles, busy, children, compact }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  return (
    <div
      className={`file-drop${over ? ' over' : ''}${compact ? ' compact' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (e.dataTransfer.files.length) onFiles([...e.dataTransfer.files]);
      }}
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 16V4M7 9l5-5 5 5" />
        <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      </svg>
      <p className="file-drop-title">{busy ? 'Reading file…' : 'Drop a CSV, Excel or JSON file here'}</p>
      <p className="file-drop-sub">.csv, .xlsx, .json and .jsonl supported · nested JSON is flattened into columns</p>
      <div className="file-drop-actions">
        <button type="button" className="btn btn-primary" onClick={() => input.current?.click()} disabled={busy}>
          Choose file
        </button>
        {children}
      </div>
      <input
        ref={input}
        type="file"
        accept={ACCEPT_ATTR}
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files?.length) onFiles([...e.target.files]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
