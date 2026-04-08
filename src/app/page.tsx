import { ChatApp } from "@/components/chat-app";
import { getHomePageData } from "@/server/page/home-data";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ chatId?: string }>;
}) {
  const { chatId } = await searchParams;
  // page.tsx 现在是首页真正的服务端入口：
  // 先在服务端读 URL / cookie / session，再把首屏需要的数据交给客户端组件。
  const initialData = await getHomePageData({
    selectedChatId: chatId,
  });

  return <ChatApp initialData={initialData} />;
}
