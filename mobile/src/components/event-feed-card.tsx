import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";

import { mediaUrl, type EventFeedItem } from "@/lib/api";
import { eventTypeColors, eventTypeLabel, formatDate, formatMoney } from "@/lib/events";
import { Avatar } from "@/components/post-card";

export function EventFeedCard({
  item,
  onPress,
}: {
  item: EventFeedItem;
  onPress?: () => void;
}) {
  const imageUri = mediaUrl(item.thumbnailUrl);
  const colors = eventTypeColors(item.eventType);
  const vehicleLabel =
    [item.vehicle.year, item.vehicle.make, item.vehicle.model].filter(Boolean).join(" ") ||
    item.vehicle.nickname ||
    "Vehicle";
  const authorName = item.author.display_name ?? item.author.username;

  const meta: string[] = [];
  const money = formatMoney(item.costCents);
  if (money) meta.push(money);
  if (item.mileage != null) meta.push(`${item.mileage.toLocaleString()} mi`);
  if (item.receiptCount > 0)
    meta.push(`${item.receiptCount} receipt${item.receiptCount > 1 ? "s" : ""}`);

  return (
    <Pressable style={styles.card} onPress={onPress} disabled={!onPress}>
      <View style={styles.cardHeader}>
        <Avatar name={authorName} />
        <View style={styles.headerText}>
          <Text style={styles.author} numberOfLines={1}>
            @{item.author.username} · logged on {vehicleLabel}
          </Text>
          <Text style={styles.date}>{formatDate(item.eventDate ?? item.createdAt)}</Text>
        </View>
        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={styles.thumb}
            contentFit="cover"
            transition={150}
          />
        ) : null}
      </View>

      <View style={styles.body}>
        <View style={[styles.pill, { backgroundColor: colors.bg }]}>
          <Text style={[styles.pillText, { color: colors.text }]}>
            {eventTypeLabel(item.eventType)}
          </Text>
        </View>
        <Text style={styles.title}>{item.title}</Text>
        {meta.length > 0 ? <Text style={styles.meta}>{meta.join(" · ")}</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e2e8f0",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  headerText: { flex: 1, gap: 2 },
  author: { fontSize: 14, color: "#64748b", fontWeight: "500" },
  date: { fontSize: 13, color: "#94a3b8" },
  thumb: { width: 52, height: 52, borderRadius: 8, backgroundColor: "#f1f5f9" },
  body: { paddingHorizontal: 16, gap: 4 },
  pill: {
    alignSelf: "flex-start",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 2,
  },
  pillText: { fontSize: 12, fontWeight: "600" },
  title: { fontSize: 17, fontWeight: "700", color: "#0b1120" },
  meta: { fontSize: 14, color: "#64748b", marginTop: 2 },
});
