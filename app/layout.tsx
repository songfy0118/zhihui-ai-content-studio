import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;
  return {
    title: "知绘工厂｜AI科普漫剧生产台",
    description: "一个人的AI科普漫剧内容生产工作流。",
    openGraph: { title: "知绘工厂", description: "科学很硬，故事要软。", images: [image] },
    twitter: { card: "summary_large_image", title: "知绘工厂", description: "AI科普漫剧生产台", images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
