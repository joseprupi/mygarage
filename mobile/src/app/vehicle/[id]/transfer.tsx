import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import { transferApi, vehicleApi, type TransferRecord, type VehicleEvent } from "@/lib/api";
import { formatDate } from "@/lib/events";

function formatExpiry(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffH = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffH < 24) return `${diffH}h`;
  const diffD = Math.floor(diffH / 24);
  return `${diffD}d`;
}

export default function TransferScreen() {
  const { id: vehicleId } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  const [pending, setPending] = useState<TransferRecord | null | "none">(null); // null=loading, "none"=no pending
  const [lastMileage, setLastMileage] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState(false);

  // Form state (only used when no pending transfer)
  const today = new Date().toISOString().slice(0, 10);
  const [handoverDate, setHandoverDate] = useState(today);
  const [handoverMileage, setHandoverMileage] = useState("");
  const [showOwnerName, setShowOwnerName] = useState(true);
  const [keepDocuments, setKeepDocuments] = useState(true);
  const [keepPostsTagged, setKeepPostsTagged] = useState(true);

  const load = useCallback(async () => {
    if (!vehicleId) return;
    setLoading(true);
    try {
      const [transfer, vehicle, events] = await Promise.all([
        transferApi.pending(vehicleId).catch((err: Error) => {
          if (err.message.includes("404") || err.message.includes("Not Found")) return null;
          throw err;
        }),
        vehicleApi.get(vehicleId),
        vehicleApi.events(vehicleId).catch(() => [] as VehicleEvent[]),
      ]);
      setPending(transfer ?? "none");
      // Default mileage to vehicle's or last event's mileage
      const lastEvent = (events as VehicleEvent[]).find((e) => e.mileage != null);
      const defaultMileage = vehicle.mileage ?? lastEvent?.mileage ?? null;
      setLastMileage(defaultMileage);
      if (defaultMileage != null) setHandoverMileage(String(defaultMileage));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load transfer info");
    } finally {
      setLoading(false);
    }
  }, [vehicleId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function createTransfer() {
    if (saving || !vehicleId) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(handoverDate)) {
      setError("Date must be YYYY-MM-DD.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const t = await transferApi.create(vehicleId, {
        handoverDate,
        handoverMileage: handoverMileage ? Number(handoverMileage) : null,
        showOwnerName,
        keepDocuments,
        keepPostsTagged,
      });
      setPending(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create transfer link");
      setSaving(false);
    } finally {
      setSaving(false);
    }
  }

  async function revoke() {
    if (pending === null || pending === "none" || revoking) return;
    Alert.alert("Revoke transfer link?", "The link will stop working. You can create a new one.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Revoke",
        style: "destructive",
        onPress: async () => {
          setRevoking(true);
          try {
            await transferApi.revoke((pending as TransferRecord).id);
            setPending("none");
          } catch (err) {
            Alert.alert("Error", err instanceof Error ? err.message : "Couldn't revoke");
          } finally {
            setRevoking(false);
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: "Transfer ownership" }} />
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {pending && pending !== "none" ? (
        // --- Pending transfer card ---
        <View style={styles.pendingCard}>
          <Text style={styles.pendingTitle}>Transfer link active</Text>
          <Text style={styles.pendingExpiry}>Expires in {formatExpiry((pending as TransferRecord).expiresAt)}</Text>

          <Text style={styles.codeLabel}>Transfer code</Text>
          <Text style={styles.code} selectable>{(pending as TransferRecord).code}</Text>

          <Pressable
            style={styles.shareBtn}
            onPress={() =>
              void Share.share({
                message: `Accept the CarFable vehicle transfer: ${(pending as TransferRecord).url}`,
                url: (pending as TransferRecord).url,
              })
            }
          >
            <Ionicons name="share-outline" size={18} color="#fff" />
            <Text style={styles.shareBtnText}>Share link</Text>
          </Pressable>

          <View style={styles.pendingDetails}>
            {(pending as TransferRecord).handoverDate && (
              <Text style={styles.detailRow}>Date: {formatDate((pending as TransferRecord).handoverDate)}</Text>
            )}
            {(pending as TransferRecord).handoverMileage != null && (
              <Text style={styles.detailRow}>
                Mileage: {((pending as TransferRecord).handoverMileage as number).toLocaleString()} mi
              </Text>
            )}
          </View>

          <Pressable
            style={[styles.revokeBtn, revoking && { opacity: 0.6 }]}
            onPress={revoke}
            disabled={revoking}
          >
            <Text style={styles.revokeBtnText}>{revoking ? "Revoking…" : "Revoke link"}</Text>
          </Pressable>
        </View>
      ) : (
        // --- Create form ---
        <>
          <Text style={styles.intro}>
            Create a transfer link to hand this vehicle over to its new owner. The full history stays
            with the car — you choose what&apos;s included.
          </Text>

          <Text style={styles.label}>Handover date (YYYY-MM-DD)</Text>
          <TextInput
            style={styles.input}
            value={handoverDate}
            onChangeText={setHandoverDate}
            placeholder={today}
            placeholderTextColor="#94a3b8"
          />

          <Text style={styles.label}>Handover mileage (optional)</Text>
          <TextInput
            style={styles.input}
            value={handoverMileage}
            onChangeText={(v) => setHandoverMileage(v.replace(/[^\d]/g, ""))}
            keyboardType="number-pad"
            placeholder={lastMileage != null ? String(lastMileage) : ""}
            placeholderTextColor="#94a3b8"
          />

          <View style={styles.card}>
            <View style={styles.toggleRow}>
              <View style={styles.toggleText}>
                <Text style={styles.toggleLabel}>Show my name on the previous-owner period</Text>
                <Text style={styles.toggleHint}>Opt out to show "Previous owner" instead of your username</Text>
              </View>
              <Switch
                value={showOwnerName}
                onValueChange={setShowOwnerName}
                trackColor={{ true: "#2563eb" }}
                thumbColor="#fff"
              />
            </View>
            <View style={styles.divider} />
            <View style={styles.toggleRow}>
              <View style={styles.toggleText}>
                <Text style={styles.toggleLabel}>Keep receipts/documents attached</Text>
                <Text style={styles.toggleHint}>Opt out to remove document files (events and amounts stay)</Text>
              </View>
              <Switch
                value={keepDocuments}
                onValueChange={setKeepDocuments}
                trackColor={{ true: "#2563eb" }}
                thumbColor="#fff"
              />
            </View>
            <View style={styles.divider} />
            <View style={styles.toggleRow}>
              <View style={styles.toggleText}>
                <Text style={styles.toggleLabel}>Keep my posts tagged to this vehicle</Text>
                <Text style={styles.toggleHint}>Opt out to remove your posts from this vehicle&apos;s feed</Text>
              </View>
              <Switch
                value={keepPostsTagged}
                onValueChange={setKeepPostsTagged}
                trackColor={{ true: "#2563eb" }}
                thumbColor="#fff"
              />
            </View>
          </View>

          <Pressable
            style={[styles.createBtn, saving && { opacity: 0.6 }]}
            onPress={createTransfer}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.createBtnText}>Create transfer link</Text>
            )}
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f8fafc" },
  content: { padding: 20, gap: 12, maxWidth: 560, width: "100%", alignSelf: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  error: { color: "#dc2626", fontSize: 14 },
  intro: { fontSize: 15, color: "#64748b", lineHeight: 22 },
  label: { fontSize: 15, fontWeight: "600", color: "#0b1120", marginTop: 4 },
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
  card: {
    backgroundColor: "#fff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    overflow: "hidden",
    marginTop: 4,
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  toggleText: { flex: 1, gap: 2 },
  toggleLabel: { fontSize: 15, fontWeight: "600", color: "#0b1120" },
  toggleHint: { fontSize: 13, color: "#64748b", lineHeight: 18 },
  divider: { height: 1, backgroundColor: "#f1f5f9", marginHorizontal: 16 },
  createBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  createBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  // pending state
  pendingCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 20,
    gap: 10,
  },
  pendingTitle: { fontSize: 18, fontWeight: "700", color: "#0b1120" },
  pendingExpiry: { fontSize: 14, color: "#64748b" },
  codeLabel: { fontSize: 13, fontWeight: "600", color: "#64748b", textTransform: "uppercase", letterSpacing: 0.4 },
  code: {
    fontFamily: "monospace",
    fontSize: 22,
    fontWeight: "700",
    color: "#0b1120",
    letterSpacing: 4,
    paddingVertical: 8,
  },
  shareBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 4,
  },
  shareBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  pendingDetails: { gap: 2, marginTop: 4 },
  detailRow: { fontSize: 14, color: "#64748b" },
  revokeBtn: {
    borderWidth: 1,
    borderColor: "#fca5a5",
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  revokeBtnText: { color: "#dc2626", fontWeight: "600", fontSize: 15 },
});
