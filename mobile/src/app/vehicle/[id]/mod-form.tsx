import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import { modApi, vehicleApi } from "@/lib/api";

const CATEGORIES = [
  "Engine", "Suspension", "Brakes", "Wheels & Tires", "Exhaust",
  "Exterior", "Interior", "Audio & Electronics", "Other",
];

const emptyForm = { category: "Other", name: "", brand: "", cost: "", installedDate: "", mileage: "", notes: "" };

export default function ModFormScreen() {
  const { id: vehicleId, modId } = useLocalSearchParams<{ id: string; modId?: string }>();
  const router = useRouter();
  const isEdit = Boolean(modId);
  const [form, setForm] = useState(emptyForm);
  const [loaded, setLoaded] = useState(!isEdit);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!isEdit || !modId || !vehicleId) return;
      void vehicleApi
        .mods(vehicleId)
        .then((mods) => {
          const mod = mods.find((m) => m.id === modId);
          if (!mod) throw new Error("Mod not found");
          setForm({
            category: mod.category,
            name: mod.name,
            brand: mod.brand ?? "",
            cost: mod.cost_cents != null ? String(mod.cost_cents / 100) : "",
            installedDate: mod.installed_date ?? "",
            mileage: mod.mileage != null ? String(mod.mileage) : "",
            notes: mod.notes ?? "",
          });
          setLoaded(true);
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load mod"));
    }, [isEdit, modId, vehicleId]),
  );

  async function save() {
    if (saving) return;
    setError(null);
    if (!form.name.trim()) return setError("Name is required.");
    if (form.installedDate && !/^\d{4}-\d{2}-\d{2}$/.test(form.installedDate))
      return setError("Installed date must be YYYY-MM-DD.");
    setSaving(true);
    const payload = {
      category: form.category,
      name: form.name.trim(),
      brand: form.brand.trim() || null,
      costCents: form.cost ? Math.round(Number(form.cost) * 100) : null,
      installedDate: form.installedDate || null,
      mileage: form.mileage ? Number(form.mileage) : null,
      notes: form.notes.trim() || null,
    };
    try {
      if (isEdit && modId) await modApi.update(modId, payload);
      else if (vehicleId) await modApi.create(vehicleId, payload);
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save mod");
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (!modId) return;
    const doDelete = async () => {
      try {
        await modApi.delete(modId);
        router.back();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't delete mod");
      }
    };
    if (Platform.OS === "web") {
      if (window.confirm("Delete this mod?")) void doDelete();
    } else {
      Alert.alert("Delete this mod?", undefined, [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => void doDelete() },
      ]);
    }
  }

  if (!loaded) {
    return (
      <View style={styles.center}>
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator />}
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: isEdit ? "Edit mod" : "Add mod" }} />

      <Text style={styles.label}>Category</Text>
      <View style={styles.chipWrap}>
        {CATEGORIES.map((category) => (
          <Pressable
            key={category}
            style={[styles.chip, form.category === category && styles.chipActive]}
            onPress={() => setForm({ ...form, category })}
          >
            <Text style={[styles.chipText, form.category === category && styles.chipTextActive]}>
              {category}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Name *</Text>
      <TextInput style={styles.input} value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} />

      <Text style={styles.label}>Brand</Text>
      <TextInput style={styles.input} value={form.brand} onChangeText={(v) => setForm({ ...form, brand: v })} />

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Cost ($)</Text>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            value={form.cost}
            onChangeText={(v) => setForm({ ...form, cost: v.replace(/[^\d.]/g, "") })}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Mileage</Text>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            value={form.mileage}
            onChangeText={(v) => setForm({ ...form, mileage: v.replace(/[^\d]/g, "") })}
          />
        </View>
      </View>

      <Text style={styles.label}>Installed date (YYYY-MM-DD)</Text>
      <TextInput
        style={styles.input}
        value={form.installedDate}
        placeholder="2026-07-31"
        placeholderTextColor="#94a3b8"
        onChangeText={(v) => setForm({ ...form, installedDate: v })}
      />

      <Text style={styles.label}>Notes</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        multiline
        value={form.notes}
        onChangeText={(v) => setForm({ ...form, notes: v })}
      />

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={styles.saveBtn} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : (
          <Text style={styles.saveBtnText}>{isEdit ? "Save changes" : "Add mod"}</Text>
        )}
      </Pressable>
      {isEdit && (
        <Pressable onPress={confirmDelete} style={styles.deleteBtn}>
          <Text style={styles.deleteText}>Delete mod</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16, gap: 8, maxWidth: 560, width: "100%", alignSelf: "center", paddingBottom: 48 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  label: { fontSize: 13, fontWeight: "600", color: "#334155", marginTop: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: "#0b1120",
    backgroundColor: "#f8fafc",
  },
  multiline: { minHeight: 90, textAlignVertical: "top" },
  row: { flexDirection: "row", gap: 10 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#f1f5f9" },
  chipActive: { backgroundColor: "#0b1120" },
  chipText: { fontSize: 13, fontWeight: "600", color: "#475569" },
  chipTextActive: { color: "#fff" },
  saveBtn: { backgroundColor: "#2563eb", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 12 },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  deleteBtn: { alignItems: "center", paddingVertical: 12 },
  deleteText: { color: "#dc2626", fontWeight: "600", fontSize: 15 },
  error: { color: "#dc2626", fontSize: 14, marginTop: 4 },
});
