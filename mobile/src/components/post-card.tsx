import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";

import { mediaUrl, type Post } from "@/lib/api";

export function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 3600) return `${Math.max(1, Math.floor(seconds / 60))}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2 },
      ]}
    >
      <Text style={[styles.avatarText, { fontSize: size * 0.44 }]}>
        {name.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

export function PostCard({
  post,
  onPress,
  onToggleLike,
}: {
  post: Post;
  onPress?: () => void;
  onToggleLike?: () => void;
}) {
  const image = post.media.find((m) => (m.media_type ?? "image") === "image") ?? post.media[0];
  const imageUri = mediaUrl(image?.thumbnail_url ?? image?.url);
  const vehicle = post.vehicles[0];

  return (
    <Pressable style={styles.card} onPress={onPress} disabled={!onPress}>
      <View style={styles.cardHeader}>
        <Avatar name={post.author.display_name ?? post.author.username} />
        <View style={{ flex: 1 }}>
          <Text style={styles.author}>{post.author.display_name ?? post.author.username}</Text>
          {vehicle && (
            <Text style={styles.vehicle}>
              {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ") ||
                vehicle.nickname}
            </Text>
          )}
        </View>
        <Text style={styles.time}>{timeAgo(post.created_at)}</Text>
      </View>

      {imageUri && (
        <Image source={{ uri: imageUri }} style={styles.photo} contentFit="cover" transition={150} />
      )}

      <View style={styles.actions}>
        <Pressable onPress={onToggleLike} hitSlop={8} disabled={!onToggleLike} style={styles.action}>
          <Ionicons
            name={post.viewer_has_liked ? "heart" : "heart-outline"}
            size={24}
            color={post.viewer_has_liked ? "#dc2626" : "#0b1120"}
          />
          <Text style={styles.actionCount}>{post.like_count}</Text>
        </Pressable>
        <View style={styles.action}>
          <Ionicons name="chatbubble-outline" size={22} color="#0b1120" />
          <Text style={styles.actionCount}>{post.comment_count}</Text>
        </View>
      </View>

      {post.caption ? <Text style={styles.caption}>{post.caption}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e2e8f0" },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingBottom: 10 },
  avatar: { backgroundColor: "#2563eb", alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontWeight: "700" },
  author: { fontWeight: "700", fontSize: 15, color: "#0b1120" },
  vehicle: { fontSize: 12, color: "#64748b" },
  time: { fontSize: 12, color: "#94a3b8" },
  photo: { width: "100%", aspectRatio: 1, backgroundColor: "#f1f5f9" },
  actions: { flexDirection: "row", gap: 18, paddingHorizontal: 16, paddingTop: 10 },
  action: { flexDirection: "row", alignItems: "center", gap: 6 },
  actionCount: { fontSize: 14, color: "#334155", fontWeight: "600" },
  caption: { paddingHorizontal: 16, paddingTop: 8, fontSize: 15, color: "#0b1120" },
});
