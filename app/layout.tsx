import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og-v2.png`;
  return {
    title: "知绘工厂｜AI科技金融热点内容台",
    description: "从可信来源、热点聚类和人工选题，到小红书与抖音图文草稿、审核交接和真实数据学习。",
    openGraph: { title: "知绘工厂", description: "AI、科技与金融热点内容工作流", images: [image] },
    twitter: { card: "summary_large_image", title: "知绘工厂", description: "热点、来源、草稿、审核、增长学习", images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
