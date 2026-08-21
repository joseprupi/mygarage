import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import {
  mediaUrl,
  userApi,
  vehicleApi,
  type Post,
  type Vehicle,
  type VehicleEvent,
  type VehicleMod,
} from "@/lib/api";
import { eventTypeColors, eventTypeLabel, formatDate, formatMoney } from "@/lib/events";
import { PostCard } from "@/components/post-card";

const TABS = ["History", "Build", "Posts"] as const;
type Tab = (typeof TABS)[number];

function EventRow({ event, onPress }: { event: VehicleEvent; onPress?: () => void }) {
  const colors = eventTypeColors(event.event_type);
  const cost = formatMoney(event.cost_cents, event.currency);
  const thumb = mediaUrl(event.media[0]?.thumbnail_url ?? event.media[0]?.url);
  return (
    <Pressable style={styles.eventRow} onPress={onPress} disabled={!onPress}>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.eventTop}>
          <View style={[styles.badge, { backgroundColor: colors.bg }]}>
            <Text style={[styles.badgeText, { color: colors.text }]}>
              {eventTypeLabel(event.event_type)}
            </Text>
          </View>
          <Text style={styles.eventDate}>{formatDate(event.event_date)}</Text>
        </View>
        <Text style={styles.eventTitle}>{event.title}</Text>
        <Text style={styles.eventMeta}>
          {[
            cost,
            event.mileage != null ? `${event.mileage.toLocaleString()} mi` : null,
            event.shop_name,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>
      {thumb && <Image source={{ uri: thumb }} style={styles.eventThumb} contentFit="cover" />}
    </Pressable>
  );
}

export default function VehicleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [meId, setMeId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("History");
  const [events, setEvents] = useState<VehicleEvent[] | null>(null);
  const [mods, setMods] = useState<VehicleMod[] | null>(null);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [v, me, ev, md, ps] = await Promise.all([
        vehicleApi.get(id),
        userApi.me().catch(() => null),
        vehicleApi.events(id),
        vehicleApi.mods(id),
        vehicleApi.posts(id),
      ]);
      setVehicle(v);
      setMeId(me?.id ?? null);
      setEvents(ev);
      setMods(md);
      setPosts(ps);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load the vehicle");
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!vehicle) {
    return (
      <View style={styles.center}>
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator />}
      </View>
    );
  }

  const isOwner = meId !== null && meId === vehicle.owner_user_id;
  const title = vehicle.nickname || [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");
  const cover = mediaUrl(vehicle.cover_image_url);
  const totalSpend = (events ?? []).reduce((sum, e) => sum + (e.cost_cents ?? 0), 0);

  const modsByCategory = new Map<string, VehicleMod[]>();
  for (const mod of mods ?? []) {
    const list = modsByCategory.get(mod.category) ?? [];
    list.push(mod);
    modsByCategory.set(mod.category, list);
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title }} />
      {cover && <Image source={{ uri: cover }} style={styles.cover} contentFit="cover" />}
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>
          {[vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(" ")}
        </Text>
        <Text style={styles.meta}>
          {[
            vehicle.mileage != null ? `${vehicle.mileage.toLocaleString()} mi` : null,
            vehicle.engine,
            vehicle.transmission,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
      </View>

      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
          </Pressable>
        ))}
      </View>

      {tab === "History" && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionInfo}>
              {(events ?? []).length} events
              {totalSpend > 0 ? ` · ${formatMoney(totalSpend)} total` : ""}
            </Text>
            {isOwner && (
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Pressable
                  style={[styles.addBtn, styles.fuelBtn]}
                  onPress={() => router.push(`/vehicle/${vehicle.id}/fuel`)}
                >
                  <Text style={styles.addBtnText}>⛽ Fuel-up</Text>
                </Pressable>
                <Pressable
                  style={styles.addBtn}
                  onPress={() => router.push(`/vehicle/${vehicle.id}/event-form`)}
                >
                  <Ionicons name="add" size={18} color="#fff" />
                  <Text style={styles.addBtnText}>Add event</Text>
                </Pressable>
              </View>
            )}
          </View>
          {(events ?? []).map((event) => (
            <EventRow
              key={event.id}
              event={event}
              onPress={
                isOwner
                  ? () => router.push(`/vehicle/${vehicle.id}/event-form?eventId=${event.id}`)
                  : undefined
              }
            />
          ))}
          {(events ?? []).length === 0 && (
            <Text style={styles.emptyText}>No history events yet.</Text>
          )}
        </View>
      )}

      {tab === "Build" && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionInfo}>{(mods ?? []).length} mods</Text>
            {isOwner && (
              <Pressable
                style={styles.addBtn}
                onPress={() => router.push(`/vehicle/${vehicle.id}/mod-form`)}
              >
                <Ionicons name="add" size={18} color="#fff" />
                <Text style={styles.addBtnText}>Add mod</Text>
              </Pressable>
            )}
          </View>
          {[...modsByCategory.entries()].map(([category, list]) => (
            <View key={category} style={{ gap: 4 }}>
              <Text style={styles.category}>{category}</Text>
              {list.map((mod) => (
                <Pressable
                  key={mod.id}
                  style={styles.modRow}
                  disabled={!isOwner}
                  onPress={() =>
                    router.push(`/vehicle/${vehicle.id}/mod-form?modId=${mod.id}`)
                  }
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.modName}>
                      {mod.name}
                      {mod.brand ? <Text style={styles.modBrand}> — {mod.brand}</Text> : null}
                    </Text>
                    <Text style={styles.eventMeta}>
                      {[
                        formatMoney(mod.cost_cents, mod.currency),
                        formatDate(mod.installed_date),
                        mod.mileage != null ? `${mod.mileage.toLocaleString()} mi` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </View>
          ))}
          {(mods ?? []).length === 0 && <Text style={styles.emptyText}>No mods listed yet.</Text>}
        </View>
      )}

      {tab === "Posts" && (
        <View>
          {(posts ?? []).map((post) => (
            <PostCard key={post.id} post={post} onPress={() => router.push(`/post/${post.id}`)} />
          ))}
          {(posts ?? []).length === 0 && <Text style={styles.emptyText}>No posts yet.</Text>}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  content: { maxWidth: 560, width: "100%", alignSelf: "center", paddingBottom: 32 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  cover: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#f1f5f9" },
  header: { padding: 16, gap: 4 },
  title: { fontSize: 22, fontWeight: "800", color: "#0b1120" },
  subtitle: { fontSize: 14, color: "#64748b" },
  meta: { fontSize: 13, color: "#94a3b8" },
  tabs: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
  },
  tab: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: "#f1f5f9" },
  tabActive: { backgroundColor: "#0b1120" },
  tabText: { fontSize: 14, fontWeight: "600", color: "#475569" },
  tabTextActive: { color: "#fff" },
  section: { padding: 16, gap: 10 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionInfo: { fontSize: 13, color: "#64748b", fontWeight: "600" },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#2563eb",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  fuelBtn: { backgroundColor: "#0b1120" },
  eventRow: {
    flexDirection: "row",
    gap: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    padding: 12,
  },
  eventTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: "700" },
  eventDate: { fontSize: 12, color: "#94a3b8" },
  eventTitle: { fontSize: 15, fontWeight: "700", color: "#0b1120" },
  eventMeta: { fontSize: 13, color: "#64748b" },
  eventThumb: { width: 64, height: 64, borderRadius: 10, backgroundColor: "#f1f5f9" },
  category: { fontSize: 13, fontWeight: "800", color: "#334155", textTransform: "uppercase", marginTop: 8 },
  modRow: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    padding: 12,
  },
  modName: { fontSize: 15, fontWeight: "700", color: "#0b1120" },
  modBrand: { fontWeight: "400", color: "#64748b" },
  emptyText: { padding: 16, fontSize: 14, color: "#94a3b8", textAlign: "center" },
  error: { color: "#dc2626", fontSize: 14 },
});
