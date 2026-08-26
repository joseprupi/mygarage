import { useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

import { authApiExtra } from "@/lib/api";

export default function ChangePasswordScreen() {
  const { hasPassword } = useLocalSearchParams<{ hasPassword?: string }>();
  const needsCurrent = hasPassword === "true";
  const router = useRouter();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (next.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSaving(true);
    try {
      await authApiExtra.changePassword(needsCurrent ? current : undefined, next);
      Alert.alert("Password saved", undefined, [{ text: "OK", onPress: () => router.back() }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save password");
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={88}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {!needsCurrent && (
          <Text style={styles.helper}>
            You signed in with Google or Apple. Set a password to also log in with email.
          </Text>
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {needsCurrent && (
          <View style={styles.field}>
            <Text style={styles.label}>Current password</Text>
            <TextInput
              style={styles.input}
              secureTextEntry
              value={current}
              onChangeText={setCurrent}
              autoComplete="password"
              autoCorrect={false}
              placeholderTextColor="#94a3b8"
            />
          </View>
        )}

        <View style={styles.field}>
          <Text style={styles.label}>New password</Text>
          <TextInput
            style={styles.input}
            secureTextEntry
            value={next}
            onChangeText={setNext}
            autoComplete="new-password"
            autoCorrect={false}
            placeholderTextColor="#94a3b8"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Confirm new password</Text>
          <TextInput
            style={styles.input}
            secureTextEntry
            value={confirm}
            onChangeText={setConfirm}
            autoComplete="new-password"
            autoCorrect={false}
            placeholderTextColor="#94a3b8"
          />
        </View>

        <Pressable
          style={[styles.saveBtn, saving && { opacity: 0.6 }]}
          onPress={save}
          disabled={saving}
        >
          <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save"}</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  content: { padding: 20, gap: 12, maxWidth: 560, width: "100%", alignSelf: "center" },
  helper: { fontSize: 15, color: "#64748b", lineHeight: 22, marginBottom: 4 },
  error: { fontSize: 14, color: "#dc2626", marginBottom: 4 },
  field: { gap: 4 },
  label: { fontSize: 15, fontWeight: "600", color: "#0b1120" },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#0b1120",
    backgroundColor: "#fff",
  },
  saveBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
