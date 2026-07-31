import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import { mediaUrl, userApi, type Vehicle } from "@/lib/api";

function vehicleTitle(v: Vehicle): string {
  return v.nickname || [v.year, v.make, v.model].filter(Boolean).join(" ");
}

export default function GarageScreen() {
  const router = useRouter();
  const [vehicles, setVehicles] = useState<Vehicle[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const me = await userApi.me();
      setVehicles(await userApi.vehicles(me.id));
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

  return (
    <FlatList
      style={styles.container}
      data={vehicles}
      keyExtractor={(v) => v.id}
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
      renderItem={({ item }) => {
        const cover = mediaUrl(item.cover_image_url);
        return (
          <Pressable style={styles.card} onPress={() => router.push(`/vehicle/${item.id}`)}>
            {cover ? (
              <Image source={{ uri: cover }} style={styles.cover} contentFit="cover" />
            ) : (
              <View style={[styles.cover, styles.coverPlaceholder]}>
                <Ionicons name="car-sport" size={40} color="#94a3b8" />
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
      }}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.emptyTitle}>No vehicles yet.</Text>
          <Text style={styles.emptyDetail}>Add your first car on the web app — mobile add is coming next.</Text>
        </View>
      }
    />
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
  title: { fontSize: 16, fontWeight: "700", color: "#0b1120" },
  subtitle: { fontSize: 13, color: "#64748b" },
  meta: { fontSize: 12, color: "#94a3b8" },
  emptyTitle: { fontSize: 17, fontWeight: "700", color: "#0b1120" },
  emptyDetail: { fontSize: 14, color: "#64748b", textAlign: "center" },
  retry: { backgroundColor: "#2563eb", borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10, marginTop: 8 },
  retryText: { color: "#fff", fontWeight: "700" },
});
