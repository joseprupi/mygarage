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

import { authApi, authApiExtra } from "@/lib/api";

export default function DeleteAccountScreen() {
  const { hasPassword } = useLocalSearchParams<{ hasPassword?: string }>();
  const needsPassword = hasPassword === "true";
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    confirmText === "DELETE" && (!needsPassword || password.length > 0) && !deleting;

  function handleDelete() {
    Alert.alert(
      "Delete account?",
      "This cannot be undone. All your vehicles, history, and posts will be permanently deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete my account",
          style: "destructive",
          onPress: () => void doDelete(),
        },
      ],
    );
  }

  async function doDelete() {
    setError(null);
    setDeleting(true);
    try {
      await authApiExtra.deleteAccount({
        ...(needsPassword ? { password } : {}),
        confirm: "DELETE",
      });
      // Clear token (reuse logout path)
      await authApi.logout();
      router.replace("/login");
      Alert.alert("Account deleted", "Your account has been permanently deleted.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Couldn't delete account";
      setError(msg === "Wrong password" ? "Wrong password" : msg);
      setDeleting(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={88}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.warningBox}>
          <Text style={styles.warningTitle}>What gets deleted</Text>
          <Text style={styles.warningBody}>
            Your account, your vehicles and their full history, receipts, posts and comments are
            permanently deleted. Vehicles you transferred to others keep their history; your name is
            removed from them.
          </Text>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {needsPassword && (
          <View style={styles.field}>
            <Text style={styles.label}>Password</Text>
            <TextInput
              style={styles.input}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
              autoComplete="password"
              autoCorrect={false}
              placeholder="Enter your password"
              placeholderTextColor="#94a3b8"
            />
          </View>
        )}

        <View style={styles.field}>
          <Text style={styles.label}>
            Type <Text style={styles.deleteWord}>DELETE</Text> to confirm
          </Text>
          <TextInput
            style={styles.input}
            value={confirmText}
            onChangeText={setConfirmText}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="DELETE"
            placeholderTextColor="#94a3b8"
          />
        </View>

        <Pressable
          style={[styles.deleteBtn, !canSubmit && styles.deleteBtnDisabled]}
          onPress={handleDelete}
          disabled={!canSubmit}
        >
          <Text style={styles.deleteBtnText}>
            {deleting ? "Deleting…" : "Delete my account"}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  content: { padding: 20, gap: 16, maxWidth: 560, width: "100%", alignSelf: "center" },
  warningBox: {
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  warningTitle: { fontSize: 15, fontWeight: "700", color: "#991b1b" },
  warningBody: { fontSize: 14, color: "#7f1d1d", lineHeight: 20 },
  error: { fontSize: 14, color: "#dc2626" },
  field: { gap: 4 },
  label: { fontSize: 15, fontWeight: "600", color: "#0b1120" },
  deleteWord: { fontFamily: Platform.OS === "ios" ? "Courier" : "monospace", color: "#dc2626" },
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
  deleteBtn: {
    backgroundColor: "#dc2626",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  deleteBtnDisabled: { opacity: 0.4 },
  deleteBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
