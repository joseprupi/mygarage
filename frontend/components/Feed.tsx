"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef } from "react";

import { feedApi } from "@/lib/api/client";
import { PostCard } from "@/components/PostCard";

export function Feed() {
  const listRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ["feed"],
    queryFn: ({ pageParam }) => feedApi.get(pageParam, 20),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined
  });

  const posts = useMemo(() => {
    const items = data?.pages.flatMap((page) => page.items) ?? [];
    return Array.from(new Map(items.map((post) => [post.id, post])).values());
  }, [data]);

  // Virtualize against the window so the page has a single scrollbar.
  const rowVirtualizer = useWindowVirtualizer({
    count: posts.length,
    estimateSize: () => 760,
    overscan: 5,
    scrollMargin: listRef.current?.offsetTop ?? 0
  });

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
        void fetchNextPage();
      }
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  if (isLoading) return <div className="surface rounded-3xl p-8 text-center">Loading the garage...</div>;

  return (
    <div>
      <div ref={listRef} className="relative" style={{ height: rowVirtualizer.getTotalSize() }}>
        {rowVirtualizer.getVirtualItems().map((virtualItem) => {
          const post = posts[virtualItem.index];
          return (
            <div
              className="absolute left-0 top-0 w-full pb-5"
              data-index={virtualItem.index}
              key={post.id}
              ref={rowVirtualizer.measureElement}
              style={{ transform: `translateY(${virtualItem.start - rowVirtualizer.options.scrollMargin}px)` }}
            >
              <PostCard post={post} />
            </div>
          );
        })}
      </div>
      <div ref={sentinelRef} className="h-16 text-center text-sm text-slate-500">
        {isFetchingNextPage ? "Loading more..." : hasNextPage ? "Scroll for more" : "End of the road"}
      </div>
    </div>
  );
}
