import { StyleSheet, Text, View } from 'react-native';

// TODO(victor): Show today's date under the title, formatted for the device's language.
// Hint: `new Date().toLocaleDateString()` returns a string you can render in a second <Text>.
// Then extend src/__tests__/hello-screen.test.tsx. Use a regex or a fixed clock, because the date changes daily.
export default function HelloScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hello, treino-tracker</Text>
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
});
