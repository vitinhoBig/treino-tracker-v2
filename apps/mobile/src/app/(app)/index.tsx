import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

import { LinkButton, FormError } from '@/components/form';
import { useMe } from '@/lib/api/use-me';
import { useSession } from '@/lib/auth/session';

export default function HomeScreen() {
  const { t, i18n } = useTranslation();
  const date = new Date().toLocaleDateString(i18n.language);
  const { signOut } = useSession();
  const me = useMe();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('hello.title')}</Text>
      <Text style={styles.date}>{t('hello.today', { date })}</Text>

      {me.isPending ? <Text style={styles.detail}>{t('home.loading')}</Text> : null}
      {me.isError ? (
        <>
          <FormError>{t('home.error')}</FormError>
          <LinkButton label={t('home.retry')} onPress={() => void me.refetch()} />
        </>
      ) : null}
      {me.data ? (
        <Text style={styles.detail} selectable>
          {t('home.accountId')}: {me.data.id}
        </Text>
      ) : null}

      <LinkButton label={t('home.signOut')} onPress={() => void signOut()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    gap: 8,
    padding: 24,
  },
  title: {
    color: '#111111',
    fontSize: 24,
    fontWeight: '600',
  },
  date: {
    color: '#555555',
    fontSize: 16,
  },
  detail: {
    color: '#555555',
    fontSize: 14,
    marginTop: 16,
  },
});
