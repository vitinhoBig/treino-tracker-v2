import { StyleSheet, Text, View } from 'react-native';

export default function HelloScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hello, treino-tracker</Text>
      <Text style={styles.date}>{new Date().toLocaleDateString()}</Text>
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
