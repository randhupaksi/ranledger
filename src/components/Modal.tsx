import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import {
  createContext,
  useCallback,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

export const ModalPopoverContainerContext = createContext<HTMLElement | null>(
  null,
);

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  busy = false,
  wide = false,
  initialFocus,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description: string;
  children: ReactNode;
  busy?: boolean;
  wide?: boolean;
  initialFocus?: RefObject<HTMLElement | null>;
}) {
  const [popupElement, setPopupElement] = useState<HTMLDivElement | null>(null);
  const setPopupRef = useCallback((element: HTMLDivElement | null) => {
    setPopupElement(element);
  }, []);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!value && !busy) onClose();
      }}
      disablePointerDismissal
    >
      <Dialog.Portal>
        <Dialog.Backdrop className="modal-backdrop" />
        <Dialog.Popup
          ref={setPopupRef}
          className={`modal ${wide ? "modal-wide" : ""}`}
          initialFocus={initialFocus}
        >
          <div className="modal-header">
            <div>
              <Dialog.Title className="modal-title">{title}</Dialog.Title>
              <Dialog.Description className="modal-description">
                {description}
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="icon-button"
              aria-label="Tutup dialog"
              disabled={busy}
            >
              <X size={20} />
            </Dialog.Close>
          </div>
          <ModalPopoverContainerContext.Provider value={popupElement}>
            {children}
          </ModalPopoverContainerContext.Provider>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
