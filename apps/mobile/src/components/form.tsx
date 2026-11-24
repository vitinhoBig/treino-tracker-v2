// The few building blocks the sign-in and sign-up forms share.
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

/** A white screen with a title and room for the keyboard, for a form. */
export function FormScreen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.screenContent}
      keyboardShouldPersistTaps="handled"
      automaticallyAdjustKeyboardInsets
    >
      <Text role="heading" style={styles.title}>
        {title}
      </Text>
      {children}
    </ScrollView>
  );
}

export function TextField({ label, hint, ...inputProps }: { label: string; hint?: string } & TextInputProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={styles.input}
        placeholderTextColor="#888888"
        autoCapitalize="none"
        autoCorrect={false}
        {...inputProps}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export function PrimaryButton({
  label,
  onPress,
  busy = false,
}: {
  label: string;
  onPress: () => void;
  /** While true the button ignores presses, so a slow request can't be sent twice. */
  busy?: boolean;
}) {
  return (
    <Pressable
      role="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy, busy }}
      disabled={busy}
      onPress={onPress}
      style={[styles.button, busy && styles.buttonBusy]}
    >
      <Text style={styles.buttonText}>{label}</Text>
    </Pressable>
  );
}

export function LinkButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable role="button" accessibilityLabel={label} onPress={onPress} style={styles.link}>
      <Text style={styles.linkText}>{label}</Text>
    </Pressable>
  );
}

/** A message the user must read, announced by screen readers as soon as it appears. */
export function FormError({ children }: { children: ReactNode }) {
  return (
    <Text role="alert" accessibilityLiveRegion="polite" style={styles.error}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  screen: { backgroundColor: '#ffffff', flex: 1 },
  screenContent: { gap: 16, justifyContent: 'center', flexGrow: 1, padding: 24 },
  title: { color: '#111111', fontSize: 28, fontWeight: '700' },
  field: { gap: 6 },
  label: { color: '#111111', fontSize: 14, fontWeight: '600' },
  input: {
    borderColor: '#c9c9c9',
    borderRadius: 8,
    borderWidth: 1,
    color: '#111111',
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  hint: { color: '#555555', fontSize: 13 },
  button: {
    alignItems: 'center',
    backgroundColor: '#208AEF',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonBusy: { opacity: 0.6 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
  link: { alignItems: 'center', minHeight: 44, justifyContent: 'center' },
  linkText: { color: '#1a6fc4', fontSize: 15 },
  error: { color: '#b3261e', fontSize: 14 },
});
