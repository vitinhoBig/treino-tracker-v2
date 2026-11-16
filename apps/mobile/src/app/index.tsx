import { useTranslation } from 'react-i18next';
import { StyleSheet, Text, View } from 'react-native';

export default function HelloScreen() {
  const { t, i18n } = useTranslation();
  const date = new Date().toLocaleDateString(i18n.language);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('hello.title')}</Text>
      <Text style={styles.date}>{t('hello.today', { date })}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  title: {
    color: '#111111',
    fontSize: 24,
    fontWeight: '600',
  },
  date: {
    color: '#555555',
    fontSize: 16, 
    marginTop: 8,
  },
});
