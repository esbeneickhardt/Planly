import { useState, useRef, type ReactNode } from 'react';

interface Props {
  content: string;
  children: ReactNode;
  side?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

export default function Tooltip({ content, children, side = 'top', delay = 350 }: Props) {
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  function show() {
    timer.current = setTimeout(() => setVisible(true), delay);
  }
  function hide() {
    clearTimeout(timer.current);
    setVisible(false);
  }

  const posStyle: React.CSSProperties =
    side === 'top'    ? { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 6 } :
    side === 'bottom' ? { top: '100%',    left: '50%', transform: 'translateX(-50%)', marginTop: 6 } :
    side === 'left'   ? { right: '100%',  top: '50%',  transform: 'translateY(-50%)', marginRight: 6 } :
                        { left: '100%',   top: '50%',  transform: 'translateY(-50%)', marginLeft: 6 };

  return (
    <div className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {visible && (
        <div
          className="absolute z-[9999] pointer-events-none whitespace-nowrap rounded-md px-2 py-1 text-[11px] font-medium leading-tight"
          style={{
            ...posStyle,
            background: 'var(--text)',
            color: 'var(--surface)',
            opacity: 0.93,
            boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          }}
        >
          {content}
        </div>
      )}
    </div>
  );
}
