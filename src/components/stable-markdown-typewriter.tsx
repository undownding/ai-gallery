"use client";

import ReactMarkdown from "react-markdown";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MarkdownTypewriterProps } from "react-markdown-typewriter";

type StableMarkdownTypewriterProps = MarkdownTypewriterProps & {
	stableKey?: string | number;
};

function extractText(node: StableMarkdownTypewriterProps["children"]): string {
	if (node === null || node === undefined) return "";
	if (typeof node === "string" || typeof node === "number") return String(node);
	if (Array.isArray(node)) return node.map(extractText).join("");
	if (typeof node === "object" && "props" in node) {
		return extractText((node as { props?: { children?: unknown } }).props?.children);
	}
	return "";
}

function useTypingWindow(text: string, delay: number, sessionKey: string | number) {
	const [visibleLength, setVisibleLength] = useState(0);
	const previousTextRef = useRef<string>(text);
	const previousKeyRef = useRef<string | number>(sessionKey);
	const safeDelay = Number.isFinite(delay) && delay > 0 ? delay : 10;

	useEffect(() => {
		const previousText = previousTextRef.current;
		const keyChanged = previousKeyRef.current !== sessionKey;
		const hasAppend = !keyChanged && previousText.length > 0 && text.startsWith(previousText);
		if (keyChanged || (!hasAppend && text !== previousText)) {
			setVisibleLength(0);
		}
		previousTextRef.current = text;
		previousKeyRef.current = sessionKey;
	}, [text, sessionKey]);

	useEffect(() => {
		setVisibleLength((current) => Math.min(current, text.length));
	}, [text.length]);

	useEffect(() => {
		if (visibleLength >= text.length) return;
		const interval = window.setInterval(() => {
			setVisibleLength((current) => {
				if (current >= text.length) {
					return current;
				}
				const remaining = text.length - current;
				const step = Math.max(1, Math.floor(remaining / 24));
				return Math.min(text.length, current + step);
			});
		}, safeDelay);
		return () => clearInterval(interval);
	}, [safeDelay, text, visibleLength]);

	return text.slice(0, visibleLength);
}

/**
 * Streams markdown characters without resetting previously revealed text when the caller rerenders
 * with the full narration buffer.
 */
export function StableMarkdownTypewriter({
	stableKey = "markdown-typewriter",
	motionProps,
	delay = 10,
	children,
	...markdownProps
}: StableMarkdownTypewriterProps) {
	const targetText = useMemo(() => extractText(children), [children]);
	const renderedText = useTypingWindow(targetText, delay, stableKey);
	const className = motionProps?.className;
	const style = motionProps?.style;

	return (
		<div key={stableKey} className={className} style={style} data-typewriter-key={stableKey}>
			<ReactMarkdown {...markdownProps}>{renderedText}</ReactMarkdown>
		</div>
	);
}
