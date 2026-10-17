import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import type { ReactNode } from "react";

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
  const selectableOptions = required
    ? options.filter((option) => option.value !== "")
    : options;
  const selectedValue = value === "" ? (required ? "" : EMPTY_VALUE) : value;

  return (
    <SelectPrimitive.Root
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
