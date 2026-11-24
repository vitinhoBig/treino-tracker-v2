import { Link } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { StyleSheet, View } from 'react-native';

import { FormError, FormScreen, PrimaryButton, TextField } from '@/components/form';
import { useSession } from '@/lib/auth/session';
import { useCredentialsForm } from '@/lib/auth/use-credentials-form';

export default function SignInScreen() {
  const { t } = useTranslation();
  const { signIn } = useSession();
  // Nothing to do after success: the session changes, and the root layout swaps this group for the app.
  const form = useCredentialsForm(signIn);

  return (
    <FormScreen title={t('auth.signIn.title')}>
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
        value={form.password}
        onChangeText={form.setPassword}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        returnKeyType="go"
        onSubmitEditing={form.submit}
      />
      {form.error ? <FormError>{t(form.error)}</FormError> : null}
      <PrimaryButton
        label={form.submitting ? t('auth.signIn.submitting') : t('auth.signIn.submit')}
        busy={form.submitting}
        onPress={form.submit}
      />
      <View style={styles.footer}>
        <Link href="/sign-up" style={styles.link}>
          {t('auth.signIn.toSignUp')}
        </Link>
      </View>
    </FormScreen>
  );
}

const styles = StyleSheet.create({
  footer: { alignItems: 'center' },
  link: { color: '#1a6fc4', fontSize: 15, paddingVertical: 12 },
});
