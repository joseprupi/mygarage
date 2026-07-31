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
import { useRouter } from "expo-router";
import Ionicons from "@expo/vector-icons/Ionicons";

import { feedApi, getToken, postApi, type Post } from "@/lib/api";
import { PostCard } from "@/components/post-card";

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

  function toggleLike(post: Post) {
    const liked = post.viewer_has_liked;
    setPosts((prev) =>
      prev.map((p) =>
        p.id === post.id
          ? { ...p, viewer_has_liked: !liked, like_count: p.like_count + (liked ? -1 : 1) }
          : p,
      ),
    );
    void (liked ? postApi.unlike(post.id) : postApi.like(post.id)).catch(() => {
      setPosts((prev) =>
        prev.map((p) =>
          p.id === post.id
            ? { ...p, viewer_has_liked: liked, like_count: p.like_count + (liked ? 1 : -1) }
            : p,
        ),
      );
    });
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
          renderItem={({ item }) => (
            <PostCard
              post={item}
              onPress={() => router.push(`/post/${item.id}`)}
              onToggleLike={() => toggleLike(item)}
            />
          )}
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
      <Pressable style={styles.fab} onPress={() => router.push("/post-new")}>
        <Ionicons name="add" size={28} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 8, minHeight: 300 },
  list: { paddingVertical: 8, maxWidth: 560, width: "100%", alignSelf: "center", paddingBottom: 80 },
  errorTitle: { fontSize: 17, fontWeight: "700", color: "#0b1120" },
  errorDetail: { fontSize: 14, color: "#64748b", textAlign: "center" },
  retry: { backgroundColor: "#2563eb", borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10, marginTop: 8 },
  retryText: { color: "#fff", fontWeight: "700" },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#2563eb",
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
});
