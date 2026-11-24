import { Link } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { FormError, FormScreen, PrimaryButton, TextField } from '@/components/form';
import { useSession } from '@/lib/auth/session';
import { useCredentialsForm } from '@/lib/auth/use-credentials-form';

export default function SignUpScreen() {
  const { t } = useTranslation();
  const { signUp } = useSession();
  // The address a confirmation link was sent to, once sign-up answered "check your email".
  const [confirmationSentTo, setConfirmationSentTo] = useState<string | null>(null);
  const form = useCredentialsForm(signUp, (result, email) => {
    // `signedIn` needs nothing here: the session changes and the root layout swaps the group.
    if (result.next === 'checkEmail') setConfirmationSentTo(email);
  });

  if (confirmationSentTo !== null) {
    return (
      <FormScreen title={t('auth.checkEmail.title')}>
        <Text style={styles.body}>{t('auth.checkEmail.body', { email: confirmationSentTo })}</Text>
        <View style={styles.footer}>
          <Link href="/sign-in" replace style={styles.link}>
            {t('auth.checkEmail.toSignIn')}
          </Link>
        </View>
      </FormScreen>
    );
  }

  return (
    <FormScreen title={t('auth.signUp.title')}>
      <TextField
        label={t('auth.email')}
        value={form.email}
        onChangeText={form.setEmail}
        keyboardType="email-address"
        autoComplete="email"
        textContentType="emailAddress"
        returnKeyType="next"
      />
      <TextField
        label={t('auth.password')}
        hint={t('auth.signUp.passwordHint')}
        value={form.password}
        onChangeText={form.setPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="go"
        onSubmitEditing={form.submit}
      />
      {form.error ? <FormError>{t(form.error)}</FormError> : null}
      <PrimaryButton
        label={form.submitting ? t('auth.signUp.submitting') : t('auth.signUp.submit')}
        busy={form.submitting}
        onPress={form.submit}
      />
      <View style={styles.footer}>
        <Link href="/sign-in" replace style={styles.link}>
          {t('auth.signUp.toSignIn')}
        </Link>
      </View>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  body: { color: '#111111', fontSize: 16, lineHeight: 24 },
  footer: { alignItems: 'center' },
  link: { color: '#1a6fc4', fontSize: 15, paddingVertical: 12 },
});
