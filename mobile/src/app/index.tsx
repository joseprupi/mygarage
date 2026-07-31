import { useCallback, useEffect, useState } from "react";
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
import { Stack, useRouter } from "expo-router";

import { authApi, feedApi, getToken, mediaUrl, type Post } from "@/lib/api";

function timeAgo(iso: string): string {
  const seconds = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 3600) return `${Math.max(1, Math.floor(seconds / 60))}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function PostCard({ post }: { post: Post }) {
  const image = post.media.find((m) => (m.media_type ?? "image") === "image") ?? post.media[0];
  const imageUri = mediaUrl(image?.thumbnail_url ?? image?.url);
  const vehicle = post.vehicles[0];

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {(post.author.display_name ?? post.author.username).charAt(0).toUpperCase()}
          </Text>
        </View>
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

      {post.caption ? <Text style={styles.caption}>{post.caption}</Text> : null}
      <Text style={styles.counts}>
        {post.like_count} {post.like_count === 1 ? "like" : "likes"} · {post.comment_count}{" "}
        {post.comment_count === 1 ? "comment" : "comments"}
      </Text>
    </View>
  );
}

export default function FeedScreen() {
  const router = useRouter();
  const [checkedAuth, setCheckedAuth] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPage = useCallback(async (fromCursor: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const page = await feedApi.get(fromCursor);
      setPosts((prev) => (fromCursor ? [...prev, ...page.items] : page.items));
      setCursor(page.nextCursor);
      setHasMore(page.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load the feed");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    (async () => {
      const token = await getToken();
      setCheckedAuth(true);
      if (!token) {
        router.replace("/login");
        return;
      }
      void loadPage(null);
    })();
  }, [loadPage, router]);

  async function logout() {
    await authApi.logout();
    router.replace("/login");
  }

  if (!checkedAuth) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={logout} hitSlop={8}>
              <Text style={styles.logout}>Log out</Text>
            </Pressable>
          ),
        }}
      />
      {error && posts.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Couldn&apos;t load the feed.</Text>
          <Text style={styles.errorDetail}>{error}</Text>
          <Pressable style={styles.retry} onPress={() => loadPage(null)}>
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={posts}
          keyExtractor={(post) => post.id}
          renderItem={({ item }) => <PostCard post={item} />}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void loadPage(null);
              }}
            />
          }
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (hasMore && !loading && cursor) void loadPage(cursor);
          }}
          ListEmptyComponent={
            loading ? (
              <View style={styles.center}>
                <ActivityIndicator />
              </View>
            ) : (
              <View style={styles.center}>
                <Text style={styles.errorTitle}>Nothing here yet.</Text>
                <Text style={styles.errorDetail}>Posts from the community will show up here.</Text>
              </View>
            )
          }
          ListFooterComponent={
            loading && posts.length > 0 ? <ActivityIndicator style={{ margin: 16 }} /> : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 8, minHeight: 300 },
  list: { paddingVertical: 8, maxWidth: 560, width: "100%", alignSelf: "center" },
  card: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "#e2e8f0" },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingBottom: 10 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  author: { fontWeight: "700", fontSize: 15, color: "#0b1120" },
  vehicle: { fontSize: 12, color: "#64748b" },
  time: { fontSize: 12, color: "#94a3b8" },
  photo: { width: "100%", aspectRatio: 1, backgroundColor: "#f1f5f9" },
  caption: { paddingHorizontal: 16, paddingTop: 10, fontSize: 15, color: "#0b1120" },
  counts: { paddingHorizontal: 16, paddingTop: 6, fontSize: 13, color: "#64748b" },
  logout: { color: "#2563eb", fontWeight: "600", fontSize: 15 },
  errorTitle: { fontSize: 17, fontWeight: "700", color: "#0b1120" },
  errorDetail: { fontSize: 14, color: "#64748b", textAlign: "center" },
  retry: { backgroundColor: "#2563eb", borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10, marginTop: 8 },
  retryText: { color: "#fff", fontWeight: "700" },
});
