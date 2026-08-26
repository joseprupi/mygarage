import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import { aiApi, eventApi, mediaUrl, uploadImage, type Media, type PickedAsset, type ReceiptScan } from "@/lib/api";

// Extends Media with a localUri for in-form previews (never sent to backend).
type MediaWithPreview = Media & { localUri?: string };
import { EVENT_TYPES, SERVICE_TAGS, eventTypeLabel, tagLabel } from "@/lib/events";

const emptyForm = {
  eventType: "maintenance",
  title: "",
  description: "",
  eventDate: "",
  mileage: "",
  cost: "",
  shopName: "",
  location: "",
};

export default function EventFormScreen() {
  const { id: vehicleId, eventId } = useLocalSearchParams<{ id: string; eventId?: string }>();
  const router = useRouter();
  const isEdit = Boolean(eventId);
  const [form, setForm] = useState(emptyForm);
  const [media, setMedia] = useState<MediaWithPreview[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [fuelFullTank, setFuelFullTank] = useState(true);
  const [fuelMissedPrevious, setFuelMissedPrevious] = useState(false);
  const [loaded, setLoaded] = useState(!isEdit);
  const [uploading, setUploading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanPages, setScanPages] = useState<PickedAsset[]>([]);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ReceiptScan | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!isEdit || !eventId) return;
      void eventApi
        .get(eventId)
        .then((e) => {
          setForm({
            eventType: e.event_type,
            title: e.title,
            description: e.description ?? "",
            eventDate: e.event_date ?? "",
            mileage: e.mileage != null ? String(e.mileage) : "",
            cost: e.cost_cents != null ? String(e.cost_cents / 100) : "",
            shopName: e.shop_name ?? "",
            location: e.location ?? "",
          });
          setMedia(e.media);
          setTags(e.tags ?? []);
          setFuelFullTank(e.fuel_full_tank !== false);
          setFuelMissedPrevious(e.fuel_missed_previous === true);
          setLoaded(true);
        })
        .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load event"));
    }, [isEdit, eventId]),
  );

  async function pickPhoto(fromCamera: boolean) {
    const options: ImagePicker.ImagePickerOptions = { quality: 0.8, allowsMultipleSelection: !fromCamera };
    const result = fromCamera
      ? await (async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) return null;
          return ImagePicker.launchCameraAsync(options);
        })()
      : await ImagePicker.launchImageLibraryAsync(options);
    if (!result || result.canceled) return;
    setUploading(true);
    setError(null);
    try {
      for (const asset of result.assets) {
        const uploaded = await uploadImage(asset, "vehicle_event_media");
        // Store localUri for preview; the uploaded url is a non-displayable relative path
        setMedia((prev) => [...prev, { ...uploaded, localUri: asset.uri }]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function addScanPage(fromCamera: boolean) {
    const options: ImagePicker.ImagePickerOptions = { quality: 0.9, allowsMultipleSelection: !fromCamera };
    const result = fromCamera
      ? await (async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) return null;
          return ImagePicker.launchCameraAsync(options);
        })()
      : await ImagePicker.launchImageLibraryAsync(options);
    if (!result || result.canceled) return;
    setScanPages((prev) => [...prev, ...result.assets].slice(0, 5));
    setScanNote(null);
  }

  async function runScan() {
    if (scanPages.length === 0 || scanning) return;
    setScanning(true);
    setScanNote(null);
    setError(null);
    try {
      // All pages = ONE receipt: extract fields and attach every page as event media.
      const assets = [...scanPages]; // capture before clearing
      const [scan, ...uploaded] = await Promise.all([
        aiApi.scanReceipt(assets),
        ...assets.map((a) => uploadImage(a, "vehicle_event_media")),
      ]);
      setForm((prev) => ({
        ...prev,
        eventType: scan.eventType || prev.eventType,
        title: scan.title || prev.title,
        eventDate: scan.eventDate ?? prev.eventDate,
        mileage: scan.mileage != null ? String(scan.mileage) : prev.mileage,
        cost: scan.costCents != null ? String(scan.costCents / 100) : prev.cost,
        shopName: scan.shopName ?? prev.shopName,
        location: scan.location ?? prev.location,
        description: scan.description ?? prev.description,
      }));
      // Pair each upload with its local asset URI for previews
      const uploadedWithPreviews = uploaded.map((m, i) => ({ ...m, localUri: assets[i].uri }));
      setMedia((prev) => [...prev, ...uploadedWithPreviews]);
      if (scan.tags?.length) setTags((prev) => [...new Set([...prev, ...scan.tags])]);
      setScanResult(scan);
      setScanPages([]);
      setScanNote(
        scan.confidence === "high"
          ? "Receipt read — double-check the fields below, then save."
          : `Receipt was hard to read (confidence: ${scan.confidence}${scan.notes ? ` — ${scan.notes}` : ""}). Check every field.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Receipt scan failed");
    } finally {
      setScanning(false);
    }
  }

  async function save() {
    if (saving) return;
    setError(null);
    if (!form.title.trim()) return setError("Title is required.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.eventDate)) return setError("Date is required (YYYY-MM-DD).");
    setSaving(true);
    const isFuel = form.eventType === "fuel";
    const payload = {
      eventType: form.eventType,
      title: form.title.trim(),
      description: form.description.trim() || null,
      eventDate: form.eventDate,
      mileage: form.mileage ? Number(form.mileage) : null,
      costCents: form.cost ? Math.round(Number(form.cost) * 100) : null,
      shopName: form.shopName.trim() || null,
      location: form.location.trim() || null,
      // Strip localUri before sending; url is the backend reference
      media: media.map((m, i) => ({ url: m.url, sort_order: i })),
      tags,
      ...(isFuel && {
        fuelFullTank: fuelFullTank,
        fuelMissedPrevious: fuelMissedPrevious ? true : null,
      }),
      // Provenance: only on create, only when a scan prefilled the form
      ...(!isEdit && scanResult ? { source: "scan" as const, scanSnapshot: scanResult } : {}),
    };
    try {
      if (isEdit && eventId) await eventApi.update(eventId, payload);
      else if (vehicleId) await eventApi.create(vehicleId, payload);
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save event");
      setSaving(false);
    }
  }

  function confirmDelete() {
    if (!eventId) return;
    const doDelete = async () => {
      try {
        await eventApi.delete(eventId);
        router.back();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't delete event");
      }
    };
    if (Platform.OS === "web") {
      if (window.confirm("Delete this event? This cannot be undone.")) void doDelete();
    } else {
      Alert.alert("Delete this event?", "This cannot be undone.", [
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
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}>
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: isEdit ? "Edit event" : "Add event" }} />

      {!isEdit && (
        <View style={styles.scanBox}>
          <Text style={styles.scanTitle}>✨ Scan a receipt</Text>
          <Text style={styles.scanHint}>
            Photograph the bill — add every page, then read it. The form fills itself and the
            pages are attached; you review before saving.
          </Text>
          <View style={styles.row}>
            <Pressable style={styles.pickBtn} onPress={() => addScanPage(true)} disabled={scanning || uploading}>
              <Ionicons name="camera-outline" size={18} color="#0b1120" />
              <Text style={styles.pickBtnText}>Add page</Text>
            </Pressable>
            <Pressable style={styles.pickBtn} onPress={() => addScanPage(false)} disabled={scanning || uploading}>
              <Ionicons name="images-outline" size={18} color="#0b1120" />
              <Text style={styles.pickBtnText}>Library</Text>
            </Pressable>
          </View>
          {scanPages.length > 0 && (
            <View style={styles.row}>
              <Text style={styles.scanPagesText}>
                {scanPages.length} {scanPages.length === 1 ? "page" : "pages"} ready
              </Text>
              <Pressable onPress={() => setScanPages([])} hitSlop={6} disabled={scanning}>
                <Text style={styles.scanClear}>clear</Text>
              </Pressable>
              <Pressable style={styles.scanRunBtn} onPress={runScan} disabled={scanning || uploading}>
                {scanning ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.scanRunText}>Read receipt</Text>
                )}
              </Pressable>
            </View>
          )}
          {scanNote && <Text style={styles.scanNote}>{scanNote}</Text>}
        </View>
      )}

      <Text style={styles.label}>Type</Text>
      <View style={styles.typeWrap}>
        {EVENT_TYPES.map((type) => (
          <Pressable
            key={type}
            style={[styles.typeChip, form.eventType === type && styles.typeChipActive]}
            onPress={() => setForm({ ...form, eventType: type })}
          >
            <Text
              style={[styles.typeChipText, form.eventType === type && styles.typeChipTextActive]}
            >
              {eventTypeLabel(type)}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>What was worked on</Text>
      <View style={styles.typeWrap}>
        {SERVICE_TAGS.map((tag) => {
          const on = tags.includes(tag);
          return (
            <Pressable
              key={tag}
              style={[styles.tagChip, on && styles.tagChipActive]}
              onPress={() => setTags((prev) => (on ? prev.filter((t) => t !== tag) : [...prev, tag]))}
            >
              <Text style={[styles.tagChipText, on && styles.tagChipTextActive]}>{tagLabel(tag)}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={styles.label}>Title *</Text>
      <TextInput style={styles.input} value={form.title} onChangeText={(v) => setForm({ ...form, title: v })} />

      <Text style={styles.label}>Date * (YYYY-MM-DD)</Text>
      <TextInput
        style={styles.input}
        value={form.eventDate}
        placeholder="2026-07-31"
        placeholderTextColor="#94a3b8"
        onChangeText={(v) => setForm({ ...form, eventDate: v })}
      />

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Mileage</Text>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            value={form.mileage}
            onChangeText={(v) => setForm({ ...form, mileage: v.replace(/[^\d]/g, "") })}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Cost ($)</Text>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            value={form.cost}
            onChangeText={(v) => setForm({ ...form, cost: v.replace(/[^\d.]/g, "") })}
          />
        </View>
      </View>

      <Text style={styles.label}>Shop / vendor</Text>
      <TextInput style={styles.input} value={form.shopName} onChangeText={(v) => setForm({ ...form, shopName: v })} />

      <Text style={styles.label}>Location</Text>
      <TextInput style={styles.input} value={form.location} onChangeText={(v) => setForm({ ...form, location: v })} />

      <Text style={styles.label}>Notes</Text>
      <TextInput
        style={[styles.input, styles.multiline]}
        multiline
        value={form.description}
        onChangeText={(v) => setForm({ ...form, description: v })}
      />

      {form.eventType === "fuel" && (
        <>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Filled the tank</Text>
              <Text style={styles.toggleHint}>Turn off for a partial top-up</Text>
            </View>
            <Switch value={fuelFullTank} onValueChange={setFuelFullTank} trackColor={{ true: "#2563eb" }} />
          </View>
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Skipped a fill-up since last time</Text>
              <Text style={styles.toggleHint}>Helps keep MPG accurate</Text>
            </View>
            <Switch value={fuelMissedPrevious} onValueChange={setFuelMissedPrevious} trackColor={{ true: "#f59e0b" }} />
          </View>
        </>
      )}

      <Text style={styles.label}>Photos</Text>
      {media.length > 0 && (
        <View style={styles.mediaGrid}>
          {media.map((item, index) => (
            <View key={`${item.url ?? item.localUri}-${index}`} style={styles.mediaItem}>
              <Image
                source={{ uri: item.localUri ?? mediaUrl(item.thumbnailUrl ?? item.url) ?? undefined }}
                style={styles.mediaImage}
                contentFit="cover"
              />
              <Pressable
                style={styles.mediaRemove}
                hitSlop={6}
                onPress={() => setMedia((prev) => prev.filter((_, i) => i !== index))}
              >
                <Ionicons name="close" size={14} color="#fff" />
              </Pressable>
            </View>
          ))}
        </View>
      )}
      <View style={styles.row}>
        <Pressable style={styles.pickBtn} onPress={() => pickPhoto(true)} disabled={uploading}>
          <Ionicons name="camera-outline" size={18} color="#0b1120" />
          <Text style={styles.pickBtnText}>Camera</Text>
        </Pressable>
        <Pressable style={styles.pickBtn} onPress={() => pickPhoto(false)} disabled={uploading}>
          <Ionicons name="images-outline" size={18} color="#0b1120" />
          <Text style={styles.pickBtnText}>Library</Text>
        </Pressable>
        {uploading && <ActivityIndicator />}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={styles.saveBtn} onPress={save} disabled={saving || uploading}>
        {saving ? <ActivityIndicator color="#fff" /> : (
          <Text style={styles.saveBtnText}>{isEdit ? "Save changes" : "Save event"}</Text>
        )}
      </Pressable>
      {isEdit && (
        <Pressable onPress={confirmDelete} style={styles.deleteBtn}>
          <Text style={styles.deleteText}>Delete event</Text>
        </Pressable>
      )}
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16, gap: 8, maxWidth: 560, width: "100%", alignSelf: "center", paddingBottom: 48 },
  scanBox: {
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    borderRadius: 14,
    padding: 12,
    gap: 8,
  },
  scanTitle: { fontSize: 17, fontWeight: "700", color: "#1d4ed8" },
  scanHint: { fontSize: 15, color: "#475569" },
  scanNote: { fontSize: 15, color: "#1d4ed8", fontWeight: "600" },
  scanPagesText: { fontSize: 15, fontWeight: "700", color: "#0b1120" },
  scanClear: { fontSize: 15, color: "#64748b", textDecorationLine: "underline" },
  scanRunBtn: {
    marginLeft: "auto",
    backgroundColor: "#2563eb",
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  scanRunText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  label: { fontSize: 15, fontWeight: "600", color: "#334155", marginTop: 6 },
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
  row: { flexDirection: "row", gap: 10, alignItems: "center" },
  typeWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeChip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#f1f5f9" },
  typeChipActive: { backgroundColor: "#0b1120" },
  typeChipText: { fontSize: 15, fontWeight: "600", color: "#475569" },
  typeChipTextActive: { color: "#fff" },
  tagChip: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: "#e2e8f0" },
  tagChipActive: { backgroundColor: "#2563eb", borderColor: "#2563eb" },
  tagChipText: { fontSize: 14, fontWeight: "600", color: "#475569" },
  tagChipTextActive: { color: "#fff" },
  mediaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  mediaItem: { width: 84, height: 84 },
  mediaImage: { width: "100%", height: "100%", borderRadius: 10, backgroundColor: "#f1f5f9" },
  mediaRemove: {
    position: "absolute",
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "#0b1120",
    alignItems: "center",
    justifyContent: "center",
  },
  pickBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  pickBtnText: { fontSize: 16, fontWeight: "600", color: "#0b1120" },
  saveBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
  },
  saveBtnText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  deleteBtn: { alignItems: "center", paddingVertical: 12 },
  deleteText: { color: "#dc2626", fontWeight: "600", fontSize: 17 },
  error: { color: "#dc2626", fontSize: 16, marginTop: 4 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 },
  toggleHint: { fontSize: 13, color: "#94a3b8", marginTop: 1 },
});
