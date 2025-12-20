"use client";

import { cloneElement, isValidElement } from "react";
import { MarkdownTypewriter } from "react-markdown-typewriter";
import type { MarkdownTypewriterProps } from "react-markdown-typewriter";

type StableMarkdownTypewriterProps = MarkdownTypewriterProps & {
	stableKey?: string | number;
};

/**
 * Wraps the upstream MarkdownTypewriter to force a consistent React key so existing
 * characters are not remounted (and re-animated) whenever the streaming text updates.
 */
export function StableMarkdownTypewriter({ stableKey = "markdown-typewriter", ...props }: StableMarkdownTypewriterProps) {
	const element = <MarkdownTypewriter {...props} />;
	return isValidElement(element) ? cloneElement(element, { key: stableKey }) : element;
}
