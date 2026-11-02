import { useEffect } from 'react';

export function useSpacebar(onTogglePlayPause: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.key !== ' ') return;

      const activeEl = document.activeElement as HTMLElement | null;
      if (activeEl) {
        const tagName = activeEl.tagName.toLowerCase();
        const isInputField =
          tagName === 'input' ||
          tagName === 'textarea' ||
          activeEl.isContentEditable ||
          activeEl.getAttribute('role') === 'textbox';

        if (isInputField) {
          // Allow normal typing inside input/textarea fields
          return;
        }
      }

      // Prevent page scrolling and exclusively toggle room play/pause
      e.preventDefault();
      e.stopPropagation();
      onTogglePlayPause();
    };

    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
    };
  }, [onTogglePlayPause, enabled]);
}

