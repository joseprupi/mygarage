import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import { mediaUrl, transferApi, userApi, type PreviousVehicle, type Vehicle } from "@/lib/api";

function vehicleTitle(v: Vehicle): string {
  return v.nickname || [v.year, v.make, v.model].filter(Boolean).join(" ");
}

// Deterministic placeholder color per vehicle so the garage isn't a wall of grey.
const PLACEHOLDER_COLORS = ["#dbeafe", "#d1fae5", "#fef3c7", "#ede9fe", "#ffe4e6", "#ccfbf1", "#fef9c3"];
const PLACEHOLDER_ICON = ["#1d4ed8", "#047857", "#b45309", "#6d28d9", "#be123c", "#0f766e", "#a16207"];

function placeholderColors(id: string): { bg: string; icon: string } {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) % 997;
  const i = hash % PLACEHOLDER_COLORS.length;
  return { bg: PLACEHOLDER_COLORS[i], icon: PLACEHOLDER_ICON[i] };
}

function formatDateShort(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.getFullYear().toString();
}

export default function GarageScreen() {
  const router = useRouter();
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [previousVehicles, setPreviousVehicles] = useState<PreviousVehicle[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transferCode, setTransferCode] = useState("");
  const [showCodeInput, setShowCodeInput] = useState(false);

  const load = useCallback(async () => {
    try {
      const me = await userApi.me();
      const [v, prev] = await Promise.all([
        userApi.vehicles(me.id),
        transferApi.previousVehicles().catch(() => [] as PreviousVehicle[]),
      ]);
      setVehicles(v);
      setPreviousVehicles(prev);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load your garage");
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (vehicles === null && !error) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (error && !vehicles?.length) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Couldn&apos;t load your garage.</Text>
        <Text style={styles.emptyDetail}>{error}</Text>
        <Pressable style={styles.retry} onPress={load}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  function goToTransferCode() {
    const code = transferCode.trim().toUpperCase();
    if (!code) {
      Alert.alert("Enter a code", "Type the transfer code you received.");
      return;
    }
    setTransferCode("");
    setShowCodeInput(false);
    router.push(`/transfer/${code}`);
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.list}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            setRefreshing(true);
            void load();
          }}
        />
      }
    >
      <Pressable style={styles.addVehicleBtn} onPress={() => router.push("/vehicle-form")}>
        <Ionicons name="add" size={20} color="#fff" />
        <Text style={styles.addVehicleText}>Add vehicle</Text>
      </Pressable>

      {(vehicles ?? []).length === 0 && !error && (
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No vehicles yet.</Text>
          <Text style={styles.emptyDetail}>Add your first car to get started.</Text>
        </View>
      )}

      {(vehicles ?? []).map((item) => {
        const cover = mediaUrl(item.cover_image_url);
        const colors = placeholderColors(item.id);
        return (
          <Pressable key={item.id} style={styles.card} onPress={() => router.push(`/vehicle/${item.id}`)}>
            {cover ? (
              <Image source={{ uri: cover }} style={styles.cover} contentFit="cover" />
            ) : (
              <View style={[styles.cover, styles.coverPlaceholder, { backgroundColor: colors.bg }]}>
                <Ionicons name="car-sport" size={40} color={colors.icon} />
              </View>
            )}
            <View style={styles.cardBody}>
              <Text style={styles.title}>{vehicleTitle(item)}</Text>
              <Text style={styles.subtitle}>
                {[item.year, item.make, item.model, item.trim].filter(Boolean).join(" ")}
              </Text>
              {item.mileage != null && (
                <Text style={styles.meta}>{item.mileage.toLocaleString()} mi</Text>
              )}
            </View>
            <Ionicons name="chevron-forward" size={20} color="#94a3b8" />
          </Pressable>
        );
      })}

      {/* Previously owned section */}
      {previousVehicles.length > 0 && (
        <>
          <Text style={styles.sectionHeader}>Previously owned</Text>
          {previousVehicles.map((pv) => {
            const cover = mediaUrl(pv.vehicle.cover_image_url);
            const colors = placeholderColors(pv.vehicle.id);
            const period = [
              formatDateShort(pv.period_start),
              formatDateShort(pv.period_end) || "now",
            ].join(" – ");
            return (
              <Pressable
                key={pv.vehicle.id}
                style={[styles.card, !pv.is_public && styles.cardMuted]}
                onPress={pv.is_public ? () => router.push(`/vehicle/${pv.vehicle.id}`) : undefined}
                disabled={!pv.is_public}
              >
                {cover ? (
                  <Image source={{ uri: cover }} style={styles.cover} contentFit="cover" />
                ) : (
                  <View style={[styles.cover, styles.coverPlaceholder, { backgroundColor: colors.bg }]}>
                    <Ionicons name="car-sport" size={40} color={colors.icon} />
                  </View>
                )}
                <View style={styles.cardBody}>
                  <Text style={[styles.title, !pv.is_public && { color: "#94a3b8" }]}>
                    {vehicleTitle(pv.vehicle)}
                  </Text>
                  <Text style={styles.subtitle}>
                    {[pv.vehicle.year, pv.vehicle.make, pv.vehicle.model].filter(Boolean).join(" ")}
                  </Text>
                  <Text style={styles.meta}>{period}{!pv.is_public ? " · now private" : ""}</Text>
                </View>
                {pv.is_public && <Ionicons name="chevron-forward" size={20} color="#94a3b8" />}
              </Pressable>
            );
          })}
        </>
      )}

      {/* Transfer code entry */}
      <View style={styles.transferSection}>
        {showCodeInput ? (
          <View style={styles.codeRow}>
            <TextInput
              style={styles.codeInput}
              value={transferCode}
              onChangeText={setTransferCode}
              placeholder="Transfer code"
              placeholderTextColor="#94a3b8"
              autoCapitalize="characters"
              autoCorrect={false}
              onSubmitEditing={goToTransferCode}
            />
            <Pressable style={styles.codeGoBtn} onPress={goToTransferCode}>
              <Text style={styles.codeGoBtnText}>Go</Text>
            </Pressable>
            <Pressable onPress={() => { setShowCodeInput(false); setTransferCode(""); }} hitSlop={8}>
              <Text style={styles.codeCancelText}>Cancel</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable onPress={() => setShowCodeInput(true)}>
            <Text style={styles.transferCodeLink}>Have a transfer code?</Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  list: { padding: 16, gap: 12, maxWidth: 560, width: "100%", alignSelf: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 8, minHeight: 300 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 16,
    padding: 12,
    backgroundColor: "#fff",
  },
  cover: { width: 84, height: 64, borderRadius: 10, backgroundColor: "#f1f5f9" },
  coverPlaceholder: { alignItems: "center", justifyContent: "center" },
  cardBody: { flex: 1, gap: 2 },
  title: { fontSize: 18, fontWeight: "700", color: "#0b1120" },
  subtitle: { fontSize: 15, color: "#64748b" },
  meta: { fontSize: 14, color: "#94a3b8" },
  emptyTitle: { fontSize: 19, fontWeight: "700", color: "#0b1120" },
  emptyDetail: { fontSize: 16, color: "#64748b", textAlign: "center" },
  retry: { backgroundColor: "#2563eb", borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10, marginTop: 8 },
  retryText: { color: "#fff", fontWeight: "700" },
  addVehicleBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingVertical: 12,
  },
  addVehicleText: { color: "#fff", fontWeight: "700", fontSize: 17 },
  sectionHeader: {
    fontSize: 13,
    fontWeight: "600",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 4,
    marginLeft: 2,
  },
  cardMuted: { opacity: 0.6 },
  transferSection: {
    marginTop: 20,
    alignItems: "center",
  },
  transferCodeLink: { fontSize: 15, color: "#2563eb", fontWeight: "600" },
  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    width: "100%",
  },
  codeInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    color: "#0b1120",
    backgroundColor: "#fff",
    fontFamily: "monospace",
    letterSpacing: 2,
  },
  codeGoBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  codeGoBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  codeCancelText: { color: "#64748b", fontWeight: "600", fontSize: 15 },
});
