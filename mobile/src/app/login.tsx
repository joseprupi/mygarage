import { useEffect, useState } from "react";
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
import * as AppleAuthentication from "expo-apple-authentication";

import { authApi, googleAuthApi, appleAuthApi } from "@/lib/api";
import { isGoogleSignInAvailable, signInWithGoogle } from "@/lib/google-signin";

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const googleAvailable = isGoogleSignInAvailable();
  const [appleAvailable, setAppleAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS === "ios") {
      AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
    }
  }, []);

  async function apple() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      const { identityToken, fullName } = credential;
      if (!identityToken) {
        setBusy(false);
        return;
      }
      const fullNameStr =
        [fullName?.givenName, fullName?.familyName].filter(Boolean).join(" ") || null;
      await appleAuthApi.login(identityToken, fullNameStr);
      router.replace("/");
    } catch (err: unknown) {
      // ERR_REQUEST_CANCELED means user dismissed — don't show an error
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code: string }).code === "ERR_REQUEST_CANCELED"
      ) {
        setBusy(false);
        return;
      }
      setError(err instanceof Error ? err.message : "Apple sign-in failed");
      setBusy(false);
    }
  }

  async function google() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const idToken = await signInWithGoogle();
      if (!idToken) {
        setBusy(false);
        return; // cancelled
      }
      await googleAuthApi.login(idToken);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
      setBusy(false);
    }
  }

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await authApi.login(email.trim().toLowerCase(), password);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to log in");
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.card}>
        <Text style={styles.brand}>CarFable</Text>
        <Text style={styles.subtitle}>Your car&apos;s life, in one place.</Text>

        <TextInput
          style={styles.input}
          placeholder="Email"
          placeholderTextColor="#94a3b8"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#94a3b8"
          secureTextEntry
          autoComplete="current-password"
          value={password}
          onChangeText={setPassword}
          onSubmitEditing={submit}
        />

        {error && <Text style={styles.error}>{error}</Text>}

        <Pressable
          style={({ pressed }) => [styles.button, (pressed || busy) && styles.buttonPressed]}
          onPress={submit}
          disabled={busy}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Log in</Text>
          )}
        </Pressable>
        {googleAvailable && (
          <Pressable style={styles.googleBtn} onPress={google} disabled={busy}>
            <Text style={styles.googleBtnText}>Continue with Google</Text>
          </Pressable>
        )}
        {Platform.OS === "ios" && appleAvailable && (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={12}
            style={styles.appleBtn}
            onPress={apple}
          />
        )}
        <Pressable onPress={() => router.push("/signup")} hitSlop={8}>
          <Text style={styles.signupLink}>New here? Create an account</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: "center", backgroundColor: "#fff", padding: 24 },
  card: { width: "100%", maxWidth: 420, alignSelf: "center", gap: 12 },
  brand: { fontSize: 32, fontWeight: "800", color: "#0b1120", textAlign: "center" },
  subtitle: { fontSize: 17, color: "#64748b", textAlign: "center", marginBottom: 16 },
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
  button: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  buttonPressed: { opacity: 0.7 },
  buttonText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  googleBtn: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 8,
  },
  googleBtnText: { color: "#0b1120", fontSize: 17, fontWeight: "600" },
  appleBtn: {
    width: "100%",
    height: 48,
    marginTop: 8,
  },
  signupLink: { color: "#2563eb", fontSize: 16, fontWeight: "600", textAlign: "center", marginTop: 12 },
});
