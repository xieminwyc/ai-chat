"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 无限滚动 Hook
 *
 * @template T 数据项类型
 * @template Response API 响应类型
 */
export interface UseInfiniteScrollOptions<T, Response> {
  /** 加载函数，接收游标并返回数据 */
  fetchFn: (cursor: string | null) => Promise<Response>;
  /** 从响应中提取数据项 */
  getItems: (response: Response) => T[];
  /** 从响应中提取下一页游标 */
  getNextCursor: (response: Response) => string | null;
  /** 从响应中判断是否有更多数据 */
  getHasMore?: (response: Response) => boolean;
  /** 是否启用（默认 true） */
  enabled?: boolean;
  /** 触发加载的距离阈值（px，默认 200） */
  threshold?: number;
  /** 初始数据（用于服务端渲染或初始加载） */
  initialItems?: T[];
  /** 初始游标（如果提供初始数据，应该同时提供下一页游标） */
  initialNextCursor?: string | null;
  /** 初始 hasMore 状态（默认 true） */
  initialHasMore?: boolean;
}

export interface InfiniteScrollResult<T> {
  /** 所有已加载的数据项 */
  items: T[];
  /** 是否正在加载 */
  isLoading: boolean;
  /** 是否有错误 */
  error: Error | null;
  /** 是否有更多数据 */
  hasMore: boolean;
  /** 手动加载更多 */
  loadMore: () => Promise<void>;
  /** 重新加载（重置状态并重新获取） */
  reload: () => Promise<void>;
  /** 清空数据（不重新获取） */
  reset: () => void;
  /** 观察目标元素 ref */
  observerTarget: (node: HTMLElement | null) => void;
}

/**
 * 无限滚动 Hook
 *
 * 使用 Intersection Observer API 在滚动到底部时自动加载更多数据
 *
 * @example
 * ```tsx
 * const { items, loadMore, hasMore, observerTarget } = useInfiniteScroll({
 *   fetchFn: async (cursor) => {
 *     const params = new URLSearchParams();
 *     if (cursor) params.set('cursor', cursor);
 *     const res = await fetch(`/api/chat?${params}`);
 *     return await res.json();
 *   },
 *   getItems: (res) => res.chats,
 *   getNextCursor: (res) => res.nextCursor,
 *   getHasMore: (res) => res.hasMore,
 * });
 *
 * return (
 *   <div>
 *     {items.map(item => <Item key={item.id} data={item} />)}
 *     {hasMore && <div ref={observerTarget}>Loading...</div>}
 *   </div>
 * );
 * ```
 */
export function useInfiniteScroll<T, Response = unknown>({
  fetchFn,
  getItems,
  getNextCursor,
  getHasMore,
  enabled = true,
  threshold = 200,
  initialItems,
  initialNextCursor,
  initialHasMore = true,
}: UseInfiniteScrollOptions<T, Response>): InfiniteScrollResult<T> {
  const [items, setItems] = useState<T[]>(initialItems ?? []);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor ?? null);

  const observerTarget = useRef<HTMLElement | null>(null);
  const isLoadingRef = useRef(false);
  const hasMoreRef = useRef(true);

  // 保持 hasMoreRef 与 hasMore 同步
  useEffect(() => {
    hasMoreRef.current = hasMore;
  }, [hasMore]);

  /** 加载更多数据 */
  const nextCursorRef = useRef<string | null>(null);

  // 保持 nextCursorRef 与 nextCursor 同步
  useEffect(() => {
    nextCursorRef.current = nextCursor;
  }, [nextCursor]);

  /** 加载更多数据 */
  const loadMore = useCallback(async () => {
    // 使用 ref 获取最新的游标值
    const currentCursor = nextCursorRef.current;
    const currentHasMore = hasMoreRef.current;

    if (!enabled || isLoadingRef.current || !currentHasMore) {
      return;
    }

    isLoadingRef.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetchFn(currentCursor);
      const newItems = getItems(response);
      const newCursor = getNextCursor(response);
      const newHasMore = getHasMore ? getHasMore(response) : newCursor !== null;

      // 去重：防止后端返回重复项
      setItems((prev) => {
        const existingIds = new Set(prev.map((item) => (item as { id: string }).id));
        const uniqueNewItems = newItems.filter(
          (item) => !existingIds.has((item as { id: string }).id)
        );
        return [...prev, ...uniqueNewItems];
      });
      setNextCursor(newCursor);
      setHasMore(newHasMore);
      hasMoreRef.current = newHasMore;
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error("Failed to load more");
      setError(errorObj);
    } finally {
      isLoadingRef.current = false;
      setIsLoading(false);
    }
  }, [enabled, fetchFn, getItems, getNextCursor, getHasMore]);

  /** 重新加载（重置状态） */
  const reload = useCallback(async () => {
    // 重置所有状态
    setItems([]);
    setNextCursor(null);
    setHasMore(true);
    hasMoreRef.current = true;
    setError(null);
    isLoadingRef.current = false;

    // 直接执行加载逻辑，不依赖 loadMore 的闭包
    // 注意：reload 是显式调用的，应该始终工作，不受 enabled 影响
    isLoadingRef.current = true;
    setIsLoading(true);

    try {
      const response = await fetchFn(null);
      const newItems = getItems(response);
      const newCursor = getNextCursor(response);
      const newHasMore = getHasMore ? getHasMore(response) : newCursor !== null;

      setItems(newItems);
      setNextCursor(newCursor);
      setHasMore(newHasMore);
      hasMoreRef.current = newHasMore;
    } catch (err) {
      const errorObj = err instanceof Error ? err : new Error("Failed to load more");
      setError(errorObj);
    } finally {
      isLoadingRef.current = false;
      setIsLoading(false);
    }
  }, [fetchFn, getItems, getNextCursor, getHasMore]);

  /** Intersection Observer 回调 */
  useEffect(() => {
    if (!enabled || !observerTarget.current || !hasMoreRef.current || isLoadingRef.current) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadMore();
        }
      },
      { rootMargin: `${threshold}px` }
    );

    const target = observerTarget.current;
    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [enabled, loadMore, threshold]);

  /** 清空数据（不重新获取） */
  const reset = useCallback(() => {
    setItems([]);
    setNextCursor(null);
    setHasMore(true);
    hasMoreRef.current = true;
    setError(null);
    isLoadingRef.current = false;
    setIsLoading(false);
  }, []);

  return {
    items,
    isLoading,
    error,
    hasMore,
    loadMore,
    reload,
    reset,
    observerTarget: (node) => {
      observerTarget.current = node;
    },
  };
}
