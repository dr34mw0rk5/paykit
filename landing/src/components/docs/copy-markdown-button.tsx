"use client";

import { Check, Copy } from "lucide-react";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";

export function CopyMarkdownButton({ markdownUrl }: { markdownUrl: string }) {
  const [copied, setCopied] = useState(false);

  const onClick = useCallback(async () => {
    const res = await fetch(markdownUrl);
    const text = await res.text();
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [markdownUrl]);

  return (
    <Button variant="outline" size="sm" className="gap-1.5" onClick={onClick}>
      {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
      {copied ? "Copied" : "Copy Markdown"}
    </Button>
  );
}
