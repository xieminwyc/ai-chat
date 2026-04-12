import { describe, it, expect } from "vitest";
import {
  encodeCursor,
  decodeCursor,
  createCursor,
  parseCursor,
} from "./cursor";

describe("cursor 编码/解码", () => {
  describe("encodeCursor", () => {
    it("应该将对象编码为 base64url 格式", () => {
      const input = {
        id: "test-id-123",
        value: "2024-01-01T00:00:00.000Z",
      };
      const encoded = encodeCursor(input);

      // base64url 格式：只包含字母、数字、-、_
      expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
      // 不应该包含 base64 特殊字符 +、/、=
      expect(encoded).not.toContain("+");
      expect(encoded).not.toContain("/");
      expect(encoded).not.toContain("=");
    });

    it("应该生成确定性的编码结果", () => {
      const input = {
        id: "test-id",
        value: "2024-01-01T00:00:00.000Z",
      };
      const encoded1 = encodeCursor(input);
      const encoded2 = encodeCursor(input);

      expect(encoded1).toBe(encoded2);
    });
  });

  describe("decodeCursor", () => {
    it("应该正确解码有效的游标", () => {
      const original = {
        id: "test-id-123",
        value: "2024-01-01T00:00:00.000Z",
      };
      const encoded = encodeCursor(original);
      const decoded = decodeCursor(encoded);

      expect(decoded).toEqual(original);
    });

    it("应该处理包含特殊字符的 id", () => {
      const original = {
        id: "id-with/special+chars",
        value: "2024-01-01T00:00:00.000Z",
      };
      const encoded = encodeCursor(original);
      const decoded = decodeCursor(encoded);

      expect(decoded).toEqual(original);
    });

    it("应该拒绝无效的游标", () => {
      expect(() => decodeCursor("invalid-cursor!")).toThrow();
    });

    it("应该拒绝空字符串", () => {
      expect(() => decodeCursor("")).toThrow();
    });
  });

  describe("createCursor", () => {
    it("应该从 Date 对象创建游标", () => {
      const cursor = createCursor("user-123", new Date("2024-01-01T00:00:00.000Z"));
      const decoded = decodeCursor(cursor);

      expect(decoded.id).toBe("user-123");
      expect(decoded.value).toBe("2024-01-01T00:00:00.000Z");
    });

    it("应该从 ISO 字符串创建游标", () => {
      const cursor = createCursor("user-123", "2024-01-01T00:00:00.000Z");
      const decoded = decodeCursor(cursor);

      expect(decoded.id).toBe("user-123");
      expect(decoded.value).toBe("2024-01-01T00:00:00.000Z");
    });
  });

  describe("parseCursor", () => {
    it("应该是 decodeCursor 的别名", () => {
      const cursor = createCursor("test-id", "2024-01-01T00:00:00.000Z");
      const result1 = decodeCursor(cursor);
      const result2 = parseCursor(cursor);

      expect(result1).toEqual(result2);
    });
  });

  describe("编码/解码 往返测试", () => {
    it("应该正确处理各种时间格式", () => {
      const testCases = [
        "2024-01-01T00:00:00.000Z",
        "2024-12-31T23:59:59.999Z",
        "2020-06-15T12:30:45.123Z",
      ];

      for (const timeValue of testCases) {
        const cursor = createCursor("test-id", timeValue);
        const decoded = parseCursor(cursor);
        expect(decoded.value).toBe(timeValue);
      }
    });

    it("应该正确处理各种 id 格式", () => {
      const testCases = [
        "simple",
        "with-hyphen",
        "with_underscore",
        "with.dot",
        "camelCase",
        "UPPERCASE",
        "123numbers",
        "uuid-like-123e4567-e89b-12d3-a456-426614174000",
      ];

      for (const id of testCases) {
        const cursor = createCursor(id, "2024-01-01T00:00:00.000Z");
        const decoded = parseCursor(cursor);
        expect(decoded.id).toBe(id);
      }
    });
  });
});
