import { forwardRef, useEffect, useState, type FocusEvent } from 'react';
import { TextArea, type TextAreaProps } from '../../../components/ui/TextArea';
import { TextInput, type TextInputProps } from '../../../components/ui/TextInput';

export interface Draft {
  /** Value to render: the local draft while focused, the external value otherwise. */
  value: string;
  setDraft: (value: string) => void;
  onFocus: () => void;
  onBlur: () => void;
}

/**
 * Text being typed stays local while the field is focused, so a late save response that echoes an
 * older value (autosave round trip) never rewrites what the user is typing.
 */
export function useDraft(external: string): Draft {
  const [draft, setDraft] = useState(external);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(external);
  }, [external, focused]);
  return {
    value: focused ? draft : external,
    setDraft,
    onFocus: () => {
      setDraft(external);
      setFocused(true);
    },
    onBlur: () => setFocused(false),
  };
}

export interface DraftTextInputProps extends Omit<TextInputProps, 'value' | 'onChange'> {
  value: string;
  onValueChange: (value: string) => void;
}

/** TextInput whose text is protected from external echoes while focused. */
export const DraftTextInput = forwardRef<HTMLInputElement, DraftTextInputProps>(function DraftTextInput(
  { value, onValueChange, onFocus, onBlur, ...rest },
  ref,
) {
  const draft = useDraft(value);
  return (
    <TextInput
      ref={ref}
      {...rest}
      value={draft.value}
      onFocus={(e: FocusEvent<HTMLInputElement>) => {
        draft.onFocus();
        onFocus?.(e);
      }}
      onBlur={(e: FocusEvent<HTMLInputElement>) => {
        draft.onBlur();
        onBlur?.(e);
      }}
      onValueChange={(v) => {
        draft.setDraft(v);
        onValueChange(v);
      }}
    />
  );
});

export interface DraftTextAreaProps extends Omit<TextAreaProps, 'value' | 'onChange'> {
  value: string;
  onValueChange: (value: string) => void;
}

/** TextArea whose text is protected from external echoes while focused. */
export const DraftTextArea = forwardRef<HTMLTextAreaElement, DraftTextAreaProps>(function DraftTextArea(
  { value, onValueChange, onFocus, onBlur, ...rest },
  ref,
) {
  const draft = useDraft(value);
  return (
    <TextArea
      ref={ref}
      {...rest}
      value={draft.value}
      onFocus={(e: FocusEvent<HTMLTextAreaElement>) => {
        draft.onFocus();
        onFocus?.(e);
      }}
      onBlur={(e: FocusEvent<HTMLTextAreaElement>) => {
        draft.onBlur();
        onBlur?.(e);
      }}
      onValueChange={(v) => {
        draft.setDraft(v);
        onValueChange(v);
      }}
    />
  );
});
