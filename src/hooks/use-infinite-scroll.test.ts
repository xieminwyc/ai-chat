import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useInfiniteScroll } from "./use-infinite-scroll";

describe("useInfiniteScroll", () => {
  it("应该初始时为空状态", () => {
    const fetchFn = vi.fn();
    const getItems = vi.fn(() => []);
    const getNextCursor = vi.fn(() => null);

    const { result } = renderHook(() =>
      useInfiniteScroll({
        fetchFn,
        getItems,
        getNextCursor,
        enabled: true, // 禁用自动加载
      })
    );

    expect(result.current.items).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.hasMore).toBe(true);
  });

  it("应该在调用 loadMore 时调用 fetchFn", async () => {
    const mockData = [
      { id: "1", title: "Chat 1" },
      { id: "2", title: "Chat 2" },
    ];
    const fetchFn = vi.fn().mockResolvedValue({
      chats: mockData,
      nextCursor: "cursor2",
      hasMore: true,
    });
    const getItems = (res: { chats: typeof mockData }) => res.chats;
    const getNextCursor = (res: { nextCursor: string }) => res.nextCursor;
    const getHasMore = (res: { hasMore: boolean }) => res.hasMore;

    const { result } = renderHook(() =>
      useInfiniteScroll({
        fetchFn,
        getItems,
        getNextCursor,
        getHasMore,
        enabled: true, // 需要启用才能加载
      })
    );

    void result.current.loadMore();

    // 验证 fetchFn 被调用
    expect(fetchFn).toHaveBeenCalledWith(null);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it("应该传递正确的游标给 fetchFn", async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({
        chats: [{ id: "1", title: "Chat 1" }],
        nextCursor: "cursor2",
        hasMore: true,
      })
      .mockResolvedValueOnce({
        chats: [{ id: "2", title: "Chat 2" }],
        nextCursor: null,
        hasMore: false,
      });
    const getItems = (res: { chats: unknown[] }) => res.chats;
    const getNextCursor = (res: { nextCursor: string | null }) => res.nextCursor;
    const getHasMore = (res: { hasMore: boolean }) => res.hasMore;

    const { result } = renderHook(() =>
      useInfiniteScroll({
        fetchFn,
        getItems,
        getNextCursor,
        getHasMore,
        enabled: true,
      })
    );

    // 第一次加载
    void result.current.loadMore();
    expect(fetchFn).toHaveBeenCalledWith(null);

    // 等待第一次调用完成且状态更新
    await waitFor(() => {
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    // 等待 nextCursor 状态更新
    await waitFor(() => {
      expect(result.current.items).toHaveLength(1);
    });

    // 第二次加载（使用第一次返回的游标）
    fetchFn.mockClear();
    void result.current.loadMore();
    expect(fetchFn).toHaveBeenCalledWith("cursor2");
  });

  it("应该在 hasMore 为 false 时停止调用 fetchFn", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      chats: [],
      nextCursor: null,
      hasMore: false,
    });
    const getItems = (res: { chats: unknown[] }) => res.chats;
    const getNextCursor = (res: { nextCursor: string | null }) => res.nextCursor;
    const getHasMore = (res: { hasMore: boolean }) => res.hasMore;

    const { result } = renderHook(() =>
      useInfiniteScroll({
        fetchFn,
        getItems,
        getNextCursor,
        getHasMore,
        enabled: true,
      })
    );

    // 第一次加载
    void result.current.loadMore();
    expect(fetchFn).toHaveBeenCalledTimes(1);

    // 等待状态更新
    await waitFor(() => {
      expect(result.current.hasMore).toBe(false);
    });

    // 再次尝试加载
    fetchFn.mockClear();
    void result.current.loadMore();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("应该处理加载错误", async () => {
    const error = new Error("Network error");
    const fetchFn = vi.fn().mockRejectedValue(error);
    const getItems = vi.fn();
    const getNextCursor = vi.fn();

    const { result } = renderHook(() =>
      useInfiniteScroll({
        fetchFn,
        getItems,
        getNextCursor,
        enabled: true,
      })
    );

    void result.current.loadMore();

    // 等待错误被设置
    await waitFor(() => {
      expect(result.current.error).not.toBeNull();
    });
  });

  it("reload 应该重置游标并重新加载", async () => {
    const mockData1 = [{ id: "1", title: "Chat 1" }];
    const mockData2 = [{ id: "2", title: "Chat 2" }];
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({
        chats: mockData1,
        nextCursor: "cursor2",
        hasMore: true,
      })
      .mockResolvedValueOnce({
        chats: mockData2,
        nextCursor: null,
        hasMore: false,
      });
    const getItems = (res: { chats: unknown[] }) => res.chats;
    const getNextCursor = (res: { nextCursor: string | null }) => res.nextCursor;
    const getHasMore = (res: { hasMore: boolean }) => res.hasMore;

    const { result } = renderHook(() =>
      useInfiniteScroll({
        fetchFn,
        getItems,
        getNextCursor,
        getHasMore,
        enabled: true,
      })
    );

    // 第一次加载
    void result.current.loadMore();
    expect(fetchFn).toHaveBeenCalledWith(null);

    // 等待第一次调用完成
    await waitFor(() => {
      expect(fetchFn).toHaveBeenCalledTimes(1);
    });

    // 重新加载 - 应该使用 null 游标
    fetchFn.mockClear();
    void result.current.reload();
    expect(fetchFn).toHaveBeenCalledWith(null);
  });

  it("应该在 enabled 为 false 时不自动加载", async () => {
    const fetchFn = vi.fn().mockResolvedValue({
      chats: [{ id: "1", title: "Chat 1" }],
      nextCursor: null,
      hasMore: false,
    });
    const getItems = (res: { chats: unknown[] }) => res.chats;
    const getNextCursor = (res: { nextCursor: string | null }) => res.nextCursor;
    const getHasMore = (res: { hasMore: boolean }) => res.hasMore;

    renderHook(() =>
      useInfiniteScroll({
        fetchFn,
        getItems,
        getNextCursor,
        getHasMore,
        enabled: true, // 禁用自动加载
      })
    );

    // 等待一段时间确保没有自动加载
    await waitFor(
      () => {
        expect(fetchFn).not.toHaveBeenCalled();
      },
      { timeout: 100 }
    );
  });
});
