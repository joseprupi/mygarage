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
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import { mediaUrl, postApi, uploadImage, userApi, type Media, type Vehicle } from "@/lib/api";

export default function NewPostScreen() {
  const router = useRouter();
  const [caption, setCaption] = useState("");
  const [media, setMedia] = useState<Media[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicles, setSelectedVehicles] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void userApi
      .me()
      .then((me) => userApi.vehicles(me.id))
      .then(setVehicles)
      .catch(() => setVehicles([]));
  }, []);

  async function pickPhoto(fromCamera: boolean) {
    const options: ImagePicker.ImagePickerOptions = { quality: 0.85, allowsMultipleSelection: !fromCamera };
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
        const uploaded = await uploadImage(asset, "post_media");
        setMedia((prev) => [...prev, uploaded]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function publish() {
    if (saving) return;
    setError(null);
    if (media.length === 0 && !caption.trim()) return setError("Add a photo or a caption.");
    setSaving(true);
    try {
      await postApi.create({
        caption: caption.trim() || null,
        vehicleIds: selectedVehicles,
        media: media.map((m, i) => ({ ...m, sort_order: i })),
      });
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't publish post");
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <TextInput
        style={[styles.input, styles.multiline]}
        placeholder="Write a caption…"
        placeholderTextColor="#94a3b8"
        multiline
        value={caption}
        onChangeText={setCaption}
      />

      {media.length > 0 && (
        <View style={styles.mediaGrid}>
          {media.map((item, index) => (
            <View key={`${item.url}-${index}`} style={styles.mediaItem}>
              <Image
                source={{ uri: mediaUrl(item.url) ?? undefined }}
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

      {vehicles.length > 0 && (
        <>
          <Text style={styles.label}>Tag a vehicle</Text>
          <View style={styles.chipWrap}>
            {vehicles.map((v) => {
              const selected = selectedVehicles.includes(v.id);
              const name = v.nickname || [v.year, v.make, v.model].filter(Boolean).join(" ");
              return (
                <Pressable
                  key={v.id}
                  style={[styles.chip, selected && styles.chipActive]}
                  onPress={() =>
                    setSelectedVehicles((prev) =>
                      selected ? prev.filter((x) => x !== v.id) : [...prev, v.id],
                    )
                  }
                >
                  <Text style={[styles.chipText, selected && styles.chipTextActive]}>{name}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={styles.saveBtn} onPress={publish} disabled={saving || uploading}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Post</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16, gap: 12, maxWidth: 560, width: "100%", alignSelf: "center", paddingBottom: 48 },
  label: { fontSize: 13, fontWeight: "600", color: "#334155" },
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
  row: { flexDirection: "row", gap: 10, alignItems: "center" },
  mediaGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  mediaItem: { width: 100, height: 100 },
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
  pickBtnText: { fontSize: 14, fontWeight: "600", color: "#0b1120" },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#f1f5f9" },
  chipActive: { backgroundColor: "#0b1120" },
  chipText: { fontSize: 13, fontWeight: "600", color: "#475569" },
  chipTextActive: { color: "#fff" },
  saveBtn: { backgroundColor: "#2563eb", borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  error: { color: "#dc2626", fontSize: 14 },
});
