import { createMessage } from "@/server/chat/chat-repository";
import { getDurationMs, logError, logInfo } from "@/server/chat/chat-logger";

type CreateStreamingChatResponseOptions = {
  chatId: string;
  replyStream: AsyncIterable<string>;
  startedAt: number;
};

export function createStreamingChatResponse({
  chatId,
  replyStream,
  startedAt,
}: CreateStreamingChatResponseOptions) {
  const encoder = new TextEncoder();

  return new Response(
    new ReadableStream({
      async start(controller) {
        let assistantReply = "";

        try {
          for await (const delta of replyStream) {
            assistantReply += delta;
            controller.enqueue(encoder.encode(delta));
          }

          if (assistantReply.trim()) {
            await createMessage({
              chatId,
              role: "assistant",
              content: assistantReply,
            });
          }

          logInfo("post.success", {
            chatId,
            replyLength: assistantReply.length,
            durationMs: getDurationMs(startedAt),
          });

          controller.close();
        } catch (error) {
          logError("post.stream_error", error, {
            chatId,
            durationMs: getDurationMs(startedAt),
          });
          controller.error(error);
        }
      },
    }),
    {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Chat-Id": chatId,
      },
    },
  );
}
