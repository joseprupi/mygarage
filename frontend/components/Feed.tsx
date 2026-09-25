"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useMemo, useRef } from "react";

import { feedApi } from "@/lib/api/client";
import { PostCard } from "@/components/PostCard";
import { EventFeedCard } from "@/components/EventFeedCard";
import type { FeedItem, Post } from "@/lib/types";

export function Feed() {
  const listRef = useRef<HTMLDivElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const { data, error, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, refetch } = useInfiniteQuery({
    queryKey: ["feed"],
    queryFn: ({ pageParam }) => feedApi.get(pageParam, 20),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined
  });

  const items = useMemo(() => {
    const all = data?.pages.flatMap((page) => page.items) ?? [];
    return Array.from(new Map(all.map((item) => [item.id, item])).values());
  }, [data]);

  // Virtualize against the window so the page has a single scrollbar.
  const rowVirtualizer = useWindowVirtualizer({
    count: items.length,
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

  // A failed load and a genuinely empty feed are different states — say so.
  if (error && items.length === 0) {
    return (
      <div className="surface rounded-3xl p-8 text-center">
        <h2 className="text-xl font-bold">Couldn&apos;t load the feed.</h2>
        <p className="mt-2 text-sm text-slate-500">Something went wrong on our end. Try again in a moment.</p>
        <button type="button" className="btn btn-primary mt-5" onClick={() => void refetch()}>
          Try again
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="surface rounded-3xl p-8 text-center">
        <h2 className="text-xl font-bold">Nothing here yet.</h2>
        <p className="mt-2 text-sm text-slate-500">Posts from the community will show up here.</p>
      </div>
    );
  }

  return (
    <div>
      <div ref={listRef} className="relative" style={{ height: rowVirtualizer.getTotalSize() }}>
        {rowVirtualizer.getVirtualItems().map((virtualItem) => {
          const item: FeedItem = items[virtualItem.index];
          return (
            <div
              className="absolute left-0 top-0 w-full pb-5"
              data-index={virtualItem.index}
              key={item.id}
              ref={rowVirtualizer.measureElement}
              style={{ transform: `translateY(${virtualItem.start - rowVirtualizer.options.scrollMargin}px)` }}
            >
              {item.itemType === "event" ? (
                <EventFeedCard event={item} />
              ) : (
                <PostCard post={item as Post} />
              )}
            </div>
          );
        })}
      </div>
      <div ref={sentinelRef} className="h-16 text-center text-sm text-slate-500">
        {isFetchingNextPage
          ? "Loading more..."
          : error
            ? "Couldn't load more posts."
            : hasNextPage
              ? "Scroll for more"
              : "End of the road"}
      </div>
    </div>
  );
}
