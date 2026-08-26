import { useCallback, useState } from "react";
import {
  ActivityIndicator,
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
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";

import { ownershipApi, vehicleApi, type VehicleOwnership } from "@/lib/api";
import { formatDate } from "@/lib/events";

type FormMode = "none" | "add" | { edit: VehicleOwnership };

const EMPTY_FORM = {
  label: "",
  startDate: "",
  startMileage: "",
  endDate: "",
  endMileage: "",
};


export default function OwnershipScreen() {
  const { id: vehicleId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [ownerships, setOwnerships] = useState<VehicleOwnership[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formMode, setFormMode] = useState<FormMode>("none");
  const [form, setForm] = useState(EMPTY_FORM);

  const load = useCallback(async () => {
    if (!vehicleId) return;
    setLoading(true);
    try {
      const own = await ownershipApi.list(vehicleId);
      setOwnerships(own);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load ownerships");
    } finally {
      setLoading(false);
    }
  }, [vehicleId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function startAdd() {
    const currentPeriod = ownerships.find((o) => o.isCurrent);
    setForm({
      ...EMPTY_FORM,
      label: "Previous owner",
      endDate: currentPeriod?.startDate ?? new Date().toISOString().slice(0, 10),
    });
    setFormMode("add");
    setError(null);
  }

  function startEdit(o: VehicleOwnership) {
    setForm({
      label: o.label ?? "",
      startDate: o.startDate ?? "",
      startMileage: o.startMileage != null ? String(o.startMileage) : "",
      endDate: o.endDate ?? "",
      endMileage: o.endMileage != null ? String(o.endMileage) : "",
    });
    setFormMode({ edit: o });
    setError(null);
  }

  function cancelForm() {
    setFormMode("none");
    setError(null);
  }

  async function saveAdd() {
    if (saving || !vehicleId) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.startDate)) {
      return setError("Start date must be YYYY-MM-DD");
    }
    setSaving(true);
    setError(null);
    try {
      await ownershipApi.create(vehicleId, {
        label: form.label.trim() || null,
        startDate: form.startDate,
        startMileage: form.startMileage ? Number(form.startMileage) : null,
        endDate: form.endDate || null,
        endMileage: form.endMileage ? Number(form.endMileage) : null,
      });
      setFormMode("none");
      await load();
      // Reload vehicle so purchase_date/mileage sync shows
      if (vehicleId) await vehicleApi.get(vehicleId).catch(() => null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save ownership period");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit(o: VehicleOwnership) {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      if (o.isCurrent) {
        // For the current period: only allow editing startDate and startMileage
        await ownershipApi.update(o.id, {
          startDate: form.startDate || undefined,
          startMileage: form.startMileage ? Number(form.startMileage) : null,
        });
      } else {
        if (form.startDate && !/^\d{4}-\d{2}-\d{2}$/.test(form.startDate)) {
          setSaving(false);
          return setError("Start date must be YYYY-MM-DD");
        }
        await ownershipApi.update(o.id, {
          label: form.label.trim() || null,
          startDate: form.startDate || undefined,
          startMileage: form.startMileage ? Number(form.startMileage) : null,
          endDate: form.endDate || null,
          endMileage: form.endMileage ? Number(form.endMileage) : null,
        });
      }
      setFormMode("none");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update ownership period");
    } finally {
      setSaving(false);
    }
  }

  function confirmDelete(o: VehicleOwnership) {
    const doDelete = async () => {
      try {
        await ownershipApi.remove(o.id);
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't delete ownership period");
      }
    };
    const msg = `Delete the "${o.label ?? "Previous owner"}" period? This won't delete the associated events.`;
    if (Platform.OS === "web") {
      if (window.confirm(msg)) void doDelete();
    } else {
      Alert.alert("Delete ownership period?", msg, [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => void doDelete() },
      ]);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: "Ownership" }} />
        <ActivityIndicator />
      </View>
    );
  }

  const editingCurrent = formMode !== "none" && formMode !== "add" && formMode.edit.isCurrent;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <Stack.Screen options={{ title: "Ownership" }} />

        <Text style={styles.intro}>
          Track previous owners to keep the full car history together. Events are attributed to each period automatically.
        </Text>

        {/* Period list */}
        {ownerships.map((o) => {
          const isEditingThis = formMode !== "none" && formMode !== "add" && formMode.edit.id === o.id;
          return (
            <View key={o.id}>
              <View style={[styles.periodRow, o.isCurrent && styles.periodRowCurrent]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.periodName}>
                    {o.isCurrent
                      ? (o.ownerUsername ? `@${o.ownerUsername}` : o.label ?? "Current owner")
                      : (o.ownerUsername && o.showOwnerName ? `@${o.ownerUsername}` : o.label ?? "Previous owner")}
                    {o.isCurrent && (
                      <Text style={styles.currentBadge}>{" "}(current)</Text>
                    )}
                  </Text>
                  <Text style={styles.periodMeta}>
                    {[
                      formatDate(o.startDate),
                      o.endDate ? `– ${formatDate(o.endDate)}` : "– now",
                    ].join(" ")}
                  </Text>
                  {(o.startMileage != null || o.endMileage != null) && (
                    <Text style={styles.periodMeta}>
                      {[
                        o.startMileage != null ? `${o.startMileage.toLocaleString()} mi` : null,
                        o.endMileage != null ? `→ ${o.endMileage.toLocaleString()} mi` : null,
                      ].filter(Boolean).join("  →  ")}
                    </Text>
                  )}
                </View>
                <View style={styles.periodActions}>
                  <Pressable onPress={() => startEdit(o)} hitSlop={8}>
                    <Text style={styles.editLink}>Edit</Text>
                  </Pressable>
                  {!o.isCurrent && (
                    <Pressable onPress={() => confirmDelete(o)} hitSlop={8}>
                      <Text style={styles.deleteLink}>Delete</Text>
                    </Pressable>
                  )}
                </View>
              </View>

              {/* Inline edit form */}
              {isEditingThis && (
                <View style={styles.inlineForm}>
                  {editingCurrent ? (
                    <>
                      <Text style={styles.formTitle}>Edit current ownership start</Text>
                      <Text style={styles.label}>Start date (YYYY-MM-DD)</Text>
                      <TextInput
                        style={styles.input}
                        value={form.startDate}
                        onChangeText={(v) => setForm({ ...form, startDate: v })}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor="#94a3b8"
                      />
                      <Text style={styles.label}>Start mileage</Text>
                      <TextInput
                        style={styles.input}
                        value={form.startMileage}
                        onChangeText={(v) => setForm({ ...form, startMileage: v.replace(/[^\d]/g, "") })}
                        keyboardType="number-pad"
                        placeholder="e.g. 45000"
                        placeholderTextColor="#94a3b8"
                      />
                    </>
                  ) : (
                    <>
                      <Text style={styles.formTitle}>Edit ownership period</Text>
                      <Text style={styles.label}>Label</Text>
                      <TextInput
                        style={styles.input}
                        value={form.label}
                        onChangeText={(v) => setForm({ ...form, label: v })}
                        placeholder="e.g. Previous owner"
                        placeholderTextColor="#94a3b8"
                      />
                      <Text style={styles.label}>Start date (YYYY-MM-DD)</Text>
                      <TextInput
                        style={styles.input}
                        value={form.startDate}
                        onChangeText={(v) => setForm({ ...form, startDate: v })}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor="#94a3b8"
                      />
                      <Text style={styles.label}>Start mileage</Text>
                      <TextInput
                        style={styles.input}
                        value={form.startMileage}
                        onChangeText={(v) => setForm({ ...form, startMileage: v.replace(/[^\d]/g, "") })}
                        keyboardType="number-pad"
                        placeholder="e.g. 0"
                        placeholderTextColor="#94a3b8"
                      />
                      <Text style={styles.label}>End date (YYYY-MM-DD)</Text>
                      <TextInput
                        style={styles.input}
                        value={form.endDate}
                        onChangeText={(v) => setForm({ ...form, endDate: v })}
                        placeholder="YYYY-MM-DD"
                        placeholderTextColor="#94a3b8"
                      />
                      <Text style={styles.label}>End mileage</Text>
                      <TextInput
                        style={styles.input}
                        value={form.endMileage}
                        onChangeText={(v) => setForm({ ...form, endMileage: v.replace(/[^\d]/g, "") })}
                        keyboardType="number-pad"
                        placeholder="e.g. 145200"
                        placeholderTextColor="#94a3b8"
                      />
                    </>
                  )}
                  {error && <Text style={styles.error}>{error}</Text>}
                  <View style={styles.formBtns}>
                    <Pressable style={[styles.btn, styles.btnSecondary]} onPress={cancelForm}>
                      <Text style={styles.btnSecondaryText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.btn, styles.btnPrimary, saving && { opacity: 0.6 }]}
                      onPress={() => void saveEdit(o)}
                      disabled={saving}
                    >
                      {saving ? (
                        <ActivityIndicator color="#fff" />
                      ) : (
                        <Text style={styles.btnPrimaryText}>Save</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          );
        })}

        {/* Add previous owner form */}
        {formMode === "add" ? (
          <View style={styles.addForm}>
            <Text style={styles.formTitle}>Add previous owner period</Text>
            <Text style={styles.label}>Label</Text>
            <TextInput
              style={styles.input}
              value={form.label}
              onChangeText={(v) => setForm({ ...form, label: v })}
              placeholder="Previous owner"
              placeholderTextColor="#94a3b8"
            />
            <Text style={styles.label}>Start date (YYYY-MM-DD) *</Text>
            <TextInput
              style={styles.input}
              value={form.startDate}
              onChangeText={(v) => setForm({ ...form, startDate: v })}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#94a3b8"
            />
            <Text style={styles.label}>Start mileage</Text>
            <TextInput
              style={styles.input}
              value={form.startMileage}
              onChangeText={(v) => setForm({ ...form, startMileage: v.replace(/[^\d]/g, "") })}
              keyboardType="number-pad"
              placeholder="e.g. 0"
              placeholderTextColor="#94a3b8"
            />
            <Text style={styles.label}>End date (YYYY-MM-DD)</Text>
            <TextInput
              style={styles.input}
              value={form.endDate}
              onChangeText={(v) => setForm({ ...form, endDate: v })}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#94a3b8"
            />
            <Text style={styles.label}>End mileage</Text>
            <TextInput
              style={styles.input}
              value={form.endMileage}
              onChangeText={(v) => setForm({ ...form, endMileage: v.replace(/[^\d]/g, "") })}
              keyboardType="number-pad"
              placeholder="e.g. 145200"
              placeholderTextColor="#94a3b8"
            />
            {error && <Text style={styles.error}>{error}</Text>}
            <View style={styles.formBtns}>
              <Pressable style={[styles.btn, styles.btnSecondary]} onPress={cancelForm}>
                <Text style={styles.btnSecondaryText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.btn, styles.btnPrimary, saving && { opacity: 0.6 }]}
                onPress={() => void saveAdd()}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.btnPrimaryText}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable style={styles.addBtn} onPress={startAdd}>
            <Text style={styles.addBtnText}>+ Add previous owner period</Text>
          </Pressable>
        )}

        {error && formMode === "none" && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16, gap: 12, maxWidth: 560, width: "100%", alignSelf: "center", paddingBottom: 48 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  intro: { fontSize: 15, color: "#64748b" },
  periodRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    padding: 14,
  },
  periodRowCurrent: { borderColor: "#2563eb", borderWidth: 1.5 },
  periodName: { fontSize: 17, fontWeight: "700", color: "#0b1120" },
  currentBadge: { fontSize: 13, fontWeight: "600", color: "#2563eb" },
  periodMeta: { fontSize: 14, color: "#64748b", marginTop: 2 },
  periodActions: { flexDirection: "row", gap: 12, alignItems: "center", paddingTop: 2 },
  editLink: { fontSize: 14, fontWeight: "600", color: "#2563eb" },
  deleteLink: { fontSize: 14, fontWeight: "600", color: "#dc2626" },
  inlineForm: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    padding: 14,
    gap: 8,
    marginTop: -4,
    backgroundColor: "#f8fafc",
  },
  addForm: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    padding: 14,
    gap: 8,
  },
  formTitle: { fontSize: 16, fontWeight: "700", color: "#0b1120", marginBottom: 4 },
  label: { fontSize: 15, fontWeight: "600", color: "#334155", marginTop: 4 },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    color: "#0b1120",
    backgroundColor: "#fff",
  },
  formBtns: { flexDirection: "row", gap: 8, marginTop: 4 },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  btnPrimary: { backgroundColor: "#2563eb" },
  btnPrimaryText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  btnSecondary: { borderWidth: 1, borderColor: "#e2e8f0", backgroundColor: "#f8fafc" },
  btnSecondaryText: { color: "#475569", fontWeight: "600", fontSize: 16 },
  addBtn: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: "#94a3b8",
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
  },
  addBtnText: { fontSize: 16, fontWeight: "600", color: "#64748b" },
  error: { fontSize: 15, color: "#dc2626" },
});
