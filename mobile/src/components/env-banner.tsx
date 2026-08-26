import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { API_BASE, IS_PROD_API } from "@/lib/api";

/** Thin orange strip at the very top whenever the app is NOT talking to production. */
export function EnvBanner() {
  const insets = useSafeAreaInsets();
  if (IS_PROD_API) return null;
  const host = API_BASE.replace(/^https?:\/\//, "");
  return (
    <View style={[styles.bar, { paddingTop: insets.top }]}>
      <Text style={styles.text}>DEV · {host}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: "#f59e0b", alignItems: "center", paddingBottom: 3 },
  text: { color: "#0b1120", fontSize: 12, fontWeight: "800", letterSpacing: 1 },
});
