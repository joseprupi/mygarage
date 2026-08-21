import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";

import { API_BASE, setToken, type TokenResponse } from "@/lib/api";

export default function SignupScreen() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", username: "", password: "", displayName: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/auth/signup`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: form.email.trim().toLowerCase(),
          username: form.username.trim().toLowerCase(),
          password: form.password,
          display_name: form.displayName.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(typeof body?.detail === "string" ? body.detail : "Sign-up failed");
      }
      const data = (await res.json()) as TokenResponse;
      await setToken(data.accessToken);
      router.dismissAll();
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign-up failed");
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={styles.card}>
        <Text style={styles.brand}>Join CeCeCar</Text>
        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
          keyboardType="email-address"
          value={form.email}
          onChangeText={(v) => setForm({ ...form, email: v })}
        />
        <TextInput
          style={styles.input}
          placeholder="Username"
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
          value={form.username}
          onChangeText={(v) => setForm({ ...form, username: v })}
        />
        <TextInput
          style={styles.input}
          placeholder="Display name (optional)"
          placeholderTextColor="#94a3b8"
          value={form.displayName}
          onChangeText={(v) => setForm({ ...form, displayName: v })}
        />
        <TextInput
          style={styles.input}
          placeholder="Password (min 8 characters)"
          placeholderTextColor="#94a3b8"
          secureTextEntry
          value={form.password}
          onChangeText={(v) => setForm({ ...form, password: v })}
          onSubmitEditing={submit}
        />
        {error && <Text style={styles.error}>{error}</Text>}
        <Pressable style={styles.button} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Create account</Text>}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", backgroundColor: "#fff", padding: 24 },
  card: { width: "100%", maxWidth: 420, alignSelf: "center", gap: 12 },
  brand: { fontSize: 26, fontWeight: "800", color: "#0b1120", textAlign: "center", marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 18,
    color: "#0b1120",
    backgroundColor: "#f8fafc",
  },
  error: { color: "#dc2626", fontSize: 16 },
  button: { backgroundColor: "#2563eb", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  buttonText: { color: "#fff", fontSize: 18, fontWeight: "700" },
});
