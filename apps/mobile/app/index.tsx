import { Text, View, StyleSheet } from "react-native";
import { StatusBar } from "expo-status-bar";

export default function HomeScreen(): JSX.Element {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>QuoteSnap</Text>
      <Text style={styles.subtitle}>Voice-to-quote for trade contractors</Text>
      <StatusBar style="auto" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#1a1a1a",
  },
  subtitle: {
    fontSize: 16,
    color: "#666666",
    marginTop: 8,
  },
});
