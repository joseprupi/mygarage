import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";

import { authApi, userApi, type UserProfile, type UserSettings } from "@/lib/api";

export default function SettingsScreen() {
  const router = useRouter();
  const [me, setMe] = useState<UserProfile | null>(null);
  const [settings, setSettings] = useState<UserSettings>({
    detectMissedFillups: true,
    includeEstimatedFuel: true,
  });
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void userApi
        .me()
        .then((user) => {
          setMe(user);
          if (user.settings) setSettings(user.settings);
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load settings"));
    }, []),
  );

  async function toggleSetting<K extends keyof UserSettings>(key: K, value: UserSettings[K]) {
    const prev = settings[key];
    // Optimistic update
    setSettings((s) => ({ ...s, [key]: value }));
    try {
      const updated = await userApi.updateSettings({ [key]: value });
      if (updated.settings) setSettings(updated.settings);
    } catch (err) {
      // Revert on error
      setSettings((s) => ({ ...s, [key]: prev }));
      setError(err instanceof Error ? err.message : "Couldn't save setting");
    }
  }

  async function logout() {
    const doLogout = async () => {
      await authApi.logout();
      router.replace("/login");
    };
    if (Platform.OS === "web") {
      void doLogout();
    } else {
      Alert.alert("Log out?", undefined, [
        { text: "Cancel", style: "cancel" },
        { text: "Log out", style: "destructive", onPress: () => void doLogout() },
      ]);
    }
  }

  if (!me) {
    return (
      <View style={styles.center}>
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator />}
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.sectionHeader}>Fuel</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>Detect missed fill-ups</Text>
            <Text style={styles.rowSub}>
              Flags tanks whose MPG is far above your usual and estimates the missing fill-up
            </Text>
          </View>
          <Switch
            value={settings.detectMissedFillups}
            onValueChange={(v) => void toggleSetting("detectMissedFillups", v)}
            trackColor={{ false: "#e2e8f0", true: "#2563eb" }}
            thumbColor="#fff"
          />
        </View>
        <View style={styles.divider} />
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowLabel}>Include estimates in fuel totals</Text>
          </View>
          <Switch
            value={settings.includeEstimatedFuel}
            onValueChange={(v) => void toggleSetting("includeEstimatedFuel", v)}
            trackColor={{ false: "#e2e8f0", true: "#2563eb" }}
            thumbColor="#fff"
          />
        </View>
      </View>

      <Text style={styles.sectionHeader}>Account</Text>
      <View style={styles.card}>
        <Pressable
          onPress={() =>
            router.push(
              `/change-password?hasPassword=${me?.has_password === true ? "true" : "false"}`,
            )
          }
        >
          <Text style={styles.linkBtn}>
            {me?.has_password === false ? "Set a password" : "Change password"}
          </Text>
        </Pressable>
        <View style={styles.divider} />
        <Text style={styles.logoutBtn} onPress={logout}>
          Log out
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  content: { padding: 20, gap: 8, maxWidth: 560, width: "100%", alignSelf: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  sectionHeader: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 12,
    marginBottom: 4,
    marginLeft: 4,
  },
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { fontSize: 16, fontWeight: "500", color: "#0b1120" },
  rowSub: { fontSize: 13, color: "#64748b", lineHeight: 18 },
  divider: { height: 1, backgroundColor: "#f1f5f9", marginHorizontal: 16 },
  linkBtn: {
    color: "#2563eb",
    fontWeight: "600",
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  logoutBtn: {
    color: "#dc2626",
    fontWeight: "600",
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  error: { color: "#dc2626", fontSize: 14, marginBottom: 8 },
});
