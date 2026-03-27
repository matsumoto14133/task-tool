"use client";

import { useEffect, useRef } from "react";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback?: (token: string) => void;
          "error-callback"?: () => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

type Props = {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  onError?: () => void;
};

export default function TurnstileWidget({
  onVerify,
  onExpire,
  onError,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onVerifyRef.current = onVerify;
  }, [onVerify]);

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    const sitekey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    if (!sitekey) return;
    if (!containerRef.current) return;

    let mounted = true;

    const renderWidget = () => {
      if (!mounted || !containerRef.current || !window.turnstile) return;
      if (widgetIdRef.current) return;

      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey,
        theme: "auto",
        callback: (token: string) => {
          onVerifyRef.current?.(token);
        },
        "expired-callback": () => {
          onExpireRef.current?.();
        },
        "error-callback": () => {
          onErrorRef.current?.();
        },
      });
    };

    const existingScript = document.querySelector(
      'script[src="https://challenges.cloudflare.com/turnstile/v0/api.js"]'
    ) as HTMLScriptElement | null;

    let handleLoad: (() => void) | null = null;

    if (existingScript) {
      if (window.turnstile) {
        renderWidget();
      } else {
        handleLoad = () => renderWidget();
        existingScript.addEventListener("load", handleLoad, { once: true });
      }
    } else {
      const script = document.createElement("script");
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      script.async = true;
      script.defer = true;
      handleLoad = () => renderWidget();
      script.addEventListener("load", handleLoad, { once: true });
      document.head.appendChild(script);
    }

    return () => {
      mounted = false;
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current);
        widgetIdRef.current = null;
      }
    };
  }, []);

  return <div ref={containerRef} />;
}