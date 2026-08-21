import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import { catalogApi, mediaUrl, uploadImage, vehicleApi } from "@/lib/api";

const emptyForm = {
  make: "",
  model: "",
  year: "",
  nickname: "",
  trim: "",
  vin: "",
  mileage: "",
  visibility: "public",
};

export default function VehicleFormScreen() {
  const { vehicleId } = useLocalSearchParams<{ vehicleId?: string }>();
  const router = useRouter();
  const isEdit = Boolean(vehicleId);
  const [form, setForm] = useState(emptyForm);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [makes, setMakes] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [makeFocused, setMakeFocused] = useState(false);
  const [loaded, setLoaded] = useState(!isEdit);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void catalogApi.makes().then(setMakes).catch(() => setMakes([]));
  }, []);

  useEffect(() => {
    if (!isEdit || !vehicleId) return;
    void vehicleApi
      .get(vehicleId)
      .then((v) => {
        setForm({
          make: v.make,
          model: v.model,
          year: v.year != null ? String(v.year) : "",
          nickname: v.nickname ?? "",
          trim: v.trim ?? "",
          vin: v.vin ?? "",
          mileage: v.mileage != null ? String(v.mileage) : "",
          visibility: v.visibility,
        });
        setCoverUrl(v.cover_image_url);
        setLoaded(true);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load vehicle"));
  }, [isEdit, vehicleId]);

  // Model suggestions once make + a plausible year are set
  useEffect(() => {
    const year = Number(form.year);
    if (!form.make || !(year >= 1900 && year <= 2100)) {
      setModels([]);
      return;
    }
    void catalogApi.models(form.make, year).then(setModels).catch(() => setModels([]));
  }, [form.make, form.year]);

  const makeSuggestions =
    makeFocused && form.make.length > 0
      ? makes.filter((m) => m.toLowerCase().includes(form.make.toLowerCase()) && m !== form.make).slice(0, 8)
      : [];
  const modelSuggestions =
    models.length > 0 && !models.includes(form.model)
      ? models.filter((m) => m.toLowerCase().includes(form.model.toLowerCase())).slice(0, 8)
      : [];

  async function pickCover(fromCamera: boolean) {
    const options: ImagePicker.ImagePickerOptions = { quality: 0.85, allowsEditing: true, aspect: [16, 9] };
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
      const media = await uploadImage(result.assets[0], "vehicle_cover");
      setCoverUrl(media.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function save() {
    if (saving) return;
    setError(null);
    if (!form.make.trim()) return setError("Make is required.");
    if (!form.model.trim()) return setError("Model is required.");
    setSaving(true);
    const payload: Parameters<typeof vehicleApi.create>[0] = {
      make: form.make.trim(),
      model: form.model.trim(),
      year: form.year ? Number(form.year) : null,
      nickname: form.nickname.trim() || null,
      trim: form.trim.trim() || null,
      vin: form.vin.trim().toUpperCase() || null,
      cover_image_url: coverUrl,
      visibility: form.visibility,
    };
    // Mileage is only asked at add time ("initial mileage"); edits never touch it —
    // the ongoing odometer story lives in fuel-ups and history events.
    if (!isEdit) payload.mileage = form.mileage ? Number(form.mileage) : null;
    try {
      if (isEdit && vehicleId) {
        await vehicleApi.update(vehicleId, payload);
      } else {
        await vehicleApi.create(payload);
      }
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save vehicle");
      setSaving(false);
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: isEdit ? "Edit vehicle" : "Add vehicle" }} />

      <Text style={styles.label}>Cover photo</Text>
      {coverUrl ? (
        <Image source={{ uri: mediaUrl(coverUrl) ?? undefined }} style={styles.cover} contentFit="cover" />
      ) : (
        <View style={[styles.cover, styles.coverPlaceholder]}>
          <Ionicons name="car-sport" size={44} color="#94a3b8" />
        </View>
      )}
      <View style={styles.row}>
        <Pressable style={styles.pickBtn} onPress={() => pickCover(true)} disabled={uploading}>
          <Ionicons name="camera-outline" size={16} color="#0b1120" />
          <Text style={styles.pickBtnText}>Camera</Text>
        </Pressable>
        <Pressable style={styles.pickBtn} onPress={() => pickCover(false)} disabled={uploading}>
          <Ionicons name="images-outline" size={16} color="#0b1120" />
          <Text style={styles.pickBtnText}>Library</Text>
        </Pressable>
        {coverUrl && (
          <Pressable onPress={() => setCoverUrl(null)} hitSlop={6}>
            <Text style={styles.clearText}>remove</Text>
          </Pressable>
        )}
        {uploading && <ActivityIndicator />}
      </View>

      <Text style={styles.label}>Year</Text>
      <TextInput
        style={styles.input}
        keyboardType="number-pad"
        placeholder="2004"
        placeholderTextColor="#94a3b8"
        value={form.year}
        onChangeText={(v) => setForm({ ...form, year: v.replace(/[^\d]/g, "").slice(0, 4) })}
      />

      <Text style={styles.label}>Make *</Text>
      <TextInput
        style={styles.input}
        value={form.make}
        placeholder="Toyota"
        placeholderTextColor="#94a3b8"
        autoCapitalize="words"
        onFocus={() => setMakeFocused(true)}
        onBlur={() => setTimeout(() => setMakeFocused(false), 200)}
        onChangeText={(v) => setForm({ ...form, make: v })}
      />
      {makeSuggestions.length > 0 && (
        <View style={styles.chipWrap}>
          {makeSuggestions.map((m) => (
            <Pressable key={m} style={styles.chip} onPress={() => setForm({ ...form, make: m })}>
              <Text style={styles.chipText}>{m}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <Text style={styles.label}>Model *</Text>
      <TextInput
        style={styles.input}
        value={form.model}
        placeholder="4Runner"
        placeholderTextColor="#94a3b8"
        autoCapitalize="words"
        onChangeText={(v) => setForm({ ...form, model: v })}
      />
      {modelSuggestions.length > 0 && (
        <View style={styles.chipWrap}>
          {modelSuggestions.map((m) => (
            <Pressable key={m} style={styles.chip} onPress={() => setForm({ ...form, model: m })}>
              <Text style={styles.chipText}>{m}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <Text style={styles.label}>Trim / version</Text>
      <TextInput
        style={styles.input}
        value={form.trim}
        placeholder="Limited 4WD"
        placeholderTextColor="#94a3b8"
        autoCapitalize="words"
        onChangeText={(v) => setForm({ ...form, trim: v })}
      />

      <Text style={styles.label}>Nickname</Text>
      <TextInput
        style={styles.input}
        value={form.nickname}
        placeholder="The daily"
        placeholderTextColor="#94a3b8"
        onChangeText={(v) => setForm({ ...form, nickname: v })}
      />

      <Text style={styles.label}>VIN</Text>
      <TextInput
        style={styles.input}
        value={form.vin}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="Only you can see this"
        placeholderTextColor="#94a3b8"
        onChangeText={(v) => setForm({ ...form, vin: v.replace(/[^A-Za-z0-9]/g, "").slice(0, 32) })}
      />

      {!isEdit && (
        <>
          <Text style={styles.label}>Initial mileage (when you got the car)</Text>
          <TextInput
            style={styles.input}
            keyboardType="number-pad"
            value={form.mileage}
            onChangeText={(v) => setForm({ ...form, mileage: v.replace(/[^\d]/g, "") })}
          />
        </>
      )}

      <Text style={styles.label}>Visibility</Text>
      <View style={styles.row}>
        {(["public", "private"] as const).map((vis) => (
          <Pressable
            key={vis}
            style={[styles.chip, form.visibility === vis && styles.chipActive]}
            onPress={() => setForm({ ...form, visibility: vis })}
          >
            <Text style={[styles.chipText, form.visibility === vis && styles.chipTextActive]}>
              {vis === "public" ? "Public" : "Private"}
            </Text>
          </Pressable>
        ))}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={styles.saveBtn} onPress={save} disabled={saving || uploading}>
        {saving ? <ActivityIndicator color="#fff" /> : (
          <Text style={styles.saveBtnText}>{isEdit ? "Save changes" : "Add vehicle"}</Text>
        )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16, gap: 8, maxWidth: 560, width: "100%", alignSelf: "center", paddingBottom: 48 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  label: { fontSize: 13, fontWeight: "600", color: "#334155", marginTop: 6 },
  cover: { width: "100%", aspectRatio: 16 / 9, borderRadius: 14, backgroundColor: "#f1f5f9" },
  coverPlaceholder: { alignItems: "center", justifyContent: "center" },
  row: { flexDirection: "row", gap: 10, alignItems: "center" },
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
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#f1f5f9" },
  chipActive: { backgroundColor: "#0b1120" },
  chipText: { fontSize: 13, fontWeight: "600", color: "#475569" },
  chipTextActive: { color: "#fff" },
  pickBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  pickBtnText: { fontSize: 13, fontWeight: "600", color: "#0b1120" },
  clearText: { fontSize: 13, color: "#64748b", textDecorationLine: "underline" },
  saveBtn: { backgroundColor: "#2563eb", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 12 },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  error: { color: "#dc2626", fontSize: 14, marginTop: 4 },
});
