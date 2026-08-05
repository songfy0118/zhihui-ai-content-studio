import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og-v2.png`;
  return {
    title: "知绘工厂｜AI科普漫剧生产台",
    description: "抖音、TikTok与小红书三平台AI内容生产、审核、发布与数据学习工作流。",
    openGraph: { title: "知绘工厂", description: "三平台 AI 内容生产台", images: [image] },
    twitter: { card: "summary_large_image", title: "知绘工厂", description: "选题、生成、审核、发布、学习", images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
