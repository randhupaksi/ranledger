import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";

const EMPTY_VALUE = "__ranledger_empty_select_value__";

export type SelectOption = {
  value: string;
  label: ReactNode;
  textValue?: string;
};

export function SelectField({
  id,
  value,
  onValueChange,
  options,
  placeholder = "Pilih opsi",
  disabled = false,
  required = false,
  className = "",
  "aria-label": ariaLabel,
}: {
  id?: string;
  value: string;
  onValueChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const [open, setOpen] = useState(false);
  const pointerDownRef = useRef({ wasOpen: false, pointerType: "" });
  const selectableOptions = required
    ? options.filter((option) => option.value !== "")
    : options;
  const selectedValue = value === "" ? (required ? "" : EMPTY_VALUE) : value;

  return (
    <SelectPrimitive.Root
      open={open}
      onOpenChange={setOpen}
      value={selectedValue}
      onValueChange={(nextValue) =>
        onValueChange(nextValue === EMPTY_VALUE ? "" : nextValue)
      }
      disabled={disabled}
      required={required}
    >
      <SelectPrimitive.Trigger
        id={id}
        className={`radix-select-trigger ${className}`.trim()}
        aria-label={ariaLabel}
        onPointerDown={(event) => {
          const isPrimaryPress = event.button === 0 && !event.ctrlKey;
          pointerDownRef.current = {
            wasOpen: open && isPrimaryPress,
            pointerType: event.pointerType,
          };

          if (open && isPrimaryPress && event.pointerType === "mouse") {
            event.preventDefault();
            setOpen(false);
          }
        }}
        onClick={(event) => {
          const { wasOpen, pointerType } = pointerDownRef.current;
          pointerDownRef.current = { wasOpen: false, pointerType: "" };

          if (wasOpen && event.detail > 0) {
            event.preventDefault();
            if (pointerType !== "mouse") setOpen(false);
          }
        }}
        onKeyDown={(event) => {
          const isOpenKey = ["Enter", " ", "ArrowDown", "ArrowUp"].includes(
            event.key,
          );
          if (
            open &&
            isOpenKey &&
            !event.altKey &&
            !event.ctrlKey &&
            !event.metaKey
          ) {
            event.preventDefault();
            setOpen(false);
          }
        }}
      >
        <SelectPrimitive.Value
          className="radix-select-value"
          placeholder={placeholder}
        />
        <SelectPrimitive.Icon asChild>
          <ChevronDown
            className="radix-select-icon"
            size={15}
            aria-hidden="true"
          />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          className="radix-select-content"
          position="popper"
          sideOffset={4}
        >
          <SelectPrimitive.ScrollUpButton className="radix-select-scroll-button">
            <ChevronUp size={14} aria-hidden="true" />
          </SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="radix-select-viewport">
            {selectableOptions.length ? (
              selectableOptions.map((option) => {
                const optionValue = option.value || EMPTY_VALUE;
                return (
                  <SelectPrimitive.Item
                    key={option.value}
                    className="radix-select-item"
                    value={optionValue}
                    textValue={option.textValue}
                  >
                    <SelectPrimitive.ItemText>
                      {option.label}
                    </SelectPrimitive.ItemText>
                    <SelectPrimitive.ItemIndicator className="radix-select-item-indicator">
                      <Check size={14} aria-hidden="true" />
                    </SelectPrimitive.ItemIndicator>
                  </SelectPrimitive.Item>
                );
              })
            ) : (
              <SelectPrimitive.Item
                className="radix-select-item"
                value={EMPTY_VALUE}
                textValue={placeholder}
                disabled
              >
                <SelectPrimitive.ItemText>
                  {placeholder}
                </SelectPrimitive.ItemText>
              </SelectPrimitive.Item>
            )}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="radix-select-scroll-button">
            <ChevronDown size={14} aria-hidden="true" />
          </SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
