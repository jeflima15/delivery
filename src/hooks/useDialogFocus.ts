import { useEffect, useRef, type RefObject } from 'react';

const focusableSelector = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export function useDialogFocus(
  isOpen: boolean,
  dialogRef: RefObject<HTMLElement | null>,
  onClose: () => void,
) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const previouslyFocused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const bodyChild = dialog.closest('body > *') as HTMLElement | null;
    const hiddenSiblings = Array.from(document.body.children)
      .filter((child): child is HTMLElement => child instanceof HTMLElement
        && child !== bodyChild
        && !child.hasAttribute('data-dialog-exempt'))
      .map((element) => ({
        element,
        inert: element.inert,
        ariaHidden: element.getAttribute('aria-hidden'),
      }));

    hiddenSiblings.forEach(({ element }) => {
      element.inert = true;
      element.setAttribute('aria-hidden', 'true');
    });

    const focusInitialElement = () => {
      const preferred = dialog.querySelector<HTMLElement>('[data-dialog-autofocus]');
      const first = dialog.querySelector<HTMLElement>(focusableSelector);
      (preferred || first || dialog).focus({ preventScroll: true });
    };
    const focusTimer = window.setTimeout(focusInitialElement, 0);

    const isTopmostDialog = () => {
      const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'));
      return dialogs.at(-1) === dialog;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopmostDialog()) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', handleKeyDown);
      hiddenSiblings.forEach(({ element, inert, ariaHidden }) => {
        element.inert = inert;
        if (ariaHidden == null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', ariaHidden);
      });
      document.body.style.overflow = previousBodyOverflow;
      if (previouslyFocused?.isConnected) previouslyFocused.focus({ preventScroll: true });
    };
  }, [dialogRef, isOpen]);
}
