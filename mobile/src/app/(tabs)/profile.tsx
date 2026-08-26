import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import { userApi, type UserProfile } from "@/lib/api";
import { Avatar } from "@/components/post-card";

export default function ProfileScreen() {
  const router = useRouter();
  const [me, setMe] = useState<UserProfile | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ display_name: "", bio: "", location: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void userApi
        .me()
        .then((user) => {
          setMe(user);
          setForm({
            display_name: user.display_name ?? "",
            bio: user.bio ?? "",
            location: user.location ?? "",
          });
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load profile"));
    }, []),
  );

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await userApi.update({
        display_name: form.display_name.trim() || null,
        bio: form.bio.trim() || null,
        location: form.location.trim() || null,
      });
      setMe(updated);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save profile");
    } finally {
      setSaving(false);
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
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}>
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Avatar name={me.display_name ?? me.username} size={72} />
        <Text style={styles.name}>{me.display_name ?? me.username}</Text>
        <Text style={styles.username}>@{me.username}</Text>
        {!editing && (
          <>
            {me.location ? <Text style={styles.meta}>{me.location}</Text> : null}
            {me.bio ? <Text style={styles.bio}>{me.bio}</Text> : null}
          </>
        )}
      </View>

      {editing ? (
        <View style={styles.form}>
          <Text style={styles.label}>Display name</Text>
          <TextInput
            style={styles.input}
            value={form.display_name}
            onChangeText={(v) => setForm({ ...form, display_name: v })}
          />
          <Text style={styles.label}>Location</Text>
          <TextInput
            style={styles.input}
            value={form.location}
            onChangeText={(v) => setForm({ ...form, location: v })}
          />
          <Text style={styles.label}>Bio</Text>
          <TextInput
            style={[styles.input, styles.multiline]}
            value={form.bio}
            multiline
            onChangeText={(v) => setForm({ ...form, bio: v })}
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.row}>
            <Pressable style={styles.primaryBtn} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Save</Text>}
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={() => setEditing(false)}>
              <Text style={styles.secondaryBtnText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.form}>
          <Pressable style={styles.secondaryBtn} onPress={() => setEditing(true)}>
            <Text style={styles.secondaryBtnText}>Edit profile</Text>
          </Pressable>
          <Pressable style={styles.settingsBtn} onPress={() => router.push("/settings")}>
            <Ionicons name="settings-outline" size={20} color="#0b1120" />
            <Text style={styles.settingsBtnText}>Settings</Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 24, gap: 24, maxWidth: 560, width: "100%", alignSelf: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  header: { alignItems: "center", gap: 6 },
  name: { fontSize: 22, fontWeight: "800", color: "#0b1120", marginTop: 8 },
  username: { fontSize: 16, color: "#64748b" },
  meta: { fontSize: 15, color: "#94a3b8" },
  bio: { fontSize: 17, color: "#334155", textAlign: "center", marginTop: 6 },
  form: { gap: 10 },
  label: { fontSize: 15, fontWeight: "600", color: "#334155" },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 18,
    color: "#0b1120",
    backgroundColor: "#f8fafc",
  },
  multiline: { minHeight: 90, textAlignVertical: "top" },
  row: { flexDirection: "row", gap: 10, marginTop: 6 },
  primaryBtn: {
    flex: 1,
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 17 },
  secondaryBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryBtnText: { color: "#0b1120", fontWeight: "600", fontSize: 17 },
  settingsBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingVertical: 12,
  },
  settingsBtnText: { color: "#0b1120", fontWeight: "600", fontSize: 17 },
  error: { color: "#dc2626", fontSize: 16 },
});
