import { useState } from "react";
import {
  ActivityIndicator,
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
import { useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import {
  aiApi,
  eventApi,
  uploadImage,
  type FuelScan,
  type Media,
  type PickedAsset,
} from "@/lib/api";

type Slot = { label: string; hint: string; asset: PickedAsset | null; media: Media | null };

const initialSlots: Slot[] = [
  { label: "Pump display", hint: "Total $, gallons, price/gal (or the printed receipt)", asset: null, media: null },
  { label: "Odometer", hint: "The mileage on your dash", asset: null, media: null },
];

export default function FuelScreen() {
  const { id: vehicleId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [slots, setSlots] = useState<Slot[]>(initialSlots);
  const [busySlot, setBusySlot] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanNote, setScanNote] = useState<string | null>(null);
  const [form, setForm] = useState({
    total: "",
    gallons: "",
    pricePerGallon: "",
    station: "",
    mileage: "",
    date: new Date().toISOString().slice(0, 10),
  });
  const [fullTank, setFullTank] = useState(true);
  const [missedPrevious, setMissedPrevious] = useState(false);
  const [fuelScanResult, setFuelScanResult] = useState<FuelScan | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function capture(slotIndex: number, fromCamera: boolean) {
    const options: ImagePicker.ImagePickerOptions = { quality: 0.9 };
    const result = fromCamera
      ? await (async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) return null;
          return ImagePicker.launchCameraAsync(options);
        })()
      : await ImagePicker.launchImageLibraryAsync(options);
    if (!result || result.canceled) return;
    const asset = result.assets[0];
    setBusySlot(slotIndex);
    setError(null);
    try {
      const media = await uploadImage(asset, "vehicle_event_media");
      setSlots((prev) => prev.map((s, i) => (i === slotIndex ? { ...s, asset, media } : s)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusySlot(null);
    }
  }

  async function readNumbers() {
    const assets = slots.filter((s) => s.asset).map((s) => s.asset!) as PickedAsset[];
    if (assets.length === 0) return setError("Add at least one photo first.");
    setScanning(true);
    setScanNote(null);
    setError(null);
    try {
      const scan = await aiApi.scanFuel(assets);
      setForm((prev) => ({
        ...prev,
        total: scan.totalCents != null ? String(scan.totalCents / 100) : prev.total,
        gallons: scan.gallons != null ? String(scan.gallons) : prev.gallons,
        pricePerGallon: scan.pricePerGallon != null ? String(scan.pricePerGallon) : prev.pricePerGallon,
        station: scan.stationName ?? prev.station,
        mileage: scan.mileage != null ? String(scan.mileage) : prev.mileage,
      }));
      setFuelScanResult(scan);
      setScanNote(
        scan.confidence === "high"
          ? "Numbers read — check them, then save."
          : `Hard to read (confidence: ${scan.confidence}${scan.notes ? ` — ${scan.notes}` : ""}). Check every number.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read the photos");
    } finally {
      setScanning(false);
    }
  }

  async function save() {
    if (saving) return;
    setError(null);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) return setError("Date must be YYYY-MM-DD.");
    if (!form.total && !form.mileage) return setError("Need at least a total cost or a mileage.");
    setSaving(true);
    const gallons = form.gallons ? Number(form.gallons) : null;
    const ppg = form.pricePerGallon ? Number(form.pricePerGallon) : null;
    const details = [
      gallons != null ? `${gallons} gal` : null,
      ppg != null ? `$${ppg.toFixed(2)}/gal` : null,
    ].filter(Boolean);
    try {
      if (!vehicleId) throw new Error("Missing vehicle");
      await eventApi.create(vehicleId, {
        eventType: "fuel",
        title: gallons != null ? `Fuel-up — ${gallons} gal` : "Fuel-up",
        eventDate: form.date,
        costCents: form.total ? Math.round(Number(form.total) * 100) : null,
        fuelGallons: gallons,
        fuelPriceCents: ppg != null ? Math.round(ppg * 100) : null,
        fuelFullTank: fullTank,
        fuelMissedPrevious: missedPrevious ? true : null,
        mileage: form.mileage ? Number(form.mileage) : null,
        shopName: form.station.trim() || null,
        description: details.length ? details.join(" · ") : null,
        media: slots
          .filter((s) => s.media)
          .map((s, i) => ({ url: (s.media as Media).url, sort_order: i })),
        // Provenance: send scan source + snapshot when numbers were read from photos
        ...(fuelScanResult ? { source: "scan" as const, scanSnapshot: fuelScanResult } : {}),
      });
      router.back();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save fuel-up");
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}>
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      <Text style={styles.intro}>
        Photograph the pump and your odometer — the numbers fill in below.
      </Text>

      {slots.map((slot, index) => (
        <View key={slot.label} style={styles.slot}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={styles.slotLabel}>{slot.label}</Text>
            <Text style={styles.slotHint}>{slot.hint}</Text>
            <View style={styles.row}>
              <Pressable style={styles.pickBtn} onPress={() => capture(index, true)} disabled={busySlot !== null}>
                <Ionicons name="camera-outline" size={16} color="#0b1120" />
                <Text style={styles.pickBtnText}>Camera</Text>
              </Pressable>
              <Pressable style={styles.pickBtn} onPress={() => capture(index, false)} disabled={busySlot !== null}>
                <Ionicons name="images-outline" size={16} color="#0b1120" />
                <Text style={styles.pickBtnText}>Library</Text>
              </Pressable>
              {busySlot === index && <ActivityIndicator />}
            </View>
          </View>
          {slot.asset && (
            <Image
              source={{ uri: slot.asset.uri }}
              style={styles.thumb}
              contentFit="cover"
            />
          )}
        </View>
      ))}

      <Pressable
        style={[styles.scanBtn, scanning && { opacity: 0.6 }]}
        onPress={readNumbers}
        disabled={scanning || busySlot !== null}
      >
        {scanning ? <ActivityIndicator color="#fff" /> : (
          <Text style={styles.scanBtnText}>✨ Read the numbers</Text>
        )}
      </Pressable>
      {scanNote && <Text style={styles.scanNote}>{scanNote}</Text>}

      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Total ($)</Text>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            value={form.total}
            onChangeText={(v) => setForm({ ...form, total: v.replace(/[^\d.]/g, "") })}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Gallons</Text>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            value={form.gallons}
            onChangeText={(v) => setForm({ ...form, gallons: v.replace(/[^\d.]/g, "") })}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>$/gal</Text>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            value={form.pricePerGallon}
            onChangeText={(v) => setForm({ ...form, pricePerGallon: v.replace(/[^\d.]/g, "") })}
          />
        </View>
      </View>

      <Text style={styles.label}>Odometer (miles)</Text>
      <TextInput
        style={styles.input}
        keyboardType="number-pad"
        value={form.mileage}
        onChangeText={(v) => setForm({ ...form, mileage: v.replace(/[^\d]/g, "") })}
      />

      <Text style={styles.label}>Station</Text>
      <TextInput style={styles.input} value={form.station} onChangeText={(v) => setForm({ ...form, station: v })} />

      <Text style={styles.label}>Date (YYYY-MM-DD)</Text>
      <TextInput style={styles.input} value={form.date} onChangeText={(v) => setForm({ ...form, date: v })} />

      <View style={styles.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Filled the tank</Text>
          <Text style={styles.toggleHint}>Turn off for a partial top-up</Text>
        </View>
        <Switch value={fullTank} onValueChange={setFullTank} trackColor={{ true: "#2563eb" }} />
      </View>

      <View style={styles.toggleRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>Skipped a fill-up since last time</Text>
          <Text style={styles.toggleHint}>Helps keep MPG accurate</Text>
        </View>
        <Switch value={missedPrevious} onValueChange={setMissedPrevious} trackColor={{ true: "#f59e0b" }} />
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable style={styles.saveBtn} onPress={save} disabled={saving || busySlot !== null}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save fuel-up</Text>}
      </Pressable>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { padding: 16, gap: 10, maxWidth: 560, width: "100%", alignSelf: "center", paddingBottom: 48 },
  intro: { fontSize: 16, color: "#475569" },
  slot: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    padding: 12,
  },
  slotLabel: { fontSize: 17, fontWeight: "700", color: "#0b1120" },
  slotHint: { fontSize: 14, color: "#94a3b8" },
  thumb: { width: 72, height: 72, borderRadius: 10, backgroundColor: "#f1f5f9" },
  row: { flexDirection: "row", gap: 10, alignItems: "center", marginTop: 6 },
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
  pickBtnText: { fontSize: 15, fontWeight: "600", color: "#0b1120" },
  scanBtn: { backgroundColor: "#0b1120", borderRadius: 12, paddingVertical: 13, alignItems: "center" },
  scanBtnText: { color: "#fff", fontSize: 17, fontWeight: "700" },
  scanNote: { fontSize: 15, color: "#1d4ed8", fontWeight: "600" },
  label: { fontSize: 15, fontWeight: "600", color: "#334155", marginTop: 4 },
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
  saveBtn: { backgroundColor: "#2563eb", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 8 },
  saveBtnText: { color: "#fff", fontSize: 18, fontWeight: "700" },
  error: { color: "#dc2626", fontSize: 16 },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 6,
  },
  toggleHint: { fontSize: 13, color: "#94a3b8", marginTop: 1 },
});
